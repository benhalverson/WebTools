const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { listeningOrigin } = require('@webtools/routing/tooling');
const fixture = require('../../../tests/fixtures/params.json');
const root = path.resolve(__dirname, '../../..'), base = 'e230da9';
/** Read the actual integration baseline; no modified implementation supplies expected results. */
function legacySource(file) { return execFileSync('git', ['show', `${base}:${file}`], { cwd: root, maxBuffer: 20 * 1024 * 1024 }); }
/** Terminate Vite plus Worker subprocesses even when assertions reject. */
async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const done = once(child, 'exit'); process.kill(-child.pid, 'SIGTERM');
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000);
    try { await done; } finally { clearTimeout(timer); }
}
/** Launch an independent app or shared gateway at its reported ephemeral port. */
async function start(mode, prefix, gateway = false) {
    const child = spawn(process.execPath, gateway ? ['tooling/serve.ts', mode, '--port', '0'] : ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', '0'], { cwd: gateway ? root : path.join(root, 'apps/simplegcs'), detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBTOOLS_BASE_PATH: prefix, BROWSER: 'none' } });
    let output = '';
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error(output)), 60000);
            /** Resolve chunked Vite logs only once a complete local origin is reported. */
            function read(chunk) { output += chunk; const origin = listeningOrigin(output); if (origin) { clearTimeout(timer); resolve(origin); } }
            child.stdout.on('data', read); child.stderr.on('data', read); child.on('error', reject); child.on('exit', code => { clearTimeout(timer); reject(Error(`${code}: ${output}`)); });
        }); return { origin, child };
    } catch (error) { await stop(child); throw error; }
}
/** Adapt the desktop/mobile legacy browser scenarios without changing authoritative fixtures. */
async function editorScenarios(page) {
    const dialog = page.getByRole('dialog', { name: 'Parameters', exact: true }), search = page.getByRole('searchbox', { name: 'Search parameters' });
    await page.waitForFunction(() => document.querySelectorAll('.mavparam-row').length === 6);
    await page.waitForFunction(() => document.querySelector('.mavparam-metadata').textContent.includes('Rover descriptions'));
    await search.fill('motor speed'); assert.equal(await page.locator('.mavparam-row').count(), 1);
    await page.getByRole('textbox', { name: 'TEST_I8 value', exact: true }).fill('7');
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click(); await page.getByText('TEST_I8 saved and verified.', { exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'Non-default only' }).check(); await page.getByRole('button', { name: 'Reset TEST_I8 to default' }).click();
    await page.getByText('TEST_I8 reset and verified.', { exact: true }).waitFor(); assert.equal(await page.locator('.mavparam-row').count(), 0);
    await page.getByRole('checkbox', { name: 'Non-default only' }).uncheck(); await search.fill('TEST_READONLY');
    assert.equal(await page.getByRole('textbox', { name: 'TEST_READONLY value' }).isDisabled(), true);
    await search.fill('TEST_I32');
    const downloads = [];
    for (const scope of ['all', 'changed']) {
        await page.getByLabel('Parameters to save').selectOption(scope);
        const pending = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Save to file' }).click(); const download = await pending;
        downloads.push({ name: download.suggestedFilename(), bytes: fs.readFileSync(await download.path(), 'utf8') });
    }
    assert.ok(downloads[0].bytes.includes('TEST_I32\t16777217')); assert.ok(downloads[0].bytes.includes('TEST_I8\t0'));
    await dialog.locator('input[type=file]').setInputFiles({ name: 'test.parm', mimeType: 'text/plain', buffer: Buffer.from('TEST_I32 16777219\nTEST_READONLY 0\n') });
    await page.getByText('test.parm: 1 changes', { exact: true }).waitFor(); await page.getByText('Skipped read-only parameters: TEST_READONLY', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Upload changes' }).click(); await page.getByText('Parameter file uploaded and verified.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'TEST_I32 value' }).inputValue(), '16777219');
    await search.fill('TEST_I16'); await page.getByLabel('TEST_I16 options').selectOption('2'); await dialog.getByRole('button', { name: 'Apply', exact: true }).click(); await page.getByText('TEST_I16 saved and verified.', { exact: true }).waitFor();
    await search.fill('TEST_FLOAT'); await page.getByLabel('TEST_FLOAT value', { exact: true }).fill('0.3333333333333333');
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click(); await page.getByText('TEST_FLOAT saved and verified. Reboot required for this setting.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('TEST_FLOAT value', { exact: true }).inputValue(), '0.33333334');
    await page.setViewportSize({ width: 390, height: 844 }); await search.fill('TEST_OPTIONS'); await page.getByText('Bitmask options', { exact: true }).click();
    await page.getByRole('checkbox', { name: '0: First option', exact: true }).uncheck(); await dialog.getByRole('button', { name: 'Apply', exact: true }).click(); await page.getByText('TEST_OPTIONS saved and verified.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'TEST_OPTIONS value' }).inputValue(), '4');
    // Legacy replaces rows after apply, so reopen its bitmask expander if necessary.
    if (!(await page.locator('details').getAttribute('open'))) await page.locator('details').evaluate(node => { node.open = true; });
    await page.getByRole('checkbox', { name: '31: High bit', exact: true }).check(); await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await page.getByText('TEST_OPTIONS saved and verified.', { exact: true }).waitFor(); assert.equal(await page.getByRole('textbox', { name: 'TEST_OPTIONS value' }).inputValue(), '-2147483644');
    assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)); assert.ok(await page.locator('.mavparam-row').evaluate(node => node.scrollWidth <= node.clientWidth));
    await dialog.getByRole('button', { name: 'Close', exact: true }).click(); await page.setViewportSize({ width: 1280, height: 900 });
    return downloads;
}
/** Install an independent deterministic peer for the unchanged legacy model and DOM layer. */
function setupLegacy(fixture) {
    const bytes = Uint8Array.from(fixture.hex.match(/../g), value => parseInt(value, 16)); window.uploads = [];
    const model = new MAVParam({ ftp: {
        /** Return immutable packed snapshots with checked-in defaults. */
        getFile(_path, callback) { queueMicrotask(() => callback(bytes.slice())); },
        /** Update fixture offsets from decoded writes, then acknowledge before readback. */
        putFile(_path, data, callback) {
            uploads.push([...data]); const copy = data.slice(), view = new DataView(copy.buffer); view.setUint16(4, view.getUint16(2, true), true);
            for (const p of MAVParam.decode(copy).values()) {
                const offset = fixture.offsets[p.name].offset, target = new DataView(bytes.buffer);
                if (p.type === 1) target.setInt8(offset, p.value); else if (p.type === 2) target.setInt16(offset, p.value, true); else if (p.type === 3) target.setInt32(offset, p.value, true); else target.setFloat32(offset, p.value, true);
            } queueMicrotask(() => callback(data.length));
        },
    } });
    window.ui = new MAVParamUI({ definitions: new MAVParamDefinitions({ cache: undefined,
        /** Replay the same existing parameter metadata plus enum/high-bit cases. */
        fetch: async () => new Response(JSON.stringify({ Rover: {
            TEST_I8: { DisplayName: 'Motor speed', Description: 'Adjust the motor test speed', Range: { low: '-128', high: '127' } },
            TEST_I16: { Description: 'Mode selection', Values: { '-1234': 'Factory', '2': 'Alternate' } },
            TEST_FLOAT: { Description: 'Floating point setting', Units: 'm', Increment: '0.1', RebootRequired: 'True' },
            TEST_OPTIONS: { Description: 'Option flags', Bitmask: { 0: 'First option', 2: 'Third option', 31: 'High bit' } },
            TEST_READONLY: { Description: 'A read-only parameter', ReadOnly: 'True' },
        } })),
    }) }); ui.setClient(model, 'Rover'); ui.open();
}
/** Exercise failed writes, cancelled reads, stale callbacks, file ordering, and repeated cleanup. */
async function faults(page) {
    await page.getByRole('button', { name: 'Parameters', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Parameters', exact: true }), search = page.getByRole('searchbox', { name: 'Search parameters' });
    await search.fill('TEST_I32');
    await page.evaluate(() => {
        window.put = session.model.ftp.putFile;
        /** Reject an upload before it can change the simulated vehicle. */
        session.model.ftp.putFile = (_path, _data, done) => done(null);
    });
    await dialog.locator('input[type=file]').setInputFiles({ name: 'retry.parm', mimeType: 'text/plain', buffer: Buffer.from('TEST_I32 16777221\n') });
    await dialog.getByRole('button', { name: 'Upload changes' }).click(); await page.getByText(/close was not acknowledged/).waitFor();
    await page.getByText('retry.parm: 1 changes', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('TEST_I32 value', { exact: true }).inputValue(), '16777219');
    await page.evaluate(() => { session.model.ftp.putFile = put; });
    await dialog.getByRole('button', { name: 'Upload changes' }).click();
    await dialog.getByRole('button', { name: 'Cancel operation' }).click();
    await page.getByText(/close was not acknowledged/).waitFor();
    await page.getByText('retry.parm: 1 changes', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Upload changes' }).click(); await page.getByText('Parameter file uploaded and verified.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('TEST_I32 value', { exact: true }).inputValue(), '16777221');
    await dialog.locator('input[type=file]').setInputFiles({ name: 'cancel.parm', mimeType: 'text/plain', buffer: Buffer.from('TEST_I32 16777222\n') });
    await dialog.getByRole('button', { name: 'Upload changes' }).click(); await dialog.getByRole('button', { name: 'Cancel operation' }).click();
    await page.getByText(/close was not acknowledged/).waitFor(); await page.getByText('cancel.parm: 1 changes', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Upload changes' }).click(); await page.getByText('Parameter file uploaded and verified.', { exact: true }).waitFor();
    await page.getByLabel('TEST_I32 value', { exact: true }).fill('2147483648'); await dialog.getByRole('button', { name: 'Apply', exact: true }).click(); await page.getByText(/does not fit parameter type/).waitFor();
    // Simulate a close acknowledgement without retaining the value.
    await page.evaluate(() => { session.model.ftp.putFile = (_path, data, done) => done(data.length); });
    await page.getByLabel('TEST_I32 value', { exact: true }).fill('16777223'); await dialog.getByRole('button', { name: 'Apply', exact: true }).click(); await page.getByText(/did not retain requested values/).waitFor();
    await page.evaluate(() => { session.model.ftp.putFile = put; });
    for (let iteration = 0; iteration < 3; iteration++) {
        await dialog.getByRole('button', { name: 'Fetch parameters', exact: true }).click(); await dialog.getByRole('button', { name: 'Cancel operation', exact: true }).click(); await page.getByText('Parameter download failed', { exact: true }).waitFor();
        await dialog.getByRole('button', { name: 'Fetch parameters', exact: true }).click(); await page.getByText('Parameters refreshed.', { exact: true }).waitFor();
    }
    for (const text of ['UNKNOWN 1', 'TEST_I32 nope', 'TEST_I32 1\nTEST_I32 2']) {
        await dialog.locator('input[type=file]').setInputFiles({ name: 'invalid.parm', mimeType: 'text/plain', buffer: Buffer.from(text) });
        await page.locator('.mavparam-error').waitFor(); assert.equal(await page.locator('.mavparam-import').count(), 0);
    }
    await dialog.locator('input[type=file]').setInputFiles({ name: 'vehicle.params', mimeType: 'text/plain', buffer: Buffer.from('1 1 TEST_I32 -2147483648 6\r\n') });
    await page.getByText('vehicle.params: 1 changes', { exact: true }).waitFor(); await dialog.getByRole('button', { name: 'Cancel import' }).click();
    await page.evaluate(() => {
        for (let index = 0; index < 60; index++) session.model.params.set(`EXTRA_${index}`, { name: `EXTRA_${index}`, value: index, type: 3, defaultValue: index });
        session.model.emit();
    });
    await search.fill(''); assert.equal(await page.locator('.mavparam-row').count(), 50); await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    assert.equal(await page.locator('.mavparam-row').count(), 16); await search.fill('TEST_I32'); assert.equal(await page.locator('.mavparam-row').count(), 1);
    // A late metadata refresh must preserve and revalidate a file selected in the meantime.
    await page.evaluate(() => {
        window.loadDefinitions = session.definitions.load;
        /** Hold a refresh while the user prepares a file import. */
        session.definitions.load = () => new Promise(resolve => { window.metadataRefresh = resolve; });
    });
    await dialog.getByRole('button', { name: 'Refresh descriptions' }).click();
    await dialog.locator('input[type=file]').setInputFiles({ name: 'metadata-race.parm', mimeType: 'text/plain', buffer: Buffer.from('TEST_I32 3') });
    await page.getByText('metadata-race.parm: 1 changes', { exact: true }).waitFor();
    await page.evaluate(() => { metadataRefresh({ definitions: session.model.definitions, stale: false, cached: true }); session.definitions.load = loadDefinitions; });
    await page.getByText('Rover descriptions (cached).', { exact: true }).waitFor(); await page.getByText('metadata-race.parm: 1 changes', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Cancel import' }).click();
    // File A resolves after B: only B may own the pending import.
    await page.evaluate(() => {
        window.originalText = File.prototype.text;
        /** Hold one browser File read until the test releases it. */
        File.prototype.text = function () { if (this.name === 'old.parm') return new Promise(resolve => { window.releaseFile = resolve; }); return originalText.call(this); };
    });
    await dialog.locator('input[type=file]').setInputFiles({ name: 'old.parm', mimeType: 'text/plain', buffer: Buffer.from('TEST_I32 1') });
    await dialog.locator('input[type=file]').setInputFiles({ name: 'new.parm', mimeType: 'text/plain', buffer: Buffer.from('TEST_I32 2') });
    await page.getByText('new.parm: 1 changes', { exact: true }).waitFor(); await page.evaluate(() => { releaseFile('TEST_I32 1'); File.prototype.text = originalText; });
    await page.getByText('new.parm: 1 changes', { exact: true }).waitFor(); await dialog.getByRole('button', { name: 'Cancel import' }).click();
    // Hold metadata and file completions together across a provider/session replacement.
    await page.evaluate(() => {
        /** Retain metadata from the current account until its session is obsolete. */
        session.definitions.load = () => new Promise(resolve => { window.releaseMetadata = resolve; });
        /** Hold a file whose old account name must never appear in the replacement UI. */
        File.prototype.text = () => new Promise(resolve => { window.releaseOldFile = resolve; });
    });
    await dialog.getByRole('button', { name: 'Refresh descriptions' }).click();
    await dialog.locator('input[type=file]').setInputFiles({ name: 'old-account.parm', mimeType: 'text/plain', buffer: Buffer.from('TEST_I32 1') });
    await page.evaluate(() => {
        window.retired = session; simplegcsPreview.unmount(); simplegcsPreview.mount();
    });
    await page.waitForFunction(() => session && session !== retired);
    await page.getByRole('button', { name: 'Parameters', exact: true }).click();
    await page.getByText('Parameters refreshed.', { exact: true }).waitFor();
    await page.evaluate(() => {
        releaseMetadata({ definitions: new Map([['TEST_I32', { description: 'STALE ACCOUNT' }]]), cached: false, stale: false });
        releaseOldFile('TEST_I32 1'); File.prototype.text = originalText;
    });
    await search.fill('TEST_I32');
    assert.equal(await page.getByText('STALE ACCOUNT', { exact: true }).count(), 0);
    assert.equal(await page.getByText('old-account.parm: 1 changes', { exact: true }).count(), 0);
    // Metadata and file reads from a departed account must not populate its replacement.
    await page.evaluate(() => {
        window.departed = session;
        /** Hold metadata independently of model operations to force a cross-session race. */
        session.definitions.load = () => new Promise(resolve => { window.releaseMetadata = resolve; });
        /** Hold a selected file until the owning session has been disposed. */
        File.prototype.text = function () { return new Promise(resolve => { window.releaseDepartedFile = resolve; }); };
    });
    await dialog.getByRole('button', { name: 'Refresh descriptions' }).click();
    await dialog.locator('input[type=file]').setInputFiles({ name: 'departed.parm', mimeType: 'text/plain', buffer: Buffer.from('TEST_I32 9') });
    await page.evaluate(() => { simplegcsPreview.unmount(); File.prototype.text = originalText; simplegcsPreview.mount(); });
    await page.waitForFunction(() => session && session !== departed);
    await page.evaluate(() => {
        releaseMetadata({ definitions: new Map([['STALE', { description: 'departed account' }]]), stale: false, cached: false });
        releaseDepartedFile('TEST_I32 9');
    });
    await page.getByRole('button', { name: 'Parameters', exact: true }).click(); await page.getByText('Parameters refreshed.', { exact: true }).waitFor();
    assert.equal(await page.locator('.mavparam-import').count(), 0);
    assert.equal(await page.evaluate(() => session.model.definitions.has('STALE')), false);
    // Save a callback across unmount and then deliver it into a replacement session.
    await page.evaluate(() => {
        window.oldSession = session;
        /** Retain stale completion to prove generation checks suppress its values. */
        session.model.ftp.getFile = (_path, callback) => { window.late = callback; };
    });
    await dialog.getByRole('button', { name: 'Fetch parameters', exact: true }).click();
    await page.evaluate(() => simplegcsPreview.unmount());
    assert.equal(await page.evaluate(() => oldSession.model.connected), false);
    await page.evaluate(() => { late(Uint8Array.from([0])); simplegcsPreview.mount(); });
    await page.waitForFunction(() => window.session && session !== oldSession);
    assert.equal(await page.evaluate(() => oldSession.model.params.size), 0);
    assert.equal(await page.evaluate(() => session.model.params.size), 0);
    for (let iteration = 0; iteration < 3; iteration++) {
        await page.getByRole('button', { name: 'Parameters', exact: true }).click(); await page.getByText('Parameters refreshed.', { exact: true }).waitFor();
        await page.evaluate(() => { window.oldSession = session; simplegcsPreview.unmount(); });
        assert.equal(await page.evaluate(() => oldSession.model.connected), false); assert.equal(await page.evaluate(() => oldSession.model.busy), false);
        await page.evaluate(() => simplegcsPreview.mount()); await page.waitForFunction(() => session && session !== oldSession);
    }
    await page.locator('#connectBtn').click(); await page.locator('#disconnection_button').click(); await page.waitForFunction(() => session === null);
    await page.getByRole('button', { name: 'Close', exact: true }).filter({ visible: true }).click();
    await page.getByRole('button', { name: 'Parameters', exact: true }).click(); assert.equal(await dialog.getByRole('button', { name: 'Fetch parameters' }).isDisabled(), true);
}
/** Compare actual desktop/mobile browser output and exercise failures with all external requests blocked. */
async function scenarios(browser, origin, prefix, compare) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true });
    try {
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await context.addInitScript(() => {
            window.uploads = [];
            window.SIMPLEGCS_PREVIEW = {
                /** Observe the real typed model and capture wire bytes without replacing its protocol implementation. */
                onParameters(value) {
                    window.session = value;
                    if (!value) return;
                    const put = value.model.ftp.putFile.bind(value.model.ftp);
                    /** Capture exact serialized uploads before forwarding to the deterministic peer. */
                    value.model.ftp.putFile = (path, data, callback, options) => { uploads.push([...data]); put(path, data, callback, options); };
                },
            };
        });
        const page = await context.newPage(), errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
        page.on('response', response => { if (response.status() >= 400) console.error(response.status(), response.url()); });
        page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
        await page.goto(origin + prefix + 'SimpleGCS-preview/'); await page.locator('#connectBtn').click(); await page.locator('#connection_button').click();
        await page.waitForFunction(() => window.session); await page.getByRole('button', { name: 'Parameters', exact: true }).click();
        let actual;
        try { actual = await editorScenarios(page); } catch (error) { console.error(await page.locator('.mavparam-dialog').innerText()); console.error(await page.evaluate(() => ({ connected: session?.model.connected, busy: session?.model.busy, uploads }))); throw error; }
        const actualUploads = await page.evaluate(() => uploads);
        assert.equal(Buffer.from(actualUploads[2]).toString('hex'), fixture.uploadHex);
        if (compare) {
            await context.route('**/legacy-parameters.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/legacy-ui.css"><script src="/legacy-model.js"></script><script src="/legacy-ui.js"></script>' }));
            for (const [url, file, type] of [['legacy-model.js', 'mavparam.js', 'text/javascript'], ['legacy-ui.js', 'mavparam-ui.js', 'text/javascript'], ['legacy-ui.css', 'mavparam-ui.css', 'text/css']]) await context.route(`**/${url}`, route => route.fulfill({ body: legacySource('modules/MAVLink/' + file), contentType: type }));
            const legacy = await context.newPage(); await legacy.goto(origin + '/legacy-parameters.html'); await legacy.evaluate(setupLegacy, fixture);
            assert.deepEqual(actual, await editorScenarios(legacy), 'all/non-default files exactly match actual branch-base legacy bytes and names');
            assert.deepEqual(actualUploads, await legacy.evaluate(() => uploads), 'all edited values produce identical serialized protocol bytes'); await legacy.close();
        }
        await faults(page); assert.deepEqual(errors, []);
        assert.equal((await page.request.get(origin + prefix + 'SimpleGCS-preview/no-such-page')).status(), 404);
    } finally { await context.close(); }
}
/** Run independent root/prefix dev and production Worker previews, then the same-origin gateway. */
async function main() {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) });
    try {
        for (const prefix of ['/', '/Tools/WebTools/']) for (const mode of ['dev', 'preview']) {
            if (mode === 'preview') execFileSync('pnpm', ['--filter', 'simplegcs', 'build'], { cwd: root, stdio: 'pipe', env: { ...process.env, WEBTOOLS_BASE_PATH: prefix } });
            const server = await start(mode, prefix);
            try { await scenarios(browser, server.origin, prefix, mode === 'preview'); console.log(`PASS parameters ${mode} ${prefix}`); } finally { await stop(server.child); }
        }
        const server = await start('dev', '/Tools/WebTools/', true);
        try {
            await scenarios(browser, server.origin, '/Tools/WebTools/', false);
            const response = await fetch(server.origin + '/Tools/WebTools/SimpleGCS/app.js'); assert.equal(response.status, 200);
            assert.deepEqual(Buffer.from(await response.arrayBuffer()), legacySource('SimpleGCS/app.js'));
            console.log('PASS parameters same-origin gateway; public legacy bytes unchanged');
        } finally { await stop(server.child); }
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
