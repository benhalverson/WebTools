import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { find_parameter_metadata, param_to_string } from '@webtools/parameters'
import { controlValue, exportParameters, initialParameters, importParameters, mergeLogParameters, nextWindowSize, parameterDefinitions, parameterPrefixes, parameterVisible } from '../src/parameters.ts'

import { initialGraphSettings } from '../src/plots.ts'

const comparison = 'bbbd72a'
const source = execFileSync('git', ['show', `${comparison}:AnalyticTune/AnalyticTune.js`], { encoding: 'utf8' })
const metadata = JSON.parse(readFileSync(new URL('../../../AnalyticTune/params.json', import.meta.url), 'utf8'))

/** Reconstruct the original form's input/select order including metadata bit checkboxes. */
function legacyExport(values, vehicle, axis) {
    const inputs = []
    const selects = []
    const all = {}
    for (const { name } of parameterDefinitions) {
        const entry = find_parameter_metadata(metadata, name)
        const selected = name !== 'SCHED_LOOP_RATE' && entry?.Values && !entry.Bitmask
        const node = { id: name, value: controlValue(name, values[name], metadata) }
        all[name] = node
        if (selected) selects.push(node)
        else {
            inputs.push(node)
            for (const bit of Object.keys(entry?.Bitmask ?? {})) inputs.push({ id: `bit_${bit}_${name}`, value: 'on' })
        }
    }
    const prefixes = parameterPrefixes(vehicle, axis)
    let blob
    const context = vm.createContext({ Blob, param_to_string, page_axis: axis,
        get_vehicle_atc_prefix: () => prefixes.vehicleAtcPrefix, get_vehicle_plt_prefix: () => prefixes.vehiclePltPrefix,
        get_rate_param_prefix: () => prefixes.ratePrefix, get_angle_param_prefix: () => prefixes.anglePrefix,
        document: { forms: { params: { getElementsByTagName: tag => tag === 'input' ? inputs : selects } }, getElementById: id => all[id] },
        saveAs: value => { blob = value },
    })
    vm.runInContext(source.slice(source.indexOf('function save_parameters()'), source.indexOf('async function load_parameters(')), context)
    context.save_parameters()
    return blob.text()
}

for (const vehicle of ['ArduCopter', 'ArduPlane_VTOL', 'ArduPlane_FW']) {
    for (const axis of ['Roll', 'Pitch', 'Yaw']) {
        test(`${comparison} exact serialized metadata export: ${vehicle} ${axis}`, async () => {
            const values = initialParameters()
            const { ratePrefix } = parameterPrefixes(vehicle, axis)
            values[ratePrefix + 'NEF'] = '1'
            values[ratePrefix + 'NTF'] = '2'
            values.INS_HNTCH_MODE = '99'
            values.FILT1_NOTCH_FREQ = 'invalid'
            if (vehicle === 'ArduPlane_FW' && axis === 'Yaw') {
                assert.throws(() => exportParameters(values, vehicle, axis, metadata), /Could not convert on/)
                assert.throws(() => legacyExport(values, vehicle, axis), /Could not convert on/)
            } else assert.equal(exportParameters(values, vehicle, axis, metadata), await legacyExport(values, vehicle, axis))
        })
    }
}

test('query values, raw import separators, selected vehicle whitelist and loop-rate guard', () => {
    const defaults = initialParameters('https://local/?atc_rat_rll_p=0.123&ins_hntch_mode=2')
    assert.equal(defaults.ATC_RAT_RLL_P, '0.123')
    const imported = importParameters(defaults, 'ATC_RAT_RLL_P,0.2\nINS_GYRO_FILTER = 30\nUNKNOWN 10')
    assert.equal(imported.ATC_RAT_RLL_P, '0.2')
    assert.equal(imported.INS_GYRO_FILTER, '30')
    const merged = mergeLogParameters(imported, { ATC_RAT_RLL_P: .9, Q_A_RAT_RLL_P: .8, SCHED_LOOP_RATE: 0, Throttle: 1 }, 'ArduCopter')
    assert.equal(merged.ATC_RAT_RLL_P, '0.9')
    assert.equal(merged.Q_A_RAT_RLL_P, defaults.Q_A_RAT_RLL_P)
    assert.equal(merged.SCHED_LOOP_RATE, defaults.SCHED_LOOP_RATE)
    assert.equal(merged.Throttle, defaults.Throttle)
    assert.equal(nextWindowSize(1024, 1025), 2048)
    assert.equal(nextWindowSize(1024, 1023), 512)
    assert.equal(nextWindowSize(1000, 1001), 1024)
    assert.equal(nextWindowSize(1024, 1000), 1000)
})


test('controller and harmonic mode visibility follows the selected namespaces', () => {
    const values = initialParameters()
    assert.equal(parameterVisible('ATC_RAT_RLL_P', 'RollPIDS', values, 'ArduCopter', 'Roll'), true)
    assert.equal(parameterVisible('ATC_RAT_RLL_P', 'RollPIDS', values, 'ArduPlane_VTOL', 'Roll'), false)
    assert.equal(parameterVisible('Throttle', '', values, 'ArduCopter', 'Roll'), true)
    values.INS_HNTCH_ENABLE = '0'
    assert.equal(parameterVisible('Throttle', '', values, 'ArduCopter', 'Roll'), false)
    values.INS_HNTC2_ENABLE = '1'
    values.INS_HNTC2_MODE = '3'
    assert.equal(parameterVisible('ESC_RPM', '', values, 'ArduCopter', 'Roll'), true)
    assert.equal(parameterVisible('FILT1_NOTCH_FREQ', 'FILT1', values, 'ArduCopter', 'Roll'), false)
    values.ATC_RAT_RLL_NEF = '1'
    assert.equal(parameterVisible('FILT1_NOTCH_FREQ', 'FILT1', values, 'ArduCopter', 'Roll'), true)
})


test('legacy raw notch identifiers retain leading zeroes and reject hex input', async () => {
    for (const [nef, ntf] of [['01', '1'], ['0x1', '2'], ['1', '01'], ['1.0', '1']]) {
        const values = initialParameters()
        values.ATC_RAT_RLL_NEF = nef
        values.ATC_RAT_RLL_NTF = ntf
        assert.equal(exportParameters(values, 'ArduCopter', 'Roll', metadata), await legacyExport(values, 'ArduCopter', 'Roll'))
    }
})

test('URL fragments never become part of graph or numeric query values', () => {
    assert.equal(initialGraphSettings('https://local/?PID_Scale=Linear#comparison').gain, 'Linear')
    assert.equal(initialGraphSettings('https://local/?PID_feq_unit=RPS#comparison').unit, 'RPS')
    assert.equal(initialParameters('https://local/#section?INS_GYRO_FILTER=80').INS_GYRO_FILTER, '20.0')
})
