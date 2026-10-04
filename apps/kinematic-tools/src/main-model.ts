import { array_scale, array_offset, array_sub, array_from_range } from '@webtools/numerics'
import { makePlots, number, modeFlags, mainParameters } from './model.ts'
import type { Values, Axis, Mode, Plots, State, Target, MainConfig, RuckigState } from './model.ts'
import type { ControlModule, RuckigModule, WasmVector, Disposable } from './wasm.ts'

/** Bind immutable WASM dependencies; simulations own their arrays and return plot snapshots.
 * Sample indexing is safe because every updater appends exactly one sample per timestep.
 */
export function createMainSimulator(ardupilotModule: ControlModule, RuckigModule: RuckigModule) {
/** Convert degrees to radians without changing the legacy multiplication order. */
function radians(deg: number): number
{
    return deg * (Math.PI/180)
}

/** Convert radians to displayed degrees. */
function degrees(rad: number): number
{
    return rad * (180/Math.PI)
}

/** Wrap radians to (-π, π], retaining the legacy positive boundary. */
function wrap_PI(x: number): number
{
    let ret = wrap_2PI(x)
    if (ret > Math.PI) {
        ret -= Math.PI * 2.0
    }
    return ret
}

/** Wrap radians to [0, 2π) with JavaScript remainder semantics. */
function wrap_2PI(x: number): number
{
    const M_2PI = Math.PI * 2.0
    let ret = x % M_2PI
    if (ret < 0.0) {
        ret += M_2PI
    }
    return ret
}

/** Match the controller’s strict positive-limit test. */
function is_positive(x: number): boolean
{
    return x > 0.0
}

/** Clamp a request in the legacy comparison order, including NaN propagation. */
function constrain_float(amt: number, low: number, high: number): number
{
    if (amt < low) {
        return low
    }

    if (amt > high) {
        return high
    }

    return amt
}

/** Append one pre-4.7 sample; input samples exist at i−1 by construction. */
function updateSqrtControl(config: MainConfig, desired: Target, state: State, dt: number): void
{
    const i = state.pos.length

    let vel_target = NaN
    if (config.mode.use_pos) {

        let desired_ang_vel = 0
        if (config.mode.use_vel) {
            desired_ang_vel = desired.vel
        }
        const pos_error = wrap_PI(desired.pos - state.pos[i-1]!)
        vel_target = input_shaping_angle(pos_error, config.input_tc, config.accel_limit, state.vel[i-1]!, desired_ang_vel, config.vel_limit, dt)

    } else if (config.mode.use_vel) {
        vel_target = input_shaping_ang_vel(state.vel[i-1]!, desired.vel, config.accel_limit, dt, config.rate_tc)
    }

    if (is_positive(config.vel_limit)) {
        vel_target = constrain_float(vel_target, -config.vel_limit, config.vel_limit)
    }

    // update velocity
    state.vel[i] = vel_target

    // Integrate to position
    state.pos[i] = wrap_PI(state.pos[i-1]! + (state.vel[i-1]! + vel_target) * dt * 0.5)

    // Differentiate to accel
    state.accel[i] = (vel_target - state.vel[i-1]!) / dt

}

// Shapes the velocity request based on a rate time constant. The angular acceleration and deceleration is limited.
/** Apply the rate time constant followed by the acceleration bound. */
function input_shaping_ang_vel(target_ang_vel: number, desired_ang_vel: number, accel_max: number, dt: number, input_tc: number): number
{
    if (is_positive(input_tc)) {
        // Calculate the acceleration to smoothly achieve rate. Jerk is not limited.
        const error_rate = desired_ang_vel - target_ang_vel
        const desired_ang_accel = ardupilotModule._sqrt_controller_wrapper(error_rate, 1.0 / Math.max(input_tc, 0.01), 0.0, dt)
        desired_ang_vel = target_ang_vel + desired_ang_accel * dt
    }
    // Acceleration is limited directly to smooth the beginning of the curve.
    if (is_positive(accel_max)) {
        const delta_ang_vel = accel_max * dt
        return constrain_float(desired_ang_vel, target_ang_vel - delta_ang_vel, target_ang_vel + delta_ang_vel)
    } else {
        return desired_ang_vel
    }
}

// calculates the velocity correction from an angle error. The angular velocity has acceleration and
// deceleration limits including basic jerk limiting using _input_tc
/** Shape angle error through the checked-in ArduPilot sqrt controller. */
function input_shaping_angle(error_angle: number, input_tc: number, accel_max: number, target_ang_vel: number, desired_ang_vel: number, max_ang_vel: number, dt: number): number
{
    // Calculate the velocity as error approaches zero with acceleration limited by accel_max_radss
    desired_ang_vel += ardupilotModule._sqrt_controller_wrapper(error_angle, 1.0 / Math.max(input_tc, 0.01), accel_max, dt)
    if (is_positive(max_ang_vel)) {
        desired_ang_vel = constrain_float(desired_ang_vel, -max_ang_vel, max_ang_vel)
    }

    // Acceleration is limited directly to smooth the beginning of the curve.
    return input_shaping_ang_vel(target_ang_vel, desired_ang_vel, accel_max, dt, 0.0)
}


// calculates the velocity correction from an angle error. The angular velocity has acceleration and
// deceleration limits including basic jerk limiting using _input_tc
// Translated from `AC_AttitudeControl::attitude_command_model`
/** Preserve ArduPilot fallback acceleration and time-constant rules before the WASM call. */
function attitude_command_model(error_angle: number, desired_ang_vel: number, target_ang_vel: number, target_ang_accel: number, max_ang_vel: number, accel_max: number, input_tc: number, dt: number): number
{
    if (!is_positive(dt)) {
        return 0.0;
    }
    
    // protect against divide by zero
    if (!is_positive(accel_max)) {
        // no acceleration set so default to 1800 degrees/s²
        accel_max = radians(1800);
    }

    if (!is_positive(input_tc)) {
        // no acceleration set so default to achieve maximum acceleration in 10 clock cycles
        input_tc = dt * 10.0;
    }

    return ardupilotModule._shape_angle_vel_accel_wrapper(
        error_angle, desired_ang_vel, 0.0, // Target
        0.0, target_ang_vel, target_ang_accel, // Current
        -max_ang_vel, max_ang_vel, // Vel limits
        accel_max, // accel limit
        accel_max / input_tc, // jerk limit
        dt, true // time step and limit flag
    );
}

/** Append a 4.7+ sample using the legacy integration order and angle wrapping. */
function updateSCurve(config: MainConfig, desired: Target, state: State, dt: number): void
{
    const i = state.pos.length

    let accel = NaN
    if (config.mode.use_pos) {

        let desired_ang_vel = 0
        if (config.mode.use_vel) {
            desired_ang_vel = desired.vel
        }

        accel = attitude_command_model(wrap_PI(desired.pos - state.pos[i-1]!), desired_ang_vel, state.vel[i-1]!, state.accel[i-1]!, config.vel_limit, config.accel_limit, config.input_tc, dt)

    } else if (config.mode.use_vel) {
        accel = attitude_command_model(0.0, desired.vel, state.vel[i-1]!, state.accel[i-1]!, 0.0, config.accel_limit, config.rate_tc, dt)

    }

    const delta_pos = state.vel[i-1]! * dt + accel * 0.5 * Math.pow(dt, 2.0)
    state.pos[i] =  wrap_PI(state.pos[i-1]! + delta_pos)

    const delta_vel = accel * dt
    state.vel[i] = state.vel[i-1]! + delta_vel

    state.accel[i] = accel

}

// Ruckig is a time-optimal jerk limited trajectory planner
// see: https://github.com/pantor/ruckig
/** Calculate the time-optimal reference and release all owned Embind handles. */
function update_ruckig(config: MainConfig, desired: Target, state: RuckigState, dt: number): void
{
    const resources: Disposable[] = []
    try {
    /** Allocate a copied vector tracked for release after trajectory calculation. */
function toWASM(vec: number[]): WasmVector {
        const q = new RuckigModule.Vector()
        resources.push(q)
        const len = vec.length
        q.resize(len, 0.0)
        for (let i = 0; i < len; i++) {
            q.set(i, vec[i]!)
        }
        return q
    }

    // Single DoF
    const input = new RuckigModule.InputParameter(1)
    resources.push(input)

    // Start
    input.current_position = toWASM([state.pos[0]!])
    input.current_velocity = toWASM([state.vel[0]!])
    input.current_acceleration = toWASM([state.accel[0]!])

    // Extract config
    let desired_ang_vel = 0
    let jerkLimit = Infinity
    if (config.mode.use_pos) {
        if (config.mode.use_vel) {
            desired_ang_vel = desired.vel
        }
        if (config.input_tc > 0) {
            jerkLimit = config.accel_limit / config.input_tc
        }
        input.control_interface = RuckigModule.ControlInterface.Position

    } else if (config.mode.use_vel) {
        if (config.rate_tc > 0) {
            jerkLimit = config.accel_limit / config.rate_tc
        }
        input.control_interface = RuckigModule.ControlInterface.Velocity
        desired_ang_vel = desired.vel

    }

    // End
    input.target_position = toWASM([desired.pos])
    input.target_velocity = toWASM([desired_ang_vel])
    input.target_acceleration = toWASM([0])

    // Limits
    let maxVel = Infinity
    if (config.vel_limit > 0) {
        maxVel = config.vel_limit
    }
    input.max_velocity = toWASM([maxVel])
    input.max_acceleration = toWASM([config.accel_limit])
    input.max_jerk = toWASM([jerkLimit])

    const trajectory = new RuckigModule.Trajectory(1);
    resources.push(trajectory)

    const ruckig = new RuckigModule.Ruckig(1);
    resources.push(ruckig)
    const result = ruckig.calculate(input, trajectory);

    if (result.value !== 0) {
        if (result.value === -100) {
            console.log('Invalid input parameters.')
        } else if (result.value === -101) {
            console.log('The trajectory duration exceeds its numerical limits.')
        } else if (result.value === -110) {
            console.log('ErrorExecutionTimeCalculation.')
        } else {
            console.log(`Unknown error (${result.value}).`)
        }
        return
    }

    const duration = trajectory.get_duration();

    state.time = []
    state.pos = []
    state.vel = []
    state.accel = []
    state.jerk = []
    for (const t of array_from_range(0, duration, dt)) {
        const stateAtTime = trajectory.at_time(t)
        const samples: Disposable[] = [stateAtTime]
        try {
            const position = stateAtTime.position; samples.push(position)
            const velocity = stateAtTime.velocity; samples.push(velocity)
            const acceleration = stateAtTime.acceleration; samples.push(acceleration)
            const jerk = stateAtTime.jerk; samples.push(jerk)
            state.time.push(t)
            state.pos.push(position.get(0))
            state.vel.push(velocity.get(0))
            state.accel.push(acceleration.get(0))
            state.jerk.push(jerk.get(0))
        } finally { for (const sample of samples.reverse()) sample.delete() }

    }


    } finally { for (const resource of resources.reverse()) resource.delete() }
}

/** Simulate one complete control snapshot, preserving legacy stop tolerances and plot omissions. */
function simulate(values: Values, axis: Axis, selectedMode: Mode): Plots {
    const mode = modeFlags(selectedMode)
    const param_names = mainParameters(axis)
    const [ang_pos, ang_vel, ang_accel, ang_jerk] = makePlots(false)
    const desired = {
        pos: wrap_PI(radians(number(values, "desired_pos"))),
        vel: radians(number(values, "desired_vel")),
    }

    const end_time = number(values, "end_time")
    const max_time = 20

    const dt = 1/400

    const config = {
        mode,
        vel_limit: radians(number(values, param_names.rate_max)),
        accel_limit: radians(number(values, param_names.accel_max)),
        input_tc: number(values, "ATC_INPUT_TC"),
        rate_tc: number(values, param_names.rate_tc),
    }

    const pos_tol = radians(0.1)
    const vel_tol = radians(0.1)

    // Initial state
    let time = [0]
    const sqrtState: State = {
        pos: [wrap_PI(radians(number(values, "initial_pos")))],
        vel: [radians(number(values, "initial_vel"))],
        accel: [0]
    }
    const SCurveState: State = {
        pos: [wrap_PI(radians(number(values, "initial_pos")))],
        vel: [radians(number(values, "initial_vel"))],
        accel: [0]
    }
    const ruckigState: RuckigState = {
        time: [0],
        pos: [wrap_PI(radians(number(values, "initial_pos")))],
        vel: [radians(number(values, "initial_vel"))],
        accel: [0]
    }

    // Run until current reaches target
    let i = 1
    let done_time
    while(true) {

        updateSqrtControl(config, desired, sqrtState, dt)
        updateSCurve(config, desired, SCurveState, dt)

        // update time
        time[i] = i * dt

        // Check if the target has been reached
        if (done_time == null) {
            let done = false
            if (mode.use_pos) {
                done = Math.abs(wrap_PI(desired.pos - sqrtState.pos[i]!)) < pos_tol &&
                        Math.abs(wrap_PI(desired.pos - SCurveState.pos[i]!)) < pos_tol

            } else if (mode.use_vel) {
                done = Math.abs(desired.vel - sqrtState.vel[i]!) < vel_tol &&
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

    update_ruckig(config, desired, ruckigState, dt)

    // Update plots
    ang_pos.data[0].x = time
    ang_pos.data[0].y = array_scale(sqrtState.pos, 180.0 / Math.PI)
    ang_pos.data[1].x = time
    ang_pos.data[1].y = array_scale(SCurveState.pos, 180.0 / Math.PI)
    ang_pos.data[2].x = ruckigState.time
    ang_pos.data[2].y = array_scale(ruckigState.pos, 180.0 / Math.PI)
    ang_pos.layout.shapes![0].y0 = degrees(desired.pos)
    ang_pos.layout.shapes![0].y1 = degrees(desired.pos)
    ang_pos.layout.shapes![0].visible = mode.use_pos

    ang_vel.data[0].x = time
    ang_vel.data[0].y = array_scale(sqrtState.vel, 180.0 / Math.PI)
    ang_vel.data[1].x = time
    ang_vel.data[1].y = array_scale(SCurveState.vel, 180.0 / Math.PI)
    ang_vel.data[2].x = ruckigState.time
    ang_vel.data[2].y = array_scale(ruckigState.vel, 180.0 / Math.PI)
    ang_vel.layout.shapes![0].y0 = degrees(desired.vel)
    ang_vel.layout.shapes![0].y1 = degrees(desired.vel)
    ang_vel.layout.shapes![0].visible = mode.use_vel

    ang_accel.data[0].x = time
    ang_accel.data[0].y = array_scale(sqrtState.accel, 180.0 / Math.PI)
    ang_accel.data[1].x = time
    ang_accel.data[1].y = array_scale(SCurveState.accel, 180.0 / Math.PI)
    ang_accel.data[2].x = ruckigState.time
    ang_accel.data[2].y = array_scale(ruckigState.accel, 180.0 / Math.PI)

    // Calculate jerk by differentiating accel
    const jerkTime = array_offset(time.slice(0, -1), dt * 0.5)
    //const sqrtJerk = array_scale(array_sub(sqrtState.accel.slice(1), sqrtState.accel.slice(0, -1)), (1 / dt) * (180.0 / Math.PI))
    const SCurveJerk = array_scale(array_sub(SCurveState.accel.slice(1), SCurveState.accel.slice(0, -1)), (1 / dt) * (180.0 / Math.PI))

    // Since sqrt controller is not jerk limited plotting it blows up the scale
    //ang_jerk.data[0].x = jerkTime
    //ang_jerk.data[0].y = sqrtJerk
    ang_jerk.data[1].x = jerkTime
    ang_jerk.data[1].y = SCurveJerk
    ang_jerk.data[2].x = ruckigState.time
    ang_jerk.data[2].y = array_scale(ruckigState.jerk!, 180.0 / Math.PI)

    return [ang_pos, ang_vel, ang_accel, ang_jerk]
}

return simulate
}
