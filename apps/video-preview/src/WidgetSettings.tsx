import { useEffect, useRef, useState } from 'react'
import { type WidgetHost } from '@webtools/widget-runtime'
import { serializeVideoWidget } from './format'
import { download } from './download'

/** Mount the live widget configuration in a React-owned, keyboard-accessible panel. */
export function WidgetSettings({ widget, close, edit, failure }: {
    widget: WidgetHost; close(): void; edit(): void; failure(error: unknown): void
}) {
    const container = useRef<HTMLDivElement>(null)
    const [geometry, setGeometry] = useState(() => widget.snapshot())
    useEffect(() => {
        /** Keep keyboard geometry aligned with selection and real pointer changes. */
        function synchronize(): void { setGeometry(widget.snapshot()) }
        synchronize()
        widget.owner.element.addEventListener('change', synchronize)
        const form = widget.formElement
        const runtimeStyle = form.style.cssText
        // The React panel owns scrolling while this form is outside its widget overlay.
        form.style.cssText = ''
        container.current?.append(form)
        form.hidden = false
        return () => { widget.owner.element.removeEventListener('change', synchronize); form.hidden = true; form.style.cssText = runtimeStyle; if (widget.element.isConnected) widget.content.append(form) }
    }, [widget])

    /** Match legacy dirty-widget confirmation before releasing nested resources. */
    function remove(): void {
        if (widget.getChanged() && !window.confirm('This widget has not been downloaded!\n Click OK to delete anyway.')) return
        close()
        widget.owner.remove(widget)
    }

    /** Apply keyboard geometry through the same GridStack engine as pointer edits. */
    function position(key: 'x' | 'y' | 'w' | 'h', value: string): void {
        const number = Number(value)
        if (!Number.isInteger(number) || number < (key === 'w' || key === 'h' ? 1 : 0)) return
        widget.owner.grid.update(widget.element, { [key]: number })
        setGeometry(widget.snapshot())
    }

    /** Copy into the widget's current grid, including all nested layouts and source. */
    function copy(): void {
        try { widget.owner.add(widget.snapshot()) }
        catch (error) { failure(error) }
    }

    const editable = widget.getText() !== undefined
    return <section className="playback-panel" aria-label="Widget settings">
        <header><strong>{String(widget.getAbout().name)}</strong><button onClick={close} aria-label="Close widget settings">×</button></header>
        {editable && <button onClick={edit}>Edit source and form</button>}
        {(editable || widget.model.type === 'WidgetSubGrid') && <button onClick={() => { download(serializeVideoWidget(widget.snapshot()), 'VideoOverlay_Widget.json'); widget.saved(); close() }}>Save widget</button>}
        {widget.model.type !== 'WidgetMenu' && <><button onClick={copy}>Copy widget</button><button onClick={remove}>Delete widget</button></>}
        <fieldset><legend>Position and size</legend>{(['x', 'y', 'w', 'h'] as const).map(key => <label key={key}>{({ x: 'Column', y: 'Row', w: 'Width', h: 'Height' })[key]}<input type="number" min={key === 'w' || key === 'h' ? 1 : 0} value={geometry[key] ?? (key === 'w' || key === 'h' ? 1 : 0)} onChange={event => position(key, event.target.value)} /></label>)}</fieldset>
        <div ref={container} />
    </section>
}
