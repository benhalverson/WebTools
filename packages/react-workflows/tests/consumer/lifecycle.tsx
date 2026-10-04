// Controlled vendor/readiness promises make interrupted lifetimes repeatable.
import { useState } from 'react'
import { Plot, useOpenInReceiver } from '../../src/index.js'
import type { PlotElement, PlotListener, PlotlyApi } from '../../src/index.js'
interface PendingPlot {
    kind: 'newPlot' | 'react'
    node: HTMLDivElement
    resolve: () => void
    reject: () => void
}
interface LifecycleProbe {
    pending: PendingPlot[]
    purged: HTMLDivElement[]
    listeners: Map<HTMLDivElement, Set<PlotListener>>
    errors: string[]
    relayouts: number
    files: string[]
    readyWaits: number
    releaseReadiness: () => void
}
declare global { interface Window { workflowLifecycle: LifecycleProbe } }
const probe: LifecycleProbe = {
    pending: [], purged: [], listeners: new Map(), errors: [], relayouts: 0, files: [], readyWaits: 0, releaseReadiness: () => {},
}
const readiness = new Promise<void>(resolve => { probe.releaseReadiness = resolve })
window.workflowLifecycle = probe
/** Hold a simulated vendor operation until the browser test resolves or rejects
 * its probe entry. Successful resolution equips the original node with listener
 * tracking, allowing cleanup assertions even after its component unmounts. */
function pendingPlot(kind: PendingPlot['kind'], node: HTMLDivElement): Promise<PlotElement> {
    return new Promise((resolve, reject) => {
        probe.pending.push({ kind, node, resolve: () => {
            const listeners = probe.listeners.get(node) ?? new Set<PlotListener>()
            probe.listeners.set(node, listeners)
            const element: PlotElement = Object.assign(node, {
                /** Track this plot listener for lifecycle and disposal assertions. */
                on(_name: string, listener: PlotListener) { listeners.add(listener) },
                /** Remove only the listener owned by the disposing component. */
                removeListener(_name: string, listener: PlotListener) { listeners.delete(listener) },
            })
            resolve(element)
        }, reject: () => reject(new Error(`Recorded ${kind} rejection`)) })
    })
}
const vendor: PlotlyApi = {
    /** Expose initialization as a manually settled probe operation. */
    newPlot: node => pendingPlot('newPlot', node),
    /** Expose an update as a manually settled probe operation. */
    react: node => pendingPlot('react', node),
    /** Record every purge and discard the node’s active listener registry. */
    purge: node => { probe.purged.push(node); probe.listeners.delete(node) },
}
const layout = { width: 200, height: 100 }
/** Count relayout deliveries so stale or duplicate subscriptions are observable. */
const onRelayout = () => { probe.relayouts++ }
/** Record the original vendor failure text without throwing from the callback. */
const onError = (error: unknown) => { probe.errors.push(String(error)) }
/** Wait on test-controlled readiness before recording received filenames.
 * Unmounting this receiver lets the browser verify that late readiness completion
 * does not deliver a message into a disposed hook lifetime. */
function Receiver() {
    useOpenInReceiver(file => { probe.files.push(file.name) }, () => {}, () => { probe.readyWaits++; return readiness }, onError)
    return null
}
/** Render controls that queue plot updates or replace the entire hook lifetime,
 * while browser code settles vendor and readiness promises through the probe. */
export function LifecycleConsumer() {
    const [mounted, setMounted] = useState(true)
    const [value, setValue] = useState(0)
    return <>
        <button id="lifecycle-toggle" onClick={() => setMounted(previous => !previous)}>Toggle lifecycle</button>
        <button id="lifecycle-update" onClick={() => setValue(previous => previous + 1)}>Update plot</button>
        {mounted && <><Receiver /><Plot id="lifecycle-plot" plotly={vendor} data={[{ y: [value] }]} layout={layout} onRelayout={onRelayout} onError={onError} /></>}
    </>
}
