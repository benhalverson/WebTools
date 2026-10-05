const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const http = require('node:http');
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
/** Install controlled vendors after page scripts load; never create cameras, microphones or a live peer. */
function fixtures() {
    const state = window.videoFixture = { readers: [], hls: [], rejectPlay: false, native: false, supported: true };
    HTMLMediaElement.prototype.play = function () { return state.rejectPlay ? Promise.reject(Error('blocked')) : Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.canPlayType = function () { return state.native ? 'probably' : ''; };
    class Reader {
        /** Save callbacks so the test can deliver success/error after cleanup. */
        constructor(options) { this.options = options; this.closed = false; state.readers.push(this); }
        /** Record idempotent vendor disposal. */
        close() { this.closed = true; }
    }
    class Hls {
        static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifest' };
        /** Advertise fixture support without probing a real decoder. */
        static isSupported() { return state.supported; }
        /** Capture the exact legacy HLS options and handlers. */
        constructor(options) { this.options = options; this.handlers = {}; this.closed = false; state.hls.push(this); }
        /** Register a controlled vendor callback. */
        on(name, handler) { this.handlers[name] = handler; }
        /** Record requested endpoint bytes without making a network request. */
        loadSource(url) { this.url = url; }
        /** Retain the playback target for attachment assertions. */
        attachMedia(video) { this.video = video; }
        /** Record vendor disposal. */
        destroy() { this.closed = true; }
    }
    window.SIMPLEGCS_VIDEO = { reader: options => new Reader(options), hls: Hls };
    window.Hls = Hls;
    if (typeof MediaMTXWebRTCReader !== 'undefined') MediaMTXWebRTCReader = Reader;
}
/** Serve a minimal legacy video host using exclusively unchanged files from the actual branch base. */
async function legacyVideoServer() {
    const server = http.createServer((req, res) => {
        res.setHeader('content-type', req.url.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
        if (req.url === '/') { res.end('<div id="map" style="position:relative;width:100%;height:800px"></div><script src="vendor/mediamtx/reader.js"></script><script src="webrtc-player.js"></script><script src="video.js"></script>'); return; }
        try { res.end(execFileSync('git', ['show', '2ce2994419c96d5912f952c3cd659d1b6e630aff:SimpleGCS' + req.url], { cwd: root })); } catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { origin: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
/** Exercise identical legacy/React playback scenarios and return exact observable snapshots. */
async function scenarios(browser, origin, prefix, legacy = false) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true });
    const errors = [];
    try {
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await context.addInitScript(() => {
            localStorage.setItem('video.user', 'viewer'); localStorage.setItem('video.pass', 'fixture-view');
            const listeners = window.videoListeners = new Map(), add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
            window.addEventListener = (name, callback, options) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); add(name, callback, options); };
            window.removeEventListener = (name, callback, options) => { listeners.get(name)?.delete(callback); remove(name, callback, options); };
        });
        const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
        if (!legacy) await page.addInitScript(() => { window.SIMPLEGCS_PREVIEW = { onMap(map) { window.videoMap = map; } }; });
        await page.goto(origin + (legacy ? '/' : prefix + 'SimpleGCS-preview/?retained=1'));
        if (!legacy) await page.waitForFunction(() => window.videoMap);
        await page.evaluate(fixtures); await page.clock.install();
        /** Trigger the same user action through each implementation's owned UI. */
        async function toggle() { if (legacy) await page.evaluate(() => VideoPanel.toggle()); else { await page.locator('#menuBtn').click(); await page.locator('#video-inset').click(); await page.getByRole('region', { name: 'Display Settings' }).getByRole('button', { name: 'Close', exact: true }).click(); } }
        const resizeListeners = await page.evaluate(() => videoListeners.get('resize')?.size || 0);
        await toggle(); await page.locator('#video-panel video').waitFor();
        const options = await page.evaluate(() => { const { url, user, pass } = videoFixture.readers.at(-1).options; return { url: url.replace(location.hostname, 'HOST'), user, pass }; });
        await page.evaluate(() => videoFixture.readers.at(-1).options.onError('401 unauthorized retrying'));
        await page.waitForFunction(() => document.getElementById('video-panel').innerText.includes('Authentication failed'));
        const auth = await page.locator(legacy ? '#video-panel > div:nth-child(2) > div' : '.video-status').first().textContent();
        // Legacy badge does not have an ARIA role.
        const statusText = await page.locator('#video-panel').innerText(); assert.match(statusText, /Authentication failed/);
        const saved = await page.evaluate(() => JSON.stringify(localStorage)); let prompts = 0;
        /** Cancel the third prompt to verify atomic settings submission. */
        async function cancel(dialog) { prompts++; if (prompts < 3) await dialog.accept('changed'); else await dialog.dismiss(); }
        page.on('dialog', cancel); await page.locator('#video-panel').getByRole('button', { name: 'Settings', exact: true }).click(); page.off('dialog', cancel);
        assert.equal(prompts, 3); assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), saved);
        await page.getByRole('button', { name: 'Switch to HLS' }).click();
        const hls = await page.evaluate(() => { const h = videoFixture.hls.at(-1), options = { ...h.options }, headers = {}; options.xhrSetup({ setRequestHeader(key, value) { headers[key] = value; } }); delete options.xhrSetup; return { options, headers, url: h.url.replace(location.hostname, 'HOST') }; });
        await page.evaluate(() => { videoFixture.hls.at(-1).handlers.error('error', { fatal: true }); });
        await toggle(); const count = await page.evaluate(() => videoFixture.hls.length); await page.clock.runFor(5000);
        assert.equal(await page.evaluate(() => videoFixture.hls.length), count);
        await page.evaluate(() => { const old = videoFixture.hls.at(-1); old.handlers.manifest('manifest'); old.handlers.error('error', { fatal: true }); });
        await page.clock.runFor(3000); assert.equal(await page.evaluate(() => videoFixture.hls.length), count);
        await toggle(); await page.getByRole('button', { name: 'Switch to WebRTC' }).waitFor();
        for (let i = 0; i < 3; i++) { await page.evaluate(() => videoFixture.hls.at(-1).handlers.error('error', { fatal: true })); await page.clock.runFor(2100); }
        await page.getByRole('button', { name: 'Switch to HLS' }).waitFor();
        await page.evaluate(() => { videoFixture.native = true; videoFixture.supported = false; });
        await page.getByRole('button', { name: 'Switch to HLS' }).click(); await page.getByRole('button', { name: 'Switch to HLS' }).waitFor();
        assert.equal(await page.locator('#video-panel video').getAttribute('src'), null);
        if (!legacy) {
            const before = await page.evaluate(() => [videoMap.getCenter().lat, videoMap.getCenter().lng, videoMap.getZoom()]);
            const videoBox = await page.locator('#video-panel video').boundingBox();
            await page.mouse.move(videoBox.x + 30, videoBox.y + 30); await page.mouse.wheel(0, -200); await page.clock.runFor(500);
            assert.deepEqual(await page.evaluate(() => [videoMap.getCenter().lat, videoMap.getCenter().lng, videoMap.getZoom()]), before, 'video wheel cannot zoom underlying map');
        }
        const bar = page.locator('#video-panel > div').first(), box = await bar.boundingBox();
        await page.mouse.move(box.x + 20, box.y + 15); await page.mouse.down(); await page.mouse.move(box.x - 50, box.y - 35); await page.mouse.up();
        const moved = await page.locator('#video-panel').boundingBox(); assert.ok(moved.x < box.x);
        const cdp = await context.newCDPSession(page);
        const touch = await bar.boundingBox();
        await bar.evaluate(element => element.addEventListener('pointerdown', event => { element.dataset.touchPointer = String(event.pointerId); }, { once: true }));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touch.x + 20, y: touch.y + 15 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touch.x + 40, y: touch.y + 25 }] });
        const touchMoved = await page.locator('#video-panel').boundingBox(); assert.ok(touchMoved.x > moved.x, 'touch moves panel');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await bar.dispatchEvent('pointermove', { pointerId: Number(await bar.getAttribute('data-touch-pointer')), pointerType: 'touch', clientX: 700, clientY: 700 });
        assert.deepEqual(await page.locator('#video-panel').boundingBox(), touchMoved, 'cancelled touch cannot continue moving');
        await cdp.detach();
        const grip = page.locator(legacy ? '#video-panel > div:nth-child(2) > div:last-child' : '.video-grip'), gripBox = await grip.boundingBox();
        await page.mouse.move(gripBox.x + 9, gripBox.y + 9); await page.mouse.down(); await page.mouse.move(gripBox.x - 300, gripBox.y - 200); await page.mouse.up();
        const resized = await page.locator('#video-panel').boundingBox(); assert.equal(resized.width, 280); assert.equal(resized.height, 160);
        const touchResize = await context.newCDPSession(page), handle = await grip.boundingBox();
        await touchResize.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: handle.x + 9, y: handle.y + 9 }] });
        await touchResize.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: handle.x + 49, y: handle.y + 39 }] });
        await touchResize.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const grown = await page.locator('#video-panel').boundingBox(); assert.equal(grown.width, 320); assert.equal(grown.height, 190);
        await touchResize.detach();
        await page.evaluate(() => videoFixture.readers.at(-1).options.onTrack({ streams: [new MediaStream()] }));
        await page.locator('video').dispatchEvent('playing'); await page.waitForFunction(() => document.getElementById('video-panel').innerText.includes('Live')); assert.match(await page.locator('#video-panel').innerText(), /Live/);
        await page.evaluate(() => videoFixture.readers.at(-1).options.onError('403'));
        assert.equal(await page.locator('video').evaluate(video => video.srcObject), null);
        await page.locator('#video-panel button').last().click();
        await page.waitForFunction(expected => (videoListeners.get('resize')?.size || 0) === expected, resizeListeners);
        assert.ok(await page.evaluate(() => videoFixture.readers.every(reader => reader.closed) && videoFixture.hls.every(h => h.closed)));
        await page.evaluate(() => { for (const reader of videoFixture.readers) { reader.options.onError('stale'); reader.options.onTrack({ streams: [new MediaStream()] }); } });
        for (let i = 0; i < 2; i++) { await toggle(); await toggle(); }
        await toggle();
        const answers = ['fixture.test', 'camera/front', '', '']; let answer = 0;
        /** Submit a complete edit and verify stream selection persists without URL credentials. */
        async function accept(dialog) { await dialog.accept(answers[answer++]); }
        page.on('dialog', accept); await page.locator('#video-panel').getByRole('button', { name: 'Settings', exact: true }).click(); page.off('dialog', accept);
        await page.waitForFunction(() => videoFixture.readers.at(-1).options.url.includes('/camera/front/'));
        assert.deepEqual(await page.evaluate(() => ['host', 'path', 'user', 'pass'].map(key => localStorage.getItem('video.' + key))), answers);
        await page.getByRole('button', { name: 'Switch to HLS' }).click();
        await page.waitForFunction(() => document.querySelector('#video-panel video').getAttribute('src')?.endsWith('/camera/front/index.m3u8'));
        await toggle();
        if (!legacy) {
            // A separate React window owns its playback after the opener handshake completes.
            await context.addInitScript(fixtures);
            const pending = context.waitForEvent('page'); await page.locator('#menuBtn').click(); await page.locator('#video-new-window').click(); const popup = await pending;
            await popup.waitForFunction(() => videoFixture.readers.length > 0);
            assert.equal(await popup.evaluate(() => videoFixture.readers.at(-1).options.url), 'http://fixture.test:8889/camera/front/whep');
            assert.equal(await popup.evaluate(() => opener), null);
            await popup.evaluate(() => videoFixture.readers.at(-1).options.onTrack({ streams: [new MediaStream()] })); await popup.locator('video').dispatchEvent('playing');
            await popup.getByText('WebRTC · Live', { exact: true }).waitFor();
            await popup.evaluate(() => videoFixture.readers.at(-1).options.onError('403 unauthorized')); await popup.getByText(/Authentication failed/).waitFor();
            assert.equal(await popup.locator('video').evaluate(video => video.srcObject), null);
            await popup.evaluate(() => dispatchEvent(new Event('pagehide')));
            assert.ok(await popup.evaluate(() => videoFixture.readers.every(reader => reader.closed)));
            await popup.evaluate(() => videoFixture.readers.at(-1).options.onTrack({ streams: [new MediaStream()] }));
            assert.equal(await popup.locator('video').evaluate(video => video.srcObject), null);
            await popup.close();
        }
        if (!legacy) { assert.equal(new URL(page.url()).search, '?retained=1'); await page.evaluate(() => simplegcsPreview.unmount()); }
        assert.deepEqual(errors, []); return { options, auth, hls };
    } finally { await context.close(); }
}
/** Exercise the real pinned reader with intercepted authentication errors in both modes. */
async function realReader(browser, origin, prefix) {
    const context = await browser.newContext(), requests = [];
    try {
        await context.route('**/*', route => {
            const request = route.request(), url = new URL(request.url());
            if (url.port === '8889') { requests.push({ method: request.method(), auth: request.headers().authorization }); return route.fulfill({ status: 401, body: 'Unauthorized' }); }
            return url.origin === origin ? route.continue() : route.abort();
        });
        await context.addInitScript(() => {
            localStorage.setItem('video.user', 'viewer'); localStorage.setItem('video.pass', 'fixture-view');
            const listeners = window.videoListeners = new Map(), add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
            window.addEventListener = (name, callback, options) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); add(name, callback, options); };
            window.removeEventListener = (name, callback, options) => { listeners.get(name)?.delete(callback); remove(name, callback, options); };
        });
        const page = await context.newPage(); await page.goto(origin + prefix + 'SimpleGCS-preview/');
        await page.locator('#menuBtn').click(); await page.locator('#video-inset').click();
        await page.getByText(/WebRTC · Authentication failed/).waitFor();
        for (let i = 0; i < 2; i++) {
            const pending = context.waitForEvent('page'); await page.locator('#video-new-window').click(); const popup = await pending;
            await popup.getByText(/WebRTC · Authentication failed/).waitFor();
            assert.equal(new URL(popup.url()).pathname, prefix + 'SimpleGCS-preview/video.html'); assert.equal(new URL(popup.url()).search, ''); assert.equal(await popup.evaluate(() => opener), null);
            await popup.close();
        }
        await page.evaluate(() => simplegcsPreview.unmount()); const count = requests.length; await page.waitForTimeout(2300); assert.equal(requests.length, count);
        assert.ok(requests.some(request => request.method === 'POST')); assert.ok(requests.filter(request => ['POST', 'OPTIONS'].includes(request.method)).every(request => request.auth === 'Basic ' + Buffer.from('viewer:fixture-view').toString('base64')));
        const direct = await context.newPage(); await direct.goto(origin + prefix + 'SimpleGCS-preview/video.html'); await direct.getByText('Open video from the GCS video panel.').waitFor();
    } finally { await context.close(); }
}
/** Validate independent development and built Worker routing at root and the configured prefix. */
async function main() {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (require('node:fs').existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) }), legacy = await legacyVideoServer();
    try {
        const expected = await scenarios(browser, legacy.origin, '/', true);
        for (const prefix of ['/', '/Tools/WebTools/']) for (const mode of ['dev', 'preview']) {
            if (mode === 'preview') execFileSync('pnpm', ['--filter', 'simplegcs', 'build'], { cwd: root, stdio: 'pipe', env: { ...process.env, WEBTOOLS_BASE_PATH: prefix } });
            const server = await start(mode, prefix);
            try { assert.deepEqual(await scenarios(browser, server.origin, prefix), expected); await realReader(browser, server.origin, prefix); console.log(`PASS video ${mode} ${prefix}: legacy bytes, controlled lifecycle, real-reader authentication, independent windows`); }
            finally { await stop(server.child); }
        }
        const gateway = await start('dev', '/Tools/WebTools/', true);
        try {
            assert.deepEqual(await scenarios(browser, gateway.origin, '/Tools/WebTools/'), expected);
            await realReader(browser, gateway.origin, '/Tools/WebTools/');
            const response = await fetch(gateway.origin + '/Tools/WebTools/SimpleGCS/video.js');
            assert.equal(response.status, 200);
            assert.deepEqual(Buffer.from(await response.arrayBuffer()), execFileSync('git', ['show', '2ce2994419c96d5912f952c3cd659d1b6e630aff:SimpleGCS/video.js'], { cwd: root }));
            console.log('PASS video same-origin gateway; public legacy video bytes unchanged');
        } finally { await stop(gateway.child); }
    } finally { await legacy.stop(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
