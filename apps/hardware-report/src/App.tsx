import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { FileInput, Plot, downloadFile, type PlotlyApi, type SaveAs } from '@webtools/react-workflows'
import { availableGroups, buildReport, exportParameters, parseParameterFile, type Parameters } from './model/index.ts'
import { offsetLayout, offsetTraces } from './plot.ts'
import { ParameterRead } from './ParameterRead.tsx'
import './style.css'

interface AppProps {
    readonly plotly: PlotlyApi | undefined
    readonly saveAs: SaveAs | undefined
    readonly assetBase: string
}
const plotConfig = { displaylogo: false }
const groupSections = [
    { title: 'Inertial Sensors', ids: ['param_ins_gyro', 'param_ins_accel', 'param_ins_use', 'param_ins_position'] },
    { title: 'Compass', ids: ['param_compass_calibration', 'param_compass_ordering', 'param_compass_id', 'param_compass_use', 'param_declination'] },
    { title: 'Barometer', ids: ['param_baro_calibration', 'param_baro_id', 'param_baro_wind_comp'] },
    { title: 'Airspeed', ids: ['param_airspeed_type', 'param_airspeed_calibration', 'param_airspeed_use'] },
    { title: 'AHRS', ids: ['param_ahrs_trim', 'param_ahrs_orientation'] },
    { title: 'RC', ids: ['param_rc_calibration', 'param_rc_reverse', 'param_rc_dz', 'param_rc_options', 'param_rc_flightmodes'] },
]

/** Formats unknown file and vendor failures for the recoverable error message. */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/** Owns parameter-file state and export choices. Read generations ensure a slow
 * file cannot replace a newer selection or resurrect a report after reset. */
export default function App({ plotly, saveAs, assetBase }: AppProps) {
    const [params, setParams] = useState<Parameters>({})
    const [filename, setFilename] = useState('')
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [error, setError] = useState<string | null>(null)
    const [plotError, setPlotError] = useState<string | null>(null)
    const [request, setRequest] = useState<{ file: File; generation: number } | null>(null)
    const [revision, setRevision] = useState(0)
    const generation = useRef(0)
    const input = useRef<HTMLInputElement>(null)
    const report = useMemo(() => buildReport(params), [params])
    const groups = useMemo(() => availableGroups(params), [params])
    const traces = useMemo(() => offsetTraces(report.offsets), [report])
    const layout = useMemo(() => offsetLayout(report.maxOffset), [report])
    const haveParameters = Object.keys(params).length > 0

    useEffect(() => {
        const originalTitle = document.title
        return () => { generation.current++; document.title = originalTitle }
    }, [])
    useEffect(() => {
        document.title = filename ? `Hardware Report: ${filename}` : 'ArduPilot Hardware Report'
    }, [filename])

    /** Clears the current report and invalidates pending reads and plot work. */
    function clearReport(): number {
        const current = ++generation.current
        setParams({})
        setFilename('')
        setError(null)
        setPlotError(null)
        setRequest(null)
        setRevision(value => value + 1)
        return current
    }

    /** Resets the native picker as well as React state so the same file can load again. */
    function reset(): void {
        clearReport()
        if (input.current) input.current.value = ''
    }

    /** Selects a local parameter file and mounts its loading resource. Binary
     * logs stay available in the complete public application. */
    function loadFile(file: File | null): void {
        const current = clearReport()
        if (!file) return
        setFilename(file.name)
        if (file.name.toLowerCase().endsWith('.bin')) {
            setError('Binary logs are available in the complete Hardware Report linked above. Select a .param or .parm file here.')
            return
        }
        setRequest({ file, generation: current })
    }

    /** Parses one scheduled read and commits only while its selection is current.
     * Rejections propagate to the shared legacy loading contract unchanged. */
    async function readFile(file: File): Promise<void> {
        const current = request?.generation
        const text = await file.text()
        if (generation.current !== current) return
        const nextParams = parseParameterFile(text)
        buildReport(nextParams)
        const nextGroups = availableGroups(nextParams)
        setSelected(previous => new Set([...previous].filter(id => nextGroups.some(group => group.id === id && !group.disabled))))
        setParams(nextParams)
    }

    /** Reports the active loading resource's failure while leaving its overlay visible. */
    function reportReadError(cause: unknown): void { setError(errorMessage(cause)) }

    /** Toggles one independent export category without mutating prior state. */
    function toggleGroup(id: string, checked: boolean): void {
        setSelected(previous => {
            const next = new Set(previous)
            if (checked) next.add(id)
            else next.delete(id)
            return next
        })
    }

    /** Saves the exact legacy serialization and filename through pinned FileSaver. */
    function save(mode: 'all' | 'minimal'): void {
        if (!haveParameters) return
        try {
            if (!saveAs) throw new Error('Unable to load the download library. Please reload this page.')
            const base = filename.substring(0, filename.lastIndexOf('.')) || filename || 'log'
            const suffix = mode === 'all' ? '.param' : '_minimal.param'
            downloadFile(saveAs, new Blob([exportParameters(params, selected, mode)], { type: 'text/plain;charset=utf-8' }), base + suffix)
            setError(null)
        } catch (cause) { setError(errorMessage(cause)) }
    }

    /** Renders an export checkbox with the legacy available-parameter tooltip. */
    function checkbox(id: string) {
        const group = groups.find(item => item.id === id)
        if (!group) return null
        return <Fragment key={id}><input type="checkbox" id={id} disabled={group.disabled} checked={selected.has(id)} title={group.title}
            onChange={event => toggleGroup(id, event.currentTarget.checked)} />{' '}
            <label htmlFor={id} title={group.title}>{group.label}</label><br /></Fragment>
    }

    /** Reports Plotly errors without throwing from its asynchronous callback. */
    function reportPlotError(cause: unknown): void { setPlotError(errorMessage(cause)) }

    return <>
        <table className="brand"><tbody><tr><td><a href="https://ardupilot.org"><img src={`${assetBase}images/ArduPilot.png`} alt="ArduPilot" /></a></td><td>
            <a href="https://github.com/ArduPilot/WebTools"><img src={`${assetBase}images/github-mark.png`} width="60" alt="GitHub" /></a><br />
            <a href="https://github.com/ArduPilot/WebTools"><img src={`${assetBase}images/GitHub_Logo.png`} width="60" alt="GitHub" /></a>
        </td></tr></tbody></table>
        <h1><a href="">ArduPilot Hardware Report</a></h1>
        <p>Parameter-file preview. Use the <a href={`${assetBase}../HardwareReport/`}>complete Hardware Report</a> for binary logs and other report workflows.</p>
        <FileInput id="fileItem" accept=".param,.parm" inputRef={input} onFile={file => { void loadFile(file) }} />{' '}
        <input id="OpenIn" type="button" value="Open In" disabled />{' '}
        <button type="button" onClick={reset}>Reset</button>
        {error && <p role="alert">{error}</p>}
        {report.warnings.length > 0 && <><h3>Warnings</h3><div id="warnings">{report.warnings.map(warning => <table key={warning}><tbody><tr><td><img src={`${assetBase}images/exclamation-triangle-orange.svg`} width="40" className="warning-icon" alt="Warning" /></td><td>{warning}</td></tr></tbody></table>)}</div></>}
        {report.sections.map(section => <Fragment key={section.id}><h3>{section.title}</h3><div id={section.id} className="report-section">
            {section.summary && <>{section.summary}<br /><br /></>}
            <table><tbody><tr>{section.devices.map((device, index) => <td key={index}><fieldset><legend>{device.title}</legend>
                {device.lines.map((line, lineIndex) => <Fragment key={lineIndex}>{line}
                    {Array.from({ length: device.breaksAfter?.[lineIndex] ?? 0 }, (_, breakIndex) => <br key={breakIndex} />)}
                </Fragment>)}
            </fieldset></td>)}</tr></tbody></table>
        </div></Fragment>)}
        {haveParameters && <><h3>Download Parameters</h3><div id="ParametersContent">
            <p><button type="button" onClick={() => save('all')}>Save All Parameters</button></p>
            <h4>Minimal Configuration</h4>
            <p className="minimal-description">Configuration parameters excluding calibrations, flight modes, etc. You may select certain of these to be included with the check boxes below.
                For sharing and comparing similar vehicle configurations.</p>
            <fieldset className="base-choices"><legend>Basic Configuration Parameters</legend>
                <input type="radio" id="param_base_all" name="param_base" checked readOnly /><label htmlFor="param_base_all">All</label>{' '}
                <input type="radio" id="param_base_changed" name="param_base" disabled /><label htmlFor="param_base_changed">Changed from defaults</label><br />
            </fieldset>
            <form id="params"><table><tbody>{[0, 3].map(start => <tr key={start}>{groupSections.slice(start, start + 3).map(section => <td key={section.title}>
                <fieldset className="parameter-group"><legend>{section.title}</legend>{section.ids.map(checkbox)}</fieldset>
            </td>)}</tr>)}</tbody></table>
                <fieldset className="stream-rates"><legend>Stream rates</legend>{Array.from({ length: 7 }, (_, index) => checkbox(`param_stream_${index}`))}</fieldset>
            </form><br /><button type="button" id="SaveMinimalParams" onClick={() => save('minimal')}>Save Minimal Parameters</button>
        </div></>}
        {report.maxOffset > 0 && <div><h3>Position offsets</h3>
            {!plotly && <p role="alert">Unable to load the plot library. Please reload this page.</p>}
            {plotError && <p role="alert">Unable to render position offsets: {plotError}</p>}
            {plotly && <Plot key={revision} id="POS_OFFSETS" plotly={plotly} data={traces} layout={layout} config={plotConfig} onError={reportPlotError} />}
        </div>}
        {request && <ParameterRead key={request.generation} file={request.file} onRead={readFile} onError={reportReadError} />}
    </>
}
