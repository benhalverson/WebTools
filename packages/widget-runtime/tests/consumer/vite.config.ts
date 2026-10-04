import { cp, copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mavlinkAssets from '@webtools/mavlink/vite'

/** Stage exact local assets for offline production-consumer validation under either base path. */
export default defineConfig(async () => {
    const publicDir = fileURLToPath(new URL('../../.consumer-assets/', import.meta.url))
    const base = process.env.WIDGET_PREFIX ?? '/WidgetRuntime/'
    await mkdir(`${publicDir}/vendor`, { recursive: true })
    await mkdir(`${publicDir}/Widgets`, { recursive: true })
    for (const file of ['gridstack-all.js', 'gridstack.min.css', 'gridstack-extra.min.css']) {
        await copyFile(fileURLToPath(new URL(`../../node_modules/gridstack/dist/${file}`, import.meta.url)), `${publicDir}/vendor/${file}`)
    }
    for (const file of ['formio.full.min.js', 'formio.full.min.css']) {
        await copyFile(fileURLToPath(new URL(`../../node_modules/formiojs/dist/${file}`, import.meta.url)), `${publicDir}/vendor/${file}`)
    }
    await copyFile(fileURLToPath(new URL('../../assets/SandBox.html', import.meta.url)), `${publicDir}/Widgets/SandBox.html`)
    await cp(fileURLToPath(new URL('../../../../TelemetryDashboard/SandBoxWidgets', import.meta.url)), `${publicDir}/fixtures/builtins`, { recursive: true })
    await copyFile(fileURLToPath(new URL('../../../../TelemetryDashboard/Default_Layout.json', import.meta.url)), `${publicDir}/fixtures/Default_Layout.json`)
    return { root: fileURLToPath(new URL('./', import.meta.url)), base, publicDir, plugins: [react(), mavlinkAssets()], build: { outDir: '../../consumer-dist', emptyOutDir: true } }
})
