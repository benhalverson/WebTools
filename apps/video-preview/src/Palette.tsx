import { useEffect, useRef, useState } from 'react'
import { WidgetRuntime, type WidgetMap, type WidgetModel } from '@webtools/widget-runtime'
import { parseVideoPalette } from './format'

/** Enumerate root and nested grids as keyboard destinations. */
function targets(runtime: WidgetRuntime, name = 'Overlay'): { runtime: WidgetRuntime; name: string }[] {
    return [{ runtime, name }, ...runtime.getWidgets().flatMap((widget, index) => {
        const nested = widget.getNestedRuntime()
        return nested ? targets(nested, `${name} / Nested layout ${index + 1}`) : []
    })]
}

/** Mount the authoritative seven-column live palette with shared widget ownership and drag-out creation. */
export function Palette({ runtime, failure }: { runtime: WidgetRuntime; failure(error: unknown): void }) {
    const element = useRef<HTMLDivElement>(null)
    const [definitions, setDefinitions] = useState<WidgetMap>({})
    const [revision, setRevision] = useState(0)
    const [destination, setDestination] = useState(0)
    const destinations = targets(runtime)
    const names = { WidgetSubGrid: 'Subgrid', WidgetSandBox: 'Sandbox', WidgetCustomHTML: 'Custom HTML', WidgetMenu: 'Menu' }
    useEffect(() => {
        const target = element.current
        if (target) target.dataset.ready = 'false'
        let active = true
        let owner: WidgetRuntime | undefined
        const controller = new AbortController()
        /** Load unchanged palette definitions before allocating its disposable live grid. */
        async function initialize(): Promise<void> {
            const response = await fetch(`${import.meta.env.BASE_URL}Default_Palette.json`, { signal: controller.signal })
            if (!response.ok) throw new Error(`Palette unavailable (${response.status})`)
            const widgets = parseVideoPalette(await response.text())
            if (!active || !element.current) return
            setDefinitions(widgets)
            owner = new WidgetRuntime(element.current, {
                ...runtime.dependencies,
                createGrid: (options, target) => runtime.dependencies.createGrid(target === element.current ? { ...options, acceptWidgets: false, cellHeight: '100px' } : options, target),
                onEdit: () => {}, onWidgetDisposed: () => {},
            }, { header: { version: 1 }, grid: { rows: 1, columns: 7, color: '' }, widgets })
            await owner.ready
            if (!active) return
            owner.setEditing(true)
            owner.grid.enableResize(false)
            for (const host of owner.getWidgets()) {
                const about = host.getAbout()
                host.element.title = `${String(about.name)}${about.info ? '\n' + String(about.info) : ''}`
                host.element.setAttribute('aria-label', `Preview ${String(about.name)}`)
            }
            /** Replenish previews after the destination has recreated a dropped widget. */
            function replenish(): void { queueMicrotask(() => { if (active) setRevision(value => value + 1) }) }
            owner.grid.on('removed', replenish)
            element.current.dataset.ready = 'true'
        }
        void initialize().catch(error => { if (active && !controller.signal.aborted) failure(error) })
        return () => { active = false; if (target) target.dataset.ready = 'false'; controller.abort(); owner?.destroy() }
    }, [runtime, failure, revision])

    /** Copy a definition to the selected shared grid without changing its saved source. */
    async function add(model: WidgetModel): Promise<void> {
        try { await destinations[destination]?.runtime.add(structuredClone(model))?.ready }
        catch (error) { failure(error) }
    }
    return <section aria-label="Widget palette"><div className="palette-grid grid-stack" ref={element} />
        <details><summary>Add with keyboard</summary><label>Destination<select value={destination} onChange={event => setDestination(Number(event.target.value))}>{destinations.map((target, index) => <option key={index} value={index}>{target.name}</option>)}</select></label>
            {Object.entries(definitions).map(([key, model]) => <button key={key} onClick={() => void add(model)}>{String(model.options.about?.name ?? names[model.type])}</button>)}
        </details>
    </section>
}
