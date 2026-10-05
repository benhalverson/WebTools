const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../..');
const comparisonRevision = '6cd6a978dbe6e93709fb2e468f9b9085c3a7f7ce';
const application = process.env.HARDWARE_REPORT_ROUTE || 'HardwareReport';
const sections = ['warnings', 'VER', 'FC', 'WDOG', 'InternalError', 'IOMCU', 'INS', 'COMPASS', 'BARO', 'GPS', 'ARSPD', 'DroneCAN', 'ParameterChanges', 'WAYPOINTS', 'FILES', 'DataRates', 'LOGSTATS'];
const plotIds = ['POS_OFFSETS', 'Temperature', 'Board_Voltage', 'power_flags', 'performance_load', 'performance_mem', 'performance_time', 'stack_mem', 'stack_pct', 'log_dropped', 'log_buffer', 'log_stats', 'clock_drift'];

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

/** Starts the gateway or independent application, rejecting early exits with captured diagnostics. */
async function startServer(mode, base, independent = false) {
    const { listeningOrigin } = await import('@webtools/routing/tooling');
    const args = independent
        ? ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', '0']
        : ['tooling/serve.ts', mode, '--port', '0'];
    const child = spawn(process.execPath, args, {
        cwd: independent ? path.join(root, 'apps/hardware-report') : root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WEBTOOLS_BASE_PATH: base, PORTAL_BASE_PATH: base, BROWSER: 'none' },
    });
    let output = '';
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Gateway startup timeout:\n' + output)), 60000);
            /** Parses the gateway readiness URL from complete output chunks. */
            const read = chunk => {
                output += chunk.toString();
                const origin = listeningOrigin(output);
                if (origin) { clearTimeout(timer); resolve(origin); }
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

/** Adds deterministic extraction records using the authoritative fixture's own FMT schemas. */
function extractionFixture(source) {
    const formats = new Map();
    for (let offset = 0; offset <= source.length - 89; offset++) {
        if (source[offset] === 0xa3 && source[offset+1] === 0x95 && source[offset+2] === 0x80) {
            const text = (start,length) => source.subarray(offset+start,offset+start+length).toString('latin1').split('\0')[0];
            formats.set(text(5,4), {type:source[offset+3],length:source[offset+4],format:text(9,16),fields:text(25,64).split(',')});
        }
    }
    /** Encodes raw wire fields; the real parser remains responsible for scaling and interpretation. */
    function record(name, values) {
        const schema = formats.get(name);
        assert.ok(schema, `fixture FMT ${name}`);
        const bytes = Buffer.alloc(schema.length);
        bytes.set([0xa3,0x95,schema.type]);
        let offset = 3;
        [...schema.format].forEach((type,index) => {
            const value = values[schema.fields[index]] ?? 0;
            if (type === 'Q') { bytes.writeBigUInt64LE(BigInt(value),offset); offset += 8; }
            else if (type === 'H') { bytes.writeUInt16LE(value,offset); offset += 2; }
            else if (type === 'h') { bytes.writeInt16LE(value,offset); offset += 2; }
            else if (type === 'B') bytes.writeUInt8(value,offset++);
            else if (type === 'I') { bytes.writeUInt32LE(value,offset); offset += 4; }
            else if (type === 'L') { bytes.writeInt32LE(value,offset); offset += 4; }
            else if (type === 'f') { bytes.writeFloatLE(value,offset); offset += 4; }
            else if (type === 'N') { bytes.write(String(value),offset,16,'latin1'); offset += 16; }
            else if (type === 'Z') { bytes.set(value,offset); offset += 64; }
            else throw new Error(`Unsupported fixture field ${type}`);
        });
        assert.equal(offset,schema.length);
        return bytes;
    }
    const location = {TimeUS:60000000,Lat:-351234567,Lng:1491234567};
    return Buffer.concat([source,
        record('PARM',{TimeUS:60000000,Name:'TEST_CHANGED',Value:2,Default:1}),
        record('PARM',{TimeUS:61000000,Name:'TEST_CHANGED',Value:3,Default:1}),
        record('CMD',{...location,CTot:2,CNum:0,CId:16,Prm1:1.25,Prm4:90,Alt:12.25,Frame:3}),
        record('CMD',{...location,CTot:2,CNum:1,CId:21,Alt:0.125,Frame:3}),
        record('FNCE',{...location,Tot:1,Seq:0,Type:98,Count:3,Radius:13.25}),
        record('RALY',{...location,Tot:1,Seq:0,Alt:-12,Flags:4}),
        record('FILE',{FileName:'crash_dump.bin',Offset:12,Length:4,Data:[0,128,255,0]}),
        record('FILE',{FileName:'script.lua',Offset:0,Length:2,Data:[65,10]}),
        record('FILE',{FileName:'crash_dump.bin',Offset:0,Length:4,Data:[1,0,2,0]}),
    ]);
}

/** Loads owned oracle sources from the actual branch base, never the implementation under test. */
function legacySources() {
    const files = execFileSync('git', ['ls-tree', '-r', '--name-only', comparisonRevision, 'HardwareReport', 'Libraries'], { cwd: root }).toString().trim().split('\n');
    return Object.fromEntries(files.map(file => [file, execFileSync('git', ['show', `${comparisonRevision}:${file}`], { cwd: root })]));
}

/** Mocks GitHub metadata deterministically and prevents any live provider request. */
async function isolateNetwork(context, origin) {
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        if (url.hostname === 'esm.sh' && url.pathname === '/@octokit/request') {
            return route.fulfill({ contentType: 'text/javascript', body: `export async function request(route, options = {}) {
                let path = route.replace(/^GET /,'').replace(/:([a-z_]+)/g,(_,name)=>options[name]).replace(/\\{([a-z_]+)\\}/g,(_,name)=>options[name]);
                const response = await fetch(path.startsWith('https://') ? path : 'https://api.github.com'+path,{headers:options.headers,signal:options.request?.signal});
                if (!response.ok) throw {status:response.status,response:{headers:Object.fromEntries(response.headers)}};
                return {data:await response.json(),status:response.status};
            }` });
        }
        if (url.hostname === 'api.github.com') {
            const data = url.pathname.includes('refs/tags') ? [{ref:'refs/tags/Plane-4.6.2',object:{sha:'1ebd4d99'+'0'.repeat(32)}}]
                : url.pathname.includes('branches-where-head') ? []
                : {sha:'0123456789012345678901234567890123456789',html_url:'https://github.com/ArduPilot/ardupilot/commit/test'};
            return route.fulfill({ json: data });
        }
        return route.abort();
    });
}

/** Waits for the scheduled file read, parser and React/Plotly update to finish. */
async function settled(page) {
    await page.locator('#loading').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('#LOGSTATS')?.textContent.trim().length > 0);
    await page.waitForFunction(() => {
        const nodes = [...document.querySelectorAll('[id]')].filter(node => ['log_stats'].includes(node.id));
        return nodes.every(node => node.matches('.js-plotly-plot') || node.querySelector('.js-plotly-plot'));
    });
}

/** Loads a real binary File through the same native input users operate. */
async function loadLog(page, fixture) {
    await page.locator('#fileItem').setInputFiles(fixture);
    await settled(page);
}

/** Records section text, public links, control choices and stable Plotly inputs. */
async function snapshot(page) {
    await page.waitForFunction(() => { const text = document.querySelector('#FC')?.textContent || ''; return !text.includes('Board ID: 1054') || text.includes('MatekF405_TE'); });
    await page.waitForFunction(() => { const text = document.querySelector('#VER')?.textContent || ''; return !text || /Official release:|Found commit:|Version check failed/.test(text); });
    return page.evaluate(({ sections, plotIds }) => {
        const report = Object.fromEntries(sections.map(id => {
            const node = document.getElementById(id);
            const element = node && !node.hidden ? node : null;
            return [id, { text: (id === 'DataRates' ? [...(element?.querySelectorAll('h4') || [])].map(heading => heading.textContent).join(' ') : element?.textContent || '').replace(/\s+/g, ' ').trim(),
                links: [...(element?.querySelectorAll('a:not([title="download file"])') || [])].map(link => ({text:link.textContent, href:link.getAttribute('href')})) }];
        }));
        const keys = ['x', 'y', 'z', 'u', 'v', 'w', 'labels', 'values', 'mode', 'type', 'name', 'meta', 'visible', 'hovertemplate'];
        const plots = Object.fromEntries(plotIds.map(id => {
            const container = document.getElementById(id);
            const plot = container?.matches('.js-plotly-plot') ? container : container?.querySelector('.js-plotly-plot');
            return [id, plot?.getBoundingClientRect().height ? {
                data: plot.data.map(trace => Object.fromEntries(keys.filter(key => key in trace).map(key => [key, trace[key]]))),
                dimensions: [plot.getBoundingClientRect().width,plot.getBoundingClientRect().height],
                axes: Object.fromEntries(['xaxis','yaxis','yaxis2'].filter(axis => axis in plot.layout).map(axis => [axis,{title:plot.layout[axis].title?.text || '',range:plot.layout[axis].range}]))
            } : null];
        }));
        plots.dataRates = [...document.querySelectorAll('#DataRates .js-plotly-plot')].map(plot => plot.data.map(trace => Object.fromEntries(keys.filter(key => key in trace).map(key => [key,trace[key]]))));
        return { report, plots, choices: [...document.querySelectorAll('#params input')].map(input => ({ id: input.id, checked: input.checked, disabled: input.disabled, title: input.title })) };
    }, { sections, plotIds });
}

/** Captures a user-triggered download as exact bytes, including BOM and line endings. */
async function captureDownload(page, locator) {
    const pending = page.waitForEvent('download');
    await locator.click();
    const item = await pending;
    return {name: item.suggestedFilename(), hex: (await fs.readFile(await item.path())).toString('hex')};
}

/** Exercises every available parameter selection and extracted mission/file download. */
async function downloads(page) {
    const results = [];
    const original = await page.locator('#params input[type="checkbox"]').evaluateAll(inputs => inputs.map(input => ({id:input.id,checked:input.checked,disabled:input.disabled})));
    for (const name of ['Save All Parameters', 'Save Changed Parameters', 'Save Minimal Parameters']) {
        const button = page.getByRole('button', { name, exact: true });
        if (await button.isVisible() && await button.isEnabled()) results.push(await captureDownload(page, button));
    }
    const changed = page.locator('#param_base_changed');
    if (await changed.isEnabled()) {
        await changed.check();
        results.push(await captureDownload(page, page.getByRole('button', {name:'Save Minimal Parameters',exact:true})));
        await page.locator('#param_base_all').check();
    }
    for (const checkbox of await page.locator('#params input[type="checkbox"]:enabled').all()) await checkbox.check();
    if (await page.getByRole('button', {name:'Save Minimal Parameters',exact:true}).isVisible()) {
        results.push(await captureDownload(page, page.getByRole('button', {name:'Save Minimal Parameters',exact:true})));
    }
    for (const link of await page.locator('#WAYPOINTS a[title="download file"], #FILES a[title="download file"]').all()) results.push(await captureDownload(page, link));
    for (const choice of original.filter(choice => !choice.disabled)) await page.locator('#'+choice.id).setChecked(choice.checked);
    return results;
}

/** Executes the untouched legacy implementation against each authoritative binary fixture. */
async function oracle(context, origin, base, sources, fixtures) {
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.dismiss());
    await page.route('**/*', route => {
        const file = new URL(route.request().url()).pathname.slice(base.length).replace(/^HardwareReport\/$/, 'HardwareReport/index.html');
        return sources[file] ? route.fulfill({body:sources[file],contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'text/plain'}) : route.fallback();
    });
    try {
        const expected = [];
        for (const fixture of fixtures) {
            await page.goto(origin + base + 'HardwareReport/');
            await page.evaluate(() => Promise.allSettled(import_done));
            await loadLog(page, fixture);
            expected.push({snapshot:await snapshot(page), downloads:await downloads(page)});
        }
        return expected;
    } finally { await page.close(); }
}

/** Compare report strings and shapes exactly. Plot arithmetic and auto ranges permit
 * 1e-12 relative/absolute rounding, well below displayed precision; downloads remain byte-exact. */
function compare(actual, expected, location = 'report') {
    if (typeof expected === 'number' && typeof actual === 'number') {
        assert.ok(Object.is(actual, expected) || Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)), `${location}: ${actual} != ${expected}`);
    } else if (expected && typeof expected === 'object') {
        assert.deepEqual(Object.keys(actual || {}), Object.keys(expected), `${location} keys`);
        for (const key of Object.keys(expected)) compare(actual[key], expected[key], `${location}.${key}`);
    } else assert.deepEqual(actual, expected, location);
}

/** Proves pending binary reads cannot overwrite reset or a newer user selection. */
async function interruptedReads(page, fixtures, expected) {
    await page.evaluate(() => {
        const original = File.prototype.arrayBuffer;
        window.restoreBinaryRead = () => { File.prototype.arrayBuffer = original; };
        File.prototype.arrayBuffer = function () {
            if (this.name === 'held.bin') return new Promise(resolve => { window.releaseBinaryRead = () => original.call(this).then(resolve); });
            if (this.name === 'failed.bin') return Promise.reject(new Error('Simulated binary read failure'));
            return original.call(this);
        };
    });
    const held = {name:'held.bin',mimeType:'application/octet-stream',buffer:await fs.readFile(fixtures[0])};
    await page.locator('#fileItem').setInputFiles(held);
    await page.waitForFunction(() => typeof window.releaseBinaryRead === 'function');
    await page.getByRole('button', {name:'Reset',exact:true}).focus();
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.releaseBinaryRead());
    assert.equal(await page.locator('.js-plotly-plot').count(),0,'late binary read cannot resurrect reset plots');
    await page.evaluate(() => { window.releaseBinaryRead = undefined; });
    await page.locator('#fileItem').setInputFiles(held);
    await page.waitForFunction(() => typeof window.releaseBinaryRead === 'function');
    await loadLog(page,fixtures[1]);
    await page.evaluate(() => window.releaseBinaryRead());
    compare(await snapshot(page),expected[1].snapshot,'latest binary selection owns report');
    await page.locator('#fileItem').setInputFiles({...held,name:'failed.bin'});
    await page.getByRole('alert').waitFor();
    await page.evaluate(() => window.restoreBinaryRead());
    await loadLog(page,fixtures[0]);
    compare(await snapshot(page),expected[0].snapshot,'read-error recovery');
}

/** Exercises parser resource failure on a fresh mount and successful recovery after reload. */
async function parserFailure(context, origin, base, fixture) {
    const page = await context.newPage();
    try {
        await page.route('**/dataflash/vendor/parser.js', route => route.abort());
        await page.goto(origin+base+application+'/');
        await page.locator('#fileItem').setInputFiles(fixture);
        await page.getByRole('alert').waitFor();
        await page.unroute('**/dataflash/vendor/parser.js');
        await page.reload();
        await loadLog(page,fixture);
    } finally { await page.close(); }
}

/** Holds metadata across reset, then verifies server errors and a recovered next mount. */
async function metadataLifecycle(context, origin, base, fixture) {
    const page = await context.newPage();
    let release;
    let observe;
    const held = new Promise(resolve => { release = resolve; });
    const requested = new Promise(resolve => { observe = resolve; });
    await page.route('https://api.github.com/**', async route => {
        observe();
        await held;
        await route.fulfill({json:[{ref:'refs/tags/stale-response',object:{sha:'1ebd4d99'+'0'.repeat(32)}}]}).catch(() => {});
    });
    try {
        await page.goto(origin+base+application+'/');
        await loadLog(page,fixture);
        await Promise.race([requested,new Promise((_,reject) => {
            const timer = setTimeout(() => reject(new Error('Firmware metadata request was not observed')),15000);
            requested.then(() => clearTimeout(timer));
        })]);
        await page.getByRole('button',{name:'Reset',exact:true}).click();
        release();
        assert.equal(await page.locator('#VER').count(),0,'late firmware response cannot restore reset content');
        await page.unroute('https://api.github.com/**');
        await page.route('https://api.github.com/**',route => route.fulfill({status:500,json:{message:'mock metadata failure'}}));
        await loadLog(page,fixture);
        await page.waitForFunction(() => document.querySelector('#VER')?.textContent.includes('Version check failed'));
        await page.unroute('https://api.github.com/**');
        await page.getByRole('button',{name:'Reset',exact:true}).click();
        await loadLog(page,fixture);
        await page.waitForFunction(() => document.querySelector('#VER')?.textContent.includes('Official release:'));
    } finally { release(); await page.close(); }
}

/** Preserves the optional-module offline behavior without contacting GitHub. */
async function offlineMetadata(context, origin, base, fixture) {
    const page = await context.newPage();
    let requests = 0;
    await page.route('https://esm.sh/@octokit/request',route => route.abort());
    await page.route('https://api.github.com/**',route => { requests++; return route.abort(); });
    try {
        await page.goto(origin+base+application+'/');
        await loadLog(page,fixture);
        await page.waitForFunction(() => document.querySelector('#VER')?.textContent.includes('Version check failed, offline'));
        assert.equal(requests,0,'missing optional module makes no provider requests');
    } finally { await page.close(); }
}

/** Transfers selected bytes to real popup windows while serving only local mock destinations. */
async function outboundOpenIn(context, page, fixture) {
    const expected = [...await fs.readFile(fixture)];
    await context.addInitScript(() => {
        window.receivedTransfer = undefined;
        window.addEventListener('message', async event => {
            if (event.data?.type === 'file') window.receivedTransfer = {type:'file',bytes:[...new Uint8Array(await event.data.data.arrayBuffer())]};
            if (event.data?.type === 'arrayBuffer') window.receivedTransfer = {type:'arrayBuffer',bytes:[...new Uint8Array(event.data.data)]};
        });
    });
    const routes = ['**/MAGFit','https://plotbeta.ardupilot.org/**'];
    for (const pattern of routes) await context.route(pattern,route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Local Open In transport receiver</title>'}));
    try {
        for (const [destination,type] of [['MAGFit','file'],['UAV Log Viewer','arrayBuffer']]) {
            if (await page.locator('#OpenIn').getAttribute('aria-expanded') !== 'true') await page.locator('#OpenIn').click();
            const pending = page.waitForEvent('popup');
            await page.getByRole('button',{name:destination,exact:true}).click();
            const popup = await pending;
            try {
                await popup.waitForFunction(() => window.receivedTransfer !== undefined);
                assert.equal(popup.url(),type === 'file' ? new URL('../MAGFit',page.url()).href : 'https://plotbeta.ardupilot.org/#','public Open In destination retains the hosting prefix');
                assert.deepEqual(await popup.evaluate(() => window.receivedTransfer),{type,bytes:expected});
            } finally { await popup.close(); }
        }
    } finally { for (const pattern of routes) await context.unroute(pattern); }
}

/** Validates binary ingress, exact exports, repeated replacement and public asset boundaries. */
async function workflow(context, origin, base, fixtures, expected) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && message.text().includes('Encountered two children')) errors.push(message.text()); });
    page.on('dialog', dialog => dialog.dismiss());
    try {
        await page.goto(origin + base + application + '/');
        for (let index = 0; index < fixtures.length; index++) {
            await loadLog(page, fixtures[index]);
            compare(await snapshot(page), expected[index].snapshot);
            assert.deepEqual(await downloads(page), expected[index].downloads, 'all downloaded bytes match actual branch-base implementation');
        }
        assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname.endsWith('/HardwareReport.js'))),false,'React owns the log workflow without loading the old owned page script');
        await page.evaluate(() => {
            window.logPlotsBeforeReset = [...document.querySelectorAll('.js-plotly-plot')];
            window.purgedLogPlots = [];
            const purge = window.Plotly.purge;
            window.Plotly.purge = function (element) { window.purgedLogPlots.push(element); return purge.call(this,element); };
        });
        await page.getByRole('button', {name:'Reset',exact:true}).click();
        await page.waitForFunction(() => window.logPlotsBeforeReset.every(plot => window.purgedLogPlots.includes(plot) && !plot.isConnected));
        assert.equal(await page.locator('.js-plotly-plot').count(), 0, 'reset releases every plot');
        for (const type of ['file', 'arrayBuffer']) {
            await page.evaluate(async ({bytes,type}) => {
                const data = new Uint8Array(bytes);
                window.postMessage({type,data:type === 'file' ? new File([data],'open-in.bin') : data.buffer}, location.origin);
            }, {bytes:[...await fs.readFile(fixtures[0])],type});
            await settled(page);
            compare(await snapshot(page), expected[0].snapshot);
            await page.getByRole('button', {name:'Reset',exact:true}).click();
        }
        for (let iteration = 0; iteration < 2; iteration++) {
            await loadLog(page, fixtures[0]);
            await page.getByRole('button', {name:'Reset',exact:true}).click();
            assert.equal(await page.locator('.js-plotly-plot').count(), 0);
        }
        await interruptedReads(page,fixtures,expected);
        await outboundOpenIn(context,page,fixtures[0]);
        assert.deepEqual(errors, [], 'no unhandled application errors');
        const directory = await context.request.get(origin+base+application+'?report=local',{maxRedirects:0});
        assert.equal(directory.status(),308,'bare public directory redirects');
        assert.equal(new URL(directory.headers().location,origin).href,origin+base+application+'/?report=local','directory redirect retains query and hosting prefix');
        const index = await context.request.get(origin+base+application+'/index.html');
        assert.equal(index.status(),200,'explicit document route');
        assert.match(await index.text(),/id="root"/,'secondary document serves the React application');
        const boards = await context.request.get(origin+base+application+'/board_types.txt');
        assert.equal(boards.status(),200,'checked-in board metadata asset');
        assert.deepEqual(await boards.body(),execFileSync('git',['show',`${comparisonRevision}:HardwareReport/board_types.txt`],{cwd:root}),'board metadata bytes unchanged from comparison revision');
        for (const suffix of ['missing', 'assets/missing.js']) assert.equal((await context.request.get(origin+base+application+'/'+suffix)).status(),404);
        if (base !== '/') assert.equal((await context.request.get(origin+'/'+application+'/')).status(),404);
    } catch (error) { console.error('Application browser failure', {errors, url:page.url(), body:(await page.locator('body').innerText()).slice(0,2000)}); throw error; } finally { await page.close(); }
}

test('HardwareReport binary workflows match actual branch-base legacy in Chromium', {timeout:1200000}, async t => {
    const sources = legacySources();
    const temporary = await fs.mkdtemp('/tmp/hardware-browser-fixtures-');
    const plane = path.join(root,'packages/dataflash/fixtures/plane-4.6.2-prefix.BIN');
    const synthetic = path.join(temporary,'extractions.bin');
    await fs.writeFile(synthetic,extractionFixture(await fs.readFile(plane)));
    const fixtures = [plane,synthetic];
    const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || undefined,args:['--enable-unsafe-swiftshader']});
    try {
        for (const base of (process.env.HARDWARE_TEST_BASE ? [process.env.HARDWARE_TEST_BASE] : ['/Tools/WebTools/','/'])) {
            if (!process.env.HARDWARE_SKIP_BUILD) await build(base);
            for (const mode of (process.env.HARDWARE_TEST_MODE ? [process.env.HARDWARE_TEST_MODE] : ['dev','preview'])) {
                await t.test(`${mode} ${base}`, {timeout:300000}, async () => {
                    const server = await startServer(mode,base);
                    const context = await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:1000}});
                    context.setDefaultTimeout(30000);
                    await isolateNetwork(context,server.origin);
                    try {
                        console.info(`Legacy oracle: ${mode} ${base}`);
                        const expected = await oracle(context,server.origin,base,sources,fixtures);
                        console.info(`Gateway workflows: ${mode} ${base}`);
                        await workflow(context,server.origin,base,fixtures,expected);
                        console.info(`Resource lifecycle: ${mode} ${base}`);
                        await parserFailure(context,server.origin,base,fixtures[0]);
                        await metadataLifecycle(context,server.origin,base,fixtures[1]);
                        await offlineMetadata(context,server.origin,base,fixtures[0]);
                        console.info(`Independent workflows: ${mode} ${base}`);
                        const independent = await startServer(mode,base,true);
                        const directContext = await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:1000}});
                        directContext.setDefaultTimeout(30000);
                        await isolateNetwork(directContext,independent.origin);
                        try { await workflow(directContext,independent.origin,base,fixtures,expected); }
                        finally { await directContext.close(); await independent.stop(); }
                    } finally { await context.close(); await server.stop(); }
                });
            }
        }
    } finally { await browser.close(); await fs.rm(temporary,{recursive:true,force:true}); }
});
