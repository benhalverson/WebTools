import type { PythonInputs } from './dataset.ts'
import type { Mode } from './model.ts'
import { identificationResult, type IdentificationResult, type RuntimeEvent, type RuntimeRequest } from './protocol.ts'
export interface RuntimeClient {
    ready: Promise<void>
    run(mode: Mode, inputs: PythonInputs): Promise<IdentificationResult>
    dispose(): void
}
/** Own an isolated browsing context so retries/unmount release the complete Python heap and its DOM.
 * Only messages from this frame and origin are accepted. Each lifetime allows one operation at a time.
 */
export function createRuntime(base: string, output: (text: string) => void): RuntimeClient {
    const frame = document.createElement('iframe'); frame.hidden = true; frame.title = 'SysID Python runtime'
    let disposed = false, pending: { resolve: (value: IdentificationResult) => void; reject: (error: Error) => void } | undefined
    let initialized = false
    let readyResolve: () => void, readyReject: (error: Error) => void
    const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject })
    /** Report startup failures and release the outstanding operation exactly once. */
    const fail = (message: string): void => { const error = new Error(message); if (!initialized) readyReject(error); pending?.reject(error); pending = undefined }
    const timer = window.setTimeout(() => fail('Python initialization timed out. Retry initialization.'), 120000)
    /** Route only messages from the owned frame, validating result arrays at the boundary. */
    const receive = (event: MessageEvent<RuntimeEvent>): void => {
        if (disposed || event.source !== frame.contentWindow || event.origin !== location.origin) return
        if (event.data.kind === 'output') output(event.data.text)
        if (event.data.kind === 'ready') { initialized = true; clearTimeout(timer); readyResolve() }
        if (event.data.kind === 'error') { clearTimeout(timer); fail(event.data.message) }
        if (event.data.kind === 'result') {
            try { pending?.resolve(identificationResult(event.data.result)); pending = undefined } catch (error) { fail(String(error)) }
        }
    }
    /** Post a request after the frame has loaded its module entry. */
    const post = (request: RuntimeRequest): void => { frame.contentWindow?.postMessage(request, location.origin) }
    frame.onload = () => { if (!disposed) post({ kind: 'initialize' }) }
    frame.onerror = () => fail('Python runtime page could not load')
    window.addEventListener('message', receive)
    frame.src = base + 'runtime.html'; document.body.appendChild(frame)
    return {
        ready,
        /** Run one identification against the initialized Python session. */
        async run(mode, inputs) { await ready; if (disposed) throw new Error('Runtime disposed'); if (pending) throw new Error('Identification already running'); return new Promise((resolve, reject) => { pending = { resolve, reject }; post({ kind: 'run', mode, inputs }) }) },
        /** Remove listeners, frame and pending work; repeated disposal is harmless. */
        dispose() { if (disposed) return; disposed = true; clearTimeout(timer); fail('Runtime disposed'); window.removeEventListener('message', receive); frame.onload = null; frame.onerror = null; frame.remove() },
    }
}
