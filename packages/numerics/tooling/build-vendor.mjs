import { copyFile, mkdir } from 'node:fs/promises';
const output = new URL('../dist/vendor/', import.meta.url);
await mkdir(output, { recursive: true });
// Copy the pinned CommonJS distribution verbatim, never rebuild or substitute npm FFT.
await copyFile(new URL('../../../modules/fft.js/lib/fft.js', import.meta.url), new URL('fft.cjs', output));
await copyFile(new URL('../src/vendor/fft.d.cts', import.meta.url), new URL('fft.d.cts', output));
await copyFile(new URL('../../../modules/fft.js/README.md', import.meta.url), new URL('README.md', output));
