import { useEffect, useMemo, useRef, useState } from 'react'
import type { DataflashLog } from '@webtools/dataflash'
import { FileInput, OpenIn, Plot, downloadFile, useOpenInReceiver, type PlotFields, type PlotlyApi, type SaveAs } from '@webtools/react-workflows'
import { inspectLog, axisForSid, type Axis, type LogAnalysis } from './analysis.ts'
import { calculateAnalysis, type AnalysisResult } from './controller.ts'
import { ParameterControls } from './controls.tsx'
import { exportParameters, importParameters, initialParameters, nextWindowSize, mergeLogParameters, controlValue } from './parameters.ts'
import { initialGraphSettings, loops, responseLayout, responsePlots } from './plots.ts'
import { loadDataflashParser } from './parser.ts'
import './style.css'

const config = { displaylogo: false }
const sidNames = ['Input Roll Angle', 'Input Pitch Angle', 'Input Yaw Angle', 'Recovery Roll Angle', 'Recovery Pitch Angle', 'Recovery Yaw Angle', 'Rate Roll', 'Rate Pitch', 'Rate Yaw', 'Mixer Roll', 'Mixer Pitch', 'Mixer Yaw', 'Mixer Thrust', 'Measured Lateral Position', 'Measured Longitudinal Position', 'Measured Lateral Velocity', 'Measured Longitudinal Velocity', 'Input Lateral Velocity', 'Input Longitudinal Velocity', 'FW Input Roll Angle', 'FW Input Pitch Angle', 'FW Input Yaw Angle', 'FW Mixer Roll', 'FW Mixer Pitch', 'FW Mixer Yaw', 'FW Mixer Thrust']

/** Narrow Plotly ranges before using vendor event payloads in owned controls. */
function plotRange(event: PlotFields): [number, number] | null {
    const range: unknown = event['xaxis.range'] ?? [event['xaxis.range[0]'], event['xaxis.range[1]']]
    return Array.isArray(range) && typeof range[0] === 'number' && typeof range[1] === 'number' ? [range[0], range[1]] : null
}

/** Own the complete file-to-analysis-to-export workflow and every asynchronous lifetime. */
export default function App({ plotly, assetBase, saveAs }: { plotly: PlotlyApi | undefined; assetBase: string; saveAs: SaveAs | undefined }) {
    const [parameters, setParameters] = useState(() => initialParameters(window.location.href))
    const [graph, setGraph] = useState(() => initialGraphSettings(window.location.href))
    const [metadata, setMetadata] = useState<unknown>(null)
    const [analysis, setAnalysis] = useState<LogAnalysis | null>(null)
    const [selected, setSelected] = useState(0)
    const [axis, setAxis] = useState<Axis>('Roll')
    const [file, setFile] = useState<File | null>(null)
    const [start, setStart] = useState('0')
    const [end, setEnd] = useState('0')
    const [windowSize, setWindowSize] = useState('1024')
    const [result, setResult] = useState<AnalysisResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [frequencyRange, setFrequencyRange] = useState<[number, number] | null>(null)
    const log = useRef<DataflashLog | null>(null)
    const generation = useRef(0)
    const parameterGeneration = useRef(0)
    const alive = useRef(false)
    const vehicle = analysis?.vehicle ?? 'ArduCopter'
    const sidAxis = analysis?.sidSets[selected]?.axis ?? 0

    /** Surface failures without permitting stale operations to mutate state. */
    function reportError(cause: unknown): void { setError(cause instanceof Error ? cause.message : String(cause)) }

    useEffect(() => {
        alive.current = true
        const abort = new AbortController()
        void fetch(`${assetBase}params.json`, { signal: abort.signal }).then(response => {
            if (!response.ok) throw new Error(`Unable to load parameter metadata (${response.status})`)
            return response.json() as Promise<unknown>
        }).then(document => { if (!abort.signal.aborted) setMetadata(document) }).catch(cause => { if (!abort.signal.aborted) reportError(cause) })
        return () => { alive.current = false; generation.current++; parameterGeneration.current++; log.current = null; abort.abort() }
    }, [assetBase])

    /** Parse locally and atomically replace only the newest selected file. */
    function loadFile(next: File | null): void {
        const request = ++generation.current
        if (!next) { setFile(null); log.current = null; setAnalysis(null); setResult(null); return }
        setError(null)
        void (async () => {
            try {
            const [Parser, bytes] = await Promise.all([loadDataflashParser(), next.arrayBuffer()])
            if (!alive.current || request !== generation.current) return
            const parsed = new Parser()
            parsed.processData(bytes, [])
            const inspected = inspectLog(parsed)
            if (!alive.current || request !== generation.current) return
            log.current = parsed
            setAxis(inspected.axis); setFile(next); setAnalysis(inspected); setSelected(0); setStart(String(inspected.start)); setEnd(String(inspected.end)); setResult(null)
            setParameters(current => mergeLogParameters(current, inspected.parameters, inspected.vehicle))
            document.title = `SysID: ${next.name}`
            } catch (cause) {
                if (alive.current && request === generation.current) reportError(cause)
            }
        })()
    }
    useOpenInReceiver(loadFile, buffer => loadFile(new File([buffer], 'opened-log.bin')), undefined, reportError)

    /** Calculate from a complete snapshot; invalid controls retain the prior plot. */
    function calculate(nextParameters = parameters, nextGraph = graph): void {
        if (!log.current) return
        setError(null)
        try {
            setResult(calculateAnalysis(log.current, Number(start), Number(end), axis, vehicle, parseInt(windowSize), nextGraph.useAttitude,
                Object.fromEntries(Object.entries(nextParameters).map(([name, value]) => [name, parseFloat(controlValue(name, value, metadata))]))))
        } catch (cause) { reportError(cause) }
    }

    /** Update gains and filters, preserving immediate recalculation semantics. */
    function changeParameter(name: string, value: string): void {
        const next = { ...parameters, [name]: value }
        setParameters(next)
        if (!['Throttle', 'NUM_MOTORS', 'ESC_RPM', 'RPM1', 'RPM2'].includes(name)) calculate(next)
    }

    /** Import raw parameter values without automatically recalculating responses. */
    function loadParameters(next: File | null): void {
        if (!next) return
        const request = ++parameterGeneration.current
        void next.text().then(text => {
            if (alive.current && request === parameterGeneration.current) setParameters(current => importParameters(current, text))
        }).catch(cause => { if (alive.current && request === parameterGeneration.current) reportError(cause) })
    }

    /** Download exactly the owned parameter form's input/select serialization. */
    function saveParameters(): void {
        if (!saveAs) { reportError(new Error('Unable to load the parameter download library.')); return }
        try { downloadFile(saveAs, new Blob([exportParameters(parameters, vehicle, axis, metadata)], { type: 'text/plain;charset=utf-8' }), 'filter.param') }
        catch (cause) { reportError(cause) }
    }

    const traces = useMemo(() => responsePlots(result, graph, sidAxis), [result, graph, sidAxis])
    const flightData = useMemo(() => ['Targ', 'Roll', 'Pitch', 'Yaw'].map((name, index) => ({
        name, meta: name, mode: 'lines', hovertemplate: `<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} ${index === 0 ? 'deg' : 'deg/s'}`, yaxis: index === 0 ? 'y' : `y${index + 1}`, x: analysis?.flight.time ?? [],
        y: analysis ? [analysis.flight.target, analysis.flight.roll, analysis.flight.pitch, analysis.flight.yaw][index] : [],
    })), [analysis])
    const flightLayout = useMemo(() => ({ width: 1200, height: 450, showlegend: false, margin: { b: 50, l: 50, r: 50, t: 20 },
        xaxis: { title: { text: 'Time (s)' }, domain: [0.07, 0.93], type: 'linear', zeroline: false, showline: true, mirror: true, rangeslider: {}, range: [Number(start), Number(end)] },
        ...Object.fromEntries(['Targ', 'Roll', 'Pitch', 'Yaw'].map((name, index) => [index === 0 ? 'yaxis' : `yaxis${index + 1}`, {
            title: { text: name }, zeroline: false, showline: true, mirror: true, color: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'][index], side: index < 2 ? 'left' : 'right', position: [0, 0.06, 0.94, 1][index], ...(index ? { overlaying: 'y' } : {}),
        }])),
    }), [start, end])

    return <>
        <table className="brand"><tbody><tr><td><a href="https://ardupilot.org"><img src={`${assetBase}images/ArduPilot.png`} /></a></td>
            <td><a href="https://github.com/ArduPilot/WebTools"><img src={`${assetBase}images/github-mark.png`} width="60" /><br /><img src={`${assetBase}images/GitHub_Logo.png`} width="60" /></a></td></tr></tbody></table>
        <h1><a href="">ArduCopter Analytic Tune Tool</a></h1>
        {error && <p role="alert">{error}</p>}
        {!plotly && <p role="alert">Unable to load the plot library. Please reload this page.</p>}
        <fieldset><legend>Setup</legend><div className="setup">
            <fieldset><legend>FFT Settings</legend><label htmlFor="FFTWindow_size">Window size </label><input id="FFTWindow_size" type="number" min="1" step="1" value={windowSize} onChange={event => setWindowSize(String(nextWindowSize(Number(windowSize), Number(event.currentTarget.value))))} /></fieldset>
            <fieldset><legend>Analysis time</legend><label htmlFor="starttime">Start (s) </label><input id="starttime" type="number" value={start} onChange={event => setStart(event.currentTarget.value)} /><br /><label htmlFor="endtime">End (s) </label><input id="endtime" type="number" value={end} onChange={event => setEnd(event.currentTarget.value)} /></fieldset>
            <FileInput id="fileItem" accept=".bin" onFile={loadFile} /><OpenIn file={file} messages={log.current ? Object.keys(log.current.messageTypes) : null} />
        </div></fieldset>
        <fieldset id="sid_sets"><legend>System ID Runs</legend>{analysis && <table className="sid"><thead><tr>{['Num', 'Use', 'SID Axis', 'Start Time', 'End Time'].map(name => <th key={name}>{name}</th>)}</tr></thead><tbody>
            {analysis.sidSets.map((set, index) => <tr key={index}><td>{index + 1}</td><td><input id={`set_selection_${index}`} type="radio" name="sid_sets" checked={selected === index} onChange={() => { setAxis(current => axisForSid(set.axis, current)); setSelected(index); setStart(String(set.start)); setEnd(String(set.end)) }} /></td><td>{set.axis}{sidNames[set.axis - 1] ? `: ${sidNames[set.axis - 1]}` : ''}</td><td>{set.start.toFixed(2)}</td><td>{set.end.toFixed(2)}</td></tr>)}
        </tbody></table>}</fieldset>
        <h2 className="flight-title">Flight Data</h2>
        {plotly && <Plot id="FlightData" plotly={plotly} data={flightData} layout={flightLayout} config={config} onError={reportError} onRelayout={event => { const range = plotRange(event); if (range) { setStart(String(Math.floor(range[0]))); setEnd(String(Math.ceil(range[1]))) } }} />}
        <p><button id="calculate" onClick={() => calculate()}>Calculate</button> <button id="SaveParams" onClick={saveParameters}>Save Parameters</button> <label htmlFor="param_file">Load Parameters </label><FileInput id="param_file" onFile={loadParameters} /></p>
        <h2 id="warning">WARNING - Parameter values are not updated if they changed during the log. If parameters were changed during the flight, be sure to verify the values below.</h2>
        <ParameterControls values={parameters} metadata={metadata} vehicle={vehicle} axis={axis} onChange={changeParameter} harmonicBits={analysis && analysis.parameters.INS_RAW_LOG_OPT === undefined ? 8 : 32} />
        <h2 id="PID_title">Calculated vs. Predicted Comparison</h2>
        {plotly && ['FFTPlotMag', 'FFTPlotPhase', 'FFTPlotCoh'].map((id, index) => <Plot key={id} id={id} plotly={plotly} data={traces[index] ?? []} layout={responseLayout(index, graph, frequencyRange)} config={config} onError={reportError} onRelayout={event => { const range = plotRange(event); if (range) setFrequencyRange(range); else if (event['xaxis.autorange']) setFrequencyRange(null) }} />)}
        <form id="PID_params" onSubmit={event => event.preventDefault()}><fieldset><legend>Graph Settings</legend><div className="setup"><fieldset><legend>Control Loop</legend>
            {loops.map(([value, label]) => <div key={value}><input id={`type_${value}`} name="Control_Loop" type="radio" disabled={vehicle === 'ArduPlane_FW' && (value === 'Att_Ctrlr' || value === 'Pilot_Ctrlr')} checked={graph.loop === value} onChange={() => setGraph({ ...graph, loop: value })} /><label htmlFor={`type_${value}`}>{label}</label></div>)}
            <input id="UseAttitude" type="checkbox" checked={graph.useAttitude} onChange={event => { const next = { ...graph, useAttitude: event.currentTarget.checked }; setGraph(next); calculate(parameters, next) }} /><label htmlFor="UseAttitude">Use Attitude to Improve Coherence</label>
        </fieldset>
        {([
            ['gain', 'Gain scale', [['Log', 'dB', 'PID_ScaleLog'], ['Linear', 'Linear', 'PID_ScaleLinear']]],
            ['phase', 'Phase scale', [['unwrap', 'un-wrapped', 'PID_ScaleUnWrap'], ['wrap', '±180', 'PID_ScaleWrap']]],
            ['frequency', 'Frequency scale', [['Log', 'Log', 'PID_freq_ScaleLog'], ['Linear', 'Linear', 'PID_freq_ScaleLinear']]],
            ['unit', 'Frequency unit', [['Hz', 'Hz', 'PID_freq_Scale_Hz'], ['RPS', 'Rad/s', 'PID_freq_Scale_RPS']]],
        ] as const).map(([key, label, options]) => <fieldset key={key}><legend>{label}</legend>{options.map(([value, text, id]) => <div key={value}><input id={id} type="radio" name={key} checked={graph[key] === value} onChange={() => { setFrequencyRange(null); setGraph({ ...graph, [key]: value }) }} /><label htmlFor={id}>{text}</label></div>)}</fieldset>)}
        </div></fieldset></form>
    </>
}
