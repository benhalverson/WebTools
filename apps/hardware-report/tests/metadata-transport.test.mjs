import assert from 'node:assert/strict'
import { test } from 'node:test'
import { octokitTransport } from '../src/metadata-transport.ts'

/** Verify the CDN adapter forwards cancellation and exact HTTP route/header intent. */
test('Octokit adapter forwards route, headers, signal and response data', async () => {
    const controller = new AbortController()
    let call
    const request = octokitTransport(async (...args) => { call = args; return { data: [{ ref: 'test' }], status: 200 } })
    const response = await request('https://api.github.com/repos/ArduPilot/ardupilot/git/refs/tags', { signal: controller.signal, headers: { 'X-GitHub-Api-Version': '2022-11-28' } })
    assert.equal(call[0], 'GET https://api.github.com/repos/ArduPilot/ardupilot/git/refs/tags')
    assert.equal(call[1].request.signal, controller.signal)
    assert.equal(call[1].headers['x-github-api-version'], '2022-11-28')
    assert.deepEqual(await response.json(), [{ ref: 'test' }])
})

/** Preserve HTTP rate-limit evidence while allowing network/abort errors to propagate. */
test('Octokit adapter preserves HTTP errors and reset headers', async () => {
    const request = octokitTransport(async () => { throw { status: 429, response: { headers: { 'x-ratelimit-reset': '12345' } } } })
    const response = await request('https://api.github.com/test')
    assert.equal(response.status, 429)
    assert.equal(response.headers.get('x-ratelimit-reset'), '12345')
    const error = new DOMException('aborted', 'AbortError')
    const aborted = octokitTransport(async () => { throw error })
    await assert.rejects(aborted('https://api.github.com/test'), cause => cause === error)
})
