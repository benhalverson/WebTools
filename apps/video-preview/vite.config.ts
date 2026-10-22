import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { applicationBase } from '@webtools/routing'
import { prefixedHtml } from '@webtools/routing/tooling'
import { stageAssets } from './tooling/assets.js'

/** Build the complete public video editor independently using the common routing contract. */
export default defineConfig(async ({ isPreview }): Promise<UserConfig> => ({
    base: applicationBase('videoOverlay', process.env.WEBTOOLS_BASE_PATH ?? process.env.PORTAL_BASE_PATH),
    publicDir: isPreview ? '.legacy-assets' : await stageAssets(),
    appType: 'mpa',
    optimizeDeps: { include: ['@webtools/widget-runtime', '@webtools/dataflash', '@webtools/react-workflows'] },
    plugins: [react(), prefixedHtml(), cloudflare()],
}))
