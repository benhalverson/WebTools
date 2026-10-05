import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
const root=fileURLToPath(new URL('./browser/',import.meta.url));
const outDir=fileURLToPath(new URL('../dist/browser-test/',import.meta.url));
await build({configFile:false,root,base:'/numerics-test/',build:{outDir,emptyOutDir:true}});
const server=await preview({configFile:false,root,base:'/numerics-test/',build:{outDir},preview:{host:'127.0.0.1',port:0}});
let browser;
try {
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
    const page=await browser.newPage();
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(()=>window.results);
    const fixture=JSON.parse(readFileSync(new URL('./fixtures/legacy.json',import.meta.url),'utf8'));
    // V8/browser math may differ by a last bit from Node's math library.
    const actual=await page.evaluate(()=>window.results);
    const compare=(a,b,path='')=>{
        if(typeof a==='number' && typeof b==='number') assert.ok(Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(b)),`${path}: ${a} versus ${b}`);
        else if(a && b && typeof a==='object' && typeof b==='object') {assert.deepEqual(Object.keys(a),Object.keys(b));for(const key of Object.keys(a))compare(a[key],b[key],`${path}/${key}`);}
        else assert.equal(a,b,path);
    };
    compare(actual,fixture.results);
    // Run the new real consumer/storage matrix against legacy in the same browser.
    for (const path of ['modules/fft.js/dist/fft.js', 'Libraries/Array_Math.js', 'Libraries/fft.js']) {
        await page.addScriptTag({content:readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')});
    }
    const consumers = await page.evaluate(() => ({actual: window.consumerResults, expected: window.legacyConsumerResults()}));
    assert.deepEqual(consumers.actual, consumers.expected);
    // Compare the real DOM helper to the legacy implementation for repeated edits.
    await page.addScriptTag({content:readFileSync(new URL('../../../Libraries/fft.js',import.meta.url),'utf8')});
    const edits=['9','15','14','17','16','0','1','2',''];
    const results=await page.evaluate(edits=>{
        const actual=document.querySelector('#window');
        const reference=document.createElement('input');reference.type='number';reference.defaultValue='8';
        return edits.map(value=>{
            actual.value=value;reference.value=value;
            actual.dispatchEvent(new Event('change'));
            window.fft_window_size_inc({target:reference});
            return {actual:[actual.value,actual.getAttribute('data-last')],reference:[reference.value,reference.getAttribute('data-last')]};
        });
    },edits);
    for(const result of results)assert.deepEqual(result.actual,result.reference);
    assert.deepEqual(errors,[]);
    console.log('Built public package browser parity and DOM edits passed.');
} finally {
    await browser?.close();
    await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));
}
