import type { Message } from '@webtools/mavlink'
export type VehicleClass = 'boat' | 'rover' | 'plane' | 'copter'
export interface Telemetry {
    system: number; component: number; vehicleClass: VehicleClass; identity: string | null
    batteryPct: number | null; currentA: number | null; speed: number | null; armed: boolean | null; modeName: string; numSats: number | null
    position: [number, number] | null; heading: number | null; carrier: string; rsrp: string
}
const modes: Record<number, string> = { 0: 'MANUAL', 1: 'ACRO', 3: 'STEERING', 4: 'HOLD', 5: 'LOITER', 6: 'FOLLOW', 7: 'SIMPLE', 8: 'DOCK', 9: 'CIRCLE', 10: 'AUTO', 11: 'RTL', 12: 'SMART_RTL', 15: 'GUIDED', 16: 'INITIALISING' }
const carriers: Record<number, string> = { 50501: 'AU Telstra', 50502: 'AU Optus', 50503: 'AU Vodafone', 23410: 'UK O2', 23411: 'UK O2', 23402: 'UK O2', 23415: 'UK Voda', 23420: 'UK Three', 23430: 'UK EE(T-M)', 23433: 'UK EE(O)', 23431: 'UK EE', 23432: 'UK EE', 23434: 'UK EE' }
/** Construct empty telemetry after every transport disconnect. */
export function emptyTelemetry(): Telemetry { return { system: -1, component: -1, vehicleClass: 'plane', identity: null, batteryPct: null, currentA: null, speed: null, armed: null, modeName: '—', numSats: null, position: null, heading: null, carrier: '—', rsrp: '— dBm' } }
/** Preserve legacy vehicle discovery/filtering and numerical conversion order.
 * Returns null for traffic that must not refresh the selected vehicle's health.
 */
export function receiveTelemetry(previous: Telemetry, message: Message, url: string): Telemetry | null {
    const m = message, state = { ...previous }
    if (m._name === 'HEARTBEAT' && m.autopilot === 3) {
        if (state.system < 1) { state.system = m._header.srcSystem; state.component = m._header.srcComponent; state.identity = `${url}:${state.system}:${state.component}` }
        if (m._header.srcSystem !== state.system || m._header.srcComponent !== state.component) return null
        state.vehicleClass = m.type === 11 ? 'boat' : m.type === 10 ? 'rover' : [2, 3, 4].includes(m.type) ? 'copter' : 'plane'
        state.armed = !!(m.base_mode & 128)
        state.modeName = [10, 11].includes(m.type) ? modes[m.custom_mode] || `${m.custom_mode}` : `${m.custom_mode}`
    }
    if (m._header.srcSystem !== state.system || m._header.srcComponent !== state.component) return null
    switch (m._name) {
        case 'GLOBAL_POSITION_INT': { state.position = [m.lat / 1e7, m.lon / 1e7]; const vx = m.vx / 100.0, vy = m.vy / 100.0; state.speed = Math.sqrt(vx * vx + vy * vy); break }
        case 'ATTITUDE': state.heading = (m.yaw * 180 / Math.PI + 360) % 360; break
        case 'BATTERY_STATUS': state.batteryPct = m.battery_remaining; state.currentA = m.current_battery / 100.0; break
        case 'GPS_RAW_INT': case 'GPS2_RAW': state.numSats = m.satellites_visible === 255 ? null : m.satellites_visible; break
        // Legacy updateLTE reads a message cache but is not called by processMessage.
        // Its separate one-second refresh remains owned by the connection controller.
    }
    return state
}
/** Format LTE values with the legacy carrier rounding and tenth-dBm conversion. */
export function lteDisplay(code?: number, rsrp?: number): { carrier: string; rsrp: string } {
    const rounded = code === undefined ? undefined : Math.round(code)
    return { carrier: rounded === undefined ? '—' : carriers[rounded] || String(rounded), rsrp: rsrp === undefined ? '— dBm' : `${(rsrp / 10.0).toFixed(1)} dBm` }
}
/** Format speed in knots using the original conversion constant and rounding. */
export function speedText(speed: number | null): string { return speed !== null && speed >= 0 ? `${(1.94384449 * speed).toFixed(1)} knots` : '--- knots' }
