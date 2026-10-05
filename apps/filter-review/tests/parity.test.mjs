import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadDataflashParser } from '../../../packages/dataflash/dist/index.js'
import { ingest } from '../src/ingestion.ts'
import { calculate, displayed, selectedWindows } from '../src/spectrum.ts'
import { fixture } from './fixtures.mjs'
import { oracle, serialize } from './oracle.mjs'

globalThis.self = { addEventListener() {} }
const Parser = await loadDataflashParser()
/** Parse a fresh local fixture through the standalone DataFlash boundary. */
export function parse(bytes) {
    const log = new Parser()
    log.processData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), [])
    return log
}
for (const kind of ['raw', 'batch', 'both']) for (const source of kind === 'both' ? ['raw', 'batch'] : [kind]) {
    test(kind + '/' + source + ': exact samples, FFTs, range selection and plotted bytes match unchanged base', () => {
        const log = parse(fixture(kind))
        const actual = ingest(log, source)
        const settings = { size: 256, perBatch: 1 }
        const legacy = oracle(log, source, settings)
        assert.equal(actual.sensors.length, 2)
        assert.equal(actual.start, legacy.batches.start_time)
        assert.equal(actual.end, legacy.batches.end_time)
        for (const sensor of actual.sensors) {
            assert.equal(serialize(sensor.batches), serialize(Array.from(legacy.batches[sensor.instance])))
            const spectrum = calculate(sensor, source, settings, () => {})
            const expected = legacy.spectrum(sensor.instance)
            assert.equal(serialize(spectrum), serialize(expected))
            assert.ok(spectrum.time.length > 0)
            for (const [start, end] of [[0, 10], [1.5, 2.1], [-2, -1], [20, 30], [2, 2]]) {
                assert.equal(serialize(selectedWindows(spectrum.time, start, end)), serialize(legacy.selection(expected.time, start, end)))
                for (const scale of ['linear', 'db', 'psd']) assert.equal(serialize(displayed(spectrum, start, end, scale)), serialize(legacy.display(sensor.instance, expected, start, end, scale)))
            }
        }
    })
}
test('invalid FFT size fails and oversized windows preserve empty spectra', () => {
    const recording = ingest(parse(fixture('raw')), 'raw')
    assert.throws(() => calculate(recording.sensors[0], 'raw', { size: 300, perBatch: 1 }, () => {}), /power of two/)
    assert.equal(calculate(recording.sensors[0], 'raw', { size: 8192, perBatch: 1 }, () => {}).time.length, 0)
})
test('empty and malformed log errors remain recoverable', () => {
    assert.throws(() => ingest(parse(Buffer.alloc(0)), 'raw'))
    assert.throws(() => ingest(parse(Buffer.from([1, 2, 3, 4])), 'batch'))
})

for (const source of ['raw', 'batch']) for (const options of [0, 1, 2, 4, 6, 8, 12]) test(source + ' option metadata ' + options, () => {
    const log = parse(fixture(source, options))
    const actual = ingest(log, source), legacy = oracle(log, source, {size: 256, perBatch: 1})
    for (const sensor of actual.sensors) {
        assert.equal(sensor.sensor, legacy.batches[sensor.instance].sensor_num)
        assert.equal(sensor.postFilter, legacy.batches[sensor.instance].post_filter)
    }
})
for (const throttle of [[0, 1, 1, 1, 1, 1, 0], [1, 1, 0], [0, 0, 0], [0, 1, 0]]) test('throttle selection ' + throttle, () => {
    const log = parse(fixture('both', 0, throttle))
    const actual = ingest(log, 'raw'), legacy = oracle(log, 'raw', {size: 256, perBatch: 1})
    assert.equal(serialize(actual.initialRange), serialize(legacy.initialRange()))
})
test('fractional FFT controls retain parseInt behavior', () => {
    for (const source of ['raw', 'batch']) {
        const log = parse(fixture(source)), settings = {size: 256.9, perBatch: 1.9}
        const actual = ingest(log, source), legacy = oracle(log, source, settings)
        assert.equal(serialize(calculate(actual.sensors[0], source, settings, () => {})), serialize(legacy.spectrum(0)))
    }
})

test('scientific notation retains legacy parseInt input semantics', () => {
    const log = parse(fixture('raw')), settings = {size: '1.024e3', perBatch: '1'}
    const actual = ingest(log, 'raw'), legacy = oracle(log, 'raw', settings)
    assert.throws(() => legacy.spectrum(0))
    assert.throws(() => calculate(actual.sensors[0], 'raw', settings, () => {}))
})
