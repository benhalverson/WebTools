const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { stripVTControlCharacters } = require('node:util');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const app = path.resolve(__dirname, '..');
const revision = '0f4607db3dccbc7d06e5847c02465dab38d1eb80';

/** Read the actual branch-base oracle; browser executes its unchanged owned scripts. */
function legacy(file) { return execFileSync('git', ['show', `${revision}:${file}`], { cwd: root }); }
/** Stop the complete Vite/Worker process group even after a failed assertion. */
async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    process.kill(-child.pid, 'SIGTERM');
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already stopped */ } }, 5000);
    try { await exited; } finally { clearTimeout(timer); }
}
/** Start the independent app, with no portal or other app server available as a fallback. */
async function server(mode, prefix, config) {
    const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : ['--force']), ...(config ? ['--config', config] : []), '--host', '127.0.0.1', '--port', '0'], {
        cwd: app, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBTOOLS_BASE_PATH: prefix },
    });
    let output = '';
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(output)), 60000);
            /** Detect readiness from accumulated output, including colored port numbers. */
            const read = chunk => {
                output += chunk.toString();
                const match = stripVTControlCharacters(output).match(/http:\/\/127\.0\.0\.1:\d+(?=\/)/);
                if (match) { clearTimeout(timer); resolve(match[0]); }
            };
            child.stdout.on('data', read); child.stderr.on('data', read);
            child.on('error', error => { clearTimeout(timer); reject(error); });
            child.on('exit', code => { clearTimeout(timer); reject(new Error(`Vite ${code}: ${output}`)); });
        });
        return { origin, stop: () => stop(child) };
    } catch (error) { await stop(child); throw error; }
}
/** Build just this independently configured app with its prerequisite libraries. */
async function build(prefix) {
    const child = spawn('pnpm', ['--filter', 'geofence-generator', 'build'], { cwd: root, env: { ...process.env, WEBTOOLS_BASE_PATH: prefix }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await once(child, 'exit'); assert.equal(code, 0, output);
}
/** Prepare exact pinned vendor bytes; validate every integrity attribute declared by legacy HTML. */
async function vendors() {
    const sources = {
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css': 'leaflet/dist/leaflet.css',
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js': 'leaflet/dist/leaflet.js',
        'https://unpkg.com/leaflet-editable@1.2.0/src/Leaflet.Editable.js': 'leaflet-editable/src/Leaflet.Editable.js',
        'https://unpkg.com/@bagage/leaflet.restoreview@1.0.1/leaflet.restoreview.js': '@bagage/leaflet.restoreview/leaflet.restoreview.js',
        'https://unpkg.com/@turf/turf@6/turf.min.js': '@turf/turf/turf.min.js',
        'https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css': 'leaflet-control-geocoder/dist/Control.Geocoder.css',
        'https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.js': 'leaflet-control-geocoder/dist/Control.Geocoder.js',
        'https://unpkg.com/osmtogeojson@3.0.0-beta.5/osmtogeojson.js': 'osmtogeojson/osmtogeojson.js',
    };
    const result = new Map();
    for (const [url, file] of Object.entries(sources)) result.set(url, await fs.readFile(path.join(app, 'node_modules', file)));
    for (const match of legacy('GeofenceGenerator/index.html').toString().matchAll(/(?:href|src)="([^"]+)" integrity="(sha(?:256|384|512))-([^"]+)"/g)) {
        assert.ok(result.has(match[1]));
        assert.equal(createHash(match[2]).update(result.get(match[1])).digest('base64'), match[3]);
    }
    return result;
}
/** Block every external request except exact offline fixture and pinned vendor replays. */
async function offline(page, origin, pinned) {
    const state = { mode: 'water', requests: [], pending: undefined };
    const water = await fs.readFile(path.join(__dirname, 'fixtures/water.osm'));
    const recording = await fs.readFile(path.join(__dirname, 'fixtures/osm-recording.osm'));
    await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (pinned.has(url.href)) return route.fulfill({ body: pinned.get(url.href), contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript' });
        if (url.hostname === 'overpass-api.de') {
            state.requests.push(request.postData());
            if (state.mode === 'error') return route.abort('failed');
            if (state.mode === 'pending') { state.pending = route; return; }
            return route.fulfill({ status: state.mode === 'error' ? 503 : 200, body: state.mode === 'malformed' ? '<broken' : state.mode === 'recording' ? recording : water, contentType: 'text/xml' });
        }
        if (url.hostname === 'nominatim.openstreetmap.org') return route.fulfill({ json: [{ display_name: 'Offline Lake', boundingbox: ['51.50', '51.51', '-0.10', '-0.08'], lat: '51.505', lon: '-0.09' }] });
        if (url.hostname.endsWith('.tile.osm.org')) return route.fulfill({ body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'), contentType: 'image/png' });
        if (url.hostname === 'legacy.invalid') {
            const file = url.pathname.slice(1);
            try { return route.fulfill({ body: legacy(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); }
            catch { return route.fulfill({ status: 404, body: '' }); }
        }
        return route.abort();
    });
    await page.addInitScript(() => { if (location.protocol.startsWith('http')) localStorage.setItem('mapView', JSON.stringify({ lat: 51.505, lng: -0.09, zoom: 14 })); });
    return state;
}
/** Wait for settled feature rendering; SVG paths compare selection geometry independently of React internals. */
async function paths(page) {
    await page.waitForFunction(() => document.querySelectorAll('path.leaflet-interactive').length >= 2);
    return page.locator('path.leaflet-interactive').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
}
/** Close the previous animated popup before a real feature click and exact-byte browser download. */
async function download(page) {
    // A popup may already be fading after a crop update; close current DOM matches atomically.
    await page.locator('.leaflet-popup-close-button').evaluateAll(buttons => buttons.forEach(button => button.click()));
    await page.waitForFunction(() => document.querySelector('.leaflet-popup') === null);
    await page.mouse.click(680, 450);
    const button = page.locator('input[value="Download"]');
    await button.waitFor();
    const pending = page.waitForEvent('download');
    await button.click();
    const saved = await pending;
    return { filename: saved.suggestedFilename(), text: await fs.readFile(await saved.path(), 'utf8') };
}
/** Drag an actual editable vertex rather than calling the crop implementation directly. */
async function editCrop(page) {
    await page.locator('#crop').click();
    const marker = page.locator('.leaflet-vertex-icon').first();
    await marker.waitFor();
    const box = await marker.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(780, 350, { steps: 10 }); await page.mouse.up();
}

test('offline legacy parity and independent dev/Worker previews at root and common prefix', { timeout: 300000 }, async () => {
    const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
    try {
        const pinned = await vendors();
        const legacyPage = await browser.newPage({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
        const legacyState = await offline(legacyPage, '', pinned);
        await legacyPage.goto('http://legacy.invalid/GeofenceGenerator/index.html');
        await legacyPage.waitForFunction(() => typeof osmtogeojson === 'function');
        await legacyPage.locator('#search').click();
        const originalPaths = await paths(legacyPage);
        const exports = [await download(legacyPage), await download(legacyPage)];
        await editCrop(legacyPage);
        const cropPaths = await paths(legacyPage);
        const cropExport = await download(legacyPage);
        legacyState.mode = 'recording';
        await legacyPage.locator('#search').click();
        await legacyPage.waitForFunction(() => document.querySelector('#loading').style.visibility === 'hidden');
        const recorded = await legacyPage.evaluate(() => features);
        const cropError = await legacyPage.evaluate(() => { try { add_crop(); return '' } catch (error) { return error.message } });
        assert.ok(cropError.includes('Polygon'));
        legacyState.mode = 'malformed';
        await legacyPage.locator('#search').click();
        await legacyPage.locator('#loading').waitFor({ state: 'hidden' });
        assert.equal(await legacyPage.evaluate(() => features.length), 0, 'legacy malformed network XML yields no features');
        const failures = [];
        legacyPage.on('pageerror', error => failures.push(error.message));
        legacyPage.on('dialog', dialog => dialog.dismiss());
        legacyState.mode = 'error'; await legacyPage.locator('#search').click();
        for (let attempt = 0; !failures.length && attempt < 1000; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
        assert.ok(failures.length, 'actual legacy request rejection was observed');
        assert.equal(await legacyPage.locator('#loading').isVisible(), true, 'actual legacy rejection leaves overlay visible');
        await legacyPage.close();
        for (const prefix of ['/', '/Tools/WebTools/']) {
            for (const mode of ['dev', 'preview']) {
                if (mode === 'preview') await build(prefix);
                const service = await server(mode, prefix);
                const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
                try {
                    const page = await context.newPage();
                    const errors = []; page.on('pageerror', error => errors.push(error.message));
                    const state = await offline(page, service.origin, pinned);
                    const base = service.origin + prefix + 'GeofenceGenerator/';
                    await page.goto(base);
                    await page.locator('#search:not(:disabled)').waitFor(); // saved zoom is restored
                    await page.locator('#search').click();
                    assert.deepEqual(await paths(page), originalPaths, `${mode} ${prefix} selected vertices`);
                    assert.equal(state.requests[0], legacyState.requests[0], 'exact Overpass request body');
                    assert.deepEqual(await download(page), exports[0]);
                    assert.deepEqual(await download(page), exports[1]);
                    await editCrop(page);
                    assert.deepEqual(await paths(page), cropPaths, 'edited crop vertices and clipped features');
                    assert.deepEqual(await download(page), cropExport);
                    state.mode = 'malformed'; await page.locator('#search').click();
                    await page.locator('#loading').waitFor({ state: 'hidden' });
                    assert.equal(await page.locator('path.leaflet-interactive').count(), 0);
                    state.mode = 'error'; await page.locator('#search').click();
                    await page.getByRole('alert').waitFor();
                    assert.equal(await page.locator('#loading').isVisible(), true, 'legacy rejection keeps loading visible');
                    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
                    state.mode = 'pending'; await page.locator('#search').click();
                    for (let attempt = 0; !state.pending && attempt < 1000; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
                    assert.ok(state.pending, 'request reached the offline provider before interruption');
                    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
                    if (state.pending) await state.pending.fulfill({ body: await fs.readFile(path.join(__dirname, 'fixtures/water.osm')), contentType: 'text/xml' }).catch(() => {});
                    await page.locator('#search:not(:disabled)').waitFor();
                    assert.equal(await page.locator('path.leaflet-interactive').count(), 0, 'canceled response did not restore stale geometry');
                    state.mode = 'water'; await page.locator('#search').click(); await paths(page);
                    await page.locator('summary').click();
                    await page.locator('#osm-file').setInputFiles({ name: 'bad.xml', mimeType: 'text/xml', buffer: Buffer.from('<broken') });
                    await page.getByRole('alert').filter({ hasText: 'Invalid OpenStreetMap XML' }).waitFor();
                    await page.locator('#osm-file').setInputFiles(path.join(__dirname, 'fixtures/water.osm'));
                    await paths(page);
                    assert.deepEqual(await download(page), exports[0]);
                    await page.locator('#osm-file').setInputFiles(path.join(__dirname, 'fixtures/osm-recording.osm'));
                    await page.locator('#loading').waitFor({ state: 'hidden' });
                    await page.locator('#crop').click();
                    await page.getByRole('alert').filter({ hasText: cropError }).waitFor();
                    // Existing secondary files remain byte-identical and unknown destinations stay 404.
                    for (const file of ['Readme.md', 'GeofenceGenerator.js']) {
                        const response = await context.request.get(base + file);
                        assert.equal(response.status(), 200); assert.deepEqual(await response.body(), legacy('GeofenceGenerator/' + file));
                    }
                    for (const file of ['missing', 'missing.html', 'assets/missing.js', 'src/unknown.ts', '../RotationCheck/']) assert.equal((await context.request.get(base + file)).status(), 404, file);
                    const redirect = await context.request.get(base.slice(0, -1) + '?q=1', { maxRedirects: 0 });
                    assert.equal(redirect.status(), 308); assert.ok(redirect.headers().location.endsWith('/?q=1'));
                    for (let repeat = 0; repeat < 2; repeat++) {
                        await page.goto('about:blank'); await page.goto(base + 'index.html');
                        await page.locator('#search:not(:disabled)').waitFor();
                        assert.equal(await page.locator('.leaflet-container').count(), 1);
                        await page.locator('#search').click(); await paths(page);
                    }
                    await page.getByLabel('Search location').fill('Offline Lake');
                    await page.getByRole('button', { name: 'Find', exact: true }).click();
                    await page.getByRole('button', { name: 'Offline Lake', exact: true }).click();
                    await page.locator('#search:not(:disabled)').waitFor();
                    assert.deepEqual(errors, []);
                    assert.ok(recorded.length > 0, 'recorded OSM response was replayed through actual legacy converter');
                    console.log(`Verified ${mode} ${prefix}: selection, crop edit, repeated exports, import/errors/cancel, files, routing, remounts`);
                } finally { await context.close(); await service.stop(); }
            }
        }
    } finally { await browser.close(); }
});

/** Build the same production App in a host that can unmount it without navigation. */
async function buildLifecycle(prefix) {
    const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'tests/lifecycle/vite.config.ts'], {
        cwd: app, env: { ...process.env, WEBTOOLS_BASE_PATH: prefix }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await once(child, 'exit'); assert.equal(code, 0, output);
}
test('built App releases map, editing handles and in-flight requests on repeated in-document unmount', { timeout: 120000 }, async () => {
    const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
    try {
        for (const prefix of ['/', '/Tools/WebTools/']) {
            await buildLifecycle(prefix);
            const service = await server('preview', prefix, 'tests/lifecycle/vite.config.ts');
            const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
            try {
                const state = await offline(page, service.origin, new Map());
                const errors = []; page.on('pageerror', error => errors.push(error.message));
                await page.goto(service.origin + prefix + 'GeofenceGenerator/');
                for (let repeat = 0; repeat < 3; repeat++) {
                    await page.locator('#search:not(:disabled)').waitFor();
                    state.mode = 'water'; await page.locator('#search').click(); await paths(page);
                    await editCrop(page);
                    state.mode = 'pending'; state.pending = undefined;
                    await page.locator('#search').click();
                    for (let attempt = 0; !state.pending && attempt < 1000; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
                    assert.ok(state.pending, 'request reached the offline provider before interruption');
                    await page.getByRole('button', { name: 'Unmount app', exact: true }).click();
                    await state.pending.fulfill({ body: await fs.readFile(path.join(__dirname, 'fixtures/water.osm')), contentType: 'text/xml' }).catch(() => {});
                    assert.equal(await page.locator('.leaflet-container, .leaflet-vertex-icon').count(), 0);
                    const counts = await page.evaluate(() => ({ ...window.lifecycle, map: undefined }));
                    assert.equal(counts.created, counts.removed, 'every map allocation was disposed');
                    assert.equal(counts.eventsAfterRemoval, 0, 'all map event subscriptions removed');
                    await page.getByRole('button', { name: 'Mount app', exact: true }).click();
                }
                await page.locator('#search:not(:disabled)').waitFor();
                assert.deepEqual(errors, []);
                console.log(`Verified built lifecycle ${prefix}: three in-document unmounts during pending requests`);
            } finally { await page.close(); await service.stop(); }
        }
    } finally { await browser.close(); }
});
