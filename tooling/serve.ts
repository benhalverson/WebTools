import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { requestPath } from './request-path.ts'
import { listeningOrigin } from '@webtools/routing/tooling'
import { applicationForPath, hostingPrefix, type Application } from '@webtools/routing'

const root = fileURLToPath(new URL('../', import.meta.url))
const children: ChildProcess[] = []
const sockets = new Set<import('node:net').Socket>()
let server: Server | undefined
let stopping = false

/** Stop the gateway and every owned Worker subprocess, including startup failures. */
function stop(code: number): void {
    if (stopping) return
    stopping = true
    for (const socket of sockets) socket.destroy()
    server?.close()
    for (const child of children) {
        if (child.pid && child.exitCode === null) {
            try { process.kill(-child.pid, 'SIGTERM') } catch { /* Child already exited. */ }
        }
    }
    process.exitCode = code
}

/** Start one independently configured Vite/Worker server and wait for readiness. */
function start(app: string, mode: string, prefix: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', '0'], {
            cwd: root + 'apps/' + app, detached: true,
            env: { ...process.env, WEBTOOLS_BASE_PATH: prefix, BROWSER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'],
        })
        children.push(child)
        let output = ''
        const timer = setTimeout(() => reject(new Error(`Timed out starting ${app}: ${output}`)), 60000)
        /** Resolve only after Vite reports the listening origin. */
        const read = (chunk: Buffer) => {
            output = (output + chunk.toString()).slice(-65536)
            const origin = listeningOrigin(output)
            if (origin) { clearTimeout(timer); resolve(origin) }
        }
        child.stdout?.on('data', read)
        child.stderr?.on('data', read)
        child.on('error', error => { clearTimeout(timer); reject(error) })
        child.on('exit', code => {
            clearTimeout(timer)
            reject(new Error(`${app} exited (${code}): ${output}`))
            if (!stopping) { console.error(`${app} exited unexpectedly (${code})`); stop(1) }
        })
    })
}

/** Proxy ordinary requests and HMR upgrades without changing their public URL.
 * The app registry alone determines ownership; the destination Worker owns 404s.
 */
async function main(): Promise<void> {
    const mode = process.argv[2] ?? 'dev'
    if (!['dev', 'preview'].includes(mode)) throw new Error('Expected dev or preview')
    const prefix = hostingPrefix(process.env.WEBTOOLS_BASE_PATH ?? process.env.PORTAL_BASE_PATH)
    const portIndex = process.argv.indexOf('--port')
    const port = portIndex < 0 ? (mode === 'dev' ? 5173 : 4173) : Number(process.argv[portIndex + 1])
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port')
    const origins: Record<Application, string> = {
        portal: await start('portal', mode, prefix),
        rotationCheck: await start('rotation-check', mode, prefix),
        filterReviewPreview: await start('filter-review', mode, prefix),
    }
    server = createServer((incoming, outgoing) => {
        const parsed = requestPath(incoming.url)
        if (!parsed) { outgoing.writeHead(400); outgoing.end('Invalid request path'); return }
        const { path, pathname } = parsed
        const target = origins[applicationForPath(pathname, prefix)]
        const upstream = httpRequest(target + path, { method: incoming.method, headers: { ...incoming.headers, host: new URL(target).host } }, response => {
            const headers = { ...response.headers }
            if (headers.location?.startsWith(target)) headers.location = headers.location.slice(target.length)
            outgoing.writeHead(response.statusCode ?? 502, headers)
            response.pipe(outgoing)
        })
        upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end('App unavailable') })
        incoming.on('aborted', () => upstream.destroy())
        outgoing.on('close', () => upstream.destroy())
        incoming.pipe(upstream)
    })
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
    server.on('upgrade', (incoming, socket, head) => {
        const parsed = requestPath(incoming.url)
        if (!parsed) { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return }
        const { path, pathname } = parsed
        const target = origins[applicationForPath(pathname, prefix)]
        const upstream = httpRequest(target + path, { headers: { ...incoming.headers, host: new URL(target).host } })
        upstream.on('upgrade', (response, peer, first) => {
            socket.write(`HTTP/1.1 ${response.statusCode} Switching Protocols\r\n` + Object.entries(response.headers).map(([name, value]) => `${name}: ${value}\r\n`).join('') + '\r\n')
            socket.write(first); peer.write(head); socket.pipe(peer).pipe(socket)
            socket.on('error', () => peer.destroy()); peer.on('error', () => socket.destroy())
            socket.on('close', () => peer.destroy())
        })
        upstream.on('error', () => socket.destroy())
        upstream.on('response', () => socket.destroy())
        upstream.end()
    })
    server.on('error', error => { console.error(error); stop(1) })
    server.listen(port, '127.0.0.1', () => {
        const address = server?.address()
        if (address && typeof address !== 'string') console.log(`WebTools ${mode}: http://127.0.0.1:${address.port}${prefix}`)
    })
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
void main().catch(error => { console.error(error); stop(1) })
