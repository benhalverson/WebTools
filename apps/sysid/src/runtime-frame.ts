import transferFunction from './transfer-function.py?raw'
import serializeResult from './serialize-result.py?raw'
import stateSpace from './state-space.py?raw'
import { identificationResult, type RuntimeEvent, type RuntimeRequest } from './protocol.ts'

interface Pyodide {
    globals: { set(name: string, value: unknown): void }
    loadPackage(names: string[]): Promise<void>
    runPython(code: string): unknown
    runPythonAsync(code: string): Promise<unknown>
    setStdout(options: { batched: (text: string) => void }): void
    setStderr(options: { batched: (text: string) => void }): void
}
let runtime: Pyodide | undefined
let busy = false
/** Send only to the same-origin parent which owns this disposable runtime frame. */
function send(event: RuntimeEvent): void { parent.postMessage(event, location.origin) }
/** Initialize pinned local packages; micropip installs only the two local pure-Python wheels. */
async function initialize(): Promise<void> {
    send({ kind: 'output', text: 'Initializing Pyodide...\n' })
    const loader: unknown = Reflect.get(window, 'loadPyodide')
    if (typeof loader !== 'function') throw new Error('Pyodide loader unavailable')
    runtime = await loader({ indexURL: new URL('./python/', location.href).href }) as Pyodide
    runtime.setStdout({ batched: text => send({ kind: 'output', text: text + '\n' }) })
    runtime.setStderr({ batched: text => send({ kind: 'output', text: text + '\n' }) })
    await runtime.loadPackage(['micropip','matplotlib','scipy','sympy'])
    runtime.globals.set('wheel_base', new URL('./python/', location.href).href)
    await runtime.runPythonAsync(`
import micropip
await micropip.install(wheel_base + 'control-0.10.2-py3-none-any.whl', deps=False)
await micropip.install(wheel_base + 'pyAircraftIden-1.0-py3-none-any.whl', deps=False)
# loadPackage reports some download failures through stderr; verify every consumed API before readiness.
from AircraftIden import FreqIdenSIMO, TransferFunctionFit, TransferFunctionParamModel
from AircraftIden.StateSpaceIden import StateSpaceIdenSIMO, StateSpaceParamModel
`)
    runtime.runPython(serializeResult)
    send({ kind: 'ready' })
}
/** Execute unchanged legacy Python and serialize only consumed plot arrays; no proxies escape the frame. */
async function receive(event: MessageEvent<RuntimeRequest>): Promise<void> {
    if (event.source !== parent || event.origin !== location.origin || busy) return
    busy = true
    try {
        if (event.data.kind === 'initialize') await initialize()
        else if (event.data.kind === 'run') {
            if (!runtime) throw new Error('Python is not initialized')
            for (const [name, value] of Object.entries(event.data.inputs)) runtime.globals.set(name, value)
            await runtime.runPythonAsync(event.data.mode === 'tf' ? transferFunction : stateSpace)
            const names = event.data.mode === 'tf' ? ['freq_js','[h_amp_js]','[h_phase_js]','[mag_js]','[phase_js]','[coherence_js]'] : ['freq_js','Hs_amp_js','Hs_pha_js','Hest_amp_js','Hest_pha_js','coherence_js']
            const keys = ['frequency','sourceAmplitude','sourcePhase','fittedAmplitude','fittedPhase','coherence']
            const result = runtime.runPython(`_webtools_encode(dict(zip(${JSON.stringify(keys)}, [${names.join(',')} ])))`)
            if (typeof result !== 'string') throw new Error('Python serialization failed')
            send({ kind: 'result', result: identificationResult(JSON.parse(result)) })

        }
    } catch (error) { send({ kind: 'error', message: String(error) }) }
    finally {
        if (event.data.kind === 'run' && runtime) {
            // The pinned HTML5 backend's destroy() assumes show() created a DOM node.
            // Close individual figures: Matplotlib removes each registry entry before destroy,
            // whereas close("all") leaves the registry intact if that backend raises.
            try { runtime.runPython(`
if "plt" in globals():
    for figure_number in list(plt.get_fignums()):
        try:
            plt.close(figure_number)
        except Exception:
            pass
`) } catch { /* Retain the original identification error. */ }
        }
        busy = false
    }
}
window.addEventListener('message', event => { void receive(event) })
