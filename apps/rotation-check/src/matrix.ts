/** Row-major direction cosine matrix and forward/right/down column vector. */
export type Vector3 = readonly [number, number, number]
export type Matrix3 = readonly [Vector3, Vector3, Vector3]

/** Builds the legacy intrinsic 321 Euler matrix from degrees, preserving operation
 * order and units. Rejects non-finite angles before they reach the plotting vendor.
 */
export function matrixFromEuler([roll, pitch, yaw]: Vector3): Matrix3 {
    if (![roll, pitch, yaw].every(Number.isFinite)) {
        throw new RangeError('Enter a finite number for each rotation angle.')
    }
    const degreesToRadians = Math.PI / 180.0
    const cp = Math.cos(pitch * degreesToRadians)
    const sp = Math.sin(pitch * degreesToRadians)
    const sr = Math.sin(roll * degreesToRadians)
    const cr = Math.cos(roll * degreesToRadians)
    const sy = Math.sin(yaw * degreesToRadians)
    const cy = Math.cos(yaw * degreesToRadians)
    return [
        [cp * cy, (sr * sp * cy) - (cr * sy), (cr * sp * cy) + (sr * sy)],
        [cp * sy, (sr * sp * sy) + (cr * cy), (cr * sp * sy) - (sr * cy)],
        [-sp, sr * cp, cr * cp],
    ]
}

/** Applies a row-major matrix without changing the legacy addition order or zeros. */
export function rotateVector(matrix: Matrix3, vector: Vector3): Vector3 {
    const [a, b, c] = matrix
    const [x, y, z] = vector
    return [
        a[0] * x + a[1] * y + a[2] * z,
        b[0] * x + b[1] * y + b[2] * z,
        c[0] * x + c[1] * y + c[2] * z,
    ]
}
