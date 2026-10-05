import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const root = fileURLToPath(new URL('./', import.meta.url))
export default defineConfig(async () => {
    const prefix = process.env.WORKFLOWS_PREFIX ?? '/'
    if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(prefix)) throw new Error('WORKFLOWS_PREFIX must start and end with /')
    const publicDir = fileURLToPath(new URL('../../.consumer-assets/', import.meta.url))
    await mkdir(`${publicDir}/vendor`, { recursive: true })
    for (const [source, target] of [['modules/plotly.js/dist/plotly.min.js', 'plotly.min.js'], ['Libraries/FileSaver.js', 'FileSaver.js']]) {
        await copyFile(fileURLToPath(new URL(`../../../../${source}`, import.meta.url)), `${publicDir}/vendor/${target}`)
    }
    return { root, base: `${prefix}ReactWorkflows/`, publicDir, plugins: [react()], build: { outDir: '../../consumer-dist', emptyOutDir: true } }
})
