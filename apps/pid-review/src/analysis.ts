/* oxlint-disable unicorn/no-new-array -- Sparse spectrogram gaps and legacy allocation semantics are intentional. */
import { FFT, hanning, window_correction_factors, rfft_freq, run_fft, array_scale, array_offset, array_add, array_inverse, complex_abs, complex_conj, complex_mul, complex_div, to_double_sided, to_fft_format, real_length, fft_amplitude_scale, type ComplexArray, type WindowCorrection } from '@webtools/numerics'
import { keys, type Key, type Controller } from './model.ts'
export interface SetFFT { time: number[]; channels: Record<Key, ComplexArray[]> }
export interface Analysis { sets: (SetFFT | undefined)[]; bins: number[]; rate: number; size: number; correction: WindowCorrection }
export interface Series { x: number[]; y: number[] }
export interface Step { all: Series; mean: Series }

/** Preserve the last-before and inclusive-first-after neighboring-window selection. */
export function selection(time: readonly number[], start: number, end: number): [number, number] {
    let first = 0, last = 0
    for (let i = 0; i < time.length; i++) if (time[i]! < start) first = i
    for (let i = 0; i < time.length - 1; i++) if (time[i]! <= end) last = i + 1
    return [first, last + 1]
}

/** Compute Hann-windowed spectra using the legacy unweighted eligible-batch sample rate. */
export function analyze(controller: Controller, size: number): Analysis | undefined {
    if (!Number.isInteger(Math.log2(size))) throw new Error('Window size must be a power of two')
    const window = hanning(size), correction = window_correction_factors(window), fft = new FFT(size)
    let sum = 0, count = 0
    for (const set of controller.sets) for (const batch of set ?? []) if (batch.Tar.length >= size) { sum += batch.sample_rate; count++ }
    if (sum === 0) return undefined
    const dt = count / sum
    const sets = controller.sets.map(set => {
        let result: SetFFT | undefined
        for (const batch of set ?? []) {
            if (batch.Tar.length < size) continue
            const valid = keys.filter(key => batch[key] != null)
            const transformed = run_fft(batch, valid, size, Math.round(size * 0.5), window, fft)
            result ??= { time: [], channels: { Tar: [], Act: [], Err: [], P: [], I: [], D: [], FF: [], DFF: [], Out: [] } }
            result.time = result.time.concat(array_offset(array_scale(transformed.center, dt), batch.time[0]!))
            for (const key of valid) result.channels[key] = result.channels[key].concat(transformed[key])
        }
        return result
    })
    return { sets, bins: rfft_freq(size, dt), rate: 1 / dt, size, correction }
}

/** Average selected spectra before display scaling, preserving correction order for PSD. */
export function spectrum(analysis: Analysis, set: SetFFT, key: Key, start: number, end: number, scale: 'linear' | 'db' | 'psd'): number[] {
    const windows = set.channels[key]
    if (!windows[0]) return []
    const amplitude = fft_amplitude_scale(scale === 'db', scale === 'psd')
    const [first, last] = selection(set.time, start, end)
    let mean: number[] = new Array<number>(windows[0][0].length).fill(0)
    for (let i = first; i < last; i++) mean = array_add(mean, amplitude.fun(complex_abs(windows[i]!)))
    return Array.from(amplitude.scale(array_scale(mean, amplitude.window_correction(analysis.correction, analysis.rate / analysis.size) / (last - first))))
}

/** Render every FFT window with legacy gap insertion and correction-before-power spectrogram semantics. */
export function spectrogram(analysis: Analysis, key: Key, scale: 'linear' | 'db' | 'psd'): { x: number[]; z: (number | undefined)[][] } {
    const amplitude = fft_amplitude_scale(scale === 'db', scale === 'psd')
    const correction = amplitude.window_correction(analysis.correction, analysis.rate / analysis.size)
    const x: number[] = [], z: (number | undefined)[][] = []
    for (const set of analysis.sets) {
        if (!set) continue
        let count = 0, last = set.time[0]!, start = last
        for (let i = 0; i < set.time.length; i++) {
            count++
            const time = set.time[i]!, dt = time - last, average = (time - start) / count
            if (dt > average * 2.5) {
                count = 0; x.push(last + average, time - average)
                z.push(new Array<number>(analysis.bins.length), new Array<number>(analysis.bins.length)); start = time
            }
            x.push(time)
            z.push(Array.from(amplitude.scale(amplitude.fun(array_scale(complex_abs(set.channels[key][i]!), correction)))))
            last = time
        }
    }
    return { x, z }
}

/** Estimate integrated regularized transfer responses with the unchanged 25-Hz noise model and 20-unit threshold. */
export function stepResponses(controller: Controller, analysis: Analysis, start: number, end: number): Step[] {
    const { size, rate, bins } = analysis, length = real_length(size), fft = new FFT(size)
    const transfer = fft.createComplexArray(), impulse = fft.createComplexArray(), window = hanning(size)
    const dt = 1 / rate, stepLength = Math.min(Math.ceil(0.5 / dt), size)
    const time = Array.from({ length: stepLength }, (_, i) => i * dt)
    let lowPassLength = bins.findIndex(value => value > 25)
    lowPassLength += lowPassLength - 2
    const radius = Math.ceil(lowPassLength * 0.5), sigma = lowPassLength / 6
    let noise = new Array<number>(length).fill(1), previous = 0
    for (let i = 0; i < lowPassLength; i++) { noise[i] = previous + Math.exp((-0.5 / sigma ** 2) * (i - radius) ** 2); previous = noise[i]! }
    for (let i = 0; i < lowPassLength; i++) noise[i] = noise[i]! / previous
    noise = [...noise, ...noise.slice(1, length - 1).reverse()]
    noise = array_inverse(array_scale(array_offset(array_scale(noise, -1), 1 + 1e-9), 10))
    return controller.params.map((_, index) => {
        const result: Step = { all: { x: [], y: [] }, mean: { x: [], y: [] } }
        let mean = new Array<number>(stepLength).fill(0), count = 0
        for (const batch of controller.sets[index] ?? []) {
            if (batch.Tar.length < size) continue
            const transformed = run_fft(batch, ['Tar', 'Act'], size, Math.round(size / 16), window, fft, true)
            const centers = array_offset(array_scale(transformed.center, dt), batch.time[0]!)
            const [first, last] = selection(centers, start, end)
            for (let i = first; i < last; i++) {
                if (transformed.TarMax![i]! < 20) continue
                const x = to_double_sided(transformed.Tar[i]!), y = to_double_sided(transformed.Act[i]!)
                const conjugate = complex_conj(x), cross = complex_mul(y, conjugate), auto = complex_mul(x, conjugate)
                auto[0] = array_add(auto[0], noise)
                to_fft_format(transfer, complex_div(cross, auto)); fft.inverseTransform(impulse, transfer)
                const step = new Array<number>(stepLength); step[0] = impulse[0]!
                for (let j = 1; j < stepLength; j++) step[j] = step[j - 1]! + impulse[j * 2]!
                count++; mean = array_add(mean, step)
                result.all.x = result.all.x.concat(time, NaN); result.all.y = result.all.y.concat(step, NaN)
            }
            if (count > 0) result.mean = { x: time, y: array_scale(mean, 1 / count) }
        }
        return result
    })
}
