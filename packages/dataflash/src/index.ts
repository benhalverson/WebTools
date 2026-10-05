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
  /** Discover types and load the requested messages from local bytes. Pass an
   * empty list for discovery only; omitted messages use upstream defaults.
   * Use a fresh parser per input. Corrupt input may throw or yield partial data. */
  processData(data: ArrayBuffer, messages?: string[]): {
    types: Record<string, MessageType | undefined>; messages: Record<string, unknown>
  }
  /** Load a whole message, or return undefined when it is absent. Upstream can
   * throw for instance-bearing messages; use get_instance for those instead. */
  get(name: string): Message | undefined
  /** Load a field without converting its values; an empty field selects the
   * whole message. Missing messages or fields return undefined. */
  get<Field extends string>(name: string, field: Field): FieldResult<Field> | undefined
  /** Load a message instance using upstream instance selection. Missing data
   * returns undefined; null is passed through without choosing an instance. */
  get_instance(name: string, instance: string | number | null): Message | undefined
  /** Load an instance field, or its whole message for an empty field name.
   * Missing data returns undefined; values retain upstream precision/scaling. */
  get_instance<Field extends string>(name: string, instance: string | number | null, field: Field): FieldResult<Field> | undefined
  /** Derive the start date using upstream GPS/leap-second rules, or return
   * undefined when the log has no usable start time. */
  extractStartTime(): Date | undefined
  /** Invoke upstream worker-style type parsing synchronously, preserving its
   * side effects and errors; this is not a promise-based loading API. */
  loadType(name: string): void
  /** Return per-type counts and byte sizes. Before initialization, FMT retains
   * upstream's undefined count and NaN sizes. */
  stats(): Record<string, LogStatistics | undefined>
}
export interface DataflashConstructor { new (sendPostMessage?: boolean): DataflashLog }
/**
 * Lazily import the pinned browser parser from the adjacent vendor assets.
 * The upstream module installs a self message handler on first import; module
 * caching is left to the browser. Node tests provide an explicit self shim.
 * @returns The upstream constructor; create a fresh instance for each log.
 * @throws Import errors or TypeError if the module has no callable default export.
 * No log bytes are sent to a server. Serve this entry and vendor assets together.
 */
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
