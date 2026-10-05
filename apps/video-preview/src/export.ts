import html2canvas from 'html2canvas'
import {
    ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output, QUALITY_VERY_HIGH,
    Mp4OutputFormat, WebMOutputFormat, MkvOutputFormat, MovOutputFormat,
    getEncodableVideoCodecs, getEncodableAudioCodecs,
    type VideoCodec, type AudioCodec,
} from 'mediabunny'
import type { WidgetRuntime } from '@webtools/widget-runtime'

const formats = { mp4: Mp4OutputFormat, webm: WebMOutputFormat, mkv: MkvOutputFormat, mov: MovOutputFormat }
export type FormatName = keyof typeof formats
export interface CodecChoice { name: FormatName; video: VideoCodec[]; audio: AudioCodec[] }
export interface ExportSettings {
    format: FormatName; video: VideoCodec; audio: AudioCodec
    width: number; height: number; fps: number; start: number; end: number
}

/** Retain the original container order and require both encodable video and audio choices. */
export async function loadCodecs(): Promise<CodecChoice[]> {
    const choices: CodecChoice[] = []
    for (const name of Object.keys(formats) as FormatName[]) {
        const format = new formats[name]()
        const video = await getEncodableVideoCodecs(format.getSupportedVideoCodecs()), audio = await getEncodableAudioCodecs(format.getSupportedAudioCodecs())
        if (video.length && audio.length) choices.push({ name, video, audio })
    }
    if (!choices.length) throw new Error('Video export not supported by browser')
    return choices
}

/** Fail before allocating encoders for a nonfinite, empty or reversed range. */
export function validateSettings(settings: ExportSettings, duration: number): void {
    const { width, height, fps, start, end } = settings
    if (![width, height, fps, start, end, duration].every(Number.isFinite)
        || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
        || fps <= 0 || start < 0 || end <= start || end > duration) throw new Error('Invalid export dimensions or time range')
}

/** Cancel owned capture waits immediately, observing late vendor failures and releasing late canvas results. */
function captureSnapshot(capture: Promise<HTMLCanvasElement>, signal: AbortSignal): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
        /** Detach this operation's cancellation callback on every terminal path. */
        const cleanup = (): void => { signal.removeEventListener('abort', abort) }
        /** Release the export wait so its compositor can remove the owned clone document. */
        const abort = (): void => { cleanup(); reject(signal.reason) }
        capture.then(canvas => {
            cleanup()
            if (signal.aborted) { canvas.width = 0; canvas.height = 0; reject(signal.reason) }
            else resolve(canvas)
        }, cause => { cleanup(); reject(cause) })
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
    })
}

/** Composite the same legacy layers and html2canvas options without rendering grid resize handles. */
export async function renderOverlay(context: OffscreenCanvasRenderingContext2D, owner: WidgetRuntime, parent: DOMRect, signal: AbortSignal): Promise<void> {
    const scale = context.canvas.width / parent.width
    for (const item of owner.getWidgets().flatMap(widget => widget.getContentForRender(parent))) {
        signal.throwIfAborted()
        const document = item.content.ownerDocument
        const existing = new Set(document.querySelectorAll('iframe.html2canvas-container'))
        let snapshot: HTMLCanvasElement | undefined
        try {
            snapshot = await captureSnapshot(html2canvas(item.content, {
                backgroundColor: null, scale, useCORS: true, allowTaint: false, logging: false,
                ignoreElements: element => element.classList.contains('ui-resizable-handle'),
            }), signal)
            signal.throwIfAborted(); context.drawImage(snapshot, item.pos.x * scale, item.pos.y * scale)
        } finally {
            // The pinned renderer removes clones only after success; own its failure cleanup too.
            for (const clone of document.querySelectorAll('iframe.html2canvas-container')) if (!existing.has(clone)) clone.remove()
            if (snapshot) { snapshot.width = 0; snapshot.height = 0 }
        }
    }
}

/** Own one local conversion; await every frame acknowledgement before capture and release encoders on every outcome. */
export async function exportVideo(file: File, settings: ExportSettings, owner: WidgetRuntime, parent: HTMLElement,
    offset: number, signal: AbortSignal, progress: (value: number) => void): Promise<{ blob: Blob; filename: string }> {
    signal.throwIfAborted()
    let input: Input | undefined
    let output: Output | undefined
    let canvas: OffscreenCanvas | undefined
    let conversion: Conversion | undefined
    let cancellation: Promise<void> | undefined
    /** Initiate cancellation once, observing library failures through the terminal cleanup path. */
    function cancel(): void {
        if (conversion && !cancellation) { cancellation = conversion.cancel(); void cancellation.catch(() => {}) }
    }
    signal.addEventListener('abort', cancel, { once: true })
    try {
        input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
        const target = new BufferTarget()
        output = new Output({ format: new formats[settings.format](), target })
        const renderCanvas = new OffscreenCanvas(settings.width, settings.height)
        canvas = renderCanvas
        const context = renderCanvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('Canvas rendering is unavailable')
        await Promise.all(owner.getWidgets().map(widget => widget.waitForRenderReady(signal)))
        signal.throwIfAborted()
        conversion = await Conversion.init({ input, output,
            video: { codec: settings.video, frameRate: settings.fps, bitrate: QUALITY_VERY_HIGH,
                processedWidth: settings.width, processedHeight: settings.height,
                /** Conversion timestamps are relative to trim start, while widgets consume offset log seconds. */
                process: async sample => {
                    signal.throwIfAborted()
                    progress(sample.timestamp / (settings.end - settings.start))
                    await Promise.all(owner.getWidgets().map(widget => widget.setTime(sample.timestamp + settings.start - offset)))
                    signal.throwIfAborted()
                    sample.draw(context, 0, 0)
                    // Centering and scrolling can move the frozen-size grid during capture.
                    await renderOverlay(context, owner, parent.getBoundingClientRect(), signal)
                    signal.throwIfAborted()
                    return renderCanvas
                },
            }, audio: { codec: settings.audio }, trim: { start: settings.start, end: settings.end },
        })
        signal.throwIfAborted()
        if (!conversion.isValid) throw new Error(`Export cannot convert input tracks: ${conversion.discardedTracks.map(track => track.reason).join(', ')}`)
        await conversion.execute()
        signal.throwIfAborted()
        if (!target.buffer) throw new Error('Export produced no media')
        progress(1)
        return { blob: new Blob([target.buffer], { type: output.format.mimeType }), filename: `VideoOverlay${output.format.fileExtension}` }
    } finally {
        signal.removeEventListener('abort', cancel)
        if (conversion && output?.state !== 'finalized') cancel()
        try {
            if (cancellation) await cancellation
            else if (output && output.state !== 'finalized') await output.cancel()
        } finally { input?.dispose(); if (canvas) { canvas.width = 0; canvas.height = 0 } }
    }
}
