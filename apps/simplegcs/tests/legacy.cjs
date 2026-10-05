const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const baseline = '2ce2994419c96d5912f952c3cd659d1b6e630aff';
/** Read an unchanged tracked file at the actual integrated prerequisite revision. */
function source(file) { return execFileSync('git', ['show', `${baseline}:${file}`], { maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
/** Replay only exact pinned CDN bundles whose bytes match the repository's SHA-384 integrity. */
function cdnFixtures() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simplegcs-cdn-')), fixtures = new Map();
    try {
        const html = source('SimpleGCS/index.html').toString();
        for (const match of html.matchAll(/(?:src|href)="(https:\/\/(?:unpkg.com\/|cdn.jsdelivr.net\/npm\/)([^"]+))" integrity="sha384-([^"]+)"/g)) {
            const [, url, spec, integrity] = match, slash = spec.indexOf('/'), pkg = spec.slice(0, slash), file = spec.slice(slash + 1);
            const archive = JSON.parse(execFileSync('npm', ['pack', pkg, '--json', '--pack-destination', dir], { env: { ...process.env, npm_config_cache: path.join(dir, 'cache') }, stdio: ['ignore', 'pipe', 'pipe'] }))[0].filename;
            const bytes = execFileSync('tar', ['-xOf', path.join(dir, archive), 'package/' + file], { maxBuffer: 8 * 1024 * 1024 });
            assert.equal(createHash('sha384').update(bytes).digest('base64'), integrity, url);
            fixtures.set(url, { body: bytes, contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
        }
        return fixtures;
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
/** Serve legacy files only from the comparison revision, never from modified application sources. */
async function legacyServer() {
    const server = http.createServer((req, res) => {
        const pathname = new URL(req.url, 'http://local').pathname;
        if (pathname.includes('..')) { res.writeHead(404).end(); return; }
        const file = pathname.slice(1) + (pathname.endsWith('/') ? 'index.html' : '');
        try { const body = source(file); res.setHeader('content-type', file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); res.end(body); }
        catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { origin: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
module.exports = { cdnFixtures, legacyServer };
