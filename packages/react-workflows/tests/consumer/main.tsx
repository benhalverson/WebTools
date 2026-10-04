import { LifecycleConsumer } from './lifecycle.js'
import { StrictMode, useCallback, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FileInput, LoadingOverlay, OpenIn, ParameterControl, Plot, downloadFile, useLoading, useOpenInReceiver } from '../../src/index.js'
import type { PlotlyApi, SaveAs } from '../../src/index.js'
declare global { interface Window { Plotly: PlotlyApi; saveAs: SaveAs } }
const metadata: unknown = { TEST_: { TEST_GAIN: { Description: 'Test gain', Units: 'Hz', Range: { low: '0', high: '10' } },
    TEST_MODE: { Values: { 0: 'Off', 1: 'On' } }, TEST_MASK: { Bitmask: { 0: 'First', 2: 'Third', 7: 'Sign', 9: 'Hidden' } } } }
/** Exercise controlled metadata inputs, pinned vendor plotting, and legacy file
 * workflows together. Errors remain visible for browser assertions, including
 * the intentionally retained loading overlay after a rejected operation. */
function Workflows() {
    const [gain, setGain] = useState('1')
    const [mode, setMode] = useState('9')
    const [mask, setMask] = useState('0')
    const [file, setFile] = useState<File | null>(null)
    const [error, setError] = useState('')
    const [events, setEvents] = useState(0)
    const [loaded, setLoaded] = useState('')
    /** Expose asynchronous workflow errors as stable, browser-readable text. */
    const reportError = useCallback((error: unknown) => setError(String(error)), [])
    const { visible, run } = useLoading(reportError)
    /** Retain the original received File and display its name without reading it. */
    const receiveFile = useCallback((file: File) => { setFile(file); setLoaded(file.name) }, [])
    /** Identify an external-viewer payload by its byte count for assertions. */
    const receiveBuffer = useCallback((buffer: ArrayBuffer) => setLoaded(`buffer:${buffer.byteLength}`), [])
    useOpenInReceiver(receiveFile, receiveBuffer)
    const data = useMemo(() => [{ x: [0, 1, 2], y: [0, Number(gain), 2 * Number(gain)], type: 'scatter' }], [gain])
    const layout = useMemo(() => ({ width: 500, height: 300, xaxis: { title: 'Time' } }), [])
    return <>
        <ParameterControl name="TEST_GAIN" metadata={metadata} value={gain} onChange={setGain} constrain />
        <ParameterControl name="TEST_MODE" metadata={metadata} value={mode} onChange={setMode} />
        <ParameterControl name="TEST_MASK" metadata={metadata} value={mask} onChange={setMask} bitmaskSize={8} />
        <Plot id="plot" plotly={window.Plotly} data={data} layout={layout} onRelayout={() => setEvents(value => value + 1)} onError={reportError} />
        <output id="plot-events">{events}</output>
        <FileInput id="file" accept=".bin,.param" onFile={setFile} />
        <output id="filename">{file?.name ?? ''}</output>
        <button onClick={() => { if (file) downloadFile(window.saveAs, file, file.name) }}>Download file</button>
        <button onClick={() => { void run(async () => { if (file) setLoaded(await file.text()) }) }}>Load file</button>
        <button onClick={() => { void run(() => { throw new Error('Recorded failure') }) }}>Fail loading</button>
        <output id="loaded">{loaded}</output><output id="error">{error}</output>
        <OpenIn file={file} messages={['PARM']} />
        <LoadingOverlay visible={visible} />
    </>
}
/** Toggle the complete workflow subtree to verify cleanup and fresh mounts. */
function Consumer() {
    const [mounted, setMounted] = useState(true)
    return <><button id="toggle" onClick={() => setMounted(value => !value)}>Toggle workflows</button>{mounted && <Workflows />}</>
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing root')
createRoot(root).render(<StrictMode>{new URLSearchParams(window.location.search).has('lifecycle') ? <LifecycleConsumer /> : <Consumer />}</StrictMode>)
