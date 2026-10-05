const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const { chromium } = require('playwright');
const { listeningOrigin } = require('@webtools/routing/tooling');
const root = path.resolve(__dirname, '../../..');
/** Stop the complete Vite/Worker group even when a browser assertion fails. */
async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const done = once(child, 'exit'); process.kill(-child.pid, 'SIGTERM');
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000);
    try { await done; } finally { clearTimeout(timer); }
}
/** Start the independent app on a random port and capture startup failures. */
async function start(mode, prefix, gateway = false) {
    const child = spawn(process.execPath, gateway ? ['tooling/serve.ts', mode, '--port', '0'] : ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', '0'], { cwd: gateway ? root : path.join(root, 'apps/simplegcs'), detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBTOOLS_BASE_PATH: prefix, BROWSER: 'none' } });
    let output = '';
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error(output)), 60000);
            /** Resolve the reported listening address, independent of console chunking. */
            function read(chunk) { output += chunk; const origin = listeningOrigin(output); if (origin) { clearTimeout(timer); resolve(origin); } }
            child.stdout.on('data', read); child.stderr.on('data', read); child.on('error', reject); child.on('exit', code => { clearTimeout(timer); reject(Error(`${code}: ${output}`)); });
        });
        return { origin, child };
    } catch (error) { await stop(child); throw error; }
}
/** Inject a deterministic MAVLink peer plus controllable geolocation; no external socket is constructed. */
function inject(legacy) {
    const state = window.fixture = { sockets: [], sent: [], hold: false, reject: false, watches: new Map(), nextWatch: 0, maps: new Set(), passphrase: '', vehicle: 42 };
    class Peer {
        static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
        /** Open after React has installed handlers, retaining every timer for close. */
        constructor(url) {
            if (state.reject) throw Error('injected constructor failure');
            this.url = url; this.readyState = 0; state.sockets.push(this);
            this.openTimer = setTimeout(() => { if (this.readyState === 3) return; this.rx = new window.MAVLink20Processor(null, state.vehicle, 1); this.rx.signing.secret_key = window.mavlink20.sha256(new TextEncoder().encode(state.passphrase)); this.rx.signing.sign_outgoing = !!state.passphrase; this.readyState = 1; this.onopen?.(); this.emit(); this.timer = setInterval(() => this.emit(), 500); }, 25);
        }
        /** Send decoded fixture frames with the pinned codec's real serialized bytes. */
        emit() {
            if (this.readyState !== 1 || state.hold) return;
            const m = window.mavlink20.messages;
            for (const message of [new m.heartbeat(11, 3, 137, 10, 4), new m.global_position_int(1000, -350000000, 1490000000, 500000, 0, 300, 400, 0, 9000), new m.battery_status(0, 0, 0, 0, Array(10).fill(12000), 123, 0, 0, 72), new m.gps_raw_int([0, 0], 3, 0, 0, 0, 0, 0, 0, 0, 21)]) {
                const bytes = Uint8Array.from(message.pack(this.rx)); this.rx.seq = (this.rx.seq + 1) % 256; this.onmessage?.({ data: bytes.buffer });
            }
        }
        /** Record all outbound traffic so tests can reject accidental command/FTP sends. */
        send(bytes) { if (state.failSend) throw Error('injected send failure'); state.sent.push(Array.from(bytes)); state.onSend?.(this, bytes); }
        /** Simulate an immediate resource close; stale saved callbacks can still be tested. */
        close(code = 1000) { clearTimeout(this.openTimer); clearInterval(this.timer); this.readyState = 3; this.closeCode = code; }
    }
    localStorage.setItem("gcs.auto.fetchFence", "0");
    if (legacy) { window.WebSocket = Peer; localStorage.setItem("gcs.auto.fetchFence", "0"); }
    window.SIMPLEGCS_PREVIEW = { socket: url => new Peer(url), location: {
        /** Register deterministic watch callbacks, starting at the valid ID zero. */
        watchPosition(success, error, options) { const id = state.nextWatch++; state.watches.set(id, { success, error, options }); return id; },
        /** Release the exact registered watch. */
        clearWatch(id) { state.watches.delete(id); },
    }, onMap(map) { if (map) { state.map = map; state.maps.add(map); } else { state.maps.delete(state.map); state.map = null; } } };
    // A real WebSocket would be a test failure; Vite HMR may create its own local connection.
}
/** Exercise editor, reconnect, map and lifecycle behavior in actual Chromium. */
async function scenarios(browser, origin, prefix) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await context.addInitScript(inject);
        const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
        page.on('console', msg => { if(msg.type() === 'error') console.error(msg.text()); }); page.on('response', response => { if(response.status() >= 400) console.error(response.status(), response.url()); });
        await page.goto(origin + prefix + 'SimpleGCS-preview/');
        await page.waitForFunction(() => window.simplegcsPreview && window.fixture.map);
        await page.clock.install();
        await page.locator('#connectBtn').click(); await page.locator('#component_id').fill('190'); await page.locator('#connection_button').click(); await page.clock.runFor(100);
        await page.waitForFunction(() => document.getElementById('link-status').textContent === 'Live');
        assert.equal(await page.locator('#speed-value').textContent(), '9.7 knots'); assert.equal(await page.locator('#current-value').textContent(), '1.2 A');
        await page.locator('#connectBtn').click(); await page.locator('#target_url').fill('ws://draft'); await page.locator('#target_url').focus();
        await page.clock.runFor(1000); assert.equal(await page.locator('#target_url').inputValue(), 'ws://draft'); assert.equal(await page.evaluate(() => document.activeElement.id), 'target_url');
        await page.evaluate(() => { fixture.map.setView([-34, 148], 12); fixture.hold = true; });
        await page.clock.runFor(4000); assert.equal(await page.locator('#link-status').textContent(), 'Telemetry stale');
        await page.clock.runFor(14000); await page.evaluate(() => { fixture.hold = false; }); await page.clock.runFor(1000);
        assert.equal(await page.evaluate(() => fixture.sockets.at(-1).url), 'ws://127.0.0.1:5763');
        assert.deepEqual(await page.evaluate(() => [fixture.map.getCenter().lat, fixture.map.getCenter().lng, fixture.map.getZoom()]), [-34, 148, 12]);
        await page.locator('#send_heartbeat').uncheck(); await page.locator('#connection_button').click(); await page.clock.runFor(100);
        const sent = await page.evaluate(() => fixture.sent.length); await page.clock.runFor(2000); assert.equal(await page.evaluate(() => fixture.sent.length), sent);
        await page.locator('#menuBtn').click(); await page.getByLabel('Show Grid', { exact: true }).check(); await page.getByLabel('Show My Location', { exact: true }).check();
        assert.equal(await page.evaluate(() => fixture.watches.size), 1); assert.equal(await page.locator('#map canvas').count(), 1);
        await page.evaluate(() => fixture.watches.values().next().value.error({ code: 2 })); assert.equal(await page.evaluate(() => fixture.watches.size), 0);
        await page.clock.runFor(15000); assert.equal(await page.evaluate(() => fixture.watches.size), 1);
        await page.evaluate(() => fixture.watches.values().next().value.error({ code: 1 })); assert.equal(await page.evaluate(() => fixture.watches.size), 0);
        await page.getByLabel('Show My Location', { exact: true }).uncheck(); await page.getByLabel('Show My Location', { exact: true }).check();
        const beforeLocation = await page.evaluate(() => [fixture.map.getCenter().lat, fixture.map.getCenter().lng, fixture.map.getZoom()]);
        await page.evaluate(() => fixture.watches.values().next().value.success({ coords: { latitude: -34.5, longitude: 148.5, accuracy: 5 } }));
        const viewport = await page.evaluate(() => [fixture.map.getCenter().lat, fixture.map.getCenter().lng, fixture.map.getZoom()]);
        assert.deepEqual(viewport, beforeLocation);
        await page.evaluate(() => {
            fixture.previousMap = fixture.map;
            const observer = window.SIMPLEGCS_PREVIEW.onMap;
            window.SIMPLEGCS_PREVIEW.onMap = map => observer(map);
            simplegcsPreview.refresh();
        });
        await page.clock.runFor(100);
        assert.equal(await page.evaluate(() => fixture.map === fixture.previousMap), true);
        assert.equal(await page.evaluate(() => fixture.watches.size), 1);
        assert.equal(await page.locator('#map canvas').count(), 1);
        await page.clock.runFor(1600); await page.waitForFunction(() => !document.querySelector('.toast')); assert.equal(await page.locator('.toast').count(), 0);
        const id = await page.locator('#component_id').inputValue(); const sibling = await context.newPage();
        await sibling.addInitScript(id => sessionStorage.setItem('gcs.componentId', id), id); await sibling.goto(origin + prefix + 'SimpleGCS-preview/');
        await sibling.waitForFunction(id => document.getElementById('component_id') && document.getElementById('component_id').value !== id, id); assert.notEqual(await sibling.locator('#component_id').inputValue(), id); await sibling.close();
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => simplegcsPreview.unmount()); await page.clock.runFor(100);
            // Web Locks settle in the browser's task queue, independently of the virtual clock.
            // Keep a real bounded wait so pending or retained leases still fail the cleanup check.
            await page.waitForFunction(async () => {
                const { held, pending } = await navigator.locks.query();
                return ![...held, ...pending].some(lock => lock.name.startsWith('simplegcs.component.'));
            }, undefined, { timeout: 5000 });
            assert.deepEqual(await page.evaluate(async () => [fixture.sockets.filter(s => s.readyState !== 3).length, fixture.watches.size, fixture.maps.size, (await navigator.locks.query()).held.filter(l => l.name.startsWith('simplegcs.component.')).length]), [0, 0, 0, 0]);
            await page.evaluate(() => simplegcsPreview.mount()); await page.clock.runFor(100); await page.waitForFunction(() => fixture.maps.size === 1);
        }
        await page.locator('#connectBtn').click(); await page.locator('#disconnection_button').click(); await page.clock.runFor(60000); assert.equal(await page.evaluate(() => fixture.sockets.filter(s => s.readyState !== 3).length), 0);
        await page.locator('#target_url').fill('ws://bad#'); await page.locator('#connection_button').click(); assert.match(await page.locator('.toast').textContent(), /fragment/);
        await page.clock.runFor(1600); await page.waitForFunction(() => !document.querySelector('.toast')); assert.equal(await page.locator('.toast').count(), 0); await page.locator('#connection_button').click(); await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('fragment'));
        await page.locator('#target_url').fill('ws://test'); await page.evaluate(() => { fixture.reject = true; }); await page.locator('#connection_button').click(); await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('constructor failure')); assert.match(await page.locator('.toast').textContent(), /constructor failure/); await page.clock.runFor(60000); assert.equal(await page.locator('.toast').count(), 0); await page.locator('#connection_button').click(); await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('constructor failure'));
        const simulated = await context.newPage();
        await simulated.addInitScript(() => { delete window.SIMPLEGCS_PREVIEW.socket; });
        await simulated.goto(origin + prefix + 'SimpleGCS-preview/');
        await simulated.locator('#connectBtn').click(); await simulated.locator('#signing_passphrase').fill('local-simulation-key'); await simulated.locator('#connection_button').click();
        await simulated.waitForFunction(() => document.getElementById('link-status').textContent === 'Live');
        assert.equal(await simulated.locator('#speed-value').textContent(), '9.7 knots'); await simulated.close();
        assert.deepEqual(errors, []);
        assert.equal((await page.request.get(origin + prefix + 'SimpleGCS-preview/no-such-page')).status(), 404);
    } finally { await context.close(); }
}
/** Compare the same rendered flow with unchanged legacy in a real browser. */
async function compareLegacy(browser, previewOrigin) {
    const { cdnFixtures, legacyServer } = require('./legacy.cjs');
    const fixtures = cdnFixtures(), server = await legacyServer(), snapshots = [];
    try {
        for (const legacy of [true, false]) {
            const origin = legacy ? server.origin : previewOrigin, context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
            try {
                await context.route('**/*', route => {
                    const url = route.request().url();
                    if (fixtures.has(url)) return route.fulfill(fixtures.get(url));
                    if (url === origin + '/SimpleGCS/config.js') return route.fulfill({ contentType: 'text/javascript', body: '' });
                    return new URL(url).origin === origin ? route.continue() : route.abort();
                });
                await context.addInitScript(inject, legacy);
                const page = await context.newPage();
                await page.clock.install();
                await page.goto(origin + (legacy ? '/SimpleGCS/' : '/SimpleGCS-preview/'));
                await page.waitForFunction(legacy => legacy ? window.AppSettings && !document.getElementById('connectBtn').disabled : window.simplegcsPreview && fixture.map, legacy);
                if (legacy) await page.evaluate(() => { fixture.map = MapManager.map; });
                await page.locator('#connectBtn').click(); await page.locator('#component_id').fill('190'); await page.locator('#connection_button').click(); await page.clock.runFor(500);
                await page.waitForFunction(() => document.getElementById('link-status').textContent === 'Live');
                const live = await page.evaluate(() => Object.fromEntries(['link-status', 'armed-pill', 'mode-value', 'battery-value', 'current-value', 'speed-value'].map(id => [id, document.getElementById(id).textContent])));
                await page.locator('#connectBtn').click(); await page.locator('#target_url').fill('ws://unfinished'); await page.locator('#target_url').focus();
                await page.evaluate(() => { fixture.map.setView([-34, 148], 12); fixture.hold = true; }); await page.clock.runFor(4000);
                const stale = await page.locator('#link-status').textContent();
                await page.clock.runFor(14000); await page.evaluate(() => { fixture.hold = false; }); await page.clock.runFor(1000);
                const reconnect = await page.evaluate(() => ({ url: fixture.sockets.at(-1).url, lat: fixture.map.getCenter().lat, lng: fixture.map.getCenter().lng, zoom: fixture.map.getZoom(), draft: document.getElementById('target_url').value, focus: document.activeElement.id }));
                await page.locator('#disconnection_button').click(); await page.clock.runFor(60000);
                const disconnected = await page.locator('#link-status').textContent();
                snapshots.push({ live, stale, reconnect, disconnected });
            } finally { await context.close(); }
        }
        assert.deepEqual(snapshots[1], snapshots[0], 'rendered telemetry, stale status, draft/focus and reconnect viewport match unchanged legacy');
        console.log('PASS unchanged legacy / React browser parity');
    } finally { await server.stop(); }
}
/** Validate root/prefix development and real built Worker previews, cleaning every process. */
async function main() {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (require('node:fs').existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) });
    try {
        for (const prefix of ['/', '/Tools/WebTools/']) {
            for (const mode of ['dev', 'preview']) {
                if (mode === 'preview') execFileSync('pnpm', ['--filter', 'simplegcs', 'build'], { cwd: root, stdio: 'pipe', env: { ...process.env, WEBTOOLS_BASE_PATH: prefix } });
                const server = await start(mode, prefix);
                try { await scenarios(browser, server.origin, prefix); if (mode === 'preview' && prefix === '/') await compareLegacy(browser, server.origin); console.log(`PASS ${mode} ${prefix}`); } finally { await stop(server.child); }
            }
        }
        const gateway = await start('dev', '/Tools/WebTools/', true);
        try {
            await scenarios(browser, gateway.origin, '/Tools/WebTools/');
            const response = await fetch(gateway.origin + '/Tools/WebTools/SimpleGCS/app.js');
            assert.equal(response.status, 200);
            assert.deepEqual(Buffer.from(await response.arrayBuffer()), execFileSync('git', ['show', '8e1791a:SimpleGCS/app.js'], { cwd: root }));
            console.log('PASS same-origin gateway with unchanged public SimpleGCS bytes');
        } finally { await stop(gateway.child); }
    } finally { await browser.close(); }
}
module.exports = { start, stop, inject };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
