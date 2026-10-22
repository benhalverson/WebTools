import html2canvas from 'html2canvas'
import {
    ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output, QUALITY_VERY_HIGH,
    Mp4OutputFormat, WebMOutputFormat, MkvOutputFormat, MovOutputFormat,
    getEncodableVideoCodecs, getEncodableAudioCodecs,
    type VideoCodec, type AudioCodec,
} from 'mediabunny'
import type { WidgetRuntime } from '@webtools/widget-runtime'
import { abortable, OverlayCapture, overlayLayers } from './overlay-capture.ts'

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

/** Release captured backing storage, including a vendor result arriving after cancellation. */
function releaseCanvas(canvas: HTMLCanvasElement): void { canvas.width = 0; canvas.height = 0 }

/** Preserve ordered layers while overlapping native captures and serializing vendor clone ownership. */
export async function composeOverlay(context: OffscreenCanvasRenderingContext2D, owner: WidgetRuntime, parent: DOMRect, signal: AbortSignal,
    capture?: Pick<OverlayCapture, 'scripts' | 'retain' | 'captureOverlay' | 'capture' | 'isVerified' | 'verify'>, render: typeof html2canvas = html2canvas): Promise<void> {
    signal.throwIfAborted()
    const scale = context.canvas.width / parent.width
    const items = capture ? overlayLayers(owner, parent, capture.scripts)
        : owner.getWidgets().flatMap(widget => widget.getContentForRender(parent)).map(item => ({ ...item, native: false }))
    capture?.retain([...items.map(item => item.content), capture])
    const combined = await capture?.captureOverlay(items, parent, scale)
    signal.throwIfAborted()
    if (combined) {
        if (capture!.isVerified(combined)) { context.drawImage(combined, 0, 0); return }
        const reference = new OffscreenCanvas(context.canvas.width, context.canvas.height)
        try {
            await composeOverlay(reference.getContext('2d')!, owner, parent, signal, undefined, render)
            signal.throwIfAborted()
            context.drawImage(capture!.verify(combined, reference, true), 0, 0)
        } finally { reference.width = 0; reference.height = 0 }
        return
    }
    capture?.retain(items.map(item => item.content))
    const native = await Promise.all(items.map(item => capture?.capture(item, scale)))
    for (const [index, item] of items.entries()) {
        signal.throwIfAborted()
        const bitmap = native[index]
        if (bitmap && capture!.isVerified(bitmap)) { context.drawImage(bitmap, item.pos.x * scale, item.pos.y * scale); continue }
        const document = item.content.ownerDocument
        const existing = new Set(document.querySelectorAll('iframe.html2canvas-container'))
        const owned = new Set<Element>()
        let snapshot: HTMLCanvasElement | undefined
        try {
            const pending = render(item.content, {
                backgroundColor: null, scale, useCORS: true, allowTaint: false, logging: false,
                ignoreElements: element => element.classList.contains('ui-resizable-handle'),
                onclone: clone => {
                    const frame = clone.defaultView?.frameElement
                    if (frame) owned.add(frame)
                    if (signal.aborted) { for (const frame of owned) frame.remove(); signal.throwIfAborted() }
                },
            })
            // The pinned renderer creates its container synchronously before its first await.
            // Keep exact nodes so a late result never sweeps a newer export's clones.
            for (const clone of document.querySelectorAll('iframe.html2canvas-container')) if (!existing.has(clone)) owned.add(clone)
            snapshot = await abortable(pending, signal, releaseCanvas)
            signal.throwIfAborted()
            context.drawImage(bitmap ? capture!.verify(bitmap, snapshot) : snapshot, item.pos.x * scale, item.pos.y * scale)
        } finally {
            for (const clone of owned) clone.remove()
            if (snapshot) releaseCanvas(snapshot)
        }
    }
}
/** Preserve the public one-frame entry point with a separately disposed capture lifetime. */
export async function renderOverlay(context: OffscreenCanvasRenderingContext2D, owner: WidgetRuntime, parent: DOMRect, signal: AbortSignal): Promise<void> {
    const capture = await OverlayCapture.create(owner, signal)
    try { await composeOverlay(context, owner, parent, signal, capture) }
    finally { capture?.dispose() }
}

/** Own one local conversion; await every frame acknowledgement before capture and release encoders on every outcome. */
export async function exportVideo(file: File, settings: ExportSettings, owner: WidgetRuntime, parent: HTMLElement,
    offset: number, signal: AbortSignal, progress: (value: number) => void): Promise<{ blob: Blob; filename: string }> {
    signal.throwIfAborted()
    let input: Input | undefined
    let output: Output | undefined
    let canvas: OffscreenCanvas | undefined
    let conversion: Conversion | undefined
    let capture: OverlayCapture | undefined
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
        capture = await OverlayCapture.create(owner, signal)
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
                    await composeOverlay(context, owner, parent.getBoundingClientRect(), signal, capture)
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
        capture?.dispose()
        if (conversion && output?.state !== 'finalized') cancel()
        try {
            if (cancellation) await cancellation
            else if (output && output.state !== 'finalized') await output.cancel()
        } finally { input?.dispose(); if (canvas) { canvas.width = 0; canvas.height = 0 } }
    }
}
