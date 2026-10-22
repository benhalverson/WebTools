import { complex_div, complex_inverse, complex_square, exp_jw, type ComplexArray } from '@webtools/numerics'
import { targets, type Tracking } from './tracking.ts'

export interface Notch { enable: number; mode: number; freq: number; bandwidth: number; attenuation: number; ref: number; min_ratio: number; harmonics: number; options: number }
export interface FilterSettings { version: number; lowpass: number; notches: Notch[] }

/** Owned TypeScript implementation of FilterReview's low-pass coefficients. */
export class DigitalBiquadFilter {
    target_freq: number
    /** Construct the unchanged second-order gyro low-pass response. */
    constructor(freq: number) {
    this.target_freq = freq

    if (this.target_freq <= 0) {
        this.transfer = () => {}
        return this
    }

    /** Multiply the low-pass numerator and denominator in place. */
    this.transfer = function(Hn: ComplexArray, Hd: ComplexArray, sample_freq: number, Z1: ComplexArray, Z2: ComplexArray) {

        const fr = sample_freq/this.target_freq
        const ohm = Math.tan(Math.PI/fr)
        const c = 1.0+2.0*Math.cos(Math.PI/4.0)*ohm + ohm*ohm

        const b0 = ohm*ohm/c
        const b1 = 2.0*b0
        const b2 = b0
        const a1 = 2.0*(ohm*ohm-1.0)/c
        const a2 = (1.0-2.0*Math.cos(Math.PI/4.0)*ohm+ohm*ohm)/c

        // Build transfer function and apply to H division done at final step
        const len = Z1[0].length
        for (let i = 0; i<len; i++) {
            // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(1 + a1*z^-1 + a2*z^-2)
            const numerator_r = b0 + b1 * Z1[0][i]! + b2 * Z2[0][i]!
            const numerator_i =      b1 * Z1[1][i]! + b2 * Z2[1][i]!

            const denominator_r = 1 + a1 * Z1[0][i]! + a2 * Z2[0][i]!
            const denominator_i =     a1 * Z1[1][i]! + a2 * Z2[1][i]!

            // This is just two instances of complex multiplication
            // Reimplementing it inline here saves memory and is faster
            const numerator_ac = Hn[0][i]! * numerator_r
            const numerator_bd = Hn[1][i]! * numerator_i
            const numerator_ad = Hn[0][i]! * numerator_i
            const numerator_bc = Hn[1][i]! * numerator_r

            Hn[0][i] = numerator_ac - numerator_bd
            Hn[1][i] = numerator_ad + numerator_bc

            const denominator_ac = Hd[0][i]! * denominator_r
            const denominator_bd = Hd[1][i]! * denominator_i
            const denominator_ad = Hd[0][i]! * denominator_i
            const denominator_bc = Hd[1][i]! * denominator_r

            Hd[0][i] = denominator_ac - denominator_bd
            Hd[1][i] = denominator_ad + denominator_bc
        }

    }

    }
    transfer: (Hn: ComplexArray, Hd: ComplexArray, sample_freq: number, Z1: ComplexArray, Z2: ComplexArray) => void
}

export class NotchFilter {
    A: number
    /** Construct the version-aware notch response with original coefficient order. */
    constructor(attenuation_dB: number, bandwidth_hz: number, harmonic_mul: number, min_freq_fun: (harmonic: number) => number, spread_mul: number) {
    this.A = 10.0**(-attenuation_dB / 40.0)

    /** Apply the original attenuation fade, frequency limits, and notch coefficients. */
    this.transfer = function(Hn: ComplexArray, Hd: ComplexArray, center: number, sample_freq: number, Z1: ComplexArray, Z2: ComplexArray) {
        let center_freq_hz = center * harmonic_mul

        // check center frequency is in the allowable range
        if ((center_freq_hz <= 0.5 * bandwidth_hz) || (center_freq_hz >= 0.5 * sample_freq)) {
            return
        }

        const min_freq = min_freq_fun(harmonic_mul)
        let A = this.A
        if (center_freq_hz < min_freq) {
            const disable_freq = min_freq * 0.25
            if (center_freq_hz < disable_freq) {
                // Disabled
                return
            }

            // Reduce attenuation (A of 1.0 is no attenuation)
            const ratio = (center_freq_hz - disable_freq) / (min_freq - disable_freq)
            A = 1.0 + (A - 1.0) * ratio
        }
        center_freq_hz = Math.max(center_freq_hz, min_freq) * spread_mul

        const octaves = Math.log2(center_freq_hz / (center_freq_hz - bandwidth_hz / 2.0)) * 2.0
        const Q = ((2.0**octaves)**0.5) / ((2.0**octaves) - 1.0)
        const Asq = A**2

        const omega = 2.0 * Math.PI * center_freq_hz / sample_freq
        const alpha = Math.sin(omega) / (2 * Q)
        const b0 =  1.0 + alpha*Asq
        const b1 = -2.0 * Math.cos(omega)
        const b2 =  1.0 - alpha*Asq
        const a0 =  1.0 + alpha
        const a1 = b1
        const a2 =  1.0 - alpha

        // Build transfer function and apply to H division done at final step
        const len = Z1[0].length
        for (let i = 0; i<len; i++) {
            // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(a0 + a1*z^-1 + a2*z^-2)
            const numerator_r = b0 + b1 * Z1[0][i]! + b2 * Z2[0][i]!
            const numerator_i =      b1 * Z1[1][i]! + b2 * Z2[1][i]!

            const denominator_r = a0 + a1 * Z1[0][i]! + a2 * Z2[0][i]!
            const denominator_i =      a1 * Z1[1][i]! + a2 * Z2[1][i]!

            // This is just two instances of complex multiplication
            // Reimplementing it inline here saves memory and is faster
            const numerator_ac = Hn[0][i]! * numerator_r
            const numerator_bd = Hn[1][i]! * numerator_i
            const numerator_ad = Hn[0][i]! * numerator_i
            const numerator_bc = Hn[1][i]! * numerator_r

            Hn[0][i] = numerator_ac - numerator_bd
            Hn[1][i] = numerator_ad + numerator_bc

            const denominator_ac = Hd[0][i]! * denominator_r
            const denominator_bd = Hd[1][i]! * denominator_i
            const denominator_ad = Hd[0][i]! * denominator_i
            const denominator_bc = Hd[1][i]! * denominator_r

            Hd[0][i] = denominator_ac - denominator_bd
            Hd[1][i] = denominator_ad + denominator_bc
        }

    }

    }
    transfer: (Hn: ComplexArray, Hd: ComplexArray, center: number, sample_freq: number, Z1: ComplexArray, Z2: ComplexArray) => void
}


/** Build composite/harmonic notches with FilterReview's option precedence.
 * Unlike FilterTool, double wins over triple and quintuple; V1 has no minimum. */
export function notchBank(config: Notch, version: number): NotchFilter[][] {
    const count = config.options & 1 ? 2 : config.options & 16 ? 3 : config.options & 64 && version >= 4 ? 5 : 1
    /** Retain the version and option-dependent minimum for each harmonic. */
    const minimum = (harmonic: number) => version === 1 ? 0 : config.freq * config.min_ratio * (config.options & 32 ? harmonic : 1)
    const output: NotchFilter[][] = []
    for (let n = 0; n < 16; n++) {
        if (!(config.harmonics & (1 << n))) continue
        const harmonic = n + 1
        const spread = config.bandwidth / (32.0 * config.freq)
        const multipliers = count === 1 ? [1] : [1 - spread, 1 + spread, ...(count >= 3 ? [1] : []), ...(count === 5 ? [1 - 2 * spread, 1 + 2 * spread] : [])]
        output.push(multipliers.map(multiplier => new NotchFilter(config.attenuation, config.bandwidth * harmonic / count, harmonic, minimum, multiplier)))
    }
    return output
}

/** Evaluate the transfer at every FFT time, dividing only after all filters.
 * Static responses are multiplied before dynamic notches, matching the legacy
 * evaluation order even when the second notch is static. */
export function transfer(settings: FilterSettings, tracking: Tracking, time: number[], bins: number[], rate: number): ComplexArray[] {
    const z = exp_jw(bins, rate), z1 = complex_inverse(z), z2 = complex_inverse(complex_square(z))
    /** Construct unity in the split-complex representation. */
    const one = (): ComplexArray => [Array<number>(bins.length).fill(1), Array<number>(bins.length).fill(0)]
    const numerator = one(), denominator = one()
    new DigitalBiquadFilter(settings.lowpass).transfer(numerator, denominator, rate, z1, z2)
    const banks = settings.notches.map(config => notchBank(config, settings.version))
    const frequencies = settings.notches.map(config => targets(tracking, config, settings.version, time))
    /** Apply one notch bank at a specific FFT center. */
    function apply(n: number, index: number, hn: ComplexArray, hd: ComplexArray) {
        for (const group of banks[n]!) for (const frequency of frequencies[n]?.[index] ?? []) for (const notch of group) notch.transfer(hn, hd, frequency, rate, z1, z2)
    }
    settings.notches.forEach((config, n) => { if (config.enable > 0 && config.mode === 0) apply(n, 0, numerator, denominator) })
    return time.map((_value, index) => {
        const hn: ComplexArray = [numerator[0].slice(), numerator[1].slice()]
        const hd: ComplexArray = [denominator[0].slice(), denominator[1].slice()]
        settings.notches.forEach((config, n) => { if (config.enable > 0 && config.mode !== 0) apply(n, index, hn, hd) })
        return complex_div(hn, hd)
    })
}

/** Report original filter fallback diagnostics alongside the resulting plots. */
export function filterWarnings(settings: FilterSettings, tracking: Tracking): string[] {
    const warnings: string[] = []
    for (const config of settings.notches) {
        const source = tracking.sources[config.mode]
        if (!source) { warnings.push('Unsupported notch mode ' + config.mode); continue }
        if (!(config.enable > 0)) continue
        const dynamicThrottle = config.mode === 1 && (config.options & 2) !== 0
        if (dynamicThrottle && source.instances.length === 0) { warnings.push('No tracking data available for multi-Source throttle notch'); continue }
        if (dynamicThrottle && settings.version < 2) { warnings.push('Multi-Source throttle notch only available on filter V2+'); continue }
        if (config.mode !== 0 && !source.average && (config.mode === 1 || !source.instances.length)) { warnings.push('No tracking data available for ' + ['Static', 'Throttle', 'RPM1', 'ESC', 'FFT', 'RPM2'][config.mode] + ' notch'); continue }
        if (!(config.options & 1) && !(config.options & 16) && config.options & 64 && settings.version < 4) warnings.push('Quintuple notch only supported with filter version 4 or later')
    }
    return warnings
}
