export interface ConnectionSettings {
    ws: string
    heartbeat: boolean
    sysid: string
    compid: string
    signing: string
}

/** Restore the legacy hash settings; credentials are deliberately not persisted in browser storage. */
export function readSettings(hash: string, sanitizeNumber: (value: string) => string = value => value): ConnectionSettings {
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    return {
        ws: params.get('ws') || '', heartbeat: Boolean(params.get('heartbeat')),
        sysid: sanitizeNumber(params.get('sysid') || '254'), compid: sanitizeNumber(params.get('compid') || '190'),
        signing: params.get('signing') || '',
    }
}

/** Encode the original raw-deflate, unpadded URL-safe base64 layout format. */
export async function compressLayout(json: string): Promise<string> {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/** Decode saved dashboard links without changing JSON bytes or numeric representations. */
export async function decompressLayout(encoded: string): Promise<string> {
    const pad = encoded.length % 4
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + (pad ? '='.repeat(4 - pad) : ''))
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()
}

/** Preserve the legacy link parameter order and heartbeat-dependent credential serialization. */
export async function dashboardLink(href: string, settings: ConnectionSettings, layout: string): Promise<string> {
    const url = new URL(href.split('?')[0]!.split('#')[0]!)
    const params = new URLSearchParams()
    if (settings.ws) params.set('ws', settings.ws)
    if (settings.heartbeat) {
        params.set('heartbeat', '1')
        params.set('sysid', settings.sysid)
        params.set('compid', settings.compid)
        if (settings.signing) params.set('signing', settings.signing)
    }
    params.set('layout', await compressLayout(layout))
    url.hash = params.toString()
    return url.toString()
}
