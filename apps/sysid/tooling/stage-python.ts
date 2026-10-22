import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import assets from '../python-assets.json' with { type: 'json' }

/** Cache only hash-verified release bytes; builds never silently resolve newer Python dependencies. */
export async function stagePython(): Promise<void> {
    const directory = new URL('../.python-cache/', import.meta.url)
    await mkdir(directory, { recursive: true })
    for (const [name, asset] of Object.entries(assets)) {
        const target = new URL(name, directory)
        let bytes: Uint8Array
        try { bytes = await readFile(target) } catch {
            const response = await fetch(asset.url)
            if (!response.ok) throw new Error(`Python asset ${name}: HTTP ${response.status}`)
            bytes = new Uint8Array(await response.arrayBuffer())
        }
        if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Python asset checksum mismatch: ${name}`)
        await writeFile(target, bytes)
        // Cloudflare Assets limits individual files to 25 MiB. Reassemble exact bytes in the Worker.
        if (bytes.length > 24 * 1024 * 1024) {
            for (let offset = 0, part = 0; offset < bytes.length; offset += 16 * 1024 * 1024, part++) await writeFile(new URL(name + `.part${part}`, directory), bytes.subarray(offset, offset + 16 * 1024 * 1024))
        }
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await stagePython()
