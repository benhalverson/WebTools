import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as typed from '@webtools/parameters';
import { scenarios } from './scenarios.mjs';
const require = createRequire(import.meta.url);
const legacy = require('../../../modules/MAVLink/mavparam.js');
const fixture = require('../../../tests/fixtures/params.json');
const source = readFileSync(new URL('../../../tests/mavparam.test.cjs', import.meta.url), 'utf8');
for (const [name, implementation] of Object.entries({ legacy, typed })) {
    // Execute the authoritative tests unchanged with only the implementation import replaced.
    new Function('require', 'Buffer', source)(
        /** Resolve authoritative dependencies without modifying fixtures or scenarios. */
        id => id === 'node:test' ? (title, run) => test(`${name}: ${title}`, run)
            : id === 'node:assert/strict' ? assert : id.includes('params.json') ? fixture : implementation,
        Buffer,
    );
}
test('repeated interrupted operations and offline cache traces exactly match legacy', async () => {
    assert.deepEqual(await scenarios(typed, fixture, assert), await scenarios(legacy, fixture, assert));
});
