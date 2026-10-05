const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../..');
/** Stops the complete server process group, including Workers, even after failed startup. */
async function stopProcess(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    process.kill(-child.pid, 'SIGTERM');
    const timer = setTimeout(/** Terminate a process group that exceeds its cleanup or build deadline. */ () => {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }, 5000);
    try { await exited; } finally { clearTimeout(timer); }
}

/** Starts the same-origin gateway and rejects early exits with captured diagnostics. */
async function startServer(mode, base) {
    const child = spawn(process.execPath, ['tooling/serve.ts', mode, '--port', '0'], {
        cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WEBTOOLS_BASE_PATH: base, PORTAL_BASE_PATH: base, BROWSER: 'none' },
    });
    let output = '';
    try {
        const origin = await new Promise(/** Resolve gateway readiness or reject startup failures. */ (resolve, reject) => {
            const timer = setTimeout(/** Fail startup with captured gateway diagnostics. */ () => reject(new Error('Gateway startup timeout:\n' + output)), 60000);
            /** Parses the gateway readiness URL from complete output chunks. */
            const read = chunk => {
                output += chunk.toString();
                const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
                if (match) { clearTimeout(timer); resolve(match[0]); }
            };
            child.stdout.on('data', read);
            child.stderr.on('data', read);
            child.once('error', /** Propagate server launch errors and release the readiness timer. */ error => { clearTimeout(timer); reject(error); });
            child.once('exit', /** Report a gateway that exits before becoming ready. */ code => { clearTimeout(timer); reject(new Error(`Gateway exited ${code}:\n${output}`)); });
        });
        return { origin, stop: /** Stop this gateway and all of its child Workers. */ () => stopProcess(child) };
    } catch (error) { await stopProcess(child); throw error; }
}

/** Builds every independent workspace app for one common hosting prefix. */
async function build(base) {
    const child = spawn('pnpm', ['build'], {
        cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WEBTOOLS_BASE_PATH: base, PORTAL_BASE_PATH: base },
    });
    let output = '';
    child.stdout.on('data', /** Retain build output for failure diagnostics. */ chunk => { output += chunk.toString(); });
    child.stderr.on('data', /** Retain build output for failure diagnostics. */ chunk => { output += chunk.toString(); });
    const timer = setTimeout(/** Terminate a process group that exceeds its cleanup or build deadline. */ () => { void stopProcess(child); }, 180000);
    try {
        const [code] = await once(child, 'exit');
        assert.equal(code, 0, `Build at ${base} failed:\n${output}`);
    } finally { clearTimeout(timer); await stopProcess(child); }
}


/** Formats recorded events as a finite Assistants API server-sent event stream. */
function eventStream(events) {
    return events.map(/** Encode one recorded provider event as an SSE frame. */ event => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`).join('') + 'data: [DONE]\n\n';
}

/** Delivers genuine SDK-compatible message lifecycle events with malicious HTML for sanitizer checks. */
function answerEvents() {
    return [
        { event: 'thread.message.created', data: { id: 'message-2', object: 'thread.message', role: 'assistant', content: [] } },
        { event: 'thread.message.delta', data: { id: 'message-2', delta: { content: [{ index: 0, type: 'text', text: { value: '**Recorded', annotations: [] } }] } } },
        { event: 'thread.message.delta', data: { id: 'message-2', delta: { content: [{ index: 0, type: 'text', text: { value: ' result**<img src=x onerror="window.injected=true">', annotations: [] } }] } } },
        { event: 'thread.run.completed', data: { id: 'run-2', status: 'completed' } },
    ];
}

/** Mocks every provider request before it leaves Chromium; all other external traffic is denied. */
async function mockNetwork(context, origin) {
    const calls = [];
    let runs = 0;
    let failAuth = false;
    let failRun = false;
    let holdRun;
    await context.route('**/*', /** Serve local assets or recorded provider responses without external traffic. */ async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (url.origin !== 'https://api.openai.com') return route.abort();
        const body = request.postData();
        calls.push({ method: request.method(), path: url.pathname, body });
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        let value = {};
        if (url.pathname === '/v1/assistants') {
            if (failAuth) { failAuth = false; return route.fulfill({ status: 401, headers, json: { error: { message: 'Invalid API key', type: 'invalid_request_error' } } }); }
            value = request.method() === 'GET' ? { data: [{ id: 'assistant-1', name: 'Log Analyzer' }], object: 'list', has_more: false } : { id: 'assistant-1' };
        } else if (url.pathname === '/v1/threads') value = { id: 'thread-1' };
        else if (url.pathname.endsWith('/messages')) value = { id: 'message-1' };
        else if (url.pathname.endsWith('/runs')) {
            if (holdRun) await holdRun;
            runs++;
            const events = failRun ? [{ event: 'thread.run.failed', data: { id: 'run-3', status: 'failed' } }] : runs === 1 ? [{
                event: 'thread.run.requires_action', data: { id: 'run-1', status: 'requires_action', required_action: { type: 'submit_tool_outputs', submit_tool_outputs: { tool_calls: [
                    { id: 'call-1', type: 'function', function: { name: 'get', arguments: '{"message_type":"BAT"}' } },
                ] } } },
            }] : answerEvents();
            failRun = false;
            return route.fulfill({ status: 200, headers, contentType: 'text/event-stream', body: eventStream(events) });
        } else if (url.pathname === '/v1/files') value = request.method() === 'GET' ? { data: [{ id: 'old-file', filename: 'output.json' }], object: 'list', has_more: false } : { id: 'file-1' };
        return route.fulfill({ status: 200, headers, json: value });
    });
    return { calls, /** Make the next assistant lookup return the recorded 401 error. */ unauthorized() { failAuth = true; }, /** Make the next run return a recorded failure event. */ failedRun() { failRun = true; }, /** Hold subsequent run responses until the supplied promise resolves. */ hold(promise) { holdRun = promise; } };
}

/** Enters a test-only credential using the real owned React form. */
async function connect(page) {
    await page.locator('#apiKeyInput').fill('mock-key-never-live');
    await page.locator('#apiKeyForm button').click();
    await page.getByText('Connected to AI assistant!', { exact: false }).waitFor();
}

/** Covers public redirects, retained static resources, and real missing-resource responses. */
async function routes(context, origin, base) {
    const response = await context.request.get(origin + base + 'AILogAnalyzer?note=a%20b', { maxRedirects: 0 });
    assert.ok([301, 302, 307, 308].includes(response.status()));
    assert.equal(new URL(response.headers().location, origin).pathname, base + 'AILogAnalyzer/');
    assert.equal(new URL(response.headers().location, origin).search, '?note=a%20b');
    for (const file of ['AILogAnalyzer/Readme.md', 'AILogAnalyzer/logAnalyzer.js', 'AILogAnalyzer/styles.css', 'AILogAnalyzer/instructions.txt', 'AILogAnalyzer/assistantTools.json', 'images/AP_favicon.png']) {
        const result = await context.request.get(origin + base + file);
        assert.equal(result.status(), 200, file);
        assert.deepEqual(await result.body(), await fs.readFile(path.join(root, file)));
    }
    for (const file of ['AILogAnalyzer/missing.html', 'AILogAnalyzer/assets/missing.js', 'AILogAnalyzer/parser/missing.js']) {
        assert.equal((await context.request.get(origin + base + file)).status(), 404, file);
    }
    if (base !== '/') assert.equal((await context.request.get(origin + '/AILogAnalyzer/')).status(), 404);
}

/** Exercises real parser, SDK, React controls and exact multipart payload against the immutable legacy oracle. */
async function workflow(context, page, origin, base, mock, expectedBytes) {
    await page.goto(origin + base + 'AILogAnalyzer/');
    await connect(page);
    assert.equal(await page.title(), 'Log Analyzer AI');
    assert.equal(await page.evaluate(/** Inspect executed resources for accidental legacy script loading. */ () => performance.getEntriesByType('resource').some(/** Identify the retained owned legacy script URL. */ entry => new URL(entry.name).pathname.endsWith('/AILogAnalyzer/logAnalyzer.js'))), false, 'React app never executes retained owned legacy script');
    const parsed = page.waitForResponse(/** Observe the real staged parser asset becoming available. */ response => response.url().includes('/parser/vendor/parser.js'));
    await page.locator('#fileInput').setInputFiles(path.join(root, 'packages/dataflash/fixtures/plane-4.6.2-prefix.BIN'));
    await page.getByText('Log File Ready', { exact: true }).waitFor();
    // Wait for the real parser's staged import before asking for the local data.
    await parsed;
    await page.locator('#messageInput').fill('Analyze battery');
    await page.locator('#messageInput').press('Enter');
    await page.locator('#chatMessages strong').filter({ hasText: 'Recorded result' }).waitFor();
    const upload = mock.calls.find(/** Locate the provider request asserted by this workflow. */ call => call.path === '/v1/files' && call.method === 'POST');
    assert.ok(upload, 'real SDK uploaded the tool output');
    assert.ok(upload.body.includes('filename="output.json"'));
    assert.ok(upload.body.includes('\r\n\r\n' + expectedBytes + '\r\n'), 'exact typed-array JSON bytes in multipart body');
    const message = mock.calls.find(/** Locate the provider request asserted by this workflow. */ call => call.path.endsWith('/messages') && call.body.includes('Continue processing'));
    assert.deepEqual(JSON.parse(message.body).attachments, [{ file_id: 'file-1', tools: [{ type: 'code_interpreter' }] }]);
    assert.ok(mock.calls.some(/** Check that the expected provider lifecycle operation occurred. */ call => call.path.endsWith('/run-1/cancel')));
    assert.equal(await page.evaluate(/** Detect whether unsanitized provider HTML executed. */ () => window.injected), undefined);
    assert.equal(await page.locator('#chatMessages [onerror]').count(), 0);
    assert.deepEqual(await page.evaluate(/** Inspect browser storage for unintended credential persistence. */ () => ({ local: { ...localStorage }, session: { ...sessionStorage } })), { local: {}, session: {} });
    mock.failedRun();
    await page.locator('#messageInput').fill('Fail this mock run');
    await page.locator('#sendBtn').click();
    await page.getByText('Sorry, there was an error processing your request. Please try again.', { exact: true }).waitFor();
    await page.waitForFunction(/** Wait until the owned send control exits processing state. */ () => !document.querySelector('#sendBtn').disabled);
    await page.locator('#updateAssistantBtn').click();
    await page.getByRole('button', { name: 'Updated', exact: true }).waitFor();
    assert.ok(mock.calls.some(/** Check that the expected provider lifecycle operation occurred. */ call => call.method === 'DELETE' && call.path === '/v1/assistants/assistant-1'));
    for (let cycle = 0; cycle < 3; cycle++) {
        await page.goto(origin + base);
        await page.goto(origin + base + 'AILogAnalyzer/');
        await page.locator('#apiKeyInput').waitFor();
        assert.equal(await page.locator('#apiKeyInput').inputValue(), '');
        await connect(page);
    }
    let release;
    mock.hold(new Promise(/** Expose release of the interrupted mock network response. */ resolve => { release = resolve; }));
    await page.locator('#messageInput').fill('Interrupted stream');
    const request = page.waitForRequest(/** Observe the run request before navigating away. */ request => request.url().endsWith('/runs'));
    await page.locator('#sendBtn').click();
    await request;
    await page.goto(origin + base);
    release();
    mock.hold(undefined);
    await page.goto(origin + base + 'AILogAnalyzer/');
    mock.unauthorized();
    await page.locator('#apiKeyInput').fill('invalid-mock-key');
    await page.locator('#apiKeyForm button').click();
    await page.getByText('Invalid OpenAI API key (401). Please enter a valid key.', { exact: true }).waitFor();
    await page.locator('#apiKeyInput').waitFor();
    await connect(page);
}

test('AILogAnalyzer mock provider, parser and Worker gateway in Chromium root/prefix dev/build', { timeout: 600000 }, /** Run the same hermetic workflow across both hosting prefixes and server modes. */ async t => {
    const { fixtureLog, legacySession, mockProvider } = await import('./oracle.mjs');
    const log = await fixtureLog();
    const provider = mockProvider({ existing: true });
    const legacy = legacySession(provider, log);
    await legacy.run('connectIfNeeded()');
    await legacy.run('window.get("BAT")');
    const expectedBytes = JSON.parse(provider.calls.find(/** Extract the legacy upload used as the exact multipart oracle. */ ([name]) => name === 'files.create')[1]).bytes;
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true });
    try {
        for (const base of ['/Tools/WebTools/', '/']) {
            await build(base);
            for (const mode of ['dev', 'preview']) await t.test(`${mode} ${base}`, { timeout: 120000 }, /** Validate one actual gateway, Worker, and browser configuration. */ async () => {
                const server = await startServer(mode, base);
                const context = await browser.newContext();
                const errors = [];
                context.on('page', /** Attach uncaught-error capture to every page in this context. */ page => page.on('pageerror', /** Preserve unhandled browser failures for the final assertion. */ error => errors.push(error.message)));
                try {
                    const mock = await mockNetwork(context, server.origin);
                    await routes(context, server.origin, base);
                    const page = await context.newPage();
                    await workflow(context, page, server.origin, base, mock, expectedBytes);
                    assert.deepEqual(errors, []);
                } finally { await context.close(); await server.stop(); }
            });
        }
    } finally { await browser.close(); }
});
