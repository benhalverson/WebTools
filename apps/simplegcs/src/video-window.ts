import type { ReaderOptions } from './video-settings.ts'
/** Open the sibling video.html page and transfer credentials only to that same-origin window. */
export function openVideoWindow(options: ReaderOptions, complete: (cleanup: () => void) => void = () => {}): (() => void) | null {
    const popup = window.open(new URL('video.html', document.baseURI), '_blank')
    if (!popup) return null
    /** Release handshake listeners on completion, popup closure, timeout or owner disposal. */
    function cleanup(): void { window.removeEventListener('message', ready); window.removeEventListener('pagehide', cleanup); clearTimeout(timer); clearInterval(poll); complete(cleanup) }
    /** Ignore forged ready messages from other windows or origins. */
    function ready(event: MessageEvent): void {
        if (event.source !== popup || event.origin !== location.origin || event.data !== 'simplegcs-video-ready') return
        popup?.postMessage({ type: 'simplegcs-video-config', options }, location.origin); cleanup()
    }
    const timer = setTimeout(cleanup, 30000), poll = setInterval(() => { if (popup.closed) cleanup() }, 250)
    window.addEventListener('message', ready); window.addEventListener('pagehide', cleanup)
    return cleanup
}
/** Validate a message payload before handing it to the vendor reader. */
export function isReaderOptions(value: unknown): value is ReaderOptions {
    return typeof value === 'object' && value !== null && 'url' in value && typeof value.url === 'string' && 'user' in value && typeof value.user === 'string' && 'pass' in value && typeof value.pass === 'string'
}
