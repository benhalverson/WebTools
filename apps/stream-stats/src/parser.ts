import type { DataflashConstructor, DataflashLog } from '@webtools/dataflash'
import { binaryDataset, telemetryDataset, type Dataset } from './model.ts'
import { parseTlog } from './tlog.ts'
interface ParserModule { loadDataflashParser: () => Promise<DataflashConstructor> }
/** Import the package's standalone ESM directory without rebundling import.meta.url. */
async function parserConstructor(base: string): Promise<DataflashConstructor> {
    const url = new URL(base + 'dataflash/index.js', window.location.origin)
    const candidate: unknown = await import(/* @vite-ignore */ url.href)
    if (typeof candidate !== 'object' || candidate === null || !('loadDataflashParser' in candidate) || typeof candidate.loadDataflashParser !== 'function') throw new TypeError('Invalid Dataflash boundary')
    return (candidate as ParserModule).loadDataflashParser()
}
/** Parse a fresh local input; the caller owns cancellation of stale async results. */
export async function parseInput(bytes: ArrayBuffer, binary: boolean, base: string): Promise<Dataset> {
    if (!binary) return telemetryDataset(parseTlog(bytes), bytes.byteLength)
    const Parser = await parserConstructor(base)
    const log: DataflashLog = new Parser()
    log.processData(bytes, [])
    return binaryDataset(log, bytes.byteLength)
}
