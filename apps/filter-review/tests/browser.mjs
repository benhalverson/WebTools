import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, extname } from 'node:path'
import { test } from 'node:test'
import { chromium } from 'playwright'
import { fixture } from './fixtures.mjs'
import { listeningOrigin } from '../../../packages/routing/src/tooling.ts'
import { comparisonRevision } from './oracle.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const app = resolve(root, 'apps/filter-review')
/** Spawn an owned process group, capturing readiness and preserving diagnostics. */
async function start(mode, prefix, gateway = false) {
    const child = spawn(process.execPath, gateway ? ['tooling/serve.ts', mode, '--port', '0'] : ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', '0'], {
        cwd: gateway ? root : app, detached: true, env: { ...process.env, CLOUDFLARE_CF_FETCH_ENABLED: 'false', WEBTOOLS_BASE_PATH: prefix }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const origin = await new Promise((resolvePromise, reject) => {
        const timer = setTimeout(() => reject(new Error(output)), 60000)
        /** Resolve only the Vite listening line, including colored output. */
        const read = chunk => { output += chunk; const url = listeningOrigin(output); if (url) { clearTimeout(timer); resolvePromise(url) } }
        child.stdout.on('data', read); child.stderr.on('data', read)
        child.on('exit', () => { clearTimeout(timer); reject(new Error(output)) })
    }).catch(async error => { await stop(child); throw error })
    return { child, origin }
}
/** Stop servers and all Worker subprocesses even after assertion failures. */
async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    process.kill(-child.pid, 'SIGTERM')
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch { /* Already gone. */ } }, 5000)
    try { await exited } finally { clearTimeout(timer) }
}
/** Wait for the actual Plotly graph to finish rendering three data traces. */
async function ready(page) {
    await page.waitForFunction(() => document.querySelector('#FFTPlot .js-plotly-plot')?.data?.length === 3).catch(async error => { console.error(await page.locator('body').innerText()); throw error })
}
/** Read the real renderer's arrays rather than a production test-only snapshot API. */
async function snapshot(page) {
    return page.locator('#FFTPlot .js-plotly-plot').evaluate(node => node.data.map(trace => ({ x: trace.x, y: trace.y })))
}
/** Compare cross-engine floating-point outputs: exact axes/lengths, bounded
 * transcendental roundoff in dB (1e-9 absolute) or amplitudes (1e-12 absolute). */
function close(actual, expected, tolerance = 1e-9) {
    assert.equal(actual.length, expected.length)
    actual.forEach((trace, axis) => {
        assert.deepEqual(trace.x, expected[axis].x)
        assert.equal(trace.y.length, expected[axis].y.length)
        trace.y.forEach((value, i) => assert.ok(Object.is(value, expected[axis].y[i]) || Math.abs(value - expected[axis].y[i]) <= tolerance, 'spectral bin mismatch'))
    })
}
/** Serve byte-verified legacy sources locally; no external providers are used. */
async function legacyServer() {
    for (const name of ['FilterReview/FilterReview.js', 'Libraries/fft.js', 'Libraries/Array_Math.js']) assert.deepEqual(await readFile(resolve(root, name)), execFileSync('git', ['show', comparisonRevision + ':' + name], { cwd: root }))
    const server = createServer(async (request, response) => {
        try {
            const path = resolve(root, '.' + new URL(request.url, 'http://local').pathname.replace(/\/$/, '/index.html'))
            if (!path.startsWith(root)) throw new Error('Invalid path')
            response.setHeader('Content-Type', { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(path)] ?? 'application/octet-stream')
            response.end(await readFile(path))
        } catch { response.writeHead(404); response.end() }
    })
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    return { server, origin: 'http://127.0.0.1:' + server.address().port }
}
/** Run the actual unchanged legacy browser functions on the same raw bytes.
 * Later-stage filter tracking is outside this ticket; its redraw hooks are idle. */
async function legacySpectrum(page, bytes, source, instance, startTime = 0, endTime = 10, scale = 'db') {
    return page.evaluate(async ({ bytes, source, instance, startTime, endTime, scale }) => {
        await import_done
        const log = new DataflashParser()
        log.processData(new Uint8Array(bytes).buffer, [])
        const params = log.get('PARM')
        const param = name => get_param_value(params, name, false)
        if (source === 'raw') load_from_raw_log(log, 2, [], param)
        else load_from_batch(log, 2, [], param)
        document.getElementById('FFTWindow_size').value = '1024'
        document.getElementById('FFTWindow_per_batch').value = '1'
        const batch = Gyro_batch[instance]
        batch.FFT = run_batch_fft(batch)
        document.getElementById('TimeStart').value = String(startTime)
        document.getElementById('TimeEnd').value = String(endTime)
        document.getElementById('ScaleLog').checked = scale === 'db'
        document.getElementById('ScalePSD').checked = scale === 'psd'
        document.getElementById('Aliasing_none').checked = true
        filters = { notch: [] }
        redraw_post_estimate_and_bode = () => {}
        redraw_Spectrogram = () => {}
        redraw()
        return [0, 1, 2].map(axis => {
            const trace = fft_plot.data[get_FFT_data_index(batch.sensor_num, batch.post_filter ? 1 : 0, axis)]
            return { x: trace.x, y: trace.y }
        })
    }, { bytes: [...bytes], source, instance, startTime, endTime, scale })
}

/** Run the complete unchanged legacy filter workflow on the same uploaded bytes. */
async function legacyComparison(page, origin, bytes, values, version, scale = 'db') {
    await page.goto(origin + '/FilterReview/')
    await page.waitForFunction(() => typeof load === 'function' && !!document.getElementById('FFTPlot')?.data)
    return page.evaluate(async ({ bytes, values, version, scale }) => {
        document.getElementById('log_type_batch').checked = true
        await load(new Uint8Array(bytes).buffer)
        for (const [name, value] of Object.entries(values)) parameter_set_value(name, value)
        document.getElementById('filter_version_' + version).checked = true
        document.getElementById('ScaleLog').checked = scale === 'db'
        document.getElementById('ScalePSD').checked = scale === 'psd'
        document.getElementById('TimeStart').value = '1'
        document.getElementById('TimeEnd').value = '5'
        load_filters(); calculate_transfer_function(); redraw()
        let saved
        window.saveAs = blob => { saved = blob }
        save_parameters()
        return {
            spectrum: [0, 1, 2].map(axis => { const trace = fft_plot.data[get_FFT_data_index(0, 2, axis)]; return { x: trace.x, y: trace.y } }),
            bode: [Bode.data[2], Bode.data[3]].map(trace => ({ x: trace.x, y: trace.y })),
            parameters: await saved.text(),
        }
    }, { bytes: [...bytes], values, version, scale })
}

for (const prefix of ['/', '/Tools/WebTools/']) for (const mode of ['dev', 'preview']) test(mode + ' ' + prefix + ': independent Worker and React workflow', { timeout: 180000 }, async () => {
    if (mode === 'preview') execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: app, env: { ...process.env, CLOUDFLARE_CF_FETCH_ENABLED: 'false', WEBTOOLS_BASE_PATH: prefix }, stdio: 'pipe' })
    const service = await start(mode, prefix)
    const legacy = await legacyServer()
    const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] })
    try {
        const context = await browser.newContext()
        context.setDefaultTimeout(20000)
        await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
        const page = await context.newPage()
        const errors = []
        page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('missing')) console.error('HTTP', response.status(), response.url()) })
        page.on('pageerror', error => { errors.push(error.message); console.error('Preview error', error.message) })
        await page.addInitScript(() => {
            window.metrics = { created: 0, terminated: 0, purges: 0, progress: 0, cancelled: 0, sent: [] }
            const OriginalWorker = window.Worker
            window.Worker = class extends OriginalWorker {
                constructor(...args) {
                    super(...args); window.metrics.created++
                    this.addEventListener('message', event => {
                        if (event.data.result && window.cancelFiltersOnResult) {
                            window.cancelFiltersOnResult = false
                            document.querySelectorAll('button').forEach(button => { if (button.textContent === 'Cancel filters') button.click() })
                            window.filtersCancelled = true
                        }
                        if (event.data.kind === 'progress') {
                            window.metrics.progress++
                            if (window.cancelOnProgress) {
                                window.cancelOnProgress = false
                                document.querySelectorAll('button').forEach(button => { if (button.textContent === 'Cancel') button.click() })
                                window.metrics.cancelled++
                            }
                        }
                    })
                }
                terminate() { window.metrics.terminated++; super.terminate() }
            }
            let vendor
            Object.defineProperty(window, 'Plotly', { configurable: true, get: () => vendor, set(value) {
                vendor = value
                const purge = value.purge
                value.purge = (...args) => { window.metrics.purges++; return purge(...args) }
            } })
            window.pendingLoads = new Set()
            window.open = path => ({
                addEventListener(_name, callback) { window.pendingLoads.add(callback); if (!window.holdTransfers) callback() },
                removeEventListener(_name, callback) { window.pendingLoads.delete(callback) },
                postMessage(message) { window.metrics.sent.push({ path, name: message.data.name, size: message.data.size }) },
            })
        })
        const base = service.origin + prefix + 'FilterReviewPreview/'
        assert.equal((await page.goto(base)).status(), 200)
        assert.equal((await context.request.get(base + 'missing')).status(), 404)
        assert.equal((await context.request.get(base + 'dataflash/vendor/parser.js')).status(), 200)
        const reference = await context.newPage()
        reference.on('pageerror', error => console.error('Legacy error', error.message))
        reference.on('dialog', dialog => dialog.dismiss())
        await reference.goto(legacy.origin + '/FilterReview/')
        await reference.waitForFunction(() => typeof run_batch_fft === 'function' && !!document.getElementById('FFTPlot')?.data)
        const bytes = fixture()
        await page.getByLabel('Load log').setInputFiles({ name: 'both.bin', mimeType: 'application/octet-stream', buffer: bytes })
        await ready(page)
        close(await snapshot(page), await legacySpectrum(reference, bytes, 'batch', 0))
        const filterBytes = fixture('batch')
        await page.getByLabel('Load log').setInputFiles({ name: 'filters.bin', mimeType: 'application/octet-stream', buffer: filterBytes })
        await ready(page)
        await page.waitForFunction(() => document.querySelector('select#INS_HNTCH_ENABLE'))
        const filterValues = { INS_GYRO_FILTER: '30', INS_HNTCH_ENABLE: '1', INS_HNTCH_MODE: '0', INS_HNTCH_FREQ: '80', INS_HNTCH_BW: '40', INS_HNTCH_ATT: '40', INS_HNTCH_REF: '1', INS_HNTCH_FM_RAT: '0.5', INS_HNTCH_HMNCS: '3', INS_HNTCH_OPTS: '64' }
        for (const [name, value] of Object.entries(filterValues)) {
            const control = page.locator('#' + name)
            if (await control.evaluate(node => node.tagName === 'SELECT')) await control.selectOption(value)
            else await control.fill(value)
        }
        await page.getByLabel('Filter version', { exact: true }).selectOption('4')
        await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
        await page.waitForFunction(() => !!document.querySelector('#PredictedFFT .js-plotly-plot')?.data)
        const expectedFilters = await legacyComparison(reference, legacy.origin, filterBytes, filterValues, 4)
        close(await page.locator('#PredictedFFT .js-plotly-plot').evaluate(node => node.data.map(trace => ({ x: trace.x, y: trace.y }))), expectedFilters.spectrum)
        close(await page.locator('#BodeMagnitude .js-plotly-plot').evaluate(node => [{ x: node.data[1].x, y: node.data[1].y }]), [expectedFilters.bode[0]])
        close(await page.locator('#BodePhase .js-plotly-plot').evaluate(node => [{ x: node.data[1].x, y: node.data[1].y }]), [expectedFilters.bode[1]], 1e-7)
        const downloading = page.waitForEvent('download')
        await page.getByRole('button', { name: 'Save parameters', exact: true }).click()
        const download = await downloading
        assert.equal(download.suggestedFilename(), 'filter.param')
        assert.equal(await readFile(await download.path(), 'utf8'), expectedFilters.parameters)
        await page.evaluate(() => { window.cancelFiltersOnResult = true })
        await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
        await page.waitForFunction(() => window.filtersCancelled)
        assert.equal(await page.locator('#PredictedFFT').count(), 0)
        await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
        await page.waitForFunction(() => !!document.querySelector('#PredictedFFT .js-plotly-plot')?.data)

        await page.getByRole('button', { name: 'Recalculate', exact: true }).click(); await ready(page)
        assert.equal(await page.locator('#INS_HNTCH_FREQ').inputValue(), '80')
        assert.equal(await page.getByLabel('Filter version', { exact: true }).inputValue(), '4')
        await page.getByLabel('Load log').setInputFiles({ name: 'both.bin', mimeType: 'application/octet-stream', buffer: bytes })
        await ready(page)
        await page.getByLabel('IMU', { exact: true }).selectOption('1'); await ready(page)
        close(await snapshot(page), await legacySpectrum(reference, bytes, 'batch', 1))
        await page.getByLabel('Source', { exact: true }).selectOption('raw'); await ready(page)
        close(await snapshot(page), await legacySpectrum(reference, bytes, 'raw', 1, 1, 4))
        await page.getByLabel('Window size').press('ArrowUp')
        assert.equal(await page.getByLabel('Window size').inputValue(), '2048')
        await page.getByLabel('Window size').press('ArrowDown')
        assert.equal(await page.getByLabel('Window size').inputValue(), '1024')
        await page.getByLabel('Start', { exact: true }).fill('1.5')
        await page.getByLabel('End', { exact: true }).fill('2.1')
        await page.waitForFunction(() => document.querySelector('#TimePlot .js-plotly-plot')?.layout.xaxis.range[1] === 2.1)
        close(await snapshot(page), await legacySpectrum(reference, bytes, 'raw', 1, 1.5, 2.1))
        await page.getByLabel('Amplitude', { exact: true }).selectOption('psd')
        await page.waitForFunction(() => document.querySelector('#FFTPlot .js-plotly-plot')?.layout.yaxis.title.text === 'PSD (dB/Hz)')
        close(await snapshot(page), await legacySpectrum(reference, bytes, 'raw', 1, 1.5, 2.1, 'psd'))
        await page.evaluate(() => window.Plotly.relayout(document.querySelector('#TimePlot .js-plotly-plot'), { 'xaxis.range[0]': 2, 'xaxis.range[1]': 3 }))
        assert.equal(await page.getByLabel('Start', { exact: true }).inputValue(), '2')
        await page.getByRole('button', { name: 'Hardware Report', exact: true }).click()
        assert.deepEqual(await page.evaluate(() => window.metrics.sent), [{ path: '../HardwareReport', name: 'both.bin', size: bytes.length }])
        await page.evaluate(() => { window.holdTransfers = true; window.metrics.sent = [] })
        await page.getByRole('button', { name: 'Hardware Report', exact: true }).click()
        await page.getByLabel('Load log').setInputFiles({ name: 'both.bin', mimeType: 'application/octet-stream', buffer: bytes })
        await ready(page)
        assert.equal(await page.evaluate(() => window.pendingLoads.size), 0, 'same-name replacement disposes old transfers')
        await page.evaluate(() => { for (const callback of window.pendingLoads) callback() })
        assert.deepEqual(await page.evaluate(() => window.metrics.sent), [])
        await page.getByLabel('Start', { exact: true }).fill('2')
        await page.getByLabel('End', { exact: true }).fill('3')
        await page.getByLabel('Window size').fill('300'); await page.getByRole('button', { name: 'Recalculate', exact: true }).click()
        await page.getByRole('alert').filter({ hasText: 'power of two' }).waitFor()
        await page.getByLabel('Window size').fill('1024'); await page.getByRole('button', { name: 'Recalculate', exact: true }).click(); await ready(page)
        assert.equal(await page.getByLabel('Start', { exact: true }).inputValue(), '2')
        assert.equal(await page.getByLabel('End', { exact: true }).inputValue(), '3')
        for (let i = 0; i < 2; i++) {
            await page.getByRole('button', { name: 'Recalculate', exact: true }).click()
            await page.getByRole('button', { name: 'Reset', exact: true }).click()
            assert.equal(await page.locator('#FFTPlot').count(), 0)
            await page.getByLabel('Load log').setInputFiles({ name: 'replace.bin', mimeType: 'application/octet-stream', buffer: bytes })
            await ready(page)
        }
        await page.evaluate(() => { window.cancelOnProgress = true })
        await page.getByRole('button', { name: 'Recalculate', exact: true }).click()
        await page.waitForFunction(() => window.metrics.cancelled === 1)
        assert.equal(await page.locator('#FFTPlot').count(), 0, 'cancel from actual FFT progress suppresses queued results')
        await page.getByRole('button', { name: 'Reset', exact: true }).click()
        await page.evaluate(bytes => window.postMessage({ type: 'arrayBuffer', data: new Uint8Array(bytes).buffer }, '*'), [...fixture('raw')])
        await ready(page)
        await page.getByRole('button', { name: 'Reset', exact: true }).click()
        await page.getByLabel('Load log').setInputFiles({ name: 'bad.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3]) })
        await page.getByRole('alert').waitFor()
        await page.evaluate(bytes => window.postMessage({ type: 'file', data: new File([new Uint8Array(bytes)], 'received.bin') }, '*'), [...fixture('batch')])
        await ready(page)
        await page.getByRole('button', { name: 'Reset', exact: true }).click()
        const metrics = await page.evaluate(() => window.metrics)
        assert.equal(metrics.created, metrics.terminated)
        assert.ok(metrics.purges >= 10)
        assert.deepEqual(errors, [])
        assert.equal(await page.getByRole('link', { name: 'Open the complete Filter Review tool' }).getAttribute('href'), prefix + 'FilterReview/')
    } finally { await browser.close(); legacy.server.closeAllConnections(); await new Promise(resolvePromise => legacy.server.close(resolvePromise)); await stop(service.child) }
})

for (const prefix of ['/Tools/WebTools/', '/']) test('gateway preserves public legacy route ' + prefix, { timeout: 180000 }, async () => {
    execFileSync('pnpm', ['build'], { cwd: root, env: { ...process.env, CLOUDFLARE_CF_FETCH_ENABLED: 'false', WEBTOOLS_BASE_PATH: prefix }, stdio: 'pipe' })
    const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] })
    try {
        for (const mode of ['dev', 'preview']) {
            const service = await start(mode, prefix, true)
            const context = await browser.newContext()
            await context.route('**/*', route => new URL(route.request().url()).origin === service.origin ? route.continue() : route.abort())
            try {
                const page = await context.newPage()
                const base = service.origin + prefix
                assert.equal((await context.request.get(base + 'FilterReview/')).status(), 200)
                assert.deepEqual(await (await context.request.get(base + 'FilterReview/FilterReview.js')).body(), execFileSync('git', ['show', comparisonRevision + ':FilterReview/FilterReview.js'], { cwd: root }))
                assert.equal((await context.request.get(base + 'FilterReviewPreview/missing')).status(), 404)
                assert.deepEqual(await (await context.request.get(base + 'FilterReviewPreview/dataflash/vendor/parser.js')).body(), await readFile(resolve(root, 'packages/dataflash/dist/vendor/parser.js')))
                await page.goto(base + 'FilterReviewPreview/')
                await page.getByLabel('Load log').setInputFiles({ name: 'batch.bin', mimeType: 'application/octet-stream', buffer: fixture('batch') })
                await ready(page)
                await page.getByRole('link', { name: 'Open the complete Filter Review tool' }).click()
                assert.equal(new URL(page.url()).pathname, prefix + 'FilterReview/')
                assert.equal(await page.title(), 'ArduPilot Filter Review')
                if (prefix !== '/') assert.equal((await context.request.get(service.origin + '/FilterReviewPreview/')).status(), 404)
            } finally { await context.close(); await stop(service.child) }
        }
    } finally { await browser.close() }
})
