import { readFileSync } from 'node:fs';
import vm from 'node:vm';
export function legacy() {
    const context = vm.createContext({});
    for (const path of ['modules/fft.js/dist/fft.js','Libraries/Array_Math.js','Libraries/fft.js']) vm.runInContext(readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8'),context);
    return { api: context, FFT: context.FFTJS };
}
