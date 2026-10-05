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
    if (!('newPlot' in candidate) || typeof candidate.newPlot !== 'function'
        || !('react' in candidate) || typeof candidate.react !== 'function'
        || !('purge' in candidate) || typeof candidate.purge !== 'function') return undefined
    // Only the three verified methods cross the vendor boundary; their signatures
    // match the pinned Plotly bundle and the shared plotting package contract.
    return candidate as PlotlyApi
}

const root = document.getElementById('root')
if (!root) throw new Error('PID Review root element is missing.')
/** Mount one independent app lifetime and return its React resource disposer. */
export function mount(container: HTMLElement): () => void {
    const root = createRoot(container)
    root.render(<StrictMode><App plotly={readPlotly()} assetBase={import.meta.env.BASE_URL} /></StrictMode>)
    return () => root.unmount()
}
/** Dispose the automatically mounted entry when embedding or replacing this app. */
export const dispose = mount(root)
