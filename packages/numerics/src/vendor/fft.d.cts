/** Narrow boundary for the pinned fft.js 4.0.4 distribution. */
declare class FFT {
    constructor(size: number);
    readonly size: number;
    createComplexArray(): number[];
    realTransform(out: number[], data: readonly (number | undefined)[]): void;
    transform(out: number[], data: readonly (number | undefined)[]): void;
    inverseTransform(out: number[], data: readonly (number | undefined)[]): void;
    completeSpectrum(spectrum: (number | undefined)[]): void;
    toComplexArray(input: readonly (number | undefined)[], storage?: (number | undefined)[]): (number | undefined)[];
    fromComplexArray(complex: readonly (number | undefined)[], storage?: (number | undefined)[]): (number | undefined)[];
}
export = FFT;
