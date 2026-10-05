import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { test } from 'node:test'
import { buildLogReport } from '../src/model/log-report.ts'
import { internalErrorLines, watchdogReports } from '../src/model/log-errors.ts'
const base = '6cd6a978dbe6e93709fb2e468f9b9085c3a7f7ce'
/** Read the unchanged implementation from the agreed comparison revision. */
function source(path) {
    return execFileSync('git', ['show', `${base}:${path}`], {
        encoding: 'utf8',
    })
}
const legacy = source('HardwareReport/HardwareReport.js')
/** Extract whole legacy declarations, retaining all original branches. */
function declaration(name) {
    const start = legacy.indexOf(`function ${name}(`)
    return legacy.slice(start, legacy.indexOf('\n}\n', start) + 3)
}
/** Collect DOM output independently of model implementation. */
function node(tag) {
    return {
        tag,
        style: {},
        children: [],
        innerHTML: '',
        previousElementSibling: {},
        appendChild(child) {
            this.children.push(child)
            return child
        },
    }
}
/** Serialize the precise legacy text and break placement. */
function markup(element) {
    return typeof element === 'string'
        ? element
        : element.tag === 'br'
          ? '<br>'
          : element.innerHTML + element.children.map(markup).join('')
}
/** Find independently rendered sensor cards. */
function fieldsets(element) {
    return element.children.flatMap((child) =>
        typeof child === 'string'
            ? []
            : child.tag === 'fieldset'
              ? [markup(child)]
              : fieldsets(child),
    )
}
/** Supply parser-shaped immutable field arrays to both implementations. */
function logOf(messages, instances = {}) {
    const messageTypes = {}
    for (const [name, message] of Object.entries(messages))
        messageTypes[name] = { expressions: Object.keys(message) }
    for (const [name, inst] of Object.entries(instances))
        messageTypes[name] = {
            expressions: Object.keys(Object.values(inst)[0]),
            instances: Object.fromEntries(
                Object.keys(inst).map((key) => [key, key]),
            ),
        }
    return {
        messageTypes,
        get(name, field) {
            return field ? messages[name]?.[field] : messages[name]
        },
        get_instance(name, inst, field) {
            return field
                ? instances[name]?.[inst]?.[field]
                : instances[name]?.[inst]
        },
    }
}
/** Convert numeric fixture columns to the actual DataFlash representation. */
function message(fields) {
    return Object.fromEntries(
        Object.entries(fields).map(([name, values]) => [
            name,
            typeof values[0] === 'string' ? values : new Float64Array(values),
        ]),
    )
}
/** Evaluate unchanged report code with a minimal output-only DOM. */
function oracle(log, params = {}) {
    const elements = new Map()
    const context = vm.createContext({
        console,
        log,
        input: params,
        document: {
            createElement: node,
            createTextNode: String,
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, node())
                return elements.get(id)
            },
        },
        add_warning() {},
        check_release() {},
    })
    vm.runInContext(
        source('Libraries/Param_Helpers.js') +
            source('Libraries/DecodeDevID.js') +
            source('Libraries/Array_Math.js'),
        context,
    )
    vm.runInContext(
        'let params=input,can={},ins=[],compass=[],baro=[],airspeed=[],gps=[];const max_num_ins=5,max_num_gps=2',
        context,
    )
    const names = [
        'get_param_array',
        'param_array_configured',
        'get_ins_param_names',
        'get_baro_param_names',
        'get_airspeed_param_names',
        'print_device',
        'load_can',
        'load_ins',
        'load_compass',
        'load_baro',
        'load_airspeed',
        'load_gps',
        'show_watchdog',
        'show_internal_errors',
    ]
    vm.runInContext(names.map(declaration).join('\n'), context)
    return { context, elements }
}

test('all log health fields, CAN names and GPS preserve exact legacy sensor card markup', () => {
    for (const health of [0, 1])
        for (const baroField of ['H', 'Health']) {
            const canId = (42 << 8) | (1 << 3) | 3
            const params = {
                INS_GYR_ID: canId,
                INS_ACC_ID: canId,
                INS_USE: 1,
                COMPASS_DEV_ID: canId,
                COMPASS_PRIO1_ID: canId,
                COMPASS_USE: 1,
                COMPASS_ENABLE: 1,
                BARO1_DEVID: canId,
                BARO_PRIMARY: 0,
                ARSPD_DEVID: canId,
                ARSPD_PRIMARY: 0,
                GPS1_TYPE: 9,
                GPS1_CAN_NODEID: 42,
            }
            const log = logOf(
                { MSG: message({ Message: ['GPS 1: detected as DroneCAN'] }) },
                {
                    CAND: {
                        42: message({
                            Name: ['org.ardupilot.gps', 'org.ardupilot.gps'],
                            Driver: [1, 1],
                            Major: [1, 1],
                            Minor: [2, 2],
                            UID1: [123, 123],
                            UID2: [456, 456],
                            Version: [12, 12],
                        }),
                    },
                    IMU: {
                        0: message({
                            AH: [health, health],
                            GH: [1 - health, 1 - health],
                        }),
                    },
                    MAG: { 0: message({ Health: [health, health] }) },
                    BARO: { 0: message({ [baroField]: [health, health] }) },
                    ARSP: { 0: message({ H: [health, health] }) },
                },
            )
            const { context, elements } = oracle(log, params)
            vm.runInContext(
                'load_can(log);load_ins(log);load_compass(log);load_baro(log);load_airspeed(log);load_gps(log)',
                context,
            )
            const report = buildLogReport(log, params)
            for (const section of report.hardware.sections)
                assert.deepEqual(
                    section.devices.map(
                        (device) =>
                            device.title +
                            device.lines
                                .map(
                                    (line, i) =>
                                        line +
                                        '<br>'.repeat(device.breaksAfter[i]),
                                )
                                .join(''),
                    ),
                    fieldsets(elements.get(section.id)),
                    section.id,
                )
            assert.equal(report.can.length, 1)
        }
})

test('internal errors preserve PM aliases, MON merging, mask deltas and repeated counts', () => {
    for (const mask of ['IntE', 'InE'])
        for (const count of ['ErrC', 'ErC']) {
            const log = logOf({
                PM: message({
                    TimeUS: [0, 2, 4, 6],
                    [mask]: [0, 1, 1, 5],
                    [count]: [0, 1, 3, 4],
                    ErrL: [0, 44, 44, 99],
                }),
                MON: message({
                    TimeUS: [3, 5, 7],
                    IErr: [1, 5, 0x80000005],
                    IErrCnt: [2, 4, 8],
                    IErrLn: [44, 99, 101],
                }),
            })
            const { context, elements } = oracle(log)
            vm.runInContext('show_internal_errors(log)', context)
            assert.equal(
                internalErrorLines(log).join('<br>'),
                markup(elements.get('InternalError')),
            )
        }
})

test('watchdog formatting retains duplicate fault codes, signed ICSR and adjacent deduplication', () => {
    const log = logOf({
        WDOG: message({
            TimeUS: [0, 1, 2],
            Tsk: [-3, -3, -2],
            IE: [1, 1, 2],
            IEC: [3, 3, 4],
            IEL: [20, 20, 30],
            MvMsg: [0, 0, 1],
            MvCmd: [0, 0, 2],
            SmLn: [0, 0, 99],
            FL: [10, 10, 11],
            FT: [4, 4, 5],
            FA: [255, 255, 4096],
            FP: [2, 2, 3],
            ICSR: [0x80000000, 0x80000000, 3],
            LR: [32, 32, 64],
            TN: ['main', 'main', 'io'],
        }),
    })
    const { context, elements } = oracle(log)
    vm.runInContext('show_watchdog(log)', context)
    const reports = watchdogReports(log)
    assert.equal(reports.length, 2)
    const actual = reports
        .map(
            (report, i) =>
                (i ? '<br>' : '') +
                `Watchdog ${i + 1}` +
                report.lines.join('<br>') +
                '<br>Fault ICS Register: ' +
                '0x' +
                report.icsr.toString(16) +
                report.icsrLines.join('<br>') +
                '<br><br>' +
                report.tail.join('<br>'),
        )
        .join('')
    assert.equal(actual, markup(elements.get('WDOG')))
})
