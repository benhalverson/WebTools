import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { applicationBase } from '@webtools/routing'
import { prefixedHtml } from '@webtools/routing/tooling'
import mavlinkAssets from '@webtools/mavlink/vite'
/** Independently build the preview at its shared registered mount. */
export default defineConfig((): UserConfig => ({ base: applicationBase('simplegcsPreview', process.env.WEBTOOLS_BASE_PATH ?? process.env.PORTAL_BASE_PATH), appType: 'mpa', define: { __MAVLINK_DEV_PATHS__: JSON.stringify(['@fs' + createRequire(import.meta.url).resolve('leaflet/dist/leaflet.css'), ...['browser.mjs', 'runtime/mavlink.js', 'runtime/local_modules/jspack/jspack.js'].map(file => '@fs' + fileURLToPath(new URL('../../packages/mavlink/dist/' + file, import.meta.url)))]) }, optimizeDeps: { include: ['@webtools/routing', '@webtools/transfers'], exclude: ['@webtools/mavlink'] }, plugins: [react(), prefixedHtml(), mavlinkAssets(), cloudflare()] }))
