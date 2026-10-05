import { MAVLink20Processor, mavlink20, type Message } from '@webtools/mavlink'
import { emptyTelemetry, receiveTelemetry, lteDisplay, type Telemetry } from './telemetry.ts'
import { validateUrl, type ConnectionSettings } from './settings.ts'
export interface Socket {
    readyState: number; binaryType: string
    onopen: (() => void) | null; onclose: (() => void) | null; onerror: (() => void) | null
    onmessage: ((event: { data: ArrayBuffer }) => void) | null
    send(bytes: Uint8Array): void; close(code?: number, reason?: string): void
}
export type ConnectionEvent = { type: 'message'; message: Message } | { type: 'disconnect' }
export type SocketFactory = (url: string, settings: Readonly<ConnectionSettings>) => Socket
export interface LinkState { telemetry: Telemetry; status: string; stale: boolean; phase: 'disconnected' | 'connecting' | 'connected' | 'error'; lagSeconds: number; error: string; mapIdentity: string | null }
/** Own the parser, replay windows, socket and every link timer for one React mount. */
export class Connection {
    private generation = 0
    private vehicleType = 0
    private readonly subscribers = new Set<(event: ConnectionEvent) => void>()
    /** Observe selected-vehicle packets and synchronous disconnects; unsubscribe before disposal. */
    subscribe(listener: (event: ConnectionEvent) => void): () => void { this.subscribers.add(listener); return () => { this.subscribers.delete(listener) } }
    /** Borrow the active codec/transport; consumers must relinquish them on disconnect. */
    vehicleLink() {
        const telemetry = this.state.telemetry
        return this.socket?.readyState === 1 && telemetry.system > 0 ? { generation: this.generation, vehicleType: this.vehicleType, processor: this.processor, transport: this.socket, telemetry } : null
    }
    private readonly processor = new MAVLink20Processor()
    private readonly streams = new Map<string, Record<string, number>>()
    private readonly factory: SocketFactory
    private readonly publish: (state: LinkState) => void
    private socket: Socket | null = null
    private heartbeat: ReturnType<typeof setInterval> | undefined
    private health: ReturnType<typeof setInterval> | undefined
    private lte: ReturnType<typeof setInterval> | undefined
    private retry: ReturnType<typeof setTimeout> | undefined
    private last: ConnectionSettings | null = null
    private attempts = 0
    private lastRx = 0
    private named = new Map<number, Map<string, number>>()
    private disposed = false
    private state: LinkState = { telemetry: emptyTelemetry(), status: 'Disconnected', stale: true, phase: 'disconnected', lagSeconds: 0, error: '', mapIdentity: null }
    /** Inject a transport factory and synchronous state subscriber; no resources start here. */
    constructor(factory: SocketFactory, publish: (state: LinkState) => void) { this.factory = factory; this.publish = publish }
    /** Return the current immutable snapshot for the initial React render. */
    snapshot(): LinkState { return this.state }
    /** Publish a new snapshot only while this controller remains mounted. */
    private update(patch: Partial<LinkState>): void { this.state = { ...this.state, error: '', ...patch }; if (!this.disposed) this.publish(this.state) }
    /** Connect with a submitted copy; constructor failure never schedules retries. */
    connect(settings: ConnectionSettings): boolean {
        if (this.disposed) return false
        let socket: Socket
        try { validateUrl(settings.url); socket = this.factory(settings.url, { ...settings }) }
        catch (error) { this.disconnect(false); this.update({ phase: 'error', error: `Cannot open connection: ${error instanceof Error ? error.message : String(error)}` }); return false }
        this.disconnect(false)
        this.last = { ...settings }
        const p = this.processor
        p.srcSystem = settings.systemId; p.srcComponent = settings.componentId
        p.buf = new Uint8Array(); p.expected_length = mavlink20.HEADER_LEN
        p.signing.timestamp = Math.max(p.signing.timestamp, Math.floor((Date.now() - Date.UTC(2015, 0, 1)) * 100))
        p.signing.secret_key = settings.passphrase ? mavlink20.sha256(new TextEncoder().encode(settings.passphrase)) : new Uint8Array()
        p.signing.sign_outgoing = settings.passphrase.length > 0
        const context = settings.url + ':' + Array.from(p.signing.secret_key).join(',')
        if (!this.streams.has(context)) this.streams.set(context, {})
        p.signing.stream_timestamps = this.streams.get(context)!
        this.socket = socket; socket.binaryType = 'arraybuffer'
        this.update({ phase: 'connecting', error: '' })
        socket.onopen = () => {
            if (this.socket !== socket) return
            this.update({ status: 'Waiting for vehicle', stale: true }); this.lastRx = Date.now()
            if (settings.sendHeartbeat) this.heartbeat = setInterval(() => this.sendHeartbeat(), 1000)
            this.health = setInterval(() => this.checkHealth(), 500)
            this.lte = setInterval(() => {
                const values = this.named.get(this.state.telemetry.system)
                this.update({ telemetry: { ...this.state.telemetry, ...lteDisplay(values?.get('LTE_MCCMNC'), values?.get('LTE_RSRP')) } })
            }, 1000)
        }
        socket.onerror = () => { if (this.socket === socket) this.update({ phase: 'error' }) }
        socket.onclose = () => { if (this.socket !== socket) return; this.disconnect(false); this.update({ phase: 'error' }); this.scheduleReconnect() }
        socket.onmessage = event => { if (this.socket === socket) this.receive(event.data) }
        return true
    }
    /** Send only the user-selected GCS heartbeat, retaining sequence/signing behavior. */
    private sendHeartbeat(): void {
        try {
            const bytes = new mavlink20.messages.heartbeat(6, 8, 0, 0, 4).pack(this.processor)
            if (this.socket?.readyState !== 1) return
            this.socket.send(Uint8Array.from(bytes)); this.processor.seq = (this.processor.seq + 1) % 256
        } catch { clearInterval(this.heartbeat); this.heartbeat = undefined; this.update({ phase: 'error', error: 'Heartbeat stopped after error' }) }
    }
    /** Parse arbitrary frame boundaries; unrelated vehicles never refresh link health. */
    private receive(data: ArrayBuffer): void {
        this.processor.pushBuffer(new Uint8Array(data))
        for (;;) {
            const message = this.processor.parseChar(null)
            if (message === null) break
            if (message._name === 'BAD_DATA') continue
            if (message._name === 'NAMED_VALUE_FLOAT') {
                let values = this.named.get(message._header.srcSystem)
                if (!values) { values = new Map(); this.named.set(message._header.srcSystem, values) }
                values.set(message.name.replace(/\0+$/, ''), message.value)
            }
            const telemetry = receiveTelemetry(this.state.telemetry, message, this.last!.url)
            if (!telemetry) continue
            if (message._name === 'HEARTBEAT') this.vehicleType = message.type
            this.lastRx = Date.now(); this.attempts = 0
            this.update({ telemetry, status: 'Live', stale: false, phase: 'connected', lagSeconds: 0, mapIdentity: telemetry.identity })
            for (const listener of this.subscribers) listener({ type: 'message', message })
        }
    }
    /** Mark data stale after three seconds and detach stalled peers after fifteen. */
    private checkHealth(): void {
        if (this.socket?.readyState !== 1) return
        const lag = Date.now() - (this.lastRx || Date.now())
        if (lag > 15000) { this.disconnect(false, 4000, 'link stall'); this.update({ phase: 'error' }); this.scheduleReconnect(); return }
        if (lag > 3000) this.update({ status: this.state.telemetry.system < 1 ? 'Waiting for vehicle' : 'Telemetry stale', stale: true, phase: 'error', lagSeconds: Math.round(lag / 1000) })
        else if (this.state.telemetry.system > 0) this.update({ status: 'Live', stale: false, phase: 'connected', lagSeconds: 0 })
    }
    /** Back off 2/4/8/16/30 seconds using submitted settings, never the editor draft. */
    private scheduleReconnect(): void {
        if (this.retry !== undefined || !this.last || this.disposed) return
        const delay = Math.min(30000, 2000 * 2 ** Math.min(this.attempts++, 4))
        this.retry = setTimeout(() => { this.retry = undefined; if (this.last) this.connect(this.last) }, delay)
    }
    /** Detach callbacks before closing; intentional stops also forget map identity and retries. */
    disconnect(intentional = true, code = 1000, reason = ''): void {
        clearTimeout(this.retry); clearInterval(this.heartbeat); clearInterval(this.health); clearInterval(this.lte)
        this.retry = this.heartbeat = this.health = this.lte = undefined
        this.generation++
        const socket = this.socket; this.socket = null
        for (const listener of this.subscribers) listener({ type: 'disconnect' })
        if (socket) { socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null; try { socket.close(code, reason) } catch { /* A closed transport already relinquished its resources. */ } }
        this.vehicleType = 0; this.named.clear()
        if (intentional) { this.last = null; this.attempts = 0 }
        this.update({ telemetry: emptyTelemetry(), status: 'Disconnected', stale: true, lagSeconds: 0, phase: 'disconnected', mapIdentity: intentional ? null : this.state.mapIdentity })
    }
    /** End this mount permanently, including pending reconnects and replay-window ownership. */
    dispose(): void { this.disposed = true; this.disconnect(); this.streams.clear(); this.subscribers.clear() }
}
