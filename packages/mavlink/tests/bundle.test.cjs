const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const mavlinkAssets = require('@webtools/mavlink/vite');
test('Vite production build retains codec bytes and relative jspack at a configured prefix', async () => {
    const {build} = await import('vite');
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(),'mavlink-build-'));
    try {
        await build({configFile:false,base:'/tools/',logLevel:'silent',plugins:[mavlinkAssets()],build:{outDir,emptyOutDir:true,minify:false,rollupOptions:{input:path.resolve(__dirname,'../dist/browser.mjs')}}});
        const runtime = path.resolve(__dirname,'../../../modules/MAVLink');
        for (const file of ['mavlink.js','local_modules/jspack/jspack.js']) assert.deepEqual(await fs.readFile(path.join(outDir,'mavlink-runtime',file)),await fs.readFile(path.join(runtime,file)));
        const files = await fs.readdir(path.join(outDir,'assets'));
        const entry = await fs.readFile(path.join(outDir,'assets',files.find(file=>file.endsWith('.js'))),'utf8');
        assert.ok(entry.includes('/tools/mavlink-runtime/mavlink.js'));
    } finally { await fs.rm(outDir,{recursive:true,force:true}); }
});
