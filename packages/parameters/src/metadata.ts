/** Metadata values retain the upstream spelling and string-valued numbers. */
export interface ParameterMetadata {
    Description?: string
    Units?: string
    Range?: { low?: string | number; high?: string | number }
    Values?: Readonly<Record<string, string>>
    Bitmask?: Readonly<Record<string, string>>
    [field: string]: unknown
}

/** Ordered prefix traversal, exactly as load_param_inputs uses in the legacy UI.
 * This is a compatibility boundary, not a schema validator: matching entries are
 * returned unchanged, and invalid traversed null nodes still throw TypeError.
 * Supply acyclic data; recursion follows matching prefixes in enumeration order.
 * @returns The first match accepted by the legacy traversal, or undefined.
 * @throws TypeError when Object.entries encounters a null or undefined node.
 */
export function find_parameter_metadata(data: unknown, name: string): unknown {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (!name.startsWith(key)) continue
        if (name === key) return value
        const found = find_parameter_metadata(value, name)
        if (found != null) return found
    }
    return undefined
}

/** Narrow a raw lookup only after validating the fields consumed by controls.
 * Unknown upstream fields are preserved and may have any shape.
 */
export function is_parameter_metadata(value: unknown): value is ParameterMetadata {
    if (!isRecord(value)) return false
    for (const field of ['Description', 'Units']) {
        if (field in value && typeof value[field] !== 'string') return false
    }
    for (const field of ['Values', 'Bitmask']) {
        if (field in value) {
            const entries = value[field]
            if (!isRecord(entries) || !Object.values(entries).every(item => typeof item === 'string')) return false
        }
    }
    if ('Range' in value) {
        const range = value.Range
        if (!isRecord(range)) return false
        for (const field of ['low', 'high']) {
            if (field in range && typeof range[field] !== 'string' && typeof range[field] !== 'number') return false
        }
    }
    return true
}

/** Accept non-null, non-array objects without inspecting their fields or prototype. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Load metadata with the caller's fetch implementation and return JSON unchanged.
 * The caller owns cancellation, HTTP status handling, caching, and rendering;
 * this function does not validate the payload or retain request state.
 * @throws Propagates request failures and JSON decoding rejections.
 */
export async function load_parameter_metadata(
    url: string,
    fetcher: (url: string) => Promise<{ json(): Promise<unknown> }>,
): Promise<unknown> {
    const response = await fetcher(url)
    return response.json()
}

/**
 * Parse a text input with parseFloat and apply the legacy unsigned bitmask view.
 * When bitmaskSize is supplied below 32, negative values are remapped and masked
 * using JavaScript's signed 32-bit shifts. Widths are deliberately not validated.
 * Invalid text remains NaN unless bitwise conversion coerces it to zero.
 */
export function parameter_input_value(input: string, bitmaskSize?: number): number {
    let value = parseFloat(input)
    if (bitmaskSize !== undefined && bitmaskSize < 32) {
        if (value < 0) {
            value += (1 << bitmaskSize)
            value |= 1 << (bitmaskSize - 1)
        }
        value &= 0xFFFFFFFF >>> (32 - bitmaskSize)
    }
    return value
}

/**
 * Combine checked bit indices and interpret the result as a signed bitmask.
 * Indices use parseFloat and JavaScript shift coercion, so duplicates are harmless
 * and out-of-range indices wrap. Widths below 32 mask and sign-adjust the result;
 * neither indices nor widths are validated, matching the legacy checkbox handler.
 */
export function parameter_bitmask_value(bits: readonly (string | number)[], size = 32): number {
    let value = 0
    for (const bit of bits) value |= 1 << parseFloat(String(bit))
    if (size < 32) {
        value &= 0xFFFFFFFF >>> (32 - size)
        if ((value & (1 << (size - 1))) != 0) value -= (1 << size)
    }
    return value
}
