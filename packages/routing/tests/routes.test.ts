import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listeningOrigin } from '../src/tooling.ts'
import { applicationBase, applicationForPath, hostingPrefix, serveAssets } from '../src/index.ts'

/** A strict fake asset binding exposes accidental rewrites and SPA fallbacks. */
const binding = { async fetch(request: Request) { return new Response(new URL(request.url).pathname === '/index.html' ? 'page' : 'missing', { status: new URL(request.url).pathname === '/index.html' ? 200 : 404 }) } }

test('mount and prefix contracts enforce path boundaries', () => {
    for (const prefix of ['/', '/Tools/WebTools/']) {
        for (const app of ['rotationCheck', 'hardwareParameters', 'pidReview'] as const) {
            const base = applicationBase(app, prefix)
            assert.equal(applicationForPath(base, prefix), app)
            assert.equal(applicationForPath(base.slice(0, -1), prefix), app)
            assert.equal(applicationForPath(base.slice(0, -1) + 'Extra/', prefix), 'portal')
        }
        assert.equal(applicationForPath(prefix + 'HardwareReport/', prefix), 'portal')
    }
    assert.equal(hostingPrefix('/Tools'), '/Tools/')
    for (const value of ['https://bad/', '//bad/', '/../', '/%2e/', '/a?b']) assert.throws(() => hostingPrefix(value))
})
test('asset routing preserves redirect queries and true missing errors', async () => {
    const routes = { base: '/Tools/RotationCheck/', assets: [], pages: { '': 'index.html', 'index.html': 'index.html' } }
    const redirect = await serveAssets(new Request('https://test/Tools/RotationCheck?q=1#anchor'), binding, routes)
    assert.equal(redirect.status, 308)
    assert.equal(redirect.headers.get('location'), 'https://test/Tools/RotationCheck/?q=1#anchor')
    assert.equal(await (await serveAssets(new Request('https://test/Tools/RotationCheck/'), binding, routes)).text(), 'page')
    for (const path of ['missing', 'assets/missing.js', '__proto__', 'constructor', '../index.html', '/RotationCheck/']) {
        const response = await serveAssets(new Request(new URL(path, 'https://test/Tools/RotationCheck/')), binding, routes)
        assert.equal(response.status, 404, path)
    }
})

test('Vite readiness handles plain, colored and incomplete startup output', () => {
    assert.equal(listeningOrigin('Starting…'), undefined)
    assert.equal(listeningOrigin('http://127.0.0.1:45'), undefined)
    assert.equal(listeningOrigin('http://127.0.0.1:\u001b[1m45695\u001b[22m/Tools/'), 'http://127.0.0.1:45695')
    assert.equal(listeningOrigin('http://127.0.0.1:1234/'), 'http://127.0.0.1:1234')
    assert.equal(listeningOrigin('http://127.0.0.1:\u001b['), undefined)
})
