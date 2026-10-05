import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listeningOrigin } from '../src/tooling.ts'
import { applicationBase, applicationForPath, hostingPrefix, serveAssets } from '../src/index.ts'

/** A strict fake asset binding exposes accidental rewrites and SPA fallbacks. */
const binding = { async fetch(request: Request) { return new Response(new URL(request.url).pathname === '/index.html' ? 'page' : 'missing', { status: new URL(request.url).pathname === '/index.html' ? 200 : 404 }) } }

test('mount and prefix contracts enforce path boundaries', () => {
    for (const prefix of ['/', '/Tools/WebTools/']) {
        for (const app of ['rotationCheck', 'hardwareReport', 'kinematicTools', 'scurveTool', 'pidReview', 'streamStats', 'dfuLoader', 'logFinder', 'filterTool', 'dashboardPlayback', 'simplegcs', 'thrustExpo', 'magFit', 'filterReview', 'airspeedFit', 'geofenceGenerator', 'sysid', 'aiLogAnalyzer', 'analyticTune'] as const) {
            const base = applicationBase(app, prefix)
            assert.equal(applicationForPath(base, prefix), app)
            assert.equal(applicationForPath(base + 'assets/file.js', prefix), app)
            assert.equal(applicationForPath(base.slice(0, -1), prefix), app)
            assert.equal(applicationForPath(base.slice(0, -1) + 'Extra/', prefix), 'portal')
        }
        assert.equal(applicationForPath(prefix + 'HardwareReportParameters/', prefix), 'portal')
        assert.equal(applicationForPath(prefix + 'FilterReviewPreview/', prefix), 'portal')
        assert.equal(applicationForPath(prefix + 'DashboardPlayback/', prefix), 'portal')
    }
    assert.equal(hostingPrefix('/Tools'), '/Tools/')
    for (const value of ['https://bad/', '//bad/', '/../', '/%2e/', '/a?b']) assert.throws(() => hostingPrefix(value))
})
test('asset routing preserves redirect queries and true missing errors', async () => {
    for (const application of ['rotationCheck', 'thrustExpo'] as const) {
        const base = applicationBase(application, '/Tools/')
        const routes = { base, assets: ['params.json'], pages: { '': 'index.html', 'index.html': 'index.html' } }
        const redirect = await serveAssets(new Request('https://test' + base.slice(0, -1) + '?q=1#anchor'), binding, routes)
        assert.equal(redirect.status, 308)
        assert.equal(redirect.headers.get('location'), 'https://test' + base + '?q=1#anchor')
        assert.equal(await (await serveAssets(new Request('https://test' + base), binding, routes)).text(), 'page')
        for (const path of ['missing', 'assets/missing.js', '__proto__', 'constructor', '../index.html', applicationBase(application)]) {
            const response = await serveAssets(new Request(new URL(path, 'https://test' + base)), binding, routes)
            assert.equal(response.status, 404, path)
        }
    }
})

test('Vite readiness handles plain, colored and incomplete startup output', () => {
    assert.equal(listeningOrigin('Starting…'), undefined)
    assert.equal(listeningOrigin('http://127.0.0.1:45'), undefined)
    assert.equal(listeningOrigin('http://127.0.0.1:\u001b[1m45695\u001b[22m/Tools/'), 'http://127.0.0.1:45695')
    assert.equal(listeningOrigin('http://127.0.0.1:1234/'), 'http://127.0.0.1:1234')
    assert.equal(listeningOrigin('http://127.0.0.1:\u001b['), undefined)
})

test('LogFinder owns only its public path boundary at each hosting prefix', () => {
    for (const prefix of ['/', '/Tools/WebTools/']) {
        const base = applicationBase('logFinder', prefix)
        assert.equal(base, prefix + 'LogFinder/')
        for (const suffix of ['', 'index.html', 'dataflash/vendor/parser.js']) assert.equal(applicationForPath(base + suffix, prefix), 'logFinder')
        assert.equal(applicationForPath(base.slice(0, -1), prefix), 'logFinder')
        assert.equal(applicationForPath(base.slice(0, -1) + 'Extra/', prefix), 'portal')
        assert.equal(applicationForPath(prefix + 'HardwareReportParameters/', prefix), 'portal')
        assert.equal(applicationForPath(prefix + 'FilterReviewPreview/', prefix), 'portal')
        assert.equal(applicationForPath(prefix + 'DashboardPlayback/', prefix), 'portal')
    }
})

test('complete SimpleGCS owns the public route and retires its preview', () => {
    for (const prefix of ['/', '/Tools/WebTools/']) {
        assert.equal(applicationBase('simplegcs', prefix), prefix + 'SimpleGCS/')
        assert.equal(applicationForPath(prefix + 'SimpleGCS/', prefix), 'simplegcs')
        assert.equal(applicationForPath(prefix + 'SimpleGCS', prefix), 'simplegcs')
        assert.equal(applicationForPath(prefix + 'SimpleGCS-preview/', prefix), 'portal')
        assert.equal(applicationForPath(prefix + 'SimpleGCSExtra/', prefix), 'portal')
    }
})
