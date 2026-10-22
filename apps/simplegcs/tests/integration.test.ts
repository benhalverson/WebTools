import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFTPManager, type TransferClient } from '@webtools/transfers'
import { MAVLink20Processor } from '@webtools/mavlink'
import { emptyOperations } from '../src/operations.ts'
import { connectedParameters } from '../src/parameters/connected-session.ts'

/** Capture starts/completions while exercising the actual serialized manager and parameter model. */
function harness() {
    const starts: string[] = []
    let done: ((value: null) => void) | undefined
    const client: TransferClient = {
        targetSystem: 0, targetComponent: 0,
        /** Hold a download completion until explicit cancellation. */
        getFile(path, callback) { starts.push(path); done = callback },
        /** Hold an upload completion while recording shared queue order. */
        putFile(path, _bytes, callback) { starts.push(path); done = callback },
        /** Complete exactly the active request with cancellation. */
        cancel() { const callback = done; done = undefined; callback?.(null) },
        /** This queue-only fixture never accepts protocol replies. */
        handleMessage() { return false },
    }
    const manager = createFTPManager(() => client)
    manager.setLink(new MAVLink20Processor(), { send() {} }, 1, 1)
    const session = connectedParameters(manager, 11)
    session.model.params = new Map([
        ['TEST_I8', { name: 'TEST_I8', value: 1, type: 1, defaultValue: 0 }],
    ])
    return { starts, manager, session, client }
}
test('parameter cancellation preserves queued command work and prevents cancelled upload readback', async () => {
    const h = harness()
    try {
        const apply = h.session.model.apply(new Map([['TEST_I8', 2]]))
        h.manager.getFile('@MISSION/mission.dat', () => {}, { tag: 'mission' })
        assert.deepEqual(h.starts, ['@PARAM/param.pck'])
        h.session.cancel()
        await assert.rejects(apply, /cancelled/)
        assert.deepEqual(h.starts, ['@PARAM/param.pck', '@MISSION/mission.dat'])
        assert.equal(h.session.model.busy, false)
        assert.equal(h.session.model.connected, true)
        assert.equal(h.session.model.params.size, 0, 'cancelled writes may have applied a prefix; require refresh')
    } finally { h.session.dispose(); h.manager.clearLink() }
})
test('queued parameter cancellation leaves active mission intact and releases model lock', async () => {
    const h = harness()
    try {
        h.manager.getFile('@MISSION/fence.dat', () => {}, { tag: 'fence' })
        const refresh = h.session.model.refresh()
        h.session.cancel()
        await assert.rejects(refresh, /cancelled/)
        assert.deepEqual(h.starts, ['@MISSION/fence.dat'])
        assert.equal(h.manager.isBusy(), true)
        assert.equal(h.manager.queuedCount(), 0)
        assert.equal(h.session.model.params.size, 1)
    } finally { h.session.dispose(); h.manager.clearLink() }
})
test('parameter and command jobs share FIFO ownership, including tagged uploads', () => {
    const h = harness()
    try {
        h.manager.getFile('@MISSION/fence.dat', () => {}, { tag: 'fence' })
        h.manager.putFile('@PARAM/param.pck', new Uint8Array(), () => {}, { tag: 'parameters' })
        h.manager.getFile('@MISSION/mission.dat', () => {}, { tag: 'mission' })
        h.manager.cancelByTag('parameters')
        h.client.cancel()
        assert.deepEqual(h.starts, ['@MISSION/fence.dat', '@MISSION/mission.dat'])
        assert.equal(h.session.vehicle, 'Rover')
    } finally { h.session.dispose(); h.manager.clearLink() }
})

test('actual connection and operations share packed download/upload/readback with mission traffic', async () => {
    const { Connection } = await import('../src/connection.ts')
    const { Operations, emptyOperations } = await import('../src/operations.ts')
    const { simulatedSocket } = await import('../src/simulator.ts')
    const connection = new Connection(simulatedSocket, () => {})
    let state = emptyOperations()
    const operations = new Operations(connection, { autoFetchFence: true, autoFetchMission: true }, next => { state = next }, () => {})
    try {
        connection.connect({ url: 'ws://local-test', systemId: 255, componentId: 190, passphrase: '', sendHeartbeat: false })
        await eventual(() => state.parameterSession !== null)
        const session = state.parameterSession!
        await session.model.refresh()
        await session.model.apply(new Map([['TEST_I8', 7]]))
        assert.equal(session.model.params.get('TEST_I8')?.value, 7)
        await eventual(() => state.mission.length === 3 && state.fence.length === 1)
        connection.disconnect()
        assert.equal(session.model.connected, false)
        assert.deepEqual(state, emptyOperations())
    } finally { operations.dispose(); connection.dispose() }
})
/** Await bounded asynchronous local peer deliveries without masking retained resources. */
async function eventual(check: () => boolean): Promise<void> {
    for (let tries = 0; tries < 100; tries++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
    assert.ok(check())
}

/** Intercept actual encoded peer replies while preserving the connection's callback generations. */
async function wireHarness() {
    const { Connection } = await import('../src/connection.ts')
    const { Operations, emptyOperations } = await import('../src/operations.ts')
    const { SimulatedSocket } = await import('../src/simulator.ts')
    const { MAVLink20Processor } = await import('@webtools/mavlink')
    const incoming = new MAVLink20Processor(), outgoing = new MAVLink20Processor()
    const requests: import('@webtools/mavlink').Message[] = [], held: Array<() => void> = []
    let hold = -1, peer: InstanceType<typeof SimulatedSocket>
    const connection = new Connection(() => {
        peer = new SimulatedSocket()
        const nativeSend = peer.send.bind(peer)
        /** Record complete requests before sending them to the real local FTP peer. */
        peer.send = bytes => { requests.push(outgoing.decode(Array.from(bytes))); nativeSend(bytes) }
        return peer
    }, () => {})
    let state = emptyOperations()
    const operations = new Operations(connection, { autoFetchFence: false, autoFetchMission: false }, next => { state = next }, () => {})
    connection.connect({ url: 'ws://local-test', systemId: 255, componentId: 190, passphrase: '', sendHeartbeat: false })
    const deliver = peer!.onmessage!
    /** Capture selected responses with the old connection callback for stale delivery checks. */
    peer!.onmessage = event => {
        const message = incoming.decode(Array.from(new Uint8Array(event.data)))
        if (message._name === 'FILE_TRANSFER_PROTOCOL' && message.payload.charCodeAt(5) === hold) held.push(() => deliver(event))
        else deliver(event)
    }
    await eventual(() => state.parameterSession !== null)
    return { connection, operations, requests, held, state: () => state,
        /** Select the wire response opcode to retain for interruption tests. */
        hold(opcode: number) { hold = opcode },
        /** Dispose the actual owners and all peer timers after a scenario. */
        dispose() { operations.dispose(); connection.dispose() },
    }
}
test('disconnect during parameters never starts a queued command; stale native callback cannot revive state', async () => {
    const h = await wireHarness()
    try {
        h.hold(4)
        const session = h.state().parameterSession!, refresh = session.model.refresh()
        await eventual(() => h.held.length > 0)
        h.operations.fetch('mission')
        const count = h.requests.length
        h.connection.disconnect()
        await assert.rejects(refresh, /disconnected/)
        assert.equal(h.requests.length, count)
        h.held.forEach(deliver => deliver())
        assert.deepEqual(h.state(), emptyOperations())
    } finally { h.dispose() }
})
test('wire upload cancellation after write clears unverified values and rejects stale ACK without cancelling queued mission', async () => {
    const h = await wireHarness()
    try {
        const session = h.state().parameterSession!
        await session.model.refresh(); h.hold(7)
        const apply = session.model.apply(new Map([['TEST_I8', 7]]))
        await eventual(() => h.held.length > 0)
        h.operations.fetch('mission'); session.cancel()
        await assert.rejects(apply, /cancelled/)
        assert.equal(session.model.params.size, 0)
        h.held.forEach(deliver => deliver())
        await eventual(() => h.state().mission.length === 3)
        const opens = h.requests.filter(message => message._name === 'FILE_TRANSFER_PROTOCOL' && message.payload.charCodeAt(3) === 4)
        assert.equal(opens.length, 2, 'initial parameters plus mission; cancelled upload never enqueues readback')
    } finally { h.dispose() }
})
