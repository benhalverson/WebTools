import { array_offset } from '@webtools/numerics';
import type { Curve, NavigationModule, NavigationWrapper, Vector3 } from './wasm.ts';

export type { Curve, Vector3 } from './wasm.ts';

/** Complete legacy simulation history; vectors remain in NED coordinates. */
export interface TrajectoryResult {
  waypoints: [Vector3, Vector3, Vector3, Vector3];
  time: number[];
  positions: Vector3[];
  velocities: Vector3[];
  accelerations: Vector3[];
  jerks: Vector3[];
  missionLegs: number[];
  curves: Curve[];
}

export type TrajectorySettings = Readonly<Record<string, string | number>>;
const DT = 1 / 400;
const pendingCalculations = new WeakMap<NavigationModule, Promise<void>>();

/** Parse controls with the same parseFloat semantics as the legacy DOM inputs. */
function value(settings: TrajectorySettings, key: string): number {
  return Number.parseFloat(String(settings[key]));
}

/** Translate the displayed north/east/up waypoint to the native NED convention. */
function waypoint(settings: TrajectorySettings, prefix: string): Vector3 {
  return [value(settings, `${prefix}_wp_x`), value(settings, `${prefix}_wp_y`), -value(settings, `${prefix}_wp_z`)];
}

/** Sample one native curve, preserving scalar values and the legacy time offset. */
function addCurve(result: TrajectoryResult, navigation: NavigationWrapper, start: number): void {
  const curve = navigation.get_current_1D_curve(DT);
  curve.time = array_offset(curve.time, start);
  result.curves.push(curve);
}

/** Run identical navigation steps while yielding checkpoints for cooperative cancellation. */
function* simulate(module: NavigationModule, settings: TrajectorySettings): Generator<void, TrajectoryResult | undefined> {
  const navigation = new module.AC_WPNav_wrapper();
  try {
    const waypoints: TrajectoryResult['waypoints'] = [waypoint(settings, 'first'), waypoint(settings, 'curr'), waypoint(settings, 'next'), waypoint(settings, 'last')];
    const [first, current, next, last] = waypoints;
    const result: TrajectoryResult = { waypoints, time: [], positions: [], velocities: [], accelerations: [], jerks: [], missionLegs: [], curves: [] };
    navigation.set_wp_nav_params(value(settings, 'WP_SPD'), value(settings, 'WP_SPD_UP'), value(settings, 'WP_SPD_DN'), value(settings, 'WP_RADIUS_M'), value(settings, 'WP_ACC'), value(settings, 'WP_ACC_CNR'), value(settings, 'WP_ACC_Z'), value(settings, 'WP_JERK'), 10.0);
    navigation.set_psc_params(value(settings, 'PSC_NE_POS_P'), value(settings, 'PSC_D_ACC_FLTT'), value(settings, 'PSC_D_ACC_FLTE'), value(settings, 'PSC_JERK_NE'), value(settings, 'PSC_JERK_D'), DT);
    navigation.set_atc_params(value(settings, 'ATC_RATE_R_MAX'), value(settings, 'ATC_RATE_P_MAX'), value(settings, 'ATC_ACC_R_MAX'), value(settings, 'ATC_ACC_P_MAX'), value(settings, 'ATC_INPUT_TC'), value(settings, 'ATC_RATE_FF_ENAB') === 1.0);
    navigation.set_initial_position(...first);
    navigation.wp_and_spline_init_m(...first);
    navigation.set_wp_destination_NED_m(...current);
    navigation.set_wp_destination_next_NED_m(...next);
    addCurve(result, navigation, 0.0);
    let time = 0.0;
    let waypointIndex = 2;
    for (let step = 0; step < Math.floor(1000 / DT); step++) {
      navigation.advance_wp_target_along_track(DT);
      time += DT;
      result.time.push(time);
      result.missionLegs.push(waypointIndex - 1);
      result.positions.push(navigation.get_pos());
      result.velocities.push(navigation.get_vel());
      result.accelerations.push(navigation.get_accel());
      if (navigation.reached_wp_destination()) {
        if (waypointIndex === 4) break;
        if (waypointIndex === 2) {
          navigation.set_wp_destination_NED_m(...next);
          navigation.set_wp_destination_next_NED_m(...last);
          waypointIndex++;
        } else if (waypointIndex === 3) {
          navigation.set_wp_destination_NED_m(...last);
          navigation.set_wp_destination_next_NED_m(...last);
          waypointIndex++;
        }
        addCurve(result, navigation, time);
      }
      if (step % 2000 === 1999) yield;
    }
    result.jerks.push([0, 0, 0]);
    for (let index = 1; index < result.accelerations.length; index++) {
      const currentAcceleration = result.accelerations[index]!;
      const previous = result.accelerations[index - 1]!;
      result.jerks.push([(currentAcceleration[0] - previous[0]) / DT, (currentAcceleration[1] - previous[1]) / DT, (currentAcceleration[2] - previous[2]) / DT]);
    }
    return result;
  } finally {
    navigation.delete();
  }
}

/** Calculate all legacy trajectories, releasing native state on success, error or abort.
 * Checkpoints yield the event loop without changing the 400 Hz numerical timestep.
 */
async function runSimulation(module: NavigationModule, settings: TrajectorySettings, signal?: AbortSignal): Promise<TrajectoryResult> {
  signal?.throwIfAborted();
  const simulation = simulate(module, settings);
  try {
    while (true) {
      signal?.throwIfAborted();
      const step = simulation.next();
      if (step.done) {
        if (!step.value) throw new Error('Navigation simulation ended without a trajectory.');
        return step.value;
      }
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  } finally {
    simulation.return(undefined);
  }
}

/** Serialize native simulations per module because the C++ stubs contain singleton state.
 * Aborted callers never allocate a wrapper; running callers release theirs before the next starts.
 */
export function calculateTrajectory(module: NavigationModule, settings: TrajectorySettings, signal?: AbortSignal): Promise<TrajectoryResult> {
  const previous = pendingCalculations.get(module) ?? Promise.resolve();
  const snapshot = { ...settings };
  const result = previous.then(() => runSimulation(module, snapshot, signal));
  const settled = result.then(() => undefined, () => undefined);
  pendingCalculations.set(module, settled);
  void settled.then(() => {
    if (pendingCalculations.get(module) === settled) pendingCalculations.delete(module);
  });
  return result;
}
