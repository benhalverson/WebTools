import { useEffect, useMemo, useRef, useState } from 'react'
import { FileInput, Plot, type PlotFields, type PlotlyApi } from '@webtools/react-workflows'
import type { DataflashLog } from '@webtools/dataflash'
import { parseLog, pythonInputs } from './dataset.ts'
import { Field, MatrixFields, SignalFields } from './forms.tsx'
import { emptySignal, generateFields, initialConfiguration, presetConfiguration, type Configuration, type Mode, type Preset } from './model.ts'
import { flightLayout, flightRange, flightTraces, resultLayout, resultTraces } from './plots.ts'
import { createRuntime, type RuntimeClient } from './runtime-client.ts'
import type { IdentificationResult } from './protocol.ts'
import './style.css'
const flightPlotLayout = flightLayout(), plotConfig = { displaylogo: false }

/** Own dataset/form state, one disposable Python lifetime, and shared Plotly lifecycles. */
export default function App({ plotly, assetBase }: { plotly: PlotlyApi | undefined; assetBase: string }) {
    const [tfSignals, setTfSignals] = useState({ input: emptySignal(), output: emptySignal() })
    const [config, setConfig] = useState(initialConfiguration), [mode, setMode] = useState<Mode | null>(null)
    const [log, setLog] = useState<DataflashLog | null>(null), [output, setOutput] = useState(''), [error, setError] = useState('')
    const [status, setStatus] = useState<'loading' | 'ready' | 'running' | 'error'>('loading'), [attempt, setAttempt] = useState(0)
    const [preset, setPreset] = useState<'manual' | Preset>('manual'), [dimensions, setDimensions] = useState(['','','',''])
    const [generated, setGenerated] = useState(false), [reading, setReading] = useState(false)
    const [results, setResults] = useState<Partial<Record<Mode, IdentificationResult>>>({})
    const result = useMemo(() => { const data = mode ? results[mode] : undefined; return mode && data ? { mode, data } : null }, [mode, results])
    const runtime = useRef<RuntimeClient | null>(null), generation = useRef(0)
    const traces = useMemo(() => flightTraces(log), [log])
    const resultData = useMemo(() => result ? resultTraces(result.data, result.mode) : [], [result])
    const resultPlotLayout = useMemo(() => resultLayout(result?.mode ?? 'tf'), [result?.mode])
    useEffect(() => {
        let active = true
        const client = createRuntime(assetBase, text => { if (active) setOutput(previous => previous + text) })
        runtime.current = client
        client.ready.then(() => { if (active) setStatus('ready') }, reason => { if (active) { setError(String(reason)); setStatus('error') } })
        return () => { active = false; client.dispose(); runtime.current = null }
    }, [assetBase, attempt])
    useEffect(() => () => { generation.current++; document.title = 'ArduPilot SysID' }, [])
    /** Update one owned form property without touching hidden model controls. */
    function update<Key extends keyof Configuration>(key: Key, value: Configuration[Key]): void { setConfig(previous => ({ ...previous, [key]: value })) }
    /** Ignore stale file reads on replacement/unmount and commit only a fully parsed dataset. */
    async function selectFile(file: File | null): Promise<void> {
        const current = ++generation.current
        if (!file) { setReading(false); return }
        setReading(true); setError('')
        try {
            const parsed = await parseLog(await file.arrayBuffer(), assetBase)
            const range = flightRange(flightTraces(parsed))
            if (generation.current !== current) return
            setLog(parsed); setResults({}); setTfSignals({ input: emptySignal(), output: emptySignal() }); setConfig(previous => ({ ...previous, ...(range ? { start: range[0], end: range[1] } : {}), input: emptySignal(), outputs: previous.outputs.map(emptySignal) })); document.title = 'SysID: ' + file.name
        } catch (reason) { if (generation.current === current) setError(String(reason)) }
        finally { if (generation.current === current) setReading(false) }
    }
    /** Generate either the manual dimensions or the exact legacy multirotor preset. */
    function generate(): void {
        try {
            const next = preset === 'manual' ? generateFields(config, ...dimensions.map(value => parseInt(value, 10)) as [number,number,number,number]) : presetConfiguration(config, preset)
            setConfig(next); setDimensions([String(next.outputs.length),String(next.matrixA.length),String(next.parameters.length),String(next.constraints.length)]); setGenerated(true); setError('')
        } catch (reason) { setError(String(reason)) }
    }
    /** Submit a snapshot; obsolete runtimes cannot publish results into a newer lifetime. */
    async function submit(): Promise<void> {
        const client = runtime.current
        if (!log || !mode || !client || status !== 'ready') return
        setStatus('running'); setError(''); setOutput(previous => previous + 'File Submitted successfully. Please wait!!!!!!\n')
        try { const data = await client.run(mode, pythonInputs(log, mode === 'tf' ? { ...config, input: tfSignals.input, outputs: [tfSignals.output] } : config, mode)); if (runtime.current === client) setResults(previous => ({ ...previous, [mode]: data })) }
        catch (reason) { if (runtime.current === client) setError(String(reason)) }
        finally { if (runtime.current === client) setStatus('ready') }
    }
    /** Round the Plotly selected range using the original floor/ceil rules. */
    function relayout(event: PlotFields): void {
        const range = event['xaxis.range'] ?? [event['xaxis.range[0]'],event['xaxis.range[1]']]
        if (Array.isArray(range) && typeof range[0] === 'number' && typeof range[1] === 'number') setConfig(previous => ({ ...previous, start: String(Math.floor(range[0])), end: String(Math.ceil(range[1])) }))
    }
    /** Reset a failed/initializing runtime by disposing its frame before a fresh attempt. */
    function retry(): void { setStatus('loading'); setError(''); setAttempt(value => value + 1) }
    return <>
        <table className="heading"><tbody><tr><td><a href="https://ardupilot.org"><img src={assetBase + 'images/ArduPilot.png'} /></a></td><td><a href="https://github.com/ArduPilot/WebTools"><img width="60" src={assetBase + 'images/github-mark.png'} /><br /><img width="60" src={assetBase + 'images/GitHub_Logo.png'} /></a></td></tr></tbody></table>
        <h1><a href="">ArduPilot System Identification Tool</a></h1>
        <fieldset className="setup" disabled={status === 'running'}><legend>Setup</legend><table><tbody><tr><td><fieldset className="time"><legend>Analysis time</legend><Field id="starttime" label="Start (s)" type="number" min={0} value={config.start} onChange={value => update('start',value)} /><br /><br /><Field id="endtime" label="End (s)" type="number" min={0} value={config.end} onChange={value => update('end',value)} /></fieldset></td><td><FileInput id="fileItem" accept=".bin" onFile={file => { void selectFile(file) }} /></td></tr></tbody></table></fieldset>
        <h2>Flight Data</h2>
        {plotly ? <Plot id="FlightData" plotly={plotly} data={traces} layout={flightPlotLayout} config={plotConfig} onRelayout={relayout} onError={reason => setError(String(reason))} /> : <p role="alert">Plotly failed to load. Reload to retry.</p>}
        <p>Output:</p><textarea id="output" value={output} disabled rows={10} />
        <p role="status">{reading ? 'Reading log...' : status === 'loading' ? 'Initializing Python...' : status === 'running' ? 'Identifying...' : status === 'ready' ? 'Python ready' : 'Python initialization failed'}</p>
        {error && <p role="alert">{error}</p>}
        {(status === 'error' || status === 'loading') && <button onClick={retry}>Retry initialization</button>}
        <fieldset className="controls" disabled={status === 'running'}>
            <form><label><input type="radio" id="tf_select" name="ID_type" checked={mode === 'tf'} onChange={() => { setMode('tf'); setTfSignals({ input: emptySignal(), output: emptySignal() }) }} />Transfer function</label> <label><input type="radio" id="ss_select" name="ID_type" checked={mode === 'ss'} onChange={() => { setMode('ss'); setPreset('manual') }} />State Space</label></form><br />
            {mode === 'tf' && <div id="tf_form"><SignalFields signal={tfSignals.input} log={log} prefix="input" index={1} onChange={value => setTfSignals(previous => ({ ...previous, input: value }))} /><br /><br /><SignalFields signal={tfSignals.output} log={log} prefix="output" index={1} output onChange={value => setTfSignals(previous => ({ ...previous, output: value }))} /><br /><br />{(['numerator','denominator','symbols'] as const).map((key,i) => <div className="scalar" key={key}><Field id={['customNumerator','customDenominator','tf_params'][i]!} label={['Numerator:','Denominator:','Symbolic params:'][i]!} value={config[key]} onChange={value => update(key,value)} /></div>)}</div>}
            {mode === 'ss' && <div id="ss_form"><label>Enter fields or select to pre-populate fields:<br /><select id="populate_dropdown" value={preset} onChange={event => setPreset(event.currentTarget.value as 'manual' | Preset)}>{(['manual','MR_Roll','MR_Pitch','MR_Yaw','MR_Vertical'] as const).map((value,i) => <option key={value} value={value}>{['Manual Entry','Multirotor Roll','Multirotor Pitch','Multirotor Yaw','Multirotor Vertical'][i]}</option>)}</select></label><br /><br />
                {dimensions.map((value,i) => <Field key={i} id={['num_Outputs','A_order','num_params','num_cons'][i]!} label={['Outputs:','Matrix A order:','Number of params:','Number of Constraints:'][i]!} type="number" value={value} onChange={next => setDimensions(previous => previous.map((v,j) => i === j ? next : v))} />)}<br /><br /><button id="createFieldsButton" type="button" onClick={generate}>Generate fields</button><br /><br />
                {generated && <><SignalFields signal={config.input} log={log} prefix="input" index={1} onChange={value => update('input',value)} /><br /><br />{config.outputs.map((signal,i) => <SignalFields key={i} signal={signal} log={log} prefix="output" index={i + 1} output onChange={value => update('outputs',config.outputs.map((s,j) => i === j ? value : s))} />)}<br /><br />
                    {config.parameters.map((value,i) => <Field key={i} id={`param_name_${i + 1}`} label={` Param ${i + 1}:`} value={value} onChange={next => update('parameters',config.parameters.map((v,j) => i === j ? next : v))} />)}<br /><br />
                    {config.bounds.map((row,i) => <span key={i}> Bound {i + 1}: {row.map((value,j) => <Field key={j} id={`Bound_${j ? 'max' : 'min'}_${i + 1}`} label="" type="number" value={value} onChange={next => update('bounds',config.bounds.map((r,ri) => ri === i ? r.map((v,ci) => ci === j ? next : v) : r))} />)}</span>)}<br /><br />
                    {(['matrixA','matrixB'] as const).map(key => <MatrixFields key={key} id={key} label={key === 'matrixA' ? 'Matrix A' : 'Matrix B'} values={config[key]} onChange={value => update(key,value)} />)}
                    {config.constraints.map((row,i) => <span key={i}>Constraint {i + 1}: {row.map((value,j) => <Field key={j} id={`Constraint_${j ? 'B' : 'A'}_${i + 1}`} label="" value={value} onChange={next => update('constraints',config.constraints.map((r,ri) => ri === i ? r.map((v,ci) => ci === j ? next : v) : r))} />)}</span>)}<br /><br />
                    {(['H0','H1'] as const).map(key => <MatrixFields key={key} id={key} label={key} values={config[key]} onChange={value => update(key,value)} />)}</>}
            </div>}
            {result && result.mode === mode && plotly && <Plot id={mode === 'tf' ? 'plotDiv' : 'plotDiv_ss'} plotly={plotly} data={resultData} layout={resultPlotLayout} onError={reason => setError(String(reason))} />}
            <Field id="startfreq" label="Start frequency (rad/sec):" type="number" value={config.frequencyStart} onChange={value => update('frequencyStart',value)} /> <Field id="endfreq" label="End frequency (rad/sec):" type="number" value={config.frequencyEnd} onChange={value => update('frequencyEnd',value)} /><br /><br /><Field id="cutofffreq" label="LPF cutoff frequency (rad/sec):" type="number" value={config.cutoff} onChange={value => update('cutoff',value)} /><br /><br />
            <button id="parseButton" type="button" disabled={!log || !mode || status !== 'ready' || reading || (mode === 'ss' && !generated)} onClick={() => { void submit() }}>Submit</button>
        </fieldset>
    </>
}
