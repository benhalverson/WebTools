import { MAVParam, type PackedParameter, type VehicleParameterDefinition } from '@webtools/parameters'

interface RowProps {
    parameter: PackedParameter; definition: VehicleParameterDefinition; value: string; busy: boolean
    edit: (value: string) => void; apply: () => void; reset: () => void; report: (message: string) => void
}
/** Narrow untrusted metadata maps without altering enum keys or display values. */
function entries(value: unknown): [string, unknown][] { return value && typeof value === 'object' ? Object.entries(value) : [] }
/** Render legacy hints without imposing metadata ranges on valid wire values. */
function hints(d: VehicleParameterDefinition): string {
    const range = d.range && typeof d.range === 'object' ? `${'low' in d.range ? d.range.low : undefined} to ${'high' in d.range ? d.range.high : undefined}` : d.range
    return [d.units && `Units: ${d.units}`, range && `Range: ${range}`, d.increment && `Increment: ${d.increment}`, d.rebootRequired && 'Reboot required'].filter(Boolean).join(' · ')
}
/** Render a controlled parameter card, retaining exact int32 strings and legacy signed bit 31 semantics. */
export function ParameterRow({ parameter: p, definition: d, value, busy, edit, apply, reset, report }: RowProps) {
    const disabled = busy || d.readOnly, changed = p.defaultValue !== undefined && p.value !== p.defaultValue
    const values = entries(d.values), bits = entries(d.bitmask).filter(([bit]) => /^\d+$/.test(bit) && Number(bit) <= 31)
    /** Toggle only the selected bit, keeping unknown bits and the wire type's signedness. */
    function toggle(bit: string, checked: boolean): void {
        try {
            const mask = 1n << BigInt(bit), current = BigInt(value)
            const next = checked ? current | mask : current & ~mask
            edit(String(p.type === 3 ? BigInt.asIntN(32, next) : next))
        } catch { report('Enter an integer before changing bitmask options.') }
    }
    return <article className={`mavparam-row${changed ? ' mavparam-changed' : ''}`} data-parameter={p.name}>
        <div><strong>{p.name}</strong>{!!d.label && <div className="mavparam-label">{String(d.label)}</div>}{d.readOnly && <small>Read-only</small>}</div>
        <form className="mavparam-value" onSubmit={event => { event.preventDefault(); apply() }}>
            <label>Value<input type="text" inputMode="decimal" autoComplete="off" spellCheck={false} aria-label={`${p.name} value`} value={value} disabled={disabled} onChange={event => edit(event.target.value)} /></label>
            <button type="submit" disabled={disabled}>Apply</button>
            {!!values.length && <select aria-label={`${p.name} options`} disabled={disabled} value={values.some(([key]) => key === value) ? value : ''} onChange={event => { if (event.target.value) edit(event.target.value) }}><option value="">Choose an option</option>{values.map(([key, label]) => <option key={key} value={key}>{key}: {String(label)}</option>)}</select>}
            {!!bits.length && <details><summary>Bitmask options</summary>{bits.map(([bit, label]) => <label className="mavparam-bit" key={bit}><input type="checkbox" disabled={disabled} checked={Number.isFinite(Number(value)) && !!(BigInt(Math.trunc(Number(value))) & (1n << BigInt(bit)))} onChange={event => toggle(bit, event.target.checked)} /> {bit}: {String(label)}</label>)}</details>}
        </form>
        <div className="mavparam-default"><span>Default: {p.defaultValue === undefined ? 'unavailable' : MAVParam.formatValue(p, p.defaultValue)}</span>{changed && <button disabled={disabled} aria-label={`Reset ${p.name} to default`} onClick={reset}>Reset to default</button>}</div>
        <div className="mavparam-help"><p>{String(d.description || 'No description available.')}</p><small>{hints(d)}</small></div>
    </article>
}
