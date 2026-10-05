import { useState } from 'react'
import { OpenIn, ParameterControl, transferFile } from '../../src/index.js'

declare global { interface Window { regressionTransfer: typeof transferFile } }
window.regressionTransfer = transferFile

/** Keep controls mounted while asynchronous metadata and selected files change.
 * Two independent renders allow React's previous props to age out of both fibers. */
export function RegressionConsumer() {
    const [metadata, setMetadata] = useState<unknown>(new URLSearchParams(location.search).get('metadata') === 'null' ? null : new URLSearchParams(location.search).get('metadata') === 'ready' ? {} : undefined)
    const [value, setValue] = useState('9')
    const [changes, setChanges] = useState(0)
    const [file, setFile] = useState<File | null>(null)
    const [mounted, setMounted] = useState(true)
    const [renders, setRenders] = useState(0)
    return <>
        <button id="metadata-null" onClick={() => setMetadata(null)}>Null metadata</button>
        <button id="metadata-undefined" onClick={() => setMetadata(undefined)}>Undefined metadata</button>
        <button id="metadata-values" onClick={() => setMetadata({ TEST: { Values: { 0: 'Off', 1: 'On' } } })}>Load values</button>
        <button id="metadata-bits" onClick={() => setMetadata({ TEST: { Description: 'Flags', Bitmask: { 0: 'First', 7: 'Sign' } } })}>Load bits</button>
        <button id="metadata-range" onClick={() => setMetadata({ TEST: { Units: 'Hz', Range: { low: '0', high: '10' } } })}>Load range</button>
        <ParameterControl name="TEST" metadata={metadata} value={value} bitmaskSize={8} constrain
            onChange={next => { setValue(next); setChanges(count => count + 1) }} />
        <output id="changes">{changes}</output><output id="raw">{value}</output>
        <button id="select-file" onClick={() => setFile(new File([new Uint8Array(4 * 1024 * 1024).fill(173)], 'original.bin'))}>Select log</button>
        <button id="clear-file" onClick={() => setFile(null)}>Clear log</button>
        <button id="rerender" onClick={() => setRenders(count => count + 1)}>Rerender {renders}</button>
        <button id="transfer-toggle" onClick={() => setMounted(current => !current)}>Toggle transfers</button>
        {mounted && <div id="transfers"><OpenIn file={file} /></div>}
    </>
}
