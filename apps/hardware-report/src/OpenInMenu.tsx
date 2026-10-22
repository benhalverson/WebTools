import { useEffect, useRef, useState } from 'react'
import { OpenIn } from '@webtools/react-workflows'

/** Own the Open In popover and dispose its pending transports on selection
 * replacement, reset, and unmount. Destination paths remain the shared contract. */
export function OpenInMenu({ file, messages }: { file: File | null; messages: readonly string[] | null }) {
    const [open, setOpen] = useState(false)
    const container = useRef<HTMLSpanElement>(null)
    useEffect(() => {
        /** Dismiss on an outside pointer without intercepting destination clicks. */
        const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false) }
        /** Match the standard popover Escape behavior. */
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('pointerdown', outside)
        document.addEventListener('keydown', escape)
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
    }, [])
    return <span className="open-in" ref={container} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
        <input id="OpenIn" type="button" value="Open In" disabled={!file} aria-expanded={open} onClick={() => setOpen(true)} />
        {file && <div className="open-in-menu" hidden={!open}><OpenIn file={file} messages={messages} /></div>}
    </span>
}
