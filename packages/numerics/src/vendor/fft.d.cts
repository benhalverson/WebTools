import type { NumericInput, NumericStorage } from '../array.js';
/** Narrow boundary for the pinned fft.js 4.0.4 distribution. */
declare class FFT {
    /** Construct a power-of-two transform of size greater than one. */
    constructor(size: number);
    /** Number of real samples in a transform. */
    readonly size: number;
    /** Allocate a zero-filled ordinary interleaved array of twice size. */
    createComplexArray(): number[];
    /** Transform real samples into distinct writable storage, without input validation. */
    realTransform(out: NumericStorage, data: NumericInput): void;
    /** Transform interleaved samples into distinct writable storage. */
    transform(out: NumericStorage, data: NumericInput): void;
    /** Invert interleaved samples and divide the entire output storage by size. */
    inverseTransform(out: NumericStorage, data: NumericInput): void;
    /** Mirror positive bins in place; missing copies remain undefined in ordinary arrays. */
    completeSpectrum(spectrum: NumericStorage): void;
    /** Pack real samples; absent samples become undefined in newly allocated storage. */
    toComplexArray(input: NumericInput): (number | undefined)[];
    /** Reuse fixed floating storage, coercing missing samples to NaN. */
    toComplexArray<T extends Float32Array | Float64Array>(input: NumericInput, storage: T): T;
    /** Reuse optional storage; ordinary arrays can receive explicit undefined. */
    toComplexArray(input: NumericInput, storage: (number | undefined)[] | undefined): (number | undefined)[];
    /** Preserve either supplied storage category when selected dynamically. */
    toComplexArray(input: NumericInput, storage: NumericStorage | undefined): NumericStorage;
    /** Unpack real components into a new ordinary array, preserving missing values. */
    fromComplexArray(complex: NumericInput): (number | undefined)[];
    /** Reuse fixed floating storage, truncating out-of-bounds writes. */
    fromComplexArray<T extends Float32Array | Float64Array>(complex: NumericInput, storage: T): T;
    /** Reuse optional storage; ordinary arrays may grow and receive undefined. */
    fromComplexArray(complex: NumericInput, storage: (number | undefined)[] | undefined): (number | undefined)[];
    /** Preserve either supplied storage category when selected dynamically. */
    fromComplexArray(complex: NumericInput, storage: NumericStorage | undefined): NumericStorage;
}
export = FFT;
