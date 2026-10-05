const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const baseRevision = '0f4607db3dccbc7d06e5847c02465dab38d1eb80';
/** Stop all descendants of the owned local server, including its Worker. */
async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    process.kill(-child.pid, 'SIGTERM');
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000);
    try { await exited; } finally { clearTimeout(timer); }
}
/** Start an independent app or gateway and parse its actual readiness URL. */
async function start(mode, prefix, gateway = false) {
    const child = spawn(process.execPath, gateway ? ['tooling/serve.ts', mode, '--port', '0'] : ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', '0'], {
        cwd: gateway ? root : path.join(root, 'apps/log-finder'), detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBTOOLS_BASE_PATH: prefix, BROWSER: 'none' },
    });
    let output = '';
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(output)), 60000);
            /** Read accumulated output because readiness can span stream chunks. */
            const read = chunk => {
                output += chunk.toString();
                const match = require('node:util').stripVTControlCharacters(output).match(/http:\/\/127\.0\.0\.1:\d+(?=\/)/);
                if (match) { clearTimeout(timer); resolve(match[0]); }
            };
            child.stdout.on('data', read); child.stderr.on('data', read);
            child.once('exit', code => { clearTimeout(timer); reject(new Error(`${code}: ${output}`)); });
            child.once('error', error => { clearTimeout(timer); reject(error); });
        });
        return { origin, close: () => stop(child) };
    } catch (error) { await stop(child); throw error; }
}
/** Build apps for the requested common prefix; every preview is an actual Worker build. */
async function build(prefix) {
    const child = spawn('pnpm', ['build'], { cwd: root, env: { ...process.env, WEBTOOLS_BASE_PATH: prefix }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
    const [code] = await once(child, 'exit'); assert.equal(code, 0, output);
}
/** Serve unchanged owned legacy sources at the exact branch base, plus pinned runtime assets. */
async function legacyServer() {
    const server = http.createServer(async (request, response) => {
        let relative = new URL(request.url, 'http://localhost').pathname.slice(1);
        if (relative.endsWith('/')) relative += 'index.html';
        try {
            const bytes = /^(LogFinder|Libraries)\//.test(relative)
                ? execFileSync('git', ['show', `${baseRevision}:${relative}`], { cwd: root })
                : await fs.readFile(path.join(root, relative));
            response.setHeader('Content-Type', relative.endsWith('.js') ? 'application/javascript' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.html') ? 'text/html' : 'application/octet-stream');
            response.end(bytes);
        } catch { response.writeHead(404); response.end(); }
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
/** Replay only the pinned Leaflet npm bytes after verifying the authoritative page's SRI. */
async function network(context, origin) {
    const html = execFileSync('git', ['show', `${baseRevision}:LogFinder/index.html`], { cwd: root, encoding: 'utf8' });
    const resources = new Map();
    for (const extension of ['js', 'css']) {
        const url = `https://unpkg.com/leaflet@1.9.4/dist/leaflet.${extension}`;
        const source = await fs.readFile(require.resolve(`leaflet/dist/leaflet.${extension}`));
        const tag = html.split('\n').find(line => line.includes(url));
        const integrity = tag.match(/integrity="([^"]+)"/)[1];
        const [algorithm, expected] = integrity.split('-');
        assert.equal(createHash(algorithm).update(source).digest('base64'), expected);
        resources.set(url, { body: source, contentType: extension === 'js' ? 'application/javascript' : 'text/css', headers: { 'access-control-allow-origin': '*' } });
    }
    await context.route('**/*', route => {
        if (route.request().url().startsWith(origin + '/')) return route.continue();
        const resource = resources.get(route.request().url());
        return resource ? route.fulfill(resource) : route.abort();
    });
}
/** Install controlled directory handles and original local file bytes, never real filesystem access. */
async function fixtureContext(browser, origin, bytes) {
    const context = await browser.newContext({ acceptDownloads: true });
    await network(context, origin);
    await context.addInitScript(({ fixtures }) => {
        window.testPickerMode = 'files';
        window.testFileReads = 0;
        window.showDirectoryPicker = async () => {
            if (window.testPickerMode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
            if (window.testPickerMode === 'delay') await new Promise(resolve => setTimeout(resolve, 150));
            return { name: 'logs', kind: 'directory', async *values() {
                if (window.testPickerMode === 'error') throw new Error('controlled root failure');
                for (const fixture of fixtures) yield { name: fixture.name, kind: 'file', async getFile() {
                    window.testFileReads++;
                    return new File([Uint8Array.from(fixture.bytes)], fixture.name);
                } };
            } };
        };
    }, { fixtures: bytes });
    return context;
}
/** Wait for table initialization and read displayed metadata in actual sorted order. */
async function snapshot(page) {
    await page.waitForSelector('.tabulator-row');
    await page.waitForFunction(() => document.getElementById('loading').style.visibility === 'hidden');
    return page.locator('#tables > details').evaluateAll(groups => groups.map(group => ({
        summary: group.querySelector('summary').textContent,
        rows: [...group.querySelectorAll('.tabulator-table > .tabulator-row')].map(row => [...row.querySelectorAll('.tabulator-cell')].slice(0, 7).map(cell => cell.textContent)),
        totals: [...group.querySelectorAll('.tabulator-calcs-bottom .tabulator-cell')].map(cell => cell.textContent),
    })));
}
/** Exercise sort/filter/reload/cancel and compare serialized downloads with the actual legacy page. */
async function exercise(page, url) {
    const dialogs = []; page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.goto(url); await page.waitForTimeout(150);

    await page.click('#get_dir'); const initial = await snapshot(page);
    await page.locator('.tabulator-col[tabulator-field="info.name"]').first().click();
    const sorted = await snapshot(page);
    await page.uncheck('#param_diff_ignore0'); const filtered = await snapshot(page);
    await page.locator('.tabulator-table .tabulator-cell[tabulator-field="param_diff"]').filter({ hasText: /^[1-9]/ }).first().hover();
    const diffDetails = await page.locator('.tippy-content:visible').first().innerText();
    await page.mouse.move(0, 0);
    await page.evaluate(() => {
        const polyline = window.L.polyline;
        window.L.polyline = (points, ...args) => { window.testPoints = points; return polyline(points, ...args); };
    });
    await page.locator('.tabulator-table .tabulator-cell[tabulator-field="info.distance_traveled"]').filter({ hasText: / m| km/ }).first().hover();
    await page.waitForFunction(() => window.testPoints);
    const mapCoordinates = await page.evaluate(() => window.testPoints);
    await page.mouse.move(0, 0);
    const downloadButton = page.locator('input[value="Parameters"]:enabled').first();
    const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
    const downloadBytes = await fs.readFile(await download.path());
    const filename = download.suggestedFilename();
    await page.click('#reload'); const reloaded = await snapshot(page);
    await page.evaluate(() => { window.testPickerMode = 'cancel'; }); await page.click('#get_dir');
    await page.waitForFunction(() => document.getElementById('reload').disabled);
    assert.deepEqual(await snapshot(page), reloaded, 'cancel preserves the old tables');
    return { initial, sorted, filtered, reloaded, diffDetails, mapCoordinates, filename, downloadBytes: downloadBytes.toString('base64'), dialogs };
}


/** Mount/unmount the real App while the directory picker is pending, without destroying the document. */
async function appLifetime(browser, fixtures) {
    const directory = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'logfinder-lifecycle-'));
    execFileSync('pnpm', ['--filter', 'log-finder', 'exec', 'vite', 'build', '--config', 'tests/lifecycle.config.ts'], { cwd: root, env: { ...process.env, LOGFINDER_LIFECYCLE_DIR: directory }, stdio: 'pipe' });
    const server = http.createServer(async (request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const file = pathname.startsWith('/LogFinder/') ? path.join(root, 'apps/log-finder/.legacy-assets', pathname.slice('/LogFinder/'.length)) : path.join(directory, pathname);
        try {
            response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
            response.end(await fs.readFile(file));
        } catch { response.writeHead(404); response.end(); }
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const context = await fixtureContext(browser, origin, fixtures);
    try {
        const page = await context.newPage(); const errors = [];
        page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + '/tests/lifecycle.html');
        for (let count = 0; count < 3; count++) {
            await page.evaluate(() => { window.testPickerMode = 'delay'; window.testFileReads = 0; });
            await page.click('#get_dir');
            await page.waitForTimeout(50); await page.click('#toggle');
            assert.equal(await page.locator('#get_dir').count(), 0);
            await page.waitForTimeout(200);
            assert.equal(await page.evaluate(() => window.testFileReads), 0, 'unmounted picker result cannot start file reads');
            await page.click('#toggle');
            await page.evaluate(() => { window.testPickerMode = 'files'; });
            await page.click('#get_dir'); await snapshot(page);
            await page.click('#toggle');
            assert.equal(await page.locator('.tabulator, [data-tippy-root]').count(), 0);
            await page.click('#toggle');
        }
        assert.deepEqual(errors, []);
    } finally {
        await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true });
    }
}

test('LogFinder actual legacy parity, independent dev/build Workers, prefixes and controlled Open In', { timeout: 600000 }, async () => {
    const bytes = await Promise.all(['pymavlink-test.BIN', 'plane-4.6.2-prefix.BIN', 'pymavlink-test.BIN'].map(async (fixture, index) => ({ name: `${3 - index}-${fixture}`, bytes: [...await fs.readFile(path.join(root, 'packages/dataflash/fixtures', fixture))] })));
    // Derive one controlled variant without changing either authoritative fixture.
    // PARM's fixed N (16-byte name) is immediately followed by its f value here.
    const variant = Buffer.from(bytes[2].bytes);
    const arming = variant.indexOf('ARMING_CHECK');
    assert.equal(variant.readFloatLE(arming + 16), 8191);
    variant.writeFloatLE(0, arming + 16);
    const resets = variant.indexOf('SYS_NUM_RESETS');
    assert.ok(resets >= 0); variant.writeFloatLE(123, resets + 16);
    bytes[2].bytes = [...variant];
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--no-sandbox'] });
    const legacy = await legacyServer();
    try {
        const referenceContext = await fixtureContext(browser, legacy.origin, bytes);
        const reference = await exercise(await referenceContext.newPage(), legacy.origin + '/LogFinder/');
        assert.deepEqual(reference.dialogs, []); await referenceContext.close();
        await appLifetime(browser, bytes);
        for (const prefix of ['/', '/Tools/WebTools/']) {
            await build(prefix);
            for (const mode of ['dev', 'preview']) {
                const server = await start(mode, prefix);
                try {
                    const context = await fixtureContext(browser, server.origin, bytes);
                    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
                    const actual = await exercise(page, server.origin + prefix + 'LogFinder/');
                    assert.deepEqual(actual, reference, `${mode} ${prefix}: exact rows, totals, and parameter download bytes`);
                    for (const asset of ['board_types.txt', 'dataflash/index.js', 'dataflash/vendor/parser.js', 'index.html']) assert.equal((await context.request.get(server.origin + prefix + 'LogFinder/' + asset)).status(), 200);
                    for (const asset of ['missing.js', 'missing.html', 'assets/missing.js']) assert.equal((await context.request.get(server.origin + prefix + 'LogFinder/' + asset)).status(), 404);
                    assert.equal((await context.request.get(server.origin + prefix + 'LogFinder', { maxRedirects: 0 })).status(), 308);
                    for (let iteration = 0; iteration < 2; iteration++) {
                        await page.goto(server.origin + prefix + 'LogFinder/'); await page.click('#get_dir'); await snapshot(page);
                        assert.ok(await page.locator('#tables img').count() > 0, 'controlled disabled-arming fixture produces warning');
                        for (const image of await page.locator('#tables img').all()) assert.equal(await image.evaluate(node => node.complete && node.naturalWidth > 0), true, 'warning icon resolves inside app');
                        await page.evaluate(() => {
                            window.mapRemoved = 0; window.mapCreated = 0;
                            const map = window.L.map;
                            window.L.map = (...args) => { window.mapCreated++; const instance = map(...args); const remove = instance.remove; instance.remove = function () { window.mapRemoved++; return remove.call(this); }; return instance; };
                        });
                        const distance = page.locator('.tabulator-table .tabulator-cell[tabulator-field="info.distance_traveled"]').filter({ hasText: / m| km/ }).first();
                        await distance.hover(); await page.waitForSelector('.leaflet-container');
                        await page.waitForFunction(() => document.querySelector('.leaflet-overlay-pane svg path'));
                        await page.mouse.move(0, 0);
                        await page.locator('input[value="Open In"]').first().hover(); await page.waitForSelector('[data-tippy-root]');
                        await page.click('#reload'); await snapshot(page);
                        assert.equal(await page.locator('[data-tippy-root]').count(), 0, 'reload disposes detached tooltip DOM');
                        assert.deepEqual(await page.evaluate(() => [window.mapCreated, window.mapRemoved]), [1, 1], 'React table unmount removes its actual Leaflet map');
                        assert.equal(await page.locator('.leaflet-container').count(), 0);
                    }
                    await page.evaluate(() => { window.testPickerMode = 'delay'; }); await page.click('#get_dir');
                    await page.goto('about:blank'); await page.waitForTimeout(200);
                    await page.goto(server.origin + prefix + 'LogFinder/');
                    await page.evaluate(() => { window.testPickerMode = 'error'; }); await page.click('#get_dir');
                    await page.waitForTimeout(200);
                    assert.equal(await page.locator('#loading').evaluate(node => node.style.visibility), 'visible', 'legacy loading rejection remains visible');
                    assert.deepEqual(errors, []); await context.close();
                    const unsupported = await browser.newContext();
                    await unsupported.route('**/*', route => route.request().url().startsWith(server.origin + '/') ? route.continue() : route.abort());
                    await unsupported.addInitScript(() => { window.showDirectoryPicker = undefined; });
                    const unavailable = await unsupported.newPage(); const alerts = [];
                    unavailable.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.dismiss(); });
                    await unavailable.goto(server.origin + prefix + 'LogFinder/'); await unavailable.click('#get_dir');
                    await unavailable.waitForTimeout(100);
                    assert.deepEqual(alerts, ['This browser does not support directory opening.', 'This browser does not support directory opening.']);
                    await unsupported.close();
                } finally { await server.close(); }
            }
            const gateway = await start('preview', prefix, true);
            try {
                const context = await fixtureContext(browser, gateway.origin, bytes);
                const page = await context.newPage(); await page.goto(gateway.origin + prefix + 'LogFinder/'); await page.click('#get_dir'); await snapshot(page);
                // Record the actual File arriving at the unchanged same-origin destination before its handler runs.
                await context.addInitScript(() => { window.addEventListener('message', async event => { if (event.data?.type === 'file') window.transferred = { name: event.data.data.name, bytes: [...new Uint8Array(await event.data.data.arrayBuffer())] }; }); });
                await page.locator('input[value="Open In"]').first().hover();
                const [destination] = await Promise.all([context.waitForEvent('page'), page.locator('input[value="Hardware Report"]:visible').click()]);
                destination.on('dialog', dialog => dialog.dismiss());
                await destination.waitForFunction(() => window.transferred);
                const transferred = await destination.evaluate(() => window.transferred);
                const expected = bytes.find(fixture => fixture.name === transferred.name);
                assert.ok(expected); assert.deepEqual(transferred, expected); assert.ok(destination.url().startsWith(gateway.origin + prefix + 'HardwareReport'));
                await context.close();
            } finally { await gateway.close(); }
        }
    } finally { await legacy.close(); await browser.close(); }
});
