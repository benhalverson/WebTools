import { useMemo, useState } from 'react'
import { Plot, type PlotFields, type PlotlyApi } from '@webtools/react-workflows'
import type { Plots } from './model.ts'
const config = { displaylogo: false }
const ids = ['ang_pos', 'ang_vel', 'ang_accel', 'ang_jerk']

/** Own synchronized time-axis and reset state; shared Plot owns vendor nodes,
 * asynchronous updates and listener disposal. Reset preserves control values.
 */
export function TrajectoryPlots({ plots, plotly, onError }: { plots: Plots; plotly: PlotlyApi; onError: (error: unknown) => void }) {
    const [view, setView] = useState<{ range?: [number, number]; revision: number }>({ revision: 0 })
    const layouts = useMemo(() => plots.map((plot, index) => ({
        ...plot.layout,
        ...(index > 1 ? { shapes: [] } : {}),
        width: 1200, height: 300,
        xaxis: { title: { text: 'Time (s)' }, ...(view.range ? { range: view.range, autorange: false } : { autorange: true }) },
        uirevision: view.revision,
    })), [plots, view])

    /** Synchronize numeric x zooms and legacy resets from any linked plot. */
    function relayout(event: PlotFields): void {
        if (['xaxis', 'yaxis', 'xaxis2', 'yaxis2'].some(axis => event[`${axis}.autorange`] === true)) {
            setView(current => ({ revision: current.revision + 1 }))
            return
        }
        const low = event['xaxis.range[0]']; const high = event['xaxis.range[1]']
        if (typeof low === 'number' && typeof high === 'number') {
            setView(current => current.range?.[0] === low && current.range[1] === high ? current : { ...current, range: [low, high] })
        }
    }
    return <>{plots.map((plot, index) => <Plot key={ids[index]} id={ids[index]!} data={plot.data} layout={layouts[index]!} config={config} plotly={plotly} onRelayout={relayout} onError={onError} />)}</>
}
