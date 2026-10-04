import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createMainSimulator } from '../src/main-model.ts'
import { createPlaneSimulator } from '../src/plane-model.ts'
import { mainDefaults, planeDefaults } from '../src/model.ts'
import { controlModule, ruckigModule, legacy, original, root } from './legacy.mjs'

import { scenarios, serialize } from './scenarios.mjs'

test('actual WASM trajectories serialize byte-for-byte like the immutable legacy revision', async () => {
    const control = await controlModule(), ruckig = await ruckigModule()
    for (const plane of [false, true]) {
        const oracle = await legacy(plane, control, ruckig)
        const simulate = plane ? createPlaneSimulator(control) : createMainSimulator(control, ruckig)
        const defaults = plane ? planeDefaults : mainDefaults
        const cases = [...scenarios, ...(!plane ? [
            ['yaw combined', 'Y', 'angle+rate', { desired_vel: '12', desired_pos: '20' }],
            ['rate time constant', 'Y', 'rate', { desired_vel: '60', PILOT_Y_RATE_TC: '0.2' }],
        ] : [['plane angle gain', 'P', 'angle', { PTCH_ANGLE_P: '4', PTCH2SRV_RMAX_UP: '15', PTCH2SRV_RMAX_DN: '40' }]])]
        for (const [name, axis, mode, overrides] of cases) {
            const values = { ...defaults, ...overrides }
            const expected = JSON.stringify(await oracle.run(values, axis, mode))
            assert.equal(serialize(simulate(values, axis, mode)), expected, `${plane ? 'plane' : 'main'}: ${name}`)
        }
    }
})

test('invalid Ruckig input preserves legacy failure and later calculations recover', async () => {
    const control = await controlModule(), ruckig = await ruckigModule()
    const oracle = await legacy(false, control, ruckig), simulate = createMainSimulator(control, ruckig)
    const invalid = { ...mainDefaults, ATC_ACC_R_MAX: '0' }
    await assert.rejects(oracle.run(invalid, 'R', 'angle'))
    assert.throws(() => simulate(invalid, 'R', 'angle'))
    assert.equal(serialize(simulate(mainDefaults, 'R', 'angle')), JSON.stringify(await oracle.run(mainDefaults, 'R', 'angle')))
})

test('staged vendor and metadata sources remain byte-identical to the comparison revision', async () => {
    const manifest = JSON.parse(await readFile(new URL('../runtime-assets.json', import.meta.url)))
    for (const source of Object.values(manifest).filter(path => path.startsWith('KinematicTool/'))) {
        assert.deepEqual(await readFile(root + source), original(source), source)
    }
})

test('actual Embind allocations are released across repeated and failed calculations', async () => {
    const control = await controlModule(), native = await ruckigModule()
    const live = new Set()
    let failSample = false, allocated = 0
    /** Observe every actual native handle while leaving the ABI and calculations unchanged. */
    function owned(handle) {
        live.add(handle); allocated++
        return new Proxy(handle, {
            /** Track allocating sample getters and exact-handle deletion, including exceptions. */
            get(target, key) {
                if (key === 'delete') return () => { assert.ok(live.delete(target), 'each native handle deleted once'); target.delete() }
                const value = Reflect.get(target, key, target)
                if (['position', 'velocity', 'acceleration', 'jerk'].includes(key)) return owned(value)
                if (key === 'at_time') return time => owned(value.call(target, time))
                if (key === 'get' && failSample) return () => { throw new Error('injected sample read failure') }
                return typeof value === 'function' ? value.bind(target) : value
            },
        })
    }
    const observed = { ...native }
    for (const name of ['Vector', 'InputParameter', 'Trajectory', 'Ruckig']) {
        observed[name] = new Proxy(native[name], { construct(target, args) { return owned(Reflect.construct(target, args)) } })
    }
    const simulate = createMainSimulator(control, observed)
    for (let i = 0; i < 100; i++) { simulate(mainDefaults, 'R', 'angle'); assert.equal(live.size, 0) }
    failSample = true
    assert.throws(() => simulate(mainDefaults, 'R', 'angle'), /injected sample read failure/)
    assert.equal(live.size, 0, 'sample-read exception releases partially consumed trajectory')
    failSample = false
    assert.throws(() => simulate({ ...mainDefaults, ATC_ACC_R_MAX: '0' }, 'R', 'angle'))
    assert.equal(live.size, 0, 'invalid native calculation releases all constructed resources')
    simulate(mainDefaults, 'R', 'angle'); assert.equal(live.size, 0)
    assert.ok(allocated > 10000, 'real trajectory sampling exercised allocating native getters')
})

test('controlled defaults and HTML bounds match both original public pages', () => {
    for (const plane of [false, true]) {
        const html = original(`KinematicTool/${plane ? 'plane/' : ''}index.html`).toString()
        const fields = [...html.matchAll(/<input[^>]+>/g)].map(match => match[0]).filter(tag => tag.includes('type="number"'))
        const defaults = Object.fromEntries(fields.map(tag => [tag.match(/id="([^"]+)"/)[1], tag.match(/value="([^"]+)"/)[1]]))
        assert.deepEqual(plane ? planeDefaults : mainDefaults, defaults)
        const end = fields.find(tag => tag.includes('id="end_time"'))
        assert.match(end, /min="0\.1"/); assert.match(end, /step="0\.1"/); assert.match(end, /max="10"/)
    }
})
