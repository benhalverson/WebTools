import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

export const comparisonRevision = 'bbbd72a47a9354f06d767fe40decfca6ed74aada'
const root = new URL('../../../', import.meta.url)

// SHA-256 values recorded from the comparison revision; shallow CI needs no Git fetch.
const legacyHashes = {
    'AILogAnalyzer/logAnalyzer.js': 'e64f6d65ee9671452decaf3747e1981750b84211681b935dcb2929659bda8c07',
    'AILogAnalyzer/instructions.txt': '8ed6b4c8ef14b2439b4dfb4638ada0020df576ae446821d6ddb08ee5b6979dd2',
    'AILogAnalyzer/assistantTools.json': '0227626fe595ccb6238a54b1991f976bfea57a4ef76a819e8592cbbe77bd139d',
}

/** Reads only retained bytes verified against the immutable comparison tree. */
export function legacyFile(file) {
    const source = readFileSync(new URL(file, root), 'utf8')
    assert.equal(createHash('sha256').update(source).digest('hex'), legacyHashes[file], `${file} must match ${comparisonRevision}`)
    return source
}

/** Returns a finite recorded stream without any network or provider connection. */
export async function* stream(events = []) { yield* events }

/** Captures SDK operation order and JSON bodies, including exact uploaded file bytes. */
export function mockProvider(options = {}) {
    const calls = []
    const pending = []
    const runs = [...(options.runs ?? [])]
    /** Records JSON as sent by the old SDK caller, preserving null and omitted members. */
    function record(name, args) { calls.push([name, JSON.stringify(args)]) }
    /** Implements deterministic SDK endpoints with recorded arguments. */
    function endpoint(name, result) {
        return async (...args) => { record(name, args); return typeof result === 'function' ? result() : result }
    }
    const client = {
        beta: {
            assistants: {
                list: endpoint('assistants.list', { data: options.existing ? [{ id: 'assistant-1', name: 'Log Analyzer' }] : [] }),
                create: endpoint('assistants.create', { id: 'assistant-1' }),
                del: endpoint('assistants.del', {}),
            },
            threads: {
                create: endpoint('threads.create', { id: 'thread-1' }),
                messages: { create: endpoint('messages.create', { id: 'message-1' }) },
                runs: {
                    /** SDK streaming starts synchronously and returns an async iterator. */
                    stream(...args) { record('runs.stream', args); return stream(runs.shift()) },
                    create: endpoint('runs.create', () => stream(runs.shift())),
                    cancel: endpoint('runs.cancel', {}),
                    submitToolOutputs: endpoint('runs.submitToolOutputs', () => stream(runs.shift())),
                },
            },
        },
        files: {
            list: endpoint('files.list', { data: [{ id: 'old-file', filename: 'output.json' }, { id: 'retained-file', filename: 'keep.json' }] }),
            del: endpoint('files.del', {}),
            /** Captures the Blob verbatim instead of normalizing typed-array JSON. */
            async create({ file, purpose }) {
                const operation = file.text().then(bytes => calls.push(['files.create', JSON.stringify({ name: file.name, type: file.type, purpose, bytes })]))
                pending.push(operation)
                await operation
                return { id: 'file-1' }
            },
            content: endpoint('files.content', new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })),
        },
    }
    return { client, calls, pending }
}

/** Evaluates unchanged owned legacy code with an injected SDK and minimal unused DOM. */
export function legacySession(mock, log) {
    const source = legacyFile('AILogAnalyzer/logAnalyzer.js')
        .replace(/^import_done\[0\].*$/m, '')
        .replace(/^import .*$/gm, '')
    const messages = []
    const context = vm.createContext({
        console: { log() {}, error() {} }, Blob, File, Response, URL, setTimeout, clearTimeout,
        window: {}, document: { addEventListener() {}, getElementById() { return null } },
        /** Provides unchanged instructions and tool documents to the legacy loader. */
        fetch: async file => new Response(legacyFile(`AILogAnalyzer/${file}`)),
        /** Injects a fully recorded local SDK in place of the external provider. */
        OpenAI: function OpenAI() { return mock.client },
        suppliedLog: log,
        messages,
    })
    vm.runInContext(source, context)
    vm.runInContext(`log = suppliedLog; apiKey = 'mock-key';
        addChatMessage = (content, sender) => messages.push({content, sender});
        showThinkingMessage = () => {}; setProcessingState = () => {};
        handleInvalidApiKey = () => {};`, context)
    return {
        context, messages,
        /** Runs one legacy operation and drains detached tool-stream microtasks. */
        async run(expression) {
            await vm.runInContext(expression, context)
            for (let iteration = 0; iteration < 30; iteration++) await new Promise(resolve => setImmediate(resolve))
            await Promise.all(mock.pending)
        },
    }
}

/** Loads each authoritative binary through the pinned retained parser. */
export async function fixtureLog(name = 'plane-4.6.2-prefix.BIN') {
    globalThis.self ??= { addEventListener() {} }
    const { default: Parser } = await import('../../../modules/JsDataflashParser/parser.js')
    const bytes = await readFile(new URL(`../../../packages/dataflash/fixtures/${name}`, import.meta.url))
    const log = new Parser()
    log.processData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), [])
    assert.ok(Object.keys(log.messageTypes).length > 10)
    return log
}

/** Constructs a recorded Assistants API tool-action event with exact wire shape. */
export function toolEvent(name = 'get', message = 'GPS') {
    return { event: 'thread.run.requires_action', data: { id: 'run-1', required_action: { submit_tool_outputs: { tool_calls: [
        { id: 'call-1', type: 'function', function: { name, arguments: JSON.stringify({ message_type: message }) } },
    ] } } } }
}
