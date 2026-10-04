import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { parseLayout, serializeLayout, messageChoices, messageFields, widgetSandbox, telemetryChannel } from '../dist/index.js'
const root = new URL('../../../', import.meta.url)

/** Compare byte-for-byte using the unchanged legacy serializer body and authoritative saved file. */
test('saved layout round trip retains JSON data, custom source, null geometry, and serialization bytes', async () => {
    const source = await readFile(new URL('TelemetryDashboard/Default_Layout.json', root), 'utf8')
    const layout = parseLayout(source)
    assert.equal(serializeLayout(layout), source)
    const legacy = await readFile(new URL('TelemetryDashboard/TelemetryDashboard.js', root), 'utf8')
    const serializer = legacy.slice(legacy.indexOf('function get_widget_object'), legacy.indexOf('// Save the layout'))
    const context = vm.createContext({ document: { getElementById: () => ({ style: { backgroundColor: layout.grid.color } }) }, grid: {
        opts: { column: layout.grid.columns, maxRow: layout.grid.rows },
        getGridItems: () => Object.values(layout.widgets).map(widget => ({
            getAttribute: key => widget[key.slice(3)], constructor: { name: widget.type }, get_options: () => widget.options,
        })),
    } })
    vm.runInContext(serializer, context)
    assert.equal(serializeLayout(layout), vm.runInContext('JSON.stringify(get_layout(), null, 2)', context))
    assert.deepEqual(parseLayout(serializeLayout(layout)), layout)
})

/** Structural validation must reject bad models before a host can allocate frames or grids. */
test('invalid boundaries fail explicitly; arbitrary dynamic fields survive', () => {
    assert.throws(() => parseLayout('{}'), /Invalid/)
    const layout = { header: { version: 1 }, grid: { rows: '2', columns: 2, color: '#fff' }, widgets: {} }
    assert.deepEqual(parseLayout(JSON.stringify(layout)), layout)
    layout.widgets[0] = { x: null, y: null, w: 1, h: 1, type: 'Other', options: {} }
    assert.throws(() => parseLayout(JSON.stringify(layout)), /Unknown/)
})

/** Helpers preserve selector labels, sorting, field order and unknown-message sentinel. */
test('dynamic fields and protocol constants match the existing contracts', () => {
    const catalog = {
        2: { type: class { _id = 2; _name = 'Z'; fieldnames = ['b', 'a'] } },
        1: { type: class { _id = 1; _name = 'A'; fieldnames = ['c'] } },
    }
    assert.deepEqual(messageChoices(catalog), [{ value: '1', label: 'A (1)' }, { value: '2', label: 'Z (2)' }])
    assert.deepEqual(messageFields(catalog, '2'), ['b', 'a'])
    assert.deepEqual(messageFields(catalog, '404'), ['Unknown message'])
    assert.equal(widgetSandbox, 'allow-scripts allow-same-origin')
    assert.equal(telemetryChannel, 'MAVLinkMSG')
})

/** The security-sensitive iframe document remains byte-identical to the comparison revision. */
test('sandbox document is unchanged and package has no application-source imports', async () => {
    assert.deepEqual(await readFile(new URL('../assets/SandBox.html', import.meta.url)), await readFile(new URL('TelemetryDashboard/Widgets/SandBox.html', root)))
    for (const name of ['index', 'runtime', 'model', 'forms']) {
        assert.doesNotMatch(await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), /from\s+['"].*(?:apps\/|TelemetryDashboard\/|VideoOverlay\/)/)
    }
})

/** Match legacy download bytes for each authoritative standalone built-in widget. */
test('standalone saved widgets retain their download format', async () => {
    const { parseWidget, serializeWidget } = await import('../dist/index.js')
    for (const name of ['Value', 'Graph', 'Stats', 'Messages', 'Map', 'Attitude', 'MAVLink_Inspector']) {
        const source = await readFile(new URL(`TelemetryDashboard/SandBoxWidgets/${name}.json`, root), 'utf8')
        assert.deepEqual(parseWidget(source), JSON.parse(source))
        // Some checked-in fixtures have hand-formatted empty objects; legacy downloads
        // serialize their parsed value rather than copying source whitespace.
        assert.equal(serializeWidget(parseWidget(source).widget), JSON.stringify(JSON.parse(source), null, 2))
    }
})
