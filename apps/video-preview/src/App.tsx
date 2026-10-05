import { useCallback, useEffect, useRef, useState } from 'react'
import type { DataflashConstructor, DataflashLog } from '@webtools/dataflash'
import { WidgetRuntime, type Layout, type WidgetHost } from '@webtools/widget-runtime'
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import { parseVideoLayout, parseVideoWidget, serializeVideoLayout } from './format'
import { defaultOffset, formatTime, logInformation, logTime } from './mapping'
import { defaultHtml } from './default-html'
import { Palette } from './Palette'
import { WidgetSettings } from './WidgetSettings'
import { SourceEditor } from './SourceEditor'
import { download } from './download'

const defaultScript = `div.appendChild(document.createTextNode("Widget Example:"))
div.appendChild(document.createElement("br"))
message_report = document.createTextNode("No Log")
div.appendChild(message_report)
div.appendChild(document.createElement("br"))
logTime = document.createTextNode("")
div.appendChild(logTime)
loadLog = function (log) { message_report.nodeValue = "Got log starting at: " + log.extractStartTime() }
setTime = function(time) { logTime.nodeValue = "Log Time: " + time.toFixed(2) }
`

/** Read one local file with explicit cancellation; no bytes leave the browser. */
function read(file: File, kind: 'buffer' | 'text', signal: AbortSignal): Promise<string | ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        /** Detach the signal callback at every terminal outcome. */
        function cleanup(): void { signal.removeEventListener('abort', abort) }
        /** Cancel pending browser IO when a reload or unmount invalidates it. */
        function abort(): void { reader.abort(); cleanup(); reject(new DOMException('Cancelled', 'AbortError')) }
        reader.onload = () => { cleanup(); if (typeof reader.result === 'string' || reader.result instanceof ArrayBuffer) resolve(reader.result); else reject(new Error('Empty file')) }
        reader.onerror = () => { cleanup(); reject(reader.error) }
        reader.onabort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')) }
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) { abort(); return }
        if (kind === 'buffer') reader.readAsArrayBuffer(file); else reader.readAsText(file)
    })
}

/** Load the shared pinned parser from staged assets so its adjacent vendor import remains stable. */
async function parser(): Promise<DataflashConstructor> {
    const entry = new URL(`${import.meta.env.BASE_URL}dataflash/index.js`, location.origin)
    const module: unknown = await import(/* @vite-ignore */ entry.href)
    if (!module || typeof module !== 'object' || !('loadDataflashParser' in module) || typeof module.loadDataflashParser !== 'function') throw new TypeError('Invalid shared parser entry')
    return module.loadDataflashParser() as Promise<DataflashConstructor>
}

/** Own log/video IO, synchronization and React controls while the shared runtime owns overlay resources. */
export function App() {
    const [layout, setLayout] = useState<Layout>()
    const [ready, setReady] = useState(false)
    const [selected, setSelected] = useState<WidgetHost>()
    const [sourceEditing, setSourceEditing] = useState(false)
    const [editing, setEditing] = useState(true)
    const [error, setError] = useState('')
    const [offset, setOffset] = useState('0')
    const [time, setTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [playing, setPlaying] = useState(false)
    const [muted, setMuted] = useState(false)
    const [volume, setVolume] = useState(1)
    const [rate, setRate] = useState(1)
    const [fps, setFps] = useState('30')
    const [videoInfo, setVideoInfo] = useState({ fps: '', codec: '', resolution: '', duration: '' })
    const [logInfo, setLogInfo] = useState({ date: '', flight: '', duration: '' })
    const [mounted, setMounted] = useState(true)
    const video = useRef<HTMLVideoElement>(null)
    const container = useRef<HTMLDivElement>(null)
    const grid = useRef<HTMLDivElement>(null)
    const runtime = useRef<WidgetRuntime | undefined>(undefined)
    const log = useRef<DataflashLog | undefined>(undefined)
    const synchronization = useRef({ time, offset })
    synchronization.current = { time, offset }
    const requests = useRef(new Map<string, AbortController>())
    const media = useRef<Input | undefined>(undefined)
    const mediaUrl = useRef<string | undefined>(undefined)
    const active = useRef(false)
    const fileRevision = useRef(0)
    const [busy, setBusy] = useState(false)
    const [logRevision, setLogRevision] = useState(0)
    /** Report failures without making effects depend on changing React render closures. */
    const failure = useCallback((cause: unknown): void => { if (active.current) setError(String(cause)) }, [])

    /** Replace a named operation, aborting its previous IO before starting another. */
    function begin(name: string): AbortController {
        requests.current.get(name)?.abort()
        const controller = new AbortController()
        requests.current.set(name, controller)
        return controller
    }

    useEffect(() => {
        active.current = true
        const controller = new AbortController()
        const revision = fileRevision.current
        /** Restore the authoritative default independently of log/video file operations. */
        async function restore(): Promise<void> {
            const response = await fetch(`${import.meta.env.BASE_URL}Default_Layout.json`, { signal: controller.signal })
            if (!response.ok) throw new Error(`Default layout unavailable (${response.status})`)
            const value = parseVideoLayout(await response.text())
            if (!controller.signal.aborted && fileRevision.current === revision) setLayout(value)
        }
        void restore().catch(cause => { if (!controller.signal.aborted) failure(cause) })
        return () => {
            active.current = false; controller.abort(); fileRevision.current++
            for (const request of requests.current.values()) request.abort()
            requests.current.clear(); media.current?.dispose(); media.current = undefined
            if (mediaUrl.current) URL.revokeObjectURL(mediaUrl.current)
            mediaUrl.current = undefined; log.current = undefined
        }
    }, [failure])

    useEffect(() => {
        if (!layout || !grid.current || !mounted) return
        let current = true
        setReady(false); setSelected(undefined); setSourceEditing(false)
        const owner = new WidgetRuntime(grid.current, {
            createGrid: (options, element) => window.GridStack.init(options, element), forms: window.Formio,
            sandboxUrl: `${import.meta.env.BASE_URL}Widgets/SandBox.html`, defaultHtml, defaultSandboxScript: defaultScript,
            playback: { getLogData: () => log.current?.buffer, getTime: () => logTime(synchronization.current.time, Number.parseFloat(synchronization.current.offset)) },
            onEdit: widget => { setSelected(widget); setSourceEditing(false) },
            onWidgetDisposed: widget => { setSelected(value => value === widget ? undefined : value) },
            onError: cause => { if (current) failure(cause) },
        }, { ...layout, grid: { ...layout.grid, color: '' } })
        runtime.current = owner
        void owner.ready.then(() => { if (current) { owner.setEditing(true); setEditing(true); setReady(true) } }).catch(cause => { if (current) failure(cause) })
        return () => { current = false; runtime.current = undefined; owner.destroy() }
    }, [layout, mounted, failure])

    useEffect(() => {
        let current = true
        let pending = false
        let next: number | undefined
        /** Coalesce scrubs while awaiting the current frame so old replies cannot complete newer work. */
        async function render(value: number): Promise<void> {
            next = value
            if (pending) return
            pending = true
            try {
                while (current && next !== undefined) {
                    const value = next; next = undefined
                    await Promise.all((runtime.current?.getWidgets() ?? []).map(widget => widget.setTime(value)))
                }
            } catch (cause) { if (current) failure(cause) }
            finally { pending = false }
        }
        void render(logTime(time, Number.parseFloat(offset)))
        return () => { current = false }
    }, [time, offset, ready, logRevision, failure])

    useEffect(() => {
        /** Match the original constrained video aspect ratio and integer-pixel overlay dimensions. */
        function size(): void {
            if (!container.current) return
            const style = getComputedStyle(document.body)
            const width = Math.min(1200, document.documentElement.clientWidth - Number.parseFloat(style.marginLeft) - Number.parseFloat(style.marginRight))
            const height = Math.min(1200, document.documentElement.clientHeight * .8)
            const ratio = video.current && video.current.videoHeight ? video.current.videoWidth / video.current.videoHeight : 16 / 9
            container.current.style.width = `${Math.floor(ratio > width / height ? width : height * ratio)}px`
            container.current.style.height = `${Math.floor(ratio > width / height ? width / ratio : height)}px`
        }
        size(); window.addEventListener('resize', size); video.current?.addEventListener('loadedmetadata', size)
        const element = video.current
        return () => { window.removeEventListener('resize', size); element?.removeEventListener('loadedmetadata', size) }
    }, [mounted])

    useEffect(() => {
        const element = video.current
        if (!element) return
        element.muted = muted; element.volume = volume; element.playbackRate = rate
    }, [mounted, muted, volume, rate])

    useEffect(() => {
        const element = video.current
        return () => { element?.pause(); element?.removeAttribute('src'); element?.load() }
    }, [mounted])

    useEffect(() => {
        /** Retain the legacy unsaved-layout prompt using the shared recursive dirty state. */
        function unload(event: BeforeUnloadEvent): void {
            if (runtime.current?.getChanged()) { event.preventDefault(); event.returnValue = '' }
        }
        window.addEventListener('beforeunload', unload)
        return () => window.removeEventListener('beforeunload', unload)
    }, [])

    /** Cancel or replace a log read, retaining the old log until the new parser succeeds. */
    async function loadLog(file: File): Promise<void> {
        const request = begin('log'); setBusy(true)
        try {
            const bytes = await read(file, 'buffer', request.signal)
            const Constructor = await parser()
            if (request.signal.aborted || !active.current || !(bytes instanceof ArrayBuffer)) return
            const parsed = new Constructor(); parsed.processData(bytes, [])
            const information = logInformation(parsed), newOffset = defaultOffset(parsed)
            if (request.signal.aborted || !active.current) return
            log.current = parsed; setLogInfo(information); setOffset(String(newOffset)); setLogRevision(value => value + 1)
            for (const widget of runtime.current?.getWidgets() ?? []) widget.loadLog()
        } catch (cause) { if (!request.signal.aborted) failure(cause) }
        finally { if (!request.signal.aborted && active.current) setBusy(false) }
    }

    /** Replace media immediately, disposing metadata parsing and revoking the outgoing object URL. */
    async function loadVideo(file: File): Promise<void> {
        const request = begin('video')
        media.current?.dispose()
        const element = video.current
        if (!element) return
        element.pause(); element.removeAttribute('src'); element.load()
        if (mediaUrl.current) URL.revokeObjectURL(mediaUrl.current)
        mediaUrl.current = URL.createObjectURL(file); element.src = mediaUrl.current; element.load()
        const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS }); media.current = input
        try {
            const track = await input.getPrimaryVideoTrack(), audio = await input.getPrimaryAudioTrack()
            if (!track) throw new Error('No video track')
            const stats = await track.computePacketStats(), end = await input.computeDuration()
            if (request.signal.aborted || !active.current) return
            const frameRate = stats.averagePacketRate.toFixed(2)
            setVideoInfo({ fps: frameRate, codec: `${track.codec} + ${audio?.codec}`, resolution: `${track.displayWidth}x${track.displayHeight}px`, duration: formatTime(end) })
            const choices = [24, 25, 30, 48, 50, 60, 90, 100, 120, 240]
            setFps(String(choices.reduce((best, value) => Math.abs(value - Number(frameRate)) < Math.abs(best - Number(frameRate)) ? value : best)))
        } catch (cause) { if (!request.signal.aborted) failure(cause) }
        finally { input.dispose(); if (media.current === input) media.current = undefined }
    }

    /** Restore a full layout or append a standalone widget without mutating its source or tags. */
    async function loadLayout(file: File): Promise<void> {
        const request = begin('layout'); fileRevision.current++
        try {
            const text = await read(file, 'text', request.signal)
            if (request.signal.aborted || typeof text !== 'string' || !active.current) return
            const value: unknown = JSON.parse(text)
            if (value && typeof value === 'object' && 'widgets' in value) setLayout(parseVideoLayout(text))
            else await runtime.current?.add(parseVideoWidget(text))?.ready
        } catch (cause) { if (!request.signal.aborted) failure(cause) }
    }

    /** Seek through the media element; timeupdate keeps the React timeline and overlays aligned. */
    function seek(value: number): void { if (video.current) { video.current.currentTime = value; setTime(video.current.currentTime) } }
    /** Save exact legacy JSON and reset shared widget dirty tracking. */
    function save(): void { if (runtime.current) { download(serializeVideoLayout(runtime.current.snapshot()), 'VideoOverlay.json'); runtime.current.saved() } }
    /** Snapshot before changing grid dimensions, preserving every nested/custom widget. */
    function dimensions(key: 'rows' | 'columns', value: string): void {
        if (!runtime.current || !Number.isInteger(Number(value)) || Number(value) < 1) return
        const next = runtime.current.snapshot(); next.grid[key] = value; setLayout(next)
    }
    /** Release outgoing media and overlay resources before rebuilding the preview. */
    function mount(value: boolean): void {
        if (!value) {
            if (runtime.current) setLayout(runtime.current.snapshot())
            for (const request of requests.current.values()) request.abort()
            media.current?.dispose(); media.current = undefined
            video.current?.pause(); video.current?.removeAttribute('src'); video.current?.load()
            if (mediaUrl.current) URL.revokeObjectURL(mediaUrl.current)
            mediaUrl.current = undefined; setDuration(0); setTime(0); setBusy(false)
        }
        setMounted(value)
    }

    return <main><h1>Video Overlay Preview</h1><section className="files" aria-label="Files">
        <label>Video<input aria-label="Video file" type="file" accept="video/*" disabled={!mounted} onChange={event => { const file = event.target.files?.[0]; if (file) void loadVideo(file); event.target.value = '' }} /></label>
        <label>Log<input aria-label="Log file" type="file" accept=".bin" disabled={!mounted} onChange={event => { const file = event.target.files?.[0]; if (file) void loadLog(file); event.target.value = '' }} /></label>
        <label>Overlay<input aria-label="Overlay file" type="file" accept=".json" disabled={!mounted} onChange={event => { const file = event.target.files?.[0]; if (file) void loadLayout(file); event.target.value = '' }} /></label>
        <button onClick={() => { for (const request of requests.current.values()) request.abort(); media.current?.dispose(); setBusy(false) }}>Cancel loading</button>{busy && <span role="status">Loading log…</span>}
        <button onClick={() => mount(!mounted)}>{mounted ? 'Unmount preview' : 'Mount preview'}</button>
    </section><section aria-label="File information"><p>Video: {videoInfo.fps} FPS · {videoInfo.codec} · {videoInfo.resolution} · {videoInfo.duration}</p><p>Log: {logInfo.date} · Flight time: {logInfo.flight} · Duration: {logInfo.duration}</p></section>
        {error && <p role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></p>}
        {mounted && <><div className="video-container" ref={container}><video ref={video} onLoadedMetadata={event => setDuration(event.currentTarget.duration)} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} /><div id="dashboard" className="grid-stack" ref={grid} data-ready={ready} /></div>
        <section className="timeline" aria-label="Playback"><button onClick={() => { if (video.current?.paused) void video.current.play().catch(failure); else video.current?.pause() }}>{playing ? '||' : '▶'}</button>
            <button onClick={() => seek(time - 5)}>−5s</button><button onClick={() => seek(time - 1 / Number(fps))}>Previous frame</button><button onClick={() => seek(time + 1 / Number(fps))}>Next frame</button><button onClick={() => seek(time + 5)}>+5s</button>
            <input aria-label="Seek" type="range" min="0" max="1" step="0.001" value={duration ? time / duration : 0} disabled={!duration} onChange={event => seek(Number(event.target.value) * duration)} /><output>{formatTime(time)} / {formatTime(duration || 1)}</output>
            <button onClick={() => { if (video.current) { video.current.muted = !muted; setMuted(!muted) } }}>{muted ? '🔇' : '🔊'}</button><input aria-label="Volume" type="range" min="0" max="1" step=".01" value={volume} onChange={event => { const value = Number(event.target.value); setVolume(value); if (video.current) video.current.volume = value }} />
            <label>Speed<select value={rate} onChange={event => { const value = Number(event.target.value); setRate(value); if (video.current) video.current.playbackRate = value }}>{[.25, .5, 1, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
            <label>Frame rate<select value={fps} onChange={event => setFps(event.target.value)}>{[24, 25, 30, 48, 50, 60, 90, 100, 120, 240].map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Log offset (s)<input aria-label="Log offset" type="number" step="any" value={offset} onChange={event => setOffset(event.target.value)} /></label>
        </section><section aria-label="Layout controls"><label><input type="checkbox" checked={editing} onChange={event => { setEditing(event.target.checked); runtime.current?.setEditing(event.target.checked) }} />Edit overlay</label>
            <label>Rows<input type="number" min="1" value={layout?.grid.rows ?? 12} onChange={event => dimensions('rows', event.target.value)} /></label><label>Columns<input type="number" min="1" value={layout?.grid.columns ?? 12} onChange={event => dimensions('columns', event.target.value)} /></label><button disabled={!ready} onClick={save}>Save layout</button></section>
            {ready && runtime.current && editing && <Palette runtime={runtime.current} failure={failure} />}
            {selected && <WidgetSettings widget={selected} close={() => setSelected(undefined)} edit={() => setSourceEditing(true)} failure={failure} />}
            {selected && sourceEditing && <SourceEditor widget={selected} close={() => setSourceEditing(false)} failure={failure} />}
        </>}
    </main>
}
