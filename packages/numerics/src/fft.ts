/* oxlint-disable unicorn/no-new-array -- Sparse arrays and RangeError behavior are legacy contracts. */
import { array_abs, array_mean, array_mul, array_log10, array_scale } from './array.js';
import type { ComplexArray, ComplexInput, ComplexStorage, NumericInput, NumericStorage } from './array.js';
/** Synchronous real transform boundary used after windowing allocates ordinary arrays. */
export interface RealFFT {
    /** Allocate a writable interleaved complex buffer for this FFT instance. */
    createComplexArray(): number[];
    /** Write the real-input transform into out synchronously; implementation
     * errors propagate to run_fft without translation. */
    realTransform(out: number[], data: NumericInput): void;
}
/** Linear and energy corrections for the original window samples. */
export interface WindowCorrection { linear: number; energy: number }
/** Spectrum converters preserve input storage on identity paths, otherwise allocate arrays. */
export interface AmplitudeScale {
    /** Convert amplitudes to power for PSD, otherwise return the same array. */
    fun<T extends NumericInput>(x: T): T | number[];
    /** Apply the selected decibel conversion, or return linear values unchanged. */
    scale<T extends NumericInput>(x: T): T | number[];
    label: string;
    /** Format the named Plotly coordinate with the selected display units. */
    hover(axis: string): string;
    correction_scale?: number;
    /** Select linear correction or energy-squared correction per bin width
     * (resolution in hertz) for PSD, without guarding zero resolution. */
    window_correction(correction: WindowCorrection, resolution: number): number;
    /** Convert the selected window correction to its reciprocal amplitude factor. */
    quantization_correction(window_correction: number): number;
}
/** Frequency display conversion with identity storage in hertz mode. */
export interface FrequencyScale {
    /** Convert hertz to RPM in a new array, or preserve the hertz array identity. */
    fun<T extends NumericInput>(x: T): T | number[];
    label: string;
    /** Format the named Plotly coordinate with the selected display units. */
    hover(axis: string): string;
    type: 'log' | 'linear';
}
/** Flat legacy result; missing channels leave sparse windows and maxima are optional. */
export type FFTResult<K extends string> = { center: number[] } &
    Record<K, ComplexArray[]> & Partial<Record<`${K}Max`, number[]>>;
// Helper functions for FFTs
// For use with https://github.com/indutny/fft.js

/** Build a symmetric Hann window of len samples.
 * Zero length returns an empty array and length one returns [NaN], preserving
 * the legacy formula. Invalid array lengths throw RangeError. */
export function hanning(len: number): number[] {
    const w = new Array<number>(len)
    const scale = (2*Math.PI) / (len - 1)
    for (let i=0; i<len; i++) {
        w[i] = 0.5 - 0.5 * Math.cos(scale * i)
    }
    return w
}

/** Compute reciprocal mean and reciprocal RMS corrections for a window.
 * Empty windows produce NaN corrections; all-zero windows produce Infinity.
 * Inputs are neither normalized nor modified. */
export function window_correction_factors(w: NumericInput): WindowCorrection {
    return {
        linear: 1/array_mean(w),
        energy: 1/Math.sqrt(array_mean(array_mul(w,w)))
    }
}

/** Return the nonnegative-frequency bin count floor(len / 2) + 1.
 * This arithmetic helper does not validate the transform length. */
export function real_length(len: number): number {
    return Math.floor(len / 2) + 1
}

/** Return real-spectrum bin frequencies for a transform length and sample period.
 * @param d Sample period in seconds when frequencies are required in hertz.
 * Zero or non-finite periods retain ordinary JavaScript arithmetic. */
export function rfft_freq(len: number, d: number): number[] {
    const real_len = real_length(len)
    const freq = new Array<number>(real_len)
    for (var i=0;i<real_len;i++) {
        freq[i] = i / (len * d)
    }
    return freq
}

/** Compute windowed, single-sided FFTs for the requested data channels.
 * @param data Channels; the first requested channel must exist and determines
 * the number of windows. Missing later channels leave sparse result windows.
 * @param keys Channel names, which must not collide with center or another
 * channel’s Max property in the flat result object.
 * @param window_size Samples per window, compatible with the supplied FFT.
 * @param window_spacing Sample offset between successive windows.
 * @param windowing_function Multipliers applied before each transform.
 * @param fft Synchronous FFT implementation; its errors propagate unchanged.
 * @param take_max Include maximum absolute windowed values only when true.
 * @returns Sample-index centers and split spectra normalized by window_size,
 * with interior bins doubled and DC/final bins left undoubled.
 * @throws When the first channel is absent or an allocation length is invalid.
 * Invalid sizes and spacing are not clamped or otherwise validated. */
export function run_fft<K extends string>(data: Partial<Record<K, NumericInput>>, keys: readonly K[], window_size: number, window_spacing: number, windowing_function: NumericInput, fft: RealFFT, take_max?: boolean): FFTResult<K> {
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

/** Mirror a single-sided spectrum, halving interior bins and conjugating their
 * mirrors while copying DC and Nyquist. Normalization by window size remains.
 * Missing endpoint components are copied as undefined; missing interior
 * components produce NaN. An empty real component throws RangeError. */
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

/** Copy split complex components into the supplied interleaved FFT buffer.
 * The real-component length controls writes; missing imaginary components
 * become explicit undefined. The target grows as needed and trailing entries
 * beyond the copied region remain unchanged. Typed targets keep their fixed length
 * and convert missing components to NaN. */
export function to_fft_format(target: NumericStorage, source: ComplexInput): void {
    const len = source[0].length
    for (let i=0;i<len;i++) {
        const index = i*2
        target[index]   = source[0][i]
        target[index+1] = source[1][i]
    }
}

/** Handle number-input changes by stepping unit edits to adjacent powers of two.
 * The input’s data-last attribute tracks the previous value, initially using
 * defaultValue. Non-unit edits are recorded unchanged; invalid numeric text
 * retains the legacy parseFloat/NaN behavior. Mutates value and data-last. */
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

/** Create spectrum conversion and display helpers for amplitude, dB, or PSD.
 * @param use_DB Convert amplitude to decibels when PSD is disabled.
 * @param use_PSD Select power spectral density in dB/Hz, taking precedence.
 * @returns Conversion, correction and Plotly hover helpers. Identity paths
 * return their input array; logarithmic and reciprocal paths retain non-finite
 * results for zero or invalid inputs. */
export function fft_amplitude_scale(use_DB: boolean, use_PSD: boolean): AmplitudeScale {

    let ret: AmplitudeScale
    if (use_PSD) {
        ret = {
            /** Square amplitudes into a new power array. */
            fun: function (x) { return array_mul(x,x) }, // x.^2
            /** Convert power to dB without clamping zero or negative values. */
            scale: function (x) { return array_scale(array_log10(x), 10.0) }, // 10 * log10(x)
            label: "PSD (dB/Hz)",
            /** Format the named Plotly coordinate with this scale’s units. */
            hover: function (axis) { return "%{" + axis + ":.2f} dB/Hz" },
            /** Scale squared energy correction by half the reciprocal bin width. */
            window_correction: function(correction, resolution) { return ((correction.energy**2) * 0.5) / resolution },
            /** Undo a power correction in amplitude units; zero is not guarded. */
            quantization_correction: function(window_correction) { return 1 / Math.sqrt(window_correction) },

        }
    } else if (use_DB) {
        ret = {
            /** Return the supplied values unchanged, preserving array identity. */
            fun: function (x) { return x },
            /** Convert amplitude to dB without clamping zero or negative values. */
            scale: function (x) { return array_scale(array_log10(x), 20.0) }, // 20 * log10(x)
            label: "Amplitude (dB)",
            /** Format the named Plotly coordinate with this scale’s units. */
            hover: function (axis) { return "%{" + axis + ":.2f} dB" },
            correction_scale: 1.0,
            /** Use the linear window correction independently of bin width. */
            window_correction: function(correction, _resolution) { return correction.linear },
            /** Undo a linear correction; zero is not guarded. */
            quantization_correction: function(window_correction) { return 1 / window_correction },

        }
    } else {
        ret = {
            /** Return the supplied values unchanged, preserving array identity. */
            fun: function (x) { return x },
            /** Return amplitudes unchanged, preserving array identity. */
            scale: function (x) { return x },
            label: "Amplitude",
            /** Format the named Plotly coordinate with this scale’s units. */
            hover: function (axis) { return "%{" + axis + ":.2f}" },
            /** Use the linear window correction independently of bin width. */
            window_correction: function(correction, _resolution) { return correction.linear },
            /** Undo a linear correction; zero is not guarded. */
            quantization_correction: function(window_correction) { return 1 / window_correction },

        }
    }

    return ret
}

/** Create frequency conversion and Plotly axis helpers.
 * @param use_RPM Convert hertz to revolutions per minute by multiplying by 60.
 * @param log_scale Select the axis type without transforming sample values.
 * @returns Helpers whose hertz conversion preserves the input array identity. */
export function fft_frequency_scale(use_RPM: boolean, log_scale: boolean): FrequencyScale {

    let ret: FrequencyScale
    if (use_RPM) {
        ret = { type: log_scale ? "log" : "linear",
            /** Convert hertz to RPM in a newly allocated array. */
            fun: function (x) { return array_scale(x, 60.0) },
            label: "RPM",
            /** Format the named Plotly coordinate with this scale’s units. */
            hover: function (axis) { return "%{" + axis + ":.2f} RPM" },

        }
    } else {
        ret = { type: log_scale ? "log" : "linear",
            /** Return the supplied values unchanged, preserving array identity. */
            fun: function (x) { return x },
            label: "Frequency (Hz)",
            /** Format the named Plotly coordinate with this scale’s units. */
            hover: function (axis) { return "%{" + axis + ":.2f} Hz" },
        }
    }

    ret.type = log_scale ? "log" : "linear"

    return ret
}
