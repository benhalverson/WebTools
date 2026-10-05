import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createContext, runInContext } from 'node:vm'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { evaluate, gyroFilters, pid } from '../src/model.ts'
import { defaults, exportParameters, importParameters, initialState, shareLink } from '../src/state.ts'
import scenarios from './scenarios.json' with { type: 'json' }

// Last routing prerequisite before this app's implementation. Never use migrated code as oracle.
const revision = '0f4607db3dccbc7d06e5847c02465dab38d1eb80'
/** Read exact source bytes at the integration's actual legacy comparison revision. */
function legacy(path: string): string { return execFileSync('git', ['show', `${revision}:${path}`], { encoding: 'utf8' }) }
const sources = ['Libraries/Array_Math.js', 'FilterTool/filters.js', 'Libraries/Param_Helpers.js'].map(legacy)
/** Compare every sample, allowing only floating arithmetic roundoff, and preserving nonfinite values. */
function compare(actual: unknown, expected: unknown, path = ''): void {
    if (typeof actual === 'number' && typeof expected === 'number') {
        if (!Number.isFinite(expected)) assert.equal(actual, expected, path)
        else assert.ok(Math.abs(actual - expected) <= 2e-11 * Math.max(1, Math.abs(expected)), `${path}: ${actual} != ${expected}`)
    } else if (Array.isArray(actual) && Array.isArray(expected)) {
        assert.equal(actual.length, expected.length, path)
        actual.forEach((entry, index) => compare(entry, expected[index], `${path}[${index}]`))
    } else assert.deepEqual(actual, expected, path)
}

test('authoritative legacy files remain byte-for-byte unchanged at the actual base', () => {
    for (const path of ['FilterTool/filters.js', 'FilterTool/index.html', 'FilterTool/params.json']) assert.equal(readFileSync(new URL('../../../' + path, import.meta.url), 'utf8'), legacy(path))
})
for (const scenario of scenarios) test(`legacy numerical parity: ${scenario.name}`, () => {
    const params = { ...defaults, ...scenario.params }
    const context = createContext({ params, db: scenario.db, unwrapPhase: scenario.unwrap, axis: scenario.axis, post: scenario.post })
    sources.forEach(source => runInContext(source, context))
    runInContext('get_form = name => parseFloat(params[name]);', context)
    const gyro = gyroFilters(params)
    const controller = pid(params, scenario.axis)
    const actualGyro = evaluate([gyro], Number(params.GyroSampleRate) / 2, 0.1, scenario.db, scenario.unwrap)
    const actualPid = evaluate([[controller], ...(scenario.post ? [gyroFilters(params)] : [])], Number(params.SCHED_LOOP_RATE) / 2, 0.05, scenario.db, scenario.unwrap)
    runInContext(`
        var filters = get_filters(get_form('GyroSampleRate'));
        var gyroResult = evaluate_transfer_functions([filters], get_form('GyroSampleRate') / 2, 0.1, db, unwrapPhase);
        var prefix = 'ATC_RAT_' + axis + '_';
        var controller = new PID(get_form('SCHED_LOOP_RATE'), get_form(prefix+'P'), get_form(prefix+'I'), get_form(prefix+'D'), get_form(prefix+'FLTE'), get_form(prefix+'FLTD'));
        var pidResult = evaluate_transfer_functions([[controller], ...(post ? [get_filters(get_form('GyroSampleRate'))] : [])], get_form('SCHED_LOOP_RATE') / 2, 0.05, db, unwrapPhase);
    `, context)
    for (const key of ['attenuation', 'phase', 'freq'] as const) {
        compare(actualGyro[key], runInContext(`gyroResult.${key}`, context), 'gyro.' + key)
        compare(actualPid[key], runInContext(`pidResult.${key}`, context), 'pid.' + key)
    }
    for (const [index, component] of controller.components!.entries()) for (const key of ['attenuation', 'phase'] as const) compare(component[key], runInContext(`controller.${['P','I','D'][index]}_${key}`, context))
    for (const [index, part] of gyro.entries()) if (part.enabled) for (const key of ['attenuation', 'phase'] as const) compare(part[key], runInContext(`filters[${index}].${key}`, context))
})

test('parameter export matches legacy DOM ordering and exact float32 text bytes', () => {
    const params = importParameters(defaults, 'INS_HNTCH_ENABLE,1\nINS_HNTCH_MODE=3\nINS_HNTCH_FREQ 83.123456789\nQ_A_RAT_RLL_P,0.17\nUNKNOWN,5\n')
    const inputNames = ['INS_GYRO_FILTER', ...['INS_HNTCH_', 'INS_HNTC2_'].flatMap(prefix => ['FREQ','BW','ATT','REF','FM_RAT','HMNCS','OPTS'].map(suffix => prefix + suffix))]
    const selectNames = ['INS_HNTCH_ENABLE','INS_HNTCH_MODE','INS_HNTC2_ENABLE','INS_HNTC2_MODE']
    const context = createContext({ Blob, document: { forms: { params: { getElementsByTagName: (tag: string) => (tag === 'select' ? selectNames : inputNames).map(id => ({ id, value: params[id] })) } } } })
    sources.forEach(source => runInContext(source, context))
    const expected = runInContext(`[...document.forms.params.getElementsByTagName('input'), ...document.forms.params.getElementsByTagName('select')].map(input => input.id + ',' + param_to_string(input.value) + '\\n').join('')`, context)
    assert.equal(exportParameters(params), expected)
    assert.equal(params.ATC_RAT_RLL_P, '0.17')
})

test('query, cookie and import preserve legacy select omission, aliases and unknown values', () => {
    const restored = initialState('http://localhost/FilterTool/?INS_HNTCH_ENABLE=1&INS_HNTCH_FREQ=70&Scale=linear&ShowComponents=true', 'INS_HNTCH_FREQ=90')
    assert.equal(restored.INS_HNTCH_ENABLE, '0')
    assert.equal(restored.INS_HNTCH_FREQ, '70')
    assert.equal(restored.Scale, 'Linear')
    assert.equal(restored.ShowComponents, 'true')
    assert.equal(initialState('http://localhost/FilterTool/', 'INS_HNTCH_FREQ=90').INS_HNTCH_FREQ, '90')
    assert.equal(importParameters(defaults, 'INS_HNTCH_MODE,99').INS_HNTCH_MODE, '')
    assert.ok(shareLink('http://localhost/FilterTool/', defaults).includes('INS_HNTCH_ENABLE=0'))
})


test('native numeric sanitization and NaN cookies retain empty field semantics', () => {
    for (const text of ['+1', '0x10', '1.', 'NaN', 'Infinity']) assert.equal(importParameters(defaults, 'INS_GYRO_FILTER,' + text).INS_GYRO_FILTER, '')
    assert.equal(initialState('http://localhost/FilterTool/', 'INS_GYRO_FILTER=NaN').INS_GYRO_FILTER, '')
    assert.equal(initialState('http://localhost/FilterTool/?INS_GYRO_FILTER=NaN', '').INS_GYRO_FILTER, defaults.INS_GYRO_FILTER)
})
