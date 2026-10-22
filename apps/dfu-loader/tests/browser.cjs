const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');
const { listeningOrigin } = require('@webtools/routing/tooling');
const { installDfuMock } = require('./mock-usb.cjs');
const root = path.resolve(__dirname, '../../..');
const baseRevision = '0f4607db3dccbc7d06e5847c02465dab38d1eb80';
const diagnosticStart = performance.now();
/** Emit immediately so the last phase survives the outer test deadline. */
function phase(label) {
    const started = performance.now();
    console.log('DFU phase start', { label, elapsedMs: Math.round(started - diagnosticStart) });
    return () => console.log('DFU phase end', { label, elapsedMs: Math.round(performance.now() - diagnosticStart), durationMs: Math.round(performance.now() - started) });
}

/** Terminate the whole owned Vite/Worker process group, including failed starts. */
async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    process.kill(-child.pid, 'SIGTERM');
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already gone. */ } }, 5000);
    try { await exited; } finally { clearTimeout(timer); }
}
/** Run an independent app build at the requested prefix and retain failure output. */
async function build(prefix, all = false) {
    const finished = phase(`build ${all ? 'gateway dependency closure' : 'dfu-loader'} ${prefix}`);
    const child = spawn('pnpm', all ? ['-r', '--workspace-concurrency=1', '--filter', 'portal...', '--filter', 'rotation-check...', '--filter', 'dfu-loader...', '--if-present', 'build'] : ['--filter', 'dfu-loader', 'build'], { cwd: root, detached: true,
        env: { ...process.env, WEBTOOLS_BASE_PATH: prefix }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output = (output + data).slice(-65536); }); child.stderr.on('data', data => { output = (output + data).slice(-65536); });
    const timer = setTimeout(() => { void stop(child); }, 120000);
    try { const [code] = await once(child, 'exit'); assert.equal(code, 0, output); }
    catch (error) { console.error('DFU build failure', { prefix, all, output }); throw error; }
    finally { clearTimeout(timer); await stop(child); finished(); }
}
/** Start the actual independent Cloudflare Vite app, never a static HTML substitute. */
async function start(mode, prefix, gateway = false) {
    const finished = phase(`start ${gateway ? 'gateway' : 'independent'} ${mode} ${prefix}`);
    const child = spawn(process.execPath, gateway ? ['tooling/serve.ts', mode, '--port', '0', '--apps', 'portal,rotationCheck,dfuLoader'] : ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', '0'], {
        cwd: gateway ? root : path.join(root, 'apps/dfu-loader'), detached: true, env: { ...process.env, WEBTOOLS_BASE_PATH: prefix, BROWSER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(output)), 60000);
            /** Capture the server's actual ephemeral listening address. */
            const read = chunk => { output = (output + chunk).slice(-65536); const origin = listeningOrigin(output); if (origin) { clearTimeout(timer); resolve(origin); } };
            child.stdout.on('data', read); child.stderr.on('data', read);
            child.on('error', error => { clearTimeout(timer); reject(error); });
            child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
        });
        return { origin, child, output: () => output };
    } catch (error) { console.error('DFU server startup failure', { mode, prefix, gateway, output }); await stop(child); throw error; }
    finally { finished(); }
}
/** Supply the exact branch-base page and assets, blocking every external request. */
async function context(browser, origin, options = {}) {
    const result = await browser.newContext();
    await result.addInitScript(installDfuMock, options);
    await result.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname.startsWith('/legacy/')) {
            const file = url.pathname.slice('/legacy/'.length) || 'index.html';
            if (!['index.html', 'dfu.js', 'dfuse.js', 'dfu-util.js'].includes(file)) return route.fulfill({ status: 404, body: '' });
            const body = execFileSync('git', ['show', `${baseRevision}:DFULoader/${file}`], { cwd: root });
            return route.fulfill({ contentType: file.endsWith('.html') ? 'text/html' : 'text/javascript', body });
        }
        return route.continue();
    });
    return result;
}
/** Execute a complete local-file transfer and expose bytes/order/logs for parity. */
async function transfer(page, url, filename = 'firmware.bin') {
    await page.goto(url);
    await page.click('#connect');
    await page.waitForFunction(() => !document.querySelector('#firmwareFile').disabled);
    const bytes = filename.endsWith('.hex') ? Buffer.from(':020000040800F2\n:0600000001020304050600') : Buffer.from([1, 2, 3, 4, 5, 6]);
    await page.setInputFiles('#firmwareFile', { name: filename, mimeType: 'application/octet-stream', buffer: bytes });
    // Both versions read asynchronously with FileReader; allow its load event to finish.
    await page.waitForTimeout(50);
    await page.click('#download');
    await page.waitForFunction(() => document.querySelector('#downloadLog').textContent.includes('Done!'));
    return page.evaluate(() => ({ trace: mockDfu.trace, usb: document.querySelector('#usbInfo').textContent,
        dfu: document.querySelector('#dfuInfo').textContent, logs: document.querySelector('#downloadLog').textContent,
        progress: [...document.querySelectorAll('progress')].map(item => [item.value, item.max]) }));
}

test('real Chromium: independent dev and built Worker, both prefixes, exact legacy transfer parity and lifecycle', { timeout: 360000 }, async () => {
    const launched = phase('Chromium launch');
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
    launched();
    try {
        for (const prefix of ['/', '/Tools/WebTools/']) {
            await build(prefix);
            for (const mode of ['dev', 'preview']) {
                const server = await start(mode, prefix);
                const mount = server.origin + prefix + 'DFULoader/';
                const finished = phase(`independent scenarios ${mode} ${prefix}`);
                try {
                    for (const options of [{}, { dfuse: true }, { errorState: true }]) {
                        const compared = phase(`transfer parity ${mode} ${prefix} ${JSON.stringify(options)}`);
                        const legacy = await context(browser, server.origin, options);
                        const migrated = await context(browser, server.origin, options);
                        try {
                            const expected = await transfer(await legacy.newPage(), server.origin + '/legacy/', options.dfuse ? 'firmware.hex' : 'firmware.bin');
                            const actual = await transfer(await migrated.newPage(), mount, options.dfuse ? 'firmware.hex' : 'firmware.bin');
                            assert.deepEqual(actual, expected, `${mode} ${prefix} ${JSON.stringify(options)}`);
                        } finally { await legacy.close(); await migrated.close(); compared(); }
                    }
                    const unreadable = phase(`unreadable memory ${mode} ${prefix}`);
                    for (const legacy of [true, false]) {
                        const ctx = await context(browser, server.origin, { dfuse: true, unreadable: true });
                        try {
                            const page = await ctx.newPage(); await page.goto(legacy ? server.origin + '/legacy/' : mount);
                            await page.click('#connect'); await page.waitForFunction(() => !document.querySelector('#firmwareFile').disabled);
                            assert.deepEqual(await page.evaluate(() => ({ value: document.querySelector('#dfuseUploadSize').value,
                                max: document.querySelector('#dfuseUploadSize').max, valid: document.querySelector('#configForm').checkValidity() })),
                            { value: '0', max: '0', valid: false });
                        } finally { await ctx.close(); }
                    }
                    unreadable();
                    const serial = phase(`serial selection ${mode} ${prefix}`);
                    for (const query of ['?serial=SERIAL/', '?serial=']) {
                        const ctx = await context(browser, server.origin);
                        try {
                            const page = await ctx.newPage(); await page.goto(mount + query);
                            await page.waitForFunction(() => document.querySelector('#connect').textContent === 'Disconnect');
                            assert.equal(await page.evaluate(() => mockDfu.trace.some(item => item[0] === 'request')), false);
                        } finally { await ctx.close(); }
                    }
                    serial();
                    const recovery = phase(`recovery and asset routing ${mode} ${prefix}`);
                    const ctx = await context(browser, server.origin, { cancel: true, fail: true });
                    try {
                        const page = await ctx.newPage();
                        await page.goto(mount); await page.click('#connect');
                        await page.waitForFunction(() => document.querySelector('#status').textContent.includes('No device selected'));
                        await page.click('#connect'); await page.waitForFunction(() => !document.querySelector('#firmwareFile').disabled);
                        await page.setInputFiles('#firmwareFile', { name: 'retry.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([7, 8]) });
                        await page.waitForTimeout(50); await page.click('#download');
                        await page.waitForFunction(() => document.querySelector('#downloadLog').textContent.includes('Mock transfer failure'));
                        await page.click('#download'); await page.waitForFunction(() => document.querySelector('#downloadLog').textContent.includes('Done!'));
                        await page.evaluate(() => mockDfu.disconnect());
                        await page.waitForFunction(() => document.querySelector('#status').textContent === 'Device disconnected');
                        for (let i = 0; i < 3; i++) { await page.click('#connect'); await page.waitForFunction(() => document.querySelector('#connect').textContent === 'Disconnect'); await page.click('#connect'); }
                        assert.equal(await page.evaluate(() => mockDfu.listenerCount()), 1);
                        for (const asset of ['dfu.js', 'dfuse.js', 'dfu-util.js', 'README.md']) {
                            const response = await ctx.request.get(mount + asset);
                            assert.equal(response.status(), 200);
                            assert.deepEqual(await response.body(), readFileSync(path.join(root, 'DFULoader', asset)));
                        }
                        for (const missing of ['missing.js', 'assets/missing.js', 'missing/', '../index.html']) assert.equal((await ctx.request.get(mount + missing)).status(), 404);
                        const redirect = await ctx.request.get(mount.slice(0, -1) + '?serial=SERIAL/', { maxRedirects: 0 });
                        assert.equal(redirect.status(), 308);
                        assert.equal(new URL(redirect.headers().location).pathname, prefix + 'DFULoader/');
                        assert.equal(new URL(redirect.headers().location).search, '?serial=SERIAL/');
                    } finally { await ctx.close(); }
                    recovery();
                    const interruption = phase(`interrupted transfer ${mode} ${prefix}`);
                    const interrupted = await context(browser, server.origin, { hold: true });
                    try {
                        const page = await interrupted.newPage();
                        await page.goto(mount); await page.click('#connect'); await page.waitForFunction(() => !document.querySelector('#firmwareFile').disabled);
                        await page.setInputFiles('#firmwareFile', { name: 'interrupt.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2]) });
                        await page.waitForTimeout(50); await page.click('#download');
                        await page.waitForFunction(() => mockDfu.trace.some(item => item[0] === 'out'));
                        await page.evaluate(() => { mockDfu.disconnect(); mockDfu.release(); });
                        await page.waitForFunction(() => document.querySelector('#status').textContent === 'Device disconnected');
                        assert.ok(!(await page.textContent('#downloadLog')).includes('Done!'));
                        await page.click('#connect'); await page.waitForFunction(() => !document.querySelector('#firmwareFile').disabled);
                    } finally { await interrupted.close(); }
                    interruption();
                    const lifecycleDone = phase(`page lifecycle ${mode} ${prefix}`);
                    // Exercise the real production entry's page lifecycle, including BFCache restoration.
                    const lifecycle = await context(browser, server.origin, { holdClose: true });
                    try {
                        const page = await lifecycle.newPage(); await page.goto(mount);
                        for (let i = 0; i < 3; i++) {
                            await page.click('#connect'); await page.waitForFunction(() => document.querySelector('#connect').textContent === 'Disconnect');
                            await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
                            assert.equal(await page.evaluate(() => mockDfu.listenerCount()), 0);
                            await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
                            await page.waitForFunction(() => mockDfu.listenerCount() === 1);
                            if (i === 0) {
                                await page.click('#connect');
                                assert.equal(await page.evaluate(() => mockDfu.trace.filter(item => item[0] === 'open').length), 1);
                                await page.evaluate(() => mockDfu.releaseClose());
                                await page.waitForFunction(() => document.querySelector('#connect').textContent === 'Disconnect');
                                await page.click('#connect');
                            }
                        }
                    } finally { await lifecycle.close(); }

                    lifecycleDone();
                } catch (error) { console.error('DFU independent failure', { mode, prefix, output: server.output() }); throw error; }
                finally { const stopped = phase(`stop independent ${mode} ${prefix}`); await stop(server.child); stopped(); finished(); }
            }
            await build(prefix, true);
            for (const mode of ['dev', 'preview']) {
                const gateway = await start(mode, prefix, true);
                const finished = phase(`gateway transfer and routes ${mode} ${prefix}`);
                const ctx = await context(browser, gateway.origin);
                try {
                    const page = await ctx.newPage();
                    await transfer(page, gateway.origin + prefix + 'DFULoader/');
                    for (const destination of ['', 'RotationCheck/']) {
                        assert.equal((await ctx.request.get(gateway.origin + prefix + destination)).status(), 200);
                    }
                    assert.equal((await ctx.request.get(gateway.origin + prefix + 'DFULoader/not-found')).status(), 404);
                } catch (error) { console.error('DFU gateway failure', { mode, prefix, output: gateway.output() }); throw error; }
                finally { await ctx.close(); const stopped = phase(`stop gateway ${mode} ${prefix}`); await stop(gateway.child); stopped(); finished(); }
            }
        }
    } finally { const closed = phase('Chromium cleanup'); await browser.close(); closed(); }
});
