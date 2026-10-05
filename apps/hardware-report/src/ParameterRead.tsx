import { useCallback, useEffect, useRef } from 'react'
import { LoadingOverlay, useLoading } from '@webtools/react-workflows'

interface ParameterReadProps {
    readonly file: File
    readonly onRead: (file: File) => Promise<void>
    readonly onError: (cause: unknown) => void
}

/** Owns one selection's two-frame loading schedule and overlay. A rejected read
 * deliberately retains the legacy overlay; resetting or selecting another file
 * unmounts this resource, cancelling frames and suppressing late errors. */
export function ParameterRead({ file, onRead, onError }: ParameterReadProps) {
    const callbacks = useRef({ onRead, onError })
    callbacks.current = { onRead, onError }
    /** Forwards failures through current callbacks without rescheduling the read. */
    const reportError = useCallback((cause: unknown) => callbacks.current.onError(cause), [])
    const { visible, run } = useLoading(reportError)
    useEffect(() => {
        void run(() => callbacks.current.onRead(file))
    }, [file, run])
    return <LoadingOverlay visible={visible} />
}
