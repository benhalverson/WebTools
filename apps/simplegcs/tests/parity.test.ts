import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { MAVLink20Processor, mavlink20, type MessageBase, type Message } from '@webtools/mavlink'
import { emptyTelemetry, receiveTelemetry, speedText } from '../src/telemetry.ts'
import { gridSpacing, metersPerPixel } from '../src/grid-math.ts'
import { readDraft, readDisplay, submitDraft } from '../src/settings.ts'
import { Connection, type Socket } from '../src/connection.ts'
const require = createRequire(import.meta.url)
const legacyCodec = require('../../../modules/MAVLink/mavlink.js')
const base = '8e1791a'
/** Retrieve the actual integration baseline, not a copy of the migrated implementation. */
function legacy(file: string): string { return execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' }) }
/** Run the original telemetry handler with side-effect boundaries stubbed, preserving its calculations. */
function oracle() {
    const app = legacy('SimpleGCS/app.js'), util = legacy('SimpleGCS/util.js')
    const context = vm.createContext({ Date, console, mavlink20: legacyCodec.mavlink20, window: {}, setTimeout, document: {}, telemetry: { batteryPct: null, currentA: null, speed: null, armed: null, modeName: '—', numSats: null }, vehSysId: -1, vehCompId: -1, lastRxMs: 0, reconnectAttempts: 0, mapVehicleIdentity: null, lastConnectionSettings: { url: 'ws://test' }, VehicleType: {}, MAVLink: {}, ws: {}, parameterClient: null, FTPManager: { setLink() {} }, MAVParam: Object.assign(class {}, { vehicleName() {} }), parameterUI: { setClient() {} }, Fence: { onConnected() {}, setEnabled() {} }, Mission: { onConnected() {} }, updateTelemetryDisplay() {}, setTelemetryStatus() {}, MapManager: { map: {}, lastHeadingDeg: null, updateVehiclePosition(lat: number, lon: number) { context.position = [lat, lon] }, updateVehicleHeading(yaw: number) { context.heading = (yaw * 180 / Math.PI + 360) % 360 } } })
    vm.runInContext(util.slice(util.indexOf('function classifyVehicle'), util.indexOf('// Google Maps async loader')) + '\nwindow.GCSUtils = {classifyVehicle, roverModeNames};', context)
    vm.runInContext(app.slice(app.indexOf('    function processMessage(m)'), app.indexOf('    // --- Button Event Handlers ---')), context)
    return context
}
/** Pack then decode so fixture messages have the real runtime's complete typed fields. */
function decode(message: MessageBase, processor = new MAVLink20Processor(null, 42, 1)): Message { return processor.decode(message.pack(processor)) }
test('selected vehicle, telemetry, numerical units and sentinels match unchanged legacy', async () => {
    await mavlink20.ready; await legacyCodec.mavlink20.ready
    const context = oracle(), m = mavlink20.messages
    let state = emptyTelemetry()
    const scenarios = [new m.heartbeat(11, 3, 137, 10, 4), new m.global_position_int(1000, -350012345, 1490012345, 500000, 0, 321, -456, 0, 9000), new m.attitude(0, 0, 0, -0.123, 0, 0, 0), new m.battery_status(0, 0, 0, 0, Array(10).fill(1), 1234, 0, 0, 19), new m.gps_raw_int([0, 0], 3, 0, 0, 0, 0, 0, 0, 0, 255), new m.battery_status(0, 0, 0, 0, Array(10).fill(1), -1, 0, 0, -1), new m.heartbeat(11, 3, 0, 1234, 4)]
    for (const outgoing of scenarios) {
        const message = decode(outgoing); context.message = message; vm.runInContext('processMessage(message)', context)
        state = receiveTelemetry(state, message, 'ws://test')!
        for (const key of ['batteryPct', 'currentA', 'speed', 'armed', 'modeName', 'numSats'] as const) assert.equal(state[key], context.telemetry[key], key)
        if (state.position) assert.deepEqual(state.position, Array.from(context.position))
        if (state.heading !== null) assert.equal(state.heading, context.heading)
    }
    assert.equal(receiveTelemetry(state, decode(new m.heartbeat(11, 3, 128, 1, 4), new MAVLink20Processor(null, 99, 1)), 'ws://test'), null)
    assert.equal(speedText(state.speed), `${(context.telemetry.speed * 1.94384449).toFixed(1)} knots`)
})
test('connection IDs retain parseInt defaults and reject fragments', () => {
    const draft = { url: ' ws://test ', systemId: '12.7', componentId: '0', passphrase: '', sendHeartbeat: false }
    assert.deepEqual(submitDraft(draft), { ...draft, url: 'ws://test', systemId: 12, componentId: 190 })
    assert.throws(() => submitDraft({ ...draft, url: 'ws://test#' }), /fragment/)
})
/** In-memory controllable peer that records byte-exact outbound heartbeats. */
class Peer implements Socket {
    readyState = 1; binaryType = ''; onopen: Socket['onopen'] = null; onclose: Socket['onclose'] = null; onerror: Socket['onerror'] = null; onmessage: Socket['onmessage'] = null; sent: number[][] = []; closed = 0
    /** Capture bytes before a transport could mutate the caller's buffer. */
    send(bytes: Uint8Array): void { this.sent.push(Array.from(bytes)) }
    /** Record controller cleanup without initiating an asynchronous handshake. */
    close(): void { this.closed++; this.readyState = 3 }
}
test('signed heartbeat bytes, stale/disconnect/retry timers and cleanup match legacy contracts', async t => {
    await mavlink20.ready; await legacyCodec.mavlink20.ready
    const now = Date.UTC(2026, 0, 1); t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now })
    const peers: Peer[] = [], settings = { url: 'ws://test', passphrase: 'test-signing', systemId: 255, componentId: 190, sendHeartbeat: true }
    const connection = new Connection(() => { const peer = new Peer(); peers.push(peer); return peer }, () => {})
    connection.connect(settings); peers[0]!.onopen!(); t.mock.timers.tick(1000)
    const processor = new legacyCodec.MAVLink20Processor(); processor.srcSystem = 255; processor.srcComponent = 190
    processor.signing.timestamp = Math.floor((now - Date.UTC(2015, 0, 1)) * 100); processor.signing.secret_key = legacyCodec.mavlink20.sha256(new TextEncoder().encode(settings.passphrase)); processor.signing.sign_outgoing = true
    assert.deepEqual(peers[0]!.sent[0], new legacyCodec.mavlink20.messages.heartbeat(6, 8, 0, 0, 4).pack(processor))
    t.mock.timers.tick(15000); assert.equal(peers[0]!.closed, 1); assert.equal(connection.snapshot().phase, 'error')
    t.mock.timers.tick(2000); assert.equal(peers.length, 2)
    peers[1]!.onopen!(); connection.disconnect(); t.mock.timers.tick(60000); assert.equal(peers.length, 2); assert.equal(peers[1]!.closed, 1)
    connection.dispose(); assert.equal(connection.connect(settings), false)
})
test('disabled heartbeat and constructor failure leave no retry loop', async t => {
    await mavlink20.ready; t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'] })
    const peer = new Peer(); let count = 0
    const connection = new Connection(() => { count++; if (count > 1) throw new Error('blocked'); return peer }, () => {})
    const settings = { url: 'ws://test', passphrase: '', systemId: 255, componentId: 190, sendHeartbeat: false }
    connection.connect(settings); peer.onopen!(); t.mock.timers.tick(2000); assert.equal(peer.sent.length, 0)
    connection.connect(settings); t.mock.timers.tick(60000); assert.equal(count, 2); assert.match(connection.snapshot().error, /blocked/); connection.dispose()
})

/** Minimal in-memory Storage for legacy key and configuration precedence checks. */
function storage(values: Record<string, string> = {}): Storage {
    const map = new Map(Object.entries(values))
    return { get length() { return map.size }, clear() { map.clear() }, getItem(key) { return map.get(key) ?? null }, key(index) { return [...map.keys()][index] ?? null }, removeItem(key) { map.delete(key) }, setItem(key, value) { map.set(key, value) } }
}
test('deployment fallbacks and stored settings retain legacy precedence', () => {
    const pair = { local: storage(), session: storage() }, config = { defaultUrl: 'ws://configured', defaultSystemId: 254, defaultComponentId: 189, googleKey: 'configured-key' }
    assert.deepEqual(readDraft(pair, config), { url: 'ws://configured', systemId: '254', componentId: '189', passphrase: '', sendHeartbeat: true })
    pair.local.setItem('gcs.url', 'ws://saved'); pair.local.setItem('gcs.systemId', '253'); pair.session.setItem('gcs.componentId', '188')
    assert.equal(readDraft(pair, config).url, 'ws://saved'); assert.equal(readDraft(pair, config).componentId, '188')
    pair.local.setItem('gcs.tiles.provider', 'google'); assert.equal(readDisplay(pair.local, config).googleKey, 'configured-key')
})
test('metric grid projection and spacing exactly match the baseline across latitude and zoom', () => {
    const grid = legacy('SimpleGCS/grid.js'), start = grid.indexOf('    function metersPerPixel'), end = grid.indexOf('    function draw')
    const context = vm.createContext({ State: { opts: { targetPx: 150 } } }); vm.runInContext(grid.slice(start, end), context)
    for (const lat of [-80, -35, 0, 35, 80]) for (const zoom of [2, 8, 12, 16, 20]) {
        const expected = context.metersPerPixel(lat, zoom); assert.equal(metersPerPixel(lat, zoom), expected)
        assert.equal(gridSpacing(expected, lat), context.pickSpacingMeters(expected, lat))
    }
})

test('signing replay windows survive reconnect to the same endpoint and key', async t => {
    await mavlink20.ready; const now = Date.UTC(2026, 0, 1)
    t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now })
    const peers: Peer[] = [], settings = { url: 'ws://test', passphrase: 'signing-context', systemId: 255, componentId: 190, sendHeartbeat: false }
    const connection = new Connection(() => { const peer = new Peer(); peers.push(peer); return peer }, () => {})
    const vehicle = new MAVLink20Processor(null, 42, 1)
    vehicle.signing.secret_key = mavlink20.sha256(new TextEncoder().encode(settings.passphrase)); vehicle.signing.sign_outgoing = true
    vehicle.signing.timestamp = Math.floor((now - Date.UTC(2015, 0, 1)) * 100)
    const heartbeat = new mavlink20.messages.heartbeat(11, 3, 128, 10, 4), bytes = Uint8Array.from(heartbeat.pack(vehicle))
    connection.connect(settings); peers[0]!.onopen!(); peers[0]!.onmessage!({ data: bytes.buffer }); assert.equal(connection.snapshot().status, 'Live')
    connection.connect(settings); peers[1]!.onopen!(); peers[1]!.onmessage!({ data: bytes.buffer }); assert.equal(connection.snapshot().status, 'Waiting for vehicle')
    const fresh = Uint8Array.from(heartbeat.pack(vehicle)); peers[1]!.onmessage!({ data: fresh.buffer }); assert.equal(connection.snapshot().status, 'Live')
    connection.dispose()
})
