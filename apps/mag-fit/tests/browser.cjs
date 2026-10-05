const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const {test} = require('node:test');
const {chromium} = require('playwright');
const {reference} = require('./legacy.cjs');
const root = path.resolve(__dirname,'../../..');
const fixture = path.join(__dirname,'fixtures/plane-4.6.2.BIN');
/** Terminate the complete local gateway/Worker group on success, failure or timeout. */
async function stop(child) {
    if(child.exitCode !== null || child.signalCode !== null)return;
    const exited=once(child,'exit');process.kill(-child.pid,'SIGTERM');
    const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},5000);
    try{await exited;}finally{clearTimeout(timer);}
}
/** Build all independent Workers with the selected hosting prefix baked in. */
async function build(prefix){
    const child=spawn('pnpm',['build'],{cwd:root,detached:true,env:{...process.env,WEBTOOLS_BASE_PATH:prefix},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
    const timer=setTimeout(()=>void stop(child),180000);
    try{const [code]=await once(child,'exit');assert.equal(code,0,output);}finally{clearTimeout(timer);await stop(child);}
}
/** Start the actual same-origin gateway, which owns three independent Vite/Worker processes. */
async function start(mode,prefix){
    const child=spawn(process.execPath,['tooling/serve.ts',mode,'--port','0'],{cwd:root,detached:true,env:{...process.env,WEBTOOLS_BASE_PATH:prefix,BROWSER:'none'},stdio:['ignore','pipe','pipe']});
    let output='';
    try {const origin=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error(output)),60000);
        /** Accumulate split readiness output before parsing the gateway address. */
        function read(chunk){output+=chunk;const match=output.match(/WebTools (?:dev|preview): (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}}
        child.stdout.on('data',read);child.stderr.on('data',read);child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('exit',code=>{clearTimeout(timer);reject(new Error(`Gateway exit ${code}: ${output}`));});
    });return {child,origin};}catch(error){await stop(child);throw error;}
}
/** Wait for the shared Plot component to settle actual Plotly mutations. */
async function loaded(page){await page.waitForFunction(()=>document.querySelector('#SaveParams')?.disabled===false && document.querySelector('#mag_plot_x .js-plotly-plot')?.data?.length > 1);}
/** Compare recorded numerical traces across V8 runtimes with only rounding tolerance. */
function close(expected,actual){assert.equal(actual.length,expected.length);expected.forEach((value,index)=>{if(value===null){assert.ok(actual[index]===null || Number.isNaN(actual[index]));return;}assert.ok(Math.abs(value-actual[index])<=1e-10+Math.abs(value)*1e-12,`${index}: ${value} != ${actual[index]}`);});}
/** Assert real routes, byte-preserved secondary files and meaningful asset misses. */
async function routes(context,origin,prefix){
    const base=origin+prefix+'MAGFit/';
    assert.equal((await context.request.get(base.slice(0,-1),{maxRedirects:0})).status(),308);
    for(const suffix of ['', 'index.html','Readme.md','params.json','dataflash/index.js','dataflash/vendor/parser.js'])assert.equal((await context.request.get(base+suffix)).status(),200,suffix);
    for(const suffix of ['missing','missing.js','assets/missing.js','dataflash/vendor/missing.js'])assert.equal((await context.request.get(base+suffix)).status(),404,suffix);
    const params=await context.request.get(base+'params.json');assert.deepEqual(await params.body(),await fs.readFile(path.join(root,'MAGFit/params.json')));
    assert.equal((await context.request.get(origin+prefix)).status(),200);
    assert.equal((await context.request.get(origin+prefix+'RotationCheck/')).status(),200);
}
for(const prefix of ['/','/Tools/WebTools/'])for(const mode of ['dev','preview'])test(`MAGFit ${mode} at ${prefix}`,{timeout:240000},async()=>{
    if(mode==='preview')await build(prefix);
    const server=await start(mode,prefix);
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),args:['--no-sandbox']});
    const context=await browser.newContext({acceptDownloads:true});
    await context.route('**/*',route=>new URL(route.request().url()).origin===server.origin ? route.continue() : route.abort());
    try {
        await routes(context,server.origin,prefix);
        const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
        await page.goto(server.origin+prefix+'MAGFit/');
        // A failed deferred import belonging to a cleared input must not report into its replacement.
        let capture;const pending=new Promise(resolve=>{capture=resolve;});
        const parserUrl=server.origin+prefix+'MAGFit/dataflash/index.js';
        await page.route(parserUrl,route=>capture(route));
        await page.locator('#fileItem').setInputFiles(fixture);
        const delayed=await pending;
        await page.locator('#fileItem').setInputFiles([]);
        await delayed.fulfill({status:404,body:'missing'});
        await page.waitForFunction(()=>document.querySelector('#loading')?.style.visibility==='hidden');
        assert.equal(await page.locator('[role=alert]').count(),0,'stale import failure is ignored');
        await page.unroute(parserUrl);await page.reload();
        await page.locator('#fileItem').setInputFiles(fixture);await loaded(page);
        assert.equal(await page.locator('[role=alert]').count(),0);
        globalThis.self={addEventListener(){}};const {loadDataflashParser}=await import('../../../packages/dataflash/dist/index.js');
        const bytes=await fs.readFile(fixture);const oracle=await reference(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),await loadDataflashParser());
        const expected=oracle.snapshot();
        const initial=await page.locator('#mag_plot_x .js-plotly-plot').evaluate(node=>({x:node.data[0].x,y:node.data[0].y,height:node.getBoundingClientRect().height}));
        close(expected.source.x,initial.y);assert.equal(initial.height,300);
        const battery=await page.locator('#motor_comp .js-plotly-plot').evaluate(node=>({x:node.data[0].x,y:node.data[0].y}));
        const vm=require('node:vm');const expectedBattery=JSON.parse(vm.runInContext('JSON.stringify(motor_comp.data[0])',oracle.context));close(expectedBattery.x,battery.x);close(expectedBattery.y,battery.y);
        const downloadPromise=page.waitForEvent('download');await page.locator('#SaveParams').click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'MAGFit.param');vm.runInContext('save_parameters()',oracle.context);assert.equal(await fs.readFile(await download.path(),'utf8'),await oracle.downloads.at(-1).blob.text());
        // A non-default fit, followed by the original fit, exercises priority and visibility independently.
        const checks=page.locator('.choice input:not(:disabled)');if(await checks.count()>2){await checks.nth(2).check();await checks.nth(1).uncheck();await checks.nth(1).check();}
        await page.locator('#ATTITUDE input').first().check();assert.equal(await page.locator('#calculate').isEnabled(),true);await page.locator('#calculate').click();await loaded(page);
        await page.evaluate(()=>window.Plotly.relayout(document.querySelector('#FlightData .js-plotly-plot'),{'xaxis.range':[60,100]}));
        await page.locator('#TimeStart').fill('70');await page.locator('#TimeEnd').fill('90');
        await page.waitForFunction(()=>document.querySelector('#FlightData .js-plotly-plot')?.layout.xaxis.range[0]===70);
        await page.locator('#calculate').click();await loaded(page);
        await page.waitForFunction(()=>document.querySelector('#mag_plot_x .js-plotly-plot')?.layout.xaxis.range[0]===70);
        await page.getByRole('button',{name:'Reset view',exact:true}).click();await loaded(page);
        await page.locator('input[name="MAG0orientation"]').nth(2).check();await loaded(page);
        // Same-origin Open In receiving retains the actual File and starts a fresh calculation.
        await page.evaluate(async()=>{const input=document.querySelector('#fileItem');window.postMessage({type:'file',data:input.files[0]},'*');});await loaded(page);
        await page.locator('#OpenIn').click();assert.ok(await page.locator('input[value="Hardware Report"]').isEnabled());
        await context.route(server.origin+prefix+'HardwareReport',route=>route.fulfill({contentType:'text/html',body:'<script>window.addEventListener("message",event=>window.receivedFile=event.data.data)</script>'}));
        const popupPromise=page.waitForEvent('popup');await page.locator('input[value="Hardware Report"]').click();const popup=await popupPromise;
        await popup.waitForFunction(()=>window.receivedFile instanceof File);
        assert.equal(await popup.evaluate(()=>window.receivedFile.size),(await fs.stat(fixture)).size);await popup.close();

        await page.locator('#fileItem').setInputFiles({name:'broken.bin',mimeType:'application/octet-stream',buffer:Buffer.from('invalid')});await page.locator('[role=alert]').waitFor();
        await page.locator('#fileItem').setInputFiles(fixture);await loaded(page);
        // Actual host disconnect invokes React cleanup without relying on navigation teardown.
        await page.evaluate(()=>{window.magPurges=0;const purge=window.Plotly.purge;window.Plotly.purge=function(...args){window.magPurges++;return purge.apply(this,args);};});
        for(let i=0;i<2;i++){
            await page.locator('#fileItem').setInputFiles(fixture);
            const before=await page.evaluate(()=>window.magPurges);
            await page.evaluate(()=>{document.querySelector('mag-fit-app').remove();});
            await page.waitForFunction(before=>window.magPurges>before,before);
            assert.equal(await page.locator('.js-plotly-plot').count(),0);
            await page.evaluate(()=>{const host=document.createElement('mag-fit-app');host.id='root';document.body.append(host);});
            await page.locator('#fileItem').setInputFiles(fixture);await loaded(page);
        }
        // ArrayBuffer Open In messages also reset independent per-log overrides.
        for(let transfer=0;transfer<2;transfer++){
            await page.locator('input[name="MAG0use"]').nth(2).check();
            await page.evaluate(()=>window.Plotly.relayout(document.querySelector('#mag_plot_x .js-plotly-plot'),{'xaxis.range':[70,90]}));
            await page.evaluate(async()=>window.postMessage({type:'arrayBuffer',data:await document.querySelector('#fileItem').files[0].arrayBuffer()},'*'));
            await page.waitForFunction(()=>document.querySelector('input[name="MAG0use"]')?.checked===true);await loaded(page);
            await page.waitForFunction(()=>document.querySelector('#mag_plot_x .js-plotly-plot')?.layout.xaxis.range[0]<70);
        }
        assert.deepEqual(errors,[]);
    } finally {await context.close();await browser.close();await stop(server.child);}
});
