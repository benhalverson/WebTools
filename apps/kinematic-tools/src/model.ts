export type Axis = 'R' | 'P' | 'Y'
export type Mode = 'angle' | 'rate' | 'angle+rate'
export type Values = Readonly<Record<string, string>>
export interface ModeFlags { use_pos: boolean; use_vel: boolean }
export interface Target { pos: number; vel: number }
export interface State { pos: number[]; vel: number[]; accel: number[] }
export interface RuckigState extends State { time: number[]; jerk?: number[] }
export interface MainConfig { mode: ModeFlags; vel_limit: number; accel_limit: number; input_tc: number; rate_tc: number }
export interface PlaneConfig { rateMax: number; rateMin: number; accelMax: number; timeConstant: number; angleP: number }
export interface Trace { [key: string]: unknown; x?: number[]; y?: number[]; visible?: boolean }
export interface Shape { type: string; line: { dash: string }; xref: string; x0: number; x1: number; visible: boolean; y0?: number; y1?: number }
export interface PlotSnapshot {
    data: [Trace, Trace, Trace]
    layout: { [key: string]: unknown; shapes?: [Shape] }
}
export type Plots = [PlotSnapshot, PlotSnapshot, PlotSnapshot, PlotSnapshot]

/** Decode a raw numeric field with legacy parseFloat behavior. */
export function number(values: Values, key: string): number { return parseFloat(values[key] ?? '') }

/** Translate the controlled mode into the two independent controller switches. */
export function modeFlags(mode: Mode): ModeFlags { return { use_pos: mode !== 'rate', use_vel: mode !== 'angle' } }

/** Select parameter identities without discarding values for inactive axes. */
export function mainParameters(axis: Axis) {
    return { rate_max: `ATC_RATE_${axis}_MAX`, accel_max: `ATC_ACC_${axis}_MAX`, rate_tc: axis === 'Y' ? 'PILOT_Y_RATE_TC' : 'ACRO_RP_RATE_TC' }
}

/** Read plane limits in degrees, preserving asymmetric pitch limits. */
export function planeParameters(values: Values, axis: Axis): PlaneConfig {
    const roll = axis === 'R'
    return {
        rateMax: number(values, roll ? 'RLL2SRV_RMAX' : 'PTCH2SRV_RMAX_UP'),
        rateMin: number(values, roll ? 'RLL2SRV_RMAX' : 'PTCH2SRV_RMAX_DN'),
        accelMax: number(values, roll ? 'RLL2SRV_ACCEL' : 'PTCH2SRV_ACCEL'),
        timeConstant: number(values, roll ? 'RLL2SRV_TCONST' : 'PTCH2SRV_TCONST'),
        angleP: number(values, roll ? 'RLL_ANGLE_P' : 'PTCH_ANGLE_P'),
    }
}

/** Create independent legacy plot definitions; mutations never escape a simulation. */
export function makePlots(plane: boolean): Plots {
    const units = ['deg', 'deg/s', 'deg/s²', 'deg/s³']
    const titles = ['Angle', 'Angular Velocity', 'Angular Acceleration', 'Jerk']
    const names = plane ? ['Pre 4.8', 'Input shaping 4.8 +', 'Error 4.8 +'] : ['Sqrt (pre 4.7)', 'SCurve (4.7+)', 'minimum time']
    /** Build one plot with three ordered traces and the original target-line styling. */
    function plot(index: number): PlotSnapshot {
        /** Allocate a trace so Plotly cannot mutate another plot's data. */
        function trace(name: string): Trace { return { mode: 'lines', ...(plane ? { showlegend: true } : {}), hovertemplate: `<extra></extra>%{x:.2f} s<br>%{y:.2f} ${units[index]}`, name } }
        return {
            data: [trace(names[0]!), trace(names[1]!), trace(names[2]!)],
            layout: {
                legend: { itemclick: false, itemdoubleclick: false },
                margin: { b: 50, l: 60, r: 50, t: 20 },
                xaxis: { title: { text: 'Time (s)' } },
                yaxis: { title: { text: `${titles[index]} (${units[index]})` } },
                ...(index < 2 ? { shapes: [{ type: 'line', line: { dash: 'dot' }, xref: 'paper', x0: 0, x1: 1, visible: false }] as [Shape] } : {}),
            },
        }
    }
    return [plot(0), plot(1), plot(2), plot(3)]
}

export const mainDefaults: Values = {
    "desired_pos": "30",
    "desired_vel": "0",
    "end_time": "1",
    "initial_pos": "0",
    "initial_vel": "0",
    "ATC_RATE_R_MAX": "0",
    "ATC_ACC_R_MAX": "1100",
    "ATC_RATE_P_MAX": "0",
    "ATC_ACC_P_MAX": "1100",
    "ATC_RATE_Y_MAX": "0",
    "ATC_ACC_Y_MAX": "270",
    "ACRO_RP_RATE_TC": "0",
    "PILOT_Y_RATE_TC": "0",
    "ATC_INPUT_TC": "0.15"
}

export const planeDefaults: Values = {
    "desired_pos": "30",
    "desired_vel": "0",
    "end_time": "1",
    "initial_pos": "0",
    "initial_vel": "0",
    "RLL2SRV_RMAX": "0",
    "RLL2SRV_ACCEL": "500",
    "RLL2SRV_TCONST": "0.5",
    "RLL_ANGLE_P": "0",
    "PTCH2SRV_RMAX_UP": "0",
    "PTCH2SRV_RMAX_DN": "0",
    "PTCH2SRV_ACCEL": "500",
    "PTCH2SRV_TCONST": "0.5",
    "PTCH_ANGLE_P": "0"
}
