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

/** Mount one app lifetime and return its React cleanup for hosts that replace tools. */
function mount(root: HTMLElement): () => void {
    const application = createRoot(root)
    application.render(<StrictMode><App plotly={readPlotly()} assetBase={import.meta.env.BASE_URL} /></StrictMode>)
    return () => application.unmount()
}

const root = document.getElementById('root')
if (!root) throw new Error('SysID root element is missing.')
mount(root)
