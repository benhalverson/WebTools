import { array_from_range, array_offset, array_scale, array_sum } from '@webtools/numerics'
import type { DataflashLog, FieldValues } from '@webtools/dataflash'
import type { Systems } from './tlog.ts'
export interface Series { name: string; time: number[]; size: number | number[]; key: string }
export interface Composition { name: string; bytes: number; count: number }
export interface Dataset { series: Series[]; composition: Composition[]; systems?: Systems; byteLength: number; messages: string[] }
export interface Binned { time: number[] | null; count: number[] | null }
export interface Total { count: number[]; low_bin: number; high_bin: number }
export interface Rates { traces: { name: string; time: number[]; count: number[] }[]; total: Binned; composition: { name: string; value: number }[] }
/** Retain the inclusive half-window bin centers and shared helper arithmetic. */
export function binTime(low: number, high: number, width: number): number[] {
    return array_offset(array_scale(array_from_range(low, high, 1), width), width * 0.5)
}
/** Count each timestamp into its floor bin and accumulate the legacy sparse total. */
export function binCount(time: readonly number[], size: number | number[], width: number, total: Total): { time: number[]; count: number[] } {
    const bins = time.map(value => Math.floor(value / width))
    let low = Infinity, high = -Infinity
    for (const bin of bins) { low = Math.min(low, bin); high = Math.max(high, bin) }
    total.low_bin = Math.min(total.low_bin, low); total.high_bin = Math.max(total.high_bin, high)
    const centers = binTime(low, high, width)
    const count: number[] = Array.from({ length: centers.length }, () => 0)
    for (let i = 0; i < bins.length; i++) {
        const bin = bins[i]!, value = Array.isArray(size) ? (size[i] ?? NaN) : size
        count[bin - low] = (count[bin - low] ?? NaN) + value
        if (total.count[bin] == null) total.count[bin] = 0
        total.count[bin] = total.count[bin]! + value
    }
    return { time: centers, count: array_scale(count, 1 / width) }
}
/** Preserve sparse-array slicing and per-bin division used by legacy totals. */
export function totalCount(total: Total, width: number): Binned {
    if (total.count.length === 0) return { time: null, count: null }
    const count = total.count.slice(total.low_bin, total.high_bin + 1)
    for (let i = 0; i < count.length; i++) { if (count[i] == null) count[i] = 0; count[i] = count[i]! / width }
    return { time: binTime(total.low_bin, total.high_bin, width), count }
}
/** Narrow TimeUS at the parser boundary without coercing strings or vectors. */
function seconds(field: FieldValues | undefined): number[] {
    if (!(field instanceof Float64Array)) throw new TypeError('Expected numeric TimeUS field')
    return array_scale(Array.from(field), 1 / 1000000)
}
/** Discover binary statistics and concatenate instance timestamps in upstream order.
 * Composition deliberately retains legacy byte values even with its bits label. */
export function binaryDataset(log: DataflashLog, byteLength: number): Dataset {
    const series: Series[] = [], composition: Composition[] = []
    for (const [name, stat] of Object.entries(log.stats())) {
        if (!stat) continue
        composition.push({ name, bytes: stat.size, count: stat.count ?? NaN })
        const type = log.messageTypes[name]
        if (stat.count === 0 || !type?.expressions.includes('TimeUS')) continue
        const time = type.instances ? Object.keys(type.instances).flatMap(instance => seconds(log.get_instance(name, instance, 'TimeUS'))) : seconds(log.get(name, 'TimeUS'))
        series.push({ name, key: name, time, size: stat.msg_size * 8 })
    }
    return { series, composition, messages: Object.keys(log.messageTypes), byteLength }
}
/** Keep individual system/component message series separate, as in legacy plots. */
export function telemetryDataset(systems: Systems, byteLength: number): Dataset {
    const series: Series[] = []
    for (const [system, components] of Object.entries(systems)) for (const [component, value] of Object.entries(components)) {
        for (const [name, message] of Object.entries(value.msg)) series.push({ name, key: `${system},${component},${name}`, time: message.time, size: message.size })
    }
    return { series, composition: [], systems, byteLength, messages: [] }
}
/** Derive rate/composition snapshots from selected components/messages. Window
 * width changes binning only; plot zoom does not change legacy composition. */
export function rates(dataset: Dataset, width: number, bits: boolean, excluded: ReadonlySet<string>): Rates {
    const total: Total = { count: [], low_bin: Infinity, high_bin: -Infinity }
    const traces: Rates['traces'] = [], composition: Rates['composition'] = []
    for (const series of dataset.series) {
        if (excluded.has(series.key) || excluded.has(series.key.split(',').slice(0, 2).join(','))) continue
        traces.push({ name: series.name, ...binCount(series.time, bits ? series.size : 1, width, total) })
        if (dataset.systems) {
            const [system, component] = series.key.split(',')
            composition.push({ name: `(${system}, ${component}) ${series.name}`, value: bits ? array_sum(Array.isArray(series.size) ? series.size : []) : series.time.length })
        }
    }
    if (!dataset.systems) for (const item of dataset.composition) composition.push({ name: item.name, value: bits ? item.bytes : item.count })
    return { traces, total: totalCount(total, width), composition }
}
