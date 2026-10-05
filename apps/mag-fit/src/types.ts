import type { get_compass_param_names } from '@webtools/parameters'

export interface VectorSeries {
    x: number[]
    y: number[]
    z: number[]
}
export interface QuaternionSeries {
    q1: number[]
    q2: number[]
    q3: number[]
    q4: number[]
    yaw: number[]
}
export interface Calibration {
    offsets: number[]
    diagonals: number[]
    off_diagonals: number[]
    motor: number[]
    scale: number
    orientation: number
    fit_type: number
}
export interface RecordedCalibration extends Calibration {
    id: number
    use: number
    external: number
}
export interface FitResult extends VectorSeries {
    params: Calibration
    valid: boolean
    error: number[]
    yaw: number[]
    mean_error: number
}
export const fitTypes = ['offsets', 'scale', 'iron'] as const
export type FitType = (typeof fitTypes)[number]
export interface MotorFit {
    value: number[] | null
    type: number
    name: string
    offsets: FitResult
    scale: FitResult
    iron: FitResult
}
export interface Compass {
    index: number
    names: ReturnType<typeof get_compass_param_names>
    params: RecordedCalibration
    time: number[]
    raw: VectorSeries
    orig: FitResult
    rotated: VectorSeries
    rotate: boolean
    rotation: number
    fits: MotorFit[]
    coverage: number
    healthy: boolean
    expected: VectorSeries & { bins: number[] }
    quaternion: QuaternionSeries
}
export interface Attitude {
    name: string
    quaternion: QuaternionSeries & { time: number[] }
}
export interface EarthField {
    declination: number
    inclination: number
    intensity: number
    vector: number[]
}
export interface FlightSeries {
    name: string
    unit: string
    time: number[]
    value: number[]
}
export interface LogData {
    compasses: Compass[]
    attitudes: Attitude[]
    attitude: number
    earth: EarthField
    start: number
    end: number
    messages: string[]
    flight: FlightSeries[]
    motor: FlightSeries[]
    warnings: string[]
}
export interface FitOptions {
    start: number
    end: number
    attitude: number
    orientations: readonly number[]
}
export interface FitOutput {
    compasses: Compass[]
    source: VectorSeries & Attitude
    warnings: string[]
}
/** Consumed interface of the unchanged matrix.umd.js vendor, including its mutable width. */
export interface Matrix {
    data: (Float64Array | number[])[]
    columns: number
    get(row: number, column: number): number
    mmul(other: Matrix): Matrix
}
export interface MatrixApi {
    Matrix: { new (rows: number, columns: number): Matrix; new (data: number[][]): Matrix }
    solve(a: Matrix, b: Matrix): Matrix
    inverse(matrix: Matrix): Matrix
}
/** Create independent empty coordinate arrays; no arrays are shared across sessions. */
export function emptyVector(): VectorSeries {
    return { x: [], y: [], z: [] }
}
/** Initialize an unevaluated fit; invalid results never expose placeholder parameters. */
export function emptyFit(): FitResult {
    return {
        ...emptyVector(),
        params: {
            offsets: [0, 0, 0],
            diagonals: [1, 1, 1],
            off_diagonals: [0, 0, 0],
            motor: [0, 0, 0],
            scale: 1,
            orientation: 0,
            fit_type: 0,
        },
        valid: false,
        error: [],
        yaw: [],
        mean_error: NaN,
    }
}
/** Initialize quaternion arrays owned by one compass or attitude source. */
export function emptyQuaternion(): QuaternionSeries {
    return { q1: [], q2: [], q3: [], q4: [], yaw: [] }
}
