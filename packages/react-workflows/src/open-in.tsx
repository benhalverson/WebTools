import { useEffect, useRef } from 'react'

export interface OpenInDestination {
    name: string
    path: string
    hookLoad: boolean
    /** Test message availability; null means the log types are not yet known. */
    enabled: (messages: readonly string[] | null) => boolean
}
/** Build a destination predicate accepting unknown message types (null) or
 * any intersection with the required types; an empty known list matches none. */
const includes = (types: readonly string[]) => (messages: readonly string[] | null) => messages === null || types.some(type => messages.includes(type))
export const openInDestinations: readonly OpenInDestination[] = [
    { name: 'UAV Log Viewer', path: 'https://plotbeta.ardupilot.org/#', hookLoad: false, enabled: () => true },
    { name: 'Hardware Report', path: '../HardwareReport', hookLoad: true, enabled: includes(['PARM']) },
    { name: 'Filter Review', path: '../FilterReview', hookLoad: true, enabled: includes(['GYR', 'ISBD']) },
    { name: 'MAGFit', path: '../MAGFit', hookLoad: true, enabled: includes(['MAG']) },
    { name: 'PID Review', path: '../PIDReview', hookLoad: true, enabled: includes(['RATE', 'PIDR', 'PIDP', 'PIDY', 'PIQR', 'PIQP', 'PIQY', 'PIDS', 'PIDA']) },
]
/** Exclude the current tool using the legacy final-path-segment substring rule.
 * A trailing slash is accepted; an empty/root pathname excludes all destinations
 * because every path includes the empty string. Hosting prefixes are retained
 * by the relative destination paths rather than rewritten here. */
export function availableDestinations(pathname: string): readonly OpenInDestination[] {
    const segments = pathname.split('/')
    const ownWindow = segments.pop() || segments.pop() || ''
    return openInDestinations.filter(destination => !destination.path.includes(ownWindow))
}

/** Exact legacy transport: same-origin File on every load until disposed;
 * external ArrayBuffer after 2000ms. Wildcard targets and unauthenticated
 * receiving remain unchanged until the separately reviewed security change.
 * @param host Window that opens the destination and owns the external delay.
 * @param onSettled Optional non-throwing ownership callback, called once on
 * external completion/failure, popup blocking, or cancellation (possibly before
 * this function returns). Same-origin listeners remain active until disposed.
 * @returns An idempotent disposer. Settlement releases owned payload, reader,
 * target, timer, and listeners even if callers retain the disposer. It does not
 * close windows or undo delivery. Synchronous browser errors still propagate.
 */
export function transferFile(file: File, destination: OpenInDestination, host: Window = window,
    onSettled?: () => void): () => void {
    let payload: File | ArrayBuffer | null = file
    let target: Window | null = null
    let reader: FileReader | null = null
    let timer: number | undefined
    let listening = false
    let settled = false
    let notify = onSettled
    /** Release every resource owned by this operation before notifying its owner. */
    const dispose = () => {
        if (settled) return
        settled = true
        if (timer !== undefined) host.clearTimeout(timer)
        timer = undefined
        if (reader) {
            reader.onload = reader.onerror = reader.onabort = null
            if (reader.readyState === FileReader.LOADING) reader.abort()
            reader = null
        }
        if (listening) target?.removeEventListener('load', load)
        listening = false
        target = null
        payload = null
        const callback = notify
        notify = undefined
        callback?.()
    }
    /** Preserve repeated same-origin load delivery until explicitly disposed. */
    const load = () => { target?.postMessage({ type: 'file', data: payload }, '*') }
    try {
        if (destination.hookLoad) {
            target = host.open(destination.path)
            if (target) { listening = true; target.addEventListener('load', load) }
            else dispose()
        } else {
            reader = new FileReader()
            /** Move the completed result into the timer's ownership and release
             * the reader immediately; blocked/error paths settle without delivery. */
            reader.onload = () => {
                if (!reader || settled) return
                payload = reader.result as ArrayBuffer
                reader.onload = reader.onerror = reader.onabort = null
                reader = null
                try {
                    target = host.open(destination.path)
                    if (!target) { dispose(); return }
                    /** Release the payload and recipient even if posting throws. */
                    timer = host.setTimeout(() => {
                        try { target?.postMessage({ type: 'arrayBuffer', data: payload }, '*') }
                        finally { dispose() }
                    }, 2000)
                } catch (error) { dispose(); throw error }
            }
            reader.onerror = reader.onabort = dispose
            reader.readAsArrayBuffer(file)
            // FileReader now owns the read; no second File reference is needed.
            payload = null
        }
    } catch (error) { dispose(); throw error }
    return dispose
}

/** Render legacy destination buttons for the current tool and selected file.
 * Unknown message types leave destinations enabled; a missing file disables
 * every button. Each click starts an independent transfer whose pending work
 * is disposed on unmount. Finished external transfers leave the ownership set
 * immediately; same-origin repeat-load listeners remain until unmount. Changing
 * props does not cancel previous transfers. */
export function OpenIn({ file, messages = null, pathname = window.location.pathname }: {
    file: File | null
    messages?: readonly string[] | null
    pathname?: string
}) {
    const disposers = useRef(new Set<() => void>())
    useEffect(() => () => {
        for (const dispose of disposers.current) dispose()
        disposers.current.clear()
    }, [])
    /** Register before starting so synchronous blocking/failure cannot leave a
     * completed disposer in the set; each recipient owns an independent entry. */
    const startTransfer = (destination: OpenInDestination) => {
        if (!file) return
        let cancel: (() => void) | undefined
        /** Cancel this recipient without affecting any other pending transfer. */
        const dispose = () => cancel?.()
        disposers.current.add(dispose)
        try {
            cancel = transferFile(file, destination, window, () => { disposers.current.delete(dispose) })
        } catch (error) { disposers.current.delete(dispose); throw error }
    }
    return <div>{availableDestinations(pathname).map(destination => <span key={destination.name}>
        <input type="button" value={destination.name} style={{ margin: '3px 0' }} disabled={!file || !destination.enabled(messages)}
            onClick={() => startTransfer(destination)} /><br />
    </span>)}</div>
}

/** Bridge both legacy wire formats into React-owned state. Consumers receiving a
 * File may set their input with DataTransfer if their unconverted code needs it.
 * Readiness is awaited separately for each message, as in setup_open_in;
 * concurrent messages are not serialized. Payloads are structurally narrowed
 * but origin and source are not authenticated. Delivery uses the latest
 * callbacks, and unmount removes the listener and suppresses pending delivery.
 * @param ready Optional prerequisite; rejection prevents that message delivery.
 * @param onError Receives readiness or synchronous delivery-callback errors
 * while mounted. Without it, these errors are consumed; it must not throw.
 */
export function useOpenInReceiver(onFile: (file: File) => void, onBuffer: (buffer: ArrayBuffer) => void,
    ready?: () => Promise<unknown>, onError?: (error: unknown) => void) {
    const callbacks = useRef({ onFile, onBuffer, ready, onError })
    callbacks.current = { onFile, onBuffer, ready, onError }
    useEffect(() => {
        let disposed = false
        /** Await readiness, then deliver a supported wire payload unless this
         * effect was disposed; malformed messages are ignored after readiness. */
        const receive = (event: MessageEvent<unknown>) => {
            void (async () => {
                await callbacks.current.ready?.()
                if (disposed) return
                const message = event.data
                if (typeof message !== 'object' || message === null || !('type' in message) || !('data' in message)) return
                if (message.type === 'file' && message.data instanceof File) callbacks.current.onFile(message.data)
                else if (message.type === 'arrayBuffer' && message.data instanceof ArrayBuffer) callbacks.current.onBuffer(message.data)
            })().catch(error => { if (!disposed) callbacks.current.onError?.(error) })
        }
        window.addEventListener('message', receive)
        return () => { disposed = true; window.removeEventListener('message', receive) }
    }, [])
}
