import { WidgetGallery } from './WidgetGallery'
import { useEffect, useRef, useState } from 'react'
import { parseWidget, type WidgetModel, type WidgetRuntime, type WidgetType } from '@webtools/widget-runtime'

const presets = ['Attitude', 'Graph', 'Map', 'MAVLink_Inspector', 'Messages', 'Value', 'Stats'] as const
const sizes: Record<string, [number, number]> = { Attitude: [2, 2], Graph: [3, 2], Map: [2, 2], MAVLink_Inspector: [2, 2], Messages: [2, 2], Value: [1, 1], Stats: [1, 1] }

/** Enumerate existing nested owners so keyboard additions have the same destinations as drops. */
function targets(runtime: WidgetRuntime, name = 'Dashboard'): { runtime: WidgetRuntime; name: string }[] {
    return [{ runtime, name }, ...runtime.getWidgets().flatMap((widget, index) => {
        const nested = widget.getNestedRuntime()
        return nested ? targets(nested, `${name} / Nested layout ${index + 1}`) : []
    })]
}

/** Offer retained built-ins and checked-in widget definitions without modifying their source. */
export function Palette({ runtime, close, failure }: { runtime: WidgetRuntime; close(): void; failure(error: unknown): void }) {
    const [busy, setBusy] = useState(false)
    const destinations = targets(runtime)
    const [target, setTarget] = useState(0)
    const active = useRef(false)
    const operation = useRef(0)
    const controller = useRef<AbortController | undefined>(undefined)
    useEffect(() => { active.current = true; return () => { active.current = false; operation.current++; controller.current?.abort() } }, [])

    /** Add one copied definition and wait for its forms before dismissing the palette. */
    async function add(model: WidgetModel, generation: number): Promise<void> {
        const owner = destinations[target]?.runtime
        if (!active.current || generation !== operation.current || !owner) return
        const host = owner.add(model)
        if (host) { await host.ready; if (active.current && generation === operation.current) close() }
    }

    /** Abort a pending preset fetch when another selection or unmount makes it obsolete. */
    async function preset(name: string): Promise<void> {
        controller.current?.abort()
        const request = new AbortController()
        controller.current = request
        setBusy(true)
        const generation = ++operation.current
        try {
            const response = await fetch(`${import.meta.env.BASE_URL}SandBoxWidgets/${name}.json`, { signal: request.signal })
            if (!response.ok) throw new Error(`Widget unavailable (${response.status})`)
            const model = parseWidget(await response.text()).widget
            const size = sizes[name]
            if (size) { model.w = size[0]; model.h = size[1] }
            if (active.current && !request.signal.aborted) await add(model, generation)
        } catch (error) { if (active.current && !request.signal.aborted) failure(error) }
        finally { if (active.current && !request.signal.aborted) setBusy(false) }
    }

    /** Create an empty legacy widget with its runtime-provided default schema/source. */
    function builtin(type: WidgetType): void {
        const generation = ++operation.current
        setBusy(true)
        void add({ x: null, y: null, w: 1, h: 1, type, options: {} }, generation)
            .catch(error => { if (active.current && generation === operation.current) failure(error) })
            .finally(() => { if (active.current && generation === operation.current) setBusy(false) })
    }

    return <section className="playback-panel widget-palette" aria-label="Add widget"><header><strong>Add widget</strong><button onClick={close} aria-label="Close palette">×</button></header>
        <WidgetGallery runtime={runtime} close={close} failure={failure} />
        <fieldset disabled={busy}><legend>Add with keyboard</legend>
            <label htmlFor="widget-destination">Destination</label><select id="widget-destination" value={target} onChange={event => setTarget(Number(event.target.value))}>{destinations.map((item, index) => <option key={index} value={index}>{item.name}</option>)}</select>
            <button onClick={() => builtin('WidgetSubGrid')}>Nested layout</button><button onClick={() => builtin('WidgetSandBox')}>Sandbox</button><button onClick={() => builtin('WidgetCustomHTML')}>Custom HTML</button>
            {presets.map(name => <button key={name} onClick={() => void preset(name)}>{name.replaceAll('_', ' ')}</button>)}
        </fieldset>
    </section>
}
