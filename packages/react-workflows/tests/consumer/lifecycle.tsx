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
function pendingPlot(kind: PendingPlot['kind'], node: HTMLDivElement): Promise<PlotElement> {
    return new Promise((resolve, reject) => {
        probe.pending.push({ kind, node, resolve: () => {
            const listeners = probe.listeners.get(node) ?? new Set<PlotListener>()
            probe.listeners.set(node, listeners)
            const element: PlotElement = Object.assign(node, {
                on(_name: string, listener: PlotListener) { listeners.add(listener) },
                removeListener(_name: string, listener: PlotListener) { listeners.delete(listener) },
            })
            resolve(element)
        }, reject: () => reject(new Error(`Recorded ${kind} rejection`)) })
    })
}
const vendor: PlotlyApi = {
    newPlot: node => pendingPlot('newPlot', node),
    react: node => pendingPlot('react', node),
    purge: node => { probe.purged.push(node); probe.listeners.delete(node) },
}
const layout = { width: 200, height: 100 }
const onRelayout = () => { probe.relayouts++ }
const onError = (error: unknown) => { probe.errors.push(String(error)) }
function Receiver() {
    useOpenInReceiver(file => { probe.files.push(file.name) }, () => {}, () => { probe.readyWaits++; return readiness }, onError)
    return null
}
export function LifecycleConsumer() {
    const [mounted, setMounted] = useState(true)
    const [value, setValue] = useState(0)
    return <>
        <button id="lifecycle-toggle" onClick={() => setMounted(previous => !previous)}>Toggle lifecycle</button>
        <button id="lifecycle-update" onClick={() => setValue(previous => previous + 1)}>Update plot</button>
        {mounted && <><Receiver /><Plot id="lifecycle-plot" plotly={vendor} data={[{ y: [value] }]} layout={layout} onRelayout={onRelayout} onError={onError} /></>}
    </>
}
