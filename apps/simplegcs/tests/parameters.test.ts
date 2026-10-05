import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { MAVParam } from '@webtools/parameters'
import fixture from '../../../tests/fixtures/params.json' with { type: 'json' }

const base = 'e230da9'
const context = vm.createContext({ console, Uint8Array, DataView, TextEncoder, TextDecoder, Map, Set })
vm.runInContext(execFileSync('git', ['show', `${base}:modules/MAVLink/mavparam.js`], { encoding: 'utf8' }), context)
const legacy = context.MAVParam as typeof MAVParam

test('actual branch-base legacy and shared model retain exact bytes and numerical representations', async () => {
    const bytes = Uint8Array.from(Buffer.from(fixture.hex, 'hex'))
    for (const P of [legacy, MAVParam]) {
        let uploaded: Uint8Array | null = null
        const model = new P({ ftp: {
            /** Return independent fixture snapshots so neither implementation can mutate its oracle. */
            getFile(_path, callback) { callback(bytes.slice()) },
            /** Capture wire bytes and acknowledge close while deliberately rejecting readback. */
            putFile(_path, data, callback) { uploaded = data; callback(data.length) },
        } })
        await model.refresh()
        assert.equal(model.params.get('TEST_I32')?.value, 16777217)
        await assert.rejects(model.apply(new Map([['TEST_I32', 16777219]])), /did not retain/)
        assert.equal(Buffer.from(uploaded!).toString('hex'), fixture.uploadHex)
    }
    const params = MAVParam.decode(bytes)
    assert.equal(MAVParam.saveText(params.values()), legacy.saveText(legacy.decode(bytes).values()))
    for (const text of ['TEST_I32 2147483647\n', '1 1 TEST_I32 -2147483648 6\r\n', 'TEST_FLOAT,0.1', 'TEST_I8=7']) {
        assert.deepEqual([...MAVParam.parseText(text)], [...legacy.parseText(text)])
    }
    // Both paths round to IEEE float32 before serialization; require exact agreement, no tolerance.
    for (const value of [0.1, 1 / 3, 1e-45, -0]) assert.equal(MAVParam.valueForType(value, 4), legacy.valueForType(value, 4))
})
