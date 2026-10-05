const fs = require('node:fs');
const path = require('node:path');
const { generate } = require('./generate-types.cjs');
const root = path.resolve(__dirname, '..');
const runtime = path.resolve(root, '../../modules/MAVLink');
if (fs.readFileSync(path.join(root, 'src/index.d.ts'), 'utf8') !== generate()) {
    throw new Error('Stale MAVLink declarations: run node tooling/generate-types.cjs in this package');
}
fs.mkdirSync(path.join(root, 'dist/runtime/local_modules/jspack'), {recursive:true});
for (const name of ['index.cjs', 'browser.mjs', 'index.d.ts', 'globals.d.ts', 'node.d.cts', 'vite.cjs', 'vite.d.cts']) fs.copyFileSync(path.join(root,'src',name),path.join(root,'dist',name));
for (const name of ['mavlink.js', 'README.md', 'runtime-fixes.patch']) fs.copyFileSync(path.join(runtime,name),path.join(root,'dist/runtime',name));
for (const name of ['jspack.js', 'package.json', 'LICENSE', 'README.md']) fs.copyFileSync(path.join(runtime,'local_modules/jspack',name),path.join(root,'dist/runtime/local_modules/jspack',name));
fs.copyFileSync(path.resolve(root,'../../LICENSE'),path.join(root,'dist/LICENSE'));
