/* oxlint-disable unicorn/no-new-array -- Preserve legacy sparse arrays and numeric array lengths. */
import { array_offset, array_scale, array_log10, array_from_range, complex_mul, complex_div, complex_abs, complex_phase, exp_jw, complex_inverse, complex_square } from '@webtools/numerics';
import type { ComplexArray } from '@webtools/numerics';

/** A sampled filter accepting the legacy z, inverse-z and squared inverse-z grids. */
export interface TransferFilter { sample_rate: number; transfer(Z: ComplexArray, Z1: ComplexArray, Z2: ComplexArray, use_dB?: boolean, unwrap_phase?: boolean): ComplexArray; }
/** Current estimates used by tracking harmonic notches. */
export interface NotchRuntime { Throttle: number; RPM1: number; RPM2: number; NUM_MOTORS: number; ESC_RPM: number; }

/** PID transfer model retaining AnalyticTune coefficient and phase conventions. */
export class PID implements TransferFilter {
    D_attenuation?: number[];
    D_filter!: LPF_1P;
    D_phase?: number[];
    E_filter!: LPF_1P;
    I_attenuation?: number[];
    I_phase?: number[];
    P_attenuation?: number[];
    P_phase?: number[];
    _kD!: number;
    _kI!: number;
    _kP!: number;
    attenuation?: number[];
    phase?: number[];
    sample_rate!: number;
    transfer!: TransferFilter["transfer"];
    /** Construct the model from the original controller/filter parameters. */
    constructor(sample_rate: number, kP: number, kI: number, kD: number, filtE: number, filtD: number) {
        this.sample_rate = sample_rate

        this._kP = kP;
        this._kI = kI;
        this._kD = kD;

        this.E_filter = new LPF_1P(sample_rate, filtE)
        this.D_filter = new LPF_1P(sample_rate, filtD)

        /** Evaluate the sampled transfer without changing legacy arithmetic. */
        this.transfer = function(Z, Z1, Z2, use_dB, unwrap_phase) {
            const E_trans = this.E_filter.transfer(Z, Z1, Z2, false, false)
            const D_trans = complex_mul(E_trans, this.D_filter.transfer(Z, Z1, Z2, false, false))

            // I term is k*z / (z - 1)
            const Z_less_one: ComplexArray = [array_offset(Z[0], -1), Z[1].slice()]
            const I_comp = complex_mul(complex_div(Z,Z_less_one), E_trans)
            const kI = this._kI/this.sample_rate

            // D term is k * (1 - Z^-1)
            const one_less_Z1: ComplexArray = [array_offset(array_scale(Z1[0],-1), 1), array_scale(Z1[1],-1)]
            const D_comp =  complex_mul(one_less_Z1, D_trans)
            const kD = this._kD*this.sample_rate


            const len = Z1[0].length
            let ret: ComplexArray = [new Array<number>(len), new Array<number>(len)]
            let P: ComplexArray = [new Array<number>(len), new Array<number>(len)]
            let I: ComplexArray = [new Array<number>(len), new Array<number>(len)]
            let D: ComplexArray = [new Array<number>(len), new Array<number>(len)]
            for (let i = 0; i<len; i++) {

                // Store components
                P[0][i] = E_trans[0][i]! * this._kP
                P[1][i] = E_trans[1][i]! * this._kP

                I[0][i] = I_comp[0][i]! * kI
                I[1][i] = I_comp[1][i]! * kI

                D[0][i] = D_comp[0][i]! * kD
                D[1][i] = D_comp[1][i]! * kD

                // Sum of components
                ret[0][i] = P[0][i]! + I[0][i]! + D[0][i]!
                ret[1][i] = P[1][i]! + I[1][i]! + D[1][i]!

            }


            this.attenuation = complex_abs(ret)
            this.P_attenuation = complex_abs(P)
            this.I_attenuation = complex_abs(I)
            this.D_attenuation = complex_abs(D)

            this.phase = array_scale(complex_phase(ret), 180/Math.PI)
            this.P_phase = array_scale(complex_phase(P), 180/Math.PI)
            this.I_phase = array_scale(complex_phase(I), 180/Math.PI)
            this.D_phase = array_scale(complex_phase(D), 180/Math.PI)

            if (use_dB) {
                this.attenuation = array_scale(array_log10(this.attenuation), 20.0)
                this.P_attenuation = array_scale(array_log10(this.P_attenuation), 20.0)
                this.I_attenuation = array_scale(array_log10(this.I_attenuation), 20.0)
                this.D_attenuation = array_scale(array_log10(this.D_attenuation), 20.0)
            }
            if (unwrap_phase) {
                this.phase = unwrap(this.phase)
                this.P_phase = unwrap(this.P_phase)
                this.I_phase = unwrap(this.I_phase)
                this.D_phase = unwrap(this.D_phase)
            }

            return ret
        }
        return this;

    }
}

/** Ang_P transfer model retaining AnalyticTune coefficient and phase conventions. */
export class Ang_P implements TransferFilter {
    _kP!: number;
    attenuation?: number[];
    phase?: number[];
    sample_rate!: number;
    transfer!: TransferFilter["transfer"];
    /** Construct the model from the original controller/filter parameters. */
    constructor(sample_rate: number, kP: number) {
        this.sample_rate = sample_rate

        this._kP = kP;

        /** Evaluate the sampled transfer without changing legacy arithmetic. */
        this.transfer = function(Z, Z1, _Z2, use_dB, unwrap_phase) {
            // I term is k*z / (z - 1)
            const Z_less_one: ComplexArray = [array_offset(Z[0], -1), Z[1].slice()]
            const I_comp = complex_div(Z,Z_less_one)
            const kI = this._kP/this.sample_rate

            const len = Z1[0].length
            let ret: ComplexArray = [new Array<number>(len), new Array<number>(len)]
            let I: ComplexArray = [new Array<number>(len), new Array<number>(len)]
            for (let i = 0; i<len; i++) {

                // Store components
                I[0][i] = I_comp[0][i]! * kI
                I[1][i] = I_comp[1][i]! * kI

                // Sum of components
                ret[0][i] = I[0][i]!
                ret[1][i] = I[1][i]!

            }

            this.attenuation = complex_abs(ret)

            this.phase = array_scale(complex_phase(ret), 180/Math.PI)

            if (use_dB) {
                this.attenuation = array_scale(array_log10(this.attenuation), 20.0)
            }
            if (unwrap_phase) {
                this.phase = unwrap(this.phase)
            }

            return ret
        }
        return this;

    }
}

/** feedforward transfer model retaining AnalyticTune coefficient and phase conventions. */
export class feedforward implements TransferFilter {
    _kFF!: number;
    _kFF_D!: number;
    attenuation?: number[];
    phase?: number[];
    sample_rate!: number;
    transfer!: TransferFilter["transfer"];
    /** Construct the model from the original controller/filter parameters. */
    constructor(sample_rate: number, kFF: number, kFF_D: number) {
        this.sample_rate = sample_rate

        this._kFF = kFF;
        this._kFF_D = kFF_D;

        /** Evaluate the sampled transfer without changing legacy arithmetic. */
        this.transfer = function(_Z, Z1, _Z2, use_dB, unwrap_phase) {
            // D term is k * (1 - Z^-1)
            const one_less_Z1: ComplexArray = [array_offset(array_scale(Z1[0],-1), 1), array_scale(Z1[1],-1)]
            const kFF_D = this._kFF_D*this.sample_rate

            const len = Z1[0].length
            let ret: ComplexArray = [new Array<number>(len), new Array<number>(len)]
            let FF_D: ComplexArray = [new Array<number>(len), new Array<number>(len)]
            for (let i = 0; i<len; i++) {

                // Store components
                FF_D[0][i] = one_less_Z1[0][i]! * kFF_D
                FF_D[1][i] = one_less_Z1[1][i]! * kFF_D

                // Sum of components
                ret[0][i] = FF_D[0][i]! + this._kFF
                ret[1][i] = FF_D[1][i]!

            }

            this.attenuation = complex_abs(ret)

            this.phase = array_scale(complex_phase(ret), 180/Math.PI)

            if (use_dB) {
                this.attenuation = array_scale(array_log10(this.attenuation), 20.0)
            }
            if (unwrap_phase) {
                this.phase = unwrap(this.phase)
            }

            return ret
        }
        return this;

    }
}

/** LPF_1P transfer model retaining AnalyticTune coefficient and phase conventions. */
export class LPF_1P implements TransferFilter {
    alpha!: number;
    attenuation?: number[];
    phase?: number[];
    sample_rate!: number;
    transfer!: TransferFilter["transfer"];
    /** Construct the model from the original controller/filter parameters. */
    constructor(sample_rate: number, cutoff: number) {
        this.sample_rate = sample_rate
        // Helper function to get alpha
        /** Calculate the legacy one-pole smoothing factor. */
        function calc_lowpass_alpha_dt(dt: number, cutoff_freq: number) {
            if (dt <= 0.0 || cutoff_freq <= 0.0) {
                return 1.0;
            }
            var rc = 1.0/(Math.PI*2*cutoff_freq);
            return dt/(dt+rc);
        }

        if (cutoff <= 0) {
            /** Evaluate the sampled transfer without changing legacy arithmetic. */
            this.transfer = function(_Z, Z1, _Z2) {
                const len = Z1[0].length
                return [new Array<number>(len).fill(1), new Array<number>(len).fill(0)]
            }
            return this;
        }
        this.alpha = calc_lowpass_alpha_dt(1.0/sample_rate,cutoff)
        /** Evaluate the sampled transfer without changing legacy arithmetic. */
        this.transfer = function(_Z, Z1, _Z2, use_dB, unwrap_phase) {
            // H(z) = a/(1-(1-a)*z^-1)
            const len = Z1[0].length

            const numerator: ComplexArray = [new Array<number>(len).fill(this.alpha), new Array<number>(len).fill(0)]
            const denominator: ComplexArray = [array_offset(array_scale(Z1[0], this.alpha-1),1),
            array_scale(Z1[1], this.alpha-1)]

            const H = complex_div(numerator, denominator)

            this.attenuation = complex_abs(H)
            this.phase = array_scale(complex_phase(H), 180/Math.PI)
            if (use_dB) {
                this.attenuation = array_scale(array_log10(this.attenuation), 20.0)
            }
            if (unwrap_phase) {
                this.phase = unwrap(this.phase)
            }
            return H
        }
        return this;

    }
}

/** DigitalBiquadFilter transfer model retaining AnalyticTune coefficient and phase conventions. */
export class DigitalBiquadFilter implements TransferFilter {
    a1!: number;
    a2!: number;
    attenuation?: number[];
    b0!: number;
    b1!: number;
    b2!: number;
    enabled!: boolean;
    phase?: number[];
    sample_rate!: number;
    transfer!: TransferFilter["transfer"];
    /** Construct the model from the original controller/filter parameters. */
    constructor(sample_freq: number, cutoff_freq: number) {
        this.sample_rate = sample_freq

        if (cutoff_freq <= 0) {
            /** Evaluate the sampled transfer without changing legacy arithmetic. */
            this.transfer = function(_Z, Z1, _Z2, _use_dB, _unwrap_phase) {
                const len = Z1[0].length
                return [new Array<number>(len).fill(1), new Array<number>(len).fill(0)]
            }
            this.enabled = false
            return this;
        }
        this.enabled = true

        var fr = sample_freq/cutoff_freq;
        var ohm = Math.tan(Math.PI/fr);
        var c = 1.0+2.0*Math.cos(Math.PI/4.0)*ohm + ohm*ohm;

        this.b0 = ohm*ohm/c;
        this.b1 = 2.0*this.b0;
        this.b2 = this.b0;
        this.a1 = 2.0*(ohm*ohm-1.0)/c;
        this.a2 = (1.0-2.0*Math.cos(Math.PI/4.0)*ohm+ohm*ohm)/c;

        /** Evaluate the sampled transfer without changing legacy arithmetic. */
        this.transfer = function(_Z, Z1, Z2, use_dB, unwrap_phase) {

            const len = Z1[0].length
            let numerator: ComplexArray =  [new Array<number>(len), new Array<number>(len)]
            let denominator: ComplexArray =  [new Array<number>(len), new Array<number>(len)]
            for (let i = 0; i<len; i++) {
                // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(a0 + a1*z^-1 + a2*z^-2)
                numerator[0][i] =   this.b0 + this.b1 * Z1[0][i]! + this.b2 * Z2[0][i]!
                numerator[1][i] =             this.b1 * Z1[1][i]! + this.b2 * Z2[1][i]!

                denominator[0][i] =       1 + this.a1 * Z1[0][i]! + this.a2 * Z2[0][i]!
                denominator[1][i] =           this.a1 * Z1[1][i]! + this.a2 * Z2[1][i]!
            }

            const H = complex_div(numerator, denominator)

            this.attenuation = complex_abs(H)
            this.phase = array_scale(complex_phase(H), 180/Math.PI)
            if (use_dB) {
                this.attenuation = array_scale(array_log10(this.attenuation), 20.0)
            }
            if (unwrap_phase) {
                this.phase = unwrap(this.phase)
            }

            return H
        }

        return this;

    }
}

/** NotchFilterusingQ transfer model retaining AnalyticTune coefficient and phase conventions. */
export class NotchFilterusingQ implements TransferFilter {
    A!: number;
    Q!: number;
    a0_inv!: number;
    a1!: number;
    a2!: number;
    attenuation?: number[];
    attenuation_dB!: number;
    b0!: number;
    b1!: number;
    b2!: number;
    center_freq_hz!: number;
    initialised!: boolean;
    phase?: number[];
    sample_rate!: number;
    transfer!: TransferFilter["transfer"];
    /** Construct the model from the original controller/filter parameters. */
    constructor(sample_freq: number, center_freq_hz: number, notch_Q: number, attenuation_dB: number) {
        this.sample_rate = sample_freq;
        this.center_freq_hz = center_freq_hz;
        this.Q = notch_Q;
        this.attenuation_dB = attenuation_dB;
        this.initialised = false;

        if ((this.center_freq_hz > 0.0) && (this.center_freq_hz < 0.5 * this.sample_rate) && (this.Q > 0.0)) {
            this.A = Math.pow(10.0, -this.attenuation_dB / 40.0);
            var omega = 2.0 * Math.PI * this.center_freq_hz / this.sample_rate;
            var alpha = Math.sin(omega) / (2 * this.Q);
            this.b0 =  1.0 + alpha*(this.A**2);
            this.b1 = -2.0 * Math.cos(omega);
            this.b2 =  1.0 - alpha*(this.A**2);
            this.a0_inv =  1.0/(1.0 + alpha);
            this.a1 = this.b1;
            this.a2 =  1.0 - alpha;
            this.initialised = true;
        } else {
            this.initialised = false;
        }

        /** Evaluate the sampled transfer without changing legacy arithmetic. */
        this.transfer = function(_Z, Z1, Z2, use_dB, unwrap_phase) {
            if (!this.initialised) {
                const len = Z1[0].length
                return [new Array<number>(len).fill(1), new Array<number>(len).fill(0)]
            }

            const a0 = 1 / this.a0_inv

            const len = Z1[0].length
            let numerator: ComplexArray =  [new Array<number>(len), new Array<number>(len)]
            let denominator: ComplexArray =  [new Array<number>(len), new Array<number>(len)]
            for (let i = 0; i<len; i++) {
                // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(a0 + a1*z^-1 + a2*z^-2)
                numerator[0][i] =   this.b0 + this.b1 * Z1[0][i]! + this.b2 * Z2[0][i]!
                numerator[1][i] =             this.b1 * Z1[1][i]! + this.b2 * Z2[1][i]!

                denominator[0][i] =      a0 + this.a1 * Z1[0][i]! + this.a2 * Z2[0][i]!
                denominator[1][i] =           this.a1 * Z1[1][i]! + this.a2 * Z2[1][i]!
            }

            const H = complex_div(numerator, denominator)
            this.attenuation = complex_abs(H)
            this.phase = array_scale(complex_phase(H), 180/Math.PI)
            if (use_dB) {
                this.attenuation = array_scale(array_log10(this.attenuation), 20.0)
            }
            if (unwrap_phase) {
                this.phase = unwrap(this.phase)
            }
            return H
        }

        return this;

    }
}

/** NotchFilter transfer model retaining AnalyticTune coefficient and phase conventions. */
export class NotchFilter {
    A!: number;
    Q!: number;
    a0_inv!: number;
    a1!: number;
    a2!: number;
    attenuation_dB!: number;
    b0!: number;
    b1!: number;
    b2!: number;
    bandwidth_hz!: number;
    calculate_A_and_Q!: () => void;
    center_freq_hz!: number;
    init_with_A_and_Q!: () => void;
    initialised!: boolean;
    sample_freq!: number;
    transfer!: TransferFilter["transfer"];
    /** Construct the model from the original controller/filter parameters. */
    constructor(sample_freq: number, center_freq_hz: number, bandwidth_hz: number, attenuation_dB: number) {

        this.sample_freq = sample_freq;
        this.center_freq_hz = center_freq_hz;
        this.bandwidth_hz = bandwidth_hz;
        this.attenuation_dB = attenuation_dB;
        this.initialised = false;

        /** Initialize the legacy notch coefficients. */
        this.calculate_A_and_Q = function() {
            this.A = Math.pow(10.0, -this.attenuation_dB / 40.0);
            if (this.center_freq_hz > 0.5 * this.bandwidth_hz) {
                var octaves = Math.log2(this.center_freq_hz / (this.center_freq_hz - this.bandwidth_hz / 2.0)) * 2.0;
                this.Q = Math.sqrt(Math.pow(2.0, octaves)) / (Math.pow(2.0, octaves) - 1.0);
            } else {
                this.Q = 0.0;
            }
        }

        /** Initialize the legacy notch coefficients. */
        this.init_with_A_and_Q = function() {
            if ((this.center_freq_hz > 0.0) && (this.center_freq_hz < 0.5 * this.sample_freq) && (this.Q > 0.0)) {
                var omega = 2.0 * Math.PI * this.center_freq_hz / this.sample_freq;
                var alpha = Math.sin(omega) / (2 * this.Q);
                this.b0 =  1.0 + alpha*(this.A**2);
                this.b1 = -2.0 * Math.cos(omega);
                this.b2 =  1.0 - alpha*(this.A**2);
                this.a0_inv =  1.0/(1.0 + alpha);
                this.a1 = this.b1;
                this.a2 =  1.0 - alpha;
                this.initialised = true;
            } else {
                this.initialised = false;
            }
        }

        // check center frequency is in the allowable range
        if ((center_freq_hz > 0.5 * bandwidth_hz) && (center_freq_hz < 0.5 * sample_freq)) {
            this.calculate_A_and_Q();
            this.init_with_A_and_Q();
        } else {
            this.initialised = false;
        }

        /** Evaluate the sampled transfer without changing legacy arithmetic. */
        this.transfer = function(_Z, Z1, Z2) {
            if (!this.initialised) {
                const len = Z1[0].length
                return [new Array<number>(len).fill(1), new Array<number>(len).fill(0)]
            }

            const a0 = 1 / this.a0_inv

            const len = Z1[0].length
            let numerator: ComplexArray =  [new Array<number>(len), new Array<number>(len)]
            let denominator: ComplexArray =  [new Array<number>(len), new Array<number>(len)]
            for (let i = 0; i<len; i++) {
                // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(a0 + a1*z^-1 + a2*z^-2)
                numerator[0][i] =   this.b0 + this.b1 * Z1[0][i]! + this.b2 * Z2[0][i]!
                numerator[1][i] =             this.b1 * Z1[1][i]! + this.b2 * Z2[1][i]!

                denominator[0][i] =      a0 + this.a1 * Z1[0][i]! + this.a2 * Z2[0][i]!
                denominator[1][i] =           this.a1 * Z1[1][i]! + this.a2 * Z2[1][i]!
            }

            return complex_div(numerator, denominator)
        }

        return this;

    }
}

/** HarmonicNotchFilter transfer model retaining AnalyticTune coefficient and phase conventions. */
export class HarmonicNotchFilter implements TransferFilter {
    attenuation?: number[];
    enabled!: boolean;
    notches!: NotchFilter[];
    phase?: number[];
    sample_rate!: number;
    transfer!: TransferFilter["transfer"];
    /** Construct the model from the original controller/filter parameters. */
    constructor(sample_freq: number, enable: number, mode: number, freq: number, bw: number, att: number, ref: number, fm_rat: number, hmncs: number, opts: number, runtime: NotchRuntime) {
        this.sample_rate = sample_freq
        this.notches = []
        var chained = 1;
        var composite_notches = 1;
        if (opts & 1) {
            composite_notches = 2;
        } else if (opts & 16) {
            composite_notches = 3;
        }

        if (enable <= 0) {
            /** Evaluate the sampled transfer without changing legacy arithmetic. */
            this.transfer = function(_Z, Z1, _Z2, _use_dB, _unwrap_phase) {
                const len = Z1[0].length
                return [new Array<number>(len).fill(1), new Array<number>(len).fill(0)]

            }
            this.enabled = false
            return this;
        }
        this.enabled = true

        if (mode == 0) {
            // fixed notch
        }
        if (mode == 1) {
            var motors_throttle = Math.max(0,runtime.Throttle);
            var throttle_freq = freq * Math.max(fm_rat,Math.sqrt(motors_throttle / ref));
            freq = throttle_freq;
        }
        if (mode == 2) {
            var rpm = runtime.RPM1;
            freq = Math.max(rpm/60.0,freq) * ref;
        }
        if (mode == 5) {
            var rpm = runtime.RPM2;
            freq = Math.max(rpm/60.0,freq) * ref;
        }
        if (mode == 3) {
            if (opts & 2) {
                chained = runtime.NUM_MOTORS;
            }
            var rpm = runtime.ESC_RPM;
            freq = Math.max(rpm/60.0,freq) * ref;
        }
        for (var n=0;n<8;n++) {
            var fmul = n+1;
            if (hmncs & (1<<n)) {
                var notch_center = freq * fmul;
                var bandwidth_hz = bw * fmul;
                for (var c=0; c<chained; c++) {
                    var nyquist_limit = sample_freq * 0.48;
                    var bandwidth_limit = bandwidth_hz * 0.52;

                    // Calculate spread required to achieve an equivalent single notch using two notches with Bandwidth/2
                    var notch_spread = bandwidth_hz / (32.0 * notch_center);

                    // adjust the fundamental center frequency to be in the allowable range
                    notch_center = Math.min(Math.max(notch_center, bandwidth_limit), nyquist_limit)

                    if (composite_notches != 2) {
                        // only enable the filter if its center frequency is below the nyquist frequency
                        if (notch_center < nyquist_limit) {
                            this.notches.push(new NotchFilter(sample_freq,notch_center,bandwidth_hz/composite_notches,att));
                        }
                    }
                    if (composite_notches > 1) {
                        var notch_center_double;
                        // only enable the filter if its center frequency is below the nyquist frequency
                        notch_center_double = notch_center * (1.0 - notch_spread);
                        if (notch_center_double < nyquist_limit) {
                            this.notches.push(new NotchFilter(sample_freq,notch_center_double,bandwidth_hz/composite_notches,att));
                        }
                        // only enable the filter if its center frequency is below the nyquist frequency
                        notch_center_double = notch_center * (1.0 + notch_spread);
                        if (notch_center_double < nyquist_limit) {
                            this.notches.push(new NotchFilter(sample_freq,notch_center_double,bandwidth_hz/composite_notches,att));
                        }
                    }
                }
            }
        }

        /** Evaluate the sampled transfer without changing legacy arithmetic. */
        this.transfer = function(Z, Z1, Z2, use_dB, unwrap_phase) {
            const len = Z1[0].length
            var H_total: ComplexArray = [new Array<number>(len).fill(1), new Array<number>(len).fill(0)]
            for (const n in this.notches) {
                const H = this.notches[n]!.transfer(Z, Z1, Z2);
                H_total = complex_mul(H_total, H)
            }

            this.attenuation = complex_abs(H_total)
            this.phase = array_scale(complex_phase(H_total), 180/Math.PI)
            if (use_dB) {
                this.attenuation = array_scale(array_log10(this.attenuation), 20.0)
            }
            if (unwrap_phase) {
                this.phase = unwrap(this.phase)
            }

            return H_total;
        }

    }
}
/** Unwrap with AnalyticTune’s asymmetric 45/315 degree thresholds. */
export function unwrap(phase: number[]): number[] {
    const len = phase.length

    // Notches result in large positive phase changes, bias the unwrap to do a better job
    const neg_threshold = 45
    const pos_threshold = 360 - neg_threshold

    let unwrapped = new Array<number>(len)

    unwrapped[0] = phase[0]!
    for (let i = 1; i < len; i++) {
        let phase_diff = phase[i]! - phase[i-1]!;
        if (phase_diff > pos_threshold) {
            phase_diff -= 360.0;
        } else if (phase_diff < -neg_threshold) {
            phase_diff += 360.0;
        }
        unwrapped[i] = unwrapped[i-1]! + phase_diff
    }

    return unwrapped
}

/** Cascade sampled filters while retaining the legacy frequency grid and phase convention. */
export function evaluate_transfer_functions(filter_groups: TransferFilter[][], freq_max: number, freq_step: number, use_dB = false, unwrap_phase = false) {

    // Not sure why range does not return expected array, _data gets us the array
    const freq = array_from_range(freq_step, freq_max, freq_step)

    // Start with unity transfer function, input = output
    const len = freq.length
    var H_total: ComplexArray = [new Array<number>(len).fill(1), new Array<number>(len).fill(0)]

    for (let i = 0; i < filter_groups.length; i++) {
        // Allow for batches at different sample rates
        const filters = filter_groups[i]!

        const sample_rate = filters[0]!.sample_rate
        for (let j = 1; j < filters.length; j++) {
            if (filters[0]!.sample_rate != sample_rate) {
                throw new Error("Sample rate miss match")
            }
        }

        // Calculate Z for transfer function
        // Z = e^jw
        const Z = exp_jw(freq, sample_rate)

        // Z^-1
        const Z1 = complex_inverse(Z)

        // Z^-2
        const Z2 = complex_inverse(complex_square(Z))

        // Apply all transfer functions
        for (let filter of filters) {
            const H = filter.transfer(Z, Z1, Z2, use_dB, unwrap_phase)
            H_total = complex_mul(H_total, H)
        }
    }

    // Calculate total filter transfer function
    let attenuation = complex_abs(H_total)
    let phase = array_scale(complex_phase(H_total), 180/Math.PI)
    if (use_dB) {
        attenuation = array_scale(array_log10(attenuation), 20.0)
    }
    if (unwrap_phase) {
        phase = unwrap(phase)
    }

    // Return attenuation and phase
    return { attenuation: attenuation, phase: phase, freq: freq, H_total: H_total}
}
