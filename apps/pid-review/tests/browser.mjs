import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { fixture } from './fixture.mjs'
import { listeningOrigin } from '@webtools/routing/tooling'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const plots = ['TimeInputs', 'TimeOutputs', 'FFTPlot', 'step_plot', 'Spectrogram']

/** Stop every gateway/Worker process, including interrupted startup. */
async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return
    const finished = once(child, 'exit'); process.kill(-child.pid, 'SIGTERM')
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, 5000)
    try { await finished } finally { clearTimeout(timer) }
}
/** Start the real gateway or independent app Worker and retain startup diagnostics. */
async function server(mode, prefix, independent = false) {
    const child = spawn(process.execPath, independent ? ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', '0'] : ['tooling/serve.ts', mode, '--port', '0'], {
        cwd: independent ? resolve(root, 'apps/pid-review') : root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBTOOLS_BASE_PATH: prefix, BROWSER: 'none' },
    })
    let output = ''
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Startup timeout: ' + output)), 60000)
            /** Parse server readiness after complete output chunks. */
            const read = chunk => { output += chunk; const origin = listeningOrigin(output); if (origin) { clearTimeout(timer); resolve(origin) } }
            child.stdout.on('data', read); child.stderr.on('data', read)
            child.on('error', error => { clearTimeout(timer); reject(error) })
            child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)) })
        })
        return { origin, stop: () => stop(child) }
    } catch (error) { await stop(child); throw error }
}
/** Build all independent apps using the same public prefix as the gateway. */
async function build(prefix) {
    const child = spawn('pnpm', ['build'], { cwd: root, env: { ...process.env, WEBTOOLS_BASE_PATH: prefix }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''; child.stdout.on('data', value => { output += value }); child.stderr.on('data', value => { output += value })
    const [code] = await once(child, 'exit'); assert.equal(code, 0, output)
}
/** Serve the unchanged repository so Chromium executes the actual legacy page. */
async function legacyServer() {
    const instance = createServer(async (request, response) => {
        try {
            let path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname)
            if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return }
            if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html')
            response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[extname(path)] ?? 'application/octet-stream')
            response.end(await readFile(path))
        } catch { response.writeHead(404).end() }
    })
    await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve))
    return { origin: `http://127.0.0.1:${instance.address().port}`, close: () => new Promise(resolve => instance.close(resolve)) }
}
/** Wait for all pending Plotly initialization/update queues to expose real data. */
async function ready(page, expected = 'PID Review: fixture.bin') {
    await page.waitForFunction(title => document.title === title && document.querySelector('#TimeInputs .js-plotly-plot, #TimeInputs.js-plotly-plot')?.data?.[0]?.x?.length > 0 && getComputedStyle(document.querySelector('#loading')).visibility === 'hidden', expected)
}
/** Upload identical synthetic binary bytes through the native file picker. */
async function upload(page, options = {}, name = 'fixture.bin') {
    await page.locator('#fileItem').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: fixture(options) }); await ready(page, 'PID Review: ' + name)
}
/** Read vendor-rendered numerical arrays only, normalizing non-finite values equally in both pages. */
async function snapshot(page) {
    return page.evaluate(names => Object.fromEntries(names.map(id => {
        const node = document.querySelector('#' + id + ' .js-plotly-plot') ?? document.getElementById(id)
        return [id, node.data.map(trace => ({ x: trace.x ?? [], y: trace.y ?? [], ...(trace.z ? { z: trace.z } : {}) }))]
    })), plots)
}
/** Compare Chromium computations exactly, including array lengths, gaps and finite/nonfinite values. */
async function compare(page, legacy) {
    await legacy.waitForFunction(() => getComputedStyle(document.getElementById('loading')).visibility === 'hidden')
    const expected = JSON.stringify(await snapshot(legacy))
    try { await page.waitForFunction(({ names, expected }) => {
        const value = Object.fromEntries(names.map(id => { const node = document.querySelector('#' + id + ' .js-plotly-plot'); return [id, node?.data?.map(trace => ({ x: trace.x ?? [], y: trace.y ?? [], ...(trace.z ? { z: trace.z } : {}) }))] }))
        return JSON.stringify(value) === expected
    }, { names: plots, expected }, { timeout: 20000 }) } catch (error) {
        const actual = JSON.parse(JSON.stringify(await snapshot(page))), old = JSON.parse(expected)
        for (const name of plots) for (let i = 0; i < Math.max(actual[name].length, old[name].length); i++) {
            if (JSON.stringify(actual[name][i]) !== JSON.stringify(old[name][i])) console.log('DIFF', name, i, JSON.stringify(actual[name][i]).slice(0, 300), JSON.stringify(old[name][i]).slice(0, 300))
        }
        throw error
    }
}
/** Exercise owned state, linked ranges, controllers and Open In without contacting external destinations. */
async function workflow(context, origin, prefix, legacy) {
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin + prefix + 'PIDReview/')
    await page.locator('#FFTWindow_size').fill('128'); await page.locator('#FFTWindow_size').blur()
    await upload(page); await compare(page, legacy)
    for (const id of ['type_PIDP', 'type_RATE_R', 'type_PIDR']) {
        await legacy.locator('#' + id).check(); await page.locator('#' + id).check(); await compare(page, legacy)
        if (id === 'type_RATE_R') assert.equal(await page.locator('#PIDX_P').isDisabled(), true)
    }
    for (const id of ['ScalePSD', 'ScaleLinear', 'ScaleLog', 'freq_Scale_RPM', 'freq_Scale_Hz']) { await legacy.locator('#' + id).check(); await page.locator('#' + id).check(); await compare(page, legacy) }
    for (const target of [legacy, page]) { await target.locator('#TimeStart').fill('4'); await target.locator('#TimeStart').blur(); await target.locator('#TimeEnd').fill('12'); await target.locator('#TimeEnd').blur(); await target.locator('#calculate').click() }
    await compare(page, legacy)
    await page.locator('#set_selection_0').uncheck(); assert.equal(await page.locator('#set_selection_0').isChecked(), false)
    await page.waitForFunction(() => document.querySelector('#FFTPlot .js-plotly-plot').data[0].visible === false)
    await page.locator('#set_selection_0').check()
    await page.evaluate(() => window.Plotly.relayout(document.querySelector('#TimeInputs .js-plotly-plot'), { 'xaxis.range[0]': 5, 'xaxis.range[1]': 8 }))
    await page.waitForFunction(() => document.querySelector('#TimeOutputs .js-plotly-plot').layout.xaxis.range[0] === 5 && document.querySelector('#Spectrogram .js-plotly-plot').layout.xaxis.range[1] === 8)
    await page.evaluate(() => window.Plotly.relayout(document.querySelector('#FFTPlot .js-plotly-plot'), { 'xaxis.range[0]': 2, 'xaxis.range[1]': 15 }))
    await page.waitForFunction(() => document.querySelector('#Spectrogram .js-plotly-plot').layout.yaxis.range[1] === 15)
    await page.evaluate(() => window.Plotly.relayout(document.querySelector('#FFTPlot .js-plotly-plot'), { 'xaxis.autorange': true }))
    await page.waitForFunction(() => ['TimeInputs', 'TimeOutputs', 'step_plot', 'Spectrogram'].every(id => document.querySelector('#' + id + ' .js-plotly-plot').layout.yaxis.autorange === true))
    await page.evaluate(() => window.Plotly.relayout(document.querySelector('#FlightData .js-plotly-plot'), { 'xaxis.range[0]': 2.2, 'xaxis.range[1]': 10.2 }))
    assert.equal(await page.locator('#TimeStart').inputValue(), '2'); assert.equal(await page.locator('#TimeEnd').inputValue(), '11')
    // Observe the exact same-origin transport without opening a live provider or vehicle page.
    await page.evaluate(() => { window.delivery = []; window.open = path => ({ addEventListener(name, callback) { window.delivery.push(path); callback() }, removeEventListener() {}, postMessage(message) { window.delivery.push({ type: message.type, name: message.data.name, size: message.data.size }) } }) })
    await page.locator('#OpenIn').click(); await page.getByRole('button', { name: 'Hardware Report', exact: true }).click()
    const delivery = await page.evaluate(() => window.delivery); assert.equal(delivery[0], '../HardwareReport'); assert.deepEqual(delivery[1], { type: 'file', name: 'fixture.bin', size: fixture().length })
    for (const target of [legacy, page]) {
        await target.locator('#TimeStart').fill('3'); await target.locator('#TimeStart').blur()
        await target.locator('#TimeEnd').fill('13'); await target.locator('#TimeEnd').blur()
        await target.locator('#calculate').click()
    }
    await compare(page, legacy)
    for (const target of [legacy, page]) { await target.locator('#FFTWindow_size').fill('256'); await target.locator('#FFTWindow_size').blur(); await target.locator('#type_PIDP').check() }
    await compare(page, legacy)
    assert.equal(await page.locator('#set_selection_0').isDisabled(), await legacy.locator('#set_selection_0').isDisabled())
    for (const target of [legacy, page]) await target.locator('#calculate').click()
    await compare(page, legacy)
    assert.equal(await page.locator('#set_selection_0').isDisabled(), true, 'legacy reduced-data selection remains disabled until controller setup')
    await upload(page, { detailed: false }, 'rate.bin'); assert.equal(await page.locator('#PIDX_P').isDisabled(), true); assert.equal(await page.locator('#type_RATE_R').isChecked(), true)
    for (const vehicle of [1, 3]) { await upload(page, { vehicle, dff: false }, 'vehicle.bin'); assert.equal(await page.locator(vehicle === 1 ? '#type_PIDS' : '#type_PIDR').isChecked(), true); assert.equal(await page.locator('#PIDX_DFF').isDisabled(), true) }
    assert.deepEqual(errors, [])
    await page.close()
}
/** Check declared public assets, prefix redirects, genuine misses and missing vendor feedback. */
async function routes(context, origin, prefix) {
    const base = origin + prefix + 'PIDReview'
    const redirect = await context.request.get(base + '?test=1', { maxRedirects: 0 }); assert.equal(redirect.status(), 308); assert.ok(redirect.headers().location.endsWith('/PIDReview/?test=1'))
    for (const path of ['Readme.md', 'PIDReview.js', 'ArduCopter_angle_rate_control_loop.drawio.png']) {
        const response = await context.request.get(base + '/' + path); assert.equal(response.status(), 200); assert.deepEqual(await response.body(), await readFile(resolve(root, 'PIDReview', path)))
    }
    for (const path of ['missing', 'missing.html', 'assets/missing.js', 'dataflash/missing.js']) { const response = await context.request.get(base + '/' + path); assert.equal(response.status(), 404); assert.doesNotMatch(await response.text(), /<div id="root">/) }
    const page = await context.newPage(); await page.route('**/vendor/plotly.min.js', route => route.abort())
    await page.goto(base + '/'); await page.getByRole('alert').filter({ hasText: 'Plotly asset unavailable' }).waitFor(); await page.close()
}
/** Repeatedly unmount the built entry while retaining DOM references to prove cleanup, then test stale asynchronous loads. */
async function lifetimes(context, origin, prefix, mode) {
    const page = await context.newPage()
    await page.addInitScript(() => {
        window.listeners = new Set(); const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window)
        window.addEventListener = (type, fn, options) => { if (type === 'message') window.listeners.add(fn); return add(type, fn, options) }
        window.removeEventListener = (type, fn, options) => { if (type === 'message') window.listeners.delete(fn); return remove(type, fn, options) }
    })
    await page.goto(origin + prefix + 'PIDReview/')
    await page.waitForSelector('#Spectrogram .js-plotly-plot')
    const entryPath = mode === 'dev' ? 'src/main.tsx' : JSON.parse(await readFile(resolve(root, 'apps/pid-review/dist/client/.vite/manifest.json'), 'utf8'))['src/main.tsx'].file
    await page.evaluate(async path => { window.entry = await import(path); window.dispose = window.entry.dispose }, origin + prefix + 'PIDReview/' + entryPath)
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => { window.nodes = [...document.querySelectorAll('.js-plotly-plot')]; window.dispose() })
        assert.equal(await page.locator('.js-plotly-plot').count(), 0)
        assert.equal(await page.evaluate(() => window.nodes.every(node => !node._fullLayout && !node.isConnected)), true)
        assert.equal(await page.evaluate(() => window.listeners.size), 0)
        await page.evaluate(() => { window.dispose = window.entry.mount(document.getElementById('root')) })
        await page.waitForSelector('#Spectrogram .js-plotly-plot')
    }
    await page.evaluate(() => { const original = File.prototype.arrayBuffer; File.prototype.arrayBuffer = function () { if (this.name === 'stale.bin') return new Promise((_, reject) => { window.rejectStale = reject }); return original.call(this) } })
    await page.locator('#fileItem').setInputFiles({ name: 'stale.bin', mimeType: 'application/octet-stream', buffer: fixture() })
    await page.waitForFunction(() => typeof window.rejectStale === 'function')
    await upload(page, { detailed: false }, 'replacement.bin')
    await page.evaluate(() => window.rejectStale(new Error('obsolete failure')))
    await page.waitForTimeout(100); assert.equal(await page.getByRole('alert').count(), 0)
    // Queue Calculate for A, then hold B's read while both RAF callbacks are released.
    await upload(page, {}, 'first.bin')
    await page.locator('#TimeStart').fill('3'); await page.locator('#TimeStart').blur()
    await page.evaluate(() => {
        window.frames = []; window.realFrame = window.requestAnimationFrame
        window.requestAnimationFrame = callback => { window.frames.push(callback); return window.frames.length }
        const original = File.prototype.arrayBuffer
        File.prototype.arrayBuffer = function () { if (this.name === 'queued.bin') return new Promise(resolve => { window.releaseQueued = () => original.call(this).then(resolve) }); return original.call(this) }
        document.getElementById('calculate').click()
    })
    await page.locator('#fileItem').setInputFiles({ name: 'queued.bin', mimeType: 'application/octet-stream', buffer: fixture({ detailed: false }) })
    await page.waitForFunction(() => window.frames.length >= 2)
    await page.evaluate(() => { window.requestAnimationFrame = window.realFrame; for (const callback of window.frames) callback(performance.now()) })
    await page.waitForFunction(() => typeof window.releaseQueued === 'function')
    await page.waitForTimeout(100)
    assert.equal(await page.locator('#type_PIDR').isDisabled(), true, 'queued calculation cannot republish A while B is reading')
    await page.evaluate(() => window.releaseQueued()); await ready(page, 'PID Review: queued.bin')
    assert.equal(await page.locator('#type_RATE_R').isChecked(), true)
    // Unmount while a real File read remains pending; its later rejection is ignored.
    await page.locator('#fileItem').setInputFiles({ name: 'stale.bin', mimeType: 'application/octet-stream', buffer: fixture() })
    await page.waitForTimeout(100)
    await page.evaluate(() => { window.dispose(); window.rejectStale(new Error('disposed failure')); window.dispose = window.entry.mount(document.getElementById('root')) })
    await page.waitForSelector('#fileItem')
    assert.equal(await page.getByRole('alert').count(), 0)
    await page.locator('#fileItem').setInputFiles({ name: 'invalid.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3]) })
    await page.getByRole('alert').filter({ hasText: 'Vehicle Type not supported' }).waitFor()
    await page.evaluate(() => window.dispose()); assert.equal(await page.locator('.js-plotly-plot').count(), 0)
    await page.close()
}

test('PIDReview actual Chromium legacy/dev/build/Worker/gateway workflows at root and prefix', { timeout: 600000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined }), old = await legacyServer()
    try {
        for (const prefix of ['/', '/Tools/WebTools/']) {
            for (const mode of ['dev', 'preview']) {
                if (mode === 'preview') await build(prefix)
                const app = await server(mode, prefix), context = await browser.newContext()
                await context.route('**/*', route => [app.origin, old.origin].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort())
                try {
                    const legacy = await context.newPage(); await legacy.goto(old.origin + '/PIDReview/'); await legacy.locator('#FFTWindow_size').fill('128'); await legacy.locator('#FFTWindow_size').blur(); await upload(legacy)
                    await workflow(context, app.origin, prefix, legacy); await routes(context, app.origin, prefix); await lifetimes(context, app.origin, prefix, mode)
                    console.log(`${mode} gateway ${prefix}: legacy numerical arrays, controls, routes, lifetimes passed`)
                } finally { await context.close(); await app.stop() }
            }
            const app = await server('preview', prefix, true), context = await browser.newContext()
            await context.route('**/*', route => new URL(route.request().url()).origin === app.origin ? route.continue() : route.abort())
            try { await routes(context, app.origin, prefix); console.log(`independent Worker ${prefix}: routes passed`) } finally { await context.close(); await app.stop() }
        }
    } finally { await browser.close(); await old.close() }
})
