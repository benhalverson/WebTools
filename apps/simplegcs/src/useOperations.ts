import { useCallback, useEffect, useRef, useState } from 'react'
import type { Connection } from './connection.ts'
import { Operations, emptyOperations } from './operations.ts'
import type { AutoDownloads } from './downloads.ts'
/** Bind one operations controller to the connection lifetime, retaining live preference edits. */
export function useOperations(connection: Connection | null, options: AutoDownloads, report: (text: string, duration?: number) => void) {
    const [state, setState] = useState(emptyOperations), owner = useRef<Operations | null>(null), preferences = useRef(options)
    useEffect(() => { preferences.current = options; owner.current?.configure(options) }, [options])
    useEffect(() => {
        if (!connection) return
        const current = new Operations(connection, preferences.current, setState, report); owner.current = current
        return () => { current.dispose(); if (owner.current === current) owner.current = null }
    }, [connection, report])
    /** Dispatch against the current mounted owner, never a retained previous-vehicle controller. */
    const act = useCallback((action: (operations: Operations) => void) => { if (owner.current) action(owner.current) }, [])
    /** Capture the controller and connection generation before a pointer hold starts. */
    const beginReposition = useCallback(() => owner.current?.beginReposition() ?? (() => {}), [])
    return { state, act, beginReposition }
}
