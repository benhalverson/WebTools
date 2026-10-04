import { Fragment, useLayoutEffect, useRef } from 'react'
import { find_parameter_metadata, is_parameter_metadata, parameter_bitmask_value, parameter_input_value } from '@webtools/parameters'

export interface ParameterControlProps {
    name: string
    metadata: unknown
    value: string
    onChange: (value: string) => void
    disabled?: boolean
    allowValues?: boolean
    constrain?: boolean
    bitmaskSize?: number
}

/** Controlled replacement for the controls owned by ParameterMetadata.js.
 * The parent owns the raw string, including empty/partial numeric input.
 * Metadata is narrowed before use; absent or unsupported metadata falls back
 * to a numeric control. Browser input events report their raw DOM string.
 * Unknown enum values remain unselected after every render. Bitmask changes
 * use metadata-defined bits and legacy width masking/shift coercions at
 * bitmaskSize; range constraints are optional HTML attributes.
 * No parameter write or asynchronous operation is performed.
 */
export function ParameterControl({ name, metadata: document, value, onChange, disabled = false,
    allowValues = true, constrain = false, bitmaskSize = 32 }: ParameterControlProps) {
    const raw = find_parameter_metadata(document, name)
    const metadata = is_parameter_metadata(raw) ? raw : undefined
    const values = allowValues ? metadata?.Values : undefined
    const bits = metadata?.Bitmask
    const range = constrain && metadata?.Range?.low !== undefined && metadata.Range.high !== undefined ? metadata.Range : undefined
    const select = useRef<HTMLSelectElement>(null)
    // React otherwise selects the first option for an unknown controlled value;
    // legacy selects none. React can reapply its fallback on any parent commit,
    // so restore native selection after every render, even if value is unchanged.
    useLayoutEffect(() => {
        if (select.current && select.current.value !== value) select.current.value = value
    })
    return <p>
        <label htmlFor={name} title={metadata?.Description} style={{ display: 'inline-block', width: 165, margin: '5px 0' }}>{name}</label>
        {values && !bits ? <select ref={select} id={name} name={name} disabled={disabled} value={value} onChange={event => onChange(event.currentTarget.value)}>
            {Object.entries(values).map(([key, description]) => <option key={key} value={key}>{key}:{description}</option>)}
        </select> : <input id={name} name={name} type="number" title={metadata?.Description} disabled={disabled}
            value={value} min={range?.low} max={range?.high} step={bits ? 1 : 'any'} data-type={bits ? bitmaskSize : undefined}
            onChange={event => onChange(event.currentTarget.value)} />}
        {!values && metadata?.Units}
        {bits && <><br />{Object.entries(bits).map(([bit, description], index) => {
            const id = `bit_${bit}_${name}`
            const checked = Boolean(parameter_input_value(value, bitmaskSize) & (1 << parseFloat(bit)))
            const display = parseFloat(bit) >= bitmaskSize ? 'none' : 'inline'
            return <Fragment key={bit}>
                {index > 0 && index % 3 === 0 && <br />}
                <input id={id} type="checkbox" data-bit={bit} disabled={disabled} checked={checked} style={{ display }} onChange={event => {
                    const selected = Object.keys(bits).filter(key => key === bit ? event.currentTarget.checked : Boolean(parameter_input_value(value, bitmaskSize) & (1 << parseFloat(key))))
                    onChange(String(parameter_bitmask_value(selected, bitmaskSize)))
                }} />
                <label htmlFor={id} style={{ display }}>{description}{'\u00a0'}</label>
            </Fragment>
        })}</>}
    </p>
}
