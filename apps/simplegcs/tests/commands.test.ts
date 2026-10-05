import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { MAVLink20Processor, mavlink20, type MessageBase } from '@webtools/mavlink'
import { CommandAcks } from '../src/commands.ts'
import { Connection, type Socket } from '../src/connection.ts'
import { Operations, emptyOperations } from '../src/operations.ts'
import { Downloads, emptyDownloads } from '../src/downloads.ts'
import { missionPoints } from '../src/mission-points.ts'
import { simulatedFile } from '../src/simulated-files.ts'
import { MissionParser } from '@webtools/transfers'
const base = '2ce2994419c96d5912f952c3cd659d1b6e630aff'
/** Read the reviewed branch base, keeping the parity oracle independent of new implementation. */
function legacy(file: string): string { return execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' }) }
/** In-memory vehicle with explicitly injected replies and captured complete wire bytes. */
class Peer implements Socket {
    readyState = 1; binaryType = ''; onopen: Socket['onopen'] = null; onclose: Socket['onclose'] = null; onerror: Socket['onerror'] = null; onmessage: Socket['onmessage'] = null
    sent: number[][] = []; fail = false
    /** Copy complete packets; deterministic failure occurs before delivery. */
    send(bytes: Uint8Array): void { if (this.fail) throw Error('closed'); this.sent.push(Array.from(bytes)) }
    /** Stop without emitting unsolicited callbacks. */
    close(): void { this.readyState = 3 }
    /** Deliver codec-encoded controlled packets with explicit source identity. */
    receive(message: MessageBase, system = 42, component = 1): void { const bytes = Uint8Array.from(message.pack(new MAVLink20Processor(null, system, component))); this.onmessage?.({ data: bytes.buffer }) }
}
/** Start a selected simulated vehicle without auto downloads obscuring command observations. */
function harness() {
    const peer = new Peer(), connection = new Connection(() => peer, () => {})
    connection.connect({ url: 'ws://test', passphrase: '', systemId: 255, componentId: 190, sendHeartbeat: false }); peer.onopen!()
    let state = emptyOperations(); const reports: string[] = []
    const operations = new Operations(connection, { autoFetchFence: false, autoFetchMission: false }, next => { state = next }, text => reports.push(text))
    peer.receive(new mavlink20.messages.heartbeat(11, 3, 128, 10, 4))
    return { peer, connection, operations, reports, state: () => state, dispose() { operations.dispose(); connection.dispose() } }
}
test('all authoritative ACK assertions run unchanged against the converted queue', async t => {
    const scenarios: Array<[string, (t: TestContext) => void]> = []
    // The legacy fixture constructor is the only adapter; its assertion bodies remain unchanged.
    class Adapted extends CommandAcks {
        /** Adapt the public legacy constructor shape to the typed queue's explicit dependencies. */
        constructor(options: { report: (id: number, result: string) => void; timeoutMs: number }) { super(options.report, options.timeoutMs) }
    }
    const register = (name: string, run: typeof scenarios[number][1]) => { scenarios.push([name, run]) }
    vm.runInNewContext(legacy('tests/commands.test.cjs'), { require(name: string) { return name === 'node:test' ? register : name === 'node:assert/strict' ? assert : Adapted } })
    for (const [name, run] of scenarios) await t.test(name, run)
})
test('complete COMMAND_INT bytes match the unchanged legacy helper, including NaN/default and fractional coordinates', async () => {
    await mavlink20.ready
    const h = harness(), expected: number[][] = [], app = legacy('SimpleGCS/app.js')
    const context = vm.createContext({ mavlink20, MAVLink: new MAVLink20Processor(null, 255, 190), vehSysId: 42, vehCompId: 1, ws: { readyState: 1, send(bytes: Uint8Array) { expected.push(Array.from(bytes)) } }, WebSocket: { OPEN: 1 }, window: { GCSUtils: { toast() {} } }, PendingAcks: { submit(_command: number, send: () => void) { send(); return true } }, mavCmdName: String, Uint8Array })
    vm.runInContext(app.slice(app.indexOf('    function sendCommandInt('), app.indexOf('    function sendSetMode(')), context)
    const vectors = [[400, [1]], [400, [0]], [400, [0, 21196]], [400, [1, 21196]], [176, [1, 11]], [176, [1, 5]], [246, [1]], [207, [0]], [207, [1]], [192, [0, 1, 0, 0, -35.123456789 * 1e7, 149.987654321 * 1e7, 0]], [192, [NaN, -0, Infinity, -1, 0, 0, 0]]] as const
    try {
        for (const [command, params] of vectors) { context.command = command; context.params = params; vm.runInContext('sendCommandInt(command, params)', context); h.operations.command(command, params) }
        assert.deepEqual(h.peer.sent, expected)
    } finally { h.dispose() }
})
test('packet ACK filtering, progress deadlines, independent FIFO sends, denial, failure and disconnect', async t => {
    await mavlink20.ready; t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'] })
    const h = harness(), m = mavlink20.messages
    try {
        h.operations.mode(11, 'RTL'); h.operations.mode(5, 'LOITER'); assert.equal(h.peer.sent.length, 2)
        h.peer.receive(new m.command_ack(176, 2, 0, 0, 255, 190), 99); h.peer.receive(new m.command_ack(176, 2, 0, 0, 255, 190), 42, 2); h.peer.receive(new m.command_ack(176, 2, 0, 0, 0, 0)); assert.equal(h.state().status, 'LOITER sent')
        h.peer.receive(new m.command_ack(176, 0, 0, 0, 255, 190)); h.peer.receive(new m.command_ack(176, 2, 0, 0, 255, 190)); assert.equal(h.state().status, 'CMD DO_SET_MODE: DENIED')
        h.operations.command(400, [1]); t.mock.timers.tick(4000); h.peer.receive(new m.command_ack(400, 5, 50, 0, 255, 190)); t.mock.timers.tick(4000); assert.equal(h.state().status, 'CMD COMPONENT_ARM_DISARM: IN_PROGRESS')
        t.mock.timers.tick(1000); assert.equal(h.state().status, 'CMD COMPONENT_ARM_DISARM: no acknowledgement')
        h.peer.fail = true; assert.equal(h.operations.command(400, [1]), false); assert.equal(h.state().status, 'CMD COMPONENT_ARM_DISARM: not sent'); h.peer.fail = false
        h.operations.command(400, [1]); const late = h.peer.onmessage!; h.connection.disconnect(); const before = h.reports.length; late({ data: Uint8Array.from(new m.command_ack(400, 2, 0, 0, 255, 190).pack(new MAVLink20Processor(null, 42, 1))).buffer }); t.mock.timers.tick(10000); assert.equal(h.reports.length, before)
        assert.deepEqual(h.state(), emptyOperations())
    } finally { h.dispose() }
})
test('mode restrictions, sensor-reported fence state and zero/valid guided targets', async () => {
    await mavlink20.ready; const h = harness(), m = mavlink20.messages
    try {
        h.peer.receive(new m.heartbeat(2, 3, 128, 1, 4)); assert.equal(h.operations.mode(11, 'RTL'), false); assert.match(h.state().status, /boat or rover/)
        h.peer.receive(new m.sys_status(0, 0, 0, 0, 12000, 1, 70, 0, 0, 0, 0, 0, 0)); assert.equal(h.state().fenceEnabled, false)
        h.operations.command(207, [1]); assert.equal(h.state().fenceEnabled, false, 'send does not optimistically enable fence')
        h.peer.receive(new m.position_target_global_int(0, 6, 0, -350000000, 1490000000, 0, 0, 0, 0, 0, 0, 0, 0, 0)); assert.equal(h.state().target?.lat, -35)
        h.peer.receive(new m.position_target_global_int(0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)); assert.equal(h.state().target, null)
    } finally { h.dispose() }
})
test('mission command/frame filtering and sequence labels match legacy map input with exact coordinates', () => {
    const parser = new MissionParser(), items = parser.parseMission(simulatedFile('@MISSION/mission.dat')!)!
    const first = items[0]!
    const vectors = [first, { ...first, command: 42702 }, { ...first, frame: 1 }, { ...first, x: 0, y: 0 }, { ...first, command: 36, seq: 7 }, { ...first, x: 900000001 }, { ...first, x: NaN }, ...items.slice(1)]
    const lines: unknown[] = [], markers: Array<{ seq: string; coords: number[] }> = []
    const context = { window: {}, mavlink20, setTimeout, clearTimeout, L: { polyline(points: unknown) { lines.push(points); return { addTo() { return this } } }, circleMarker(coords: number[]) { return { addTo() { return this }, bindTooltip(seq: string) { markers.push({ seq, coords }) } } } }, State: { map: {}, pathLayer: null, wpLayers: [] }, clearLayers() {}, toast() {}, items: vectors }
    const source = legacy('SimpleGCS/mission.js'); vm.runInNewContext(source.slice(source.indexOf('    const locationCommands'), source.indexOf('    function fetchMission')) + '\nrenderMission(items)', context)
    assert.deepEqual(missionPoints(vectors).map(p => ({ seq: String(p.seq), coords: [p.lat, p.lng] })), JSON.parse(JSON.stringify(markers)))
    assert.equal(lines.length, 1)
})
for (const kind of ['mission', 'fence'] as const) test(`${kind} retry, disabled choices, repeated fetch, empty/malformed data and stale completion cleanup`, t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    let state = emptyDownloads(); const reports: string[] = [], callbacks: Array<(data: Uint8Array | null) => void> = []
    const downloads = new Downloads(next => { state = next }, text => reports.push(text)), options = { autoFetchMission: kind === 'mission', autoFetchFence: kind === 'fence' }
    downloads.manager.getFile = (_path, cb) => { callbacks.push(cb) }
    downloads.configure(options); downloads.start(); downloads.fetch(kind); assert.equal(callbacks.length, 1)
    callbacks[0]!(null); t.mock.timers.tick(4999); assert.equal(callbacks.length, 1); t.mock.timers.tick(1); assert.equal(callbacks.length, 2)
    callbacks[1]!(new Uint8Array([1])); t.mock.timers.tick(5000); assert.equal(callbacks.length, 3)
    callbacks[2]!(simulatedFile(`@MISSION/${kind}.dat`)); assert.ok(state[kind].length); downloads.fetch(kind); const stale = callbacks[3]!
    downloads.reset(); assert.equal(state[kind].length, 0); downloads.start(); stale(simulatedFile(`@MISSION/${kind}.dat`)); assert.equal(state[kind].length, 0)
    callbacks[4]!(null); downloads.configure({ autoFetchFence: false, autoFetchMission: false }); t.mock.timers.tick(10000); assert.equal(callbacks.length, 5)
    downloads.fetch(kind); const empty = simulatedFile(`@MISSION/${kind}.dat`)!.slice(0, 10); new DataView(empty.buffer).setUint16(8, 0, true); callbacks[5]!(empty); assert.equal(state[kind].length, 0); downloads.reset(); t.mock.timers.tick(10000); assert.equal(callbacks.length, 6)
})

test('a captured hold never commands a replacement transport generation, even with reused socket and vehicle identity', async () => {
    await mavlink20.ready; const h = harness()
    try {
        const hold = h.operations.beginReposition()
        h.connection.disconnect(); h.peer.readyState = 1
        h.connection.connect({ url: 'ws://test', passphrase: '', systemId: 255, componentId: 190, sendHeartbeat: false }); h.peer.onopen!()
        h.peer.receive(new mavlink20.messages.heartbeat(11, 3, 128, 10, 4)); hold(-35, 149)
        assert.equal(h.peer.sent.length, 0)
        h.operations.beginReposition()(-35, 149); assert.equal(h.peer.sent.length, 1)
    } finally { h.dispose() }
})
