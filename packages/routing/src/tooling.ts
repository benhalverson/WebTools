import { copyFile, lstat, mkdir, realpath, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { Plugin } from 'vite'

/** Stage a reviewed runtime allowlist, failing before deletion if an input is absent
 * or a symlink. Source paths must remain inside the repository root.
 */
export async function stageRuntimeAssets(root: string, destination: string, assets: Readonly<Record<string, string>>): Promise<void> {
    for (const sourcePath of Object.values(assets)) {
        const source = resolve(root, sourcePath)
        try {
            if (!source.startsWith(resolve(root) + '/') || !(await lstat(source)).isFile() || await realpath(source) !== source) {
                throw new Error('Expected a regular file inside the repository without symlinks')
            }
        } catch (cause) {
            throw new Error(`Missing or unsafe runtime asset: ${sourcePath}. Initialize pinned runtime submodules.`, { cause })
        }
    }
    for (const path of Object.keys(assets)) {
        if (!resolve(destination, path).startsWith(resolve(destination) + '/')) throw new Error(`Unsafe asset destination: ${path}`)
    }
    await rm(destination, { recursive: true, force: true })
    for (const [path, source] of Object.entries(assets)) {
        const target = resolve(destination, path)
        await mkdir(dirname(target), { recursive: true })
        await copyFile(resolve(root, source), target)
    }
}

/** Keep Cloudflare's HTML lookup relative to Vite's already-stripped base. */
export function prefixedHtml(): Plugin {
    return {
        name: 'webtools-prefixed-html',
        /** Install after Vite's base middleware. */
        configureServer(server) {
            return () => server.middlewares.use((request, _response, next) => {
                if (request.url?.split('?')[0]?.endsWith('.html')) request.originalUrl = request.url
                next()
            })
        },
    }
}

/** Extract a listening origin from accumulated Vite output, including ANSI
 * formatting that CI may insert between the hostname and port. Accumulate chunks
 * before calling so split escape sequences cannot conceal the readiness URL.
 */
export function listeningOrigin(output: string): string | undefined {
    return stripVTControlCharacters(output).match(/http:\/\/127\.0\.0\.1:\d+(?=\/)/)?.[0]
}
