const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {generate} = require('../tooling/generate-types.cjs');
const root = path.resolve(__dirname,'../../..');
const original = path.join(root,'tests/mavlink.test.cjs');
const originalRequire = createRequire(original);
// Run the authoritative test source unchanged against the workspace export.
vm.compileFunction(fs.readFileSync(original,'utf8'), ['require'], {filename:original})(specifier =>
    specifier === '../modules/MAVLink/mavlink.js' ? require('@webtools/mavlink') : originalRequire(specifier));
test('generated codec, fixes and authoritative fixtures remain pinned byte-for-byte', () => {
    for (const file of ['mavlink.js','runtime-fixes.patch','local_modules/jspack/jspack.js']) {
        assert.deepEqual(fs.readFileSync(path.join(root,'modules/MAVLink',file)), fs.readFileSync(path.join(__dirname,'../dist/runtime',file)));
    }
    assert.equal(fs.readFileSync(path.join(__dirname,'../src/index.d.ts'),'utf8'),generate());
});
test('Node workspace export preserves the event and constructor contract', () => {
    const {mavlink20, MAVLink20Processor} = require('@webtools/mavlink');
    const processor = new MAVLink20Processor(null,42,1);
    const events = [];
    processor.on('HEARTBEAT', message => events.push(message));
    processor.on('message', message => events.push(message));
    const decoded = processor.parseBuffer(new mavlink20.messages.heartbeat(11,3,137,5,4,3).pack(processor));
    assert.equal(events.length,2);
    assert.equal(events[0],decoded[0]);
    assert.equal(events[1],decoded[0]);
});
test('Node ESM interop exports the same runtime as CommonJS', async () => {
    const esm = await import('@webtools/mavlink');
    const cjs = require('@webtools/mavlink');
    assert.equal(esm.mavlink20,cjs.mavlink20);
    assert.equal(esm.MAVLink20Processor,cjs.MAVLink20Processor);
});
test('malformed length/CRC stream behavior is identical to the legacy codec', () => {
    const legacy = require('../../../modules/MAVLink/mavlink.js');
    const packaged = require('@webtools/mavlink');
    const fixtures = require('../../../tests/fixtures/mavlink.json');
    const good = Buffer.from(fixtures.messages[0].hex,'hex');
    const badLength = Buffer.from(good); badLength[1] += good.length;
    const badCrc = Buffer.from(good); badCrc[10] ^= 1;
    const unknownFlags = Buffer.from(good); unknownFlags[2] = 2;
    const scenarios = [Buffer.concat([badLength,good,good]),Buffer.concat([badCrc,good]),Buffer.concat([unknownFlags,good]),good.subarray(0,5),Buffer.from([1,2,253,250,0,0])];
    function run(codec,bytes,fragmented) {
        const p = new codec.MAVLink20Processor(null,42,1);
        const messages = [];
        for (const chunk of fragmented ? Array.from(bytes,byte=>[byte]) : [bytes]) messages.push(...(p.parseBuffer(chunk) || []));
        return {messages:messages.map(m=>({name:m._name,reason:m._reason,bytes:Array.from(m._msgbuf)})),remaining:Array.from(p.buf),errors:p.total_receive_errors,expected:p.expected_length};
    }
    for (const bytes of scenarios) for (const fragmented of [false,true]) assert.deepEqual(run(packaged,bytes,fragmented),run(legacy,bytes,fragmented));
    // Preserve the known whole-frame consumption behavior, rather than applying
    // the separate reviewed resynchronization change in this type-only migration.
    assert.deepEqual(run(packaged,scenarios[0],false).messages.map(m=>m.name),['BAD_DATA','HEARTBEAT']);
});
test('comparison revision protocol sources and authoritative test fixtures are unchanged', () => {
    const crypto = require('node:crypto');
    const pinned = require('./pinned.json');
    for (const [file,hash] of Object.entries(pinned.sha256)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,`${file} changed from ${pinned.revision}`);
});
