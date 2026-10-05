/** Provider messages retain the legacy roles and text boundaries. */
export type Sender = 'user' | 'assistant' | 'system' | 'error'
export interface ToolCall { id: string; function: { name: string; arguments: string } }
export interface ProviderEvent {
  event: string
  data: {
    id?: string
    delta?: { content?: Array<{ text?: { value?: string }; image_file?: { file_id?: string } }> }
    required_action?: { submit_tool_outputs?: { tool_calls?: ToolCall[] } }
  }
}
export interface RunStream extends AsyncIterable<ProviderEvent> { controller?: { abort(): void } }
export interface MessageRequest {
  role: 'user'
  content: string
  attachments: Array<{ file_id: string; tools: Array<{ type: 'code_interpreter' }> }> | null | undefined | ''
}
/** Minimal consumed surface of the pinned SDK; mocks use the same request shapes. */
export interface ProviderClient {
  beta: {
    assistants: {
      list(body: { order: 'desc'; limit: number }): Promise<{ data: Array<{ id: string; name: string | null }> }>
      create(body: { name: string; instructions: string; model: string; tools: unknown[] }): Promise<{ id: string }>
      del(id: string): Promise<unknown>
    }
    threads: {
      create(): Promise<{ id: string }>
      messages: { create(thread: string, body: MessageRequest): Promise<unknown> }
      runs: {
        stream(thread: string, body: { assistant_id: string }): RunStream
        create(thread: string, body: { assistant_id: string; stream: true }): Promise<RunStream>
        cancel(thread: string, run: string): Promise<unknown>
        submitToolOutputs(thread: string, run: string, body: { tool_outputs: Array<{ tool_call_id: string; output?: string }>; stream: true }): Promise<RunStream>
      }
    }
  }
  files: {
    list(): Promise<{ data: Array<{ id: string; filename: string }> }>
    del(id: string): Promise<unknown>
    create(body: { file: File; purpose: 'assistants' }): Promise<{ id: string }>
    content(id: string): Promise<{ blob(): Promise<Blob> }>
  }
}
export interface AnalyzerCallbacks {
  /** Append a legacy message or streaming assistant delta. */
  message(content: string, sender: Sender): void
  /** Update owned input processing state. */
  processing(active: boolean): void
  /** Update the owned thinking indicator. */
  thinking(active: boolean): void
  /** Open the ephemeral credential dialog. */
  promptKey(): void
  /** Display an image; the view owns and revokes its object URL. */
  image(blob: Blob): void
}
export interface AnalyzerOptions {
  /** Create an SDK instance with an in-memory credential. */
  createClient(apiKey: string): ProviderClient | Promise<ProviderClient>
  /** Load existing instructions, including their legacy fallback. */
  loadInstructions(): Promise<string>
  /** Load the unchanged assistant tool definitions. */
  loadTools(): Promise<unknown[]>
  /** Extract JSON using the legacy last-instance selection. */
  getMessage(messageType: string): Promise<string | undefined>
  /** Report whether a local log has been parsed. */
  hasLog(): boolean
  callbacks: AnalyzerCallbacks
}
/** Preserve SDK and nested-response unauthorized detection without trusting error shapes. */
export function isUnauthorizedError(error: unknown): boolean {
  const value = asRecord(error)
  return value.status === 401 || asRecord(value.response).status === 401 || value.code === 401 ||
    (asRecord(value.error).type === 'invalid_request_error' && /unauthorized|invalid api key/i.test(String(value.message ?? ''))) ||
    (/401/.test(String(error)) && /unauthorized|invalid api key/i.test(String(error)))
}
/** Narrow untrusted SDK errors and JSON values at their boundary. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}
/** Format failures while preserving Error messages from the legacy SDK. */
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
/** Match the first named assistant in the provider's descending listing. */
function isTargetAssistant(assistant: { name: string | null }): boolean { return assistant.name === 'Log Analyzer' }
/** Preserve fire-and-forget deletion without introducing an unhandled rejection. */
function ignoreDeletionFailure(): void {}
/** Create the pinned browser SDK; its external structural boundary is exercised by mocks. */
export async function createOpenAIClient(apiKey: string): Promise<ProviderClient> {
  const { default: OpenAI } = await import('openai')
  // The legacy failure tool payload intentionally omits successful outputs in a
  // mixed batch. Keep that wire shape instead of coercing SDK optional fields.
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true }) as unknown as ProviderClient
}
/** Own one mounted analyzer's ephemeral provider state and asynchronous lifetime. */
export function createAnalyzerController(options: AnalyzerOptions) {
  let client: ProviderClient | null = null
  let assistantId: string | null = null
  let threadId: string | null = null
  let fileId: string | null | undefined = null
  let apiKey: string | null = null
  let disposed = false
  let processing = false
  const streams = new Set<RunStream>()
  const cb = options.callbacks
  /** Stop continuations before they perform another provider operation after unmount. */
  function checkLive(): void { if (disposed) throw new Error('Analyzer disposed') }
  /** Emit only while the owning React view is mounted. */
  function message(content: string, sender: Sender): void { if (!disposed) cb.message(content, sender) }
  /** Keep the controller's send guard and the view synchronized. */
  function setProcessing(active: boolean): void { processing = active; if (!disposed) cb.processing(active) }
  /** Keep indicator updates inside this controller's lifetime. */
  function thinking(active: boolean): void { if (!disposed) cb.thinking(active) }
  /** Reset authentication using the existing invalid-key behavior. */
  function invalidKey(): void {
    message('Invalid OpenAI API key (401). Please enter a valid key.', 'error')
    client = null; assistantId = null; threadId = null
    if (!disposed) cb.promptKey()
  }
  /** Find/create the existing named assistant and then create its conversation. */
  async function connect(key?: string): Promise<void> {
    checkLive()
    if (key !== undefined) apiKey = key.trim()
    if (!apiKey) { cb.promptKey(); return }
    if (!client) {
      try { const created = await options.createClient(apiKey); checkLive(); client = created }
      catch { throw new Error('Could not connect to OpenAI') }
    }
    if (!assistantId) {
      try {
        const list = await client.beta.assistants.list({ order: 'desc', limit: 100 })
        checkLive()
        const existing = list.data.find(isTargetAssistant)
        if (existing) assistantId = existing.id
        else {
          const instructions = await options.loadInstructions(); checkLive()
          const tools = await options.loadTools(); checkLive()
          const assistant = await client.beta.assistants.create({ name: 'Log Analyzer', instructions, model: 'gpt-4o', tools })
          checkLive(); assistantId = assistant.id
        }
      } catch (error) {
        if (!disposed && isUnauthorizedError(error)) { invalidKey(); throw new Error('Invalid API key (401)') }
        throw new Error('Could not initialize assistant')
      }
    }
    if (!threadId) {
      try {
        const thread = await client.beta.threads.create(); checkLive(); threadId = thread.id
        message('Connected to AI assistant! Upload a log file or ask a question about drone flight analysis.', 'system')
      } catch (error) {
        if (!disposed && isUnauthorizedError(error)) { invalidKey(); throw new Error('Invalid API key (401)') }
        throw new Error('Could not create conversation thread')
      }
    }
  }
  /** Require the connected state at each request boundary. */
  function connection(): { sdk: ProviderClient; thread: string; assistant: string } {
    checkLive()
    if (!client || !threadId || !assistantId) throw new Error('Assistant is not connected')
    return { sdk: client, thread: threadId, assistant: assistantId }
  }
  /** Upload exact extracted JSON after starting legacy output.json deletions. */
  async function get(messageType: string): Promise<string | undefined> {
    const json = await options.getMessage(messageType); checkLive()
    if (json === undefined) return undefined
    const { sdk } = connection()
    const file = new File([new Blob([json], { type: 'application/json' })], 'output.json', { type: 'application/json' })
    const files = await sdk.files.list(); checkLive()
    if (!files) throw new Error('error fetching files list')
    for (const previous of files.data) {
      // Legacy deletion is deliberately not awaited before uploading.
      if (previous.filename === 'output.json') void sdk.files.del(previous.id).catch(ignoreDeletionFailure)
    }
    const uploaded = await sdk.files.create({ file, purpose: 'assistants' }); checkLive()
    if (!uploaded) throw new Error('error creating logs file')
    return uploaded.id
  }
  /** Execute tool calls sequentially, preserving failure batches and last-file attachment. */
  async function handleToolCall(event: ProviderEvent): Promise<void> {
    thinking(true)
    const calls = event.data.required_action?.submit_tool_outputs?.tool_calls
    if (!calls || !event.data.id) throw new Error('passed event does not require action')
    const outputs: Array<{ tool_call_id: string; output?: string }> = []
    let failed = false
    for (const call of calls) {
      checkLive()
      const args = asRecord(JSON.parse(call.function.arguments) as unknown)
      const output: { tool_call_id: string; output?: string } = { tool_call_id: call.id }
      if (call.function.name === 'get') {
        if (options.hasLog()) {
          fileId = await get(String(args.message_type))
          if (fileId === undefined) { failed = true; output.output = 'failure, requested message type does not exist in message types' }
        } else { failed = true; output.output = 'failure, user did not upload logs file' }
      } else { failed = true; output.output = 'failure, the function that was called is not supported' }
      outputs.push(output)
    }
    const { sdk, thread, assistant } = connection()
    if (failed) {
      const run = await sdk.beta.threads.runs.submitToolOutputs(thread, event.data.id, { tool_outputs: outputs, stream: true }); acceptStream(run)
      if (!run) throw new Error('error occurred while submitting tool outputs')
      void handleRunStream(run)
      return
    }
    await sdk.beta.threads.runs.cancel(thread, event.data.id); checkLive()
    thinking(true)
    if (fileId == null) throw new Error('Extracted file is missing')
    await sdk.beta.threads.messages.create(thread, {
      role: 'user', content: `The data for the requested message has been extracted. Continue processing using the output.json file with id: ${fileId}`,
      attachments: [{ file_id: fileId, tools: [{ type: 'code_interpreter' }] }],
    }); checkLive()
    const run = await sdk.beta.threads.runs.create(thread, { assistant_id: assistant, stream: true }); acceptStream(run)
    if (!run) throw new Error('Error occurred while starting new run')
    void handleRunStream(run)
  }
  /** Abort a late-arriving stream before rejecting a disposed continuation. */
  function acceptStream(stream: RunStream): void {
    if (disposed) stream?.controller?.abort()
    checkLive()
  }
  /** Report detached tool failures without escaping the mounted request lifetime. */
  function reportToolFailure(error: unknown): void {
    message('Error receiving response from assistant: ' + errorMessage(error), 'error')
    thinking(false)
  }
  /** Consume text, images, and required actions in the provider's event order. */
  async function handleRunStream(stream: RunStream): Promise<void> {
    if (!stream) throw new Error('Run stream is not defined')
    streams.add(stream)
    thinking(true); setProcessing(true)
    try {
      for await (const event of stream) {
        checkLive()
        if (event.event === 'thread.message.delta') {
          for (const item of event.data.delta?.content ?? []) {
            if (item.text) { thinking(false); if (item.text.value !== undefined) message(item.text.value, 'assistant') }
            else if (item.image_file?.file_id) {
              try {
                thinking(false)
                const response = await connection().sdk.files.content(item.image_file.file_id); checkLive()
                const blob = await response.blob(); checkLive(); cb.image(blob)
              } catch (error) { message('Failed to load a graph for visualization. ' + errorMessage(error), 'error') }
            }
          }
        } else if (event.event === 'thread.run.requires_action') {
          // Keep legacy detached tool/run sequencing, including the outer run's
          // processing reset. Consume rejection without an unhandled promise.
          void handleToolCall(event).catch(reportToolFailure)
        }
        else if (event.event === 'thread.run.failed') {
          thinking(false); message('Sorry, there was an error processing your request. Please try again.', 'error')
        }
      }
    } catch (error) { message('Error receiving response from assistant: ' + errorMessage(error), 'error'); thinking(false) }
    finally { streams.delete(stream); setProcessing(false) }
  }
  /** Send one trimmed chat input and consume its response without persisting credentials. */
  async function send(input: string): Promise<void> {
    const text = input.trim()
    if (!text || processing || disposed) return
    message(text, 'user')
    try {
      setProcessing(true); thinking(true)
      await connect()
      const { sdk, thread, assistant } = connection()
      await sdk.beta.threads.messages.create(thread, {
        role: 'user', content: text,
        attachments: fileId && [{ file_id: fileId, tools: [{ type: 'code_interpreter' }] }],
      }); checkLive()
      await handleRunStream(sdk.beta.threads.runs.stream(thread, { assistant_id: assistant }))
    } catch { message('Sorry, there was an error processing your message. Please try again.', 'error') }
    finally { thinking(false); setProcessing(false) }
  }
  /** Delete the selected assistant and reconnect using the existing update sequence. */
  async function updateAssistant(): Promise<void> {
    checkLive()
    if (!client || !assistantId) return
    try {
      await client.beta.assistants.del(assistantId); checkLive()
      assistantId = null; threadId = null
      await connect()
    } catch (error) { message('Failed to update the assistant: ' + errorMessage(error), 'error'); throw error }
  }
  /** Report whether the legacy assistant-update prerequisites are present. */
  function hasConnection(): boolean { return !disposed && client !== null && assistantId !== null }
  /** Abort active response streams and suppress continuations on React unmount. */
  function dispose(): void {
    disposed = true
    for (const stream of streams) stream.controller?.abort()
    streams.clear(); client = null; apiKey = null; assistantId = null; threadId = null; fileId = null
  }
  return { connect, send, updateAssistant, hasConnection, setProcessing, dispose }
}
