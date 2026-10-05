import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { nativeSocket } from './native-socket.ts'
import { hostingPrefix } from '@webtools/routing'
import type { DeploymentConfig } from './settings.ts'
import App, { type AppProps } from './App.tsx'
import { VideoWindow } from './VideoWindow.tsx'
import { simulatedSocket } from './simulator.ts'
import { simulatedParameters } from './parameters/simulator.ts'
import { simulatedLocation } from './location.ts'
/** Optional local test providers are supplied before entry evaluation; production transport is native; simulation is explicit. */
declare global { interface Window { SIMPLEGCS_CONFIG?: DeploymentConfig; GMAPS_API_KEY?: string; SIMPLEGCS_PREVIEW?: Partial<Pick<AppProps, 'socket' | 'location' | 'onMap' | 'parameters' | 'onParameters'>>; simplegcsPreview?: { mount: () => void; unmount: () => void; refresh: () => void } } }
const element = document.getElementById('root')!
const config: DeploymentConfig = { ...window.SIMPLEGCS_CONFIG, googleKey: window.GMAPS_API_KEY || localStorage.getItem('gcs.gmaps.apikey') || '' }
if (location.pathname.endsWith('/video.html')) document.title = 'Video'
else if (config.title?.trim()) document.title = config.title.trim()
const simulated = new URL(location.href).searchParams.get('simulate') === '1'
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
    root?.render(<StrictMode>{location.pathname.endsWith('/video.html') ? <VideoWindow /> : <App onParameters={window.SIMPLEGCS_PREVIEW?.onParameters} simulated={simulated} parameters={window.SIMPLEGCS_PREVIEW?.parameters ?? (simulated ? simulatedParameters : undefined)} socket={window.SIMPLEGCS_PREVIEW?.socket ?? (simulated ? simulatedSocket : nativeSocket)} location={window.SIMPLEGCS_PREVIEW?.location ?? (simulated ? simulatedLocation : navigator.geolocation)} onMap={window.SIMPLEGCS_PREVIEW?.onMap} storage={storage} config={config} locks={navigator.locks} prefix={hostingPrefix(import.meta.env.BASE_URL.replace(/SimpleGCS\/$/, ''))} />}</StrictMode>)
}
/** Release map, sockets, watches, identity leases and React resources together. */
function unmount(): void { root?.unmount(); root = undefined }
window.simplegcsPreview = { mount, unmount, refresh }
mount()
