import { useEffect, useRef, useState } from 'react'
import { startPlayback, videoVendors, type PlaybackStatus, type Protocol } from './video-playback.ts'
import type { ReaderOptions, VideoSettings } from './video-settings.ts'
/** Mount one vendor playback generation; React owns the video element and status UI. */
export function VideoPlayer({ options, settings, protocol = 'WebRTC', fallback }: { options: ReaderOptions; settings?: VideoSettings; protocol?: Protocol; fallback?: () => void }) {
    const video = useRef<HTMLVideoElement>(null), [status, setStatus] = useState<PlaybackStatus>({ text: 'WebRTC · Connecting', color: '#b36b00' })
    useEffect(() => {
        if (!video.current) return
        return startPlayback(video.current, options, videoVendors(), setStatus, protocol === 'HLS' && settings && fallback ? { settings, fallback } : undefined)
    }, [options, settings, protocol, fallback])
    return <><video ref={video} autoPlay muted controls playsInline /><div className="video-status" role="status" style={{ background: status.color }}>{status.text}</div></>
}
