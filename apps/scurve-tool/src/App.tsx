import { useEffect, useMemo, useRef, useState } from 'react'
import { downloadFile, FileInput, ParameterControl, Plot, type PlotFields, type PlotlyApi } from '@webtools/react-workflows'
import { find_parameter_metadata } from '@webtools/parameters'
import { calculateTrajectory, type TrajectoryResult } from './trajectory.ts'
import { initializeNavigation } from './wasm.ts'
import { createPlots, type KinematicKey } from './plots.ts'
import { linkedAxes, type AxisState } from './axes.ts'
import { exportParameters, groups, importParameters, initialSettings, waypointNames } from './settings.ts'
import './style.css'

interface AppProps { plotly: PlotlyApi | undefined; assetBase: string }
const config = { displaylogo: false }
const axes = ['x', 'y', 'z'] as const
const labels = ['North (m)', 'East (m)', 'Up (m)'] as const
const plotNames = ['pos', 'vel', 'accel', 'jerk', 'snap'] as const

/** Normalize failures from file APIs, WASM and vendor promises for the status area. */
function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }

/** Own editable settings and cancellable navigation work; shared Plot owns vendor DOM.
 * Every settings snapshot cancels its predecessor and unmount aborts work and file reads.
 */
export default function App({ plotly, assetBase }: AppProps) {
    const [settings, setSettings] = useState(initialSettings)
    const [metadata, setMetadata] = useState<unknown>({})
    const [result, setResult] = useState<{ trajectory: TrajectoryResult; radius: number } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(true)
    const [revision, setRevision] = useState(0)
    const [showRadius, setShowRadius] = useState(false)
    const [color, setColor] = useState<'velocity' | 'acceleration' | 'jerk' | null>('velocity')
    const [axisState, setAxisState] = useState<AxisState>({})
    const fileGeneration = useRef(0)
    useEffect(() => {
        const controller = new AbortController()
        void fetch(`${assetBase}params.json`, { signal: controller.signal }).then(response => {
            if (!response.ok) throw new Error(`Parameter metadata: HTTP ${response.status}`)
            return response.json() as Promise<unknown>
        }).then(document => {
            // Exercise the legacy traversal before committing unknown metadata to React.
            for (const group of groups) for (const name of Object.keys(group.values)) find_parameter_metadata(document, name)
            if (!controller.signal.aborted) setMetadata(document)
        }).catch(error => { if (!controller.signal.aborted) setError(message(error)) })
        return () => { controller.abort(); fileGeneration.current++ }
    }, [assetBase])
    useEffect(() => {
        const controller = new AbortController()
        setBusy(true)
        setError(null)
        setAxisState({})
        // React reports partial edits before the legacy change-on-blur event.
        // Keep those raw strings editable without passing NaN into native loops.
        const incomplete = Object.keys(settings).find(name => !Number.isFinite(parseFloat(settings[name]!)))
        if (incomplete) {
            setError(`Enter a finite number for ${incomplete}.`)
            setBusy(false)
            return () => controller.abort()
        }
        void initializeNavigation(assetBase, controller.signal)
            .then(module => calculateTrajectory(module, settings, controller.signal))
            .then(next => { if (!controller.signal.aborted) { setResult({ trajectory: next, radius: parseFloat(settings.WP_RADIUS_M!) }); setBusy(false) } })
            .catch(error => { if (!controller.signal.aborted) { setError(message(error)); setBusy(false) } })
        return () => controller.abort()
    }, [settings, revision, assetBase])
    const help = <img className="help" src={`${assetBase}images/question-circle.svg`} alt="" />
    const plots = useMemo(() => createPlots(result?.trajectory ?? null, { radius: result?.radius ?? 50, showRadius, color }), [result, showRadius, color])
    const timePlots = useMemo(() => plotNames.map(name => ({ name, ...plots[name], layout: { ...plots[name].layout,
        xaxis: { ...(plots[name].layout.xaxis as PlotFields), ...axisState[name]?.xaxis },
        yaxis: { ...(plots[name].layout.yaxis as PlotFields), ...axisState[name]?.yaxis },
    } })), [plots, axisState])

    /** Preserve raw input strings, invalidating any earlier asynchronous file read. */
    function change(name: string, value: string): void { fileGeneration.current++; setSettings(current => ({ ...current, [name]: value })) }
    /** Restore page defaults and fresh plots while cancelling stale file completion. */
    function reset(): void { fileGeneration.current++; setSettings(initialSettings()); setColor('velocity'); setShowRadius(false); setRevision(current => current + 1) }
    /** Retry navigation and plot resources using the current control values. */
    function recalculate(): void { setRevision(current => current + 1) }
    /** Import only the most recently selected file and never commit after unmount. */
    async function loadFile(file: File | null): Promise<void> {
        const generation = ++fileGeneration.current
        if (!file) return
        try {
            const text = await file.text()
            if (generation !== fileGeneration.current) return
            const next = importParameters(text, settings)
            setError(null)
            setSettings(next)
        } catch (error) { if (generation === fileGeneration.current) setError(message(error)) }
    }
    /** Download exact shared parameter serialization through the pinned FileSaver. */
    function saveFile(): void {
        try {
            const saveAs: unknown = Reflect.get(window, 'saveAs')
            if (typeof saveAs !== 'function') throw new Error('File download library is unavailable.')
            downloadFile((blob, name) => { saveAs(blob, name) }, new Blob([exportParameters(settings)], { type: 'text/plain;charset=utf-8' }), 'SCurveTool.param')
        } catch (error) { setError(message(error)) }
    }
    /** Synchronize time-axis zoom and reset across the five scalar plots. */
    function relayout(name: KinematicKey, event: PlotFields): void {
        setAxisState(previous => linkedAxes(previous, name, event))
    }
    /** Surface rejected Plotly operations and allow explicit resource retry. */
    function plotError(error: unknown): void { setError(message(error)) }

    return <>
        <table className="brand"><tbody><tr><td><a href="https://ardupilot.org"><img src={`${assetBase}images/ArduPilot.png`} /></a></td><td>
            <a href="https://github.com/ArduPilot/WebTools"><img src={`${assetBase}images/github-mark.png`} style={{ width: 60 }} /></a><br />
            <a href="https://github.com/ArduPilot/WebTools"><img src={`${assetBase}images/GitHub_Logo.png`} style={{ width: 60 }} /></a>
        </td></tr></tbody></table>
        <h1><a href="">ArduPilot SCurve plotter</a></h1>
        <fieldset className="outer"><legend title="The parameter values that the user has to define the curve">Waypoints {help}</legend>
            {waypointNames.map((name, index) => <fieldset className="position" key={name}><legend title={index === 0 ? "Waypoint that the vehicle is moving away from" : index === 1 ? "Waypoint that the vehicle is moving toward" : "Next waypoint in mission sequence, after current is waypoint is achieved"}>Position {index + 1} {help}</legend>
                {axes.map((axis, coordinate) => <p key={axis}><input id={`${name}_${axis}`} type="number" value={settings[`${name}_${axis}`]} min={axis === 'z' ? 0 : -300} max={300} step={10} onChange={event => change(`${name}_${axis}`, event.currentTarget.value)} /><label htmlFor={`${name}_${axis}`}>{labels[coordinate]}</label></p>)}
            </fieldset>)}
        </fieldset>
        <fieldset className="outer"><legend title="The parameter values that the user has to define the curve">Parameters {help}</legend>{groups.map(group => <fieldset className="params" key={group.label}><legend title={`${group.label.toLowerCase()} parameters`}>{group.label} {help}</legend>
            {Object.keys(group.values).map(name => <ParameterControl key={name} name={name} metadata={metadata} value={settings[name]!} allowValues={!name.startsWith('ATC_') || name === 'ATC_RATE_FF_ENAB'} onChange={value => change(name, value)} />)}
        </fieldset>)}</fieldset>
        <div className="actions"><button onClick={recalculate}>Recalculate</button><button onClick={reset}>Reset settings</button><button onClick={saveFile}>Export parameters</button><label htmlFor="parameter-file">Import parameters</label><FileInput id="parameter-file" accept=".param,.parm,.txt" onFile={file => { void loadFile(file) }} /></div>
        <p role="status">{busy ? 'Calculating…' : 'Ready'}</p>
        {!plotly && <p role="alert">Unable to load the plot library. Please reload this page.</p>}
        {error && <p role="alert">{error}</p>}
        <h2 title="3D plot of flight path">3D Flight path {help}</h2>
        {plotly && <Plot key={`waypoint-${revision}`} id="waypoint_plot" plotly={plotly} {...plots.waypoint} config={config} onError={plotError} />}
        <div className="display-container"><fieldset className="display-options"><legend title="Options for different ways to visualise the kinematic trajectories">Display Options {help}</legend>
            <p><input type="checkbox" id="display_wp_radius" checked={showRadius} onChange={event => setShowRadius(event.currentTarget.checked)} /><label htmlFor="display_wp_radius">Display wp radius</label></p>
            {(['velocity', 'acceleration', 'jerk'] as const).map((value, index) => <p key={value}><input type="checkbox" id={`display_wp_${['vel', 'accel', 'jerk'][index]}`} checked={color === value} onChange={event => setColor(event.currentTarget.checked ? value : null)} /><label htmlFor={`display_wp_${['vel', 'accel', 'jerk'][index]}`}>Colour WP plot by {value === 'velocity' ? value : value === 'acceleration' ? 'Acceleration' : 'Jerk'}</label></p>)}
        </fieldset></div>
        <h2 title="Computed SCurves along the vector of each leg">1D SCurves {help}</h2>
        {plotly && timePlots.map(plot => <div className="plot2D" key={`${plot.name}-${revision}`}><Plot id={`${plot.name}_plot`} plotly={plotly} data={plot.data} layout={plot.layout} config={config} onRelayout={event => relayout(plot.name, event)} onError={plotError} /></div>)}
    </>
}
