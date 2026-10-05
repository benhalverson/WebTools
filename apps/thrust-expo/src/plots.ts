import type { PlotFields } from '@webtools/react-workflows'
import type { Calculation, Parameters } from './model.ts'

/** Reproduce the three spin markers in PWM coordinates with the original labels and styling. */
function spinMarkers(parameters: Parameters): { shapes: PlotFields[]; annotations: PlotFields[] } {
    const range = parameters.MOT_PWM_MAX - parameters.MOT_PWM_MIN
    const markers = [
        { value: parameters.MOT_SPIN_ARM, color: 'orange', label: 'SPIN_ARM' },
        { value: parameters.MOT_SPIN_MIN, color: 'green', label: 'SPIN_MIN' },
        { value: parameters.MOT_SPIN_MAX, color: 'red', label: 'SPIN_MAX' },
    ]
    return {
        shapes: markers.map(marker => ({ type: 'line', x0: parameters.MOT_PWM_MIN + marker.value * range, x1: parameters.MOT_PWM_MIN + marker.value * range, y0: 0, y1: 1, yref: 'paper', line: { color: marker.color, width: 0.75, dash: 'dot' } })),
        annotations: markers.map(marker => ({ x: parameters.MOT_PWM_MIN + marker.value * range, y: 1, yref: 'paper', text: marker.label, showarrow: false, textangle: -90, xshift: -9, yshift: -5 })),
    }
}

/** Build fresh Plotly layouts; the vendor may mutate these objects without affecting React calculation state. */
export function plotLayouts(result: Calculation): Record<'pwm' | 'expo' | 'error', PlotFields> {
    const shared = { autosize: true, showlegend: true, legend: { itemclick: false, itemdoubleclick: false }, margin: { b: 50, l: 50, r: 150, t: 20 }, height: 450 }
    const axis = { zeroline: false, showline: true, mirror: true }
    const throttle = { ...axis, title: { text: 'Throttle (%)' }, type: 'linear', range: [0, 100] }
    return {
        pwm: { ...shared, xaxis: { ...axis, title: { text: 'PWM (µs)' }, type: 'linear', range: [...result.pwmRange] }, yaxis: { ...axis, title: { text: 'Thrust' } }, ...(result.pwmData.length ? spinMarkers(result.state.parameters) : { shapes: null, annotations: null }) },
        expo: { ...shared, xaxis: { ...throttle }, yaxis: { ...axis, title: { text: 'Thrust' } }, shapes: [] },
        error: { ...shared, xaxis: { ...throttle }, yaxis: { ...axis, title: { text: 'Thrust gradient (delta thrust / delta throttle)' } }, shapes: [{ type: 'line', x0: 0, x1: 100, y0: result.gradientMean ?? 0, y1: result.gradientMean ?? 0, line: { dash: '4px,3px', width: 1, color: 'gray' }, visible: result.gradientMean !== null }] },
    }
}
