import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, extname } from 'node:path'
import { original } from './legacy.mjs'
const root = fileURLToPath(new URL('../../../', import.meta.url))
/** Serve immutable owned legacy sources and unchanged pinned local vendor assets
 * for real browser interaction comparison, never fetching external resources. */
export async function startLegacy() {
    const server = createServer(async (request, response) => {
        try {
            let path = new URL(request.url, 'http://localhost').pathname.slice(1)
            if (path.endsWith('/')) path += 'index.html'
            const target = resolve(root, path)
            if (!target.startsWith(root)) { response.writeHead(404); response.end(); return }
            const data = path.startsWith('StreamStats/') || path.startsWith('Libraries/') ? original(path) : await readFile(target)
            response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[extname(path)] ?? 'application/octet-stream')
            response.end(data)
        } catch { response.writeHead(404); response.end() }
    })
    try {
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    } catch (error) { server.close(); throw error }
    return { origin: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }) }
}
