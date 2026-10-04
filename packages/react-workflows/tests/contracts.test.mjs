import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { availableDestinations, openInDestinations, transferFile, ParameterControl, LoadingOverlay, downloadFile } from '../dist/index.js'

const source = await readFile(new URL('../../../Libraries/OpenIn.js', import.meta.url), 'utf8')
function legacyButtons(pathname, host) {
    const context = vm.createContext({ window: { location: { pathname }, ...host }, document: {
        createElement() { return { children: [], attributes: {}, style: {}, appendChild(child) { this.children.push(child) },
            setAttribute(name, value) { this.attributes[name] = value }, addEventListener(name, callback) { this[name] = callback } } },
    } })
    vm.runInContext(source, context)
    const file = new File(['bytes\0\xff'], 'original.bin')
    return { ...context.get_open_in(() => file), file }
}
test('destination ordering, self exclusion, labels and message gating match unchanged legacy at root and prefix', () => {
    for (const pathname of ['/ReactWorkflows/', '/Tools/WebTools/ReactWorkflows/', '/HardwareReport/', '/Tools/WebTools/PIDReview']) {
        const legacy = legacyButtons(pathname)
        const buttons = legacy.tippy_div.children.filter(item => item.attributes.type === 'button')
        const destinations = availableDestinations(pathname)
        assert.deepEqual(destinations.map(item => item.name), buttons.map(item => item.attributes.value))
        for (const messages of [null, [], ['PARM'], ['ISBD'], ['MAG'], ['PIDA'], ['RATE', 'GYR']]) {
            legacy.update_enable(messages)
            assert.deepEqual(destinations.map(item => !item.enabled(messages)), buttons.map(item => item.disabled))
        }
    }
})
test('same-origin transfer matches legacy payload, filename, exact bytes and wildcard; disposal removes load listener', async () => {
    const makeTarget = () => {
        const listeners = new Set(), sent = []
        return { listeners, sent, addEventListener(_name, listener) { listeners.add(listener) }, removeEventListener(_name, listener) { listeners.delete(listener) }, postMessage(...args) { sent.push(args) } }
    }
    const oldTarget = makeTarget(), newTarget = makeTarget(), paths = []
    const legacy = legacyButtons('/Tools/WebTools/ReactWorkflows/', { open(path) { paths.push(path); return oldTarget } })
    await legacy.tippy_div.children.find(button => button.attributes.value === 'Hardware Report').click()
    const cleanup = transferFile(legacy.file, openInDestinations[1], { open(path) { paths.push(path); return newTarget } })
    for (const listener of oldTarget.listeners) listener()
    for (const listener of newTarget.listeners) listener()
    assert.deepEqual(paths, ['../HardwareReport', '../HardwareReport'])
    assert.equal(newTarget.sent[0][0].type, oldTarget.sent[0][0].type)
    assert.equal(newTarget.sent[0][1], oldTarget.sent[0][1])
    assert.equal(newTarget.sent[0][0].data.name, oldTarget.sent[0][0].data.name)
    assert.deepEqual(await newTarget.sent[0][0].data.arrayBuffer(), await oldTarget.sent[0][0].data.arrayBuffer())
    cleanup(); assert.equal(newTarget.listeners.size, 0)
    assert.doesNotThrow(() => transferFile(legacy.file, openInDestinations[1], { open: () => null })())
})
test('external transfer retains the delayed ArrayBuffer wire format and cancels reader/timer on disposal', async () => {
    const original = globalThis.FileReader
    const readers = []
    class Reader {
        static LOADING = 1
        readyState = 0
        readAsArrayBuffer(file) { this.file = file; this.readyState = 1; readers.push(this) }
        abort() { this.aborted = true }
    }
    globalThis.FileReader = Reader
    try {
        const timers = new Map(), sent = []
        const host = { open: () => ({ postMessage: (...args) => sent.push(args) }), setTimeout(callback, ms) { assert.equal(ms, 2000); timers.set(7, callback); return 7 }, clearTimeout(id) { timers.delete(id) } }
        const file = new File([new Uint8Array([0, 255, 19])], 'data.bin')
        const dispose = transferFile(file, openInDestinations[0], host)
        const reader = readers[0]; reader.result = await file.arrayBuffer(); reader.readyState = 2; reader.onload()
        timers.get(7)()
        assert.deepEqual(new Uint8Array(sent[0][0].data), new Uint8Array([0, 255, 19]))
        assert.equal(sent[0][0].type, 'arrayBuffer'); assert.equal(sent[0][1], '*')
        dispose(); assert.equal(timers.size, 0); assert.equal(reader.onload, null)
        const cancel = transferFile(file, openInDestinations[0], host); cancel(); assert.equal(readers[1].aborted, true)
    } finally { globalThis.FileReader = original }
})
test('metadata controls use narrowed metadata, values precedence, ranges, disabled and bit widths', () => {
    const render = props => renderToStaticMarkup(createElement(ParameterControl, { name: 'P_GAIN', metadata: { P_: { P_GAIN: { Description: 'Gain', Units: 'Hz', Range: { low: '1', high: '5' } } } }, value: '3', onChange() {}, ...props }))
    assert.match(render({ constrain: true }), /min="1" max="5"/)
    assert.doesNotMatch(render({}), /min=/)
    assert.match(render({ disabled: true }), /disabled=""/)
    assert.match(render({ metadata: { P_GAIN: { Values: { 0: 'Off', 1: 'On' } } }, value: '1' }), /<option value="1" selected="">1:On/)
    assert.doesNotMatch(render({ metadata: { P_GAIN: { Values: { 0: 'Off' } } }, allowValues: false }), /<select/)
    assert.match(render({ metadata: { P_GAIN: { Bitmask: { 7: 'Sign', 9: 'Hidden' } } }, value: '-128', bitmaskSize: 8 }), /data-bit="7"[^>]*checked=""/)
    assert.match(render({ metadata: { P_GAIN: { Bitmask: { 9: 'Hidden' } } }, bitmaskSize: 8 }), /data-bit="9"[^>]*display:none/)
    assert.doesNotMatch(render({ metadata: { P_GAIN: { Values: { bad: 42 } } } }), /<select/)
})
test('FileSaver receives the original Blob and filename; overlay retains legacy styling', () => {
    const blob = new Blob(['raw\0bytes']); let args
    downloadFile((...values) => { args = values }, blob, 'original.param')
    assert.equal(args[0], blob); assert.equal(args[1], 'original.param')
    const markup = renderToStaticMarkup(createElement(LoadingOverlay, { visible: true }))
    for (const value of ['id="loading"', 'opacity:0.7', 'z-index:99', 'visibility:visible', '>Loading</h1>']) assert.ok(markup.includes(value))
})
