// Manual provenance capture only. Tests never regenerate this authoritative snapshot.
import { writeFileSync } from 'node:fs';
import { legacy } from './legacy.mjs';
import { scenarios, encode } from './scenarios.mjs';
const {api,FFT}=legacy();
writeFileSync(new URL('./fixtures/legacy.json',import.meta.url),JSON.stringify({revision:'ac32dd6815808a5f3f4894e155c8cfdb72a715f4',fftRevision:'f8be92e1369f684da3e121e4c5b7fbcc8d50f868',results:encode(scenarios(api,FFT))},null,2)+'\n');
