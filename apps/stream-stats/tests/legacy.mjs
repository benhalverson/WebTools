import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
export const comparisonRevision = '0f4607db3dccbc7d06e5847c02465dab38d1eb80'
/** Read immutable comparison source from the actual app branch base. */
export function original(path) { return execFileSync('git', ['show', `${comparisonRevision}:${path}`], { encoding: 'utf8' }) }
/** Execute the unchanged page functions with inert DOM/Plotly boundaries. */
export function legacy(Parser) {
    /** Model only DOM mutations used by the owned legacy statistics page. */
    function element() { return { checked: true, value: '10', style: {}, parentElement: {}, previousElementSibling: {}, appendChild() {}, replaceChildren() {}, setAttribute() {}, addEventListener() {}, removeAllListeners() {} } }
    const nodes = new Map()
    const context = vm.createContext({ console: { log() {} }, performance, alert() {}, document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id) }, createElement: element, createTextNode: String }, Plotly: { purge() {}, newPlot() {}, redraw() {} }, open_in_update() {}, link_plot_axis_range() {}, link_plot_reset() {} })
    vm.runInContext(original('Libraries/Array_Math.js'), context)
    vm.runInContext(original('StreamStats/mavlink_msgs.js'), context)
    // The import is the sole asynchronous bootstrap; inject the exact pinned parser.
    vm.runInContext(original('StreamStats/StreamStats.js').replace("import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });", ''), context)
    context.DataflashParser = Parser
    return {
        /** Run binary or tlog ingestion and expose a JSON snapshot of public plots. */
        load(bytes, binary) { context.bytes = bytes; vm.runInContext(`reset(); ${binary ? 'load_log' : 'load_tlog'}(bytes)`, context) },
        /** Apply legacy units/window and exact component/message include flags. */
        snapshot(width, bits, excluded = []) {
            nodes.get('WindowSize').value = String(width); nodes.get('Unit_bps').checked = bits
            context.excluded = excluded
            vm.runInContext(`if (system) for (const [s, sys] of Object.entries(system)) for (const [c, comp] of Object.entries(sys)) { comp.include.checked = !excluded.includes(s+','+c); for (const [name,msg] of Object.entries(comp.msg)) msg.include.checked = !excluded.includes(s+','+c+','+name) } replot()`, context)
            return JSON.parse(vm.runInContext('JSON.stringify({ messages: data_rates.data, total: total_rate.data, composition: log_stats.data })', context))
        },
        /** Serialize protocol statistics without DOM checkboxes for direct comparison. */
        systems() { return vm.runInContext("JSON.stringify(system, (key,value) => key === 'include' ? undefined : value instanceof Set ? [...value] : value)", context) },
    }
}
