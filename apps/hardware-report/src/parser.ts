import type { DataflashConstructor } from '@webtools/dataflash'

/** Load the standalone parser boundary beside its vendor directory. Keeping
 * this entry outside Vite's bundle preserves the DataFlash ESM asset contract;
 * the browser caches modules, while each selection creates its own parser. */
export async function parserConstructor(assetBase: string): Promise<DataflashConstructor> {
    const url = new URL(`${assetBase}dataflash/index.js`, window.location.origin)
    const module: unknown = await import(/* @vite-ignore */ url.href)
    if (typeof module !== 'object' || module === null || !('loadDataflashParser' in module)
        || typeof module.loadDataflashParser !== 'function') throw new TypeError('Unable to load the log parser.')
    return (module.loadDataflashParser as () => Promise<DataflashConstructor>)()
}
