import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { loadDataflashParser } from '@webtools/dataflash'
import { calculateAnalysis } from '../src/controller.ts'
import { inspectLog } from '../src/analysis.ts'
import { responsePlots, loops } from '../src/plots.ts'
import { createLogFixture } from './fixtures.cjs'

const revision = 'bbbd72a47a9354f06d767fe40decfca6ed74aada'
const root = new URL('../../../', import.meta.url)
/** Read a retained oracle only after checking its bytes against the comparison revision. */
function unchanged(path) {
    const source = readFileSync(new URL(path, root), 'utf8')
    assert.equal(source, execFileSync('git', ['show', `${revision}:${path}`], { cwd: root, encoding: 'utf8' }))
    return source
}
const page = unchanged('AnalyticTune/AnalyticTune.js')
const arraySource = unchanged('Libraries/Array_Math.js')
const fftSource = unchanged('Libraries/fft.js')
const fftVendor = readFileSync(new URL('modules/fft.js/dist/fft.js', root), 'utf8')
globalThis.self = { /** Supply the worker-registration surface needed by the unmodified parser. */ addEventListener() {} }
const Parser = await loadDataflashParser()

/** Copy realm-specific containers while preserving every number, undefined and array length. */
function plain(value) {
    if (Array.isArray(value)) return Array.from(value, plain)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]))
    return value
}
/** Run the original full analysis with only its page/UI effects replaced. */
function oracle(log, parameters, vehicle, axis, ang, start, end, windowSize, attitude) {
    const values = { ...parameters, starttime: start, endtime: end, FFTWindow_size: windowSize }
    const checks = { UseAttitude: attitude }
    const context = vm.createContext({ document: { getElementById: id => ({ value: String(values[id]), checked: !!checks[id] }) }, performance: { now: () => 0 }, console: { log() {} }, alert() {} })
    vm.runInContext(fftVendor, context)
    vm.runInContext(arraySource + '\n' + fftSource + '\n' + page.replace(/import\('\.\.\/modules\/JsDataflashParser\/parser\.js'\)\.then\([^\n]+/, ''), context)
    Object.assign(context, { log, vehicle_type: vehicle, page_axis: axis, use_ANG_message: ang, amplitude_scale: { window_correction: () => 1 }, update_PID_filters() {} })
    vm.runInContext("log = globalThis.log", context)
    const redraw = context.redraw_freq_resp
    context.redraw_freq_resp = () => {}
    context.calculate_freq_resp()
    context.redraw_freq_resp = redraw
    return { context, checks, result: plain({ calculated: context.calc_freq_resp, predicted: context.pred_freq_resp }) }
}
/** Parse generated DataFlash bytes using the real pinned parser boundary. */
function fixture(vehicle, ang) {
    const bytes = createLogFixture({ vehicle, ang, samples: 1024 })
    const log = new Parser()
    log.processData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), [])
    return { log, state: inspectLog(log) }
}
/** Fill runtime controls and apply a repeatable gain/notch edit to every vehicle axis. */
function tune(state, changed) {
    const parameters = { ...state.parameters, GyroSampleRate: 1000, Throttle: .4, RPM1: 6000, RPM2: 6500, ESC_RPM: 6700, NUM_MOTORS: 4 }
    for (const prefix of ['ATC_RAT_RLL_','ATC_RAT_PIT_','ATC_RAT_YAW_','Q_A_RAT_RLL_','Q_A_RAT_PIT_','Q_A_RAT_YAW_','RLL_RATE_','PTCH_RATE_','YAW_RATE_']) {
        parameters[prefix+'D_FF'] = changed ? .001 : 0
        if (changed) { parameters[prefix+'P'] = .19; parameters[prefix+'NEF'] = 1; parameters[prefix+'NTF'] = 2; parameters[prefix+'FLTT'] = 35 }
    }
    if (changed) { parameters.INS_HNTCH_ENABLE = 1; parameters.INS_HNTCH_MODE = 1; parameters.INS_HNTCH_OPTS = 16; parameters.INS_HNTCH_HMNCS = 7 }
    return parameters
}

for (const vehicle of ['ArduCopter','ArduPlane_VTOL','ArduPlane_FW']) for (const ang of [false,true]) {
    test(`real binary integrated legacy differential: ${vehicle}, ${ang ? 'ANG' : 'ATT'}, axes/intervals/tunes/attitude`, () => {
        const {log,state} = fixture(vehicle,ang)
        for (const axis of ['Roll','Pitch','Yaw']) for (const set of state.sidSets) for (const changed of [false,true]) for (const attitude of [false,true]) {
            const parameters = tune(state,changed)
            const start = set.start + (changed ? .1375 : 0)
            const end = set.end - (changed ? .22 : 0)
            const expected = oracle(log,parameters,vehicle,axis,ang,start,end,256,attitude).result
            const actual = calculateAnalysis(log,start,end,axis,vehicle,256,attitude,parameters)
            assert.deepEqual(actual,expected,`${axis} ${start}-${end} changed=${changed} attitude=${attitude}`)
            assert.equal(actual.calculated.freq.length,128)
            assert.ok(actual.calculated.bareAC_H[0].every(Number.isFinite))
            // The retained off-by-one prediction loops deliberately append NaN to these two responses.
            for (const key of ['attctrl_ff_H','sysbl_H']) {
                assert.equal(actual.predicted[key][0].length,129)
                assert.ok(Number.isNaN(actual.predicted[key][0].at(-1)))
                assert.ok(Number.isNaN(actual.predicted[key][1].at(-1)))
            }
        }
    })
}

test('invalid FFT sizes and intervals without enough samples surface errors', () => {
    const {log,state} = fixture('ArduCopter',false)
    const parameters = tune(state,false)
    assert.throws(() => calculateAnalysis(log,state.start,state.end,'Roll',state.vehicle,300,false,parameters), /power of two/)
    assert.throws(() => calculateAnalysis(log,state.start,state.start+.01,'Roll',state.vehicle,256,false,parameters))
})

/** Create the minimal existing trace/layout containers consumed by legacy redraw. */
function plotContainer() {
    return { data: [{}, {}], layout: { xaxis: { title: {} }, yaxis: { title: {} } } }
}
/** Select only numeric/visibility plot contracts, leaving renderer styling separately tested. */
function traceData(trace) {
    return { x: plain(trace.x), y: plain(trace.y), visible: trace.visible }
}

test('all plot loops, SID eligibility and display scales match legacy redraw exactly', () => {
    const {log,state} = fixture('ArduCopter',false)
    const parameters = tune(state,true)
    const {context,checks,result} = oracle(log,parameters,state.vehicle,'Roll',false,state.start,state.end,256,false)
    context.Plotly = { redraw() {} }
    context.fft_plot = plotContainer()
    context.fft_plot_Phase = plotContainer()
    context.fft_plot_Coh = plotContainer()
    for (const [loop] of loops) for (const sidAxis of [1,4,7,10,20,23]) for (const gain of ['Log','Linear']) for (const phase of ['wrap','unwrap']) for (const frequency of ['Log','Linear']) for (const unit of ['Hz','RPS']) {
        for (const [candidate] of loops) checks[`type_${candidate}`] = candidate === loop
        Object.assign(checks,{PID_ScaleLog:gain==='Log',PID_ScaleUnWrap:phase==='unwrap',PID_freq_ScaleLog:frequency==='Log',PID_freq_Scale_RPS:unit==='RPS'})
        context.sid_axis = sidAxis
        context.redraw_freq_resp()
        const expected = [context.fft_plot,context.fft_plot_Phase,context.fft_plot_Coh].map(plot => plot.data.map(traceData))
        const actual = responsePlots(result,{loop,gain,phase,frequency,unit,useAttitude:false},sidAxis).map(plot => plot.map(traceData))
        assert.deepEqual(actual,expected,`${loop} SID ${sidAxis} ${gain}/${phase}/${frequency}/${unit}`)
    }
})
