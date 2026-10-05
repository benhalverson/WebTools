const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const mavlinkAssets = require('@webtools/mavlink/vite');
const root = path.resolve(__dirname, '../../..');
const buildDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'transfers-browser-'));
const managerSource = fs.readFileSync(path.join(root, 'SimpleGCS/ftp_manager.js'), 'utf8');
const sources = ['mavftp', 'ftp_manager'].map(name => fs.readFileSync(path.join(root, `tests/${name}.test.cjs`), 'utf8'));
const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') return res.setHeader('Content-Type', 'text/html'), res.end('<!doctype html><meta charset="utf-8"><title>Transfer parity</title>');
    const production = pathname.startsWith('/tools/');
    const base = production ? buildDirectory : root;
    const file = path.resolve(base, production ? pathname.slice(7) : '.' + pathname);
    if (!file.startsWith(base + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
        if (error) return res.writeHead(404).end();
        res.setHeader('Content-Type', /\.(mjs|cjs|js)$/.test(file) ? 'text/javascript; charset=utf-8' : 'application/octet-stream');
        res.end(bytes);
    });
});
/** Run authoritative scenarios in isolated legacy/production pages and always close Chromium/server resources. */
async function runBrowserParity() {
    let browser;
    try {
        const { build } = await import('vite');
        await build({ configFile: false, base: '/tools/', logLevel: 'warn', plugins: [mavlinkAssets()],
            build: { outDir: buildDirectory, emptyOutDir: true,
                rollupOptions: { preserveEntrySignatures: 'strict', input: path.join(__dirname, 'browser-entry.ts') } } });
        const entry = fs.readdirSync(path.join(buildDirectory, 'assets')).find(file => file.endsWith('.js'));
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
        const reports = [];
        for (const mode of ['legacy', 'production']) {
            const page = await browser.newPage();
            await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
            await page.goto(origin);
            if (mode === 'legacy') {
                await page.addScriptTag({ url: `${origin}/modules/MAVLink/mavlink.js` });
                await page.addScriptTag({ url: `${origin}/modules/MAVLink/mavftp.js` });
                await page.evaluate(async () => { await window.mavlink20.ready; });
            } else await page.evaluate(async url => { window.transfers = await import(url); }, `/tools/assets/${entry}`);
            await page.addScriptTag({ url: `${origin}/packages/transfers/tests/replay.cjs` });
            await page.addScriptTag({ url: `${origin}/packages/transfers/tests/browser-adapters.cjs` });
            reports.push(await page.evaluate(({ sources, managerSource }) => {
                const implementation = window.transfers || window;
                const adapters = browserAdapters(managerSource);
                const trace = [];
                let count = 0;
                for (const source of sources) {
                    const scenarios = collectFixtures({ source, managerSource, codec: implementation, implementation, trace, ...adapters });
                    for (const [name, run] of scenarios) {
                        try { adapters.runWithTimers(run); } catch (error) { throw Error(`${name}: ${error.stack}`); }
                        count++;
                    }
                }
                return { count, trace };
            }, { sources, managerSource }));
            await page.close();
        }
        assert.deepEqual(reports[1], reports[0], 'Chromium production wire bytes, results, and timings must match legacy exactly');
        console.log(`Chromium: ${reports[0].count} unchanged scenarios passed in legacy and production; complete traces identical`);
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(buildDirectory, { recursive: true, force: true });
    }
}
runBrowserParity().catch(error => { console.error(error); process.exitCode = 1; });
