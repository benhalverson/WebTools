import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { loadDataflashParser, get_version_and_board, get_base_log_message_types } from '../dist/index.js'

globalThis.self = { addEventListener() {} }
const upstreamURL = new URL('../../../modules/JsDataflashParser/parser.js', import.meta.url)
const { default: Legacy } = await import(upstreamURL.href)
const Parser = await loadDataflashParser()
const legacyHelpers = vm.createContext({})
vm.runInContext(await readFile(new URL('../../../Libraries/LogHelpers.js', import.meta.url), 'utf8'), legacyHelpers)
const serialize = value => JSON.stringify(value, (_key, v) => ArrayBuffer.isView(v) ? Array.from(v) : v)
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

function snapshot(Constructor, bytes) {
  const log = new Constructor()
  const result = log.processData(buffer(bytes), [])
  const fields = {}
  for (const [name, type] of Object.entries(log.messageTypes)) {
    if (name.includes('[')) continue
    const instances = type.instances ? Object.keys(type.instances) : [null]
    for (const instance of instances) {
      const key = `${name}:${instance}`
      fields[key] = { all: log.get_instance(name, instance), individual: {} }
      for (const field of type.expressions) fields[key].individual[field] = log.get_instance(name, instance, field)
    }
  }
  return { result, fields, start: log.extractStartTime(), stats: log.stats(), metadata: get_version_and_board(log), base: get_base_log_message_types(log) }
}

test('build retains exact upstream bytes and its license', async () => {
  assert.equal(createHash('sha256').update(await readFile(upstreamURL)).digest('hex'),
    'f746b7382ba659e41594857998b9a5134bc8ad8495495bb43cc9a939db4493bd')
  assert.deepEqual(await readFile(new URL('../dist/vendor/parser.js', import.meta.url)), await readFile(upstreamURL))
  assert.deepEqual(await readFile(new URL('../dist/vendor/LICENSE', import.meta.url)), await readFile(new URL('../../../modules/JsDataflashParser/LICENSE', import.meta.url)))
})

for (const name of ['pymavlink-test.BIN', 'plane-4.6.2-prefix.BIN']) {
  const bytes = await readFile(new URL(`../fixtures/${name}`, import.meta.url))
  test(`${name}: provenance checksum`, () => {
    assert.equal(createHash('sha256').update(bytes).digest('hex'), name === 'pymavlink-test.BIN'
      ? 'a51f040b2ad7f55185c1da5705f226f51469b86562c4ff76d05c99e0e52c2bf4'
      : 'd7634bc98b3112d92b4b79f83c15d929dcb1ae16111655e0494d623bbba45a53')
  })
  test(`${name}: all recorded messages, instances, fields and metadata match legacy exactly`, () => {
    const actual = snapshot(Parser, bytes)
    assert.equal(serialize(actual), serialize(snapshot(Legacy, bytes)))
    assert.ok(Object.keys(actual.fields).length > 10)
    if (name === 'pymavlink-test.BIN') {
      assert.equal(actual.fields['GPS:null'].individual.TimeUS[0], 81855471)
      assert.equal(actual.start.toISOString(), '2017-10-29T01:47:09.863Z')
    } else {
      assert.ok(actual.fields['GPS:0'].individual.TimeUS.length > 0)
      assert.ok(actual.result.types.GPS.instances['0'])
      assert.deepEqual(Object.keys(actual.result.types.BAT.instances), ['0', '3'])
      assert.equal(actual.metadata.fw_string, 'ArduPlane V4.6.2 (1ebd4d99)')
    }
    const log = new Parser(); log.processData(buffer(bytes), [])
    assert.equal(serialize(get_version_and_board(log)), serialize(legacyHelpers.get_version_and_board(log)))
    assert.equal(serialize(get_base_log_message_types(log)), serialize(legacyHelpers.get_base_log_message_types(log)))
    assert.equal(log.get('DOES_NOT_EXIST'), undefined)
    assert.equal(log.get_instance('GPS', name === 'pymavlink-test.BIN' ? null : 0, 'DOES_NOT_EXIST'), undefined)
    assert.equal(log.get_instance('GPS', 9999), undefined)
  })
  test(`${name}: default loading and explicit lazy loading match legacy`, () => {
    const actual = new Parser(); const expected = new Legacy()
    assert.deepEqual(actual.messageTypes, {})
    assert.equal(serialize(actual.processData(buffer(bytes))), serialize(expected.processData(buffer(bytes))))
    actual.loadType('PARM'); expected.loadType('PARM')
    assert.equal(serialize(actual.messages), serialize(expected.messages))
  })
  for (const [label, input] of [
    ['empty', bytes.subarray(0, 0)], ['truncated header', bytes.subarray(0, 2)],
    ['truncated FMT', bytes.subarray(0, 40)], ['truncated tail', bytes.subarray(0, bytes.length - 19)],
    ['garbage prefix', Buffer.concat([Buffer.from([0, 255, 12, 34]), bytes])],
    ['malformed bytes', Buffer.from([0xa3, 0x95, 0xff, 0x11, 0x00, 0xa3, 0x95, 0x80])],
  ]) test(`${name}: ${label} preserves upstream results or exceptions`, () => {
    const outcome = C => { try { return { value: serialize(snapshot(C, input)) } } catch (error) { return { error: error.name, message: error.message } } }
    assert.deepEqual(outcome(Parser), outcome(Legacy))
  })
}

for (const version of [
  { FWS: ['ArduPlane V4.6.2'], GH: new Float64Array([0x1ebd4d99]), APJ: new Float64Array([0]), BU: new Float64Array([3]), FV: new Float64Array([7]) },
  { FWS: ['OEM firmware'], GH: new Float64Array([5]), APJ: new Float64Array([1046]), BU: new Float64Array([2]), Maj: new Float64Array([4]), Min: new Float64Array([5]), Pat: new Float64Array([1]) },
  { FWS: ['OEM firmware'], BU: new Float64Array([99]) },
]) test(`owned VER helper preserves legacy: ${version.FWS[0]} / ${version.BU[0]}`, () => {
  const log = { messageTypes: { VER: {} }, get: () => version }
  assert.equal(serialize(get_version_and_board(log)), serialize(legacyHelpers.get_version_and_board(log)))
})

test('uninitialized statistics preserve undefined count and NaN sizes', () => {
  const actual = new Parser().stats()
  assert.deepEqual(actual, new Legacy().stats())
  assert.equal(actual.FMT.count, undefined)
  assert.ok(Number.isNaN(actual.FMT.msg_size))
  assert.ok(Number.isNaN(actual.FMT.size))
})

test('empty field names return whole messages, including instance reads', async () => {
  for (const [name, instance] of [['pymavlink-test.BIN', null], ['plane-4.6.2-prefix.BIN', 0]]) {
    const bytes = await readFile(new URL(`../fixtures/${name}`, import.meta.url))
    const actual = new Parser(); const expected = new Legacy()
    actual.processData(buffer(bytes), []); expected.processData(buffer(bytes), [])
    assert.equal(serialize(actual.get_instance('GPS', instance, '')), serialize(expected.get_instance('GPS', instance, '')))
    assert.equal(serialize(actual.get_instance('GPS', instance, '')), serialize(actual.get_instance('GPS', instance)))
    if (instance === null) {
      assert.equal(serialize(actual.get('GPS', '')), serialize(expected.get('GPS', '')))
      assert.equal(serialize(actual.get('GPS', '')), serialize(actual.get('GPS')))
    }
  }
})
