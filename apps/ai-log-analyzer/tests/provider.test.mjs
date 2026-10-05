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
        createClient: /** Inject the local recording SDK without provider traffic. */ () => mock.client,
        loadInstructions: /** Load hash-verified legacy instructions. */ async () => legacyFile('AILogAnalyzer/instructions.txt'),
        loadTools: /** Load hash-verified legacy tool definitions. */ async () => JSON.parse(legacyFile('AILogAnalyzer/assistantTools.json')),
        hasLog: /** Report whether this scenario includes a parsed fixture. */ () => Boolean(log),
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
            message: /** Record emitted text and its original role. */ (content, sender) => messages.push({ content, sender }),
            processing: /** Record transitions used by the owned send guard. */ value => processing.push(value), /** Ignore presentation-only dots in provider tests. */ thinking() {}, /** Count credential prompts without rendering a dialog. */ promptKey() { prompts++ }, /** Ignore decoded image presentation in provider-only tests. */ image() {},
        },
    })
    return { controller, messages, processing, prompts: /** Return the current credential-prompt count. */ () => prompts }
}

/** Makes one exact text delta in the Assistants streaming protocol. */
function textDelta(value) { return { event: 'thread.message.delta', data: { delta: { content: [{ type: 'text', text: { value } }] } } } }

test(`comparison oracle uses immutable ${comparisonRevision}`, /** Verify the immutable comparison source is pinned to the expected SDK. */ () => {
    assert.match(legacyFile('AILogAnalyzer/logAnalyzer.js'), /openai@4\.85\.4/)
})

for (const existing of [false, true]) test(`assistant ${existing ? 'reuse' : 'creation'} and text requests preserve exact legacy JSON`, /** Exercise the named provider scenario against recorded legacy behavior. */ async () => {
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
    assert.deepEqual(app.messages.filter(/** Exclude the UI-owned user echo from legacy provider callbacks. */ item => item.sender !== 'user'), JSON.parse(JSON.stringify(legacy.messages)))
    assert.equal(app.processing.at(-1), false)
    app.controller.dispose()
})

for (const [label, name, type, fixture] of [
    ['single-instance fixture', 'get', 'GPS', 'pymavlink-test.BIN'],
    ['last-instance fixture', 'get', 'BAT', 'plane-4.6.2-prefix.BIN'],
    ['unknown message', 'get', 'MISSING', 'plane-4.6.2-prefix.BIN'],
    ['unsupported tool', 'unknown', 'GPS', 'plane-4.6.2-prefix.BIN'],
    ['no uploaded log', 'get', 'GPS', null],
]) test(`${label}: tool request ordering and uploaded output.json bytes match legacy exactly`, /** Exercise the named provider scenario against recorded legacy behavior. */ async () => {
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
    for (let iteration = 0; iteration < 30; iteration++) await new Promise(/** Drain detached provider tool continuations. */ resolve => setImmediate(resolve))
    assert.deepEqual(mock.calls, old.calls)
    if (label.includes('fixture')) {
        const upload = JSON.parse(mock.calls.find(/** Select the exact recorded upload operation. */ ([name]) => name === 'files.create')[1])
        assert.equal(upload.name, 'output.json')
        assert.ok(upload.bytes.length > 50)
        assert.deepEqual(mock.calls.filter(/** Select operations by SDK endpoint for sequence assertions. */ ([name]) => name === 'files.del').map(/** Decode the recorded request arguments without altering their values. */ ([, body]) => JSON.parse(body)), [['old-file']])
    }
    app.controller.dispose()
})

test('401 detection retains every legacy error shape', /** Compare every supported authentication error representation. */ () => {
    const oracle = legacySession(mockProvider())
    for (const error of [{ status: 401 }, { response: { status: 401 } }, { code: 401 },
        { error: { type: 'invalid_request_error' }, message: 'Invalid API key' }, '401 Unauthorized', {}, null, new Error('network unavailable')]) {
        oracle.context.suppliedError = error
        assert.equal(isUnauthorizedError(error), Boolean(vmResult(oracle, 'isUnauthorizedError(suppliedError)')))
    }
})

/** Evaluates a synchronous legacy predicate without serializing Error instances. */
function vmResult(oracle, expression) { return runInContext(expression, oracle.context) }

test('missing message tool preserves omitted attachments on the following request', /** Exercise the named provider scenario against recorded legacy behavior. */ async () => {
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
    for (let iteration = 0; iteration < 30; iteration++) await new Promise(/** Drain detached provider tool continuations. */ resolve => setImmediate(resolve))
    await app.controller.send('Second')
    assert.deepEqual(mock.calls, old.calls)
    const body = JSON.parse(mock.calls.filter(/** Select operations by SDK endpoint for sequence assertions. */ ([name]) => name === 'messages.create').at(-1)[1])[1]
    assert.equal(Object.hasOwn(body, 'attachments'), false)
    app.controller.dispose()
})

test('unmount aborts active streams and suppresses callbacks after delayed stream events', /** Exercise the named provider scenario against recorded legacy behavior. */ async () => {
    let release
    let aborted = 0
    const held = new Promise(/** Expose a held stream's release point to the lifecycle test. */ resolve => { release = resolve })
    const mock = mockProvider({ existing: true })
    mock.client.beta.threads.runs.stream = /** Return a controllable local response stream. */ () => ({
        controller: { /** Count stream cancellation performed by controller disposal. */ abort() { aborted++ } },
        /** Resolves a queued event after disposal to probe stale subscriber suppression. */
        async *[Symbol.asyncIterator]() { await held; yield textDelta('must not render') },
    })
    const app = migrated(mock)
    await app.controller.connect('mock-key')
    const sending = app.controller.send('Wait')
    for (let iteration = 0; iteration < 5; iteration++) await new Promise(/** Drain detached provider tool continuations. */ resolve => setImmediate(resolve))
    const count = app.messages.length
    app.controller.dispose()
    release()
    await sending
    assert.equal(aborted, 1)
    assert.equal(app.messages.length, count)
    assert.equal(mock.calls.filter(/** Select operations by SDK endpoint for sequence assertions. */ ([name]) => name === 'messages.create').length, 1)
})

test('duplicate send is blocked while active, and legacy upload reset permits next request', /** Exercise the named provider scenario against recorded legacy behavior. */ async () => {
    let release
    const held = new Promise(/** Expose a held stream's release point to the lifecycle test. */ resolve => { release = resolve })
    const mock = mockProvider({ existing: true })
    mock.client.beta.threads.runs.stream = /** Return a controllable local response stream. */ () => ({
        /** Holds only the local mock iterator, never a live provider operation. */
        async *[Symbol.asyncIterator]() { await held; yield* [] },
    })
    const app = migrated(mock)
    await app.controller.connect('mock-key')
    const first = app.controller.send('First')
    await app.controller.send('Duplicate')
    assert.equal(app.messages.filter(/** Count user messages accepted by the controller guard. */ message => message.sender === 'user').length, 1)
    app.controller.setProcessing(false)
    const next = app.controller.send('After upload')
    for (let iteration = 0; iteration < 5; iteration++) await new Promise(/** Drain detached provider tool continuations. */ resolve => setImmediate(resolve))
    assert.equal(mock.calls.filter(/** Select operations by SDK endpoint for sequence assertions. */ ([name]) => name === 'messages.create').length, 2)
    release()
    await Promise.all([first, next])
    app.controller.dispose()
})

test('a tool continuation stream resolving after disposal is immediately aborted', /** Exercise the named provider scenario against recorded legacy behavior. */ async () => {
    const mock = mockProvider({ existing: true, runs: [[toolEvent('unknown')]] })
    let resolve
    let aborts = 0
    const pending = new Promise(/** Expose completion of the pending tool-output request. */ done => { resolve = done })
    mock.client.beta.threads.runs.submitToolOutputs = /** Delay the continuation response until after disposal. */ () => pending
    const app = migrated(mock)
    await app.controller.connect('mock-key')
    await app.controller.send('Request tool')
    for (let iteration = 0; iteration < 5; iteration++) await new Promise(/** Drain late response continuations before asserting disposal. */ done => setImmediate(done))
    const before = app.messages.length
    app.controller.dispose()
    resolve({
        controller: { /** Count stream cancellation performed by controller disposal. */ abort() { aborts++ } },
        /** A disposed continuation must never render even if the stream contains text. */
        async *[Symbol.asyncIterator]() { yield textDelta('stale') },
    })
    for (let iteration = 0; iteration < 5; iteration++) await new Promise(/** Drain late response continuations before asserting disposal. */ done => setImmediate(done))
    assert.equal(aborts, 1)
    assert.equal(app.messages.length, before)
})

/** Issue distinct assistant/thread identifiers for each reconnect, retaining request recordings. */
function rotatingConnection(mock) {
    let assistant = 0
    let thread = 0
    const list = mock.client.beta.assistants.list
    const create = mock.client.beta.threads.create
    mock.client.beta.assistants.list = /** Return a different assistant after each update. */ async (...args) => {
        await list(...args)
        return { data: [{ id: `assistant-${++assistant}`, name: 'Log Analyzer' }] }
    }
    mock.client.beta.threads.create = /** Return a different conversation after each update. */ async (...args) => {
        await create(...args)
        return { id: `thread-${++thread}` }
    }
}

/** Hold one SDK operation after recording its request until the test permits completion. */
function holdOperation(owner, name) {
    let release
    let arrived
    const held = new Promise(/** Capture the operation release hook. */ resolve => { release = resolve })
    const reached = new Promise(/** Capture the operation arrival hook. */ resolve => { arrived = resolve })
    const original = owner[name]
    owner[name] = /** Record the first request and pause its response deterministically. */ async (...args) => {
        const result = await original(...args)
        arrived()
        await held
        return result
    }
    return { reached, release: /** Resolve the held SDK operation. */ () => release() }
}

/** Drain detached tool continuations without wall-clock polling or provider traffic. */
async function drainTools() {
    for (let iteration = 0; iteration < 30; iteration++) await new Promise(/** Yield to queued provider continuations. */ resolve => setImmediate(resolve))
}

for (const endpoint of ['cancel', 'message']) test(`assistant update during held ${endpoint} preserves legacy current connection reads`, /** Compare reconnect races using distinct IDs and controlled SDK completion. */ async () => {
    const log = endpoint === 'cancel' ? await fixtureLog() : undefined
    const runs = endpoint === 'cancel' ? [[toolEvent()], []] : [[]]
    const old = mockProvider({ existing: true, runs })
    rotatingConnection(old)
    const oldGate = holdOperation(endpoint === 'cancel' ? old.client.beta.threads.runs : old.client.beta.threads.messages, endpoint === 'cancel' ? 'cancel' : 'create')
    const legacy = legacySession(old, log)
    legacy.context.document.getElementById = /** Supply the legacy update button required by its click handler. */ () => ({
        classList: { /** Ignore presentation-only class additions. */ add() {}, /** Ignore presentation-only class removal. */ remove() {} },
    })
    legacy.context.setTimeout = /** Avoid waiting for the legacy presentation-only button reset. */ () => 0
    await legacy.run('connectIfNeeded()')
    const oldSending = vmResult(legacy, 'processUserMessage("Analyze")')
    await oldGate.reached
    await legacy.run('updateAssistant()')
    oldGate.release()
    await oldSending
    await drainTools()

    const mock = mockProvider({ existing: true, runs })
    rotatingConnection(mock)
    const gate = holdOperation(endpoint === 'cancel' ? mock.client.beta.threads.runs : mock.client.beta.threads.messages, endpoint === 'cancel' ? 'cancel' : 'create')
    const app = migrated(mock, log)
    await app.controller.connect('mock-key')
    const sending = app.controller.send('Analyze')
    await gate.reached
    await app.controller.updateAssistant()
    gate.release()
    await sending
    await drainTools()
    assert.deepEqual(mock.calls, old.calls)
    const finalRun = JSON.parse(mock.calls.findLast(/** Select the follow-on run issued after updating. */ ([name]) => name === (endpoint === 'cancel' ? 'runs.create' : 'runs.stream'))[1])
    assert.equal(finalRun[0], 'thread-2')
    assert.equal(finalRun[1].assistant_id, 'assistant-2')
    if (endpoint === 'cancel') {
        const resumedMessage = JSON.parse(mock.calls.findLast(/** Select the extracted-file follow-on message. */ ([name]) => name === 'messages.create')[1])
        assert.equal(resumedMessage[0], 'thread-2')
    }
    app.controller.dispose()
})
