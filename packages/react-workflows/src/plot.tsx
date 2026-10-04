import { useEffect, useRef } from 'react'

/** Deliberately narrow boundary around the pinned vendor Plotly bundle.
 * Plotly accepts arbitrary trace/layout fields; consumed event fields are unknown
 * until the consumer narrows them. No vendor implementation is translated.
 */
export type PlotFields = Record<string, unknown>
export type PlotListener = (event: PlotFields) => void
export interface PlotElement extends HTMLDivElement {
    /** Subscribe to a vendor event on the initialized plot element. */
    on(name: string, listener: PlotListener): void
    /** Remove only the supplied event listener, leaving other listeners intact. */
    removeListener(name: string, listener: PlotListener): void
}
export interface PlotlyApi {
    /** Initialize the supplied node and resolve its event-capable plot element;
     * synchronous throws and rejections are reported by the Plot wrapper. */
    newPlot(node: HTMLDivElement, data: readonly PlotFields[], layout: PlotFields, config: PlotFields): Promise<PlotElement>
    /** Update an initialized plot and resolve when the vendor update settles. */
    react(node: HTMLDivElement, data: readonly PlotFields[], layout: PlotFields, config: PlotFields): Promise<PlotElement>
    /** Release vendor resources on the node, including during pending work.
     * Cleanup may call this again after that work settles. */
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

/** Own a vendor DOM node and serialize newPlot/react calls for its lifetime.
 * Changes to data/layout/config identity queue updates; replacing plotly creates
 * a fresh lifetime. Relayout and error callbacks always use the latest props.
 * Vendor update failures reach onError while mounted, and later prop updates
 * can retry; onError should not throw. Unmount removes the owned listener, purges
 * and detaches the node, and skips queued work. In-flight work is not cancelled:
 * a late successful result is purged again without touching a subsequent mount. */
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
        /** Forward vendor relayout payloads to the latest consumer callback. */
        const listener: PlotListener = event => callbacks.current.onRelayout?.(event)
        /** Queue this snapshot after prior vendor work. A failed initialization
         * leaves element unset so the next update retries newPlot; a failed
         * react keeps the existing element for retry. Disposed work is skipped. */
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
