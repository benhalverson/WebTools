import type { DataflashLog } from '@webtools/dataflash'
import { array_mean, array_scale, array_sub } from '@webtools/numerics'

export type Axis = 'Roll' | 'Pitch' | 'Yaw'
export type Vehicle = 'ArduCopter' | 'ArduPlane_VTOL' | 'ArduPlane_FW'
export interface SidSet { axis: number; start: number; end: number; duration: number }
export interface LogAnalysis {
  parameters: Record<string, number>
  sidSets: SidSet[]
  vehicle: Vehicle
  axis: Axis
  useAng: boolean
  flight: { time: number[]; target: number[]; roll: number[]; pitch: number[]; yaw: number[] }
  start: number
  end: number
}
export interface TimeHistory {
  PilotInput: number[]; ActInput: number[]; GyroRaw: number[]; RateTgt: number[]
  Rate: number[]; AttTgt: number[]; Att: number[]; DRBin: number[]
  DRBresp: number[]; SysBLInput: number[]; SysBLOutput: number[]
}
export interface HistoryResult { data: TimeHistory; sampleRate: number; airspeed: number; eas2tas: number }

/** Read the numeric parser boundary without converting strings or vector messages. */
export function numericField(log: DataflashLog, message: string, field: string): Float64Array {
  const values = log.get(message, field)
  if (!(values instanceof Float64Array)) throw new Error(`Missing numeric field ${message}.${field}`)
  return values
}

/** Return the first nearest sample, retaining the legacy tie-breaking rule. */
export function nearestIndex(values: ArrayLike<number>, target: number): number {
  let index = 0
  let distance = Infinity
  for (let i = 0; i < values.length; i++) {
    const candidate = Math.abs(values[i]! - target)
    if (candidate < distance) { index = i; distance = candidate }
  }
  return index
}

/** Map the existing system-identification axis identifiers to the page axis. */
export function axisForSid(axis: number, fallback: Axis = 'Roll'): Axis {
  if ([1, 4, 7, 10, 20, 23].includes(axis)) return 'Roll'
  if ([2, 5, 8, 11, 21, 24].includes(axis)) return 'Pitch'
  if ([3, 6, 9, 12, 22, 25].includes(axis)) return 'Yaw'
  return fallback
}

/** Extract parameters, SID intervals and flight traces from a freshly parsed log.
 * Parameter changes use the last value, as get_param_value's default does.
 * SID intervals retain the half-second gap and TR + one-second cap. */
export function inspectLog(log: DataflashLog): LogAnalysis {
  const names = log.get('PARM', 'Name')
  if (!Array.isArray(names) || !names.every(name => typeof name === 'string')) throw new Error('No params in log')
  const values = numericField(log, 'PARM', 'Value')
  const parameters: Record<string, number> = {}
  for (let i = 0; i < names.length; i++) parameters[names[i] as string] = values[i]!
  const time = array_scale(numericField(log, 'SIDD', 'TimeUS'), 1 / 1000000)
  if (!time.length) throw new Error('No system-identification samples in log')
  const axes = numericField(log, 'SIDS', 'Ax')
  const durations = numericField(log, 'SIDS', 'TR')
  const sidSets: SidSet[] = []
  let start = time[0]!
  /** Close an interval with the matching SIDS duration cap, without resampling. */
  function finish(end: number): void {
    const i = sidSets.length
    const duration = durations[i]!
    sidSets.push({ axis: axes[i]!, start, end: end - start > duration + 1 ? start + duration + 1 : end, duration })
  }
  for (let i = 1; i < time.length; i++) {
    if (time[i]! - time[i - 1]! > 0.5) { finish(time[i - 1]!); start = time[i]! }
  }
  finish(time[time.length - 1]!)
  let vehicle: Vehicle = 'ArduCopter'
  const messages = log.get('MSG', 'Message')
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (typeof message !== 'string') continue
      const firmware = message.split(' ')[0]
      if (firmware === 'ArduPlane') { vehicle = axes[0]! > 19 ? 'ArduPlane_FW' : 'ArduPlane_VTOL'; break }
      if (firmware === 'ArduCopter') break
    }
  }
  const gyroRate = parameters.INS_GYRO_RATE
  if (gyroRate !== 0) parameters.GyroSampleRate = (1 << (gyroRate ?? 0)) * 1000
  const loopRate = parameters.SCHED_LOOP_RATE
  if (loopRate !== undefined && loopRate > 0 && (parameters.FSTRATE_ENABLE ?? 0) > 0 && (parameters.FSTRATE_DIV ?? 0) > 0) {
    parameters.SCHED_LOOP_RATE = ((1 << (gyroRate ?? 0)) * 1000) / parameters.FSTRATE_DIV!
  }
  return {
    parameters, sidSets, vehicle, axis: axisForSid(axes[0]!), useAng: 'ANG' in log.messageTypes,
    flight: { time, target: Array.from(numericField(log, 'SIDD', 'Targ')), roll: Array.from(numericField(log, 'SIDD', 'Gx')), pitch: Array.from(numericField(log, 'SIDD', 'Gy')), yaw: Array.from(numericField(log, 'SIDD', 'Gz')) },
    start: sidSets[0]!.start, end: sidSets[0]!.end,
  }
}

/** Slice a field between nearest timestamps; the end sample remains excluded. */
function sliceField(log: DataflashLog, message: string, field: string, start: number, end: number): number[] {
  const time = numericField(log, message, 'TimeUS')
  return Array.from(numericField(log, message, field)).slice(nearestIndex(time, start * 1000000), nearestIndex(time, end * 1000000))
}

/** Load VTOL/Copter or fixed-wing histories with the legacy field mappings,
 * conversion constant, sample-count rate estimate and mismatched-length maths.
 * Fixed-wing yaw intentionally uses Rudd for desired rate and attitude fields. */
export function loadTimeHistory(log: DataflashLog, start: number, end: number, axis: Axis, vehicle: Vehicle): HistoryResult {
  const fw = vehicle === 'ArduPlane_FW'
  const attitudeMessage = fw ? 'SIDP' : 'ANG' in log.messageTypes ? 'ANG' : 'ATT'
  const rateMessage = fw ? 'SIDP' : 'RATE'
  const letter = axis === 'Roll' ? 'R' : axis === 'Pitch' ? 'P' : 'Y'
  const gyroField = axis === 'Roll' ? 'Gx' : axis === 'Pitch' ? 'Gy' : 'Gz'
  const actuator = axis === 'Roll' ? 'Aile' : axis === 'Pitch' ? 'Elev' : 'Rudd'
  const desired = axis === 'Roll' ? 'rdes' : axis === 'Pitch' ? 'pdes' : 'Rudd'
  const attitude = axis === 'Roll' ? 'Rll' : axis === 'Pitch' ? 'Pit' : 'Rudd'
  /** Read an interval and apply exactly the legacy degrees-to-radians constant. */
  function scaled(message: string, field: string): number[] { return array_scale(sliceField(log, message, field, start, end), 0.01745) }
  const ActInput = fw ? scaled('SIDP', actuator) : sliceField(log, 'RATE', `${letter}Out`, start, end)
  const RateTgt = scaled(rateMessage, fw ? desired : `${letter}Des`)
  const Rate = scaled(fw ? 'SIDD' : 'RATE', fw ? gyroField : letter)
  const AttTgt = scaled(attitudeMessage, fw ? axis === 'Yaw' ? 'Rudd' : `D${attitude}` : `Des${axis}`)
  const Att = scaled(attitudeMessage, fw ? attitude : axis)
  const GyroRaw = scaled('SIDD', gyroField)
  const PilotInput = scaled('SIDD', 'Targ')
  const time = sliceField(log, fw ? 'SIDD' : 'RATE', 'TimeUS', start, end)
  const sampleRate = time.length / ((time[time.length - 1]! - time[0]!) / 1000000)
  return {
    data: { PilotInput, ActInput, GyroRaw, RateTgt, Rate, AttTgt, Att, DRBin: PilotInput, DRBresp: array_sub(Att, PilotInput), SysBLInput: ActInput, SysBLOutput: array_sub(array_scale(PilotInput, 1 / 0.01745), ActInput) },
    sampleRate, airspeed: fw ? array_mean(sliceField(log, 'SIDP', 'aspd', start, end)) : 1,
    eas2tas: fw ? array_mean(sliceField(log, 'SIDP', 'eastas', start, end)) : 1,
  }
}
