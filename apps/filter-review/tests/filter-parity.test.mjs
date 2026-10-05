import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readTracking, targets } from '../src/tracking.ts'
import { transfer } from '../src/filters.ts'
import { filterOracle } from './filter-oracle.mjs'

/** Build log-shaped synthetic samples with Float64 numeric boundaries. */
function trackingLog() {
    const messages = {
        PARM: { Name: ['INS_GYR_ID'], Value: [1] }, RATE: { TimeUS: [0, 1e6, 2e6], AOut: [0, 0.25, 1] },
        RPM: { TimeUS: [0, 1e6, 2e6], rpm1: [-1, 6000, 12000], rpm2: [0, 3000, 9000] },
        FTN1: { TimeUS: [0, 1e6, 2e6], PkAvg: [50, 80, 100] },
    }
    const instances = {
        ESC: { 0: { TimeUS: [0, 1e6, 2e6], RPM: [6000, 9000, 12000] }, 1: { TimeUS: [1, 1000001, 2000001], RPM: [5500, 8500, 11500] } },
        FTN2: { 0: { TimeUS: [0, 1e6, 2e6], PkX: [20, 40, 60], PkY: [30, 50, 70], EnX: [1, 0, 2], EnY: [2, 1, 1] } },
    }
    /** Preserve strings and turn numeric message fields into parser-style views. */
    const field = value => typeof value?.[0] === 'string' ? value : new Float64Array(value)
    return { messages, instances, messageTypes: Object.fromEntries([...Object.entries(messages).map(([name, message]) => [name, { expressions: Object.keys(message) }]), ...Object.entries(instances).map(([name, data]) => [name, { instances: Object.fromEntries(Object.keys(data).map(key => [key, name + '[' + key + ']'])), expressions: Object.keys(data[0]) }])]),
        get: (name, key) => key ? field(messages[name]?.[key]) : Object.fromEntries(Object.entries(messages[name] ?? {}).map(([key, value]) => [key, field(value)])),
        get_instance: (name, instance, key) => field(instances[name]?.[instance]?.[key]),
    }
}
const config = { enable: 1, mode: 0, freq: 80, bandwidth: 40, attenuation: 40, ref: 1, min_ratio: 0.5, harmonics: 3, options: 0 }
const spectrum = { bins: [0, 10, 30, 60, 80, 100, 150, 200, 400, 500], time: [0.1, 0.5, 1, 1.5], average_sample_rate: 1000 }
for (const version of [1, 2, 3, 4]) for (const mode of [0, 1, 2, 3, 4, 5]) for (const options of [0, 1, 2, 3, 16, 18, 32, 64, 66, 81]) {
    test(`exact transfer V${version}, mode ${mode}, options ${options}`, () => {
        const log = trackingLog(), notch = { ...config, mode, options }
        const expected = filterOracle(log, version, [notch])
        const actual = transfer({ version, lowpass: 20, notches: [notch] }, readTracking(log), spectrum.time, spectrum.bins, spectrum.average_sample_rate)
        assert.deepEqual(actual, structuredClone(expected.transfer(spectrum)))
        if (mode !== 0 && !(mode === 1 && options & 2)) assert.deepEqual(targets(readTracking(log), notch, version, spectrum.time), structuredClone(expected.targets(mode, notch, spectrum.time)))
    })
}

const { compare, predicted, bode } = await import('../src/comparison.ts')
const { aliasing } = await import('../src/aliasing.ts')
const { hanning, window_correction_factors } = await import('../../../packages/numerics/dist/index.js')
const samples = { ...spectrum, window_size: 1024, correction: window_correction_factors(hanning(1024)),
    x: spectrum.time.map((_time, i) => spectrum.bins.map((_bin, j) => (i + 1) * (j + 1) / 100)),
    y: spectrum.time.map((_time, i) => spectrum.bins.map((_bin, j) => (i + 1) * (j + 1) / 200)),
    z: spectrum.time.map((_time, i) => spectrum.bins.map((_bin, j) => (i + 1) * (j + 1) / 400)),
}
for (const scale of ['linear','db','psd']) for (const batch of [true,false]) for (const mode of ['none','fold','only']) test(`legacy predicted spectra and Bode ${scale}/${batch}/${mode}`, () => {
    const log=trackingLog(), notch={...config,mode:3,options:3}, filters={version:4,lowpass:20,notches:[notch]}
    const oracle=filterOracle(log,4,[notch]), response=compare(samples,filters,readTracking(log))
    const alias=aliasing(samples,mode,400)
    for(const [start,end] of [[0,10],[0.5,1.1],[8,9],[-4,-1]]) {
        const expected=structuredClone(oracle.display(samples,start,end,scale,batch,mode))
        const actual=predicted(samples,response.transfer,start,end,scale,batch,alias)
        assert.deepEqual([actual.x,actual.y,actual.z],expected.spectra)
        const actualBode=bode(response,samples.time,start,end,scale,false)
        assert.deepEqual(actualBode.amplitude,expected.bode[2].y)
        assert.deepEqual(actualBode.degrees,expected.bode[3].y)
    }
})

for (const version of [1,2,3,4]) for (const mode of [0,1,2,3,4,5]) for (const frequency of [-80,0,10,80,600]) test(`target boundaries V${version}/${mode}/${frequency}`,()=>{
    const log=trackingLog(), notch={...config,mode,freq:frequency,ref:frequency===0?0:-0.5,options:35}
    const legacy=filterOracle(log,version,[notch,{...config,options:16}],0)
    assert.deepEqual(transfer({version,lowpass:0,notches:[notch,{...config,options:16}]},readTracking(log),spectrum.time,spectrum.bins,1000),structuredClone(legacy.transfer(spectrum)))
})

for (const expo of [0,0.65,-0.5,2]) for (const battery of [true,false]) test(`multi-source throttle compensation expo=${expo} battery=${battery}`,()=>{
    const log=trackingLog()
    const values={FRAME_CLASS:1,BARO_PRIMARY:0,MOT_THST_EXPO:expo,MOT_SPIN_MAX:0.95,MOT_SPIN_MIN:0.1,MOT_PWM_MIN:1000,MOT_PWM_MAX:2000,MOT_BAT_VOLT_MIN:9,MOT_BAT_VOLT_MAX:battery?12:0,MOT_BAT_IDX:0,MOT_OPTIONS:0,SERVO1_FUNCTION:33,SERVO2_FUNCTION:34,SERVO3_FUNCTION:35,SERVO4_FUNCTION:36}
    log.messages.PARM.Name.push(...Object.keys(values));log.messages.PARM.Value.push(...Object.values(values))
    log.messages.RCOU={TimeUS:[0,1e6,2e6],C1:[900,1500,2100],C2:[1000,1600,2000],C3:[1100,1700,1900],C4:[1200,1800,1800]}
    log.messageTypes.RCOU={expressions:Object.keys(log.messages.RCOU)}
    for(const [name,data] of Object.entries({BAT:{TimeUS:[0,1e6,2e6],Volt:[2,10,12],VoltR:[3,11,13]},BARO:{TimeUS:[0,1e6,2e6],Alt:[0,1000,10000]}})){
        log.instances[name]={0:data};log.messageTypes[name]={instances:{0:name+'[0]'},expressions:Object.keys(data)}
    }
    const notch={...config,mode:1,options:2}
    const oracle=filterOracle(log,4,[notch]), actual=readTracking(log)
    const expected=oracle.context.tracking_methods[1].data.map(data=>({time:data.time,value:data.thrust}))
    assert.deepEqual(actual.sources[1].instances,structuredClone(expected))
    assert.deepEqual(transfer({version:4,lowpass:20,notches:[notch]},actual,spectrum.time,spectrum.bins,1000),structuredClone(oracle.transfer(spectrum)))
})

const { readFileSync } = await import('node:fs')
const { createHash } = await import('node:crypto')
const { default: vm } = await import('node:vm')
const { calculate } = await import('../src/spectrum.ts')
test('recorded upstream pitch-rate sweep: unchanged sample bytes, FFT and filtered comparisons', () => {
    const bytes=readFileSync(new URL('./fixtures/pitch-rate-sweep.dat',import.meta.url))
    const provenance=JSON.parse(readFileSync(new URL('./fixtures/pitch-rate-sweep.provenance.json',import.meta.url),'utf8'))
    assert.equal(createHash('sha256').update(bytes).digest('hex'),provenance.sha256)
    const lines=bytes.toString().trim().split('\n'), interval=Number(lines[0].split(' ')[0]), rows=lines.slice(2).map(line=>line.trim().split(/\s+/).map(Number))
    // The same recorded pitch-rate channel exercises all three axis paths. No
    // reconstructed container is presented as an original DataFlash recording.
    const rate=rows.map(row=>row[4]), sensor={instance:0,sensor:0,postFilter:false,batches:[{sample_time:rows[0][0],sample_rate:1/interval,x:rate,y:rate,z:rate}]}
    const spectrum=calculate(sensor,'raw',{size:256,perBatch:1},()=>{})
    const log=trackingLog(), notch={...config,mode:0,freq:8,bandwidth:4}, filters={version:4,lowpass:10,notches:[notch]}
    const oracle=filterOracle(log,4,[notch],10)
    oracle.context.Gyro_batch={type:'raw'}
    oracle.controls.FFTWindow_size={value:'256'};oracle.controls.FFTWindow_per_batch={value:'1'}
    vm.runInContext(readFileSync(new URL('../../../modules/fft.js/dist/fft.js',import.meta.url),'utf8'),oracle.context)
    assert.deepEqual(spectrum,structuredClone(oracle.context.run_batch_fft(sensor.batches)))
    const response=compare(spectrum,filters,readTracking(log))
    for(const [start,end] of [[spectrum.time[0],spectrum.time.at(-1)],[spectrum.time[0]+1,spectrum.time.at(-1)-1]])for(const mode of ['linear','db','psd']){
        const expected=structuredClone(oracle.display(spectrum,start,end,mode,false))
        const actual=predicted(spectrum,response.transfer,start,end,mode,false)
        assert.deepEqual([actual.x,actual.y,actual.z],expected.spectra)
        assert.deepEqual(bode(response,spectrum.time,start,end,mode,false).amplitude,expected.bode[2].y)
    }
})
