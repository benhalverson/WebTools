import { FFT, to_double_sided, to_fft_format, run_fft, hanning, linear_interp, complex_mul, fft_window_size_inc } from '@webtools/numerics';
import type { ComplexArray, FFTResult } from '@webtools/numerics';
const fft = new FFT(8);
const data: FFTResult<'x'> = run_fft({x:[1,2,3,4,5,6,7,8]}, ['x'], 8, 4, hanning(8), fft, true);
const spectrum: ComplexArray | undefined = data.x[0];
if (spectrum) complex_mul(spectrum, spectrum);
const interpolated: number | undefined = linear_interp([], [], [1])[0];
void interpolated;
fft_window_size_inc({target: document.createElement('input')});
// @ts-expect-error Numerical arrays do not silently accept strings.
complex_mul([['1'], [2]], [[1], [2]]);
// @ts-expect-error The pinned FFT size is numeric.
new FFT('8');

// @ts-expect-error Missing imaginary components can be copied as explicit undefined.
to_double_sided([[1,2],[]])[1].map(value => value.toFixed(2));
// @ts-expect-error A short source produces explicit undefined entries in FFT storage.
fft.toComplexArray([1]).map(value => value.toFixed(2));
// @ts-expect-error Unpacking an incomplete interleaved source can copy undefined.
fft.fromComplexArray([undefined,0]).map(value => value.toFixed(2));
const incomplete = to_double_sided([[1,2],[]]);
const storage: (number | undefined)[] = [];
to_fft_format(storage, incomplete);
fft.transform(fft.createComplexArray(), storage);
