import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInContext } from 'node:vm'
import { createAnalyzerController, isUnauthorizedError } from '../src/provider.ts'
import { comparisonRevision, fixtureLog, legacyFile, legacySession, mockProvider, toolEvent } from './oracle.mjs'

/** Wires a recording client to the migrated controller without contacting a provider. */
function migrated(mock, log) {
    const messages = []
    const processing = []
    let prompts = 0
    const controller = createAnalyzerController({
        createClient: () => mock.client,
        loadInstructions: async () => legacyFile('AILogAnalyzer/instructions.txt'),
        loadTools: async () => JSON.parse(legacyFile('AILogAnalyzer/assistantTools.json')),
        hasLog: () => Boolean(log),
        /** Reproduces the unchanged parser selection used by the owned log service. */
        async getMessage(type) {
            if (!log?.messageTypes[type]) return undefined
            let result
            if (log.messageTypes[type].instances) {
                for (const instance of Object.keys(log.messageTypes[type].instances)) result = log.get_instance(type, instance)
            } else result = log.get(type)
            return result ? JSON.stringify(result) : undefined
        },
        callbacks: {
            message: (content, sender) => messages.push({ content, sender }),
            processing: value => processing.push(value), thinking() {}, promptKey() { prompts++ }, image() {},
        },
    })
    return { controller, messages, processing, prompts: () => prompts }
}

/** Makes one exact text delta in the Assistants streaming protocol. */
function textDelta(value) { return { event: 'thread.message.delta', data: { delta: { content: [{ type: 'text', text: { value } }] } } } }

test(`comparison oracle uses immutable ${comparisonRevision}`, () => {
    assert.match(legacyFile('AILogAnalyzer/logAnalyzer.js'), /openai@4\.85\.4/)
})

for (const existing of [false, true]) test(`assistant ${existing ? 'reuse' : 'creation'} and text requests preserve exact legacy JSON`, async () => {
    const events = [textDelta('hello'), textDelta(' **world**'), { event: 'thread.run.completed', data: {} }]
    const old = mockProvider({ existing, runs: [events] })
    const legacy = legacySession(old)
    await legacy.run('connectIfNeeded();')
    await legacy.run('processUserMessage("Explain this flight")')
    const mock = mockProvider({ existing, runs: [events] })
    const app = migrated(mock)
    await app.controller.connect(' mock-key ')
    await app.controller.send(' Explain this flight ')
    assert.deepEqual(mock.calls, old.calls)
    assert.deepEqual(app.messages.filter(item => item.sender !== 'user'), JSON.parse(JSON.stringify(legacy.messages)))
    assert.equal(app.processing.at(-1), false)
    app.controller.dispose()
})

for (const [label, name, type, fixture] of [
    ['single-instance fixture', 'get', 'GPS', 'pymavlink-test.BIN'],
    ['last-instance fixture', 'get', 'BAT', 'plane-4.6.2-prefix.BIN'],
    ['unknown message', 'get', 'MISSING', 'plane-4.6.2-prefix.BIN'],
    ['unsupported tool', 'unknown', 'GPS', 'plane-4.6.2-prefix.BIN'],
    ['no uploaded log', 'get', 'GPS', null],
]) test(`${label}: tool request ordering and uploaded output.json bytes match legacy exactly`, async () => {
    const log = fixture ? await fixtureLog(fixture) : undefined
    const events = [toolEvent(name, type)]
    const old = mockProvider({ existing: true, runs: [events, [textDelta('Finished')]] })
    const legacy = legacySession(old, log)
    await legacy.run('connectIfNeeded()')
    await legacy.run('processUserMessage("Analyze")')
    const mock = mockProvider({ existing: true, runs: [events, [textDelta('Finished')]] })
    const app = migrated(mock, log)
    await app.controller.connect('mock-key')
    await app.controller.send('Analyze')
    for (let iteration = 0; iteration < 30; iteration++) await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(mock.calls, old.calls)
    if (label.includes('fixture')) {
        const upload = JSON.parse(mock.calls.find(([name]) => name === 'files.create')[1])
        assert.equal(upload.name, 'output.json')
        assert.ok(upload.bytes.length > 50)
        assert.deepEqual(mock.calls.filter(([name]) => name === 'files.del').map(([, body]) => JSON.parse(body)), [['old-file']])
    }
    app.controller.dispose()
})

test('401 detection retains every legacy error shape', () => {
    const oracle = legacySession(mockProvider())
    for (const error of [{ status: 401 }, { response: { status: 401 } }, { code: 401 },
        { error: { type: 'invalid_request_error' }, message: 'Invalid API key' }, '401 Unauthorized', {}, null, new Error('network unavailable')]) {
        oracle.context.suppliedError = error
        assert.equal(isUnauthorizedError(error), Boolean(vmResult(oracle, 'isUnauthorizedError(suppliedError)')))
    }
})

/** Evaluates a synchronous legacy predicate without serializing Error instances. */
function vmResult(oracle, expression) { return runInContext(expression, oracle.context) }

test('missing message tool preserves omitted attachments on the following request', async () => {
    const log = await fixtureLog()
    const events = [toolEvent('get', 'DOES_NOT_EXIST')]
    const old = mockProvider({ existing: true, runs: [events, [], []] })
    const legacy = legacySession(old, log)
    await legacy.run('connectIfNeeded()')
    await legacy.run('processUserMessage("First")')
    await legacy.run('processUserMessage("Second")')
    const mock = mockProvider({ existing: true, runs: [events, [], []] })
    const app = migrated(mock, log)
    await app.controller.connect('mock-key')
    await app.controller.send('First')
    for (let iteration = 0; iteration < 30; iteration++) await new Promise(resolve => setImmediate(resolve))
    await app.controller.send('Second')
    assert.deepEqual(mock.calls, old.calls)
    const body = JSON.parse(mock.calls.filter(([name]) => name === 'messages.create').at(-1)[1])[1]
    assert.equal(Object.hasOwn(body, 'attachments'), false)
    app.controller.dispose()
})

test('unmount aborts active streams and suppresses callbacks after delayed stream events', async () => {
    let release
    let aborted = 0
    const held = new Promise(resolve => { release = resolve })
    const mock = mockProvider({ existing: true })
    mock.client.beta.threads.runs.stream = () => ({
        controller: { abort() { aborted++ } },
        /** Resolves a queued event after disposal to probe stale subscriber suppression. */
        async *[Symbol.asyncIterator]() { await held; yield textDelta('must not render') },
    })
    const app = migrated(mock)
    await app.controller.connect('mock-key')
    const sending = app.controller.send('Wait')
    for (let iteration = 0; iteration < 5; iteration++) await new Promise(resolve => setImmediate(resolve))
    const count = app.messages.length
    app.controller.dispose()
    release()
    await sending
    assert.equal(aborted, 1)
    assert.equal(app.messages.length, count)
    assert.equal(mock.calls.filter(([name]) => name === 'messages.create').length, 1)
})

test('duplicate send is blocked while active, and legacy upload reset permits next request', async () => {
    let release
    const held = new Promise(resolve => { release = resolve })
    const mock = mockProvider({ existing: true })
    mock.client.beta.threads.runs.stream = () => ({
        /** Holds only the local mock iterator, never a live provider operation. */
        async *[Symbol.asyncIterator]() { await held; yield* [] },
    })
    const app = migrated(mock)
    await app.controller.connect('mock-key')
    const first = app.controller.send('First')
    await app.controller.send('Duplicate')
    assert.equal(app.messages.filter(message => message.sender === 'user').length, 1)
    app.controller.setProcessing(false)
    const next = app.controller.send('After upload')
    for (let iteration = 0; iteration < 5; iteration++) await new Promise(resolve => setImmediate(resolve))
    assert.equal(mock.calls.filter(([name]) => name === 'messages.create').length, 2)
    release()
    await Promise.all([first, next])
    app.controller.dispose()
})

test('a tool continuation stream resolving after disposal is immediately aborted', async () => {
    const mock = mockProvider({ existing: true, runs: [[toolEvent('unknown')]] })
    let resolve
    let aborts = 0
    const pending = new Promise(done => { resolve = done })
    mock.client.beta.threads.runs.submitToolOutputs = () => pending
    const app = migrated(mock)
    await app.controller.connect('mock-key')
    await app.controller.send('Request tool')
    for (let iteration = 0; iteration < 5; iteration++) await new Promise(done => setImmediate(done))
    const before = app.messages.length
    app.controller.dispose()
    resolve({
        controller: { abort() { aborts++ } },
        /** A disposed continuation must never render even if the stream contains text. */
        async *[Symbol.asyncIterator]() { yield textDelta('stale') },
    })
    for (let iteration = 0; iteration < 5; iteration++) await new Promise(done => setImmediate(done))
    assert.equal(aborts, 1)
    assert.equal(app.messages.length, before)
})
