import { Fragment, useMemo, useState } from 'react'
import { downloadFile, type SaveAs } from '@webtools/react-workflows'
import { availableGroups, exportParameters, type Parameters } from './model/index.ts'
import { changedParameters, type ParameterChange } from './model/log-extractions.ts'

interface ParameterExportsProps {
    params: Parameters
    defaults: Parameters
    changes: Record<string, ParameterChange[]>
    filename: string
    saveAs: SaveAs | undefined
    onError: (cause: unknown) => void
    onSaved: () => void
}
const groupSections = [
    { title: 'Inertial Sensors', ids: ['param_ins_gyro', 'param_ins_accel', 'param_ins_use', 'param_ins_position'] },
    { title: 'Compass', ids: ['param_compass_calibration', 'param_compass_ordering', 'param_compass_id', 'param_compass_use', 'param_declination'] },
    { title: 'Barometer', ids: ['param_baro_calibration', 'param_baro_id', 'param_baro_wind_comp'] },
    { title: 'Airspeed', ids: ['param_airspeed_type', 'param_airspeed_calibration', 'param_airspeed_use'] },
    { title: 'AHRS', ids: ['param_ahrs_trim', 'param_ahrs_orientation'] },
    { title: 'RC', ids: ['param_rc_calibration', 'param_rc_reverse', 'param_rc_dz', 'param_rc_options', 'param_rc_flightmodes'] },
]

/** Own the parameter export controls across file selections, including default
 * filtering, category availability, and the unchanged float32 serialization. */
export function ParameterExports({ params, defaults, changes, filename, saveAs, onError, onSaved }: ParameterExportsProps) {
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
    const [changed, setChanged] = useState(false)
    const [previousDefaults, setPreviousDefaults] = useState(defaults)
    const [previousParams, setPreviousParams] = useState(params)
    const haveDefaults = Object.keys(defaults).length > 0
    if (previousDefaults !== defaults) {
        setPreviousDefaults(defaults)
        setChanged(haveDefaults)
    }
    const base = useMemo(() => changed ? changedParameters(params, defaults) : params, [params, defaults, changed])
    const groups = useMemo(() => availableGroups(base), [base])
    if (previousParams !== params) {
        setPreviousParams(params)
        const nextGroups = availableGroups(haveDefaults ? changedParameters(params, defaults) : params)
        if (Object.keys(params).length > 0) setSelected(previous => new Set([...previous].filter(id => nextGroups.some(group => group.id === id && !group.disabled))))
    }

    /** Switch export bases and clear only categories unavailable in that base. */
    function selectBase(next: boolean): void {
        setChanged(next)
        const nextGroups = availableGroups(next ? changedParameters(params, defaults) : params)
        setSelected(previous => new Set([...previous].filter(id => nextGroups.some(group => group.id === id && !group.disabled))))
    }

    /** Toggle an independent export category without mutating retained selections. */
    function toggleGroup(id: string, checked: boolean): void {
        setSelected(previous => {
            const next = new Set(previous)
            if (checked) next.add(id)
            else next.delete(id)
            return next
        })
    }

    /** Save the exact legacy text, suffix and MIME type with the pinned FileSaver. */
    function save(mode: 'all' | 'changed' | 'minimal'): void {
        try {
            if (!saveAs) throw new Error('Unable to load the download library. Please reload this page.')
            const source = mode === 'changed' ? changedParameters(params, defaults) : mode === 'minimal' ? base : params
            const text = exportParameters(source, selected, mode === 'minimal' ? 'minimal' : 'all')
            const basename = filename.substring(0, filename.lastIndexOf('.')) || filename || 'log'
            const suffix = mode === 'all' ? '.param' : `_${mode}.param`
            downloadFile(saveAs, new Blob([text], { type: 'text/plain;charset=utf-8' }), basename + suffix)
            onSaved()
        } catch (cause) { onError(cause) }
    }

    /** Render an available-parameter tooltip alongside each controlled checkbox. */
    function checkbox(id: string) {
        const group = groups.find(item => item.id === id)
        if (!group) return null
        return <Fragment key={id}><input type="checkbox" id={id} disabled={group.disabled} checked={selected.has(id)} title={group.title}
            onChange={event => toggleGroup(id, event.currentTarget.checked)} />{' '}
            <label htmlFor={id} title={group.title}>{group.label}</label><br /></Fragment>
    }

    if (Object.keys(params).length === 0) return null
    const visibleChanges = Object.entries(changes).filter(([name]) => !name.startsWith('STAT_'))
    return <><h3>Download Parameters</h3><div id="ParametersContent">
        <p><button type="button" onClick={() => save('all')}>Save All Parameters</button>{' '}
            {haveDefaults && <button type="button" id="SaveChangedParams" title="saves only those parameters that have been changed from their default value" onClick={() => save('changed')}>Save Changed Parameters</button>}</p>
        <h4>Minimal Configuration</h4>
        <p className="minimal-description">Configuration parameters excluding calibrations, flight modes, etc. You may select certain of these to be included with the check boxes below.
            For sharing and comparing similar vehicle configurations.</p>
        <fieldset className="base-choices"><legend>Basic Configuration Parameters</legend>
            <input type="radio" id="param_base_all" name="param_base" checked={!changed} onChange={() => selectBase(false)} /><label htmlFor="param_base_all">All</label>{' '}
            <input type="radio" id="param_base_changed" name="param_base" disabled={!haveDefaults} checked={changed} onChange={() => selectBase(true)} /><label htmlFor="param_base_changed">Changed from defaults</label><br />
        </fieldset>
        <form id="params"><table><tbody>{[0, 3].map(start => <tr key={start}>{groupSections.slice(start, start + 3).map(section => <td key={section.title}>
            <fieldset className="parameter-group"><legend>{section.title}</legend>{section.ids.map(checkbox)}</fieldset>
        </td>)}</tr>)}</tbody></table>
            <fieldset className="stream-rates"><legend>Stream rates</legend>{Array.from({ length: 7 }, (_, index) => checkbox(`param_stream_${index}`))}</fieldset>
        </form><br /><button type="button" id="SaveMinimalParams" onClick={() => save('minimal')}>Save Minimal Parameters</button>
        {visibleChanges.length > 0 && <><h4>Parameters Changed During Logging</h4><div id="ParameterChanges">{visibleChanges.map(([name, history]) => <details key={name} className="parameter-changes"><summary>{name}</summary><table><thead><tr><th>Time (s)</th><th>Value</th></tr></thead><tbody>{history.map((change, index) => <tr key={index}><td>{change.time.toFixed(2)}</td><td>{String(change.value)}</td></tr>)}</tbody></table></details>)}</div></>}
    </div></>
}
