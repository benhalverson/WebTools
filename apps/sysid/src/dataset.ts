import type { DataflashConstructor, DataflashLog } from '@webtools/dataflash'
import type { Configuration, Matrix, Mode, Signal } from './model.ts'
export type PythonValue = string | number | null | PythonValue[]
export type PythonInputs = Record<string, PythonValue>
/** Load the standalone ESM boundary beside its vendor tree, without bundler relocation. */
export async function parseLog(bytes: ArrayBuffer, base: string): Promise<DataflashLog> {
    const url = new URL(base + 'dataflash/index.js', location.origin)
    const boundary: unknown = await import(/* @vite-ignore */ url.href)
    if (!boundary || typeof boundary !== 'object' || !('loadDataflashParser' in boundary) || typeof boundary.loadDataflashParser !== 'function') throw new Error('DataFlash module unavailable')
    const Constructor: DataflashConstructor = await boundary.loadDataflashParser()
    const log = new Constructor(); log.processData(bytes, []); return log
}
/** Reject nonnumeric/missing fields at the typed parser boundary, without resampling. */
export function numericField(log: DataflashLog, message: string, field: string): number[] {
    const values = log.get(message.trim(), field.trim())
    if (!(values instanceof Float64Array)) throw new Error(`Missing numeric field ${message}.${field}`)
    return Array.from(values)
}
/** First closest sample wins; the selected end sample remains exclusive, as before. */
export function nearestIndex(values: readonly number[], target: number): number {
    let index = 0, distance = Infinity
    values.forEach((value, i) => { const current = Math.abs(value - target); if (current < distance) { distance = current; index = i } })
    return index
}
/** Slice each output on its own clock and retain legacy index-based ATT compensation. */
export function outputSamples(log: DataflashLog, signal: Signal, start: number, end: number): number[] {
    const times = numericField(log, signal.message, 'TimeUS')
    let values = numericField(log, signal.message, signal.field).slice(nearestIndex(times, start), nearestIndex(times, end))
    const multiplierText = signal.multiplier?.trim()
    const multiplier = multiplierText ? parseFloat(multiplierText) : 1
    if (multiplierText) values = values.map(value => value * multiplier)
    if (signal.compensation) {
        const attitudeTimes = numericField(log, 'ATT', 'TimeUS'), attitude = numericField(log, 'ATT', signal.compensation)
        const first = nearestIndex(attitudeTimes, start)
        values = values.map((value, i) => signal.compensation === 'Roll' ? value + (Math.PI / 180) * multiplier * 9.81 * attitude[first + i]! : value - (Math.PI / 180) * multiplier * 9.81 * attitude[first + i]!)
    }
    return values
}
/** Preserve numeric-prefix parsing and empty-cell null semantics of legacy matrices. */
export function matrixValues(matrix: string[][]): Matrix {
    return matrix.map(row => row.map(cell => { const value = cell.trim(); return value === '' ? null : !Number.isNaN(Number(value)) ? parseFloat(value) : value }))
}
/** Assemble only consumed Python globals; no generated Python interpolates user input. */
export function pythonInputs(log: DataflashLog, config: Configuration, mode: Mode): PythonInputs {
    const start = Number(config.start) * 1000000, end = Number(config.end) * 1000000
    const times = numericField(log, config.input.message, 'TimeUS')
    const first = nearestIndex(times, start), last = nearestIndex(times, end)
    const outputs = config.outputs.slice(0, mode === 'tf' ? 1 : undefined).map(signal => outputSamples(log, signal, start, end))
    const values: PythonInputs = { time_data: times.slice(first, last), input_data: numericField(log, config.input.message, config.input.field).slice(first, last), output_data: mode === 'tf' ? outputs[0]! : outputs, t_start: mode === 'tf' ? config.start.trim() : parseFloat(config.start), t_end: mode === 'tf' ? config.end.trim() : parseFloat(config.end), f_start: config.frequencyStart.trim(), f_end: config.frequencyEnd.trim(), f_cutoff: config.cutoff.trim() }
    if (mode === 'tf') return { ...values, numerator: config.numerator.trim(), denominator: config.denominator.trim(), symbols: config.symbols.trim() }
    return { ...values, numInputs: 1, numOutputs: outputs.length, sym_var: config.parameters.map(value => value.trim()), matrixA: matrixValues(config.matrixA), matrixB: matrixValues(config.matrixB), matrixH0: matrixValues(config.H0), matrixH1: matrixValues(config.H1), orderA: config.matrixA.length, bounds_array: [config.bounds.map(row => parseFloat(row[0]!)), config.bounds.map(row => parseFloat(row[1]!))], con_str: config.constraints.length ? config.constraints.map(row => row.map(value => value.trim())) : [[]] }
}
/** Available instance-free message names retain the legacy alphabetical ordering. */
export function messageNames(log: DataflashLog | null): string[] { return log ? Object.entries(log.messageTypes).filter(([, value]) => value && !('instances' in value)).map(([name]) => name).sort((a,b) => a.localeCompare(b)) : [] }
