/** Explicit ABI for the checked-in ArduPilot bindings.cpp; units belong to callers. */
export interface ControlModule {
    /** Return the square-root controller demand. */
    _sqrt_controller_wrapper(error: number, gain: number, acceleration: number, dt: number): number
    /** Return shaped angular acceleration, using the supplied angular units. */
    _shape_angle_vel_accel_wrapper(position: number, velocity: number, acceleration: number, currentPosition: number, currentVelocity: number, currentAcceleration: number, minVelocity: number, maxVelocity: number, maxAcceleration: number, maxJerk: number, dt: number, limit: boolean): number
    /** Return shaped acceleration with asymmetric velocity and acceleration bounds. */
    _shape_pos_vel_accel_wrapper(position: number, velocity: number, acceleration: number, currentPosition: number, currentVelocity: number, currentAcceleration: number, minVelocity: number, maxVelocity: number, minAcceleration: number, maxAcceleration: number, maxJerk: number, dt: number, limit: boolean): number
}
export interface Disposable {
    /** Release this owned Embind handle exactly once. */
    delete(): void
}
export interface WasmVector extends Disposable {
    /** Resize the native vector with an explicit fill value. */
    resize(length: number, fill: number): void
    /** Copy one scalar into the native vector. */
    set(index: number, value: number): void
    /** Read a scalar from the native vector. */
    get(index: number): number
}
interface Input extends Disposable {
    current_position: WasmVector; current_velocity: WasmVector; current_acceleration: WasmVector
    target_position: WasmVector; target_velocity: WasmVector; target_acceleration: WasmVector
    max_velocity: WasmVector; max_acceleration: WasmVector; max_jerk: WasmVector
    control_interface: unknown
}
interface Trajectory extends Disposable {
    /** Return the calculated duration in seconds. */
    get_duration(): number
    /** Return an owned sample; each vector property access allocates another owned handle. */
    at_time(time: number): Disposable & { position: WasmVector; velocity: WasmVector; acceleration: WasmVector; jerk: WasmVector }
}
export interface RuckigModule {
    Vector: new () => WasmVector
    InputParameter: new (dof: number) => Input
    Trajectory: new (dof: number) => Trajectory
    Ruckig: new (dof: number) => Disposable & {
        /** Calculate into the owned trajectory; preserve native result codes. */
        calculate(input: Input, trajectory: Trajectory): { value: number }
    }
    ControlInterface: { Position: unknown; Velocity: unknown }
}
interface FactoryOptions { wasmBinary: ArrayBuffer }
type Factory<T> = (options: FactoryOptions) => Promise<T>
declare global { interface Window { ControlModule?: Factory<ControlModule> } }

/** Fetch owned WASM bytes with cancellation and reject HTTP error bodies before instantiation. */
async function binary(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Unable to load ${url}: HTTP ${response.status}`)
    return response.arrayBuffer()
}

/** Initialize unmodified glue with explicit binaries. The mounting effect owns the
 * abort signal and discards late results; Emscripten module memory is GC-owned.
 * Dynamic import uses the staged original URL, never a rewritten vendor bundle.
 */
export async function initialize(base: string, plane: boolean, signal: AbortSignal) {
    const controlFactory = window.ControlModule
    if (!controlFactory) throw new Error('Unable to load ArduPilot control glue. Reload to retry.')
    const controlBytes = await binary(`${base}ardupilot/control.wasm`, signal)
    const control = await controlFactory({ wasmBinary: controlBytes })
    signal.throwIfAborted()
    if (plane) return { control, ruckig: undefined }
    // A same-origin absolute URL keeps Vite from transforming this staged public ES module.
    const url = new URL(`${base}Ruckig/ruckig.js`, window.location.href).href
    // The asset is pinned in runtime-assets.json; this declaration describes its ES export boundary.
    const glue: { default: Factory<RuckigModule> } = await import(/* @vite-ignore */ url)
    const ruckigBytes = await binary(`${base}Ruckig/ruckig.wasm`, signal)
    const ruckig = await glue.default({ wasmBinary: ruckigBytes })
    signal.throwIfAborted()
    return { control, ruckig }
}
