const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { stripVTControlCharacters } = require('node:util');
const { chromium } = require('playwright');
const { fixture } = require('./fixture.cjs');
const root = path.resolve(__dirname,'../../..');
const baseline = '072046e49c5b0f77226d29e2de82b50772fa75c3';
const source = Object.fromEntries(['SysID/index.html','SysID/SysID.js','Libraries/Array_Math.js'].map(file => [file,execFileSync('git',['show',`${baseline}:${file}`],{ cwd:root })]));
const pythonAssets = require('../python-assets.json');
const cache = path.join(root,'apps/sysid/.python-cache');
const controlAsset = Object.keys(pythonAssets).find(name => name.startsWith('control-'));

/** Spawn an independent real Vite/Worker server and retain its process group for cleanup. */
async function start(mode, prefix) {
    const child = spawn(process.execPath,['node_modules/vite/bin/vite.js',...(mode === 'preview' ? ['preview'] : []),'--host','127.0.0.1','--port','0'],{ cwd:path.join(root,'apps/sysid'),env:{...process.env,SYSID_TEST_HARNESS:'1',WEBTOOLS_BASE_PATH:prefix,BROWSER:'none'},detached:true,stdio:['ignore','pipe','pipe'] });
    let output = '';
    const origin = await new Promise((resolve,reject) => {
        const timer = setTimeout(() => reject(new Error(output)),60000);
        /** Vite's listening origin signals real server readiness. */
        const read = bytes => { output = (output + bytes).slice(-65536); const match = stripVTControlCharacters(output).match(/http:\/\/127\.0\.0\.1:\d+(?=\/)/); if (match) { clearTimeout(timer); resolve(match[0]); } };
        child.stdout.on('data',read);child.stderr.on('data',read);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(new Error(`${code}: ${output}`));});
    });
    console.log('Started SysID',mode,prefix,origin);
    return { origin, output: () => output, async stop() { if (child.exitCode === null) { const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);process.kill(-child.pid,'SIGTERM');await once(child,'exit');clearTimeout(timer); } } };
}
/** Verify the wheel implicated by the prior timeout before observing its browser transfer. */
async function verifyMatplotlibWheel() {
    const name = 'matplotlib-3.5.2-cp312-cp312-pyodide_2024_0_wasm32.whl';
    for (const file of [path.join(cache,name),path.join(root,'apps/sysid/.legacy-assets/python',name)]) {
        const bytes = await fs.readFile(file);
        assert.equal(createHash('sha256').update(bytes).digest('hex'),pythonAssets[name].sha256,`pinned wheel bytes: ${file}`);
        console.log('Verified local matplotlib wheel', { file, bytes: bytes.length, sha256: pythonAssets[name].sha256 });
    }
}
/** Preserve Python phase output without letting a stalled renderer delay failure cleanup. */
async function boundedStdout(page) {
    let timer;
    try {
        return await Promise.race([
            page.locator('#output').inputValue({timeout:500}).then(value=>value.slice(-65536),error=>`Unavailable: ${error.message}`),
            new Promise(resolve=>{timer=setTimeout(()=>resolve('Unavailable: stdout diagnostic exceeded 500ms'),500);}),
        ]);
    } finally { clearTimeout(timer); }
}
/** Instrument the actual loader only to seed random optimizers and inspect Python resources; calculations stay real. */
function instrumentLoader(bytes, localBase) { return bytes.toString() + '\nconst originalLoader=loadPyodide;loadPyodide=async(...args)=>{const runtime=await originalLoader({indexURL:'+JSON.stringify(localBase)+',...args[0]});window.testRuntime=runtime;return runtime};'; }
/** Replay unchanged legacy assets at a separate URL and pinned release resources locally. Block all other external requests. */
async function resources(page, origin, base, legacy = false) {
    const requests = [], external = [];
    const started = performance.now(), timeline = [];
    /** Bound diagnostics and collect them on the Node side, without waiting on a stalled renderer. */
    function record(event, url, details = {}) {
        if (timeline.length < 500) timeline.push({ milliseconds: Math.round(performance.now()-started), event, url, ...details });
    }
    page.on('request', request => record('request',request.url()));
    page.on('response', response => record('response',response.url(),{status:response.status(),contentLength:response.headers()['content-length'] ?? null}));
    page.on('requestfailed', request => record('requestfailed',request.url(),{failure:request.failure()?.errorText}));
    page.on('requestfinished', request => {
        record('requestfinished',request.url());
        // Size retrieval is best-effort: never delay readiness or timeout reporting for it.
        void request.sizes().then(sizes=>record('receivedSizes',request.url(),sizes),error=>record('sizesUnavailable',request.url(),{error:String(error)}));
    });
    page.on('pageerror', error => record('pageerror',page.url(),{error:error.message}));
    page.on('console', message => { if(message.type()==='error')record('console',page.url(),{error:message.text()}); });
    await page.route('**/*',async route => {
        const url = new URL(route.request().url()); requests.push(url.href);
        const name = url.pathname.split('/').at(-1);
        if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/pyodide/v0.26.1/full/')) {
            assert.ok(name in pythonAssets,'undeclared Pyodide resource');
            const bytes = await fs.readFile(path.join(cache,name));
            assert.equal(createHash('sha256').update(bytes).digest('hex'),pythonAssets[name].sha256);
            if(pythonAssets[name].sha384)assert.equal(createHash('sha384').update(bytes).digest('hex'),pythonAssets[name].sha384);
            return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream',body:name==='pyodide.js'?instrumentLoader(bytes,origin+base+'python/'):bytes});
        }
        if (url.hostname === 'pypi.org' && url.pathname.replace(/\/$/,'') === '/simple/control') return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/vnd.pypi.simple.v1+json',body:await fs.readFile(path.join(__dirname,'control-index.json'))});
        if (url.hostname === 'pypi.org' && url.pathname === '/pypi/control/json') return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{ info:{ name:'control',version:'0.10.2',requires_dist:[] },releases:{ '0.10.2':[{filename:controlAsset,url:pythonAssets[controlAsset].url,digests:{sha256:pythonAssets[controlAsset].sha256},packagetype:'bdist_wheel'}] } }});
        if (url.href === pythonAssets[controlAsset].url) return route.fulfill({headers:{'access-control-allow-origin':'*'},body:await fs.readFile(path.join(cache,controlAsset))});
        if (url.origin !== origin) { external.push(url.href);return route.abort(); }
        if (name === 'pyodide.js') { const response = await route.fetch();return route.fulfill({response,body:instrumentLoader(await response.body(),origin+base+'python/')}); }
        if (legacy && url.pathname.startsWith('/legacy/')) {
            const file = url.pathname.slice('/legacy/'.length);
            if (file in source) return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':'text/html',body:source[file]});
            if (file === 'SysID/') return route.fulfill({contentType:'text/html',body:source['SysID/index.html']});
            const asset = file === 'modules/JsDataflashParser/parser.js' ? 'dataflash/vendor/parser.js' : file === 'modules/plotly.js/dist/plotly.min.js' ? 'vendor/plotly.min.js' : file.startsWith('modules/build/') ? 'python/'+name : file;
            const response = await page.request.get(origin+base+asset);return route.fulfill({response});
        }
        return route.continue();
    });
    return { requests,external,timeline };
}
/** Wait for the baseline's real wheel installation and stdout bridge to finish. */
async function ready(page, legacy) {
    if (legacy) await page.waitForFunction(()=>document.querySelector("#output")?.value.includes("pyAircraftIden package installed successfully."),null,{timeout:120000});
    else await page.getByText('Python ready',{exact:true}).waitFor({timeout:120000});
}
/** Seed Python's random sources identically for reproducible optimizer starts, without replacing computations. */
async function seed(page, legacy) {
    const frame = legacy ? page.mainFrame() : page.frames().find(frame=>frame.url().endsWith('runtime.html'));
    await frame.evaluate(()=>window.testRuntime.runPython('import numpy as np, random\nnp.random.seed(12345)\nrandom.seed(12345)'));
}
/** Set the same native controls on migrated and baseline pages. */
async function configure(page, mode, loadFile = true) {
    if(loadFile) await page.locator('#fileItem').setInputFiles({name:'fixed.bin',mimeType:'application/octet-stream',buffer:fixture()});
    await page.locator(`#${mode}_select`).check();
    if (mode === 'ss') {
        for (const [id,value] of Object.entries({num_Outputs:'1',A_order:'1',num_params:'2',num_cons:'0'})) await page.locator('#'+id).fill(value);
        await page.locator('#createFieldsButton').click();
        for (const [id,value] of Object.entries({param_name_1:'a',param_name_2:'b',Bound_min_1:'-10',Bound_max_1:'-0.1',Bound_min_2:'0.1',Bound_max_2:'10'})) await page.locator('#'+id).fill(value);
        for (const [name,value] of Object.entries({matrixA_r0_c0:'a',matrixB_r0_c0:'b',H0_r0_c0:'1',H1_r0_c0:'0'})) await page.locator(`[name=${name}]`).fill(value);
    } else for (const [id,value] of Object.entries({customNumerator:'b',customDenominator:'a*s+c',tf_params:'a b c'})) await page.locator('#'+id).fill(value);
    await page.locator('#input_name_1').selectOption('RATE');await page.locator('#input_field_1').selectOption('ROut');await page.locator('#output_name_1').selectOption('SIDD');await page.locator('#output_field_1').selectOption('Gx');
    for (const [id,value] of Object.entries({starttime:'0',endtime:'81.84',startfreq:'0.5',endfreq:'10',cutofffreq:'30'})) await page.locator('#'+id).fill(value);
}
/** Read actual Plotly traces after a real identification, rejecting Python or UI errors. */
async function identify(page, mode, legacy) {
    const revision=await page.evaluate(()=>{
        if(window.__sysidPlotVersion===undefined) {
            window.__sysidPlotVersion=0;
            for(const method of ['newPlot','react']) {
                const original=Plotly[method];
                /** Count only completed vendor updates for the result plot. */
                Plotly[method]=function(...args){return original.apply(this,args).then(value=>{const id=typeof args[0]==='string'?args[0]:args[0].parentElement?.id;if(id?.startsWith('plotDiv'))window.__sysidPlotVersion++;return value;});};
            }
        }
        return window.__sysidPlotVersion;
    });
    await seed(page,legacy);
    const selector = mode === 'tf' ? '#plotDiv' : '#plotDiv_ss';
    await page.locator('#parseButton').click();
    if (!legacy) { await page.getByText('Identifying...',{exact:true}).waitFor();await page.getByText('Python ready',{exact:true}).waitFor({timeout:240000}); }
    await page.waitForFunction(revision=>window.__sysidPlotVersion>revision || document.querySelector('[role=alert]'),revision,{timeout:240000});
    const errors = await page.locator('[role=alert]').allTextContents();assert.deepEqual(errors,[],await page.locator('#output').inputValue());
    const traces=await page.evaluate(selector => JSON.parse(JSON.stringify((document.querySelector(selector).data ? document.querySelector(selector) : document.querySelector(selector+' .js-plotly-plot')).data.map(({x,y,name,xaxis,yaxis})=>({x:Array.from(x),y:Array.from(y),name,xaxis,yaxis})))),selector);
    const frame=legacy?page.mainFrame():page.frames().find(frame=>frame.url().endsWith('runtime.html'));
    const parameters=await frame.evaluate(mode=>JSON.parse(window.testRuntime.runPython(mode==='tf'?'import json\njson.dumps(fitter.x.tolist())':'import json\njson.dumps(ssm_iden.x_best.tolist() + [float(J)])')),mode);
    return {traces,parameters};
}
/** Compare the independent actual legacy oracle with exact labels/axes and tight numerical tolerances.
 * Same Wasm runtime/seed makes values repeatable; 1e-8 relative/absolute accommodates optimizer/platform floating roundoff.
 */
function compare(result, reference) {
    const actual=result.traces,expected=reference.traces;
    assert.equal(result.parameters.length,reference.parameters.length);
    result.parameters.forEach((value,index)=>assert.ok(Math.abs(value-reference.parameters[index])<=1e-8*Math.max(1,Math.abs(reference.parameters[index])),'identified parameter parity'));
    assert.equal(actual.length,expected.length);
    actual.forEach((trace,i)=>{
        for(const key of ['name','xaxis','yaxis'])assert.equal(trace[key],expected[i][key]);
        for(const key of ['x','y']) { assert.equal(trace[key].length,expected[i][key].length);trace[key].forEach((value,j)=>{assert.ok(Number.isFinite(value));assert.ok(Math.abs(value-expected[i][key][j]) <= 1e-8*Math.max(1,Math.abs(expected[i][key][j])),`${i}.${key}.${j}: ${value} vs ${expected[i][key][j]}`);}); }
    });
}

test('actual local Python identification, legacy parity and lifecycle at root/prefix in dev and Worker preview', {timeout:1200000}, async () => {
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const oracle={};
    try {
        for(const prefix of ['/', '/Tools/WebTools/']) for(const serverMode of ['dev','preview']) {
            if(serverMode==='preview')execFileSync('pnpm',['--filter','sysid','build'],{cwd:root,env:{...process.env,SYSID_TEST_HARNESS:'1',WEBTOOLS_BASE_PATH:prefix},stdio:'pipe'});
            const server=await start(serverMode,prefix),base=prefix+'SysID/';
            try {
                await verifyMatplotlibWheel();
                for(const mode of ['tf','ss']) {
                    if(!oracle[mode]) {
                        const old=await browser.newPage();old.on('pageerror',error=>console.log('Legacy error:',error.message));old.on('console',message=>{if(message.type()==='error')console.log('Legacy console:',message.text());});const observed=await resources(old,server.origin,base,true);
                        console.log('Loading legacy',mode);await old.goto(server.origin+'/legacy/SysID/');console.log('Legacy document loaded');await ready(old,true).catch(async error=>{const stdout=await boundedStdout(old);console.error('Legacy initialization failed before server cleanup',JSON.stringify({mode,prefix,serverMode,url:old.url(),stdout,requests:observed.requests,external:observed.external,timeline:observed.timeline,serverOutput:server.output()}));throw error;});console.log('Legacy ready',mode);await configure(old,mode);oracle[mode]=await identify(old,mode,true);assert.deepEqual(observed.external,[]);await old.close();
                    }
                    const page=await browser.newPage();const observed=await resources(page,server.origin,base);const errors=[];page.on('pageerror',error=>errors.push(error.message));
                    await page.goto(server.origin+base);await ready(page,false);
                    const runtimeFrame=page.frames().find(frame=>frame.url().endsWith('runtime.html'));
                    const encoded=await runtimeFrame.evaluate(()=>window.testRuntime.runPython('_webtools_encode({"frequency":[0,1,2,3,4,5],"sourceAmplitude":[[1,float("nan"),2,float("inf"),float("-inf"),3]],"sourcePhase":[],"fittedAmplitude":[],"fittedPhase":[],"coherence":[]})'));
                    const plotted=await page.evaluate(async encoded=>{
                        const result=window.__sysidDecode(JSON.parse(encoded));const node=document.createElement('div');document.body.appendChild(node);
                        try {const plot=await Plotly.newPlot(node,[{x:result.frequency,y:result.sourceAmplitude[0]}],{},{});return Array.from(plot.data[0].y);}finally{Plotly.purge(node);node.remove();}
                    },encoded);
                    assert.deepEqual(plotted,[1,NaN,2,Infinity,-Infinity,3]);
                    await configure(page,mode);
                    if(mode==='ss') { await page.locator('#tf_select').check();await page.locator('#ss_select').check();assert.equal(await page.locator('[name=matrixA_r0_c0]').inputValue(),'a');assert.equal(await page.locator('#output_field_1').inputValue(),'Gx'); }
                    compare(await identify(page,mode,false),oracle[mode]);console.log('Matched actual legacy',mode,serverMode,prefix);
                    // Same-runtime failure/retry must close Python figures and recover with real results.
                    if(mode==='tf')await page.locator('#customNumerator').fill('(');else await page.locator('[name=matrixA_r0_c0]').fill('b');await page.locator('#parseButton').click();await page.getByRole('alert').waitFor();
                    const frame=page.frames().find(frame=>frame.url().endsWith('runtime.html'));assert.equal(await frame.evaluate(()=>window.testRuntime.runPython('len(plt.get_fignums())')),0);
                    if(mode==='tf')await page.locator('#customNumerator').fill('b');else await page.locator('[name=matrixA_r0_c0]').fill('a');compare(await identify(page,mode,false),oracle[mode]);
                    if(mode==='ss' && prefix==='/' && serverMode==='dev') {
                        await configure(page,'tf',false);compare(await identify(page,'tf',false),oracle.tf);await page.locator('#ss_select').check();
                        await page.locator('#plotDiv_ss .js-plotly-plot').waitFor();assert.equal(await page.locator('[name=matrixA_r0_c0]').inputValue(),'a');
                    }
                    assert.deepEqual(errors,[]);assert.deepEqual(observed.external,[]);assert.ok(observed.requests.some(url=>url===server.origin+base+'python/pyAircraftIden-1.0-py3-none-any.whl'));
                    assert.ok(observed.requests.some(url=>url===server.origin+base+'dataflash/vendor/parser.js'));
                    for(const missing of ['missing.html','assets/missing.js','python/missing.whl','dataflash/vendor/missing.js'])assert.equal((await page.request.get(server.origin+base+missing)).status(),404);
                    const redirect=await page.request.get(server.origin+base.slice(0,-1),{maxRedirects:0});assert.equal(redirect.status(),308);
                    await page.close();
                }
                const page=await browser.newPage();await resources(page,server.origin,base);
                let fail=true;const failedWheel=serverMode==='dev'?'scipy-1.12.0-cp312-cp312-pyodide_2024_0_wasm32.whl':'pyAircraftIden-1.0-py3-none-any.whl';await page.route('**/python/'+failedWheel,route=>fail?route.abort():route.fallback());
                await page.goto(server.origin+base);await page.getByRole('alert').waitFor({timeout:120000});fail=false;await page.getByRole('button',{name:'Retry initialization'}).click();await ready(page,false);assert.equal(await page.locator('iframe').count(),1);
                for(let iteration=0;iteration<2;iteration++) {
                    await page.evaluate(()=>{window.__sysidUnmount();});assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('.js-plotly-plot').count(),0);
                    await page.evaluate(()=>{window.__sysidUnmount=window.__sysidMount();});
                    if(iteration===0) { await page.evaluate(()=>{window.__sysidUnmount();window.__sysidUnmount=window.__sysidMount();}); }
                    await ready(page,false);assert.equal(await page.locator('iframe').count(),1);
                }
                let releaseRuntime;
                const gate=new Promise(resolve=>{releaseRuntime=resolve;});
                await page.route('**/runtime.html',async route=>{await gate;await route.fallback();});
                await page.evaluate(()=>{
                    const original=File.prototype.arrayBuffer;
                    File.prototype.arrayBuffer=function(){const bytes=original.call(this);return new Promise(resolve=>{window.__releaseFile=async()=>{resolve(await bytes);File.prototype.arrayBuffer=original;};});};
                    window.__sysidUnmount();window.__sysidUnmount=window.__sysidMount();
                });
                await page.locator('#fileItem').setInputFiles({name:'delayed.bin',mimeType:'application/octet-stream',buffer:fixture()});
                await page.getByText('Reading log...',{exact:true}).waitFor();await page.getByRole('button',{name:'Retry initialization'}).click();
                await page.evaluate(()=>window.__releaseFile());releaseRuntime();await ready(page,false);
                assert.equal(await page.title(),'SysID: delayed.bin');await page.locator('#tf_select').check();await page.locator('#input_name_1').selectOption('RATE');
                await page.close();
                console.log(`SysID ${serverMode} ${prefix}: both real models, parity, recovery, prefix resources and cleanup passed`);
            } finally {await server.stop();}
        }
    } finally {await browser.close();}
});
