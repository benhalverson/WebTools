import assert from 'node:assert/strict'
import test from 'node:test'
import { Conversion, Input, Output, VideoSampleSource } from 'mediabunny'
import type { WidgetRuntime } from '@webtools/widget-runtime'
import { exportVideo, type ExportSettings } from '../src/export.ts'

const settings: ExportSettings = { format: 'webm', video: 'vp8', audio: 'opus', width: 320, height: 180, fps: 24, start: 0, end: 1 }
const owner = { getWidgets: () => [] } as unknown as WidgetRuntime
const parent = {} as HTMLElement

/** Supply only the canvas surface needed before conversion initialization in this controlled failure fixture. */
class CanvasFixture {
    width: number
    height: number
    /** Track allocation so terminal cleanup can release backing storage. */
    constructor(width: number, height: number) { this.width = width; this.height = height }
    /** Initialization does not draw before the controlled conversion rejection. */
    getContext(): object { return {} }
}

test('rejected conversion initialization closes attached output sources and disposes input', async context => {
    const previous = globalThis.OffscreenCanvas
    globalThis.OffscreenCanvas = CanvasFixture as unknown as typeof OffscreenCanvas
    const source = new VideoSampleSource({ codec: 'vp8', bitrate: 1000000 })
    let captured: Output | undefined
    const dispose = context.mock.method(Input.prototype, 'dispose')
    context.mock.method(Conversion, 'init', async (options: { output: Output }) => {
        captured = options.output
        captured.addVideoTrack(source)
        throw new Error('Controlled rejection after output track attachment')
    })
    try {
        await assert.rejects(exportVideo(new File(['fixture'], 'local.webm'), settings, owner, parent, 0, new AbortController().signal, () => {}), /Controlled rejection/)
        assert.equal(captured?.state, 'canceled')
        assert.equal(source._closed, true, 'actual pinned media source released by Output.cancel')
        assert.equal(dispose.mock.callCount(), 1)
    } finally { globalThis.OffscreenCanvas = previous }
})

test('canvas allocation failure still disposes its already created input', async context => {
    const previous = globalThis.OffscreenCanvas
    globalThis.OffscreenCanvas = class {
        /** Reject before any rendering resource becomes usable. */
        constructor() { throw new Error('Controlled canvas allocation rejection') }
    } as unknown as typeof OffscreenCanvas
    const dispose = context.mock.method(Input.prototype, 'dispose')
    try {
        await assert.rejects(exportVideo(new File(['fixture'], 'local.webm'), settings, owner, parent, 0, new AbortController().signal, () => {}), /Controlled canvas allocation/)
        assert.equal(dispose.mock.callCount(), 1)
    } finally { globalThis.OffscreenCanvas = previous }
})
