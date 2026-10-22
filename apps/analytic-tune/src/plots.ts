import { array_scale, complex_abs, complex_phase } from '@webtools/numerics'
import type { PlotFields } from '@webtools/react-workflows'
import type { AnalysisResult } from './controller.ts'

export const loops = [
    ['Bare_AC', 'Bare Aircraft'], ['Rate_Ctrlr', 'Rate Controller'], ['Att_Ctrlr', 'Attitude Controller with Feedforward'],
    ['Att_Ctrlr_nff', 'Attitude Controller without feedforward'], ['Pilot_Ctrlr', 'Input Shaping'],
    ['Att_DRB', 'Attitude Disturbance Rejection'], ['Rate_Stab', 'Rate Stability'],
    ['Att_Stab', 'Attitude Stability'], ['Sys_Stab', 'Entire System Stability'],
] as const
export type ControlLoop = typeof loops[number][0]
export interface GraphSettings { loop: ControlLoop; gain: 'Log' | 'Linear'; phase: 'wrap' | 'unwrap'; frequency: 'Log' | 'Linear'; unit: 'Hz' | 'RPS'; useAttitude: boolean }

/** Read graph options using legacy lowercase query matching. */
export function initialGraphSettings(href = ''): GraphSettings {
    const query = new URL(href.toLowerCase(), 'https://local.invalid/').searchParams
    return { loop: loops.find(([value]) => value.toLowerCase() === query.get('control_loop'))?.[0] ?? 'Rate_Ctrlr',
        gain: query.get('pid_scale') === 'linear' ? 'Linear' : 'Log', phase: query.get('pid_phasescale') === 'unwrap' ? 'unwrap' : 'wrap',
        frequency: query.get('pid_feq_scale') === 'linear' ? 'Linear' : 'Log', unit: query.get('pid_feq_unit') === 'rps' ? 'RPS' : 'Hz',
        useAttitude: query.get('useattitude') === 'true' }
}

/** Select the same calculated/predicted pairs and SID eligibility as the original plots. */
export function responsePlots(result: AnalysisResult | null, settings: GraphSettings, sidAxis: number): readonly (readonly PlotFields[])[] {
    if (!result) return [[], [], []]
    const c = result.calculated
    const p = result.predicted
    const pairs = {
        Bare_AC: [c.bareAC_H, c.bareAC_coh, p.ratectrl_H, true, false],
        Rate_Ctrlr: [c.ratectrl_H, c.ratectrl_coh, p.ratectrl_H, !(sidAxis > 9 && sidAxis < 20), true],
        Att_Ctrlr: [c.attctrl_H, c.attctrl_coh, p.attctrl_ff_H, !((sidAxis > 3 && sidAxis < 7) || (sidAxis > 9 && sidAxis < 20)), true],
        Att_Ctrlr_nff: [c.attctrl_H, c.attctrl_coh, p.attctrl_nff_H, !(sidAxis < 4 || (sidAxis > 6 && sidAxis < 20) || sidAxis > 22), true],
        Pilot_Ctrlr: [c.pilotctrl_H, c.pilotctrl_coh, p.pilotctrl_H, sidAxis <= 3, true],
        Att_DRB: [c.DRB_H, c.DRB_coh, p.DRB_H, sidAxis >= 4 && sidAxis <= 6, true],
        Rate_Stab: [c.sysbl_H, c.sysbl_coh, p.ratebl_H, false, true],
        Att_Stab: [c.sysbl_H, c.sysbl_coh, p.attbl_H, false, true],
        Sys_Stab: [c.sysbl_H, c.sysbl_coh, p.sysbl_H, sidAxis >= 10 && sidAxis <= 12, true],
    } as const
    const [calculated, coherence, predicted, showCalculated, showPredicted] = pairs[settings.loop]
    const x = c.freq.map(value => settings.unit === 'RPS' ? value * (Math.PI * 2) : value)
    const responses = [calculated, predicted]
    const visibility = [showCalculated, showPredicted]
    return [0, 1, 2].map(plot => responses.map((response, index) => ({
        name: index === 0 ? 'Calculated' : 'Predicted', meta: index === 0 ? 'Calculated' : 'Predicted', type: 'scatter', mode: 'lines',
        x, visible: visibility[index],
        hovertemplate: `<extra></extra>%{meta}<br>%{x:.2f} ${settings.unit === 'Hz' ? 'Hz' : 'Rad/s'}<br>%{y:.2f}${plot === 1 ? ' deg' : plot === 0 && settings.gain === 'Log' ? ' dB' : ''}`,
        y: plot === 2 ? index === 0 ? coherence : settings.loop === 'Bare_AC' ? undefined : c.bareAC_coh
            // Legacy redraw forces wrapped phase even when unwrap is selected.
            : plot === 1 ? array_scale(complex_phase(response), 180 / Math.PI)
                : settings.gain === 'Log' ? complex_abs(response).map(value => 20 * Math.log10(value)) : complex_abs(response),
    })))
}

/** Construct fresh layouts so shared Plot owns all vendor mutations. */
export function responseLayout(index: number, settings: GraphSettings, range: readonly [number, number] | null): PlotFields {
    return { width: 1200, height: index === 2 ? 250 : 350, margin: { l: 50, r: 50, t: 20, b: 50 }, showlegend: true,
        xaxis: { zeroline: false, showline: true, mirror: true, title: { text: settings.unit === 'Hz' ? 'Frequency (Hz)' : 'Rad/s' }, type: settings.frequency === 'Log' ? 'log' : 'linear', ...(range ? { range: [...range], autorange: false } : {}) },
        yaxis: { zeroline: false, showline: true, mirror: true, title: { text: index === 0 ? settings.gain === 'Log' ? 'Amplitude (dB)' : 'Amplitude' : index === 1 ? 'Phase (deg)' : 'Coherence' } },
        legend: { itemclick: false, itemdoubleclick: false }, uirevision: 'response' }
}
