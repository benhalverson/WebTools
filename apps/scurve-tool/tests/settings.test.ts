import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { exportParameters, groups, importParameters, initialSettings, type Settings } from '../src/settings.ts'

const legacy = vm.createContext({})
vm.runInContext(execFileSync('git', ['show', '0f4607db3dccbc7d06e5847c02465dab38d1eb80:Libraries/Param_Helpers.js'], { encoding: 'utf8' }), legacy)

test('parameter export preserves exact legacy float32 bytes and round trips', () => {
    const settings: Settings = { ...initialSettings(), ATC_INPUT_TC: '0.123456789', WP_ACC: '3.7654321' }
    legacy.params = Object.fromEntries(groups.flatMap(group => Object.keys(group.values)).map(name => [name, parseFloat(settings[name]!)]))
    const expected: unknown = vm.runInContext('get_param_download_text(params)', legacy)
    assert.equal(exportParameters(settings), expected)
    const imported = importParameters(exportParameters(settings), initialSettings())
    assert.equal(exportParameters(imported), expected)
    assert.equal(imported.curr_wp_x, '300')
})

test('known invalid values fail atomically and unknown firmware values are ignored', () => {
    const current = initialSettings()
    const snapshot = { ...current }
    assert.throws(() => importParameters('WP_SPD,20\nWP_ACC,wrong\n', current), /line 2/)
    assert.deepEqual(current, snapshot)
    assert.equal(importParameters('# comment\nUNKNOWN,NaN\nWP_SPD 15\n', current).WP_SPD, '15')
    assert.throws(() => importParameters('UNKNOWN,1', current), /No matching/)
})
