import { useCallback, useEffect, useRef, useState } from 'react'
import { useLoading, useOpenInReceiver } from '@webtools/react-workflows'
import { matrixApi, parserConstructor } from './runtime.ts'
import { readLog } from './log.ts'
import { calculateFit } from './fit.ts'
import { calculatedSelection, type Selection } from './selection.ts'
import type { FitOptions, FitOutput, LogData } from './types.ts'
const initialOptions: FitOptions = { start: 0, end: 0, attitude: -1, orientations: [0, 0, 0] }
/** Own file reads, pending calculations, selection and errors for one React mount.
 * Generation checks suppress replaced inputs and interrupted work; cleanup aborts
 * the FileReader and invalidates imports. Parser and numerical arrays are session-local.
 */
export function useSession(base: string) {
    const [sessionId, setSessionId] = useState(0)
    const [calculationId, setCalculationId] = useState(0)
    const [file, setFile] = useState<File | null>(null)
    const [log, setLog] = useState<LogData | null>(null)
    const [result, setResult] = useState<FitOutput | null>(null)
    const [options, setOptions] = useState(initialOptions)
    const [selection, setSelection] = useState<Selection>({ visible: [], priority: [] })
    const [error, setError] = useState<string | null>(null)
    const [dirty, setDirty] = useState(false)
    const generation = useRef(0)
    const reader = useRef<FileReader | null>(null)
    const mounted = useRef(false)
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
            generation.current++
            reader.current?.abort()
            reader.current = null
        }
    }, [])
    /** Convert browser, parser and matrix errors to visible application feedback. */
    const report = useCallback((error: unknown): void => {
        setError(error instanceof Error ? error.message : String(error))
    }, [])
    const loading = useLoading(report)
    /** Commit only a current calculation snapshot, preserving recalculation visibility semantics. */
    function calculate(data = log, next = options, previous = selection): void {
        if (!data) return
        const current = generation.current
        void loading.run(() => {
            if (!mounted.current || generation.current !== current) return
            const output = calculateFit(data, next, matrixApi())
            setResult(output)
            setCalculationId((value) => value + 1)
            setSelection(calculatedSelection(output.compasses, previous))
            setDirty(false)
            setError(null)
            for (const warning of output.warnings) window.alert(warning)
        })
    }
    /** Parse local bytes after the boundary import; never commit stale file content. */
    async function loadBytes(buffer: ArrayBuffer, current: number): Promise<void> {
        let Parser
        try {
            Parser = await parserConstructor(base)
        } catch (error) {
            if (mounted.current && generation.current === current) throw error
            return
        }
        if (!mounted.current || generation.current !== current) return
        const parser = new Parser()
        parser.processData(buffer, [])
        const data = readLog(parser, matrixApi())
        const next = { ...initialOptions, start: data.start, end: data.end, attitude: data.attitude }
        const output = calculateFit(data, next, matrixApi())
        if (!mounted.current || generation.current !== current) return

        setLog(data)
        setOptions(next)
        setResult(output)
        setSelection(calculatedSelection(output.compasses))
        setDirty(false)
        for (const warning of [...data.warnings, ...output.warnings]) window.alert(warning)
    }
    /** Invalidate the preceding generation before exposing a replacement file. */
    function begin(next: File | null): number {
        generation.current++
        setSessionId(generation.current)
        reader.current?.abort()
        reader.current = null
        setFile(next)
        setLog(null)
        setResult(null)
        setError(null)
        setDirty(false)
        setOptions(initialOptions)
        setSelection({ visible: [], priority: [] })
        return generation.current
    }
    /** Use an abortable FileReader; clearing or reselecting a file resets its entire session. */
    function loadFile(next: File | null): void {
        const current = begin(next)
        if (!next) return
        const input = new FileReader()
        reader.current = input
        /** Release browser event closures and the retained file buffer on every terminal event. */
        function release(): void {
            input.onload = null
            input.onerror = null
            input.onabort = null
            if (reader.current === input) reader.current = null
        }
        input.onabort = release
        input.onload = () => {
            release()
            if (generation.current !== current || !mounted.current || !(input.result instanceof ArrayBuffer))
                return
            const buffer = input.result
            void loading.run(() => loadBytes(buffer, current))
        }
        input.onerror = () => {
            release()
            if (generation.current === current && mounted.current)
                report(input.error ?? new Error('Unable to read log'))
        }
        input.readAsArrayBuffer(next)
    }
    /** Accept the legacy external ArrayBuffer wire format using the same parse ownership. */
    function loadBuffer(buffer: ArrayBuffer): void {
        const current = begin(null)
        void loading.run(() => loadBytes(buffer, current))
    }
    useOpenInReceiver(loadFile, loadBuffer, undefined, report)
    /** Selection edits mark results stale; orientation edits also schedule the legacy automatic refit. */
    function changeOptions(next: FitOptions, immediate = false): void {
        setOptions(next)
        setDirty(true)
        if (immediate) calculate(log, next)
    }
    return {
        sessionId,
        calculationId,
        file,
        log,
        result,
        options,
        selection,
        setSelection,
        error,
        report,
        dirty,
        loading,
        loadFile,
        calculate,
        changeOptions,
    }
}
