import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import type { Connection } from './connection.ts'
interface Entry { time: Date; severity: number; text: string }
const tags = ['EMERG', 'ALERT', 'CRIT', 'ERR', 'WARN', 'NOTICE', 'INFO', 'DEBUG']
/** Retain the legacy last-500 status log across reconnects, releasing its packet subscription on unmount. */
export function Messages({ connection, onOpen, error }: { connection: Connection | null; onOpen?: () => void; error: { text: string } | null }) {
    const [entries, setEntries] = useState<Entry[]>([]), [open, setOpen] = useState(false)
    const box = useRef<HTMLPreElement>(null)
    useEffect(() => connection?.subscribe(event => {
        if (event.type !== 'message' || event.message._name !== 'STATUSTEXT') return
        const message = event.message
        const text = (Array.isArray(message.text) ? String.fromCharCode(...message.text) : String(message.text || '')).replace(/\0+$/, '')
        setEntries(previous => [...previous, { time: new Date(), severity: message.severity ?? -1, text }].slice(-500))
    }), [connection])
    useEffect(() => { if (error) setEntries(previous => [...previous, { time: new Date(), severity: 3, text: error.text }].slice(-500)) }, [error])
    useEffect(() => { if (open && box.current) box.current.scrollTop = box.current.scrollHeight }, [entries, open])
    return <><button onClick={() => { setOpen(true); onOpen?.() }}>Messages</button>{createPortal(<section className="editor" hidden={!open} aria-label="Messages (STATUSTEXT)"><h2>Messages (STATUSTEXT)</h2><pre className="messages-log" ref={box}>{entries.map(entry => `${entry.time.toTimeString().slice(0, 8)}  [${tags[entry.severity] ?? 'INFO'}] ${entry.text}`).join('\n')}</pre><p>Newest at the bottom. Keeps last 500 messages.</p><button onClick={() => setOpen(false)}>Close</button></section>, document.body)}</>
}
