export interface VideoSettings { host: string; path: string; user: string; pass: string; scheme: string; hlsPort: number; wrtcPort: number }
export interface ReaderOptions { url: string; user: string; pass: string }
/** Restore the legacy viewer keys, defaults and page protocol without persisting drafts. */
export function readVideoSettings(storage: Storage, location: Pick<Location, 'hostname' | 'protocol'>): VideoSettings {
    return { host: storage.getItem('video.host') || location.hostname || '127.0.0.1', path: storage.getItem('video.path') || 'stream', user: storage.getItem('video.user') || '', pass: storage.getItem('video.pass') || '', scheme: location.protocol === 'https:' ? 'https' : 'http', hlsPort: 8888, wrtcPort: 8889 }
}
/** Commit all four viewer fields together only after the complete editor is accepted. */
export function saveVideoSettings(storage: Storage, settings: VideoSettings): void {
    for (const key of ['host', 'path', 'user', 'pass'] as const) storage.setItem(`video.${key}`, settings[key])
}
/** Build the legacy credential-free endpoint bytes; credentials travel in reader options. */
export function readerOptions(settings: VideoSettings): ReaderOptions {
    return { url: `${settings.scheme}://${settings.host}:${settings.wrtcPort}/${settings.path}/whep`, user: settings.user, pass: settings.pass }
}
/** Build the legacy HLS URL without changing stream path escaping or port semantics. */
export function hlsUrl(settings: VideoSettings): string { return `${settings.scheme}://${settings.host}:${settings.hlsPort}/${settings.path}/index.m3u8` }
/** Translate reader errors to the existing user-facing status without exposing credentials. */
export function videoError(error: unknown): string {
    const detail = String(error)
    let message = /401|403|unauthorized/i.test(detail) ? 'Authentication failed. Check video settings.' : /404|stream not found/i.test(detail) ? 'Stream not found. Check video settings.' : 'Unable to play video. Check the connection and video settings.'
    if (/retrying/i.test(detail)) message += ' Retrying…'
    return `WebRTC · ${message}`
}
