import type { PlotFields } from '@webtools/react-workflows'
import { evaluate, gyroFilters, pid, value, type Parameters, type Response } from './model.ts'
export interface PlotSnapshot { data: PlotFields[]; layout: PlotFields }

/** Calculate a complete immutable plot snapshot; live edits do not mutate prior curves.
 * Stable frequency/magnitude revisions retain user zoom, while phase keeps the
 * legacy per-calculation autorange behavior. Reset owns a fresh plot lifetime. */
export function calculate(params: Parameters, axis?: string): PlotSnapshot {
    const prefix = axis ? 'PID_' : ''
    const db = params[prefix + 'Scale'] === 'Log', unwrap = params[prefix + 'PhaseScale'] === 'unwrap'
    const rpm = params[prefix + 'feq_unit'] === 'RPM'
    let components = params[prefix + 'ShowComponents'] === 'true'
    const gyro = gyroFilters(params)
    const controller = axis ? pid(params, axis) : undefined
    const maximum = value(params, axis ? 'SCHED_LOOP_RATE' : 'GyroSampleRate') * 0.5
    const step = axis ? 0.05 : 0.1
    const post = params.filtering === 'Post'
    const groups = controller ? [[controller], ...(post ? [gyro] : [])] : [gyro]
    const total = evaluate(groups, maximum, step, db, unwrap)
    if (!axis) components &&= gyro.filter(part => part.enabled).length > 1
    const responses: (Response | undefined)[] = controller ? [total, post && components ? evaluate([gyro], maximum, step, db, unwrap) : undefined, ...controller.components!] : [total, ...gyro.map(part => part.enabled ? part : undefined)]
    const names = axis ? ['Combined', 'Gyro filters', 'Proportional', 'Integral', 'Derivative'] : ['Combined', 'Notch 1', 'Notch 2', 'Gyro low pass']
    const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd']
    const x = rpm ? total.freq.map(frequency => frequency * 60) : total.freq
    const data = responses.flatMap((part, index) => [0, 1].map(side => ({
        mode: 'lines', line: { color: colors[index] }, name: names[index], meta: names[index],
        ...(side ? { showlegend: false, xaxis: 'x2', yaxis: 'y2' } : {}),
        visible: index === 0 || (!!part && components), x, y: side ? part?.phase : part?.attenuation,
        hovertemplate: '<extra></extra>' + (components ? '%{meta}<br>' : '') + '%{x:.2f} ' + (rpm ? 'RPM' : 'Hz') + '<br>%{y:.2f} ' + (side ? 'deg' : db ? 'dB' : ''),
    })))
    const frequencyAxis = { uirevision: 'frequency', type: params[prefix + 'feq_scale'] === 'Log' ? 'log' : 'linear', zeroline: false, showline: true, mirror: true }
    return { data, layout: {
        width: 1200, height: 900,
        xaxis: { ...frequencyAxis }, xaxis2: { ...frequencyAxis, title: { text: rpm ? 'Frequency (RPM)' : 'Frequency (Hz)' }, matches: 'x' },
        yaxis: { uirevision: 'magnitude', title: { text: (axis ? 'Gain' : 'Magnitude') + (db ? ' (dB)' : '') }, zeroline: false, showline: true, mirror: true, domain: [0.52, 1] },
        yaxis2: { title: { text: 'Phase (deg)' }, zeroline: false, showline: true, mirror: true, domain: [0, 0.48], fixedrange: !unwrap, autorange: unwrap, ...(!unwrap ? { range: [-180, 180] } : {}) },
        showlegend: components, legend: { itemclick: false, itemdoubleclick: false }, margin: { b: 50, l: 50, r: 50, t: 20 }, grid: { rows: 2, columns: 1, pattern: 'independent' },
    } }
}
