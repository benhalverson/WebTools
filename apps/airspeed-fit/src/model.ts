/* oxlint-disable unicorn/no-new-array -- Preserve legacy sparse allocation and numerical behavior. */
// Indexed assertions preserve legacy missing-sample arithmetic; they do not fill or validate data.
import type { DataflashLog, DataflashConstructor } from '@webtools/dataflash'
import { get_param_value, param_to_string } from '@webtools/parameters'
import { linear_interp, array_scale } from '@webtools/numerics'
import {
    air_temperature_c,
    eas2tas,
    auto_window,
    isa_temperature_at_alt_c,
    calibrate,
    calibrate_combined,
    density_altitude_m,
} from './core.ts'
import type { Calibration, CombinedFit } from './core.ts'
export interface Wind {
    time: number[]
    n: number[]
    e: number[]
}
export interface Velocity {
    name: string
    time: number[]
    vn: number[]
    ve: number[]
    vd: number[]
    roll: number[] | null
    pitch: number[] | null
    yaw: number[] | null
    wind: Wind | null
}
export interface Sensor {
    instance: number
    time: number[]
    dpress: number[]
    asp_reported: number[]
    ratio_name: string
    current_ratio: number | null
    use: number | null
    use_name: string
    devid: number | null
    health: number[] | null
    primary: number[] | null
    start_time: number
    end_time: number
}
export interface TemperatureSource {
    label: string
    value: number
}
export interface Flight {
    sources: Velocity[]
    sensors: Sensor[]
    baro: { time: number[]; press: number[] }
    pos: { time: number[]; rel_alt: number[]; alt: number[] }
    att: { time: number[]; roll: number[] } | null
    flight_lo: number | null
    flight_hi: number | null
    field_elevation: number | null
    field_time: number | null
    takeoff: { lat: number; lng: number; date: Date } | null
    temp_sources: Record<string, TemperatureSource>
    start_time: number
    end_time: number
    window: [number, number]
    messages: string[]
}
export interface Options {
    start: number
    end: number
    temperature: number
    source: number
    sensors: number[]
    q: number
}
export interface Combined {
    t: number[]
    vn: number[]
    ve: number[]
    vd: number[]
    u_list: number[][]
    wind_n: number[] | null
    wind_e: number[] | null
    n_keep: number
}
export interface Analysis {
    sensors: Sensor[]
    combined: Combined
    seeds: Calibration[]
    fit: CombinedFit | null
}
/** Read one numeric parser field without changing scaling or sample precision. */
function numeric(log: DataflashLog, name: string, field: string, instance?: number): number[] {
    const values = instance === undefined ? log.get(name, field) : log.get_instance(name, instance, field)
    if (!(values instanceof Float64Array)) throw new Error(`Missing numeric field ${name}.${field}`)
    return Array.from(values)
}
/** Optional numeric fields remain absent rather than being filled with zeros. */
function optionalNumeric(log: DataflashLog, name: string, field: string, instance?: number): number[] | null {
    const values = instance === undefined ? log.get(name, field) : log.get_instance(name, instance, field)
    return values instanceof Float64Array ? Array.from(values) : null
}
/** Convert the parser's microseconds to seconds with the legacy multiplication. */
export function TimeUS_to_seconds(TimeUS: number[]): number[] {
    return array_scale(TimeUS, 1 / 1000000)
}
/** Discover EKF3 then EKF2 instances in the parser order, preserving raw velocities. */
export function get_velocity_sources(log: DataflashLog): Velocity[] {
    const sources: Velocity[] = []
    const variants = [
        { p1: 'XKF1', p2: 'XKF2', label: 'EKF3' },
        { p1: 'NKF1', p2: 'NKF2', label: 'EKF2' },
    ]
    for (const v of variants) {
        if (!(v.p1 in log.messageTypes) || !('instances' in log.messageTypes[v.p1]!)) {
            continue
        }
        for (const core_key of Object.keys(log.messageTypes[v.p1]!.instances!)) {
            const core = Number(core_key)
            const time = TimeUS_to_seconds(numeric(log, v.p1, 'TimeUS', core))
            if (time == null || time.length == 0) {
                continue
            }
            const roll = optionalNumeric(log, v.p1, 'Roll', core)
            const pitch = optionalNumeric(log, v.p1, 'Pitch', core)
            const yaw = optionalNumeric(log, v.p1, 'Yaw', core)
            const source: Velocity = {
                name: v.label + ' core ' + core,
                time,
                vn: numeric(log, v.p1, 'VN', core),
                ve: numeric(log, v.p1, 'VE', core),
                vd: numeric(log, v.p1, 'VD', core),
                roll: roll != null ? Array.from(roll) : null,
                pitch: pitch != null ? Array.from(pitch) : null,
                yaw: yaw != null ? Array.from(yaw) : null,
                wind: null,
            }
            if (
                v.p2 in log.messageTypes &&
                'instances' in log.messageTypes[v.p2]! &&
                core in log.messageTypes[v.p2]!.instances!
            ) {
                source.wind = {
                    time: TimeUS_to_seconds(numeric(log, v.p2, 'TimeUS', core)),
                    n: numeric(log, v.p2, 'VWN', core),
                    e: numeric(log, v.p2, 'VWE', core),
                }
            }
            sources.push(source)
        }
    }
    return sources
}

/** Interpolate the reference barometer ground temperature at takeoff. */
function baro_gnd_temp_at(log: DataflashLog, t_seconds: number | null) {
    if (t_seconds == null || !('BARO' in log.messageTypes)) return null
    const insts = log.messageTypes.BARO!.instances!
    if (insts == null) return null
    const inst = 0 in insts ? 0 : Number(Object.keys(insts)[0]!)
    let gt
    try {
        gt = numeric(log, 'BARO', 'GndTemp', inst)
    } catch {
        return null
    }
    if (gt == null || gt.length == 0) return null
    const time = TimeUS_to_seconds(numeric(log, 'BARO', 'TimeUS', inst))
    const v = linear_interp(Array.from(gt), time, [t_seconds])[0]!
    return isFinite(v) ? v : null
}

// Carbonix-specific behaviour, sneaked harmlessly into upstream: our GCS sends
// a statustext to the aircraft with the nearest airfield's METAR as "WX:..."
// status text (split into "WX1:", "WX2:", ... when it is long). Parse the air
// temperature out of the METAR "TT/DD" temperature/dewpoint group. The METAR
// source only appears when such a message is present in the log, so it stays
// invisible to every other operator.
const WX_TEMP_RE = /GCS:WX.*[^0-9A-Za-z](M?\d\d)\/M?\d\d/
/** Retain Carbonix GCS weather-message parsing and nearest-time selection. */
function metar_temp_from_msg(log: DataflashLog, t_seconds: number | null) {
    if (!('MSG' in log.messageTypes)) return null
    const msgs = log.get('MSG', 'Message')
    if (!Array.isArray(msgs) || msgs.length == 0 || typeof msgs[0]! !== 'string') return null
    const times = numeric(log, 'MSG', 'TimeUS')
    let best = null,
        bestDiff = Infinity
    for (let i = 0; i < msgs.length; i++) {
        if (msgs[i]! == null) continue
        const m = WX_TEMP_RE.exec(String(msgs[i]!))
        if (m == null) continue
        const g = m[1]!
        const val = g[0]! === 'M' ? -parseInt(g.slice(1), 10) : parseInt(g, 10)
        if (!isFinite(val)) continue
        const tt = times != null && times[i]! != null ? times[i]! * (1 / 1000000) : t_seconds || 0
        const diff = t_seconds != null ? Math.abs(tt - t_seconds) : 0
        if (diff < bestDiff) {
            bestDiff = diff
            best = val
        }
    }
    return best
}

// Preset temperature sources for the ground-temp box, each { label, value } in
// deg C. Open-Meteo is added later by fill_weather_temp() once its network lookup
// returns. Sources with no data are simply omitted.
/** Assemble available temperature presets without changing preference order. */
function build_temp_sources(log: DataflashLog, log_data: Pick<Flight, 'field_elevation' | 'field_time'>) {
    const src: Record<string, TemperatureSource> = {}
    const fe = log_data.field_elevation
    if (fe != null) src.isa = { label: 'ISA', value: isa_temperature_at_alt_c(fe) }
    const gt = baro_gnd_temp_at(log, log_data.field_time)
    if (gt != null) src.baro = { label: 'BARO.GndTemp', value: gt }
    const metar = metar_temp_from_msg(log, log_data.field_time)
    if (metar != null) src.metar = { label: 'METAR', value: metar }
    return src
}

/** Parse a fresh local log and derive sensors, flight bounds and initial presets.
 * No parser or log data is retained globally; the caller owns this flight snapshot. */
export function readFlight(log: DataflashLog): Flight {
    if (!log.messageTypes.ARSP?.instances) throw new Error('No airspeed (ARSP) data in log')
    if (!log.messageTypes.XKF1 && !log.messageTypes.NKF1) throw new Error('No EKF velocity (XKF1/NKF1) data in log')
    if (!log.messageTypes.BARO) throw new Error('No barometer (BARO) data in log, needed for EAS2TAS')
    const PARM = log.get('PARM')
    const names = PARM?.Name
    const values = PARM?.Value
    if (
        !Array.isArray(names) ||
        !names.every((value) => typeof value === 'string') ||
        !(values instanceof Float64Array)
    )
        throw new Error('No parameter data in log')
    const parameterLog = { Name: names as string[], Value: values }
    /** Read the final logged parameter value using the shared legacy-compatible helper. */
    function get_param(name: string) {
        return get_param_value(parameterLog, name) ?? null
    }

    const log_data = {
        sources: get_velocity_sources(log),
        baro: { time: [] as number[], press: [] as number[] },
        pos: { time: [] as number[], rel_alt: [] as number[], alt: [] as number[] },
        att: null as Flight['att'],
        flight_lo: null as number | null,
        flight_hi: null as number | null,
        field_elevation: null as number | null,
        field_time: null as number | null,
        takeoff: null as Flight['takeoff'],
        temp_sources: {} as Flight['temp_sources'],
        start_time: null as number | null,
        end_time: null as number | null,
    }

    if (!log_data.sources.length) throw new Error('Could not read EKF velocity')

    // Static pressure from first barometer
    const baro_inst =
        0 in log.messageTypes.BARO!.instances! ? 0 : Number(Object.keys(log.messageTypes.BARO!.instances!)[0]!)
    log_data.baro = {
        time: TimeUS_to_seconds(numeric(log, 'BARO', 'TimeUS', baro_inst)),
        press: numeric(log, 'BARO', 'Press', baro_inst),
    }

    // Altitude for lapse-rate temperature
    if (!('POS' in log.messageTypes)) {
        throw new Error('No POS data in log, needed for altitude')
    }
    log_data.pos = {
        time: TimeUS_to_seconds(numeric(log, 'POS', 'TimeUS')),
        rel_alt: numeric(log, 'POS', 'RelHomeAlt'),
        alt: numeric(log, 'POS', 'Alt'), // AMSL (geometric) altitude, for the ISA temperature
    }

    // Roll angle for the flight-data plot (loiter indicator)
    log_data.att = null
    if ('ATT' in log.messageTypes) {
        log_data.att = {
            time: TimeUS_to_seconds(numeric(log, 'ATT', 'TimeUS')),
            roll: numeric(log, 'ATT', 'Roll'),
        }
    }

    // Flight span from STAT.isFlying (for auto window)
    log_data.flight_lo = null
    log_data.flight_hi = null
    if ('STAT' in log.messageTypes) {
        const st = numeric(log, 'STAT', 'TimeUS')
        const flying = numeric(log, 'STAT', 'isFlying')
        const stime = TimeUS_to_seconds(st)
        for (let i = 0; i < flying.length; i++) {
            if (flying[i]! == 1) {
                if (log_data.flight_lo == null) log_data.flight_lo = stime[i]!
                log_data.flight_hi = stime[i]!
            }
        }
    }

    // Prefill the manual ground-temperature box with the ISA temperature at the
    // ground altitude. Ground altitude is POS.Alt (AMSL) at the moment the
    // vehicle first starts flying, or the last POS.Alt if it never does.
    // BARO.GndTemp is deliberately not used (IMU-heater self-warming).
    const pos_alt = log_data.pos.alt
    log_data.field_elevation = null
    log_data.field_time = null
    log_data.takeoff = null
    if (pos_alt.length > 0) {
        let ground_alt, field_time
        if (log_data.flight_lo != null) {
            field_time = log_data.flight_lo
            ground_alt = linear_interp(pos_alt, log_data.pos.time, [field_time])[0]!
        } else {
            field_time = log_data.pos.time[log_data.pos.time.length - 1]!
            ground_alt = pos_alt[pos_alt.length - 1]!
        }
        log_data.field_elevation = ground_alt
        log_data.field_time = field_time

        // Takeoff location (POS lat/lng) and UTC time for the weather
        // ground-temperature lookup done later in load(). The time is the log-start
        // UTC from the parser (leap-second correct); it's within the ground roll of
        // takeoff, well inside the hourly resolution the weather lookup needs.
        const pos_lat = optionalNumeric(log, 'POS', 'Lat'),
            pos_lng = optionalNumeric(log, 'POS', 'Lng')
        const utc = log.extractStartTime()
        if (pos_lat != null && pos_lng != null && utc != null) {
            const lat = linear_interp(Array.from(pos_lat), log_data.pos.time, [field_time])[0]! * 1e-7
            const lng = linear_interp(Array.from(pos_lng), log_data.pos.time, [field_time])[0]! * 1e-7
            if (isFinite(lat) && isFinite(lng)) log_data.takeoff = { lat, lng, date: utc }
        }
    }

    // Ground-temperature source presets + dropdown; default to ISA until the
    // Open-Meteo lookup (later in load) fills and selects a weather temperature.
    log_data.temp_sources = build_temp_sources(log, log_data)

    // Airspeed sensors
    const ASP_Data: Sensor[] = []
    log_data.start_time = null
    log_data.end_time = null

    const instance_keys = Object.keys(log.messageTypes.ARSP.instances)
        .map(Number)
        .sort((a, b) => a - b)
    for (const inst of instance_keys) {
        const time = TimeUS_to_seconds(numeric(log, 'ARSP', 'TimeUS', inst))
        if (time == null || time.length == 0) {
            continue
        }
        const suffix = inst == 0 ? '' : (inst + 1).toFixed()
        const ratio_name = 'ARSPD' + suffix + '_RATIO'
        const use_name = 'ARSPD' + suffix + '_USE'

        const data = {
            instance: inst,
            time,
            dpress: numeric(log, 'ARSP', 'DiffPress', inst),
            asp_reported: numeric(log, 'ARSP', 'Airspeed', inst),
            ratio_name,
            current_ratio: get_param(ratio_name),
            use: get_param(use_name),
            use_name,
            devid: get_param('ARSPD' + suffix + '_DEVID'),
            health: optionalNumeric(log, 'ARSP', 'H', inst),
            primary: optionalNumeric(log, 'ARSP', 'Pri', inst),
            start_time: time[0]!,
            end_time: time[time.length - 1]!,
        }

        data.start_time = time[0]!
        data.end_time = time[time.length - 1]!
        log_data.start_time =
            log_data.start_time == null ? data.start_time : Math.min(log_data.start_time, data.start_time)
        log_data.end_time = log_data.end_time == null ? data.end_time : Math.max(log_data.end_time, data.end_time)

        ASP_Data.push(data)
    }

    if (ASP_Data.length == 0) {
        throw new Error('No usable airspeed data in log')
    }

    let start = log_data.start_time!,
        end = log_data.end_time!
    try {
        const sensor = ASP_Data[0]!
        const aw = auto_window(sensor.time, sensor.dpress, log_data.flight_lo ?? start, log_data.flight_hi ?? end)
        start = aw.start
        end = aw.end
    } catch {
        /* The legacy auto-window falls back to the full log span. */
    }
    return {
        ...log_data,
        start_time: log_data.start_time!,
        end_time: log_data.end_time!,
        sensors: ASP_Data,
        window: [Math.floor(start), Math.ceil(end)],
        messages: Object.keys(log.messageTypes),
    }
}
/** Load the standalone DataFlash ESM entry so its adjacent vendor layout survives bundling. */
export async function parseFlight(bytes: ArrayBuffer): Promise<Flight> {
    const url = new URL('dataflash/index.js', new URL(import.meta.env.BASE_URL, location.origin))
    const boundary = (await import(/* @vite-ignore */ url.href)) as {
        loadDataflashParser: () => Promise<DataflashConstructor>
    }
    const Parser = await boundary.loadDataflashParser()
    const log = new Parser()
    log.processData(bytes, [])
    return readFlight(log)
}
/** Preserve the legacy preceding-sample start index (including out-of-range bounds). */
export function find_start_index(time: number[], start_time: number) {
    let start_index = 0
    for (let j = 0; j < time.length; j++) {
        if (time[j]! < start_time) {
            start_index = j
        }
    }
    return start_index
}
/** Preserve the legacy inclusive upper sample lookup and caller-added endpoint. */
export function find_end_index(time: number[], end_time: number) {
    let end_index = 0
    for (let j = 0; j < time.length - 1; j++) {
        if (time[j]! <= end_time) {
            end_index = j + 1
        }
    }
    return end_index
}

/** Align all selected sensors on the first sensor grid, retaining positive-pressure filtering and endpoint quirks. */
export function build_combined(
    sensors: Sensor[],
    source: Velocity,
    ground_temp: number,
    log_data: Flight,
    start: number,
    end: number,
): Combined {
    const ref = sensors[0]!
    const start_index = find_start_index(ref.time, start)
    const end_index = find_end_index(ref.time, end) + 1
    const ct = ref.time.slice(start_index, end_index)

    const vn = linear_interp(source.vn, source.time, ct)
    const ve = linear_interp(source.ve, source.time, ct)
    const vd = linear_interp(source.vd, source.time, ct)
    const static_press = linear_interp(log_data.baro.press, log_data.baro.time, ct)
    const rel_alt = linear_interp(log_data.pos.rel_alt, log_data.pos.time, ct)

    let ekf_n = null,
        ekf_e = null
    if (source.wind != null) {
        ekf_n = linear_interp(source.wind.n, source.wind.time, ct)
        ekf_e = linear_interp(source.wind.e, source.wind.time, ct)
    }

    // per-sensor differential pressure on the common grid
    const dp = sensors.map((s) => linear_interp(s.dpress, s.time, ct))
    const S = sensors.length

    // Only positive differential pressure is required (needed for sqrt and to
    // exclude bad samples); selecting the flight regime is left to the window.
    const t = [],
        gvn = [],
        gve = [],
        gvd = [],
        gwn = [],
        gwe = []
    const u_list = sensors.map(() => [] as number[])
    for (let i = 0; i < ct.length; i++) {
        // Air temperature for EAS2TAS: the ground temperature lapsed over the
        // height above home (never derived from the pressure reading). Density in
        // eas2tas() still uses the real static pressure.
        const temp_c = air_temperature_c(ground_temp, rel_alt[i]!)
        const e2t = eas2tas(static_press[i]!, temp_c)

        let ok = true
        const us = new Array(S)
        for (let s = 0; s < S; s++) {
            us[s]! = Math.sqrt(Math.max(dp[s]![i]!, 0)) * e2t
            if (!(dp[s]![i]! > 0)) ok = false
        }
        if (!ok) continue

        t.push(ct[i]!)
        gvn.push(vn[i]!)
        gve.push(ve[i]!)
        gvd.push(vd[i]!)
        for (let s = 0; s < S; s++) {
            u_list[s]!.push(us[s]!)
        }
        if (ekf_n != null) {
            gwn.push(ekf_n[i]!)
            gwe.push(ekf_e![i]!)
        }
    }

    return {
        t,
        vn: gvn,
        ve: gve,
        vd: gvd,
        u_list,
        wind_n: ekf_n != null ? gwn : null,
        wind_e: ekf_n != null ? gwe : null,
        n_keep: t.length,
    }
}

/** Average the selected samples, falling back to the complete stream for an empty window. */
export function window_mean(values: number[], times: number[], t0: number, t1: number) {
    let s = 0,
        n = 0
    for (let i = 0; i < values.length; i++) {
        if (times[i]! < t0 || times[i]! > t1) continue
        s += values[i]!
        n++
    }
    if (n == 0) {
        for (let i = 0; i < values.length; i++) s += values[i]!
        n = values.length
    }
    return n > 0 ? s / n : NaN
}

/** Fit each selected sensor with constant wind before the shared forward/backward smoother. */
export function analyze(flight: Flight, options: Options): Analysis {
    if (!Number.isFinite(options.temperature)) throw new Error('Enter a ground temperature before calculating')
    const sensors = flight.sensors.filter((sensor) => options.sensors.includes(sensor.instance))
    if (!sensors.length) throw new Error('No airspeed sensor selected')
    const source = flight.sources[options.source]!
    if (!source) throw new Error('No velocity source selected')
    const combined = build_combined(sensors, source, options.temperature, flight, options.start, options.end)
    const seeds =
        combined.n_keep >= 4
            ? sensors.map((_, i) => calibrate(combined.vn, combined.ve, combined.vd, combined.u_list[i]!))
            : []
    const fit = seeds.length
        ? calibrate_combined(combined.t, combined.vn, combined.ve, combined.vd, combined.u_list, seeds, {
              q_wind: options.q,
          })
        : null
    return { sensors, combined, seeds, fit }
}
/** Serialize only finite fitted ratios, rounded to the same three decimals shown in the UI. */
export function parameterOutput(analysis: Analysis): { text: string; warning: string; saved: string } {
    let text = '',
        warning = '',
        saved = 'Saved:\n'
    analysis.sensors.forEach((sensor, i) => {
        const raw = analysis.fit?.per_sensor[i]?.ratio
        if (raw == null || !isFinite(raw)) return
        const ratio = +raw.toFixed(3),
            name = sensor.ratio_name
        if (ratio < 1 || ratio > 3) warning += name + ' = ' + ratio.toFixed(3) + ' outside typical range 1 to 3\n'
        text += name + ',' + param_to_string(ratio) + '\n'
        saved += '\t' + name + ': ' + ratio.toFixed(3) + '\n'
    })
    return { text, warning, saved }
}
/** Compute the live density and EAS2TAS readout independently of fitted samples. */
export function temperatureDiagnostics(flight: Flight, options: Options) {
    const pressure =
        flight.field_time === null ? null : linear_interp(flight.baro.press, flight.baro.time, [flight.field_time])[0]!
    const density = pressure === null ? null : density_altitude_m(eas2tas(pressure, options.temperature))
    const meanPressure = window_mean(flight.baro.press, flight.baro.time, options.start, options.end)
    const temperature = air_temperature_c(
        options.temperature,
        window_mean(flight.pos.rel_alt, flight.pos.time, options.start, options.end),
    )
    return { density, percent: (eas2tas(meanPressure, temperature) - 1) * 100 }
}
