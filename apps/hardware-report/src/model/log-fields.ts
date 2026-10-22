import type { Message } from '@webtools/dataflash'
/** Read a numeric field without changing parser precision or coercing malformed fields. */
export function numbers(
    message: Message | undefined,
    field: string,
): Float64Array {
    const value = message?.[field]
    if (!(value instanceof Float64Array))
        throw new TypeError(`Missing numeric log field ${field}`)
    return value
}
/** Read a string field from the parser boundary. */
export function strings(message: Message | undefined, field: string): string[] {
    const value = message?.[field]
    if (
        !Array.isArray(value) ||
        !value.every((item) => typeof item === 'string')
    )
        throw new TypeError(`Missing string log field ${field}`)
    return value
}
