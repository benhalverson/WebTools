import { get_version_and_board, type DataflashLog, type Message } from '@webtools/dataflash'
import { array_scale } from '@webtools/numerics'

export const keys = ['Tar', 'Act', 'Err', 'P', 'I', 'D', 'FF', 'DFF', 'Out'] as const
export type Key = typeof keys[number]
export const labels = ['Target', 'Actual', 'Error', 'P', 'I', 'D', 'FF', 'D FF', 'Output'] as const
export const parameters = [
    ['KP', 'P', 'KP', 4], ['KI', 'I', 'KI', 4], ['KD', 'D', 'KD', 4], ['FF', 'FF', 'KFF', 4],
    ['D_FF', 'D_FF', 'KDFF', 4], ['I_max', 'IMAX', 'I Max', 4], ['Target_filter', 'FLTT', 'Target Filter (Hz)', 4],
    ['Notch_target', 'NTF', 'Target Notch Index', 0], ['Error_filter', 'FLTE', 'Error Filter (Hz)', 4],
    ['Notch_error', 'NEF', 'Error Notch Index', 0], ['D_filter', 'FLTD', 'D Filter (Hz)', 4], ['Slew_max', 'SMAX', 'Slew Max', 4],
] as const
export type ParameterKey = typeof parameters[number][0]
export type ParameterSet = Record<ParameterKey, number | null> & { start_time: number; end_time: number }
export type Batch = Partial<Record<Key, number[]>> & { time: number[]; sample_rate: number; Tar: number[]; Act: number[]; Out: number[] }
export interface Controller {
    id: string; prefix: string; scale: number; units: string; params: ParameterSet[]; sets: (Batch[] | undefined)[]
    start: number; end: number
}
export interface LogData { controllers: Controller[]; start: number; end: number; messages: string[]; flight: { x: number[]; y: number[] }[] }
export interface Boundary { param_set: number; sample_rate: number; batch_start: number; batch_end: number }

/** Narrow numeric Dataflash columns without reinterpreting strings or vector fields. */
export function numbers(message: Message | undefined, name: string): Float64Array {
    const value = message?.[name]
    if (!(value instanceof Float64Array)) throw new TypeError(`Missing numeric field ${name}`)
    return value
}

/** Preserve the parameter snapshot/coalescing rule, including gaps between nearby updates. */
export function segmentParameters(parm: Message, prefix: string): ParameterSet[] {
    const names = parm.Name
    if (!Array.isArray(names) || names.some(value => typeof value !== 'string')) throw new TypeError('Missing parameter names')
    const times = numbers(parm, 'TimeUS'), values = numbers(parm, 'Value')
    const current = Object.fromEntries(parameters.map(([key]) => [key, null])) as Record<ParameterKey, number | null>
    const result: ParameterSet[] = []
    let start = 0, lastEnd: number | undefined, found = false
    for (let i = 0; i < names.length; i++) {
        for (const [key, suffix] of parameters) {
            if (names[i] !== prefix + suffix) continue
            const value = values[i]!, time = times[i]! * (1 / 1000000)
            found = true
            if (current[key] != null && current[key] !== value) {
                if (lastEnd === undefined || time - lastEnd > 1) {
                    lastEnd = time
                    result.push({ ...current, start_time: start, end_time: lastEnd })
                    start = time
                } else { current[key] = value; start = time }
            }
            current[key] = value
            break
        }
    }
    if (found) result.push({ ...current, start_time: start, end_time: Infinity })
    return result
}

/** Preserve legacy count/rate arithmetic and exclusive slice endpoints at gaps and parameter changes. */
export function splitBatches(params: readonly ParameterSet[], time: readonly number[]): Boundary[] {
    const result: Boundary[] = []
    let batchStart = 0, count = 0, paramSet = 0
    let start = params[0]!.start_time, end = params[0]!.end_time
    for (let j = 1; j < time.length; j++) {
        if (time[j]! < start) continue
        count++
        const past = time[j]! > end
        if ((time[j]! - time[j - 1]!) * count > (time[j]! - time[batchStart]!) * 5 || j === time.length - 1 || past) {
            if (count >= 64) result.push({ param_set: paramSet, sample_rate: 1 / ((time[j - 1]! - time[batchStart]!) / count), batch_start: batchStart, batch_end: j - 1 })
            if (past) { paramSet++; start = params[paramSet]!.start_time; end = params[paramSet]!.end_time }
            batchStart = j; count = 0
        }
    }
    return result
}

/** Return supported controller order, scales and parameter namespaces for one vehicle. */
export function controllerDefinitions(build: number | undefined): Controller[] {
    const rad = 180 / Math.PI
    const definitions: [string, string, number, string][] = []
    /** Append roll, pitch and yaw controllers in legacy discovery order. */
    const axes = (ids: string[], prefixes: string[], scale: number) => ids.forEach((id, i) => definitions.push([id, prefixes[i]!, scale, 'deg /s']))
    if (build === 1) definitions.push(['PIDS', 'ATC_STR_RAT_', rad, 'deg /s'], ['PIDA', 'ATC_SPEED_', 1, 'm / s'])
    else if (build === 2) {
        axes(['PIDR', 'PIDP', 'PIDY'], ['ATC_RAT_RLL_', 'ATC_RAT_PIT_', 'ATC_RAT_YAW_'], rad)
        axes(['RATE_R', 'RATE_P', 'RATE_Y'], ['ATC_RAT_RLL_', 'ATC_RAT_PIT_', 'ATC_RAT_YAW_'], rad)
    } else if (build === 3) {
        axes(['PIDR', 'PIDP', 'PIDY'], ['RLL_RATE_', 'PTCH_RATE_', 'YAW_RATE_'], 1)
        axes(['PIQR', 'PIQP', 'PIQY'], ['Q_A_RAT_RLL_', 'Q_A_RAT_PIT_', 'Q_A_RAT_YAW_'], rad)
        axes(['RATE_R', 'RATE_P', 'RATE_Y'], ['Q_A_RAT_RLL_', 'Q_A_RAT_PIT_', 'Q_A_RAT_YAW_'], rad)
    } else throw new Error('Vehicle Type not supported')
    return definitions.map(([id, prefix, scale, units]) => ({ id, prefix, scale, units, params: [], sets: [], start: NaN, end: NaN }))
}

/** Discover local log controllers and copy selected samples, retaining legacy units and reduced RATE data. */
export function discover(log: DataflashLog): LogData {
    const controllers = controllerDefinitions(get_version_and_board(log).build_type)
    const parm = log.get('PARM')
    if (!parm) throw new Error('No PID or RATE log messages found')
    let start: number | undefined, end: number | undefined
    for (const controller of controllers) {
        controller.params = segmentParameters(parm, controller.prefix)
        const [messageId, axis] = controller.id.split('_')
        if (!controller.params.length || !log.messageTypes[messageId!]) continue
        const message = log.get(messageId!)
        const time = array_scale(numbers(message, 'TimeUS'), 1 / 1e6)
        controller.start = time[0]!; controller.end = time[time.length - 1]!
        if (start === undefined || controller.start < start) start = controller.start
        if (end === undefined || controller.end > end) end = controller.end
        for (const boundary of splitBatches(controller.params, time)) {
            const { batch_start: first, batch_end: last, param_set: set, sample_rate } = boundary
            /** Copy this batch's exact legacy exclusive slice with optional unit conversion. */
            const field = (name: string, scale = 1) => array_scale(Array.from(numbers(message, name).slice(first, last)), scale)
            const batch: Batch = { time: time.slice(first, last), sample_rate, Tar: [], Act: [], Out: [] }
            if (axis) { batch.Tar = field(axis + 'Des'); batch.Act = field(axis); batch.Out = field(axis + 'Out') }
            else {
                for (const key of ['Tar', 'Act', 'Err'] as const) batch[key] = field(key, controller.scale)
                for (const key of ['P', 'I', 'D', 'FF'] as const) batch[key] = field(key)
                if (message?.DFF) batch.DFF = field('DFF')
                batch.Out = batch.P!.map((p, i) => p + batch.I![i]! + batch.D![i]! + batch.FF![i]! + (batch.DFF ? batch.DFF[i]! : 0))
            }
            ;(controller.sets[set] ??= []).push(batch)
        }
    }
    if (!controllers.some(controller => controller.sets.length)) throw new Error('No PID or RATE log messages found')
    /** Copy optional overview fields without manufacturing samples for missing messages. */
    const flight = (id: string, field: string) => log.messageTypes[id] ? { x: array_scale(numbers(log.get(id), 'TimeUS'), 1 / 1e6), y: Array.from(numbers(log.get(id), field)) } : { x: [], y: [] }
    return { controllers, start: start!, end: end!, messages: Object.keys(log.messageTypes), flight: [flight('ATT', 'Roll'), flight('ATT', 'Pitch'), flight('RATE', 'AOut'), flight('POS', 'RelHomeAlt')] }
}
