import { useEffect, useMemo, useState } from 'react'
import type { PlotlyApi } from '@webtools/react-workflows'
import { Controls } from './controls.tsx'
import { TrajectoryPlots } from './plots.tsx'
import { createMainSimulator } from './main-model.ts'
import { createPlaneSimulator } from './plane-model.ts'
import { mainDefaults, planeDefaults, type Axis, type Mode, type Values, type Plots } from './model.ts'
import { initialize } from './wasm.ts'
import './style.css'
type Simulator = (values: Values, axis: Axis, mode: Mode) => Plots
interface Ready { simulate: Simulator; metadata: unknown }

/** Format boundary failures without assuming vendor exceptions are Error objects. */
function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }

/** Own controls and one cancellable initialization lifetime. Unmount aborts fetches
 * and suppresses late WASM/metadata results; shared Plot owns asynchronous rendering.
 */
export default function App({ plane, base, plotly }: { plane: boolean; base: string; plotly: PlotlyApi | undefined }) {
    const [axis, setAxis] = useState<Axis>('R')
    const [mode, setMode] = useState<Mode>('angle')
    const [values, setValues] = useState<Values>(plane ? planeDefaults : mainDefaults)
    const [ready, setReady] = useState<Ready | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [attempt, setAttempt] = useState(0)
    useEffect(() => {
        const controller = new AbortController()
        setReady(null); setError(null)
        /** Fetch the original metadata and bind the correct controller for this page. */
        async function load(): Promise<void> {
            try {
                const [modules, response] = await Promise.all([
                    initialize(base, plane, controller.signal),
                    fetch(`${base}${plane ? 'plane/' : ''}params.json`, { signal: controller.signal }),
                ])
                if (!response.ok) throw new Error(`Unable to load parameters: HTTP ${response.status}`)
                const metadata: unknown = await response.json()
                const simulate = plane ? createPlaneSimulator(modules.control) : modules.ruckig ? createMainSimulator(modules.control, modules.ruckig) : undefined
                if (!simulate) throw new Error('Ruckig initialization did not complete')
                if (!controller.signal.aborted) setReady({ simulate, metadata })
            } catch (cause) { if (!controller.signal.aborted) setError(message(cause)) }
        }
        void load()
        return () => controller.abort()
    }, [base, plane, attempt])
    const result = useMemo(() => {
        if (!ready) return { plots: null, error: null }
        try { return { plots: ready.simulate(values, axis, mode), error: null } }
        catch (cause) { return { plots: null, error: message(cause) } }
    }, [ready, values, axis, mode])
    /** Preserve raw input strings, including incomplete edits, across axis changes. */
    function changeValue(key: string, value: string): void { setValues(current => ({ ...current, [key]: value })) }
    /** Report vendor errors in the owned page instead of installing global handlers. */
    function plotError(cause: unknown): void { setError(message(cause)) }
    return <>
        <table className="brand"><tbody><tr><td><a href="https://ardupilot.org"><img src={`${base}images/ArduPilot.png`} /></a></td><td>
            <a href="https://github.com/ArduPilot/WebTools"><img src={`${base}images/github-mark.png`} style={{ width: 60 }} /></a><br />
            <a href="https://github.com/ArduPilot/WebTools"><img src={`${base}images/GitHub_Logo.png`} style={{ width: 60 }} /></a>
        </td></tr></tbody></table>
        <h1><a href="">ArduPilot Kinematic Tool</a></h1>
        <table><tbody><tr><td style={{ width: 1200 }}><h2 style={{ textAlign: 'center' }}>Attitude Control Input Shaping{plane ? ' - ArduPlane' : ''}</h2></td></tr></tbody></table>
        <p className="description">The attitude controller limits its demands based on a kinematic model of the vehicle. This model is defined by a velocity limit, a acceleration limit and a time constant. This is visualized for a single axis.{!plane && ' This is only valid if input shaping is enabled with ATC_RATE_FF_ENAB.'}</p>
        <Controls plane={plane} base={base} axis={axis} mode={mode} values={values} metadata={ready?.metadata ?? {}} onAxis={setAxis} onMode={setMode} onValue={changeValue} />
        {!ready && !error && <p role="status">Loading controllers…</p>}
        {!plotly && <p role="alert">Unable to load the plot library. Please reload this page.</p>}
        {(error || result.error) && <p role="alert">Unable to calculate or render trajectory: {error || result.error} <button onClick={() => setAttempt(current => current + 1)}>Retry</button></p>}
        {plotly && result.plots && <TrajectoryPlots key={attempt} plots={result.plots} plotly={plotly} onError={plotError} />}
        <p><a href={plane ? base : `${base}plane/`}>{plane ? 'Main Kinematic Tool' : 'ArduPlane Kinematic Tool'}</a></p>
    </>
}
