import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadDataflashParser } from '../../../packages/dataflash/dist/index.js'
import { discover, segmentParameters, splitBatches } from '../src/model.ts'
import { analyze, spectrum, spectrogram, stepResponses, selection } from '../src/analysis.ts'
import { charts } from '../src/plots.ts'
import { fixture } from './fixture.mjs'
import { legacy } from './legacy.mjs'

globalThis.self = { addEventListener() {} }
const Parser = await loadDataflashParser()
/** Copy fixture bytes into an exact independent ArrayBuffer. */
function buffer(bytes) { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
/** Compare exact arithmetic, storage values and non-finite values across VM realms. */
function equal(actual, expected) { assert.deepEqual(structuredClone(actual), structuredClone(expected)) }

for (const vehicle of [1, 2, 3]) for (const dff of [false, true]) test(`vehicle ${vehicle}, DFF ${dff}: discovery, slices, spectra, steps and segments equal unchanged legacy`, async () => {
    const bytes = buffer(fixture({ vehicle, dff })), parser = new Parser(); parser.processData(bytes, [])
    const actual = discover(parser), reference = await legacy(Parser), expected = await reference.load(bytes)
    assert.equal(actual.start, expected.start_time); assert.equal(actual.end, expected.end_time)
    assert.equal(actual.controllers.length, expected.length)
    for (let i = 0; i < actual.controllers.length; i++) {
        const controller = actual.controllers[i], old = expected[i]
        equal(controller.params, old.params.sets)
        assert.equal(controller.id, old.id.join('_')); assert.equal(controller.units, old.units)
        if (!controller.sets.length) { assert.equal(old.have_data, false); continue }
        controller.sets.forEach((set, j) => set?.forEach((batch, k) => {
            const legacyBatch = { ...old.sets[j][k] }; if (legacyBatch.DFF === null) delete legacyBatch.DFF
            equal(batch, legacyBatch)
        }))
        const analysis = analyze(controller, 128)
        equal(analysis.bins, old.sets.FFT.bins); assert.equal(analysis.rate, old.sets.FFT.average_sample_rate)
        analysis.sets.forEach((set, j) => { if (set) { equal(set.time, old.sets[j].FFT.time); for (const key of Object.keys(set.channels)) equal(set.channels[key], old.sets[j].FFT[key]) } })
        for (const scale of ['linear', 'db', 'psd']) for (const [start, end] of [[0, 30], [4.7, 12.3]]) {
            const drawn = reference.draw(i, start, end, scale)
            analysis.sets.forEach((set, j) => { if (set) for (const [k, key] of Object.keys(set.channels).entries()) if (set.channels[key].length) equal(spectrum(analysis, set, key, start, end, scale), drawn.fft_plot.data[j * 9 + k].y) })
            const heat = spectrogram(analysis, 'Out', scale)
            equal(heat.x, drawn.Spectrogram.data[0].x); equal(heat.z, drawn.Spectrogram.data[0].z)
            const steps = stepResponses(controller, analysis, start, end)
            steps.forEach((step, j) => { equal(step.all.x, drawn.step_plot.data[j * 2].x); equal(step.all.y, drawn.step_plot.data[j * 2].y); equal(step.mean.y, drawn.step_plot.data[j * 2 + 1].y ?? []) })
        }
    }
})

test('RATE only, exact size edges, out-of-range selection and invalid windows retain legacy behavior', async () => {
    for (const count of [64, 65, 128, 130, 258]) {
        const bytes = buffer(fixture({ detailed: false, count, changes: false, gap: false })), log = new Parser(); log.processData(bytes, [])
        const reference = await legacy(Parser)
        if (count === 64) { assert.throws(() => discover(log), /No PID/); await assert.rejects(reference.load(bytes), /No PID/); continue }
        const result = discover(log), old = await reference.load(bytes)
        const index = result.controllers.findIndex(controller => controller.sets.length)
        equal(result.controllers[index].sets[0][0], old[index].sets[0][0])
        const fft = analyze(result.controllers[index], 128)
        assert.equal(!!fft, !!old[index].sets.FFT)
        assert.throws(() => analyze(result.controllers[index], 300), /power of two/)
    }
    const reference = await legacy(Parser)
    for (const [start, end] of [[-10, -1], [100, 101], [2, 2], [1, 3], [3, 1]]) {
        reference.element('TimeStart').value = start; reference.element('TimeEnd').value = end
        equal(selection([1, 2, 3], start, end), [reference.context.find_start_index([1, 2, 3]), reference.context.find_end_index([1, 2, 3]) + 1])
    }
})

test('exact timestamp multiplication and one-second coalescing boundaries match legacy segmentation', async () => {
    const bytes = buffer(fixture({ changes: false, gap: false })), log = new Parser(); log.processData(bytes, [])
    const source = log.get('PARM')
    const changes = [6500005, 7500005, 8000005, 8500006]
    source.Name.push(...changes.map(() => 'ATC_RAT_RLL_P'))
    source.TimeUS = Float64Array.from([...source.TimeUS, ...changes])
    source.Value = Float64Array.from([...source.Value, 0.2, 0.3, 0.4, 0.5])
    const pid = log.get('PIDR'); pid.TimeUS = pid.TimeUS.map(time => time + 5)
    // Both discovery paths see identical modified columns from the actual parser.
    const wrapped = { messageTypes: log.messageTypes,
        /** Retain the previously parsed fixture without reparsing modified columns. */
        processData() { return { types: log.messageTypes, messages: log.messages } },
        /** Return modified parameter/PID columns and unchanged remaining messages. */
        get(name, field) { const message = name === 'PARM' ? source : name === 'PIDR' ? pid : log.get(name); return field ? message?.[field] : message },
    }
    /** Supply this pre-parsed fixture to unchanged legacy load without altering its algorithms. */
    class ModifiedParser { /** Return the controlled parser boundary for this comparison. */ constructor() { return wrapped } }
    const reference = await legacy(ModifiedParser), old = await reference.load(bytes)
    const sets = segmentParameters(source, 'ATC_RAT_RLL_')
    equal(sets, old[0].params.sets)
    assert.ok(sets.length >= 3)
    assert.ok(sets.some((set, i) => i && set.start_time > sets[i - 1].end_time), 'nearby updates retain gaps')
    const time = Array.from(pid.TimeUS, value => value * (1 / 1000000))
    equal(splitBatches(sets, time), reference.context.split_into_batches([{ params: { sets } }], 0, time))
    equal(discover(wrapped).controllers[0].sets.map(set => set?.map(batch => batch.time)), old[0].sets.map(set => set?.map(batch => batch.time)))
})

test('authoritative recorded logs retain legacy unsupported/reduced outcomes', async () => {
    for (const name of ['pymavlink-test.BIN', 'plane-4.6.2-prefix.BIN']) {
        const bytes = buffer(await readFile(new URL('../../../packages/dataflash/fixtures/' + name, import.meta.url))), log = new Parser(); log.processData(bytes, [])
        const reference = await legacy(Parser)
        let actualError, legacyError
        try { discover(log) } catch (error) { actualError = error.message }
        try { await reference.load(bytes) } catch (error) { legacyError = error.message }
        assert.equal(actualError, legacyError)
    }
})

test('large continuous batches do not exceed JavaScript argument limits', () => {
    const batch = { time: Array.from({ length: 250000 }, (_, i) => i), Tar: Array.from({ length: 250000 }, () => 1), Act: [], Out: [], sample_rate: 100 }
    const controller = { sets: [[batch]], params: [], units: 'deg /s' }
    const result = charts({ start: 0, end: 250000, flight: [] }, controller, undefined, { start: 0, end: 250000 }, [])
    assert.equal(result.TimeInputs.data[0].x.length, 250000)
})


test('sparse parameter sets reserve all nine FFT trace slots before valid data', () => {
    const log = new Parser(); log.processData(buffer(fixture({ changes: false })), [])
    const data = discover(log), controller = data.controllers[0]
    controller.params.unshift({ ...controller.params[0], end_time: 0.5 }); controller.sets.unshift(undefined)
    const analysis = analyze(controller, 128)
    const result = charts(data, controller, analysis, { start: 0, end: 30, amplitude: 'db', rpm: false, logFrequency: false, channels: ['Tar'], component: 'Out', sets: [false, true] }, [])
    assert.equal(result.FFTPlot.data.length, 18)
    assert.equal(result.FFTPlot.data[0].x.length, 0)
    assert.equal(result.FFTPlot.data[9].x.length, 65)
    assert.equal(result.FFTPlot.data[9].legendgroup, 1)
})
