import { cp, copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { stageRuntimeAssets } from '@webtools/routing/tooling'
import assets from '../runtime-assets.json' with { type: 'json' }

/** Stage reviewed repository assets and the pinned library distributions for an independent app. */
export async function stageAssets(): Promise<string> {
    const destination = fileURLToPath(new URL('../.legacy-assets/', import.meta.url))
    await stageRuntimeAssets(fileURLToPath(new URL('../../../', import.meta.url)), destination, assets)
    await mkdir(`${destination}/vendor`, { recursive: true })
    for (const file of ['gridstack-all.js', 'gridstack.min.css', 'gridstack-extra.min.css']) {
        await copyFile(fileURLToPath(new URL(`../node_modules/gridstack/dist/${file}`, import.meta.url)), `${destination}/vendor/${file}`)
    }
    for (const file of ['formio.full.min.js', 'formio.full.min.css']) {
        await copyFile(fileURLToPath(new URL(`../node_modules/formiojs/dist/${file}`, import.meta.url)), `${destination}/vendor/${file}`)
    }
    await cp(fileURLToPath(new URL('../../../packages/mavlink/dist/runtime', import.meta.url)), `${destination}/modules/MAVLink`, { recursive: true })
    return destination
}
