import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { applicationBase } from '@webtools/routing'
import { prefixedHtml } from '@webtools/routing/tooling'
import { stageAssets, stagingDirectory } from './tooling/stage-assets.ts'

/** Build the portal independently using the shared common-prefix convention. */
export default defineConfig(async ({ isPreview }): Promise<UserConfig> => {
  const base = applicationBase('portal', process.env.WEBTOOLS_BASE_PATH ?? process.env.PORTAL_BASE_PATH)
  if (!isPreview) await stageAssets()
  return { base, appType: 'mpa', publicDir: stagingDirectory, plugins: [react(), prefixedHtml(), cloudflare()] }
})
