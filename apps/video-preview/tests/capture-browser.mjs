import assert from 'node:assert/strict'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'

let bundle
/** Exercise the actual serializer and browser bitmap ownership, beyond compositor mocks. */
export async function validateCapture(page) {
    bundle ??= build({ configFile: false, logLevel: 'error', build: { write: false, minify: false,
        lib: { entry: fileURLToPath(new URL('../src/overlay-capture.ts', import.meta.url)), name: 'CaptureAcceptance', formats: ['iife'] } } })
        .then(result => result[0].output.find(value => value.type === 'chunk').code)
    await page.addScriptTag({ content: await bundle })
    await page.addScriptTag({ path: fileURLToPath(new URL('../node_modules/html2canvas/dist/html2canvas.js', import.meta.url)) })
    const fidelity = await page.evaluate(async () => {
        const { OverlayCapture } = window.CaptureAcceptance
        const capture = new OverlayCapture(new Set(), new AbortController().signal)
        const content = document.createElement('div')
        content.style.cssText = 'width:123px;height:93px;border:5px solid #c8c8c8;border-radius:10px;background:white;font:16px Arial'
        content.textContent = '123'; document.body.append(content)
        const layer = { content, native: true, pos: { x: 0, y: 0 } }
        try {
            const candidate = await capture.capture(layer, 1)
            if (!candidate) throw new Error('Native border fixture unavailable')
            const reference = await window.html2canvas(content, { backgroundColor: null, scale: 1, logging: false })
            const image = capture.verify(candidate, reference)
            const cached = await capture.capture(layer, 1)
            const canvas = new OffscreenCanvas(reference.width, reference.height), context = canvas.getContext('2d')
            context.drawImage(image, 0, 0)
            const actual = context.getImageData(0, 0, canvas.width, canvas.height).data
            const expected = reference.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
            const identical = actual.every((value, index) => value === expected[index])
            content.style.borderBottomWidth = '9px'
            const changed = await capture.capture(layer, 1)
            const invalidated = changed !== image && !capture.isVerified(changed)
            reference.width = 0; reference.height = 0; canvas.width = 0; canvas.height = 0
            return { identical, reused: cached === image, invalidated }
        } finally { capture.dispose(); content.remove() }
    })
    for (const [name, passed] of Object.entries(fidelity)) assert.equal(passed, true, name)
    const result = await page.evaluate(async () => {
        const { OverlayCapture } = window.CaptureAcceptance
        const controller = new AbortController(), capture = new OverlayCapture(new Set(), controller.signal)
        const frame = document.createElement('iframe')
        frame.style.cssText = 'width:200px;height:100px;border:0'
        document.body.append(frame)
        const doc = frame.contentDocument
        doc.body.style.cssText = 'margin:0;background:rgb(10,20,30);color:white;font:20px Arial'
        doc.body.innerHTML = '<span>123</span><svg width="20" height="20"><defs><clipPath id="clip"><rect width="10" height="10"/></clipPath></defs><rect fill="red" width="20" height="20" clip-path="url(#clip)"/></svg>'
        const layer = { content: doc.body, native: true, pos: { x: 0, y: 0 } }
        const images = [], remember = async (scale = 1) => { const image = await capture.capture(layer, scale); if (!image) throw new Error('Native capture unavailable'); images.push(image); return image }
        try {
            const first = await remember(), same = await remember()
            doc.querySelector('span').textContent = '456'
            const text = await remember()
            const textChanged = text !== first && first.width === 0
            doc.body.style.backgroundColor = 'rgb(40,50,60)'
            const style = await remember()
            const styleChanged = style !== text && text.width === 0
            doc.querySelector('rect').setAttribute('width', '5')
            const descendant = await remember()
            const descendantChanged = descendant !== style && style.width === 0
            const scaled = await remember(2), scaleChanged = scaled.width === 400 && descendant.width === 0
            frame.style.width = '240px'
            const geometry = await remember(2), geometryChanged = geometry.width === 480 && scaled.width === 0
            const duplicate = await capture.captureOverlay([layer, { ...layer, pos: { x: 30, y: 0 } }], new DOMRect(0, 0, 400, 100), 1)
            const duplicateIsolated = duplicate === null && !!await remember()
            const disconnected = doc.createElement('div')
            const replaced = await capture.capture({ content: disconnected, native: true, pos: { x: 0, y: 0 } }, 1)
            const shadow = doc.createElement('div'); shadow.style.boxShadow = '1px 1px black'; doc.body.append(shadow)
            const unsupported = await capture.capture(layer, 1)
            controller.abort()
            return { identicalReused: same === first, textChanged, styleChanged, descendantChanged, scaleChanged, geometryChanged,
                duplicateIsolated, replaced: replaced === null, unsupported: unsupported === null, released: images.every(image => image.width === 0) }
        } finally { capture.dispose(); frame.remove() }
    })
    for (const [name, passed] of Object.entries(result)) assert.equal(passed, true, name)
    const cancellation = await page.evaluate(async () => {
        const { OverlayCapture } = window.CaptureAcceptance
        const controller = new AbortController(), capture = new OverlayCapture(new Set(), controller.signal)
        const content = document.createElement('div'); content.style.cssText = 'width:20px;height:20px;background:red'; document.body.append(content)
        const decode = Image.prototype.decode
        let release, entered
        const started = new Promise(resolve => { entered = resolve })
        Image.prototype.decode = function () { entered(); return new Promise(resolve => { release = resolve }) }
        const pending = capture.capture({ content, native: true, pos: { x: 0, y: 0 } }, 1).then(() => false, error => error.name === 'AbortError')
        try {
            await started
            controller.abort()
            const cancelled = await pending
            Image.prototype.decode = decode
            const next = new OverlayCapture(new Set(), new AbortController().signal)
            try {
                const image = await next.capture({ content, native: true, pos: { x: 0, y: 0 } }, 1)
                release(); await Promise.resolve()
                const isolated = image?.width === 20
                next.dispose()
                return { cancelled, isolated, released: image?.width === 0 }
            } finally { next.dispose() }
        } finally { Image.prototype.decode = decode; capture.dispose(); content.remove() }
    })
    for (const [name, passed] of Object.entries(cancellation)) assert.equal(passed, true, name)
}
