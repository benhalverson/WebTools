import assert from 'node:assert/strict'
import { editorWorkflow } from './editor-workflow.mjs'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { WebSocketServer } from 'ws'
import { listeningOrigin } from '@webtools/routing/tooling'

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const require = createRequire(new URL('../../../packages/mavlink/package.json', import.meta.url))
const { mavlink20, MAVLink20Processor } = require('@webtools/mavlink')
const baseRevision = 'e4d333f04cd3eb3da98fed787d5f3ce1c18ed7bd'
const legacySource = execFileSync('git', ['show', `${baseRevision}:TelemetryDashboard/TelemetryDashboard.js`], { cwd: root, encoding: 'utf8' })
assert.equal(await readFile(resolve(root, 'TelemetryDashboard/TelemetryDashboard.js'), 'utf8'), legacySource)
const html = execFileSync('git', ['show', `${baseRevision}:TelemetryDashboard/index.html`], { cwd: root, encoding: 'utf8' })
const templates = html.match(/<template[\s\S]*?<\/template>/g).join('\n')
const layout = { header: { version: 1 }, grid: { columns: 6, rows: 6, color: 'rgb(255, 255, 255)' }, widgets: {
    0: { x: '0', y: '0', w: '3', h: '3', type: 'WidgetSandBox', options: { form: { components: [{ type: 'number', key: 'gain', id: 'gain-fixture', label: 'Gain', input: true, defaultValue: 1 }] }, form_content: { gain: 2 }, about: { name: 'Controlled fixture' }, sandbox: 'div.id="telemetry";div.textContent="ready";fetch("../SandBoxWidgets/Value.json").then(response=>response.json()).then(value=>{div.dataset.relative=value.widget.type});handle_msg=function(msg){if(msg._name==="VFR_HUD")div.textContent=String(msg.groundspeed*options.gain)};handle_options=function(next){options=next}' } },
    1: { x: '3', y: '0', w: '3', h: '3', type: 'WidgetSubGrid', options: { form_content: { rows: 2, columns: 2, borderColor: '#c8c8c8', backgroundColor: '#ffffff' }, widgets: {
        0: { x: '0', y: '0', w: '2', h: '2', type: 'WidgetCustomHTML', options: { form: {}, form_content: {}, about: { name: 'HTML fixture' }, custom_HTML: '<!doctype html><html><body><output id="custom">waiting</output><script>const c=new BroadcastChannel("MAVLinkMSG");c.onmessage=e=>{if(e.data.MAVLink._name==="VFR_HUD")document.querySelector("#custom").textContent=String(e.data.MAVLink.groundspeed)}</script></body></html>' } },
    } } },
} }

/** Stop all owned Vite and Worker descendants, including failure paths. */
async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    process.kill(-child.pid, 'SIGTERM')
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch { /* Already stopped. */ } }, 5000)
    await exited
    clearTimeout(timer)
}

/** Start either an independent app Worker or the shared same-origin gateway. */
async function start(mode, prefix, gateway = false) {
    const cwd = gateway ? root : resolve(root, 'apps/dashboard-playback')
    const args = gateway ? ['tooling/serve.ts', mode, '--port', '0'] : ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : ['--force']), '--host', '127.0.0.1', '--port', '0']
    const child = spawn(process.execPath, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBTOOLS_BASE_PATH: prefix, BROWSER: 'none' } })
    let output = ''
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Server readiness timeout: ' + output)), 60000)
            /** Accumulate readiness output so ANSI escapes and split chunks remain supported. */
            const read = chunk => { output += chunk; const url = listeningOrigin(output); if (url) { clearTimeout(timer); resolve(url) } }
            child.stdout.on('data', read); child.stderr.on('data', read)
            child.on('error', error => { clearTimeout(timer); reject(error) })
            child.on('exit', code => { clearTimeout(timer); reject(new Error(`${code}: ${output}`)) })
        })
        return { origin, close: () => stop(child) }
    } catch (error) { await stop(child); throw error }
}

/** Build independent apps with the same configured mount before Worker preview checks. */
async function build(prefix) {
    const child = spawn('pnpm', ['build'], { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBTOOLS_BASE_PATH: prefix } })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
    const timer = setTimeout(() => { void stop(child) }, 180000)
    try { const [code] = await once(child, 'exit'); assert.equal(code, 0, output) }
    finally { clearTimeout(timer); await stop(child) }
}

/** Serve the unchanged owned legacy classes and exact locally pinned libraries without a CDN. */
async function legacyServer() {
    const server = createServer(async (request, response) => {
        try {
            const pathname = new URL(request.url, 'http://localhost').pathname
            if (pathname === '/TelemetryDashboard/legacy.html') {
                response.setHeader('Content-Type', 'text/html')
                response.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/vendor/bootstrap.min.css"><link rel="stylesheet" href="/vendor/gridstack.min.css"><link rel="stylesheet" href="/vendor/gridstack-extra.min.css"><link rel="stylesheet" href="/vendor/formio.full.min.css"><style>html,body,#dashboard{height:100%;width:100%;margin:0}</style></head><body>${templates}<div id="dashboard" class="grid-stack"></div><button id="connect">Connection</button>
<script src="/vendor/gridstack-all.js"></script><script src="/vendor/formio.full.min.js"></script><script src="/modules/build/floating-ui/dist/umd/popper.min.js"></script><script src="/modules/build/tippyjs/dist/tippy-bundle.umd.min.js"></script><script src="/modules/MAVLink/mavlink.js"></script>
${['Base_Class', 'SandBox', 'CustomHTML', 'SubGrid', 'Menu'].map(name => `<script src="Widgets/${name}.js"></script>`).join('')}<script src="TelemetryDashboard.js"></script><script>let grid;let grid_changed=false;const broadcast=new BroadcastChannel('MAVLinkMSG');let MAVLink;async function boot(){await mavlink20.ready;MAVLink=new MAVLink20Processor();const json=await decompress_layout(new URLSearchParams(location.hash.slice(1)).get('layout'));const layout=JSON.parse(json);load_layout(layout.grid,layout.widgets);setup_connect(document.querySelector('#connect'),color=>document.querySelector('#connect').dataset.color=color)}boot()</script></body></html>`)
                return
            }
            const vendor = pathname.startsWith('/vendor/')
            const directory = vendor ? resolve(root, 'apps/dashboard-playback/.legacy-assets') : root
            const path = resolve(directory, '.' + pathname)
            assert.ok(path.startsWith(directory + sep))
            assert.ok((await stat(path)).isFile())
            response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(path)] ?? 'application/octet-stream')
            response.end(await readFile(path))
        } catch { response.writeHead(404).end() }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) }
}

/** Wait for both real iframe documents and return their visible telemetry values. */
async function frameValues(page, expected = '25') {
    const frame = page.frames().find(frame => frame.url().includes('SandBox.html'))
    assert.ok(frame, 'sandbox document loaded')
    await frame.waitForFunction(value => document.querySelector('#telemetry')?.textContent === value, expected)
    const custom = page.frames().find(frame => frame.url() === 'about:srcdoc')
    assert.ok(custom)
    await custom.waitForFunction(() => document.querySelector('#custom')?.textContent === '12.5')
    return [await frame.locator('#telemetry').textContent(), await custom.locator('#custom').textContent()]
}

/** Wait for widget frame readiness before delivering controlled protocol frames. */
async function readyFrames(page) {
    await page.locator('#dashboard iframe').first().waitFor()
    await page.waitForFunction(() => document.querySelectorAll('#dashboard iframe').length === 2)
    await page.locator('#dashboard iframe').first().contentFrame().locator('#telemetry[data-relative=WidgetSandBox]').waitFor()
    await page.locator('#dashboard iframe').nth(1).contentFrame().locator('#custom').waitFor()
}

const relay = new WebSocketServer({ host: '127.0.0.1', port: 0 })
await once(relay, 'listening')
const relayUrl = `ws://127.0.0.1:${relay.address().port}/`
const encoder = new MAVLink20Processor(null, 1, 1)
const packet = Buffer.from(new mavlink20.messages.vfr_hud(10, 12.5, 90, 50, 100, 2).pack(encoder))
const received = []
relay.on('connection', socket => socket.on('message', data => received.push(Buffer.from(data))))
/** Send fragmented frames to every local simulated connection, never a live relay. */
function send() { for (const socket of relay.clients) { socket.send(packet.subarray(0, 9)); socket.send(packet.subarray(9)) } }
const hash = new URLSearchParams({ ws: relayUrl, layout: deflateRawSync(JSON.stringify(layout)).toString('base64url') }).toString()
const legacy = await legacyServer()
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true }).catch(async error => {
    await legacy.close(); await new Promise(resolve => relay.close(resolve)); throw error
})
try {
    for (const prefix of process.env.DASHBOARD_TEST_PREFIX ? [process.env.DASHBOARD_TEST_PREFIX] : ['/', '/Tools/WebTools/']) {
        await build(prefix)
        for (const mode of process.env.DASHBOARD_TEST_MODE ? [process.env.DASHBOARD_TEST_MODE] : ['dev', 'preview']) {
            const server = await start(mode, prefix)
            const context = await browser.newContext({ viewport: { width: 1200, height: 720 } })
            context.setDefaultTimeout(15000)
            try {
                await context.grantPermissions(['clipboard-read', 'clipboard-write'])
                // The unchanged Attitude preset imports an external library; verify its legacy offline failure explicitly.
                const instrumentUrl = 'https://unpkg.com/flight-indicators-js@1.0.5/esm/module-flight-indicators.mjs'
                const instrumentError = `Failed to fetch dynamically imported module: ${instrumentUrl}`
                let blockedInstrumentImports = 0
                await context.route('**/*', route => {
                    if (route.request().url() === instrumentUrl) blockedInstrumentImports++
                    return [server.origin, legacy.origin].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort()
                })
                await context.routeWebSocket(/.*/, socket => { if (socket.url() === relayUrl || socket.url().startsWith(server.origin.replace('http:', 'ws:'))) socket.connectToServer(); else socket.close() })
                await context.addInitScript(() => {
                    Math.random = () => 0.123456789
                    window.realDateNow = Date.now
                    Date.now = () => 1800000000000
                    window.activeChannels = new Set()
                    const Original = BroadcastChannel
                    window.BroadcastChannel = class extends Original {
                        /** Track real channel ownership without replacing delivery behavior. */
                        constructor(name) { super(name); window.activeChannels.add(this) }
                        /** Remove the resource when its real channel is closed. */
                        close() { window.activeChannels.delete(this); super.close() }
                    }
                })
                const errors = []
                context.on('page', created => created.on('pageerror', error => errors.push(error.message)))
                const offlineLegacy = await context.newPage()
                const attitude = JSON.parse(execFileSync('git', ['show', `${baseRevision}:TelemetryDashboard/SandBoxWidgets/Attitude.json`], { cwd: root, encoding: 'utf8' })).widget
                const instrumentLayout = { ...layout, widgets: { 0: { ...attitude, x: 0, y: 0, w: 2, h: 2 } } }
                const instrumentHash = new URLSearchParams({ layout: deflateRawSync(JSON.stringify(instrumentLayout)).toString('base64url') })
                const offlineFailure = offlineLegacy.waitForEvent('pageerror')
                await offlineLegacy.goto(`${legacy.origin}/TelemetryDashboard/legacy.html#${instrumentHash}`)
                assert.equal((await offlineFailure).message, instrumentError, 'unchanged legacy Attitude has the same offline import failure')
                await offlineLegacy.close()
                const page = await context.newPage()
                const base = `${server.origin}${prefix}TelemetryDashboard/`
                const menuPage = await context.newPage()
                // Isolate the authoritative Menu options: other default instruments import external libraries.
                const menuLayout = JSON.parse(execFileSync('git', ['show', `${baseRevision}:TelemetryDashboard/Default_Layout.json`], { cwd: root, encoding: 'utf8' }))
                menuLayout.widgets = Object.fromEntries(Object.entries(menuLayout.widgets).filter(([, widget]) => widget.type === 'WidgetMenu'))
                await menuPage.route('**/Default_Layout.json', route => route.fulfill({ json: menuLayout }))
                await menuPage.goto(base)
                await menuPage.locator('#dashboard[data-ready=true]').waitFor()
                await menuPage.getByRole('button', { name: 'Dashboard settings', exact: true }).click()
                await menuPage.getByRole('region', { name: 'Saved layout' }).getByLabel('Enable widget edit', { exact: true }).check()
                await menuPage.getByRole('button', { name: 'Close settings' }).click()
                await menuPage.locator('#dashboard > .grid-stack-item').filter({ has: menuPage.getByRole('button', { name: 'Dashboard settings', exact: true }) }).focus()
                await menuPage.keyboard.press('Enter')
                await menuPage.getByRole('region', { name: 'Widget settings' }).waitFor()
                for (const name of ['Copy widget', 'Delete widget', 'Save widget', 'Edit source and form']) assert.equal(await menuPage.getByRole('button', { name, exact: true }).count(), 0, `Menu disables ${name}`)
                await menuPage.close()
                await page.goto(`${base}#${hash}`)
                await page.locator('#dashboard[data-ready=true]').waitFor()
                await readyFrames(page)
                await page.getByLabel('Connection status', { exact: true }).filter({ hasText: 'connected' }).waitFor()
                const original = await context.newPage()
                original.on('pageerror', error => { console.error('legacy', error.stack) })
                original.on('dialog', async dialog => { console.error('legacy dialog', dialog.message()); await dialog.dismiss() })
                original.on('response', response => { if (response.status() >= 400) console.error('legacy HTTP', response.status(), response.url()) })
                await original.goto(`${legacy.origin}/TelemetryDashboard/legacy.html#${hash}`)
                await readyFrames(original)
                await original.waitForFunction(() => document.querySelector('#connect').dataset.color === 'green')
                send()
                assert.deepEqual(await frameValues(page), await frameValues(original), 'binary-representable values compare exactly')
                await original.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)))
                await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)))
                for (let index = 0; index < 2; index++) {
                    const actual = await page.locator('#dashboard iframe').nth(index).boundingBox()
                    const expected = await original.locator('#dashboard iframe').nth(index).boundingBox()
                    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[key] - expected[key]) <= 0.5, `${key}: ${actual[key]} vs ${expected[key]}`)
                }
                await page.bringToFront()
                await page.getByRole('button', { name: 'Saved layout', exact: true }).click()
                const downloadEvent = page.waitForEvent('download')
                await page.getByRole('button', { name: 'Save layout', exact: true }).click()
                const download = await downloadEvent
                const bytes = await readFile(await download.path(), 'utf8')
                assert.equal(bytes, await original.evaluate(() => JSON.stringify(get_layout(), null, 2)), 'download exact legacy serializer bytes')
                await page.getByRole('button', { name: 'Get dashboard link', exact: true }).click()
                const link = await page.getByLabel('Dashboard link', { exact: true }).inputValue()
                await page.waitForFunction(expected => navigator.clipboard.readText().then(value => value === expected), link)
                await page.evaluate(() => {
                    const write = navigator.clipboard.writeText
                    window.restoreClipboard = () => { navigator.clipboard.writeText = write }
                    navigator.clipboard.writeText = async () => { window.clipboardRejected = true; throw new Error('Injected clipboard denial') }
                })
                await page.getByRole('button', { name: 'Get dashboard link', exact: true }).click()
                await page.waitForFunction(() => window.clipboardRejected)
                assert.equal(await page.getByLabel('Dashboard link', { exact: true }).inputValue(), link)
                assert.equal(await page.locator('.playback-error').count(), 0)
                await page.evaluate(() => window.restoreClipboard())

                assert.equal(new URL(link).hash, new URL(await original.evaluate(() => get_dashboard_link())).hash, 'exact legacy link hash')
                assert.equal(received.length, 0, 'read-only mode sends no packets')
                try { await editorWorkflow(page, original, bytes) }
                catch (error) {
                    await page.screenshot({ path: '/tmp/issue33-editor-failure.png' })
                    await writeFile('/tmp/issue33-editor-failure.html', await page.content())
                    throw error
                }
                await original.close()
                await page.goto(link)
                await page.reload() // A same-document hash navigation alone does not remount either implementation.
                await page.locator('#dashboard[data-ready=true]').waitFor(); await readyFrames(page); send(); await frameValues(page)
                await page.getByRole('button', { name: /^Connection / }).click()
                await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
                await page.getByLabel('Connection status', { exact: true }).filter({ hasText: 'idle' }).waitFor()
                await page.getByRole('button', { name: 'Connect', exact: true }).click()
                await page.getByLabel('Connection status', { exact: true }).filter({ hasText: 'connected' }).waitFor()
                send(); await frameValues(page)
                for (const socket of relay.clients) socket.close()
                await page.getByLabel('Connection status', { exact: true }).filter({ hasText: 'failed' }).waitFor()
                await page.getByRole('button', { name: /^Connection / }).click()
                await page.getByRole('button', { name: 'Connect', exact: true }).click()
                await page.getByLabel('Connection status', { exact: true }).filter({ hasText: 'connected' }).waitFor()
                // Repeated file reads, invalid input, and replacing an initializing runtime.
                await page.getByRole('button', { name: 'Saved layout', exact: true }).click()
                for (let index = 0; index < 3; index++) {
                    await page.getByLabel('Load layout', { exact: true }).setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(bytes) })
                    await page.locator('#dashboard[data-ready=true]').waitFor(); await readyFrames(page)
                }
                await page.getByLabel('Load layout', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
                await page.getByRole('alert').waitFor()
                assert.equal(await page.locator('#dashboard iframe').count(), 2)
                const empty = { ...layout, widgets: {} }
                await page.getByLabel('Load layout', { exact: true }).setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(empty)) })
                await page.locator('#dashboard[data-ready=true]').waitFor()
                assert.equal(await page.locator('#dashboard iframe').count(), 0)
                assert.equal(await page.evaluate(() => window.activeChannels.size), 0, 'replacement disposes outgoing runtime channel')
                // A failed early file read must not suppress pending initial restoration.
                const edge = await context.newPage()
                let finishDefault
                const defaultPending = new Promise(resolve => { finishDefault = resolve })
                await edge.route('**/Default_Layout.json', async route => { await defaultPending; await route.fulfill({ json: layout }) })
                await edge.goto(`${base}#ws=${encodeURIComponent(relayUrl)}&layout=invalid`)
                await edge.getByLabel('Connection status', { exact: true }).filter({ hasText: 'connected' }).waitFor()
                await edge.getByRole('button', { name: 'Saved layout', exact: true }).click()
                await edge.getByLabel('Load layout', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
                await edge.getByRole('alert').waitFor()
                finishDefault()
                await edge.locator('#dashboard[data-ready=true]').waitFor(); await readyFrames(edge)
                await edge.getByRole('button', { name: 'Dismiss error' }).click()
                // Suspend compression so a newly loaded layout can invalidate the outstanding link.
                await edge.evaluate(() => {
                    const original = Response.prototype.arrayBuffer
                    Response.prototype.arrayBuffer = function () {
                        const pending = original.call(this)
                        return new Promise(resolve => { window.finishCompression = async () => resolve(await pending) })
                    }
                })
                await edge.getByRole('button', { name: 'Get dashboard link', exact: true }).click()
                await edge.waitForFunction(() => typeof window.finishCompression === 'function')
                await edge.getByLabel('Load layout', { exact: true }).setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(empty)) })
                await edge.locator('#dashboard[data-ready=true]').waitFor()
                await edge.evaluate(() => window.finishCompression())
                await edge.waitForTimeout(50)
                assert.equal(await edge.getByLabel('Dashboard link', { exact: true }).count(), 0, 'obsolete compression cannot restore a stale link')
                // Delay real Formio creation, replace its runtime, then release and verify late forms are destroyed.
                await edge.evaluate(() => {
                    const create = Formio.createForm.bind(Formio)
                    window.releaseForms = []
                    Formio.createForm = (...args) => new Promise((resolve, reject) => {
                        window.releaseForms.push(async () => { try { resolve(await create(...args)) } catch (error) { reject(error) } })
                    })
                })
                await edge.getByLabel('Load layout', { exact: true }).setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(bytes) })
                await edge.waitForFunction(() => window.releaseForms.length > 0)
                await edge.getByLabel('Load layout', { exact: true }).setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(empty)) })
                await edge.locator('#dashboard[data-ready=true]').waitFor()
                await edge.evaluate(() => Promise.all(window.releaseForms.map(release => release())))
                assert.equal(await edge.locator('#dashboard iframe').count(), 0, 'late initialization cannot reattach disposed frames')
                assert.equal(await edge.evaluate(() => window.activeChannels.size), 0)
                await edge.close()
                // Fail exactly one real grid construction and observe default fallback recovery.
                const recovery = await context.newPage()
                await recovery.route('**/Default_Layout.json', route => route.fulfill({ json: layout }))
                await recovery.goto(`${base}#${hash}`)
                await recovery.locator('#dashboard[data-ready=true]').waitFor()
                await recovery.evaluate(() => {
                    const init = GridStack.init.bind(GridStack)
                    let fail = true
                    GridStack.init = (...args) => { if (fail) { fail = false; throw new Error('Injected grid failure') } return init(...args) }
                })
                await recovery.getByRole('button', { name: 'Saved layout', exact: true }).click()
                await recovery.getByLabel('Load layout', { exact: true }).setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(bytes) })
                await recovery.getByRole('alert').filter({ hasText: 'Injected grid failure' }).waitFor()
                await recovery.locator('#dashboard[data-ready=true]').waitFor(); await readyFrames(recovery)
                await recovery.close()
                // Native numeric sanitization and heartbeat bytes are compared against the legacy connection.
                for (const signing of ['', ' signed fixture ']) {
                const heartbeatHash = new URLSearchParams({ ws: relayUrl, heartbeat: '1', sysid: '12junk', compid: ' 7 ', signing, layout: deflateRawSync(JSON.stringify(empty)).toString('base64url') }).toString()
                const heartbeatPage = await context.newPage()
                received.length = 0
                await heartbeatPage.goto(`${base}#${heartbeatHash}`)
                await heartbeatPage.getByLabel('Connection status', { exact: true }).filter({ hasText: 'connected' }).waitFor()
                await heartbeatPage.getByRole('button', { name: /^Connection / }).click()
                assert.equal(await heartbeatPage.getByLabel('Source system ID', { exact: true }).inputValue(), '')
                assert.equal(await heartbeatPage.getByLabel('Source component ID', { exact: true }).inputValue(), '')
                await heartbeatPage.waitForTimeout(1150)
                assert.ok(received.length > 0, 'optional 1 Hz heartbeat reaches only local relay')
                const actualHeartbeat = received[0]
                await heartbeatPage.close()
                received.length = 0
                const heartbeatLegacy = await context.newPage()
                await heartbeatLegacy.goto(`${legacy.origin}/TelemetryDashboard/legacy.html#${heartbeatHash}`)
                await heartbeatLegacy.waitForFunction(() => document.querySelector('#connect').dataset.color === 'green')
                await heartbeatLegacy.waitForTimeout(1150)
                assert.deepEqual(actualHeartbeat, received[0], 'exact legacy heartbeat bytes after malformed native ID sanitization')
                const heartbeatDecoder = new MAVLink20Processor()
                if (signing) heartbeatDecoder.signing.secret_key = new Uint8Array(mavlink20.sha256(new TextEncoder().encode(signing)))
                const decodedHeartbeat = heartbeatDecoder.decode(actualHeartbeat)
                assert.equal(decodedHeartbeat._name, 'HEARTBEAT')
                assert.equal(decodedHeartbeat.type, mavlink20.MAV_TYPE_GCS)
                await heartbeatLegacy.close()
                received.length = 0
                }
                const failure = await context.newPage()
                const noServerHash = new URLSearchParams({ layout: deflateRawSync(JSON.stringify(empty)).toString('base64url') }).toString()
                await failure.goto(`${base}#${noServerHash}`)
                await failure.getByLabel('Connection status', { exact: true }).filter({ hasText: 'idle' }).waitFor()
                await failure.getByRole('button', { name: /^Connection / }).click()
                await failure.getByLabel('Server address', { exact: true }).fill('ws://127.0.0.1:1/')
                await failure.getByRole('button', { name: 'Connect', exact: true }).click()
                await failure.getByLabel('Connection status', { exact: true }).filter({ hasText: 'failed' }).waitFor()
                await failure.close()
                for (const asset of ['Examples/Image.json', 'Examples/URDF_Viewer.json', 'Examples/WindyMap.json', 'SandBoxWidgets/Value.json', 'Readme.md']) {
                    const response = await page.request.get(base + asset)
                    assert.equal(response.status(), 200)
                    assert.deepEqual(await response.body(), await readFile(resolve(root, 'TelemetryDashboard', asset)))
                }
                assert.equal(await page.request.get(base + 'index.html').then(response => response.status()), 200)
                assert.equal(await page.request.get(base + 'assets/missing.js').then(response => response.status()), 404)
                const redirect = await page.request.get(base.slice(0, -1) + '?probe=1', { maxRedirects: 0 })
                assert.equal(redirect.status(), 308)
                assert.equal(new URL(redirect.headers().location).search, '?probe=1')
                assert.equal(await page.request.get(base + 'not-a-route').then(response => response.status()), 404)
                assert.equal(await page.request.get(base.slice(0, -1), { maxRedirects: 0 }).then(response => response.status()), 308)
                assert.ok(blockedInstrumentImports > 1, 'legacy instrument and real palette previews both attempted the retained import')
                assert.deepEqual(errors, Array(blockedInstrumentImports).fill(instrumentError), 'only exact legacy offline import failures are expected')
                await page.goto('about:blank')
                await new Promise(resolve => setTimeout(resolve, 100))
                assert.equal(relay.clients.size, 0, 'page disposal closes simulated connections')
                console.log(`PASS independent ${mode} ${prefix}: legacy telemetry, layout, bytes, restoration, reconnect, errors, cleanup`)
            } finally { await context.close(); await server.close() }
        }
        if (process.env.DASHBOARD_TEST_MODE) continue
        // Actual gateway Workers assign the public dashboard to its independent React owner.
        const gateway = await start('preview', prefix, true)
        try {
            const page = await browser.newPage()
            await page.route('**/*', route => new URL(route.request().url()).origin === gateway.origin ? route.continue() : route.abort())
            const response = await page.request.get(`${gateway.origin}${prefix}TelemetryDashboard/`)
            assert.equal(response.status(), 200)
            assert.doesNotMatch(await response.text(), /TelemetryDashboard\.js/)
            for (const name of ['Base_Class', 'SandBox', 'SubGrid', 'CustomHTML']) {
                const retained = await page.request.get(`${gateway.origin}${prefix}TelemetryDashboard/Widgets/${name}.js`)
                assert.equal(retained.status(), 200)
                assert.deepEqual(await retained.body(), await readFile(resolve(root, `TelemetryDashboard/Widgets/${name}.js`)))
            }
            assert.equal(await page.request.get(`${gateway.origin}${prefix}TelemetryDashboard/not-an-asset.js`).then(response => response.status()), 404)

            await page.goto(`${gateway.origin}${prefix}TelemetryDashboard/#${hash}`)
            await page.locator('#dashboard[data-ready=true]').waitFor()
            await page.close()
            console.log(`PASS gateway preview ${prefix}: public React ownership`)
        } finally { await gateway.close() }
    }
} finally {
    await browser.close(); await legacy.close()
    for (const socket of relay.clients) socket.terminate()
    await new Promise(resolve => relay.close(resolve))
}
