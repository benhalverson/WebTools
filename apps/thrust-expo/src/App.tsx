import { useEffect, useReducer, useRef, useState } from 'react'
import { FileInput, ParameterControl, downloadFile, type PlotlyApi, type SaveAs } from '@webtools/react-workflows'
import { parameterFile, parameterNames, type ParameterName } from './model.ts'
import { initialState, reduce } from './state.ts'
import { ThrustPlots } from './ThrustPlots.tsx'
import { ThrustTable, type TabulatorConstructor } from './ThrustTable.tsx'
import './style.css'
import { useTooltips } from './tooltips.ts'

export interface AppProps { plotly: PlotlyApi | undefined; tabulator: TabulatorConstructor | null; saveAs: SaveAs | undefined; assetBase: string }
const parameterColumns: ParameterName[][] = [['MOT_SPIN_ARM', 'MOT_SPIN_MIN', 'MOT_SPIN_MAX'], ['MOT_PWM_MIN', 'MOT_PWM_MAX', 'MOT_THST_EXPO']]

/** Present vendor and I/O errors without requiring errors to originate in this realm. */
function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }

/** Own all editable inputs, ordered parameter imports and fitting snapshots; children own imperative vendor resources. */
export default function App({ plotly, tabulator, saveAs, assetBase }: AppProps) {
    const [state, dispatch] = useReducer(reduce, undefined, () => initialState())
    const [metadata, setMetadata] = useState<unknown>({})
    const [error, setError] = useState<string | null>(null)
    const fileInput = useRef<HTMLInputElement>(null)
    const content = useRef<HTMLDivElement>(null)
    useTooltips(content)
    const fileReader = useRef<FileReader | null>(null)
    useEffect(() => {
        const controller = new AbortController()
        let active = true
        /** Load only the local authoritative metadata and suppress responses after unmount. */
        async function load(): Promise<void> {
            try {
                const response = await fetch(assetBase + 'params.json', { signal: controller.signal })
                if (!response.ok) throw new Error(`Parameter metadata: HTTP ${response.status}`)
                const data: unknown = await response.json()
                if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('Invalid parameter metadata.')
                if (active) setMetadata(data)
            } catch (failure) { if (active) setError(message(failure)) }
        }
        void load()
        return () => { active = false; controller.abort() }
    }, [assetBase])
    useEffect(() => {
        const node = content.current
        /** Commit on native change (blur/Enter), keeping incomplete typed text editable. */
        function change(event: Event): void {
            const input = event.target
            if (!(input instanceof HTMLInputElement) || !parameterNames.includes(input.id as ParameterName)) return
            dispatch({ type: 'commit', name: input.id as ParameterName })
        }
        node?.addEventListener('change', change)
        return () => { node?.removeEventListener('change', change); fileReader.current?.abort(); fileReader.current = null }
    }, [])

    /** Abort an earlier import so a stale file cannot overwrite newer user work. */
    function importFile(file: File | null): void {
        fileReader.current?.abort()
        if (!file) return
        const reader = new FileReader()
        fileReader.current = reader
        reader.onload = () => {
            if (fileReader.current !== reader) return
            fileReader.current = null
            if (typeof reader.result === 'string') dispatch({ type: 'import', text: reader.result })
        }
        reader.onerror = () => { if (fileReader.current === reader) { fileReader.current = null; setError(reader.error?.message ?? 'Unable to read parameter file.') } }
        reader.readAsText(file)
    }

    /** Restore original inputs and replace owned vendor lifetimes; cancel in-flight file imports. */
    function reset(): void {
        fileReader.current?.abort(); fileReader.current = null
        if (fileInput.current) fileInput.current.value = ''
        setError(null)
        dispatch({ type: 'reset' })
    }

    /** Download the exact legacy parameter bytes through the pinned FileSaver implementation. */
    function save(): void {
        try {
            if (!saveAs) throw new Error('Unable to load the download library. Please reload this page.')
            downloadFile(saveAs, new Blob([parameterFile(state.calculation.state)], { type: 'text/plain;charset=utf-8' }), 'ThrustExpo.param')
        } catch (failure) { setError(message(failure)) }
    }

    /** Render the shared metadata control with the legacy field-specific numeric step. */
    function parameter(name: ParameterName) {
        return <div className="param-row" key={name}><ParameterControl name={name} metadata={metadata} value={state.inputs[name]}
            placeholder={name === 'MOT_THST_HOVER' ? '?' : ''} disabled={name === 'MOT_THST_HOVER'} constrain={name.startsWith('MOT_SPIN') || name === 'MOT_THST_EXPO'}
            step={name.startsWith('MOT_PWM') ? 1 : name === 'MOT_THST_EXPO' ? 0.001 : 0.01}
            onChange={value => dispatch({ type: 'edit', name, value })} /></div>
    }

    /** Surface a failed plot operation while keeping controls and Reset available. */
    function plotError(failure: unknown): void { setError(message(failure)) }

    return <>
        <header className="header"><div className="logo-row"><div><a href="https://ardupilot.org"><img src={assetBase + 'images/ArduPilot.png'} alt="ArduPilot Logo" /></a></div>
            <div className="github-logo-cell"><a href="https://github.com/ArduPilot/WebTools"><img src={assetBase + 'images/github-mark.png'} alt="GitHub Mark" /></a><br />
                <a href="https://github.com/ArduPilot/WebTools"><img src={assetBase + 'images/GitHub_Logo.png'} alt="GitHub Logo" /></a></div></div>
            <h1><a href=""> ArduPilot Thrust Expo </a></h1>
            <div id="app-description">This tool estimates thrust linearization using thrust test stand data. Load a parameter file or enter parameters manually. Copy and paste test stand data from a spreadsheet or enter it manually (press enter to edit a single cell). Current data is optional (for reference only - not used in calculation). Once the plot is generated, adjust MOT_THST_EXPO to improve the linear fit. If the curve is poorly matched at the extremes, do not chase a perfect fit. Rather, focus on midrange throttle linearity.</div>
        </header>
        <div className="content" ref={content}>
            {error && <p role="alert">{error}</p>}
            {!tabulator && <p role="alert">Unable to load the table library. Please reload this page.</p>}
            {!plotly && <p role="alert">Unable to load the plot library. Please reload this page.</p>}
            <table><tbody><tr><td><fieldset><legend>Parameters <img className="tooltip-trigger" src={assetBase + 'images/question-circle.svg'} title="Load a parameter file or enter parameters manually to calculate thrust linearization." /></legend>
                <div className="param-controls"><FileInput id="paramFile" accept=".param,.parm,.txt" inputRef={fileInput} onFile={importFile} /><div className="param-controls-right">
                    <button id="reset" className="tooltip-trigger" title="Clear data and reset the web tool." onClick={reset}>Reset</button>
                    <button id="load-example" className="tooltip-trigger" title="Show example (will overwrite existing table data)." onClick={() => dispatch({ type: 'example' })}>Example</button>
                    <button id="save-params" onClick={save}>Save Parameters</button></div></div>
                <div className="param-grid">{parameterColumns.map((column, index) => <div className="param-column" key={index}>{column.map(parameter)}</div>)}</div>
            </fieldset></td><td><fieldset><legend>Hover Thrust Estimate <img className="tooltip-trigger" src={assetBase + 'images/question-circle.svg'} title="Optional: Enter number of motors and total mass to estimate hover thrust. Use MOT_HOVER_LEARN rather than setting the estimated value explicitly. The learned value may be useful to help validate the generated thrust curve." /></legend>
                <div className="param-grid"><div className="param-column"><div className="param-row" title="Number of thrust producing motors."><label htmlFor="MOTOR_COUNT">Number of motors</label><input id="MOTOR_COUNT" name="MOTOR_COUNT" type="number" min="1" max="12" value={state.inputs.MOTOR_COUNT} onChange={event => dispatch({ type: 'edit', name: 'MOTOR_COUNT', value: event.currentTarget.value })} /></div>{parameter('MOT_THST_HOVER')}</div>
                    <div className="param-column"><div className="param-row" title="All-up weight (AUW) including battery and payload. Must be same units as measured thrust."><label htmlFor="COPTER_AUW">All-up weight (AUW)</label><input id="COPTER_AUW" name="COPTER_AUW" type="number" min="0" step="0.1" value={state.inputs.COPTER_AUW} onChange={event => dispatch({ type: 'edit', name: 'COPTER_AUW', value: event.currentTarget.value })} /></div></div></div>
            </fieldset></td></tr></tbody></table>
            <ThrustTable key={state.revision} rows={state.replacement} revision={state.revision} tabulator={tabulator} onData={rows => dispatch({ type: 'rows', rows })} onError={setError} />
            {plotly && <ThrustPlots calculation={state.calculation} plotly={plotly} onError={plotError} />}
        </div>
    </>
}
