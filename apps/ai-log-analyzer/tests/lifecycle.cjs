const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const { chromium } = require('playwright');

/** Create a controllable response boundary without sending a provider request. */
function deferred() {
    let resolve;
    const promise = new Promise(/** Retain the mock response release callback. */ done => { resolve = done; });
    return { promise, release: resolve };
}

/** Encode genuine SDK-compatible image deltas in a finite recorded SSE response. */
function imageEvents(file = 'graph') {
    return `event: thread.message.delta\ndata: ${JSON.stringify({ id: 'message', delta: { content: [{ index: 0, type: 'image_file', image_file: { file_id: file } }] } })}\n\ndata: [DONE]\n\n`;
}

/** Mock all provider traffic and block every other external destination. */
async function network(context, origin) {
    const calls = [];
    let mode = 'image';
    let pending;
    await context.route('**/*', /** Keep responses local even when the actual pinned SDK sends requests. */ async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (url.origin !== 'https://api.openai.com') return route.abort();
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        calls.push(url.pathname);
        let json = {};
        if (url.pathname === '/v1/assistants') {
            if (mode === 'late-connect') await pending.promise;
            json = { data: [{ id: 'assistant', name: 'Log Analyzer' }], object: 'list', has_more: false };
        } else if (url.pathname === '/v1/threads') json = { id: 'thread' };
        else if (url.pathname.endsWith('/messages')) json = { id: 'message' };
        else if (url.pathname.endsWith('/runs')) {
            if (mode === 'interrupt') await pending.promise;
            return route.fulfill({ headers, contentType: 'text/event-stream', body: imageEvents(mode === 'image-error' ? 'bad-graph' : 'graph') }).catch(/** An aborted request may disappear before its mocked response is released. */ () => {});
        } else if (url.pathname === '/v1/files/bad-graph/content') {
            return route.fulfill({ status: 400, headers, json: { error: { message: 'Recorded unavailable graph', type: 'invalid_request_error' } } });
        } else if (url.pathname === '/v1/files/graph/content') {
            return route.fulfill({ headers, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
        }
        return route.fulfill({ headers, json });
    });
    return {
        calls,
        /** Select the recorded outcome for the next SDK request. */
        mode(value) { mode = value; },
        /** Hold a mocked provider response until the application has unmounted. */
        hold(value) { mode = value; pending = deferred(); return pending; },
    };
}

/** Instrument browser-owned resources before the test fixture creates any React tree. */
async function instrumentation(page) {
    await page.addInitScript(/** Track application timers, object URLs and SDK request aborts. */ () => {
        const intervals = new Set();
        const updates = new Set();
        const urls = new Set();
        let aborts = 0;
        const setInterval = window.setInterval.bind(window);
        const clearInterval = window.clearInterval.bind(window);
        const setTimeout = window.setTimeout.bind(window);
        const clearTimeout = window.clearTimeout.bind(window);
        const create = URL.createObjectURL.bind(URL);
        const revoke = URL.revokeObjectURL.bind(URL);
        const fetch = window.fetch.bind(window);
        window.setInterval = /** Track thinking intervals while retaining native timer semantics. */ (...args) => {
            const id = setInterval(...args); if (args[1] === 500) intervals.add(id); return id;
        };
        window.clearInterval = /** Remove only a timer actually released by the application. */ id => { intervals.delete(id); clearInterval(id); };
        window.setTimeout = /** Track the update button's three-second reset timer. */ (...args) => {
            const id = setTimeout(...args); if (args[1] === 3000) updates.add(id); return id;
        };
        window.clearTimeout = /** Record cancellation of the pending update reset. */ id => { updates.delete(id); clearTimeout(id); };
        URL.createObjectURL = /** Track graph URLs before rendering can reference them. */ blob => { const url = create(blob); urls.add(url); return url; };
        URL.revokeObjectURL = /** Record graph release during the component cleanup. */ url => { urls.delete(url); revoke(url); };
        window.fetch = /** Observe the real SDK AbortSignal without changing its transport. */ (input, init) => {
            const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
            signal?.addEventListener('abort', /** Record disposal of an active SDK stream. */ () => { aborts++; }, { once: true });
            return fetch(input, init);
        };
        window.lifecycle = /** Report retained resources without exposing provider credentials. */ () => ({ intervals: intervals.size, updates: updates.size, urls: urls.size, aborts });
    });
}

/** Submit a mock-only key through the real credential form. */
async function connect(page) {
    await page.locator('#apiKeyInput').fill('mock-only-no-provider-calls');
    await page.locator('#apiKeyForm button').click();
    await page.getByText('Connected to AI assistant!', { exact: false }).waitFor();
}

/** Start a request using the actual owned chat controls. */
async function send(page) {
    await page.locator('#messageInput').fill('Show recorded graph');
    await page.locator('#sendBtn').click();
}

/** Verify resources and late continuations across real same-document mount boundaries. */
async function exercise(page, mock) {
    for (let cycle = 0; cycle < 3; cycle++) {
        await page.locator('#mount').click();
        if (cycle === 0) {
            await page.locator('#apiKeyInput').fill('unsent-secret');
            await page.locator('.close-modal').click();
            await send(page);
            await page.locator('#apiKeyInput').waitFor();
            assert.equal(await page.locator('#apiKeyInput').inputValue(), '');
        }
        await connect(page);
        mock.mode('image');
        await send(page);
        await page.locator('#vizArea img').waitFor();
        await page.locator('#vizArea img').click();
        assert.equal(await page.locator('.full-size-image-view img').count(), 1);
        await page.locator('.full-size-image-view').click();
        await page.waitForFunction(/** Wait for stream controls to unlock. */ () => !document.querySelector('#sendBtn').disabled);
        mock.mode('image-error');
        await send(page);
        await page.getByText('Failed to load a graph for visualization.', { exact: false }).waitFor();
        await page.locator('#updateAssistantBtn').click();
        await page.getByRole('button', { name: 'Updated', exact: true }).waitFor();
        assert.equal((await page.evaluate(/** Read native resource instrumentation. */ () => window.lifecycle())).urls, 1);
        assert.equal((await page.evaluate(/** Read the pending update timer. */ () => window.lifecycle())).updates, 1);
        await page.locator('#unmount').click();
        const resources = await page.evaluate(/** Read remaining owned resources after React cleanup. */ () => window.lifecycle());
        assert.equal(resources.urls, 0);
        assert.equal(resources.intervals, 0);
        assert.equal(resources.updates, 0);
    }
    await page.locator('#mount').click();
    await connect(page);
    const pending = mock.hold('interrupt');
    const request = page.waitForRequest(/** Observe the run before releasing its recorded response. */ request => request.url().endsWith('/runs'));
    await send(page);
    await request;
    await page.waitForFunction(/** Confirm the thinking indicator owns an active interval. */ () => window.lifecycle().intervals === 1);
    const beforeAbort = (await page.evaluate(/** Snapshot stream abort count before disposal. */ () => window.lifecycle())).aborts;
    await page.locator('#unmount').click();
    await page.waitForFunction(/** Require the actual SDK request to be aborted on unmount. */ before => window.lifecycle().aborts > before, beforeAbort);
    const count = mock.calls.length;
    pending.release();
    await page.waitForTimeout(200);
    assert.equal(mock.calls.length, count, 'late stream must not fetch its image after unmount');
    assert.equal((await page.evaluate(/** Verify interrupted thinking timers were cleared. */ () => window.lifecycle())).intervals, 0);
    const late = mock.hold('late-connect');
    await page.locator('#mount').click();
    await page.locator('#apiKeyInput').fill('mock-late-connect');
    const assistant = page.waitForRequest(/** Observe the held assistant lookup. */ request => new URL(request.url()).pathname.endsWith('/assistants'));
    await page.locator('#apiKeyForm button').click();
    await assistant;
    await page.locator('#unmount').click();
    const afterUnmount = mock.calls.length;
    late.release();
    await page.waitForTimeout(200);
    assert.equal(mock.calls.length, afterUnmount, 'late assistant lookup must not create a conversation');
}

test('real React same-document lifetime cleanup in dev and production bundles', { timeout: 180000 }, /** Build a separate test harness and exercise both serving modes without touching app artifacts. */ async () => {
    const app = path.resolve(__dirname, '..');
    const vite = await import(pathToFileURL(require.resolve('vite', { paths: [app] })).href);
    const output = await mkdtemp(path.join(tmpdir(), 'ai-analyzer-lifecycle-'));
    process.env.ANALYZER_LIFECYCLE_OUTPUT = output;
    const configFile = path.join(__dirname, 'lifecycle.vite.mjs');
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true });
    try {
        await vite.build({ configFile, logLevel: 'error' });
        for (const mode of ['dev', 'built']) {
            const server = mode === 'dev' ? await vite.createServer({ configFile, logLevel: 'error' }) : await vite.preview({ configFile, logLevel: 'error' });
            if (mode === 'dev') await server.listen();
            const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
            const context = await browser.newContext();
            try {
                const page = await context.newPage();
                const errors = [];
                page.on('pageerror', /** Capture uncaught errors throughout mount/dispose sequences. */ error => errors.push(error.message));
                await instrumentation(page);
                const mock = await network(context, origin);
                await page.goto(origin);
                await exercise(page, mock);
                assert.deepEqual(errors, [], mode + ' uncaught browser errors');
            } finally {
                await context.close();
                if (mode === 'dev') await server.close();
                else await new Promise(/** Wait until the standalone preview listener is released. */ resolve => server.httpServer.close(resolve));
            }
        }
    } finally {
        await browser.close();
        await rm(output, { recursive: true, force: true });
        delete process.env.ANALYZER_LIFECYCLE_OUTPUT;
    }
});
