import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

export const comparisonRevision = '0c4e5cabd69576f026095d6b715a1d2f72d9d471'
/** Serialize numeric views as sample arrays for exact byte comparisons. */
export function serialize(value) { return JSON.stringify(value, (_key, item) => ArrayBuffer.isView(item) ? Array.from(item) : item) }

/** Evaluate unchanged source from the actual integrated branch base. Only the
 * dynamic import is omitted; parser input is supplied separately. Legacy redraw
 * itself computes the displayed spectrum, with later-stage plot calls stubbed. */
export function oracle(log, source, settings) {
    const controls = { FFTWindow_size: { value: settings.size }, FFTWindow_per_batch: { value: settings.perBatch }, Aliasing_none: { checked: true } }
    const context = vm.createContext({
        console: { log() {} }, alert() {},
        document: { getElementById: id => controls[id] ?? {} },
        Plotly: { redraw() {} },
    })
    for (const name of ['Libraries/Array_Math.js', 'Libraries/fft.js', 'Libraries/Param_Helpers.js', 'FilterReview/FilterReview.js']) {
        const sourceCode = execFileSync('git', ['show', comparisonRevision + ':' + name], { encoding: 'utf8' })
        vm.runInContext(sourceCode.replace(/^const import_done = import.*$/m, ''), context)
    }
    vm.runInContext(readFileSync(new URL('../../../modules/fft.js/dist/fft.js', import.meta.url), 'utf8'), context)
    context.log = log
    context.source = source
    vm.runInContext(`
        const params = log.get('PARM')
        const param = name => get_param_value(params, name, false)
        const count = ['INS_GYR_ID','INS_GYR2_ID','INS_GYR3_ID'].filter(name => param(name) > 0).length
        if (source === 'raw') load_from_raw_log(log, count, [], param)
        else load_from_batch(log, count, [], param)
    `, context)
    return {
        batches: context.Gyro_batch,
        /** Execute the original throttle cropping statements in their own closure. */
        initialRange() {
            const code = execFileSync('git', ['show', comparisonRevision + ':FilterReview/FilterReview.js'], { encoding: 'utf8' })
            const throttle = code.slice(code.indexOf('    let first_throttle_time'), code.indexOf('    if ("POS" in log.messageTypes)'))
            const ranges = code.slice(code.indexOf('    let data_start_time'), code.indexOf('    Plotly.redraw("FlightData")', code.indexOf('    let data_start_time')))
            return vm.runInContext('(function(){ flight_data = {data:[{},{},{}],layout:{xaxis:{}}};' + throttle + ranges + ';return [calc_start_time,calc_end_time] })()', context)
        },
        /** Run the original FFT function over the requested original samples. */
        spectrum(instance) { return context.run_batch_fft(context.Gyro_batch[instance]) },
        /** Call the actual legacy redraw to calculate all displayed axis values. */
        display(instance, spectrum, start, end, scale) {
            controls.TimeStart = { value: start }; controls.TimeEnd = { value: end }
            controls.ScaleLog = { checked: scale === 'db' }; controls.ScalePSD = { checked: scale === 'psd' }
            context.Gyro_batch[instance].FFT = spectrum
            context.fft_plot = { data: Array.from({ length: 27 }, () => ({})), layout: { xaxis: { title: {} }, yaxis: { title: {} }, shapes: [] } }
            context.filters = { notch: [] }
            context.redraw_post_estimate_and_bode = () => {}
            context.redraw_Spectrogram = () => {}
            context.redraw()
            const batch = context.Gyro_batch[instance]
            return Object.fromEntries(['x', 'y', 'z'].map((axis, i) => [axis, context.fft_plot.data[context.get_FFT_data_index(batch.sensor_num, batch.post_filter ? 1 : 0, i)].y]))
        },
        /** Read the original neighboring-window selection indices. */
        selection(time, start, end) {
            controls.TimeStart = { value: start }; controls.TimeEnd = { value: end }
            return [context.find_start_index(time), context.find_end_index(time) + 1]
        },
    }
}
