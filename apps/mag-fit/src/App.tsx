import { useEffect, useMemo, useState } from 'react'
import {
    FileInput,
    LoadingOverlay,
    OpenIn,
    ParameterControl,
    Plot,
    downloadFile,
    type PlotFields,
    type PlotlyApi,
} from '@webtools/react-workflows'
import { decode_devid, DEVICE_TYPE_COMPASS, param_to_string } from '@webtools/parameters'
import { useSession } from './use-session.ts'
import { choices, exportParameters, selectedChoice, toggleChoice } from './selection.ts'
import { figures } from './plots.ts'
import { saveAs } from './runtime.ts'
import './style.css'
const config = { displaylogo: false }
/** Render React-owned controls and shared lifecycle-managed plots for one MAGFit session. */
export default function App({ plotly, assetBase }: { plotly: PlotlyApi | undefined; assetBase: string }) {
    const session = useSession(assetBase)
    const [metadata, setMetadata] = useState<unknown>(null)
    useEffect(() => {
        const controller = new AbortController()
        /** Load unchanged metadata from this app's asset directory; abort on disconnect. */
        async function loadMetadata(): Promise<void> {
            try {
                const response = await fetch(`${assetBase}params.json`, { signal: controller.signal })
                if (!response.ok) throw new Error('Unable to load parameter metadata')
                const value: unknown = await response.json()
                if (!controller.signal.aborted) setMetadata(value)
            } catch (error) {
                if (!controller.signal.aborted) session.report(error)
            }
        }
        void loadMetadata()
        return () => controller.abort()
    }, [assetBase, session.report])
    useEffect(() => {
        document.title = session.file && session.result ? `MAGFit: ${session.file.name}` : 'ArduPilot MAGFit'
    }, [session.file, session.result])
    const [use, setUse] = useState([0, 0, 0])
    const [openIn, setOpenIn] = useState(false)
    const [revision, setRevision] = useState(0)
    const [range, setRange] = useState<readonly number[] | undefined>()
    const [previousSession, setPreviousSession] = useState(0)
    const [previousCalculation, setPreviousCalculation] = useState(0)
    if (session.sessionId !== previousSession) {
        setPreviousSession(session.sessionId)
        setUse([0, 0, 0])
        setRange(undefined)
    }
    if (session.calculationId !== previousCalculation) {
        setPreviousCalculation(session.calculationId)
        setRange(undefined)
    }
    const plots = useMemo(
        () =>
            figures(
                session.log,
                session.result,
                session.selection,
                range ?? [session.options.start, session.options.end],
                session.log ? [session.options.start, session.options.end] : undefined,
            ),
        [session.log, session.result, session.selection, range, session.options.start, session.options.end],
    )
    /** Apply plot zoom to linked result plots; flight zoom also edits the analysis range. */
    function relayout(event: PlotFields, flight: boolean): void {
        const value = event['xaxis.range']
        let next: number[] | undefined
        if (Array.isArray(value) && value.length === 2 && value.every((value) => typeof value === 'number'))
            next = value as number[]
        else if (typeof event['xaxis.range[0]'] === 'number' && typeof event['xaxis.range[1]'] === 'number')
            next = [event['xaxis.range[0]'], event['xaxis.range[1]']]
        else if (event['xaxis.autorange'] === true && session.log) next = [session.log.start, session.log.end]
        if (!next) return
        setRange(next)
        if (flight)
            session.changeOptions({
                ...session.options,
                start: Math.floor(next[0]!),
                end: Math.ceil(next[1]!),
            })
    }
    /** Confirm each legacy parameter warning, then download exact parameter bytes. */
    function save(): void {
        try {
            const output = exportParameters(
                session.result?.compasses ?? [],
                session.selection,
                use,
                window.confirm,
            )
            downloadFile(
                saveAs,
                new Blob([output.text], { type: 'text/plain;charset=utf-8' }),
                'MAGFit.param',
            )
            window.alert(output.message)
        } catch (error) {
            session.report(error)
        }
    }
    /** Purge and remount plots to reset vendor view state while preserving the fit. */
    function reset(): void {
        setRange(undefined)
        setRevision((value) => value + 1)
    }
    return (
        <>
            <table className="brand">
                <tbody>
                    <tr>
                        <td>
                            <a href="https://ardupilot.org">
                                <img src={`${assetBase}images/ArduPilot.png`} />
                            </a>
                        </td>
                        <td>
                            <a href="https://github.com/ArduPilot/WebTools">
                                <img src={`${assetBase}images/github-mark.png`} width="60" />
                                <br />
                                <img src={`${assetBase}images/GitHub_Logo.png`} width="60" />
                            </a>
                        </td>
                    </tr>
                </tbody>
            </table>
            <h1>
                <a href="">ArduPilot MAGFit in flight compass calibration</a>
            </h1>
            <p className="description">
                This tool takes a .bin log and performs a "MAGFit inflight calibration". Calibration
                parameters are found that fit the measured magnetic field from the log to the expected field
                from the World Magnetic Model. For best results use a flight log that covers as many
                orientations as possible. Flying figure of eight patterns works well. If you need a motor
                calibration using either throttle or a current reading then you should also cover as wide a
                range of throttles and current draws as possible. You do not have to be in any particular
                flight mode.
            </p>
            <fieldset className="setup">
                <legend>Setup</legend>
                <div className="setup-row">
                    <fieldset>
                        <legend>Analysis time</legend>
                        {(['start', 'end'] as const).map((key) => (
                            <p key={key}>
                                <label htmlFor={key === 'start' ? 'TimeStart' : 'TimeEnd'}>
                                    {key === 'start' ? 'Start' : 'End'} (s)
                                </label>
                                <input
                                    id={key === 'start' ? 'TimeStart' : 'TimeEnd'}
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={session.options[key]}
                                    onChange={(event) =>
                                        session.changeOptions({
                                            ...session.options,
                                            [key]: event.currentTarget.valueAsNumber,
                                        })
                                    }
                                />
                            </p>
                        ))}
                    </fieldset>
                    <fieldset id="ATTITUDE">
                        <legend>Attitude source</legend>
                        {session.log?.attitudes.map((attitude, index) => (
                            <label key={attitude.name}>
                                <input
                                    type="radio"
                                    name="attitude_source"
                                    checked={session.options.attitude === index}
                                    disabled={session.log?.attitudes.length === 1}
                                    onChange={() =>
                                        session.changeOptions({ ...session.options, attitude: index })
                                    }
                                />
                                {attitude.name}
                                <br />
                            </label>
                        ))}
                    </fieldset>
                    <div>
                        <FileInput id="fileItem" accept=".bin" onFile={session.loadFile} />
                        <p>
                            <button
                                id="calculate"
                                disabled={!session.log || !session.dirty}
                                onClick={() => session.calculate()}
                            >
                                Calculate
                            </button>
                        </p>
                    </div>
                    <div>
                        <button
                            id="OpenIn"
                            disabled={!session.file}
                            onClick={() => setOpenIn((value) => !value)}
                        >
                            Open In
                        </button>
                        {openIn && <OpenIn file={session.file} messages={session.log?.messages ?? null} />}
                    </div>
                </div>
            </fieldset>
            {session.error && <p role="alert">{session.error}</p>}
            {!plotly && <p role="alert">Unable to load plot library</p>}
            <button onClick={reset}>Reset view</button>
            {plots.map((figure, index) => (
                <section key={figure.id}>
                    {index === 1 && (
                        <>
                            <h2>Expected vs measured body frame magnetic field</h2>
                            <div className="compasses">
                                {[0, 1, 2].map((index) => {
                                    const compass = session.result?.compasses.find(
                                        (compass) => compass.index === index,
                                    )
                                    const device =
                                        compass && decode_devid(compass.params.id, DEVICE_TYPE_COMPASS)
                                    return (
                                        <fieldset key={index}>
                                            <legend>Compass {index + 1}</legend>
                                            {compass ? (
                                                <>
                                                    <p>
                                                        {device?.bus_type_index === 3
                                                            ? `${device.bus_type} bus: ${device.bus} node id: ${device.address} sensor: ${device.sensor_id}`
                                                            : device
                                                              ? `${device.name} via ${device.bus_type}`
                                                              : null}
                                                    </p>
                                                    <p>
                                                        Use: {compass.params.use ? '✅' : '❌'}, External:{' '}
                                                        {compass.params.external > 0 ? '✅' : '❌'}, Health:{' '}
                                                        {compass.healthy ? '✅' : '❌'}
                                                    </p>
                                                    <label>
                                                        Coverage:{' '}
                                                        <progress
                                                            max="1"
                                                            value={compass.coverage}
                                                            title="Coverage of all vehicle orientations; greater than 30% is good."
                                                        />
                                                    </label>
                                                    <fieldset>
                                                        <legend>Parameter changes</legend>
                                                        <p>
                                                            Use sensor:{' '}
                                                            {['No change', 'Use', "Don't use"].map(
                                                                (label, option) => (
                                                                    <label key={label}>
                                                                        <input
                                                                            type="radio"
                                                                            name={`MAG${index}use`}
                                                                            checked={use[index] === option}
                                                                            onChange={() =>
                                                                                setUse((current) =>
                                                                                    current.map((value, i) =>
                                                                                        i === index
                                                                                            ? option
                                                                                            : value,
                                                                                    ),
                                                                                )
                                                                            }
                                                                        />
                                                                        {label}
                                                                    </label>
                                                                ),
                                                            )}
                                                        </p>
                                                        <p>
                                                            Orientation:{' '}
                                                            {['Check', 'Fix 90', 'Fix 45'].map(
                                                                (label, option) => (
                                                                    <label key={label}>
                                                                        <input
                                                                            type="radio"
                                                                            name={`MAG${index}orientation`}
                                                                            checked={
                                                                                session.options.orientations[
                                                                                    index
                                                                                ] === option
                                                                            }
                                                                            disabled={!compass.rotate}
                                                                            onChange={() =>
                                                                                session.changeOptions(
                                                                                    {
                                                                                        ...session.options,
                                                                                        orientations:
                                                                                            session.options.orientations.map(
                                                                                                (value, i) =>
                                                                                                    i ===
                                                                                                    index
                                                                                                        ? option
                                                                                                        : value,
                                                                                            ),
                                                                                    },
                                                                                    true,
                                                                                )
                                                                            }
                                                                        />
                                                                        {label}
                                                                    </label>
                                                                ),
                                                            )}
                                                        </p>
                                                    </fieldset>
                                                    <fieldset>
                                                        <legend title="Select calibrations to be shown on plots; the last calibration selected is saved.">
                                                            Calibrations
                                                        </legend>
                                                        {[-1, ...compass.fits.map((_, index) => index)].map(
                                                            (group) => {
                                                                const controls = choices(compass)
                                                                    .filter((choice) =>
                                                                        group === -1
                                                                            ? choice.original
                                                                            : choice.key.startsWith(
                                                                                  `${compass.index}:${group}:`,
                                                                              ),
                                                                    )
                                                                    .map((choice) => (
                                                                        <label
                                                                            className="choice"
                                                                            key={choice.key}
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                data-choice={choice.key}
                                                                                checked={session.selection.visible.includes(
                                                                                    choice.key,
                                                                                )}
                                                                                disabled={
                                                                                    !choice.result.valid
                                                                                }
                                                                                onChange={(event) => {
                                                                                    const checked =
                                                                                        event.currentTarget
                                                                                            .checked
                                                                                    session.setSelection(
                                                                                        (current) =>
                                                                                            toggleChoice(
                                                                                                current,
                                                                                                choice.key,
                                                                                                checked,
                                                                                            ),
                                                                                    )
                                                                                }}
                                                                            />
                                                                            {choice.original
                                                                                ? 'Existing'
                                                                                : choice.name.split(
                                                                                      '<br>',
                                                                                  )[0]}
                                                                        </label>
                                                                    ))
                                                                return group === -1 ? (
                                                                    <div key={group}>{controls}</div>
                                                                ) : (
                                                                    <fieldset key={group}>
                                                                        <legend>
                                                                            {compass.fits[group]?.name}
                                                                        </legend>
                                                                        {controls}
                                                                    </fieldset>
                                                                )
                                                            },
                                                        )}
                                                    </fieldset>
                                                </>
                                            ) : (
                                                'Not found'
                                            )}
                                        </fieldset>
                                    )
                                })}
                            </div>
                        </>
                    )}
                    {figure.title && <h2>{figure.title}</h2>}
                    {plotly && (
                        <Plot
                            key={`${revision}:${figure.id}`}
                            id={figure.id}
                            plotly={plotly}
                            data={figure.data}
                            layout={figure.layout}
                            config={config}
                            onError={session.report}
                            onRelayout={(event) => relayout(event, figure.id === 'FlightData')}
                        />
                    )}
                </section>
            ))}
            <h2>Parameters</h2>
            <button id="SaveParams" disabled={!session.result || session.dirty} onClick={save}>
                Save Parameters
            </button>
            <div className="compasses">
                {[0, 1, 2].map((index) => {
                    const compass = session.result?.compasses.find((compass) => compass.index === index)
                    const choice = compass && selectedChoice(compass, session.selection)
                    const params = choice?.result.params ?? compass?.params
                    return (
                        <fieldset key={index}>
                            <legend>Compass {index + 1}</legend>
                            <p id={`MAG_${index + 1}_PARAM_INFO`}>
                                {compass
                                    ? (choice?.name.replace('<br>', ', ') ?? 'Existing calibration')
                                    : 'Not found'}
                            </p>
                            {compass && params && (
                                <>
                                    {(['offsets', 'diagonals', 'off_diagonals', 'motor'] as const).flatMap(
                                        (group) =>
                                            compass.names[group].map((name, index) => (
                                                <ParameterControl
                                                    key={name}
                                                    name={name}
                                                    metadata={metadata}
                                                    value={param_to_string(params[group][index]!)}
                                                    disabled
                                                    onChange={() => {}}
                                                />
                                            )),
                                    )}
                                    {(['scale', 'orientation'] as const).map((key) => (
                                        <ParameterControl
                                            key={key}
                                            name={compass.names[key]}
                                            metadata={metadata}
                                            value={param_to_string(params[key])}
                                            disabled
                                            onChange={() => {}}
                                        />
                                    ))}
                                </>
                            )}
                        </fieldset>
                    )
                })}
            </div>
            <LoadingOverlay visible={session.loading.visible} />
        </>
    )
}
