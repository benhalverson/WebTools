import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
// Integration-only base: both prerequisite histories, before any issue #19 implementation.
export const comparisonRevision = '123763b6acffccdf592f711602b91d41c72c032b'
export const root = fileURLToPath(new URL('../../../', import.meta.url))

/** Read immutable comparison bytes directly from Git, never the migrated implementation. */
export function original(path) { return execFileSync('git', ['show', `${comparisonRevision}:${path}`], { cwd: root, maxBuffer: 20 * 1024 * 1024 }) }

/** Instantiate the actual checked-in control binary in an isolated browser-like realm. */
export async function controlModule() {
    const context = vm.createContext({ console, WebAssembly, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, URL, setTimeout, clearTimeout, performance, window: {}, document: { currentScript: { src: 'http://localhost/control.js' } } })
    vm.runInContext(original('KinematicTool/ardupilot/control.js').toString(), context)
    return context.ControlModule({ wasmBinary: original('KinematicTool/ardupilot/control.wasm') })
}

/** Initialize Ruckig from unchanged glue, verifying both glue and binary against the base. */
export async function ruckigModule() {
    for (const path of ['KinematicTool/Ruckig/ruckig.js', 'KinematicTool/Ruckig/ruckig.wasm']) {
        if (!original(path).equals(await readFile(root + path))) throw new Error(`Changed authoritative asset: ${path}`)
    }
    const glue = await import(new URL('../../../KinematicTool/Ruckig/ruckig.js', import.meta.url))
    return glue.default({ wasmBinary: original('KinematicTool/Ruckig/ruckig.wasm') })
}

/** Run the unmodified owned page script with DOM/renderer adapters and actual WASM.
 * Dynamic import is intercepted solely to provide the exact checked-in Ruckig factory.
 * Numerical orchestration, mode disables and plot definitions execute unchanged.
 */
export async function legacy(plane, control, ruckig) {
    const elements = new Map()
    let axis = 'R', mode = 'angle'
    /** Resolve legacy-owned controls without browser rendering. */
    function element(id) { if (!elements.has(id)) elements.set(id, { value: '', disabled: false, hidden: false }); return elements.get(id) }
    const context = vm.createContext({ console,
        ControlModule: async () => control,
        document: { getElementById: element, querySelector: selector => ({ value: selector.includes('axis') ? axis : mode }) },
        Plotly: { purge() {}, newPlot() {}, redraw() {} },
        link_plot_axis_range() {}, link_plot_reset() {},
    })
    vm.runInContext(original('Libraries/Array_Math.js').toString(), context)
    const script = new vm.Script(original(`KinematicTool/${plane ? 'plane/' : ''}KinematicTool.js`).toString(), {
        importModuleDynamically: async () => {
            const module = new vm.SyntheticModule(['default'], function () { this.setExport('default', async () => ruckig) })
            await module.link(() => {}); await module.evaluate(); return module
        },
    })
    script.runInContext(context)
    vm.runInContext('initial_load()', context)
    return {
        /** Evaluate a scenario and serialize the legacy plot output without normalization. */
        async run(values, nextAxis, nextMode) {
            for (const [id, value] of Object.entries(values)) element(id).value = value
            axis = nextAxis; mode = nextMode
            await vm.runInContext('run_attitude()', context)
            return JSON.parse(vm.runInContext('JSON.stringify([ang_pos,ang_vel,ang_accel,ang_jerk])', context))
        },
        elements,
    }
}
