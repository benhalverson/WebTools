import { FFT, run_fft, hanning, to_double_sided, complex_conj, complex_mul,
    complex_div, array_add, to_fft_format, linear_interp, array_scale,
    fft_amplitude_scale, fft_frequency_scale } from '@webtools/numerics';

// PIDReview/PIDReview.js:1149–1165, including DataFlash's floating storage.
for (const samples of [[1,2,3,4,5,6,7,8], new Float32Array(8), new Float64Array(8)]) {
    const fft = new FFT(8);
    const result = run_fft({Tar: samples, Act: samples}, ['Tar', 'Act'], 8, 4, hanning(8), fft, true);
    const tar = result.Tar[0];
    const act = result.Act[0];
    if (!tar || !act) continue;
    const X = to_double_sided(tar);
    const Y = to_double_sided(act);
    const Xcon = complex_conj(X);
    const Pyx = complex_mul(Y, Xcon);
    const Pxx = complex_mul(X, Xcon);
    Pxx[0] = array_add(Pxx[0], hanning(8));
    const H = complex_div(Pyx, Pxx);
    const transfer: (number | undefined)[] = fft.createComplexArray();
    to_fft_format(transfer, H);
    fft.inverseTransform(fft.createComplexArray(), transfer);
    array_scale(linear_interp(samples, samples, samples), 2);
    complex_mul(complex_conj([samples, samples]), X);
    array_scale(fft.fromComplexArray(fft.toComplexArray(samples)), 2);
    array_scale(fft_amplitude_scale(false, false).scale(samples), 2);
    array_scale(fft_frequency_scale(false, false).fun(samples), 2);
}

// Copy-return categories must remain useful without unsafe assertions.
const fft = new FFT(8);
const ordinary: (number | undefined)[] = [undefined, -0];
const single = new Float32Array(8);
const double = new Float64Array(8);
const conjOrdinary: (number | undefined)[] = complex_conj([ordinary, single])[0];
const conjSingle: Float32Array = complex_conj([single, ordinary])[0];
const conjDouble: Float64Array = complex_conj([double, single])[0];
const conjNumbers: number[] = complex_conj([[1, 2], double])[0];
const packedSingle: Float32Array = fft.toComplexArray(ordinary, single);
const packedDouble: Float64Array = fft.toComplexArray(ordinary, double);
const unpackedSingle: Float32Array = fft.fromComplexArray(ordinary, single);
const unpackedDouble: Float64Array = fft.fromComplexArray(ordinary, double);
fft.toComplexArray(single, ordinary).push(undefined);
fft.fromComplexArray(single, ordinary).push(undefined);
fft.toComplexArray(single, undefined).push(undefined);
fft.fromComplexArray(single, undefined).push(undefined);
to_fft_format(single, [ordinary, double]);
fft.realTransform(double, ordinary);
fft.transform(single, ordinary);
fft.inverseTransform(double, ordinary);
fft.completeSpectrum(single);
for (const values of [conjOrdinary, conjSingle, conjDouble, conjNumbers, packedSingle, packedDouble, unpackedSingle, unpackedDouble]) array_scale(values, 2);
// @ts-expect-error Conjugation copies explicit missing real components.
complex_conj([ordinary, double])[0].map(value => value.toFixed(2));
// @ts-expect-error Identity display paths can preserve undefined.
fft_amplitude_scale(false, false).fun(ordinary).map(value => value.toFixed(2));
// @ts-expect-error BigInt parser storage is not a numerical input.
array_scale(new BigInt64Array(8), 2);
// @ts-expect-error Strings are not admitted by the shared numerical input contract.
linear_interp(['1'], [0], [0]);
