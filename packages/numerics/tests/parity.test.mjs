import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as numerics from '@webtools/numerics';
import { legacy } from './legacy.mjs';
import { scenarios, encode } from './scenarios.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/legacy.json',import.meta.url),'utf8'));
test('unchanged legacy matches recorded behavior, including holes and IEEE edge cases',()=>{
    const {api,FFT}=legacy();
    assert.deepEqual(encode(scenarios(api,FFT)),fixture.results);
});
test('compiled public package matches every legacy fixture exactly (zero tolerance)',()=>{
    assert.deepEqual(encode(scenarios(numerics,numerics.FFT)),fixture.results);
});
test('pinned FFT runtime is copied byte for byte',()=>{
    assert.deepEqual(readFileSync(new URL('../dist/vendor/fft.cjs',import.meta.url)),readFileSync(new URL('../../../modules/fft.js/lib/fft.js',import.meta.url)));
});
test('FFT transform boundary round trips complex input',()=>{
    const fft=new numerics.FFT(8);
    const input=fft.toComplexArray([1,2,3,4,5,6,7,8]);
    const spectrum=fft.createComplexArray();const result=fft.createComplexArray();
    fft.transform(spectrum,input);fft.inverseTransform(result,spectrum);
    for(let i=0;i<input.length;i++)assert.ok(Math.abs(result[i]-input[i])<1e-12);
});
