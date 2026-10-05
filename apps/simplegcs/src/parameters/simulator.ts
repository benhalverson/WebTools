import { MAVParam, MAVParamDefinitions, type ParameterTransfer } from '@webtools/parameters'
import fixture from '../../../../tests/fixtures/params.json'
import type { ParameterSession } from './session.ts'

/** Start an isolated, deterministic packed-file peer; no socket or provider is contacted. */
export function simulatedParameters(): ParameterSession {
    const bytes = Uint8Array.from(fixture.hex.match(/../g)!, byte => parseInt(byte, 16))
    const pending = new Map<ReturnType<typeof setTimeout>, () => void>()
    let disposed = false
    /** Schedule a completion and retain its cancellation callback until it fires. */
    function defer(complete: () => void, cancel: () => void): void {
        if (disposed) { cancel(); return }
        const timer = setTimeout(() => { pending.delete(timer); complete() }, 120)
        pending.set(timer, cancel)
    }
    /** Complete every pending transfer with null, releasing the model operation lock. */
    function cancel(): void {
        const callbacks = [...pending.values()]
        for (const timer of pending.keys()) clearTimeout(timer)
        pending.clear(); callbacks.forEach(callback => callback())
    }
    const ftp: ParameterTransfer = {
        /** Return a complete snapshot including defaults after the simulated transfer delay. */
        getFile(_path, callback) { defer(() => callback(bytes.slice()), () => callback(null)) },
        /** Apply validated packed writes and acknowledge close before the model reads back. */
        putFile(_path, data, callback) {
            defer(() => {
                const download = data.slice()
                const view = new DataView(download.buffer)
                view.setUint16(4, view.getUint16(2, true), true)
                for (const parameter of MAVParam.decode(download).values()) {
                    const offset = fixture.offsets[parameter.name as keyof typeof fixture.offsets]?.offset
                    if (offset === undefined || parameter.name === 'TEST_READONLY') continue
                    const target = new DataView(bytes.buffer)
                    if (parameter.type === 1) target.setInt8(offset, parameter.value)
                    else if (parameter.type === 2) target.setInt16(offset, parameter.value, true)
                    else if (parameter.type === 3) target.setInt32(offset, parameter.value, true)
                    else target.setFloat32(offset, parameter.value, true)
                }
                callback(data.length)
            }, () => callback(null))
        },
    }
    const definitions = new MAVParamDefinitions({ baseUrl: 'https://simplegcs-preview.invalid/Parameters',
        /** Serve local descriptions through the real metadata parser/cache without network access. */
        fetch: async () => new Response(JSON.stringify({ Rover: {
            TEST_I8: { DisplayName: 'Motor speed', Description: 'Adjust the motor test speed', Range: { low: '-128', high: '127' } },
            TEST_I16: { Description: 'Mode selection', Values: { '-1234': 'Factory', '2': 'Alternate' } },
            TEST_FLOAT: { Description: 'Floating point setting', Units: 'm', Increment: '0.1', RebootRequired: 'True' },
            TEST_OPTIONS: { Description: 'Option flags', Bitmask: { 0: 'First option', 2: 'Third option', 31: 'High bit' } },
            TEST_READONLY: { Description: 'A read-only parameter', ReadOnly: 'True' },
        } })),
    })
    const model = new MAVParam({ ftp })
    return { model, definitions, vehicle: 'Rover', cancel,
        /** Invalidate first so delayed results cannot commit after this lifetime ends. */
        dispose() { if (disposed) return; disposed = true; model.disconnect(); cancel() },
    }
}
