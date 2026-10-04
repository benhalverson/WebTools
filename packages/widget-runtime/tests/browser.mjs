import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const packageRoot = resolve(root, 'packages/widget-runtime')
const value = JSON.parse(await readFile(resolve(root, 'TelemetryDashboard/SandBoxWidgets/Value.json'), 'utf8')).widget
const templates = (await readFile(resolve(root, 'TelemetryDashboard/index.html'), 'utf8')).match(/<template[\s\S]*?<\/template>/g).join('\n')
const layout = { header: { version: 1 }, grid: { columns: 6, rows: 6, color: 'rgb(255, 255, 255)' }, widgets: {
    0: { x: '0', y: '0', w: '3', h: '3', type: 'WidgetSandBox', options: { form: { components: [{ type: 'number', key: 'gain', label: 'Gain', input: true, defaultValue: 1 }] }, form_content: { gain: 2 }, about: { name: 'Controlled fixture' }, sandbox: 'div.id="telemetry"; div.textContent="ready"; handle_msg=function(msg){div.textContent=String(msg.groundspeed * options.gain)}; handle_options=function(next){options=next}' } },
    1: { x: '3', y: '0', w: '3', h: '3', type: 'WidgetSubGrid', options: { form_content: { rows: 2, columns: 2, borderColor: '#c8c8c8', backgroundColor: '#ffffff' }, widgets: {
        0: { x: '0', y: '0', w: '2', h: '2', type: 'WidgetCustomHTML', options: { form: {}, form_content: {}, about: { name: 'HTML fixture' }, custom_HTML: '<!doctype html><html><body><output id="custom">waiting</output><script>window.addEventListener("message",e=>{if("options" in e.data)document.querySelector("#custom").textContent="options"});const c=new BroadcastChannel("MAVLinkMSG");c.onmessage=e=>{document.querySelector("#custom").textContent=String(e.data.MAVLink.groundspeed)}</script></body></html>' } },
    } } },
} }

for (const prefix of ['/', '/Tools/WebTools/']) {
    const base = `${prefix}WidgetRuntime/`
    const build = spawnSync('corepack', ['pnpm', '--filter', '@webtools/widget-runtime', 'build:consumer'], { cwd: root, env: { ...process.env, WIDGET_PREFIX: base }, stdio: 'inherit' })
    assert.equal(build.status, 0)
    const server = createServer(async (request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
            if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return }
            if (pathname === `${prefix}TelemetryDashboard/legacy.html`) {
                response.setHeader('Content-Type', 'text/html')
                response.end(`<!doctype html><html><head><link rel="stylesheet" href="${base}vendor/gridstack.min.css"><link rel="stylesheet" href="${base}vendor/gridstack-extra.min.css"><style>#dashboard{height:720px;width:1200px}</style></head><body>${templates}<div id="dashboard" class="grid-stack"></div>
<script src="${base}vendor/gridstack-all.js"></script><script src="${base}vendor/formio.full.min.js"></script>
<script src="../modules/build/floating-ui/dist/umd/popper.min.js"></script><script src="../modules/build/tippyjs/dist/tippy-bundle.umd.min.js"></script><script src="../modules/MAVLink/mavlink.js"></script>
<script src="Widgets/Base_Class.js"></script><script src="Widgets/SandBox.js"></script><script src="Widgets/CustomHTML.js"></script><script src="Widgets/SubGrid.js"></script><script src="Widgets/Menu.js"></script><script src="TelemetryDashboard.js"></script>
<script>let grid;let grid_changed=false;setup_connect=()=>{};</script></body></html>`)
                return
            }
            const consumer = pathname.startsWith(base)
            const directory = consumer ? resolve(packageRoot, 'consumer-dist') : root
            let path = resolve(directory, pathname.slice(consumer ? base.length : prefix.length))
            if (path !== directory && !path.startsWith(directory + sep)) { response.writeHead(403).end(); return }
            if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html')
            response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(path)] ?? 'application/octet-stream')
            response.end(await readFile(path))
        } catch { response.writeHead(404).end() }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    let browser
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined })
        const context = await browser.newContext()
        const origin = `http://127.0.0.1:${server.address().port}`
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
        await context.addInitScript(() => {
            window.ownedObservers = new Set()
            const Original = window.ResizeObserver
            window.ResizeObserver = class extends Original {
                constructor(callback) { super(callback); window.ownedObservers.add(this) }
                disconnect() { window.ownedObservers.delete(this); super.disconnect() }
            }
            window.frameLoadListeners = new Set()
            const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener
            EventTarget.prototype.addEventListener = function (type, callback, options) {
                if (this instanceof HTMLIFrameElement && type === 'load') window.frameLoadListeners.add(callback)
                return add.call(this, type, callback, options)
            }
            EventTarget.prototype.removeEventListener = function (type, callback, options) {
                if (this instanceof HTMLIFrameElement && type === 'load') window.frameLoadListeners.delete(callback)
                return remove.call(this, type, callback, options)
            }
        })
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', error => errors.push(String(error)))
        await page.goto(origin + base)
        await page.waitForFunction(() => !!window.runtime)
        await page.evaluate(() => window.runtime.ready)
        assert.ok(await page.locator('#dashboard iframe').count() > 0, 'authoritative default layout renders')
        assert.ok(await page.evaluate(() => window.serialized().includes('WidgetMenu')))
        await page.evaluate(next => window.mountLayout(next), layout)
        await page.waitForFunction(() => document.querySelectorAll('#dashboard iframe').length === 2)
        await page.evaluate(() => window.runtime.ready)
        const frames = page.frames()
        const sandbox = frames.find(frame => frame.url().includes('SandBox.html'))
        const custom = frames.find(frame => frame.url() === 'about:srcdoc')
        await sandbox.waitForSelector('#telemetry')
        await custom.waitForSelector('#custom')
        await page.evaluate(() => window.publishFixture())
        await sandbox.waitForFunction(() => document.querySelector('#telemetry').textContent === '25')
        await custom.waitForFunction(() => document.querySelector('#custom').textContent === '12.5')
        const actual = await page.evaluate(() => window.serialized())
        await page.evaluate(async () => { await window.runtime.getWidgets()[0].setOptions({ gain: 3 }); window.publishFixture() })
        await sandbox.waitForFunction(() => document.querySelector('#telemetry').textContent === '37.5')
        assert.equal(await page.evaluate(() => window.runtime.getChanged()), true)
        await page.evaluate(() => window.runtime.setEditing(true))
        assert.equal(await page.locator('#dashboard iframe').first().evaluate(frame => frame.style.pointerEvents), 'none')
        await page.evaluate(() => window.runtime.setEditing(false))
        assert.equal(await page.locator('#dashboard iframe').first().getAttribute('sandbox'), 'allow-scripts allow-same-origin')
        // The same fixture through the original owned classes and original serializer.
        const legacy = await context.newPage()
        legacy.on('pageerror', error => console.error('legacy:', String(error)))
        legacy.on('response', response => { if (response.status() >= 400) console.error('legacy HTTP', response.status(), response.url()) })
        await legacy.goto(`${origin}${prefix}TelemetryDashboard/legacy.html`)
        await legacy.evaluate(next => { load_layout(next.grid, next.widgets) }, layout)
        await legacy.waitForFunction(() => grid.getGridItems().every(widget => widget.form && (widget.constructor.name !== 'WidgetSubGrid' || widget.grid.getGridItems().every(child => child.form))))
        await legacy.waitForTimeout(150)
        const expected = await legacy.evaluate(() => JSON.stringify(get_layout(), null, 2))
        assert.equal(actual, expected, 'exact live legacy serialized bytes')
        const legacySandbox = legacy.frames().find(frame => frame.url().includes('SandBox.html'))
        await legacySandbox.waitForSelector('#telemetry')
        await page.evaluate(() => window.publishFixture())
        await legacySandbox.waitForFunction(() => document.querySelector('#telemetry').textContent === '25')
        await legacy.close()
        // Serialize/reload round trip with live Formio and GridStack normalization.
        await page.evaluate(serialized => window.mountLayout(JSON.parse(serialized)), actual)
        await page.waitForTimeout(150)
        await page.evaluate(() => window.runtime.ready)
        assert.equal(await page.evaluate(() => window.serialized()), actual)
        // Retained saved built-in Value widget uses dynamic MAVLink fields.
        const valueLayout = structuredClone(layout)
        valueLayout.widgets = { 0: { ...value, x: '0', y: '0', w: '3', h: '3' } }
        await page.evaluate(next => window.mountLayout(next), valueLayout)
        await page.waitForTimeout(150)
        await page.evaluate(() => window.runtime.ready)
        assert.ok(await page.locator('#dashboard iframe').count() === 1)
        assert.match(await page.locator('#fields').textContent(), /groundspeed/)
        // Repeated React StrictMode mount/removal includes forms and nested observers.
        for (let index = 0; index < 6; index++) {
            await page.getByRole('button', { name: 'Toggle runtime' }).click()
            await page.waitForFunction(() => !window.runtime)
            assert.equal(await page.locator('iframe').count(), 0)
            assert.equal(await page.evaluate(() => window.frameLoadListeners.size), 0)
            assert.equal(await page.evaluate(() => window.ownedObservers.size), 0)
            await page.getByRole('button', { name: 'Toggle runtime' }).click()
            await page.waitForFunction(() => !!window.runtime)
            await page.evaluate(() => window.runtime.ready)
        }
        assert.deepEqual(await page.evaluate(() => window.runtimeErrors), [])
        assert.deepEqual(errors, [])
        await context.close()
        console.log(`PASS widget consumer ${prefix}: legacy bytes, telemetry, nested/custom, dynamic fields, cleanup`)
    } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
}
