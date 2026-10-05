import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { readFile, stat, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'
import { listeningOrigin } from '@webtools/routing/tooling'

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const baseRevision = '298045cb9680943bb1f99e95082f86e84e167461'
const parserDispatcher = (await readFile(resolve(root, 'modules/JsDataflashParser/parser.js'), 'utf8')).match(/self\.addEventListener\('message', (function \(event\) \{[\s\S]*?\n\})\)/)[1]
const legacySource = execFileSync('git', ['show', `${baseRevision}:VideoOverlay/VideoOverlay.js`], { cwd: root, encoding: 'utf8' })
const html = execFileSync('git', ['show', `${baseRevision}:VideoOverlay/index.html`], { cwd: root, encoding: 'utf8' })
const templates = html.match(/<template[\s\S]*?<\/template>/g).join('\n')
const palette = JSON.parse(await readFile(resolve(root, 'VideoOverlay/Default_Palette.json'), 'utf8'))
const scripted = { x: '0', y: '0', w: '3', h: '3', type: 'WidgetSandBoxVideoOverlay', options: { form: {}, form_content: {}, about: { name: 'Known log interpolation' }, sandbox: `div.id='sample';let values, timestamps;loadLog=function(log){const instance=log.messageTypes.GPS.instances?0:null;values=log.get_instance('GPS',instance,'Spd');timestamps=log.get_instance('GPS',instance,'TimeUS');div.dataset.loads=String(Number(div.dataset.loads||0)+1);div.textContent='loaded'};setTime=function(time){div.dataset.time=String(time);div.textContent=values?String(linear_interp(values,timestamps,time*1000000)):'no log'}` } }
const custom = { x: '0', y: '0', w: '2', h: '2', type: 'WidgetCustomHTMLVideoOverlay', options: { form: {}, form_content: {}, about: { name: 'Nested custom HTML' }, custom_HTML: `<!doctype html><html><body><output id="custom">waiting</output><script type="module">const {default:Parser}=await import(window.parent.location.href+'../modules/JsDataflashParser/parser.js');let log;addEventListener('message',e=>{if(e.data.logData){log=new Parser();log.processData(e.data.logData,[]);document.querySelector('#custom').dataset.loaded='true'}if('time' in e.data){document.querySelector('#custom').textContent=String(e.data.time);e.source.postMessage('renderDone','*')}});document.querySelector('#custom').dataset.ready='true'</script></body></html>` } }
const layout = { header: { tool: 'videoOverlay', version: 1 }, grid: { columns: 6, rows: 6, color: '' }, widgets: {
    0: scripted,
    1: { x: '3', y: '0', w: '3', h: '3', type: 'WidgetSubGridVideoOverlay', options: { form_content: { rows: 2, columns: 2, borderColor: '#c8c8c8', backgroundColor: '#ffffff', backgroundImage: [] }, widgets: { 0: custom } } },
    2: { ...palette.widgets['0'], x: '0', y: '3', w: '3', h: '3' },
    3: { ...palette.widgets['3'], x: '3', y: '3', w: '3', h: '3' },
} }

/** Require zero owned resources, allowing only the pinned libraries' stable page caches. */
async function assertClosed(page, cacheUrls) {
    try {
        await page.waitForFunction(parserDispatcher => {
            const sources = [...window.liveMessageListeners].map(callback => callback.toString())
            return sources.length === 3 && sources.filter(source => source === parserDispatcher).length === 1
                && sources.filter(source => source.includes('GlobalFormio.forms')).length === 1
                && sources.filter(source => source.includes('vscodeScheduleAsyncWork')).length === 1
                && [...window.liveObjectUrls].every(url => window.objectUrlTypes.get(url) === 'application/javascript')
                && Object.keys(window.Formio.forms ?? {}).length === 0 && window.liveObservers.size === 0
                && window.liveResizeListeners.size === 0 && window.pendingFileReads.size === 0
        }, parserDispatcher)
    } catch (error) {
        console.log('cleanup failure', await page.evaluate(() => ({
            messages: [...window.liveMessageListeners].map(callback => callback.toString().slice(0,220)),
            urls: [...window.liveObjectUrls].map(url => window.objectUrlTypes.get(url)),
            observers: window.liveObservers.size, resize: window.liveResizeListeners.size, reads: window.pendingFileReads.size,
            forms: Object.keys(window.Formio.forms ?? {}),
        })))
        throw error
    }
    assert.equal(await page.evaluate(() => {
        const current = [...window.liveMessageListeners]
        const previous = window.previewCacheCallbacks
        window.previewCacheCallbacks ??= current
        return !previous || (previous.length === current.length && previous.every(callback => current.includes(callback)))
    }), true, 'vendor dispatcher callback identities remain stable across mount cycles')
    const urls = await page.evaluate(() => [...window.liveObjectUrls].sort())
    if (cacheUrls) assert.deepEqual(urls, cacheUrls, 'editor worker script cache remains stable across mount cycles')
    return urls
}

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
                response.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/vendor/bootstrap.min.css"><link rel="stylesheet" href="/vendor/gridstack.min.css"><link rel="stylesheet" href="/vendor/gridstack-extra.min.css"><link rel="stylesheet" href="/vendor/formio.full.min.css"><style>body{margin:8px}.video-container{position:relative;width:1184px;height:576px}video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}#dashboard{height:100%;width:100%;position:absolute;inset:0}.grid-stack{background:transparent!important}</style></head><body>${templates}<input id="grid_rows"><input id="grid_columns"><input id="log_offset" value="0"><div class="video-container"><video id="video"></video><div id="dashboard" class="grid-stack"></div></div><div id="palette"></div>
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
    try { await page.locator('#dashboard[data-ready=true]').waitFor() }
    catch (error) { console.log('layout replacement failure',await page.evaluate(()=>({
        url:location.href, body:document.body.textContent.slice(0,1000), ready:document.querySelector('#dashboard')?.getAttribute('data-ready'),
        grid:document.querySelector('#dashboard')?.outerHTML.slice(0,2000),
        size:document.querySelector('#dashboard')?.getBoundingClientRect().toJSON(),
        container:document.querySelector('.video-container')?.getBoundingClientRect().toJSON(),
        alert:document.querySelector('[role=alert]')?.textContent,
    })));throw error }
}

/** Read the controlled interpolation, nested HTML and authoritative Graph/Value output from real frames. */
async function values(page, expectedTime, firstGps) {
    const frames = await page.locator('#dashboard iframe').elementHandles()
    const output = []
    for (const element of frames) {
        const frame = await element.contentFrame()
        const sample = frame.locator('#sample')
        const custom = frame.locator('#custom')
        if (await sample.count()) {
            await frame.waitForFunction(time => document.querySelector('#sample')?.dataset.time === String(time) && document.querySelector('#sample')?.textContent !== 'loaded', expectedTime)
            output.push({ sample: await sample.textContent() })
        } else if (await custom.count()) {
            await frame.waitForFunction(time => document.querySelector('#custom')?.textContent === String(time) && document.querySelector('#custom')?.dataset.loaded === 'true', expectedTime).catch(async error=>{console.log('custom failure',page.url(),expectedTime,await custom.evaluate(e=>e.outerHTML));throw error})
            output.push({ custom: await custom.textContent() })
        } else {
            await frame.locator('body > div').waitFor()
            if (firstGps !== undefined && output.length === 2) {
                await frame.locator('.js-plotly-plot').waitFor().catch(async error => { console.log('graph missing',page.url(),await frame.locator('body').textContent(),await frame.evaluate(()=>({scripts:Array.from(document.scripts).map(script=>script.src),plotly:!!window.Plotly})));throw error })
                await frame.waitForFunction(([time, first]) => {
                    const plot = document.querySelector('.js-plotly-plot')
                    return plot?.data?.[0]?.x?.length && Math.abs(plot.data[0].x[0] - (first - time)) < 1e-10
                }, [expectedTime, firstGps])
            }
            output.push(await frame.evaluate(() => {
                const plot = document.querySelector('.js-plotly-plot')
                return plot ? { plot: plot.data.map(trace => ({ x: Array.from(trace.x), y: Array.from(trace.y) })), range: plot.layout.xaxis.range } : { text: document.body.textContent.trim() }
            }))
        }
    }
    for (const element of frames) await element.dispose()
    return output
}

/** Compare decoded pixels, permitting only the observed single-pixel rounded-border antialias variation. */
async function comparePixels(page, actual, expected) {
    return page.evaluate(async ([actual, expected]) => {
        const images = await Promise.all([actual, expected].map(bytes => createImageBitmap(new Blob([Uint8Array.from(bytes)], { type:'image/png' }))))
        const values = images.map(image => {
            const canvas = new OffscreenCanvas(image.width,image.height), context = canvas.getContext('2d')
            context.drawImage(image,0,0); return context.getImageData(0,0,image.width,image.height).data
        })
        const dimensions = images.map(image => ({ width: image.width, height: image.height }))
        const differences = []
        let maximum = 0, changed = 0
        for (let offset=0;offset<values[0].length;offset+=4) {
            let difference=0
            for (let channel=0;channel<4;channel++) difference=Math.max(difference,Math.abs(values[0][offset+channel]-values[1][offset+channel]))
            maximum=Math.max(maximum,difference);if(difference){changed++; if(differences.length<100) differences.push({x:(offset/4)%images[0].width,y:Math.floor(offset/4/images[0].width),actual:Array.from(values[0].slice(offset,offset+4)),expected:Array.from(values[1].slice(offset,offset+4)),difference})}
        }
        for (const image of images) image.close()
        return { maximum, changed, dimensions, differences }
    }, [Array.from(actual),Array.from(expected)])
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
    for (const mode of process.env.VIDEO_TEST_MODE ? [process.env.VIDEO_TEST_MODE] : ['dev', 'preview']) test(`video preview ${mode} ${prefix}: differential, controls and lifecycle`, { timeout: 300000 }, async () => {
        assert.equal(await readFile(resolve(root, 'VideoOverlay/VideoOverlay.js'), 'utf8'), legacySource)
        await build(prefix)
        const server = await start(mode, prefix), legacy = await legacyServer()
        const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true })
        const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true })
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
                window.objectUrlTypes=new Map();window.liveObjectUrls = new Set(); const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
                URL.createObjectURL = blob => { const url = create(blob); window.liveObjectUrls.add(url);window.objectUrlTypes.set(url,blob.type); return url }
                URL.revokeObjectURL = url => { window.liveObjectUrls.delete(url);window.objectUrlTypes.delete(url); revoke(url) }
                window.liveResizeListeners = new Set();window.liveObservers = new Set();const NativeObserver=window.ResizeObserver;window.ResizeObserver=class extends NativeObserver{constructor(callback){super(callback);window.liveObservers.add(this)}disconnect(){window.liveObservers.delete(this);super.disconnect()}};window.liveMessageListeners = new Set(); const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window)
                window.addEventListener = (type, callback, options) => { if (type === 'message') window.liveMessageListeners.add(callback);if(type==='resize'){window.liveResizeListeners.add(callback)}; add(type, callback, options) }
                window.removeEventListener = (type, callback, options) => { if (type === 'message') window.liveMessageListeners.delete(callback);if(type==='resize')window.liveResizeListeners.delete(callback); remove(type, callback, options) }
            })
            const page = await context.newPage(), old = await context.newPage()
            page.on('pageerror', error => {errors.push(String(error));if(!String(error).includes('flight-indicators-js@1.0.5'))console.error('preview page error',error)}); old.on('pageerror', error => errors.push(String(error)))
            page.on('dialog', dialog => dialog.accept()); old.on('dialog', dialog => dialog.accept())
            await page.goto(server.origin + prefix + 'VideoOverlayPreview/index.html')
            assert.equal(new URL(page.url()).pathname,prefix+'VideoOverlayPreview/')
            await page.locator('#dashboard[data-ready=true]').waitFor()
            await page.locator('.palette-grid[data-ready=true]').waitFor()
            assert.equal(await page.locator('.palette-grid > .grid-stack-item').count(), 7)
            await replace(page, layout)
            await old.goto(legacy.origin + '/VideoOverlay/')
            await old.waitForFunction(() => typeof window.boot === 'function')
            const size = await page.locator('.video-container').boundingBox()
            await old.locator('.video-container').evaluate((element,size)=>{element.style.position='absolute';element.style.left=size.x+'px';element.style.top=size.y+'px';element.style.width=size.width+'px';element.style.height=size.height+'px'},size)
            await old.evaluate(layout => window.boot(layout), layout)
            await page.locator('#dashboard iframe').first().contentFrame().locator('#sample').waitFor()
            await old.locator('#dashboard iframe').first().contentFrame().locator('#sample').waitFor()
            const video = await generateVideo(page)
            await page.getByLabel('Video file', { exact:true }).setInputFiles({ name:'known.webm', mimeType:'video/webm', buffer:video })
            await page.waitForFunction(() => Number.isFinite(document.querySelector('video').duration))
            await old.evaluate(async bytes => { const video=document.querySelector('video'); video.src=URL.createObjectURL(new Blob([Uint8Array.from(bytes)],{type:'video/webm'})); await new Promise(resolve=>{video.onloadedmetadata=resolve}) }, Array.from(video))
            await page.waitForFunction(()=>/Video: [0-9.]+ FPS/.test(document.querySelector('[aria-label="File information"]').textContent))
            await page.getByLabel('Frame rate',{exact:true}).selectOption('30')
            await page.getByRole('button',{name:'Next frame',exact:true}).click()
            await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-1/30)<1e-5)
            await page.getByRole('button',{name:'Previous frame',exact:true}).click()
            await page.waitForFunction(()=>document.querySelector('video').currentTime===0)
            await page.getByRole('button',{name:'+5s',exact:true}).click()
            await page.waitForFunction(()=>document.querySelector('video').currentTime>=document.querySelector('video').duration-.1)
            await page.getByRole('button',{name:'−5s',exact:true}).click()
            await page.waitForFunction(()=>document.querySelector('video').currentTime===0)
            await page.getByLabel('Seek',{exact:true}).fill('0.25')
            const initialTime=await page.locator('video').evaluate(video=>video.currentTime)
            await page.locator('video').evaluate(video => {
                const events = []
                const record = event => { if (events.length < 20) events.push({ event: event.type, paused: video.paused, ended: video.ended, time: video.currentTime }) }
                video.__pauseObservation = { events, record }
                for (const name of ['play', 'pause', 'ended']) video.addEventListener(name, record)
            })
            let beforePause
            try {
                await page.getByRole('button',{name:'▶',exact:true}).click()
                await page.waitForFunction(time=>document.querySelector('video').currentTime>time+.1,initialTime)
                beforePause = await page.locator('video').evaluate(video => ({ paused: video.paused, ended: video.ended, time: video.currentTime, duration: video.duration }))
                await page.getByRole('button',{name:'||',exact:true}).click()
                await page.waitForFunction(() => document.querySelector('video').paused, null, { timeout: 5000 })
                assert.equal(await page.locator('video').evaluate(video=>video.paused),true)
            } finally {
                let diagnosticTimer
                try {
                    const afterPause = await Promise.race([
                        page.locator('video').evaluate(video => {
                            const observation = video.__pauseObservation
                            for (const name of ['play', 'pause', 'ended']) video.removeEventListener(name, observation.record)
                            delete video.__pauseObservation
                            return { paused: video.paused, ended: video.ended, time: video.currentTime, duration: video.duration, events: observation.events }
                        }).catch(error => ({ unavailable: error.message })),
                        new Promise(resolve => { diagnosticTimer = setTimeout(() => resolve({ unavailable: 'pause diagnostics exceeded 500ms' }), 500) }),
                    ])
                    console.log('play/pause native state', { mode, prefix, beforePause, afterPause })
                } finally { clearTimeout(diagnosticTimer) }
            }


            for (const file of ['pymavlink-test.BIN', 'plane-4.6.2-prefix.BIN']) {
                console.log('fixture',file)
                if(file==='plane-4.6.2-prefix.BIN'){await replace(page,layout);await old.evaluate(layout=>window.boot(layout),layout);await old.locator('#dashboard iframe').first().contentFrame().locator('#sample').waitFor()}
                await page.locator('#dashboard iframe').nth(1).contentFrame().locator('#custom[data-ready=true]').waitFor()
                await old.locator('#dashboard iframe').nth(1).contentFrame().locator('#custom[data-ready=true]').waitFor()
                const bytes = await readFile(resolve(root,'packages/dataflash/fixtures',file))
                Object.assign(globalThis, { self: { addEventListener() {} } })
                const { loadDataflashParser } = await import('@webtools/dataflash')
                const Parser = await loadDataflashParser(), oracle = new Parser()
                oracle.processData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), [])
                const firstGps = oracle.get_instance('GPS', file.startsWith('plane') ? 0 : null, 'TimeUS')[0] / 1e6
                await page.getByLabel('Log file', { exact:true }).setInputFiles({ name:file, mimeType:'application/octet-stream', buffer:bytes })
                await page.getByText('Loading log…',{exact:true}).waitFor({ state:'hidden' })
                await old.evaluate(bytes => Promise.race([window.loadFixture(bytes),new Promise((_,reject)=>setTimeout(()=>reject(new Error('legacy load acknowledgement timeout')),10000))]), Array.from(bytes))
                const configured = structuredClone(layout)
                configured.widgets[2].options.form_content.logItem = file.startsWith('plane') ? 'GPS[0].Spd' : 'GPS.Spd'
                await replace(page, configured)
                await old.evaluate(() => { log=undefined })
                await old.evaluate(layout => window.boot(layout), configured)
                await page.locator('#dashboard iframe').nth(1).contentFrame().locator('#custom[data-ready=true]').waitFor()
                await old.locator('#dashboard iframe').nth(1).contentFrame().locator('#custom[data-ready=true]').waitFor()
                await old.waitForFunction(() => grid.getGridItems().every(widget => widget.form && (widget.constructor.name !== 'WidgetSubGridVideoOverlay' || widget.grid.getGridItems().every(child=>child.form))))
                await old.evaluate(bytes => Promise.race([window.loadFixture(bytes),new Promise((_,reject)=>setTimeout(()=>reject(new Error('legacy configured log acknowledgement timeout')),10000))]),Array.from(bytes))
                const offset = Number(await page.getByLabel('Log offset', { exact:true }).inputValue())
                assert.equal(offset, await old.locator('#log_offset').evaluate(element => Number(element.value)))
                for (const time of [0, .125, 1, 3.75]) for (const adjustment of [offset, -12.5, 2.25]) {
                    await page.getByLabel('Log offset', { exact:true }).fill(String(adjustment))
                    await page.locator('video').evaluate((video,time) => { video.currentTime=time;video.dispatchEvent(new Event('timeupdate')) }, time)
                    await old.evaluate(([time,offset]) => Promise.race([window.scrub(time,offset),new Promise((_,reject)=>setTimeout(()=>reject(new Error('legacy scrub acknowledgement timeout')),10000))]), [time,adjustment])
                    const expected = await values(old,time-adjustment,firstGps), actual = await values(page,time-adjustment,firstGps)
                    assert.deepEqual(actual, expected, `${file} t=${time} offset=${adjustment}`)
                }
                // Reload with the same timestamp/offset; a new log must always receive a new time.
                await page.getByLabel('Log offset',{exact:true}).fill(String(offset))
                await values(page, await page.locator('video').evaluate(video=>video.currentTime) - offset)
                const sample = page.locator('#dashboard iframe').first().contentFrame().locator('#sample')
                const before = await sample.getAttribute('data-loads')
                await page.getByLabel('Log file',{exact:true}).setInputFiles({name:file,mimeType:'application/octet-stream',buffer:bytes})
                await page.getByText('Loading log…',{exact:true}).waitFor({state:'hidden'})
                await sample.evaluate(element => { element.dataset.reloaded='true' })
                assert.notEqual(await sample.getAttribute('data-loads'),before)
                await page.waitForFunction(() => document.querySelector('#dashboard iframe').contentDocument?.querySelector('#sample')?.textContent !== 'loaded')
            }
            const bytes=await readFile(resolve(root,'packages/dataflash/fixtures/plane-4.6.2-prefix.BIN'))
            await page.evaluate(() => {
                const original=FileReader.prototype.readAsArrayBuffer, abort=FileReader.prototype.abort, timers=new WeakMap();window.pendingFileReads=new Set()
                FileReader.prototype.readAsArrayBuffer=function(file){window.pendingFileReads.add(this);this.addEventListener('loadend',()=>window.pendingFileReads.delete(this),{once:true});if(file.name==='delayed.BIN'){timers.set(this,setTimeout(()=>original.call(this,file),2000))}else original.call(this,file)}
                FileReader.prototype.abort=function(){clearTimeout(timers.get(this));window.pendingFileReads.delete(this);abort.call(this)}
            })
            await page.getByLabel('Log file',{exact:true}).setInputFiles({name:'delayed.BIN',mimeType:'application/octet-stream',buffer:bytes})
            await page.getByRole('button',{name:'Cancel loading',exact:true}).click()
            await page.getByText('Loading log…',{exact:true}).waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.pendingFileReads.size),0)
            await page.getByLabel('Log file',{exact:true}).setInputFiles({name:'delayed.BIN',mimeType:'application/octet-stream',buffer:bytes})
            await page.getByLabel('Log file',{exact:true}).setInputFiles({name:'replacement.BIN',mimeType:'application/octet-stream',buffer:bytes})
            await page.getByText('Loading log…',{exact:true}).waitFor({state:'hidden'})
            const finalTime=await page.locator('video').evaluate(video=>video.currentTime),finalOffset=Number(await page.getByLabel('Log offset',{exact:true}).inputValue())
            await old.evaluate(([time,offset])=>window.scrub(time,offset),[finalTime,finalOffset])
            const finalValues = await values(page,finalTime-finalOffset)
            assert.deepEqual(finalValues,await values(old,finalTime-finalOffset),'final reloaded widget values match legacy before pixel comparison')
            // The static comparison starts the sample text and Value SVG from identical
            // redraw histories after testing the different reload/lifecycle histories above.
            for (const index of [0, 3]) for (const target of [page,old]) await target.evaluate(async ({index,widget,bytes,time})=>{
                const frame=document.querySelectorAll('#dashboard iframe')[index];
                const done=new Promise((resolve,reject)=>{
                    const receive=event=>{if(event.source===frame.contentWindow&&event.data==='renderDone'){clearTimeout(timer);removeEventListener('message',receive);resolve()}};
                    const timer=setTimeout(()=>{removeEventListener('message',receive);reject(new Error(`Widget ${index} redraw acknowledgement timed out`))},5000);
                    addEventListener('message',receive);
                });
                frame.contentWindow.postMessage({script:widget.options.sandbox,options:widget.options.form_content},'*');
                frame.contentWindow.postMessage({logData:new Uint8Array(bytes).buffer},'*');
                frame.contentWindow.postMessage({time},'*');await done;
            },{index,widget:layout.widgets[index],bytes:[...bytes],time:finalTime-finalOffset})
            for (const target of [page,old]) assert.deepEqual(await values(target,finalTime-finalOffset),finalValues,'identical redraw preserves all final widget values')
            // Widget renderDone does not acknowledge native video seeking/presentation.
            // A paused video may not issue another video-frame callback, so wait for
            // its native state synchronously, then allow two animation frames.
            const mediaState = target => target.locator('video').evaluate(video => ({ currentTime: video.currentTime, paused: video.paused, seeking: video.seeking, readyState: video.readyState }))
            const beforeMedia = await Promise.all([page, old].map(mediaState))
            for (const target of [page, old]) {
                await target.waitForFunction(time => {
                    const video = document.querySelector('video')
                    return video.paused && !video.seeking && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && Math.abs(video.currentTime - time) < 1e-6
                }, finalTime, { timeout: 5000 })
                await target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
            }
            console.log('pixel media readiness', { mode, prefix, before: beforeMedia, after: await Promise.all([page, old].map(mediaState)) })
            // Settled dimensions and pixels must match the same legacy widget documents.
            const actualFrames = page.locator('#dashboard iframe'), legacyFrames = old.locator('#dashboard iframe')
            for (let index=0;index<4;index++) {
                const a=await actualFrames.nth(index).boundingBox(), b=await legacyFrames.nth(index).boundingBox()
                assert.ok(Math.abs(a.width-b.width)<=.5 && Math.abs(a.height-b.height)<=.5,'iframe geometry rounding tolerance')
                const ai=await actualFrames.nth(index).screenshot(),bi=await legacyFrames.nth(index).screenshot()
                const pixels = await comparePixels(page, ai, bi)
                const sameDimensions = pixels.dimensions[0].width === pixels.dimensions[1].width && pixels.dimensions[0].height === pixels.dimensions[1].height
                if (!sameDimensions || pixels.maximum > 6 || pixels.changed > 8) {
                    const artifactRoot = process.env.WEBTOOLS_BROWSER_ARTIFACTS || tmpdir()
                    await mkdir(artifactRoot, { recursive: true })
                    const directory = await mkdtemp(resolve(artifactRoot, `video-pixels-${mode}-${prefix === '/' ? 'root' : 'prefix'}-${index}-`))
                    const geometry = async frame => frame.evaluate(element => {
                        const ancestors = []
                        for (let current = element; current; current = current.parentElement) {
                            const style = getComputedStyle(current)
                            ancestors.push({ tag: current.tagName, id: current.id, className: current.className, rect: current.getBoundingClientRect().toJSON(), background: style.background, borderRadius: style.borderRadius, border: style.border, transform: style.transform })
                        }
                        const video = document.querySelector('video')
                        const media = video ? { currentTime: video.currentTime, seeking: video.seeking, readyState: video.readyState, rect: video.getBoundingClientRect().toJSON() } : null
                        return { devicePixelRatio, ancestors, media }
                    })
                    const diagnostic = { actualBox: a, expectedBox: b, actual: await geometry(actualFrames.nth(index)), expected: await geometry(legacyFrames.nth(index)), ...pixels }
                    await Promise.all([writeFile(`${directory}/actual.png`, ai), writeFile(`${directory}/expected.png`, bi), writeFile(`${directory}/diagnostic.json`, JSON.stringify(diagnostic, null, 2))])
                    console.log('pixel mismatch artifacts', directory, JSON.stringify(diagnostic))
                }
                assert.deepEqual(pixels.dimensions[0], pixels.dimensions[1], `iframe ${index}: decoded screenshot dimensions`)
                assert.ok(pixels.maximum <= 6 && pixels.changed <= 8, `iframe ${index}: ${JSON.stringify(pixels)} exceeds border antialias tolerance`)
            }
            const download = page.waitForEvent('download'); await page.getByRole('button',{name:'Save layout',exact:true}).click()
            const saved = await download, savedBytes = await readFile(await saved.path(),'utf8')
            const expectedBytes = await old.evaluate(() => JSON.stringify(get_layout(),null,2))
            assert.equal(savedBytes,expectedBytes)
            await replace(page,JSON.parse(savedBytes))
            await replace(page,{...layout,widgets:{0:{...scripted,w:'1',h:'1'}}})
            await page.locator('#dashboard > .grid-stack-item').first().press('Enter')
            await page.getByRole('region',{name:'Widget settings'}).waitFor()
            await page.getByLabel('Column',{exact:true}).fill('1')
            await page.getByRole('button',{name:'Close widget settings'}).click()
            await page.waitForFunction(()=>document.getAnimations().every(animation=>animation.playState!=='running'))
            const target = page.locator('#dashboard > .grid-stack-item').first(); await target.scrollIntoViewIfNeeded(); const box = await target.boundingBox(); const beforePosition = await target.getAttribute('gs-x')
            await page.mouse.move(box.x+15,box.y+15);await page.mouse.down();await page.mouse.move(box.x+200,box.y+100,{steps:12});await page.waitForFunction(before=>document.querySelector('#dashboard > .grid-stack-item').gridstackNode?.x!==Number(before),beforePosition,{timeout:3000});await page.mouse.up()
            assert.notEqual(await target.getAttribute('gs-x'),beforePosition,'real pointer drag changes column');await target.press('Enter');await page.getByRole('button',{name:'Edit source and form'}).click()
            await page.getByRole('button',{name:'Apply and close'}).waitFor({state:'visible'})
            await page.waitForFunction(() => !document.querySelector('.source-editor button:nth-last-child(2)').disabled)
            await page.getByRole('button',{name:'Cancel',exact:true}).click()
            await page.getByRole('button',{name:'Close widget settings'}).click()
            await replace(page, {...layout, widgets:{0:{...scripted,w:'1',h:'1'}}})
            await page.locator('.palette-grid[data-ready=true]').waitFor()
            await page.getByText('Add with keyboard',{exact:true}).click()
            const count=await page.locator('#dashboard > .grid-stack-item').count()
            await page.getByRole('button',{name:'Sandbox',exact:true}).click()
            await page.waitForFunction(count=>document.querySelectorAll('#dashboard > .grid-stack-item').length===count+1,count)
            const preview=page.getByLabel('Preview Sandbox',{exact:true});await preview.scrollIntoViewIfNeeded()
            const from=await preview.boundingBox(),to=await page.locator('#dashboard').boundingBox()
            await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width*.7,to.y+to.height-60,{steps:20});await page.mouse.up()
            await page.waitForFunction(count=>document.querySelectorAll('#dashboard > .grid-stack-item').length===count+2,count)
            await page.locator('.palette-grid[data-ready=true]').waitFor();assert.equal(await page.locator('.palette-grid > .grid-stack-item').count(),7)
            const hanging={...custom,x:'0',y:'0',w:'3',h:'3',options:{...custom.options,custom_HTML:'<!doctype html><html><body><output>deferred</output><script>addEventListener("message",e=>{if("time" in e.data){/* Deliberately omit the reply while this document is replaced. */}})</script></body></html>'}}
            await replace(page,{...layout,widgets:{0:hanging}})
            await page.locator('#dashboard > .grid-stack-item').first().press('Enter')
            await page.getByRole('button',{name:'Edit source and form'}).click()
            await page.getByRole('button',{name:'Apply and close'}).waitFor()
            const source=page.locator('.code-editor .view-line').first();await source.waitFor();await source.click();await page.keyboard.press('ControlOrMeta+a')
            await page.keyboard.insertText('<!doctype html><html><body><output id="replacement">ready</output><script>addEventListener("message",e=>{if("time" in e.data){document.querySelector("#replacement").textContent=String(e.data.time);e.source.postMessage("renderDone","*")}})</script></body></html>')
            await page.getByRole('button',{name:'Apply and close'}).click()
            const synchronized=await page.locator('video').evaluate(video=>video.currentTime)-Number(await page.getByLabel('Log offset',{exact:true}).inputValue())
            await page.locator('#dashboard iframe').first().contentFrame().getByText(String(synchronized),{exact:true}).waitFor({timeout:3000})
            assert.equal(await page.evaluate(()=>window.monaco.editor.getModels().length),0)
            await page.getByRole('button',{name:'Close widget settings'}).click()
            await page.getByRole('button',{name:'🔊',exact:true}).click();await page.getByLabel('Volume',{exact:true}).fill('0.2');await page.getByLabel('Speed',{exact:true}).selectOption('2')
            let cacheUrls
            for (let attempt=0;attempt<3;attempt++) {
                await page.getByRole('button',{name:'Close preview'}).click()
                assert.equal(await page.locator('#dashboard iframe').count(),0)
                cacheUrls = await assertClosed(page, cacheUrls)
                await page.getByRole('button',{name:'Open preview'}).click();await page.locator('#dashboard[data-ready=true]').waitFor()
                assert.deepEqual(await page.locator('video').evaluate(video=>[video.muted,video.volume,video.playbackRate]),[true,.2,2])
                await page.getByLabel('Video file',{exact:true}).setInputFiles({name:'again.webm',mimeType:'video/webm',buffer:video})
                await page.waitForFunction(() => Number.isFinite(document.querySelector('video').duration))
            }
            await page.getByRole('button',{name:'Close preview'}).click()
            cacheUrls = await assertClosed(page, cacheUrls)
            for (const path of ['missing','Widgets/missing.html']) assert.equal((await context.request.get(server.origin+prefix+'VideoOverlayPreview/'+path)).status(),404)
            assert.equal((await context.request.get(server.origin+prefix+'modules/JsDataflashParser/parser.js')).status(),200)
            const allowed = 'Failed to fetch dynamically imported module: https://unpkg.com/flight-indicators-js@1.0.5/esm/module-flight-indicators.mjs'
            assert.deepEqual(errors.filter(error => !error.includes(allowed)),[])
            assert.ok(blocked.every(url=>url.includes('flight-indicators-js@1.0.5') || url.includes('fonts.cdnfonts.com')))
            console.log(`${mode} ${prefix}: both known logs, 24 timestamp/offset pairs, exact saved JSON, real media/editor/pointer/keyboard and repeated cleanup passed`)
        } finally { await context.close();await browser.close();await server.close();await legacy.close() }
    })
}
