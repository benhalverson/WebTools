import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { legacyCore, serialized } from './legacy.mjs'
const require = createRequire(import.meta.url)
globalThis.mlMatrix = require('../../../modules/build/matrix/matrix.umd.js')
const core = await import('../src/core.ts')
const legacy = legacyCore()
for (const n of [4, 31, 501])
    for (const q of [0.001, 10 ** -1.5, 1])
        test(`exact forward/backward and two-sensor fit: n=${n} q=${q}`, () => {
            const t = Array.from({ length: n }, (_, i) => i * 0.1)
            const vn = t.map((x) => 23 * Math.cos(x * 0.2) + 3),
                ve = t.map((x) => 23 * Math.sin(x * 0.2) - 2),
                vd = t.map((x) => Math.sin(x * 0.7))
            const u = t.map(
                (x, i) => Math.hypot(vn[i] - 3, ve[i] + 2, vd[i]) / Math.sqrt(1.85) + 0.03 * Math.sin(x * 3),
            )
            const us = [u, u.map((v, i) => v * 0.88 + 0.02 * Math.cos(i))]
            const actualSeeds = us.map((u) => core.calibrate(vn, ve, vd, u)),
                expectedSeeds = us.map((u) => legacy.calibrate(vn, ve, vd, u))
            assert.equal(serialized(actualSeeds), serialized(expectedSeeds))
            const result = core.calibrate_combined(t, vn, ve, vd, us, actualSeeds, { q_wind: q })
            assert.equal(
                serialized(result),
                serialized(legacy.calibrate_combined(t, vn, ve, vd, us, expectedSeeds, { q_wind: q })),
            )
            assert.ok(result.per_sensor.every((sensor) => Number.isFinite(sensor.ratio)))
        })
test('physics, heuristic, singular geometry and short-data outcomes retain legacy semantics', () => {
    for (const h of [-400, 0, 100, 4000])
        for (const temp of [-20, 15, 40]) {
            for (const fn of ['air_temperature_c', 'eas2tas']) assert.equal(core[fn](temp, h), legacy[fn](temp, h))
            assert.equal(core.isa_temperature_at_alt_c(h), legacy.isa_temperature_at_alt_c(h))
        }
    for (const values of [
        [0, 2, 8, 6, 0],
        [-2, -1, 0, 0, 0],
    ]) {
        const args = [[0, 1, 2, 3, 4], values, 0, 4]
        try {
            assert.equal(serialized(core.auto_window(...args)), serialized(legacy.auto_window(...args)))
        } catch (error) {
            assert.throws(() => legacy.auto_window(...args), { message: error.message })
        }
    }
    assert.throws(() => core.calibrate([1], [2], [3], [4]), /need at least 4 samples/)
    const constant = Array(40).fill(20),
        zeros = Array(40).fill(0)
    assert.equal(
        serialized(core.calibrate(constant, zeros, zeros, constant)),
        serialized(legacy.calibrate(constant, zeros, zeros, constant)),
    )
})

test('zero alternating rounds retains the legacy error rather than synthesizing a fit', () => {
    const t = [0, 1, 2, 3],
        vn = [10, 0, -10, 0],
        ve = [0, 10, 0, -10],
        vd = [0, 0, 0, 0],
        u = [7, 7, 7, 7]
    const seeds = [core.calibrate(vn, ve, vd, u)]
    assert.throws(() => core.calibrate_combined(t, vn, ve, vd, [u], seeds, { max_outer: 0 }), TypeError)
    assert.throws(() => legacy.calibrate_combined(t, vn, ve, vd, [u], seeds, { max_outer: 0 }), { name: 'TypeError' })
})
