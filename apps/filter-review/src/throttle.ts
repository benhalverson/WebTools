import type { DataflashLog } from '@webtools/dataflash'
import { linear_interp, array_scale } from '@webtools/numerics'
import { get_air_density_model } from './atmosphere.ts'
import { numbers, parameter, type Series } from './tracking.ts'

/** Recover individual motor thrust with the original frame/function mapping,
 * battery compensation, inverse thrust curve and atmosphere correction. */
export function motorThrust(log: DataflashLog): Series[] {
    if (!log.messageTypes.RCOU) return []
    const functions = Array.from({ length: 32 }, (_value, i) => parameter(log, 'SERVO' + (i + 1) + '_FUNCTION'))
    const motorCount = functions.filter(value => value != null && (value >= 33 && value <= 40 || value >= 82 && value <= 85)).length
    const frame = parameter(log, 'FRAME_CLASS') ?? parameter(log, 'Q_FRAME_CLASS')
    const counts: Record<number, number> = { 1: 4, 2: 6, 3: 8, 4: 8, 5: 6, 7: 4, 8: 6, 9: 6, 12: 12, 14: 10, 15: motorCount, 16: motorCount, 17: motorCount }
    const count = frame === undefined ? undefined : counts[frame]
    if (count !== undefined && count !== motorCount) return []
    /** Preserve the noncontiguous ArduPilot motor function numbering. */
    const motorFunction = (channel: number) => channel < 8 ? 33 + channel : 82 + channel - 8
    let motors = Array.from({ length: count ?? 0 }, (_value, i) => motorFunction(i))
    if (frame === 7) motors = [motorFunction(0), motorFunction(1), motorFunction(3)]
    else if (frame === 8 || frame === 9) motors = [motorFunction(5), motorFunction(6)]
    else if (frame === 10) motors = [73, 74]
    if (!motors.length || motors.some(motor => !functions.includes(motor))) return []
    const params: Record<string, number> = { OPTIONS: 0 }
    for (const name of ['THST_EXPO', 'SPIN_MAX', 'SPIN_MIN', 'PWM_MIN', 'PWM_MAX', 'BAT_VOLT_MIN', 'BAT_VOLT_MAX', 'BAT_IDX', 'OPTIONS']) {
        for (const prefix of ['MOT_', 'Q_M_']) {
            const value = parameter(log, prefix + name)
            if (value != null) params[name] = value
        }
        if (params[name] == null) return []
    }
    const expo = Math.min(Math.max(params.THST_EXPO!, -1.0), 1.0)
    const skipBattery = params.BAT_VOLT_MAX! <= 0 || params.BAT_VOLT_MIN! >= params.BAT_VOLT_MAX!
    let batteryTime: Float64Array = new Float64Array(), voltage: number[] = [], lift: number[] = []
    if (!skipBattery) {
        const instance = params.BAT_IDX!
        if (!log.messageTypes.BAT?.instances?.[String(instance)]) return []
        batteryTime = numbers(log, 'BAT', 'TimeUS', instance)
        const raw = numbers(log, 'BAT', 'Volt', instance), resting = numbers(log, 'BAT', 'VoltR', instance)
        for (let i = 0; i < raw.length; i++) {
            const v = params.OPTIONS! & 1 ? raw[i]! : Math.max(raw[i]!, resting[i]!)
            if (v < 0.25 * params.BAT_VOLT_MIN!) { voltage[i] = 1; lift[i] = 1; continue }
            voltage[i] = Math.min(Math.max(v, params.BAT_VOLT_MIN!), params.BAT_VOLT_MAX!) / params.BAT_VOLT_MAX!
            lift[i] = voltage[i]! * (1 - expo) + expo * voltage[i]! * voltage[i]!
        }
    }
    const barometer = parameter(log, 'BARO_PRIMARY')
    if (barometer === undefined || !log.messageTypes.BARO?.instances?.[String(barometer)]) return []
    const barometerTime = numbers(log, 'BARO', 'TimeUS', barometer), altitude = numbers(log, 'BARO', 'Alt', barometer)
    const atmosphere = get_air_density_model()
    const correction = Array.from(altitude, value => {
        const ratio = 1.0 / Math.pow(atmosphere.get_EAS2TAS(value), 2.0)
        return ratio > 0.3 && ratio < 1.5 ? 1.0 / Math.min(Math.max(ratio, 0.5), 1.25) : 1.0
    })
    return motors.map(motor => {
        const channel = functions.indexOf(motor), message = channel < 14 ? 'RCOU' : channel < 18 ? 'RCO2' : 'RCO3'
        const pwm = numbers(log, message, 'C' + (channel + 1)), time = numbers(log, message, 'TimeUS')
        const density = linear_interp(correction, barometerTime, time)
        const battery = skipBattery ? [] : linear_interp(voltage, batteryTime, time)
        const maximum = skipBattery ? [] : linear_interp(lift, batteryTime, time)
        const value = Array.from(pwm, (pulse, i) => {
            let throttle = (pulse - params.PWM_MIN!) / (params.PWM_MAX! - params.PWM_MIN!)
            throttle = (throttle - params.SPIN_MIN!) / (params.SPIN_MAX! - params.SPIN_MIN!)
            throttle = Math.min(Math.max(throttle, 0.0), 1.0)
            const voltage = skipBattery ? 1.0 : battery[i]!, lift = skipBattery ? 1.0 : maximum[i]!
            const scale = voltage > 0 ? 1.0 / voltage : 1.0
            let thrust: number
            if (expo === 0) thrust = throttle / (lift * scale)
            else {
                thrust = ((throttle / scale) * (2.0 * expo)) - (expo - 1.0)
                thrust = (thrust * thrust) - ((1.0 - expo) * (1.0 - expo))
                thrust /= 4.0 * expo * lift
                thrust = Math.min(Math.max(thrust, 0.0), 1.0)
            }
            return thrust / (lift <= 0 ? 1.0 : (1.0 / lift) * density[i]!)
        })
        return { time: array_scale(time, 1 / 1000000), value }
    })
}
