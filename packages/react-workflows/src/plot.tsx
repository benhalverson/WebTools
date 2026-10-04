import { useEffect, useRef } from 'react'

/** Deliberately narrow boundary around the pinned vendor Plotly bundle.
 * Plotly accepts arbitrary trace/layout fields; consumed event fields are unknown
 * until the consumer narrows them. No vendor implementation is translated.
 */
export type PlotFields = Record<string, unknown>
export type PlotListener = (event: PlotFields) => void
export interface PlotElement extends HTMLDivElement {
    on(name: string, listener: PlotListener): void
    removeListener(name: string, listener: PlotListener): void
}
export interface PlotlyApi {
    newPlot(node: HTMLDivElement, data: readonly PlotFields[], layout: PlotFields, config: PlotFields): Promise<PlotElement>
    react(node: HTMLDivElement, data: readonly PlotFields[], layout: PlotFields, config: PlotFields): Promise<PlotElement>
    purge(node: HTMLDivElement): void
}
export interface PlotProps {
    plotly: PlotlyApi
    data: readonly PlotFields[]
    layout: PlotFields
    config?: PlotFields
    onRelayout?: PlotListener
    onError?: (error: unknown) => void
    id?: string
}
const emptyConfig: PlotFields = {}

/** Serializes vendor mutations. Cleanup also handles a pending newPlot/react. */
export function Plot({ plotly, data, layout, config = emptyConfig, onRelayout, onError, id }: PlotProps) {
    const ref = useRef<HTMLDivElement>(null)
    const session = useRef<{ update: (data: readonly PlotFields[], layout: PlotFields, config: PlotFields) => void } | null>(null)
    const callbacks = useRef({ onRelayout, onError })
    callbacks.current = { onRelayout, onError }
    useEffect(() => {
        const container = ref.current
        if (!container) return
        const node = container.ownerDocument.createElement('div')
        container.appendChild(node)
        let disposed = false
        let element: PlotElement | undefined
        let pending = Promise.resolve()
        const listener: PlotListener = event => callbacks.current.onRelayout?.(event)
        const update = (nextData: readonly PlotFields[], nextLayout: PlotFields, nextConfig: PlotFields) => {
            pending = pending.then(async () => {
                if (disposed) return
                const first = !element
                element = await (first ? plotly.newPlot(node, nextData, nextLayout, nextConfig) : plotly.react(node, nextData, nextLayout, nextConfig))
                if (disposed) { plotly.purge(node); return }
                if (first) element.on('plotly_relayout', listener)
            }).catch(error => { if (!disposed) callbacks.current.onError?.(error) })
        }
        session.current = { update }
        return () => {
            disposed = true
            session.current = null
            element?.removeListener('plotly_relayout', listener)
            plotly.purge(node)
            node.remove()
        }
    }, [plotly])
    useEffect(() => { session.current?.update(data, layout, config) }, [plotly, data, layout, config])
    return <div id={id} ref={ref} />
}
