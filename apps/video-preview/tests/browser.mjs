import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { listeningOrigin } from '@webtools/routing/tooling'

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const baseRevision = '298045cb9680943bb1f99e95082f86e84e167461'
const legacySource = execFileSync('git', ['show', `${baseRevision}:VideoOverlay/VideoOverlay.js`], { cwd: root, encoding: 'utf8' })
const html = execFileSync('git', ['show', `${baseRevision}:VideoOverlay/index.html`], { cwd: root, encoding: 'utf8' })
const templates = html.match(/<template[\s\S]*?<\/template>/g).join('\n')
const palette = JSON.parse(await readFile(resolve(root, 'VideoOverlay/Default_Palette.json'), 'utf8'))
const scripted = { x: '0', y: '0', w: '3', h: '3', type: 'WidgetSandBoxVideoOverlay', options: { form: {}, form_content: {}, about: { name: 'Known log interpolation' }, sandbox: `div.id='sample';let values, timestamps;loadLog=function(log){const name=log.messageTypes.GPS.instances?'GPS[0]':'GPS';values=log.get(name,'Spd');timestamps=log.get(name,'TimeUS');div.dataset.loads=String(Number(div.dataset.loads||0)+1);div.textContent='loaded'};setTime=function(time){div.dataset.time=String(time);div.textContent=values?String(linear_interp(values,timestamps,time*1000000)):'no log'}` } }
const custom = { x: '0', y: '0', w: '2', h: '2', type: 'WidgetCustomHTMLVideoOverlay', options: { form: {}, form_content: {}, about: { name: 'Nested custom HTML' }, custom_HTML: `<!doctype html><html><body><output id="custom">waiting</output><script type="module">const {default:Parser}=await import(window.parent.location.href+'../modules/JsDataflashParser/parser.js');let log;addEventListener('message',e=>{if(e.data.logData){log=new Parser();log.processData(e.data.logData,[]);document.querySelector('#custom').dataset.loaded='true'}if('time' in e.data){document.querySelector('#custom').textContent=String(e.data.time);e.source.postMessage('renderDone','*')}})</script></body></html>` } }
const layout = { header: { tool: 'videoOverlay', version: 1 }, grid: { columns: 6, rows: 6, color: '' }, widgets: {
    0: scripted,
    1: { x: '3', y: '0', w: '3', h: '3', type: 'WidgetSubGridVideoOverlay', options: { form_content: { rows: 2, columns: 2, borderColor: '#c8c8c8', backgroundColor: '#ffffff', backgroundImage: [] }, widgets: { 0: custom } } },
    2: { ...palette.widgets['0'], x: '0', y: '3', w: '3', h: '3' },
    3: { ...palette.widgets['3'], x: '3', y: '3', w: '3', h: '3' },
} }

/** Stop every owned server descendant, including failed starts. */
async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    process.kill(-child.pid, 'SIGTERM')
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch { /* Already gone. */ } }, 5000)
    await exited; clearTimeout(timer)
}

/** Build with the tested prefix and capture failures without a shell. */
async function build(prefix) {
    const child = spawn('pnpm', ['--filter', 'video-preview', 'build'], { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBTOOLS_BASE_PATH: prefix } })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
    const timer = setTimeout(() => { void stop(child) }, 120000)
    try { const [code] = await once(child, 'exit'); assert.equal(code, 0, output) }
    finally { clearTimeout(timer); await stop(child) }
}

/** Start the independent app in development or actual local Worker preview. */
async function start(mode, prefix) {
    const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : ['--force']), '--host', '127.0.0.1', '--port', '0'], { cwd: resolve(root, 'apps/video-preview'), detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBTOOLS_BASE_PATH: prefix, BROWSER: 'none' } })
    let output = ''
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Readiness timeout: ' + output)), 60000)
            /** Recognize real Vite readiness despite ANSI and split output chunks. */
            const read = chunk => { output += chunk; const origin = listeningOrigin(output); if (origin) { clearTimeout(timer); resolve(origin) } }
            child.stdout.on('data', read); child.stderr.on('data', read)
            child.on('error', error => { clearTimeout(timer); reject(error) }); child.on('exit', code => { clearTimeout(timer); reject(new Error(`${code}: ${output}`)) })
        })
        return { origin, close: () => stop(child) }
    } catch (error) { await stop(child); throw error }
}

/** Serve unchanged legacy preview functions and classes with the same pinned local vendor assets. */
async function legacyServer() {
    const server = createServer(async (request, response) => {
        try {
            const pathname = new URL(request.url, 'http://localhost').pathname
            if (pathname === '/VideoOverlay/') {
                response.setHeader('Content-Type', 'text/html')
                response.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/vendor/bootstrap.min.css"><link rel="stylesheet" href="/vendor/gridstack.min.css"><link rel="stylesheet" href="/vendor/gridstack-extra.min.css"><link rel="stylesheet" href="/vendor/formio.full.min.css"><style>body{margin:8px}.video-container{position:relative;width:1184px;height:576px}#dashboard{height:100%;width:100%;position:absolute;inset:0}.grid-stack{background:transparent!important}</style></head><body>${templates}<input id="grid_rows"><input id="grid_columns"><input id="log_offset" value="0"><div class="video-container"><video id="video"></video><div id="dashboard" class="grid-stack"></div></div><div id="palette"></div>
<script src="/vendor/gridstack-all.js"></script><script src="/vendor/formio.full.min.js"></script><script src="/modules/build/floating-ui/dist/umd/popper.min.js"></script><script src="/modules/build/tippyjs/dist/tippy-bundle.umd.min.js"></script>
${['Base_Class','SandBox','SubGrid','CustomHTML'].map(name => `<script src="../TelemetryDashboard/Widgets/${name}.js"></script>`).join('')}${['SandBox','SubGrid','CustomHTML'].map(name => `<script src="Widgets/${name}.js"></script>`).join('')}<script src="VideoOverlay.js"></script><script>let grid;let grid_changed=false;let palette;const video=document.querySelector('#video');window.boot=async(layout)=>{await Promise.allSettled(import_done);load_layout(layout.grid,layout.widgets)};window.loadFixture=async(bytes)=>{log=new DataflashParser();log.processData(Uint8Array.from(bytes).buffer,[]);setDefaultOffset();for(const widget of grid.getGridItems())widget.loadLog();await setWidgetTime(video.currentTime)};window.scrub=async(time,offset)=>{document.querySelector('#log_offset').value=offset;video.currentTime=time;await setWidgetTime(time)}</script></body></html>`)
                return
            }
            const directory = pathname.startsWith('/vendor/') ? resolve(root, 'apps/video-preview/.legacy-assets') : root
            const path = resolve(directory, '.' + pathname)
            assert.ok(path.startsWith(directory + sep) && (await stat(path)).isFile())
            response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(path)] ?? 'application/octet-stream')
            response.end(await readFile(path))
        } catch { response.writeHead(404).end() }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) }
}

/** Wait for complete replacement, never treating an outgoing ready runtime as the replacement. */
async function replace(page, value) {
    const previous = await page.locator('#dashboard > .grid-stack-item').first().elementHandle()
    await page.getByLabel('Overlay file', { exact: true }).setInputFiles({ name: 'known-layout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) })
    if (previous) { await page.waitForFunction(element => !element.isConnected, previous); await previous.dispose() }
    await page.locator('#dashboard[data-ready=true]').waitFor()
}

/** Read the controlled interpolation, nested HTML and authoritative Graph/Value output from real frames. */
async function values(page, expectedTime) {
    const frames = await page.locator('#dashboard iframe').elementHandles()
    const output = []
    for (const element of frames) {
        const frame = await element.contentFrame()
        const sample = frame.locator('#sample')
        const custom = frame.locator('#custom')
        if (await sample.count()) {
            await frame.waitForFunction(time => document.querySelector('#sample')?.dataset.time === String(time), expectedTime)
            output.push({ sample: await sample.textContent() })
        } else if (await custom.count()) {
            await frame.waitForFunction(time => document.querySelector('#custom')?.textContent === String(time) && document.querySelector('#custom')?.dataset.loaded === 'true', expectedTime)
            output.push({ custom: await custom.textContent() })
        } else {
            await frame.locator('body > div').waitFor()
            output.push(await frame.evaluate(() => {
                const plot = document.querySelector('.js-plotly-plot')
                return plot ? { plot: plot.data.map(trace => ({ x: Array.from(trace.x), y: Array.from(trace.y) })), range: plot.layout.xaxis.range } : { text: document.body.textContent.trim() }
            }))
        }
    }
    for (const element of frames) await element.dispose()
    return output
}

/** Generate a deterministic local canvas video; the same exact bytes are used for both log/video comparisons. */
async function generateVideo(page) {
    return Buffer.from(await page.evaluate(async () => {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180
        const context = canvas.getContext('2d'); context.fillStyle = '#204060'; context.fillRect(0,0,320,180)
        const stream = canvas.captureStream(10), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }), chunks = []
        recorder.ondataavailable = event => chunks.push(event.data)
        const stopped = new Promise(resolve => { recorder.onstop = resolve })
        recorder.start(); const paint = setInterval(() => { context.fillRect(0,0,320,180) },100); await new Promise(resolve => setTimeout(resolve, 4200)); clearInterval(paint); recorder.stop(); await stopped
        for (const track of stream.getTracks()) track.stop()
        return Array.from(new Uint8Array(await new Blob(chunks, { type:'video/webm' }).arrayBuffer()))
    }))
}

for (const prefix of process.env.VIDEO_TEST_PREFIX ? [process.env.VIDEO_TEST_PREFIX] : ['/', '/Tools/WebTools/']) {
    for (const mode of process.env.VIDEO_TEST_MODE ? [process.env.VIDEO_TEST_MODE] : ['dev', 'preview']) test(`video preview ${mode} ${prefix}: differential, controls and lifecycle`, { timeout: 180000 }, async () => {
        assert.equal(await readFile(resolve(root, 'VideoOverlay/VideoOverlay.js'), 'utf8'), legacySource)
        await build(prefix)
        const server = await start(mode, prefix), legacy = await legacyServer()
        const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true })
        const context = await browser.newContext({ viewport: { width: 1200, height: 720 }, acceptDownloads: true })
        context.setDefaultTimeout(15000)
        const errors = [], blocked = []
        try {
            await context.route('**/*', async route => {
                const url = route.request().url()
                if (url === 'https://cdn.plot.ly/plotly-2.35.0.min.js') return route.fulfill({ contentType:'text/javascript', body: await readFile(resolve(root,'modules/plotly.js/dist/plotly.min.js')) })
                // Export is a separate issue: this unused importer is isolated from preview tests.
                if (url.includes('html2canvas@1.4.1')) return route.fulfill({ contentType:'text/javascript', body: 'export default function(){throw new Error("Export outside preview scope")}' })
                if ([server.origin, legacy.origin].includes(new URL(url).origin)) return route.continue()
                blocked.push(url); return route.abort()
            })
            await context.addInitScript(() => {
                Math.random = () => .123456789
                window.liveObjectUrls = new Set(); const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
                URL.createObjectURL = blob => { const url = create(blob); window.liveObjectUrls.add(url); return url }
                URL.revokeObjectURL = url => { window.liveObjectUrls.delete(url); revoke(url) }
                window.liveMessageListeners = new Set(); const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window)
                window.addEventListener = (type, callback, options) => { if (type === 'message') window.liveMessageListeners.add(callback); add(type, callback, options) }
                window.removeEventListener = (type, callback, options) => { if (type === 'message') window.liveMessageListeners.delete(callback); remove(type, callback, options) }
            })
            const page = await context.newPage(), old = await context.newPage()
            page.on('pageerror', error => errors.push(String(error))); old.on('pageerror', error => errors.push(String(error)))
            page.on('dialog', dialog => dialog.accept()); old.on('dialog', dialog => {console.log('legacy dialog',dialog.message());return dialog.accept()})
            await page.goto(server.origin + prefix + 'VideoOverlayPreview/')
            await page.locator('#dashboard[data-ready=true]').waitFor()
            await page.locator('.palette-grid[data-ready=true]').waitFor()
            assert.equal(await page.locator('.palette-grid > .grid-stack-item').count(), 7)
            await replace(page, layout)
            await old.goto(legacy.origin + '/VideoOverlay/')
            await old.waitForFunction(() => typeof window.boot === 'function')
            await old.evaluate(layout => window.boot(layout), layout)
            await page.locator('#dashboard iframe').first().contentFrame().locator('#sample').waitFor()
            await old.locator('#dashboard iframe').first().contentFrame().locator('#sample').waitFor()
            const video = await generateVideo(page)
            await page.getByLabel('Video file', { exact:true }).setInputFiles({ name:'known.webm', mimeType:'video/webm', buffer:video })
            await page.waitForFunction(() => Number.isFinite(document.querySelector('video').duration))
            await old.evaluate(async bytes => { const video=document.querySelector('video'); video.src=URL.createObjectURL(new Blob([Uint8Array.from(bytes)],{type:'video/webm'})); await new Promise(resolve=>{video.onloadedmetadata=resolve}) }, Array.from(video))
            for (const file of ['pymavlink-test.BIN', 'plane-4.6.2-prefix.BIN']) {
                const bytes = await readFile(resolve(root,'packages/dataflash/fixtures',file))
                await page.getByLabel('Log file', { exact:true }).setInputFiles({ name:file, mimeType:'application/octet-stream', buffer:bytes })
                await page.getByText('Loading log…',{exact:true}).waitFor({ state:'hidden' })
                await old.evaluate(bytes => window.loadFixture(bytes), Array.from(bytes))
                const offset = Number(await page.getByLabel('Log offset', { exact:true }).inputValue())
                assert.equal(offset, await old.locator('#log_offset').evaluate(element => Number(element.value)))
                for (const time of [0, .125, 1, 3.75]) for (const adjustment of [offset, -12.5, 2.25]) {
                    await page.getByLabel('Log offset', { exact:true }).fill(String(adjustment))
                    await page.locator('video').evaluate((video,time) => { video.currentTime=time;video.dispatchEvent(new Event('timeupdate')) }, time)
                    await old.evaluate(([time,offset]) => window.scrub(time,offset), [time,adjustment])
                    const expected = await values(old,time-adjustment), actual = await values(page,time-adjustment)
                    assert.deepEqual(actual, expected, `${file} t=${time} offset=${adjustment}`)
                }
                // Reload with the same timestamp/offset; a new log must always receive a new time.
                const sample = page.locator('#dashboard iframe').first().contentFrame().locator('#sample')
                const before = await sample.getAttribute('data-loads')
                await page.getByLabel('Log file',{exact:true}).setInputFiles({name:file,mimeType:'application/octet-stream',buffer:bytes})
                await page.getByText('Loading log…',{exact:true}).waitFor({state:'hidden'})
                await sample.evaluate(element => { element.dataset.reloaded='true' })
                assert.notEqual(await sample.getAttribute('data-loads'),before)
                await page.waitForFunction(() => document.querySelector('#dashboard iframe').contentDocument?.querySelector('#sample')?.textContent !== 'loaded')
            }
            const download = page.waitForEvent('download'); await page.getByRole('button',{name:'Save layout',exact:true}).click()
            const saved = await download, savedBytes = await readFile(await saved.path(),'utf8')
            const expectedBytes = await old.evaluate(() => JSON.stringify(get_layout(),null,2))
            assert.equal(savedBytes,expectedBytes)
            await replace(page,JSON.parse(savedBytes))
            await page.locator('#dashboard > .grid-stack-item').first().press('Enter')
            await page.getByRole('region',{name:'Widget settings'}).waitFor()
            await page.getByLabel('Column',{exact:true}).fill('1')
            await page.getByRole('button',{name:'Close widget settings'}).click()
            const target = page.locator('#dashboard > .grid-stack-item').first(), box = await target.boundingBox()
            await page.mouse.move(box.x+15,box.y+15);await page.mouse.down();await page.mouse.move(box.x+200,box.y+100,{steps:12});await page.mouse.up()
            await target.press('Enter');await page.getByRole('button',{name:'Edit source and form'}).click()
            await page.getByRole('button',{name:'Apply and close'}).waitFor({state:'visible'})
            await page.waitForFunction(() => !document.querySelector('.source-editor button:nth-last-child(2)').disabled)
            await page.getByRole('button',{name:'Cancel',exact:true}).click()
            await page.getByRole('button',{name:'Close widget settings'}).click()
            await page.getByRole('button',{name:'🔊',exact:true}).click();await page.getByLabel('Volume',{exact:true}).fill('.2');await page.getByLabel('Speed',{exact:true}).selectOption('2')
            for (let attempt=0;attempt<3;attempt++) {
                await page.getByRole('button',{name:'Unmount preview'}).click()
                assert.equal(await page.locator('#dashboard iframe').count(),0)
                await page.waitForFunction(() => window.liveMessageListeners.size === 0 && window.liveObjectUrls.size === 0)
                await page.getByRole('button',{name:'Mount preview'}).click();await page.locator('#dashboard[data-ready=true]').waitFor()
                assert.deepEqual(await page.locator('video').evaluate(video=>[video.muted,video.volume,video.playbackRate]),[true,.2,2])
                await page.getByLabel('Video file',{exact:true}).setInputFiles({name:'again.webm',mimeType:'video/webm',buffer:video})
                await page.waitForFunction(() => Number.isFinite(document.querySelector('video').duration))
            }
            await page.getByRole('button',{name:'Unmount preview'}).click()
            await page.waitForFunction(() => window.liveMessageListeners.size === 0 && window.liveObjectUrls.size === 0)
            for (const path of ['missing','Widgets/missing.html']) assert.equal((await context.request.get(server.origin+prefix+'VideoOverlayPreview/'+path)).status(),404)
            assert.equal((await context.request.get(server.origin+prefix+'modules/JsDataflashParser/parser.js')).status(),200)
            const allowed = 'Failed to fetch dynamically imported module: https://unpkg.com/flight-indicators-js@1.0.5/esm/module-flight-indicators.mjs'
            assert.deepEqual(errors.filter(error => !error.includes(allowed)),[])
            assert.ok(blocked.every(url=>url.includes('flight-indicators-js@1.0.5') || url.includes('fonts.cdnfonts.com')))
            console.log(`${mode} ${prefix}: both known logs, 24 timestamp/offset pairs, exact saved JSON, real media/editor/pointer/keyboard and repeated cleanup passed`)
        } finally { await context.close();await browser.close();await server.close();await legacy.close() }
    })
}
