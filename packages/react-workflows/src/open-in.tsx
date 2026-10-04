import { useEffect, useRef } from 'react'

export interface OpenInDestination {
    name: string
    path: string
    hookLoad: boolean
    enabled: (messages: readonly string[] | null) => boolean
}
const includes = (types: readonly string[]) => (messages: readonly string[] | null) => messages === null || types.some(type => messages.includes(type))
export const openInDestinations: readonly OpenInDestination[] = [
    { name: 'UAV Log Viewer', path: 'https://plotbeta.ardupilot.org/#', hookLoad: false, enabled: () => true },
    { name: 'Hardware Report', path: '../HardwareReport', hookLoad: true, enabled: includes(['PARM']) },
    { name: 'Filter Review', path: '../FilterReview', hookLoad: true, enabled: includes(['GYR', 'ISBD']) },
    { name: 'MAGFit', path: '../MAGFit', hookLoad: true, enabled: includes(['MAG']) },
    { name: 'PID Review', path: '../PIDReview', hookLoad: true, enabled: includes(['RATE', 'PIDR', 'PIDP', 'PIDY', 'PIQR', 'PIQP', 'PIQY', 'PIDS', 'PIDA']) },
]
export function availableDestinations(pathname: string): readonly OpenInDestination[] {
    const segments = pathname.split('/')
    const ownWindow = segments.pop() || segments.pop() || ''
    return openInDestinations.filter(destination => !destination.path.includes(ownWindow))
}

/** Exact legacy transport: same-origin File on load; external ArrayBuffer after
 * 2000ms. Wildcard targets and unauthenticated receiving are intentionally kept
 * until the separately reviewed security change. Never use for credentials.
 */
export function transferFile(file: File, destination: OpenInDestination, host: Window = window): () => void {
    let dispose = () => {}
    if (destination.hookLoad) {
        const target = host.open(destination.path)
        if (!target) return dispose
        const load = () => target.postMessage({ type: 'file', data: file }, '*')
        target.addEventListener('load', load)
        dispose = () => target.removeEventListener('load', load)
    } else {
        const reader = new FileReader()
        let timer: number | undefined
        reader.onload = () => {
            const data = reader.result
            const target = host.open(destination.path)
            if (target) timer = host.setTimeout(() => target.postMessage({ type: 'arrayBuffer', data }, '*'), 2000)
        }
        reader.readAsArrayBuffer(file)
        dispose = () => {
            reader.onload = null
            if (reader.readyState === FileReader.LOADING) reader.abort()
            if (timer !== undefined) host.clearTimeout(timer)
        }
    }
    return dispose
}

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
    return <div>{availableDestinations(pathname).map(destination => <span key={destination.name}>
        <input type="button" value={destination.name} style={{ margin: '3px 0' }} disabled={!file || !destination.enabled(messages)}
            onClick={() => { if (file) disposers.current.add(transferFile(file, destination)) }} /><br />
    </span>)}</div>
}

/** Bridge both legacy wire formats into React-owned state. Consumers receiving a
 * File may set their input with DataTransfer if their unconverted code needs it.
 * Readiness is awaited before delivery, as in setup_open_in.
 */
export function useOpenInReceiver(onFile: (file: File) => void, onBuffer: (buffer: ArrayBuffer) => void,
    ready?: () => Promise<unknown>, onError?: (error: unknown) => void) {
    const callbacks = useRef({ onFile, onBuffer, ready, onError })
    callbacks.current = { onFile, onBuffer, ready, onError }
    useEffect(() => {
        let disposed = false
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
