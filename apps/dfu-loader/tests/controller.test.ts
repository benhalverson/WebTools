import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { DfuController } from '../src/controller.ts'
import type { DfuVendor, DfuseVendor, Usb, UsbDevice } from '../src/models.ts'
const require = createRequire(import.meta.url)
const { installDfuMock } = require('./mock-usb.cjs') as { installDfuMock: (options?: Record<string, boolean>) => void }

/** Build the real vendor adapters around an isolated, explicit fake USB bus. */
function fixture(options: Record<string, boolean> = {}, search = '') {
    const scope = vm.createContext({ navigator: {}, console, Uint8Array, ArrayBuffer, DataView, setTimeout, clearTimeout })
    vm.runInContext(`(${installDfuMock.toString()})(${JSON.stringify(options)})`, scope)
    for (const file of ['dfu.js', 'dfuse.js']) vm.runInContext(readFileSync(new URL('../../../DFULoader/' + file, import.meta.url), 'utf8'), scope)
    const usb = (scope.navigator as { usb: Usb }).usb
    const vendor = scope.dfu as DfuVendor
    const mock = scope.mockDfu as { usbDevice: UsbDevice; trace: unknown[][]; listenerCount(): number; release(): void }
    const controller = new DfuController(usb, vendor, scope.dfuse as DfuseVendor, search)
    controller.start()
    return { controller, mock, vendor, usb, dfuse: scope.dfuse as DfuseVendor }
}
/** Yield promise jobs until a deterministic mocked operation has settled. */
async function settle(): Promise<void> { await new Promise<void>(resolve => setImmediate(resolve)) }

test('close barrier serializes reconnect and late open after dispose', async () => {
    const { controller, mock } = fixture()
    await controller.chooseDevice()
    let release!: () => void
    const original = mock.usbDevice.close.bind(mock.usbDevice)
    mock.usbDevice.close = async () => { await new Promise<void>(resolve => { release = resolve }); await original() }
    controller.disconnect()
    await settle()
    const reconnect = controller.chooseDevice()
    await settle()
    assert.equal(mock.trace.filter(item => item[0] === 'open').length, 1)
    release(); await reconnect
    assert.equal(mock.trace.filter(item => item[0] === 'open').length, 2)
    assert.equal(controller.getSnapshot().connected, true)
    mock.usbDevice.close = original
    controller.dispose(); await settle()
    assert.equal(mock.listenerCount(), 0)

    const next = fixture()
    let finish!: () => void
    const open = next.mock.usbDevice.open.bind(next.mock.usbDevice)
    next.mock.usbDevice.open = async () => { await new Promise<void>(resolve => { finish = resolve }); await open() }
    const pending = next.controller.chooseDevice(); await settle()
    next.controller.dispose(); finish(); await pending; await settle()
    assert.equal(JSON.stringify(next.mock.trace.filter(item => ['open', 'close'].includes(String(item[0])))), JSON.stringify([['open'], ['close']]))
    assert.equal(next.mock.listenerCount(), 0)
})
test('chooser cancellation, no devices, runtime and legacy capability failure remain retryable', async () => {
    const cancelled = fixture({ cancel: true })
    await cancelled.controller.chooseDevice()
    assert.match(cancelled.controller.getSnapshot().status, /No device selected/)
    await cancelled.controller.chooseDevice()
    assert.equal(cancelled.controller.getSnapshot().connected, true)
    cancelled.controller.dispose()
    const empty = fixture({ noDevices: true }, '?serial=')
    await settle(); assert.equal(empty.controller.getSnapshot().status, 'No device found.'); empty.controller.dispose()
    const runtime = fixture({ runtime: true })
    await runtime.controller.chooseDevice(); assert.equal(runtime.controller.getSnapshot().writable, false); runtime.controller.dispose()
    const unsupported = fixture({ noDownload: true })
    await unsupported.controller.chooseDevice(); assert.equal(unsupported.controller.getSnapshot().status, 'ReferenceError: dnloadButton is not defined'); unsupported.controller.dispose()
})
test('unreadable writable memory preserves zero upload size and maximum', async () => {
    const { controller } = fixture({ dfuse: true, unreadable: true })
    await controller.chooseDevice()
    assert.equal(controller.getSnapshot().uploadSize, 0)
    assert.equal(controller.getSnapshot().maxRead, 0)
    assert.equal(controller.setAddress('0x1'), 'Address outside of memory map')
    assert.equal(controller.setAddress('garbage'), 'Invalid hexadecimal start address')
    assert.equal(controller.setAddress('0x08000000'), '')
    controller.dispose()
})
test('repeated intolerant transfers retain exactly one owned timer and dispose clears it', async context => {
    context.mock.timers.enable({ apis: ['setTimeout'] })
    let timers = 0
    const realSet = globalThis.setTimeout
    const realClear = globalThis.clearTimeout
    context.mock.method(globalThis, 'setTimeout', (...args: Parameters<typeof setTimeout>) => { timers++; return realSet(...args) })
    context.mock.method(globalThis, 'clearTimeout', (timer: ReturnType<typeof setTimeout>) => { timers--; realClear(timer) })
    // The fake FileReader delivers exact local bytes through the production control API.
    class Reader {
        result = new Uint8Array([1, 2]).buffer
        onload: (() => void) | null = null
        /** Complete the explicit test file synchronously. */
        readAsArrayBuffer(): void { this.onload?.() }
        /** No pending work remains in this deterministic reader. */
        abort(): void {}
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: Reader })
    const { controller } = fixture({ intolerant: true })
    try {
        await controller.chooseDevice()
        controller.selectFile({ name: 'test.bin' } as File)
        await controller.flash(); await controller.flash()
        assert.equal(timers, 1)
        controller.dispose()
        assert.equal(timers, 0)
    } finally { controller.dispose(); Reflect.deleteProperty(globalThis, 'FileReader') }
})

test('disconnect closes before settling the old transfer and reconnect cannot revive old writes', async () => {
    class Reader {
        result = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer
        onload: (() => void) | null = null
        /** Supply synthetic bytes only. */
        readAsArrayBuffer(): void { this.onload?.() }
        /** The test reader finishes synchronously. */
        abort(): void {}
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: Reader })
    const { controller, mock } = fixture({ hold: true })
    try {
        await controller.chooseDevice(); controller.selectFile({ name: 'test.bin' } as File)
        const transfer = controller.flash(); await settle()
        controller.disconnect(); await settle()
        const retry = controller.chooseDevice(); await settle()
        assert.equal(mock.trace.filter(item => item[0] === 'open').length, 1)
        mock.release(); await transfer; await retry
        assert.equal(mock.trace.filter(item => item[0] === 'out').length, 1)
        assert.equal(mock.trace.filter(item => item[0] === 'open').length, 2)
    } finally { controller.dispose(); Reflect.deleteProperty(globalThis, 'FileReader') }
})
test('read-only memory keeps never-initialized upload controls unset', async () => {
    const { controller } = fixture({ dfuse: true, readonly: true })
    await controller.chooseDevice()
    assert.equal(controller.getSnapshot().uploadSize, null)
    assert.equal(controller.getSnapshot().maxRead, null)
    controller.dispose()
})

test('a remounted controller waits for the disposed mount to finish closing the same bus', async () => {
    const { controller, mock, usb, vendor, dfuse } = fixture()
    await controller.chooseDevice()
    let release!: () => void
    const original = mock.usbDevice.close.bind(mock.usbDevice)
    mock.usbDevice.close = async () => { await new Promise<void>(resolve => { release = resolve }); await original() }
    controller.dispose(); await settle()
    const remounted = new DfuController(usb, vendor, dfuse, '')
    remounted.start()
    const pending = remounted.chooseDevice(); await settle()
    assert.equal(mock.trace.filter(item => item[0] === 'open').length, 1)
    release(); await pending
    assert.equal(mock.trace.filter(item => item[0] === 'open').length, 2)
    mock.usbDevice.close = original
    remounted.dispose(); await settle()
    assert.equal(mock.listenerCount(), 0)
})

test('temporary interface recovery finishes before a new mount can reopen USB', async () => {
    const { controller, mock, usb, vendor, dfuse } = fixture()
    const find = vendor.findDeviceDfuInterfaces
    vendor.findDeviceDfuInterfaces = device => find(device).map(item => ({ ...item, name: null }))
    let release!: () => void
    // Only descriptor recovery is held; actual vendor open/close ordering remains real.
    vendor.Device.prototype.readInterfaceNames = async () => {
        await new Promise<void>(resolve => { release = resolve })
        return { 1: { 0: { 0: 'Recovered interface' } } }
    }
    const pending = controller.chooseDevice(); await settle()
    controller.dispose()
    const remounted = new DfuController(usb, vendor, dfuse, '')
    remounted.start()
    vendor.findDeviceDfuInterfaces = find
    const retry = remounted.chooseDevice(); await settle()
    assert.equal(mock.trace.filter(item => item[0] === 'open').length, 1)
    release(); await pending; await retry
    assert.equal(mock.trace.filter(item => item[0] === 'open').length, 2)
    assert.equal(mock.trace.filter(item => item[0] === 'close').length, 1)
    remounted.dispose(); await settle()
    assert.equal(mock.listenerCount(), 0)
})
