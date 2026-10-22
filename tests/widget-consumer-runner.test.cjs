const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const test = require('node:test')

test('shared browser expansion runs every consumer after a failure and aggregates status', () => {
    const directory = mkdtempSync(join(tmpdir(), 'widget-runner-'))
    try {
        writeFileSync(join(directory, 'pnpm'), '#!/usr/bin/env node\nconsole.log("EXECUTED:"+process.argv[2]);process.exit(process.argv[2]===process.env.FAIL_SUITE?2:0)\n', { mode: 0o755 })
        for (const failed of ['', 'test:dashboard-playback:browser']) {
            const result = spawnSync(process.execPath, [resolve('tests/run-widget-consumers.cjs')], {
                encoding: 'utf8', env: { ...process.env, PATH: directory + ':' + process.env.PATH, FAIL_SUITE: failed },
            })
            assert.equal(result.status, failed ? 1 : 0)
            assert.deepEqual([...result.stdout.matchAll(/EXECUTED:([^\n]+)/g)].map(match => match[1]), [
                'test:dashboard-playback:browser', 'test:video-preview:browser', 'test:widgets:browser',
            ])
        }
        const jobs = readFileSync('.github/workflows/react-apps.yml', 'utf8')
        assert.equal([...jobs.matchAll(/^  browser:/gm)].length, 1, 'one consolidated browser job remains')
        assert.equal([...jobs.matchAll(/^            test:widget-consumers:browser/gm)].length, 1, 'consumer expansion runs independently of preceding shared-package failures')
        assert.doesNotMatch(JSON.parse(readFileSync('package.json', 'utf8')).scripts['test:react-workflows:browser'], /widget-consumers/, 'consumer coverage is not duplicated')
    } finally { rmSync(directory, { recursive: true, force: true }) }
})
