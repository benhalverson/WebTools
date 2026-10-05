import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { applicationBase } from '@webtools/routing'
import { prefixedHtml, stageRuntimeAssets } from '@webtools/routing/tooling'
import { fileURLToPath } from 'node:url'
import { readdir } from 'node:fs/promises'
import assets from './runtime-assets.json' with { type: 'json' }

/** Build this app independently with the common hosting prefix baked into assets. */
export default defineConfig(async ({ isPreview }): Promise<UserConfig> => {
    const base = applicationBase('airspeedFit', process.env.WEBTOOLS_BASE_PATH ?? process.env.PORTAL_BASE_PATH)
    const publicDir = fileURLToPath(new URL('./.legacy-assets/', import.meta.url))
    if (!isPreview) {
        const parserRoot = fileURLToPath(new URL('../../packages/dataflash/dist/', import.meta.url))
        const parserAssets = Object.fromEntries(
            (await readdir(parserRoot, { recursive: true, withFileTypes: true }))
                .filter((entry) => entry.isFile())
                .map((entry) => {
                    const relative = (entry.parentPath + '/' + entry.name).slice(parserRoot.length)
                    return ['dataflash/' + relative, 'packages/dataflash/dist/' + relative]
                }),
        )
        await stageRuntimeAssets(fileURLToPath(new URL('../../', import.meta.url)), publicDir, {
            ...assets,
            ...parserAssets,
        })
    }
    return {
        base,
        environments: {
            client: {
                build: {
                    rollupOptions: {
                        preserveEntrySignatures: 'strict',
                        input: {
                            page: fileURLToPath(new URL('./index.html', import.meta.url)),
                            application: fileURLToPath(new URL('./src/main.tsx', import.meta.url)),
                        },
                    },
                },
            },
        },
        optimizeDeps: { include: ['@webtools/react-workflows', '@webtools/numerics', '@webtools/parameters'] },
        appType: 'mpa',
        publicDir,
        plugins: [react(), prefixedHtml(), cloudflare()],
    }
})
