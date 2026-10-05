import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { test } from 'node:test'
import { loadLog, parameterDiff, groupLogs } from '../src/model.ts'
import { directoryFiles } from '../src/directory.ts'
import type { DirectoryHandle } from '../src/directory.ts'
import type { Luxon } from '../src/vendors.ts'
import type { DataflashConstructor } from '@webtools/dataflash'

const base = '0f4607db3dccbc7d06e5847c02465dab38d1eb80'
/** Read the exact pre-migration owned implementation, never the implementation under test. */
function legacy(path: string): string { return execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' }) }
const context = vm.createContext({ console, self: { addEventListener() {} } })
vm.runInContext(readFileSync('modules/build/luxon/build/global/luxon.min.js', 'utf8'), context)
vm.runInContext(legacy('Libraries/LogHelpers.js'), context)
vm.runInContext(legacy('LogFinder/LogFinder.js').replace(/import\('\.\.\/modules\/JsDataflashParser\/parser.js'\).*?;/, ''), context)
vm.runInContext('param_diff_ignore.forEach(rule => rule.check = { checked: true })', context)
Reflect.set(globalThis, 'self', { addEventListener() {} })
const { loadDataflashParser } = await import('../../../packages/dataflash/dist/index.js')
const Parser = await loadDataflashParser()
context.DataflashParser = Parser
const luxon = vm.runInContext('luxon', context) as Luxon
/** Normalize cross-realm objects and Luxon dates exactly as serialized outputs. */
function serialized(value: unknown): string { return JSON.stringify(value) }
for (const fixture of ['pymavlink-test.BIN', 'plane-4.6.2-prefix.BIN']) {
    test('exact metadata and numeric parity: ' + fixture, () => {
        const bytes = readFileSync('packages/dataflash/fixtures/' + fixture)
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        context.bytes = buffer
        const expected = vm.runInContext('load_log(bytes)', context)
        assert.equal(serialized(loadLog(buffer, Parser, luxon)), serialized(expected))
        assert.equal(serialized(loadLog(buffer, Parser, luxon)), serialized(expected), 'fresh repeat has no retained parser state')
    })
}
test('parameter ignore selections preserve exact added/missing/changed results', () => {
    const previous = { STAT_FLTTIME: 1, ARMING_CHECK: 1, INS_GYROFFS_X: 0, COMPASS_DEC: 0, OLD: 1, SAME: NaN }
    const current = { STAT_FLTTIME: 5, ARMING_CHECK: 0, INS_GYROFFS_X: 2, COMPASS_DEC: 1, NEW: 2, SAME: NaN }
    context.previous = previous; context.current = current
    for (let mask = 0; mask < 128; mask++) {
        const ignored = Array.from({ length: 7 }, (_, index) => !!(mask & (1 << index)))
        context.ignored = ignored
        const expected = vm.runInContext('param_diff_ignore.forEach((rule, i) => rule.check.checked = ignored[i]); get_param_diff(current, previous)', context)
        assert.equal(serialized(parameterDiff(current, previous, ignored)), serialized(expected))
    }
})
test('distance, flight time, warnings and metadata retain edge-case semantics exactly', () => {
    const fields = { PARM: { Name: ['STAT_FLTTIME', 'STAT_FLTTIME', 'ARMING_CHECK'], Value: [10, 7, 0] }, POS: { Lat: [899999999, 899999998, -899999999], Lng: [1799999999, -1799999999, 1799999999], Alt: [1, 4, 9] }, FILE: { FileName: ['a/crash_dump.bin'] } }
    /** Supply controlled fields while both calculations retain their original formulas. */
    class ControlledParser {
        messageTypes = { PARM: {}, POS: {}, WDOG: {}, FILE: {} }
        processData() {}
        get(name: keyof typeof fields, field?: string) { const message = fields[name]; return field ? Reflect.get(message, field) : message }
        extractStartTime() { return new Date(0) }
    }
    context.DataflashParser = ControlledParser; context.bytes = new ArrayBuffer(3)
    assert.equal(serialized(loadLog(new ArrayBuffer(3), ControlledParser as unknown as DataflashConstructor, luxon)), serialized(vm.runInContext('load_log(bytes)', context)))
    context.DataflashParser = Parser
})
test('directory recursion preserves BIN filtering, order and inaccessible-child behavior', async () => {
    const handle: DirectoryHandle = { kind: 'directory', name: 'logs', async *values() {
        yield { kind: 'file', name: 'a.BIN', async getFile() { return new File(['abc'], 'a.BIN') } }
        yield { kind: 'directory', name: 'denied', values() { throw new Error('denied') } }
        yield { kind: 'file', name: 'ignore.txt', async getFile() { return new File(['x'], 'ignore.txt') } }
    } }
    const controller = new AbortController()
    const files = await Array.fromAsync(directoryFiles(handle, controller.signal))
    assert.deepEqual(files.map(file => file.path), ['logs/a.BIN'])
    assert.equal(await files[0]!.file.text(), 'abc')
    controller.abort()
    assert.deepEqual(await Array.fromAsync(directoryFiles(handle, controller.signal)), [])
})
test('grouping retains hardware discovery and legacy character-wise common paths', () => {
    const bytes = readFileSync('packages/dataflash/fixtures/pymavlink-test.BIN')
    const info = loadLog(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), Parser, luxon)!
    const entries = ['logs/a10.bin', 'logs/a20.bin'].map(name => ({ info: { ...info, name, rel_path: name }, fileHandle: new File([], name) }))
    assert.equal(groupLogs(entries)[0]!.commonPath, 'logs/a')
    assert.deepEqual(groupLogs(entries)[0]!.logs, entries)
})
