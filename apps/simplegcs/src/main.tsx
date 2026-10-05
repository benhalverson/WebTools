import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { hostingPrefix } from '@webtools/routing'
import type { DeploymentConfig } from './settings.ts'
import App, { type AppProps } from './App.tsx'
import { simulatedSocket } from './simulator.ts'
import { simulatedLocation } from './location.ts'
/** Optional local test providers are supplied before entry evaluation; default transport is in-memory. */
declare global { interface Window { SIMPLEGCS_CONFIG?: DeploymentConfig; GMAPS_API_KEY?: string; SIMPLEGCS_PREVIEW?: Partial<Pick<AppProps, 'socket' | 'location' | 'onMap' | 'parameters' | 'onParameters'>>; simplegcsPreview?: { mount: () => void; unmount: () => void; refresh: () => void } } }
const element = document.getElementById('root')!
const config: DeploymentConfig = { ...window.SIMPLEGCS_CONFIG, googleKey: window.GMAPS_API_KEY || localStorage.getItem('gcs.gmaps.apikey') || '' }
if (config.title?.trim()) document.title = config.title.trim()
const storage = { local: localStorage, session: sessionStorage }
let root: Root | undefined
/** Mount a new React resource lifetime, including StrictMode's effect replay. */
function mount(): void {
    if (root) return
    root = createRoot(element)
    refresh()
}
/** Refresh injected preview providers without replacing the mounted React tree. */
function refresh(): void {
    root?.render(<StrictMode><App onParameters={window.SIMPLEGCS_PREVIEW?.onParameters} parameters={window.SIMPLEGCS_PREVIEW?.parameters} socket={window.SIMPLEGCS_PREVIEW?.socket ?? simulatedSocket} location={window.SIMPLEGCS_PREVIEW?.location ?? simulatedLocation} onMap={window.SIMPLEGCS_PREVIEW?.onMap} storage={storage} config={config} locks={navigator.locks} prefix={hostingPrefix(import.meta.env.BASE_URL.replace(/SimpleGCS-preview\/$/, ''))} /></StrictMode>)
}
/** Release map, sockets, watches, identity leases and React resources together. */
function unmount(): void { root?.unmount(); root = undefined }
window.simplegcsPreview = { mount, unmount, refresh }
mount()
