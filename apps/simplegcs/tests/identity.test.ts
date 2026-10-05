import assert from 'node:assert/strict'
import test from 'node:test'
import { ComponentIdentity } from '../src/identity.ts'

test('disposing before a native grant arrives releases the stale lease and settles its request', { timeout: 1000 }, async () => {
    let deliver!: (lock: Lock | null) => void
    const grant = new Promise<Lock | null>(resolve => { deliver = resolve })
    let nativeRequest: Promise<unknown> | undefined
    /** Defer callback delivery while retaining native request settlement semantics. */
    function request(name: string, options: LockOptions, callback: LockGrantedCallback<unknown>): Promise<unknown> {
        assert.equal(name, 'simplegcs.component.190')
        assert.deepEqual(options, { ifAvailable: true })
        nativeRequest = grant.then(callback)
        return nativeRequest
    }
    const locks: LockManager = { request: request as LockManager['request'], query: async () => ({ held: [], pending: [] }) }
    const identity = new ComponentIdentity(locks)
    const claim = identity.claim(190)
    identity.dispose()
    deliver({ name: 'simplegcs.component.190', mode: 'exclusive' })
    assert.equal(await claim, null)
    // A retained lease leaves this promise unresolved and fails the bounded test.
    await nativeRequest
})
