const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');
const { legacyReference, source } = require('./legacy.cjs');
const root = path.resolve(__dirname, '../../..');
const plotIds = ['thrust-expo-plot', 'thrust-error-plot', 'thrust-pwm-plot'];
// Same JS evaluation order is expected; tolerate only floating-point renderer roundoff.
const tolerance = 2e-12;

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
    const child = spawn('corepack', ['pnpm', 'build'], {
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

/** Compares every authored trace coordinate and marker while ignoring vendor-added defaults. */
function compare(expected, actual, location = 'plot') {
    if (typeof expected === 'number') {
        assert.equal(typeof actual, 'number', location);
        assert.ok(Math.abs(expected - actual) <= tolerance * Math.max(1, Math.abs(expected)), `${location}: ${expected} != ${actual}`);
    } else if (Array.isArray(expected)) {
        assert.ok(Array.isArray(actual), location);
        assert.equal(actual.length, expected.length, location);
        expected.forEach((value, index) => compare(value, actual[index], `${location}[${index}]`));
    } else if (expected && typeof expected === 'object') {
        for (const [key, value] of Object.entries(expected)) compare(value, actual?.[key], `${location}.${key}`);
    } else assert.equal(actual, expected, location);
}

/** Waits for debounced fitting and verifies all three real Plotly figures against the legacy VM. */
async function checkSnapshot(page, expected) {
    await page.waitForFunction(({ expected, ids }) => {
        const plots = ids.map(id => document.querySelector(`#${id}.js-plotly-plot, #${id} .js-plotly-plot`));
        return plots.every((plot, index) => plot?.data?.length === expected.plots[index].data.length)
            && document.getElementById('MOT_THST_EXPO')?.value === expected.expo
            && document.getElementById('MOT_THST_HOVER')?.value === expected.hover;
    }, { expected, ids: plotIds });
    // The table debounce is 100ms; wait for each complete curve, not only formatted expo.
    await page.waitForFunction(({ expected, ids, tolerance }) => ids.every((id, index) => {
        const plot = document.querySelector(`#${id}.js-plotly-plot, #${id} .js-plotly-plot`);
        return expected.plots[index].data.every((trace, t) => ['x', 'y'].every(axis => trace[axis].every((value, i) => {
            const actual = plot.data[t]?.[axis]?.[i];
            return value === actual || (typeof value === 'number' && Math.abs(value - actual) <= tolerance * Math.max(1, Math.abs(value)));
        })));
    }), { expected, ids: plotIds, tolerance });
    const plots = await page.evaluate(ids => ids.map(id => {
        const plot = document.querySelector(`#${id}.js-plotly-plot, #${id} .js-plotly-plot`);
        return { data: plot.data, shapes: plot.layout.shapes, annotations: plot.layout.annotations };
    }), plotIds);
    expected.plots.forEach((plot, index) => compare(plot, plots[index], plotIds[index]));
    assert.equal(await page.locator('.tabulator').count(), 1);
    assert.equal(await page.locator('.js-plotly-plot').count(), 3);
}

/** Checks public files, same-origin destinations, prefix isolation and genuine asset misses. */
async function checkRoutes(context, page, origin, base) {
    for (const file of ['ThrustExpo/params.json', 'ThrustExpo/ThrustExpo.css', 'ThrustExpo/ThrustExpo.js']) {
        const response = await context.request.get(origin + base + file);
        assert.equal(response.status(), 200, file);
        assert.deepEqual(await response.body(), Buffer.from(source(file)), `${file} preserves actual base bytes`);
    }
    const redirect = await context.request.get(origin + base + 'ThrustExpo?test=a%20b', { maxRedirects: 0 });
    assert.ok([301, 302, 307, 308].includes(redirect.status()));
    assert.equal(new URL(redirect.headers().location, origin).href, origin + base + 'ThrustExpo/?test=a%20b');
    for (const missing of ['ThrustExpo/missing.html', 'ThrustExpo/assets/missing.js', 'ThrustExpo/not-found']) {
        const response = await context.request.get(origin + base + missing);
        assert.equal(response.status(), 404, missing);
        assert.doesNotMatch(await response.text(), /<div id="root"><\/div>/);
    }
    if (base !== '/') assert.equal((await context.request.get(origin + '/ThrustExpo/')).status(), 404);
    await page.goto(origin + base);
    await page.locator(`a[href="${base}Dev"], a[href="${base}Dev/"]`).first().click();
    await page.locator(`a[href="${base}ThrustExpo"], a[href="${base}ThrustExpo/"]`).first().click();
    await page.locator('#load-example').waitFor();
}

/** Reads actual browser-download bytes; no implementation serialization is reused. */
async function checkDownload(page, legacy) {
    const event = page.waitForEvent('download');
    await page.locator('#save-params').click();
    const download = await event;
    assert.equal(download.suggestedFilename(), 'ThrustExpo.param');
    assert.deepEqual(await fs.readFile(await download.path()), await legacy.download());
}

/** Changes a visible metadata control and commits its native change event. */
async function changeParameter(page, id, value) {
    await page.locator('#' + id).fill(String(value));
    await page.locator('#' + id).press('Tab');
}

/** Exercises example fitting, hover, manual expo, actual table editing, paste and import/export. */
async function checkControls(page, origin, base) {
    const legacy = legacyReference();
    await page.goto(origin + base + 'ThrustExpo/');
    await page.locator('#load-example').click();
    await checkSnapshot(page, legacy.example());
    assert.equal(await page.title(), 'ArduPilot Thrust Expo');
    for (const [id, step] of [['MOT_THST_EXPO', '0.001'], ['MOT_SPIN_MIN', '0.01'], ['MOT_PWM_MIN', '1']]) assert.equal(await page.locator('#' + id).getAttribute('step'), step);
    assert.equal(await page.locator('#MOT_THST_HOVER').getAttribute('placeholder'), '?');
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname));
    assert.ok(resources.every(resource => !/\/(?:ThrustExpo|Array_Math|Param_Helpers|ParameterMetadata)\.js$/.test(resource)), 'owned legacy scripts are not executed');
    await page.locator('#reset').hover();
    await page.locator('.tippy-content').filter({ hasText: 'Clear data and reset the web tool.' }).waitFor();
    await page.locator('#load-example').hover();
    await checkDownload(page, legacy);
    for (const [id, value] of [['COPTER_AUW', 4], ['MOTOR_COUNT', 6], ['MOT_THST_EXPO', -0.35], ['MOT_THST_EXPO', 0], ['MOT_PWM_MIN', 1050], ['COPTER_AUW', 0]]) {
        await changeParameter(page, id, value);
        await checkSnapshot(page, legacy.parameter(id, value));
        await checkDownload(page, legacy);
    }
    const cell = page.locator('.tabulator-row').first().locator('[tabulator-field="thrust"]');
    await cell.dblclick();
    await cell.locator('input').fill('0.25');
    await cell.locator('input').press('Enter');
    const rows = legacy.data(); rows[0].thrust = '0.25';
    await checkSnapshot(page, legacy.rows(rows));
    await checkDownload(page, legacy);
    // Dispatch an actual browser ClipboardEvent into the real range-selected table.
    const pwmCell = page.locator('.tabulator-row').first().locator('[tabulator-field="pwm"]');
    await pwmCell.click();
    await pwmCell.evaluate(node => {
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', '1000\t0.3\t21\t0.05\n1100\t0.4\t21\t0.2');
        node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    });
    rows[0] = { pwm: 1000, thrust: 0.3, voltage: 21, current: 0.05 };
    rows[1] = { pwm: 1100, thrust: 0.4, voltage: 21, current: 0.2 };
    await checkSnapshot(page, legacy.rows(rows));
    await checkDownload(page, legacy);
    // Reset replaces table lifetimes while stable plots preserve native Reset axes history.
    const purgedBeforeReset = await page.evaluate(() => window.__thrustProbe.purged.length);
    for (let iteration = 0; iteration < 3; iteration++) {
        const retainedRange = await page.evaluate(() => document.querySelector('#thrust-pwm-plot .js-plotly-plot').layout.xaxis.range);
        await page.locator('#reset').click();
        await page.waitForFunction(() => document.getElementById('MOT_THST_EXPO')?.value === '0.65');
        await page.locator('.tabulator').waitFor();
        assert.equal(await page.locator('.tabulator').count(), 1);
        await page.waitForFunction(range => JSON.stringify(document.querySelector('#thrust-pwm-plot .js-plotly-plot')?.layout?.xaxis?.range) === JSON.stringify(range), retainedRange);
        await changeParameter(page, 'MOT_PWM_MIN', 1100);
        assert.deepEqual(await page.evaluate(() => document.querySelector('#thrust-pwm-plot .js-plotly-plot').layout.xaxis.range), retainedRange, 'empty edits retain previous PWM axis');
        await changeParameter(page, 'MOT_PWM_MIN', 1000);
        await page.locator('#load-example').click();
        await checkSnapshot(page, legacyReference().example());
    }
    await page.waitForFunction(() => {
        const probe = window.__thrustProbe;
        return probe.tables.length - probe.destroyed.length === 1;
    });
    const ownership = await page.evaluate(() => {
        const probe = window.__thrustProbe;
        return { destroyed: probe.destroyed.length, purged: probe.purged.length,
            leaked: probe.destroyed.filter(table => probe.listeners.get(table).size > 0).length };
    });
    assert.ok(ownership.destroyed >= 3, 'repeated resets dispose actual table instances');
    assert.equal(ownership.purged, purgedBeforeReset, 'resets preserve existing plot instances and modebar history');
    assert.equal(ownership.leaked, 0, 'destroyed tables retain no owned listeners');
    await page.locator('#reset').click();
    await page.waitForFunction(() => window.__thrustProbe.tables.at(-1)?.getData().length === 10);
    const target = page.locator('.tabulator-row').first().locator('[tabulator-field="pwm"]');
    await target.click();
    await target.evaluate(node => {
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', '1000\t0\n1200\t0.2\n1600\t1\n2000\t2\ninvalid\t3\n1400\t');
        node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    });
    const representative = legacyReference();
    await checkSnapshot(page, representative.rows([
        { pwm: 1000, thrust: 0 }, { pwm: 1200, thrust: 0.2 },
        { pwm: 1600, thrust: 1 }, { pwm: 2000, thrust: 2 },
        { pwm: NaN, thrust: 3 }, { pwm: 1400, thrust: NaN },
    ]));
    await checkDownload(page, representative);
    await page.evaluate(async () => { await window.__thrustProbe.tables.at(-1).getRows().at(-1).scrollTo(); });
    const lastCell = page.locator('.tabulator-row').last().locator('[tabulator-field="pwm"]');
    await lastCell.click();
    const expectedRows = await page.evaluate(() => window.__thrustProbe.tables.at(-1).getRanges()[0].getTopEdge() + 4);
    await lastCell.evaluate(node => {
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', '2100\t2.3\n2200\t2.6\n2300\t3.0');
        node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(expected => window.__thrustProbe.tables.at(-1).getRows().length === expected, expectedRows);
    await checkSnapshot(page, representative.rows([
        { pwm: 1000, thrust: 0 }, { pwm: 1200, thrust: 0.2 },
        { pwm: 1600, thrust: 1 }, { pwm: 2000, thrust: 2 },
        { pwm: NaN, thrust: 3 }, { pwm: 1400, thrust: NaN },
        { pwm: 2100, thrust: 2.3 }, { pwm: 2200, thrust: 2.6 }, { pwm: 2300, thrust: 3 },
    ]));
    await checkDownload(page, representative);
    await page.locator('#load-example').click();
    const imported = legacyReference(); imported.example();
    await page.locator('#paramFile').setInputFiles({ name: 'test.param', mimeType: 'text/plain', buffer: Buffer.from('MOT_SPIN_MAX,0.9\nMOT_THST_EXPO,0.3\nUNKNOWN_PARAM,999\n') });
    imported.parameter('MOT_SPIN_MAX', 0.9);
    await checkSnapshot(page, imported.parameter('MOT_THST_EXPO', 0.3));
    await checkDownload(page, imported);
}

/** Reads zoom state from actual renderer-owned axes in either legacy or migrated DOM. */
async function axisSnapshot(page) {
    return page.evaluate(ids => Object.fromEntries(ids.map(id => {
        const plot = document.querySelector(`#${id}.js-plotly-plot, #${id} .js-plotly-plot`);
        return [id, { x: plot.layout.xaxis.range, y: plot.layout.yaxis.range,
            autoX: plot._fullLayout.xaxis.autorange, autoY: plot._fullLayout.yaxis.autorange }];
    })), plotIds);
}

/** Compares interactions to a complete immutable legacy page using the same pinned real vendors. */
async function checkZoom(context, page, origin, base) {
    const legacy = await context.newPage();
    legacy.on('dialog', dialog => dialog.dismiss());
    await legacy.route('**/ThrustExpo/params.json', route => route.fulfill({ contentType: 'application/json', body: source('ThrustExpo/params.json') }));
    await legacy.route('**/ThrustExpo/__legacy/**', async route => {
        const filename = new URL(route.request().url()).pathname.split('/__legacy/')[1];
        if (filename !== 'index.html') {
            await route.fulfill({ contentType: 'text/javascript', body: source(filename.startsWith('Libraries/') ? filename : 'ThrustExpo/' + filename) });
            return;
        }
        const html = source('ThrustExpo/index.html')
            .replace('<head>', `<head><base href="${origin}${base}ThrustExpo/">`)
            .replaceAll('../modules/build/floating-ui/dist/umd/popper.min.js', 'vendor/popper.min.js')
            .replaceAll('../modules/build/tippyjs/dist/tippy-bundle.umd.min.js', 'vendor/tippy-bundle.umd.min.js')
            .replaceAll('../modules/plotly.js/dist/plotly.min.js', 'vendor/plotly.min.js')
            .replaceAll('../modules/tabulator/dist/js/tabulator.min.js', 'vendor/tabulator.min.js')
            .replaceAll('../modules/tabulator/dist/css/tabulator.min.css', 'vendor/tabulator.min.css')
            .replaceAll('../Libraries/', '__legacy/Libraries/')
            .replace('src="ThrustExpo.js"', 'src="__legacy/ThrustExpo.js"');
        await route.fulfill({ contentType: 'text/html', body: html });
    });
    try {
        await legacy.goto(origin + base + 'ThrustExpo/__legacy/index.html');
        await legacy.waitForFunction(() => document.getElementById('MOT_PWM_MIN')?.title.includes('min PWM'));
        await page.goto(origin + base + 'ThrustExpo/');
        for (const target of [legacy, page]) {
            await target.locator('#load-example').click();
            await target.waitForFunction(() => document.querySelector('#thrust-expo-plot.js-plotly-plot, #thrust-expo-plot .js-plotly-plot')?.data?.length === 3);
            await target.evaluate(async ids => {
                for (const id of ids) {
                    const plot = document.querySelector(`#${id}.js-plotly-plot, #${id} .js-plotly-plot`);
                    await window.Plotly.relayout(plot, { 'xaxis.range': id.includes('pwm') ? [1200, 1800] : [20, 70], 'yaxis.range': [0.3, 1.7] });
                }
            }, plotIds);
        }
        compare(await axisSnapshot(legacy), await axisSnapshot(page), 'initial zoom');
        for (const [id, value] of [['COPTER_AUW', '4'], ['MOT_PWM_MIN', '1050'], ['reset', null], ['load-example', null]]) {
            for (const target of [legacy, page]) {
                if (value === null) await target.locator('#' + id).click();
                else await changeParameter(target, id, value);
                await target.waitForFunction(({ id, value }) => {
                    const plot = document.querySelector('#thrust-expo-plot.js-plotly-plot, #thrust-expo-plot .js-plotly-plot');
                    if (id === 'reset') return plot?.data?.length === 0;
                    if (id === 'load-example') return plot?.data?.length === 3;
                    if (id === 'COPTER_AUW') return plot?.data?.[2]?.y?.[0] === Number(value) / 4;
                    const pwm = document.querySelector('#thrust-pwm-plot.js-plotly-plot, #thrust-pwm-plot .js-plotly-plot');
                    return pwm?.layout?.xaxis?.range?.[0] === Number(value);
                }, { id, value });
            }
            compare(await axisSnapshot(legacy), await axisSnapshot(page), `zoom after ${id}`);
        }
        for (const target of [legacy, page]) {
            for (const id of plotIds) await target.locator(`#${id} [data-title="Reset axes"]`).click({ force: true });
            await target.waitForFunction(ids => ids.every(id => document.querySelector(`#${id}.js-plotly-plot, #${id} .js-plotly-plot`)?._fullLayout?.yaxis?.autorange === true), plotIds);
        }
        compare(await axisSnapshot(legacy), await axisSnapshot(page), 'native modebar Reset axes after reset/example');
    } finally { await legacy.close(); }
}

/** Verifies complete React unmount releases every instrumented vendor instance and listener. */
async function checkDisposed(page) {
    await page.waitForFunction(() => {
        const probe = window.__thrustProbe;
        return document.getElementById('root').childElementCount === 0
            && probe.tables.length === probe.destroyed.length
            && probe.plots.every(node => probe.purged.includes(node));
    });
    assert.equal(await page.evaluate(() => window.__thrustProbe.destroyed.filter(table => window.__thrustProbe.listeners.get(table).size > 0).length), 0);
    assert.equal(await page.locator('.js-plotly-plot, .tabulator, [data-tippy-root]').count(), 0);
}

/** Interrupts actual table/plot operations and delayed real FileReaders after React has mounted. */
async function checkInterruptions(page) {
    await page.evaluate(() => sessionStorage.setItem('__thrustHoldInitial', '1'));
    await page.reload();
    await page.waitForFunction(() => window.__thrustProbe.pending.length >= 4);
    assert.equal(await page.evaluate(() => window.__thrustProbe.reactCalls), 0, 'initial plot promises remain pending before the first react');
    await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
        const probe = window.__thrustProbe; probe.hold = false;
        for (const resolve of probe.pending.splice(0)) resolve();
        sessionStorage.removeItem('__thrustHoldInitial');
    });
    await checkDisposed(page);
    assert.equal(await page.evaluate(() => window.__thrustProbe.reactCalls), 0, 'disposing initial newPlot prevents deferred first react');
    await page.reload();
    await page.locator('#load-example').click();
    await checkSnapshot(page, legacyReference().example());
    await page.evaluate(() => { window.__thrustProbe.hold = true; });
    await page.locator('#reset').click();
    await page.waitForFunction(() => window.__thrustProbe.pending.length >= 4);
    await page.locator('#reset').click();
    await page.waitForFunction(() => window.__thrustProbe.pending.length >= 5);
    await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
        const probe = window.__thrustProbe; probe.hold = false;
        for (const resolve of probe.pending.splice(0)) resolve();
    });
    await checkDisposed(page);
    await page.reload();
    await page.locator('#load-example').click();
    await checkSnapshot(page, legacyReference().example());
    await page.evaluate(() => { window.__thrustProbe.holdFiles = true; });
    await page.locator('#paramFile').setInputFiles({ name: 'old.param', mimeType: 'text/plain', buffer: Buffer.from('COPTER_AUW,99') });
    await page.waitForFunction(() => window.__thrustProbe.files.length === 1);
    await page.locator('#paramFile').setInputFiles({ name: 'new.param', mimeType: 'text/plain', buffer: Buffer.from('COPTER_AUW,4') });
    await page.waitForFunction(() => window.__thrustProbe.files.length === 2);
    await page.evaluate(() => {
        const probe = window.__thrustProbe;
        probe.files[1](); probe.files[0]();
    });
    const latest = legacyReference(); latest.example();
    await checkSnapshot(page, latest.parameter('COPTER_AUW', 4));
    await page.locator('#paramFile').setInputFiles({ name: 'reset.param', mimeType: 'text/plain', buffer: Buffer.from('COPTER_AUW,99') });
    await page.waitForFunction(() => window.__thrustProbe.files.length === 3);
    await page.locator('#reset').click();
    await page.evaluate(() => { window.__thrustProbe.files[2](); window.__thrustProbe.holdFiles = false; });
    await page.waitForFunction(() => document.getElementById('COPTER_AUW').value === '0');
    await page.locator('#load-example').click();
    await checkSnapshot(page, legacyReference().example());
    assert.ok(await page.evaluate(() => window.__thrustProbe.aborted >= 2), 'superseded and reset reads are aborted');
    for (let iteration = 0; iteration < 3; iteration++) {
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
        assert.equal(await page.locator('#load-example').count(), 1, 'BFCache pagehide preserves the mounted app');
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
        await checkDisposed(page);
        await page.reload();
        await page.locator('#load-example').click();
        await checkSnapshot(page, legacyReference().example());
    }
}

/** Repeats full navigations, aborts startup and proves vendor failure recovery without external access. */
async function checkNavigation(context, page, origin, base) {
    for (let iteration = 0; iteration < 3; iteration++) {
        await page.goto(origin + base + 'Dev/');
        await page.goto(origin + base + 'ThrustExpo/');
        await page.locator('#load-example').click();
        await checkSnapshot(page, legacyReference().example());
    }
    const failing = await context.newPage();
    await failing.route('**/*plotly*.js*', route => route.abort());
    try {
        await failing.goto(origin + base + 'ThrustExpo/');
        await failing.getByRole('alert').first().waitFor();
        await failing.unroute('**/*plotly*.js*');
        await failing.reload();
        await failing.locator('#load-example').click();
        await checkSnapshot(failing, legacyReference().example());
    } finally { await failing.close(); }
    for (const pattern of ['**/*tabulator.min.js*', '**/ThrustExpo/params.json']) {
        const unavailable = await context.newPage();
        await unavailable.route(pattern, route => route.abort());
        try {
            await unavailable.goto(origin + base + 'ThrustExpo/');
            await unavailable.getByRole('alert').first().waitFor();
            await unavailable.unroute(pattern);
            await unavailable.reload();
            await unavailable.locator('#load-example').click();
            await checkSnapshot(unavailable, legacyReference().example());
        } finally { await unavailable.close(); }
    }
    const delayed = await context.newPage();
    let releaseMetadata;
    const metadataHeld = new Promise(resolve => { releaseMetadata = resolve; });
    await delayed.route('**/ThrustExpo/params.json', async route => { await metadataHeld; await route.abort().catch(() => {}); });
    try {
        await delayed.goto(origin + base + 'ThrustExpo/');
        await delayed.locator('#load-example').click();
        await checkSnapshot(delayed, legacyReference().example());
        await delayed.goto(origin + base + 'Dev/');
    } finally { releaseMetadata(); await delayed.close(); }
    const interrupted = await context.newPage();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let observed;
    const requested = new Promise(resolve => { observed = resolve; });
    await interrupted.route('**/*plotly*.js*', async route => { observed(); await held; await route.abort().catch(() => {}); });
    try {
        await interrupted.goto(origin + base + 'ThrustExpo/', { waitUntil: 'commit' });
        await requested;
        await interrupted.goto(origin + base, { waitUntil: 'domcontentloaded' });
    } finally { release(); await interrupted.close(); }
}

/** Instruments actual vendor instances without substituting their implementation. */
function instrumentVendors() {
    const probe = window.__thrustProbe = { tables: [], destroyed: [], purged: [], plots: [], listeners: new Map(), reactCalls: 0, hold: location.protocol === 'http:' && sessionStorage.getItem('__thrustHoldInitial') === '1', pending: [], holdFiles: false, files: [], aborted: 0 };
    const NativeReader = window.FileReader;
    window.FileReader = class extends NativeReader {
        /** Delay the real reader at its resource boundary for deterministic supersession. */
        readAsText(file) {
            if (!probe.holdFiles) return super.readAsText(file);
            probe.files.push(() => super.readAsText(file));
        }
        /** Record ownership cancellation while retaining native abort behavior. */
        abort() { probe.aborted++; return super.abort(); }
    };
    let tabulator;
    Object.defineProperty(window, 'Tabulator', {
        configurable: true,
        /** Returns the instrumented constructor after the pinned script assigns it. */
        get() { return tabulator; },
        /** Wraps ownership methods while every vendor operation remains real. */
        set(value) {
            tabulator = new Proxy(value, {
                /** Records each independently constructed table and its disposal. */
                construct(target, args) {
                    const table = Reflect.construct(target, args);
                    probe.tables.push(table);
                    const setData = table.setData.bind(table);
                    table.setData = async rows => {
                        const result = await setData(rows);
                        if (probe.hold) await new Promise(resolve => probe.pending.push(resolve));
                        return result;
                    };
                    const listeners = new Set(); probe.listeners.set(table, listeners);
                    const on = table.on.bind(table), off = table.off.bind(table), destroy = table.destroy.bind(table);
                    table.on = (name, callback) => { listeners.add(callback); return on(name, callback); };
                    table.off = (name, callback) => { listeners.delete(callback); return off(name, callback); };
                    table.destroy = () => { probe.destroyed.push(table); return destroy(); };
                    return table;
                },
            });
        },
    });
    let plotly;
    Object.defineProperty(window, 'Plotly', {
        configurable: true,
        /** Returns the actual plotting library. */ get() { return plotly; },
        /** Records plot disposal while delegating rendering and resource cleanup. */
        set(value) {
            plotly = value;
            const newPlot = value.newPlot.bind(value);
            value.newPlot = async (...args) => {
                probe.plots.push(args[0]);
                const result = await newPlot(...args);
                if (probe.hold) await new Promise(resolve => probe.pending.push(resolve));
                return result;
            };
            const react = value.react.bind(value);
            value.react = async (...args) => {
                probe.reactCalls++;
                const result = await react(...args);
                if (probe.hold) await new Promise(resolve => probe.pending.push(resolve));
                return result;
            };
            const purge = value.purge.bind(value);
            value.purge = node => { probe.purged.push(node); return purge(node); };
        },
    });
}

test('ThrustExpo real Chromium legacy parity and independent Worker routing', { timeout: 900000 }, async t => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
    try {
        for (const base of ['/Tools/WebTools/', '/']) {
            await build(base);
            for (const mode of ['dev', 'preview']) await t.test(`${mode} ${base}`, { timeout: 180000 }, async () => {
                const server = await startServer(mode, base);
                const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
                await context.addInitScript(instrumentVendors);
                context.setDefaultTimeout(10000);
                const errors = [];
                context.on('page', page => { page.on('pageerror', error => { errors.push(error.message); console.error('Browser exception:', error.stack); }); page.on('console', message => { if (message.type() === 'error') console.error('Browser console:', message.text()); }); });
                await context.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
                try {
                    const page = await context.newPage();
                    await checkRoutes(context, page, server.origin, base);
                    await checkControls(page, server.origin, base);
                    await checkZoom(context, page, server.origin, base);
                    await checkInterruptions(page);
                    await checkNavigation(context, page, server.origin, base);
                    assert.deepEqual(errors, [], 'no uncaught browser errors');
                } catch (error) { console.error(error); throw error; } finally { await context.close(); await server.stop(); }
            });
        }
    } finally { await browser.close(); }
});
