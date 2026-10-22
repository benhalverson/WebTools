import { execFileSync } from 'node:child_process'
import vm from 'node:vm'

export const comparisonRevision = 'bbbd72a'
/** Evaluate the actual unchanged legacy implementations from current-main base. */
export function filterOracle(log, version, configs, lowpass = 20) {
    const controls = { TimeStart: { value: 0 }, TimeEnd: { value: 10 }, ScaleWrap: { checked: false }, Aliasing_none: { checked: true } }
    const warnings = []
    const context = vm.createContext({ console: { log() {} }, alert: message => warnings.push(message), document: { getElementById: id => controls[id] ?? {} }, Plotly: { redraw() {} } })
    const files = ['Libraries/Array_Math.js', 'Libraries/fft.js', 'Libraries/Param_Helpers.js', 'Libraries/LogHelpers.js', 'FilterReview/FilterReview.js', ...['BaseClass', 'Atmosphere_model', 'Static', 'RPM', 'ESC', 'FFT', 'Throttle', 'Logged'].map(name => 'FilterReview/tracking/' + name + '.js')]
    for (const name of files) vm.runInContext(execFileSync('git', ['show', comparisonRevision + ':' + name], { encoding: 'utf8' }).replace(/^const import_done = import.*$/m, ''), context)
    context.log = log; context.version = version; context.configs = configs; context.lowpass = lowpass
    vm.runInContext(`filter_version = version;
        tracking_methods = [new StaticTarget(), new ThrottleTarget(log), new RPMTarget(log,1,2), new ESCTarget(log),new FFTTarget(log),new RPMTarget(log,2,5)];
        filters = {static:new DigitalBiquadFilter(lowpass),notch:configs.map(config => new HarmonicNotchFilter(config))};`, context)
    return {
        context, controls, warnings,
        /** Run original interpolation and transfer calculation for the exact FFT grid. */
        transfer(spectrum) {
            context.spectrum = spectrum
            vm.runInContext(`Gyro_batch=[{sensor_num:0,post_filter:false,FFT:{...spectrum}}];
                Gyro_batch.start_time=0;Gyro_batch.end_time=10;
                var Z=exp_jw(spectrum.bins,spectrum.average_sample_rate);
                Gyro_batch[0].FFT.Z1=complex_inverse(Z);Gyro_batch[0].FFT.Z2=complex_inverse(complex_square(Z));
                for (const tracking of tracking_methods) tracking.interpolate(0,spectrum.time);
                calculate_transfer_function();`, context)
            return context.Gyro_batch[0].FFT.H
        },
        /** Run legacy plot calculations with in-memory plot targets. */
        display(spectrum, start, end, mode, batch, alias = 'none', loopRate = 400, wrap = false) {
            this.transfer(spectrum)
            controls.TimeStart.value = start; controls.TimeEnd.value = end
            controls.ScaleLog = { checked: mode === 'db' }; controls.ScalePSD = { checked: mode === 'psd' }
            controls.ScaleWrap.checked = wrap; controls.BodeGyroInst0 = { checked: true }
            controls.Aliasing_none.checked = alias === 'none'; controls.Aliasing_only = { checked: alias === 'only' }; controls.SCHED_LOOP_RATE = { value: loopRate }
            context.batch = batch
            vm.runInContext(`
                amplitude_scale=get_amplitude_scale();frequency_scale=get_frequency_scale();
                Gyro_batch.quantization_noise=batch ? 1/(Math.sqrt(3)*2**(16-0.5)) : 0;
                var bodeFreq=array_from_range(0,spectrum.bins.at(-1),0.05);
                var bodeZ=exp_jw(bodeFreq,spectrum.average_sample_rate);
                Gyro_batch[0].FFT.bode={freq:bodeFreq,Z1:complex_inverse(bodeZ),Z2:complex_inverse(complex_square(bodeZ))};
                calculate_transfer_function();
                fft_plot={data:Array.from({length:27},()=>({})),layout:{}};
                Bode={data:Array.from({length:4},()=>({})),layout:{xaxis:{},xaxis2:{title:{}},yaxis:{title:{}},yaxis2:{}}};
                redraw_post_estimate_and_bode();`,context)
            return { spectra: [0,1,2].map(axis=>context.fft_plot.data[context.get_FFT_data_index(0,2,axis)].y), bode:context.Bode.data }
        },
        /** Invoke legacy alias resampling without changing its arithmetic. */
        alias(spectrum, mode, loopRate, amplitude) {
            controls.Aliasing_none.checked = mode === 'none'; controls.Aliasing_only = { checked: mode === 'only' }; controls.SCHED_LOOP_RATE = { value: loopRate }
            const alias = context.get_alias_obj(spectrum)
            return { bins: alias.bins, value: alias.apply_amp(amplitude) }
        },
        /** Execute source target conversion on already interpolated values. */
        targets(mode, config, time) {
            context.config = config; context.time = time; context.mode = mode
            return vm.runInContext('tracking_methods[mode].interpolate(0,time);time.map((_,i)=>tracking_methods[mode].get_interpolated_target_freq(0,i,config))', context)
        },
    }
}
