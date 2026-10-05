import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parseIntelHex, landingSerial, hex4, hexAddr8, niceSize } from '../src/format.ts'

export const comparisonBase = '0f4607db3dccbc7d06e5847c02465dab38d1eb80'
/** Read the actual branch base, never the migrated implementation, as oracle. */
function legacy(path: string): string { return execFileSync('git', ['show', `${comparisonBase}:${path}`], { encoding: 'utf8' }) }
/** Extract one lexically delimited legacy utility without executing page side effects. */
function utility(name: string): string {
    const source = legacy('DFULoader/dfu-util.js')
    const start = source.indexOf('function ' + name + '(')
    const brace = source.indexOf('{', start)
    let depth = 1; let end = brace + 1
    while (depth) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++ }
    return source.slice(start, end)
}
test('preserve downloaded vendor assets and owned legacy consumers exactly at branch base', () => {
    for (const file of ['dfu.js', 'dfuse.js', 'dfu-util.js', 'index.html', 'README.md']) {
        assert.equal(readFileSync(new URL(`../../../DFULoader/${file}`, import.meta.url), 'utf8'), legacy('DFULoader/' + file))
    }
})
test('Intel HEX bytes match actual legacy including ignored extended addresses/checksums and zero gaps', () => {
    const context = vm.createContext({ TextDecoder, Uint8Array })
    vm.runInContext(utility('parseIntelHex'), context)
    for (const text of [':04000000010203FF00\n:00000001FF', ':020000040800F2\r\n:03001000AABBCC00', 'ignored\n:0200020001ZZ00', ':02000000010200\n:01000000FF00', '']) {
        const buffer = new TextEncoder().encode(text).buffer
        context.buffer = buffer
        assert.deepEqual(parseIntelHex(buffer), vm.runInContext('parseIntelHex(buffer)', context))
    }
})
test('formatting matches legacy exactly, without numerical tolerances', () => {
    const context = vm.createContext({})
    for (const [name, fn] of Object.entries({ hex4, hexAddr8, niceSize })) {
        vm.runInContext(utility(name), context)
        for (const value of [0, 1, 1023, 1024, 65535, 1048577, 1073741824]) {
            context.value = value
            assert.equal(fn(value), vm.runInContext(`${name}(value)`, context))
        }
    }
})
test('serial query retains current Chromium URL workaround', () => {
    assert.equal(landingSerial(''), null)
    assert.equal(landingSerial('?serial='), '')
    assert.equal(landingSerial('?serial=SERIAL/'), 'SERIAL')
    assert.equal(landingSerial('?serial=SERIAL%2F'), 'SERIAL/')
    assert.equal(landingSerial('?serial=A%2FB/&x=1'), 'A/B/')
})
