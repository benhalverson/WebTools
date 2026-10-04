import { useCallback, useEffect, useRef, useState } from 'react'

/** Compatibility with loading_call: schedules two frames, resolves immediately,
 * and leaves the overlay visible after rejection. Fixing that contract is a
 * separate reviewed issue. Synchronous throws and rejected operations reach
 * onError while mounted; that callback must handle the error without throwing.
 * Unmount cancels queued frames and suppresses stale state/error callbacks, but
 * cannot cancel an operation that has already started. Concurrent calls are not
 * reference-counted: any successful operation can hide the shared overlay.
 * @returns Overlay visibility and a run function whose promise acknowledges
 * scheduling, not operation completion.
 */
export function useLoading(onError: (error: unknown) => void) {
    const [visible, setVisible] = useState(false)
    const lifetime = useRef({ alive: false })
    const frames = useRef(new Set<number>())
    useEffect(() => {
        const current = { alive: true }
        lifetime.current = current
        return () => {
            current.alive = false
            for (const frame of frames.current) cancelAnimationFrame(frame)
            frames.current.clear()
        }
    }, [])
    /** Show the overlay and queue operation after two animation frames.
     * Calls outside the active effect lifetime resolve without scheduling work. */
    const run = useCallback(async (operation: () => void | Promise<void>): Promise<void> => {
        const current = lifetime.current
        if (!current.alive) return
        setVisible(true)
        /** Track one frame for cancellation and invoke its callback only while
         * this effect lifetime remains active. */
        const schedule = (callback: () => void) => {
            const frame = requestAnimationFrame(() => { frames.current.delete(frame); if (current.alive) callback() })
            frames.current.add(frame)
        }
        schedule(() => schedule(() => {
            // Calling operation in the promise chain also captures synchronous errors.
            void Promise.resolve().then(operation).then(() => {
                if (current.alive) setVisible(false)
            }, error => { if (current.alive) onError(error) })
        }))
    }, [onError])
    return { visible, run }
}
/** Render the legacy full-viewport loading layer, keeping it mounted while
 * hidden. Visibility is caller-owned; this component starts no asynchronous work. */
export function LoadingOverlay({ visible }: { visible: boolean }) {
    return <div id="loading" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.7,
        backgroundColor: '#fff', zIndex: 99, visibility: visible ? 'visible' : 'hidden' }}>
        <h1 style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>Loading</h1>
    </div>
}
