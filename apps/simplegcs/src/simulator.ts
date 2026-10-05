import { MAVLink20Processor, mavlink20, type MessageBase } from '@webtools/mavlink'
import type { ConnectionSettings } from './settings.ts'
import { SimulatedParameters } from './simulated-parameters.ts'
import { simulatedFile } from './simulated-files.ts'
import type { Socket } from './connection.ts'
/** Deterministic, in-memory transport; URLs are labels and no network API is used. */
export class SimulatedSocket implements Socket {
    readyState = 0
    binaryType = 'arraybuffer'
    onopen: Socket['onopen'] = null
    onclose: Socket['onclose'] = null
    onerror: Socket['onerror'] = null
    onmessage: Socket['onmessage'] = null
    private readonly processor = new MAVLink20Processor(null, 1, 1)
    private timer: ReturnType<typeof setInterval> | undefined
    private openTimer: ReturnType<typeof setTimeout>
    private tick = 0
    private armed = true
    private mode = 10
    private fenceEnabled = true
    private readonly replies = new Set<ReturnType<typeof setTimeout>>()
    private readonly parameters = new SimulatedParameters()
    private readonly uploads = new Map<number, Uint8Array>()
    private readonly files = new Map<number, Uint8Array>()
    /** Open asynchronously so the controller can install handlers before the first frame. */
    constructor(passphrase = '') {
        this.processor.signing.secret_key = passphrase ? mavlink20.sha256(new TextEncoder().encode(passphrase)) : new Uint8Array()
        this.processor.signing.sign_outgoing = passphrase.length > 0
        this.openTimer = setTimeout(() => { this.readyState = 1; this.onopen?.(); this.emit(); this.timer = setInterval(() => this.emit(), 1000) }, 0)
    }
    /** Emit the same boat track and battery values on every new simulated connection. */
    private emit(): void {
        if (this.readyState !== 1) return
        const m = mavlink20.messages
        const messages: MessageBase[] = [new m.heartbeat(11, 3, this.armed ? 128 : 0, this.mode, 4), new m.global_position_int(this.tick * 1000, -350000000 + this.tick * 100, 1490000000 + this.tick * 100, 0, 0, 300, 400, 0, 0), new m.attitude(this.tick * 1000, 0, 0, 0.5, 0, 0, 0), new m.battery_status(0, 0, 0, 0, Array(10).fill(12000), 123, 0, 0, 72), new m.gps_raw_int([0, 0], 3, -350000000, 1490000000, 0, 0, 0, 0, 0, 21)]
        for (const message of messages) { const bytes = Uint8Array.from(message.pack(this.processor)); this.processor.seq = (this.processor.seq + 1) % 256; this.onmessage?.({ data: bytes.buffer }) }
        this.tick++
    }
    /** Schedule a real encoded reply after the caller has registered its pending request. */
    private reply(message: MessageBase): void {
        const timer = setTimeout(() => {
            this.replies.delete(timer)
            if (this.readyState !== 1) return
            const bytes = Uint8Array.from(message.pack(this.processor)); this.processor.seq = (this.processor.seq + 1) % 256
            this.onmessage?.({ data: bytes.buffer })
        }, 10)
        this.replies.add(timer)
    }
    /** Decode local command/FTP frames and reply entirely in memory; never contact a vehicle. */
    send(bytes: Uint8Array): void {
        if (this.readyState !== 1) throw new Error('Disconnected')
        const request = this.processor.decode(Array.from(bytes)), m = mavlink20.messages
        if (request._name === 'COMMAND_INT') {
            if (request.command === 400) this.armed = !!request.param1
            if (request.command === 176) this.mode = request.param2
            if (request.command === 207) this.fenceEnabled = !!request.param1
            this.reply(new m.command_ack(request.command, 0, 0, 0, request._header.srcSystem, request._header.srcComponent))
            if (request.command === 192) this.reply(new m.position_target_global_int(0, 6, 0, request.x, request.y, request.z, 0, 0, 0, 0, 0, 0, 0, 0))
            this.reply(new m.sys_status(0, this.fenceEnabled ? mavlink20.MAV_SYS_STATUS_GEOFENCE : 0, 0, 0, 12000, 123, 72, 0, 0, 0, 0, 0, 0))
        } else if (request._name === 'FILE_TRANSFER_PROTOCOL') {
            const payload = Uint8Array.from(request.payload, character => character.charCodeAt(0)), input = new DataView(payload.buffer), opcode = input.getUint8(3), session = input.getUint8(2), offset = input.getUint32(8, true)
            let body = new Uint8Array(), ok = true, error = 1
            if (opcode === 4) {
                const path = new TextDecoder().decode(payload.subarray(12, 12 + input.getUint8(4))), file = path === '@PARAM/param.pck?withdefaults=1' ? this.parameters.bytes.slice() : simulatedFile(path)
                if (file) { this.files.set(session, file); body = new Uint8Array(4); new DataView(body.buffer).setUint32(0, file.length, true) } else ok = false
            } else if (opcode === 15 || opcode === 5) { const file = this.files.get(session); if (file && offset < file.length) body = file.slice(offset, offset + 239); else { ok = false; if (file) error = 6 } }
            else if (opcode === 6) this.uploads.set(session, new Uint8Array())
            else if (opcode === 7) {
                const previous = this.uploads.get(session)
                if (!previous) ok = false
                else { const next = new Uint8Array(Math.max(previous.length, offset + input.getUint8(4))); next.set(previous); next.set(payload.subarray(12, 12 + input.getUint8(4)), offset); this.uploads.set(session, next) }
            }
            else if (opcode === 1) { const upload = this.uploads.get(session); if (upload?.length) this.parameters.apply(upload); this.uploads.delete(session); this.files.delete(session) }
            else ok = false
            if (!ok) body = new Uint8Array([error])
            const output = new Uint8Array(251), view = new DataView(output.buffer)
            view.setUint16(0, (input.getUint16(0, true) + 1) & 65535, true); output[2] = session; output[3] = ok ? 128 : 129; output[4] = body.length; output[5] = opcode; output[6] = 1; view.setUint32(8, offset, true); output.set(body, 12)
            this.reply(new m.file_transfer_protocol(0, request._header.srcSystem, request._header.srcComponent, Array.from(output)))
        }
    }
    /** Clear both pending open and stream timers before releasing callbacks. */
    close(): void { clearTimeout(this.openTimer); clearInterval(this.timer); for (const timer of this.replies) clearTimeout(timer); this.replies.clear(); this.files.clear(); this.uploads.clear(); this.readyState = 3 }
}
/** Create a fresh deterministic socket for each submitted or retried connection. */
export function simulatedSocket(_url: string, settings: Readonly<ConnectionSettings>): Socket { return new SimulatedSocket(settings.passphrase) }
