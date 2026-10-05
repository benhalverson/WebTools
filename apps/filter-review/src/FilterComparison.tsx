import { filterWarnings } from './filters.ts'
import { aliasing, type AliasMode } from './aliasing.ts'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ParameterControl, Plot, downloadFile, type SaveAs, type PlotlyApi } from '@webtools/react-workflows'
import { fft_frequency_scale, fft_amplitude_scale } from '@webtools/numerics'
import { bode, predicted, spectrogram } from './comparison.ts'
import { exportParameters, importParameters, filterToolUrl, names, prefixes, settings } from './parameters.ts'
import { target } from './tracking.ts'
import { useComparison } from './use-comparison.ts'
import type { Result } from './use-review.ts'
import type { Parameters } from './parameters.ts'
import type { Scale } from './spectrum.ts'

export interface FilterControls { values: Parameters; version: number }

/** React-owned parameter editing, cancellable filter application and comparison
 * plots. The parent keys this lifetime to the decoded recording and IMU. */
export function FilterComparison({ result, range, scale, rpm, logFrequency, plotly, aliasMode, loopRate, onLoopRate, controls }: {
    controls: RefObject<FilterControls | null>
    aliasMode: AliasMode; loopRate: number; onLoopRate: (rate: number) => void
    result: Result; range: [number, number]; scale: Scale; rpm: boolean; logFrequency: boolean; plotly: PlotlyApi | undefined
}) {
    const [values, setValues] = useState(controls.current?.values ?? result.parameters.values)
    const [version, setVersion] = useState(controls.current?.version ?? result.parameters.version)
    const [wrap, setWrap] = useState(false), [axis, setAxis] = useState<'x' | 'y' | 'z'>('x')
    const [showLogged, setShowLogged] = useState(false), [error, setError] = useState('')
    const [applied, setApplied] = useState(() => settings(values, version, result.parameters.bitmaskSize))
    const comparison = useComparison()
    const [metadata, setMetadata] = useState<unknown>(null)
    useEffect(() => { controls.current = { values, version } }, [controls, values, version])
    useEffect(() => {
        const controller = new AbortController()
        fetch(import.meta.env.BASE_URL + 'params.json', { signal: controller.signal }).then(response => { if (!response.ok) throw new Error('Parameter metadata could not be loaded'); return response.json() }).then(setMetadata).catch(cause => { if (!controller.signal.aborted) setError(String(cause)) })
        return () => controller.abort()
    }, [])
    const [estimated, setEstimated] = useState(false)
    const postFilter = result.recording.sensors.find(sensor => sensor.instance === result.instance)!.postFilter
    const loggedHarmonics = useRef(settings(result.parameters.values, result.parameters.version, result.parameters.bitmaskSize).notches.map(notch => notch.harmonics))
    useEffect(() => { const value = Number(values.SCHED_LOOP_RATE); if (Number.isFinite(value) && value > 0) onLoopRate(value) }, [values.SCHED_LOOP_RATE, onLoopRate])
    const lifetime = useRef(0)
    useEffect(() => {
        comparison.run({ spectrum: result.spectrum, tracking: result.tracking, filters: applied })
        return () => { lifetime.current++; comparison.cancel() }
    }, [result, applied])
    /** Snapshot controlled parameters for a replaceable computation. */
    function apply() { setApplied(settings(values, version, result.parameters.bitmaskSize)) }
    /** Invalidate earlier file reads when a new parameter file is selected. */
    async function load(file: File) {
        const id = ++lifetime.current
        try {
            const text = await file.text()
            if (id !== lifetime.current) return
            const next = importParameters(text, values)
            setValues(next); setApplied(settings(next, version, result.parameters.bitmaskSize)); setError('')
        } catch (cause) { if (id === lifetime.current) setError(String(cause)) }
    }
    /** Download the existing filename and exact parameter serialization. */
    function save() {
        try {
            const saveAs: unknown = Reflect.get(window, 'saveAs')
            if (typeof saveAs !== 'function') throw new Error('FileSaver could not be loaded')
            downloadFile(saveAs as SaveAs, new Blob([exportParameters(values)], { type: 'text/plain;charset=utf-8' }), 'filter.param')
        } catch (cause) { setError(String(cause)) }
    }
    const plots = useMemo(() => {
        if (!comparison.result || !result.spectrum.time.length) return null
        const frequency = fft_frequency_scale(rpm, logFrequency)
        const alias = aliasing(result.spectrum, aliasMode, loopRate)
        const output = predicted(result.spectrum, comparison.result.transfer, range[0], range[1], scale, result.recording.source === 'batch', alias)
        const response = bode(comparison.result, result.spectrum.time, range[0], range[1], scale, wrap)
        const bins = frequency.fun(comparison.result.bode.bins)
        const spectrum = (['x', 'y', 'z'] as const).map(axis => ({ type: 'scatter', mode: 'lines', name: axis.toUpperCase() + ' predicted', x: frequency.fun(alias.bins), y: output[axis] }))
        const tracking = applied.notches.flatMap((config, notch) => {
            const source = result.tracking.sources[config.mode]
            if (!source || !(config.enable > 0)) return []
            const dynamic = (config.options & 2) !== 0 && [1, 3, 4].includes(config.mode)
            const series = config.mode === 0 ? [{ time: [result.recording.start, result.recording.end], value: [0, 0] }] : dynamic ? source.instances : source.average ? [source.average] : []
            return series.flatMap((data, instance) => Array.from({ length: 16 }, (_value, n) => n).filter(n => config.harmonics & (1 << n)).map(n => ({
                type: 'scatter', mode: 'lines', name: `Notch ${notch + 1}, source ${instance + 1}, harmonic ${n + 1}`, x: data.time,
                y: frequency.fun(data.value.map(value => Math.max(target(config, applied.version, value) * (n + 1), applied.version === 1 ? 0 : config.freq * config.min_ratio * (config.options & 32 ? n + 1 : 1)))),
            })))
        })
        const logged = showLogged ? result.tracking.logged.flatMap((series, notch) => series.flatMap((data, instance) => Array.from({ length: 16 }, (_value, n) => n).filter(n => loggedHarmonics.current[notch]! & (1 << n)).map(n => ({ type: 'scatter', mode: 'lines', name: `Logged notch ${notch + 1}, source ${instance + 1}, harmonic ${n + 1}`, x: data.time, y: frequency.fun(data.value.map(value => value * (n + 1))), line: { dash: 'dot' } })))) : []
        const image = spectrogram(result.spectrum, axis, scale, alias, estimated && !postFilter ? comparison.result.transfer : undefined, result.recording.source === 'batch')
        const amplitude = fft_amplitude_scale(scale === 'db', scale === 'psd')
        return { spectrum, tracking: [...tracking, ...logged],
            magnitude: [{ x: [...bins, ...bins.toReversed()], y: [...response.amplitudeMax, ...response.amplitudeMin.toReversed()], fill: 'toself', name: 'Range', line: { width: 0 } }, { x: bins, y: response.amplitude, name: 'Mean', mode: 'lines' }],
            phase: [{ x: [...bins, ...bins.toReversed()], y: [...response.phaseMax, ...response.phaseMin.toReversed()], fill: 'toself', name: 'Range', line: { width: 0 } }, { x: bins, y: response.degrees, name: 'Mean', mode: 'lines' }],
            spectrogram: [{ type: 'heatmap', x: image.time, y: frequency.fun(alias.bins), z: image.columns, transpose: true, colorscale: 'Jet' }, ...tracking, ...logged],
            xaxis: { title: { text: frequency.label }, type: frequency.type }, yaxis: { title: { text: amplitude.label } },
        }
    }, [comparison.result, result, applied, range, scale, rpm, logFrequency, wrap, axis, showLogged, aliasMode, loopRate, estimated, postFilter])
    return <section aria-label="Filter comparisons">
        <h2>Filters</h2>
        <label>Filter version <select aria-label="Filter version" value={version} onChange={event => setVersion(Number(event.target.value))}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>V{value}</option>)}</select></label>
        <div className="controls">
            {['General', ...prefixes].map((prefix, index) => <fieldset key={prefix}><legend>{index === 0 ? 'General' : 'Notch ' + index}</legend>
                {names.filter(name => index === 0 ? !prefixes.some(prefix => name.startsWith(prefix)) : name.startsWith(prefix)).map(name => <ParameterControl key={name} name={name} metadata={metadata} value={values[name] ?? ''}
                    allowValues={name !== 'SCHED_LOOP_RATE'} bitmaskSize={name.endsWith('HMNCS') ? result.parameters.bitmaskSize : 32}
                    disabled={index > 0 && !name.endsWith('ENABLE') && !(Number(values[prefix + 'ENABLE']) > 0)} onChange={value => setValues(previous => ({ ...previous, [name]: value }))} />)}
            </fieldset>)}
        </div>
        <button onClick={apply}>Apply filters</button>
        <button disabled={!comparison.busy} onClick={comparison.cancel}>Cancel filters</button>
        <button onClick={save}>Save parameters</button>
        <button onClick={() => window.open(filterToolUrl(window.location.href, values, result.gyroRates[result.instance]!, result.tracking, range))}>Open in Filter Tool</button>
        <label>Load parameters <input aria-label="Load parameters" type="file" accept=".param,.parm,.txt" onChange={event => { const file = event.target.files?.[0]; if (file) void load(file) }} /></label>
        {comparison.busy && <p role="status">Calculating filters…</p>}
        {(error || comparison.error) && <p role="alert">{error || comparison.error}</p>}
        {filterWarnings(applied, result.tracking).map((warning, index) => <p key={index} role="alert">{warning}</p>)}
        {plots && plotly && <>
            {!postFilter && <><h2>Predicted filtered spectrum</h2>
            <Plot id="PredictedFFT" plotly={plotly} data={plots.spectrum} layout={{ xaxis: plots.xaxis, yaxis: plots.yaxis }} onError={error => setError(String(error))} /></>}
            <h2>Filter response</h2>
            <label><input type="checkbox" checked={wrap} onChange={event => setWrap(event.target.checked)} />Wrap phase</label>
            <Plot id="BodeMagnitude" plotly={plotly} data={plots.magnitude} layout={{ xaxis: plots.xaxis, yaxis: plots.yaxis }} onError={error => setError(String(error))} />
            <Plot id="BodePhase" plotly={plotly} data={plots.phase} layout={{ xaxis: plots.xaxis, yaxis: { title: { text: 'Phase (degrees)' }, ...(wrap ? { range: [-180, 180] } : {}) } }} onError={error => setError(String(error))} />
            <h2>Tracking</h2>
            <label><input type="checkbox" checked={showLogged} onChange={event => setShowLogged(event.target.checked)} />Show logged notch tracking</label>
            <Plot id="TrackingPlot" plotly={plotly} data={plots.tracking} layout={{ xaxis: { title: { text: 'Time (s)' }, range }, yaxis: plots.xaxis }} onError={error => setError(String(error))} />
            <h2>Spectrogram</h2>
            <label><input type="checkbox" checked={estimated && !postFilter} disabled={postFilter} onChange={event => setEstimated(event.target.checked)} />Predicted post-filter spectrogram</label>
            <label>Axis <select aria-label="Spectrogram axis" value={axis} onChange={event => setAxis(event.target.value as typeof axis)}>{['x', 'y', 'z'].map(value => <option key={value}>{value}</option>)}</select></label>
            <Plot id="Spectrogram" plotly={plotly} data={plots.spectrogram} layout={{ xaxis: { title: { text: 'Time (s)' }, range }, yaxis: plots.xaxis }} onError={error => setError(String(error))} />
        </>}
    </section>
}
