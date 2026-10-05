import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { generateFence, simplify_poly, convertToCartesian, convertFromCartesian, line_intersects, type FenceFeature } from '../src/geometry.ts'

// Actual routing branch base; never use the implementation or a refreshed output as oracle.
export const comparisonRevision = '0f4607db3dccbc7d06e5847c02465dab38d1eb80'
/** Load exact source bytes from the comparison commit, retaining every owned numerical function. */
function reference() {
    let saved: { blob: Blob; filename: string } | undefined
    const context = vm.createContext({ Blob, saveAs: (blob: Blob, filename: string) => { saved = { blob, filename } } })
    for (const path of ['Libraries/Array_Math.js', 'GeofenceGenerator/GeofenceGenerator.js']) {
        const source = execFileSync('git', ['show', comparisonRevision + ':' + path], { encoding: 'utf8' })
        vm.runInContext(source.replace(/^import\('https:[^\n]+\)\s*$/m, ''), context)
    }
    return { context, saved: () => saved }
}
/** Cross-realm copies preserve sparse arrays, NaN, undefined and negative zero. */
function copy<T>(value: T): T { return structuredClone(value) }
/** Construct ring fixtures in GeoJSON order with deliberate negative longitudes. */
function ring(count: number, radius: number, wave = 0): number[][] {
    return Array.from({ length: count }, (_, index) => {
        const angle = index * Math.PI * 2 / count
        const r = radius * (1 + wave * Math.sin(index * 0.73))
        return [-0.1 + Math.cos(angle) * r, 51.5 + Math.sin(angle) * r]
    })
}
const fixtures = [
    [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    [ring(51, 0.0001)], // circle replacement
    [ring(300, 0.01, 0.15)], // node cap and noncircular simplification
    [ring(110, 0.01, 0.1), ring(70, 0.001, 0.2)], // inclusion/exclusion
    [[[-190, -65], [-191, -64], [-192, -65]]], // negative remainder quirk
    [[[0, 90], [0.01, 89.999], [0.02, 90]]], // polar scale clamp
    [[[0, 0], [0, 0]]], // degenerate closure/rotation
]
for (const [index, coordinates] of fixtures.entries()) {
    test(`fixture ${index}: repeated serialized bytes, mutable vertices and simplification match actual base`, async () => {
        const legacy = reference()
        const feature: FenceFeature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: copy(coordinates) } }
        legacy.context.feature = copy(feature)
        for (let repeat = 0; repeat < 3; repeat++) {
            try { await vm.runInContext('generate_fence(feature, "a/b/c\\\\d\\\\e")', legacy.context) }
            catch (reason) {
                assert.equal((reason as Error).name, 'TypeError')
                assert.throws(() => generateFence(feature, 'a/b/c\\d\\e'), TypeError)
                break
            }
            const result = generateFence(feature, 'a/b/c\\d\\e')
            assert.equal(result.text, await legacy.saved()!.blob.text())
            assert.equal(result.filename, legacy.saved()!.filename)
            assert.deepEqual(copy(feature.geometry.coordinates), copy(vm.runInContext('feature.geometry.coordinates', legacy.context)))
        }
        const projected = coordinates.map(points => convertToCartesian(points, points.length, coordinates[0]![0]!))
        const x = projected.map(points => points.x), y = projected.map(points => points.y)
        legacy.context.x = copy(x); legacy.context.y = copy(y)
        assert.deepEqual(simplify_poly(copy(x), copy(y)), copy(vm.runInContext('simplify_poly(x, y)', legacy.context)))
    })
}
test('projection uses identical floating point operations; no tolerance needed', () => {
    const legacy = reference()
    for (const origin of [[-190, -65], [179.9, 90], [0, 0]]) {
        const points = [[-191, -64], [180, 89.9], [0, 0]]
        Object.assign(legacy.context, { points, origin })
        const xy = convertToCartesian(points, 3, origin)
        assert.deepEqual(xy, copy(vm.runInContext('convertToCartesian(points, 3, origin)', legacy.context)))
        Object.assign(legacy.context, xy)
        assert.deepEqual(convertFromCartesian(xy.x, xy.y, origin), copy(vm.runInContext('convertFromCartesian(x, y, origin)', legacy.context)))
    }
})
test('known intersection defect and invalid-ring errors remain outside migration scope', async () => {
    assert.equal(line_intersects([0, 0], [1, 1], [0, 1], [1, 0]), false)
    for (const coordinates of [[], [[]]]) {
        const feature: FenceFeature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } }
        assert.throws(() => generateFence(copy(feature), 'invalid'), TypeError)
        const legacy = reference(); legacy.context.feature = feature
        await assert.rejects(vm.runInContext('generate_fence(feature, "invalid")', legacy.context), { name: 'TypeError' })
    }
})

test('nonfinite or overflowing areas preserve legacy failure rather than selecting vertex zero', () => {
    for (const value of [Infinity, NaN]) {
        const legacy = reference()
        const x = [Array<number>(251).fill(value)], y = [Array<number>(251).fill(0)]
        Object.assign(legacy.context, { x: copy(x), y: copy(y) })
        assert.throws(() => vm.runInContext('simplify_poly(x, y)', legacy.context), { name: 'TypeError' })
        assert.throws(() => simplify_poly(x, y), TypeError)
    }
})
