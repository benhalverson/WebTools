const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../..');
const axes = ['EulerRoll', 'EulerPitch', 'EulerYaw'];
// Trigonometric roundoff is tolerated; axis order, lengths and labels are exact.
const tolerance = 2e-14;

/** Runs the unchanged legacy page in an isolated DOM stub and returns its public outputs. */
async function legacyReference() {
    const elements = Object.fromEntries(['rotations', ...axes, 'plot'].map(id => [id, {
        value: id === 'rotations' ? '0' : '0', disabled: false, options: [],
        /** Records the exact option values and labels emitted by legacy initialization. */
        appendChild(option) { this.options.push(option); },
    }]));
    const context = vm.createContext({
        document: {
            /** Resolves only the controls owned by the legacy page. */
            getElementById(id) { return elements[id]; },
            /** Creates the option shape used by the retained legacy initialization script. */
            createElement() { return {
                /** Retains legacy option attributes without a browser DOM dependency. */
                setAttribute(name, value) { this[name] = value; },
            }; },
        },
        Plotly: {
            /** Legacy reset can purge without needing a renderer in the calculation oracle. */
            purge() {},
            /** Legacy traces remain readable without executing the vendor renderer. */
            newPlot() {},
            /** Updating the oracle mutates trace data synchronously; rendering is irrelevant. */
            redraw() {},
        },
    });
    for (const file of ['Matrix3.js', 'RotationCheck.js']) {
        vm.runInContext(await fs.readFile(path.join(root, 'RotationCheck', file), 'utf8'), context, { filename: file });
    }
    const html = await fs.readFile(path.join(root, 'RotationCheck/index.html'), 'utf8');
    const initialization = html.slice(html.indexOf('  let Rotations ='), html.lastIndexOf('</script>'));
    assert.ok(initialization.startsWith('  let Rotations ='), 'legacy initialization remains the comparison source');
    vm.runInContext(initialization, context);
    return {
        options: elements.rotations.options.map(option => ({ value: option.value, text: option.innerHTML })),
        /** Evaluates one selection with legacy degree parsing, preset angles and complete plot data. */
        snapshot(rotation, angles = [0, 0, 0]) {
            elements.rotations.value = String(rotation);
            axes.forEach((id, index) => { elements[id].value = String(angles[index]); });
            vm.runInContext('reset()', context);
            return JSON.parse(vm.runInContext('JSON.stringify({data: rotations_plot.data, layout: rotations_plot.layout})', context));
        },
        /** Reads angles after legacy preset normalization or custom editing. */
        angles() { return axes.map(id => Number(elements[id].value)); },
    };
}

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

/** Recursively compares vendor-facing fields while allowing only numerical roundoff. */
function compare(expected, actual, location = 'plot') {
    if (typeof expected === 'number') {
        assert.equal(typeof actual, 'number', location);
        assert.ok(Math.abs(expected - actual) <= tolerance, `${location}: expected ${expected}, received ${actual}`);
    } else if (Array.isArray(expected)) {
        assert.ok(Array.isArray(actual), location);
        assert.equal(actual.length, expected.length, `${location}.length`);
        expected.forEach((value, index) => compare(value, actual[index], `${location}[${index}]`));
    } else if (expected && typeof expected === 'object') {
        assert.ok(actual && typeof actual === 'object', location);
        for (const [key, value] of Object.entries(expected)) compare(value, actual[key], `${location}.${key}`);
    } else assert.equal(actual, expected, location);
}

/** Waits for actual Plotly mutations, then compares every legacy trace and visible axis setting. */
async function comparePlot(page, expected) {
    await page.waitForFunction(({ data, tolerance }) => {
        const plot = document.querySelector('#plot .js-plotly-plot, #plot.js-plotly-plot');
        return plot?.data?.length === data.length && data.every((trace, index) =>
            ['x', 'y', 'z'].every(axis => trace[axis].every((value, offset) =>
                Math.abs(plot.data[index][axis][offset] - value) <= tolerance)));
    }, { data: expected.data, tolerance });
    const actual = await page.evaluate(() => {
        const plot = document.querySelector('#plot .js-plotly-plot, #plot.js-plotly-plot');
        return { data: plot.data, layout: plot.layout, dimensions: [plot.getBoundingClientRect().width, plot.getBoundingClientRect().height] };
    });
    compare(expected, actual);
    assert.deepEqual(actual.dimensions, [1000, 800], 'legacy plot dimensions are preserved');
    assert.equal(await page.locator('#plot .js-plotly-plot, #plot.js-plotly-plot').count(), 1, 'one live plot per mount');
}

/** Checks canonical redirects, genuine misses, retained secondary files and shared image assets. */
async function checkRoutes(context, page, origin, base) {
    for (const { target, headers } of [
        { target: '//[', headers: {} },
        { target: 'http://untrusted.invalid/RotationCheck/', headers: {} },
        { target: '//[', headers: { Connection: 'Upgrade', Upgrade: 'websocket' } },
    ]) {
        const status = await new Promise((resolve, reject) => {
            const request = http.request(origin, { path: target, headers }, response => {
                response.resume();
                resolve(response.statusCode);
            });
            request.on('error', reject);
            request.end();
        });
        assert.equal(status, 400, `gateway rejects malformed/non-origin request: ${target}`);
    }

    for (const route of ['', 'Dev/']) {
        const response = await page.goto(origin + base + route);
        assert.equal(response.status(), 200);
        await page.locator('#root h1').waitFor();
        const links = await page.locator('a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
        assert.ok(links.includes(base + (route ? 'RotationCheck' : 'Dev')), `${route || 'portal'} retains its same-origin destination`);
        await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    }
    for (const route of ['RotationCheck', 'Dev']) {
        const target = origin + base + route;
        const response = await context.request.get(target + '?rotation=38&note=a%20b', { maxRedirects: 0 });
        assert.ok([301, 302, 307, 308].includes(response.status()), `directory redirect for ${route}`);
        assert.equal(new URL(response.headers().location, target).href, target + '/?rotation=38&note=a%20b');
        await page.goto(target + '?rotation=38&note=a%20b#axis');
        assert.equal(page.url(), target + '/?rotation=38&note=a%20b#axis');
    }
    for (const file of ['RotationCheck/Readme.md', 'RotationCheck/Matrix3.js', 'RotationCheck/RotationCheck.js', 'images/AP_favicon.png']) {
        const response = await context.request.get(origin + base + file);
        assert.equal(response.status(), 200, file);
        assert.deepEqual(await response.body(), await fs.readFile(path.join(root, file)), `${file} retains exact bytes`);
    }
    for (const missing of ['does-not-exist', 'RotationCheck/does-not-exist', 'RotationCheck/assets/missing.js', 'assets/missing.js', 'Dev/missing.html']) {
        const response = await context.request.get(origin + base + missing);
        assert.equal(response.status(), 404, `real 404: ${missing}`);
        assert.doesNotMatch(await response.text(), /<div id="root"><\/div>/, 'missing paths cannot receive the app shell');
    }
    if (base !== '/') {
        assert.equal((await context.request.get(origin + '/RotationCheck/')).status(), 404, 'unprefixed application is not an alias');
    }
}

/** Exercises every preset and representative custom rotations against the unchanged page calculations. */
async function checkControls(page, origin, base, legacy) {
    const response = await page.goto(origin + base + 'RotationCheck/');
    assert.equal(response.status(), 200);
    assert.equal(await page.title(), 'ArduPilot Rotation Helper');
    await page.locator('#rotations option').last().waitFor({ state: 'attached' });
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname));
    assert.ok(resources.every(resource => !/\/(?:Matrix3|RotationCheck)\.js$/.test(resource)), 'migrated app does not execute legacy owned scripts');
    assert.deepEqual(await page.locator('#rotations option').evaluateAll(options => options.map(option => ({ value: option.value, text: option.textContent }))), legacy.options);
    for (const option of legacy.options.filter(option => Number(option.value) < 100)) {
        await page.locator('#rotations').selectOption(option.value);
        const expected = legacy.snapshot(Number(option.value));
        for (const [index, id] of axes.entries()) {
            assert.equal(await page.locator('#' + id).isDisabled(), true);
            assert.equal(Number(await page.locator('#' + id).inputValue()), legacy.angles()[index]);
        }
        await comparePlot(page, expected);
    }
    for (const rotation of [101, 102]) {
        await page.locator('#rotations').selectOption(String(rotation));
        for (const angles of [[0, 0, 0], [12.25, -38.5, 179.75], [-360, 90, 720], [90, 68.8, 293.3]]) {
            for (const [index, id] of axes.entries()) {
                assert.equal(await page.locator('#' + id).isEnabled(), true);
                await page.locator('#' + id).fill(String(angles[index]));
                await page.locator('#' + id).press('Tab');
            }
            await comparePlot(page, legacy.snapshot(rotation, angles));
        }
    }
    // Selecting a standard preset updates the draft that both custom choices inherit.
    await page.locator('#rotations').selectOption('38');
    legacy.snapshot(38);
    await page.locator('#rotations').selectOption('101');
    assert.deepEqual(await Promise.all(axes.map(id => page.locator('#' + id).inputValue().then(Number))), legacy.angles());
    await comparePlot(page, legacy.snapshot(101, legacy.angles()));
    const retainedAngles = legacy.angles();
    for (let iteration = 0; iteration < 3; iteration++) {
        await page.getByRole('button', { name: 'Reset view', exact: true }).click();
        await comparePlot(page, legacy.snapshot(101, retainedAngles));
        assert.equal(await page.locator('#rotations').inputValue(), '101', 'reset preserves selection');
    }
    const camera = { eye: { x: 2, y: -2, z: 0.5 } };
    await page.evaluate(camera => window.Plotly.relayout(document.querySelector('#plot .js-plotly-plot'), { 'scene.camera': camera }), camera);
    await page.locator('#rotations').selectOption('24');
    await page.waitForFunction(() => document.querySelector('#plot .js-plotly-plot')?.data?.[6]?.z?.[0] < -0.29);
    assert.deepEqual(await page.evaluate(() => document.querySelector('#plot .js-plotly-plot').layout.scene.camera.eye), camera.eye, 'selection preserves camera');
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    await comparePlot(page, legacy.snapshot(24));
    await page.locator('#rotations').selectOption('101');
    for (const [index, id] of axes.entries()) await page.locator('#' + id).fill(String(retainedAngles[index]));
    // Clearing an input interrupts and disposes the plot; valid input mounts it anew.
    await page.locator('#EulerRoll').fill('');
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('#plot').count(), 0);
    await page.locator('#EulerRoll').fill(String(retainedAngles[0]));
    await comparePlot(page, legacy.snapshot(101, retainedAngles));
}

/** Repeats full app mounts and aborts a resource load without contacting external services. */
async function checkNavigation(context, page, origin, base, legacy) {
    for (let iteration = 0; iteration < 3; iteration++) {
        await page.goto(origin + base + 'Dev/');
        await page.locator(`a[href="${base}RotationCheck"], a[href="${base}RotationCheck/"]`).first().click();
        await comparePlot(page, legacy.snapshot(0));
        await page.locator('#rotations').selectOption('24');
        await comparePlot(page, legacy.snapshot(24));
    }
    const interrupted = await context.newPage();
    // Hold the actual Plotly vendor response, then leave before the loader settles.
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let requested;
    const observed = new Promise(resolve => { requested = resolve; });
    await interrupted.route('**/*plotly*.js*', async route => {
        requested();
        await held;
        await route.abort().catch(() => {});
    });
    try {
        await interrupted.goto(origin + base + 'RotationCheck/', { waitUntil: 'commit' });
        await Promise.race([observed, new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error('Plotly request was not intercepted')), 10000);
            observed.then(() => clearTimeout(timer));
        })]);
        await interrupted.goto(origin + base, { waitUntil: 'domcontentloaded' });
    } finally { release(); await interrupted.close(); }
    const unavailable = await context.newPage();
    await unavailable.route('**/*plotly*.js*', route => route.abort());
    try {
        await unavailable.goto(origin + base + 'RotationCheck/');
        await unavailable.getByRole('alert').filter({ hasText: 'Unable to load the plot library' }).waitFor();
        await unavailable.unroute('**/*plotly*.js*');
        await unavailable.reload();
        await comparePlot(unavailable, legacy.snapshot(0));
    } finally { await unavailable.close(); }
    await page.goto(origin + base + 'RotationCheck/');
    await comparePlot(page, legacy.snapshot(0));
}

test('RotationCheck and shared routing in real Chromium at root and configured prefixes', { timeout: 600000 }, async t => {
    const legacy = await legacyReference();
    const browser = await chromium.launch({
        headless: true, executablePath: process.env.CHROME_PATH || undefined,
        args: ['--enable-unsafe-swiftshader'],
    });
    try {
        for (const base of ['/Tools/WebTools/', '/']) {
            await build(base);
            for (const mode of ['dev', 'preview']) {
                await t.test(`${mode} ${base}`, { timeout: 120000 }, async () => {
                    const server = await startServer(mode, base);
                    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
                    const errors = [];
                    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
                    // The suite is hermetic: navigation and assets remain on the local gateway.
                    await context.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
                    try {
                        const page = await context.newPage();
                        await checkRoutes(context, page, server.origin, base);
                        await checkControls(page, server.origin, base, legacy);
                        await checkNavigation(context, page, server.origin, base, legacy);
                        assert.deepEqual(errors, [], 'no unhandled browser errors');
                    } finally { await context.close(); await server.stop(); }
                });
            }
        }
    } finally { await browser.close(); }
});
