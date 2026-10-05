import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import assert from 'node:assert/strict'

export const comparisonRevision = 'bbbd72a47a9354f06d767fe40decfca6ed74aada'

/** Execute unchanged legacy owned functions, substituting only parser import and DOM/vendor rendering boundaries. */
export async function legacy(Constructor, size = 128) {
    const elements = new Map()
    /** Supply the small DOM surface used by plots and controls while retaining observable values. */
    function element(id) {
        if (!elements.has(id)) elements.set(id, { value: 0, checked: false, disabled: false, on() {}, removeAllListeners() {} })
        return elements.get(id)
    }
    element('FFTWindow_size').value = size; element('ScaleLog').checked = true; element('freq_Scale_Hz').checked = true; element('Spec_Out').checked = true
    const context = vm.createContext({ Constructor, console: { log() {} }, performance, alert(message) { throw new Error(message) }, document: { getElementById: element }, Plotly: { purge() {}, newPlot() {}, redraw() {} } })
    for (const name of ['modules/fft.js/dist/fft.js', 'Libraries/Array_Math.js', 'Libraries/fft.js', 'Libraries/Plotly_helpers.js', 'Libraries/LogHelpers.js']) vm.runInContext(await readFile(new URL('../../../' + name, import.meta.url), 'utf8'), context)
    const source = await readFile(new URL('../../../PIDReview/PIDReview.js', import.meta.url), 'utf8')
    assert.equal(createHash('sha256').update(source).digest('hex'), '618853f76c1855c00a9c93c9e5c99af82a2ee509e9b929045f51ba4b007c2363')
    vm.runInContext(source.replace("const import_done = import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });", 'const import_done = Promise.resolve(); DataflashParser = Constructor;'), context)
    vm.runInContext('setup_plots(); open_in_update = () => {}; add_param_sets = () => {};', context)
    return {
        context, element,
        /** Load exactly the bytes passed to the migrated model, keeping parser and owned numerical code unchanged. */
        async load(bytes) { await context.load(bytes); return vm.runInContext('PID_log_messages', context) },
        /** Select a controller and rebuild actual legacy trace values at a requested analysis window and scale. */
        draw(index, start, end, scale = 'db') {
            const controllers = vm.runInContext('PID_log_messages', context)
            controllers.forEach((controller, i) => { element('type_' + controller.id.join('_')).checked = i === index })
            element('TimeStart').value = start; element('TimeEnd').value = end; element('ScaleLog').checked = scale === 'db'; element('ScalePSD').checked = scale === 'psd'
            controllers[index].params.sets.forEach((_, i) => { element('set_selection_' + i).checked = true })
            vm.runInContext('setup_FFT_data(); redraw()', context)
            return vm.runInContext('({TimeInputs,TimeOutputs,fft_plot,step_plot,Spectrogram})', context)
        },
    }
}
