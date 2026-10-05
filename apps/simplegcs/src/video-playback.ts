import { hlsUrl, videoError, type ReaderOptions, type VideoSettings } from './video-settings.ts'
export interface Reader { close(): void }
export interface ReaderConfig extends ReaderOptions { onError(error: unknown): void; onTrack(event: RTCTrackEvent): void }
export interface HlsInstance { on(event: string, callback: (event: string, data?: { fatal?: boolean }) => void): void; destroy(): void; loadSource(url: string): void; attachMedia(video: HTMLVideoElement): void }
export interface HlsConstructor { new(options: Record<string, unknown>): HlsInstance; isSupported(): boolean; Events: { ERROR: string; MANIFEST_PARSED: string } }
export interface VideoVendors { reader(config: ReaderConfig): Reader; hls?: HlsConstructor | undefined }
declare global { interface Window { Hls?: HlsConstructor; SIMPLEGCS_VIDEO?: VideoVendors } const MediaMTXWebRTCReader: new(config: ReaderConfig) => Reader }
export type Protocol = 'WebRTC' | 'HLS'
export interface PlaybackStatus { text: string; color: string }
/** Construct the pinned reader only when a user opens video; tests can inject controlled peers. */
export function videoVendors(): VideoVendors { return window.SIMPLEGCS_VIDEO ?? { reader: config => new MediaMTXWebRTCReader(config), hls: window.Hls } }
/** Own a single playback lifetime and suppress late callbacks after hide, replacement or page closure. */
export function startPlayback(video: HTMLVideoElement, options: ReaderOptions, vendors: VideoVendors, status: (value: PlaybackStatus) => void, hls?: { settings: VideoSettings; fallback(): void }): () => void {
    let closed = false, reader: Reader | undefined, instance: HlsInstance | undefined, timer: ReturnType<typeof setTimeout> | undefined, retries = 0
    /** Publish status only while this exact playback generation is mounted. */
    function report(text: string, color: string): void { if (!closed) status({ text, color }) }
    /** Ask for autoplay while retaining the manual-play status when browsers reject it. */
    function play(): void { void video.play().catch(() => { if (!hls) report('WebRTC · Press play to watch', '#b36b00') }) }
    /** Reflect media events only after a reader has attached its stream. */
    function playing(): void { if (video.srcObject) report('WebRTC · Live', '#4caf50') }
    /** Reflect buffering without replacing connection/authentication errors. */
    function waiting(): void { if (video.srcObject) report('WebRTC · Buffering', '#b36b00') }
    /** Dispose retry, vendor and media resources once; all delayed callbacks become inert first. */
    function close(): void {
        if (closed) return
        closed = true; clearTimeout(timer)
        try { reader?.close() } catch { /* Finish owned cleanup even if a vendor fails. */ }
        try { instance?.destroy() } catch { /* Legacy HLS disposal is best effort. */ }
        video.removeEventListener('playing', playing); video.removeEventListener('waiting', waiting)
        video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load()
        window.removeEventListener('pagehide', close)
    }
    /** Start/retry HLS with the legacy conservative buffer settings and header authentication. */
    function startHls(): void {
        if (closed || !hls) return
        const url = hlsUrl(hls.settings), auth = hls.settings.user ? 'Basic ' + btoa(`${hls.settings.user}:${hls.settings.pass}`) : null, Hls = vendors.hls
        if (location.protocol === 'https:' && url.startsWith('http://')) { hls.fallback(); return }
        if (!auth && video.canPlayType('application/vnd.apple.mpegurl')) { video.src = url; play(); return }
        if (!Hls?.isSupported()) { hls.fallback(); return }
        try { instance?.destroy() } catch { /* Replacing a broken HLS instance must still proceed. */ }
        const current = new Hls({ autoStartLoad: true, startPosition: -1, lowLatencyMode: false, backBufferLength: 30, liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 10, maxLiveSyncPlaybackRate: 1.0, maxBufferLength: 30, maxBufferSize: 100 * 1000 * 1000, maxBufferHole: 2, enableWorker: true, fragLoadingTimeOut: 20000, manifestLoadingTimeOut: 10000, levelLoadingTimeOut: 10000,
            xhrSetup: (xhr: XMLHttpRequest) => { if (auth) xhr.setRequestHeader('Authorization', auth) } })
        instance = current
        current.on(Hls.Events.ERROR, (_event, data) => {
            if (closed || instance !== current || !data?.fatal) return
            retries++
            if (retries >= 3) hls.fallback()
            else { clearTimeout(timer); timer = setTimeout(startHls, 2000) }
        })
        current.on(Hls.Events.MANIFEST_PARSED, () => { if (closed || instance !== current) return; play(); retries = 0 })
        current.loadSource(url); current.attachMedia(video)
    }
    window.addEventListener('pagehide', close)
    video.addEventListener('playing', playing); video.addEventListener('waiting', waiting)
    if (hls) { report('HLS', '#ff9800'); startHls() }
    else {
        report('WebRTC · Connecting', '#b36b00')
        try { reader = vendors.reader({ ...options, onError: error => { if (closed) return; video.srcObject = null; report(videoError(error), '#b3261e') }, onTrack: event => { if (closed) return; video.srcObject = event.streams[0] ?? null; play() } }) }
        catch (error) { report(videoError(error), '#b3261e') }
    }
    return close
}
