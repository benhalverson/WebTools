const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const plotIds = ['waypoint_plot', 'pos_plot', 'vel_plot', 'accel_plot', 'jerk_plot', 'snap_plot'];
// The same checked-in WASM executes in both environments; allow only floating-point roundoff.
const tolerance = 1e-10;

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
    const child = spawn('corepack', ['pnpm@10.23.0', 'build'], {
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

/** Recursively checks every legacy-owned trace field, tolerating numerical roundoff only. */
function compare(expected, actual, location = 'plot') {
    // The pinned Plotly renderer expands scalar titles in-place; Node parity checks the original input shape.
    if (location.endsWith('.title') && typeof expected === 'string' && typeof actual === 'object') {
        assert.equal(actual.text, expected, location);
    } else if (typeof expected === 'number') {
        assert.equal(typeof actual, 'number', location);
        assert.ok(Object.is(expected, actual) || Math.abs(expected - actual) <= tolerance * Math.max(1, Math.abs(expected)), `${location}: ${expected} != ${actual}`);
    } else if (Array.isArray(expected)) {
        assert.ok(Array.isArray(actual), location);
        assert.equal(actual.length, expected.length, `${location}.length`);
        for (let index = 0; index < expected.length; index++) {
            const value = expected[index], received = actual[index];
            // Avoid millions of assertion allocations on successful numerical samples.
            if (typeof value === 'number') {
                if (typeof received !== 'number' || !(Object.is(value, received) || Math.abs(value - received) <= tolerance * Math.max(1, Math.abs(value)))) {
                    assert.fail(`${location}[${index}]: ${value} != ${received}`);
                }
            } else compare(value, received, `${location}[${index}]`);
        }
    } else if (expected && typeof expected === 'object') {
        assert.ok(actual && typeof actual === 'object', location);
        for (const [key, value] of Object.entries(expected)) compare(value, actual[key], `${location}.${key}`);
    } else assert.equal(actual, expected, location);
}

/** Waits for all six real Plotly surfaces and returns their serialized public traces. */
async function snapshot(page) {
    await page.waitForFunction(ids => ids.every(id => {
        const plot = document.querySelector(`#${id} .js-plotly-plot, #${id}.js-plotly-plot`);
        return plot?.classList.contains('js-plotly-plot') && plot.data?.some(trace => trace.x?.length > 0);
    }), plotIds, { timeout: process.env.SCURVE_DEBUG ? 1000 : 60000 });
    return page.evaluate(ids => Object.fromEntries(ids.map(id => {
        const plot = document.querySelector(`#${id} .js-plotly-plot, #${id}.js-plotly-plot`);
        return [id, { data: JSON.parse(JSON.stringify(plot.data)), dimensions: [plot.clientWidth, plot.clientHeight], surfaces: document.querySelectorAll(`#${id}`).length }];
    })), plotIds);
}

/** Compares every trace with the actual-base oracle after asynchronous rendering settles. */
async function comparePlots(page, expected) {
    await page.getByRole('status').waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(element => /calculat|loading/i.test(element.textContent)), null, { timeout: 60000 });
    // A ready calculation can precede asynchronous Plotly.react completion.
    const signatures = Object.fromEntries(plotIds.map(id => [id, expected[id].data.map(trace =>
        Object.fromEntries(['x', 'y', 'z'].filter(axis => Array.isArray(trace[axis])).map(axis => {
            const values = trace[axis];
            return [axis, { length: values.length, samples: [0, Math.floor(values.length / 2), values.length - 1].filter(index => index >= 0 && index < values.length).map(index => [index, values[index]]) }];
        })))]));
    await page.waitForFunction(({ signatures, tolerance }) => Object.entries(signatures).every(([id, traces]) => {
        const plot = document.querySelector(`#${id} .js-plotly-plot, #${id}.js-plotly-plot`);
        return plot?.data?.length === traces.length && traces.every((trace, index) => Object.entries(trace).every(([axis, expected]) => {
            const values = plot.data[index][axis];
            return values?.length === expected.length && expected.samples.every(([offset, value]) =>
                values[offset] === value || Math.abs(values[offset] - value) <= tolerance * Math.max(1, Math.abs(value)));
        }));
    }), { signatures, tolerance }, { timeout: process.env.SCURVE_DEBUG ? 10000 : 60000 }).catch(async error => {
        console.error('Plot readiness:', await page.evaluate(() => ({ body: document.body.innerHTML.slice(0, 1500), scripts: [...document.scripts].map(script => script.src), status: document.querySelector('[role="status"]')?.textContent, alerts: [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent), plots: [...document.querySelectorAll('.js-plotly-plot')].map(node => ({ id: node.parentElement.id, lengths: node.data?.map(trace => trace.x?.length) })) })));
        const actual = await snapshot(page);
        for (const id of plotIds) compare(expected[id].data, actual[id].data, id);
        throw error;
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const actual = await snapshot(page);
    for (const id of plotIds) {
        compare(expected[id].data, actual[id].data, id);
        assert.deepEqual(actual[id].dimensions, [1130, id === 'waypoint_plot' ? 1130 : 300], `${id} retains legacy layout`);
        assert.equal(actual[id].surfaces, 1, 'one plot surface per lifecycle');
    }
}

/** Checks the public directory, retained files, exact WASM bytes and genuine misses. */
async function checkRoutes(context, page, origin, base) {
    const target = origin + base + 'SCurveTool';
    const redirect = await context.request.get(target + '?test=a%20b', { maxRedirects: 0 });
    assert.ok([301, 302, 307, 308].includes(redirect.status()));
    assert.equal(new URL(redirect.headers().location, target).href, target + '/?test=a%20b');
    await page.goto(target + '?test=a%20b#plot');
    assert.equal(page.url(), target + '/?test=a%20b#plot');
    for (const file of ['Readme.md', 'params.json', 'ardupilot/wpnav.js', 'ardupilot/wpnav.wasm']) {
        const response = await context.request.get(target + '/' + file);
        assert.equal(response.status(), 200, file);
        assert.deepEqual(await response.body(), await fs.readFile(path.join(root, 'SCurveTool', file)), `${file} exact bytes`);
    }
    for (const suffix of ['absent', 'assets/missing.js', 'ardupilot/missing.wasm']) {
        const response = await context.request.get(target + '/' + suffix);
        assert.equal(response.status(), 404, suffix);
        assert.doesNotMatch(await response.text(), /<div id="root"><\/div>/);
    }
    if (base !== '/') assert.equal((await context.request.get(origin + '/SCurveTool/')).status(), 404);
}

/** Captures a browser download without changing the original serialized parameter bytes. */
async function exportedParameters(page) {
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export parameters', exact: true }).click();
    const download = await downloaded;
    return fs.readFile(await download.path());
}

/** Exercises state, recalculation, display toggles, parameter import/export and reset. */
async function checkControls(page, origin, base, oracle) {
    await page.goto(origin + base + 'SCurveTool/');
    assert.equal(await page.title(), 'ArduPilot SCurve plotter');
    await comparePlots(page, await oracle.runLegacy({}));
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname));
    assert.ok(resources.includes(base + 'SCurveTool/ardupilot/wpnav.wasm'), 'real prefixed WASM request');
    assert.ok(!resources.some(resource => resource.endsWith('/SCurveTool.js')), 'owned legacy page script is not executed');
    const original = await exportedParameters(page);
    const settings = { WP_SPD: '7.5', WP_JERK: '2', ATC_INPUT_TC: '0.2', curr_wp_x: '250' };
    for (const [id, value] of Object.entries(settings)) {
        await page.locator('#' + id).fill(value);
        await page.locator('#' + id).press('Tab');
    }
    await page.getByRole('button', { name: 'Recalculate', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Calculating' }).waitFor();
    const expected = await oracle.runLegacy(settings);
    await comparePlots(page, expected);
    for (let iteration = 0; iteration < 2; iteration++) {
        await page.getByRole('button', { name: 'Recalculate', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Calculating' }).waitFor();
        await comparePlots(page, expected);
    }
    for (const color of ['acceleration', 'jerk', 'none', 'velocity']) {
        const id = { acceleration: 'display_wp_accel', jerk: 'display_wp_jerk', velocity: 'display_wp_vel', none: 'display_wp_jerk' }[color];
        await page.locator('#' + id).setChecked(color !== 'none');
        await comparePlots(page, await oracle.runLegacy(settings, { color, radius: false }));
    }
    await page.locator('#display_wp_radius').check();
    await comparePlots(page, await oracle.runLegacy(settings, { color: 'velocity', radius: true }));
    await page.locator('#WP_RADIUS_M').fill('');
    await page.getByRole('alert').filter({ hasText: 'finite number' }).waitFor();
    await comparePlots(page, await oracle.runLegacy(settings, { color: 'velocity', radius: true }));
    await page.locator('#WP_RADIUS_M').fill('50.0');
    await comparePlots(page, await oracle.runLegacy(settings, { color: 'velocity', radius: true }));
    await page.locator('#display_wp_radius').uncheck();
    const changed = await exportedParameters(page);
    assert.notDeepEqual(changed, original);
    await page.locator('#WP_SPD').fill('9');
    await page.locator('#parameter-file').setInputFiles({ name: 'settings.param', mimeType: 'text/plain', buffer: changed });
    await page.waitForFunction(() => document.getElementById('WP_SPD').value === '7.5');
    assert.equal(await page.locator('#WP_SPD').inputValue(), '7.5');
    assert.deepEqual(await exportedParameters(page), changed, 'parameter-file exact byte round trip');
    await page.locator('#parameter-file').setInputFiles({ name: 'invalid.param', mimeType: 'text/plain', buffer: Buffer.from('WP_SPD,not-a-number\n') });
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('#WP_SPD').inputValue(), '7.5', 'failed import leaves settings intact');
    await page.locator('#parameter-file').setInputFiles({ name: 'settings.param', mimeType: 'text/plain', buffer: changed });
    await comparePlots(page, expected);
    await page.getByRole('button', { name: 'Reset settings', exact: true }).click();
    await comparePlots(page, await oracle.runLegacy({}));
    assert.deepEqual(await exportedParameters(page), original, 'reset restores exact defaults');
    // Raw incomplete drafts stay editable without entering native numerical work.
    await page.locator('#WP_SPD').fill('');
    await page.getByRole('alert').filter({ hasText: 'finite number' }).waitFor();
    await page.locator('#WP_SPD').fill('10');
    await comparePlots(page, await oracle.runLegacy({}));
}

/** Aborts vendor/WASM loading and repeats navigation to check resource recovery and disposal. */
async function checkLifecycle(context, page, origin, base, oracle) {
    const app = origin + base + 'SCurveTool/';
    for (let iteration = 0; iteration < 3; iteration++) {
        await page.goto(origin + base);
        await page.goto(app);
        await comparePlots(page, await oracle.runLegacy({}));
    }
    for (const pattern of ['**/wpnav.wasm', '**/*plotly*.js*']) {
        const unavailable = await context.newPage();
        await unavailable.route(pattern, route => route.abort());
        try {
            await unavailable.goto(app);
            await unavailable.getByRole('alert').waitFor({ timeout: 60000 });
            await unavailable.unroute(pattern);
            await unavailable.reload();
            await comparePlots(unavailable, await oracle.runLegacy({}));
        } finally { await unavailable.close(); }
        const interrupted = await context.newPage();
        let release;
        let observed;
        const held = new Promise(resolve => { release = resolve; });
        const requested = new Promise(resolve => { observed = resolve; });
        await interrupted.route(pattern, async route => { observed(); await held; await route.abort().catch(() => {}); });
        try {
            await interrupted.goto(app, { waitUntil: 'commit' });
            await Promise.race([requested, new Promise((_, reject) => {
                const timer = setTimeout(() => reject(new Error('Resource request not observed: ' + pattern)), 15000);
                requested.then(() => clearTimeout(timer));
            })]);
            await interrupted.goto(origin + base, { waitUntil: 'domcontentloaded' });
        } finally { release(); await interrupted.close(); }
    }
}

/** Exercises the application entry lifecycle disposal against real built vendor resources. */
async function checkOwnedCleanup(page, origin, base) {
    await page.goto(origin + base + 'SCurveTool/');
    await snapshot(page);
    await page.evaluate(async () => {
        const script = [...document.querySelectorAll('script[type="module"]')].find(script => /(?:main\.tsx|assets\/index-)/.test(script.src));
        window.appLifecycle = await import(script.src);
        const vendor = window.Plotly;
        const live = new Set(document.querySelectorAll('.js-plotly-plot'));
        const originalNewPlot = vendor.newPlot;
        const originalPurge = vendor.purge;
        window.lifecycleCounts = { created: 0, purged: 0, live };
        /** Count actual renderer nodes allocated during restored app mounts. */
        vendor.newPlot = function(node, ...args) { live.add(node); window.lifecycleCounts.created++; return originalNewPlot.call(this, node, ...args); };
        /** Count and dispose actual renderer nodes owned by unmounted apps. */
        vendor.purge = function(node) { if (live.delete(node)) window.lifecycleCounts.purged++; return originalPurge.call(this, node); };
    });
    for (let index = 0; index < 3; index++) {
        await page.evaluate(() => window.appLifecycle.unmount());
        assert.equal(await page.locator('.js-plotly-plot').count(), 0, 'explicit unmount removes all plot nodes');
        assert.equal(await page.evaluate(() => window.lifecycleCounts.live.size), 0, 'explicit unmount purges vendor resources');
        await page.evaluate(() => window.appLifecycle.mount());
        await snapshot(page);
    }
    await page.evaluate(() => { window.appLifecycle.unmount(); window.appLifecycle.mount(); window.appLifecycle.unmount(); });
    assert.equal(await page.locator('.js-plotly-plot').count(), 0, 'immediately interrupted mount has no nodes');
    await page.evaluate(() => window.appLifecycle.mount());
    await snapshot(page);
    const counts = await page.evaluate(() => ({ created: window.lifecycleCounts.created, purged: window.lifecycleCounts.purged, live: window.lifecycleCounts.live.size }));
    assert.equal(counts.created, 24);
    assert.equal(counts.purged, 24);
    assert.equal(counts.live, 6, 'one restored mount remains active');
}

/** Verifies linked time zoom and complete autorange restoration across scalar plots. */
async function checkLinkedAxes(page) {
    await page.evaluate(() => window.Plotly.relayout(document.querySelector('#pos_plot .js-plotly-plot'), { 'xaxis.range[0]': 5, 'xaxis.range[1]': 10 }));
    await page.waitForFunction(() => ['vel', 'accel', 'jerk', 'snap'].every(name => {
        const plot = document.querySelector(`#${name}_plot .js-plotly-plot`);
        return plot.layout.xaxis.range[0] === 5 && plot.layout.xaxis.range[1] === 10;
    }));
    await page.evaluate(() => window.Plotly.relayout(document.querySelector('#pos_plot .js-plotly-plot'), { 'yaxis.autorange': true }));
    await page.waitForFunction(() => ['vel', 'accel', 'jerk', 'snap'].every(name => {
        const plot = document.querySelector(`#${name}_plot .js-plotly-plot`);
        return plot.layout.xaxis.autorange === true && plot.layout.yaxis.autorange === true;
    }));
    assert.deepEqual(await page.evaluate(() => document.querySelector('#pos_plot .js-plotly-plot').layout.xaxis.range), [5, 10], 'y-only reset retains source time range');
    await page.evaluate(() => window.Plotly.relayout(document.querySelector('#pos_plot .js-plotly-plot'), { 'xaxis.range[0]': 5, 'xaxis.range[1]': 10 }));
    await page.evaluate(async () => {
        await window.Plotly.relayout(document.querySelector('#vel_plot .js-plotly-plot'), { 'yaxis.range[0]': 1, 'yaxis.range[1]': 2 });
        await window.Plotly.relayout(document.querySelector('#pos_plot .js-plotly-plot'), { 'xaxis.autorange': true });
    });
    await page.waitForFunction(() => ['pos', 'vel', 'accel', 'jerk', 'snap'].every(name => {
        const plot = document.querySelector(`#${name}_plot .js-plotly-plot`);
        return plot.layout.xaxis.autorange === true && plot.layout.yaxis.autorange === true;
    }));
}

test('SCurveTool real WASM and browser workflows at root and configured prefix', { timeout: 1200000 }, async t => {
    const legacy = await import('./legacy-oracle.ts');
    const references = new Map();
    const oracle = {
        /** Reuse immutable base-revision outputs across browser modes without rerunning WASM. */
        async runLegacy(values, display) {
            const key = JSON.stringify([values, display]);
            if (!references.has(key)) references.set(key, await legacy.runLegacy(values, display));
            return references.get(key);
        },
    };
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
    try {
        for (const base of (process.env.SCURVE_BASE ? [process.env.SCURVE_BASE] : ['/Tools/WebTools/', '/'])) {
            if (!process.env.SCURVE_SKIP_BUILD) await build(base);
            for (const mode of (process.env.SCURVE_MODE ? [process.env.SCURVE_MODE] : ['dev', 'preview'])) {
                await t.test(`${mode} ${base}`, { timeout: 240000 }, async () => {
                    const server = await startServer(mode, base);
                    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
                    context.setDefaultTimeout(30000);
                    const errors = [];
                    context.on('page', page => { page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.stack); }); page.on('response', response => { if (response.status() >= 400) console.error('Response:', response.status(), response.url()); }); page.on('console', message => { if (message.type() === 'error') console.error('Browser console:', message.text()); }); });
                    await context.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
                    try {
                        const page = await context.newPage();
                        await checkRoutes(context, page, server.origin, base);
                        console.log(`${mode} ${base}: routes passed`);
                        await checkControls(page, server.origin, base, oracle);
                        console.log(`${mode} ${base}: controls and parity passed`);
                        await checkLifecycle(context, page, server.origin, base, oracle);
                        console.log(`${mode} ${base}: navigation and failures passed`);
                        await checkOwnedCleanup(page, server.origin, base);
                        await checkLinkedAxes(page);
                        assert.deepEqual(errors, [], 'no unhandled browser errors');
                    } catch (error) { console.error(error); throw error; } finally { await context.close(); await server.stop(); }
                });
            }
        }
    } finally { await browser.close(); }
});
