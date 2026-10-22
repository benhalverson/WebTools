import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { mapVendorAliases } from '../../tooling/map-vendors.ts'
import { applicationBase } from '@webtools/routing'

/** Build a test-only host; no test endpoint is included in the application Worker. */
export default defineConfig({
    root: fileURLToPath(new URL('./', import.meta.url)),
    base: applicationBase('geofenceGenerator', process.env.WEBTOOLS_BASE_PATH),
    publicDir: fileURLToPath(new URL('../../.legacy-assets/', import.meta.url)),
    build: { outDir: fileURLToPath(new URL('../../.lifecycle-dist/', import.meta.url)), emptyOutDir: true },
    plugins: [react()],
    resolve: { alias: mapVendorAliases },
})
