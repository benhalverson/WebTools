import type { DataflashConstructor } from '@webtools/dataflash'
import type { MatrixApi } from './types.ts'
/** Narrow the unchanged vendor global once; numerical methods are exercised by parity tests. */
export function matrixApi(): MatrixApi {
    const value: unknown = Reflect.get(window, 'mlMatrix')
    if (
        !value ||
        typeof value !== 'object' ||
        !('Matrix' in value) ||
        typeof value.Matrix !== 'function' ||
        !('solve' in value) ||
        typeof value.solve !== 'function' ||
        !('inverse' in value) ||
        typeof value.inverse !== 'function'
    )
        throw new Error('Unable to load matrix library')
    return value as MatrixApi
}
/** Import the standalone boundary at its deployed URL, preserving adjacent vendor layout. */
export async function parserConstructor(base: string): Promise<DataflashConstructor> {
    const url = new URL(`${base}dataflash/index.js`, window.location.href)
    const value: unknown = await import(/* @vite-ignore */ url.href)
    if (
        !value ||
        typeof value !== 'object' ||
        !('loadDataflashParser' in value) ||
        typeof value.loadDataflashParser !== 'function'
    )
        throw new Error('Unable to load DataFlash boundary')
    return (value as { loadDataflashParser: () => Promise<DataflashConstructor> }).loadDataflashParser()
}
/** Invoke the checked-in FileSaver implementation with unchanged download semantics. */
export function saveAs(blob: Blob, filename: string): void {
    const value: unknown = Reflect.get(window, 'saveAs')
    if (typeof value !== 'function') throw new Error('Unable to load download library')
    value(blob, filename)
}
