import { useEffect, useMemo, useRef, useState } from 'react'
import { FileInput, OpenIn, Plot, useOpenInReceiver, downloadFile } from '@webtools/react-workflows'
import type { PlotlyApi, SaveAs, PlotFields } from '@webtools/react-workflows'
import { decode_devid, DEVICE_TYPE_AIRSPEED } from '@webtools/parameters'
import { analyze, parameterOutput, parseFlight, temperatureDiagnostics } from './model.ts'
import type { Analysis, Flight, Options, Sensor } from './model.ts'
import { fetchGroundTemperature } from './weather.ts'
import {
    flightPlot,
    fmt,
    redraw_combined_tas,
    redraw_combined_resid,
    redraw_rms_bar,
    redraw_wind_model,
} from './plots.ts'
import type { PlotSpec } from './plots.ts'

declare global {
    interface Window {
        Plotly: PlotlyApi
        saveAs: SaveAs
    }
}
const defaults: Options = { start: 0, end: 0, temperature: 15, source: 0, sensors: [], q: 10 ** -1.5 }
const config = { displaylogo: false }

/** Render one owned Plotly surface with the legacy dimensions and shared cleanup. */
function Chart({
    id,
    spec,
    height,
    width = 1200,
    onRelayout,
    onError,
}: {
    id: string
    spec: PlotSpec
    height: number
    width?: number
    onRelayout?: (event: PlotFields) => void
    onError: (error: unknown) => void
}) {
    const layout = useMemo(() => ({ ...spec.layout, width, height }), [spec.layout, width, height])
    return (
        <div style={{ width, height }}>
            <Plot
                id={id}
                plotly={window.Plotly}
                data={spec.data}
                layout={layout}
                config={config}
                {...(onRelayout ? { onRelayout } : {})}
                onError={onError}
            />
        </div>
    )
}

/** Describe the same decoded device identity and status used by legacy summaries. */
function SensorSummary({ sensor, checked, onChange }: { sensor: Sensor; checked: boolean; onChange: () => void }) {
    const id = sensor.devid == null ? null : decode_devid(sensor.devid, DEVICE_TYPE_AIRSPEED)
    const device =
        id == null
            ? 'ARSP instance ' + sensor.instance
            : id.bus_type_index === 3
              ? id.bus_type +
                ' bus: ' +
                id.bus +
                ' node id: ' +
                id.address +
                ('sensor_id' in id && id.sensor_id >= 0 ? ' sensor: ' + id.sensor_id : '')
              : ('name' in id ? id.name : '') + ' via ' + id.bus_type
    return (
        <fieldset style={{ width: 360 }}>
            <legend>
                Airspeed {sensor.instance + 1}
                {sensor.primary?.at(-1) === sensor.instance ? ' (primary)' : ''}
            </legend>
            <p>{device}</p>
            <p>
                Use:{' '}
                {sensor.use == null ? (
                    <span className="warn">⚠ {sensor.use_name} not found</span>
                ) : sensor.use ? (
                    '✅'
                ) : (
                    '❌'
                )}{' '}
                Health: {sensor.health?.every((value) => value === 1) ? '✅' : '❌'}
            </p>
            <label>
                <input type="checkbox" checked={checked} onChange={onChange} />
                Include in fit
            </label>
        </fieldset>
    )
}

/** Preserve the original explanatory help with a keyboard-accessible native disclosure. */
function Help({ text }: { text: string }) {
    return (
        <details className="help">
            <summary aria-label="Help">ⓘ</summary>
            <span>{text}</span>
        </details>
    )
}

/** Own each log session, fit request and weather request; discard completions
 * after replacement/unmount. Shared workflows own plot and Open In resources. */
export function App() {
    const [file, setFile] = useState<File | null>(null)
    const [flight, setFlight] = useState<Flight | null>(null)
    const [options, setOptions] = useState<Options>(defaults)
    const [analysis, setAnalysis] = useState<Analysis | null>(null)
    const [temperatureSource, setTemperatureSource] = useState('custom')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [open, setOpen] = useState(false)
    const session = useRef(0)
    const work = useRef(0)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const weather = useRef<AbortController | null>(null)
    const latest = useRef({ flight, options })
    latest.current = { flight, options }
    useEffect(
        () => () => {
            session.current++
            work.current++
            clearTimeout(timer.current)
            weather.current?.abort()
        },
        [],
    )

    /** Display recoverable load, fit or plot failures in the current session. */
    function report(reason: unknown) {
        setError(reason instanceof Error ? reason.message : String(reason))
    }

    /** Schedule one fit after the busy indicator paints; supersede prior work. */
    function fit(nextFlight: Flight, nextOptions: Options, retainResults = false) {
        const token = ++work.current,
            generation = session.current
        clearTimeout(timer.current)
        if (!retainResults) setAnalysis(null)
        setBusy(true)
        setError('')
        timer.current = setTimeout(() => {
            if (token !== work.current || generation !== session.current) return
            try {
                setAnalysis(analyze(nextFlight, nextOptions))
            } catch (reason) {
                report(reason)
            } finally {
                setBusy(false)
            }
        }, 0)
    }

    /** Replace all file-derived state before reading, and abort stale weather work. */
    async function load(nextFile: File | null, bytes?: ArrayBuffer) {
        if (!nextFile && !bytes) return
        const generation = ++session.current
        work.current++
        clearTimeout(timer.current)
        weather.current?.abort()
        const controller = new AbortController()
        weather.current = controller
        setFile(nextFile)
        setFlight(null)
        setAnalysis(null)
        setBusy(true)
        setError('')
        setOpen(false)
        document.title = nextFile ? 'AirspeedFit: ' + nextFile.name : 'ArduPilot AirspeedFit'
        try {
            const buffer = bytes ?? (await nextFile!.arrayBuffer())
            if (generation !== session.current) return
            const nextFlight = await parseFlight(buffer)
            if (generation !== session.current) return
            const source = nextFlight.temp_sources.isa ? 'isa' : (Object.keys(nextFlight.temp_sources)[0] ?? 'custom')
            const temperature = nextFlight.temp_sources[source]?.value
            const nextOptions: Options = {
                ...defaults,
                q: latest.current.options.q,
                start: nextFlight.window[0],
                end: nextFlight.window[1],
                temperature: temperature == null ? latest.current.options.temperature : +temperature.toFixed(0),
                sensors: nextFlight.sensors.map((sensor) => sensor.instance),
            }
            setFlight(nextFlight)
            setOptions(nextOptions)
            setTemperatureSource(source)
            latest.current = { flight: nextFlight, options: nextOptions }
            fit(nextFlight, nextOptions)
            const takeoff = nextFlight.takeoff
            if (takeoff) {
                const temperature = await fetchGroundTemperature(
                    takeoff.lat,
                    takeoff.lng,
                    takeoff.date,
                    controller.signal,
                )
                if (temperature === null || generation !== session.current) return
                const updated = {
                    ...nextFlight,
                    temp_sources: {
                        ...nextFlight.temp_sources,
                        openmeteo: { label: 'Open-Meteo', value: temperature },
                    },
                }
                const updatedOptions = { ...latest.current.options, temperature: +temperature.toFixed(0) }
                setFlight(updated)
                setOptions(updatedOptions)
                setTemperatureSource('openmeteo')
                fit(updated, updatedOptions)
            }
        } catch (reason) {
            if (generation === session.current) {
                report(reason)
                setBusy(false)
            }
        }
    }
    useOpenInReceiver(
        (received) => {
            void load(received)
        },
        (bytes) => {
            void load(null, bytes)
        },
        undefined,
        report,
    )

    /** Invalidate all derived results whenever a selected input changes. */
    function change(patch: Partial<Options>) {
        work.current++
        clearTimeout(timer.current)
        setOptions((current) => ({ ...current, ...patch }))
        setAnalysis(null)
        setBusy(false)
        setError('')
    }
    /** Mirror Plotly's complete range events with the legacy floor/ceil rounding. */
    function relayout(event: PlotFields) {
        let range: unknown = event['xaxis.range']
        if (event['xaxis.range[0]'] !== undefined && event['xaxis.range[1]'] !== undefined)
            range = [event['xaxis.range[0]'], event['xaxis.range[1]']]
        if (event['xaxis.autorange'] === true && flight) range = [flight.start_time, flight.end_time]
        if (Array.isArray(range) && typeof range[0] === 'number' && typeof range[1] === 'number') {
            const start = Math.floor(range[0]),
                end = Math.ceil(range[1])
            if (start !== options.start || end !== options.end) change({ start, end })
        }
    }
    /** Export the fitted three-decimal ratios, preserving the outlier confirmation. */
    function save() {
        if (!analysis) return
        const output = parameterOutput(analysis)
        if (!output.text) {
            alert('No valid calibration to save')
            return
        }
        if (output.warning && !confirm('Warning:\n' + output.warning + '\nSave anyway?')) return
        downloadFile(window.saveAs, new Blob([output.text], { type: 'text/plain;charset=utf-8' }), 'AirspeedFit.param')
        alert(output.saved)
    }
    const { start, end } = options
    const flightSpec = useMemo(() => flightPlot(flight, { start, end }), [flight, start, end])
    const results = useMemo(
        () =>
            analysis
                ? [
                      redraw_combined_tas(analysis),
                      redraw_combined_resid(analysis),
                      redraw_rms_bar(analysis),
                      redraw_wind_model(analysis),
                  ]
                : null,
        [analysis],
    )
    const diagnostics = flight ? temperatureDiagnostics(flight, options) : null
    const warnings = [...new Set(analysis?.seeds.flatMap((seed) => seed.warnings) ?? [])]
    const qlog = Math.log10(options.q)
    return (
        <main>
            <header>
                <a href="https://ardupilot.org">
                    <img src={`${import.meta.env.BASE_URL}images/ArduPilot.png`} />
                </a>
                <a href="https://github.com/ArduPilot/WebTools">
                    <img width="60" src={`${import.meta.env.BASE_URL}images/github-mark.png`} />
                    <br />
                    <img width="60" src={`${import.meta.env.BASE_URL}images/GitHub_Logo.png`} />
                </a>
            </header>
            <h1>
                <a href="">ArduPilot AirspeedFit in flight airspeed calibration</a>
            </h1>
            <p className="intro">
                This tool takes a .bin log and estimates the airspeed ratio calibration (ARSPD_RATIO) for each airspeed
                sensor. The GPS/EKF ground velocity minus an estimated wind gives the true airspeed used as the truth
                source, and the ratio is fitted so each sensor&apos;s airspeed matches it over the selected window. This
                is the same relationship ArduPilot&apos;s in-flight autocalibration uses, but solved offline (forward
                and backward in time). For best results select a window with heading changes (turns or a loiter); a
                single straight cruise leg cannot separate the wind from the airspeed scale.
            </p>
            <fieldset className="setup">
                <legend>Setup</legend>
                <div className="controls">
                    <fieldset style={{ width: 180, height: 175 }}>
                        <legend title="Start and end times are seeded from the detected flight. Calculate after changing the range.">
                            Analysis time
                        </legend>
                        <label htmlFor="TimeStart">Start (s)</label>{' '}
                        <input
                            id="TimeStart"
                            type="number"
                            min="0"
                            step="1"
                            value={Number.isNaN(options.start) ? '' : options.start}
                            onChange={(event) => change({ start: event.target.valueAsNumber })}
                        />
                        <br />
                        <br />
                        <label htmlFor="TimeEnd">End (s)</label>{' '}
                        <input
                            id="TimeEnd"
                            type="number"
                            min="0"
                            step="1"
                            value={Number.isNaN(options.end) ? '' : options.end}
                            onChange={(event) => change({ end: event.target.valueAsNumber })}
                        />
                    </fieldset>
                    <fieldset id="VELOCITY" style={{ width: 200, height: 175 }}>
                        <legend>
                            Velocity source{' '}
                            <Help
                                text={
                                    'EKF ground-velocity source (North/East/Down) used as the truth for the wind triangle. Normally the default (lowest EKF core) is fine. The Calculate button must be clicked after any change of source.'
                                }
                            />
                        </legend>
                        {flight?.sources.map((source, i) => (
                            <label key={source.name}>
                                <input
                                    type="radio"
                                    name="velocity"
                                    checked={options.source === i}
                                    disabled={flight.sources.length === 1}
                                    onChange={() => change({ source: i })}
                                />
                                {source.name}
                                <br />
                            </label>
                        ))}
                    </fieldset>
                    <fieldset style={{ width: 250, height: 175 }}>
                        <legend>
                            Air temperature{' '}
                            <Help
                                text={
                                    'Air temperature is needed to convert equivalent airspeed to true airspeed (EAS2TAS). Enter the outside air temperature at ground level, and it will be used to feed a simple atmospheric model to calculate EAS2TAS throughout the flight. Each degree of error in temperature corresponds to a ~0.2% error in the final calibrated airspeed measurements. Use the Source dropdown to fill the box, or type your own. By default, the temperature is looked up from Open-Meteo using the location/time of takeoff.'
                                }
                            />
                        </legend>
                        <label htmlFor="temp_source">Source </label>
                        <select
                            id="temp_source"
                            value={temperatureSource}
                            onChange={(event) => {
                                const key = event.target.value
                                setTemperatureSource(key)
                                const source = flight?.temp_sources[key]
                                if (source) change({ temperature: +source.value.toFixed(0) })
                            }}
                        >
                            {['openmeteo', 'isa', 'baro', 'metar']
                                .filter((key) => flight?.temp_sources[key])
                                .map((key) => (
                                    <option key={key} value={key}>
                                        {flight!.temp_sources[key]!.label} (
                                        {flight!.temp_sources[key]!.value.toFixed(0)} °C)
                                    </option>
                                ))}
                            <option value="custom">Custom</option>
                        </select>
                        <p>
                            <input
                                id="ground_temp"
                                type="number"
                                step="1"
                                value={Number.isNaN(options.temperature) ? '' : options.temperature}
                                onChange={(event) => {
                                    setTemperatureSource('custom')
                                    change({ temperature: event.target.valueAsNumber })
                                }}
                            />{' '}
                            <label htmlFor="ground_temp">°C at ground</label>
                        </p>
                        {flight && diagnostics && (
                            <p id="temp_debug">
                                Field elevation: {fmt(flight.field_elevation, 0)} m<br />
                                Density altitude: {fmt(diagnostics.density, 0)} m<br />
                                Avg EAS2TAS: {diagnostics.percent >= 0 ? '+' : ''}
                                {fmt(diagnostics.percent, 1)}%
                            </p>
                        )}
                    </fieldset>
                    <div>
                        <FileInput
                            id="fileItem"
                            accept=".bin"
                            onFile={(next) => {
                                void load(next)
                            }}
                        />
                        <br />
                        <br />
                        <input
                            id="calculate"
                            type="button"
                            value="Calculate"
                            disabled={!flight || busy || analysis !== null}
                            onClick={() => {
                                if (flight) fit(flight, options)
                            }}
                        />
                    </div>
                    <div>
                        <input
                            id="OpenIn"
                            type="button"
                            value="Open In"
                            disabled={!file}
                            onClick={() => setOpen(!open)}
                        />
                        {open && <OpenIn key={session.current} file={file} messages={flight?.messages ?? null} />}
                    </div>
                </div>
            </fieldset>
            {busy && <p role="status">Loading / calculating…</p>}
            {error && (
                <p role="alert" className="warn">
                    {error}
                </p>
            )}
            <h2>
                Flight Data{' '}
                <Help
                    text={
                        'Zoom into a section of the flight to change the Analysis time then click "Calculate". Select a section with heading changes (turns / loiter) and steady airspeed for the best fit.'
                    }
                />
            </h2>
            <Chart id="FlightData" spec={flightSpec} height={450} onRelayout={relayout} onError={report} />
            <h2>Airspeed sensors</h2>
            <div id="SensorSummary" className="sensors">
                {flight?.sensors.map((sensor) => (
                    <SensorSummary
                        key={sensor.instance}
                        sensor={sensor}
                        checked={options.sensors.includes(sensor.instance)}
                        onChange={() =>
                            change({
                                sensors: options.sensors.includes(sensor.instance)
                                    ? options.sensors.filter((i) => i !== sensor.instance)
                                    : [...options.sensors, sensor.instance],
                            })
                        }
                    />
                ))}
            </div>
            {analysis && results ? (
                <section id="results">
                    <h2>
                        Expected vs measured airspeed{' '}
                        <Help
                            text={
                                "True airspeed (from the ground velocity and the estimated wind, black) versus each sensor's calibrated airspeed, before (current logged ratio) and after (fitted ratio). Click a legend entry to hide/show that line."
                            }
                        />
                    </h2>
                    <Chart id="tas_combined" spec={results[0]!} height={420} onError={report} />
                    <h2>
                        Residuals{' '}
                        <Help
                            text={
                                'Residual = true airspeed \u2212 calibrated airspeed, before and after calibration, for each sensor. Click a legend entry to hide/show.'
                            }
                        />
                    </h2>
                    <Chart id="resid_combined" spec={results[1]!} height={350} onError={report} />
                    <h2>
                        Calibration RMS error{' '}
                        <Help
                            text={
                                'RMS of the residual airspeed error before and after calibration, per sensor. Lower is better.'
                            }
                        />
                    </h2>
                    <Chart id="rms_bar" spec={results[2]!} height={300} onError={report} />
                    <h2>
                        Wind model{' '}
                        <Help
                            text={
                                'The wind over the flight, estimated as a slow random walk (an offline forward/backward smoother). This slider sets how quickly the wind may drift (process noise q): low q pins it nearly constant, higher q lets it track weather changes over a long flight. If q is set too high, the wind model can start absorbing real residuals and providing false confidence. The final airspeed ratios are generally robust against a poorly chosen q.'
                            }
                        />
                    </h2>
                    <div className="wind-controls">
                        <label htmlFor="q_slider">Wind process noise q</label>
                        <input
                            id="q_slider"
                            type="range"
                            min="-3"
                            max="0"
                            step="0.05"
                            value={qlog}
                            onChange={(event) =>
                                setOptions((current) => ({ ...current, q: 10 ** +event.target.value }))
                            }
                            onPointerUp={() => {
                                if (flight) fit(flight, options, true)
                            }}
                            onKeyUp={() => {
                                if (flight) fit(flight, options, true)
                            }}
                        />
                        <span id="q_value">{options.q.toFixed(options.q < 0.01 ? 4 : options.q < 0.1 ? 3 : 2)}</span>{' '}
                        (m/s)/√s{' '}
                        <span>
                            {options.q <= 0.002 ? '≈ constant wind' : options.q >= 0.3 ? 'wind free to drift fast' : ''}
                        </span>
                    </div>
                    <fieldset style={{ width: 1150 }}>
                        <legend>Wind estimate</legend>
                        <Chart id="wm_wind" spec={results[3]!} width={1150} height={320} onError={report} />
                    </fieldset>
                    <fieldset id="ParamRows">
                        <legend>Suggested parameters</legend>
                        <table>
                            <tbody>
                                {analysis.sensors.map((sensor, i) => {
                                    const ratio = analysis.fit?.per_sensor[i]?.ratio
                                    const delta =
                                        ratio == null || sensor.current_ratio == null
                                            ? null
                                            : (100 * (ratio - sensor.current_ratio)) / sensor.current_ratio
                                    return (
                                        <tr key={sensor.instance}>
                                            <td>
                                                <label htmlFor={sensor.ratio_name}>
                                                    <b>{sensor.ratio_name}</b>
                                                </label>
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    id={sensor.ratio_name}
                                                    disabled
                                                    value={ratio == null || !isFinite(ratio) ? '' : ratio.toFixed(3)}
                                                />
                                            </td>
                                            <td>
                                                {ratio == null ? (
                                                    <span className="warn">
                                                        not enough valid samples in the selected window
                                                    </span>
                                                ) : sensor.current_ratio != null ? (
                                                    <>
                                                        current {fmt(sensor.current_ratio, 3)} &nbsp; (
                                                        {delta! >= 0 ? '+' : ''}
                                                        {fmt(delta, 1)}%)
                                                    </>
                                                ) : null}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                        <div id="param_warning" className="warn">
                            {warnings.map((warning) => (
                                <div key={warning}>⚠ {warning}</div>
                            ))}
                        </div>
                    </fieldset>
                    <p className="save">
                        <input id="SaveParams" type="button" value="Save Parameters" disabled={busy} onClick={save} />
                    </p>
                </section>
            ) : (
                flight && <p id="results_msg">Hit Calculate to see results.</p>
            )}
        </main>
    )
}
