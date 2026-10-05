import { useEffect, useState } from 'react'
import { loadCodecs, type CodecChoice, type ExportSettings } from './export'

export interface MediaSettings { revision: number; format: string; video: string; audio: string; width: number; height: number; duration: number }

/** Own format/codec selection and trim controls, preserving available-container order and input matching. */
export function ExportControls({ media, fps, disabled, start, failure }: {
    media: MediaSettings | undefined; fps: number; disabled: boolean
    start(settings: ExportSettings): void; failure(error: unknown): void
}) {
    const [choices, setChoices] = useState<CodecChoice[]>([])
    const [format, setFormat] = useState('')
    const [video, setVideo] = useState('')
    const [audio, setAudio] = useState('')
    const [from, setFrom] = useState('0'), [to, setTo] = useState('0')
    useEffect(() => {
        let active = true
        void loadCodecs().then(value => { if (active) setChoices(value) }).catch(error => { if (active) failure(error) })
        return () => { active = false }
    }, [failure])
    useEffect(() => {
        const selected = choices.find(choice => choice.name.toLowerCase() === media?.format.toLowerCase()) ?? choices[0]
        if (!selected) return
        setFormat(selected.name)
        setVideo(selected.video.find(codec => codec === media?.video) ?? selected.video[0] ?? '')
        setAudio(selected.audio.find(codec => codec === media?.audio) ?? selected.audio[0] ?? '')
        setFrom('0'); setTo(String(media?.duration ?? 0))
    }, [choices, media])
    const selected = choices.find(choice => choice.name === format)
    /** Reset codec lists when the user changes container, as the legacy selection handler does. */
    function choose(value: string): void {
        const choice = choices.find(choice => choice.name === value)
        if (!choice) return
        setFormat(value); setVideo(choice.video[0] ?? ''); setAudio(choice.audio[0] ?? '')
    }
    /** Submit codecs only after narrowing them against the probed library capabilities. */
    function submit(): void {
        const videoCodec = selected?.video.find(codec => codec === video), audioCodec = selected?.audio.find(codec => codec === audio)
        if (!selected || !videoCodec || !audioCodec || !media) return
        start({ format: selected.name, video: videoCodec, audio: audioCodec, fps, width: media.width, height: media.height, start: Number(from), end: Number(to) })
    }
    return <section aria-label="Export settings">
        <label>Output format<select aria-label="Output format" value={format} onChange={event => choose(event.target.value)}>{choices.map(choice => <option key={choice.name}>{choice.name}</option>)}</select></label>
        <label>Video codec<select aria-label="Video codec" value={video} disabled={selected?.video.length === 1} onChange={event => setVideo(event.target.value)}>{selected?.video.map(codec => <option key={codec}>{codec}</option>)}</select></label>
        <label>Audio codec<select aria-label="Audio codec" value={audio} disabled={selected?.audio.length === 1} onChange={event => setAudio(event.target.value)}>{selected?.audio.map(codec => <option key={codec}>{codec}</option>)}</select></label>
        <label>Width (px)<input aria-label="Export width" type="number" value={media?.width ?? 0} disabled /></label>
        <label>Height (px)<input aria-label="Export height" type="number" value={media?.height ?? 0} disabled /></label>
        <label>Start time (s)<input aria-label="Start time" type="number" step=".01" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label>End time (s)<input aria-label="End time" type="number" step=".01" value={to} onChange={event => setTo(event.target.value)} /></label>
        <button disabled={disabled || !media || !selected} onClick={submit}>Export</button>
    </section>
}
