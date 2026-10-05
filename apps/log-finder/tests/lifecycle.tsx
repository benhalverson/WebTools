import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App.tsx'
/** Exercise genuine React disposal without navigation or production test hooks. */
function Lifecycle() {
    const [mounted, setMounted] = useState(true)
    return <><button style={{ position: 'fixed', zIndex: 1000, right: 0 }} id="toggle" onClick={() => setMounted(value => !value)}>Toggle app</button>{mounted && <App base="/LogFinder/" />}</>
}
const element = document.getElementById('lifecycle')
if (!element) throw new Error('Lifecycle consumer root missing')
createRoot(element).render(<StrictMode><Lifecycle /></StrictMode>)
