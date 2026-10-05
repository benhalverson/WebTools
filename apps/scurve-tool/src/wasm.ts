/** Three-component navigation vector in north/east/down metres (or derivatives). */
export type Vector3 = [number, number, number];

/** Scalar profile returned unchanged by the checked-in C++ bindings. */
export interface Curve {
  time: number[];
  pos: number[];
  vel: number[];
  accel: number[];
  jerk: number[];
  snap: number[];
}

/** Explicit interface to the checked-in Embind wrapper; its owner must delete it. */
export interface NavigationWrapper {
  /** Release the native instance allocated by Embind. */
  delete(): void;
  /** Set waypoint limits in the original binding argument order and SI units. */
  set_wp_nav_params(speed: number, up: number, down: number, radius: number, accel: number, corner: number, vertical: number, jerk: number, terrainMargin: number): void;
  /** Set position-controller shaping and the integration timestep. */
  set_psc_params(positionP: number, targetFilter: number, errorFilter: number, horizontalJerk: number, verticalJerk: number, dt: number): void;
  /** Set attitude limits and feed-forward enablement. */
  set_atc_params(rollRate: number, pitchRate: number, rollAccel: number, pitchAccel: number, timeConstant: number, feedForward: boolean): void;
  /** Initialize simulated position in north/east/down coordinates. */
  set_initial_position(north: number, east: number, down: number): void;
  /** Initialize navigation from its stopping point. */
  wp_and_spline_init_m(north: number, east: number, down: number): void;
  /** Select the current destination. */
  set_wp_destination_NED_m(north: number, east: number, down: number): boolean;
  /** Select the destination used for the next-leg preview. */
  set_wp_destination_next_NED_m(north: number, east: number, down: number): boolean;
  /** Advance the checked-in navigation algorithm by one timestep. */
  advance_wp_target_along_track(dt: number): boolean;
  /** Report completion using the native navigation condition. */
  reached_wp_destination(): boolean;
  /** Return simulated position in metres NED. */
  get_pos(): Vector3;
  /** Return desired velocity in metres per second NED. */
  get_vel(): Vector3;
  /** Return desired acceleration in metres per second squared NED. */
  get_accel(): Vector3;
  /** Sample the current scalar profile, including native float accumulation. */
  get_current_1D_curve(dt: number): Curve;
}

/** Initialized Emscripten module with its sole owned native constructor. */
export interface NavigationModule {
  AC_WPNav_wrapper: new () => NavigationWrapper;
}

/** Options supported by the checked-in modularized Emscripten factory. */
interface NavigationOptions {
  /** Resolve both glue-adjacent resources and the WASM binary under the app base. */
  locateFile(path: string): string;
}

type NavigationFactory = (options: NavigationOptions) => Promise<NavigationModule>;

declare global {
  var WPNavModule: NavigationFactory | undefined;
}

const initializations = new Map<string, Promise<NavigationModule>>();

/** Load the authoritative unmodified glue and remove its temporary script node. */
function loadFactory(url: string): Promise<NavigationFactory> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      script.remove();
      const factory = globalThis.WPNavModule;
      if (typeof factory === 'function') resolve(factory);
      else reject(new Error('Navigation glue did not expose WPNavModule.'));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`Unable to load navigation glue: ${url}`));
    };
    document.head.append(script);
  });
}

/** Await a shared initialization without retaining an unmounted consumer's listener. */
function awaitInitialization(promise: Promise<NavigationModule>, signal?: AbortSignal): Promise<NavigationModule> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    /** Reject only this consumer; concurrent mounts can still use the shared module. */
    function abort(): void {
      reject(signal?.reason);
    }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Initialize unchanged checked-in WASM once per app base, retrying failed loads.
 * Modules are shared for the page lifetime; each calculation owns its native wrapper.
 */
export function initializeNavigation(baseUrl: string, signal?: AbortSignal): Promise<NavigationModule> {
  signal?.throwIfAborted();
  const directory = new URL('ardupilot/', new URL(baseUrl, document.baseURI)).href;
  let initialization = initializations.get(directory);
  if (!initialization) {
    initialization = loadFactory(`${directory}wpnav.js`).then(factory => factory({
      locateFile: path => new URL(path, directory).href,
    }));
    initializations.set(directory, initialization);
    void initialization.catch(() => initializations.delete(directory));
  }
  return awaitInitialization(initialization, signal);
}
