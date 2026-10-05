import { useEffect, useMemo, useRef, useState } from 'react'
import { Plot, type PlotlyApi } from '@webtools/react-workflows'
import { plotLayouts } from './plots.ts'
import type { Calculation } from './model.ts'

const config = { displaylogo: false }
interface Frame { calculation: Calculation; layouts: ReturnType<typeof plotLayouts> }
interface Props { calculation: Calculation; plotly: PlotlyApi; onError: (error: unknown) => void }

/** Create a vendor snapshot, carrying interactive axes forward as the original mutable layouts did.
 * Valid data resets only PWM x; empty data and Reset retain every current view range.
 * Axis objects belong exclusively to Plotly, never to the numerical calculation state.
 */
function frameFor(calculation: Calculation, previous?: Frame): Frame {
    const layouts = plotLayouts(calculation)
    if (previous) {
        for (const key of ['expo', 'error', 'pwm'] as const) {
            layouts[key].yaxis = structuredClone(previous.layouts[key].yaxis)
            if (key !== 'pwm' || !calculation.pwmData.length) layouts[key].xaxis = structuredClone(previous.layouts[key].xaxis)
        }
    }
    return { calculation, layouts }
}

/** Own mutable Plotly layout snapshots separately from React inputs and fitting results.
 * Publish data and layout together after a calculation changes, including queued resets.
 * Stable plot lifetimes preserve original Reset axes behavior; unmount releases resources.
 */
export function ThrustPlots({ calculation, plotly, onError }: Props) {
    const [frame, setFrame] = useState(() => frameFor(calculation))
    const data = useMemo(() => ({
        pwm: frame.calculation.pwmData.map(trace => ({ ...structuredClone(trace) })),
        expo: frame.calculation.expoData.map(trace => ({ ...structuredClone(trace) })),
        error: frame.calculation.errorData.map(trace => ({ ...structuredClone(trace) })),
    }), [frame.calculation])
    const current = useRef(frame)
    useEffect(() => {
        if (current.current.calculation === calculation) return
        const next = frameFor(calculation, current.current)
        current.current = next
        setFrame(next)
    }, [calculation])
    return <>
        <div className="thrust-plot"><Plot deferInitialData id="thrust-pwm-plot" plotly={plotly}
            data={data.pwm} layout={frame.layouts.pwm} config={config} onError={onError} /></div>
        <div className="thrust-plot"><Plot deferInitialData id="thrust-expo-plot" plotly={plotly}
            data={data.expo} layout={frame.layouts.expo} config={config} onError={onError} /></div>
        <div className="thrust-plot"><Plot deferInitialData id="thrust-error-plot" plotly={plotly}
            data={data.error} layout={frame.layouts.error} config={config} onError={onError} /></div>
    </>
}
