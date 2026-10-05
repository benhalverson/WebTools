import type { DfuDevice, DfuVendor, DfuseVendor, Log, Snapshot, Usb, UsbDevice, Settings } from './models.ts'
import { formatDFUSummary, hexAddr8, landingSerial, niceSize, parseIntelHex } from './format.ts'
import { descriptorProperties, fixInterfaceNames } from './protocol.ts'

// A page restored from BFCache creates a new controller, but must await the old
// controller's hardware teardown before reopening any handle on the same bus.
const busCleanup = new WeakMap<Usb, Promise<void>>()

/** Own one mounted uploader's USB session, file reader, and post-transfer timer.
 * Vendor transfers remain byte-for-byte unchanged; generations suppress stale UI
 * updates and close devices acquired after cancellation or unmount.
 */
export class DfuController {
    private snapshot: Snapshot = { status: '', usbInfo: '', dfuInfo: '', connected: false, busy: false,
        writable: false, address: '', uploadSize: null, maxRead: null, memory: false, logs: [] }
    private listeners = new Set<() => void>()
    private device: DfuDevice | null = null
    private firmware: ArrayBuffer | Uint8Array | null = null
    private reader: FileReader | null = null
    private generation = 0
    private active = false
    private transferSize = 1024
    private tolerant = true
    private timer: ReturnType<typeof setTimeout> | undefined
    private logging = false
    private transferring: Promise<void> = Promise.resolve()
    private connecting: Promise<void> = Promise.resolve()
    private closing: Promise<void> = Promise.resolve()
    private readonly serial: string | null
    private usb: Usb | undefined
    private vendor: DfuVendor
    private dfuse: DfuseVendor
    /** Inject vendor globals and USB so tests cannot accidentally select hardware. */
    constructor(usb: Usb | undefined, vendor: DfuVendor, dfuse: DfuseVendor, search: string) {
        this.usb = usb; this.vendor = vendor; this.dfuse = dfuse; this.serial = landingSerial(search)
    }
    /** Expose a stable immutable snapshot for React's external-store contract. */
    getSnapshot = (): Snapshot => this.snapshot
    /** Subscribe to state changes; React owns the returned removal callback. */
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }
    /** Publish only while mounted, preventing late async results from reviving UI. */
    private update(patch: Partial<Snapshot>): void {
        if (!this.active) return
        this.snapshot = { ...this.snapshot, ...patch }
        for (const listener of this.listeners) listener()
    }
    /** Attach one disconnect listener and optionally resolve a serial landing URL. */
    start(): void {
        this.active = true
        if (!this.usb) { this.update({ status: 'WebUSB not available.' }); return }
        this.usb.addEventListener('disconnect', this.onDisconnect)
        if (this.serial !== null) void this.autoConnect()
    }
    /** Release every owned resource; pending selection is closed when it settles. */
    dispose(): void {
        this.active = false
        this.usb?.removeEventListener('disconnect', this.onDisconnect)
        this.reset()
    }
    /** Invalidate pending work before closing its USB handle. */
    private reset(): void {
        this.generation++
        this.logging = false
        if (this.timer !== undefined) clearTimeout(this.timer)
        this.timer = undefined
        this.reader?.abort(); this.reader = null
        const device = this.device
        this.device = null
        // Wait for any in-flight open/descriptor read before closing its handle.
        // Subsequent selection awaits this barrier before opening the same USB device.
        const transferring = this.transferring
        this.closing = Promise.allSettled([this.closing, this.connecting, this.usb ? busCleanup.get(this.usb) : undefined]).then(async () => {
            if (device) await device.close()
            await transferring
        }).catch(error => { console.error(error) })
        if (this.usb) busCleanup.set(this.usb, this.closing)
    }
    /** Restore disconnected controls, retaining the legacy selected firmware. */
    disconnect(status = ''): void {
        this.reset()
        this.update({ status, connected: false, busy: false, writable: false, usbInfo: '', dfuInfo: '' })
    }
    /** Match only the owned USB device; unrelated disconnects cannot reset the UI. */
    private onDisconnect = (event: Event): void => {
        if (this.device && this.device.device_ === (event as Event & { device: unknown }).device) {
            this.device.disconnected = true
            this.disconnect('Device disconnected')
        }
    }
    /** Check whether an asynchronous operation still belongs to this mount/session. */
    private current(token: number): boolean { return this.active && token === this.generation }
    /** Append vendor messages and coalesce consecutive progress events as before. */
    private log(entry: Log): void {
        if (!this.logging) return
        const logs = [...this.snapshot.logs]
        if (entry.kind === 'progress' && logs.at(-1)?.kind === 'progress') logs[logs.length - 1] = entry
        else logs.push(entry)
        this.update({ logs })
    }
    /** Open the original first interface, read capabilities, then bind vendor logs. */
    private async connect(candidate: DfuDevice, token: number): Promise<void> {
        this.device = candidate
        try {
            await candidate.open()
            if (!this.current(token)) return
            const desc = await descriptorProperties(this.vendor, candidate)
            if (!this.current(token)) return
            if (desc) {
                candidate.properties = desc
                this.transferSize = desc.TransferSize
                if (desc.CanDnload) this.tolerant = desc.ManifestationTolerant
                // Preserve the separately tracked legacy undefined-control failure.
                if (candidate.settings.alternate.interfaceProtocol === 2 && !desc.CanDnload) throw new ReferenceError('dnloadButton is not defined')
                if (desc.DFUVersion === 0x011a && candidate.settings.alternate.interfaceProtocol === 2) {
                    candidate = new this.dfuse.Device(candidate.device_, candidate.settings)
                    this.device = candidate
                }
            }
            let memorySummary = ''
            if (candidate.memoryInfo) {
                const { name, segments } = candidate.memoryInfo
                memorySummary = `Selected memory region: ${name} (${niceSize(segments.reduce((total, item) => total + item.end - item.start, 0))})`
                for (const segment of segments) {
                    const properties = (['readable', 'erasable', 'writable'] as const).filter(key => segment[key])
                    memorySummary += `\n${hexAddr8(segment.start)}-${hexAddr8(segment.end - 1)} (${properties.join(', ') || 'inaccessible'})`
                }
            }
            candidate.logDebug = console.log
            candidate.logInfo = message => { if (this.current(token)) this.log({ kind: 'info', message: String(message) }) }
            candidate.logWarning = message => { if (this.current(token)) this.log({ kind: 'warning', message: String(message) }) }
            candidate.logError = message => { if (this.current(token)) this.log({ kind: 'error', message: String(message) }) }
            candidate.logProgress = (done, total) => { if (this.current(token)) this.log({ kind: 'progress', done, total }) }
            let address = this.snapshot.address
            let maxRead = this.snapshot.maxRead
            let uploadSize = this.snapshot.uploadSize
            if (candidate.memoryInfo) {
                const segment = candidate.getFirstWritableSegment()
                if (segment) {
                    candidate.startAddress = segment.start
                    address = '0x' + segment.start.toString(16)
                    maxRead = candidate.getMaxReadSize(segment.start)
                    uploadSize = maxRead
                }
            }
            const usb = candidate.device_
            this.update({ status: '', connected: true, busy: false, writable: candidate.settings.alternate.interfaceProtocol !== 1,
                usbInfo: `Name: ${usb.productName}\nMFG: ${usb.manufacturerName}\nSerial: ${usb.serialNumber}\n`,
                dfuInfo: formatDFUSummary(candidate) + '\n' + memorySummary, logs: [], memory: !!candidate.memoryInfo,
                address, maxRead, uploadSize })
        } catch (error) {
            if (this.current(token)) this.disconnect(String(error))

        }
    }
    /** Request the legacy serial/vendor filter; chooser rejection is a retryable status. */
    async chooseDevice(): Promise<void> {
        if (!this.usb || this.snapshot.busy) return
        if (this.device) { this.disconnect(); return }
        const token = ++this.generation
        this.update({ busy: true })
        try {
            await Promise.all([this.closing, this.usb ? busCleanup.get(this.usb) : undefined])
            if (!this.current(token)) return
            const selected = await this.usb.requestDevice({ filters: this.serial ? [{ serialNumber: this.serial }] : [{ vendorId: 0x0483 }] })
            if (!this.current(token)) return
            const interfaces = this.vendor.findDeviceDfuInterfaces(selected)
            if (!interfaces.length) { this.update({ status: 'The selected device does not have any USB DFU interfaces.' }); return }
            this.connecting = this.prepareDevice(selected, interfaces, token)
            await this.connecting
        } catch (error) { if (this.current(token)) this.update({ status: String(error) }) }
        finally { if (this.current(token)) this.update({ busy: false }) }
    }
    /** Track temporary name-recovery handles in the same teardown barrier as open. */
    private async prepareDevice(selected: UsbDevice, interfaces: Settings[], token: number): Promise<void> {
        await fixInterfaceNames(this.vendor, selected, interfaces)
        if (!this.current(token)) return
        await this.connect(new this.vendor.Device(selected, interfaces[0]!), token)
    }
    /** Keep serial matching, empty-serial vendor matching, and multi-interface status. */
    private async autoConnect(): Promise<void> {
        const token = ++this.generation
        this.update({ busy: true })
        try {
            await Promise.all([this.closing, this.usb ? busCleanup.get(this.usb) : undefined])
            if (!this.current(token)) return
            const devices = await this.vendor.findAllDfuInterfaces()
            if (!this.current(token)) return
            const matches = devices.filter(item => this.serial ? item.device_.serialNumber === this.serial : item.device_.vendorId === 0x0483)
            if (!matches.length) this.update({ status: 'No device found.' })
            else {
                if (matches.length === 1) {
                    this.update({ status: 'Connecting...' })
                    this.connecting = this.connect(matches[0]!, token)
                    await this.connecting
                }
                else this.update({ status: 'Multiple DFU interfaces found.' })
                // Original landing flow raises this after updating the visible UI.
                console.error(new ReferenceError('vidField is not defined'))
            }
        } catch (error) { if (this.current(token)) this.update({ status: String(error) }) }
        finally { if (this.current(token)) this.update({ busy: false }) }
    }
    /** Read local bytes only; replacing a file aborts its earlier FileReader. */
    selectFile(file: File | null): void {
        this.reader?.abort(); this.reader = null; this.firmware = null
        if (!file) return
        const reader = new FileReader()
        this.reader = reader
        const token = this.generation
        reader.onload = () => {
            if (!this.current(token) || this.reader !== reader || !(reader.result instanceof ArrayBuffer)) return
            this.firmware = file.name.endsWith('.hex') ? parseIntelHex(reader.result) : reader.result
            if (file.name.endsWith('.hex')) this.log({ kind: 'info', message: 'Converted Hex to bin' })
            this.reader = null
        }
        reader.onerror = () => {
            if (this.current(token) && this.reader === reader) { this.update({ status: String(reader.error) }); this.reader = null }
        }
        reader.readAsArrayBuffer(file)
    }
    /** Preserve parseInt/range validation and update the vendor's start address. */
    setAddress(value: string): string {
        this.update({ address: value })
        const address = parseInt(value, 16)
        if (Number.isNaN(address)) return 'Invalid hexadecimal start address'
        if (this.device?.memoryInfo) {
            if (this.device.getSegment(address) === null) return 'Address outside of memory map'
            this.device.startAddress = address
            this.update({ maxRead: this.device.getMaxReadSize(address) })
        }
        return ''
    }
    /** Track the legacy upload-size control without introducing an upload operation. */
    setUploadSize(value: number): void { this.update({ uploadSize: value }) }
    /** Clear error state, transfer unchanged bytes, and own the disconnect timeout. */
    async flash(): Promise<void> {
        if (this.snapshot.busy) return
        this.transferring = this.transfer()
        await this.transferring
    }
    /** Retain the in-flight vendor promise so teardown cannot reopen during old writes. */
    private async transfer(): Promise<void> {
        const device = this.device
        const data = this.firmware
        if (!device || data === null || this.snapshot.busy) return
        const token = this.generation
        this.logging = true
        this.update({ busy: true, logs: [] })
        try {
            try {
                const status = await device.getStatus()
                if (!this.current(token)) return
                if (status.state === this.vendor.dfuERROR) await device.clearStatus()
            } catch { if (this.current(token)) device.logWarning('Failed to clear status') }
            if (!this.current(token)) return
            await device.do_download(this.transferSize, data, this.tolerant)
            if (!this.current(token)) return
            this.log({ kind: 'info', message: 'Done!' })
            if (!this.tolerant) {
                // The mounted disconnect listener already owns the matching event.
                if (this.timer !== undefined) clearTimeout(this.timer)
                this.timer = setTimeout(() => {
                    this.timer = undefined
                    if (this.current(token)) console.log('Device unexpectedly tolerated manifestation.')
                }, 5000)
            }
        } catch (error) { if (this.current(token)) this.log({ kind: 'error', message: String(error) }) }
        finally {
            if (this.current(token)) { this.logging = false; this.update({ busy: false }) }
        }
    }
}
