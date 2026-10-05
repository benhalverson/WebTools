import { MAVLink20Processor, mavlink20, type MessageBase } from '@webtools/mavlink'
import type { ConnectionSettings } from './settings.ts'
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
        const messages: MessageBase[] = [new m.heartbeat(11, 3, 128, 10, 4), new m.global_position_int(this.tick * 1000, -350000000 + this.tick * 100, 1490000000 + this.tick * 100, 0, 0, 300, 400, 0, 0), new m.attitude(this.tick * 1000, 0, 0, 0.5, 0, 0, 0), new m.battery_status(0, 0, 0, 0, Array(10).fill(12000), 123, 0, 0, 72), new m.gps_raw_int([0, 0], 3, -350000000, 1490000000, 0, 0, 0, 0, 0, 21)]
        for (const message of messages) { const bytes = Uint8Array.from(message.pack(this.processor)); this.processor.seq = (this.processor.seq + 1) % 256; this.onmessage?.({ data: bytes.buffer }) }
        this.tick++
    }
    /** Accept heartbeats without forwarding them to any external peer. */
    send(_bytes: Uint8Array): void { if (this.readyState !== 1) throw new Error('Disconnected') }
    /** Clear both pending open and stream timers before releasing callbacks. */
    close(): void { clearTimeout(this.openTimer); clearInterval(this.timer); this.readyState = 3 }
}
/** Create a fresh deterministic socket for each submitted or retried connection. */
export function simulatedSocket(_url: string, settings: Readonly<ConnectionSettings>): Socket { return new SimulatedSocket(settings.passphrase) }
