const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const { start, stop, inject } = require('./browser.cjs');
const { cdnFixtures, legacyServer } = require('./legacy.cjs');
const root = path.resolve(__dirname, '../../..');
/** Construct independent protocol fixtures including skipped commands/frames and original labels. */
function files() {
    const records = [
        [16, 6, 0, -350000000, 1490000000], [42702, 0, 1, 1, 2],
        [16, 1, 2, -350000000, 1490000000], [36, 6, 7, -349995000, 1490005000], [16, 0, 12, -349990000, 1490010000],
    ];
    /** Encode the fixed 10-byte header and 38-byte records without application helpers. */
    function encode(items, type) {
        const bytes = new Uint8Array(10 + 38 * items.length), view = new DataView(bytes.buffer);
        view.setUint16(0, 0x763d, true); view.setUint16(2, type, true); view.setUint16(8, items.length, true);
        items.forEach(([command, frame, seq, x, y, radius = 0], i) => {
            const offset = 10 + 38 * i;
            view.setFloat32(offset, radius, true); view.setInt32(offset + 16, x, true); view.setInt32(offset + 20, y, true);
            view.setUint16(offset + 28, seq, true); view.setUint16(offset + 30, command, true); bytes[offset + 34] = frame; bytes[offset + 36] = 1; bytes[offset + 37] = type;
        });
        return Array.from(bytes);
    }
    return { '@MISSION/mission.dat': encode(records, 0), '@MISSION/fence.dat': encode([[5003, 6, 0, -350000000, 1490000000, 150], [5004, 6, 1, -349990000, 1490010000, 30], [5001, 6, 2, -350000000, 1490000000, 3], [5001, 6, 3, -349990000, 1490000000, 3], [5001, 6, 4, -349990000, 1490010000, 3]], 1) };
}
/** Add controlled command/FTP responses to the existing in-memory socket fixture. */
function control(files) {
    const state = window.fixture;
    state.files = files; state.sessions = new Map(); state.commandReplies = []; state.requests = []; state.requestTimeline = []; state.responseTimers = new Set();
    /** Deliver a complete vehicle packet, preserving the source codec sequence. */
    state.receive = (peer, message) => {
        const bytes = Uint8Array.from(message.pack(peer.rx)); peer.rx.seq = (peer.rx.seq + 1) % 256; peer.onmessage?.({ data: bytes.buffer });
    };
    /** Capture callbacks so stale delivery can be tested after reconnect/disconnect. */
    state.reply = (peer, message, callback = peer.onmessage) => {
        const timer = setTimeout(() => { state.responseTimers.delete(timer); const bytes = Uint8Array.from(message.pack(peer.rx)); peer.rx.seq = (peer.rx.seq + 1) % 256; callback?.({ data: bytes.buffer }); }, 10);
        state.responseTimers.add(timer);
    };
    /** Reply using independently encoded FTP payloads; failure/hold switches exercise retries. */
    state.answer = (peer, request, callback = peer.onmessage) => {
        const payload = Uint8Array.from(request.payload, character => character.charCodeAt(0)), input = new DataView(payload.buffer), opcode = payload[3], session = payload[2], offset = input.getUint32(8, true);
        let body = [], ok = !state.failFTP;
        if (opcode === 4) {
            const filename = new TextDecoder().decode(payload.slice(12, 12 + payload[4])); state.sessions.set(session, filename);
            const file = state.files[filename]; if (file) { const size = new Uint8Array(4); new DataView(size.buffer).setUint32(0, file.length, true); body = Array.from(size); } else ok = false;
        } else if (opcode === 15 || opcode === 5) body = state.files[state.sessions.get(session)]?.slice(offset, offset + 239) ?? [];
        if (!ok) body = [1];
        const output = new Uint8Array(251), view = new DataView(output.buffer);
        view.setUint16(0, (input.getUint16(0, true) + 1) & 65535, true); output[2] = session; output[3] = ok ? 128 : 129; output[4] = body.length; output[5] = opcode; output[6] = 1; view.setUint32(8, offset, true); output.set(body, 12);
        state.reply(peer, new window.mavlink20.messages.file_transfer_protocol(0, request._header.srcSystem, request._header.srcComponent, Array.from(output)), callback);
    };
    state.onSend = (peer, bytes) => {
        const request = new window.MAVLink20Processor().decode(Array.from(bytes)); state.requests.push(request);
        if (state.requestTimeline.length < 200) state.requestTimeline.push({ time: Date.now(), type: request._name, command: request.command, ftpOpcode: request._name === 'FILE_TRANSFER_PROTOCOL' ? request.payload.charCodeAt(3) : undefined });
        if (request._name === 'COMMAND_INT' && !state.noACK) state.reply(peer, new window.mavlink20.messages.command_ack(request.command, state.commandReplies.shift() ?? 0, 0, 0, request._header.srcSystem, request._header.srcComponent));
        if (request._name === 'FILE_TRANSFER_PROTOCOL' && !state.holdFTP) state.answer(peer, request);
    };
}
/** Connect through each app's actual editor with deterministic packet identity. */
async function connect(page, legacy) {
    await page.locator('#connectBtn').click(); await page.locator('#component_id').fill('190'); await page.locator('#send_heartbeat').uncheck(); await page.locator('#connection_button').click(); await page.clock.runFor(100);
    await page.waitForFunction(() => document.getElementById('link-status').textContent === 'Live');
    if (legacy) { await page.locator('#connectBtn').click(); await page.evaluate(() => { fixture.map = MapManager.map; }); }
}
/** Read only the rendered mission/fence map layers, preserving order and style values. */
async function layers(page) {
    return page.evaluate(() => {
        const result = [];
        fixture.map.eachLayer(layer => {
            if (layer.getTooltip?.()) { const p = layer.getLatLng(); result.push(['waypoint', layer.getTooltip().getContent(), p.lat, p.lng]); }
            else if (layer.getLatLngs && ['#4caf50', '#f44336'].includes(layer.options.color)) result.push(['polygon', layer.getLatLngs().map(ring => ring.map(p => [p.lat, p.lng])), layer.options.color, layer.options.weight, layer.options.fillOpacity]);
            else if (layer.getRadius?.() && ['#4caf50', '#f44336'].includes(layer.options.color)) { const p = layer.getLatLng(); result.push(['fence', p.lat, p.lng, layer.getRadius(), layer.options.color, layer.options.weight, layer.options.fillOpacity]); }
        });
        return result;
    });
}
/** Exercise the same buttons, exact outgoing bytes and downloaded map layers on legacy and React. */
async function parityScenario(browser, origin, prefix, legacy, fixtures) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
        await context.route('**/*', route => {
            const url = route.request().url();
            return fixtures?.has(url) ? route.fulfill(fixtures.get(url)) : new URL(url).origin === origin ? route.continue() : route.abort();
        });
        await context.addInitScript({ content: `(${inject.toString()})(${legacy}); (${control.toString()})(${JSON.stringify(files())});` });
        const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + prefix + (legacy ? 'SimpleGCS/' : 'SimpleGCS-preview/'));
        await page.waitForFunction(legacy => legacy ? !!window.MapManager?.map : !!window.fixture.map, legacy); await page.clock.install(); await connect(page, legacy);
        await page.locator('#armBtn').click(); await page.locator('#disarmBtn').click(); await page.clock.runFor(100);
        await page.evaluate(() => { fixture.commandReplies = [0, 2]; });
        await page.locator('#rtlBtn').click(); await page.locator('#loiterBtn').click(); await page.clock.runFor(100);
        assert.ok(await page.locator('.toast').filter({ hasText: 'CMD DO_SET_MODE: DENIED' }).count());
        await page.clock.runFor(1600); assert.ok(await page.locator('.toast').filter({ hasText: 'CMD DO_SET_MODE: DENIED' }).count(), 'failure toast survives normal notice lifetime');
        await page.clock.runFor(1500); assert.equal(await page.locator('.toast').filter({ hasText: 'CMD DO_SET_MODE: DENIED' }).count(), 0);
        const commands = await page.evaluate(() => fixture.sent.filter(bytes => new MAVLink20Processor().decode(bytes)._name === 'COMMAND_INT'));
        // These are real UI requests on React; legacy's public module API drives the same transfer scenarios.
        if (legacy) await page.evaluate(() => { Mission.fetch(); Fence.fetch(); });
        else { await page.locator('#menuBtn').click(); await page.getByRole('button', { name: 'Fetch Mission', exact: true }).click(); await page.getByRole('button', { name: 'Fetch Fence', exact: true }).click(); }
        await page.clock.runFor(250); await page.waitForFunction(() => document.querySelectorAll('.mission-wp-label').length === 3);
        const rendered = await layers(page), packets = await page.evaluate(() => fixture.sent);
        assert.deepEqual(await page.locator('.mission-wp-label').allTextContents(), ['0', '7', '12']);
        assert.equal(rendered.filter(layer => layer[0] === 'fence').length, 2); assert.equal(rendered.filter(layer => layer[0] === 'polygon').length, 1); assert.deepEqual(errors, []);
        return { commands, rendered, packets };
    } finally { await context.close(); }
}
/** Collect failure evidence without waiting indefinitely on a stalled or closed renderer. */
async function retryDiagnostics(page) {
    let timer;
    try {
        return await Promise.race([
            page.evaluate(() => ({ time: Date.now(), packets: fixture.requestTimeline })).catch(error => ({ unavailable: error.message })),
            new Promise(resolve => { timer = setTimeout(() => resolve({ unavailable: 'packet diagnostics exceeded 500ms' }), 500); }),
        ]);
    } finally { clearTimeout(timer); }
}
/** Exercise interruptions, retry/error/confirmation and pointer cleanup in the converted UI. */
async function lifecycleScenario(browser, origin, prefix) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await context.addInitScript({ content: `(${inject.toString()})(false); (${control.toString()})(${JSON.stringify(files())});` });
        const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + prefix + 'SimpleGCS-preview/'); await page.waitForFunction(() => !!window.fixture.map); await page.clock.install(); await connect(page, false);
        await page.locator('#menuBtn').click();
        let accept = false; page.on('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
        await page.getByRole('button', { name: 'ForceArm', exact: true }).click(); assert.equal(await page.evaluate(() => fixture.sent.length), 0);
        accept = true; await page.getByRole('button', { name: 'ForceArm', exact: true }).click(); await page.getByRole('button', { name: 'ForceDisarm', exact: true }).click(); await page.getByRole('button', { name: 'Reboot', exact: true }).click(); await page.clock.runFor(100);
        assert.deepEqual(await page.evaluate(() => fixture.requests.filter(m => m._name === 'COMMAND_INT').map(m => [m.command, m.param1, m.param2])), [[400, 1, 21196], [400, 0, 21196], [246, 1, 0]]);
        await page.evaluate(() => { fixture.noACK = true; }); await page.locator('#armBtn').click(); await page.clock.runFor(4000);
        await page.evaluate(() => fixture.receive(fixture.sockets.at(-1), new mavlink20.messages.command_ack(400, 5, 50, 0, 255, 190))); await page.clock.runFor(4000); assert.match(await page.locator('#operations-status').textContent(), /IN_PROGRESS/);
        await page.clock.runFor(1000); assert.match(await page.locator('#operations-status').textContent(), /no acknowledgement/);
        await page.evaluate(() => { fixture.failSend = true; }); await page.locator('#armBtn').click(); assert.match(await page.locator('.toast').textContent(), /not sent/); await page.evaluate(() => { fixture.failSend = false; fixture.noACK = false; });
        await page.getByLabel('Fetch mission on first heartbeat', { exact: true }).check(); await page.evaluate(() => { fixture.failFTP = true; });
        // install() leaves time running: freeze before scheduling the retry so browser round trips cannot consume its boundary.
        await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
        try {
            await page.getByRole('button', { name: 'Fetch Mission', exact: true }).click(); await page.clock.runFor(100);
            assert.match(await page.locator('#operations-status').textContent(), /Failed to fetch mission/); const beforeRetry = await page.evaluate(() => fixture.requests.length);
            await page.clock.runFor(4900); assert.equal(await page.evaluate(() => fixture.requests.length), beforeRetry);
            await page.evaluate(() => { fixture.failFTP = false; }); await page.clock.runFor(200); assert.equal(await page.locator('.mission-wp-label').count(), 3);
        } catch (error) {
            console.error('Mission retry clock/packets', await retryDiagnostics(page));
            throw error;
        } finally { await page.clock.resume(); }
        await page.evaluate(() => { fixture.holdFTP = true; }); await page.getByRole('button', { name: 'Fetch Mission', exact: true }).click(); assert.equal(await page.getByRole('button', { name: 'Fetch Mission', exact: true }).isDisabled(), true);
        await page.getByLabel('Fetch mission on first heartbeat', { exact: true }).uncheck(); await page.getByRole('button', { name: 'Close', exact: true }).filter({ visible: true }).click();
        await page.evaluate(() => { fixture.staleHandler = fixture.sockets.at(-1).onmessage; });
        await page.locator('#connectBtn').click(); await page.locator('#disconnection_button').click(); await page.clock.runFor(50); await page.waitForFunction(() => document.querySelectorAll('.mission-wp-label').length === 0); assert.equal(await page.locator('.mission-wp-label').count(), 0);
        await page.evaluate(() => { fixture.holdFTP = false; fixture.vehicle = 43; }); await page.locator('#connection_button').click(); await page.clock.runFor(100);
        // Late old-vehicle FTP and ACK packets cannot change the replacement snapshot.
        await page.evaluate(() => { fixture.noACK = true; }); await page.locator('#armBtn').click();
        await page.evaluate(() => {
            const old = fixture.sockets.at(-2), req = fixture.requests.findLast(m => m._name === 'FILE_TRANSFER_PROTOCOL' && m.payload.charCodeAt(3) === 4);
            fixture.answer(old, req, fixture.staleHandler);
            fixture.reply(old, new mavlink20.messages.command_ack(400, 2, 0, 0, 255, 190), fixture.staleHandler);
        }); await page.clock.runFor(100); assert.equal(await page.locator('.mission-wp-label').count(), 0); assert.equal(await page.locator('#operations-status').textContent(), 'ARM sent');
        await page.evaluate(() => { fixture.noACK = false; fixture.receive(fixture.sockets.at(-1), new mavlink20.messages.command_ack(400, 0, 0, 0, 255, 190)); });
        await page.locator('#menuBtn').click(); await page.getByLabel('Fetch mission on first heartbeat', { exact: true }).check(); await page.getByRole('button', { name: 'Close', exact: true }).filter({ visible: true }).click();
        await page.locator('#connectBtn').click(); await page.locator('#disconnection_button').click(); await page.locator('#connection_button').click(); await page.clock.runFor(200); await page.waitForFunction(() => document.querySelectorAll('.mission-wp-label').length === 3);

        /** Count only command frames so background transfers cannot obscure gesture assertions. */
        const commandCount = () => page.evaluate(() => fixture.requests.filter(m => m._name === 'COMMAND_INT').length);
        await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
        const count = await commandCount();
        /** Dispatch real browser PointerEvents through the installed map/window listeners. */
        const pointer = async (type, id = 1, x = 600, target = '#map') => page.locator(target).dispatchEvent(type, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: 500, bubbles: true });
        await pointer('pointerdown'); await page.clock.runFor(599); assert.equal(await commandCount(), count); await page.clock.runFor(1); assert.equal(await commandCount(), count + 1); await pointer('pointerup');
        for (const action of ['pointermove', 'pointercancel', 'pointerleave', 'blur', 'second']) {
            await pointer('pointerdown'); await page.clock.runFor(300);
            if (action === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
            else if (action === 'second') { await pointer('pointerdown', 2, 620, '.leaflet-control-zoom-in'); await pointer('pointerup', 1); }
            else await pointer(action, 1, 611);
            await page.clock.runFor(700); await pointer('pointerup'); await pointer('pointerup', 2);
        }
        assert.equal(await commandCount(), count + 1);
        // A disconnect cancels an in-progress hold before the automatic reconnect deadline.
        await pointer('pointerdown'); await page.evaluate(() => { const socket = fixture.sockets.at(-1); socket.close(); socket.onclose?.(); }); await page.clock.runFor(700); assert.equal(await commandCount(), count + 1); await pointer('pointerup');
        await page.clock.runFor(2000); await page.waitForFunction(() => document.getElementById('link-status').textContent === 'Live');
        for (let i = 0; i < 2; i++) {
            await pointer('pointerdown'); await page.evaluate(() => simplegcsPreview.unmount()); await page.clock.runFor(6000); assert.equal(await commandCount(), count + 1);
            assert.equal(await page.evaluate(() => fixture.sockets.filter(socket => socket.readyState !== 3).length), 0);
            await page.evaluate(() => simplegcsPreview.mount()); await page.clock.runFor(100);
        }
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
}
/** Validate the default signed simulator in a fresh context with a real running clock. */
async function simulatorScenario(browser, origin, prefix) {
    const context = await browser.newContext();
    try {
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + prefix + 'SimpleGCS-preview/'); await page.locator('#connectBtn').click(); await page.locator('#signing_passphrase').fill('local-test-key'); await page.locator('#connection_button').click(); await page.waitForFunction(() => document.getElementById('link-status').textContent === 'Live');
        await page.locator('#disarmBtn').click(); await page.waitForFunction(() => document.getElementById('armed-pill').textContent === 'DISARM');
        await page.locator('#menuBtn').click(); await page.getByRole('button', { name: 'Fetch Mission', exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll('.mission-wp-label').length === 3);
        await page.getByRole('button', { name: 'Fetch Fence', exact: true }).click(); await page.waitForFunction(() => document.getElementById('operations-status').textContent === 'Loaded 1 fence items');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
}
/** Run real Chromium against independent root/prefix dev and built Workers plus unchanged legacy. */
async function main() {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (require('node:fs').existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) });
    let baseline;
    try {
        const server = await legacyServer();
        try { baseline = await parityScenario(browser, server.origin, '/', true, cdnFixtures()); } finally { await server.stop(); }
        for (const prefix of ['/', '/Tools/WebTools/']) for (const mode of ['dev', 'preview']) {
            if (mode === 'preview') execFileSync('pnpm', ['--filter', 'simplegcs', 'build'], { cwd: root, stdio: 'pipe', env: { ...process.env, WEBTOOLS_BASE_PATH: prefix } });
            const server = await start(mode, prefix);
            try {
                const actual = await parityScenario(browser, server.origin, prefix, false);
                assert.deepEqual(actual, baseline, 'complete command/FTP packets and rendered map coordinates/styles match unchanged legacy exactly');
                await lifecycleScenario(browser, server.origin, prefix); await simulatorScenario(browser, server.origin, prefix); console.log(`PASS commands/transfers ${mode} ${prefix} with exact legacy wire/map parity`);
            } finally { await stop(server.child); }
        }
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
