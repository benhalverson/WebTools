import { useEffect, useRef, useState } from 'react'
import type { Comparison } from './comparison.ts'
import type { FilterRequest, FilterResponse } from './filter.worker.ts'

/** Own filter computation independently of the retained decoded recording. */
export function useComparison() {
    const worker = useRef<Worker | null>(null)
    const generation = useRef(0)
    const [result, setResult] = useState<Comparison | null>(null)
    const [busy, setBusy] = useState(false), [error, setError] = useState('')
    /** Terminate the worker and make every queued message stale. */
    function cancel() { generation.current++; worker.current?.terminate(); worker.current = null; setBusy(false) }
    /** Clear calculated plots alongside the current file lifetime. */
    function reset() { cancel(); setResult(null); setError('') }
    useEffect(() => () => { generation.current++; worker.current?.terminate(); worker.current = null }, [])
    /** Replace an in-flight filter calculation with the current controlled settings. */
    function run(request: FilterRequest) {
        reset()
        const id = generation.current
        try {
            const current = new Worker(new URL('./filter.worker.ts', import.meta.url), { type: 'module' })
            worker.current = current; setBusy(true)
            current.onmessage = (event: MessageEvent<FilterResponse>) => {
                if (generation.current !== id) return
                cancel()
                if ('error' in event.data) setError(event.data.error)
                else setResult(event.data.result)
            }
            current.onerror = event => { if (generation.current === id) { cancel(); setError(event.message || 'Filter Worker failed') } }
            current.postMessage(request)
        } catch (cause) { cancel(); setError(cause instanceof Error ? cause.message : String(cause)) }
    }
    return { result, busy, error, run, cancel, reset }
}
