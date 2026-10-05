import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, extname } from 'node:path'
import { test } from 'node:test'
import { chromium } from 'playwright'
import { root, comparison } from './legacy.mjs'
const fixture = join(root, 'apps/airspeed-fit/tests/fixtures/plane-nominal.BIN')
const tolerance = 1e-10 // Cross-V8 sqrt/trigonometric roundoff only; exports remain byte-exact.

/** Terminate a complete owned gateway/Worker process tree even after failed startup. */
async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return
    const done = once(child, 'exit')
    process.kill(-child.pid, 'SIGTERM')
    const timer = setTimeout(() => {
        try {
            process.kill(-child.pid, 'SIGKILL')
        } catch {}
    }, 5000)
    try {
        await done
    } finally {
        clearTimeout(timer)
    }
}
/** Run the required independent production build and preserve failure diagnostics. */
async function build(base) {
    const child = spawn('pnpm', ['build'], {
        cwd: root,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WEBTOOLS_BASE_PATH: base },
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    try {
        const [code] = await once(child, 'exit')
        assert.equal(code, 0, output)
    } finally {
        await stop(child)
    }
}
/** Start all independent app Workers behind the shared same-origin gateway. */
async function serve(mode, base) {
    const child = spawn(process.execPath, ['tooling/serve.ts', mode, '--port', '0'], {
        cwd: root,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WEBTOOLS_BASE_PATH: base, BROWSER: 'none' },
    })
    let output = ''
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(output)), 60000)
            /** Recognize only the gateway readiness announcement after all apps have started. */
            const read = (chunk) => {
                output += chunk
                const found = output.match(/WebTools (?:dev|preview): (http:\/\/127\.0\.0\.1:\d+)/)
                if (found) {
                    clearTimeout(timer)
                    resolve(found[1])
                }
            }
            child.stdout.on('data', read)
            child.stderr.on('data', read)
            child.on('error', (error) => {
                clearTimeout(timer)
                reject(error)
            })
            child.on('exit', (code) => {
                clearTimeout(timer)
                reject(new Error(`${code}: ${output}`))
            })
        })
        return { origin, close: () => stop(child) }
    } catch (error) {
        await stop(child)
        throw error
    }
}
/** Serve exact baseline bytes for owned files and byte-identical pinned submodule vendors. */
async function legacyServer() {
    const cache = new Map()
    const server = createServer(async (req, res) => {
        try {
            let path = decodeURIComponent(new URL(req.url, 'http://local').pathname).slice(1)
            if (path.includes('..')) throw new Error('invalid path')
            if (path.endsWith('/')) path += 'index.html'
            if (!cache.has(path)) {
                const submodule = path.startsWith('modules/plotly.js/') || path.startsWith('modules/JsDataflashParser/')
                cache.set(
                    path,
                    submodule
                        ? await readFile(join(root, path))
                        : execFileSync('git', ['show', `${comparison}:${path}`], {
                              cwd: root,
                              maxBuffer: 32 * 1024 * 1024,
                          }),
                )
            }
            res.setHeader(
                'content-type',
                {
                    '.html': 'text/html',
                    '.js': 'text/javascript',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.svg': 'image/svg+xml',
                }[extname(path)] ?? 'application/octet-stream',
            )
            res.end(cache.get(path))
        } catch {
            res.writeHead(404)
            res.end('Not found')
        }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    return {
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () =>
            new Promise((resolve) => {
                server.closeAllConnections()
                server.close(resolve)
            }),
    }
}
/** Compare all arrays and numbers recursively, with no tolerance for structure/labels. */
function compare(actual, expected, path = 'result') {
    if (typeof expected === 'number') {
        assert.equal(typeof actual, 'number', path)
        assert.ok(
            Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
            `${path}: ${actual} != ${expected}`,
        )
    } else if (Array.isArray(expected)) {
        assert.ok(Array.isArray(actual), path)
        assert.equal(actual.length, expected.length, path)
        expected.forEach((v, i) => compare(actual[i], v, `${path}[${i}]`))
    } else if (expected && typeof expected === 'object') {
        for (const [k, v] of Object.entries(expected)) compare(actual[k], v, `${path}.${k}`)
    } else assert.equal(actual, expected, path)
}
/** Wait until the real renderer has committed its fitted series. */
async function settled(page) {
    await page.waitForFunction(
        () =>
            document.querySelector('#ARSPD_RATIO')?.value &&
            !document.querySelector('[role=status]') &&
            document.querySelector('#tas_combined .js-plotly-plot')?.data?.length,
    )
}
/** Read user-facing ratio and complete numeric series from actual Plotly nodes. */
async function snapshot(page, legacy = false) {
    return page.evaluate((legacy) => {
        const ids = ['tas_combined', 'resid_combined', 'rms_bar', 'wm_wind']
        return {
            ratio: document.querySelector('#ARSPD_RATIO').value,
            range: ['TimeStart', 'TimeEnd'].map((id) => +document.getElementById(id).value),
            plots: ids.map((id) => {
                const node = legacy
                    ? document.getElementById(id)
                    : document.querySelector('#' + id + ' .js-plotly-plot')
                return node.data.map((trace) => ({
                    x: Array.from(trace.x),
                    y: Array.from(trace.y),
                    name: trace.name ?? null,
                    customdata: trace.customdata ?? null,
                }))
            }),
        }
    }, legacy)
}
/** Download through the original FileSaver distribution and inspect the exact file bytes. */
async function exported(page) {
    const download = page.waitForEvent('download')
    await page.locator('#SaveParams').click()
    const file = await download
    assert.equal(file.suggestedFilename(), 'AirspeedFit.param')
    return readFile(await file.path(), 'utf8')
}
/** Apply identical source, range, temperature and process-noise selections to the oracle. */
async function legacyOptions(page, { start, end, temperature, source = 0, q = -1.5 }) {
    await page.evaluate(
        ({ start, end, temperature, source, q }) => {
            document.getElementById('TimeStart').value = start
            document.getElementById('TimeEnd').value = end
            document.getElementById('ground_temp').value = temperature
            document.getElementById('q_slider').value = q
            log_data.sources.forEach((s, i) => (s.select.checked = i === source))
            calculate()
        },
        { start, end, temperature, source, q },
    )
}
/** Test routes, real fitting, selections, exports, Open In and recovery through native controls. */
async function controls(context, page, legacy, origin, base) {
    const url = origin + base + 'AirspeedFit/'
    const redirect = await context.request.get(url.slice(0, -1) + '?x=1', { maxRedirects: 0 })
    assert.equal(redirect.status(), 308)
    assert.equal(new URL(redirect.headers().location, url).href, url + '?x=1')
    for (const path of ['missing', 'assets/missing.js', 'missing.html', 'dataflash/missing.js'])
        assert.equal((await context.request.get(url + path)).status(), 404)
    for (const [path, source] of [
        ['Readme.md', 'AirspeedFit/Readme.md'],
        ['params.json', 'AirspeedFit/params.json'],
        ['dataflash/vendor/parser.js', 'modules/JsDataflashParser/parser.js'],
    ]) {
        const response = await context.request.get(url + path)
        assert.equal(response.status(), 200)
        assert.deepEqual(await response.body(), await readFile(join(root, source)))
    }
    if (base !== '/') assert.equal((await context.request.get(origin + '/AirspeedFit/')).status(), 404)
    await page.goto(url + 'index.html')
    await page.locator('#fileItem').setInputFiles(fixture)
    await settled(page)
    await legacyOptions(legacy, { start: 47, end: 52, temperature: 11 })
    compare(await snapshot(page), await snapshot(legacy, true))
    assert.equal(await exported(page), await exported(legacy))
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name))
    assert.ok(resources.some((url) => url.includes('/dataflash/vendor/parser.js')))
    assert.ok(resources.every((url) => !url.endsWith('/airspeedfit.js') && !url.endsWith('/airspeedfit_core.js')))
    for (const scenario of [
        { start: 48, end: 51, temperature: 25, source: 1 },
        { start: 49, end: 50, temperature: -5, source: 2 },
    ]) {
        for (const [id, value] of [
            ['TimeStart', scenario.start],
            ['TimeEnd', scenario.end],
            ['ground_temp', scenario.temperature],
        ])
            await page.locator('#' + id).fill(String(value))
        await page.locator('input[name=velocity]').nth(scenario.source).check()
        assert.equal(await page.locator('#results').count(), 0)
        await page.locator('#calculate').click()
        await settled(page)
        await legacyOptions(legacy, scenario)
        compare(await snapshot(page), await snapshot(legacy, true))
        assert.equal(await exported(page), await exported(legacy))
    }
    // Native multi-step pointer drag must keep the slider and four result plots mounted.
    await page.locator('#q_slider').scrollIntoViewIfNeeded()
    const slider = await page.locator('#q_slider').elementHandle()
    const rect = await slider.boundingBox()
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
    await page.mouse.down()
    for (const fraction of [0.6, 0.7, 0.8]) {
        await page.mouse.move(rect.x + rect.width * fraction, rect.y + rect.height / 2)
        assert.equal(await slider.evaluate((node) => node.isConnected), true)
    }
    await page.mouse.up()
    await settled(page)
    assert.equal(await slider.evaluate((node) => node.isConnected), true)
    await page.locator('#q_slider').focus()
    await page.keyboard.press('ArrowLeft')
    await settled(page)
    assert.equal(await slider.evaluate((node) => node === document.activeElement), true)
    const q = Number(await page.locator('#q_slider').inputValue())
    await legacyOptions(legacy, { start: 49, end: 50, temperature: -5, source: 2, q })
    compare(await snapshot(page), await snapshot(legacy, true))
    await page
        .locator('#fileItem')
        .setInputFiles({
            name: 'replacement.bin',
            mimeType: 'application/octet-stream',
            buffer: await readFile(fixture),
        })
    await settled(page)
    assert.equal(Number(await page.locator('#q_slider').inputValue()), q, 'replacement preserves q')
    // Relayout events mirror the legacy rounded selection, then recalculate.
    await page.evaluate(() =>
        window.Plotly.relayout(document.querySelector('#FlightData .js-plotly-plot'), { 'xaxis.range': [48.1, 50.2] }),
    )
    await page.waitForFunction(
        () => document.getElementById('TimeStart').value === '48' && document.getElementById('TimeEnd').value === '51',
    )
    await page.locator('#calculate').click()
    await settled(page)
    await legacyOptions(legacy, { start: 48, end: 51, temperature: 11, q })
    compare(await snapshot(page), await snapshot(legacy, true))
    await page.getByLabel('Include in fit').uncheck()
    await page.locator('#calculate').click()
    await page.getByRole('alert').filter({ hasText: 'No airspeed sensor selected' }).waitFor()
    await page.getByLabel('Include in fit').check()
    await page.locator('#calculate').click()
    await settled(page)
    await page.locator('#ground_temp').fill('')
    await page.locator('#calculate').click()
    await page.getByRole('alert').filter({ hasText: 'temperature' }).waitFor()
    await page.locator('#temp_source').selectOption('baro')
    await page.locator('#calculate').click()
    await settled(page)
    await page
        .locator('#fileItem')
        .setInputFiles({ name: 'bad.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(0) })
    await page.getByRole('alert').waitFor()
    assert.equal(await page.locator('#results').count(), 0)
    await page.locator('#fileItem').setInputFiles(fixture)
    await settled(page)
    await page.locator('#OpenIn').click()
    assert.equal(await page.getByRole('button', { name: 'Hardware Report', exact: true }).isEnabled(), true)
    // The shared sender must open the existing prefixed same-origin destination.
    const popup = context.waitForEvent('page')
    await page.getByRole('button', { name: 'Hardware Report', exact: true }).click()
    const target = await popup
    await target.waitForURL(origin + base + 'HardwareReport/')
    await target.close()
    // Receiving an actual File exercises the legacy wire format and file replacement.
    const bytes = Array.from(await readFile(fixture))
    await page.evaluate(
        (bytes) => window.postMessage({ type: 'file', data: new File([new Uint8Array(bytes)], 'received.bin') }, '*'),
        bytes,
    )
    await page.waitForFunction(() => document.title === 'AirspeedFit: received.bin')
    await settled(page)
}

/** Instrument real vendor resources, then unmount/remount the built app while work is pending. */
async function lifecycle(page, origin, base, mode) {
    await page.goto(origin + base + 'AirspeedFit/')
    const application = (await readdir(join(root, 'apps/airspeed-fit/dist/client/assets'))).find(
        (name) => name.startsWith('application-') && name.endsWith('.js'),
    )
    await page.evaluate(
        async ({ mode, application }) => {
            const entry =
                mode === 'dev'
                    ? [...document.scripts].find((s) => s.src.endsWith('/src/main.tsx')).src
                    : new URL('assets/' + application, location.href).href
            const module = await import(entry)
            window.appModule = module
            window.disposeApp = module.unmount
            window.livePlots = new Set()
            window.purgeCount = 0
            const originalNew = window.Plotly.newPlot,
                originalPurge = window.Plotly.purge
            window.Plotly.newPlot = async (...args) => {
                const result = await originalNew(...args)
                window.livePlots.add(args[0])
                return result
            }
            window.Plotly.purge = (node) => {
                window.livePlots.delete(node)
                window.purgeCount++
                return originalPurge(node)
            }
            window.disposeApp()
            window.disposeApp = module.mountApplication(document.getElementById('root'))
        },
        { mode, application },
    )
    for (let i = 0; i < 3; i++) {
        await page.locator('#fileItem').setInputFiles(fixture)
        await settled(page)
        await page.evaluate(() => window.disposeApp())
        await page.waitForFunction(() => window.livePlots.size === 0)
        assert.equal(await page.locator('.js-plotly-plot').count(), 0)
        await page.evaluate(() => {
            window.disposeApp = window.appModule.mountApplication(document.getElementById('root'))
        })
    }
    // Delay the actual file read, replace it, then resolve the earlier file after the replacement.
    await page.evaluate(() => {
        const original = File.prototype.arrayBuffer
        File.prototype.arrayBuffer = function () {
            if (this.name === 'delayed.bin')
                return new Promise((resolve) => {
                    window.releaseRead = () => original.call(this).then(resolve)
                })
            return original.call(this)
        }
    })
    await page
        .locator('#fileItem')
        .setInputFiles({ name: 'delayed.bin', mimeType: 'application/octet-stream', buffer: await readFile(fixture) })
    await page.waitForFunction(() => typeof window.releaseRead === 'function')
    await page
        .locator('#fileItem')
        .setInputFiles({ name: 'bad.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(0) })
    await page.getByRole('alert').waitFor()
    await page.evaluate(() => window.releaseRead())
    assert.equal(await page.locator('#results').count(), 0)
    // A read finishing after explicit unmount must not recreate plots or results.
    await page
        .locator('#fileItem')
        .setInputFiles({ name: 'delayed.bin', mimeType: 'application/octet-stream', buffer: await readFile(fixture) })
    await page.evaluate(() => window.disposeApp())
    await page.evaluate(() => window.releaseRead())
    await page.waitForFunction(() => window.livePlots.size === 0)
    assert.equal(await page.locator('#root').textContent(), '')
    await page.evaluate(() => {
        window.disposeApp = window.appModule.mountApplication(document.getElementById('root'))
    })
    await page.locator('#fileItem').setInputFiles(fixture)
    await settled(page)
    assert.ok(await page.evaluate(() => window.purgeCount > 10))
}

/** Exercise weather defaults and actual AbortSignals while replaying fixed responses;
 * no request reaches a weather provider. Also settle an actual Plotly initialization late. */
async function weatherAndPendingPlots(page) {
    const weatherPattern = /https:\/\/(?:archive-api|api)\.open-meteo\.com\//
    await page.route(weatherPattern, (route) =>
        route.fulfill({
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ hourly: { time: ['2020-01-01T00:00'], temperature_2m: [23] } }),
        }),
    )
    await page
        .locator('#fileItem')
        .setInputFiles({ name: 'weather.bin', mimeType: 'application/octet-stream', buffer: await readFile(fixture) })
    await page.waitForFunction(() => document.getElementById('ground_temp').value === '23')
    await settled(page)
    assert.equal(await page.locator('#temp_source').inputValue(), 'openmeteo')
    await page.unroute(weatherPattern)
    await page.evaluate(() => {
        const original = window.fetch
        window.weatherSignals = []
        window.fetch = (url, options) => {
            if (String(url).includes('open-meteo.com')) window.weatherSignals.push(options.signal)
            return original(url, options)
        }
    })
    let release
    await page.route(weatherPattern, async (route) => {
        await new Promise((resolve) => {
            release = resolve
        })
        await route
            .fulfill({
                contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*' },
                body: JSON.stringify({ hourly: { time: ['2020-01-01T00:00'], temperature_2m: [99] } }),
            })
            .catch(() => {})
    })
    try {
        await page.locator('#fileItem').setInputFiles(fixture)
        await page.waitForFunction(() => window.weatherSignals.length === 1)
        await page
            .locator('#fileItem')
            .setInputFiles({ name: 'invalid.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(0) })
        await page.getByRole('alert').waitFor()
        assert.equal(await page.evaluate(() => window.weatherSignals[0].aborted), true)
        release()
        await page.waitForFunction(() => !document.querySelector('#results'))
        await page.locator('#fileItem').setInputFiles(fixture)
        await page.waitForFunction(() => window.weatherSignals.length === 2)
        await page.evaluate(() => window.disposeApp())
        assert.equal(await page.evaluate(() => window.weatherSignals[1].aborted), true)
    } finally {
        release?.()
        await page.unroute(weatherPattern)
    }
    await page.evaluate(() => {
        const original = window.Plotly.newPlot
        window.Plotly.newPlot = async (...args) => {
            const plot = await original(...args)
            await new Promise((resolve) => {
                window.releasePlot = resolve
            })
            return plot
        }
        window.disposeApp = window.appModule.mountApplication(document.getElementById('root'))
    })
    await page.waitForFunction(() => typeof window.releasePlot === 'function')
    await page.evaluate(() => {
        window.disposeApp()
        window.releasePlot()
    })
    await page.waitForFunction(() => window.livePlots.size === 0)
    assert.equal(await page.locator('#root').textContent(), '')
}

test('AirspeedFit real browser baseline, dev and Worker preview at both prefixes', { timeout: 600000 }, async (t) => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROME_PATH || undefined,
        args: ['--enable-unsafe-swiftshader'],
    })
    const oldServer = await legacyServer()
    const oldContext = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 1000 } })
    await oldContext.route('**/*', (route) =>
        new URL(route.request().url()).origin === oldServer.origin ? route.continue() : route.abort(),
    )
    const oldPage = await oldContext.newPage()
    oldPage.on('dialog', (dialog) => dialog.accept())
    try {
        await oldPage.goto(oldServer.origin + '/AirspeedFit/')
        await oldPage.locator('#fileItem').setInputFiles(fixture)
        await oldPage.waitForFunction(() => document.getElementById('ARSPD_RATIO')?.value)
        for (const base of process.env.AIRSPEED_TEST_PREFIX
            ? [process.env.AIRSPEED_TEST_PREFIX]
            : ['/Tools/WebTools/', '/']) {
            await build(base)
            for (const mode of process.env.AIRSPEED_TEST_MODE ? [process.env.AIRSPEED_TEST_MODE] : ['dev', 'preview'])
                await t.test(`${mode} ${base}`, { timeout: 120000 }, async () => {
                    const server = await serve(mode, base)
                    const context = await browser.newContext({
                        acceptDownloads: true,
                        viewport: { width: 1400, height: 1000 },
                    })
                    const errors = []
                    context.on('page', (page) => {
                        page.on('pageerror', (error) => errors.push(error.message))
                        page.on('dialog', (dialog) => dialog.accept())
                    })
                    await context.route('**/*', (route) =>
                        new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort(),
                    )
                    try {
                        const page = await context.newPage()
                        await controls(context, page, oldPage, server.origin, base)
                        await lifecycle(page, server.origin, base, mode)
                        await weatherAndPendingPlots(page)
                        // Missing parser and vendor recovery must surface an error and permit a fresh load.
                        await page.route('**/dataflash/vendor/parser.js', (route) => route.abort())
                        await page.reload()
                        await page.locator('#fileItem').setInputFiles(fixture)
                        await page.getByRole('alert').waitFor()
                        await page.unroute('**/dataflash/vendor/parser.js')
                        await page.reload()
                        await page.locator('#fileItem').setInputFiles(fixture)
                        await settled(page)
                        await page.route('**/vendor/matrix.umd.js', (route) => route.abort())
                        await page.reload()
                        await page.getByRole('alert').filter({ hasText: 'Unable to load' }).waitFor()
                        await page.unroute('**/vendor/matrix.umd.js')
                        await page.reload()
                        await page.locator('#fileItem').setInputFiles(fixture)
                        await settled(page)
                        assert.deepEqual(errors, [])
                    } catch (error) {
                        console.error(error)
                        throw error
                    } finally {
                        await context.close()
                        await server.close()
                    }
                })
        }
    } finally {
        await oldContext.close()
        await oldServer.close()
        await browser.close()
    }
})
