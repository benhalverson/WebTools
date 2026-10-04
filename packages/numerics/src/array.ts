/* oxlint-disable unicorn/no-new-array -- Sparse arrays and RangeError behavior are legacy contracts. */
/** Split real/imaginary arrays, matching legacy storage (including unequal lengths). */
export type ComplexArray = [number[], number[]];
/** Copy/conversion helpers can preserve missing components as explicit undefined. */
export type ComplexStorage = [(number | undefined)[], (number | undefined)[]];
export type ComplexInput = readonly [readonly number[], readonly number[]];
// Indexed assertions intentionally retain legacy undefined arithmetic for sparse or
// mismatched inputs. They neither validate nor replace missing values at runtime.
// Helpers for Array and complex maths

/** Multiply corresponding complex samples into new split arrays.
 * The real length of C1 sets the output length; missing components produce NaN. */
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

/** Divide corresponding complex samples into new split arrays.
 * The real length of C1 sets the output length. Zero divisors and missing
 * components retain JavaScript non-finite arithmetic without validation. */
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

/** Return the magnitude of each complex sample using the real-component length.
 * Missing imaginary components yield NaN; squared components may overflow. */
export function complex_abs(C: ComplexInput): number[] {
    const len = C[0].length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = ((C[0][i]!**2) + (C[1][i]!**2))**0.5
    }
    return ret
}

/** Return the reciprocal of each complex sample in new split arrays.
 * Zero samples and missing components retain non-finite arithmetic. */
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

/** Square each complex sample into new split arrays using the real-component
 * length; missing components propagate through ordinary arithmetic. */
export function complex_square(C: ComplexInput): ComplexArray {
    const len = C[0].length
    const ret: ComplexArray = [new Array<number>(len), new Array<number>(len)]
    for (let i = 0; i<len; i++) {
        ret[0][i] = (C[0][i]!**2) - (C[1][i]!**2)
        ret[1][i] = C[0][i]! * C[1][i]! * 2
    }
    return ret
}

/** Return complex sample phases in radians using atan2(imaginary, real).
 * The real-component length controls the result; signed zeros are preserved
 * by atan2 and missing components yield NaN. */
export function complex_phase(C: ComplexInput): number[] {
    const len = C[0].length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.atan2(C[1][i]!, C[0][i]!)
    }
    return ret
}

/** Copy the real components and negate the imaginary components.
 * Each component keeps its own length; real holes survive slice, while
 * imaginary holes become NaN during scaling. */
export function complex_conj(C: ComplexInput): ComplexArray {
    return [ C[0].slice(), array_scale(C[1], -1) ]
}

/** Evaluate exp(j * 2π * frequency / rate) for every frequency.
 * @param freq Frequencies in the same units as the sampling rate.
 * @param rate Sampling rate; zero and non-finite rates are not rejected.
 * @returns Newly allocated real cosine and imaginary sine components. */
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

/** Return pairwise maxima with A determining the output length.
 * Missing operands yield NaN; Math.max retains its signed-zero behavior. */
export function array_max(A: readonly number[], B: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.max(A[i]!, B[i]!)
    }
    return ret
}

/** Return pairwise minima with A determining the output length.
 * Missing operands yield NaN; Math.min retains its signed-zero behavior. */
export function array_min(A: readonly number[], B: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.min(A[i]!, B[i]!)
    }
    return ret
}

/** Multiply every entry by scale into a new array; holes become NaN. */
export function array_scale(A: readonly number[], scale: number): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i]! * scale
    }
    return ret
}

/** Return elementwise reciprocals in a new array.
 * Signed zeros become signed infinities and holes become NaN. */
export function array_inverse(A: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = 1 / A[i]!
    }
    return ret
}

/** Return elementwise products with A determining the output length.
 * Missing operands become NaN; neither input is padded or modified. */
export function array_mul(A: readonly number[], B: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i]! * B[i]!
    }
    return ret
}

/** Return elementwise quotients with A determining the output length.
 * Missing operands and zero divisors retain JavaScript non-finite arithmetic. */
export function array_div(A: readonly number[], B: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i]! / B[i]!
    }
    return ret
}

/** Add offset to every entry in a new array; holes become NaN. */
export function array_offset(A: readonly number[], offset: number): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i]! + offset
    }
    return ret
}

/** Add corresponding entries into a new array of A.length.
 * Missing operands become NaN; neither input is padded or modified. */
export function array_add(A: readonly number[], B: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i]! + B[i]!
    }
    return ret
}

/** Subtract B from A into a new array of A.length.
 * Missing operands become NaN; neither input is padded or modified. */
export function array_sub(A: readonly number[], B: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i]! - B[i]!
    }
    return ret
}

/** Return base-10 logarithms without clamping the input.
 * Zero yields -Infinity; negative entries and holes yield NaN. */
export function array_log10(A: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.log10(A[i]!)
    }
    return ret
}

/** Test every entry against val using the legacy loose-equality comparison.
 * Empty arrays return true; NaN does not compare equal to itself. */
export function array_all_equal(A: readonly number[], val: number): boolean {
    const len = A.length
    for (let i = 0; i < len; i++) {
        if (A[i]! != val) {
            return false
        }
    }
    return true
}

/** Test every entry with the coercing global isNaN predicate.
 * Holes count as NaN and empty arrays return true. */
export function array_all_NaN(A: readonly number[]): boolean {
    const len = A.length
    for (let i = 0; i < len; i++) {
        if (!isNaN(A[i]!)) {
            return false
        }
    }
    return true
}

/** Return absolute values in a new array; negative zero becomes positive zero
 * and holes become NaN. */
export function array_abs(A: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.abs(A[i]!)
    }
    return ret
}

/** Return square roots without clamping negative inputs.
 * Negative entries and holes yield NaN; negative zero remains negative zero. */
export function array_sqrt(A: readonly number[]): number[] {
    const len = A.length
    const ret = new Array<number>(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.sqrt(A[i]!)
    }
    return ret
}

/** Sum entries from left to right starting at zero.
 * Empty arrays return zero; holes propagate NaN without being skipped. */
export function array_sum(A: readonly number[]): number {
    const len = A.length
    let ret = 0
    for (let i = 0; i<len; i++) {
        ret += A[i]!
    }
    return ret
}

/** Return the left-to-right sum divided by the array length.
 * Empty arrays and arrays containing holes yield NaN. */
export function array_mean(A: readonly number[]): number {
    return array_sum(A) / A.length
}

/** Build a range by repeated addition of step, starting at start.
 * @param end Inclusive bound only when reached by the computed step count.
 * @param step Increment; its sign must agree with the requested direction.
 * @returns floor((end - start) / step) + 1 samples, without rounding correction.
 * @throws RangeError when the computed array length is invalid. */
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

/** Interpolate values at query positions, clamping at the first and last index.
 * @param index Source positions, expected to be increasing.
 * @param query_index Query positions, expected to be nondecreasing because
 * the interpolation cursor only advances. Inputs are never sorted.
 * @returns One slot per query; unmatched queries can leave holes and missing
 * endpoint values can be undefined. Missing arithmetic operands produce NaN. */
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
