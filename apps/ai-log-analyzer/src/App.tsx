import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { FileInput } from '@webtools/react-workflows'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { createAnalyzerController, createOpenAIClient } from './provider.ts'
import { createLogService } from './log.ts'

type Sender = 'assistant' | 'user' | 'system' | 'error'
interface Message { content: string; sender: Sender; markdown: boolean; html: boolean }
interface Graph { url: string }
type UpdateState = 'idle' | 'updating' | 'updated' | 'error'

/** Retain the legacy first-delta plain text and subsequent sanitized Markdown behavior. */
function renderMessage(message: Message) {
    const className = `message ${message.sender === 'assistant' ? 'ai-message' : message.sender === 'user' ? 'user-message' : 'system-message'}${message.sender === 'error' ? ' error-message' : ''}${message.markdown ? ' markdown' : ''}`
    return message.html
        ? <div className={className} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(message.content)) }} />
        : <div className={className}>{message.content}</div>
}

/** Animate the existing thinking dots and release the interval on every unmount. */
function Thinking() {
    const [dots, setDots] = useState('...')
    useEffect(/** Start one owned thinking-animation interval. */ () => {
        const timer = window.setInterval(/** Advance the visible thinking dots. */ () => setDots(/** Cycle through the legacy dot sequence. */ value => value === '...' ? '.' : `${value}.`), 500)
        return /** Release the animation interval when the indicator disappears. */ () => window.clearInterval(timer)
    }, [])
    return <div id="thinking-message" className="message thinking-indicator"><div className="dot-pulse">{dots}</div></div>
}

/** Own the migrated controls, response state, credential dialog and image lifetimes. */
export default function App({ assetBase }: { assetBase: string }) {
    const [messages, setMessages] = useState<Message[]>([{ content: 'Hello! Upload a .bin log file to analyze your flight data.', sender: 'assistant', markdown: false, html: false }])
    const [processing, setProcessing] = useState(false)
    const [thinking, setThinking] = useState(false)
    const [promptKey, setPromptKey] = useState(true)
    const [apiKey, setApiKey] = useState('')
    const [draft, setDraft] = useState('')
    const [selectedFile, setSelectedFile] = useState('')
    const [summary, setSummary] = useState(false)
    const [graphs, setGraphs] = useState<Graph[]>([])
    const [fullSize, setFullSize] = useState<string | null>(null)
    const [updateState, setUpdateState] = useState<UpdateState>('idle')
    const chat = useRef<HTMLDivElement>(null)
    const controller = useRef<ReturnType<typeof createAnalyzerController> | null>(null)
    const log = useRef<ReturnType<typeof createLogService> | null>(null)
    const active = useRef(false)
    const updateTimer = useRef<number | undefined>(undefined)

    useEffect(/** Create one provider and parser lifetime for this app asset base. */ () => {
        let alive = true
        const urls = new Set<string>()
        const service = createLogService(assetBase)
        log.current = service
        active.current = true
        /** Apply legacy stream concatenation only when the final chat child is an assistant. */
        function message(content: string, sender: Sender) {
            if (!alive) return
            setMessages(/** Apply a delta without mutating React's previous message state. */ previous => {
                const last = previous.at(-1)
                if (sender === 'assistant' && last?.sender === 'assistant') {
                    const combined = (last.markdown || last.html ? last.content : '') + content
                    return [...previous.slice(0, -1), { ...last, content: combined, html: true }]
                }
                return [...previous, { content, sender, markdown: sender === 'assistant', html: false }]
            })
        }
        const instance = createAnalyzerController({
            createClient: createOpenAIClient,
            /** Preserve the existing fallback text if the instructions asset cannot be fetched. */
            async loadInstructions() {
                try {
                    const response = await fetch(`${assetBase}instructions.txt`)
                    if (!response.ok) throw new Error('Error fetching instructions file')
                    return await response.text()
                } catch {
                    return 'You are a helpful assistant that analyzes drone flight logs and helps troubleshoot issues.'
                }
            },
            /** Load the original tool definitions without transforming provider fields. */
            async loadTools() {
                const response = await fetch(`${assetBase}assistantTools.json`)
                if (!response.ok) throw new Error('error fetching file')
                const tools: unknown = await response.json()
                if (!Array.isArray(tools)) throw new Error('could not load assistant tools for new assistant')
                return tools as unknown[]
            },
            /** Extract the requested DataFlash message through the typed service. */
            getMessage: type => service.getMessage(type),
            /** Report whether a local parser is available to provider tools. */
            hasLog: () => service.hasLog(),
            callbacks: {
            message,
            /** Reflect provider processing while this controller is mounted. */
            processing: value => { if (alive) setProcessing(value) },
            /** Reflect provider thinking while this controller is mounted. */
            thinking: value => { if (alive) setThinking(value) },
            /** Reopen the credential dialog after provider authentication failures. */
            promptKey: () => { if (alive) setPromptKey(true) },
            /** Own each generated graph URL until the controller is disposed. */
            image: blob => {
                if (!alive) return
                const url = URL.createObjectURL(blob)
                urls.add(url)
                if (urls.size === 1) setSummary(false)
                setGraphs(/** Append a graph without replacing prior visualizations. */ previous => [...previous, { url }])
            },
            },
        })
        controller.current = instance
        return /** Dispose requests, local data, status timers and graph object URLs. */ () => {
            alive = false
            active.current = false
            instance.dispose()
            service.dispose()
            controller.current = null
            log.current = null
            window.clearTimeout(updateTimer.current)
            for (const url of urls) URL.revokeObjectURL(url)
        }
    }, [assetBase])

    useEffect(/** Keep newly appended chat content visible. */ () => {
        if (chat.current) chat.current.scrollTop = chat.current.scrollHeight
    }, [messages, thinking])

    /** Report local read/connect failures without exposing credentials. */
    function reportError(error: unknown) {
        if (!active.current) return
        const content = error instanceof Error ? error.message : String(error)
        setMessages(/** Append a local error in the existing system-message style. */ previous => [...previous, { content, sender: 'error', markdown: false, html: false }])
    }

    /** Consume a browser file while preserving the legacy .log selection-only behavior. */
    function upload(file: File | null) {
        if (!file) return
        setSelectedFile(file.name)
        setMessages(/** Announce the selected filename before its asynchronous read. */ previous => [...previous, { content: `Processing ${file.name}...`, sender: 'system', markdown: false, html: false }])
        controller.current?.setProcessing(true)
        const service = log.current
        if (file.name.toLowerCase().endsWith('.bin') && service) {
            void file.arrayBuffer().then(/** Ignore a file read completed after its parser lifetime ended. */ buffer => {
                if (log.current === service) return service.load(buffer)
            }).catch(reportError)
            setMessages(/** Preserve the legacy immediate upload success notification. */ previous => [...previous, { content: 'Log file uploaded successfully. You can now ask questions about the log.', sender: 'system', markdown: false, html: false }])
        }
        setSummary(true)
        controller.current?.setProcessing(false)
    }

    /** Clear the draft only for a nonempty message accepted by the current UI state. */
    function send() {
        const message = draft.trim()
        if (!message || processing) return
        setDraft('')
        void controller.current?.send(message)
    }

    /** Keep credentials in component/controller memory and dismiss the current prompt. */
    function connect(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const key = apiKey.trim()
        if (!key) return
        setApiKey('')
        setPromptKey(false)
        void controller.current?.connect(key).catch(reportError)
    }

    /** Discard an unsent credential when removing its dialog, matching legacy modal removal. */
    function dismissKeyPrompt() {
        setApiKey('')
        setPromptKey(false)
    }

    /** Render the original update status cycle, cleaning up its delayed reset on unmount. */
    async function updateAssistant() {
        const instance = controller.current
        if (!instance?.hasConnection() || updateState !== 'idle') return
        setUpdateState('updating')
        try {
            await instance.updateAssistant()
            if (controller.current === instance) setUpdateState('updated')
        } catch {
            if (controller.current === instance) setUpdateState('error')
        }
        if (controller.current === instance) updateTimer.current = window.setTimeout(/** Restore the default update button after its status delay. */ () => setUpdateState('idle'), 3000)
    }

    return <div className="container">
        <header className="header"><h1>AI Log Analyzer</h1><button id="updateAssistantBtn" className={`update-btn${updateState === 'idle' ? '' : ` ${updateState}`}`} disabled={updateState !== 'idle'} onClick={/** Start the existing assistant replacement flow. */ () => void updateAssistant()}>{updateState === 'updating' ? 'Updating...' : updateState === 'updated' ? 'Updated' : updateState === 'error' ? 'Update Failed' : 'Update Assistant'}</button></header>
        <main className="main">
            <section className="chat-section">
                <div className="chat-messages" id="chatMessages" ref={chat}>{messages.map(/** Preserve each chat row's identity while streaming updates its content. */ (message, index) => <MessageView key={index} message={message} />)}{thinking && <Thinking />}</div>
                <div className="chat-input-area"><FileInput id="fileInput" accept=".bin,.log" onFile={upload} /><label htmlFor="fileInput" className={`file-upload-label${selectedFile ? ' file-selected' : ''}${processing ? ' processing' : ''}`}>{selectedFile ? `Selected: ${selectedFile}` : 'Click to upload .bin/.log files for analysis'}</label><div className="input-group"><input id="messageInput" value={draft} disabled={processing} placeholder={processing ? 'Assistant is working...' : 'Ask about your flight data...'} onChange={/** Track the unsent chat input. */ event => setDraft(event.currentTarget.value)} onKeyDown={/** Preserve Enter-to-send and Shift-Enter behavior. */ event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} /><button id="sendBtn" disabled={processing} onClick={send}>Send</button></div></div>
            </section>
            <section className="viz-section"><h3>Visualizations</h3><div className="viz-placeholder" id="vizArea">
                {!summary && graphs.length === 0 && <p>Charts and graphs will appear here when analyzing log data.</p>}
                {summary && <><div className="viz-section" id="summary-section"><h3>Summary</h3><p>Log File Ready</p></div><div className="viz-section" id="findings-section"><h3>Findings</h3><ul><div>Ask questions in the chat to analyze the log and generate visualizations.</div></ul></div></>}
                {graphs.map(/** Render each retained provider graph. */ graph => <div className="viz-section graph-container" key={graph.url}><h3 /><div className="graph-image-container"><img src={graph.url} className="ai-generated-image" alt="AI-generated flight analysis" onClick={/** Open the selected image at full size. */ () => setFullSize(graph.url)} /></div></div>)}
            </div></section>
        </main>
        {promptKey && <div className="modal" role="dialog" aria-modal="true" aria-labelledby="key-title"><div className="modal-content"><span className="close-modal" onClick={dismissKeyPrompt}>&times;</span><h2 id="key-title">OpenAI API Key Required</h2><div className="modal-body"><p>Please enter your OpenAI API key to use the Log Analyzer:</p><form id="apiKeyForm" onSubmit={connect}><input type="password" id="apiKeyInput" placeholder="sk-..." required value={apiKey} onChange={/** Keep the typed key only in component memory. */ event => setApiKey(event.currentTarget.value)} /><button type="submit" className="submit-btn">Connect</button></form></div></div></div>}
        {fullSize && <div className="full-size-image-view" onClick={/** Dismiss the full-size image overlay. */ () => setFullSize(null)}><img src={fullSize} className="ai-generated-image" alt="AI-generated flight analysis" /></div>}
    </div>
}

/** Keep individual chat rows stable while the final row receives streaming deltas. */
function MessageView({ message }: { message: Message }) { return renderMessage(message) }
