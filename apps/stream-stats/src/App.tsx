import { useEffect, useMemo, useRef, useState } from 'react'
import { FileInput, OpenIn, Plot, useOpenInReceiver, type PlotFields, type PlotlyApi } from '@webtools/react-workflows'
import { rates, type Dataset } from './model.ts'
import { parseInput } from './parser.ts'
import { MAV_COMPONENT } from './mavlink.ts'
import { plotData, rateLayout, linkedSelection, emptySelection, type Selection } from './plots.ts'
import './style.css'
const config = { displaylogo: false }
const pieLayout = { width: 800, height: 800, showlegend: false, margin: { b: 10, l: 50, r: 50, t: 10 } }
/** Own file reads, parser generations, selections and plot lifetimes in React. */
export default function App({ plotly, assetBase }: { plotly: PlotlyApi | undefined; assetBase: string }) {
    const [dataset, setDataset] = useState<Dataset | null>(null)
    const [file, setFile] = useState<File | null>(null)
    const [bits, setBits] = useState(true)
    const [width, setWidth] = useState('10')
    const [excluded, setExcluded] = useState<Set<string>>(new Set())
    const [selection, setSelection] = useState(emptySelection)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [menu, setMenu] = useState(false)
    const generation = useRef(0)
    const reader = useRef<FileReader | null>(null)
    const input = useRef<HTMLInputElement>(null)
    useEffect(() => () => { generation.current++; reader.current?.abort() }, [])
    /** Invalidate pending reads/imports and release all mounted plot state. */
    function reset(): number {
        generation.current++; reader.current?.abort(); reader.current = null
        setDataset(null); setFile(null); setExcluded(new Set()); setSelection(emptySelection()); setError(''); setLoading(false); setMenu(false)
        return generation.current
    }
    /** Present only errors belonging to a still-current mounted request. */
    function failure(reason: unknown): void { setError(reason instanceof Error ? reason.message : String(reason)) }
    /** Parse asynchronously, discarding stale completion after replacement or unmount. */
    async function ingest(bytes: ArrayBuffer, binary: boolean, token: number): Promise<void> {
        try { const value = await parseInput(bytes, binary, assetBase); if (generation.current === token) setDataset(value) }
        catch (reason) { if (generation.current === token) failure(reason) }
        finally { if (generation.current === token) setLoading(false) }
    }
    /** Abort the previous reader and dispatch only supported local file formats. */
    function select(next: File | null): void {
        const token = reset()
        if (!next) return
        setFile(next)
        const name = next.name.toLowerCase()
        if (!name.endsWith('.bin') && !name.endsWith('.tlog')) return
        setLoading(true)
        const read = new FileReader(); reader.current = read
        read.onload = () => { if (generation.current === token && read.result instanceof ArrayBuffer) void ingest(read.result, name.endsWith('.bin'), token) }
        read.onerror = () => { if (generation.current === token) { failure(read.error ?? new Error('Unable to read file')); setLoading(false) } }
        read.readAsArrayBuffer(next)
    }
    /** The legacy buffer transport is binary; retain that format assumption. */
    function receiveBuffer(bytes: ArrayBuffer): void { const token = reset(); setLoading(true); void ingest(bytes, true, token) }
    /** Keep the native picker and React's selected file aligned for Open In transfers. */
    function receiveFile(next: File): void {
        if (input.current) { const transfer = new DataTransfer(); transfer.items.add(next); input.current.files = transfer.files }
        select(next)
    }
    useOpenInReceiver(receiveFile, receiveBuffer, undefined, failure)
    /** Retain child selections while their parent component is excluded. */
    function toggle(key: string): void { setExcluded(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next }) }
    /** Synchronize zoom/reset while ignoring Plotly notifications of unchanged ranges. */
    function relayout(source: keyof Selection, event: PlotFields): void {
        setSelection(previous => linkedSelection(previous, source, event))
    }
    const binWidth = Number.parseFloat(width)
    const validWidth = Number.isFinite(binWidth) && binWidth >= 0.1
    const result = useMemo(() => dataset && validWidth ? rates(dataset, binWidth, bits, excluded) : null, [dataset, validWidth, binWidth, bits, excluded])
    const plots = useMemo(() => result ? plotData(result, bits, !dataset?.systems) : null, [result, bits, dataset])
    const totalLayout = useMemo(() => rateLayout(bits, selection.total.x, selection.total.y), [bits, selection.total])
    const messageLayout = useMemo(() => rateLayout(bits, selection.messages.x, selection.messages.y), [bits, selection.messages])
    return <>
        <table className="stream-header"><tbody><tr><td><a href="https://ardupilot.org"><img src={assetBase + 'images/ArduPilot.png'} /></a></td><td><a href="https://github.com/ArduPilot/WebTools"><img className="github-logo" src={assetBase + 'images/github-mark.png'} /><br /><img className="github-logo" src={assetBase + 'images/GitHub_Logo.png'} /></a></td></tr></tbody></table>
        <h1><a href="" style={{ color: '#000000', textDecoration: 'none' }}>Stream Stats</a></h1>
        <FileInput id="fileItem" accept=".bin,.tlog" inputRef={input} onFile={select} />{' '}
        <input id="OpenIn" type="button" value="Open In" disabled={!file} onClick={() => setMenu(!menu)} />{' '}
        <button onClick={() => { reset(); if (input.current) input.current.value = '' }}>Reset</button>
        {menu && <div className="open-menu"><OpenIn file={file} messages={dataset?.systems ? null : dataset?.messages ?? null} /></div>}
        {loading && <p role="status">Loading…</p>}{error && <p role="alert">{error}</p>}{!plotly && <p role="alert">Plotly failed to load. Please reload this page.</p>}
        {dataset?.systems && <><h3>MAVLink</h3><div id="MAVLink">{Object.entries(dataset.systems).map(([system, components]) => <section key={system}><h4>System ID: {system}</h4><table><tbody><tr>{Object.entries(components).map(([component, value]) => {
            const key = `${system},${component}`
            return <td key={component}><fieldset><legend>Component ID: {component}</legend>ID Name: {MAV_COMPONENT[component] ?? 'Unknown'}<br />MAVLink Version: {Array.from(value.version).toSorted().join(', ')}<br />Signing: {value.signed ? '✅' : '❌'}<br />Dropped messages: {value.dropped} / {value.received} ({(value.dropped / value.received * 100).toFixed(2)}%)<br />
                <label><input id={key} type="checkbox" checked={!excluded.has(key)} onChange={() => toggle(key)} />Include</label>
                <details><summary>Messages</summary>{Object.entries(value.msg).map(([name, message]) => <fieldset key={name}><legend>{name}</legend>Count: {message.time.length}<br />{value.version.size > 1 && <>MAVLink Version: {Array.from(message.version).toSorted().join(', ')}<br /></>}{value.signed && <>Signing: {message.signed ? '✅' : '❌'}<br /></>}<label><input id={`${key},${name}`} type="checkbox" checked={!excluded.has(`${key},${name}`)} disabled={excluded.has(key)} onChange={() => toggle(`${key},${name}`)} />Include</label></fieldset>)}</details>
            </fieldset></td>
        })}</tr></tbody></table></section>)}</div></>}
        {plots && plotly && <><section><h4>Total Rate</h4><Plot id="total_rate" plotly={plotly} data={plots.total} layout={totalLayout} config={config} onRelayout={event => relayout('total', event)} onError={failure} /></section><section><h4>Message Rates</h4><Plot id="data_rates" plotly={plotly} data={plots.messages} layout={messageLayout} config={config} onRelayout={event => relayout('messages', event)} onError={failure} /></section></>}
        {dataset && <fieldset id="plotsetup" className="setup"><legend>Setup</legend><label><input id="Unit_bps" type="radio" name="YAxis" checked={bits} onChange={() => { setBits(true) }} />Bits per second</label><label><input id="Unit_count" type="radio" name="YAxis" checked={!bits} onChange={() => { setBits(false) }} />Messages per second</label><label htmlFor="WindowSize">Window size (s):</label><input id="WindowSize" type="number" min="0.1" step="1" value={width} onChange={event => { setWidth(event.currentTarget.value) }} /></fieldset>}
        {dataset && !validWidth && <p role="alert">Window size must be at least 0.1 seconds.</p>}
        {plots && plotly && <section><h4>Composition</h4><p id="LOGSTATS">{bits && !dataset?.systems ? `Total size: ${dataset?.byteLength} Bytes` : ''}</p><div className="composition"><Plot id="log_stats" plotly={plotly} data={plots.composition} layout={pieLayout} config={config} onError={failure} /></div></section>}
    </>
}
