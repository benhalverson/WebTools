import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { applicationBase } from '@webtools/routing'
import { prefixedHtml, stageRuntimeAssets } from '@webtools/routing/tooling'
import { fileURLToPath } from 'node:url'
import assets from './runtime-assets.json' with { type: 'json' }

/** Build this app independently with the common hosting prefix baked into assets. */
export default defineConfig(async ({ isPreview }): Promise<UserConfig> => {
    const base = applicationBase('scurveTool', process.env.WEBTOOLS_BASE_PATH ?? process.env.PORTAL_BASE_PATH)
    const publicDir = fileURLToPath(new URL('./.legacy-assets/', import.meta.url))
    if (!isPreview) await stageRuntimeAssets(fileURLToPath(new URL('../../', import.meta.url)), publicDir, assets)
    return { build: { manifest: true, rollupOptions: { preserveEntrySignatures: 'strict', input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        application: fileURLToPath(new URL('./src/main.tsx', import.meta.url)),
    } } }, base, optimizeDeps: { include: ['@webtools/react-workflows', '@webtools/numerics', '@webtools/parameters'] }, appType: 'mpa', publicDir, plugins: [react(), prefixedHtml(), cloudflare()] }
})
