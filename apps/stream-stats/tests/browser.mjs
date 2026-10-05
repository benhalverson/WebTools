import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { test } from 'node:test'
import { startLegacy } from './legacy-server.mjs'
import { legacy } from './legacy.mjs'
import { tlogFixture, arrayBuffer } from './fixtures.mjs'
const root = fileURLToPath(new URL('../../../', import.meta.url))
globalThis.self = { addEventListener() {} }
const { default: Parser } = await import('../../../modules/JsDataflashParser/parser.js')
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

/** Compare only legacy-owned trace fields; Plotly inserts its own uid/default fields. */
async function comparePlots(page, expected) {
    await page.waitForFunction(expected => {
        for (const [key, id] of [['messages', 'data_rates'], ['total', 'total_rate'], ['composition', 'log_stats']]) {
            const actual = document.querySelector(`#${id} .js-plotly-plot`)?.data
            if (!actual || actual.length !== expected[key].length) return false
            for (let i = 0; i < actual.length; i++) for (const [field, value] of Object.entries(expected[key][i])) {
                if (JSON.stringify(actual[i][field]) !== JSON.stringify(value)) return false
            }
        }
        return true
    }, expected)
}
/** Upload exact fixture bytes to the native file input and wait for owned loading. */
async function upload(page, name, buffer) {
    await page.locator('#fileItem').setInputFiles({ name, mimeType: 'application/octet-stream', buffer })
    await page.locator('#plotsetup').waitFor()
    await page.getByRole('status').waitFor({ state: 'hidden' })
}
for (const prefix of ['/', '/Tools/WebTools/']) for (const mode of ['dev', 'preview']) test(`${mode} ${prefix}: actual Chromium controls, parity, routing and disposal`, { timeout: 240000 }, async () => {
    if (mode === 'preview') await build(prefix)
    let server, legacyServer, browser
    try {
        server = await startServer(mode, prefix)
        legacyServer = await startLegacy()
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] })
        const context = await browser.newContext()
        await context.route('**/*', route => [server.origin, legacyServer.origin].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort())
        await context.addInitScript(() => {
            window.receivedFiles = []
            window.addEventListener('message', async event => {
                if (event.data?.type === 'file' && event.data.data instanceof File) window.receivedFiles.push({ name: event.data.data.name, bytes: [...new Uint8Array(await event.data.data.arrayBuffer())] })
            })
        })
        const page = await context.newPage(); page.setDefaultTimeout(15000)
        const errors = []; page.on('pageerror', error => errors.push(error.message))
        const base = server.origin + prefix
        await page.goto(base + 'StreamStats/')
        assert.equal(await page.title(), 'Stream Stats')
        assert.equal(await page.locator('#OpenIn').isDisabled(), true)
        for (const path of ['StreamStats/index.html', 'StreamStats/mavlink_msgs.js', 'StreamStats/StreamStats.js', 'StreamStats/Readme.md', 'StreamStats/images/ArduPilot.png', 'StreamStats/dataflash/index.js', 'StreamStats/dataflash/vendor/parser.js']) assert.equal((await context.request.get(base + path)).status(), 200, path)
        for (const path of ['StreamStats/missing.js', 'StreamStats/missing/', 'StreamStats/dataflash/missing.js']) assert.equal((await context.request.get(base + path)).status(), 404, path)
        const redirect = await context.request.get(base + 'StreamStats?test=1', { maxRedirects: 0 }); assert.equal(redirect.status(), 308); assert.ok(redirect.headers().location.endsWith('/StreamStats/?test=1'))
        if (prefix !== '/') assert.equal((await context.request.get(server.origin + '/StreamStats/')).status(), 404)
        const tlog = await tlogFixture(), oracle = legacy(Parser)
        const legacyPage = await context.newPage(); legacyPage.setDefaultTimeout(15000)
        await legacyPage.goto(legacyServer.origin + '/StreamStats/')
        await legacyPage.waitForFunction(() => typeof DataflashParser === 'function')
        await legacyPage.locator('#fileItem').setInputFiles({ name: 'fixture.tlog', mimeType: 'application/octet-stream', buffer: tlog })
        await legacyPage.locator('#plotsetup').waitFor()
        await legacyPage.evaluate(() => Plotly.relayout('total_rate', { 'xaxis.range[0]': 2, 'xaxis.range[1]': 9, 'yaxis.range[0]': 0.1, 'yaxis.range[1]': 0.5 }))
        await legacyPage.locator('#Unit_count').check()
        await legacyPage.locator('#WindowSize').fill('1'); await legacyPage.locator('#WindowSize').blur()
        assert.deepEqual(await legacyPage.locator('#total_rate').evaluate(node => ({ x: node.layout.xaxis.range, y: node.layout.yaxis.range })), { x: [2, 9], y: [0.1, 0.5] })
        assert.deepEqual(await legacyPage.locator('#data_rates').evaluate(node => node.layout.xaxis.range), [2, 9])
        await legacyPage.evaluate(() => Plotly.relayout('data_rates', { 'yaxis.autorange': true }))
        assert.equal(await legacyPage.locator('#total_rate').evaluate(node => node.layout.xaxis.autorange), true)
        await legacyPage.close()
        oracle.load(arrayBuffer(tlog), false)
        await upload(page, 'FIXED.TLOG', tlog); await comparePlots(page, oracle.snapshot(10, true))
        await page.locator('#Unit_count').check(); await comparePlots(page, oracle.snapshot(10, false))
        await page.locator('#WindowSize').fill('3.25'); await comparePlots(page, oracle.snapshot(3.25, false))
        await page.locator('details').first().evaluate(node => { node.open = true })
        await page.locator('[id="42,1,HEARTBEAT"]').uncheck(); await comparePlots(page, oracle.snapshot(3.25, false, ['42,1,HEARTBEAT']))
        await page.locator('[id="42,1"]').uncheck(); await comparePlots(page, oracle.snapshot(3.25, false, ['42,1']))
        assert.equal(await page.locator('[id="42,1,HEARTBEAT"]').isDisabled(), true)
        await page.locator('[id="42,1"]').check(); await page.locator('[id="42,1,HEARTBEAT"]').check()
        await comparePlots(page, oracle.snapshot(3.25, false))
        await page.evaluate(() => window.Plotly.relayout(document.querySelector('#total_rate .js-plotly-plot'), { 'xaxis.range[0]': 2, 'xaxis.range[1]': 9, 'yaxis.range[0]': 0.1, 'yaxis.range[1]': 0.5 }))
        await page.waitForFunction(() => JSON.stringify(document.querySelector('#data_rates .js-plotly-plot').layout.xaxis.range) === '[2,9]')
        assert.deepEqual(await page.locator('#total_rate .js-plotly-plot').evaluate(node => node.layout.yaxis.range), [0.1, 0.5])
        await page.locator('#Unit_bps').check(); await page.locator('#WindowSize').fill('1')
        await comparePlots(page, oracle.snapshot(1, true))
        assert.deepEqual(await page.locator('#total_rate .js-plotly-plot').evaluate(node => node.layout.xaxis.range), [2, 9])
        assert.deepEqual(await page.locator('#total_rate .js-plotly-plot').evaluate(node => node.layout.yaxis.range), [0.1, 0.5])
        await page.evaluate(() => window.Plotly.relayout(document.querySelector('#data_rates .js-plotly-plot'), { 'yaxis.autorange': true }))
        await page.waitForFunction(() => document.querySelector('#total_rate .js-plotly-plot').layout.xaxis.autorange === true)
        await page.locator('#WindowSize').fill(''); await page.getByRole('alert').filter({ hasText: 'Window size' }).waitFor(); await page.locator('#WindowSize').fill('10')
        const bin = await readFile(new URL('../../../packages/dataflash/fixtures/plane-4.6.2-prefix.BIN', import.meta.url))
        oracle.load(arrayBuffer(bin), true)
        await upload(page, 'fixture.bin', bin); await comparePlots(page, oracle.snapshot(10, true))
        await page.locator('#OpenIn').click()
        const popupPromise = page.waitForEvent('popup'); await page.getByRole('button', { name: 'Hardware Report', exact: true }).click()
        const popup = await popupPromise; await popup.waitForFunction(() => window.receivedFiles.length > 0)
        const transferred = await popup.evaluate(() => window.receivedFiles[0]); assert.equal(transferred.name, 'fixture.bin'); assert.deepEqual(Buffer.from(transferred.bytes), bin); assert.ok(popup.url().startsWith(base + 'HardwareReport'))
        await popup.close()
        // Track actual Plotly nodes: reset/unmount must purge data and detach all nodes.
        await page.evaluate(() => { window.oldPlots = [...document.querySelectorAll('.js-plotly-plot')] })
        await page.getByRole('button', { name: 'Reset', exact: true }).click()
        await page.waitForFunction(() => window.oldPlots.every(node => !node.isConnected && !node.data))
        assert.equal(await page.locator('#OpenIn').isDisabled(), true)
        for (let i = 0; i < 2; i++) { await upload(page, 'repeated.tlog', tlog); await comparePlots(page, (() => { const reference = legacy(Parser); reference.load(arrayBuffer(tlog), false); return reference.snapshot(10, true) })()); await page.getByRole('button', { name: 'Reset', exact: true }).click() }
        // Interrupt a local read immediately and ensure its completion cannot remount plots.
        await page.evaluate(bytes => { const input = document.querySelector('#fileItem'); const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], 'interrupt.bin')); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); [...document.querySelectorAll('button')].find(node => node.textContent === 'Reset').click() }, [...bin])
        await page.waitForTimeout(100); assert.equal(await page.locator('.js-plotly-plot').count(), 0)
        const backwards = Buffer.from(tlog); backwards.writeBigUInt64BE(0n, 29)
        await page.locator('#fileItem').setInputFiles({ name: 'backwards.tlog', mimeType: 'application/octet-stream', buffer: backwards })
        await page.getByRole('alert').filter({ hasText: 'Time went backwards!' }).waitFor()
        await upload(page, 'recovered.tlog', tlog)
        // Hold the standalone parser import across reset; stale completions stay invisible.
        await page.reload()
        let releaseParser, parserRequested
        const parserGate = new Promise(resolve => { releaseParser = resolve })
        const requested = new Promise(resolve => { parserRequested = resolve })
        await page.route('**/StreamStats/dataflash/index.js', async route => { parserRequested(); await parserGate; await route.continue() })
        await page.locator('#fileItem').setInputFiles({ name: 'pending.bin', mimeType: 'application/octet-stream', buffer: bin })
        await requested
        await page.getByRole('button', { name: 'Reset', exact: true }).click()
        const resumed = page.waitForResponse(response => response.url().endsWith('/StreamStats/dataflash/index.js'))
        releaseParser(); await resumed; await page.unroute('**/StreamStats/dataflash/index.js')
        await page.waitForTimeout(100); assert.equal(await page.locator('.js-plotly-plot').count(), 0)
        // Delay the real vendor promise, then unmount while Plotly work is pending.
        await page.evaluate(() => {
            const original = window.Plotly.newPlot
            window.pendingPlots = []; window.releasePlots = []
            window.Plotly.newPlot = async (...args) => {
                const result = await original.apply(window.Plotly, args)
                window.pendingPlots.push(result)
                await new Promise(resolve => { window.releasePlots.push(resolve) })
                return result
            }
            window.restorePlot = () => { window.Plotly.newPlot = original }
        })
        await upload(page, 'pending.tlog', tlog)
        await page.waitForFunction(() => window.releasePlots.length === 3)
        await page.getByRole('button', { name: 'Reset', exact: true }).click()
        await page.evaluate(() => { window.restorePlot(); window.releasePlots.forEach(release => release()) })
        await page.waitForFunction(() => window.pendingPlots.every(node => !node.isConnected && !node.data))
        // Missing pinned renderer is recoverable feedback, without a global crash.
        await page.route('**/vendor/plotly.min.js', route => route.abort())
        await page.reload(); await page.getByRole('alert').filter({ hasText: 'Plotly failed to load' }).waitFor()
        await page.unroute('**/vendor/plotly.min.js')
        await page.goto(base); assert.match(await page.title(), /WebTools|Web Tools/)
        await page.goto(base + 'RotationCheck/'); assert.match(await page.title(), /Rotation/)
        assert.deepEqual(errors, [])
        await context.close()
    } finally {
        const cleanup = await Promise.allSettled([browser?.close(), server?.stop(), legacyServer?.stop()])
        assert.deepEqual(cleanup.filter(result => result.status === 'rejected'), [], 'All acquired resources must stop')
    }
})
