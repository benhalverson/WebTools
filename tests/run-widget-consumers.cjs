const { spawnSync } = require('node:child_process')

// Expand this existing shared browser entry without short-circuiting the consolidated CI job.
const suites = ['test:dashboard-playback:browser', 'test:video-preview:browser', 'test:widgets:browser']
let failed = false
for (const suite of suites) {
    console.log(`Running ${suite}`)
    const result = spawnSync('pnpm', [suite], { stdio: 'inherit', env: process.env })
    if (result.error || result.status !== 0) { console.error(`Failed ${suite}`, result.error ?? result.status); failed = true }
}
process.exitCode = failed ? 1 : 0
