import { fileURLToPath } from 'node:url'
import { stageRuntimeAssets } from '@webtools/routing/tooling'
import assets from '../legacy-assets.json' with { type: 'json' }

const root = fileURLToPath(new URL('../../../', import.meta.url))
export const stagingDirectory = fileURLToPath(new URL('../.legacy-assets/', import.meta.url))

/** Stage only reviewed legacy files and fail loudly for missing pinned submodules. */
export async function stageAssets(): Promise<void> {
  await stageRuntimeAssets(root, stagingDirectory, Object.fromEntries(assets.map(path => [path, path])))
}
