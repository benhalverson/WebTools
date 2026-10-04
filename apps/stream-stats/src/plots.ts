import type { PlotFields } from '@webtools/react-workflows'
import type { Rates } from './model.ts'
export type TimeRange = readonly [number, number] | undefined
/** Preserve the original unit labels, including binary composition's byte/bit quirk. */
export function labels(bits: boolean) {
    return bits ? { axis: 'bits per second', hover: '<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} bps', pie: '%{label}<br>%{value:,i} bits<br>%{percent}<extra></extra>' } : { axis: 'messages per second', hover: '<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} messages', pie: '%{label}<br>%{value:,i} messages<br>%{percent}<extra></extra>' }
}
/** Create owned Plotly snapshots; vendor mutations never reach source statistics. */
export function plotData(result: Rates, bits: boolean, binary: boolean) {
    const text = labels(bits)
    return {
        messages: result.traces.map(trace => ({ ...(binary ? { type: 'scattergl' } : {}), mode: 'lines', x: [...trace.time], y: [...trace.count], name: trace.name, meta: trace.name, hovertemplate: text.hover })),
        total: [{ type: 'scattergl', mode: 'lines', name: 'Total', meta: 'Total', x: result.total.time?.slice() ?? null, y: result.total.count?.slice() ?? null, hovertemplate: text.hover }],
        composition: [{ type: 'pie', textposition: 'inside', textinfo: 'label+percent', labels: result.composition.map(item => item.name), values: result.composition.map(item => item.value), hovertemplate: text.pie }],
    }
}
/** Apply the shared time selection to both plots, resetting with autorange. */
export function rateLayout(bits: boolean, range: TimeRange, yRange?: TimeRange): PlotFields {
    return { width: 1200, height: 400, showlegend: false, margin: { b: 50, l: 50, r: 50, t: 20 }, xaxis: { title: { text: 'Time (s)' }, ...(range ? { range: [...range], autorange: false } : { autorange: true }) }, yaxis: { title: { text: labels(bits).axis }, ...(yRange ? { range: [...yRange], autorange: false } : { autorange: true }) } }
}
/** Narrow Plotly's two supported range payload forms; ignore unrelated relayouts. */
export function timeSelection(event: PlotFields): TimeRange | null {
    if (event['xaxis.autorange'] === true) return undefined
    const range = event['xaxis.range']
    const start = Array.isArray(range) ? range[0] : event['xaxis.range[0]']
    const end = Array.isArray(range) ? range[1] : event['xaxis.range[1]']
    return typeof start === 'number' && typeof end === 'number' ? [start, end] : null
}
export interface Axes { x: TimeRange; y: TimeRange }
export interface Selection { total: Axes; messages: Axes }
/** Create independent axis state for each Plotly node. */
export function emptySelection(): Selection { return { total: { x: undefined, y: undefined }, messages: { x: undefined, y: undefined } } }
/** Preserve local XY zoom, link split-key time ranges and reset only peer axes,
 * exactly as the legacy range/reset helpers do for Plotly relayout events. */
export function linkedSelection(previous: Selection, source: keyof Selection, event: PlotFields): Selection {
    const peer = source === 'total' ? 'messages' : 'total'
    const next: Selection = { total: { ...previous.total }, messages: { ...previous.messages } }
    for (const axis of ['x', 'y'] as const) {
        const field = `${axis}axis`
        const range = event[`${field}.range`]
        const low = Array.isArray(range) ? range[0] : event[`${field}.range[0]`]
        const high = Array.isArray(range) ? range[1] : event[`${field}.range[1]`]
        if (typeof low === 'number' && typeof high === 'number') next[source][axis] = [low, high]
        if (event[`${field}.autorange`] === true) next[source][axis] = undefined
    }
    if (typeof event['xaxis.range[0]'] === 'number' && typeof event['xaxis.range[1]'] === 'number') next[peer].x = [event['xaxis.range[0]'], event['xaxis.range[1]']]
    if (['xaxis', 'yaxis', 'xaxis2', 'yaxis2'].some(axis => event[`${axis}.autorange`] === true)) next[peer] = { x: undefined, y: undefined }
    return JSON.stringify(next) === JSON.stringify(previous) ? previous : next
}
