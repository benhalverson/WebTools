import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { DomEvent } from 'leaflet'
import { VideoPlayer } from './VideoPlayer.tsx'
import { readVideoSettings, readerOptions, saveVideoSettings } from './video-settings.ts'
import { openVideoWindow } from './video-window.ts'
import type { Protocol } from './video-playback.ts'
interface Gesture { id: number; x: number; y: number; left: number; top: number; width: number; height: number; resize: boolean }
/** Compute the original mobile size using the map's available width. */
function initialGeometry(): CSSProperties {
    const mobile = matchMedia('(max-width: 600px)').matches || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    const width = mobile ? Math.min((document.getElementById('map')?.clientWidth || innerWidth) - 24, 380) : 420
    return { width, height: mobile ? Math.round(width * 9 / 16) : 240, right: 12, bottom: 12 }
}
/** Own inset visibility, transactional settings, gestures and outstanding popup handshakes. */
export function VideoControls({ storage }: { storage: Storage }) {
    const [settings, setSettings] = useState(() => readVideoSettings(storage, location)), [visible, setVisible] = useState(false), [exists, setExists] = useState(false), [protocol, setProtocol] = useState<Protocol>('WebRTC'), [geometry, setGeometry] = useState<CSSProperties>(initialGeometry)
    const panel = useRef<HTMLDivElement>(null), gesture = useRef<Gesture | null>(null), handshakes = useRef(new Set<() => void>())
    const options = useMemo(() => readerOptions(settings), [settings]), fallback = useCallback(() => setProtocol('WebRTC'), [])
    useEffect(() => {
        if (!exists) return
        /** Re-anchor on mobile rotation while leaving desktop user sizing intact. */
        function resize(): void { const next = initialGeometry(); if (next.width !== 420) setGeometry(next) }
        window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize)
        return () => { window.removeEventListener('resize', resize); window.removeEventListener('orientationchange', resize) }
    }, [exists])
    useEffect(() => {
        const pending = handshakes.current
        return () => { for (const cleanup of pending) cleanup(); pending.clear() }
    }, [])
    useEffect(() => {
        const element = panel.current
        if (!element || !exists) return
        // Leaflet's click guard preserves React delegated handlers, while native
        // wheel/down isolation executes before the map's own listeners.
        DomEvent.disableClickPropagation(element); DomEvent.disableScrollPropagation(element)
        return () => { DomEvent.off(element) }
    }, [exists])
    /** Hide releases playback but retains the panel's current protocol and geometry. */
    function toggle(): void { if (!exists) { setGeometry(initialGeometry()); setProtocol('WebRTC'); setExists(true) }; setVisible(value => !value) }
    /** Close releases panel and pending credential handshakes without closing independent players. */
    function close(): void { setVisible(false); setExists(false); gesture.current = null; for (const cleanup of handshakes.current) cleanup(); handshakes.current.clear() }
    /** Open the independent same-origin player without putting credentials in its URL. */
    function popout(): void { const cleanup = openVideoWindow(options, finished => handshakes.current.delete(finished)); if (cleanup) handshakes.current.add(cleanup) }
    /** Preserve the four cancellable legacy prompts, committing only a complete nonempty host/path. */
    function configure(): void {
        const host = prompt('MediaMTX host', settings.host); if (host === null) return
        const path = prompt('Path', settings.path); if (path === null) return
        const user = prompt('Viewer username', settings.user); if (user === null) return
        const pass = prompt('Viewer password', settings.pass); if (pass === null || !host.trim() || !path.trim()) return
        const next = { ...settings, host, path, user, pass }; saveVideoSettings(storage, next); setSettings(next)
    }
    /** Capture a single mouse/touch pointer while ignoring button presses in the drag handle. */
    function begin(event: PointerEvent<HTMLDivElement>, resize: boolean): void {
        const element = panel.current
        if (!element || event.button !== 0 || (event.target as HTMLElement).closest('button')) return
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: element.offsetLeft, top: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight, resize }
        event.currentTarget.setPointerCapture(event.pointerId); if (event.pointerType !== 'touch') event.preventDefault()
    }
    /** Clamp dragging and resizing exactly like the legacy panel. */
    function move(event: PointerEvent<HTMLDivElement>): void {
        const start = gesture.current, parent = panel.current?.parentElement
        if (!start || start.id !== event.pointerId || !parent) return
        const dx = event.clientX - start.x, dy = event.clientY - start.y
        setGeometry(previous => start.resize ? { ...previous, width: Math.max(280, start.width + dx), height: Math.max(160, start.height + dy) } : { ...previous, left: Math.max(0, Math.min(parent.clientWidth - 80, start.left + dx)), top: Math.max(0, Math.min(parent.clientHeight - 36, start.top + dy)), right: 'auto', bottom: 'auto' })
    }
    /** End capture on release, cancellation and browser-driven loss of capture. */
    function end(event: PointerEvent<HTMLDivElement>): void { if (gesture.current?.id !== event.pointerId) return; gesture.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }
    const target = document.getElementById('map')
    return <><button id="video-inset" onClick={toggle}>Video (Inset)</button><button id="video-new-window" onClick={popout}>Video (New Window)</button>{exists && target && createPortal(<div ref={panel} id="video-panel" style={{ ...geometry, display: visible ? 'flex' : 'none' }} onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()}>
        <div className="video-bar" onPointerDown={event => begin(event, false)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}><strong>Video</strong><button style={{ background: protocol === 'HLS' ? '#ffb74d' : '#81c784' }} onClick={() => setProtocol(value => value === 'WebRTC' ? 'HLS' : 'WebRTC')}>Switch to {protocol === 'WebRTC' ? 'HLS' : 'WebRTC'}</button><button onClick={popout}>New window</button><button onClick={configure}>Settings</button><button aria-label="Close video" onClick={close}>×</button></div>
        <div className="video-body">{visible && <VideoPlayer options={options} settings={settings} protocol={protocol} fallback={fallback} />}<div className="video-grip" onPointerDown={event => begin(event, true)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} /></div>
    </div>, target)}</>
}
