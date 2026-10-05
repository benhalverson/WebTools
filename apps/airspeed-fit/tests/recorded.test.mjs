import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { legacyFlight, serialized, original } from './legacy.mjs'
const require = createRequire(import.meta.url)
globalThis.mlMatrix = require('../../../modules/build/matrix/matrix.umd.js')
globalThis.self = { addEventListener() {} }
const { loadDataflashParser } = await import('../../../packages/dataflash/dist/index.js')
const Parser = await loadDataflashParser()
const { readFlight, analyze, parameterOutput, build_combined, temperatureDiagnostics } = await import('../src/model.ts')
const { sensor_series } = await import('../src/plots.ts')
const bytes = await readFile(new URL('./fixtures/plane-nominal.BIN', import.meta.url))
/** Isolate the exact visible Buffer slice before handing bytes to either parser. */
const arrayBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
/** Each comparison receives a fresh pinned parser with discovery-only loading. */
function parse(bytes) {
    const p = new Parser()
    p.processData(arrayBuffer(bytes), [])
    return readFlight(p)
}
const flight = parse(bytes)
test('recorded fixture provenance and retained vendor/legacy bytes', async () => {
    assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        'f47a69da94678fe72d3f5d0631a75188f28457a98a23effed6da7cb8040f2053',
    )
    for (const path of [
        'AirspeedFit/airspeedfit_core.js',
        'AirspeedFit/airspeedfit.js',
        'modules/build/matrix/matrix.umd.js',
    ])
        assert.equal(await readFile(new URL('../../../' + path, import.meta.url), 'utf8'), original(path))
    assert.deepEqual(flight.window, [47, 52])
    assert.equal(flight.sensors[0].time.length, 50)
    assert.equal(flight.sources.length, 4)
})
for (const source of [0, 1, 2, 3])
    for (const scenario of [
        { start: 47, end: 52, temperature: 11, q: 10 ** -1.5 },
        { start: 48, end: 51, temperature: 25, q: 0.001 },
        { start: 49, end: 50, temperature: -5, q: 1 },
    ])
        test(`recorded flight source=${source} ${JSON.stringify(scenario)} exact model and export parity`, async () => {
            const options = { ...scenario, source, sensors: [0] }
            const actual = analyze(flight, options)
            const { context: c, element } = await legacyFlight(Parser, arrayBuffer(bytes))
            c.log_data.sources.forEach((s, i) => (s.select.checked = i === source))
            element('TimeStart').value = String(options.start)
            element('TimeEnd').value = String(options.end)
            element('ground_temp').value = String(options.temperature)
            element('q_slider').value = String(Math.log10(options.q))
            c.calculate()
            assert.equal(
                serialized(actual.combined),
                serialized(c.combined),
                'aligned samples, units and selected range',
            )
            assert.equal(serialized(actual.seeds), serialized(c.ASP_Data.map((d) => d.seed)), 'constant-wind seeds')
            assert.equal(
                serialized(actual.fit),
                serialized(c.fit_result),
                'ratios, trajectory, covariance, residuals and calibration RMS',
            )
            assert.equal(
                serialized(sensor_series(actual, 0)),
                serialized(c.sensor_series(0)),
                'before/after plot diagnostics',
            )
            c.save_parameters()
            assert.equal(parameterOutput(actual).text, await c.saved.text(), 'exact .param bytes')
            assert.ok(Number.isFinite(temperatureDiagnostics(flight, options).percent))
        })
test('auto window, initial ISA fit and range endpoint quirks match unchanged page', async () => {
    const { context: c, element } = await legacyFlight(Parser, arrayBuffer(bytes))
    assert.deepEqual(flight.window, [+element('TimeStart').value, +element('TimeEnd').value])
    assert.equal(serialized(flight.temp_sources), serialized(c.log_data.temp_sources))
    for (const [start, end] of [
        [47.1, 51.2],
        [100, 120],
        [-100, -50],
        [51, 48],
    ]) {
        element('TimeStart').value = String(start)
        element('TimeEnd').value = String(end)
        assert.equal(
            serialized(build_combined(flight.sensors, flight.sources[0], 11, flight, start, end)),
            serialized(c.build_combined(c.ASP_Data, c.log_data.sources[0], 11)),
        )
    }
})
test('recorded unsupported and malformed logs fail without a mocked fit', async () => {
    for (const path of ['pymavlink-test.BIN', 'plane-4.6.2-prefix.BIN']) {
        const recorded = await readFile(new URL('../../../packages/dataflash/fixtures/' + path, import.meta.url))
        assert.throws(() => parse(recorded), /No airspeed/)
        await assert.rejects(legacyFlight(Parser, arrayBuffer(recorded)), /No airspeed/)
    }
    for (const bad of [Buffer.alloc(0), bytes.subarray(0, 24)]) assert.throws(() => parse(bad), /No airspeed/)
    assert.throws(
        () => analyze(flight, { start: 47, end: 52, temperature: NaN, source: 0, sensors: [0], q: 0.1 }),
        /temperature/,
    )
    assert.throws(
        () => analyze(flight, { start: 47, end: 52, temperature: 15, source: 0, sensors: [], q: 0.1 }),
        /sensor selected/,
    )
})

test('recorded-derived asynchronous second sensor preserves interpolation, filtering and subset fits', async () => {
    const second = {
        ...flight.sensors[0],
        instance: 1,
        ratio_name: 'ARSPD2_RATIO',
        time: flight.sensors[0].time.map((t) => t + 0.025),
        dpress: flight.sensors[0].dpress.map((v, i) => (i === 10 ? -1 : v * 1.3)),
        current_ratio: 2.1,
    }
    const two = { ...flight, sensors: [flight.sensors[0], second] }
    for (const selected of [[0, 1], [1]]) {
        const options = { start: 47, end: 52, temperature: 15, q: 0.1, source: 0, sensors: selected }
        const actual = analyze(two, options)
        const { context: c, element } = await legacyFlight(Parser, arrayBuffer(bytes))
        c.ASP_Data = [c.ASP_Data[0], { ...second }].filter((s) => selected.includes(s.instance))
        element('ground_temp').value = '15'
        element('q_slider').value = '-1'
        c.calculate()
        assert.equal(serialized(actual.combined), serialized(c.combined))
        assert.equal(serialized(actual.fit), serialized(c.fit_result))
        c.save_parameters()
        assert.equal(parameterOutput(actual).text, await c.saved.text())
    }
})
test('recorded sentinel ratio and RMS remain independently pinned', () => {
    const result = analyze(flight, { start: 47, end: 52, temperature: 15, q: 10 ** -1.5, source: 0, sensors: [0] })
    assert.equal(result.fit.per_sensor[0].ratio, 1.9360313607721085)
    assert.equal(result.fit.per_sensor[0].residual_rms, 0.13748184476330594)
    assert.equal(parameterOutput(result).text, 'ARSPD_RATIO,1.936\n')
})
