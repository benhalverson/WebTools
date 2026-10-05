import type { PlotFields } from '@webtools/react-workflows'
import { fft_amplitude_scale, fft_frequency_scale } from '@webtools/numerics'
import { keys, labels, type Controller, type LogData, type Key } from './model.ts'
import { spectrum, spectrogram, type Step, type Analysis } from './analysis.ts'
export const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf']
export interface Chart { data: PlotFields[]; layout: PlotFields }
export type PlotName = 'FlightData' | 'TimeInputs' | 'TimeOutputs' | 'FFTPlot' | 'step_plot' | 'Spectrogram'
export type Charts = Record<PlotName, Chart>
export interface View { start: number; end: number; amplitude: 'linear' | 'db' | 'psd'; rpm: boolean; logFrequency: boolean; channels: readonly Key[]; component: Key; sets: readonly boolean[] }

/** Allocate an owned Plotly layout so the vendor cannot mutate React state. */
function layout(x: string, y: string): PlotFields {
    return { width: 1200, height: 450, margin: { b: 50, l: 50, r: 50, t: 20 }, legend: { itemclick: false, itemdoubleclick: false },
        xaxis: { title: { text: x }, zeroline: false, showline: true, mirror: true }, yaxis: { title: { text: y }, zeroline: false, showline: true, mirror: true } }
}
/** Build a line with stable legacy hover labels and fresh sample arrays. */
function line(name: string, x: readonly number[] = [], y: readonly number[] = []): PlotFields {
    return { mode: 'lines', name, meta: name, x: [...x], y: [...y], hovertemplate: '<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f}' }
}
/** Return all six plot snapshots from model and explicit control state; never read the DOM. */
export function charts(log: LogData | null, controller: Controller | undefined, analysis: Analysis | undefined, view: View, steps: readonly Step[]): Charts {
    const frequency = fft_frequency_scale(view.rpm, view.logFrequency), amplitude = fft_amplitude_scale(view.amplitude === 'db', view.amplitude === 'psd')
    const result: Charts = {
        FlightData: { data: [], layout: layout('Time (s)', 'Roll') }, TimeInputs: { data: [], layout: layout('Time (s)', controller?.units ?? 'deg / s') },
        TimeOutputs: { data: [], layout: layout('Time (s)', '') }, FFTPlot: { data: [], layout: layout(frequency.label, amplitude.label) },
        step_plot: { data: [], layout: layout('Time (s)', 'Response') }, Spectrogram: { data: [], layout: layout('Time (s)', frequency.label) },
    }
    const overview = ['Roll', 'Pitch', 'Throttle', 'Altitude'], positions = [0, 0.06, 0.94, 1]
    overview.forEach((name, i) => {
        result.FlightData.data.push({ ...line(name, log?.flight[i]?.x, log?.flight[i]?.y), yaxis: i ? `y${i + 1}` : 'y' })
        result.FlightData.layout[i ? `yaxis${i + 1}` : 'yaxis'] = { title: { text: name }, side: i < 2 ? 'left' : 'right', position: positions[i], color: colors[i], zeroline: false, showline: true, mirror: true, ...(i ? { overlaying: 'y' } : {}) }
    })
    result.FlightData.layout.showlegend = false
    result.FlightData.layout.xaxis = { title: { text: 'Time (s)' }, domain: [0.07, 0.93], type: 'linear', rangeslider: {} }
    if (!controller || !log) return result
    const shapes = controller.params.length > 1 ? controller.params.map((set, i) => ({ type: 'rect', line: { width: 0 }, yref: 'paper', y0: 0, y1: 1, fillcolor: colors[i % colors.length], opacity: 0.4, label: { text: i + 1, textposition: 'top left' }, layer: 'below', x0: Math.max(log.start, set.start_time), x1: Math.min(log.end, set.end_time) })) : []
    for (const [index, key] of keys.entries()) {
        let x: number[] = [], y: number[] = []
        for (const set of controller.sets) (set ?? []).forEach((batch, i) => { if (i > 0) { x.push(NaN); y.push(NaN) } x = x.concat(batch.time); if (batch[key]) y = y.concat(batch[key]) })
        result[index < 3 ? 'TimeInputs' : 'TimeOutputs'].data.push(line(labels[index]!, x, y))
    }
    for (const name of ['TimeInputs', 'TimeOutputs', 'Spectrogram'] as const) {
        result[name].layout.xaxis = { title: { text: 'Time (s)' }, range: [view.start, view.end], autorange: false }
        if (name !== 'Spectrogram') result[name].layout.shapes = structuredClone(shapes)
    }
    if (!analysis) {
        controller.params.forEach((_, i) => {
            keys.forEach((_, j) => result.FFTPlot.data.push(line(labels[j]!)))
            result.step_plot.data.push(line(''), line(`Test ${i + 1}`))
        })
        return result
    }
    const bins = frequency.fun(analysis.bins)
    controller.params.forEach((_, i) => {
        const set = analysis.sets[i]
        keys.forEach((key, j) => result.FFTPlot.data.push({ ...line(labels[j]!, set?.channels[key].length ? bins : [], set ? spectrum(analysis, set, key, view.start, view.end, view.amplitude) : []),
            visible: view.sets[i] && view.channels.includes(key), meta: (controller.params.length > 1 ? `${i + 1} ` : '') + labels[j],
            hovertemplate: '<extra></extra>%{meta}<br>' + frequency.hover('x') + '<br>' + amplitude.hover('y'),
            ...(controller.params.length > 1 ? { legendgroup: i, legendgrouptitle: { text: `Test ${i + 1}` } } : {}) }))
    })
    result.FFTPlot.layout.xaxis = { title: { text: frequency.label }, type: frequency.type }
    const visibleCount = view.sets.filter(Boolean).length
    steps.forEach((step, i) => {
        result.step_plot.data.push({ ...line('', step.all.x, step.all.y), line: { color: 'rgba(100, 100, 100, 0.2)' }, hoverinfo: 'none', showlegend: false, visible: view.sets[i] && visibleCount === 1 })
        result.step_plot.data.push({ ...line(`Test ${i + 1}`, step.mean.x, step.mean.y), line: { width: 4, color: colors[i % colors.length] }, showlegend: controller.params.length > 1, visible: view.sets[i] })
    })
    result.step_plot.layout.yaxis = { title: { text: 'Response' }, range: [0, 2], autorange: false }
    result.step_plot.layout.shapes = [{ type: 'line', line: { dash: 'dot' }, xref: 'paper', x0: 0, x1: 1, y0: 1, y1: 1 }]
    const heat = spectrogram(analysis, view.component, view.amplitude)
    result.Spectrogram.data = [{ type: 'heatmap', x: heat.x, y: bins, z: heat.z, transpose: true, zsmooth: 'best',
        colorbar: { title: { side: 'right', text: amplitude.label }, orientation: 'h' }, hovertemplate: '<extra></extra>%{x:.2f} s<br>' + frequency.hover('y') + '<br>' + amplitude.hover('z') }]
    result.Spectrogram.layout.yaxis = { title: { text: frequency.label }, type: frequency.type }
    return result
}
