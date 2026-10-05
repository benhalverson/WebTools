import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
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
if (!root) throw new Error('SCurve Tool root element is missing.')
let mounted: Root | undefined

/** Mount this standalone entry into its root; repeated calls retain the active lifetime. */
export function mount(): void {
    if (mounted) return
    mounted = createRoot(root!)
    mounted.render(<StrictMode><App plotly={readPlotly()} assetBase={import.meta.env.BASE_URL} /></StrictMode>)
}

/** Dispose this entry for an embedding host, releasing plots and pending native work. */
export function unmount(): void {
    mounted?.unmount()
    mounted = undefined
}

mount()
