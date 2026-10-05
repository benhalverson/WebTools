import type { DataflashLog } from '@webtools/dataflash'
import { messageNames } from './dataset.ts'
import type { Signal } from './model.ts'

/** Controlled scalar field preserving the original identifiers and native number/text behavior. */
export function Field({ id, label, value, onChange, type = 'text', min }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: 'text' | 'number'; min?: number }) {
    return <label htmlFor={id}>{label} <input id={id} name={id} type={type} min={min} value={value} onChange={event => onChange(event.currentTarget.value)} /></label>
}
/** Signal selection owns message/field dependencies and explicit optional multiplier/compensation state. */
export function SignalFields({ signal, log, prefix, index, output, onChange }: { signal: Signal; log: DataflashLog | null; prefix: string; index: number; output?: boolean; onChange: (signal: Signal) => void }) {
    const messages = messageNames(log), fields = log?.messageTypes[signal.message]?.expressions ?? []
    return <div><label htmlFor={`${prefix}_name_${index}`}>{output ? 'Output' : 'Input'} {index}: </label>
        <select id={`${prefix}_name_${index}`} disabled={!log} value={signal.message} onChange={event => onChange({ ...signal, message: event.currentTarget.value, field: 'None' })}>
            {['None', ...messages].map(name => <option key={name}>{name}</option>)}
        </select>
        <select aria-label={`${output ? 'Output' : 'Input'} ${index} field`} id={`${prefix}_field_${index}`} disabled={!fields.length} value={signal.field} onChange={event => onChange({ ...signal, field: event.currentTarget.value })}>
            {['None', ...fields].map(name => <option key={name}>{name}</option>)}
        </select>
        {output && <><label><input id={`multiplier_checkbox_${index}`} type="checkbox" checked={signal.multiplier !== null} onChange={event => onChange({ ...signal, multiplier: event.currentTarget.checked ? '' : null })} />Multiplier</label>
            {signal.multiplier !== null && <Field id={`multiplier_${index}`} label="" value={signal.multiplier} onChange={value => onChange({ ...signal, multiplier: value })} />}
            <label><input id={`compensation_checkbox_${index}`} type="checkbox" checked={signal.compensation !== null} onChange={event => onChange({ ...signal, compensation: event.currentTarget.checked ? 'Roll' : null })} />Gravity Compensation </label>
            {signal.compensation !== null && <label>Axis: <select id={`axis_dropdown_${index}`} value={signal.compensation} onChange={event => onChange({ ...signal, compensation: event.currentTarget.value === 'Pitch' ? 'Pitch' : 'Roll' })}><option>Roll</option><option>Pitch</option></select></label>}
        </>}
    </div>
}
/** Edit matrices immutably, retaining the legacy cell names consumed by existing workflows. */
export function MatrixFields({ id, label, values, onChange }: { id: string; label: string; values: string[][]; onChange: (matrix: string[][]) => void }) {
    return <div className="matrix"><label>{label}:</label><table id={id}><tbody>{values.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}><input aria-label={`${label} ${i + 1},${j + 1}`} name={`${id}_r${i}_c${j}`} value={cell} onChange={event => onChange(values.map((r, ri) => ri === i ? r.map((v, ci) => ci === j ? event.currentTarget.value : v) : r))} /></td>)}</tr>)}</tbody></table></div>
}
