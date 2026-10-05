import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './style.css'

/** Mount an independent application lifetime into the supplied host. The returned
 * disposer releases React effects, pending file/weather work and vendor plots.
 * Call it before reusing the host for another mount. */
export function mountApplication(host: HTMLElement): () => void {
    const root = createRoot(host)
    root.render(
        !window.Plotly || !globalThis.mlMatrix || !window.saveAs ? (
            <p role="alert">Unable to load the plotting, matrix or download library. Reload to retry.</p>
        ) : (
            <StrictMode>
                <App />
            </StrictMode>
        ),
    )
    return () => root.unmount()
}
/** Release the default document mount before embedding another application lifetime. */
export const unmount = mountApplication(document.getElementById('root')!)
if (import.meta.hot) import.meta.hot.dispose(unmount)
