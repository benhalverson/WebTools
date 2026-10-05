import { useEffect, useRef, useState } from 'react'
import type { Source } from './ingestion.ts'
import type { Request, Response } from './jobs.ts'
import type { Settings } from './spectrum.ts'

export type Result = Extract<Response, { kind: 'result' }>

/** Own one file-read/Worker generation. Replacing a job terminates computation,
 * invalidates late file reads, and prevents stale results or errors from landing. */
export function useReview() {
    const generation = useRef(0)
    const worker = useRef<Worker | null>(null)
    const [result, setResult] = useState<Result | null>(null)
    const [progress, setProgress] = useState<number | null>(null)
    const [error, setError] = useState('')
    /** Retire every pending callback before terminating the active Worker. */
    function cancel() {
        generation.current++
        worker.current?.terminate()
        worker.current = null
        setProgress(null)
    }
    useEffect(() => () => { generation.current++; worker.current?.terminate() }, [])
    /** Read local bytes then transfer ownership to a fresh dedicated Worker. */
    async function run(file: File, source: Source, instance: number, settings: Settings) {
        cancel()
        const id = generation.current
        setResult(null); setError(''); setProgress(0)
        try {
            const bytes = await file.arrayBuffer()
            if (id !== generation.current) return
            const current = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' })
            worker.current = current
            /** Release the completed Worker before committing its UI result. */
            const finish = () => { current.terminate(); worker.current = null; setProgress(null) }
            current.onmessage = (event: MessageEvent<Response>) => {
                if (id !== generation.current) return
                if (event.data.kind === 'progress') setProgress(event.data.value)
                else if (event.data.kind === 'error') { finish(); setError(event.data.message) }
                else { finish(); setResult(event.data) }
            }
            current.onerror = event => { if (id === generation.current) { finish(); setError(event.message || 'Spectrum Worker failed') } }
            const request: Request = { bytes, source, instance, settings, parserUrl: new URL(import.meta.env.BASE_URL + 'dataflash/index.js', window.location.origin).href }
            current.postMessage(request, [bytes])
        } catch (cause) {
            if (id === generation.current) { cancel(); setError(cause instanceof Error ? cause.message : String(cause)) }
        }
    }
    /** Reset data and feedback as well as any pending computation. */
    function reset() { cancel(); setResult(null); setError('') }
    return { result, progress, error, run, cancel, reset, setError }
}
