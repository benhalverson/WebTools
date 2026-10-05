import { useMemo, useState, type ChangeEvent } from 'react'
import { Plot, type PlotlyApi } from '@webtools/react-workflows'
import { rotationLayout, rotationTraces } from './plot.ts'
import { isCustomRotation, rotationPresets } from './presets.ts'
import { initialSelection, selectRotation, selectionMatrix } from './selection.ts'
import './style.css'

interface AppProps {
    readonly plotly: PlotlyApi | undefined
    readonly assetBase: string
}
const config = { displaylogo: false }

/** Formats unknown vendor errors without assuming Error instances across realms. */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/** Owns selection, validation and reset state. The shared Plot component owns all
 * vendor DOM and serialized async mutations, including interrupted mounts.
 */
export default function App({ plotly, assetBase }: AppProps) {
    const [selection, setSelection] = useState(initialSelection)
    const [plotError, setPlotError] = useState<string | null>(null)
    const [revision, setRevision] = useState(0)
    const layout = useMemo(rotationLayout, [revision])
    const result = useMemo(() => {
        try { return { data: rotationTraces(selectionMatrix(selection)), error: null } }
        catch (error) { return { data: null, error: errorMessage(error) } }
    }, [selection])
    const custom = isCustomRotation(selection.rotation)

    /** Updates both rotation and displayed angles atomically; invalid IDs surface. */
    function changeRotation(event: ChangeEvent<HTMLSelectElement>): void {
        const rotation = Number(event.currentTarget.value)
        setSelection(current => selectRotation(current, rotation))
    }

    /** Retains incomplete input text for correction while suppressing invalid plots. */
    function changeAngle(index: 0 | 1 | 2, value: string): void {
        setSelection(current => {
            const angles: [string, string, string] = [...current.angles]
            angles[index] = value
            return { ...current, angles }
        })
    }

    /** Remounts the vendor resource to restore camera while preserving selection. */
    function resetPlot(): void {
        setPlotError(null)
        setRevision(current => current + 1)
    }

    /** Reports rejected vendor work; the user can explicitly retry a fresh mount. */
    function reportPlotError(error: unknown): void {
        setPlotError(errorMessage(error))
    }

    return <>
        <table className="brand"><tbody><tr><td>
            <a href="https://ardupilot.org"><img src={`${assetBase}images/ArduPilot.png`} /></a>
        </td><td>
            <a href="https://github.com/ArduPilot/WebTools"><img src={`${assetBase}images/github-mark.png`} style={{ width: 60 }} /></a><br />
            <a href="https://github.com/ArduPilot/WebTools"><img src={`${assetBase}images/GitHub_Logo.png`} style={{ width: 60 }} /></a>
        </td></tr></tbody></table>
        <h1><a href="">ArduPilot Rotation Check</a></h1>
        <p className="description">
            This tool helps visualizing ArduPilots standard rotations, these are used to configure sensor orientations such as AHRS_ORIENTATION. A custom rotation can also be selected and the euler angles entered manually.{' '}
            The rotation is intrinsic in 321 order. For more information see <a href="https://github.com/ArduPilot/Datasheets/blob/main/References/EulerAngles.pdf">Computing Euler Angles from Direction Cosines</a> by William Premerlani.{' '}
            The rotations are shown in forward (blue), right (red), down (green) reference frame as this is what is typically used to show position offsets.
            <br /><br />
            <select id="rotations" aria-label="Rotation" value={selection.rotation} onChange={changeRotation}>
                {rotationPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.id}:{preset.label}</option>)}
                <option value={101}>101:Custom 1</option><option value={102}>102:Custom 2</option>
            </select>{' '}
            {(['Roll', 'Pitch', 'Yaw'] as const).map((axis, index) => <span key={axis}>
                <label htmlFor={`Euler${axis}`}>{axis} (deg):</label>{' '}
                <input id={`Euler${axis}`} name={`Euler${axis}`} type="number" disabled={!custom}
                    value={selection.angles[index]} onChange={event => changeAngle(index as 0 | 1 | 2, event.currentTarget.value)} />{' '}
            </span>)}
        </p>
        <div className="rotation-plot-container">
            <div className="rotation-plot-actions"><button type="button" onClick={resetPlot}>Reset view</button></div>
            {!plotly && <p role="alert">Unable to load the plot library. Please reload this page.</p>}
            {result.error && <p role="alert">{result.error}</p>}
            {plotError && <p role="alert">Unable to render rotation: {plotError} Please use Reset view to retry.</p>}
            {plotly && result.data && <Plot key={revision} id="plot" plotly={plotly} data={result.data}
                layout={layout} config={config} onError={reportPlotError} />}
        </div>
    </>
}
