import type { DataflashLog } from '@webtools/dataflash'
import { FFT, hanning, run_fft, rfft_freq, complex_mul, type ComplexArray } from '@webtools/numerics'
import { loadTimeHistory, type Axis, type Vehicle, type TimeHistory } from './analysis.ts'
import { PID, evaluate_transfer_functions } from './filters.ts'
import { calculate_freq_resp_from_FFT, calculate_predicted_TF } from './response.ts'

export interface CalculatedResponses {
    freq: number[]
    pilotctrl_H: ComplexArray; pilotctrl_coh: number[]
    attctrl_H: ComplexArray; attctrl_coh: number[]
    ratectrl_H: ComplexArray; ratectrl_coh: number[]
    bareAC_H: ComplexArray; bareAC_coh: number[]
    DRB_H: ComplexArray; DRB_coh: number[]
    sysbl_H: ComplexArray; sysbl_coh: number[]
}
export interface PredictedResponses {
    attctrl_ff_H: ComplexArray; ratectrl_H: ComplexArray; pilotctrl_H: ComplexArray
    attctrl_nff_H: ComplexArray; DRB_H: ComplexArray; attbl_H: ComplexArray
    ratebl_H: ComplexArray; sysbl_H: ComplexArray
}
export interface AnalysisResult { calculated: CalculatedResponses; predicted: PredictedResponses }

/** Calculate the six measured responses and eight predictions from the selected
 * interval using the legacy half-overlap Hann windows and DC-bin removal.
 * Invalid FFT lengths and missing data propagate to the visible UI error state.
 */
export function calculateAnalysis(log: DataflashLog, start: number, end: number, axis: Axis, vehicle: Vehicle,
    windowSize: number, useAttitude: boolean, parameters: Record<string, number>): AnalysisResult {
    if (!Number.isInteger(Math.log2(windowSize))) throw new Error('Window size must be a power of two')
    const history = loadTimeHistory(log, start, end, axis, vehicle)
    const sampleRate = history.sampleRate
    const fft = run_fft(history.data, Object.keys(history.data) as (keyof TimeHistory)[], windowSize,
        Math.round(windowSize * 0.5), hanning(windowSize), new FFT(windowSize))
    const count = fft.center.length
    /** Estimate one measured response, dropping only its DC bin as before. */
    function measured(input: keyof TimeHistory, output: keyof TimeHistory): [ComplexArray, number[]] {
        const [response, coherence] = calculate_freq_resp_from_FFT(fft[input], fft[output], 0, count, count, windowSize, sampleRate)
        return [[response[0].slice(1), response[1].slice(1)], coherence.slice(1)]
    }
    const [pilotctrl_H, pilotctrl_coh] = measured('PilotInput', axis === 'Yaw' ? 'Rate' : 'Att')
    let [bareAC_H, bareAC_coh] = measured('ActInput', useAttitude ? 'Att' : 'GyroRaw')
    let [ratectrl_H, ratectrl_coh] = measured('RateTgt', useAttitude ? 'Att' : 'GyroRaw')
    const [attctrl_H, attctrl_coh] = measured('AttTgt', 'Att')
    const [DRB_H, DRB_coh] = measured('DRBin', 'DRBresp')
    const [sysbl_H, sysbl_coh] = measured('SysBLInput', 'SysBLOutput')
    if (useAttitude) {
        const derivative = evaluate_transfer_functions([[new PID(parameters.SCHED_LOOP_RATE!, 0, 0, 1, 0, 0)]], sampleRate * 0.5, sampleRate / windowSize, false, false)
        bareAC_H = complex_mul(bareAC_H, derivative.H_total)
        ratectrl_H = complex_mul(ratectrl_H, derivative.H_total)
    }
    const vehicleAtcPrefix = vehicle === 'ArduCopter' ? 'ATC_' : vehicle === 'ArduPlane_VTOL' ? 'Q_A_' : ''
    const vehiclePltPrefix = vehicle === 'ArduCopter' ? 'PILOT_' : vehicle === 'ArduPlane_VTOL' ? 'Q_PLT_' : ''
    const axisPrefix = axis === 'Roll' ? 'RLL' : axis === 'Yaw' ? 'YAW' : vehicle === 'ArduPlane_FW' ? 'PTCH' : 'PIT'
    const predicted = calculate_predicted_TF(bareAC_H, sampleRate, windowSize, {
        parameters, ratePrefix: vehicle === 'ArduPlane_FW' ? axisPrefix + '_RATE_' : vehicleAtcPrefix + 'RAT_' + axisPrefix + '_',
        anglePrefix: vehicle === 'ArduPlane_FW' ? axisPrefix + '2SRV_' : vehicleAtcPrefix + 'ANG_' + axisPrefix + '_',
        vehicleAtcPrefix, vehiclePltPrefix, axisPrefix, vehicleType: vehicle, aspeed: history.airspeed, eas2tas: history.eas2tas,
    })
    return {
        calculated: { freq: rfft_freq(windowSize, 1 / sampleRate).slice(1), pilotctrl_H, pilotctrl_coh, bareAC_H, bareAC_coh,
            ratectrl_H, ratectrl_coh, attctrl_H, attctrl_coh, DRB_H, DRB_coh, sysbl_H, sysbl_coh },
        predicted: { ratectrl_H: predicted[0], attctrl_ff_H: predicted[1], pilotctrl_H: predicted[2], DRB_H: predicted[3],
            attctrl_nff_H: predicted[4], attbl_H: predicted[5], ratebl_H: predicted[6], sysbl_H: predicted[7] },
    }
}
