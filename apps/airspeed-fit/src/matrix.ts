/** Consumed surface of the unchanged ml-matrix UMD distribution. */
export interface MatrixValue {
    /** Return the vendor result in row-major order. */
    to1DArray(): number[]
    /** Return the vendor result as rows. */
    to2DArray(): number[][]
}
export interface MatrixApi {
    Matrix: { new (rows: number[][]): MatrixValue; columnVector(values: number[]): MatrixValue }
    /** Solve the normal equations with the pinned vendor algorithm. */
    solve(matrix: MatrixValue, rhs: MatrixValue): MatrixValue
    /** Invert a covariance matrix using the pinned vendor implementation. */
    inverse(matrix: MatrixValue): MatrixValue
}
declare global {
    var mlMatrix: MatrixApi
}
export const mlMatrix: MatrixApi = globalThis.mlMatrix
