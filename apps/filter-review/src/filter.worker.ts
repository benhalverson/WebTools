import { compare, type Comparison } from './comparison.ts'
import type { FilterSettings } from './filters.ts'
import type { Spectrum } from './spectrum.ts'
import type { Tracking } from './tracking.ts'

export interface FilterRequest { spectrum: Spectrum; filters: FilterSettings; tracking: Tracking }
export type FilterResponse = { result: Comparison } | { error: string }
/** Keep the high-resolution response computation in its own cancellable lifetime. */
self.onmessage = (event: MessageEvent<FilterRequest>) => {
    try { self.postMessage({ result: compare(event.data.spectrum, event.data.filters, event.data.tracking) } satisfies FilterResponse) }
    catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : String(cause) } satisfies FilterResponse) }
}
