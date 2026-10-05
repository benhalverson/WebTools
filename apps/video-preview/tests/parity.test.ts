import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { defaultOffset, logDurationUS, logTime } from '../src/mapping.ts'
import { parseVideoLayout, parseVideoPalette, parseVideoWidget, serializeVideoLayout, serializeVideoWidget } from '../src/format.ts'
import type { DataflashLog } from '@webtools/dataflash'

const base = '298045cb9680943bb1f99e95082f86e84e167461'
const legacy = execFileSync('git', ['show', `${base}:VideoOverlay/VideoOverlay.js`], { encoding: 'utf8' })

/** Run an exact owned legacy function in a fresh context with controlled browser inputs. */
function legacyFunction(name: string, context: Record<string, unknown>): vm.Context {
    const start = legacy.indexOf(`function ${name}(`)
    assert.ok(start >= 0)
    const end = legacy.indexOf('\nfunction ', start + 1)
    const scope = vm.createContext(context)
    vm.runInContext(legacy.slice(start, end === -1 ? undefined : end), scope)
    return scope
}

test('retained source and recursive format adapters preserve exact layout and widget bytes', async () => {
    assert.equal(await readFile('VideoOverlay/VideoOverlay.js', 'utf8'), legacy)
    for (const file of ['Default_Layout.json', 'Default_Palette.json']) {
        const bytes = await readFile(`VideoOverlay/${file}`, 'utf8')
        assert.equal(bytes, execFileSync('git', ['show', `${base}:VideoOverlay/${file}`], { encoding: 'utf8' }))
        if (file === 'Default_Layout.json') {
            const layout = parseVideoLayout(bytes)
            assert.equal(serializeVideoLayout(layout), JSON.stringify(JSON.parse(bytes), null, 2))
            for (const widget of Object.values(layout.widgets)) {
                const serialized = serializeVideoWidget(widget)
                assert.deepEqual(parseVideoWidget(serialized), widget)
            }
        } else {
            const widgets = parseVideoPalette(bytes)
            assert.equal(Object.values(widgets).every(widget => !widget.type.endsWith('VideoOverlay')), true)
            assert.equal(Object.keys(widgets).length, Object.keys(JSON.parse(bytes).widgets).length)
        }
    }
    assert.throws(() => parseVideoLayout('{"header":{"version":1,"tool":"other"}}'), /not for this tool/)
})

test('raw timestamp mapping matches legacy for both authoritative known logs', async () => {
    Object.assign(globalThis, { self: { addEventListener() {}, postMessage() {} } })
    const { loadDataflashParser } = await import('@webtools/dataflash')
    const Parser = await loadDataflashParser()
    for (const file of ['pymavlink-test.BIN', 'plane-4.6.2-prefix.BIN']) {
        const bytes = await readFile(`packages/dataflash/fixtures/${file}`)
        const log: DataflashLog = new Parser(); log.processData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), [])
        const offset = { value: 0 }
        const scope = legacyFunction('setDefaultOffset', { log, document: { getElementById: () => offset } })
        vm.runInContext('setDefaultOffset()', scope)
        assert.equal(defaultOffset(log), offset.value)
        const duration = legacyFunction('getLogDurationUS', { log })
        assert.equal(logDurationUS(log), vm.runInContext('getLogDurationUS()', duration))
        for (const video of [0, .125, 1, 3.75]) for (const adjustment of [-12.5, 0, 2.25, defaultOffset(log)]) {
            let received = NaN
            const start = legacy.indexOf('async function setWidgetTime('), end = legacy.indexOf('\nasync function exportVideo', start)
            const context = vm.createContext({ grid: { getGridItems: () => [{ setTime(value: number) { received = value; return Promise.resolve() } }] }, document: { getElementById: () => ({ value: String(adjustment) }) } })
            vm.runInContext(legacy.slice(start, end), context)
            await vm.runInContext(`setWidgetTime(${video})`, context)
            assert.equal(logTime(video, adjustment), received)
        }
    }
})
