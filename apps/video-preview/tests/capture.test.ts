import assert from 'node:assert/strict'
import test from 'node:test'
import { getEventListeners } from 'node:events'
import type { WidgetHost, WidgetRuntime } from '@webtools/widget-runtime'
import { abortable, supportsWidget, type OverlayCapture } from '../src/overlay-capture.ts'
import { composeOverlay } from '../src/export.ts'

/** Hold an actual asynchronous boundary until a test chooses completion order. */
function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
}

/** Supply typed host metadata independently of editable widget names or legacy constructors. */
function widget(type = 'WidgetSandBox', script = 'bundled', children?: WidgetHost[], image = false): WidgetHost {
    return {
        model: { type }, getText: () => script, getAbout: () => ({ name: 'User renamed this widget' }),
        content: { querySelector: () => image ? {} : null },
        getNestedRuntime: () => children ? { getWidgets: () => children } : undefined,
    } as unknown as WidgetHost
}

test('exact scripts and typed nested ownership gate native capture', () => {
    const scripts = new Set(['bundled'])
    const child = widget()
    assert.equal(supportsWidget(child, scripts), true)
    assert.equal(supportsWidget(widget('WidgetSandBox', 'bundled\n// edited'), scripts), false)
    assert.equal(supportsWidget(widget('WidgetCustomHTML'), scripts), false)
    assert.equal(supportsWidget(widget('WidgetSubGrid', '', [widget('WidgetSubGrid', '', [child])]), scripts), true)
    assert.equal(supportsWidget(widget('WidgetSubGrid', '', [widget('WidgetCustomHTML')]), scripts), false)
    assert.equal(supportsWidget(widget('WidgetSubGrid', '', [child], true), scripts), false)
})

/** Model only the compositor's drawing surface and exact clone ownership. */
function scene(count = 3) {
    const clones = new Set<Element>()
    const document = { querySelectorAll: () => [...clones] }
    const contents = Array.from({ length: count }, () => ({ ownerDocument: document }) as unknown as HTMLElement)
    const widgets = contents.map((content, index) => ({ ...widget(),
        getContentForRender: () => [{ content, pos: { x: index * 10, y: index * 20 } }],
    }))
    const owner = { getWidgets: () => widgets } as unknown as WidgetRuntime
    const draws: unknown[][] = []
    const context = { canvas: { width: 1920 }, drawImage: (...args: unknown[]) => draws.push(args) } as unknown as OffscreenCanvasRenderingContext2D
    const bounds = { width: 1200, height: 675 } as DOMRect
    const addClone = () => {
        const clone = { remove: () => { clones.delete(clone) } } as unknown as Element
        clones.add(clone)
        return clone
    }
    return { clones, contents, owner, draws, context, bounds, addClone }
}

function native(overrides: Partial<Pick<OverlayCapture, 'retain' | 'captureOverlay' | 'capture'>> = {}) {
    return { scripts: new Set(['bundled']), retain() {}, captureOverlay: async () => null,
        capture: async () => null, isVerified: () => true, verify: () => assert.fail('Unexpected unverified fixture'), ...overrides }
}

test('combined capture draws once and never starts individual or fallback capture', async () => {
    const value = scene(), image = {} as ImageBitmap
    await composeOverlay(value.context, value.owner, value.bounds, new AbortController().signal, native({
        captureOverlay: async (items, bounds, scale) => {
            assert.equal(items.length, 3); assert.equal(bounds, value.bounds); assert.equal(scale, 1.6)
            return image
        },
        capture: async () => assert.fail('duplicate native capture'),
    }), async () => assert.fail('duplicate fallback capture'))
    assert.deepEqual(value.draws, [[image, 0, 0]])
})

test('native captures overlap and retain original composition order when completion is reversed', async () => {
    const value = scene(), pending = value.contents.map(() => deferred<ImageBitmap>()), started: number[] = []
    const images = value.contents.map(() => ({}) as ImageBitmap)
    const rendering = composeOverlay(value.context, value.owner, value.bounds, new AbortController().signal, native({
        capture: item => { const index = value.contents.indexOf(item.content); started.push(index); return pending[index]!.promise },
    }), async () => assert.fail('unexpected fallback'))
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(started, [0, 1, 2])
    pending[2]!.resolve(images[2]!); pending[1]!.resolve(images[1]!)
    await Promise.resolve(); assert.deepEqual(value.draws, [])
    pending[0]!.resolve(images[0]!)
    await rendering
    assert.deepEqual(value.draws, images.map((image, index) => [image, index * 16, index * 32]))
})

test('mixed captures serialize fallback work and draw in layer order', async () => {
    const value = scene(4), holds = [deferred<HTMLCanvasElement>(), deferred<HTMLCanvasElement>()]
    const starts: number[] = [], images = value.contents.map(() => ({ width: 100, height: 100 }))
    const pending = composeOverlay(value.context, value.owner, value.bounds, new AbortController().signal, native({
        capture: async item => { const index = value.contents.indexOf(item.content); return index % 2 === 0 ? images[index] as unknown as ImageBitmap : null },
    }), (content, options) => {
        const index = value.contents.indexOf(content); starts.push(index); value.addClone()
        assert.equal(options?.scale, 1.6); assert.equal(options?.backgroundColor, null)
        assert.equal(options?.useCORS, true); assert.equal(options?.allowTaint, false)
        return holds[starts.length - 1]!.promise
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(starts, [1])
    holds[0]!.resolve(images[1] as HTMLCanvasElement)
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(starts, [1, 3]); assert.equal(value.clones.size, 1)
    holds[1]!.resolve(images[3] as HTMLCanvasElement)
    await pending
    assert.deepEqual(value.draws, images.map((image, index) => [image, index * 16, index * 32]))
    assert.equal(value.clones.size, 0)
    assert.equal(images[1]!.width, 0); assert.equal(images[3]!.height, 0)
    assert.equal(images[0]!.width, 100, 'cached native resources remain owned by the capture session')
})

test('fallback rejection removes only its own clones and allows retry', async () => {
    const value = scene(1), previous = value.addClone()
    await assert.rejects(composeOverlay(value.context, value.owner, value.bounds, new AbortController().signal, undefined, async () => {
        value.addClone(); throw new Error('renderer failed')
    }), /renderer failed/)
    assert.deepEqual([...value.clones], [previous])
    const canvas = { width: 50, height: 50 } as HTMLCanvasElement
    await composeOverlay(value.context, value.owner, value.bounds, new AbortController().signal, undefined, async () => {
        value.addClone(); return canvas
    })
    assert.deepEqual([...value.clones], [previous]); assert.equal(canvas.width, 0)
    assert.equal(value.draws.length, 1)
})

test('cancellation releases held fallback capture and late completion cannot clean a newer export', async () => {
    const value = scene(1), held = deferred<HTMLCanvasElement>(), request = new AbortController()
    const rendering = composeOverlay(value.context, value.owner, value.bounds, request.signal, undefined, () => {
        value.addClone(); return held.promise
    })
    await new Promise(resolve => setImmediate(resolve))
    request.abort(new Error('cancelled'))
    await assert.rejects(rendering, /cancelled/)
    assert.equal(value.clones.size, 0)
    const newer = value.addClone(), late = { width: 100, height: 50 } as HTMLCanvasElement
    held.resolve(late)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(late.width, 0); assert.equal(late.height, 0)
    assert.deepEqual([...value.clones], [newer]); assert.deepEqual(value.draws, [])
})

test('abortable observes late failure, disposes late success and detaches cancellation listeners', async () => {
    for (const failure of [false, true]) {
        const controller = new AbortController(), held = deferred<{ close(): void }>()
        let closed = 0
        const result = abortable(held.promise, controller.signal, value => value.close())
        controller.abort(new Error('stop'))
        await assert.rejects(result, /stop/)
        if (failure) held.reject(new Error('late failure'))
        else held.resolve({ close() { closed++ } })
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(closed, failure ? 0 : 1)
        assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
    }
})
