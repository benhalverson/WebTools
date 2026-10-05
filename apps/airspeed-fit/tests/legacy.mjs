import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
export const root = fileURLToPath(new URL('../../../', import.meta.url))
export const comparison = '0f4607db3dccbc7d06e5847c02465dab38d1eb80'
/** Read the actual branch-base bytes, never the migrated implementation. */
export function original(path) {
    return execFileSync('git', ['show', `${comparison}:${path}`], {
        cwd: root,
        maxBuffer: 32 * 1024 * 1024,
        encoding: 'utf8',
    })
}
/** Load the pinned matrix and complete unchanged legacy core in an isolated realm. */
export function legacyCore() {
    const context = vm.createContext({ console })
    vm.runInContext(original('modules/build/matrix/matrix.umd.js'), context)
    vm.runInContext(original('AirspeedFit/airspeedfit_core.js'), context)
    return context
}
/** Run unchanged legacy loading and fitting with only its DOM/render/network edges
 * replaced. The numerical adapter, window heuristics, seeds, fits and export formatter
 * execute from actual base bytes, independently of the migrated modules. */
export async function legacyFlight(Parser, bytes) {
    const context = legacyCore()
    const elements = new Map()
    /** Minimal scalar controls keep original UI reads/writes observable in Node. */
    const element = (id) => {
        if (!elements.has(id))
            elements.set(id, {
                value: id === 'q_slider' ? '-1.5' : id === 'ground_temp' ? '15' : '',
                children: [{}],
                style: {},
                replaceChildren() {},
                appendChild() {},
                setAttribute() {},
                addEventListener() {},
            })
        return elements.get(id)
    }
    Object.assign(context, {
        DataflashParser: Parser,
        document: { getElementById: element },
        alert(message) {
            if (!message.startsWith('Saved:')) throw new Error(message)
        },
        Blob,
        confirm: () => true,
        saveAs(blob) {
            context.saved = blob
        },
    })
    for (const path of ['Libraries/Array_Math.js', 'Libraries/Param_Helpers.js'])
        vm.runInContext(original(path), context)
    let source = original('AirspeedFit/airspeedfit.js')
    source = source.replace(/const import_done = import\([^\n]+/, 'const import_done = Promise.resolve();')
    vm.runInContext(source, context)
    vm.runInContext(
        `
 const open_in_update = () => {};
 add_velocity_source = (source, checked) => { source.select = {checked}; };
 build_sensor_summaries = build_wind_model_ui = build_param_rows = build_flight_data_plot = redraw = update_saved_params = update_temp_debug = () => {};
 fill_weather_temp = async () => false;
 set_temp_select = () => { const v=log_data.temp_sources.isa?.value; if(v != null) document.getElementById('ground_temp').value=v.toFixed(0); };
 flight_data.layout = {xaxis:{}};
 `,
        context,
    )
    await context.load(bytes)
    return { context, element }
}
/** JSON is the legacy serialization contract, including non-finite-to-null handling. */
export function serialized(value) {
    return JSON.stringify(value)
}
