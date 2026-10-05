import type { DataflashLog } from '@webtools/dataflash'
import type { PlotFields } from '@webtools/react-workflows'
import { numericField } from './dataset.ts'
import type { IdentificationResult } from './protocol.ts'
import type { Mode } from './model.ts'
const colors = ['#1f77b4','#ff7f0e','#2ca02c','#d62728']
const names = ['Roll','Pitch','Throttle','Altitude']
const units = ['deg','deg','','m']
/** Build independent trace snapshots for the four original flight-data axes. */
export function flightTraces(log: DataflashLog | null): PlotFields[] {
    return names.map((name, i) => {
        const message = ['ATT','ATT','RATE','POS'][i]!, field = ['Roll','Pitch','AOut','RelHomeAlt'][i]!
        return { mode: 'lines', name, meta: name, yaxis: i ? `y${i + 1}` : 'y', hovertemplate: `<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} ${units[i]}`, x: log?.messageTypes[message] ? numericField(log, message, 'TimeUS').map(time => time * (1 / 1000000)) : [], y: log?.messageTypes[message] ? numericField(log, message, field) : [] }
    })
}
/** Preserve the flight plot's axis placement, rangeslider, colors and dimensions. */
export function flightLayout(): PlotFields {
    const layout: PlotFields = { width: 1200, height: 450, xaxis: { title: { text: 'Time (s)' }, domain: [0.07,0.93], type: 'linear', zeroline: false, showline: true, mirror: true, rangeslider: {} }, showlegend: false, margin: { b: 50,l: 50,r: 50,t: 20 } }
    names.forEach((name,i) => { layout[`yaxis${i ? i + 1 : ''}`] = { title: { text: name }, zeroline: false, showline: true, mirror: true, side: i < 2 ? 'left' : 'right', position: [0,0.06,0.94,1][i], color: colors[i], ...(i ? { overlaying: 'y' } : {}) } })
    return layout
}
/** Derive the original analysis range from the first/last samples of displayed streams. */
export function flightRange(traces: PlotFields[]): [string, string] | null {
    const arrays = traces.map(trace => trace.x).filter((value): value is number[] => Array.isArray(value) && value.length > 0)
    if (!arrays.length) return null
    return [String(Math.min(...arrays.map(values => values[0]!))), String(Math.max(...arrays.map(values => values.at(-1)!)))]
}
/** Convert Python response arrays to the original five traces per output. */
export function resultTraces(result: IdentificationResult, mode: Mode): PlotFields[] {
    return result.sourceAmplitude.flatMap((_,i) => [result.sourceAmplitude[i],result.fittedAmplitude[i],result.sourcePhase[i],result.fittedPhase[i],result.coherence[i]].map((values,j) => ({ x: [...result.frequency], y: values ? [...values] : [], type: 'scatter', mode: 'lines', name: mode === 'tf' ? ['source H Amp','fit H Amp','source H Phase','fit H Phase','Coherence of xy'][j] : [`Hs Amp ${i}`,`Hest Amp ${i}`,`Hs Pha ${i}`,`Hest Pha ${i}`,`Coherence ${i}`][j], xaxis: `x${[1,1,2,2,3][j]}`, yaxis: `y${[1,1,2,2,3][j]}` })))
}
/** Match the logarithmic frequency axes and original result legend layout. */
export function resultLayout(mode: Mode): PlotFields {
    return { title: mode === 'tf' ? 'Frequency Response Data' : 'State Space Frequency Response Data', grid: { rows: 3,columns: 1,pattern: 'independent' }, ...Object.fromEntries([1,2,3].flatMap((axis,i) => [[`xaxis${axis}`,{ type: 'log',title: 'Frequency (rad/sec)' }],[`yaxis${axis}`,{ title: (mode === 'tf' ? ['H Amp','H Phase','Coherence'] : ['Amplitude','Phase','Coherence'])[i] }]])), legend: { x: 1,xanchor: 'right',y: 1 } }
}
