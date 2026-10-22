import type { PythonInputs } from './dataset.ts'
import type { Mode } from './model.ts'
export interface IdentificationResult { frequency: number[]; sourceAmplitude: number[][]; sourcePhase: number[][]; fittedAmplitude: number[][]; fittedPhase: number[][]; coherence: number[][] }
export type RuntimeRequest = { kind: 'initialize' } | { kind: 'run'; mode: Mode; inputs: PythonInputs }
export type RuntimeEvent = { kind: 'ready' } | { kind: 'output'; text: string } | { kind: 'result'; result: IdentificationResult } | { kind: 'error'; message: string }
/** Decode only numeric vectors and the three explicit nonfinite wire tags; never coerce arbitrary strings. */
function numericVector(value: unknown): number[] {
    if (!Array.isArray(value)) throw new TypeError('Invalid Python numeric vector')
    return value.map(item => {
        if (typeof item === 'number') return item
        if (item === 'NaN') return NaN
        if (item === 'Infinity') return Infinity
        if (item === '-Infinity') return -Infinity
        throw new TypeError('Invalid Python numeric value')
    })
}
/** Validate/copy consumed arrays and restore legacy nonfinite values before they enter React or Plotly state. */
export function identificationResult(value: unknown): IdentificationResult {
    if (!value || typeof value !== 'object') throw new TypeError('Invalid Python result')
    const record = value as Record<string, unknown>
    /** Decode a known result matrix while retaining its row lengths and numeric values. */
    const matrix = (key: string): number[][] => {
        const rows = record[key]
        if (!Array.isArray(rows)) throw new TypeError(`Invalid Python ${key}`)
        return rows.map(numericVector)
    }
    return { frequency: numericVector(record.frequency), sourceAmplitude: matrix('sourceAmplitude'), sourcePhase: matrix('sourcePhase'), fittedAmplitude: matrix('fittedAmplitude'), fittedPhase: matrix('fittedPhase'), coherence: matrix('coherence') }
}
