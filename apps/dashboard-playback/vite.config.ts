import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { applicationBase } from '@webtools/routing'
import { prefixedHtml } from '@webtools/routing/tooling'
import mavlinkAssets from '@webtools/mavlink/vite'
import { stageAssets } from './tooling/assets.js'

/** Build the public dashboard independently using the common routing contract. */
export default defineConfig(async ({ isPreview }): Promise<UserConfig> => ({
    base: applicationBase('dashboardPlayback', process.env.WEBTOOLS_BASE_PATH ?? process.env.PORTAL_BASE_PATH),
    publicDir: isPreview ? '.legacy-assets' : await stageAssets(),
    appType: 'mpa',
    optimizeDeps: { include: ['@webtools/widget-runtime', '@webtools/mavlink/browser', '@webtools/react-workflows'] },
    plugins: [react(), mavlinkAssets(), prefixedHtml(), cloudflare()],
}))
