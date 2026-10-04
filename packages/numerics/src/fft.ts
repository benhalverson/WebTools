/* oxlint-disable unicorn/no-new-array -- Sparse arrays and RangeError behavior are legacy contracts. */
import { array_abs, array_mean, array_mul, array_log10, array_scale } from './array.js';
import type { ComplexArray, ComplexInput, ComplexStorage } from './array.js';
export interface RealFFT {
    createComplexArray(): number[];
    realTransform(out: number[], data: readonly number[]): void;
}
export interface WindowCorrection { linear: number; energy: number }
export interface AmplitudeScale {
    fun(x: number[]): number[];
    scale(x: number[]): number[];
    label: string;
    hover(axis: string): string;
    correction_scale?: number;
    window_correction(correction: WindowCorrection, resolution: number): number;
    quantization_correction(window_correction: number): number;
}
export interface FrequencyScale {
    fun(x: number[]): number[];
    label: string;
    hover(axis: string): string;
    type: 'log' | 'linear';
}
export type FFTResult<K extends string> = { center: number[] } &
    Record<K, ComplexArray[]> & Partial<Record<`${K}Max`, number[]>>;
// Helper functions for FFTs
// For use with https://github.com/indutny/fft.js

// return hanning window array of given length
export function hanning(len: number): number[] {
    const w = new Array<number>(len)
    const scale = (2*Math.PI) / (len - 1)
    for (let i=0; i<len; i++) {
        w[i] = 0.5 - 0.5 * Math.cos(scale * i)
    }
    return w
}

// Calculate correction factors for linear and energy spectrum
// linear: 1 / mean(w)
// energy: 1 / sqrt(mean(w.^2))
export function window_correction_factors(w: readonly number[]): WindowCorrection {
    return {
        linear: 1/array_mean(w),
        energy: 1/Math.sqrt(array_mean(array_mul(w,w)))
    }
}

// Length of real half of fft of len points
export function real_length(len: number): number {
    return Math.floor(len / 2) + 1
}

// Frequency bins for given fft length and sample period (real only)
export function rfft_freq(len: number, d: number): number[] {
    const real_len = real_length(len)
    const freq = new Array<number>(real_len)
    for (var i=0;i<real_len;i++) {
        freq[i] = i / (len * d)
    }
    return freq
}

// Run fft on arrays in data object with given keys
export function run_fft<K extends string>(data: Partial<Record<K, readonly number[]>>, keys: readonly K[], window_size: number, window_spacing: number, windowing_function: readonly number[], fft: RealFFT, take_max?: boolean): FFTResult<K> {
    const num_points = data[keys[0]!]!.length
    const real_len = real_length(window_size)
    const num_windows = Math.floor((num_points-window_size)/window_spacing) + 1

    // Allocate for each window
    const ret: Record<string, number[] | ComplexArray[]> & { center: number[] } = { center: new Array<number>(num_windows) }
    for (const key of keys) {
        ret[key] = new Array(num_windows)
        if (take_max === true) {
            ret[key + "Max"] = new Array(num_windows)
        }
    }

    // Pre-allocate scale array.
    // double positive spectrum to account for discarded energy in the negative spectrum
    // Note that we don't scale the DC or Nyquist limit
    // normalize all points by the window size
    const end_scale = 1 / window_size
    const mid_scale = 2 / window_size
    const scale = new Array<number>(real_len)
    scale[0] = end_scale
    for (var j=1;j<real_len-1;j++) {
        scale[j] = mid_scale
    }
    scale[real_len-1] = end_scale

    var result = fft.createComplexArray()
    for (var i=0;i<num_windows;i++) {
        // Calculate the start of each window
        const window_start = i * window_spacing
        const window_end = window_start + window_size

        // Take average time for window
        ret.center[i] = window_start + window_size * 0.5

        for (const key of keys) {
            if (!(key in data)) {
                continue
            }

            // Get data and apply windowing function
            var windowed = array_mul(data[key]!.slice(window_start, window_end), windowing_function)

            // Record the maximum value in the window
            if (take_max === true) {
                (ret[key + "Max"] as number[])[i] = Math.max(...array_abs(windowed))
            }

            // Run fft
            fft.realTransform(result, windowed);

            // Allocate for result
            (ret[key] as ComplexArray[])[i] = [new Array(real_len), new Array(real_len)]

            // Apply scale and convert complex format
            // fft.js uses interleaved complex numbers, [ real0, imaginary0, real1, imaginary1, ... ]
            for (let j=0;j<real_len;j++) {
                const index = j*2;
                (ret[key] as ComplexArray[])[i]![0][j] = result[index]!   * scale[j]!;
                (ret[key] as ComplexArray[])[i]![1][j] = result[index+1]! * scale[j]!;
            }
        }
    }

    return ret as FFTResult<K>
}

// Take result of above FFT and recreate full double sided spectrum including removing scale
export function to_double_sided(X: ComplexInput): ComplexStorage {
    const real_len = X[0].length
    const full_len = (real_len - 1) * 2

    const ret: ComplexStorage = [new Array<number | undefined>(full_len), new Array<number | undefined>(full_len)]

    // DC
    ret[0][0] = X[0][0]
    ret[1][0] = X[1][0]

    // Nyquist
    ret[0][real_len-1] = X[0][real_len-1]
    ret[1][real_len-1] = X[1][real_len-1]

    // Everything else is added in two places
    // Divide by 2 to return to double sided
    for (let i=1;i<real_len-1;i++) {
        ret[0][i] = X[0][i]! * 0.5
        ret[1][i] = X[1][i]! * 0.5

        const rhs_index = full_len - i
        ret[0][rhs_index] = X[0][i]! *  0.5
        ret[1][rhs_index] = X[1][i]! * -0.5
    }

    return ret
}

// Populate target complex array in fft.js interleaved format
export function to_fft_format(target: (number | undefined)[], source: readonly [readonly (number | undefined)[], readonly (number | undefined)[]]): void {
    const len = source[0].length
    for (let i=0;i<len;i++) {
        const index = i*2
        target[index]   = source[0][i]
        target[index+1] = source[1][i]
    }
}

// Helper function to change the value of a number input in powers of 2
// Bind to onchange of value input
export function fft_window_size_inc(event: { target: HTMLInputElement }): void {

    // Stash the last valid window size as a data attribute
    const attribute_name = 'data-last'
    if (!event.target.hasAttribute(attribute_name)) {
        event.target.setAttribute(attribute_name, event.target.defaultValue)
    }
    const last_window_size = parseFloat(event.target.getAttribute(attribute_name)!)

    const new_value = parseFloat(event.target.value)
    const change = parseFloat(event.target.value) - last_window_size
    if (Math.abs(change) != 1) {
        // Assume a change of one is comming from the up down buttons, ignore angthing else
        event.target.setAttribute(attribute_name, String(new_value))
        return
    }
    var new_exponent = Math.log2(last_window_size)
    if (!Number.isInteger(new_exponent)) {
        // Move to power of two in the selected direction
        new_exponent = Math.floor(new_exponent)
        if (change > 0) {
            new_exponent += 1
        }

    } else if (change > 0) {
        // Move up one
        new_exponent += 1

    } else {
        // Move down one
        new_exponent -= 1

    }
    event.target.value = String(2**new_exponent)
    event.target.setAttribute(attribute_name, event.target.value)
}

// Get amplitude scale object
export function fft_amplitude_scale(use_DB: boolean, use_PSD: boolean): AmplitudeScale {

    let ret: AmplitudeScale
    if (use_PSD) {
        ret = {
            fun: function (x) { return array_mul(x,x) }, // x.^2
            scale: function (x) { return array_scale(array_log10(x), 10.0) }, // 10 * log10(x)
            label: "PSD (dB/Hz)",
            hover: function (axis) { return "%{" + axis + ":.2f} dB/Hz" },
            window_correction: function(correction, resolution) { return ((correction.energy**2) * 0.5) / resolution },
            quantization_correction: function(window_correction) { return 1 / Math.sqrt(window_correction) },

        }
    } else if (use_DB) {
        ret = {
            fun: function (x) { return x },
            scale: function (x) { return array_scale(array_log10(x), 20.0) }, // 20 * log10(x)
            label: "Amplitude (dB)",
            hover: function (axis) { return "%{" + axis + ":.2f} dB" },
            correction_scale: 1.0,
            window_correction: function(correction, _resolution) { return correction.linear },
            quantization_correction: function(window_correction) { return 1 / window_correction },

        }
    } else {
        ret = {
            fun: function (x) { return x },
            scale: function (x) { return x },
            label: "Amplitude",
            hover: function (axis) { return "%{" + axis + ":.2f}" },
            window_correction: function(correction, _resolution) { return correction.linear },
            quantization_correction: function(window_correction) { return 1 / window_correction },

        }
    }

    return ret
}

// Get frequency scale object
export function fft_frequency_scale(use_RPM: boolean, log_scale: boolean): FrequencyScale {

    let ret: FrequencyScale
    if (use_RPM) {
        ret = { type: log_scale ? "log" : "linear",
            fun: function (x) { return array_scale(x, 60.0) },
            label: "RPM",
            hover: function (axis) { return "%{" + axis + ":.2f} RPM" },

        }
    } else {
        ret = { type: log_scale ? "log" : "linear",
            fun: function (x) { return x },
            label: "Frequency (Hz)",
            hover: function (axis) { return "%{" + axis + ":.2f} Hz" },
        }
    }

    ret.type = log_scale ? "log" : "linear"

    return ret
}
