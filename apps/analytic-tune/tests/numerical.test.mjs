import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import vm from 'node:vm';
import * as filters from '../src/filters.ts';
import { calculate_predicted_TF, calculate_freq_resp_from_FFT } from '../src/response.ts';

const revision = 'bbbd72a47a9354f06d767fe40decfca6ed74aada';
const root = new URL('../../../', import.meta.url);
/** Read the unchanged oracle and ensure it still matches the recorded comparison revision. */
function source(path) {
    const checkedIn = readFileSync(new URL(path, root), 'utf8');
    assert.equal(checkedIn, execFileSync('git', ['show', `${revision}:${path}`], { cwd: root, encoding: 'utf8' }));
    return checkedIn;
}
const page = source('AnalyticTune/AnalyticTune.js');
const arrayMath = source('Libraries/Array_Math.js');
/** Create an isolated legacy VM with explicit stand-ins for form values only. */
function legacy(parameters = {}) {
    const context = vm.createContext({ document: { getElementById: id => ({ value: parameters[id] }) } });
    vm.runInContext(arrayMath, context);
    vm.runInContext(page.replace(/import\('\.\.\/modules\/JsDataflashParser\/parser\.js'\)\.then\([^\n]+/, ''), context);
    return context;
}
/** Copy foreign-realm objects without losing NaN, infinities, holes or signed zero. */
function plain(value) {
    if (Array.isArray(value)) return Array.from(value, plain);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
    return value;
}

test('all owned filters match the recorded unchanged legacy coefficients, response and phase exactly', () => {
    const runtime = { Throttle: .4, RPM1: 6900, RPM2: 5100, NUM_MOTORS: 4, ESC_RPM: 7300 };
    const context = legacy(runtime);
    const scenarios = [
        ['PID', [400,.12,.06,.003,20,35]], ['PID', [800,0,0,0,0,0]],
        ['Ang_P',[400,4.5]], ['feedforward',[400,.17,.001]],
        ['LPF_1P',[400,0]], ['LPF_1P',[400,30]],
        ['DigitalBiquadFilter',[1000,0]], ['DigitalBiquadFilter',[1000,80]],
        ['NotchFilterusingQ',[1000,120,3,40]], ['NotchFilterusingQ',[1000,500,3,40]],
        ['NotchFilter',[1000,120,60,40]], ['NotchFilter',[1000,10,30,40]],
    ];
    for (const mode of [0,1,2,3,5]) for (const opts of [0,1,2,16,18]) {
        scenarios.push(['HarmonicNotchFilter',[1000,1,mode,70,40,35,.6,.5,255,opts]]);
    }
    scenarios.push(['HarmonicNotchFilter',[1000,0,0,70,40,35,.6,.5,7,0]]);
    for (const [name, args] of scenarios) for (const db of [false,true]) for (const unwrapped of [false,true]) {
        const old = new context[name](...args);
        const current = new filters[name](...args, ...(name === 'HarmonicNotchFilter' ? [runtime] : []));
        // Bandwidth notches are internal to harmonic groups and carry sample_freq, not sample_rate.
        if (name === 'NotchFilter') { old.sample_rate = args[0]; current.sample_rate = args[0]; }
        const expected = context.evaluate_transfer_functions([[old]], 200, 1.25, db, unwrapped);
        const actual = filters.evaluate_transfer_functions([[current]], 200, 1.25, db, unwrapped);
        assert.deepEqual(actual, plain(expected), `${name} ${args} db=${db} unwrap=${unwrapped}`);
        for (const key of ['alpha','b0','b1','b2','a1','a2','a0_inv','A','Q','initialised','enabled','attenuation','phase','P_attenuation','I_attenuation','D_attenuation','P_phase','I_phase','D_phase']) {
            assert.deepEqual(current[key], plain(old[key]), `${name}.${key}`);
        }
    }
});

test('asymmetric phase unwrap and mixed sample-rate cascades preserve legacy behavior', () => {
    const context = legacy();
    for (const phase of [[], [0], [0, 315, -45, 180, -180, 179, -179], [NaN, Infinity, -Infinity]]) {
        assert.deepEqual(filters.unwrap(phase), plain(context.unwrap(phase)));
    }
    assert.deepEqual(filters.evaluate_transfer_functions([[new filters.PID(400,.1,.1,.002,10,20)], [new filters.DigitalBiquadFilter(1000,80)]], 200, 2, true, true),
        plain(context.evaluate_transfer_functions([[new context.PID(400,.1,.1,.002,10,20)], [new context.DigitalBiquadFilter(1000,80)]], 200, 2, true, true)));
});

test('selected FFT intervals preserve exact response, coherence and non-finite arithmetic', () => {
    const context = legacy();
    const input = Array.from({length:5}, (_,window) => [Array.from({length:16}, (_,i) => Math.sin(i+window)+1),Array.from({length:16}, (_,i) => Math.cos(i-window))]);
    const output = input.map(([real, imaginary], window) => [real.map((n,i) => n*.7+i*.05+window),imaginary.map(n => n*.9)]);
    for (const [start,end] of [[0,5],[1,4],[3,4],[2,2]]) {
        assert.deepEqual(calculate_freq_resp_from_FFT(input,output,start,end,end-start,32,400),plain(context.calculate_freq_resp_from_FFT(input,output,start,end,end-start,32,400)));
    }
    const zero = [[Array.from({length:16}, () => 0),Array.from({length:16}, () => 0)]];
    assert.deepEqual(calculate_freq_resp_from_FFT(zero,zero,0,1,1,32,400),plain(context.calculate_freq_resp_from_FFT(zero,zero,0,1,1,32,400)));
});

test('all eight closed-loop responses retain exact gain/filter, vehicle and axis effects', () => {
    for (const vehicleType of ['ArduCopter','ArduPlane_VTOL','ArduPlane_FW']) for (const axis of ['Roll','Pitch','Yaw']) for (const change of [0,1]) {
        const axisPrefix = axis === 'Roll' ? 'RLL' : axis === 'Yaw' ? 'YAW' : vehicleType === 'ArduPlane_FW' ? 'PTCH' : 'PIT';
        const vehicleAtcPrefix = vehicleType === 'ArduCopter' ? 'ATC_' : vehicleType === 'ArduPlane_VTOL' ? 'Q_A_' : '';
        const vehiclePltPrefix = vehicleType === 'ArduCopter' ? 'PILOT_' : vehicleType === 'ArduPlane_VTOL' ? 'Q_PLT_' : '';
        const ratePrefix = vehicleType === 'ArduPlane_FW' ? `${axisPrefix}_RATE_` : `${vehicleAtcPrefix}RAT_${axisPrefix}_`;
        const anglePrefix = vehicleType === 'ArduPlane_FW' ? `${axisPrefix}2SRV_` : `${vehicleAtcPrefix}ANG_${axisPrefix}_`;
        const parameters = { SCHED_LOOP_RATE:400,GyroSampleRate:1000,INS_GYRO_FILTER:80,Throttle:.4,RPM1:7000,RPM2:6000,ESC_RPM:6500,NUM_MOTORS:4,
            [`${anglePrefix}P`]:4.5,[`${anglePrefix}TCONST`]:.3,[`${vehicleAtcPrefix}INPUT_TC`]:.15,[`${vehiclePltPrefix}Y_RATE_TC`]:.2 };
        for (const [suffix,value] of Object.entries({P:.1+change*.03,I:.07,D:.003,FF:.1,D_FF:.001,FLTE:20,FLTD:30,FLTT:change?25:0,NEF:change,NTF:change?2:0})) parameters[ratePrefix+suffix]=value;
        for (const n of [1,2]) for (const [suffix,value] of Object.entries({FREQ:80+n*20,Q:3,ATT:40})) parameters[`FILT${n}_NOTCH_${suffix}`]=value;
        for (const prefix of ['INS_HNTCH_','INS_HNTC2_']) for (const [suffix,value] of Object.entries({ENABLE:change,MODE:1,FREQ:70,BW:40,ATT:40,REF:.5,FM_RAT:.5,HMNCS:7,OPTS:16})) parameters[prefix+suffix]=value;
        const config = { parameters,ratePrefix,anglePrefix,vehicleAtcPrefix,vehiclePltPrefix,axisPrefix,vehicleType,aspeed:vehicleType==='ArduPlane_FW'?.8:1,eas2tas:1.1 };
        const context = legacy(parameters);
        Object.assign(context,{vehicle_type:vehicleType,page_axis:axis,aspeed:config.aspeed,eas2tas:config.eas2tas});
        const aircraft = [Array.from({length:32},(_,i)=>1/(1+i*.05)),Array.from({length:32},(_,i)=>-.01*i)];
        assert.deepEqual(calculate_predicted_TF(aircraft,400,64,config),plain(context.calculate_predicted_TF(aircraft,400,64)),`${vehicleType} ${axis} changed=${change}`);
    }
});
