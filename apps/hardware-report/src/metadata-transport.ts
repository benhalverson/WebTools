import type { MetadataFetch } from './model/log-metadata.ts'

interface OctokitOptions {
    headers: Record<string, string>
    request: { signal: AbortSignal | null | undefined }
}
type OctokitRequest = (route: string, options: OctokitOptions) => Promise<unknown>
let transport: Promise<MetadataFetch | null> | undefined

/** Narrow the external module response and error envelopes at one vendor boundary. */
function record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

/** Adapt the existing Octokit request contract to the report's injectable HTTP
 * interface. HTTP failures retain their status/reset headers; network and abort
 * failures propagate. The adapter keeps one identity for session metadata caches. */
export function octokitTransport(request: OctokitRequest): MetadataFetch {
    return async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        const headers = Object.fromEntries(new Headers(init?.headers))
        try {
            const result = record(await request(`GET ${url}`, { headers, request: { signal: init?.signal } }))
            return new Response(JSON.stringify(result.data), { status: typeof result.status === 'number' ? result.status : 200 })
        } catch (cause) {
            const error = record(cause)
            if (typeof error.status !== 'number') throw cause
            const response = record(error.response)
            const responseHeaders = Object.fromEntries(Object.entries(record(response.headers)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
            return new Response(null, { status: error.status, headers: responseHeaders })
        }
    }
}

/** Load the same optional CDN module as the legacy tool. A failed import stays
 * offline for this document lifetime and causes no GitHub metadata requests. */
export function metadataTransport(): Promise<MetadataFetch | null> {
    transport ??= (async () => {
        try {
            const url = 'https://esm.sh/@octokit/request'
            const module: unknown = await import(/* @vite-ignore */ url)
            const request = record(module).request
            return typeof request === 'function' ? octokitTransport(request as OctokitRequest) : null
        } catch { return null }
    })()
    return transport
}
