import { createRoot, type Root } from 'react-dom/client'
import { App } from './App.tsx'
import './style.css'

let root: Root | undefined
/** Mount once, including restoration of a page from the browser's back/forward cache. */
function mount(): void {
    if (root) return
    root = createRoot(document.getElementById('root')!)
    root.render(<App />)
}
/** Release USB listeners/readers before a page is hidden or its module is replaced. */
function unmount(): void { root?.unmount(); root = undefined }
mount()
window.addEventListener('pagehide', unmount)
window.addEventListener('pageshow', mount)
if (import.meta.hot) import.meta.hot.dispose(() => {
    unmount()
    window.removeEventListener('pagehide', unmount)
    window.removeEventListener('pageshow', mount)
})
