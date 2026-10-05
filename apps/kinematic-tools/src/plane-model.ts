import { array_scale, array_offset, array_sub } from '@webtools/numerics'
import { makePlots, number, modeFlags, planeParameters } from './model.ts'
import type { Values, Axis, Mode, Plots, State, Target, PlaneConfig, ModeFlags } from './model.ts'
import type { ControlModule } from './wasm.ts'

/** Bind immutable WASM dependencies; simulations own their arrays and return plot snapshots.
 * Sample indexing is safe because every updater appends exactly one sample per timestep.
 */
export function createPlaneSimulator(ardupilotModule: ControlModule) {
/** Wrap degrees using the legacy remainder operation. */
function wrap_360(x: number): number
{
    let ret = x % 360.0
    if (ret < 0.0) {
        ret += 360.0
    }
    return ret
}

/** Wrap degrees to (-180, 180], retaining the positive boundary. */
function wrap_180(x: number): number
{
    let ret = wrap_360(x)
    if (ret > 180.0) {
        ret -= 360.0
    }
    return ret
}

// Old method, error path only, no input shaping
/** Append the old plane error-path sample, including intentionally omitted initial acceleration. */
function updateOld(params: PlaneConfig, mode: ModeFlags, desired: Target, state: State, dt: number): void
{
    const i = state.pos.length

    let vel_target = NaN
    if (mode.use_pos) {

        const pos_error = wrap_180(desired.pos - state.pos[i-1]!)
        vel_target = pos_error / params.timeConstant

        if (params.rateMax > 0) {
            vel_target = Math.min(params.rateMax, vel_target)
        }
        if (params.rateMin > 0) {
            vel_target = Math.max(-params.rateMin, vel_target)
        }

    } else if (mode.use_vel) {
        vel_target = desired.vel
    }

    // update velocity
    state.vel[i] = vel_target

    // Integrate to position
    state.pos[i] = wrap_180(state.pos[i-1]! + (state.vel[i-1]! + vel_target) * dt * 0.5)

    // Differentiate to accel
    state.accel[i] = (vel_target - state.vel[i-1]!) / dt

    // Ignore accel in first step, it swamps the plot
    if (i == 1) {
        state.accel[0] = NaN
        state.accel[1] = NaN
    }
}

// New method input shaping
/** Append the plane shaped target in degrees at its original 50 Hz timestep. */
function updateInputShaping(params: PlaneConfig, mode: ModeFlags, desired: Target, state: State, dt: number): void
{
    const i = state.pos.length

    const jerk_limit = params.accelMax / Math.max(params.timeConstant, 0.1);

    let accel = NaN
    if (mode.use_pos) {
        // Ensure the shortest path is taken
        const angle_error = wrap_180(desired.pos - state.pos[i-1]!);

        accel = ardupilotModule._shape_pos_vel_accel_wrapper(
            angle_error, 0.0, 0.0, // desired pos, vel and accel
            0.0, state.vel[i-1]!, state.accel[i-1]!, // current shaped target
            -params.rateMin, params.rateMax, // velocity limits
            -params.accelMax, params.accelMax, // accel limits
            jerk_limit,
            dt, true)

    } else if (mode.use_vel) {
        accel = ardupilotModule._shape_pos_vel_accel_wrapper(
            0.0, desired.vel, 0.0, // desired pos, vel and accel
            0.0, state.vel[i-1]!, state.accel[i-1]!, // current shaped target
            -params.rateMin, params.rateMax, // velocity limits
            -params.accelMax, params.accelMax, // accel limits
            jerk_limit, // jerk limit
            dt, true)
    }

    const delta_pos = state.vel[i-1]! * dt + accel * 0.5 * Math.pow(dt, 2.0)
    state.pos[i] =  wrap_180(state.pos[i-1]! + delta_pos)

    const delta_vel = accel * dt
    state.vel[i] = state.vel[i-1]! + delta_vel

    state.accel[i] = accel

}

// New method error path
/** Append the new plane error path with its independent gain and asymmetric rate limits. */
function updateError(params: PlaneConfig, mode: ModeFlags, desired: Target, state: State, dt: number): void
{
    const i = state.pos.length

    let vel_target = NaN
    if (mode.use_pos) {

        const pos_error = wrap_180(desired.pos - state.pos[i-1]!)

        let angle_gain = 1.0 / params.timeConstant
        if (params.angleP > 0) {
            angle_gain = params.angleP
        }

        vel_target = ardupilotModule._sqrt_controller_wrapper(pos_error, angle_gain, params.accelMax * 0.5, dt)

        if (params.rateMax > 0) {
            vel_target = Math.min(params.rateMax, vel_target)
        }
        if (params.rateMin > 0) {
            vel_target = Math.max(-params.rateMin, vel_target)
        }

    } else if (mode.use_vel) {
        vel_target = desired.vel
    }

    // update velocity
    state.vel[i] = vel_target

    // Integrate to position
    state.pos[i] = wrap_180(state.pos[i-1]! + (state.vel[i-1]! + vel_target) * dt * 0.5)

    // Differentiate to accel
    state.accel[i] = (vel_target - state.vel[i-1]!) / dt

    // Ignore accel in first step, it swamps the plot
    if (i == 1) {
        state.accel[0] = NaN
        state.accel[1] = NaN
    }

}

/** Simulate one complete control snapshot, preserving legacy stop tolerances and plot omissions. */
function simulate(values: Values, axis: Axis, selectedMode: Mode): Plots {
    const mode = modeFlags(selectedMode)
    const params = planeParameters(values, axis)
    const [ang_pos, ang_vel, ang_accel, ang_jerk] = makePlots(true)
    const desired = {
        pos: wrap_180(number(values, "desired_pos")),
        vel: number(values, "desired_vel"),
    }

    const end_time = number(values, "end_time")
    const max_time = 20

    const dt = 1/50

    const pos_tol = 0.1
    const vel_tol = 0.1

    // Initial state
    let time = [0]
    const oldState: State = {
        pos: [wrap_180(number(values, "initial_pos"))],
        vel: [number(values, "initial_vel")],
        accel: [0]
    }
    const SCurveState: State = {
        pos: [wrap_180(number(values, "initial_pos"))],
        vel: [number(values, "initial_vel")],
        accel: [0]
    }
    const errorState: State = {
        pos: [wrap_180(number(values, "initial_pos"))],
        vel: [number(values, "initial_vel")],
        accel: [0]
    }

    // Run until current reaches target
    let i = 1
    let done_time
    while(true) {

        updateOld(params, mode, desired, oldState, dt)
        updateInputShaping(params, mode, desired, SCurveState, dt)
        updateError(params, mode, desired, errorState, dt)

        // update time
        time[i] = i * dt

        // Check if the target has been reached
        if (done_time == null) {
            let done = false
            if (mode.use_pos) {
                done = Math.abs(wrap_180(desired.pos - oldState.pos[i]!)) < pos_tol &&
                        Math.abs(wrap_180(desired.pos - SCurveState.pos[i]!)) < pos_tol &&
                        Math.abs(wrap_180(desired.pos - errorState.pos[i]!)) < pos_tol

            } else if (mode.use_vel) {
                done = Math.abs(desired.vel - oldState.vel[i]!) < vel_tol &&
                        Math.abs(desired.vel - SCurveState.vel[i]!) < vel_tol
            }
            if (done) {
                done_time = time[i]
            }

        } else {
            if (time[i]! > Math.max(done_time + 0.5, end_time)) {
                // Run for a short time after completion
                break
            }
        }


        if (time[i]! >= max_time) {
            // Reached max time
            break
        }
        i++
    }

    // Update plots
    ang_pos.data[0].x = time
    ang_pos.data[0].y = oldState.pos
    ang_pos.data[1].x = time
    ang_pos.data[1].y = SCurveState.pos
    ang_pos.data[2].x = time
    ang_pos.data[2].y = errorState.pos
    ang_pos.data[2].visible = mode.use_pos
    ang_pos.layout.shapes![0].y0 = desired.pos
    ang_pos.layout.shapes![0].y1 = desired.pos
    ang_pos.layout.shapes![0].visible = mode.use_pos

    ang_vel.data[0].x = time
    ang_vel.data[0].y = oldState.vel
    ang_vel.data[1].x = time
    ang_vel.data[1].y = SCurveState.vel
    ang_vel.data[2].x = time
    ang_vel.data[2].y = errorState.vel
    ang_vel.data[2].visible = mode.use_pos
    ang_vel.layout.shapes![0].y0 = desired.vel
    ang_vel.layout.shapes![0].y1 = desired.vel
    ang_vel.layout.shapes![0].visible = mode.use_vel

    ang_accel.data[0].x = time
    ang_accel.data[0].y = oldState.accel
    ang_accel.data[1].x = time
    ang_accel.data[1].y = SCurveState.accel
    ang_accel.data[2].x = time
    ang_accel.data[2].y = errorState.accel
    ang_accel.data[2].visible = mode.use_pos

    // Calculate jerk by differentiating accel
    const jerkTime = array_offset(time.slice(0, -1), dt * 0.5)
    //const oldJerk = array_scale(array_sub(oldState.accel.slice(1), oldState.accel.slice(0, -1)), 1 / dt)
    const SCurveJerk = array_scale(array_sub(SCurveState.accel.slice(1), SCurveState.accel.slice(0, -1)), 1 / dt)
    //const errorJerk = array_scale(array_sub(errorState.accel.slice(1), errorState.accel.slice(0, -1)), 1 / dt)

    // Since old controller and error path are not jerk limited plotting it blows up the scale
    //ang_jerk.data[0].x = jerkTime
    //ang_jerk.data[0].y = oldJerk
    ang_jerk.data[1].x = jerkTime
    ang_jerk.data[1].y = SCurveJerk
    //ang_jerk.data[2].x = jerkTime
    //ang_jerk.data[2].y = errorJerk
    //ang_jerk.data[2].visible = mode.use_pos

    return [ang_pos, ang_vel, ang_accel, ang_jerk]
}

return simulate
}
