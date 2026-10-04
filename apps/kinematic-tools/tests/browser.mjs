import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { listeningOrigin } from '@webtools/routing/tooling'
import { root, legacy, controlModule, ruckigModule } from './legacy.mjs'
import { mainDefaults, planeDefaults } from '../src/model.ts'
import { scenarios } from './scenarios.mjs'
const exec = promisify(execFile)
const app = root + 'apps/kinematic-tools/'

/** Stop every descendant of an owned local server, with a bounded fallback. */
async function stop(child) {
    if (child.exitCode !== null || child.signalCode) return
    const exited = once(child, 'exit')
    process.kill(-child.pid, 'SIGTERM')
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, 5000)
    try { await exited } finally { clearTimeout(timer) }
}

/** Launch either this independent Worker or the same-origin workspace gateway. */
async function server(mode, prefix, gateway = false) {
    const child = spawn(process.execPath, gateway ? ['tooling/serve.ts', mode, '--port', '0'] : ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', '0'], {
        cwd: gateway ? root : app, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WEBTOOLS_BASE_PATH: prefix, PORTAL_BASE_PATH: prefix, BROWSER: 'none' },
    })
    let output = ''
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(output)), 60000)
            /** Accumulate readiness output to handle split terminal escape sequences. */
            function read(chunk) {
                output += chunk.toString(); const origin = listeningOrigin(output)
                if (origin) { clearTimeout(timer); resolve(origin) }
            }
            child.stdout.on('data', read); child.stderr.on('data', read)
            child.once('error', error => { clearTimeout(timer); reject(error) })
            child.once('exit', code => { clearTimeout(timer); reject(new Error(`${code}: ${output}`)) })
        })
        return { origin, stop: () => stop(child) }
    } catch (error) { await stop(child); throw error }
}

/** Wait for all real Plotly traces, including async WASM initialization. */
async function ready(page) {
    await page.waitForFunction(() => document.querySelectorAll('.js-plotly-plot').length === 4 && document.querySelector('#ang_pos .js-plotly-plot')?.data?.[0]?.x?.length > 1)
}

/** Compare exact serialized trace arrays in Chromium with unmodified legacy Node/WASM outputs. */
async function compare(page, expected) {
    await page.waitForFunction(expected => ['ang_pos', 'ang_vel', 'ang_accel', 'ang_jerk'].every((id, i) => {
        const actual = document.querySelector(`#${id} .js-plotly-plot`)
        return actual?.data && expected[i].data.every((trace, j) => ['x', 'y', 'name', 'visible'].every(key => JSON.stringify(actual.data[j][key]) === JSON.stringify(trace[key])))
    }), expected)
    const actual = await page.evaluate(() => ['ang_pos', 'ang_vel', 'ang_accel', 'ang_jerk'].map(id => {
        const plot = document.querySelector(`#${id} .js-plotly-plot`)
        return { data: plot.data.map(({ x, y, name, visible }) => ({ x, y, name, visible })), shapes: plot.layout.shapes }
    }))
    assert.equal(JSON.stringify(actual.map(p => p.data)), JSON.stringify(expected.map(p => p.data.map(({ x, y, name, visible }) => ({ x, y, name, visible })))))
}

/** Exercise navigation, controls, resource bytes and synchronized view reset. */
async function exercise(context, origin, prefix, oracles) {
    const base = `${origin}${prefix}KinematicTool/`
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    for (const plane of [false, true]) {
        const path = base + (plane ? 'plane/' : '')
        const response = await page.goto(path); assert.equal(response.status(), 200); await ready(page)
        const defaults = plane ? planeDefaults : mainDefaults, oracle = oracles[plane ? 1 : 0]
        await compare(page, await oracle.run(defaults, 'R', 'angle'))
        for (const [attribute, value] of [['min', '0.1'], ['step', '0.1'], ['max', '10']]) assert.equal(await page.locator('#end_time').getAttribute(attribute), value)
        for (const [name, axis, mode, overrides] of scenarios) {
            await page.reload(); await ready(page)
            await page.locator(`input[name=axis][value="${axis}"]`).check()
            await page.locator(`input[name=mode][value="${mode}"]`).check()
            for (const [id, value] of Object.entries(overrides)) {
                const field = page.locator(`#${id}`)
                if (await field.count() && await field.isVisible() && await field.isEnabled()) await field.fill(value)
            }
            await compare(page, await oracle.run({ ...defaults, ...overrides }, axis, mode))
            assert.equal(await page.locator('#desired_vel').isDisabled(), mode === 'angle', name)
            assert.equal(await page.locator('#desired_pos').isDisabled(), mode === 'rate', name)
        }
        // Zoom propagation and the legacy reset event from a different plot.
        await page.evaluate(() => window.Plotly.relayout(document.querySelector('#ang_pos .js-plotly-plot'), { 'xaxis.range[0]': 0.1, 'xaxis.range[1]': 0.4 }))
        await page.waitForFunction(() => [...document.querySelectorAll('.js-plotly-plot')].every(p => p.layout.xaxis.range?.[0] === 0.1))
        await page.evaluate(() => window.Plotly.relayout(document.querySelector('#ang_vel .js-plotly-plot'), { 'xaxis.autorange': true, 'yaxis.autorange': true }))
        await page.waitForFunction(() => [...document.querySelectorAll('.js-plotly-plot')].every(p => p.layout.xaxis.autorange === true))
        const link = page.getByRole('link', { name: plane ? 'Main Kinematic Tool' : 'ArduPlane Kinematic Tool', exact: true })
        await link.click(); await ready(page)
        assert.equal(page.url(), plane ? base : base + 'plane/')
        await page.goto(path + 'index.html'); await ready(page); await page.reload(); await ready(page)
    }
    for (const suffix of ['', 'plane']) {
        const response = await context.request.get(base.slice(0, -1) + (suffix ? '/' + suffix : '') + '?case=redirect', { maxRedirects: 0 })
        assert.equal(response.status(), 308)
        assert.ok(response.headers().location.endsWith('/?case=redirect'))
    }
    for (const missing of ['missing.js', 'assets/missing.wasm', 'plane/missing', 'constructor']) assert.equal((await context.request.get(base + missing)).status(), 404)
    const manifest = JSON.parse(await readFile(app + 'runtime-assets.json'))
    for (const [target, source] of Object.entries(manifest)) {
        const response = await context.request.get(base + target)
        assert.equal(response.status(), 200, target)
        assert.deepEqual(await response.body(), await readFile(root + source), target)
    }
    assert.deepEqual(errors, [])
    await page.close()
}

/** Force loading failures, retries, interrupted fetches and repeated plot unmounts. */
async function lifecycle(context, origin, prefix) {
    const base = `${origin}${prefix}KinematicTool/`, page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/control.wasm', route => route.fulfill({ status: 503, body: 'Unavailable' }))
    await page.goto(base); await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(), /HTTP 503/)
    await page.unroute('**/control.wasm'); await page.getByRole('button', { name: 'Retry' }).click(); await ready(page)
    // Keep purged DOM nodes reachable so cleanup is observable after error unmounts.
    await page.evaluate(() => {
        window.purgedPlots = []
        const original = window.Plotly.purge
        window.Plotly.purge = function (node) { window.purgedPlots.push(node); return original.call(this, node) }
    })
    for (let i = 0; i < 3; i++) {
        await page.locator('#ATC_ACC_R_MAX').fill('0'); await page.getByRole('alert').waitFor()
        assert.equal(await page.locator('.js-plotly-plot').count(), 0)
        await page.locator('#ATC_ACC_R_MAX').fill('1100'); await ready(page)
    }
    assert.ok(await page.evaluate(() => window.purgedPlots.length >= 12 && window.purgedPlots.every(node => !node.isConnected && !node._fullLayout)))
    await page.route('**/control.wasm', async route => { await new Promise(resolve => setTimeout(resolve, 150)); await route.abort().catch(() => {}) })
    await page.goto(base, { waitUntil: 'domcontentloaded' }); await page.goto('about:blank')
    await page.waitForTimeout(200); await page.unroute('**/control.wasm'); await page.goto(base); await ready(page)
    assert.deepEqual(errors, [])
    await page.close()
}

test('real Chromium: independent dev/Worker preview, prefixes, legacy parity and cleanup', { timeout: 600000 }, async () => {
    const control = await controlModule(), ruckig = await ruckigModule()
    const oracles = [await legacy(false, control, ruckig), await legacy(true, control, ruckig)]
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] })
    try {
        for (const prefix of ['/', '/Tools/WebTools/']) {
            for (const mode of ['dev', 'preview']) {
                console.log(`Checking independent ${mode} at ${prefix}`)
                if (mode === 'preview') await exec('pnpm', ['--filter', 'kinematic-tools', 'build'], { cwd: root, env: { ...process.env, WEBTOOLS_BASE_PATH: prefix }, maxBuffer: 5 * 1024 * 1024 })
                const running = await server(mode, prefix)
                const context = await browser.newContext()
                try {
                    await context.route('**/*', route => new URL(route.request().url()).origin === running.origin ? route.continue() : route.abort())
                    await exercise(context, running.origin, prefix, oracles)
                    await lifecycle(context, running.origin, prefix)
                } finally { await context.close(); await running.stop() }
            }
            await exec('pnpm', ['build'], { cwd: root, env: { ...process.env, WEBTOOLS_BASE_PATH: prefix }, maxBuffer: 5 * 1024 * 1024 })
            for (const mode of ['dev', 'preview']) {
                const running = await server(mode, prefix, true), context = await browser.newContext()
                try {
                    await context.route('**/*', route => new URL(route.request().url()).origin === running.origin ? route.continue() : route.abort())
                    const page = await context.newPage()
                    await page.goto(`${running.origin}${prefix}Dev/`)
                    await page.locator(`a[href="${prefix}KinematicTool"]`).first().click()
                    await ready(page); assert.equal(page.url(), `${running.origin}${prefix}KinematicTool/`)
                    await page.getByRole('link', { name: 'ArduPlane Kinematic Tool', exact: true }).click(); await ready(page)
                    await page.goto(`${running.origin}${prefix}RotationCheck/`)
                    await page.locator('#rotations').waitFor()
                    await page.goto(`${running.origin}${prefix}`)
                    assert.equal(await page.locator('h1').innerText(), 'ArduPilot WebTools')
                    await page.close()
                } finally { await context.close(); await running.stop() }
            }
        }
    } finally { await browser.close() }
})
