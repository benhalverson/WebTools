import { useEffect, useRef } from 'react'
import { WidgetRuntime, parseWidget, type WidgetModel } from '@webtools/widget-runtime'

const definitions = [
    { name: 'Attitude', x: 1, y: 0, w: 2, h: 2 },
    { name: 'Graph', x: 3, y: 0, w: 3, h: 2 },
    { name: 'Map', x: 0, y: 2, w: 2, h: 2 },
    { name: 'MAVLink_Inspector', x: 2, y: 2, w: 2, h: 2 },
    { name: 'Messages', x: 4, y: 2, w: 2, h: 2 },
    { name: 'Value', x: 0, y: 4, w: 1, h: 1 },
    { name: 'Stats', x: 3, y: 5, w: 1, h: 1 },
]

/** Own the legacy six-column live palette and release previews after a completed drag-out. */
export function WidgetGallery({ runtime, close, failure }: { runtime: WidgetRuntime; close(): void; failure(error: unknown): void }) {
    const element = useRef<HTMLDivElement>(null)
    const callbacks = useRef({ close, failure })
    callbacks.current = { close, failure }
    useEffect(() => {
        if (!element.current) return
        let active = true
        let owner: WidgetRuntime | undefined
        const controller = new AbortController()
        /** Load authoritative widget definitions before creating the disposable palette grid. */
        async function initialize(): Promise<void> {
            const results = await Promise.allSettled(definitions.map(async ({ name, ...position }) => {
                const response = await fetch(`${import.meta.env.BASE_URL}SandBoxWidgets/${name}.json`, { signal: controller.signal })
                if (!response.ok) throw new Error(`Widget unavailable (${response.status})`)
                return { ...parseWidget(await response.text()).widget, ...position }
            }))
            if (!active || !element.current) return
            const presets = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
            const failed = results.find(result => result.status === 'rejected')
            if (failed?.status === 'rejected') callbacks.current.failure(failed.reason)
            const widgets: WidgetModel[] = [
                { type: 'WidgetSubGrid', x: 0, y: 0, w: 1, h: 1, options: {} },
                { type: 'WidgetSandBox', x: 0, y: 1, w: 1, h: 1, options: {} },
                { type: 'WidgetCustomHTML', x: 1, y: 5, w: 1, h: 1, options: {} },
                ...presets,
            ]
            owner = new WidgetRuntime(element.current, {
                /** Match the outbound-only legacy palette; nested preview grids retain their own options. */
                createGrid: (options, target) => runtime.dependencies.createGrid(target === element.current ? { ...options, acceptWidgets: false } : options, target),
                forms: runtime.dependencies.forms,
                sandboxUrl: runtime.dependencies.sandboxUrl,
                defaultHtml: runtime.dependencies.defaultHtml,
                onError: error => { if (active) callbacks.current.failure(error) },

            }, { header: { version: 1 }, grid: { columns: 6, rows: 5, color: '#ffffff' }, widgets: Object.fromEntries(widgets.map((widget, index) => [index, widget])) })
            await owner.ready
            if (!active) return
            owner.setEditing(true)
            owner.grid.enableResize(false)
            for (const host of owner.getWidgets()) {
                const about = host.getAbout()
                const name = String(about?.name ?? host.model.type)
                host.element.title = about?.info ? `${name}\n${String(about.info)}` : name
                host.element.setAttribute('aria-label', `Preview ${name}`)
            }
            /** Allow the receiving grid to finish transferring ownership before unmounting the palette. */
            function dropped(): void { queueMicrotask(() => { if (active) callbacks.current.close() }) }
            owner.grid.on('removed', dropped)
            element.current.dataset.ready = 'true'
        }
        void initialize().catch(error => { if (active && !controller.signal.aborted) callbacks.current.failure(error) })
        return () => { active = false; controller.abort(); owner?.destroy() }
    }, [runtime])
    return <div className="widget-gallery"><div className="grid-stack" aria-label="Widget previews" ref={element} /></div>
}
