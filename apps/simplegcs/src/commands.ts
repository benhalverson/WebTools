import { mavlink20 } from '@webtools/mavlink'
import type { Connection } from './connection.ts'
interface Pending { timer?: ReturnType<typeof setTimeout> }
/** Track every immediate send by command ID; ACKs cannot identify parameter values. */
export class CommandAcks {
    private readonly pending = new Map<number, Pending[]>()
    private readonly report: (command: number, result: string) => void
    private readonly timeoutMs: number
    /** Inject status delivery and the legacy five-second deadline. */
    constructor(report: (command: number, result: string) => void, timeoutMs = 5000) { this.report = report; this.timeoutMs = timeoutMs }
    /** Send without serializing controls; remove failed sends from the FIFO. */
    submit(command: number, send: () => void): boolean {
        const entries = this.pending.get(command) ?? [], entry: Pending = {}
        entries.push(entry); this.pending.set(command, entries); this.armTimeout(command, entry)
        try { send(); return true } catch { this.remove(command, entry); this.report(command, 'not sent'); return false }
    }
    /** Remove exactly one outstanding send and release its timer. */
    private remove(command: number, entry: Pending): boolean {
        clearTimeout(entry.timer)
        const entries = this.pending.get(command), index = entries?.indexOf(entry) ?? -1
        if (!entries || index < 0) return false
        entries.splice(index, 1); if (!entries.length) this.pending.delete(command)
        return true
    }
    /** Extend only the oldest pending send when the vehicle reports progress. */
    private armTimeout(command: number, entry: Pending): void {
        clearTimeout(entry.timer)
        entry.timer = setTimeout(() => { if (this.remove(command, entry)) this.report(command, 'no acknowledgement') }, this.timeoutMs)
    }
    /** Apply an ACK to the oldest send, preserving intermediate progress as nonterminal. */
    acknowledge(command: number, result: string, inProgress = false): boolean {
        const entry = this.pending.get(command)?.[0]
        if (!entry) return false
        if (inProgress) { this.armTimeout(command, entry); return true }
        this.remove(command, entry); this.report(command, result); return true
    }
    /** Cancel all deadlines silently at the connection boundary. */
    clear(): void { for (const entries of this.pending.values()) for (const entry of entries) clearTimeout(entry.timer); this.pending.clear() }
}
const commands: Record<number, string> = { 400: 'COMPONENT_ARM_DISARM', 176: 'DO_SET_MODE', 192: 'DO_REPOSITION', 246: 'PREFLIGHT_REBOOT_SHUTDOWN', 207: 'DO_FENCE_ENABLE' }
const results = ['ACCEPTED', 'TEMPORARILY_REJECTED', 'DENIED', 'UNSUPPORTED', 'FAILED', 'IN_PROGRESS', 'CANCELLED']
/** Preserve legacy names for known commands and its fallback for unknown commands. */
export function commandName(id: number): string { return commands[id] ?? `MAV_CMD ${id}` }
/** Preserve legacy result names, including extension values. */
export function resultName(id: number): string { return results[id] ?? `RESULT ${id}` }
/** Pack COMMAND_INT with the legacy frame, defaulting and unrounded coordinate semantics. */
export function sendCommand(connection: Connection, acks: CommandAcks, report: (text: string) => void, command: number, params: readonly number[] = [], text = `${commandName(command)} sent`): boolean {
    const link = connection.vehicleLink()
    if (!link) { report('Waiting for vehicle connection'); return false }
    const payload = new mavlink20.messages.command_int(link.telemetry.system, link.telemetry.component, mavlink20.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT, command, 0, 0,
        params[0] || 0, params[1] || 0, params[2] || 0, params[3] || 0, params[4] || 0, params[5] || 0, params[6] || 0)
    return acks.submit(command, () => {
        if (connection.vehicleLink()?.transport !== link.transport) throw new Error('Disconnected')
        link.transport.send(Uint8Array.from(payload.pack(link.processor))); link.processor.seq = (link.processor.seq + 1) % 256; report(text)
    })
}
