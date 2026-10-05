import type { Spectrum } from './spectrum.ts'

export type AliasMode = 'none' | 'fold' | 'only'
export interface Aliasing { bins: number[]; apply: (amplitude: number[]) => number[] }
/** Resample then fold about scheduler Nyquist, preserving original interpolation
 * steps, omitted terminal bin, and alias-only starting offset. */
export function aliasing(spectrum: Spectrum, mode: AliasMode, loopRate: number): Aliasing {
    if (mode === 'none') return { bins: spectrum.bins, apply: amplitude => amplitude }
    const nyquist = loopRate * 0.5
    const length = Math.ceil(nyquist / (0.1 * (spectrum.average_sample_rate / spectrum.window_size))) + 1
    const step = nyquist / (length - 1)
    if (!Number.isFinite(length) || length < 2 || length > 10000000) throw new Error('Invalid scheduler loop rate for aliasing')
    const bins = Array.from({ length }, (_value, i) => i * step)
    const total = Math.floor(spectrum.bins.at(-1)! / step)
    const indices: number[] = [], scales: number[] = []
    let index = 0
    for (let i = 0; i < total; i++) {
        const bin = i * step
        if (bin > spectrum.bins[index + 1]!) index++
        indices[i] = index
        scales[i] = (bin - spectrum.bins[index]!) / (spectrum.bins[index + 1]! - spectrum.bins[index]!)
    }
    return { bins,
        /** Fold interpolated amplitudes; display conversion occurs afterwards. */
        apply(amplitude: number[]) {
            const output = Array<number>(length).fill(0), reflect = (length - 1) * 2
            for (let i = mode === 'only' ? length : 0; i < total; i++) {
                const before = amplitude[indices[i]!]!, after = amplitude[indices[i]! + 1]!
                const value = before + (after - before) * scales[i]!
                const index = Math.abs(i - reflect * Math.round(i / reflect))
                output[index]! += value
            }
            return output
        },
    }
}
