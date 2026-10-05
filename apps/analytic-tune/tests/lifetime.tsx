import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { PlotElement, PlotlyApi } from '@webtools/react-workflows'
import App from '../src/App.tsx'

interface PendingRead { resolve: (bytes: ArrayBuffer) => void; reject: (cause: Error) => void; bytes: Promise<ArrayBuffer> }
const pendingReads: PendingRead[] = []
const nativeRead = File.prototype.arrayBuffer
let deferredReads = false
const stats = { newPlot: 0, react: 0, purge: 0, subscribe: 0, unsubscribe: 0, downloads: 0 }
const vendor = Reflect.get(window, 'Plotly') as PlotlyApi
const observed = new WeakSet<PlotElement>()

/** Count real Plotly subscriptions while retaining the pinned vendor implementation. */
function observe(element: PlotElement): PlotElement {
    if (observed.has(element)) return element
    observed.add(element)
    const on = element.on.bind(element)
    const remove = element.removeListener.bind(element)
    element.on = (name, listener) => { stats.subscribe++; on(name, listener) }
    element.removeListener = (name, listener) => { stats.unsubscribe++; remove(name, listener) }
    return element
}
const plotly: PlotlyApi = {
    /** Count and initialize the actual vendor plot. */
    async newPlot(node, data, layout, config) { stats.newPlot++; return observe(await vendor.newPlot(node, data, layout, config)) },
    /** Count and update the actual vendor plot. */
    async react(node, data, layout, config) { stats.react++; return observe(await vendor.react(node, data, layout, config)) },
    /** Count and dispose the actual vendor plot. */
    purge(node) { stats.purge++; vendor.purge(node) },
}

/** Delay only test-selected file reads so unmount can interrupt real parsing work. */
File.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    const bytes = nativeRead.call(this)
    if (!deferredReads) return bytes
    return new Promise((resolve, reject) => pendingReads.push({ resolve, reject, bytes }))
}

/** Expose test operations without exporting them from the production entry. */
Reflect.set(window, 'lifetimeTest', {
    stats,
    /** Select whether new reads await explicit test release. */
    deferReads(value: boolean) { deferredReads = value },
    /** Return the number of reads held by the test. */
    pendingCount() { return pendingReads.length },
    /** Resolve one queued read with its unchanged real File bytes. */
    async release(index = 0) { const pending = pendingReads.splice(index, 1)[0]; if (pending) pending.resolve(await pending.bytes) },
    /** Reject one queued read to exercise stale error suppression. */
    reject(index = 0) { pendingReads.splice(index, 1)[0]?.reject(new Error('Deferred test read failed')) },
})

/** Mount and unmount production App repeatedly without navigating the document. */
function LifetimeHarness() {
    const [mounted, setMounted] = useState(true)
    return <><button id="mount-app" onClick={() => setMounted(true)}>Mount</button>
        <button id="unmount-app" onClick={() => setMounted(false)}>Unmount</button>
        {mounted && <App plotly={plotly} assetBase={import.meta.env.BASE_URL} saveAs={() => { stats.downloads++ }} />}</>
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing lifetime harness root')
createRoot(root).render(<LifetimeHarness />)
