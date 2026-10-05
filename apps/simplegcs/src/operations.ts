import { connectedParameters } from './parameters/connected-session.ts'
import type { ParameterSession } from './parameters/session.ts'
import { mavlink20 } from '@webtools/mavlink'
import type { Connection, ConnectionEvent } from './connection.ts'
import { CommandAcks, commandName, resultName, sendCommand } from './commands.ts'
import { Downloads, emptyDownloads, type AutoDownloads, type DownloadsState, type DownloadKind } from './downloads.ts'
export interface OperationsState extends DownloadsState { fenceEnabled: boolean; target: { lat: number; lng: number; seen: number } | null; status: string; parameterSession: ParameterSession | null }
/** Construct fresh command/download state without timers or transport ownership. */
export function emptyOperations(): OperationsState { return { ...emptyDownloads(), fenceEnabled: true, target: null, status: '', parameterSession: null } }
/** Coordinate selected-vehicle commands and transfers on the connection's existing codec. */
export class Operations {
    private readonly connection: Connection
    private readonly acks: CommandAcks
    private readonly downloads: Downloads
    private readonly publish: (state: OperationsState) => void
    private readonly notify: (text: string, duration?: number) => void
    private readonly unsubscribe: () => void
    private state = emptyOperations()
    private bound = false
    /** Subscribe before starting auto-fetch; only this owner tears down its ACKs and FTP jobs. */
    constructor(connection: Connection, options: AutoDownloads, publish: (state: OperationsState) => void, notify: (text: string, duration?: number) => void) {
        this.connection = connection; this.publish = publish; this.notify = notify
        this.acks = new CommandAcks((command, result) => { const text = `CMD ${commandName(command)}: ${result}`; this.update({ status: text }); if (result !== 'ACCEPTED') this.notify(text, 3000) })
        this.downloads = new Downloads(state => this.update(state), text => this.report(text)); this.downloads.configure(options)
        this.unsubscribe = connection.subscribe(event => this.receive(event)); this.bind()
    }
    /** Deliver command notices and the persistent accessible activity status. */
    private report(text: string): void { this.update({ status: text }); this.notify(text) }
    /** Publish an immutable state snapshot to the mounted React consumer. */
    private update(patch: Partial<OperationsState>): void { this.state = { ...this.state, ...patch }; this.publish(this.state) }
    /** Bind downloads once after vehicle discovery, preserving shared packet sequence/signing. */
    private bind(): void {
        const link = this.connection.vehicleLink()
        if (this.bound || !link) return
        this.bound = true
        this.downloads.manager.setLink(link.processor, link.transport, link.telemetry.system, link.telemetry.component)
        this.update({ parameterSession: connectedParameters(this.downloads.manager, link.vehicleType) })
        this.downloads.start()
    }
    /** Consume only connection-filtered packets; target-addressed ACKs remain strict. */
    private receive(event: ConnectionEvent): void {
        if (event.type === 'disconnect') { this.reset(); return }
        this.bind()
        const link = this.connection.vehicleLink(), m = event.message
        if (!link) return
        this.downloads.manager.handleMessage(m)
        if (m._name === 'COMMAND_ACK' && m.target_system === link.processor.srcSystem && m.target_component === link.processor.srcComponent) {
            const result = resultName(m.result)
            if (this.acks.acknowledge(m.command, result, m.result === mavlink20.MAV_RESULT_IN_PROGRESS) && m.result === mavlink20.MAV_RESULT_IN_PROGRESS) this.update({ status: `CMD ${commandName(m.command)}: ${result}` })
        }
        if (m._name === 'SYS_STATUS') this.update({ fenceEnabled: !!(m.onboard_control_sensors_enabled & mavlink20.MAV_SYS_STATUS_GEOFENCE) })
        if (m._name === 'POSITION_TARGET_GLOBAL_INT') this.update({ target: m.lat_int || m.lon_int ? { lat: m.lat_int / 1e7, lng: m.lon_int / 1e7, seen: Date.now() } : null })
    }
    /** Replace auto-fetch preferences without restarting an active transfer. */
    configure(options: AutoDownloads): void { this.downloads.configure(options) }
    /** Send one legacy COMMAND_INT and track its acknowledgement independently. */
    command(command: number, params: readonly number[] = [], text?: string): boolean { return sendCommand(this.connection, this.acks, message => this.report(message), command, params, text) }
    /** Restrict rover mode numbers to boats/rovers, exactly as the public app does. */
    mode(mode: number, label: string): boolean {
        const link = this.connection.vehicleLink()
        if (!link) { this.report('Waiting for vehicle connection'); return false }
        if (!['boat', 'rover'].includes(link.telemetry.vehicleClass)) { this.report('Mode controls require a connected boat or rover'); return false }
        return this.command(mavlink20.MAV_CMD_DO_SET_MODE, [mavlink20.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, mode], `${label} sent`)
    }
    /** Reposition using unrounded coordinates and the legacy change-mode flag. */
    reposition(lat: number, lng: number): void { this.command(mavlink20.MAV_CMD_DO_REPOSITION, [0, mavlink20.MAV_DO_REPOSITION_FLAGS_CHANGE_MODE, 0, 0, lat * 1e7, lng * 1e7, 0]) }
    /** Capture the exact transport generation at pointerdown, rejecting replacement-vehicle holds. */
    beginReposition(): (lat: number, lng: number) => void {
        const generation = this.connection.vehicleLink()?.generation
        return (lat, lng) => { if (generation === this.connection.vehicleLink()?.generation) this.reposition(lat, lng) }
    }
    /** Queue a manually requested mission or fence download. */
    fetch(kind: DownloadKind): void { this.downloads.fetch(kind) }
    /** Invalidate all per-vehicle state before a replacement socket can deliver packets. */
    private reset(): void { this.bound = false; this.state.parameterSession?.model.disconnect(); this.acks.clear(); this.downloads.reset(); this.state.parameterSession?.dispose(); this.state = emptyOperations(); this.publish(this.state) }
    /** Release subscription and pending work before the React resource lifetime ends. */
    dispose(): void { this.unsubscribe(); this.reset() }
}
