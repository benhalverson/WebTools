// Run the UNMODIFIED authoritative Node wire suite in Chromium, using small
// test-only adapters for node:test, Buffer, assert, and independent SHA digests.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const mavlinkAssets = require('@webtools/mavlink/vite');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'../../..');
const fixtures = require('../../../tests/fixtures/mavlink.json');
const source = fs.readFileSync(path.join(root,'tests/mavlink.test.cjs'),'utf8');
const inputs = [0,1,55,56,63,64,65,239,1024].map(length => Buffer.from(Array.from({length},(_,i)=>i&255)));
inputs.push(Buffer.concat([Buffer.from(Array.from({length:32},(_,i)=>i)),Buffer.from(fixtures.messages[0].hex,'hex')]));
const hashes = Object.fromEntries(inputs.map(bytes => [bytes.toString('hex'),crypto.createHash('sha256').update(bytes).digest('hex')]));
let buildDirectory;
const server = http.createServer((req,res) => {
    const pathname = new URL(req.url,'http://localhost').pathname;
    const production = pathname.startsWith('/tools/');
    const directory = production ? buildDirectory : root;
    const file = path.resolve(directory, production ? pathname.slice('/tools/'.length) : '.' + pathname);
    if (!file.startsWith(directory + path.sep)) return res.writeHead(403).end();
    if (file === path.join(root,'empty.html')) return res.setHeader('Content-Type','text/html'), res.end('<!doctype html><title>MAVLink parity</title>');
    fs.readFile(file,(error,bytes) => {
        if (error) return res.writeHead(404).end();
        res.setHeader('Content-Type', /\.(mjs|js)$/.test(file) ? 'text/javascript' : 'application/octet-stream');
        res.end(bytes);
    });
});
(async () => {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    let browser;
    try {
        buildDirectory = fs.mkdtempSync(path.join(os.tmpdir(),'mavlink-browser-build-'));
        const {build} = await import('vite');
        await build({configFile:false,base:'/tools/',logLevel:'silent',plugins:[mavlinkAssets()],build:{outDir:buildDirectory,emptyOutDir:true,rollupOptions:{preserveEntrySignatures:'strict',input:path.resolve(__dirname,'../dist/browser.mjs')}}});
        const builtEntry = fs.readdirSync(path.join(buildDirectory,'assets')).find(file=>file.endsWith('.js'));
        browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || undefined});
        const origin = `http://127.0.0.1:${server.address().port}`;
        const reports = [];
        for (const mode of ['legacy','package','production']) {
            const page = await browser.newPage();
            await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
            await page.goto(`${origin}/empty.html`);
            if (mode === 'legacy') await page.addScriptTag({url:`${origin}/modules/MAVLink/mavlink.js`});
            else await page.evaluate(async url => { window.codec = await import(url); }, mode === 'production' ? `/tools/assets/${builtEntry}` : '/packages/mavlink/dist/browser.mjs');
            const report = await page.evaluate(async ({source,fixtures,hashes}) => {
                await window.mavlink20.ready;
                const codec = window.codec || window;
                if (codec.mavlink20 !== window.mavlink20 || codec.MAVLink20Processor !== window.MAVLink20Processor) throw new Error('Browser globals changed');
                const tests = [];
                class TestBuffer extends Uint8Array {
                    static from(value,encoding) {
                        if (encoding === 'hex') return new TestBuffer(value.match(/../g)?.map(byte => parseInt(byte,16)) || []);
                        return new TestBuffer(value);
                    }
                    static concat(parts) { return new TestBuffer(parts.flatMap(part => Array.from(part))); }
                    toString(encoding) { if (encoding !== 'hex') throw new Error('Unexpected encoding'); return Array.from(this,byte=>byte.toString(16).padStart(2,'0')).join(''); }
                    toJSON() { return Array.from(this); }
                }
                const assert = {
                    equal(a,b,message) { if (a !== b) throw new Error(`${message || 'equal'}: ${a} != ${b}`); },
                    deepEqual(a,b,message) { this.equal(JSON.stringify(a),JSON.stringify(b),message); },
                    ok(value,message) { if (!value) throw new Error(message || 'assertion failed'); },
                    match(value,pattern) { this.ok(pattern.test(value),`${value} does not match ${pattern}`); },
                    throws(callback,pattern) { try { callback(); } catch (error) { if (pattern) this.match(error.message,pattern); return; } throw new Error('Expected exception'); }
                };
                const crypto = {createHash(algorithm) {
                    assert.equal(algorithm,'sha256');
                    const parts = [];
                    return {update(bytes) { parts.push(bytes); return this; }, digest() {
                        const hex = hashes[TestBuffer.concat(parts).toString('hex')];
                        assert.ok(hex,'No independent digest for these bytes');
                        return TestBuffer.from(hex,'hex');
                    }};
                }};
                const require = name => {
                    if (name === 'node:test') return (name,run) => tests.push({name,run});
                    if (name === 'node:assert/strict') return assert;
                    if (name === 'node:crypto') return crypto;
                    if (name === './fixtures/mavlink.json') return fixtures;
                    if (name === '../modules/MAVLink/mavlink.js') return codec;
                    throw new Error(`Unexpected dependency: ${name}`);
                };
                new Function('require','Buffer',source)(require,TestBuffer);
                const names = [];
                for (const test of tests) { await test.run(); names.push(test.name); }
                return names;
            },{source,fixtures,hashes});
            console.log(`${mode}: ${report.length} authoritative browser wire/signing/replay scenarios passed`);
            reports.push(report);
            await page.close();
        }
        assert.deepEqual(reports[0],reports[1]);
        assert.deepEqual(reports[0],reports[2]);
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
        if (buildDirectory) fs.rmSync(buildDirectory,{recursive:true,force:true});
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
