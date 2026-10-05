import { get_compass_param_names, get_param_name_vector3, get_param_download_text } from '@webtools/parameters'
import { get_ins_param_names, get_baro_param_names, get_airspeed_param_names } from './names.ts'
import type { Parameters } from './report.ts'

export interface ExportGroup { id: string; label: string; section: string; names: readonly string[] }
export interface AvailableExportGroup extends ExportGroup { available: readonly string[]; disabled: boolean; title: string }

/** Build the original minimal-export exclusions, preserving instance-count quirks. */
function createExportGroups(): ExportGroup[] {
    const groups: ExportGroup[] = []
    /** Register a control with the exact parameter order used for legacy tooltips. */
    function add(id: string, names: string[]): void {
        const parts = id.split('_')
        const labels: Record<string, string> = { ins: 'INS', compass: 'Compass', baro: 'Barometer', airspeed: 'Airspeed', ahrs: 'AHRS', rc: 'RC', stream: 'Stream rates', declination: 'Compass' }
        const suffix = parts.slice(2).join('_')
        const controlLabels: Record<string, string> = { gyro: 'Gyro', accel: 'Accel', use: 'Use', position: 'Position', calibration: 'Calibration', ordering: 'Ordering', id: 'IDs', wind_comp: 'Wind compensation', type: 'Type', trim: 'Trim', orientation: 'Orientation', reverse: 'Reversals', dz: 'Dead zone', options: 'Options', flightmodes: 'Flight modes' }
        groups.push({ id, names, section: labels[parts[1]!] ?? '', label: id === 'param_declination' ? 'Declination' : parts[1] === 'stream' ? `MAV ${Number(parts[2]) + 1}${Number(parts[2]) < 6 ? ',' : ''}` : controlLabels[suffix] ?? suffix })
    }
    // Ins
    const ins_gyro: string[] = []
    const ins_accel: string[] = []
    const ins_use: string[] = []
    const ins_pos: string[] = []
    for (let i = 0; i < 5; i++) {
        const names = get_ins_param_names(i)
        ins_gyro.push(...names.gyro.offset, names.gyro.id, names.gyro.cal_temp)
        ins_accel.push(...names.accel.offset, ...names.accel.scale, names.accel.id, names.accel.cal_temp)
        ins_use.push(names.use)
        ins_pos.push(...names.pos)
    }
    add("param_ins_gyro", ins_gyro)
    add("param_ins_accel", ins_accel)
    add("param_ins_use", ins_use)
    add("param_ins_position", ins_pos)

    // Compass
    const compass_calibration: string[] = []
    const compass_ids: string[] = []
    const compass_use: string[] = []
    const compass_ordering: string[] = []
    for (let i = 1; i <= 3; i++) {
        const names = get_compass_param_names(i)
        compass_calibration.push(...names.offsets, ...names.diagonals, ...names.off_diagonals, ...names.motor, names.scale, names.orientation)
        compass_ids.push(names.id, names.external)
        compass_use.push(names.use)
        compass_ordering.push("COMPASS_PRIO" + i + "_ID")
    }
    for (let i = 4; i <= 8; i++) {
        compass_ids.push("COMPASS_DEV_ID" + i)
    }
    add("param_compass_calibration", compass_calibration)
    add("param_compass_id", compass_ids)
    add("param_compass_use", compass_use)
    add("param_compass_ordering", compass_ordering)
    add("param_declination", ["COMPASS_DEC"])

    // Baro
    const baro_calibration: string[] = []
    const baro_id: string[] = []
    const baro_wind_comp: string[] = []
    for (let i = 0; i < 3; i++) {
        const names = get_baro_param_names(i)
        baro_calibration.push(names.gnd_press)
        baro_id.push(names.id)
        baro_wind_comp.push(names.wind_comp.enabled, ...names.wind_comp.coefficients)
    }
    add("param_baro_calibration", baro_calibration)
    add("param_baro_id", baro_id)
    add("param_baro_wind_comp", baro_wind_comp)

    // Airspeed
    const airspeed_calibration: string[] = []
    const airspeed_type: string[] = []
    const airspeed_use: string[] = []
    for (let i = 0; i < 2; i++) {
        const names = get_airspeed_param_names(i)
        airspeed_calibration.push(names.offset, names.ratio, names.auto_cal)
        airspeed_type.push(names.type, names.id, names.bus, names.pin, names.psi_range, names.tube_order, names.skip_cal)
        airspeed_use.push(names.use)
    }
    add("param_airspeed_calibration", airspeed_calibration)
    add("param_airspeed_type", airspeed_type)
    add("param_airspeed_use", airspeed_use)

    // AHRS
    add("param_ahrs_trim", get_param_name_vector3("AHRS_TRIM_"))
    add("param_ahrs_orientation", ["AHRS_ORIENTATION"])

    // RC
    const rc_calibration: string[] = []
    const rc_reversals: string[] = []
    const rc_dead_zone: string[] = []
    const rc_options: string[] = []
    for (let i = 1; i <= 16; i++) {
        const rc_prefix = "RC" + i + "_"
        rc_calibration.push(rc_prefix + "MIN", rc_prefix + "MAX", rc_prefix + "TRIM")
        rc_reversals.push(rc_prefix + "REVERSED")
        rc_dead_zone.push(rc_prefix + "DZ")
        rc_options.push(rc_prefix + "OPTION")
    }
    add("param_rc_calibration", rc_calibration)
    add("param_rc_reverse", rc_reversals)
    add("param_rc_dz", rc_dead_zone)
    add("param_rc_options", rc_options)

    let flight_modes = ["FLTMODE_CH"]
    for (let i = 1; i <= 6; i++) {
        flight_modes.push("FLTMODE" + i)
    }
    add("param_rc_flightmodes", flight_modes)

    // Stream rates
    for (let i = 0; i <= 6; i++) {
        /** Expand the exact legacy SR and MAV stream suffixes. */
        function get_stream_rates(prefix: string) {
            return [
                prefix + "RAW_SENS",
                prefix + "EXT_STAT",
                prefix + "RC_CHAN",
                prefix + "RAW_CTRL",
                prefix + "POSITION",
                prefix + "EXTRA1",
                prefix + "EXTRA2",
                prefix + "EXTRA3",
                prefix + "PARAMS",
                prefix + "ADSB",
                prefix + "OPTIONS"
            ]
        }
        const SR_names = get_stream_rates(`SR${i}_`)
        const MAV_names = get_stream_rates(`MAV${i+1}_`)
        add("param_stream_" + i, SR_names.concat(MAV_names))
    }

    return groups
}

export const exportGroups: readonly ExportGroup[] = createExportGroups()

/** Derive availability and tooltip names without mutating selections. */
export function availableGroups(params: Parameters): AvailableExportGroup[] {
    return exportGroups.map(group => {
        const available = group.names.filter(name => name in params)
        return { ...group, available, disabled: available.length === 0, title: available.join(', ') }
    })
}

/** Serialize all values or minimal selections using the shared legacy float32 formatter. */
export function exportParameters(params: Parameters, selected: ReadonlySet<string>, mode: 'all' | 'minimal'): string {
    if (mode === 'all') return get_param_download_text(params)
    const skipped = new Set(['STAT_BOOTCNT', 'STAT_FLTTIME', 'STAT_RUNTIME', 'STAT_RESET', 'STAT_FLTCNT', 'STAT_DISTFLWN', 'SYS_NUM_RESETS', 'FORMAT_VERSION', 'MIS_TOTAL', 'FENCE_TOTAL', 'RALLY_TOTAL'])
    for (const group of exportGroups) if (!selected.has(group.id)) for (const name of group.names) skipped.add(name)
    return get_param_download_text(Object.fromEntries(Object.entries(params).filter(([name]) => !skipped.has(name))))
}
