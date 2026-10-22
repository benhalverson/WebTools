import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { applicationBase } from '@webtools/routing'
import { prefixedHtml } from '@webtools/routing/tooling'
import { fileURLToPath } from 'node:url'

/** Build the test-only production App harness without changing deployed entries. */
export default defineConfig({
    base: applicationBase('analyticTune', process.env.WEBTOOLS_BASE_PATH),
    publicDir: fileURLToPath(new URL('./.legacy-assets/', import.meta.url)),
    plugins: [react(), prefixedHtml()],
    build: { outDir: 'dist/lifetime', rolldownOptions: { input: fileURLToPath(new URL('./tests/lifetime.html', import.meta.url)) } },
})
