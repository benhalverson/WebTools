import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import vm from 'node:vm'
import { changedParameters, extractLogParameters, extractWaypoints, extractEmbeddedFiles, exportChangedParameters } from '../src/model/log-extractions.ts'

const revision = '6cd6a978dbe6e93709fb2e468f9b9085c3a7f7ce'
const legacy = execFileSync('git', ['show', `${revision}:HardwareReport/HardwareReport.js`], { encoding: 'utf8' })
/** Build numeric parser-shaped columns from independently specified protocol rows. */
function columns(rows) {
    return Object.fromEntries(Object.keys(rows[0]).map(key => [key, typeof rows[0][key] === 'string' ? rows.map(row => row[key]) : Float64Array.from(rows.map(row => row[key]))]))
}
/** Expose only the lazy message access used by the extraction algorithms. */
function log(messages) { return { messageTypes: Object.fromEntries(Object.keys(messages).map(name => [name, {}])), get(name) { return messages[name] } } }
/** Run the original parameter-loop source at the actual branch base. */
function parameterOracle(message) {
    const start = legacy.indexOf('    let param_changes = {}', legacy.indexOf('async function load_log('))
    const end = legacy.indexOf('    show_param_changes(param_changes)', start)
    const context = vm.createContext({ PARM: message })
    vm.runInContext(`let params = {}, defaults = {}; const US2S = 0.000001;\n${legacy.slice(start, end)}\nglobalThis.result = {params,defaults,changes:param_changes}`, context)
    return structuredClone(context.result)
}
/** Evaluate the original download function with a DOM capture rather than reimplementing its serialization. */
async function waypointOracle(input) {
    const links = [], downloads = [], warnings = []
    /** Capture registered click handlers and preserve the original Blob construction. */
    function element(tag) { return { children: [], previousElementSibling: {}, appendChild(child) { this.children.push(child) }, addEventListener(_event, callback) { if (tag === 'a') links.push(callback) } } }
    const context = vm.createContext({ Blob, log: input,
        document: { createElement: element, createTextNode: String, getElementById: element },
        alert(message) { warnings.push(message) }, saveAs(blob, name) { downloads.push({ blob, name, incomplete: warnings.pop() === 'Mission incomplete' }) },
    })
    const start = legacy.indexOf('function load_waypoints('), end = legacy.indexOf('\n}\n', start) + 3
    vm.runInContext(legacy.slice(start, end) + '\nload_waypoints(log)', context)
    for (const click of links) click()
    return Promise.all(downloads.map(async ({ blob, name, incomplete }) => ({ name, text: await blob.text(), incomplete })))
}

const parameterRows = [
    { Name: 'GAIN', TimeUS: 1000000, Value: 1, Default: 1 },
    { Name: 'GAIN', TimeUS: 2000000, Value: 1, Default: NaN },
    { Name: 'GAIN', TimeUS: 3000000, Value: 2, Default: NaN },
    { Name: 'STAT_RUNTIME', TimeUS: 3100000, Value: 4, Default: 0 },
    { Name: 'STAT_RUNTIME', TimeUS: 4000000, Value: 5, Default: 0 },
    { Name: 'GAIN', TimeUS: 5000000, Value: 1, Default: 3 },
    { Name: 'OTHER', TimeUS: 5500000, Value: -0, Default: 0 },
    { Name: 'UNDEFAULTED', TimeUS: 5500000, Value: 9, Default: NaN },
]
test('parameter values, defaults, repeated timestamps and histories exactly match base', () => {
    const message = columns(parameterRows)
    assert.deepEqual(extractLogParameters(log({ PARM: message })), parameterOracle(message))
    delete message.Default
    assert.deepEqual(extractLogParameters(log({ PARM: message })), parameterOracle(message))
    assert.throws(() => extractLogParameters(log({})), /No parameter values/)
})

test('changed parameter serialized bytes match original export including absent defaults', () => {
    const { params, defaults } = extractLogParameters(log({ PARM: columns(parameterRows) }))
    const context = vm.createContext({ params, defaults, result: undefined, save_text(text) { context.result = text } })
    vm.runInContext(execFileSync('git', ['show', `${revision}:Libraries/Param_Helpers.js`], { encoding: 'utf8' }), context)
    const start = legacy.indexOf('function save_changed_parameters('), end = legacy.indexOf('\n}\n', start) + 3
    vm.runInContext(legacy.slice(start, end) + '\nsave_changed_parameters()', context)
    assert.equal(exportChangedParameters(params, defaults), context.result)
    assert.deepEqual(changedParameters({ A: 0, B: 3 }, { A: -0 }), { B: 3 })
})

const cmd = { CTot: 2, CNum: 0, CId: 16, Prm1: 1.234567891, Prm2: -0, Prm3: 0, Prm4: 90, Lat: -351234567, Lng: 1491234567, Alt: 12.3456789, Frame: 3 }
const fence = { Tot: 5, Seq: 0, Type: 98, Count: 3, Radius: 13.123456789, Lat: -351234567, Lng: 1491234567 }
const rally = { Tot: 4, Seq: 0, Lat: -351234567, Lng: 1491234567, Alt: -12.3456789, Flags: 0 }
test('mission, all fence types, rally frames, duplicate records and incomplete downloads match base bytes', async () => {
    const messages = {
        CMD: columns([cmd, cmd, { ...cmd, CNum: 1 }, { ...cmd, CNum: 1, Alt: 23 }, { ...cmd, CTot: 3, CNum: 2 }]),
        FNCE: columns([fence, ...[97, 95, 93, 92, 100].map((Type, i) => ({ ...fence, Type, Seq: i + 1 })), { ...fence, Radius: 42, Type: 93 }]),
        RALY: columns([rally, ...[4, 12, 20, 28].map((Flags, i) => ({ ...rally, Flags, Seq: i + 1 })), { ...rally, Alt: 100 }]),
    }
    const input = log(messages)
    assert.deepEqual(extractWaypoints(input).flatMap(group => group.downloads), await waypointOracle(input))
    delete messages.RALY.Flags
    assert.deepEqual(extractWaypoints(input).flatMap(group => group.downloads), await waypointOracle(input))
    assert.deepEqual(extractWaypoints(log({})), [])
})

test('embedded downloads preserve exact bytes and names, detach ownership and release parser buffers', async () => {
    const entries = { 'scripts/example.lua': Uint8Array.of(0, 10, 13, 128, 255), 'logs/crash_dump.bin': Uint8Array.of(255, 0, 1) }
    const input = { messageTypes: { FILE: {} }, messages: {}, files: null, parseAtOffset(name) { assert.equal(name, 'FILE') }, processFiles() { this.files = entries } }
    const actual = extractEmbeddedFiles(input)
    const links = [], saved = []
    /** Capture legacy embedded file click listeners and ignore presentation-only DOM. */
    function element() { return { previousElementSibling: {}, appendChild() {}, addEventListener(_event, callback) { links.push(callback) } } }
    const context = vm.createContext({ log: { ...input, messages: {} }, Blob,
        document: { createElement: element, createTextNode: String, getElementById: element }, add_warning() {}, saveAs(blob, name) { saved.push({ blob, name }) },
    })
    const start = legacy.indexOf("    if ('FILE' in log.messageTypes) {", legacy.indexOf('// Add download link for embedded files'))
    const end = legacy.indexOf('    // Logging dropped packets', start)
    vm.runInContext(legacy.slice(start, end), context)
    links.forEach(click => click())
    assert.deepEqual(actual.map(file => file.name), saved.map(file => file.name))
    for (let i = 0; i < actual.length; i++) assert.deepEqual(actual[i].contents, new Uint8Array(await saved[i].blob.arrayBuffer()))
    assert.deepEqual(actual.map(file => file.crashDump), [false, true])
    entries['scripts/example.lua'][0] = 99
    assert.equal(actual[0].contents[0], 0)
    assert.equal(input.files, null)
    assert.equal(input.messages.FILE, null)
    input.processFiles = () => { throw new Error('corrupt FILE') }
    assert.throws(() => extractEmbeddedFiles(input), /corrupt FILE/)
    assert.equal(input.files, null)
    assert.equal(input.messages.FILE, null)
})

/** Encode an explicit DataFlash FMT record for a deterministic local FILE fixture. */
function formatRecord(type, length, name, format, fields) {
    const record = Buffer.alloc(89)
    record.set([0xa3, 0x95, 0x80, type, length])
    record.write(name, 5, 4, 'latin1'); record.write(format, 9, 16, 'latin1'); record.write(fields, 25, 64, 'latin1')
    return record
}
/** Encode FILE chunks in source order, including offsets which legacy intentionally ignores. */
function fileRecord(name, offset, data) {
    const record = Buffer.alloc(91)
    record.set([0xa3, 0x95, 42])
    record.write(name, 3, 16, 'latin1')
    record.writeUInt32LE(offset, 19)
    record.writeUInt32LE(data.length, 23)
    record.set(data, 27)
    return record
}

test('real parser FILE boundary preserves chunk order, binary values and trailing-zero legacy quirk', async () => {
    globalThis.self ??= { addEventListener() {} }
    const { loadDataflashParser } = await import('../../../packages/dataflash/dist/index.js')
    const Parser = await loadDataflashParser()
    const { default: Legacy } = await import('../../../modules/JsDataflashParser/parser.js')
    const bytes = Buffer.concat([
        formatRecord(42, 91, 'FILE', 'NIIZ', 'FileName,Offset,Length,Data'),
        fileRecord('crash_dump.bin', 12, [0, 128, 255, 0]),
        fileRecord('script.lua', 0, [65, 10]),
        fileRecord('crash_dump.bin', 0, [1, 0, 2, 0]),
    ])
    const input = new Parser(), expected = new Legacy()
    input.processData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), [])
    expected.processData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), [])
    expected.parseAtOffset('FILE'); expected.processFiles()
    const actual = extractEmbeddedFiles(input)
    assert.deepEqual(Object.fromEntries(actual.map(file => [file.name, file.contents])), expected.files)
    assert.deepEqual(actual[0].contents, Uint8Array.of(0, 128, 255, 1, 0, 2))
    assert.deepEqual(actual[1].contents, Uint8Array.of(65, 10))
})

test('authoritative binary fixture parameter values and changes match actual base loop', async () => {
    const { readFile } = await import('node:fs/promises')
    globalThis.self ??= { addEventListener() {} }
    const { loadDataflashParser } = await import('../../../packages/dataflash/dist/index.js')
    const Parser = await loadDataflashParser()
    for (const filename of ['pymavlink-test.BIN', 'plane-4.6.2-prefix.BIN']) {
        const bytes = await readFile(new URL(`../../../packages/dataflash/fixtures/${filename}`, import.meta.url))
        const input = new Parser()
        input.processData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), [])
        assert.deepEqual(extractLogParameters(input), parameterOracle(input.get('PARM')))
        if (input.get('CMD') && !input.get('CMD').Frame) {
            // Old CMD schemas are a legacy error, not a migration-time repair.
            assert.throws(() => extractWaypoints(input), TypeError)
            await assert.rejects(waypointOracle(input), { name: 'TypeError' })
        } else {
            assert.deepEqual(extractWaypoints(input).flatMap(group => group.downloads), await waypointOracle(input))
        }
    }
})
