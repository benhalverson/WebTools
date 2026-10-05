import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { PlotlyApi, SaveAs } from '@webtools/react-workflows'
import App from './App.tsx'

/** Narrows the pinned vendor global so missing assets produce recoverable UI. */
function readPlotly(): PlotlyApi | undefined {
    const candidate: unknown = Reflect.get(window, 'Plotly')
    if (typeof candidate !== 'object' || candidate === null) return undefined
    if (!('newPlot' in candidate) || typeof candidate.newPlot !== 'function'
        || !('react' in candidate) || typeof candidate.react !== 'function'
        || !('purge' in candidate) || typeof candidate.purge !== 'function') return undefined
    return candidate as PlotlyApi
}

/** Reads only the callable FileSaver boundary supplied by the pinned script. */
function readSaveAs(): SaveAs | undefined {
    const candidate: unknown = Reflect.get(window, 'saveAs')
    return typeof candidate === 'function' ? candidate as SaveAs : undefined
}

const root = document.getElementById('root')
if (!root) throw new Error('Hardware Report root element is missing.')
createRoot(root).render(<StrictMode><App plotly={readPlotly()} saveAs={readSaveAs()} assetBase={import.meta.env.BASE_URL} /></StrictMode>)
