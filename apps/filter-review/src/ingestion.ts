import type { DataflashLog } from '@webtools/dataflash'

export type Source = 'raw' | 'batch'
export interface Samples { sample_time: number; sample_rate: number; x: number[]; y: number[]; z: number[] }
export interface Sensor { instance: number; sensor: number; postFilter: boolean; batches: Samples[] }
export interface Recording { source: Source; sensors: Sensor[]; start: number; end: number; messages: string[]; sources: Source[]; warnings: string[]; initialRange: [number, number]; primary: number }

/** Require a numeric parser field without altering upstream units or precision. */
function numeric(value: unknown, name: string): Float64Array {
    if (!(value instanceof Float64Array)) throw new Error('Missing numeric log field: ' + name)
    return value
}

/** Read a numeric message field, keeping parser failures visible to the caller. */
function field(log: DataflashLog, message: string, name: string): Float64Array {
    return numeric(log.get(message, name), message + '.' + name)
}

/** Read batch int16 vectors from the typed parser boundary. */
function vectors(log: DataflashLog, name: string): number[][] {
    const value = log.get('ISBD', name)
    if (!Array.isArray(value) || !value.every(Array.isArray)) throw new Error('Missing batch vectors: ' + name)
    return value as number[][]
}

/** Decode gyro-only raw/batch data with FilterReview's original sample boundaries.
 * Retains the raw instance-dependent slice endpoint and final-batch discard.
 * These known legacy behaviors are deliberately separate from this migration.
 */
export function ingest(log: DataflashLog, preferred: Source): Recording {
    const names = log.get('PARM', 'Name')
    const values = field(log, 'PARM', 'Value')
    if (!Array.isArray(names) || !names.every(value => typeof value === 'string')) throw new Error('No params in log')
    /** Preserve first parameter value, as get_param_value(..., false) does. */
    const parameter = (name: string, allowChange = false): number => {
        const index = allowChange ? names.lastIndexOf(name) : names.indexOf(name)
        return index < 0 ? 0 : values[index]!
    }
    const sources: Source[] = []
    if (log.messageTypes.ISBH && log.messageTypes.ISBD) sources.push('batch')
    if (log.messageTypes.GYR) sources.push('raw')
    const source = sources.includes(preferred) ? preferred : sources[0]
    if (!source) throw new Error('No batch data or raw IMU found in log')
    const count = ['INS_GYR_ID', 'INS_GYR2_ID', 'INS_GYR3_ID'].filter(name => parameter(name, true) > 0).length
    const warnings: string[] = []
    const sensors: Sensor[] = []
    if (source === 'raw') {
        const options = parameter('INS_RAW_LOG_OPT')
        const prePost = (options & 8) !== 0
        let post = (options & 4) !== 0
        if (post && prePost) { warnings.push('Both post and pre+post logging option selected'); post = false }
        for (const instance of Object.keys(log.messageTypes.GYR?.instances ?? {})) {
            const i = Number.parseFloat(instance)
            const sensor = prePost && i >= count ? i - count : i
            if (sensor >= 3) continue
            /** Read a raw instance without rescaling radians per second. */
            const read = (name: string) => numeric(log.get_instance('GYR', instance, name), 'GYR.' + name)
            const time = read('SampleUS'), x = read('GyrX'), y = read('GyrY'), z = read('GyrZ')
            const batches: Samples[] = []
            let start = 0, samples = 0
            for (let j = 1; j < time.length; j++) {
                samples++
                if ((time[j]! - time[j - 1]!) * samples > (time[j]! - time[start]!) * 5 || j === time.length - 1) {
                    if (samples >= 64) batches.push({
                        sample_time: time[start]! * 0.000001,
                        sample_rate: 1000000 / ((time[j - 1]! - time[start]!) / samples),
                        x: Array.from(x.slice(start, j - i)), y: Array.from(y.slice(start, j - i)), z: Array.from(z.slice(start, j - i)),
                    })
                    start = j; samples = 0
                }
            }
            if (batches.length) sensors.push({ instance: i, sensor, postFilter: prePost && i >= count ? true : post, batches })
        }
    } else {
        const headers = Object.fromEntries(['N', 'type', 'instance', 'smp_cnt', 'mul', 'SampleUS', 'smp_rate'].map(name => [name, field(log, 'ISBH', name)]))
        const n = field(log, 'ISBD', 'N'), seq = field(log, 'ISBD', 'seqno')
        const axes = { x: vectors(log, 'x'), y: vectors(log, 'y'), z: vectors(log, 'z') }
        const batches = new Map<number, Samples[]>()
        let index = 0, maxInstance = 0
        for (let h = 0; h < headers.N!.length; h++) {
            if (headers.type![h] !== 1) continue
            const instance = headers.instance![h]!
            maxInstance = Math.max(maxInstance, instance)
            const sequence = headers.N![h]!
            while (index < n.length && n[index] !== sequence) index++
            if (index >= n.length) break
            const batch = { x: [] as number[], y: [] as number[], z: [] as number[] }
            const length = headers.smp_cnt![h]!
            for (let j = 0; j < length / 32 && index < n.length; j++, index++) {
                if (n[index] !== sequence || seq[index] !== j) throw new Error('Missing or extra data msg')
                for (const axis of ['x', 'y', 'z'] as const) batch[axis].push(...axes[axis][index]!)
            }
            // Legacy discards even a complete final batch if it consumed the last message.
            if (index >= n.length) break
            if (Object.values(batch).some(axis => axis.length !== length)) throw new Error('sample length wrong')
            const multiplier = 1 / headers.mul![h]!
            for (const axis of ['x', 'y', 'z'] as const) batch[axis] = batch[axis].map(value => value * multiplier)
            const data = batches.get(instance) ?? []
            data.push({ sample_time: headers.SampleUS![h]! * 0.000001, sample_rate: headers.smp_rate![h]!, ...batch })
            batches.set(instance, data)
        }
        const options = parameter('INS_LOG_BAT_OPT')
        const post = (options & 2) !== 0, prePost = (options & 4) !== 0
        let offset = prePost || (post && (options & 1) !== 0)
        if (!offset && maxInstance >= count) { offset = true; warnings.push('Got pre-post instances without INS_LOG_BAT_OPT set, assuming pre-post') }
        for (const [instance, data] of [...batches.entries()].sort(([a], [b]) => a - b)) {
            const sensor = offset && instance >= count ? instance - count : instance
            if (sensor < 3) sensors.push({ instance, sensor, postFilter: offset && instance >= count ? true : post && !prePost, batches: data })
        }
    }
    if (!sensors.length) throw new Error('No valid gyro data found in log')
    const start = Math.min(...sensors.map(sensor => sensor.batches[0]!.sample_time))
    const end = Math.max(...sensors.map(sensor => {
        const last = sensor.batches.at(-1)!
        return last.sample_time + (source === 'raw' ? last.x.length / last.sample_rate : 0)
    }))
    const ekfPrimary = parameter('EK3_PRIMARY', true)
    const primary = parameter('AHRS_EKF_TYPE', true) === 3 && ekfPrimary >= 0 && ekfPrimary <= 2 ? ekfPrimary : 0
    return { source, sources, sensors, start, end, primary, messages: Object.keys(log.messageTypes), warnings, initialRange: initialRange(log, start, end) }
}

/** Match legacy throttle auto-selection, including its truthiness check that
 * ignores a first/last positive throttle at index zero and permits reversed ranges. */
export function initialRange(log: DataflashLog, start: number, end: number): [number, number] {
    let first = Math.floor(start), last = Math.ceil(end)
    if (log.messageTypes.RATE) {
        const time = field(log, 'RATE', 'TimeUS'), throttle = field(log, 'RATE', 'AOut')
        const a = throttle.findIndex(value => value > 0), b = throttle.findLastIndex(value => value > 0)
        const from = a ? time[a] : undefined, to = b ? time[b] : undefined
        if (from !== undefined && to !== undefined) {
            first = Math.max(first, Math.ceil(from * 0.000001) + 1)
            last = Math.min(last, Math.floor(to * 0.000001) - 1)
        }
    }
    return [first, last]
}
