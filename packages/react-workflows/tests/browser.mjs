import { runRegressions } from './regressions.mjs'
// Built consumer plus unchanged HardwareReport. No provider or hardware access.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const packageRoot = resolve(root, 'packages/react-workflows')
for (const prefix of ['/', '/Tools/WebTools/']) {
    const build = spawnSync('corepack', ['pnpm', '--filter', '@webtools/react-workflows', 'build:consumer'], {
        cwd: root, env: { ...process.env, WORKFLOWS_PREFIX: prefix }, stdio: 'inherit',
    })
    assert.equal(build.status, 0, 'consumer build')
    const server = createServer(async (request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
            if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return }
            const relative = pathname.slice(prefix.length)
            const consumer = relative.startsWith('ReactWorkflows/')
            const base = consumer ? resolve(packageRoot, 'consumer-dist') : root
            let path = resolve(base, consumer ? relative.slice('ReactWorkflows/'.length) : relative)
            if (path !== base && !path.startsWith(base + sep)) { response.writeHead(403).end(); return }
            if ((await stat(path)).isDirectory()) {
                if (!pathname.endsWith('/')) { response.writeHead(302, { Location: pathname + '/' }).end(); return }
                path = resolve(path, 'index.html')
            }
            response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' })[extname(path)] ?? 'application/octet-stream')
            response.end(await readFile(path))
        } catch { response.writeHead(404).end() }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    let browser
    try {
        browser = process.env.WORKFLOWS_CDP_URL ? await chromium.connectOverCDP(process.env.WORKFLOWS_CDP_URL) : await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined })
        const context = await browser.newContext({ acceptDownloads: true })
        const origin = `http://127.0.0.1:${server.address().port}`
        // Ensure validation never reaches external providers.
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
        await context.addInitScript(() => {
            window.messageListeners = new Set()
            const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window)
            window.addEventListener = (type, callback, options) => {
                if (type === 'message') window.messageListeners.add(callback)
                return add(type, callback, options)
            }
            window.removeEventListener = (type, callback, options) => {
                if (type === 'message') window.messageListeners.delete(callback)
                return remove(type, callback, options)
            }
        })
        await runRegressions(context, origin, prefix, process.env.WORKFLOWS_BASELINE === '1')
        if (process.env.WORKFLOWS_BASELINE === '1') { await context.close(); continue }
        const page = await context.newPage(), errors = [], missing = []
        page.on('pageerror', error => errors.push(String(error)))
        context.on('response', response => { if (response.status() >= 400) missing.push(response.url()) })
        await page.goto(`${origin}${prefix}ReactWorkflows/`)
        await page.waitForSelector('#plot .js-plotly-plot')
        assert.equal(await page.locator('#TEST_MODE').evaluate(node => node.selectedIndex), -1, 'unmapped enum starts blank')
        await page.locator('#TEST_GAIN').fill('4')
        await page.waitForFunction(() => document.querySelector('#plot .js-plotly-plot').data[0].y[2] === 8)
        assert.equal(await page.locator('#TEST_MODE').evaluate(node => node.selectedIndex), -1, 'unrelated gain/plot commit preserves unknown enum')
        await page.locator('#TEST_MODE').selectOption('1')
        assert.equal(await page.locator('#TEST_MODE').inputValue(), '1')
        await page.locator('#bit_7_TEST_MASK').check()
        assert.equal(await page.locator('#TEST_MASK').inputValue(), '-128')
        await page.locator('#TEST_MASK').fill('5')
        assert.equal(await page.locator('#bit_0_TEST_MASK').isChecked(), true)
        assert.equal(await page.locator('#bit_2_TEST_MASK').isChecked(), true)
        await page.evaluate(() => window.Plotly.relayout(document.querySelector('#plot .js-plotly-plot'), { 'xaxis.range': [0, 1] }))
        await page.waitForFunction(() => document.querySelector('#plot-events').textContent === '1')
        const bytes = Buffer.from('AHRS_ORIENTATION,0\r\nCOMPASS_USE,1\r\n')
        await page.locator('#file').setInputFiles({ name: 'original.param', mimeType: 'text/plain', buffer: bytes })
        const downloadEvent = page.waitForEvent('download')
        await page.getByRole('button', { name: 'Download file', exact: true }).click()
        const download = await downloadEvent
        assert.equal(download.suggestedFilename(), 'original.param')
        assert.deepEqual(await readFile(await download.path()), bytes)
        await page.getByRole('button', { name: 'Load file', exact: true }).click()
        await page.waitForFunction(() => document.querySelector('#loaded').textContent.includes('COMPASS_USE'))
        const popupEvent = context.waitForEvent('page')
        await page.getByRole('button', { name: 'Hardware Report', exact: true }).click()
        const popup = await popupEvent
        popup.on('dialog', dialog => dialog.dismiss())
        popup.on('pageerror', error => errors.push(String(error)))
        await popup.waitForFunction(() => document.querySelector('#fileItem')?.files?.[0]?.name === 'original.param')
        assert.equal(new URL(popup.url()).pathname, `${prefix}HardwareReport/`)
        const transferred = await popup.evaluate(async () => Array.from(new Uint8Array(await document.querySelector('#fileItem').files[0].arrayBuffer())))
        assert.deepEqual(Buffer.from(transferred), bytes)
        await popup.waitForFunction(() => document.title === 'Hardware Report: original.param' && document.querySelector('#loading').style.visibility === 'hidden')
        await popup.close()
        // Unchanged legacy sender to React receiver: use the legacy get_open_in
        // helper with a local target while retaining its real File payload.
        await page.addScriptTag({ url: `${origin}${prefix}Libraries/OpenIn.js` })
        await page.evaluate(() => {
            const originalOpen = window.open
            window.open = () => ({ addEventListener: (_event, callback) => callback(), postMessage: (data, origin) => window.postMessage(data, origin) })
            const controls = get_open_in(() => new File(['legacy'], 'legacy.bin'))
            controls.tippy_div.querySelector('input[value="Hardware Report"]').click()
            window.open = originalOpen
        })
        await page.waitForFunction(() => document.querySelector('#filename').textContent === 'legacy.bin')
        // Capture old vendor node and instrument listener/purge lifetime.
        await page.evaluate(() => {
            window.oldPlot = document.querySelector('#plot .js-plotly-plot')
            window.purges = 0
            const purge = window.Plotly.purge
            window.listenersAtPurge = []
            window.Plotly.purge = node => {
                window.purges++
                window.listenersAtPurge.push(node._ev?.listenerCount('plotly_relayout') ?? 0)
                return purge(node)
            }
        })
        for (let i = 0; i < 3; i++) {
            await page.locator('#toggle').click()
            assert.equal(await page.locator('#plot').count(), 0)
            assert.equal(await page.evaluate(() => window.messageListeners.size), 0)
            await page.evaluate(() => window.postMessage({ type: 'file', data: new File(['ignored'], 'unmounted.bin') }, '*'))
            await page.locator('#toggle').click()
            await page.waitForSelector('#plot .js-plotly-plot')
            assert.equal(await page.locator('#filename').textContent(), '')
            assert.equal(await page.evaluate(() => window.messageListeners.size), 1)
        }
        assert.ok(await page.evaluate(() => window.purges >= 3))
        assert.equal(await page.evaluate(() => window.oldPlot.isConnected), false)
        assert.ok(await page.evaluate(() => window.listenersAtPurge.every(count => count === 0)))
        await page.getByRole('button', { name: 'Fail loading', exact: true }).click()
        await page.waitForFunction(() => document.querySelector('#error').textContent.includes('Recorded failure'))
        assert.equal(await page.locator('#loading').evaluate(node => node.style.visibility), 'visible', 'preserve separate legacy failure-overlay bug')
        // The intentionally retained failure overlay intercepts pointer clicks.
        // Unmount through the host control to exercise lifecycle cleanup.
        await page.locator('#toggle').dispatchEvent('click')
        assert.equal(await page.locator('#loading').count(), 0)
        // Deterministic vendor promises cover unmounts during both imperative
        // operations, rejection/retry, and receiver readiness after unmount.
        const lifecycle = await context.newPage()
        lifecycle.on('pageerror', error => errors.push(String(error)))
        await lifecycle.goto(`${origin}${prefix}ReactWorkflows/?lifecycle=1`)
        await lifecycle.waitForFunction(() => window.workflowLifecycle.pending.length === 1)
        await lifecycle.evaluate(() => window.postMessage({ type: 'file', data: new File(['late'], 'late.bin') }, '*'))
        await lifecycle.waitForFunction(() => window.workflowLifecycle.readyWaits === 1)
        await lifecycle.locator('#lifecycle-toggle').click()
        assert.equal(await lifecycle.evaluate(() => window.messageListeners.size), 0)
        await lifecycle.locator('#lifecycle-toggle').click()
        await lifecycle.waitForFunction(() => window.workflowLifecycle.pending.length === 2)
        await lifecycle.evaluate(() => {
            window.workflowLifecycle.pending[0].resolve()
            window.workflowLifecycle.pending[1].resolve()
            window.workflowLifecycle.releaseReadiness()
        })
        await lifecycle.waitForFunction(() => window.workflowLifecycle.listeners.size === 1)
        assert.deepEqual(await lifecycle.evaluate(() => window.workflowLifecycle.files), [], 'late readiness cannot deliver into a replacement mount')
        assert.equal(await lifecycle.evaluate(() => window.workflowLifecycle.pending[0].node.isConnected), false)
        assert.equal(await lifecycle.evaluate(() => window.workflowLifecycle.pending[1].node.isConnected), true)
        await lifecycle.evaluate(() => window.postMessage({ type: 'file', data: new File(['now'], 'current.bin') }, '*'))
        await lifecycle.waitForFunction(() => window.workflowLifecycle.files.length === 1)
        assert.deepEqual(await lifecycle.evaluate(() => window.workflowLifecycle.files), ['current.bin'])
        await lifecycle.locator('#lifecycle-update').click()
        await lifecycle.waitForFunction(() => window.workflowLifecycle.pending.length === 3)
        assert.equal(await lifecycle.evaluate(() => window.workflowLifecycle.pending[2].kind), 'react')
        await lifecycle.locator('#lifecycle-toggle').click()
        await lifecycle.locator('#lifecycle-toggle').click()
        await lifecycle.waitForFunction(() => window.workflowLifecycle.pending.length === 4)
        await lifecycle.evaluate(() => {
            window.workflowLifecycle.pending[2].resolve()
            window.workflowLifecycle.pending[3].resolve()
        })
        await lifecycle.waitForFunction(() => window.workflowLifecycle.listeners.size === 1)
        assert.equal(await lifecycle.evaluate(() => window.workflowLifecycle.pending[2].node.isConnected), false)
        assert.equal(await lifecycle.evaluate(() => window.workflowLifecycle.pending[3].node.isConnected), true)
        await lifecycle.locator('#lifecycle-update').click()
        await lifecycle.waitForFunction(() => window.workflowLifecycle.pending.length === 5)
        await lifecycle.evaluate(() => window.workflowLifecycle.pending[4].reject())
        await lifecycle.waitForFunction(() => window.workflowLifecycle.errors.length === 1)
        assert.match(await lifecycle.evaluate(() => window.workflowLifecycle.errors[0]), /react rejection/)
        await lifecycle.locator('#lifecycle-update').click()
        await lifecycle.waitForFunction(() => window.workflowLifecycle.pending.length === 6)
        await lifecycle.evaluate(() => window.workflowLifecycle.pending[5].resolve())
        await lifecycle.waitForFunction(() => window.workflowLifecycle.listeners.size === 1)
        await lifecycle.locator('#lifecycle-toggle').click()
        await lifecycle.locator('#lifecycle-toggle').click()
        await lifecycle.waitForFunction(() => window.workflowLifecycle.pending.length === 7)
        await lifecycle.evaluate(() => window.workflowLifecycle.pending[6].reject())
        await lifecycle.waitForFunction(() => window.workflowLifecycle.errors.length === 2)
        assert.match(await lifecycle.evaluate(() => window.workflowLifecycle.errors[1]), /newPlot rejection/)
        await lifecycle.locator('#lifecycle-update').click()
        await lifecycle.waitForFunction(() => window.workflowLifecycle.pending.length === 8)
        assert.equal(await lifecycle.evaluate(() => window.workflowLifecycle.pending[7].kind), 'newPlot')
        await lifecycle.evaluate(() => window.workflowLifecycle.pending[7].resolve())
        await lifecycle.waitForFunction(() => window.workflowLifecycle.listeners.size === 1)
        await lifecycle.locator('#lifecycle-toggle').click()
        assert.equal(await lifecycle.evaluate(() => window.workflowLifecycle.listeners.size), 0)
        assert.equal(await lifecycle.evaluate(() => window.messageListeners.size), 0)
        await lifecycle.close()
        assert.deepEqual(errors, []); assert.deepEqual(missing, [])
        await context.close()
        console.log(`React workflow browser parity passed at ${prefix}`)
    } finally {
        if (browser) await browser.close()
        await new Promise(resolve => server.close(resolve))
    }
}
