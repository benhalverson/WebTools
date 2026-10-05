const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../..');
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

/** Starts the same-origin gateway and rejects early exits with captured diagnostics. */
async function startServer(mode, base) {
    const child = spawn(process.execPath, ['tooling/serve.ts', mode, '--port', '0'], {
        cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WEBTOOLS_BASE_PATH: base, PORTAL_BASE_PATH: base, BROWSER: 'none' },
    });
    let output = '';
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Gateway startup timeout:\n' + output)), 60000);
            /** Parses the gateway readiness URL from complete output chunks. */
            const read = chunk => {
                output += chunk.toString();
                const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
                if (match) { clearTimeout(timer); resolve(match[0]); }
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

const defaults = require('../src/defaults.json');
const controls = require('../src/graph-controls.json');
const revision = '0f4607db3dccbc7d06e5847c02465dab38d1eb80';

/** Execute unchanged FilterTool source at the actual branch base with recorded controls. */
function legacySnapshot(params, axis = 'Roll') {
    const elements = Object.fromEntries(Object.entries(params).map(([id, value]) => [id, { value }]));
    for (const control of controls) elements[control.id] = { ...control, checked: params[control.name] === control.value };
    elements.PID_title = {};
    const context = vm.createContext({
        document: { cookie: '', forms: { params: { getElementsByTagName: () => [] }, PID_params: { getElementsByTagName: () => [] } }, getElementById: id => elements[id] },
        window: { location: { href: 'http://legacy/' } }, performance, console: { log() {} },
        Plotly: { newPlot() {}, purge() {}, redraw() {} }, link_plot_axis_range() {},
    });
    for (const file of ['Libraries/Array_Math.js', 'FilterTool/filters.js']) vm.runInContext(execFileSync('git', ['show', `${revision}:${file}`], { cwd: root, encoding: 'utf8' }), context);
    vm.runInContext(`load(); calculate_filter(); calculate_pid('Calculate${axis}')`, context);
    return vm.runInContext('({gyro:Bode,pid:BodePID})', context);
}

/** Compare every finite plotted sample with relative tolerance for floating roundoff. */
function compare(actual, expected) {
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
        if (!Number.isFinite(expected[i])) assert.equal(actual[i], expected[i]);
        else assert.ok(Math.abs(actual[i] - expected[i]) <= 2e-11 * Math.max(1, Math.abs(expected[i])), `sample ${i}: ${actual[i]} != ${expected[i]}`);
    }
}

/** Await settled vendor traces and compare them with the independent page implementation. */
async function checkPlot(page, id, expected) {
    await page.waitForFunction(({ id, length, index, sample }) => {
        const plot = document.querySelector(`#${id} .js-plotly-plot`);
        const value = plot?.data?.[0]?.y?.[index];
        return plot?.data?.[0]?.y?.length === length && (Object.is(value, sample) || Math.abs(value - sample) <= 2e-11 * Math.max(1, Math.abs(sample)));
    }, { id, length: expected.data[0].y.length, index: Math.floor(expected.data[0].y.length / 3), sample: expected.data[0].y[Math.floor(expected.data[0].y.length / 3)] });
    const actual = await page.locator(`#${id} .js-plotly-plot`).evaluate(plot => ({ data: plot.data, layout: plot.layout, dimensions: [plot.getBoundingClientRect().width, plot.getBoundingClientRect().height] }));
    assert.deepEqual(actual.dimensions, [1200, 900]);
    assert.equal(actual.data.length, expected.data.length);
    expected.data.forEach((trace, index) => {
        assert.equal(actual.data[index].name, trace.name);
        assert.equal(actual.data[index].visible, trace.visible ?? true);
        if (trace.y) { compare(actual.data[index].x, trace.x); compare(actual.data[index].y, trace.y); }
        assert.equal(actual.data[index].hovertemplate, trace.hovertemplate);
    });
    assert.equal(actual.layout.showlegend, expected.layout.showlegend);
    for (const key of ['xaxis','xaxis2']) assert.equal(actual.layout[key].type, expected.layout[key].type);
    for (const key of ['xaxis2','yaxis','yaxis2']) assert.equal(actual.layout[key].title.text, expected.layout[key].title.text);
}

/** Verify retained public bytes, explicit misses and canonical redirects on each Worker. */
async function routes(context, origin, base) {
    const redirect = await context.request.get(origin + base + 'FilterTool?q=1', { maxRedirects: 0 });
    assert.equal(redirect.status(), 308);
    assert.equal(new URL(redirect.headers().location, origin).pathname, base + 'FilterTool/');
    for (const file of ['params.json','filters.js','Readme.md']) {
        const response = await context.request.get(origin + base + 'FilterTool/' + file);
        assert.equal(response.status(), 200);
        assert.deepEqual(await response.body(), await fs.readFile(path.join(root,'FilterTool',file)));
    }
    for (const file of ['FilterTool/missing', 'FilterTool/assets/missing.js', 'FilterTool/src/missing.ts', 'FilterToolish/']) assert.equal((await context.request.get(origin + base + file)).status(), 404);
    if (base !== '/') assert.equal((await context.request.get(origin + '/FilterTool/')).status(), 404);
}

/** Exercise actual edits, graph calculation, imports, downloads and repeated plot disposal. */
async function controlsAndFiles(page, context, origin, base) {
    const params = { ...defaults };
    await page.goto(origin + base + 'FilterTool/');
    await checkPlot(page, 'Bode', legacySnapshot(params).gyro);
    await checkPlot(page, 'BodePID', legacySnapshot(params).pid);
    assert.equal(await page.locator('#INS_HNTCH_FREQ').isDisabled(), true);
    assert.equal(await page.locator('#INS_GYRO_FILTER').getAttribute('step'),'0.1');
    assert.equal(await page.locator('#ATC_RAT_RLL_D').getAttribute('step'),'0.0001');
    await page.evaluate(() => window.Plotly.relayout(document.querySelector('#Bode .js-plotly-plot'), { 'xaxis.range': [0, 2], 'xaxis2.range': [0, 2], 'yaxis.range': [-40, 0], 'yaxis2.range': [-50, 0] }));
    await page.locator('#INS_GYRO_FILTER').fill('30'); params.INS_GYRO_FILTER = '30';
    await page.locator('#calculate').click();
    await checkPlot(page, 'Bode', legacySnapshot(params).gyro);
    assert.deepEqual(await page.locator('#Bode .js-plotly-plot').evaluate(plot => [plot.layout.xaxis.range, plot.layout.xaxis2.range, plot.layout.yaxis.range]), [[0, 2], [0, 2], [-40, 0]], 'recalculation retains legacy frequency and magnitude zoom');
    assert.equal(await page.locator('#Bode .js-plotly-plot').evaluate(plot => plot.layout.yaxis2.autorange), true, 'unwrapped phase resets to autorange as in legacy');
    await page.locator('#INS_HNTCH_ENABLE').selectOption('1'); params.INS_HNTCH_ENABLE = '1';
    await page.locator('#INS_HNTCH_MODE').selectOption('3'); params.INS_HNTCH_MODE = '3';
    assert.equal(await page.locator('#ESC_input').isVisible(), true);
    for (const [id, value] of Object.entries({ INS_HNTCH_FREQ: '83', INS_HNTCH_BW: '40', INS_HNTCH_ATT: '40', INS_HNTCH_REF: '1', INS_HNTCH_HMNCS: '255', INS_HNTCH_OPTS: '18', NUM_MOTORS: '4' })) {
        await page.locator('#' + id).fill(value); params[id] = value;
    }
    await page.locator('#calculate').click();
    await checkPlot(page, 'Bode', legacySnapshot(params).gyro);
    for (const [id, name, value] of [['ShowComponents','ShowComponents','true'], ['ScaleLinear','Scale','Linear'], ['ScaleWrap','PhaseScale','wrap'], ['freq_Scale_RPM','feq_unit','RPM'], ['freq_ScaleLinear','feq_scale','Linear']]) {
        await page.locator('#' + id).check(); params[name] = value;
        await checkPlot(page,'Bode',legacySnapshot(params).gyro);
    }
    for (const [id, name, value] of [['PID_ShowComponents','PID_ShowComponents','true'], ['PID_filtering_Post','filtering','Post'], ['PID_ScaleLinear','PID_Scale','Linear'], ['PID_ScaleWrap','PID_PhaseScale','wrap'], ['PID_freq_Scale_RPM','PID_feq_unit','RPM']]) { await page.locator('#' + id).check(); params[name] = value; }
    await page.locator('#ATC_RAT_PIT_P').fill('0.17'); params.ATC_RAT_PIT_P = '0.17';
    await page.locator('#CalculatePitch').click();
    await checkPlot(page, 'BodePID', legacySnapshot(params,'Pitch').pid);
    const file = 'INS_GYRO_FILTER,33.123456789\nINS_HNTCH_MODE,1\nQ_A_RAT_YAW_P,0.25\n';
    await page.locator('#param_file').setInputFiles({ name: 'settings.param', mimeType: 'text/plain', buffer: Buffer.from(file) });
    Object.assign(params, { INS_GYRO_FILTER: '33.123456789', INS_HNTCH_MODE: '1', ATC_RAT_YAW_P: '0.25' });
    await checkPlot(page,'Bode',legacySnapshot(params).gyro);
    assert.equal(await page.locator('#Throttle_input').isVisible(), true);
    assert.equal(await page.locator('#ESC_input').isVisible(), false);
    const downloadEvent = page.waitForEvent('download'); await page.locator('#SaveParams').click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(),'filter.param');
    const actualText = await fs.readFile(await download.path(),'utf8');
    // Build exact expected serialization from the base's formatter and actual DOM order.
    const fields = await page.locator('#params input, #params select').evaluateAll(nodes => nodes.filter(node => node.id.startsWith('INS_')).map(node => ({ id: node.id, value: node.value, tag: node.tagName })));
    const oracle = vm.createContext({ fields });
    vm.runInContext(execFileSync('git',['show',`${revision}:Libraries/Param_Helpers.js`],{cwd:root,encoding:'utf8'}),oracle);
    const expectedText = vm.runInContext(`['INPUT','SELECT'].flatMap(tag=>fields.filter(field=>field.tag===tag)).map(field=>field.id+','+param_to_string(field.value)+'\\n').join('')`,oracle);
    assert.equal(actualText,expectedText);
    await context.grantPermissions(['clipboard-read','clipboard-write']);
    await page.locator('#GetLink').click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(new URL(link).searchParams.get('INS_HNTCH_FREQ'),'83');
    await page.goto(link);
    assert.equal(await page.locator('#INS_HNTCH_FREQ').inputValue(),'83');
    assert.equal(await page.locator('#INS_HNTCH_ENABLE').inputValue(),'0','legacy URL restore omits selects');
    for (let n=0;n<3;n++) { await page.locator('#reset').click(); await checkPlot(page,'Bode',legacySnapshot(defaults).gyro); await checkPlot(page,'BodePID',legacySnapshot(defaults).pid); assert.equal(await page.locator('.js-plotly-plot').count(),2); }
    // Inject a delayed File.text result to prove reset invalidates pending reads.
    await page.evaluate(() => { window.originalText = File.prototype.text; File.prototype.text = function() { return new Promise(resolve => { window.finishRead = resolve; }); }; });
    await page.locator('#param_file').setInputFiles({name:'late.param',mimeType:'text/plain',buffer:Buffer.from('INS_GYRO_FILTER,88')});
    await page.locator('#reset').click();
    await page.evaluate(() => { window.finishRead('INS_GYRO_FILTER,88'); File.prototype.text = window.originalText; });
    assert.equal(await page.locator('#INS_GYRO_FILTER').inputValue(),'20.0');
    // Unrelated edits survive a pending import that changes only one field.
    await page.evaluate(() => { File.prototype.text = function() { return new Promise(resolve => { window.finishRead = resolve; }); }; });
    await page.locator('#param_file').setInputFiles({name:'late.param',mimeType:'text/plain',buffer:Buffer.from('INS_GYRO_FILTER,30')});
    await page.locator('#ATC_RAT_RLL_P').fill('0.21');
    await page.evaluate(() => { window.finishRead('INS_GYRO_FILTER,30'); File.prototype.text = window.originalText; });
    await page.waitForFunction(() => document.getElementById('INS_GYRO_FILTER').value === '30');
    assert.equal(await page.locator('#ATC_RAT_RLL_P').inputValue(),'0.21');
    await page.evaluate(() => { File.prototype.text = async function() { throw new Error('Injected read failure'); }; });
    await page.locator('#param_file').setInputFiles({name:'error.param',mimeType:'text/plain',buffer:Buffer.from('')});
    await page.getByRole('alert').filter({hasText:'Injected read failure'}).waitFor();
    await page.evaluate(() => { File.prototype.text = window.originalText; });
    await page.locator('#INS_GYRO_FILTER').fill('37');
    await page.locator('#PID_filtering_Post').check();
    await page.locator('#ATC_RAT_PIT_P').fill('0.17');
    await page.locator('#CalculatePitch').click();
    await page.locator('#ATC_RAT_YAW_P').fill('0.19');
    await page.locator('#CalculateYaw').click();
    await page.reload();
    assert.equal(await page.locator('#INS_GYRO_FILTER').inputValue(),'37', 'Post PID calculation saves gyro fields');
    await page.locator('#reset').click();
    await page.reload();
    assert.equal(await page.locator('#ATC_RAT_PIT_P').inputValue(),defaults.ATC_RAT_PIT_P);
    assert.equal(await page.locator('#ATC_RAT_YAW_P').inputValue(),defaults.ATC_RAT_YAW_P);
    for (const token of ['+1','0x10','1.']) {
        await page.locator('#param_file').setInputFiles({name:'invalid.param',mimeType:'text/plain',buffer:Buffer.from('INS_GYRO_FILTER,'+token)});
        await page.waitForFunction(() => document.getElementById('INS_GYRO_FILTER').value === '');
        const native = await page.evaluate(token => { const input=document.createElement('input');input.type='number';input.value=token;return input.value; },token);
        assert.equal(await page.locator('#INS_GYRO_FILTER').inputValue(),native);
    }
    await page.reload();
    assert.equal(await page.locator('#INS_GYRO_FILTER').inputValue(),'','legacy NaN cookie restores a blank input');
    await page.locator('#reset').click();
    for (let n=0;n<2;n++) { await page.goto(origin+base); await page.goto(origin+base+'FilterTool/index.html'); await checkPlot(page,'Bode',legacySnapshot(defaults).gyro); }
    assert.ok((await page.evaluate(() => performance.getEntriesByType('resource').map(entry=>entry.name))).every(url=>!url.endsWith('/filters.js')), 'owned legacy script is never executed');
}

/** Verify missing and interrupted vendor loads without visiting any live provider. */
async function failureFlows(context,origin,base) {
    const page = await context.newPage();
    try {
        await page.route('**/vendor/plotly.min.js',route=>route.abort());
        await page.goto(origin+base+'FilterTool/');
        await page.getByRole('alert').filter({hasText:'Unable to load the plot library'}).waitFor();
        await page.unroute('**/vendor/plotly.min.js'); await page.reload();
        await checkPlot(page,'Bode',legacySnapshot(defaults).gyro);
        let release; const held = new Promise(resolve=>{release=resolve;});
        let requested; const observed = new Promise(resolve=>{requested=resolve;});
        await page.route('**/vendor/plotly.min.js',async route=>{requested();await held;await route.abort().catch(()=>{});});
        await page.goto(origin+base+'FilterTool/',{waitUntil:'commit'});
        await observed; await page.goto(origin+base,{waitUntil:'domcontentloaded'}); release();
    } finally { await page.close(); }
}

test('FilterTool actual Chromium dev and built Worker, root and common prefix', {timeout:600000}, async t=>{
    const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || undefined,args:['--enable-unsafe-swiftshader']});
    try {
        for (const base of ['/Tools/WebTools/','/']) {
            await build(base);
            for (const mode of ['dev','preview']) await t.test(`${mode} ${base}`,{timeout:120000},async()=>{
                const server=await startServer(mode,base);
                const context=await browser.newContext({viewport:{width:1280,height:1000}});
                context.setDefaultTimeout(15000);
                const errors=[]; context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
                await context.route('**/*',route=>new URL(route.request().url()).origin===server.origin?route.continue():route.abort());
                try { const page=await context.newPage(); await routes(context,server.origin,base); await controlsAndFiles(page,context,server.origin,base); await failureFlows(context,server.origin,base); assert.deepEqual(errors,[]); }
                catch(error) { console.error(error); throw error; }
                finally { await context.close(); await server.stop(); }
            });
        }
    } finally { await browser.close(); }
});
