import { array_from_range, array_mean, array_offset, array_scale, linear_interp } from '@webtools/numerics'
import { param_to_string } from '@webtools/parameters'

export type CellValue = number | string | null | undefined
export interface ThrustRow { pwm: CellValue; thrust: CellValue; voltage: CellValue; current: CellValue }
export const parameterNames = ['MOT_SPIN_ARM', 'MOT_SPIN_MIN', 'MOT_SPIN_MAX', 'MOT_PWM_MIN', 'MOT_PWM_MAX', 'MOT_THST_EXPO', 'MOT_THST_HOVER', 'MOTOR_COUNT', 'COPTER_AUW'] as const
export type ParameterName = typeof parameterNames[number]
export type Parameters = Record<Exclude<ParameterName, 'MOT_THST_HOVER'>, number> & { MOT_THST_HOVER: number | null }
export interface CalculationState { parameters: Parameters; saveHover: boolean; hoverDisplay: string }
export interface Trace {
    x: CellValue[]; y: CellValue[]; name: string; mode: 'lines' | 'markers'
    marker?: { size: number; symbol: string; color: string }
    line?: { color: string }
}
export interface Calculation {
    state: CalculationState; expoDisplay: string; expoData: Trace[]; errorData: Trace[]; pwmData: Trace[]
    gradientMean: number | null; pwmRange: [number, number]
}

/** Return fresh reset values; the hover estimate is deliberately initially absent. */
export function defaultParameters(): Parameters {
    return { MOT_SPIN_ARM: 0.1, MOT_SPIN_MIN: 0.15, MOT_SPIN_MAX: 0.95, MOT_PWM_MIN: 1000, MOT_PWM_MAX: 2000, MOT_THST_EXPO: 0.65, MOT_THST_HOVER: null, MOTOR_COUNT: 4, COPTER_AUW: 0 }
}

/** Create independent editable empty rows, including every table field. */
export function blankRows(count = 10): ThrustRow[] {
    return Array.from({ length: count }, () => ({ pwm: '', thrust: '', voltage: '', current: '' }))
}

/** Retain the legacy truthiness filter: numeric zero is omitted but string zero is accepted. */
export function validRows(rows: readonly ThrustRow[]): ThrustRow[] {
    return rows.filter(row => Boolean(row.pwm && row.thrust) && !Number.isNaN(Number(row.pwm)) && !Number.isNaN(Number(row.thrust)))
}

/** Clamp using the firmware's comparison order, allowing NaN to propagate. */
function constrain(value: number, low: number, high: number): number {
    if (value < low) return low
    if (value > high) return high
    return value
}

/** Apply the firmware thrust inverse without battery compensation, as the legacy stand assumes constant resting voltage. */
function actuatorForThrust(thrust: number, expo: number, parameters: Parameters): number {
    thrust = constrain(thrust, 0, 1)
    expo = constrain(expo, -1, 1)
    const ratio = expo === 0 ? thrust : constrain((expo - 1 + Math.sqrt((1 - expo) * (1 - expo) + 4 * expo * thrust)) / (2 * expo), 0, 1)
    return parameters.MOT_SPIN_MIN + (parameters.MOT_SPIN_MAX - parameters.MOT_SPIN_MIN) * ratio
}

interface Fit { corrected: (number | undefined)[]; gradient: number[]; mean: number; deviation: number; expo: number }

/** Score a candidate expo using population standard deviation of the 0.001-step interpolated gradient. */
function fit(expo: number, pwm: number[], thrust: number[], actuator: number[], parameters: Parameters): Fit {
    const demand = actuator.map(value => parameters.MOT_PWM_MIN + (parameters.MOT_PWM_MAX - parameters.MOT_PWM_MIN) * actuatorForThrust(value, expo, parameters))
    const corrected = linear_interp(thrust, pwm, demand)
    const gradient = Array.from({ length: actuator.length - 1 }, (_, i) => (corrected[i + 1]! - corrected[i]!) / 0.001)
    const mean = array_mean(gradient)
    let sum = 0
    for (const value of gradient) sum += (value - mean) ** 2
    return { corrected, gradient, mean, deviation: Math.sqrt(sum / gradient.length), expo }
}

/**
 * Calculate all displayed series while retaining the original floating-point scan and interpolation order.
 * A forced zero intentionally requests optimization. Invalid/empty datasets preserve saved parameters and
 * hover display; a later failed hover estimate clears only its display, retaining the prior saved value.
 */
export function calculate(rows: readonly ThrustRow[], previous: CalculationState, forcedExpo?: number | null): Calculation {
    const parameters = { ...previous.parameters }
    const state = { ...previous, parameters }
    const output: Calculation = { state, expoDisplay: String(parameters.MOT_THST_EXPO), expoData: [], errorData: [], pwmData: [], gradientMean: null, pwmRange: [parameters.MOT_PWM_MIN, parameters.MOT_PWM_MAX] }
    const accepted = validRows(rows)
    if (accepted.length === 0) return output
    const pwm = accepted.map(row => parseFloat(String(row.pwm)))
    const thrust = accepted.map(row => parseFloat(String(row.thrust)))
    const actuator = array_from_range(0, 1, 0.001)
    let result: Fit | undefined
    if (forcedExpo) result = fit(forcedExpo, pwm, thrust, actuator, parameters)
    else {
        for (let expo = -1; expo <= 1; expo += 0.005) {
            const candidate = fit(expo, pwm, thrust, actuator, parameters)
            if (!result || candidate.deviation < result.deviation) result = candidate
        }
    }
    // The inclusive finite scan always produces its initial candidate, even for NaN scores.
    const best = result!
    const uncorrectedActuator = pwm.map(value => ((value - parameters.MOT_PWM_MIN) / (parameters.MOT_PWM_MAX - parameters.MOT_PWM_MIN) - parameters.MOT_SPIN_MIN) / (parameters.MOT_SPIN_MAX - parameters.MOT_SPIN_MIN))
    const uncorrected = linear_interp(thrust, uncorrectedActuator, actuator)
    parameters.MOT_THST_EXPO = best.expo
    output.expoDisplay = best.expo.toFixed(3)
    const percent = array_scale(actuator, 100)
    output.expoData = [
        { x: percent, y: uncorrected, name: 'Measured Thrust', mode: 'lines' },
        { x: percent, y: best.corrected, name: 'Linearized Thrust', mode: 'lines' },
    ]
    state.hoverDisplay = ''
    if (parameters.COPTER_AUW > 0 && parameters.MOTOR_COUNT > 0) {
        const required = parameters.COPTER_AUW / parameters.MOTOR_COUNT
        // Preserve sparse legacy interpolation slots; the shared helper performs the same unchecked arithmetic.
        const hover = linear_interp(percent, best.corrected as number[], [required])[0]!
        if (hover >= 0 && hover <= 100) {
            parameters.MOT_THST_HOVER = Math.round((hover / 100) * 10000) / 10000
            state.saveHover = true
            state.hoverDisplay = parameters.MOT_THST_HOVER.toFixed(3)
            output.expoData.push({ x: [hover], y: [required], name: 'THST_HOVER', mode: 'markers', marker: { size: 6, symbol: 'circle', color: 'green' } })
        }
    }
    output.errorData = [{ x: array_scale(array_offset(actuator.slice(0, -1), 0.001 * 0.5), 100), y: best.gradient, name: 'Linearized Thrust<br>Std dev: ' + best.deviation.toFixed(3), mode: 'lines', line: { color: 'indianred' } }]
    output.gradientMean = best.mean
    output.pwmData = [{ x: accepted.map(row => row.pwm), y: accepted.map(row => row.thrust), name: 'Measured Thrust', mode: 'lines' }]
    return output
}

/** Serialize in original declaration order without a terminal newline, using the shared float32 formatter. */
export function parameterFile(state: CalculationState): string {
    return parameterNames.filter(name => name !== 'MOTOR_COUNT' && name !== 'COPTER_AUW' && (name !== 'MOT_THST_HOVER' || state.saveHover))
        .map(name => `${name},${param_to_string(state.parameters[name] ?? 0)}`).join('\n')
}

/** Read supported comma-separated parameters in file order, retaining duplicates and parseFloat's legacy acceptance. */
export function parseParameterFile(text: string): { name: ParameterName; value: number }[] {
    const entries: { name: ParameterName; value: number }[] = []
    for (const line of text.split('\n')) {
        const [name, value] = line.split(',')
        if (parameterNames.includes(name as ParameterName)) entries.push({ name: name as ParameterName, value: parseFloat(value ?? '') })
    }
    return entries
}
