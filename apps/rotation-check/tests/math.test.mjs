import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { matrixFromEuler, rotateVector } from '../src/matrix.ts'
import { findPreset, isCustomRotation, rotationPresets } from '../src/presets.ts'
import { rotationLayout, rotationTraces } from '../src/plot.ts'
import { initialSelection, selectionMatrix, selectRotation } from '../src/selection.ts'

const legacyMatrixSource = readFileSync(new URL('../../../RotationCheck/Matrix3.js', import.meta.url), 'utf8')
const legacyPage = readFileSync(new URL('../../../RotationCheck/index.html', import.meta.url), 'utf8')
const legacyPlotSource = readFileSync(new URL('../../../RotationCheck/RotationCheck.js', import.meta.url), 'utf8')
const context = vm.createContext({})
vm.runInContext(legacyMatrixSource, context)

/** Copies VM rows into this realm without JSON, retaining negative zero exactly. */
function rows(matrix) {
    return ['a', 'b', 'c'].map(row => ['x', 'y', 'z'].map(axis => matrix[row][axis]))
}

/** Produces a fresh retained legacy instance for each independent comparison. */
function legacyMatrix() {
    return vm.runInContext('new Matrix3()', context)
}

test('every visible preset and custom label matches the unchanged legacy page', () => {
    const labels = [...legacyPage.matchAll(/"(\d+)": "([^"]+)"/g)].map(([, id, label]) => ({ id: Number(id), label }))
    assert.deepEqual([...rotationPresets.map(({ id, label }) => ({ id, label })),
        { id: 101, label: 'Custom 1' }, { id: 102, label: 'Custom 2' }], labels)
    assert.equal(rotationPresets.length, 44)
})

test('all 44 preset matrices and representative vectors match legacy exactly, including signed zero', () => {
    const vectors = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, 0], [-0, 0, -0],
        [0.2 * 1.5, 0, 0], [0, 0.2 * 1.5, 0], [0, 0, 0.2 * 1.5], [3.7, -2.6, 8.1], [1e-12, -1e8, 42]]
    for (const preset of rotationPresets) {
        const legacy = legacyMatrix()
        assert.equal(legacy.from_rotation(preset.id), true)
        assert.deepEqual(preset.matrix, rows(legacy), `matrix ${preset.id}`)
        for (const vector of vectors) {
            assert.deepEqual(rotateVector(preset.matrix, vector), Array.from(legacy.rotate(vector)), `vector ${preset.id}: ${vector}`)
        }
        // Euler reconstruction has expected floating point trig error. The same
        // summed nine-coefficient tolerance is enforced by the unchanged HTML.
        const reconstructed = matrixFromEuler(preset.angles)
        const difference = preset.matrix.flat().reduce((sum, value, index) => sum + Math.abs(value - reconstructed.flat()[index]), 0)
        assert.ok(difference <= Number.EPSILON * 9, `Euler check ${preset.id}: ${difference}`)
    }
    assert.deepEqual(findPreset(38).angles, [90, 68.8, 293.3])
})

test('custom Euler rotations preserve legacy units, order and exact matrix/vector outputs', () => {
    const scenarios = [[0, 0, 0], [-0, -0, -0], [90, 0, 0], [0, 90, 0], [0, -90, 0],
        [0, 0, 360], [90, 68.8, 293.3], [-45.125, 89.99999, 721], [180, 270, 90],
        [1e-8, -1e-8, 1e-8], [-720, 1080, -1440], [13.25, -27.75, 159.125], [1e300, -1e300, 1e300]]
    for (const angles of scenarios) {
        const legacy = legacyMatrix()
        legacy.from_euler(...angles.map(angle => angle * (Math.PI / 180.0)))
        const matrix = matrixFromEuler(angles)
        assert.deepEqual(matrix, rows(legacy), `custom ${angles}`)
        for (const vector of [[1, 2, 3], [-5, 1e-6, 0.3]]) {
            assert.deepEqual(rotateVector(matrix, vector), Array.from(legacy.rotate(vector)))
        }
    }
})

test('selection switches retain shared custom angles and replace them for presets', () => {
    let selection = initialSelection
    for (let cycle = 0; cycle < 5; cycle++) {
        for (const preset of rotationPresets) {
            selection = selectRotation(selection, preset.id)
            assert.deepEqual(selection.angles, preset.angles.map(String))
            assert.deepEqual(selectionMatrix(selection), preset.matrix)
            selection = selectRotation(selection, 101)
            assert.deepEqual(selection.angles, preset.angles.map(String))
            selection = { ...selection, angles: ['-19.5', '20.25', '361'] }
            selection = selectRotation(selection, 102)
            assert.deepEqual(selection.angles, ['-19.5', '20.25', '361'])
            assert.deepEqual(selectionMatrix(selection), matrixFromEuler([-19.5, 20.25, 361]))
        }
    }
    assert.equal(isCustomRotation(100), false)
    assert.equal(isCustomRotation(101), true)
    assert.equal(isCustomRotation(102), true)
    for (const id of [-1, 44, 100, 103, NaN, Infinity]) {
        assert.equal(findPreset(id), undefined)
        assert.throws(() => selectRotation(initialSelection, id), /Unsupported rotation/)
        assert.throws(() => selectionMatrix({ ...initialSelection, rotation: id }), /Unsupported rotation/)
    }
    for (const value of ['', 'NaN', 'Infinity', '-Infinity']) {
        assert.throws(() => selectionMatrix({ rotation: 101, angles: [value, '0', '0'] }), /finite number/)
    }
})

test('owned plot trace bytes and layout match legacy for every preset and custom slot', () => {
    const nodes = { rotations: { value: '0' }, EulerRoll: { value: '0' }, EulerPitch: { value: '0' }, EulerYaw: { value: '0' }, plot: {} }
    const legacy = vm.createContext({
        document: { getElementById: id => nodes[id] },
        Plotly: { purge() {}, newPlot() {}, redraw() {} },
        euler: Object.fromEntries(rotationPresets.map(preset => [preset.id, preset.angles])),
    })
    vm.runInContext(legacyMatrixSource + '\n' + legacyPlotSource, legacy)
    for (const id of [...rotationPresets.map(preset => preset.id), 101, 102]) {
        nodes.rotations.value = String(id)
        nodes.EulerRoll.value = '-15.5'
        nodes.EulerPitch.value = '67.25'
        nodes.EulerYaw.value = '361'
        vm.runInContext('reset()', legacy)
        const expected = vm.runInContext('rotations_plot', legacy)
        const matrix = selectionMatrix({ rotation: id, angles: ['-15.5', '67.25', '361'] })
        assert.equal(JSON.stringify(rotationTraces(matrix)), JSON.stringify(expected.data), `trace bytes ${id}`)
        const { width, height, uirevision, ...layout } = rotationLayout()
        assert.equal(width, 1000)
        assert.equal(height, 800)
        assert.equal(uirevision, 'rotation-check')
        assert.equal(JSON.stringify(layout), JSON.stringify(expected.layout))
    }
    // No matrix or prior render object is shared with mutable vendor trace arrays.
    const first = rotationTraces(rotationPresets[0].matrix)
    first[0].x[0] = 999
    assert.equal(rotationTraces(rotationPresets[0].matrix)[0].x[0], 0.2)
})
