import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { applicationBase } from '@webtools/routing'
import { prefixedHtml } from '@webtools/routing/tooling'
import mavlinkAssets from '@webtools/mavlink/vite'
/** Independently build the preview at its shared registered mount. */
export default defineConfig((): UserConfig => ({ base: applicationBase('simplegcsPreview', process.env.WEBTOOLS_BASE_PATH ?? process.env.PORTAL_BASE_PATH), appType: 'mpa', define: { __MAVLINK_DEV_PATHS__: JSON.stringify(['@fs' + createRequire(import.meta.url).resolve('leaflet/dist/leaflet.css'), ...['browser.mjs', 'runtime/mavlink.js', 'runtime/local_modules/jspack/jspack.js'].map(file => '@fs' + fileURLToPath(new URL('../../packages/mavlink/dist/' + file, import.meta.url)))]) }, optimizeDeps: { include: ['@webtools/routing'], exclude: ['@webtools/mavlink'] }, plugins: [{ name: 'simplegcs-video-vendor',
    /** Publish the unchanged, pinned MediaMTX reader in the app's independent asset bundle. */
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'vendor/mediamtx/reader.js', source: readFileSync(new URL('../../SimpleGCS/vendor/mediamtx/reader.js', import.meta.url)) }) },
    /** Serve the same reader bytes before the Worker handles development requests. */
    configureServer(server) { server.middlewares.use((request, response, next) => { if (request.url?.split('?')[0] === applicationBase('simplegcsPreview', process.env.WEBTOOLS_BASE_PATH ?? process.env.PORTAL_BASE_PATH) + 'vendor/mediamtx/reader.js') { response.setHeader('content-type', 'text/javascript'); response.end(readFileSync(new URL('../../SimpleGCS/vendor/mediamtx/reader.js', import.meta.url))) } else next() }) },
}, react(), prefixedHtml(), mavlinkAssets(), cloudflare()] }))
