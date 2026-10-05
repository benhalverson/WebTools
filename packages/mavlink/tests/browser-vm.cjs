// Additional browser-branch coverage when Chromium is unavailable. This is not
// a substitute for the real browser loading/production tests in browser.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL, fileURLToPath} = require('node:url');
const {createRequire} = require('node:module');
const original = path.resolve(__dirname,'../../../tests/mavlink.test.cjs');
const originalRequire = createRequire(original);
test('browser module initialization and authoritative browser-branch wire fixtures', async t => {
    const context = vm.createContext({Uint8Array,URL,console});
    context.window = context;
    let loads = 0;
    context.document = {
        createElement() { return {}; },
        head: {append(script) {
            loads++;
            const file = fileURLToPath(script.src);
            new vm.Script(fs.readFileSync(file,'utf8'), {filename:file,importModuleDynamically:specifier=>import(new URL(specifier,script.src).href)}).runInContext(context);
            script.onload();
        }}
    };
    const file = path.resolve(__dirname,'../dist/browser.mjs');
    const module = new vm.SourceTextModule(fs.readFileSync(file,'utf8'), {context,initializeImportMeta:meta=>{meta.url=pathToFileURL(file).href;}});
    await module.link(()=>{throw new Error('Unexpected import');});
    await module.evaluate();
    assert.equal(loads,1);
    assert.equal(module.namespace.mavlink20,context.mavlink20);
    const reuse = new vm.SourceTextModule(fs.readFileSync(file,'utf8'), {context,initializeImportMeta:meta=>{meta.url=pathToFileURL(file).href;}});
    await reuse.link(()=>{throw new Error('Unexpected import');});
    await reuse.evaluate();
    assert.equal(loads,1, 'an initialized legacy runtime must not load twice');
    assert.equal(reuse.namespace.mavlink20,module.namespace.mavlink20);
    assert.equal(typeof new module.namespace.MAVLink20Processor().on,'undefined');
    const cases = [];
    const crossRealmAssert = Object.create(assert);
    crossRealmAssert.deepEqual = (actual,expected,message) => assert.deepEqual(structuredClone(actual),structuredClone(expected),message);
    vm.compileFunction(fs.readFileSync(original,'utf8'),['require'],{filename:original})(specifier => {
        if (specifier === 'node:test') return (name,run)=>cases.push({name,run});
        if (specifier === 'node:assert/strict') return crossRealmAssert;
        if (specifier === '../modules/MAVLink/mavlink.js') return module.namespace;
        return originalRequire(specifier);
    });
    for (const entry of cases) await t.test(entry.name,entry.run);
});
