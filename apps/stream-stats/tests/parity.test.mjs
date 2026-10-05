import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { binaryDataset, telemetryDataset, rates, binCount, totalCount } from '../src/model.ts'
import { parseTlog } from '../src/tlog.ts'
import { plotData, timeSelection } from '../src/plots.ts'
import { legacy, original } from './legacy.mjs'
import { arrayBuffer, tlogFixture } from './fixtures.mjs'
import { mavlink_msgs, MAV_COMPONENT } from '../src/mavlink.ts'
import vm from 'node:vm'
globalThis.self = { addEventListener() {} }
const { default: Parser } = await import('../../../modules/JsDataflashParser/parser.js')
/** Normalize cross-realm prototypes only; every serialized number must match exactly. */
const serialize = value => JSON.stringify(value, (_key, item) => item instanceof Set ? [...item] : item)

test('MAVLink names, CRC values and component names match the immutable base', () => {
    const context = vm.createContext({}); vm.runInContext(original('StreamStats/mavlink_msgs.js'), context)
    assert.equal(JSON.stringify(Object.entries(mavlink_msgs)), vm.runInContext('JSON.stringify(Object.entries(mavlink_msgs))', context))
    assert.equal(JSON.stringify(Object.entries(MAV_COMPONENT)), vm.runInContext('JSON.stringify(Object.entries(MAV_COMPONENT))', context))
})
for (const name of ['pymavlink-test.BIN', 'plane-4.6.2-prefix.BIN', 'fixed.tlog']) test(`${name}: exact serialized counts, bytes, rates and selections`, async () => {
    const binary = name.endsWith('.BIN')
    const bytes = arrayBuffer(binary ? await readFile(new URL(`../../../packages/dataflash/fixtures/${name}`, import.meta.url)) : await tlogFixture())
    const reference = legacy(Parser); reference.load(bytes, binary)
    let dataset
    if (binary) { const log = new Parser(); log.processData(bytes, []); dataset = binaryDataset(log, bytes.byteLength) }
    else { const systems = parseTlog(bytes); assert.equal(serialize(systems), reference.systems()); dataset = telemetryDataset(systems, bytes.byteLength); assert.equal(dataset.series.length, 6); assert.equal(systems['42']['1'].signed, 1); assert.deepEqual([...systems['42']['1'].version], [2, 1]); assert.equal(systems['42']['1'].received, 8) }
    for (const width of [0.1, 1, 3.25, 10, 60]) for (const bits of [false, true]) for (const excluded of [[], ['42,1,HEARTBEAT'], ['42,1']]) {
        const actual = plotData(rates(dataset, width, bits, new Set(excluded)), bits, binary)
        assert.deepEqual(JSON.parse(JSON.stringify(actual)), reference.snapshot(width, bits, excluded), `${width}, ${bits}, ${excluded}`)
    }
})
test('tlog resynchronization, truncated packets and backward time preserve behavior', async () => {
    const fixture = await tlogFixture()
    for (const bytes of [Buffer.alloc(0), fixture.subarray(0, 12), fixture.subarray(0, fixture.length - 1), Buffer.concat([Buffer.from([3, 5]), fixture]), Buffer.from(fixture).fill(0, 18, 19)]) {
        const reference = legacy(Parser); reference.load(arrayBuffer(bytes), false)
        assert.equal(serialize(parseTlog(arrayBuffer(bytes))), reference.systems())
    }
    const bytes = Buffer.from(fixture); bytes.writeBigUInt64BE(0n, 8 + 21)
    assert.throws(() => parseTlog(arrayBuffer(bytes)))
})
test('sparse totals preserve floor boundaries and exact selected time ranges', () => {
    const total = { count: [], low_bin: Infinity, high_bin: -Infinity }
    assert.deepEqual(binCount([0, 0.999, 1, 3], [8, 16, 32, 64], 1, total), { time: [0.5, 1.5, 2.5, 3.5], count: [24, 32, 0, 64] })
    assert.deepEqual(totalCount(total, 1), { time: [0.5, 1.5, 2.5, 3.5], count: [24, 32, 0, 64] })
    assert.deepEqual(timeSelection({ 'xaxis.range[0]': 1, 'xaxis.range[1]': 3 }), [1, 3])
    assert.equal(timeSelection({ 'xaxis.autorange': true }), undefined)
    assert.equal(timeSelection({ unrelated: true }), null)
})
