import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import vm from 'node:vm'
import { buildLogPlots, dataRatePlots } from '../src/model/log-plots.ts'
const revision = '6cd6a978dbe6e93709fb2e468f9b9085c3a7f7ce'
/** Read the immutable actual prerequisite head. */
function source(path) { return execFileSync('git', ['show', `${revision}:${path}`], { encoding: 'utf8' }) }
const legacy = source('HardwareReport/HardwareReport.js')
/** Extract unchanged top-level declarations for the independent oracle. */
function declaration(name) { const start = legacy.indexOf(`function ${name}(`); return legacy.slice(start, legacy.indexOf('\n}\n', start) + 3) }
/** Supply typed upstream-shaped columns, without changing numeric payloads. */
function message(fields) { return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, typeof value[0] === 'string' ? value : new Float64Array(value)])) }
/** A local log fixture exposes the parser's relevant read-only API. */
function logFixture(messages, instances = {}) {
    const messageTypes = Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, { expressions: Object.keys(value) }]))
    for (const [key, value] of Object.entries(instances)) messageTypes[key] = { expressions: Object.keys(Object.values(value)[0]), instances: Object.fromEntries(Object.keys(value).map(key => [key, key])) }
    return { messageTypes, get(name, field) { return field ? messages[name]?.[field] : messages[name] },
        get_instance(name, instance, field) { return field ? instances[name]?.[instance]?.[field] : instances[name]?.[instance] },
        stats() { return { FMT: { count: 1, size: 89, msg_size: 89 }, PM: { count: 2, size: 58, msg_size: 29 } } }, data: { byteLength: 147 } }
}
/** Build a minimal DOM sink; all arithmetic still executes the unchanged source. */
function node() { return { children: [], previousElementSibling: {}, appendChild(child) { if (typeof child === 'object') child.parentElement = this; this.children.push(child); return child }, insertBefore() {}, replaceChildren() {} } }
/** Normalize typed buffers to lists for Plotly numeric equality while retaining NaN and Infinity. */
function normalize(value) {
    if (ArrayBuffer.isView(value)) return Array.from(value)
    if (Array.isArray(value)) return Array.from(value, normalize)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]))
    return value
}
/** Run reset and log plot sections from the actual base, retaining their original definitions. */
function oracle(log, params) {
    const elements = new Map(), rates = [], visible = new Set()
    const context = vm.createContext({ log, params, console,
        document: { getElementById(id) { if (!elements.has(id)) elements.set(id, node()); return elements.get(id) }, createElement: node, createTextNode: String },
        Plotly: { purge() {}, redraw() {}, newPlot(element, data, layout) { element.layout = layout; if (!Array.from(elements.values()).includes(element)) rates.push({ data, layout, title: element.parentElement.children[0].innerHTML }) } }, plot_visibility(element, hidden) { if (!hidden) visible.add([...elements].find(([, item]) => item === element)?.[0]) } })
    vm.runInContext(source('Libraries/Array_Math.js'), context)
    const names = ['Temperature', 'Board_Voltage', 'power_flags', 'performance_load', 'performance_mem', 'performance_time', 'stack_mem', 'stack_pct', 'log_dropped', 'log_buffer', 'log_stats', 'clock_drift']
    vm.runInContext(`let ${names.map(name => `${name} = {}`).join(',')}; let plot, name; const max_num_ins = 5; const US2S = 1/1000000;`, context)
    vm.runInContext(declaration('TimeUS_to_seconds') + declaration('plot_data_rate'), context)
    const reset = legacy.slice(legacy.indexOf('    // Temperature plot', legacy.indexOf('function reset()')), legacy.indexOf('\n}\n', legacy.indexOf('function reset()')))
    vm.runInContext(reset.replaceAll('let plot =', 'plot ='), context)
    const sections = [
        legacy.slice(legacy.indexOf('    const have_HEAT'), legacy.indexOf('    // Add download link for missions')),
        legacy.slice(legacy.indexOf('    // Logging dropped packets'), legacy.indexOf('    const end = performance.now()', legacy.indexOf('async function load_log'))),
    ]
    vm.runInContext(sections.join('\n'), context)
    return { context, rates, elements, visible }
}

const time = [1e6, 2e6, 3e6]
const messages = {
    HEAT: message({ TimeUS: time, Targ: [45, 45, 45], Temp: [30, 31, 32] }),
    POWR: message({ TimeUS: time, VServo: [NaN, NaN, NaN], Vcc: [5, 5.1, 5.2], MTemp: [28, 29, 30], MVolt: [3.3, 3.2, 3.1], MVmax: [3.4, 3.3, 3.2], MVmin: [3.2, 3.1, 3], Flags: [1, 3, 31], AccFlags: [0, 32, 32] }),
    MCU: message({ TimeUS: time, MTemp: [35, 36, 37], MVolt: [3, 3.1, 3.2], MVmax: [3.2, 3.3, 3.4], MVmin: [2.8, 2.9, 3] }),
    PM: message({ TimeUS: time, Load: [5, 501, 999], Mem: [100, 50, 10], MaxT: [2500, 0, 1234], LR: [400, 399, 401] }),
    DSF: message({ TimeUS: time, Dp: [0, 1, 1], FMx: [100, 100, 100], FAv: [50, 40, 30], FMn: [20, 10, 0] }),
}
const instances = {
    IMU: { 0: message({ TimeUS: time, T: [31, 32, 33] }), 2: message({ TimeUS: time, T: [32, 33, 34] }) },
    STAK: { 0: message({ TimeUS: time, Name: ['low', 'low', 'low'], Pri: [1, 1, 1], Total: [100, 100, 100], Free: [50, 40, 30] }), 1: message({ TimeUS: time, Name: ['high', 'high', 'high'], Pri: [9, 9, 9], Total: [200, 200, 200], Free: [100, 50, 0] }) },
    GPS: { 0: message({ TimeUS: time, Status: [2, 3, 3], GWk: [2200, 2200, 2200], GMS: [1000, 2000, 3000] }), 2: message({ TimeUS: time, Status: [3, 3, 3], GWk: [2200, 2200, 2200], GMS: [1000, 2000, 9999] }) },
}

test('temperature, power, performance, stack, logging and drift exactly match actual-base arithmetic and layouts', () => {
    for (const variant of [messages, Object.fromEntries(Object.entries(messages).filter(([key]) => key !== 'MCU')), { PM: message({ TimeUS: time, Load: [0, 1, 2], Mem: [1, 2, 3], MaxT: [1, 2, 3] }) }]) {
        const log = logFixture(variant, instances), expected = oracle(log, {})
        const actual = buildLogPlots(log, {})
        assert.deepEqual(actual.map(plot => plot.id).sort(), [...expected.visible].sort())
        for (const plot of actual) {
            assert.deepEqual(plot.data, normalize(vm.runInContext(`${plot.id}.data`, expected.context)), plot.id)
            assert.deepEqual(plot.layout, normalize(vm.runInContext(`${plot.id}.layout`, expected.context)), `${plot.id} layout`)
        }
    }
})

test('UART title precedence, baud aliases and CAN rates match actual-base output including singular time steps', () => {
    const uart = Object.fromEntries([0, 1, 21, 41, 51, 100, 7].map(instance => [instance, message({ TimeUS: time, Rx: [1, 2, 3], Tx: [4, 5, 6] })]))
    const cans = { 0: message({ TimeUS: [1e6, 1e6, 2e6], T: [10, 12, 1], R: [20, 22, 3] }), 1: message({ TimeUS: time, T: [1, 2, 3], R: [2, 4, 6] }) }
    for (const baud of [0, 1, 111, 115, 2000, 2001, 88]) {
        const params = { SERIAL0_PROTOCOL: 2, SERIAL0_BAUD: baud, SERIAL1_PROTOCOL: 50, NET_P1_PROTOCOL: 99, NET_P1_TYPE: 4, NET_P1_IP0: 127, NET_P1_IP1: 0, NET_P1_IP2: 0, NET_P1_IP3: 1, NET_P1_PORT: 14550, CAN_D1_UC_S1_PRO: 1, CAN_D1_UC_S1_NOD: 42, CAN_D1_UC_S1_IDX: 0, CAN_D2_UC_S1_PRO: 5, CAN_D2_UC_S1_BD: 57, CAN_P1_DRIVER: 1, CAN_P1_BITRATE: 1000000, CAN_P2_DRIVER: 2, CAN_P2_FDBITRATE: 5, CAN_D2_UC_OPTION: 4 }
        const log = logFixture({}, { UART: uart, CANS: cans }), expected = oracle(log, params)
        assert.deepEqual(dataRatePlots(log, params).map(({ title, data, layout }) => ({ title, data, layout })), normalize(expected.rates))
    }
})


test('power visibility honors accumulated-change flags and all-NaN voltages; invalid GPS fixes produce no drift', () => {
    for (const flags of [{ Flg: [1, 1, 1], AccFlg: [0, 0, 0] }, { Flags: [1, 3, 1] }, {}]) {
        const power = message({ TimeUS: time, VServo: [NaN, NaN, NaN], Vcc: [NaN, NaN, NaN], ...flags })
        const log = logFixture({ POWR: power }, { GPS: { 0: message({ TimeUS: time, Status: [2, 3, 3], GWk: [2200, 999, 2200], GMS: [1000, 2000, 0] }) } })
        const expected = oracle(log, {}), actual = buildLogPlots(log, {})
        assert.deepEqual(actual.map(plot => plot.id).sort(), [...expected.visible].sort())
        for (const plot of actual) assert.deepEqual(plot.data, normalize(vm.runInContext(`${plot.id}.data`, expected.context)))
    }
})

test('checked-in independent binary recordings match actual-base plot values and layouts exactly', async () => {
    const { readFile } = await import('node:fs/promises')
    const { createHash } = await import('node:crypto')
    globalThis.self = { addEventListener() {} }
    const { loadDataflashParser } = await import('../../../packages/dataflash/dist/index.js')
    const Parser = await loadDataflashParser()
    for (const [filename, checksum] of [
        ['pymavlink-test.BIN', 'a51f040b2ad7f55185c1da5705f226f51469b86562c4ff76d05c99e0e52c2bf4'],
        ['plane-4.6.2-prefix.BIN', 'd7634bc98b3112d92b4b79f83c15d929dcb1ae16111655e0494d623bbba45a53'],
    ]) {
        const bytes = await readFile(new URL(`../../../packages/dataflash/fixtures/${filename}`, import.meta.url))
        assert.equal(createHash('sha256').update(bytes).digest('hex'), checksum)
        const log = new Parser()
        log.processData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), [])
        const parameters = log.get('PARM'), params = {}
        for (const [i, name] of parameters.Name.entries()) params[name] = parameters.Value[i]
        if (filename === 'pymavlink-test.BIN') {
            // This old format lacks PM.Load. Preserve the base's rejection rather
            // than inventing a CPU load or silently omitting a report field.
            assert.throws(() => oracle(log, params), /Cannot read properties of undefined/)
            assert.throws(() => buildLogPlots(log, params), /Missing numeric log field Load/)
            continue
        }
        const expected = oracle(log, params), actual = buildLogPlots(log, params)
        for (const plot of actual.filter(plot => !plot.id.startsWith('UART_') && !plot.id.startsWith('CANS_'))) {
            assert.deepEqual(plot.data, normalize(vm.runInContext(`${plot.id}.data`, expected.context)), `${filename} ${plot.id}`)
            assert.deepEqual(plot.layout, normalize(vm.runInContext(`${plot.id}.layout`, expected.context)), `${filename} ${plot.id} layout`)
        }
        assert.deepEqual(dataRatePlots(log, params).map(({ title, data, layout }) => ({ title, data, layout })), normalize(expected.rates))
    }
})
