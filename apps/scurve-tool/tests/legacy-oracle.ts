import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

/** Actual routing foundation used before the migration, not the working tree. */
export const LEGACY_REVISION = '0f4607db3dccbc7d06e5847c02465dab38d1eb80';
const repository = fileURLToPath(new URL('../../../', import.meta.url));

/** Read authoritative input bytes directly from the pre-migration Git revision. */
export function legacyBlob(path: string): Buffer {
  return execFileSync('git', ['show', `${LEGACY_REVISION}:${path}`], { cwd: repository, maxBuffer: 32 * 1024 * 1024 });
}

/** Extract the original control defaults without importing migrated settings. */
export function legacyDefaults(): Record<string, string> {
  return Object.fromEntries(Array.from(legacyBlob('SCurveTool/index.html').toString().matchAll(/<input\b[^>]*type="number"[^>]*id="([^"]+)"[^>]*value="([^"]+)"/g), match => [match[1]!, match[2]!]));
}

export interface LegacyPlot {
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
}
export interface LegacyDisplay {
  color: 'velocity' | 'acceleration' | 'jerk' | 'none';
  radius: boolean;
}

/** Initialize the unchanged browser-only Emscripten glue with its exact WASM bytes. */
export async function legacyModule<T>(): Promise<T> {
  const context = createContext({ window: {}, console, URL, setTimeout, clearTimeout, wasmBytes: legacyBlob('SCurveTool/ardupilot/wpnav.wasm') });
  runInContext(legacyBlob('SCurveTool/ardupilot/wpnav.js').toString(), context);
  return await runInContext('WPNavModule({ wasmBinary: wasmBytes })', context) as T;
}

/** Execute unchanged page orchestration with DOM/Plotly sinks, returning the six original plots. */
export async function runLegacy(values: Record<string, string> = {}, display: LegacyDisplay = { color: 'velocity', radius: false }): Promise<Record<string, LegacyPlot>> {
  const numeric = { ...legacyDefaults(), ...values };
  const plots: Record<string, LegacyPlot> = {};
  const elements = new Map<string, { id: string; value: string; checked: boolean }>();
  const module = await legacyModule();
  const context = createContext({
    console,
    WPNavModule: () => Promise.resolve(module),
    document: {
      /** Supply stable legacy controls and inert plot elements. */
      getElementById(id: string) {
        let element = elements.get(id);
        if (!element) {
          element = { id, value: numeric[id] ?? '', checked: id === 'display_wp_radius' ? display.radius : id === `display_wp_${{ velocity: 'vel', acceleration: 'accel', jerk: 'jerk', none: 'none' }[display.color]}` };
          elements.set(id, element);
        }
        return element;
      },
    },
    Plotly: {
      /** Ignore vendor DOM teardown; captured models retain legacy references. */
      purge() {},
      /** Capture the live plot objects that legacy redraw mutates. */
      newPlot(element: { id: string }, data: LegacyPlot['data'], layout: LegacyPlot['layout']) { plots[element.id] = { data, layout }; },
      /** Legacy updates the captured arrays before requesting redraw. */
      redraw() {},
    },
    /** Axis event wiring does not contribute numerical output. */
    link_plot_axis_range() {},
    /** Reset event wiring does not contribute numerical output. */
    link_plot_reset() {},
  });
  runInContext(legacyBlob('Libraries/Array_Math.js').toString(), context);
  runInContext(legacyBlob('SCurveTool/SCurveTool.js').toString(), context);
  runInContext('initial_load()', context);
  await runInContext('replot()', context);
  // Cross-realm objects have different prototypes; structuredClone preserves every numeric bit.
  return structuredClone(plots);
}
