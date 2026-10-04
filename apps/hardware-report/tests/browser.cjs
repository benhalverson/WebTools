const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../..');
const comparisonRevision = '0f4607db3dccbc7d06e5847c02465dab38d1eb80';
const sections = ['warnings', 'INS', 'COMPASS', 'BARO', 'ARSPD', 'GPS'];

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

/** Starts the gateway or independent application, rejecting early exits with captured diagnostics. */
async function startServer(mode, base, independent = false) {
    const { listeningOrigin } = await import('@webtools/routing/tooling');
    const args = independent
        ? ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', '0']
        : ['tooling/serve.ts', mode, '--port', '0'];
    const child = spawn(process.execPath, args, {
        cwd: independent ? path.join(root, 'apps/hardware-report') : root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WEBTOOLS_BASE_PATH: base, PORTAL_BASE_PATH: base, BROWSER: 'none' },
    });
    let output = '';
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Gateway startup timeout:\n' + output)), 60000);
            /** Parses the gateway readiness URL from complete output chunks. */
            const read = chunk => {
                output += chunk.toString();
                const origin = listeningOrigin(output);
                if (origin) { clearTimeout(timer); resolve(origin); }
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

/** Reads the actual prerequisite revision; hash-verified copies also support shallow CI checkouts. */
async function legacySources() {
    const hashes = {
        'HardwareReport/HardwareReport.js': '538b9e29001a6eee657b681ea8074a3252a496c4c89990b55a060727901e62bf',
        'HardwareReport/index.html': '8c7c078110143507800cc97c59f4f5f2132f7026b61d7b49c1528b74d0775cb2',
        'Libraries/Param_Helpers.js': '64b2052d02132ece37f0be75f0dd607ae422783deba5d70a653e92b824836c3c',
        'Libraries/DecodeDevID.js': 'edd4f9abeabbb20c51a605309351a33068730aaa45c76da60fbd6699aa41f5d2',
        'Libraries/Array_Math.js': '079a903f5d6a3b24ccee5fe7eaa2aaba9ee23ae84dc061cc8621a2e244045dae',
    };
    const sources = {};
    for (const [file, hash] of Object.entries(hashes)) {
        let bytes;
        try { bytes = execFileSync('git', ['show', `${comparisonRevision}:${file}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }); }
        catch { bytes = await fs.readFile(path.join(root, file)); }
        assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, `unchanged comparison source: ${file}`);
        sources[file] = bytes;
    }
    return sources;
}

/** Selects a genuine browser File and waits for the parameter report to finish. */
async function selectFile(page, fixture, filename = 'representative.param') {
    await page.locator('#fileItem').setInputFiles({ name: filename, mimeType: 'text/plain', buffer: Buffer.from(fixture) });
    await page.locator('#ParametersContent').waitFor({ state: 'visible' });
}

/** Captures text and visibility independently of React's choice of semantic markup. */
async function report(page) {
    return page.evaluate(ids => Object.fromEntries(ids.map(id => {
        const element = document.getElementById(id);
        const visible = !!element && !element.hidden;
        return [id, { text: visible ? element.textContent.replace(/\s+/g, ' ').trim() : '', visible,
            heading: visible ? element.previousElementSibling?.textContent : '',
            fieldsets: visible ? [...element.querySelectorAll('fieldset')].map(fieldset => fieldset.innerText) : [] }];
    })), sections);
}

/** Captures every export checkbox's availability and exact parameter tooltip. */
async function choices(page) {
    return page.locator('#params input[type="checkbox"]').evaluateAll(inputs => inputs.map(input => ({
        id: input.id, disabled: input.disabled, checked: input.checked, title: input.title,
    })));
}

/** Reads vendor inputs without including Plotly's own generated IDs or transient rendering caches. */
async function plotSnapshot(page) {
    return page.evaluate(() => {
        const container = document.getElementById('POS_OFFSETS');
        const plot = container?.matches('.js-plotly-plot') ? container : container?.querySelector('.js-plotly-plot');
        if (!plot || !plot.getBoundingClientRect().height) return null;
        const keys = ['x', 'y', 'z', 'u', 'v', 'w', 'mode', 'type', 'name', 'meta', 'visible', 'hovertemplate'];
        return {
            data: plot.data.map(trace => Object.fromEntries(keys.filter(key => key in trace).map(key => [key, trace[key]]))),
            axes: ['xaxis', 'yaxis', 'zaxis'].map(axis => ({ title: plot.layout.scene[axis].title.text, range: plot.layout.scene[axis].range })),
            size: [plot.getBoundingClientRect().width, plot.getBoundingClientRect().height],
        };
    });
}

/** Downloads a real UI export, returning its filename and exact serialized UTF-8 bytes. */
async function download(page, name) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    const item = await pending;
    const bytes = await fs.readFile(await item.path());
    return { name: item.suggestedFilename(), bytes: bytes.toString('hex') };
}

/** Records the untouched legacy UI as the independent content, controls, plot and export oracle. */
async function legacyReference(context, origin, base, sources, fixtures) {
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.dismiss());
    await page.route('**/*', route => {
        const pathname = new URL(route.request().url()).pathname;
        const file = pathname.slice(base.length).replace(/^HardwareReport\/$/, 'HardwareReport/index.html');
        return sources[file] ? route.fulfill({ body: sources[file], contentType: file.endsWith('.html') ? 'text/html' : 'text/javascript' }) : route.fallback();
    });
    try {
        await page.goto(origin + base + 'HardwareReport/');
        await page.evaluate(() => Promise.allSettled(import_done));
        const expected = [];
        for (const fixture of fixtures) {
            await selectFile(page, fixture);
            const state = { report: await report(page), choices: await choices(page), plot: await plotSnapshot(page), exports: [] };
            state.exports.push(await download(page, 'Save All Parameters'));
            state.exports.push(await download(page, 'Save Minimal Parameters'));
            for (const choice of state.choices.filter(choice => !choice.disabled)) await page.locator('#' + choice.id).check();
            state.exports.push(await download(page, 'Save Minimal Parameters'));
            expected.push(state);
        }
        return expected;
    } finally { await page.close(); }
}

/** Confirms intermediate migration leaves the complete public HardwareReport route untouched. */
async function checkRoutes(context, origin, base, sources) {
    for (const file of ['HardwareReport/index.html', 'HardwareReport/HardwareReport.js']) {
        const response = await context.request.get(origin + base + file);
        assert.equal(response.status(), 200);
        assert.deepEqual(await response.body(), sources[file], `public ${file} retains exact legacy bytes`);
    }
    for (const missing of ['HardwareReportParameters/missing', 'HardwareReportParameters/assets/missing.js']) {
        assert.equal((await context.request.get(origin + base + missing)).status(), 404);
    }
    if (base !== '/') assert.equal((await context.request.get(origin + '/HardwareReportParameters/')).status(), 404);
}

/** Compares all report sections, export choices, trace slots and exact downloaded bytes. */
async function checkWorkflow(page, origin, base, fixtures, expected) {
    await page.goto(origin + base + 'HardwareReportParameters/');
    await page.locator('#fileItem').waitFor();
    for (let index = 0; index < fixtures.length; index++) {
        await selectFile(page, fixtures[index]);
        assert.deepEqual(await report(page), expected[index].report);
        assert.deepEqual(await choices(page), expected[index].choices);
        if (expected[index].plot) await page.waitForFunction(() => !!document.querySelector('#POS_OFFSETS .js-plotly-plot'));
        assert.deepEqual(await plotSnapshot(page), expected[index].plot, 'exact copied parameter offsets need no floating-point tolerance');
        assert.deepEqual(await download(page, 'Save All Parameters'), expected[index].exports[0]);
        assert.deepEqual(await download(page, 'Save Minimal Parameters'), expected[index].exports[1]);
        for (const choice of expected[index].choices.filter(choice => !choice.disabled)) await page.locator('#' + choice.id).check();
        assert.deepEqual(await download(page, 'Save Minimal Parameters'), expected[index].exports[2]);
        assert.ok((await page.evaluate(() => performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname)))
            .every(resource => !resource.endsWith('/HardwareReport.js')), 'React owns the converted workflow');
    }
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await page.locator('#fileItem').inputValue(), '');
    assert.equal(await page.locator('#POS_OFFSETS .js-plotly-plot').count(), 0);
    assert.equal(await page.locator('#ParametersContent').isVisible(), false);
    await page.locator('#fileItem').setInputFiles({ name: 'unsupported.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0]) });
    await page.getByRole('alert').waitFor();
    await selectFile(page, fixtures[0]);
    assert.deepEqual(await report(page), expected[0].report, 'recover from unsupported input');
    await page.locator('#fileItem').setInputFiles({ name: 'empty.parm', mimeType: 'text/plain', buffer: Buffer.alloc(0) });
    await page.locator('#loading').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#ParametersContent').isVisible(), false, 'empty file retains missing-data behavior');
    assert.equal(await page.locator('#POS_OFFSETS .js-plotly-plot').count(), 0, 'empty file removes prior offset resources');
}

/** Verifies stale file reads cannot restore a report after reset or supersede a newer selection. */
async function checkInterruptedReads(page, fixtures, expected) {
    await page.evaluate(() => {
        const original = File.prototype.text;
        window.releaseFileRead = undefined;
        File.prototype.text = function () {
            if (this.name === 'held.param') return new Promise(resolve => { window.releaseFileRead = () => original.call(this).then(resolve); });
            return original.call(this);
        };
    });
    const held = { name: 'held.param', mimeType: 'text/plain', buffer: Buffer.from(fixtures[0]) };
    await page.locator('#fileItem').setInputFiles(held);
    await page.waitForFunction(() => typeof window.releaseFileRead === 'function');
    await page.getByRole('button', { name: 'Reset', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.releaseFileRead());
    assert.equal(await page.locator('#ParametersContent').isVisible(), false, 'reset owns pending file cancellation');
    await page.evaluate(() => { window.releaseFileRead = undefined; });
    await page.locator('#fileItem').setInputFiles(held);
    await page.waitForFunction(() => typeof window.releaseFileRead === 'function');
    await selectFile(page, fixtures[1], 'newer.param');
    await page.evaluate(() => window.releaseFileRead());
    assert.deepEqual(await report(page), expected[1].report, 'latest file owns the report');
    await page.evaluate(() => { File.prototype.text = () => Promise.reject(new Error('Simulated local read failure')); });
    await page.locator('#fileItem').setInputFiles({ name: 'failed.param', mimeType: 'text/plain', buffer: Buffer.from('X,1') });
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('#loading').isVisible(), true, 'legacy read rejection retains its loading overlay');
}

/** Exercises plot-load interruption, failure recovery and actual plot disposal on reset. */
async function checkPlotLifecycle(context, origin, base, fixture) {
    const page = await context.newPage();
    try {
        await page.route('**/*plotly*.js*', route => route.abort());
        await page.goto(origin + base + 'HardwareReportParameters/');
        await selectFile(page, fixture);
        await page.getByRole('alert').waitFor();
        await page.unroute('**/*plotly*.js*');
        await page.reload();
        await selectFile(page, fixture);
        await page.waitForFunction(() => !!document.querySelector('#POS_OFFSETS .js-plotly-plot'));
        await page.evaluate(() => {
            window.disposedPlots = [];
            const original = window.Plotly.purge;
            window.Plotly.purge = function (element) { window.disposedPlots.push(element); return original.call(this, element); };
        });
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        assert.ok(await page.evaluate(() => window.disposedPlots.length > 0 && window.disposedPlots.every(plot => !plot.isConnected)), 'reset purges the detached renderer');
        for (let iteration = 0; iteration < 2; iteration++) {
            await selectFile(page, fixture);
            await page.waitForFunction(() => !!document.querySelector('#POS_OFFSETS .js-plotly-plot'));
            assert.equal(await page.locator('#POS_OFFSETS .js-plotly-plot').count(), 1);
            await page.getByRole('button', { name: 'Reset', exact: true }).click();
        }
        await page.evaluate(() => {
            const original = window.Plotly.newPlot;
            window.pendingPlotCount = 0;
            window.releasePlots = [];
            window.Plotly.newPlot = function (...args) {
                window.pendingPlotCount++;
                const rendered = original.apply(this, args);
                return new Promise((resolve, reject) => {
                    window.releasePlots.push(() => Promise.resolve(rendered).then(resolve, reject));
                });
            };
        });
        await selectFile(page, fixture);
        await page.waitForFunction(() => window.pendingPlotCount > 0);
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        const purgesBeforeCompletion = await page.evaluate(() => window.disposedPlots.length);
        await page.evaluate(() => Promise.all(window.releasePlots.map(release => release())));
        await page.waitForFunction(before => window.disposedPlots.length > before, purgesBeforeCompletion);
        assert.equal(await page.locator('#POS_OFFSETS .js-plotly-plot').count(), 0, 'late newPlot completion cannot resurrect a reset plot');
        assert.ok(await page.evaluate(() => window.disposedPlots.every(plot => !plot.isConnected)), 'late render is disposed');
    } finally { await page.close(); }
    const interrupted = await context.newPage();
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    let observe;
    const requested = new Promise(resolve => { observe = resolve; });
    await interrupted.route('**/*plotly*.js*', async route => { observe(); await hold; await route.abort().catch(() => {}); });
    try {
        await interrupted.goto(origin + base + 'HardwareReportParameters/', { waitUntil: 'commit' });
        await Promise.race([requested, new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error('Expected held vendor request')), 15000);
            requested.then(() => clearTimeout(timer));
        })]);
        await interrupted.goto(origin + base, { waitUntil: 'domcontentloaded' });
        release();
        assert.equal(await interrupted.locator('#POS_OFFSETS .js-plotly-plot').count(), 0);
    } finally { release(); await interrupted.close(); }
}

/** Runs the application directly, proving gateway routing does not mask app Worker or Vite failures. */
async function checkIndependent(browser, mode, base, fixtures, expected) {
    const server = await startServer(mode, base, true);
    const context = await browser.newContext({ acceptDownloads: true });
    context.setDefaultTimeout(15000);
    const errors = [];
    await context.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
    try {
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await checkWorkflow(page, server.origin, base, fixtures, expected);
        assert.deepEqual(errors, [], 'independent app has no unhandled errors');
    } finally { await context.close(); await server.stop(); }
}

test('HardwareReport parameter workflow matches unchanged legacy in real Chromium', { timeout: 900000 }, async t => {
    const fixtures = require('./fixtures.cjs');
    const sources = await legacySources();
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
    try {
        for (const base of ['/Tools/WebTools/', '/']) {
            await build(base);
            for (const mode of ['dev', 'preview']) {
                await t.test(`${mode} ${base}`, { timeout: 180000 }, async () => {
                    const server = await startServer(mode, base);
                    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
                    context.setDefaultTimeout(15000);
                    const errors = [];
                    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
                    await context.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
                    try {
                        await checkRoutes(context, server.origin, base, sources);
                        const expected = await legacyReference(context, server.origin, base, sources, fixtures);
                        const page = await context.newPage();
                        await checkWorkflow(page, server.origin, base, fixtures, expected);
                        await checkInterruptedReads(page, fixtures, expected);
                        await checkPlotLifecycle(context, server.origin, base, fixtures[0]);
                        await checkIndependent(browser, mode, base, fixtures, expected);
                        assert.deepEqual(errors, [], 'no unhandled browser errors');
                    } catch (error) { console.error(error); throw error; } finally { await context.close(); await server.stop(); }
                });
            }
        }
    } finally { await browser.close(); }
});
