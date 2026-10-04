import * as numerics from '@webtools/numerics';
import { scenarios, encode } from '../scenarios.mjs';
window.results = encode(scenarios(numerics,numerics.FFT));
const input=document.querySelector('#window');
input.addEventListener('change',()=>numerics.fft_window_size_inc({target:input}));
