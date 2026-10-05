import { decode_devid, DEVICE_TYPE_IMU, DEVICE_TYPE_COMPASS, DEVICE_TYPE_BARO, DEVICE_TYPE_AIRSPEED, get_compass_param_names, get_param_name_vector3 } from '@webtools/parameters'
import { get_ins_param_names, get_baro_param_names, get_airspeed_param_names } from './names.ts'

export type Parameters = Readonly<Record<string, number>>
export interface ReportDevice { title: string; lines: string[]; breaksAfter?: number[] }
export interface ReportSection { id: string; title: string; summary?: string; devices: ReportDevice[] }
export interface SensorOffset { name: string; position: [number, number, number] }
export interface HardwareReport { sections: ReportSection[]; offsets: SensorOffset[]; maxOffset: number; warnings: string[] }

/** Parse every delimited line as legacy does, including whitespace, duplicate keys and NaN. */
export function parseParameterFile(text: string): Parameters {
    const params: Record<string, number> = {}
    for (const line of text.split('\n')) {
        const values = line.split(/[\s,=\t]+/)
        if (values.length >= 2) params[values[0]!] = parseFloat(values[1]!)
    }
    return params
}

/** Preserve missing-vector behavior: undefined differs from both zero and one. */
function configured(params: Parameters, names: readonly string[], defaultValue = 0): boolean {
    return names.some(name => params[name] !== defaultValue)
}

/** Render the same enabled/disabled glyphs as the parameter report. */
function status(label: string, value: unknown): string { return `${label}: ${value ? '✅' : '❌'}` }

/** Decode parameter-only hardware, where DroneCAN node names are unavailable. */
function deviceText(id: number | undefined, type: number): string {
    // Undefined is coerced to zero by the original decoder's bitwise operations.
    const device = decode_devid(id ?? 0, type)
    if (!device) return ''
    return device.bus_type_index === 3
        ? `${device.bus_type} bus: ${device.bus} node id: ${device.address} sensor: ${device.sensor_id}`
        : `${device.name} via ${device.bus_type}`
}

/** Append complete vectors only; NaN remains eligible just as in the legacy plot. */
function addOffset(offsets: SensorOffset[], params: Parameters, name: string, names: readonly string[]): void {
    const x = params[names[0]!], y = params[names[1]!], z = params[names[2]!]
    if (x != null && y != null && z != null) offsets.push({ name, position: [x, y, z] })
}

/** Derive all parameter-file report sections and offsets without DOM or retained state. */
export function buildReport(params: Parameters): HardwareReport {
    const sections: ReportSection[] = []
    const offsets: SensorOffset[] = []
    const imu: ReportSection = { id: 'INS', title: 'Inertial Sensors', devices: [] }
    for (let i = 0; i < 5; i++) {
        const n = get_ins_param_names(i)
        if (!(n.gyro.id in params) && !(n.accel.id in params)) continue
        const gyro = params[n.gyro.id], accel = params[n.accel.id]
        if (gyro === 0 && accel === 0) continue
        const lines = gyro === accel ? [deviceText(gyro, DEVICE_TYPE_IMU)] : [`Gyro: ${deviceText(gyro, DEVICE_TYPE_IMU)}`, `Accel: ${deviceText(accel, DEVICE_TYPE_IMU)}`]
        // Preserve the legacy scale lookup and shared ACC temperature coefficients.
        const tcal = (params[n.tcal.enabled] ?? 0) > 0 && n.tcal.accel.some(names => configured(params, names))
        lines.push(status('Use', params[n.use]), status('Accel calibration', configured(params, n.accel.offset) || configured(params, n.accel.offset, 1)), status('Gyro calibration', configured(params, n.gyro.offset)), status('Accel temperature calibration', tcal), status('Gyro temperature calibration', tcal), status('Position offset', configured(params, n.pos)))
        imu.devices.push({ title: `IMU ${i + 1}`, lines })
        addOffset(offsets, params, `IMU ${i + 1}`, n.pos)
    }
    if (imu.devices.length) sections.push(imu)
    const compass: ReportSection = { id: 'COMPASS', title: 'Compasses', summary: status('Enabled', params.COMPASS_ENABLE), devices: [] }
    const compassInstances = new Map<number, ReportDevice>()
    let start = 0
    for (let i = 0; i < 3; i++) {
        const id = params[`COMPASS_PRIO${i + 1}_ID`]
        if (id == null || id === 0) continue
        for (let j = 1; j <= 3; j++) {
            const n = get_compass_param_names(j)
            if (!(n.id in params) || params[n.id] !== id) continue
            compassInstances.set(i, { title: `Compass ${i + 1}`, lines: [deviceText(id, DEVICE_TYPE_COMPASS), status('Use', params[n.use]), status('External', (params[n.external] ?? 0) > 0), status('Calibrated', configured(params, n.offsets)), status('Iron calibration', configured(params, n.diagonals, 1) || configured(params, n.off_diagonals)), status('Motor calibration', configured(params, n.motor))] })
            start = i + 1
            break
        }
    }
    for (let i = start; i < 7; i++) {
        const id = params[`COMPASS_DEV_ID${i === 0 ? '' : i + 1}`]
        if (id != null && id !== 0) compassInstances.set(i, { title: `Compass ${i + 1}`, lines: [deviceText(id, DEVICE_TYPE_COMPASS)] })
    }
    compass.devices = [...compassInstances.entries()].sort(([a], [b]) => a - b).map(([, device]) => device)
    if (compass.devices.length) sections.push(compass)
    const baro: ReportSection = { id: 'BARO', title: 'Barometers', summary: `Primary: ${(params.BARO_PRIMARY ?? NaN) + 1}`, devices: [] }
    for (let i = 0; i < 3; i++) {
        const n = get_baro_param_names(i), id = params[n.id]
        if (id != null && id !== 0) baro.devices.push({ title: `Barometer ${i + 1}`, lines: [deviceText(id, DEVICE_TYPE_BARO), status('Wind compensation', (params[n.wind_comp.enabled] ?? 0) > 0 && configured(params, n.wind_comp.coefficients))] })
    }
    if (baro.devices.length) sections.push(baro)
    const airspeed: ReportSection = { id: 'ARSPD', title: 'Airspeed Sensors', summary: `Primary: ${(params.ARSPD_PRIMARY ?? NaN) + 1}`, devices: [] }
    for (let i = 0; i < 6; i++) {
        const n = get_airspeed_param_names(i), id = params[n.id]
        if (id != null && id !== 0) airspeed.devices.push({ title: `Airspeed ${i + 1}`, lines: [deviceText(id, DEVICE_TYPE_AIRSPEED), status('Use', params[n.use])] })
    }
    if (airspeed.devices.length) sections.push(airspeed)
    // Parameter files lack GPS device messages: legacy hides the GPS content section.
    for (let i = 1; i <= 2; i++) {
        const legacy = `GPS_TYPE${i === 1 ? '' : i}` in params
        const type = params[legacy ? `GPS_TYPE${i === 1 ? '' : i}` : `GPS${i}_TYPE`]
        if (type == null || type === 0) continue
        const pos = get_param_name_vector3(legacy ? `GPS_POS${i}_` : `GPS${i}_POS_`)
        const mb = legacy ? `GPS_MB${i}_` : `GPS${i}_MB_`
        const master: SensorOffset[] = [], relative: SensorOffset[] = []
        addOffset(master, params, `GPS ${i}`, pos)
        if (params[`${mb}TYPE`] === 1) addOffset(relative, params, '', get_param_name_vector3(`${mb}OFS_`))
        const first = master[0], second = relative[0]
        if (first && second) {
            first.name += ' Master'
            offsets.push(first, { name: `GPS ${i} Slave`, position: [first.position[0] - second.position[0], first.position[1] - second.position[1], first.position[2] - second.position[2]] })
        } else offsets.push(...master)
    }
    for (let i = 1; i <= 10; i++) {
        const prefix = `RNGFND${i === 10 ? 'A' : i}_`
        if (`${prefix}TYPE` in params && params[`${prefix}TYPE`] !== 0) addOffset(offsets, params, `Rangefinder ${i}`, get_param_name_vector3(`${prefix}POS_`))
    }
    for (const prefix of ['FLOW', 'VISO']) {
        if (`${prefix}_TYPE` in params && params[`${prefix}_TYPE`] !== 0) addOffset(offsets, params, `${prefix} 1`, get_param_name_vector3(`${prefix}_POS_`))
    }
    // Legacy device rendering supplies its own trailing break; status fields also
    // prepend one. Preserve those distinct blank lines in React's owned markup.
    for (const section of sections) {
        for (const device of section.devices) {
            const idLines = section.id === 'INS' && device.lines[0]?.startsWith('Gyro: ') ? 2 : 1
            device.breaksAfter = device.lines.map((_, index) => index < idLines ? (index === device.lines.length - 1 ? 1 : 2) : index === device.lines.length - 1 ? 0 : 1)
        }
    }
    const warnings = (('ARMING_SKIPCHK' in params && params.ARMING_SKIPCHK !== 0) || params.ARMING_CHECK === 0) ? ['Arming checks disabled'] : []
    return { sections, offsets, maxOffset: offsets.reduce((max, offset) => Math.max(max, ...offset.position.map(Math.abs)), 0), warnings }
}
