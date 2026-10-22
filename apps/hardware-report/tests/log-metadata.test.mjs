import assert from 'node:assert/strict'
import { test } from 'node:test'
import { releaseMetadata } from '../src/model/log-metadata.ts'

/** Return a mock GitHub JSON response without contacting a provider. */
function response(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), { status, headers })
}

test('official tags share session cache and retain ordered matching release links', async () => {
    let calls = 0
    const request = async () => { calls++; return response([{ref:'refs/tags/Plane-1',object:{sha:'abc123'}},{ref:'refs/tags/Plane-2',object:{sha:'abc456'}}]) }
    const signal = new AbortController().signal
    assert.deepEqual((await releaseMetadata('abc',signal,request)).links.map(link=>link.name),['Plane-1','Plane-2'])
    await releaseMetadata('abc',signal,request)
    assert.equal(calls,1)
})

test('nonofficial commits and branch failures keep the original warning and link', async () => {
    const paths=[]
    const request=async url=>{paths.push(url);if(url.endsWith('git/refs/tags'))return response([]);if(url.endsWith('branches-where-head'))return response({},500);return response({sha:'1234',html_url:'https://github.com/ArduPilot/ardupilot/commit/1234'})}
    const result=await releaseMetadata('123',new AbortController().signal,request)
    assert.equal(result.text,'Warning: not official firmware release.\nFound commit: ')
    assert.equal(result.branchError,'Version check failed to get branches.')
    assert.equal(result.links[0].name,'123')
    assert.equal(paths.length,3)
})

test('rate limit failure persists across hashes until reset and preserves offline wording', async () => {
    let calls=0
    const request=async()=>{calls++;return response({},429,{'x-ratelimit-reset':'100'})}
    const signal=new AbortController().signal
    assert.equal((await releaseMetadata('a',signal,request,()=>1000)).text,'Version check failed to get whitelist (a)')
    assert.equal((await releaseMetadata('b',signal,request,()=>99000)).text,'')
    assert.equal(calls,1)
    await releaseMetadata('b',signal,request,()=>100000)
    assert.equal(calls,2)
    assert.equal((await releaseMetadata('c',signal,null)).text,'Version check failed, offline (c)')
})

test('aborted replacement requests cannot publish tags to the shared cache', async () => {
    const controller=new AbortController()
    let calls=0
    const request=async()=>{calls++;if(calls===1)controller.abort();return response([{ref:'refs/tags/test',object:{sha:'abc'}}])}
    assert.equal((await releaseMetadata('abc',controller.signal,request)).text,'')
    assert.equal((await releaseMetadata('abc',new AbortController().signal,request)).text,'Official release:')
    assert.equal(calls,2)
})
