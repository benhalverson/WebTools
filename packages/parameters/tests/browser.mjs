import { createServer } from 'node:http';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'vite';
const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const output = await mkdtemp(path.join(tmpdir(), 'parameter-browser-'));
/** Serve only workspace and temporary production assets on the loopback test server. */
const server = createServer(async (request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname;
    if (name === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Parameter parity</title>'); return; }
    const base = name.startsWith('/production/') ? output : root;
    const file = path.resolve(base, '.' + (base === output ? name.slice(11) : name));
    if (!file.startsWith(base + path.sep)) { response.writeHead(403).end(); return; }
    try { response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
});
let browser;
try {
    await build({ configFile: false, logLevel: 'warn', build: { outDir: output, emptyOutDir: true,
        lib: { entry: path.join(root, 'packages/parameters/src/index.ts'), formats: ['es'], fileName: 'parameters' } } });
    const entry = (await readdir(output)).find(name => name.endsWith('.js'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
    const fixture = JSON.parse(await readFile(path.join(root, 'tests/fixtures/params.json'), 'utf8'));
    const source = await readFile(path.join(root, 'tests/mavparam.test.cjs'), 'utf8');
    const reports = [];
    for (const mode of ['legacy', 'production']) {
        const page = await browser.newPage();
        await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await page.goto(origin);
        if (mode === 'legacy') await page.addScriptTag({ url: origin + '/modules/MAVLink/mavparam.js' });
        reports.push(await page.evaluate(async ({ mode, fixture, entry, source }) => {
            const api = mode === 'legacy' ? window : await import(`/production/${entry}`);
            const { browserAdapters } = await import('/packages/parameters/tests/browser-adapters.mjs');
            const { scenarios } = await import('/packages/parameters/tests/scenarios.mjs');
            const { assert, Buffer } = browserAdapters();
            const tests = [];
            new Function('require', 'Buffer', source)(id => id === 'node:test' ? (name, run) => tests.push([name, run])
                : id === 'node:assert/strict' ? assert : id.includes('params.json') ? fixture : api, Buffer);
            for (const [name, run] of tests) {
                try { await run(); } catch (error) { throw Error(`${name}: ${error.stack}`); }
            }
            // Exercise the native browser Cache API as well as deterministic adapters.
            const cacheName = 'mavparam-definitions-v1';
            await caches.delete(cacheName);
            let offline = false;
            /** Supply metadata without a provider, then simulate offline persistence. */
            const fetch = async () => {
                if (offline) throw Error('offline');
                return new Response(JSON.stringify({ group: { A: { Description: 'native offline' } } }));
            };
            try {
                await new api.MAVParamDefinitions({ fetch, cache: caches }).load('Copter');
                offline = true;
                const result = await new api.MAVParamDefinitions({ fetch, cache: caches, maxAge: 0 }).load('Copter');
                assert.equal(result.stale, true);
                assert.equal(result.definitions.get('A').description, 'native offline');
            } finally { await caches.delete(cacheName); }
            return { count: tests.length, trace: await scenarios(api, fixture, assert) };
        }, { mode, fixture, entry, source }));
        await page.close();
    }
    assert.deepEqual(reports[1], reports[0]);
    console.log(`Chromium: ${reports[0].count} authoritative scenarios in legacy and production, native offline cache, and identical interruption traces passed`);
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await rm(output, { recursive: true, force: true });
}
