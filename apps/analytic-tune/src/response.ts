/* oxlint-disable unicorn/no-new-array -- Preserve legacy sparse arrays and numeric array lengths. */
import { array_add, array_mul, array_scale, array_inverse, array_abs, array_div, complex_abs, complex_mul, complex_conj, complex_div } from '@webtools/numerics';
import type { ComplexArray } from '@webtools/numerics';
import { PID, Ang_P, feedforward, LPF_1P, NotchFilterusingQ, HarmonicNotchFilter, DigitalBiquadFilter, evaluate_transfer_functions } from './filters.ts';
import type { TransferFilter } from './filters.ts';
/** Explicit vehicle/controller context formerly read from the page. */
export interface PredictionConfig {
    parameters: Record<string, number>;
    ratePrefix: string; anglePrefix: string; vehicleAtcPrefix: string; vehiclePltPrefix: string;
    axisPrefix: string; vehicleType: string; aspeed: number; eas2tas: number;
}
/** Build the two harmonic notches and gyro biquad from the current tune. */
export function get_filters(sample_rate: number, parameters: Record<string, number>): TransferFilter[] {
    /** Preserve missing form values as NaN. */
    const get = (key: string): number => parameters[key] ?? NaN;
    const runtime = {Throttle:get('Throttle'),RPM1:get('RPM1'),RPM2:get('RPM2'),NUM_MOTORS:get('NUM_MOTORS'),ESC_RPM:get('ESC_RPM')};
    const filters: TransferFilter[] = [];
    for (const prefix of ['INS_HNTCH_', 'INS_HNTC2_']) {
        filters.push(new HarmonicNotchFilter(sample_rate,get(prefix+'ENABLE'),get(prefix+'MODE'),get(prefix+'FREQ'),get(prefix+'BW'),get(prefix+'ATT'),get(prefix+'REF'),get(prefix+'FM_RAT'),get(prefix+'HMNCS'),get(prefix+'OPTS'),runtime));
    }
    filters.push(new DigitalBiquadFilter(sample_rate,get('INS_GYRO_FILTER')));
    return filters;
}
/** Predict all eight legacy control responses, including their original array lengths. */
export function calculate_predicted_TF(H_acft: ComplexArray, sample_rate: number, window_size: number, config: PredictionConfig): [ComplexArray, ComplexArray, ComplexArray, ComplexArray, ComplexArray, ComplexArray, ComplexArray, ComplexArray] {

    const { aspeed, eas2tas } = config
    let PID_H_TOT: ComplexArray
    let TGT_FILT_H: ComplexArray
    /** Read an explicit parameter with the same missing-value arithmetic as legacy forms. */
    const get_form = (name: string): number => config.parameters[name] ?? NaN
    //this will have to be the sample rate of time history data
    var freq_max = sample_rate * 0.5
    var freq_step = sample_rate / window_size;
    var use_dB = false
    var unwrap_phase = false

    var PID_rate = get_form("SCHED_LOOP_RATE")

    // Calculate transfer function for Rate PID
    var PID_filter = []
    var param_prefix = config.ratePrefix;
    PID_filter.push(new PID(PID_rate,
    get_form(param_prefix + "P")*aspeed*aspeed,
    get_form(param_prefix + "I")*aspeed*aspeed,
    get_form(param_prefix + "D")*aspeed*aspeed,
    get_form(param_prefix + "FLTE"),
    get_form(param_prefix + "FLTD")));

    const PID_H = evaluate_transfer_functions([PID_filter], freq_max, freq_step, use_dB, unwrap_phase)

    // calculate transfer funciton for the PID Error Notch filter
    const nef_num = get_form(param_prefix + "NEF")
    var nef_freq = 0.0
    if (nef_num > 0) { nef_freq = get_form("FILT" + nef_num + "_NOTCH_FREQ") }
    if (nef_num > 0 && nef_freq > 0.0) {
        var E_notch_filter = []
        E_notch_filter.push(new NotchFilterusingQ(PID_rate, nef_freq, get_form("FILT" + nef_num + "_NOTCH_Q"), get_form("FILT" + nef_num + "_NOTCH_ATT")))
        const NEF_H = evaluate_transfer_functions([E_notch_filter], freq_max, freq_step, use_dB, unwrap_phase)
        PID_H_TOT = complex_mul(NEF_H.H_total, PID_H.H_total)
    } else {
        PID_H_TOT = PID_H.H_total
    }

    // calculate transfer function for FF and DFF
    var FF_filter = []
    FF_filter.push(new feedforward(PID_rate, get_form(param_prefix + "FF") * aspeed / eas2tas,get_form(param_prefix + "D_FF") * aspeed / eas2tas))
    const FF_H = evaluate_transfer_functions([FF_filter], freq_max, freq_step, use_dB, unwrap_phase)
    var FFPID_H: ComplexArray = [new Array<number>(H_acft[0].length).fill(0), new Array<number>(H_acft[0].length).fill(0)]
    for (let k=0;k<H_acft[0].length+1;k++) {
        FFPID_H[0][k] = PID_H_TOT[0][k]! + FF_H.H_total[0][k]!
        FFPID_H[1][k] = PID_H_TOT[1][k]! + FF_H.H_total[1][k]!
    }

    // calculate transfer function for target LPF
    var T_filter = []
    T_filter.push(new LPF_1P(PID_rate, get_form(param_prefix + "FLTT")))
    const FLTT_H = evaluate_transfer_functions([T_filter], freq_max, freq_step, use_dB, unwrap_phase)

    // calculate transfer function for target PID notch and the target LPF combined, if the notch is defined.  Otherwise just
    // provide the target LPF as the combined transfer function.
    const ntf_num = get_form(param_prefix + "NTF")
    var ntf_freq = 0.0
    if (ntf_num > 0) { ntf_freq = get_form("FILT" + ntf_num + "_NOTCH_FREQ") }
    if (ntf_num > 0 && ntf_freq > 0.0) {
        var T_notch_filter = []
        T_notch_filter.push(new NotchFilterusingQ(PID_rate, ntf_freq, get_form("FILT" + ntf_num + "_NOTCH_Q"), get_form("FILT" + ntf_num + "_NOTCH_ATT")))
        const NTF_H = evaluate_transfer_functions([T_notch_filter], freq_max, freq_step, use_dB, unwrap_phase)
        TGT_FILT_H = complex_mul(NTF_H.H_total, FLTT_H.H_total)
    } else {
        TGT_FILT_H = FLTT_H.H_total
    }

    // calculate the transfer function of the INS filters which includes notches and LPF
    let fast_sample_rate = get_form("GyroSampleRate");
    let gyro_filters = get_filters(fast_sample_rate, config.parameters)
    const INS_H = evaluate_transfer_functions([gyro_filters], freq_max, freq_step, use_dB, unwrap_phase)

    // calculation of transfer function for the rate controller (includes serveral intermediate steps)
    var H_PID_Acft_plus_one: ComplexArray = [new Array<number>(PID_H_TOT[0].length).fill(0), new Array<number>(PID_H_TOT[0].length).fill(0)]

    const PID_Acft = complex_mul(H_acft, PID_H_TOT)
    const INS_PID_Acft = complex_mul(PID_Acft, INS_H.H_total)

    const FFPID_Acft = complex_mul(H_acft, FFPID_H)
    const FLTT_FFPID_Acft = complex_mul(FFPID_Acft, TGT_FILT_H)

    for (let k=0;k<H_acft[0].length+1;k++) {
        H_PID_Acft_plus_one[0][k] = INS_PID_Acft[0][k]! + 1
        H_PID_Acft_plus_one[1][k] = INS_PID_Acft[1][k]!
    }
    const Ret_rate = complex_div(FLTT_FFPID_Acft, H_PID_Acft_plus_one)

    // calculate transfer function for the angle P in prep for attitude controller calculation
    var Ang_P_filter = []
    var Angle_P
    if (config.vehicleType == "ArduPlane_FW") {
        Angle_P = 1 / get_form(config.anglePrefix + "TCONST")
    } else {
        Angle_P = get_form(config.anglePrefix + "P")
    }
    Ang_P_filter.push(new Ang_P(PID_rate, Angle_P))
    const Ang_P_H = evaluate_transfer_functions([Ang_P_filter], freq_max, freq_step, use_dB, unwrap_phase)

    // calculate transfer function for attitude controller with feedforward enabled (includes intermediate steps)
    const rate_ANGP = complex_mul(Ret_rate, Ang_P_H.H_total)
    var rate_ANGP_plus_one: ComplexArray = [new Array<number>(H_acft[0].length).fill(0), new Array<number>(H_acft[0].length).fill(0)]
    var ANGP_plus_one: ComplexArray = [new Array<number>(H_acft[0].length).fill(0), new Array<number>(H_acft[0].length).fill(0)]
    for (let k=0;k<H_acft[0].length+1;k++) {
        rate_ANGP_plus_one[0][k] = rate_ANGP[0][k]! + 1
        rate_ANGP_plus_one[1][k] = rate_ANGP[1][k]!
        ANGP_plus_one[0][k] = Ang_P_H.H_total[0][k]! + 1
        ANGP_plus_one[1][k] = Ang_P_H.H_total[1][k]!
    }
    const Ret_att_ff = complex_div(complex_mul(ANGP_plus_one, Ret_rate), rate_ANGP_plus_one)

    // transfer function of attitude controller without feedforward
    const Ret_att_nff = complex_div(complex_mul(Ang_P_H.H_total, Ret_rate), rate_ANGP_plus_one)

    // calculate transfer function for pilot feel LPF
    var tc_filter = []
    var tc_freq = 0.0
    if (config.vehicleType != "ArduPlane_FW") {
        if (config.axisPrefix == "YAW") {
            tc_freq = 1 / (get_form(config.vehiclePltPrefix + "Y_RATE_TC") * 2 * Math.PI)
        } else {
            tc_freq = 1 / (get_form(config.vehicleAtcPrefix + "INPUT_TC") * 2 * Math.PI)
        }
    }
    tc_filter.push(new LPF_1P(PID_rate, tc_freq))
    const tc_H = evaluate_transfer_functions([tc_filter], freq_max, freq_step, use_dB, unwrap_phase)
    // calculate transfer function for pilot input to the aircraft response
    const Ret_pilot = complex_mul(tc_H.H_total, Ret_att_ff)

    // calculate transfer function for attitude Distrubance Rejection
    var minus_one: ComplexArray = [new Array<number>(H_acft[0].length).fill(-1), new Array<number>(H_acft[0].length).fill(0)]
    const Ret_DRB = complex_div(minus_one, rate_ANGP_plus_one)

    const Ret_att_bl = rate_ANGP

    const Ret_rate_bl = INS_PID_Acft

    var bl_temp: ComplexArray = [new Array<number>(H_acft[0].length).fill(0), new Array<number>(H_acft[0].length).fill(0)]
    var bl_temp1 = complex_mul(Ang_P_H.H_total, FLTT_FFPID_Acft)
    var bl_temp2 = complex_mul(INS_H.H_total, PID_Acft)
    for (let k=0;k<H_acft[0].length+1;k++) {
        bl_temp[0][k] = bl_temp1[0][k]! + bl_temp2[0][k]!
        bl_temp[1][k] = bl_temp1[1][k]! + bl_temp2[1][k]!
    }
    const Ret_sys_bl = bl_temp


    return [Ret_rate, Ret_att_ff, Ret_pilot, Ret_DRB, Ret_att_nff, Ret_att_bl, Ret_rate_bl, Ret_sys_bl]

}

/** Average selected FFT windows into the legacy response and coherence estimates. */
export function calculate_freq_resp_from_FFT(input_fft: ComplexArray[], output_fft: ComplexArray[], start_index: number, end_index: number, mean_length: number, window_size: number, sample_rate: number): [ComplexArray, number[]] {

    var sum_in = array_mul(complex_abs(input_fft[start_index]!),complex_abs(input_fft[start_index]!))
    var sum_out = array_mul(complex_abs(output_fft[start_index]!),complex_abs(output_fft[start_index]!))
    var input_output = complex_mul(complex_conj(input_fft[start_index]!),output_fft[start_index]!)
    var real_sum_inout = input_output[0]
    var im_sum_inout = input_output[1]

    for (let k=start_index+1;k<end_index;k++) {
        // Add to sum
        var input_sqr = array_mul(complex_abs(input_fft[k]!),complex_abs(input_fft[k]!))
        var output_sqr = array_mul(complex_abs(output_fft[k]!),complex_abs(output_fft[k]!))
        input_output = complex_mul(complex_conj(input_fft[k]!),output_fft[k]!)
        sum_in = array_add(sum_in, input_sqr)  // this is now a scalar
        sum_out = array_add(sum_out, output_sqr) // this is now a scalar
        real_sum_inout = array_add(real_sum_inout, input_output[0])
        im_sum_inout = array_add(im_sum_inout, input_output[1])
    }

    const Twin = (window_size - 1) * sample_rate
    const fft_scale = 2 / (0.612 * mean_length * Twin)
    var input_sqr_avg = array_scale(sum_in, fft_scale)
    var output_sqr_avg = array_scale(sum_out, fft_scale)
    var input_output_avg: ComplexArray = [array_scale(real_sum_inout, fft_scale), array_scale(im_sum_inout, fft_scale)]

    var input_sqr_inv = array_inverse(input_sqr_avg)
    const H: ComplexArray = [array_mul(input_output_avg[0],input_sqr_inv), array_mul(input_output_avg[1],input_sqr_inv)]

    const coh_num = array_mul(complex_abs(input_output_avg),complex_abs(input_output_avg))
    const coh_den = array_mul(array_abs(input_sqr_avg), array_abs(output_sqr_avg))
    const coh = array_div(coh_num, coh_den)

    return [H, coh]
}

