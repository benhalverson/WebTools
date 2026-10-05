import { MAVLink20Processor, mavlink20 } from '@webtools/mavlink/browser'
import type { Message } from '@webtools/mavlink'
import type { ConnectionSettings } from './settings'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'failed'
export interface ConnectionEvents {
    state(state: ConnectionState): void
    opened(target: string): void
    message(message: Message): void
}

/** Own one socket and optional GCS heartbeat timer; only decoded telemetry leaves this boundary. */
export class DashboardConnection {
    private readonly codec = new MAVLink20Processor()
    private socket: WebSocket | undefined
    private timer: ReturnType<typeof setInterval> | undefined

    /** Bind consumer callbacks without opening a connection. MAVLink readiness is the caller's responsibility. */
    constructor(private readonly events: ConnectionEvents) {}

    /** Replace a connection, preserving decoder state and the legacy auto-connect failure indication. */
    connect(settings: ConnectionSettings, automatic = false): void {
        this.disconnect()
        this.events.state('connecting')
        this.codec.srcSystem = Number.parseInt(settings.sysid)
        this.codec.srcComponent = Number.parseInt(settings.compid)
        this.codec.signing.sign_outgoing = false
        const passphrase = automatic ? settings.signing : settings.signing.trim()
        if (passphrase.length > 0) {
            this.codec.signing.secret_key = new Uint8Array(mavlink20.sha256(new TextEncoder().encode(passphrase)))
            this.codec.signing.sign_outgoing = true
        }
        const target = automatic ? settings.ws || 'ws://127.0.0.1:56781' : settings.ws
        let socket: WebSocket
        try { socket = new WebSocket(target) } catch {
            this.events.state(automatic ? 'idle' : 'failed')
            return
        }
        this.socket = socket
        socket.binaryType = 'arraybuffer'
        let opened = false
        socket.onopen = () => {
            if (this.socket !== socket) return
            opened = true
            this.events.state('connected')
            this.events.opened(target)
            if (settings.heartbeat) this.timer = setInterval(() => {
                if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return
                const heartbeat = new mavlink20.messages.heartbeat(mavlink20.MAV_TYPE_GCS, mavlink20.MAV_AUTOPILOT_INVALID, 0, 0, mavlink20.MAV_STATE_ACTIVE)
                socket.send(new Uint8Array(heartbeat.pack(this.codec)))
                this.codec.seq = (this.codec.seq + 1) % 256
            }, 1000)
        }
        socket.onmessage = event => {
            if (this.socket !== socket || !(event.data instanceof ArrayBuffer)) return
            for (const byte of new Uint8Array(event.data)) {
                const message = this.codec.parseChar(byte)
                if (message !== null && message._name !== 'BAD_DATA') {
                    this.events.message(Object.assign(message, { _timeStamp: Date.now() }))
                }
            }
        }
        socket.onerror = () => { if (this.socket === socket) socket.close() }
        socket.onclose = () => {
            if (this.socket !== socket) return
            this.release()
            this.events.state(automatic && !opened ? 'idle' : 'failed')
        }
    }

    /** Release callbacks and timer before closing, so stale socket events cannot alter a new connection. */
    private release(): void {
        clearInterval(this.timer)
        this.timer = undefined
        const socket = this.socket
        this.socket = undefined
        if (socket) {
            socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
            socket.close()
        }
    }

    /** Stop a user-owned connection; repeated calls also serve as effect cleanup. */
    disconnect(): void {
        this.release()
        this.events.state('idle')
    }
}
