const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { WebSocketServer } = require('ws');
const { listeningOrigin } = require('@webtools/routing/tooling');
const root = path.resolve(__dirname, '../../..');
/** Start the real independently built Worker, preserving its public prefix. */
async function start(mode, prefix) {
    const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', '0'], { cwd: path.join(root, 'apps/simplegcs'), detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBTOOLS_BASE_PATH: prefix } });
    let output = '';
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error(output)), 60000);
            /** Wait for a complete URL across colored output chunks. */
            function read(chunk) { output += chunk; const origin = listeningOrigin(output); if (origin) { clearTimeout(timer); resolve(origin); } }
            child.stdout.on('data', read); child.stderr.on('data', read);
            child.on('exit', code => { clearTimeout(timer); reject(Error(`${code}: ${output}`)); });
            child.on('error', reject);
        });
        return { origin, child };
    } catch (error) { await stop(child); throw error; }
}
/** Stop the owned server and its Worker process even after assertion failures. */
async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const done = once(child, 'exit'); process.kill(-child.pid, 'SIGTERM');
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000);
    try { await done; } finally { clearTimeout(timer); }
}
test('native local sockets, shared command/parameter FTP, config, tiles, messages and cleanup', async () => {
    const { SimulatedSocket } = await import('../src/simulator.ts');
    const { MAVLink20Processor, mavlink20 } = await import('@webtools/mavlink');
    await mavlink20.ready;
    const sockets = new Set(), peers = new Set(), paths = [], requests = [];
    const ws = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(ws, 'listening');
    ws.on('connection', socket => {
        sockets.add(socket); const peer = new SimulatedSocket(); peers.add(peer);
        const parser = new MAVLink20Processor();
        let warned = false;
        /** Stream real encoded telemetry and a deterministic status message through the native socket. */
        peer.onmessage = event => { if (socket.readyState !== 1) return; socket.send(event.data); if (!warned) { warned = true; const warning = new mavlink20.messages.statustext(4, 'local warning'); socket.send(Uint8Array.from(warning.pack(new MAVLink20Processor(null, 1, 1)))); } };
        socket.on('message', bytes => {
            const request = parser.decode(Array.from(bytes)); requests.push(request);
            if (request._name === 'FILE_TRANSFER_PROTOCOL') {
                const payload = Uint8Array.from(request.payload, byte => byte.charCodeAt(0));
                if ([4, 6].includes(payload[3])) paths.push(new TextDecoder().decode(payload.subarray(12, 12 + payload[4])));
            }
            peer.send(Uint8Array.from(bytes));
        });
        socket.on('close', () => { peer.close(); peers.delete(peer); sockets.delete(socket); });
    });
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) });
    try {
        for (const prefix of ['/', '/Tools/WebTools/']) for (const mode of ['dev', 'preview']) {
            if (mode === 'preview') execFileSync('pnpm', ['--filter', 'simplegcs', 'build'], { cwd: root, stdio: 'pipe', env: { ...process.env, WEBTOOLS_BASE_PATH: prefix } });
            const server = await start(mode, prefix), context = await browser.newContext();
            try {
                const tiles = [], errors = [];
                await context.route('**/*', route => {
                    const url = new URL(route.request().url());
                    if (url.pathname.endsWith('/config.js')) return route.fulfill({ contentType: 'text/javascript', body: `window.SIMPLEGCS_CONFIG={title:'Local GCS acceptance',defaultUrl:'ws://127.0.0.1:${ws.address().port}',defaultComponentId:190};` });
                    if (url.origin === server.origin) return route.continue();
                    if (url.hostname === 'maps.googleapis.com') return route.fulfill({ contentType: 'text/javascript', body: 'window.google={maps:{}};window.__onGMapsLoaded();' });
                    if (url.hostname.endsWith('tile.openstreetmap.org')) { tiles.push(url.href); return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6xD8AAAAASUVORK5CYII=', 'base64') }); }
                    if (url.pathname.endsWith('/Rover/apm.pdef.json')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ Rover: { TEST_I8: { Description: 'Local parameter' } } }) });
                    return route.abort();
                });
                await context.addInitScript(() => { window.SIMPLEGCS_PREVIEW = { onParameters(session) { window.nativeSession = session; }, onMap(map) { window.nativeMap = map; } }; });
                const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
                await page.goto(server.origin + prefix + 'SimpleGCS/');
                await page.waitForFunction(() => !!window.simplegcsPreview);
                assert.equal(await page.title(), 'Local GCS acceptance');
                await page.locator('#connectBtn').click(); assert.equal(await page.locator('#target_url').inputValue(), `ws://127.0.0.1:${ws.address().port}`);
                await page.locator('#connection_button').click(); await page.waitForFunction(() => document.querySelector('#link-status').textContent === 'Live');
                await page.locator('#menuBtn').click(); await page.getByRole('button', { name: 'Fetch Mission', exact: true }).click();
                await page.getByRole('button', { name: 'Parameters', exact: true }).click(); await page.getByText('Parameters refreshed.', { exact: true }).waitFor();
                const value = page.getByLabel('TEST_I8 value', { exact: true }); await value.fill('7');
                await page.locator('[data-parameter="TEST_I8"]').getByRole('button', { name: 'Apply', exact: true }).click(); await page.getByText('TEST_I8 saved and verified.', { exact: true }).waitFor();
                assert.equal(await value.inputValue(), '7');
                await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
                await page.waitForFunction(() => document.querySelectorAll('.mission-wp-label').length === 3);
                assert.ok(paths.includes('@MISSION/mission.dat')); assert.ok(paths.includes('@PARAM/param.pck')); assert.ok(paths.includes('@PARAM/param.pck?withdefaults=1'));
                assert.ok(requests.some(request => request._name === 'FILE_TRANSFER_PROTOCOL'));
                await page.locator('#menuBtn').click(); await page.getByRole('button', { name: 'Messages', exact: true }).click();
                await page.getByRole('region', { name: 'Messages (STATUSTEXT)', exact: true }).waitFor();
                assert.match(await page.locator('.messages-log').innerText(), /\[WARN\] local warning/);
                await page.getByRole('region', { name: 'Messages (STATUSTEXT)', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
                await context.route('**/vendor/Leaflet.GoogleMutant.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.pluginCalls=0;window.L.gridLayer.googleMutant=()=>{window.pluginCalls++;throw Error("local plugin failure")};' }));
                await page.locator('#menuBtn').click(); await page.getByRole('button', { name: 'Settings', exact: true }).click();
                await page.locator('#gmaps-key-input').fill('local-fixture-key'); await page.getByLabel('Map Tiles', { exact: true }).selectOption('google');
                await page.waitForFunction(() => window.pluginCalls === 1);
                assert.ok(await page.evaluate(() => { let fallback = false; nativeMap.eachLayer(layer => { if (layer._url?.includes('tile.openstreetmap.org')) fallback = true; }); return fallback; }), 'failed plugin falls back to the legacy OSM provider');
                await page.getByRole('region', { name: 'Display Settings' }).getByRole('button', { name: 'Close', exact: true }).click();
                assert.ok(tiles.length, 'native route uses provider tiles rather than the offline preview');
                for (let cycle = 0; cycle < 3; cycle++) {
                    await page.locator('#connectBtn').click(); await page.locator('#disconnection_button').click(); await page.locator('#connection_button').click(); await page.waitForFunction(() => document.querySelector('#link-status').textContent === 'Live');
                }
                await page.evaluate(() => { simplegcsPreview.unmount(); window.__onGMapsLoaded(); }); await assertEventually(() => sockets.size === 0 && peers.size === 0);
                for (const missing of ['no-such.js', 'video-missing.html', 'assets/no-such.js']) assert.equal((await page.request.get(server.origin + prefix + 'SimpleGCS/' + missing)).status(), 404);
                assert.deepEqual(errors, []); console.log(`PASS native integration ${mode} ${prefix}`);
            } finally { await context.close(); await stop(server.child); }
        }
    } finally { for (const socket of sockets) socket.terminate(); for (const peer of peers) peer.close(); await new Promise(resolve => ws.close(resolve)); await browser.close(); }
});
/** Allow asynchronous native socket close to settle without weakening resource assertions. */
async function assertEventually(check) { for (let tries = 0; tries < 100; tries++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 20)); } assert.ok(check()); }
