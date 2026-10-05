const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const codec = require('@webtools/mavlink');
const typed = require('@webtools/transfers');
const legacy = require('../../../modules/MAVLink/mavftp.js');
const root = path.resolve(__dirname, '../../..');
const managerSource = fs.readFileSync(path.join(root, 'SimpleGCS/ftp_manager.js'), 'utf8');
const { collectFixtures } = require('./replay.cjs');

for (const fixture of ['mavftp', 'ftp_manager']) {
    const source = fs.readFileSync(path.join(root, `tests/${fixture}.test.cjs`), 'utf8');
    test(`${fixture}: unchanged fixtures and exact legacy/typed traces`, async t => {
        const reports = [];
        for (const implementation of [legacy, typed]) {
            const trace = [];
            const scenarios = collectFixtures({ source, managerSource, codec, implementation, trace, assert, Buffer, vm });
            for (const [name, run] of scenarios) {
                await t.test(`${implementation === legacy ? 'legacy' : 'typed'}: ${name}`, run);
            }
            reports.push(trace);
        }
        assert.deepEqual(reports[1], reports[0], 'Full wire bytes, results, and assertion observations must match exactly');
    });
}
