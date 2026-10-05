import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileInput, LoadingOverlay, OpenIn, Plot, useLoading, useOpenInReceiver, type PlotFields, type PlotlyApi } from '@webtools/react-workflows'
import { discover, keys, labels, parameters, type Key, type LogData, type Controller } from './model.ts'
import { analyze, stepResponses, type Analysis } from './analysis.ts'
import { charts, colors, type Charts, type PlotName, type View } from './plots.ts'
import { parser } from './parser.ts'
import './style.css'

const axisIds = ['RATE_R', 'RATE_P', 'RATE_Y', 'PIDR', 'PIDP', 'PIDY', 'PIQR', 'PIQP', 'PIQY', 'PIDS', 'PIDA']
const config = { displaylogo: false }
const groups: readonly [string, readonly Key[]][] = [['Inputs', keys.slice(0, 3)], ['Components', keys.slice(3, 8)], ['Output', keys.slice(8)]]
const initialView: View = { start: 0, end: 0, amplitude: 'db', rpm: false, logFrequency: false, channels: ['Tar', 'Act'], component: 'Out', sets: [] }
interface Loaded { log: LogData; spectra: (Analysis | undefined)[] }
type Range = [number, number] | null

/** Narrow vendor range payloads, accepting both Plotly relayout representations. */
function eventRange(event: PlotFields, axis: string): Range | undefined {
    if (event[axis + '.autorange'] === true) return null
    const pair = event[axis + '.range']
    if (Array.isArray(pair) && pair.length === 2 && pair.every(value => typeof value === 'number')) return [pair[0]!, pair[1]!]
    const first = event[axis + '.range[0]'], last = event[axis + '.range[1]']
    return typeof first === 'number' && typeof last === 'number' ? [first, last] : undefined
}
/** Report whether a component is present under the legacy reduced-data control rules. */
function available(controller: Controller | undefined, key: Key): boolean {
    if (!controller) return false
    if (['Tar', 'Act', 'Out'].includes(key)) return true
    if (controller.id.startsWith('RATE')) return false
    return key !== 'DFF' || controller.sets.some(set => set?.some(batch => batch.DFF != null))
}

/** Own PIDReview controls, loaded data and async lifetimes; all plots derive from typed state. */
export default function App({ plotly, assetBase }: { plotly: PlotlyApi | undefined; assetBase: string }) {
    const [held, setHeld] = useState<{ plots: Charts; analysis: Analysis | undefined } | null>(null)
    const [loaded, setLoaded] = useState<Loaded | null>(null), [axis, setAxis] = useState(0)
    const [file, setFile] = useState<File | null>(null), [open, setOpen] = useState(false)
    const [size, setSize] = useState('512'), [range, setRange] = useState<[number, number]>([0, 0])
    const [validSets, setValidSets] = useState<readonly boolean[]>([])
    const [view, setView] = useState(initialView), [dirty, setDirty] = useState(false)
    const [resetAxes, setResetAxes] = useState(false)
    const [error, setError] = useState(''), [linkedTime, setLinkedTime] = useState<Range>(null), [linkedFrequency, setLinkedFrequency] = useState<Range>(null)
    const generation = useRef(0), previousTitle = useRef(document.title)
    const controller = loaded?.log.controllers[axis], analysis = loaded?.spectra[axis]
    const shownAnalysis = held?.analysis ?? analysis
    /** Surface current-lifetime parser, numerical and vendor failures. */
    const report = useCallback((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)), [])
    const loading = useLoading(report)
    useEffect(() => {
        const title = previousTitle.current
        return () => { generation.current++; document.title = title }
    }, [])
    /** Parse a fresh input and suppress stale results after replacement or unmount. */
    const load = useCallback((input: File | ArrayBuffer) => {
        const request = ++generation.current
        setError(''); setValidSets([]); setHeld(null); setLoaded(null); setOpen(false); setDirty(false); setFile(input instanceof File ? input : null)
        setView(previous => ({ ...initialView, amplitude: previous.amplitude, rpm: previous.rpm, logFrequency: previous.logFrequency }))
        document.title = 'ArduPilot PID Review'
        void loading.run(async () => {
          try {
            const bytes = input instanceof File ? await input.arrayBuffer() : input
            if (generation.current !== request) return
            const Constructor = await parser()
            if (generation.current !== request) return
            const log = new Constructor(); log.processData(bytes, [])
            const data = discover(log), spectra = data.controllers.map(item => item.sets.length ? analyze(item, parseInt(size)) : undefined)
            const index = data.controllers.findIndex(item => item.sets.length > 0)
            if (generation.current !== request) return
            const start = Math.floor(data.start), end = Math.ceil(data.end)
            setResetAxes(false); setLoaded({ log: data, spectra }); setAxis(index); setRange([start, end]); setLinkedTime(null); setLinkedFrequency(null)
            setValidSets(data.controllers[index]!.params.map((_, i) => !!spectra[index]?.sets[i]))
            setView(previous => ({ ...previous, start, end, sets: data.controllers[index]!.params.map((_, i) => !!spectra[index]?.sets[i]) }))
            if (input instanceof File) document.title = 'PID Review: ' + input.name
          } catch (reason) { if (generation.current === request) throw reason }
        })
    }, [loading.run, size])
    useOpenInReceiver(load, load, undefined, report)
    /** Recalculate all controllers and commit the analysis window only on explicit calculation. */
    function calculate() {
        if (!loaded) return
        const request = generation.current
        void loading.run(() => {
            if (generation.current !== request) return
            const spectra = loaded.log.controllers.map(item => item.sets.length ? analyze(item, parseInt(size)) : undefined)
            setHeld(null); setResetAxes(false); setLoaded({ log: loaded.log, spectra }); setView(previous => ({ ...previous, start: range[0], end: range[1] })); setLinkedTime(null); setLinkedFrequency(null); setDirty(false)
        })
    }
    /** Select a controller and apply the same reduced-data defaults as legacy setup_axis. */
    function chooseAxis(index: number) {
        const next = loaded?.log.controllers[index]
        if (!next) return
        setResetAxes(false); setAxis(index); setLinkedTime(null); setLinkedFrequency(null)
        const nextView: View = { ...view, start: range[0], end: range[1], sets: next.params.map((_, i) => !!loaded?.spectra[index]?.sets[i]), channels: view.channels.filter(key => available(next, key)),
            component: ((!available(next, 'Err') || !available(next, 'DFF')) && !['Tar', 'Act', 'Out'].includes(view.component)) ? 'Out' : view.component }
        if (held && loaded) {
            const empty = charts(loaded.log, next, undefined, nextView, [])
            // Legacy axis setup clears frequency/step traces but retains the last heatmap until recalculation.
            empty.Spectrogram = held.plots.Spectrogram
            setHeld({ plots: empty, analysis: undefined })
        }
        setValidSets(nextView.sets); setView(nextView)
    }
    /** Invalidate cached spectra while retaining drawn figures until the next legacy redraw/setup. */
    function changeWindow(text: string) {
        const value = parseFloat(text), previous = parseFloat(size), difference = value - previous
        if (loaded) { setHeld(current => current ?? { plots: snapshot, analysis }); setLoaded({ log: loaded.log, spectra: [] }) }
        const exponent = Math.floor(Math.log2(previous)) + (difference > 0 ? 1 : Number.isInteger(Math.log2(previous)) ? -1 : 0)
        setSize(Math.abs(difference) === 1 ? String(2 ** exponent) : text); setDirty(!!loaded)
    }
    /** Change the selector range while leaving frequency/step analysis pending Calculate. */
    function changeRange(next: [number, number]) { setRange(next); setDirty(!!loaded) }
    /** Synchronize linked analysis axes; the flight overview separately selects recalculation bounds. */
    function relayout(name: PlotName, event: PlotFields) {
        const x = eventRange(event, 'xaxis'), y = eventRange(event, 'yaxis')
        if (name === 'FlightData') {
            if (x !== undefined && loaded) changeRange(x ? [Math.floor(x[0]), Math.ceil(x[1])] : [Math.floor(loaded.log.start), Math.ceil(loaded.log.end)])
            return
        }
        if (x === null || y === null) { setResetAxes(true); setLinkedTime(null); setLinkedFrequency(null) }
        if (['TimeInputs', 'TimeOutputs', 'Spectrogram'].includes(name) && x !== undefined) setLinkedTime(x)
        if (name === 'FFTPlot' && x !== undefined) setLinkedFrequency(x)
        if (name === 'Spectrogram' && y !== undefined) setLinkedFrequency(y)
    }
    /** Toggle a whole component group using legacy enabled-checkbox majority logic. */
    function toggleGroup(group: readonly Key[]) {
        const enabled = group.filter(key => available(controller, key)), checked = group.filter(key => view.channels.includes(key)).length
        const check = checked < enabled.length * 0.5
        setView(previous => ({ ...previous, channels: check ? [...new Set([...previous.channels, ...group])] : previous.channels.filter(key => !group.includes(key)) }))
    }
    const steps = useMemo(() => controller && analysis ? stepResponses(controller, analysis, view.start, view.end) : [], [controller, analysis, view.start, view.end])
    const snapshot = useMemo(() => charts(loaded?.log ?? null, controller, analysis, view, steps), [loaded, controller, analysis, view, steps])
    const layouts = useMemo(() => {
        const result = structuredClone(snapshot)
        if (held) for (const name of ['FFTPlot', 'step_plot', 'Spectrogram'] as const) result[name] = structuredClone(held.plots[name])
        /** Apply linked axis state to fresh layout objects, preserving vendor-owned mutations. */
        const apply = (name: PlotName, axisName: string, value: Range) => {
            const fields = result[name].layout[axisName]
            result[name].layout[axisName] = { ...(typeof fields === 'object' && fields !== null ? fields : {}), ...(value ? { range: [...value], autorange: false } : {}) }
        }
        if (resetAxes) for (const name of ['TimeInputs', 'TimeOutputs', 'FFTPlot', 'step_plot', 'Spectrogram'] as const) {
            for (const axisName of ['xaxis', 'yaxis']) {
                const fields = result[name].layout[axisName] as PlotFields
                delete fields.range; fields.autorange = true
            }
        }
        if (loaded) apply('FlightData', 'xaxis', range)
        for (const name of ['TimeInputs', 'TimeOutputs', 'Spectrogram'] as const) apply(name, 'xaxis', linkedTime)
        apply('FFTPlot', 'xaxis', linkedFrequency); apply('Spectrogram', 'yaxis', linkedFrequency)
        return result
    }, [snapshot, range, linkedTime, linkedFrequency, loaded, resetAxes, held])
    /** Render one shared lifecycle-managed Plotly surface. */
    function plot(name: PlotName) { return plotly ? <Plot id={name} plotly={plotly} data={layouts[name].data} layout={layouts[name].layout} config={config} onRelayout={event => relayout(name, event)} onError={report} /> : null }
    /** Render a controlled amplitude/frequency option using existing public element IDs. */
    function option(id: string, name: string, label: string, checked: boolean, change: () => void) { return <label><input id={id} type="radio" name={name} checked={checked} onChange={() => { setResetAxes(false); setLinkedTime(null); change() }} />{label}</label> }
    return <>
        <header><a href="https://ardupilot.org"><img src={assetBase + 'images/ArduPilot.png'} /></a><a href="https://github.com/ArduPilot/WebTools"><img width="60" src={assetBase + 'images/github-mark.png'} /><br /><img width="60" src={assetBase + 'images/GitHub_Logo.png'} /></a></header>
        <h1><a href="">ArduPilot PID Review Tool</a></h1>
        <p className="intro">This tool takes a .bin log with RATE or PID messages and shows the time and frequency content of the rate controller target, response and output. To record the full set of PID components the <b>PID</b> bit of the <code>LOG_BITMASK</code> parameter must be set before flying. The <code>RATE</code> log message is enabled by default and can also be used by this tool. Here are <a href="https://github.com/ArduPilot/WebTools/blob/main/PIDReview/Readme.md">more details about this tool and how to use it</a>.</p>
        {(!plotly || error) && <p role="alert" className="error">{error || 'Plotly asset unavailable. Please reload the page.'}</p>}
        <fieldset className="setup"><legend>Setup</legend>
            <fieldset><legend>FFT Settings</legend><label htmlFor="FFTWindow_size">Window size </label><input id="FFTWindow_size" type="number" min="1" step="1" value={size} onChange={event => changeWindow(event.target.value)} /></fieldset>
            <fieldset><legend>Analysis time</legend><label>Start (s) <input id="TimeStart" type="number" value={range[0]} min={loaded ? Math.floor(loaded.log.start) : 0} max={loaded ? Math.ceil(loaded.log.end) : undefined} onChange={event => changeRange([Number(event.target.value), range[1]])} /></label><br /><br /><label>End (s) <input id="TimeEnd" type="number" value={range[1]} min={loaded ? Math.floor(loaded.log.start) : 0} max={loaded ? Math.ceil(loaded.log.end) : undefined} onChange={event => changeRange([range[0], Number(event.target.value)])} /></label></fieldset>
            <fieldset><legend>Axis</legend><div className="axes">{axisIds.map(id => { const index = loaded?.log.controllers.findIndex(item => item.id === id) ?? -1; return <label key={id}><input id={'type_' + id} name="Axis" type="radio" disabled={!loaded?.log.controllers[index]?.sets.length} checked={controller?.id === id} onChange={() => chooseAxis(index)} />{id.replace('RATE_R', 'RATE Roll').replace('RATE_P', 'RATE Pitch').replace('RATE_Y', 'RATE Yaw')}</label> })}</div></fieldset>
            <div><FileInput id="fileItem" accept=".bin" onFile={value => { if (value) load(value) }} /><br /><button id="OpenIn" disabled={!file} onClick={() => setOpen(!open)}>Open In</button><div hidden={!open}><OpenIn file={file} messages={loaded?.log.messages ?? null} /></div><br /><button id="calculate" disabled={!dirty} onClick={calculate}>Calculate</button></div>
        </fieldset>
        <h2 title={'Zoom into a section of the flight to change the Analysis time then click "Calculate".'}>Flight Data ⓘ</h2>{plot('FlightData')}
        <h2 title="Shows PID inputs and outputs in the time domain. Useful for inspecting tracking error, overshoot, and oscillations.">Time domain ⓘ</h2>{plot('TimeInputs')}{plot('TimeOutputs')}
        <h2 title="Displays the frequency response of PID components. Helps identify resonances, noise amplification, and D-term behavior.">Frequency domain ⓘ</h2>
        <div className="analysis-controls"><fieldset><legend>PID</legend>{groups.map(([title, group]) => <fieldset key={String(title)}><legend onDoubleClick={() => toggleGroup(group)}>{title}</legend>{group.map(key => <label key={key}><input id={'PIDX_' + key} type="checkbox" disabled={!available(controller, key)} checked={view.channels.includes(key)} onChange={event => setView(previous => ({ ...previous, channels: event.target.checked ? [...previous.channels, key] : previous.channels.filter(item => item !== key) }))} />{labels[keys.indexOf(key)]}</label>)}</fieldset>)}<p>Logging rate: <span id="FFT_infoA">{shownAnalysis?.rate.toFixed(2)}</span> Hz</p>Frequency resolution: <span id="FFT_infoB">{shownAnalysis && (shownAnalysis.rate / shownAnalysis.size).toFixed(2)}</span> Hz</fieldset>
            <fieldset id="test_sets"><legend>Tests</legend>{controller && <table><thead><tr><th>Num</th><th>Show</th>{parameters.map(([key, suffix, title]) => <th key={key} title={controller.prefix + suffix}>{title}</th>)}</tr></thead><tbody>{controller.params.map((set, i) => <tr key={i} style={{ backgroundColor: controller.params.length > 1 ? colors[i % colors.length] + '66' : undefined }}><td>{i + 1}</td><td><input id={'set_selection_' + i} type="checkbox" checked={view.sets[i] ?? false} disabled={!validSets[i] || validSets.filter(Boolean).length === 1} onChange={event => setView(previous => ({ ...previous, sets: previous.sets.map((value, j) => i === j ? event.target.checked : value) }))} /></td>{parameters.map(([key, , , decimals]) => <td key={key}>{i > 0 && set[key] !== controller.params[i - 1]![key] ? <b>{set[key]?.toFixed(decimals)}</b> : set[key]?.toFixed(decimals)}</td>)}</tr>)}</tbody></table>}</fieldset>
        </div>{plot('FFTPlot')}
        <div className="scales"><fieldset><legend>Amplitude scale</legend>{(['linear', 'db', 'psd'] as const).map((value, i) => <span key={value}>{option(['ScaleLinear', 'ScaleLog', 'ScalePSD'][i]!, 'Scale', ['Linear', 'dB', 'Power Spectral Density'][i]!, view.amplitude === value, () => setView(previous => ({ ...previous, start: range[0], end: range[1], amplitude: value })))}</span>)}</fieldset><fieldset><legend>Frequency scale</legend>{option('freq_ScaleLinear', 'feq_scale', 'Linear', !view.logFrequency, () => setView(previous => ({ ...previous, start: range[0], end: range[1], logFrequency: false })))}{option('freq_ScaleLog', 'feq_scale', 'Log', view.logFrequency, () => setView(previous => ({ ...previous, start: range[0], end: range[1], logFrequency: true })))}{option('freq_Scale_Hz', 'feq_unit', 'Hz', !view.rpm, () => setView(previous => ({ ...previous, start: range[0], end: range[1], rpm: false })))}{option('freq_Scale_RPM', 'feq_unit', 'RPM', view.rpm, () => setView(previous => ({ ...previous, start: range[0], end: range[1], rpm: true })))}</fieldset></div>
        <h2 title="Simulated PID response to a step input. Used to evaluate rise time, overshoot, damping, and stability.">Step Response ⓘ</h2>{plot('step_plot')}
        <h2 title="Time-frequency view of PID output. Shows how control effort and noise vary throughout the flight.">PID Spectrogram ⓘ</h2>{plot('Spectrogram')}
        <fieldset className="component"><legend>PID component</legend>{keys.map((key, i) => <label key={key}><input id={'Spec_' + key} name="Spec" type="radio" disabled={!available(controller, key)} checked={view.component === key} onChange={() => setView(previous => ({ ...previous, component: key }))} />{labels[i]}</label>)}</fieldset>
        <LoadingOverlay visible={loading.visible} />
    </>
}
