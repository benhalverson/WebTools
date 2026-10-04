import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { GridStack } from 'gridstack'
import { MAVLink20Processor, mavlink20 } from '@webtools/mavlink/browser'
import { WidgetRuntime, parseLayout, registerWidgetFields, serializeLayout, messageFields } from '../../src/index.js'
import type { FormFactory, FormComponents, Layout } from '../../src/index.js'
import { runLifecycleChecks } from './lifecycle.js'
import defaultHtml from '../../assets/CustomHTML.html?raw'

declare global {
    interface Window {
        GridStack: typeof GridStack
        Formio: FormFactory & FormComponents
        runtime?: WidgetRuntime
        mountLayout: (layout: Layout) => void
        serialized: () => string
        publishFixture: () => void
        runtimeErrors: string[]
        runLifecycleChecks: typeof runLifecycleChecks
    }
}
await mavlink20.ready
registerWidgetFields(window.Formio, mavlink20.map)
window.runtimeErrors = []
window.runLifecycleChecks = runLifecycleChecks
const initial = parseLayout(await (await fetch(`${import.meta.env.BASE_URL}fixtures/Default_Layout.json`)).text())

/** React owns one runtime per mounted layout and disposes it before replacements and unmount. */
function Dashboard({ layout }: { layout: Layout }) {
    const element = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!element.current) return
        const runtime = new WidgetRuntime(element.current, {
            createGrid: (options, host) => window.GridStack.init(options, host),
            forms: window.Formio,
            sandboxUrl: `${import.meta.env.BASE_URL}runtime/Widgets/SandBox.html`,
            defaultHtml,
            onError: error => window.runtimeErrors.push(String(error)),
            mountMenu: menu => {
                const button = document.createElement('button')
                button.textContent = 'Edit layout'
                let editing = false
                /** Toggle editing without owning a vehicle or provider connection. */
                const toggle = (): void => { runtime.setEditing(editing = !editing) }
                button.addEventListener('click', toggle)
                menu.append(button)
                return () => { button.removeEventListener('click', toggle); button.remove() }
            },
        }, layout)
        window.runtime = runtime
        void runtime.ready.catch(error => window.runtimeErrors.push(String(error)))
        return () => { runtime.destroy(); if (window.runtime === runtime) delete window.runtime }
    }, [layout])
    return <div id="dashboard" ref={element} />
}

/** Test controls use the same exported API a later dashboard or VideoOverlay consumer will use. */
function App() {
    const [layout, setLayout] = useState(initial)
    const [mounted, setMounted] = useState(true)
    /** Replace the controlled layout through React state. */
    window.mountLayout = next => { setLayout(next); setMounted(true) }
    /** Obtain exact legacy-format download text from the active runtime. */
    window.serialized = () => window.runtime ? serializeLayout(window.runtime.snapshot()) : ''
    /** Decode an in-memory MAVLink packet before broadcasting it; no vehicle connection. */
    window.publishFixture = () => {
        const encoder = new MAVLink20Processor(null, 1, 1)
        const decoder = new MAVLink20Processor()
        const outgoing = new mavlink20.messages.vfr_hud(10, 12.5, 90, 50, 100, 2)
        const message = decoder.decode(new Uint8Array(outgoing.pack(encoder)))
        window.runtime?.publish(message)
    }
    return <><button onClick={() => setMounted(value => !value)}>Toggle runtime</button>
        <output id="fields">{messageFields(mavlink20.map, '74').join(',')}</output>
        {mounted && <Dashboard layout={layout} />}</>
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
