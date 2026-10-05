import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import vm from 'node:vm'
import { parseParameterFile, buildReport } from '../src/model/report.ts'
import { exportGroups, exportParameters, availableGroups } from '../src/model/exports.ts'
import fixtures from './fixtures.cjs'
import { offsetTraces, offsetLayout } from '../src/plot.ts'

const revision = '0f4607db3dccbc7d06e5847c02465dab38d1eb80'
/** Read the immutable branch-base implementation, never the migrated implementation. */
function source(path) { return execFileSync('git', ['show', `${revision}:${path}`], { encoding: 'utf8' }) }
const legacy = source('HardwareReport/HardwareReport.js')
/** Extract complete top-level declarations, retaining their unchanged function bodies. */
function declaration(name) {
    const start = legacy.indexOf(`function ${name}(`)
    return legacy.slice(start, legacy.indexOf('\n}\n', start) + 3)
}
/** Minimal DOM node collecting rendered strings without simulating application logic. */
function node(tag) {
    return { tag, children: [], hidden: true, previousElementSibling: {}, innerHTML: '',
        appendChild(child) { this.children.push(child); return child } }
}
/** Flatten DOM content in render order, as visible text does. */
function text(element) { return [element.innerHTML, ...element.children.flatMap(child => typeof child === 'string' ? [child] : text(child))].filter(Boolean) }
/** Find fieldsets and preserve explicit legacy line breaks in their content. */
function fieldsets(element) {
    return element.children.flatMap(child => typeof child === 'string' ? [] : child.tag === 'fieldset' ? [child] : fieldsets(child))
}
/** Serialize only text and line breaks to compare the precise report spacing. */
function markup(element) {
    return element.tag === 'br' ? '<br>' : element.innerHTML + element.children.map(child => typeof child === 'string' ? child : markup(child)).join('')
}
/** Create isolated legacy state and retain exact original render and export algorithms. */
function oracle(input) {
    const elements = new Map()
    const context = vm.createContext({ console, input,
        document: { createElement: node, createTextNode: String, getElementById(id) { if (!elements.has(id)) elements.set(id, node()); return elements.get(id) } },
        Plotly: { redraw() {} }, plot_visibility() {}, update_minimal_config() {}, add_warning() {},
    })
    vm.runInContext(source('Libraries/Param_Helpers.js') + source('Libraries/DecodeDevID.js') + source('Libraries/Array_Math.js'), context)
    vm.runInContext('let params = {}, ins = [], compass = [], baro = [], airspeed = [], gps = [], rangefinder = [], flow = [], viso = [], can = {}; const max_num_ins = 5, max_num_gps = 2, max_num_rangefinder = 10, max_num_flow = 1, max_num_viso = 1; const Sensor_Offset = {};', context)
    const names = ['get_param_array', 'param_array_configured', 'get_ins_param_names', 'get_baro_param_names', 'get_airspeed_param_names', 'print_device', 'load_ins', 'load_compass', 'load_baro', 'load_airspeed', 'load_gps', 'load_rangefinder', 'load_flow', 'load_viso', 'update_pos_plot', 'load_params', 'load_param_file', 'save_minimal_parameters']
    vm.runInContext(names.map(declaration).join('\n'), context)
    const start = legacy.indexOf('    Sensor_Offset.data = []', legacy.indexOf('function reset()'))
    const end = legacy.indexOf('    let plot = document.getElementById("POS_OFFSETS")', start)
    vm.runInContext(legacy.slice(start, end) + '\nload_param_file(input)', context)
    return { context, elements }
}

const cases = [...fixtures, '', 'ABC,1\nABC=2\nBAD xxx\n SPACE 3\n',
    'INS_GYR_ID,2752514\nINS_ACC_ID,2752514\nINS_USE,1\nINS_POS1_X,0.2\nINS_POS1_Y,-0.3\nINS_POS1_Z,0.4\nCOMPASS_DEV_ID,458754\nBARO1_DEVID,65538\nARSPD_DEVID,65538\nARMING_CHECK,0\n',
    'INS_GYR_ID,65538\nCOMPASS_DEV_ID,458754\nCOMPASS_PRIO1_ID,458754\nCOMPASS_ENABLE,1\nCOMPASS_EXTERNAL,2\nBARO2_DEVID,65538\nBARO2_WCF_ENABLE,1\nGPS1_TYPE,17\nGPS1_POS_X,1\nGPS1_POS_Y,2\nGPS1_POS_Z,3\nGPS1_MB_TYPE,1\nGPS1_MB_OFS_X,0.1\nGPS1_MB_OFS_Y,0.2\nGPS1_MB_OFS_Z,0.3\nRNGFNDA_TYPE,1\nRNGFNDA_POS_X,9\nRNGFNDA_POS_Y,8\nRNGFNDA_POS_Z,7\n',
    'GPS_TYPE,0\nGPS1_TYPE,1\nFLOW_TYPE,1\nFLOW_POS_X,NaN\nFLOW_POS_Y,0\nFLOW_POS_Z,0\nINS_GYR_ID,0\nINS_ACC_ID,0\n']

test('parameter parsing and all rendered parameter report strings match the actual base', () => {
    for (const input of cases) {
        const { context, elements } = oracle(input)
        const params = parseParameterFile(input)
        assert.deepEqual(params, structuredClone(vm.runInContext('params', context)))
        const report = buildReport(params)
        for (const section of report.sections) {
            const expected = text(elements.get(section.id))
            assert.deepEqual(section.devices.map(device => device.title + device.lines.map((line, index) => line + '<br>'.repeat(device.breaksAfter[index])).join('')), fieldsets(elements.get(section.id)).map(markup))
            assert.deepEqual([...(section.summary ? [section.summary] : []), ...section.devices.flatMap(device => [device.title, ...device.lines])].join(''), expected.join(''))
        }
        for (const id of ['INS', 'COMPASS', 'BARO', 'ARSPD', 'GPS']) assert.equal(report.sections.some(section => section.id === id), !elements.get(id).hidden, id)
    }
})

test('sensor offsets retain exact slots, axes, moving-base subtraction and missing-data behavior', () => {
    for (const input of cases) {
        const { context } = oracle(input)
        const report = buildReport(parseParameterFile(input))
        const plot = structuredClone(vm.runInContext('Sensor_Offset', context))
        assert.deepEqual(offsetTraces(report.offsets), plot.data)
        if (report.maxOffset > 0) {
            const layout = offsetLayout(report.maxOffset)
            delete layout.width; delete layout.height
            assert.deepEqual(layout, plot.layout)
        }
    }
})

test('minimal selection group names and serialized exports exactly match base algorithms', () => {
    const { context } = oracle('')
    const controls = []
    context.setup_minimal_param = (id, names) => controls.push({ id, names: Array.from(names) })
    context.document.getElementById = () => ({ checked: false })
    const start = legacy.indexOf('    // Ins\n', legacy.indexOf('function reset()'))
    vm.runInContext(legacy.slice(start, legacy.indexOf('\n\n    // Pos offsets plot setup', start)), context)
    assert.deepEqual(exportGroups.map(({ id, names }) => ({ id, names })), controls)
    const params = Object.fromEntries([...new Set(controls.flatMap(control => control.names)), 'STAT_BOOTCNT', 'MIS_TOTAL', 'OTHER10', 'OTHER2'].map((name, i) => [name, (i - 4) / 7]))
    context.values = params
    vm.runInContext('params = values; const defaults = {}', context)
    context.save_text = value => { context.result = value }
    for (const selected of [new Set(), new Set(controls.map(control => control.id)), new Set(['param_ins_gyro', 'param_rc_options', 'param_stream_3'])]) {
        context.document.forms = { params: { getElementsByTagName: () => controls.map(control => ({ checked: selected.has(control.id), getAttribute: () => control.names.join(',') })) } }
        vm.runInContext('save_minimal_parameters()', context)
        assert.equal(exportParameters(params, selected, 'minimal'), context.result)
        assert.equal(exportParameters(params, selected, 'all'), vm.runInContext('get_param_download_text(params)', context))
    }
    assert.equal(availableGroups({}).every(group => group.disabled), true)
    assert.throws(() => exportParameters({ BAD: NaN }, new Set(), 'all'), /Could not convert/)
})
