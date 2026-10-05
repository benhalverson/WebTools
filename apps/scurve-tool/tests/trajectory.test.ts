import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTrajectory } from '../src/trajectory.ts';
import { createPlots } from '../src/plots.ts';
import type { NavigationModule, NavigationWrapper } from '../src/wasm.ts';
import { legacyDefaults, legacyModule, runLegacy } from './legacy-oracle.ts';
import type { LegacyDisplay } from './legacy-oracle.ts';

/** Observe native allocation/deletion while retaining the real checked-in algorithm. */
function trackNative(module: NavigationModule, fail = false): { module: NavigationModule; counts: { created: number; deleted: number } } {
  const counts = { created: 0, deleted: 0 };
  return {
    counts,
    module: {
      AC_WPNav_wrapper: new Proxy(module.AC_WPNav_wrapper, {
        /** Count each real Embind allocation. */
        construct(target): NavigationWrapper {
          counts.created++;
          const wrapper = new target();
          return new Proxy(wrapper, {
            /** Bind native methods and observe exactly one owner deletion. */
            get(instance, key) {
              if (key === 'delete') return () => { counts.deleted++; instance.delete(); };
              if (fail && key === 'advance_wp_target_along_track') return () => { throw new Error('injected navigation failure'); };
              const member: unknown = Reflect.get(instance, key);
              return typeof member === 'function' ? member.bind(instance) : member;
            },
          });
        },
      }),
    },
  };
}

const scenarios: { name: string; changes: Record<string, string>; color: LegacyDisplay['color']; radius: boolean }[] = [
  { name: 'defaults', changes: {}, color: 'velocity', radius: false },
  { name: 'asymmetric climbs, descent and shaping', changes: { WP_SPD: '14', WP_SPD_UP: '3.2', WP_SPD_DN: '2.1', WP_ACC_CNR: '1.4', WP_JERK: '2.3', WP_RADIUS_M: '17', PSC_JERK_NE: '8', PSC_JERK_D: '6', ATC_RATE_R_MAX: '120', first_wp_x: '-40', curr_wp_z: '70', next_wp_z: '210' }, color: 'acceleration', radius: true },
  { name: 'feedforward disabled and jerk coloring', changes: { ATC_RATE_FF_ENAB: '0', WP_SPD: '7', WP_ACC: '1.2', PSC_NE_POS_P: '0.7', PSC_D_ACC_FLTT: '2', last_wp_x: '-90', last_wp_z: '150' }, color: 'jerk', radius: false },
  { name: 'uncolored short mission', changes: { first_wp_z: '10', curr_wp_x: '15', curr_wp_y: '0', curr_wp_z: '20', next_wp_x: '30', next_wp_y: '10', next_wp_z: '20', last_wp_x: '45', last_wp_y: '10', last_wp_z: '10', WP_RADIUS_M: '2' }, color: 'none', radius: false },
];

for (const scenario of scenarios) {
  test(`real WASM plots exactly equal unchanged legacy: ${scenario.name}`, async () => {
    const settings = { ...legacyDefaults(), ...scenario.changes };
    const expected = await runLegacy(settings, { color: scenario.color, radius: scenario.radius });
    const tracked = trackNative(await legacyModule<NavigationModule>());
    const result = await calculateTrajectory(tracked.module, settings);
    const actual = createPlots(result, { radius: Number(settings.WP_RADIUS_M), showRadius: scenario.radius, color: scenario.color === 'none' ? null : scenario.color });
    for (const key of ['waypoint', 'snap', 'jerk', 'accel', 'vel', 'pos'] as const) {
      // Identical WASM + JS arithmetic requires zero tolerance, including float drift and mesh topology.
      assert.deepStrictEqual(structuredClone(actual[key]), expected[`${key}_plot`], key);
    }
    assert.deepStrictEqual(tracked.counts, { created: 1, deleted: 1 });
    assert.equal(result.curves.length, 3);
    assert.equal(result.positions.length, result.time.length);
    assert.equal(result.missionLegs.at(-1), 3);
  });
}

test('native wrapper is deleted on an algorithm error and subsequent calls remain usable', async () => {
  const tracked = trackNative(await legacyModule<NavigationModule>(), true);
  await assert.rejects(calculateTrajectory(tracked.module, legacyDefaults()), /injected navigation failure/);
  await assert.rejects(calculateTrajectory(tracked.module, legacyDefaults()), /injected navigation failure/);
  assert.deepStrictEqual(tracked.counts, { created: 2, deleted: 2 });
});

test('interrupted and queued calculations release native ownership before retry', async () => {
  const tracked = trackNative(await legacyModule<NavigationModule>());
  const controller = new AbortController();
  const first = calculateTrajectory(tracked.module, legacyDefaults(), controller.signal);
  const queuedController = new AbortController();
  const second = calculateTrajectory(tracked.module, legacyDefaults(), queuedController.signal);
  const firstRejected = assert.rejects(first, { name: 'AbortError' });
  const secondRejected = assert.rejects(second, { name: 'AbortError' });
  setTimeout(() => { controller.abort(); queuedController.abort(); }, 0);
  await Promise.all([firstRejected, secondRejected]);
  assert.deepStrictEqual(tracked.counts, { created: 1, deleted: 1 });
  const result = await calculateTrajectory(tracked.module, legacyDefaults());
  assert.equal(result.curves.length, 3);
  assert.deepStrictEqual(tracked.counts, { created: 2, deleted: 2 });
});

test('concurrent requests serialize singleton WASM state and snapshot input settings', async () => {
  const tracked = trackNative(await legacyModule<NavigationModule>());
  const settings = legacyDefaults();
  const first = calculateTrajectory(tracked.module, settings);
  const second = calculateTrajectory(tracked.module, settings);
  settings.WP_SPD = '99';
  const [left, right] = await Promise.all([first, second]);
  assert.deepStrictEqual(left, right);
  assert.deepStrictEqual(tracked.counts, { created: 2, deleted: 2 });
});
