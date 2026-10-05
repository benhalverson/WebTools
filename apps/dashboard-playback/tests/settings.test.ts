import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { compressLayout, decompressLayout, dashboardLink, readSettings } from '../src/settings.ts'
import { applicationBase, applicationForPath } from '@webtools/routing'

// Actual unchanged legacy comparison revision, before this issue's implementation.
const base = '26687a5f54352699bb7d3ff3c9c811794043cf71'
const source = execFileSync('git', ['show', `${base}:TelemetryDashboard/TelemetryDashboard.js`], { encoding: 'utf8' })
const oracle = vm.createContext({ TextEncoder, CompressionStream, DecompressionStream, Response, Uint8Array, btoa, atob, URL, URLSearchParams })
vm.runInContext(source, oracle)

test('legacy scripts and authoritative saved layouts stay byte-identical to the prerequisite base', async () => {
    for (const file of ['TelemetryDashboard.js', 'index.html', 'Default_Layout.json', 'Widgets/SandBox.html']) {
        assert.deepEqual(await readFile(`TelemetryDashboard/${file}`), execFileSync('git', ['show', `${base}:TelemetryDashboard/${file}`]))
    }
})

test('compressed layouts and dashboard links match unchanged legacy exact bytes', async () => {
    for (const json of [await readFile('TelemetryDashboard/Default_Layout.json', 'utf8'), '{"unicode":"🛩 é","zero":-0,"value":0.125}']) {
        oracle.json = json
        const expected = await vm.runInContext('compress_layout(json)', oracle)
        assert.equal(await compressLayout(json), expected)
        assert.equal(await decompressLayout(expected), json)
        assert.equal(await vm.runInContext('decompress_layout(json = ' + JSON.stringify(expected) + ')', oracle), json)
    }
    const href = 'https://example.test/Tools/DashboardPlayback/?discard=1#old'
    for (const settings of [readSettings(''), readSettings('#ws=ws%3A%2F%2Flocalhost%3A1234&heartbeat=0&sysid=42&compid=0&signing=+secret+')]) {
        oracle.settings = settings; oracle.window = { location: { href } }; oracle.fixture = { header: { version: 1 }, widgets: {} }
        vm.runInContext('get_connection_params = () => settings; get_layout = () => fixture', oracle)
        assert.equal(await dashboardLink(href, settings, JSON.stringify(oracle.fixture)), await vm.runInContext('get_dashboard_link()', oracle))
    }
    await assert.rejects(decompressLayout('%%%'))
})

test('hash settings preserve legacy truthiness, IDs, whitespace and defaults', () => {
    assert.deepEqual(readSettings(''), { ws: '', heartbeat: false, sysid: '254', compid: '190', signing: '' })
    assert.deepEqual(readSettings('#ws=wss%3A%2F%2Fexample.test&heartbeat=0&sysid=0&compid=255&signing=+key+'), {
        ws: 'wss://example.test', heartbeat: true, sysid: '0', compid: '255', signing: ' key ',
    })
})

test('playback routing leaves the public dashboard and unrelated routes with the portal', () => {
    for (const prefix of ['/', '/Tools/WebTools/']) {
        const base = applicationBase('dashboardPlayback', prefix)
        assert.equal(applicationForPath(base, prefix), 'dashboardPlayback')
        assert.equal(applicationForPath(base.slice(0, -1), prefix), 'dashboardPlayback')
        assert.equal(applicationForPath(prefix + 'TelemetryDashboard/', prefix), 'portal')
        assert.equal(applicationForPath(prefix + 'DashboardPlaybackExtra/', prefix), 'portal')
    }
})
