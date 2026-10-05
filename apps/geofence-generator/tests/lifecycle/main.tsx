import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import L from 'leaflet'
import App from '../../src/App.tsx'
import '../../src/style.css'

declare global { interface Window { lifecycle: { created: number; removed: number; eventsAfterRemoval: number; map: L.Map | undefined } } }
window.lifecycle = { created: 0, removed: 0, eventsAfterRemoval: 0, map: undefined }
/** Record every actual Leaflet allocation in this test-only host. */
function allocated(this: L.Map): void { window.lifecycle.created++; window.lifecycle.map = this }
L.Map.addInitHook(allocated)
const remove = L.Map.prototype.remove
/** Observe vendor cleanup after the application calls the genuine Leaflet remover. */
L.Map.prototype.remove = function removeObserved(this: L.Map): L.Map {
    const result = remove.call(this)
    window.lifecycle.removed++
    // App clears remaining listeners synchronously after remove returns.
    queueMicrotask(() => { window.lifecycle.eventsAfterRemoval = Object.keys(Reflect.get(this, '_events') ?? {}).length })
    return result
}
/** Repeatedly mount the production App in the same live document. */
function Harness() {
    const [mounted, setMounted] = useState(true)
    return <><div style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 10000 }}><button onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount app' : 'Mount app'}</button></div>{mounted && <App />}</>
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
