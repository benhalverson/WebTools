import { get_param_download_text } from '@webtools/parameters'

/** Ordered controls retain the checked-in page's labels, raw defaults and units. */
export const groups = [
    { label: 'Attitude Control', values: { ATC_RATE_R_MAX: '0', ATC_RATE_P_MAX: '0', ATC_ACC_R_MAX: '1100', ATC_ACC_P_MAX: '1100', ATC_INPUT_TC: '0.15', ATC_RATE_FF_ENAB: '1' } },
    { label: 'Position Control', values: { PSC_JERK_NE: '5.0', PSC_JERK_D: '5.0', PSC_NE_POS_P: '1.0', PSC_D_ACC_FLTT: '0', PSC_D_ACC_FLTE: '20' } },
    { label: 'Waypoint Navigation', values: { WP_JERK: '1.0', WP_ACC_Z: '1.0', WP_ACC: '2.5', WP_ACC_CNR: '0', WP_SPD: '10', WP_SPD_UP: '2.5', WP_SPD_DN: '1.5', WP_RADIUS_M: '50.0' } },
] as const
export const waypointNames = ['first_wp', 'curr_wp', 'next_wp', 'last_wp'] as const
export type Settings = Record<string, string>
const waypointDefaults = [[0, 0, 300], [300, 300, 150], [70, 35, 80], [100, 250, 80]] as const

/** Return independent raw settings so reset never shares mutable app state. */
export function initialSettings(): Settings {
    const values: Settings = Object.assign({}, ...groups.map(group => group.values))
    waypointNames.forEach((name, index) => {
        ;(['x', 'y', 'z'] as const).forEach((axis, coordinate) => { values[`${name}_${axis}`] = String(waypointDefaults[index]![coordinate]) })
    })
    return values
}

/** Serialize navigation and shaping parameters using the shared legacy float32 format.
 * Waypoints are UI coordinates, not firmware parameters, and are deliberately omitted.
 */
export function exportParameters(settings: Readonly<Settings>): string {
    const values: Record<string, number> = {}
    for (const group of groups) for (const key of Object.keys(group.values)) values[key] = parseFloat(settings[key]!)
    return get_param_download_text(values)
}

/** Apply recognized name/value records atomically, accepting comma or whitespace
 * parameter files. Unknown firmware parameters and comment lines are ignored;
 * malformed known values fail without partially changing the current settings.
 */
export function importParameters(text: string, current: Readonly<Settings>): Settings {
    const next = { ...current }
    const names = new Set(groups.flatMap(group => Object.keys(group.values)))
    let matches = 0
    for (const [index, line] of text.split(/\r?\n/).entries()) {
        const content = line.trim()
        if (!content || content.startsWith('#')) continue
        const [name, value, extra] = content.split(/[\s,]+/)
        if (!name || !names.has(name)) continue
        if (extra !== undefined || !value || !Number.isFinite(Number(value))) throw new Error(`Invalid parameter on line ${index + 1}`)
        next[name] = value
        matches++
    }
    if (!matches) throw new Error('No matching S-curve parameters found in this file.')
    return next
}
