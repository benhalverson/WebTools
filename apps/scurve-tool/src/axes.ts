import type { PlotFields } from '@webtools/react-workflows'
import type { KinematicKey } from './plots.ts'

export type AxisState = Partial<Record<KinematicKey, { xaxis?: PlotFields; yaxis?: PlotFields }>>
const names = ['pos', 'vel', 'accel', 'jerk', 'snap'] as const

/** Preserve independent vertical zoom while linking time and legacy peer resets.
 * An autorange event resets both axes on peers, but only the requested axis on
 * its source plot, matching Plotly_helpers.js including y-only reset behavior.
 */
export function linkedAxes(previous: AxisState, source: KinematicKey, event: PlotFields): AxisState {
    const next = { ...previous }
    let changed = false
    for (const axis of ['xaxis', 'yaxis'] as const) {
        const start = event[`${axis}.range[0]`], end = event[`${axis}.range[1]`]
        if (typeof start === 'number' && typeof end === 'number') {
            for (const name of axis === 'xaxis' ? names : [source]) {
                next[name] = { ...next[name], [axis]: { range: [start, end], autorange: false } }
            }
            changed = true
        }
    }
    if (['xaxis', 'yaxis', 'xaxis2', 'yaxis2'].some(axis => event[`${axis}.autorange`] === true)) {
        for (const name of names) {
            next[name] = { ...next[name] }
            for (const axis of ['xaxis', 'yaxis'] as const) {
                if (name !== source || event[`${axis}.autorange`] === true) next[name]![axis] = { autorange: true }
            }
        }
        changed = true
    }
    return changed ? next : previous
}
