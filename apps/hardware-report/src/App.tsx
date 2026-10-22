import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { FileInput, Plot, useOpenInReceiver, type PlotlyApi, type SaveAs } from '@webtools/react-workflows'
import { buildReport, parseParameterFile, type Parameters } from './model/index.ts'
import { extractLogParameters, extractWaypoints, extractEmbeddedFiles, type LogParameters, type WaypointGroup, type EmbeddedFile } from './model/log-extractions.ts'
import { buildLogReport, type LogHardwareReport } from './model/log-report.ts'
import { buildLogPlots, type LogPlot } from './model/log-plots.ts'
import { parserConstructor } from './parser.ts'
import { offsetLayout, offsetTraces } from './plot.ts'
import { ParameterRead } from './ParameterRead.tsx'
import { ParameterExports } from './ParameterExports.tsx'
import { Extractions } from './Extractions.tsx'
import { LogReport, LogWarnings } from './LogReport.tsx'
import { LogPlots } from './LogPlots.tsx'
import { OpenInMenu } from './OpenInMenu.tsx'
import './style.css'

interface AppProps {
    readonly plotly: PlotlyApi | undefined
    readonly saveAs: SaveAs | undefined
    readonly assetBase: string
}
interface LoadedLog {
    parameters: LogParameters
    report: LogHardwareReport
    plots: LogPlot[]
    waypoints: WaypointGroup[]
    files: EmbeddedFile[]
    byteLength: number
}
interface ReadRequest { file: File; generation: number; binary: boolean }
const plotConfig = { displaylogo: false }
const emptyParameters: Parameters = {}
const emptyChanges: LogParameters['changes'] = {}

/** Format local file and vendor failures for the recoverable report message. */
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }

/** Own the selected report and generation of every asynchronous read. Derived
 * snapshots contain no parser references, so replaced logs release their buffers;
 * metadata, Open In, and Plotly resources belong to the mounted child report. */
export default function App({ plotly, saveAs, assetBase }: AppProps) {
    const [params, setParams] = useState<Parameters>(emptyParameters)
    const [log, setLog] = useState<LoadedLog | null>(null)
    const [filename, setFilename] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [plotError, setPlotError] = useState<string | null>(null)
    const [request, setRequest] = useState<ReadRequest | null>(null)
    const [messages, setMessages] = useState<readonly string[] | null>(null)
    const [revision, setRevision] = useState(0)
    const generation = useRef(0)
    const input = useRef<HTMLInputElement>(null)
    const report = useMemo(() => log?.report.hardware ?? buildReport(params), [log, params])
    const traces = useMemo(() => offsetTraces(report.offsets), [report])
    const layout = useMemo(() => offsetLayout(report.maxOffset), [report])

    useEffect(() => {
        const originalTitle = document.title
        return () => { generation.current++; document.title = originalTitle }
    }, [])
    useEffect(() => { document.title = filename ? `Hardware Report: ${filename}` : 'ArduPilot Hardware Report' }, [filename])

    /** Invalidate pending reads and remove the current report's resource owners. */
    function clearReport(): number {
        const current = ++generation.current
        setParams(emptyParameters)
        setLog(null)
        setFilename('')
        setError(null)
        setPlotError(null)
        setRequest(null)
        setMessages(null)
        setRevision(value => value + 1)
        return current
    }

    /** Reset the picker so the same local file can be selected again. */
    function reset(): void { clearReport(); if (input.current) input.current.value = '' }

    /** Start either local entry path and give this selection exclusive ownership. */
    function loadFile(file: File | null, binary = file?.name.toLowerCase().endsWith('.bin') ?? false, title = file?.name ?? ''): void {
        const current = clearReport()
        if (!file) return
        setFilename(title)
        setRequest({ file, generation: current, binary })
    }

    /** Mirror the legacy File transfer in the native picker before loading it. */
    function receiveFile(file: File): void {
        if (input.current) {
            const transfer = new DataTransfer()
            transfer.items.add(file)
            input.current.files = transfer.files
        }
        loadFile(file)
    }

    /** A raw Open In buffer has no filename; legacy downloads use the log stem. */
    function receiveBuffer(buffer: ArrayBuffer): void { loadFile(new File([buffer], 'log.bin'), true, '') }

    /** Surface the active reader's error; its loading owner retains legacy rejection behavior. */
    function reportReadError(cause: unknown): void { setError(errorMessage(cause)) }
    useOpenInReceiver(receiveFile, receiveBuffer, undefined, reportReadError)

    /** Read a scheduled selection and publish its complete snapshot atomically.
     * Every await checks the generation before parser work or state publication. */
    async function readFile(file: File): Promise<void> {
        const selection = request
        if (!selection) return
        const current = selection.generation
        if (!selection.binary) {
            const text = await file.text()
            if (generation.current !== current) return
            const next = parseParameterFile(text)
            buildReport(next)
            setParams(next)
            return
        }
        const bytes = await file.arrayBuffer()
        if (generation.current !== current) return
        const Parser = await parserConstructor(assetBase)
        if (generation.current !== current) return
        const parsed = new Parser()
        parsed.processData(bytes, [])
        setMessages(Object.keys(parsed.messageTypes))
        if (!('PARM' in parsed.messageTypes)) {
            setError('No parameter values found in log')
            return
        }
        const parameters = extractLogParameters(parsed)
        const snapshot: LoadedLog = {
            parameters, report: buildLogReport(parsed, parameters.params),
            plots: buildLogPlots(parsed, parameters.params), waypoints: extractWaypoints(parsed),
            files: extractEmbeddedFiles(parsed), byteLength: bytes.byteLength,
        }
        setParams(parameters.params)
        setLog(snapshot)
    }

    /** Report vendor rendering failures without throwing from its async callback. */
    function reportPlotError(cause: unknown): void { setPlotError(errorMessage(cause)) }

    /** Clear an earlier export failure after the download boundary succeeds. */
    function clearExportError(): void { setError(null) }

    const crashDumps = log?.files.filter(file => file.crashDump) ?? []
    return <>
        <table className="brand"><tbody><tr><td><a href="https://ardupilot.org"><img src={`${assetBase}images/ArduPilot.png`} alt="ArduPilot" /></a></td><td>
            <a href="https://github.com/ArduPilot/WebTools"><img src={`${assetBase}images/github-mark.png`} width="60" alt="GitHub" /></a><br />
            <a href="https://github.com/ArduPilot/WebTools"><img src={`${assetBase}images/GitHub_Logo.png`} width="60" alt="GitHub" /></a>
        </td></tr></tbody></table>
        <h1><a href="">ArduPilot Hardware Report</a></h1>
        <FileInput id="fileItem" accept=".param,.parm,.bin" inputRef={input} onFile={loadFile} />{' '}
        <OpenInMenu key={`open-${revision}`} file={request?.binary && filename ? request.file : null} messages={messages} />{' '}
        <button type="button" onClick={reset}>Reset</button>
        {error && <p role="alert">{error}</p>}
        <LogWarnings warnings={report.warnings} watchdog={log?.report.watchdogDetected ?? false} crashFiles={crashDumps.map(file => file.name)} assetBase={assetBase} />
        {log && <LogReport key={`before-${revision}`} report={log.report} assetBase={assetBase} />}
        {report.sections.map(section => <Fragment key={section.id}><h3>{section.title}</h3><div id={section.id} className="report-section">
            {section.summary && <>{section.summary}<br /><br /></>}
            <table><tbody><tr>{section.devices.map((device, index) => <td key={index}><fieldset><legend>{device.title}</legend>
                {device.lines.map((line, lineIndex) => <Fragment key={lineIndex}>{line}
                    {Array.from({ length: device.breaksAfter?.[lineIndex] ?? 0 }, (_, breakIndex) => <br key={breakIndex} />)}
                </Fragment>)}
            </fieldset></td>)}</tr></tbody></table>
        </div></Fragment>)}
        {log && <LogReport key={`after-${revision}`} report={log.report} assetBase={assetBase} area="afterSensors" />}
        <ParameterExports params={params} defaults={log?.parameters.defaults ?? emptyParameters} changes={log?.parameters.changes ?? emptyChanges} filename={filename} saveAs={saveAs} onError={reportReadError} onSaved={clearExportError} />
        {log && <Extractions waypoints={log.waypoints} files={log.files} saveAs={saveAs} onError={reportReadError} />}
        {(report.maxOffset > 0 || !!log?.plots.length) && !plotly && <p role="alert">Unable to load the plot library. Please reload this page.</p>}
        {plotError && <p role="alert">Unable to render report plots: {plotError}</p>}
        {report.maxOffset > 0 && <div><h3>Position offsets</h3>
            {plotly && <Plot key={revision} id="POS_OFFSETS" plotly={plotly} data={traces} layout={layout} config={plotConfig} onError={reportPlotError} />}
        </div>}
        {log && <LogPlots key={`plots-${revision}`} plots={log.plots} plotly={plotly} byteLength={log.byteLength} onError={reportPlotError} />}
        {request && <ParameterRead key={`read-${request.generation}`} file={request.file} onRead={readFile} onError={reportReadError} />}
    </>
}
