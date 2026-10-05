import type { Aliasing } from './aliasing.ts'
import { FFT, hanning, window_correction_factors, rfft_freq, run_fft, complex_abs, fft_amplitude_scale, array_add, array_scale } from '@webtools/numerics'
import type { WindowCorrection } from '@webtools/numerics'
import type { Sensor, Source } from './ingestion.ts'

export interface Spectrum { bins: number[]; time: number[]; average_sample_rate: number; window_size: number; correction: WindowCorrection; x: number[][]; y: number[][]; z: number[][] }
/** Preserve raw control text until legacy parseInt is applied in the Worker. */
export interface Settings { size: number | string; perBatch: number | string }
export type Scale = 'linear' | 'db' | 'psd'

/** Compute FilterReview's Hann-windowed, 50%-overlapping gyro FFT.
 * The original rate loop used its first batch repeatedly before window_size was
 * assigned. Preserve that result, including short batches in the rate average.
 * Runs in an owned Worker so termination cancels even a long transform.
 */
export function calculate(sensor: Sensor, source: Source, settings: Settings, progress: (value: number) => void): Spectrum {
    const batches = sensor.batches
    let sum = 0
    for (const _batch of batches) sum += batches[0]!.sample_rate
    const sampleTime = batches.length / sum
    const size = source === 'batch' ? Math.floor(batches[0]!.x.length / (1 + (Math.max(Number.parseInt(String(settings.perBatch)), 1) - 1) * 0.5)) : Number.parseInt(String(settings.size))
    if (!Number.isInteger(Math.log2(size)) || size < 2) throw new Error('Window size must be a power of two')
    const window = hanning(size), fft = new FFT(size)
    const output: Spectrum = { bins: rfft_freq(size, sampleTime), time: [], average_sample_rate: 1 / sampleTime, window_size: size,
        correction: window_correction_factors(window), x: [], y: [], z: [] }
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]!
        if (batch.x.length >= size) {
            const result = run_fft(batch, ['x', 'y', 'z'], size, Math.round(size * 0.5), window, fft)
            output.time.push(...result.center.map(center => center * sampleTime + batch.sample_time))
            for (const axis of ['x', 'y', 'z'] as const) for (const value of result[axis]) output[axis].push(complex_abs(value))
        }
        progress((i + 1) / batches.length)
    }
    return output
}

/** Preserve the legacy inclusive selection: one preceding and one following
 * FFT center remain included at range edges, even outside the recorded range. */
export function selectedWindows(time: readonly number[], start: number, end: number): [number, number] {
    let first = 0, last = 0
    for (let i = 0; i < time.length; i++) if (time[i]! < start) first = i
    for (let i = 0; i < time.length - 1; i++) if (time[i]! <= end) last = i + 1
    return [first, last + 1]
}

/** Average amplitudes (or powers for PSD) before applying legacy correction and
 * display conversion. Zero amplitudes retain -Infinity in logarithmic modes. */
export function displayed(spectrum: Spectrum, start: number, end: number, mode: Scale, alias?: Aliasing): Record<'x' | 'y' | 'z', number[]> {
    const scale = fft_amplitude_scale(mode === 'db', mode === 'psd')
    const [first, last] = selectedWindows(spectrum.time, start, end)
    const factor = scale.window_correction(spectrum.correction, spectrum.average_sample_rate / spectrum.window_size) / (last - first)
    const output = { x: [] as number[], y: [] as number[], z: [] as number[] }
    if (!spectrum.time.length) return output
    for (const axis of ['x', 'y', 'z'] as const) {
        let sum: number[] = Array(spectrum.bins.length).fill(0)
        for (let i = first; i < last; i++) sum = array_add(sum, scale.fun(spectrum[axis][i]!))
        output[axis] = scale.scale(alias ? alias.apply(array_scale(sum, factor)) : array_scale(sum, factor))
    }
    return output
}
