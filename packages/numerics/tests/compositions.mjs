/** Exercise PIDReview's transfer/step chain and parser storage through the public API. */
export function compositions(api, FFT) {
    const results = {};
    for (const Storage of [Array, Float32Array, Float64Array]) {
        const samples = Storage.from([0, -0, 1, 2, -3, 4, 5, 6]);
        const fft = new FFT(8);
        const spectra = api.run_fft({Tar: samples, Act: samples}, ['Tar', 'Act'], 8, 4, api.hanning(8), fft, true);
        const X = api.to_double_sided(spectra.Tar[0]);
        const Y = api.to_double_sided(spectra.Act[0]);
        const Xcon = api.complex_conj(X);
        const Pyx = api.complex_mul(Y, Xcon);
        const Pxx = api.complex_mul(X, Xcon);
        Pxx[0] = api.array_add(Pxx[0], Array(8).fill(0.01));
        const transfer = fft.createComplexArray();
        api.to_fft_format(transfer, api.complex_div(Pyx, Pxx));
        const impulse = fft.createComplexArray();
        fft.inverseTransform(impulse, transfer);
        const step = [impulse[0]];
        for (let i = 1; i < 8; i++) step[i] = step[i - 1] + impulse[i * 2];
        const values = {spectra, X, Xcon, Pyx, Pxx, transfer, impulse, step};
        const input = Storage.from([0, -0, NaN, Infinity, -Infinity, 2]);
        for (const name of ['array_inverse', 'array_log10', 'array_abs', 'array_sqrt', 'array_sum', 'array_mean', 'array_all_NaN', 'window_correction_factors']) values[name] = api[name](input);
        for (const name of ['array_max', 'array_min', 'array_mul', 'array_div', 'array_add', 'array_sub']) values[name] = api[name](input, input);
        for (const name of ['array_scale', 'array_offset', 'array_all_equal', 'exp_jw']) values[name] = api[name](input, 2);
        for (const name of ['complex_abs', 'complex_inverse', 'complex_square', 'complex_phase', 'complex_conj', 'to_double_sided']) values[name] = api[name]([input, input]);
        values.conjStorage = values.complex_conj[0].constructor.name;
        values.conjCopied = values.complex_conj[0] !== input;
        values.interp = api.array_scale(api.linear_interp(Storage.from([1]), Storage.from([0, 1]), Storage.from([0, .5, 1])), 2);
        const incomplete = api.to_double_sided([[0, -0, undefined], []]);
        values.incomplete = {incomplete, conj: api.complex_conj(incomplete), mul: api.complex_mul(incomplete, incomplete), abs: api.complex_abs(incomplete)};
        for (const db of [false, true]) for (const psd of [false, true]) {
            const scale = api.fft_amplitude_scale(db, psd);
            values[`amplitude/${db}/${psd}`] = {fun: scale.fun(input), scale: scale.scale(input), funIdentity: scale.fun(input) === input, scaleIdentity: scale.scale(input) === input};
        }
        for (const rpm of [false, true]) {
            const scale = api.fft_frequency_scale(rpm, false);
            values[`frequency/${rpm}`] = {value: scale.fun(input), identity: scale.fun(input) === input};
        }
        const packed = Storage.from(Array(16).fill(99));
        values.packIdentity = fft.toComplexArray(input, packed) === packed;
        values.packed = packed;
        const unpacked = Storage.from([99, 99]);
        values.unpackIdentity = fft.fromComplexArray(packed, unpacked) === unpacked;
        values.unpacked = unpacked;
        const target = Storage.from([99, 99, 99]);
        api.to_fft_format(target, incomplete);
        values.copy = target;
        const out = Storage.from(Array(16).fill(0));
        fft.realTransform(out, samples);
        values.real = Array.from(out);
        fft.transform(out, packed);
        values.transform = Array.from(out);
        fft.inverseTransform(out, packed);
        values.inverse = Array.from(out);
        fft.completeSpectrum(packed);
        values.complete = Array.from(packed);
        values.unpackScale = api.array_scale(fft.fromComplexArray(fft.toComplexArray(input)), 2);
        results[Storage.name] = values;
    }
    return results;
}
