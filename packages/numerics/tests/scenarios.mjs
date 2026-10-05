/* oxlint-disable unicorn/no-new-array -- Sparse arrays and RangeError behavior are legacy contracts. */
// These inputs are intentionally shared by unchanged classic scripts and the public package.
export function scenarios(api, FFT) {
    const results = {};
    const record = (name, fn) => {
        try { results[name] = fn(); } catch (error) { results[name] = { throws: error.name, message: error.message }; }
    };
    const unary = ['array_inverse', 'array_log10', 'array_abs', 'array_sqrt', 'array_sum', 'array_mean', 'array_all_NaN'];
    for (const name of unary) {
        for (const [label, values] of Object.entries({ normal: [1, 4, 9], empty: [], boundary: [0, -0, -1, Infinity, -Infinity, NaN], sparse: new Array(3), coercion: ['2', null, undefined] })) {
            record(`${name}/${label}`, () => api[name](values));
        }
    }
    for (const name of ['array_max', 'array_min', 'array_mul', 'array_div', 'array_add', 'array_sub']) {
        for (const [label, a, b] of [['normal', [1,-3,4], [2,4,-5]], ['empty', [], []], ['short', [1,2], [0]], ['special', [0,Infinity,NaN], [-0,Infinity,1]]]) {
            record(`${name}/${label}`, () => api[name](a,b));
        }
    }
    for (const name of ['array_scale', 'array_offset', 'array_all_equal']) {
        for (const [label, a, n] of [['normal', [1,2,3], 2], ['empty', [], 0], ['special', [0,-0,Infinity,NaN], 0], ['coercion', ['2',2], 2]]) {
            record(`${name}/${label}`, () => api[name](a,n));
        }
    }
    for (const [label, args] of [['ascending',[0,1,.1]],['descending',[3,0,-1]],['single',[1,1,2]],['empty',[1,0,1]],['negative-length',[3,0,1]],['zero-step',[0,1,0]],['nan',[NaN,1,1]]]) record(`range/${label}`, () => api.array_from_range(...args));
    for (const [label,args] of [['normal',[[0,20,40],[0,2,4],[-1,0,1,2,3,4,5]]],['empty',[[],[],[1]]],['empty-query',[[1],[0],[]]],['unsorted',[[0,20,40],[0,2,4],[3,1]]],['duplicate',[[1,2,3],[0,0,1],[0,.5,1]]],['missing',[[1],[0,1],[.5,1]]]]) record(`interp/${label}`,()=>api.linear_interp(...args));
    const complexCases = { normal:[[1,2,-3],[4,-5,6]], empty:[[],[]], boundary:[[0,-0,Infinity,NaN],[0,0,1,2]], short:[[1,2],[]] };
    for (const name of ['complex_abs','complex_inverse','complex_square','complex_phase','complex_conj','to_double_sided']) {
        for (const [label,c] of Object.entries(complexCases)) record(`${name}/${label}`,()=>api[name](c));
    }
    for (const name of ['complex_mul','complex_div']) for (const [label,c] of Object.entries(complexCases)) record(`${name}/${label}`,()=>api[name](c,[[2,0],[3,0]]));
    for (const rate of [10,0,-10]) record(`exp/${rate}`,()=>api.exp_jw([0,1,5],rate));
    for (const len of [0,1,2,8,-1,2.5]) {
        record(`hanning/${len}`,()=>api.hanning(len));
        record(`real_length/${len}`,()=>api.real_length(len));
        record(`frequency/${len}`,()=>api.rfft_freq(len,.01));
    }
    record('frequency/zero-period',()=>api.rfft_freq(4,0));
    for (const [label,w] of Object.entries({empty:[],zero:[0],unit:[1],hann:api.hanning(8)})) record(`correction/${label}`,()=>api.window_correction_factors(w));
    for (const db of [false,true]) for (const psd of [false,true]) {
        record(`amplitude/${db}/${psd}`,()=>{const s=api.fft_amplitude_scale(db,psd); const x=[0,.1,1,2];return {fun:s.fun(x),scale:s.scale(x),label:s.label,hover:s.hover('y'),correction_scale:s.correction_scale,correction:s.window_correction({linear:2,energy:3},.5),quantization:s.quantization_correction(4),identity:s.fun(x)===x,scaleIdentity:s.scale(x)===x};});
    }
    for (const rpm of [false,true]) for (const log of [false,true]) record(`frequency-scale/${rpm}/${log}`,()=>{const s=api.fft_frequency_scale(rpm,log);const x=[0,1,2];return {values:s.fun(x),label:s.label,hover:s.hover('x'),type:s.type,identity:s.fun(x)===x};});
    for (const size of [0,1,2,3,8]) record(`constructor/${size}`,()=>new FFT(size).size);
    for (const [label,points,spacing,keys,max] of [['normal',16,4,['x','y'],true],['no-max',8,8,['x'],false],['missing-key',8,4,['x','missing'],true],['empty',0,8,['x'],true],['short',2,2,['x'],true],['empty-keys',8,4,[],false],['nan',8,4,['y'],true]]) {
        record(`fft/${label}`,()=>api.run_fft({x:Array.from({length:points},(_,i)=>Math.sin(2*Math.PI*i/8)),y:Array.from({length:points},(_,i)=>label==='nan'?NaN:i)},keys,8,spacing,api.hanning(8),new FFT(8),max));
    }
    record('vendor/short-to-complex',()=>new FFT(8).toComplexArray([1]));
    record('vendor/incomplete-from-complex',()=>new FFT(8).fromComplexArray([undefined,0]));
    record('to_fft_format',()=>{const target=[99];const value=api.to_fft_format(target,[[1,2],[3,4]]);return {target,value};});
    record('to_fft_format/short',()=>{const target=[];api.to_fft_format(target,[[1,2],[]]);return target;});
    return results;
}
// Preserve NaN, infinities, negative zero, undefined, and array holes in JSON fixtures.
export function encode(value) {
    if (value === undefined) return {$number:'undefined'};
    if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value,-0))) return {$number:Object.is(value,-0)?'-0':String(value)};
    if (Array.isArray(value)) return {array:Array.from({length:value.length},(_,i)=>i in value?encode(value[i]):{$hole:true})};
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,encode(v)]));
    return value;
}
