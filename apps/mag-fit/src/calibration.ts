/* oxlint-disable unicorn/no-new-array -- Preserve sparse allocation and original numerical evaluation. */
import { array_add, array_all_equal, array_offset, array_scale } from "@webtools/numerics"
import type { VectorSeries, Calibration } from "./types.ts"
/** Accept scale factors in the original inclusive firmware validity interval. */
export function scale_valid(scale: number) {
    const MAX_SCALE_FACTOR = 1.5
    return (scale <= MAX_SCALE_FACTOR) && (scale >= (1/MAX_SCALE_FACTOR))
}

/** Apply offsets, valid scale, nonzero iron matrix and motor correction in legacy order. */
export function apply_params(ret: VectorSeries, raw: VectorSeries, params: Calibration, motor: number[] | null) {

    // Offsets
    ret.x = array_offset(raw.x, params.offsets[0]!)
    ret.y = array_offset(raw.y, params.offsets[1]!)
    ret.z = array_offset(raw.z, params.offsets[2]!)

    // scale
    if (scale_valid(params.scale)) {
        ret.x = array_scale(ret.x, params.scale)
        ret.y = array_scale(ret.y, params.scale)
        ret.z = array_scale(ret.z, params.scale)
    }

    // Iron
    if (!array_all_equal(params.diagonals, 0.0)) {

        // Vectorized multiplication
        const corrected_x = array_add(array_add( array_scale(ret.x, params.diagonals[0]!),     array_scale(ret.y, params.off_diagonals[0]!)), array_scale(ret.z, params.off_diagonals[1]!) )
        const corrected_y = array_add(array_add( array_scale(ret.x, params.off_diagonals[0]!), array_scale(ret.y, params.diagonals[1]!)),     array_scale(ret.z, params.off_diagonals[2]!) )
        const corrected_z = array_add(array_add( array_scale(ret.x, params.off_diagonals[1]!), array_scale(ret.y, params.off_diagonals[2]!)), array_scale(ret.z, params.diagonals[2]!) )

        ret.x = corrected_x; ret.y = corrected_y; ret.z = corrected_z
    }

    // Motor
    if (motor != null) {
        ret.x = array_add(ret.x, array_scale(motor, params.motor[0]!))
        ret.y = array_add(ret.y, array_scale(motor, params.motor[1]!))
        ret.z = array_add(ret.z, array_scale(motor, params.motor[2]!))
    }
}

// Angle wrap helpers
/** Apply the legacy single-turn remainder operation; negative multi-turn values remain negative. */
export function wrap_2PI(rad: number) {
    const PI2 = Math.PI * 2
    return (rad + PI2) % PI2
}

/** Wrap one turn then subtract a full turn only above positive pi. */
export function wrap_PI(rad: number) {
    let ret = wrap_2PI(rad)
    if (ret > Math.PI) {
        ret -= Math.PI * 2
    }
    return ret
}

/** Map heading differences through the legacy signed-angle wrapper. */
export function array_wrap_PI(A: number[]) {
    const len = A.length
    let ret = new Array<number>(len)
    for (let i = 0; i < len; i++) {
        ret[i]! = wrap_PI(A[i]!)
    }
    return ret
}

/** Map headings through the legacy unsigned-angle wrapper. */
export function array_wrap_2PI(A: number[]) {
    const len = A.length
    let ret = new Array<number>(len)
    for (let i = 0; i < len; i++) {
        ret[i]! = wrap_2PI(A[i]!)
    }
    return ret
}

/** Calculate Euclidean field residuals in milligauss without reordering operations. */
export function calc_error(A: VectorSeries, B: VectorSeries) {
    const len = A.x.length
    let ret = new Array<number>(len)
    for (let i = 0; i < len; i++) {
        ret[i]! = Math.sqrt((A.x[i]! - B.x[i]!)**2 + (A.y[i]! - B.y[i]!)**2 + (A.z[i]! - B.z[i]!)**2)
    }
    return ret
}
