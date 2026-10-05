import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import * as parameters from '@webtools/parameters'

const messages = []
const alerts = []
const legacy = vm.createContext({console: {log: (...args) => messages.push(args.join(' ')), error() {}}, alert: (message) => alerts.push(message)})
for (const file of ['Param_Helpers.js', 'DecodeDevID.js', 'ParameterMetadata.js']) {
    vm.runInContext(await readFile(new URL(`../../../Libraries/${file}`, import.meta.url), 'utf8'), legacy)
}
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))

test('vector and compass names preserve exact identifiers including unusual indices', () => {
    for (const prefix of ['', 'COMPASS_', 'δ_']) assert.deepEqual(parameters.get_param_name_vector3(prefix), plain(legacy.get_param_name_vector3(prefix)))
    for (const index of [1, 2, 3, 0, -1, 1.5, '1', '01', '2', 'bad']) assert.deepEqual(parameters.get_compass_param_names(index), plain(legacy.get_compass_param_names(index)))
})

test('parameter history retains first/last values and change notifications without DOM', () => {
    for (const log of [
        {Name: [], Value: []},
        {Name: ['A', 'B', 'A', 'A'], Value: [1, 10, 2, 2]},
        {Name: ['A', 'A', 'A'], Value: [0, -0, NaN]},
        {Name: ['A', 'A'], Value: [3]},
    ]) for (const allow of [undefined, true, false]) for (const name of ['A', 'MISSING']) {
        messages.length = 0; alerts.length = 0
        const expected = legacy.get_param_value(log, name, allow)
        const actual = parameters.read_param_value(log, name, allow)
        assert.equal(actual.value, expected)
        assert.equal(parameters.get_param_value(log, name, allow), expected)
        assert.deepEqual(actual.changes.map(change => change.message), messages)
        assert.deepEqual(actual.changes.filter(change => change.ignored).map(change => change.message), alerts)
    }
})

test('float formatting and naturally sorted downloads are byte-for-byte compatible', () => {
    for (const value of [0, -0, 1, -1, 0.1, 1 / 3, 1e-45, 3.4028234663852886e38, Infinity, -Infinity, 16777217, 1e-12]) assert.equal(parameters.param_to_string(value), legacy.param_to_string(value))
    assert.throws(() => parameters.param_to_string(NaN), {message: 'Could not convert NaN to float string'})
    assert.throws(() => legacy.param_to_string(NaN), {message: 'Could not convert NaN to float string'})
    for (const input of [{}, {P10: 0.1, P2: 1 / 3, P1: -0, COMPASS_OFS_X: -12.5}]) assert.equal(parameters.get_param_download_text(input), legacy.get_param_download_text(input))
})

test('device identifiers preserve all lookup names, signed shifts and dronecan discriminants', () => {
    for (let type = 0; type < 4; type++) for (let devtype = 0; devtype <= 0x40; devtype++) for (let bus = 0; bus < 8; bus++) {
        const id = (devtype << 16) | (255 << 8) | (31 << 3) | bus
        assert.deepEqual(parameters.decode_devid(id, type), plain(legacy.decode_devid(id, type)))
    }
    for (const id of [-1, 0, NaN, Infinity, 0xffffffff, 2 ** 40, 12.5]) for (const type of [-1, 0, 1, 2, 3, 4]) assert.deepEqual(parameters.decode_devid(id, type), plain(legacy.decode_devid(id, type)))
})

// Extract only the unchanged nested lookup to compare its behavior without a DOM.
const metadataSource = await readFile(new URL('../../../Libraries/ParameterMetadata.js', import.meta.url), 'utf8')
const start = metadataSource.indexOf('function recursive_search(')
const end = metadataSource.indexOf('\n\n\n        for (param', start)
vm.runInContext(metadataSource.slice(start, end), legacy)

test('metadata lookup preserves prefix order, identity, missing and malformed data', () => {
    const item = {Description: 'example', Units: 'm/s', Range: {low: '0', high: '10'}, Values: {'0': 'Off'}, Bitmask: {'31': 'High'}}
    const data = {OTHER: {}, COMPASS_: {COMPASS_USE: item}, COMPASS_USE: {Description: 'later'}}
    assert.equal(parameters.find_parameter_metadata(data, 'COMPASS_USE'), item)
    for (const input of [data, {}, {A: 12}, {A: null}, {A: {ABC: item}}, {ABC: null}, null]) for (const name of ['COMPASS_USE', 'ABC', 'MISSING']) {
        let expected
        try { expected = legacy.recursive_search(input, name) } catch (error) {
            assert.throws(() => parameters.find_parameter_metadata(input, name), {name: error.name})
            continue
        }
        assert.equal(parameters.find_parameter_metadata(input, name), expected)
    }
})

test('metadata loading is injected and preserves payload and failures', async () => {
    const payload = {A: {Description: 'A'}}
    assert.equal(await parameters.load_parameter_metadata('/prefix/params.json', async url => { assert.equal(url, '/prefix/params.json'); return {json: async () => payload} }), payload)
    await assert.rejects(parameters.load_parameter_metadata('missing', async () => {throw Error('offline')}), /offline/)
    await assert.rejects(parameters.load_parameter_metadata('bad', async () => ({json: async () => {throw SyntaxError('bad json')}})), /bad json/)
})

test('input conversion preserves legacy signed and malformed bitmask behavior', () => {
    for (const size of [undefined, 0, 1, 8, 16, 31, 32, 33, NaN]) for (const input of ['-1', '255', '65535', '2147483648', '4294967295', '1.5', '1suffix', '', 'invalid']) {
        legacy.document = {getElementById: () => ({value: input, dataset: size === undefined ? {} : {type: String(size)}})}
        assert.equal(parameters.parameter_input_value(input, size), legacy.parameter_get_value('A'))
    }
})

// Execute the original checkbox handler with a small structural DOM double.
const handlerStart = metadataSource.indexOf('let read_bits = function(event) {')
const handlerEnd = metadataSource.indexOf("\n\n            paragraph.appendChild", handlerStart)
vm.runInContext(metadataSource.slice(handlerStart, handlerEnd).replace('let read_bits', 'var read_bits'), legacy)
test('checkbox conversion matches legacy for every supported width and high-bit combinations', () => {
    for (const size of [0, 1, 8, 16, 31, 32, 33]) for (const bits of [[], [0], [7], [15], [31], [0, 7, 15, 31], ['invalid']]) {
        const param = {dataset: {type: String(size)}, value: undefined}
        const parent = {querySelectorAll: selector => selector.includes('checkbox') ? bits.map(bit => ({checked: true, dataset: {bit: String(bit)}})) : [param]}
        legacy.read_bits({currentTarget: {parentElement: parent}})
        assert.equal(parameters.parameter_bitmask_value(bits, size), param.value)
    }
})

test('recorded baseline text and numerical fixtures remain exact', async () => {
    const fixture = JSON.parse(await readFile(new URL('./fixtures/legacy.json', import.meta.url), 'utf8'))
    for (const {value, text} of fixture.values) {
        assert.equal(parameters.param_to_string(value), text)
        assert.equal(Math.fround(Number(text)), Math.fround(value))
    }
    assert.equal(parameters.get_param_download_text(fixture.params), fixture.text)
})

test('raw malformed metadata is preserved and cannot masquerade as a typed control model', () => {
    for (const value of [null, 7, 'text', [], {Description: 7}, {Units: false}, {Range: null}, {Range: {low: false}}, {Values: {'0': 7}}, {Bitmask: []}, {Description: undefined}]) {
        assert.equal(parameters.find_parameter_metadata({ABC: value}, 'ABC'), value)
        assert.equal(parameters.is_parameter_metadata(value), false)
    }
    for (const value of [{}, {Description: 'valid', Units: 'm', Range: {low: 0, high: '1'}, Values: {'0': 'Off'}, Bitmask: {'31': 'High'}, FutureField: null}]) assert.equal(parameters.is_parameter_metadata(value), true)
})
