import { get_version_and_board, get_base_log_message_types } from '@webtools/dataflash'
import type { DataflashConstructor } from '@webtools/dataflash'
import type { Luxon } from './vendors.ts'
export interface ParameterDiff { added: Record<string, number>; missing: Record<string, number>; changed: Record<string, { from: number; to: number }> }
export type LogInfo = NonNullable<ReturnType<typeof loadLog>> & { name: string; rel_path: string }
export interface LogEntry { info: LogInfo; fileHandle: File; param_diff?: ParameterDiff | null }
/** Parse one local log with the legacy metadata, last-parameter and distance formulas.
 * Only discovery failures are discarded; field decoding failures propagate. */
export function loadLog(log_file: ArrayBuffer, DataflashParser: DataflashConstructor, luxon: Luxon, board_types: Record<string, string> = {}) {

    let log = new DataflashParser()
    try {
        log.processData(log_file, [])
    } catch {
        return
    }

    // Probably not a ArduPilot log
    if (Object.keys(log.messageTypes).length == 0) {
        return
    }

    const version = get_version_and_board(log)

    // Populate the board name from boards lookup
    let board_name
    if ((version.board_id != null) && (version.board_id in board_types)) {
        board_name = board_types[version.board_id]
    }

    // Get params, extract flight time
    let params: Record<string, number> = {}
    let start_flight_time: number | undefined
    let end_flight_time: number | undefined
    if ("PARM" in log.messageTypes) {
        const PARM = log.get("PARM") as { Name: string[]; Value: Float64Array }
        for (let i = 0; i < PARM.Name.length; i++) {
            const name = PARM.Name[i]!
            const value = PARM.Value[i]!
            params[name] = value

            // Check for cumulative flight time, get first and last value
            if (name == "STAT_FLTTIME") {
                if (start_flight_time == null) {
                    start_flight_time = value
                }
                end_flight_time = value
            }
        }
    }

    let flight_time
    if (start_flight_time != null) {
        flight_time = end_flight_time! - start_flight_time
    }

    // Get start time, convert to luxon format to work with table
    const time_stamp = luxon.DateTime.fromJSDate(log.extractStartTime())

    // Check for bad things we should warn about
    const watchdog = 'WDOG' in log.messageTypes

    let crash_dump
    if ('FILE' in log.messageTypes) {
        crash_dump = false
        const names = log.get('FILE', 'FileName') as string[]
        const len = names.length
        for (let i = 0; i<len; i++) {
            if (names[i]!.endsWith("crash_dump.bin")) {
                crash_dump = true
                break
            }
        }
    }

    // Calculate distance traveled
    let distance_traveled: number | null = null
    if ('POS' in log.messageTypes) {
        distance_traveled = 0

        const lat = log.get('POS', 'Lat') as Float64Array
        const lng = log.get('POS', 'Lng') as Float64Array
        const alt = log.get('POS', 'Alt') as Float64Array

        /** Wrap longitude once at the antimeridian in legacy integer units. */
        function diff_longitude(lon1: number, lon2: number) {
            let dlon = lon1-lon2
            if (dlon > 1800000000) {
                dlon -= 3600000000
            } else if (dlon < -1800000000) {
                dlon += 3600000000
            }
            return dlon
        }

        /** Clamp longitude scaling near the poles with the legacy 0.01 floor. */
        function longitude_scale(lat: number) {
            const scale = Math.cos(lat * (1.0e-7 * (Math.PI / 180.0)))
            return Math.max(scale, 0.01)
        }

        const LATLON_TO_M = 0.011131884502145034

        const len = lat.length
        for (let i = 1; i<len; i++) {
            const x = (lat[i - 1]! - lat[i]!) * LATLON_TO_M
            const y = diff_longitude(lng[i - 1]!, lng[i]!) * LATLON_TO_M * longitude_scale((lat[i - 1]!+lat[i]!)/2)
            const z = alt[i - 1]! - alt[i]!

            distance_traveled += Math.sqrt(x**2 + y**2 + z**2)
        }
    }

    return {
        size: log_file.byteLength,
        fw_string: version.fw_string,
        git_hash: version.fw_hash,
        board_id: version.board_id,
        fc_string: version.flight_controller,
        os_string: version.os_string,
        board_name,
        build_type: version.build_type,
        params,
        time_stamp,
        flight_time,
        watchdog,
        crash_dump,
        distance_traveled,
        available_log_messages: get_base_log_message_types(log),
    }
}

/** Compare adjacent parameter sets; ignore filters apply only to changed values. */
export function parameterDiff(params: Record<string, number>, prev_params: Record<string, number>, ignored: readonly boolean[]): ParameterDiff {
    // Superset of param names from both files
    const names = new Set([...Object.keys(prev_params), ...Object.keys(params)])

    // Do param diff
    let added: Record<string, number> = {}
    let missing: Record<string, number> = {}
    let changed: Record<string, { from: number; to: number }> = {}
    for (const name of names) {
        const have_old = name in prev_params
        const have_new = name in params
        if (have_new && !have_old) {
            // Only in new
            added[name] = params[name]!

        } else if (!have_new && have_old) {
            // Only in old
            missing[name] = prev_params[name]!

        } else if (prev_params[name] != params[name]!) {
            // In both with different value

            // Check if this change should be ignored
            let show_change = true
            for (const [index, ignore] of ignoreRules.entries()) {
                if (ignored[index] && ignore.fun(name)) {
                    show_change = false
                    break
                }
            }

            if (show_change) {
                changed[name] = { from: prev_params[name]!, to: params[name]!}
            }
        }
    }

    return { added, missing, changed }
}

/** Legacy selectors, including their unanchored regex quirks; instantiate regexes per call. */
export const ignoreRules: { name: string; fun: (name: string) => boolean }[] = [
    { name: "Statistics (STAT_)", fun: (name) => { return name.startsWith("STAT_") || (name == "SYS_NUM_RESETS") } },
    { name: "Gyro offsets", fun: (name) => { return /(:?(INS)[45]?_(GYR)[23]?(OFFS_)[XYZ])/gm.test(name)} },
    { name: "Gyro cal temperature", fun: (name) => { return /(:?(INS)[45]?(_GYR)[123]?(_CALTEMP))/gm.test(name)} },
    { name: "Baro ground pressure", fun: (name) => { return /(:?(BARO)[123]?(_GND_PRESS))/gm.test(name)} },
    { name: "Compass declination", fun: (name) => { return name == "COMPASS_DEC"} },
    { name: "Airspeed offset", fun: (name) => { return /(:?(ARSPD)[123]?(_OFFSET))/gm.test(name)} },
    { name: "Stream rates", fun: (name) => {
        return /(:?(SR|MAV)\d{1,2}_(RAW_SENS))/gm.test(name) ||
            /(:?(SR|MAV)\d{1,2}_(EXT_STAT))/gm.test(name) ||
            /(:?(SR|MAV)\d{1,2}_(RC_CHAN))/gm.test(name) ||
            /(:?(SR|MAV)\d{1,2}_(RAW_CTRL))/gm.test(name) ||
            /(:?(SR|MAV)\d{1,2}_(POSITION))/gm.test(name) ||
            /(:?(SR|MAV)\d{1,2}_(EXTRA1))/gm.test(name) ||
            /(:?(SR|MAV)\d{1,2}_(EXTRA2))/gm.test(name) ||
            /(:?(SR|MAV)\d{1,2}_(EXTRA3))/gm.test(name) ||
            /(:?(SR|MAV)\d{1,2}_(PARAMS))/gm.test(name) ||
            /(:?(SR|MAV)\d{1,2}_(ADSB))/gm.test(name)
        }
    },
]

/** Group in discovery order and retain the character-wise common prefix (not a directory prefix). */
export function groupLogs(logs: readonly LogEntry[]): { board: string; commonPath: string; logs: LogEntry[] }[] {
    const boards = new Map<string, LogEntry[]>()
    for (const log of logs) {
        const key = log.info.fc_string ?? 'Unknown'
        if (!boards.has(key)) boards.set(key, [])
        boards.get(key)!.push(log)
    }
    return [...boards].map(([board, entries]) => {
        let commonPath = entries[0]!.info.rel_path
        for (const entry of entries.slice(1)) {
            let index = 0
            while (index < commonPath.length && commonPath[index] === entry.info.rel_path[index]) index++
            commonPath = commonPath.slice(0, index)
        }
        return { board, commonPath, logs: entries }
    })
}
