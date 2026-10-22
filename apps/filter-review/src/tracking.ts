import { get_version_and_board, type DataflashLog } from '@webtools/dataflash'
import { array_scale, linear_interp } from '@webtools/numerics'
import type { Notch } from './filters.ts'
import { motorThrust } from './throttle.ts'

export interface Series { time: number[]; value: number[] }
export interface Tracking { sources: Record<number, { average?: Series; instances: Series[] }>; logged: Series[][] }

/** Validate numeric log fields at the parser boundary, preserving Float64 precision. */
export function numbers(log: DataflashLog, message: string, field: string, instance?: string | number): Float64Array {
    const value = instance === undefined ? log.get(message, field) : log.get_instance(message, String(instance), field)
    if (!(value instanceof Float64Array)) throw new Error('Missing numeric log field: ' + message + '.' + field)
    return value
}

/** Read the last parameter, as the legacy tracking models do by default. */
export function parameter(log: DataflashLog, name: string): number | undefined {
    const names = log.get('PARM', 'Name')
    if (!Array.isArray(names) || !names.every(value => typeof value === 'string')) return undefined
    const i = names.lastIndexOf(name)
    return i < 0 ? undefined : numbers(log, 'PARM', 'Value')[i]
}

/** Read a time series, keeping the original microsecond-to-second multiplication. */
function series(log: DataflashLog, message: string, field: string, instance?: string | number): Series {
    return { time: array_scale(numbers(log, message, 'TimeUS', instance), 1 / 1000000), value: Array.from(numbers(log, message, field, instance)) }
}

/** Decode all source families once in the computation Worker. No owned JavaScript
 * is evaluated at runtime; these plain records cross the structured-clone boundary. */
export function readTracking(log: DataflashLog): Tracking {
    const sources: Tracking['sources'] = Object.fromEntries([0, 1, 2, 3, 4, 5].map(mode => [mode, { instances: [] }]))
    const throttle = sources[1]!
    if (log.messageTypes.RATE) throttle.average = series(log, 'RATE', 'AOut')
    else if (log.messageTypes.CTUN && get_version_and_board(log).build_type === 2) throttle.average = series(log, 'CTUN', 'ThO')
    throttle.instances = motorThrust(log)
    for (const [instance, mode] of [[1, 2], [2, 5]] as const) {
        if (!log.messageTypes.RPM) continue
        let data: Series
        if (log.messageTypes.RPM.instances) {
            if (!log.messageTypes.RPM.instances[String(instance - 1)]) continue
            data = series(log, 'RPM', 'RPM', instance - 1)
            const health = numbers(log, 'RPM', 'H', instance - 1)
            for (let i = 0; i < health.length; i++) if (health[i] === 0) data.value[i] = -1
        } else data = series(log, 'RPM', 'rpm' + instance)
        sources[mode]!.average = data
    }
    const esc = sources[3]!
    for (const instance of Object.keys(log.messageTypes.ESC?.instances ?? {})) {
        const data = series(log, 'ESC', 'RPM', instance)
        data.value = array_scale(data.value, 1 / 60)
        esc.instances.push(data)
    }
    if (esc.instances.length) {
        // Legacy writes time_ms but checks time, which always remains null. Do
        // not introduce timeout invalidation while migrating this algorithm.
        const current = esc.instances.map(() => ({ value: null as number | null, seen: false }))
        const all = esc.instances.flatMap((data, instance) => data.time.map((time, i) => ({ time, value: data.value[i]!, instance }))).sort((a, b) => a.time - b.time)
        const average: Series = { time: [], value: [] }
        for (const sample of all) {
            current[sample.instance] = { value: sample.value, seen: true }
            let count = 0, expected = 0, sum = 0
            for (const item of current) { if (item.value !== null) { count++; sum += item.value } if (item.seen) expected++ }
            if (count > 0 && count === expected) {
                average.time.push(sample.time); average.value.push(sum / count)
                for (const item of current) item.value = null
            }
        }
        esc.average = average
    }
    const fft = sources[4]!
    if (log.messageTypes.FTN1) fft.average = series(log, 'FTN1', 'PkAvg')
    for (const instance of Object.keys(log.messageTypes.FTN2?.instances ?? {})) {
        const data = series(log, 'FTN2', 'PkX', instance)
        const y = numbers(log, 'FTN2', 'PkY', instance), ex = numbers(log, 'FTN2', 'EnX', instance), ey = numbers(log, 'FTN2', 'EnY', instance)
        data.value = data.value.map((x, i) => ex[i]! > 0 && ey[i]! > 0 ? (x * ex[i]! + y[i]! * ey[i]!) / (ex[i]! + ey[i]!) : (x + y[i]!) * 0.5)
        fft.instances[Number.parseFloat(instance)] = data
    }
    const logged = [0, 1].map(instance => {
        if (log.messageTypes.FTNS?.instances?.[String(instance)]) return [series(log, 'FTNS', 'NF', instance)]
        if (!log.messageTypes.FTN?.instances?.[String(instance)]) return []
        let count = 0
        for (const n of numbers(log, 'FTN', 'NDn', instance)) count = Math.max(count, n)
        return Array.from({ length: count }, (_value, i) => log.messageTypes.FTN!.expressions.includes('NF' + (i + 1)) ? series(log, 'FTN', 'NF' + (i + 1), instance) : { time: [], value: [] })
    })
    return { sources, logged }
}

/** Match version-specific target conversion, including ref=0's signed constant. */
export function target(config: Notch, version: number, value: number): number {
    if (config.mode === 0) return version >= 2 ? Math.abs(config.freq) : config.freq
    if (config.ref === 0) return config.freq
    if (config.mode === 1) {
        const normalized = Math.sqrt(Math.max(0, value) / config.ref)
        return version >= 2 ? Math.abs(config.freq * normalized) : config.freq * Math.max(config.min_ratio, normalized)
    }
    if (config.mode === 2 || config.mode === 5) {
        const frequency = value * config.ref * (1.0 / 60.0)
        return version >= 2 ? value > 0 ? Math.abs(frequency) : 0 : value > 0 ? Math.max(config.freq, frequency) : config.freq
    }
    return version >= 2 ? Math.abs(value) : Math.max(value, config.freq)
}

/** Interpolate source values before nonlinear target conversion. FFT requires
 * individual peak records even for its center-peak path, as the original did. */
export function targets(tracking: Tracking, config: Notch, version: number, time: number[]): number[][] {
    if (config.mode === 0) return time.map(() => [target(config, version, 0)])
    const source = tracking.sources[config.mode]
    if (!source) return time.map(() => [])
    const dynamic = (config.options & 2) !== 0 && [1, 3, 4].includes(config.mode)
    if (config.mode === 1 && dynamic && (version < 2 || !source.average)) return time.map(() => [])
    if (config.mode === 4 && !source.instances.length) return time.map(() => [])
    const data = dynamic ? source.instances : source.average ? [source.average] : []
    const interpolated = data.map(value => linear_interp(value.value, value.time, time))
    return time.map((_value, i) => interpolated.map(values => target(config, version, values[i]!)))
}
