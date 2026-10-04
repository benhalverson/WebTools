/* oxlint-disable unicorn/no-new-array -- Sparse arrays and RangeError behavior are legacy contracts. */
/** Split real/imaginary arrays, matching legacy storage (including unequal lengths). */
export type ComplexArray = [number[], number[]];
/** Copy/conversion helpers can preserve missing components as explicit undefined. */
export type ComplexStorage = [(number | undefined)[], (number | undefined)[]];
export type ComplexInput = readonly [readonly number[], readonly number[]];
// Indexed assertions intentionally retain legacy undefined arithmetic for sparse or
// mismatched inputs. They neither validate nor replace missing values at runtime.
// Helpers for Array and complex maths

export function complex_mul(C1: ComplexInput, C2: ComplexInput): ComplexArray {
    const len = C1[0].length
    const ret: ComplexArray = [new Array<number>(len), new Array<number>(len)]
    for (let i = 0; i<len; i++) {
        const ac = C1[0][i]! * C2[0][i]!
        const bd = C1[1][i]! * C2[1][i]!
        const ad = C1[0][i]! * C2[1][i]!
        const bc = C1[1][i]! * C2[0][i]!
        ret[0][i] = ac - bd
        ret[1][i] = ad + bc
    }
    return ret
}

export function complex_div(C1: ComplexInput, C2: ComplexInput): ComplexArray {
    const len = C1[0].length
    const ret: ComplexArray = [new Array<number>(len), new Array<number>(len)]
    for (let i = 0; i<len; i++) {
        const ac = C1[0][i]! * C2[0][i]!
        const bd = C1[1][i]! * C2[1][i]!
        const ad = C1[0][i]! * C2[1][i]!
        const bc = C1[1][i]! * C2[0][i]!
        const denominator = 1 / (C2[0][i]!**2 + C2[1][i]!**2)
        ret[0][i] = (ac + bd) * denominator
        ret[1][i] = (bc - ad) * denominator
    }
    return ret
}

export function complex_abs(C: ComplexInput): number[] {
    const len = C[0].length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = ((C[0][i]!**2) + (C[1][i]!**2))**0.5
    }
    return ret
}

export function complex_inverse(C: ComplexInput): ComplexArray {
    const len = C[0].length
    const ret: ComplexArray = [new Array<number>(len), new Array<number>(len)]
    for (let i = 0; i<len; i++) {
        const denominator = 1 / ((C[0][i]!**2) + (C[1][i]!**2))
        ret[0][i] = C[0][i]! * denominator
        ret[1][i] = C[1][i]! * -denominator
    }
    return ret
}

export function complex_square(C: ComplexInput): ComplexArray {
    const len = C[0].length
    const ret: ComplexArray = [new Array<number>(len), new Array<number>(len)]
    for (let i = 0; i<len; i++) {
        ret[0][i] = (C[0][i]!**2) - (C[1][i]!**2)
        ret[1][i] = C[0][i]! * C[1][i]! * 2
    }
    return ret
}

export function complex_phase(C: ComplexInput): number[] {
    const len = C[0].length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.atan2(C[1][i]!, C[0][i]!)
    }
    return ret
}

export function complex_conj(C: ComplexInput): ComplexArray {
    return [ C[0].slice(), array_scale(C[1], -1) ]
}

export function exp_jw(freq: readonly number[], rate: number): ComplexArray {
    const scale = (2*Math.PI) / rate
    const len = freq.length
    const ret: ComplexArray = [new Array<number>(len), new Array<number>(len)]
    for (let i = 0; i<len; i++) {
        // e^(ic) = (cos c) + i(sin c)
        // no real component in jw
        const jw = freq[i]! * scale
        ret[0][i] = Math.cos(jw)
        ret[1][i] = Math.sin(jw)
    }
    return ret
}

export function array_max(A: readonly number[], B: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.max(A[i]!, B[i]!)
    }
    return ret
}

export function array_min(A: readonly number[], B: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.min(A[i]!, B[i]!)
    }
    return ret
}

export function array_scale(A: readonly number[], scale: number): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i]! * scale
    }
    return ret
}

export function array_inverse(A: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = 1 / A[i]!
    }
    return ret
}

export function array_mul(A: readonly number[], B: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i]! * B[i]!
    }
    return ret
}

export function array_div(A: readonly number[], B: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i]! / B[i]!
    }
    return ret
}

export function array_offset(A: readonly number[], offset: number): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i]! + offset
    }
    return ret
}

export function array_add(A: readonly number[], B: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i]! + B[i]!
    }
    return ret
}

export function array_sub(A: readonly number[], B: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i]! - B[i]!
    }
    return ret
}

export function array_log10(A: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.log10(A[i]!)
    }
    return ret
}

export function array_all_equal(A: readonly number[], val: number): boolean {
    const len = A.length
    for (let i = 0; i < len; i++) {
        if (A[i]! != val) {
            return false
        }
    }
    return true
}

export function array_all_NaN(A: readonly number[]): boolean {
    const len = A.length
    for (let i = 0; i < len; i++) {
        if (!isNaN(A[i]!)) {
            return false
        }
    }
    return true
}

export function array_abs(A: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.abs(A[i]!)
    }
    return ret
}

export function array_sqrt(A: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.sqrt(A[i]!)
    }
    return ret
}

export function array_sum(A: readonly number[]): number {
    const len = A.length
    let ret = 0
    for (let i = 0; i<len; i++) {
        ret += A[i]!
    }
    return ret
}

export function array_mean(A: readonly number[]): number {
    return array_sum(A) / A.length
}

// Return a range, including start and end points
export function array_from_range(start: number, end: number, step: number): number[] {
    const len = Math.floor((end - start) / step) + 1
    let val = start
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = val
        val += step
    }
    return ret
}

// Linear interpolation between arrays
export function linear_interp(values: readonly number[], index: readonly number[], query_index: readonly number[]): (number | undefined)[] {

    const len = query_index.length
    const ret = new Array<number>(len)

    const last_value_index = index.length - 1
    let interpolate_index = 0
    for (let i = 0; i < len; i++) {
        if (query_index[i]! <= index[0]!) {
            // Before start
            ret[i] = values[0]!
            continue
        }
        if (query_index[i]! >= index[last_value_index]!) {
            // After end
            ret[i] = values[last_value_index]!
            continue
        }

        // increment index until there is a point after the target
        for (interpolate_index; interpolate_index < last_value_index; interpolate_index++) {
            if (query_index[i]! < index[interpolate_index+1]!) {
                const ratio = (query_index[i]! - index[interpolate_index]!) / (index[interpolate_index+1]! - index[interpolate_index]!)
                ret[i] = values[interpolate_index]! + (values[interpolate_index+1]! - values[interpolate_index]!) * ratio
                break
            }
        }

    }
    return ret
}
