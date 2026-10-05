/* oxlint-disable unicorn/no-new-array -- Preserve legacy allocation/RangeError and sparse-array behavior. */
import { array_from_range, array_log10, array_offset, array_scale, complex_abs, complex_div, complex_inverse, complex_mul, complex_phase, complex_square, exp_jw, type ComplexArray } from '@webtools/numerics'

export type Parameters = Readonly<Record<string, string>>
export interface Response { attenuation: number[]; phase: number[] }
export interface Transfer extends Response {
    sample_rate: number
    enabled: boolean
    components?: Response[]
    /** Evaluate this filter and retain its individually displayed response. */
    transfer(z: ComplexArray, z1: ComplexArray, z2: ComplexArray, db: boolean, unwrapPhase: boolean): ComplexArray
}

/** Preserve FilterTool's asymmetric phase unwrap thresholds (45/315 degrees). */
export function unwrap(phase: number[]): number[] {
    const result = new Array<number>(phase.length)
    result[0] = phase[0]!
    for (let i = 1; i < phase.length; i++) {
        let difference = phase[i]! - phase[i - 1]!
        if (difference > 315) difference -= 360
        else if (difference < -45) difference += 360
        result[i] = result[i - 1]! + difference
    }
    return result
}

/** Convert complex samples to the page's selected magnitude and phase units. */
export function response(h: ComplexArray, db: boolean, unwrapPhase: boolean): Response {
    let attenuation = complex_abs(h)
    let phase = array_scale(complex_phase(h), 180 / Math.PI)
    if (db) attenuation = array_scale(array_log10(attenuation), 20)
    if (unwrapPhase) phase = unwrap(phase)
    return { attenuation, phase }
}

/** Allocate a unity transfer function; disabled filters leave component arrays empty. */
function unity(length: number): ComplexArray { return [new Array<number>(length).fill(1), new Array<number>(length).fill(0)] }

/** Bind a pure transfer evaluator to the component response displayed by the UI. */
function filter(sample_rate: number, enabled: boolean, evaluate: (z: ComplexArray, z1: ComplexArray, z2: ComplexArray) => ComplexArray): Transfer {
    return { sample_rate, enabled, attenuation: [], phase: [],
        /** Evaluate enabled filters and record display units without changing complex output. */
        transfer(z, z1, z2, db, unwrapPhase) {
            if (!enabled) return unity(z1[0].length)
            const h = evaluate(z, z1, z2)
            Object.assign(this, response(h, db, unwrapPhase))
            return h
        },
    }
}

/** Evaluate the legacy second-order polynomial with the same operation ordering. */
function biquad(z1: ComplexArray, z2: ComplexArray, b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): ComplexArray {
    const numerator: ComplexArray = [[], []], denominator: ComplexArray = [[], []]
    for (let i = 0; i < z1[0].length; i++) {
        numerator[0][i] = b0 + b1 * z1[0][i]! + b2 * z2[0][i]!
        numerator[1][i] = b1 * z1[1][i]! + b2 * z2[1][i]!
        denominator[0][i] = a0 + a1 * z1[0][i]! + a2 * z2[0][i]!
        denominator[1][i] = a1 * z1[1][i]! + a2 * z2[1][i]!
    }
    return complex_div(numerator, denominator)
}

/** Construct FilterTool's Butterworth gyro low-pass, including cutoff <= 0 bypass. */
export function lowpass(sampleRate: number, cutoff: number): Transfer {
    const ohm = Math.tan(Math.PI / (sampleRate / cutoff))
    const c = 1 + 2 * Math.cos(Math.PI / 4) * ohm + ohm * ohm
    const b0 = ohm * ohm / c
    return filter(sampleRate, !(cutoff <= 0), (_z, z1, z2) => biquad(z1, z2, b0, 2 * b0, b0, 1, 2 * (ohm * ohm - 1) / c, (1 - 2 * Math.cos(Math.PI / 4) * ohm + ohm * ohm) / c))
}

/** Preserve FilterTool's notch Q, attenuation and out-of-band unity behavior. */
function notch(sampleRate: number, center: number, bandwidth: number, attenuation: number): Transfer {
    const a = Math.pow(10, -attenuation / 40)
    const octaves = Math.log2(center / (center - bandwidth / 2)) * 2
    const q = center > 0.5 * bandwidth ? Math.sqrt(Math.pow(2, octaves)) / (Math.pow(2, octaves) - 1) : 0
    const omega = 2 * Math.PI * center / sampleRate
    const alpha = Math.sin(omega) / (2 * q)
    const b1 = -2 * Math.cos(omega)
    const a0Inverse = 1 / (1 + alpha)
    return filter(sampleRate, center > 0.5 * bandwidth && center > 0 && center < 0.5 * sampleRate && q > 0,
        (_z, z1, z2) => biquad(z1, z2, 1 + alpha * (a ** 2), b1, 1 - alpha * (a ** 2), 1 / a0Inverse, b1, 1 - alpha))
}

/** Read raw parameter text with legacy parseFloat semantics, including NaN. */
export function value(params: Parameters, name: string): number { return parseFloat(params[name] ?? '') }

/** Build this page's eight-harmonic model, retaining option precedence and clamping.
 * Other tools deliberately use different models; this implementation is app-owned.
 */
export function harmonic(sampleRate: number, params: Parameters, prefix: string): Transfer {
    /** Read one parameter in this filter namespace using legacy coercion. */
    const read = (suffix: string) => value(params, prefix + suffix)
    let frequency = read('FREQ')
    const bandwidth = read('BW'), attenuation = read('ATT'), reference = read('REF'), mode = read('MODE'), options = read('OPTS')
    const composite = options & 1 ? 2 : options & 16 ? 3 : 1
    let chained = 1
    if (mode === 1) frequency *= Math.max(read('FM_RAT'), Math.sqrt(Math.max(0, value(params, 'Throttle')) / reference))
    if (mode === 2 || mode === 5) frequency = Math.max(value(params, mode === 2 ? 'RPM1' : 'RPM2') / 60, frequency) * reference
    if (mode === 3) {
        if (options & 2) chained = value(params, 'NUM_MOTORS')
        frequency = Math.max(value(params, 'ESC_RPM') / 60, frequency) * reference
    }
    const notches: Transfer[] = []
    if (!(read('ENABLE') <= 0)) for (let n = 0; n < 8; n++) {
        if (!(read('HMNCS') & (1 << n))) continue
        let center = frequency * (n + 1)
        const width = bandwidth * (n + 1)
        for (let c = 0; c < chained; c++) {
            const limit = sampleRate * 0.48
            const spread = width / (32 * center)
            center = Math.min(Math.max(center, width * 0.52), limit)
            if (composite !== 2 && center < limit) notches.push(notch(sampleRate, center, width / composite, attenuation))
            if (composite > 1) for (const displaced of [center * (1 - spread), center * (1 + spread)]) {
                if (displaced < limit) notches.push(notch(sampleRate, displaced, width / composite, attenuation))
            }
        }
    }
    return filter(sampleRate, !(read('ENABLE') <= 0), (z, z1, z2) => {
        let h = unity(z1[0].length)
        for (const part of notches) h = complex_mul(h, part.transfer(z, z1, z2, false, false))
        return h
    })
}

/** Assemble notches before the gyro low-pass, matching legacy multiplication order. */
export function gyroFilters(params: Parameters): Transfer[] {
    const rate = value(params, 'GyroSampleRate')
    return [harmonic(rate, params, 'INS_HNTCH_'), harmonic(rate, params, 'INS_HNTC2_'), lowpass(rate, value(params, 'INS_GYRO_FILTER'))]
}

/** First-order PID filter; nonpositive cutoff bypasses rather than zeroing the gain. */
function onePole(z1: ComplexArray, sampleRate: number, cutoff: number): ComplexArray {
    if (cutoff <= 0) return unity(z1[0].length)
    const dt = 1 / sampleRate
    const alpha = dt <= 0 || cutoff <= 0 ? 1 : dt / (dt + 1 / (Math.PI * 2 * cutoff))
    return complex_div([new Array<number>(z1[0].length).fill(alpha), new Array<number>(z1[0].length).fill(0)],
        [array_offset(array_scale(z1[0], alpha - 1), 1), array_scale(z1[1], alpha - 1)])
}

/** Construct the PID sum and its pre-gyro P/I/D components at the loop sample rate. */
export function pid(params: Parameters, axis: string): Transfer {
    const rate = value(params, 'SCHED_LOOP_RATE')
    /** Read one parameter in this filter namespace using legacy coercion. */
    const read = (suffix: string) => value(params, `ATC_RAT_${axis}_${suffix}`)
    return { sample_rate: rate, enabled: true, attenuation: [], phase: [], components: [],
        /** Evaluate PID components separately before summing, preserving arithmetic order. */
        transfer(z, z1, _z2, db, unwrapPhase) {
            const e = onePole(z1, rate, read('FLTE'))
            const d = complex_mul(e, onePole(z1, rate, read('FLTD')))
            const integral = complex_mul(complex_div(z, [array_offset(z[0], -1), z[1].slice()]), e)
            const derivative = complex_mul([array_offset(array_scale(z1[0], -1), 1), array_scale(z1[1], -1)], d)
            const p: ComplexArray = [[], []], i: ComplexArray = [[], []], differential: ComplexArray = [[], []], total: ComplexArray = [[], []]
            for (let n = 0; n < z1[0].length; n++) for (const side of [0, 1] as const) {
                p[side][n] = e[side][n]! * read('P')
                i[side][n] = integral[side][n]! * (read('I') / rate)
                differential[side][n] = derivative[side][n]! * (read('D') * rate)
                total[side][n] = p[side][n]! + i[side][n]! + differential[side][n]!
            }
            Object.assign(this, response(total, db, unwrapPhase))
            this.components = [p, i, differential].map(part => response(part, db, unwrapPhase))
            return total
        },
    }
}

/** Evaluate groups at their own sample rates on the legacy inclusive frequency grid. */
export function evaluate(groups: Transfer[][], maximum: number, step: number, db: boolean, unwrapPhase: boolean): Response & { freq: number[] } {
    const freq = array_from_range(step, maximum, step)
    let total = unity(freq.length)
    for (const group of groups) {
        const z = exp_jw(freq, group[0]!.sample_rate)
        const z1 = complex_inverse(z), z2 = complex_inverse(complex_square(z))
        for (const part of group) total = complex_mul(total, part.transfer(z, z1, z2, db, unwrapPhase))
    }
    return { ...response(total, db, unwrapPhase), freq }
}
