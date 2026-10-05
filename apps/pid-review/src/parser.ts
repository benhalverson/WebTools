import type { DataflashConstructor } from '@webtools/dataflash'

/** Load the staged typed boundary beside its unchanged parser asset at either hosting prefix. */
export async function parser(): Promise<DataflashConstructor> {
    const url = new URL(import.meta.env.BASE_URL + 'dataflash/index.js', window.location.origin)
    const module: unknown = await import(/* @vite-ignore */ url.href)
    if (typeof module !== 'object' || module === null || !('loadDataflashParser' in module) || typeof module.loadDataflashParser !== 'function') throw new TypeError('Dataflash parser asset unavailable')
    // The staged entry is the workspace's typed boundary, not a second parser implementation.
    return (module.loadDataflashParser as () => Promise<DataflashConstructor>)()
}
