import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createLogService } from '../src/log.ts'
import { fixtureLog, legacySession, mockProvider } from './oracle.mjs'
import { loadDataflashParser } from '../../../packages/dataflash/dist/index.js'

/** Copies only the fixture's bytes into the ArrayBuffer consumed by the parser. */
function buffer(bytes) { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }

for (const fixture of ['pymavlink-test.BIN', 'plane-4.6.2-prefix.BIN']) test(`production log accessor matches every legacy message and last instance exactly: ${fixture}`, async () => {
    const legacyLog = await fixtureLog(fixture)
    const bytes = await readFile(new URL(`../../../packages/dataflash/fixtures/${fixture}`, import.meta.url))
    const service = createLogService('/', loadDataflashParser)
    await service.load(buffer(bytes))
    const mock = mockProvider({ existing: true })
    const legacy = legacySession(mock, legacyLog)
    await legacy.run('connectIfNeeded()')
    for (const name of Object.keys(legacyLog.messageTypes).filter(name => !name.includes('['))) {
        const before = mock.calls.length
        await legacy.run(`window.get(${JSON.stringify(name)})`)
        const uploaded = mock.calls.slice(before).find(([operation]) => operation === 'files.create')
        assert.equal(await service.getMessage(name), uploaded ? JSON.parse(uploaded[1]).bytes : undefined, name)
    }
    assert.equal(await service.getMessage('MISSING'), undefined)
    service.dispose()
    assert.equal(service.hasLog(), false)
    assert.equal(await service.getMessage('GPS'), undefined)
})

test('repeated loads, corrupt replacement and disposal release previous parsed data', async () => {
    await fixtureLog()
    const bytes = await readFile(new URL('../../../packages/dataflash/fixtures/plane-4.6.2-prefix.BIN', import.meta.url))
    const service = createLogService('/', loadDataflashParser)
    for (let iteration = 0; iteration < 3; iteration++) {
        await service.load(buffer(bytes))
        assert.ok(await service.getMessage('BAT'))
        await service.load(new ArrayBuffer(0))
        assert.equal(await service.getMessage('BAT'), undefined)
    }
    service.dispose()
    await service.load(buffer(bytes))
    assert.equal(service.hasLog(), false)
})

test('a parser resolving after unmount cannot restore retained log buffers', async () => {
    await fixtureLog()
    let resolve
    const pending = new Promise(done => { resolve = done })
    const service = createLogService('/', () => pending)
    const loading = service.load(new ArrayBuffer(0))
    service.dispose()
    resolve(await loadDataflashParser())
    await loading
    assert.equal(service.hasLog(), false)
})

test('parser throwing during replacement cannot expose the preceding successful log', async () => {
    await fixtureLog()
    const Parser = await loadDataflashParser()
    const bytes = await readFile(new URL('../../../packages/dataflash/fixtures/plane-4.6.2-prefix.BIN', import.meta.url))
    let broken = false
    /** Models an upstream parser exception after its replacement instance is allocated. */
    class ThrowingParser {
        messageTypes = {}
        /** Throws directly instead of relying on internally caught malformed fixture errors. */
        processData() { throw new Error('recorded parser failure') }
    }
    const service = createLogService('/', async () => broken ? ThrowingParser : Parser)
    await service.load(buffer(bytes))
    assert.ok(await service.getMessage('BAT'))
    broken = true
    await assert.rejects(service.load(new ArrayBuffer(0)), /recorded parser failure/)
    assert.equal(await service.getMessage('BAT'), undefined)
    assert.equal(service.hasLog(), true, 'legacy retains the newly allocated, failed parser instance')
    service.dispose()
})
