import type { AssetBinding } from '@webtools/routing'
/** Stream exact wheel parts lazily. A canceled consumer cancels the active read and starts no further fetches. */
export function wheelResponse(request: Request, binding: AssetBinding, parts: readonly string[], base: string): Response {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
    const headers = { 'Content-Type': 'application/octet-stream' }
    if (request.method === 'HEAD') return new Response(null, { headers })
    let index = 0, reader: ReadableStreamDefaultReader<Uint8Array> | undefined, canceled = false
    const stream = new ReadableStream<Uint8Array>({
        /** Read at most one chunk per pull and release each exhausted part reader. */
        async pull(controller) {
            try {
                while (!canceled) {
                    if (!reader) {
                        const part = parts[index++]
                        if (!part) { controller.close(); return }
                        const url = new URL(request.url); url.pathname = base + part
                        const response = await binding.fetch(new Request(url))
                        if (canceled) { await response.body?.cancel(); return }
                        if (!response.ok || !response.body) throw new Error('Python wheel part unavailable')
                        reader = response.body.getReader()
                    }
                    const active = reader, chunk = await active.read()
                    if (canceled) return
                    if (chunk.done) { active.releaseLock(); reader = undefined }
                    else { controller.enqueue(chunk.value); return }
                }
            } catch (error) { if (!canceled) controller.error(error); await reader?.cancel().catch(() => {}); reader?.releaseLock(); reader = undefined }
        },
        /** Cancel the active read and suppress work after a pending asset fetch settles. */
        async cancel() { canceled = true; const active = reader; reader = undefined; if (active) { try { await active.cancel() } finally { active.releaseLock() } } },
    })
    return new Response(stream, { headers })
}
