import { useEffect, useRef, useState } from 'react'
import { FileInput, ParameterControl, Plot, downloadFile, type PlotlyApi, type SaveAs } from '@webtools/react-workflows'
import { calculate, type PlotSnapshot } from './plots.ts'
import { clearSavedState, controls, defaults, exportParameters, importParameters, initialState, metadata, numericNames, persist, shareLink } from './state.ts'
import { value, type Parameters } from './model.ts'
import inputSteps from './steps.json'
import './style.css'

declare global { interface Window { Plotly?: PlotlyApi; saveAs: SaveAs } }
const steps: Readonly<Record<string, string>> = inputSteps
const config = { displaylogo: false }
const axes = [['RLL', 'Roll'], ['PIT', 'Pitch'], ['YAW', 'Yaw']] as const
interface SettingsProps { params: Parameters; prefix: string; onChange: (name: string, value: string) => void }

/** Render graph options in their original groups, IDs and radio names. */
function Settings({ params, prefix, onChange }: SettingsProps) {
    const groups = [
        { title: prefix ? 'Gain scale' : 'Magnitude scale', names: ['Scale'], labels: ['dB', 'Linear'] },
        { title: 'Phase scale', names: ['PhaseScale'], labels: ['un-wrapped', '±180'] },
        { title: 'Frequency scale', names: ['feq_scale', 'feq_unit'], labels: ['Log', 'Linear', 'Hz', 'RPM'] },
        ...(prefix ? [{ title: 'Filtering', names: ['filtering'], labels: ['Pre', 'Post'] }] : []),
        { title: 'Options', names: ['ShowComponents'], labels: [prefix ? 'Show individual components' : 'Show individual filters'] },
    ]
    /** Render a controlled radio or checkbox with its original public ID. */
    function option(control: typeof controls[number], label: string | undefined) {
        return <span key={control.id}>
            <input id={control.id} name={control.name} type={control.type} value={control.value} checked={params[control.name] === control.value} onChange={event => onChange(control.name, control.type === 'checkbox' ? String(event.currentTarget.checked) : control.value)} />
            <label htmlFor={control.id}>{label}</label><br />
        </span>
    }
    return <fieldset className="wide"><legend>Graph Settings</legend><table><tbody><tr>{groups.map(group => {
        const items = controls.filter(control => group.names.some(name => control.name === (name === 'filtering' ? name : prefix + name)))
        return <td key={group.title}><fieldset style={{ width: group.title === 'Options' ? 220 : 150, height: 70 }}><legend>{group.title}</legend>
            {group.title === 'Frequency scale' ? <table><tbody><tr><td>{items.slice(0, 2).map((control, index) => option(control, group.labels[index]))}</td><td>{items.slice(2).map((control, index) => option(control, group.labels[index + 2]))}</td></tr></tbody></table> : items.map((control, index) => option(control, group.labels[index]))}
        </fieldset></td>
    })}</tr></tbody></table></fieldset>
}

/** Own editable parameters, explicit calculation snapshots, and cancellable file reads.
 * Plot resources belong to the shared Plot workflow; reset replaces its lifetime.
 */
export function App() {
    const [params, setParams] = useState<Parameters>(() => initialState(location.href, document.cookie))
    const latestParams = useRef(params)
    latestParams.current = params
    const [axis, setAxis] = useState('RLL')
    const [initial] = useState(() => {
        try { return { filter: calculate(params), pid: calculate(params, 'RLL'), error: '' } }
        catch (cause) { return { filter: null, pid: null, error: cause instanceof Error ? cause.message : String(cause) } }
    })
    const [filterPlot, setFilterPlot] = useState<PlotSnapshot | null>(initial.filter)
    const [pidPlot, setPidPlot] = useState<PlotSnapshot | null>(initial.pid)
    const [error, setError] = useState(initial.error)
    const [generation, setGeneration] = useState(0)
    const fileInput = useRef<HTMLInputElement>(null)
    const reading = useRef(0)
    const alive = useRef(false)
    useEffect(() => {
        alive.current = true
        persist(params); persist(params, 'RLL')
        return () => { alive.current = false; reading.current++ }
        // Initial persistence belongs to this mount, not every edit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    /** Show actionable failures while retaining the last successfully calculated curves. */
    function report(cause: unknown): void { setError(cause instanceof Error ? cause.message : String(cause)) }
    /** Calculate only the requested plot; PID axis buttons also select the next graph update. */
    function recalculate(next: Parameters, selectedAxis?: string): void {
        try {
            const plot = calculate(next, selectedAxis)
            if (selectedAxis) { setPidPlot(plot); setAxis(selectedAxis) } else setFilterPlot(plot)
            persist(next, selectedAxis); setError('')
        } catch (cause) { report(cause) }
    }
    /** Keep raw editing text under React ownership without implicitly recalculating curves. */
    function edit(name: string, text: string): void { setParams(current => ({ ...current, [name]: text })) }
    /** Graph options immediately evaluate current edits, matching each legacy form. */
    function graphEdit(name: string, text: string): void {
        const next = { ...params, [name]: text }; setParams(next)
        recalculate(next, name.startsWith('PID_') || name === 'filtering' ? axis : undefined)
    }
    /** Ignore late file reads after reset, replacement or unmount; import recalculates only gyro. */
    async function load(file: File | null): Promise<void> {
        const request = ++reading.current
        if (!file) return
        try {
            const text = await file.text()
            if (!alive.current || request !== reading.current) return
            const next = importParameters(latestParams.current, text)
            setParams(next); recalculate(next)
            if (fileInput.current) fileInput.current.value = ''
        } catch (cause) { if (alive.current && request === reading.current) report(cause) }
    }
    /** Download exact legacy INS parameter bytes through the pinned FileSaver implementation. */
    function save(): void {
        try { downloadFile(window.saveAs, new Blob([exportParameters(params)], { type: 'text/plain;charset=utf-8' }), 'filter.param'); setError('') }
        catch (cause) { report(cause) }
    }
    /** Copy the supported query format, surfacing clipboard permission failures. */
    async function copyLink(): Promise<void> {
        try { await navigator.clipboard?.writeText(shareLink(location.href, params)) }
        catch (cause) { if (alive.current) report(cause) }
    }
    /** Restore defaults, invalidate in-flight reads and dispose both plot lifetimes. */
    function reset(): void {
        clearSavedState()
        const url = new URL(location.href); url.search = ''; history.replaceState(null, '', url)
        reading.current++; setParams({ ...defaults }); setAxis('RLL'); setGeneration(current => current + 1)
        recalculate(defaults); recalculate(defaults, 'RLL')
        if (fileInput.current) fileInput.current.value = ''
    }
    /** Render one metadata-backed control; the parameter string stays in parent state. */
    function parameter(name: string, disabled = false) {
        return <ParameterControl key={name} name={name} metadata={metadata} value={params[name] ?? ''} onChange={text => edit(name, text)} disabled={disabled} allowValues={name !== 'SCHED_LOOP_RATE'} step={steps[name] ?? 'any'} />
    }
    /** Render a simulator input using its original ID and label. */
    function input(name: string, label: string) {
        return <p key={name}><label htmlFor={name}>{label} </label><input id={name} name={name} type="number" step={steps[name]} value={params[name] ?? ''} onChange={event => edit(name, event.currentTarget.value)} /></p>
    }
    /** Show simulator fields when either enabled notch uses a corresponding mode. */
    function modeVisible(modes: number[]): boolean {
        return ['INS_HNTCH_', 'INS_HNTC2_'].some(prefix => value(params, prefix + 'ENABLE') > 0 && modes.includes(Math.floor(value(params, prefix + 'MODE'))))
    }
    return <>
        <table style={{ width: 1200 }}><tbody><tr><td><a href="https://ardupilot.org"><img src={`${import.meta.env.BASE_URL}images/ArduPilot.png`} alt="ArduPilot" /></a></td><td><a href="https://github.com/ArduPilot/WebTools"><img src={`${import.meta.env.BASE_URL}images/github-mark.png`} alt="GitHub" width="60" /><br /><img src={`${import.meta.env.BASE_URL}images/GitHub_Logo.png`} alt="GitHub" width="60" /></a></td></tr></tbody></table>
        <h1><a href="" style={{ color: '#000', textDecoration: 'none' }}>ArduPilot Filter Analysis</a></h1>
        The following form will display the attenuation and phase lag for an ArduPilot 4.2 filter setup.
        {error && <p role="alert">{error}</p>}
        {window.Plotly ? filterPlot && <Plot key={`gyro-${generation}`} id="Bode" plotly={window.Plotly} {...filterPlot} config={config} onError={report} /> : <p role="alert">Unable to load the plot library. Reload to retry.</p>}
        <p><input type="button" id="calculate" value="Calculate" onClick={() => recalculate(params)} />{' '}
            <input type="button" id="SaveParams" value="Save Parameters" onClick={save} />{' '}
            <button onClick={() => fileInput.current?.click()}>Load Parameters</button>{' '}
            <span hidden><FileInput id="param_file" inputRef={fileInput} onFile={file => { void load(file) }} /></span>
            <input type="button" id="GetLink" value="Get Link" onClick={() => { void copyLink() }} />{' '}
            <button id="reset" onClick={reset}>Reset</button>
        </p>
        <form id="params" onSubmit={event => event.preventDefault()}>
            <Settings params={params} prefix="" onChange={graphEdit} />
            <fieldset className="wide"><legend>INS Settings</legend>{input('GyroSampleRate', 'Gyro Sample Rate')}{parameter('INS_GYRO_FILTER')}</fieldset>
            <table><tbody><tr>{['INS_HNTCH_', 'INS_HNTC2_'].map((prefix, index) => <td key={prefix}><fieldset style={{ width: 580 }}><legend>{index ? 'Second' : 'First'} Notch Filter</legend>{numericNames.filter(name => name.startsWith(prefix)).map(name => parameter(name, !name.endsWith('ENABLE') && !(value(params, prefix + 'ENABLE') > 0)))}</fieldset></td>)}</tr></tbody></table>
            <fieldset className="wide" id="Throttle_input" hidden={!modeVisible([1])}><legend>Throttle Based</legend>{input('Throttle', 'Throttle')}</fieldset>
            <fieldset className="wide" id="ESC_input" hidden={!modeVisible([3])}><legend>ESC Telemetry</legend>{input('NUM_MOTORS', 'Number of Motors')}{input('ESC_RPM', 'ESC RPM')}</fieldset>
            <fieldset className="wide" id="RPM_input" hidden={!modeVisible([2, 5])}><legend>RPM/EFI Based</legend>{input('RPM1', 'RPM1')}{input('RPM2', 'RPM2')}</fieldset>
        </form>
        <h2>PIDs</h2><h3 id="PID_title">{axes.find(([key]) => key === axis)?.[1]} axis</h3>
        {window.Plotly && pidPlot && <Plot key={`pid-${generation}`} id="BodePID" plotly={window.Plotly} {...pidPlot} config={config} onError={report} />}
        <p>{axes.map(([key, label]) => <input key={key} type="button" id={`Calculate${label}`} value={`Caculate ${label}`} onClick={() => recalculate(params, key)} />)}</p>
        <form id="PID_params" onSubmit={event => event.preventDefault()}><Settings params={params} prefix="PID_" onChange={graphEdit} />
            <fieldset className="wide"><legend>Loop Rate</legend>{parameter('SCHED_LOOP_RATE')}</fieldset>
            {axes.map(([key, label]) => <fieldset className="wide" key={key}><legend>{label}</legend>{numericNames.filter(name => name.startsWith(`ATC_RAT_${key}_`)).map(name => parameter(name))}</fieldset>)}
        </form>
    </>
}
