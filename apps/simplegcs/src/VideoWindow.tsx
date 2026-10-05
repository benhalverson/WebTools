import { useEffect, useState } from 'react'
import { VideoPlayer } from './VideoPlayer.tsx'
import { isReaderOptions } from './video-window.ts'
import type { ReaderOptions } from './video-settings.ts'
/** Receive same-origin opener configuration and own the independent popup's playback lifetime. */
export function VideoWindow() {
    const [options, setOptions] = useState<ReaderOptions | null>(null), [message, setMessage] = useState('WebRTC · Connecting')
    useEffect(() => {
        const parent = window.opener as Window | null
        if (!parent) { setMessage('Open video from the GCS video panel.'); return }
        /** Remove the credential handshake listener and deadline together. */
        function cleanup(): void { clearTimeout(timer); window.removeEventListener('message', receive); window.removeEventListener('pagehide', cleanup) }
        /** Accept configuration only from the exact window that opened this page. */
        function receive(event: MessageEvent): void {
            const data: unknown = event.data
            if (event.source !== parent || event.origin !== location.origin || typeof data !== 'object' || data === null || !('type' in data) || data.type !== 'simplegcs-video-config' || !('options' in data) || !isReaderOptions(data.options)) return
            cleanup(); window.opener = null; setOptions(data.options)
        }
        const timer = setTimeout(() => { cleanup(); window.opener = null; setMessage('Unable to connect to the GCS video panel. Close this window and try again.') }, 30000)
        window.addEventListener('message', receive); window.addEventListener('pagehide', cleanup)
        parent.postMessage('simplegcs-video-ready', location.origin)
        return cleanup
    }, [])
    return <main className="video-window">{options ? <VideoPlayer options={options} /> : <div role="status">{message}</div>}</main>
}
