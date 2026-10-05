const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');
const { createLogFixture } = require('./fixtures.cjs');
const root = path.resolve(__dirname, '../../..');
/** Stops the complete server process group, including Workers, even after failed startup. */
async function stopProcess(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    process.kill(-child.pid, 'SIGTERM');
    const timer = setTimeout(() => {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }, 5000);
    try { await exited; } finally { clearTimeout(timer); }
}

/** Starts the same-origin gateway and rejects early exits with captured diagnostics. */
async function startServer(mode, base) {
    const child = spawn(process.execPath, ['tooling/serve.ts', mode, '--port', '0'], {
        cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WEBTOOLS_BASE_PATH: base, PORTAL_BASE_PATH: base, BROWSER: 'none' },
    });
    let output = '';
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Gateway startup timeout:\n' + output)), 60000);
            /** Parses the gateway readiness URL from complete output chunks. */
            const read = chunk => {
                output += chunk.toString();
                const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
                if (match) { clearTimeout(timer); resolve(match[0]); }
            };
            child.stdout.on('data', read);
            child.stderr.on('data', read);
            child.once('error', error => { clearTimeout(timer); reject(error); });
            child.once('exit', code => { clearTimeout(timer); reject(new Error(`Gateway exited ${code}:\n${output}`)); });
        });
        return { origin, stop: () => stopProcess(child) };
    } catch (error) { await stopProcess(child); throw error; }
}

/** Builds every independent workspace app for one common hosting prefix. */
async function build(base) {
    const child = spawn('pnpm', ['build'], {
        cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WEBTOOLS_BASE_PATH: base, PORTAL_BASE_PATH: base },
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    const timer = setTimeout(() => { void stopProcess(child); }, 180000);
    try {
        const [code] = await once(child, 'exit');
        assert.equal(code, 0, `Build at ${base} failed:\n${output}`);
    } finally { clearTimeout(timer); await stopProcess(child); }
}


/** Read actual vendor traces after its queued React update has settled. */
async function traces(page, id = 'FFTPlotMag') {
    return page.locator(`#${id} .js-plotly-plot`).evaluate(node => node.data.map(({x, y, visible}) => ({x, y, visible})));
}

/** Wait for a fully rendered response without relying on a fixed delay. */
async function ready(page) {
    await page.waitForFunction(() => document.querySelector('#FFTPlotMag .js-plotly-plot')?.data?.[0]?.x?.length > 0);
}

/** Verify app ownership, retained file bytes and genuine Worker/gateway misses. */
async function routes(context, page, origin, base) {
    const mount = origin + base + 'AnalyticTune';
    const redirect = await context.request.get(mount + '?test=1', { maxRedirects: 0 });
    assert.equal(redirect.status(), 308);
    assert.equal(new URL(redirect.headers().location, mount).href, mount + '/?test=1');
    for (const file of ['params.json', 'Readme.md', 'AnalyticTune.js']) {
        const response = await context.request.get(mount + '/' + file);
        assert.equal(response.status(), 200);
        assert.deepEqual(await response.body(), await fs.readFile(path.join(root, 'AnalyticTune', file)));
    }
    for (const missing of ['missing.html', 'assets/missing.js', 'vendor/missing.js', 'src/missing.ts']) {
        const response = await context.request.get(mount + '/' + missing);
        assert.equal(response.status(), 404, missing);
        assert.doesNotMatch(await response.text(), /<div id="root"><\/div>/);
    }
    if (base !== '/') assert.equal((await context.request.get(origin + '/AnalyticTune/')).status(), 404);
    await page.goto(origin + base + 'Dev/');
    await page.locator('a[href$="AnalyticTune"]').click();
    await page.locator('#FFTWindow_size').waitFor();
    assert.equal(page.url(), mount + '/');
    await page.goto(mount + '/index.html?INS_GYRO_FILTER=35#comparison');
    assert.equal(await page.locator('#INS_GYRO_FILTER').inputValue(), '35');
}

/** Load real local binary bytes and exercise all owned controls and parameter downloads. */
async function workflows(page, origin, base) {
    const { initialParameters, exportParameters } = await import('../src/parameters.ts');
    const metadata = JSON.parse(await fs.readFile(path.join(root, 'AnalyticTune/params.json'), 'utf8'));
    for (const vehicle of ['ArduCopter', 'ArduPlane_VTOL', 'ArduPlane_FW']) {
        await page.goto(origin + base + 'AnalyticTune/');
        await page.locator('#INS_HNTCH_MODE option').first().waitFor({ state: 'attached' });
        await page.locator('#fileItem').setInputFiles({ name: vehicle + '.bin', mimeType: 'application/octet-stream', buffer: createLogFixture({ vehicle, ang: vehicle === 'ArduPlane_VTOL' }) });
        await page.locator('#set_selection_1').waitFor();
        assert.equal(await page.title(), `SysID: ${vehicle}.bin`);
        await page.locator('#calculate').click();
        await ready(page);
        const first = await traces(page);
        assert.equal(first[0].x.length, 512);
        assert.ok(first[1].y.some(value => value !== null && value !== 0), 'actual predicted response exists');
        const prefix = vehicle === 'ArduCopter' ? 'ATC_RAT_RLL_' : vehicle === 'ArduPlane_VTOL' ? 'Q_A_RAT_RLL_' : 'RLL_RATE_';
        await page.locator('#' + prefix + 'P').fill('0.3');
        await page.waitForFunction(old => JSON.stringify(document.querySelector('#FFTPlotMag .js-plotly-plot').data[1].y) !== old, JSON.stringify(first[1].y));
        const gainChanged = await traces(page);
        assert.deepEqual(gainChanged[0].y, first[0].y, 'gain editing preserves measured response');
        await page.locator('#' + prefix + 'NEF').fill('1');
        await page.locator('#FILT1_NOTCH_FREQ').fill('50');
        assert.equal(await page.locator('#FILT1_NOTCH_Q').isVisible(), true);
        await page.locator('#UseAttitude').check();
        await page.locator('#PID_freq_Scale_RPS').check();
        await page.waitForFunction(x => Math.abs(document.querySelector('#FFTPlotMag .js-plotly-plot').data[0].x[0] - x * (Math.PI * 2)) < 1e-12, first[0].x[0]);
        await page.locator('#PID_ScaleLinear').check();
        await page.locator('#PID_ScaleUnWrap').check();
        for (const loop of ['Bare_AC', 'Rate_Ctrlr', 'Att_Ctrlr_nff', 'Att_DRB', 'Rate_Stab', 'Att_Stab', 'Sys_Stab']) await page.locator('#type_' + loop).check();
        await page.evaluate(() => window.Plotly.relayout(document.querySelector('#FFTPlotMag .js-plotly-plot'), { 'xaxis.range': [1, 2] }));
        await page.waitForFunction(() => document.querySelector('#FFTPlotPhase .js-plotly-plot').layout.xaxis.range[0] === 1);
        await page.locator('#set_selection_1').check();
        const secondStart = Number(await page.locator('#starttime').inputValue());
        assert.ok(secondStart > 10);
        await page.locator('#calculate').click();
        await page.locator('#FFTWindow_size').fill('513');
        await page.locator('#calculate').click();
        await page.getByRole('alert').filter({ hasText: 'power of two' }).waitFor();
        await page.locator('#FFTWindow_size').fill('1024');
        await page.locator('#calculate').click();
        await ready(page);
        const downloadEvent = page.waitForEvent('download');
        await page.locator('#SaveParams').click();
        const download = await downloadEvent;
        assert.equal(download.suggestedFilename(), 'filter.param');
        const content = await fs.readFile(await download.path(), 'utf8');
        const values = await page.locator('#params input[type=number], #params select').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.id, node.value])));
        assert.equal(content, exportParameters({ ...initialParameters(), ...values }, vehicle, 'Pitch', metadata));
        await page.locator('#param_file').setInputFiles({ name: 'changed.param', mimeType: 'text/plain', buffer: Buffer.from('INS_GYRO_FILTER,33\n') });
        await page.waitForFunction(() => document.getElementById('INS_GYRO_FILTER').value === '33');
        const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname));
        assert.ok(resources.every(resource => !resource.endsWith('/AnalyticTune.js')), 'legacy owned script is never executed');
    }
    await page.locator('#param_file').setInputFiles({ name: 'edge.param', mimeType: 'text/plain', buffer: Buffer.from('INS_HNTCH_MODE,99\nINS_GYRO_FILTER,invalid\n') });
    await page.waitForFunction(() => document.getElementById('INS_GYRO_FILTER').value === '');
    assert.equal(await page.locator('#INS_HNTCH_MODE').inputValue(), '', 'unknown enums retain native empty selection');
    const edgeDownload = page.waitForEvent('download');
    await page.locator('#SaveParams').click();
    const edgeText = await fs.readFile(await (await edgeDownload).path(), 'utf8');
    assert.match(edgeText, /^INS_GYRO_FILTER,0$/m);
    assert.match(edgeText, /^INS_HNTCH_MODE,0$/m);
}

/** Exercise repeated mounts, missing dependencies, malformed files and interrupted reads. */
async function lifetimes(context, page, origin, base) {
    const mount = origin + base + 'AnalyticTune/';
    for (let i = 0; i < 3; i++) {
        await page.goto(origin + base);
        await page.goto(mount);
        await page.locator('#fileItem').setInputFiles({ name: 'repeat.bin', mimeType: 'application/octet-stream', buffer: createLogFixture() });
        await page.locator('#set_selection_1').waitFor();
        await page.locator('#calculate').click();
        await ready(page);
        assert.equal(await page.locator('.js-plotly-plot').count(), 4);
    }
    await page.locator('#fileItem').setInputFiles({ name: 'broken.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid log') });
    await page.getByRole('alert').waitFor();
    await page.locator('#fileItem').setInputFiles({ name: 'recovered.bin', mimeType: 'application/octet-stream', buffer: createLogFixture() });
    await page.waitForFunction(() => document.title === 'SysID: recovered.bin');
    const missing = await context.newPage();
    await missing.route('**/vendor/plotly.min.js', route => route.abort());
    try {
        await missing.goto(mount);
        await missing.getByRole('alert').filter({ hasText: 'plot library' }).waitFor();
        await missing.unroute('**/vendor/plotly.min.js');
        await missing.reload();
        await missing.waitForFunction(() => document.querySelectorAll('.js-plotly-plot').length === 4);
    } finally { await missing.close(); }
    const interrupted = await context.newPage();
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    let requested;
    const observed = new Promise(resolve => { requested = resolve; });
    await interrupted.route('**/vendor/dataflash/index.js', async route => { requested(); await pending; await route.abort().catch(() => {}); });
    try {
        await interrupted.goto(mount);
        await interrupted.locator('#fileItem').setInputFiles({ name: 'interrupted.bin', mimeType: 'application/octet-stream', buffer: createLogFixture() });
        await observed;
        await interrupted.goto(origin + base);
    } finally { release(); await interrupted.close(); }
    // The shared receiver accepts the same File transport as retained legacy Open In.
    await page.goto(mount);
    const bytes = [...createLogFixture({ samples: 2048 })];
    await page.evaluate(bytes => window.postMessage({ type: 'file', data: new File([new Uint8Array(bytes)], 'open-in.bin') }, '*'), bytes);
    await page.waitForFunction(() => document.title === 'SysID: open-in.bin');
    await page.locator('#calculate').click();
    await ready(page);
    // Observe the actual popup transport before the unrelated legacy destination
    // analyzes the synthetic fixture. Both navigation and assets use the gateway.
    await context.addInitScript(() => {
        window.openInMessages = [];
        window.addEventListener('message', event => {
            if (event.data?.type !== 'file') return;
            event.stopImmediatePropagation();
            window.openInMessages.push({ name: event.data.data.name, size: event.data.data.size });
        });
    });
    const popupEvent = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Hardware Report', exact: true }).click();
    const popup = await popupEvent;
    try {
        await popup.waitForFunction(() => window.openInMessages?.length === 1);
        assert.equal(new URL(popup.url()).pathname, base + 'HardwareReport/');
        assert.deepEqual(await popup.evaluate(() => window.openInMessages[0]), { name: 'open-in.bin', size: bytes.length });
        await popup.reload();
        assert.deepEqual(await popup.evaluate(() => window.openInMessages), [], 'a new target document drops the native load listener');
    } finally { await popup.close(); }
    // Verify the same native reload limitation against the unchanged helper,
    // instead of repairing a shared transport contract in an app migration.
    await page.addScriptTag({ content: await fs.readFile(path.join(root, 'Libraries/OpenIn.js'), 'utf8') });
    await page.evaluate(bytes => {
        const legacy = get_open_in(() => new File([new Uint8Array(bytes)], 'open-in.bin'));
        legacy.tippy_div.id = 'legacy-open-in';
        document.body.appendChild(legacy.tippy_div);
    }, bytes);
    const legacyEvent = page.waitForEvent('popup');
    await page.locator('#legacy-open-in input[value="Hardware Report"]').click();
    const legacyPopup = await legacyEvent;
    try {
        await legacyPopup.waitForFunction(() => window.openInMessages?.length === 1);
        assert.deepEqual(await legacyPopup.evaluate(() => window.openInMessages[0]), { name: 'open-in.bin', size: bytes.length });
        await legacyPopup.reload();
        assert.deepEqual(await legacyPopup.evaluate(() => window.openInMessages), []);
    } finally { await legacyPopup.close(); await page.locator('#legacy-open-in').evaluate(node => node.remove()); }
}

test('AnalyticTune Chromium dev and built Worker workflows through root and prefix gateways', { timeout: 600000 }, async t => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
    try {
        for (const base of ['/Tools/WebTools/', '/']) {
            await build(base);
            for (const mode of ['dev', 'preview']) await t.test(`${mode} ${base}`, { timeout: 120000 }, async () => {
                const server = await startServer(mode, base);
                const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
                const errors = [];
                context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
                await context.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
                try {
                    const page = await context.newPage();
                    await routes(context, page, server.origin, base);
                    await workflows(page, server.origin, base);
                    await lifetimes(context, page, server.origin, base);
                    assert.deepEqual(errors, []);
                } catch (error) { console.error(error); throw error; } finally { await context.close(); await server.stop(); }
            });
        }
    } finally { await browser.close(); }
});

/** Build or serve the isolated component harness using the same app sources. */
async function harnessProcess(command, base) {
    const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', command, '--config', 'vite.lifetime.config.ts', ...(command === 'preview' ? ['--host', '127.0.0.1', '--port', '0'] : [])], {
        cwd: path.join(root, 'apps/analytic-tune'), detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBTOOLS_BASE_PATH: base },
    });
    let output = '';
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { void stopProcess(child); reject(new Error(output)); }, 60000);
        /** Capture diagnostics and resolve only after preview reports its address. */
        const read = chunk => {
            output += chunk.toString();
            const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
            if (command === 'preview' && match) { clearTimeout(timer); resolve({ origin: match[0], stop: () => stopProcess(child) }); }
        };
        child.stdout.on('data', read); child.stderr.on('data', read);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => {
            clearTimeout(timer);
            if (command === 'build' && code === 0) resolve(null);
            else reject(new Error(`Harness ${command}: ${code}\n${output}`));
        });
    });
}

test('compiled production App disposes plots, subscriptions and interrupted file operations in one document', { timeout: 120000 }, async () => {
    const base = '/Tools/WebTools/';
    await harnessProcess('build', base);
    const server = await harnessProcess('preview', base);
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
        await page.goto(server.origin + base + 'AnalyticTune/tests/lifetime.html');
        for (let i = 0; i < 3; i++) {
            await page.waitForFunction(() => document.querySelectorAll('.js-plotly-plot').length === 4);
            await page.locator('#unmount-app').click();
            await page.waitForFunction(() => document.querySelectorAll('.js-plotly-plot').length === 0);
            const stats = await page.evaluate(() => window.lifetimeTest.stats);
            assert.equal(stats.subscribe, stats.unsubscribe, 'every relayout listener disposed');
            assert.ok(stats.purge >= stats.newPlot, 'each plot lifetime purged');
            await page.locator('#mount-app').click();
        }
        await page.evaluate(() => window.lifetimeTest.deferReads(true));
        const file = { name: 'old.bin', mimeType: 'application/octet-stream', buffer: createLogFixture({ samples: 2048 }) };
        await page.locator('#fileItem').setInputFiles(file);
        await page.waitForFunction(() => window.lifetimeTest.pendingCount() === 1);
        await page.locator('#fileItem').setInputFiles({ ...file, name: 'latest.bin' });
        await page.waitForFunction(() => window.lifetimeTest.pendingCount() === 2);
        await page.evaluate(() => window.lifetimeTest.release(1));
        await page.waitForFunction(() => document.title === 'SysID: latest.bin');
        await page.evaluate(() => window.lifetimeTest.reject(0));
        await page.locator('#calculate').click();
        await ready(page);
        assert.equal(await page.getByRole('alert').count(), 0, 'stale rejected read cannot overwrite latest success');
        await page.locator('#fileItem').setInputFiles({ ...file, name: 'unmounted.bin' });
        await page.waitForFunction(() => window.lifetimeTest.pendingCount() === 1);
        await page.locator('#unmount-app').click();
        await page.evaluate(() => window.lifetimeTest.release());
        await page.locator('#mount-app').click();
        await page.waitForFunction(() => document.querySelectorAll('.js-plotly-plot').length === 4);
        assert.equal(await page.locator('#set_selection_0').count(), 0, 'unmounted read cannot populate later mount');
        assert.equal(await page.getByRole('alert').count(), 0);
        await page.evaluate(() => window.lifetimeTest.deferReads(false));
        await page.locator('#fileItem').setInputFiles({ ...file, name: 'axes.bin', buffer: createLogFixture({ samples: 2048, axes: [1, 2, 13, 99] }) });
        await page.locator('#set_selection_3').waitFor();
        await page.locator('#set_selection_1').check();
        assert.equal(await page.locator('#ATC_RAT_PIT_P').isVisible(), true);
        await page.locator('#set_selection_2').check();
        assert.equal(await page.locator('#ATC_RAT_PIT_P').isVisible(), true, 'unsupported axis retains prior Pitch');
        await page.locator('#set_selection_3').check();
        assert.doesNotMatch(await page.locator('#sid_sets').innerText(), /undefined/);
        assert.equal(await page.locator('#ATC_RAT_PIT_P').isVisible(), true);
        assert.equal(await page.locator('#INS_HNTCH_HMNCS').getAttribute('data-type'), '8', 'old logs retain 8-bit harmonic controls');
        await page.locator('#fileItem').setInputFiles({ ...file, name: 'modern.bin', buffer: createLogFixture({ samples: 2048, rawLogOptions: true }) });
        await page.waitForFunction(() => document.title === 'SysID: modern.bin');
        await page.waitForFunction(() => document.getElementById('INS_HNTCH_HMNCS').dataset.type === '32');
        await page.locator('#unmount-app').click();
        await page.waitForFunction(() => window.lifetimeTest.stats.subscribe === window.lifetimeTest.stats.unsubscribe);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); await server.stop(); }
});
