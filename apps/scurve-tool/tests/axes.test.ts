import assert from 'node:assert/strict'
import test from 'node:test'
import { linkedAxes } from '../src/axes.ts'

test('time zoom links peers while vertical zoom remains local', () => {
    const vertical = linkedAxes({}, 'vel', { 'yaxis.range[0]': 1, 'yaxis.range[1]': 5 })
    assert.equal(vertical.pos, undefined)
    const state = linkedAxes(vertical, 'pos', { 'xaxis.range[0]': 10, 'xaxis.range[1]': 20 })
    for (const name of ['pos', 'vel', 'accel', 'jerk', 'snap'] as const) assert.deepEqual(state[name]?.xaxis, { range: [10, 20], autorange: false })
    assert.deepEqual(state.vel?.yaxis, { range: [1, 5], autorange: false })
})

test('a y-only reset resets both peer axes but preserves source time zoom', () => {
    const zoomed = linkedAxes({}, 'pos', { 'xaxis.range[0]': 10, 'xaxis.range[1]': 20 })
    const state = linkedAxes(zoomed, 'pos', { 'yaxis.autorange': true })
    assert.deepEqual(state.pos, { xaxis: { range: [10, 20], autorange: false }, yaxis: { autorange: true } })
    for (const name of ['vel', 'accel', 'jerk', 'snap'] as const) assert.deepEqual(state[name], { xaxis: { autorange: true }, yaxis: { autorange: true } })
    assert.equal(linkedAxes(state, 'pos', { autosize: true }), state)
})
