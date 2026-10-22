import type { Aliasing } from './aliasing.ts'
import { array_add, array_from_range, array_max, array_min, array_mul, array_offset, array_scale, complex_abs, complex_phase, fft_amplitude_scale, type ComplexArray } from '@webtools/numerics'
import { transfer, type FilterSettings } from './filters.ts'
import type { Tracking } from './tracking.ts'
import { selectedWindows, type Spectrum, type Scale } from './spectrum.ts'

export interface Comparison { transfer: ComplexArray[]; bode: { bins: number[]; transfer: ComplexArray[] } }
/** Compute independent spectral and high-resolution Bode responses. */
export function compare(spectrum: Spectrum, filters: FilterSettings, tracking: Tracking): Comparison {
    const bins = array_from_range(0, spectrum.bins.at(-1)!, 0.05)
    return { transfer: transfer(filters, tracking, spectrum.time, spectrum.bins, spectrum.average_sample_rate),
        bode: { bins, transfer: transfer(filters, tracking, spectrum.time, bins, spectrum.average_sample_rate) } }
}

/** Estimate post-filter spectral amplitudes with FilterReview's quantization
 * subtraction/reapplication, preserving correction order for each display scale. */
export function predicted(spectrum: Spectrum, response: ComplexArray[], start: number, end: number, mode: Scale, batch: boolean, alias?: Aliasing): Record<'x' | 'y' | 'z', number[]> {
    const scale = fft_amplitude_scale(mode === 'db', mode === 'psd')
    const [first, last] = selectedWindows(spectrum.time, start, end)
    const correction = scale.window_correction(spectrum.correction, spectrum.average_sample_rate / spectrum.window_size)
    const noise = (batch ? 1 / (Math.sqrt(3) * 2 ** (16 - 0.5)) : 0) * scale.quantization_correction(correction)
    const output = { x: [] as number[], y: [] as number[], z: [] as number[] }
    if (!spectrum.time.length) return output
    for (const axis of ['x', 'y', 'z'] as const) {
        let sum: number[] = Array(spectrum.bins.length).fill(0)
        for (let i = first; i < last; i++) {
            const amplitude = array_offset(array_mul(array_offset(spectrum[axis][i]!, -noise), complex_abs(response[i]!)), noise)
            sum = array_add(sum, scale.fun(amplitude))
        }
        const corrected = array_scale(sum, correction / (last - first))
        output[axis] = scale.scale(alias ? alias.apply(corrected) : corrected)
    }
    return output
}

/** Unwrap with the original asymmetric notch thresholds in degrees. */
export function phase(response: ComplexArray): number[] {
    const wrapped = array_scale(complex_phase(response), 180 / Math.PI)
    const unwrapped = [wrapped[0]!]
    for (let i = 1; i < wrapped.length; i++) {
        let difference = wrapped[i]! - wrapped[i - 1]!
        if (difference >= 315) difference -= 360
        else if (difference <= -45) difference += 360
        unwrapped[i] = unwrapped[i - 1]! + difference
    }
    return unwrapped
}

/** Mean and envelope share the original neighboring-window range selection. */
export function bode(comparison: Comparison, time: number[], start: number, end: number, mode: Scale, wrap: boolean) {
    const [first, last] = selectedWindows(time, start, end)
    const length = comparison.bode.bins.length
    let amplitude = Array<number>(length).fill(0), degrees = Array<number>(length).fill(0)
    let amplitudeMax: number[] = [], amplitudeMin: number[] = [], phaseMax: number[] = [], phaseMin: number[] = []
    if (!time.length) return { amplitude: [], degrees: [], amplitudeMax, amplitudeMin, phaseMax, phaseMin }
    for (let i = first; i < last; i++) {
        const response = comparison.bode.transfer[i]!, a = complex_abs(response), p = phase(response)
        amplitude = array_add(amplitude, a); degrees = array_add(degrees, p)
        amplitudeMax = i === first ? a : array_max(amplitudeMax, a); amplitudeMin = i === first ? a : array_min(amplitudeMin, a)
        phaseMax = i === first ? p : array_max(phaseMax, p); phaseMin = i === first ? p : array_min(phaseMin, p)
    }
    amplitude = array_scale(amplitude, 1 / (last - first)); degrees = array_scale(degrees, 1 / (last - first))
    if (wrap) for (let i = 1; i < degrees.length; i++) {
        if (!Number.isFinite(degrees[i])) continue
        while (Math.abs(degrees[i]!) > 180) {
            const offset = degrees[i]! > 180 ? -360 : 360
            degrees[i]! += offset; phaseMax[i]! += offset; phaseMin[i]! += offset
        }
    }
    const scale = fft_amplitude_scale(mode === 'db', mode === 'psd')
    return { amplitude: scale.scale(amplitude), degrees, amplitudeMax: scale.scale(amplitudeMax), amplitudeMin: scale.scale(amplitudeMin), phaseMax, phaseMin }
}

/** Construct the legacy spectrogram, including explicit empty columns at gaps.
 * Correction is applied before PSD squaring, unlike the mean-spectrum path. */
export function spectrogram(spectrum: Spectrum, axis: 'x' | 'y' | 'z', mode: Scale, alias: Aliasing, response?: ComplexArray[], batch = false) {
    const scale = fft_amplitude_scale(mode === 'db', mode === 'psd')
    const correction = scale.window_correction(spectrum.correction, spectrum.average_sample_rate / spectrum.window_size)
    const noise = batch ? 1 / (Math.sqrt(3) * 2 ** (16 - 0.5)) : 0
    const time: number[] = [], columns: (number | undefined)[][] = []
    let count = 0, last = spectrum.time[0]!, section = last
    for (let i = 0; i < spectrum.time.length; i++) {
        count++
        const current = spectrum.time[i]!, dt = current - last, average = (current - section) / count
        if (dt > average * 2.5) {
            count = 0; time.push(last + average, current - average)
            columns.push(Array(alias.bins.length), Array(alias.bins.length)); section = current
        }
        time.push(current); last = current
        let amplitude = array_scale(spectrum[axis][i]!, correction)
        if (response) amplitude = array_offset(array_mul(array_offset(amplitude, -noise), complex_abs(response[i]!)), noise)
        columns.push(scale.scale(scale.fun(alias.apply(amplitude))))
    }
    return { time, columns }
}
