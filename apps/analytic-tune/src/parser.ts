import type { DataflashConstructor } from '@webtools/dataflash'

/** Load the shared typed parser entry beside its pinned vendor assets at this
 * app's configured public mount. Imports stay local and never upload log bytes. */
export async function loadDataflashParser(): Promise<DataflashConstructor> {
    const url = new URL(import.meta.env.BASE_URL + 'vendor/dataflash/index.js', window.location.origin)
    const module: unknown = await import(/* @vite-ignore */ url.href)
    if (typeof module !== 'object' || module === null || !('loadDataflashParser' in module) || typeof module.loadDataflashParser !== 'function') {
        throw new TypeError('Invalid Dataflash package entry')
    }
    return module.loadDataflashParser() as Promise<DataflashConstructor>
}
