import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { PlotlyApi } from '@webtools/react-workflows'
import App from './App.tsx'

/** Narrows the pinned vendor global at runtime so missing scripts produce UI
 * feedback rather than an uncaught ReferenceError during application startup.
 */
function readPlotly(): PlotlyApi | undefined {
    const candidate: unknown = Reflect.get(window, 'Plotly')
    if (typeof candidate !== 'object' || candidate === null) return undefined
    if (
        !('newPlot' in candidate) ||
        typeof candidate.newPlot !== 'function' ||
        !('react' in candidate) ||
        typeof candidate.react !== 'function' ||
        !('purge' in candidate) ||
        typeof candidate.purge !== 'function'
    )
        return undefined
    // Only the three verified methods cross the vendor boundary; their signatures
    // match the pinned Plotly bundle and the shared plotting package contract.
    return candidate as PlotlyApi
}

/** Independent mount boundary: disconnecting the host releases React, file reads,
 * Open In listeners and Plotly resources; reconnecting starts a fresh session.
 */
class MagFitElement extends HTMLElement {
    private root: ReturnType<typeof createRoot> | null = null
    /** Start one React lifetime after the vendor scripts and host are available. */
    connectedCallback(): void {
        if (this.root) return
        this.root = createRoot(this)
        this.root.render(
            <StrictMode>
                <App plotly={readPlotly()} assetBase={import.meta.env.BASE_URL} />
            </StrictMode>,
        )
    }
    /** Unmount synchronously before releasing the host's reference to React. */
    disconnectedCallback(): void {
        this.root?.unmount()
        this.root = null
    }
}
customElements.define('mag-fit-app', MagFitElement)
