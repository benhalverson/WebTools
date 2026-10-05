import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ParameterControl, openInDestinations, transferFile } from '../dist/index.js'

/** Model only active browser ownership. Completed reads/timers are removed;
 * deliveries record primitives, never File/ArrayBuffer payloads. Chromium tests
 * separately establish collectibility with native readers and forced GC. */
function transport() {
    const reads = new Set(), timers = new Map(), sent = []
    let sequence = 0, aborted = 0
    class Reader {
        static LOADING = 1
        readyState = 0
        result = null
        /** Retain the active reader only until its read completes or aborts. */
        readAsArrayBuffer() { this.readyState = 1; reads.add(this) }
        /** Abort mimics synchronous native abort dispatch, after cleanup. */
        abort() { this.readyState = 2; reads.delete(this); aborted++; this.onabort?.() }
    }
    const host = {
        /** Return a recipient that checks bytes without owning delivered data. */
        open() { return { postMessage(message, origin) { sent.push([message.type, message.data.byteLength, origin]) } } },
        /** Own independent timer callbacks until explicitly fired or cancelled. */
        setTimeout(callback, delay) { assert.equal(delay, 2000); timers.set(++sequence, callback); return sequence },
        /** Release only the identified recipient's callback. */
        clearTimeout(id) { timers.delete(id) },
    }
    return { Reader, reads, timers, sent, host, get aborted() { return aborted },
        /** Complete a read and assert all terminal reader handlers are cleared. */
        finish(event = 'onload') {
            const reader = reads.values().next().value
            reads.delete(reader); reader.readyState = 2; reader.result = new ArrayBuffer(3)
            try { reader[event]() }
            finally { for (const key of ['onload', 'onerror', 'onabort']) assert.equal(reader[key], null) }
        },
        /** Fire a timer after removing its browser-owned callback reference. */
        deliver() { const [id, callback] = timers.entries().next().value; timers.delete(id); callback() },
    }
}

/** Exercise absent raw documents without changing the throwing legacy helper. */
test('ParameterControl accepts omitted, null, and undefined loading metadata', () => {
    for (const props of [{}, { metadata: null }, { metadata: undefined }]) {
        assert.match(renderToStaticMarkup(createElement(ParameterControl, { name: 'TEST', value: '9', onChange() {}, ...props })), /type="number"[^>]*value="9"/)
    }
})

/** Keep returned disposers after settlement to verify idempotent ownership. */
test('external completion releases active work; repeated and overlapping operations settle independently', () => {
    const probe = transport(), original = globalThis.FileReader
    globalThis.FileReader = probe.Reader
    try {
        let settled = 0
        const disposers = []
        for (let i = 0; i < 3; i++) disposers.push(transferFile(new File(['abc'], 'original.bin'), openInDestinations[0], probe.host, () => settled++))
        assert.equal(probe.reads.size, 3)
        probe.finish(); probe.finish(); probe.finish()
        assert.equal(probe.timers.size, 3)
        assert.equal(settled, 0)
        probe.deliver()
        assert.equal(settled, 1); assert.equal(probe.timers.size, 2)
        disposers[1]()
        assert.equal(settled, 2); assert.equal(probe.timers.size, 1)
        probe.deliver()
        assert.equal(settled, 3); assert.equal(probe.timers.size, 0)
        for (const dispose of disposers) { dispose(); dispose() }
        assert.equal(settled, 3)
        assert.deepEqual(probe.sent, [['arrayBuffer', 3, '*'], ['arrayBuffer', 3, '*']])
        const again = transferFile(new File(['abc'], 'repeat.bin'), openInDestinations[0], probe.host, () => settled++)
        probe.finish(); probe.deliver(); again()
        assert.equal(settled, 4)
    } finally { globalThis.FileReader = original }
})

/** Cover each terminal read/delivery path without keeping completed payloads. */
test('external cancellation, abort, read error, blocked popup and thrown browser calls settle once', () => {
    const probe = transport(), original = globalThis.FileReader
    globalThis.FileReader = probe.Reader
    try {
        let settled = 0
        const file = new File(['abc'], 'original.bin')
        const start = (host = probe.host) => transferFile(file, openInDestinations[0], host, () => settled++)
        const cancel = start(); cancel(); cancel()
        assert.equal(probe.aborted, 1); assert.equal(probe.reads.size, 0); assert.equal(settled, 1)
        for (const event of ['onerror', 'onabort']) { const dispose = start(); probe.finish(event); dispose() }
        assert.equal(settled, 3)
        const blocked = start({ ...probe.host, open: () => null }); probe.finish(); blocked()
        assert.equal(settled, 4); assert.equal(probe.timers.size, 0)
        const failedOpen = start({ ...probe.host, open() { throw new Error('open failed') } })
        assert.throws(() => probe.finish(), /open failed/); failedOpen()
        assert.equal(settled, 5)
        const failedPost = start({ ...probe.host, open: () => ({ postMessage() { throw new Error('post failed') } }) })
        probe.finish(); assert.throws(() => probe.deliver(), /post failed/); failedPost()
        assert.equal(settled, 6); assert.equal(probe.timers.size, 0)
        class BrokenReader extends probe.Reader {
            /** Simulate a synchronous read failure before any asynchronous work. */
            readAsArrayBuffer() { throw new Error('read failed') }
        }
        globalThis.FileReader = BrokenReader
        assert.throws(() => start(), /read failed/)
        assert.equal(settled, 7)
    } finally { globalThis.FileReader = original }
})

/** Same-origin load ownership stays active for legacy repeat-load delivery. */
test('same-origin recipients keep repeat-load listeners until cancellation, with synchronous blocked settlement', async () => {
    const recipients = []
    let settled = 0
    const host = {
        /** Track listener ownership and primitive filename/size evidence only. */
        open() {
            const listeners = new Set(), sent = []
            const target = {
                addEventListener(_type, listener) { listeners.add(listener) },
                removeEventListener(_type, listener) { listeners.delete(listener) },
                postMessage(message, origin) { sent.push([message.type, message.data.name, message.data.size, origin]) },
            }
            recipients.push({ listeners, sent }); return target
        },
    }
    const first = transferFile(new File(['abc'], 'first.bin'), openInDestinations[1], host, () => settled++)
    const second = transferFile(new File(['def'], 'second.bin'), openInDestinations[1], host, () => settled++)
    for (let i = 0; i < 2; i++) for (const listener of recipients[0].listeners) listener()
    assert.equal(settled, 0); assert.equal(recipients[0].sent.length, 2)
    first(); first()
    assert.equal(settled, 1); assert.equal(recipients[0].listeners.size, 0); assert.equal(recipients[1].listeners.size, 1)
    for (const listener of recipients[1].listeners) listener()
    assert.deepEqual(recipients[1].sent, [['file', 'second.bin', 3, '*']])
    second(); assert.equal(settled, 2)
    const blocked = transferFile(new File([], 'blocked.bin'), openInDestinations[1], { open: () => null }, () => settled++)
    assert.equal(settled, 3); blocked(); assert.equal(settled, 3)
})
