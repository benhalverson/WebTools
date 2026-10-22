import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { PlotlyApi, SaveAs } from '@webtools/react-workflows'
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

/** Narrow the existing pinned FileSaver global before download actions. */
function readSaveAs(): SaveAs | undefined {
    const candidate: unknown = Reflect.get(window, 'saveAs')
    return typeof candidate === 'function' ? candidate as SaveAs : undefined
}

const root = document.getElementById('root')
if (!root) throw new Error('Analytic Tune root element is missing.')
createRoot(root).render(<StrictMode><App plotly={readPlotly()} assetBase={import.meta.env.BASE_URL} saveAs={readSaveAs()} /></StrictMode>)
