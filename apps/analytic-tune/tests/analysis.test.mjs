import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import * as numerics from '@webtools/numerics'
import * as analysis from '../src/analysis.ts'

const comparison = 'bbbd72a'
const legacy = execFileSync('git', ['show', `${comparison}:AnalyticTune/AnalyticTune.js`], { encoding: 'utf8' })

/** Build deterministic parser-shaped SID fixtures with distinct axis signals. */
function fixture(ang = false, plane = false) {
  const time = Float64Array.from({ length: 96 }, (_, i) => 1e6 + i * 10000)
  const messages = { PARM: { Name: ['SCHED_LOOP_RATE', 'INS_GYRO_RATE', 'FSTRATE_ENABLE', 'FSTRATE_DIV', 'ATC_RAT_RLL_P', 'ATC_RAT_RLL_P'], Value: new Float64Array([400, 2, 1, 4, .1, .2]) }, MSG: { Message: [plane ? 'ArduPlane 4.6.2' : 'ArduCopter 4.6.2'] }, SIDS: { Ax: new Float64Array([plane ? 20 : 1]), TR: new Float64Array([0.2]), TimeUS: new Float64Array([1e6]) }, SIDD: { TimeUS: time }, SIDP: { TimeUS: time }, RATE: { TimeUS: time }, [ang ? 'ANG' : 'ATT']: { TimeUS: time } }
  for (const [message, fields] of Object.entries({ SIDD: ['Targ', 'Gx', 'Gy', 'Gz'], SIDP: ['Aile', 'Elev', 'Rudd', 'rdes', 'pdes', 'DRll', 'Rll', 'DPit', 'Pit', 'aspd', 'eastas'], RATE: ['ROut', 'POut', 'YOut', 'RDes', 'PDes', 'YDes', 'R', 'P', 'Y'], [ang ? 'ANG' : 'ATT']: ['DesRoll', 'Roll', 'DesPitch', 'Pitch', 'DesYaw', 'Yaw'] })) {
    fields.forEach((field, fieldIndex) => { messages[message][field] = Float64Array.from(time, (_, i) => Math.sin(i * .18 + fieldIndex) * (fieldIndex + 1) + fieldIndex) })
  }
  return { messageTypes: Object.fromEntries(Object.keys(messages).map(name => [name, {}])), get(name, field) { return field === undefined ? messages[name] : messages[name]?.[field] }, messages }
}

/** Evaluate only unchanged legacy history functions with shared numeric helpers. */
function legacyHistory(log, start, end, axis, fw, ang) {
  const context = vm.createContext({ ...numerics, log, use_ANG_message: ang, aspeed: 1, eas2tas: 1 })
  const nearest = legacy.slice(legacy.indexOf('function nearestIndex('), legacy.indexOf('// Change the visibility of the PID elements'))
  const histories = legacy.slice(legacy.indexOf('function load_vtol_time_history_data('), legacy.indexOf('function calculate_freq_resp_from_FFT('))
  vm.runInContext(`${nearest}\n${histories}`, context)
  const result = context[fw ? 'load_fw_time_history_data' : 'load_vtol_time_history_data'](start, end, axis)
  return { data: result[0], sampleRate: result[1], airspeed: context.aspeed, eas2tas: context.eas2tas }
}

for (const vehicle of ['ArduCopter', 'ArduPlane_VTOL', 'ArduPlane_FW']) {
  for (const axis of ['Roll', 'Pitch', 'Yaw']) {
    for (const ang of [false, true]) {
      test(`${comparison}: ${vehicle} ${axis} ${ang ? 'ANG' : 'ATT'} selected histories`, () => {
        const log = fixture(ang, vehicle === 'ArduPlane_FW')
        for (const [start, end] of [[1, 1.9], [1.135, 1.715], [1.5, 1.52]]) {
          const expected = legacyHistory(log, start, end, axis, vehicle === 'ArduPlane_FW', ang)
          const actual = analysis.loadTimeHistory(log, start, end, axis, vehicle)
          assert.equal(JSON.stringify(actual), JSON.stringify(expected))
        }
      })
    }
  }
}

test('SID gaps, duration caps, last parameter values, fast loop and vehicle choice', () => {
  const log = fixture(false, true)
  log.messages.SIDD.TimeUS = new Float64Array([1e6, 1.1e6, 1.2e6, 1.3e6, 1.4e6, 1.5e6, 1.6e6, 1.7e6, 1.8e6, 1.9e6, 2e6, 2.1e6, 2.2e6, 2.3e6, 4e6, 4.1e6])
  log.messages.SIDS.Ax = new Float64Array([20, 24])
  log.messages.SIDS.TR = new Float64Array([.2, 5])
  const state = analysis.inspectLog(log)
  assert.deepEqual(state.sidSets, [{ axis: 20, start: 1, end: 2.2, duration: .2 }, { axis: 24, start: 4, end: 4.1, duration: 5 }])
  assert.equal(state.parameters.ATC_RAT_RLL_P, .2)
  assert.equal(state.parameters.GyroSampleRate, 4000)
  assert.equal(state.parameters.SCHED_LOOP_RATE, 1000)
  assert.equal(state.vehicle, 'ArduPlane_FW')
  assert.equal(analysis.axisForSid(24), 'Pitch')
  assert.equal(analysis.axisForSid(999, 'Yaw'), 'Yaw')
})

test('missing messages and wrong field storage fail at the typed boundary', () => {
  const log = fixture()
  delete log.messages.PARM
  assert.throws(() => analysis.inspectLog(log), /No params/)
  log.messages.SIDD.Gx = ['invalid']
  assert.throws(() => analysis.numericField(log, 'SIDD', 'Gx'), /Missing numeric field/)
})

for (const vehicle of ['ArduCopter', 'ArduPlane_VTOL', 'ArduPlane_FW']) {
  test(`real DataFlash binary fixture: ${vehicle} file to selected histories`, async () => {
    const { createLogFixture } = await import('./fixtures.cjs')
    globalThis.self = { addEventListener() {} }
    const { loadDataflashParser } = await import('@webtools/dataflash')
    const Parser = await loadDataflashParser()
    const bytes = createLogFixture({ vehicle })
    const log = new Parser()
    log.processData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), [])
    const state = analysis.inspectLog(log)
    assert.equal(state.vehicle, vehicle)
    assert.equal(state.sidSets.length, 2)
    for (const set of state.sidSets) {
      const axis = analysis.axisForSid(set.axis)
      const actual = analysis.loadTimeHistory(log, set.start, set.end, axis, vehicle)
      const expected = legacyHistory(log, set.start, set.end, axis, vehicle === 'ArduPlane_FW', false)
      assert.equal(JSON.stringify(actual), JSON.stringify(expected))
      assert.ok(actual.data.PilotInput.length >= 1024)
    }
  })
}
