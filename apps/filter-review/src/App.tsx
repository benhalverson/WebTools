import { aliasing, type AliasMode } from './aliasing.ts'
import { FilterComparison, type FilterControls } from './FilterComparison.tsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { OpenIn, Plot, useOpenInReceiver, type PlotlyApi, type PlotFields } from '@webtools/react-workflows'
import { fft_amplitude_scale, fft_frequency_scale, fft_window_size_inc } from '@webtools/numerics'
import { applicationBase } from '@webtools/routing'
import type { Source } from './ingestion.ts'
import { displayed, type Scale } from './spectrum.ts'
import { useReview } from './use-review.ts'
import './style.css'

/** React-owned log, spectrum and filter workflows; shared Plot hooks own vendor nodes. */
export default function App({ plotly }: { plotly: PlotlyApi | undefined }) {
    const review = useReview()
    const filterControls = useRef<FilterControls | null>(null)
    const [file, setFile] = useState<File | null>(null)
    const [source, setSource] = useState<Source>('batch')
    const [instance, setInstance] = useState(0)
    const [size, setSize] = useState('1024'), [perBatch, setPerBatch] = useState('1')
    const [range, setRange] = useState<[number, number]>([0, 0])
    const [scale, setScale] = useState<Scale>('db')
    const [aliasMode, setAliasMode] = useState<AliasMode>('none'), [loopRate, setLoopRate] = useState(400)
    const [rpm, setRpm] = useState(false), [logFrequency, setLogFrequency] = useState(false)
    const [inputKey, setInputKey] = useState(0)
    const initializedRange = useRef(false)
    const result = review.result
    const prefix = import.meta.env.BASE_URL.slice(0, -'FilterReview/'.length)
    const legacy = applicationBase('portal', prefix) + 'FilterReview/'
    /** Start a replacement file lifetime, including clearing pending Open In work. */
    function load(next: File) { filterControls.current = null; review.reset(); initializedRange.current = false; setInputKey(value => value + 1); setFile(next); setInstance(0); void review.run(next, source, -1, { size, perBatch }) }
    useOpenInReceiver(load, buffer => load(new File([buffer], 'Opened log.bin')), undefined, error => review.setError(String(error)))
    useEffect(() => {
        if (result) {
            setSource(result.recording.source); setInstance(result.instance)
            if (!initializedRange.current) { setRange(result.recording.initialRange); initializedRange.current = true }
        }
    }, [result])
    /** Re-run parsing/FFT from the retained local File using current controls. */
    function recalculate(nextSource = source, nextInstance = instance) {
        if (file) void review.run(file, nextSource, nextInstance, { size, perBatch })
    }
    /** Release plots, transfers, file state and the computation lifetime. */
    function reset() { filterControls.current = null; review.reset(); setFile(null); setRange([0, 0]); setInstance(0); setInputKey(value => value + 1) }
    /** Link time plot zoom/reset back to the same range used for spectral means. */
    function relayout(event: PlotFields) {
        if (!result) return
        if (event['xaxis.autorange'] === true) setRange([Math.floor(result.recording.start), Math.ceil(result.recording.end)])
        const start = event['xaxis.range[0]'], end = event['xaxis.range[1]']
        if (typeof start === 'number' && typeof end === 'number' && start <= end) setRange([start, end])
    }
    const aliasState = useMemo(() => {
        try { return { value: result ? aliasing(result.spectrum, aliasMode, loopRate) : undefined, error: '' } }
        catch (cause) { return { value: undefined, error: cause instanceof Error ? cause.message : String(cause) } }
    }, [result, aliasMode, loopRate])
    const plots = useMemo(() => {
        if (!result || !aliasState.value) return null
        const sensor = result.recording.sensors.find(value => value.instance === result.instance)!
        const alias = aliasState.value
        const amplitudes = displayed(result.spectrum, range[0], range[1], scale, alias)
        const frequency = fft_frequency_scale(rpm, logFrequency)
        const axes = ['x', 'y', 'z'] as const
        return {
            spectrum: axes.map(axis => ({ type: 'scatter', mode: 'lines', name: axis.toUpperCase(), x: frequency.fun(alias.bins), y: amplitudes[axis] })),
            time: axes.map(axis => ({ type: 'scatter', mode: 'lines', name: axis.toUpperCase(),
                x: sensor.batches.flatMap(batch => [...batch.x.map((_value, index) => batch.sample_time + index / batch.sample_rate), null]),
                y: sensor.batches.flatMap(batch => [...batch[axis], null]) })),
            spectrumLayout: { xaxis: { title: { text: frequency.label }, type: frequency.type }, yaxis: { title: { text: fft_amplitude_scale(scale === 'db', scale === 'psd').label } }, margin: { t: 30 } },
        }
    }, [result, range, scale, rpm, logFrequency, aliasState])
    return <main>
        <h1>Filter Review</h1>

        <div className="controls">
            <fieldset><legend>Log</legend>
                <input key={inputKey} aria-label="Load log" type="file" accept=".bin,.BIN,.log" onChange={event => { const next = event.target.files?.[0]; if (next) load(next) }} />
                <p>{file?.name ?? 'Select a local DataFlash log'}</p>
                <label>Source <select aria-label="Source" value={source} onChange={event => { const next = event.target.value as Source; setSource(next); recalculate(next) }}>
                    <option value="batch" disabled={!!result && !result.recording.sources.includes('batch')}>Batch</option>
                    <option value="raw" disabled={!!result && !result.recording.sources.includes('raw')}>Raw</option>
                </select></label>
                <label>IMU <select aria-label="IMU" value={instance} disabled={!result} onChange={event => { const next = Number(event.target.value); setInstance(next); recalculate(source, next) }}>
                    {result?.recording.sensors.map(sensor => <option key={sensor.instance} value={sensor.instance}>Gyro {sensor.sensor + 1} {sensor.postFilter ? 'Post' : 'Pre'} filter</option>)}
                </select></label>
            </fieldset>
            <fieldset><legend>FFT</legend>
                <label>Window size <input aria-label="Window size" type="number" min="2" value={size} disabled={source === 'batch'} onChange={event => { fft_window_size_inc({ target: event.currentTarget }); setSize(event.currentTarget.value) }} /></label>
                <label>Windows per batch <input aria-label="Windows per batch" type="number" min="1" value={perBatch} disabled={source === 'raw'} onChange={event => setPerBatch(event.target.value)} /></label>
                <button disabled={!file} onClick={() => recalculate()}>Recalculate</button>
                <button disabled={review.progress === null} onClick={review.cancel}>Cancel</button>
                <button onClick={reset}>Reset</button>
                {review.progress !== null && <p role="status">Calculating… {Math.round(review.progress * 100)}% <progress value={review.progress} /></p>}
            </fieldset>
            <fieldset><legend>Open In</legend><OpenIn key={file ? file.name + ':' + inputKey : 'empty'} file={file} messages={result?.recording.messages ?? null} pathname={legacy} /></fieldset>
        </div>
        {review.error && <p role="alert">{review.error}</p>}
        {aliasState.error && <p role="alert">{aliasState.error}</p>}
        {!plotly && <p role="alert">Plotly could not be loaded.</p>}
        {result && <>
            {result.recording.warnings.map(message => <p key={message}>{message}</p>)}
            <p>Sample rate: {result.spectrum.average_sample_rate.toFixed(2)} Hz. Resolution: {(result.spectrum.average_sample_rate / result.spectrum.window_size).toFixed(2)} Hz. Windows: {result.spectrum.time.length}.</p>
            {!result.spectrum.time.length && <p role="status">No FFT windows fit. Reduce the window size and recalculate.</p>}
            <fieldset><legend>Time window</legend>
                <label>Start <input aria-label="Start" type="number" step="any" value={range[0]} onChange={event => { const value = Number(event.target.value); setRange([value, range[1]]) }} /></label>
                <label>End <input aria-label="End" type="number" step="any" value={range[1]} onChange={event => { const value = Number(event.target.value); setRange([range[0], value]) }} /></label>
            </fieldset>
            {plotly && plots && <Plot id="TimePlot" plotly={plotly} data={plots.time} layout={{ xaxis: { title: { text: 'Time (s)' }, range }, yaxis: { title: { text: 'Angular velocity (rad/s)' } }, margin: { t: 30 } }} onRelayout={relayout} onError={error => review.setError(String(error))} />}
            <fieldset><legend>Spectrum</legend>
                <label>Aliasing <select aria-label="Aliasing" value={aliasMode} onChange={event => setAliasMode(event.target.value as AliasMode)}><option value="none">None</option><option value="fold">Fold</option><option value="only">Only aliases</option></select></label>
                <label>Amplitude <select aria-label="Amplitude" value={scale} onChange={event => setScale(event.target.value as Scale)}><option value="linear">Linear</option><option value="db">dB</option><option value="psd">Power Spectral Density</option></select></label>
                <label><input type="checkbox" checked={rpm} onChange={event => setRpm(event.target.checked)} />RPM</label>
                <label><input type="checkbox" checked={logFrequency} onChange={event => setLogFrequency(event.target.checked)} />Log frequency</label>
            </fieldset>
            {plotly && plots && <Plot id="FFTPlot" plotly={plotly} data={plots.spectrum} layout={plots.spectrumLayout} onError={error => review.setError(String(error))} />}
            <FilterComparison key={inputKey} controls={filterControls} result={result} alias={aliasState.value} onLoopRate={setLoopRate} range={range} scale={scale} rpm={rpm} logFrequency={logFrequency} plotly={plotly} />
        </>}
    </main>
}
