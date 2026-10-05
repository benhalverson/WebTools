import type { DataflashLog, Message } from '@webtools/dataflash'
import {
    array_add,
    array_all_equal,
    array_all_NaN,
    array_scale,
    array_sub,
    linear_interp,
} from '@webtools/numerics'
import { get_compass_param_names, read_param_value } from '@webtools/parameters'
import { Quaternion } from './quaternion.ts'
import { expected_earth_field_lat_lon } from './magnetic-model.ts'
import { scale_valid } from './calibration.ts'
import {
    emptyFit,
    emptyQuaternion,
    emptyVector,
    type Attitude,
    type Compass,
    type LogData,
    type MatrixApi,
    type RecordedCalibration,
    type FlightSeries,
} from './types.ts'

/** Read a numeric DataFlash field without changing units or parser precision. */
export function numeric(message: Message | undefined, field: string): number[] {
    const value = message?.[field]
    if (!(value instanceof Float64Array)) throw new Error(`Missing numeric log field ${field}`)
    return Array.from(value)
}
/** Convert logged microseconds to seconds using the legacy multiplication order. */
function seconds(message: Message | undefined): number[] {
    return array_scale(numeric(message, 'TimeUS'), 1 / 1000000)
}
/** Decode one fresh parser into owned arrays, retaining calibration removal order,
 * source selection, magnetic-model units and the historical battery interpolation target.
 */
export function readLog(log: DataflashLog, matrix: MatrixApi): LogData {
    if (!log.messageTypes.MAG?.instances) throw new Error('No compass data in log')
    const parm = log.get('PARM')
    const names = parm?.Name
    if (!Array.isArray(names) || !names.every((name) => typeof name === 'string'))
        throw new Error('Missing parameter names')
    const parameters = { Name: names as string[], Value: numeric(parm, 'Value') }
    const warnings: string[] = []
    /** Retain missing parameters as undefined at runtime, matching legacy arithmetic and comparisons. */
    function parameter(name: string): number {
        const result = read_param_value(parameters, name)
        warnings.push(...result.changes.map((change) => change.message))
        return result.value!
    }
    const motor: FlightSeries[] = []
    const compasses: Compass[] = []
    for (let index = 0; index < 3; index++) {
        if (!(index in log.messageTypes.MAG.instances)) continue
        const message = log.get_instance('MAG', index)
        const names = get_compass_param_names(index + 1)
        const params: RecordedCalibration = {
            offsets: names.offsets.map(parameter),
            diagonals: names.diagonals.map(parameter),
            off_diagonals: names.off_diagonals.map(parameter),
            motor: names.motor.map(parameter),
            scale: parameter(names.scale),
            orientation: parameter(names.orientation),
            id: parameter(names.id),
            use: parameter(names.use),
            external: parameter(names.external),
            fit_type: 0,
        }
        const orig = {
            ...emptyFit(),
            x: numeric(message, 'MagX'),
            y: numeric(message, 'MagY'),
            z: numeric(message, 'MagZ'),
            params,
            valid: true,
        }
        let x = array_sub(orig.x, numeric(message, 'MOX'))
        let y = array_sub(orig.y, numeric(message, 'MOY'))
        let z = array_sub(orig.z, numeric(message, 'MOZ'))
        if (!array_all_equal(params.diagonals, 0)) {
            const inverse = matrix.inverse(
                new matrix.Matrix([
                    [params.diagonals[0]!, params.off_diagonals[0]!, params.off_diagonals[1]!],
                    [params.off_diagonals[0]!, params.diagonals[1]!, params.off_diagonals[2]!],
                    [params.off_diagonals[1]!, params.off_diagonals[2]!, params.diagonals[2]!],
                ]),
            )
            const corrected = [0, 1, 2].map((row) =>
                array_add(
                    array_add(array_scale(x, inverse.get(row, 0)), array_scale(y, inverse.get(row, 1))),
                    array_scale(z, inverse.get(row, 2)),
                ),
            )
            ;[x, y, z] = [corrected[0]!, corrected[1]!, corrected[2]!]
        }
        if (scale_valid(params.scale)) {
            const inverse = 1 / params.scale
            x = array_scale(x, inverse)
            y = array_scale(y, inverse)
            z = array_scale(z, inverse)
        }
        x = array_sub(x, numeric(message, 'OfsX'))
        y = array_sub(y, numeric(message, 'OfsY'))
        z = array_sub(z, numeric(message, 'OfsZ'))
        const rotation = new Quaternion()
        const rotate = params.external != 0 && rotation.from_rotation(params.orientation)
        if (rotate) {
            rotation.invert()
            for (let i = 0; i < x.length; i++) {
                const vector = rotation.rotate([x[i]!, y[i]!, z[i]!])
                x[i] = vector[0]!
                y[i] = vector[1]!
                z[i] = vector[2]!
            }
        }
        compasses.push({
            index,
            names,
            params,
            orig,
            time: seconds(message),
            raw: { x, y, z },
            rotate,
            rotation: params.orientation,
            rotated: emptyVector(),
            fits: [],
            coverage: 0,
            healthy: array_all_equal(numeric(message, 'Health'), 1),
            expected: { ...emptyVector(), bins: [] },
            quaternion: emptyQuaternion(),
        })
    }
    if (!compasses.length) throw new Error('No compass data in log')
    const start = Math.min(...compasses.map((compass) => compass.time[0]!))
    const end = Math.max(...compasses.map((compass) => compass.time.at(-1)!))
    const position =
        log.messageTypes.ORGN?.instances?.['0'] !== undefined
            ? log.get_instance('ORGN', 0)
            : log.messageTypes.POS
              ? log.get('POS')
              : undefined
    const earth =
        position &&
        expected_earth_field_lat_lon(
            numeric(position, 'Lat').at(-1)! * 10 ** -7,
            numeric(position, 'Lng').at(-1)! * 10 ** -7,
        )
    if (!earth) throw new Error('Could not get earth field from log location')
    const attitudes: Attitude[] = []
    let attitude = -1
    const ekf = parameter('AHRS_EKF_TYPE')
    /** Preserve source order and explicit firmware primary selection. */
    function addAttitude(message: Message | undefined, name: string, selected: boolean): void {
        if (selected) attitude = attitudes.length
        attitudes.push({
            name,
            quaternion: {
                ...emptyQuaternion(),
                time: seconds(message),
                q1: numeric(message, 'Q1'),
                q2: numeric(message, 'Q2'),
                q3: numeric(message, 'Q3'),
                q4: numeric(message, 'Q4'),
            },
        })
    }
    if (log.messageTypes.AHR2) addAttitude(log.get('AHR2'), 'DCM', ekf == 0)
    if (log.messageTypes.NKQ?.instances?.['0'] !== undefined)
        addAttitude(log.get_instance('NKQ', 0), 'EKF 2 IMU 1', ekf == 2)
    const primary = parameter('EK3_PRIMARY') ?? 0
    if (log.messageTypes.XKQ?.instances?.[primary] !== undefined)
        addAttitude(log.get_instance('XKQ', primary), `EKF 3 IMU ${primary + 1}`, ekf == 3)
    if (!attitudes.length) throw new Error('Unknown attitude source')
    if (attitudes.length == 1) attitude = 0
    for (const compass of compasses)
        compass.fits.push({
            value: null,
            type: 0,
            name: 'No motor comp',
            offsets: emptyFit(),
            scale: emptyFit(),
            iron: emptyFit(),
        })
    if (log.messageTypes.BAT?.instances?.['0'] !== undefined) {
        const battery = log.get_instance('BAT', 0)
        const value = numeric(battery, 'Curr')
        if (!array_all_NaN(value) && !array_all_equal(value, 0)) {
            motor.push({ name: 'Battery 1 current', unit: 'A', time: seconds(battery), value })
            // Legacy deliberately uses MAG 0 timestamps for every compass. A separate bug fix must change this.
            const target = compasses.find((compass) => compass.index === 0)
            if (!target) throw new Error('Battery compensation requires MAG 0 timestamps')
            for (const compass of compasses)
                compass.fits.push({
                    value: linear_interp(value, seconds(battery), target.time).map((value) => value!),
                    type: 2,
                    name: 'Battery 1 current',
                    offsets: emptyFit(),
                    scale: emptyFit(),
                    iron: emptyFit(),
                })
        }
    }
    const flight = [
        ['ATT', 'Roll', 'Roll', 'deg'],
        ['ATT', 'Pitch', 'Pitch', 'deg'],
        ['RATE', 'AOut', 'Throttle', ''],
        ['POS', 'RelHomeAlt', 'Altitude', 'm'],
    ].map(([type, field, name, unit]) => {
        const message = log.messageTypes[type!] ? log.get(type!) : undefined
        return {
            name: name!,
            unit: unit!,
            time: message ? seconds(message) : [],
            value: message ? numeric(message, field!) : [],
        }
    })
    return {
        compasses,
        attitudes,
        attitude,
        earth,
        start,
        end,
        messages: Object.keys(log.messageTypes),
        flight,
        motor,
        warnings,
    }
}
