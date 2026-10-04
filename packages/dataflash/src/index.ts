/** The upstream reader returns numeric Float64Arrays, strings, or int16 vectors.
 * Values (including 64-bit integers) retain upstream precision and scaling. */
export type FieldValues = Float64Array | string[] | number[][]
export type Message = Record<string, FieldValues | undefined>
export interface MessageType {
  expressions: string[]
  units: (string | undefined)[] | undefined
  multipliers: (number | undefined)[] | undefined
  complexFields: Record<string, { name: string; units: string; multiplier: number | undefined }>
  instances?: Record<string, string>
}
/** Empty field names select the whole message in upstream. A dynamic string
 * may be empty, while a known nonempty literal selects a field. */
export type FieldResult<Field extends string> = Field extends ''
  ? Message
  : '' extends Field ? Message | FieldValues : FieldValues
/** Before initialization FMT has undefined count and NaN sizes, as upstream. */
export interface LogStatistics { count: number | undefined; msg_size: number; size: number }
/** Narrow, consumed surface of the pinned upstream implementation. Missing
 * messages/fields return undefined. Corrupt input can throw; errors are not hidden. */
export interface DataflashLog {
  messageTypes: Record<string, MessageType | undefined>
  messages: Record<string, unknown>
  processData(data: ArrayBuffer, messages?: string[]): {
    types: Record<string, MessageType | undefined>; messages: Record<string, unknown>
  }
  get(name: string): Message | undefined
  get<Field extends string>(name: string, field: Field): FieldResult<Field> | undefined
  get_instance(name: string, instance: string | number | null): Message | undefined
  get_instance<Field extends string>(name: string, instance: string | number | null, field: Field): FieldResult<Field> | undefined
  extractStartTime(): Date | undefined
  loadType(name: string): void
  stats(): Record<string, LogStatistics | undefined>
}
export interface DataflashConstructor { new (sendPostMessage?: boolean): DataflashLog }
/** Browser-only lazy import. The build copies the exact pinned parser alongside
 * this entry. No log bytes are sent to a server. Node tests supply a Worker shim. */
export async function loadDataflashParser(): Promise<DataflashConstructor> {
  const url = new URL('./vendor/parser.js', import.meta.url)
  const module: unknown = await import(/* @vite-ignore */ url.href)
  if (typeof module !== 'object' || module === null || !('default' in module) || typeof module.default !== 'function') {
    throw new TypeError('Invalid Dataflash parser module')
  }
  // This single external boundary is backed by byte-identical upstream and
  // differential fixtures, rather than pretending the vendor is typed code.
  return module.default as DataflashConstructor
}
export { get_base_log_message_types, get_version_and_board } from './log-helpers.js'
