import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../../src/App.tsx'
import '../../src/style.css'

/** Mount the actual application repeatedly without leaving the document. */
function Fixture() {
    const [mounted, setMounted] = useState(false)
    return <><button id="mount" onClick={/** Start a fresh application lifetime. */ () => setMounted(true)}>Mount</button><button id="unmount" onClick={/** End the current application lifetime. */ () => setMounted(false)}>Unmount</button>{mounted && <App assetBase="/" />}</>
}
const root = document.getElementById('fixture')
if (!root) throw new Error('Fixture root missing')
createRoot(root).render(<Fixture />)
