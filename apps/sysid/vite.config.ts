import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { applicationBase } from '@webtools/routing'
import { prefixedHtml, stageRuntimeAssets } from '@webtools/routing/tooling'
import { fileURLToPath } from 'node:url'
import { stagePython } from './tooling/stage-python.ts'
import { mountHarness } from './tests/mount-plugin.ts'
import assets from './runtime-assets.json' with { type: 'json' }

/** Build this app independently with the common hosting prefix baked into assets. */
export default defineConfig(async ({ isPreview }): Promise<UserConfig> => {
    const base = applicationBase('sysid', process.env.WEBTOOLS_BASE_PATH ?? process.env.PORTAL_BASE_PATH)
    const publicDir = fileURLToPath(new URL('./.legacy-assets/', import.meta.url))
    if (!isPreview) await stagePython()
    if (!isPreview) await stageRuntimeAssets(fileURLToPath(new URL('../../', import.meta.url)), publicDir, assets)
    return { base, optimizeDeps: { include: ['@webtools/react-workflows'] }, appType: 'mpa', publicDir, environments: { client: { build: { rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), runtime: fileURLToPath(new URL('./runtime.html', import.meta.url)) } } } } }, plugins: [react(), prefixedHtml(), cloudflare(), ...(process.env.SYSID_TEST_HARNESS === '1' ? [mountHarness()] : [])] }
})
