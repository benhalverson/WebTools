import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Build a test-only mount owner around the real application; no fixture enters production. */
export default defineConfig({
    root: fileURLToPath(new URL('./lifecycle-fixture/', import.meta.url)),
    plugins: [react()],
    optimizeDeps: { include: ['@webtools/react-workflows'] },
    build: { outDir: process.env.ANALYZER_LIFECYCLE_OUTPUT, emptyOutDir: true },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [fileURLToPath(new URL('../../../..', import.meta.url))] } },
    preview: { host: '127.0.0.1', port: 0 },
})
