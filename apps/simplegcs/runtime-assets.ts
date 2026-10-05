import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Plugin } from 'vite'
import { applicationBase } from '@webtools/routing'
import runtimeAssets from './runtime-assets.json' with { type: 'json' }
/** Read the compatible helper/vendor files unchanged, allowing an optional deployment configuration. */
function asset(path: string): Uint8Array {
    if (path === 'vendor/Leaflet.GoogleMutant.js') return readFileSync(createRequire(import.meta.url).resolve('leaflet.gridlayer.googlemutant/dist/Leaflet.GoogleMutant.js'))
    const url = new URL('../../SimpleGCS/' + path, import.meta.url)
    return path === 'config.js' && !existsSync(url) ? new Uint8Array() : readFileSync(url)
}
/** Publish only reviewed vendor/helper/config assets; no owned legacy page script runs in React. */
export function runtimeAssetPlugin(): Plugin {
    return { name: 'simplegcs-runtime-assets',
        /** Emit exact source bytes into the independent Worker bundle. */
        generateBundle() { for (const path of runtimeAssets) this.emitFile({ type: 'asset', fileName: path, source: asset(path) }) },
        /** Serve identical asset bytes in development before the Worker lookup. */
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const base = applicationBase('simplegcsPreview', process.env.WEBTOOLS_BASE_PATH ?? process.env.PORTAL_BASE_PATH)
                const path = request.url?.split('?')[0]?.slice(base.length)
                if (!request.url?.startsWith(base) || !path || !runtimeAssets.includes(path)) { next(); return }
                response.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.png') ? 'image/png' : 'text/plain')
                response.end(asset(path))
            })
        },
    }
}
