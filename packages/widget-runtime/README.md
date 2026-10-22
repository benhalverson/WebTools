# Shared widget runtime

`@webtools/widget-runtime` exports a browser host for the existing dashboard widget
format. It owns GridStack instances, Formio forms, iframe load handlers, nested
grids, observers and the outgoing telemetry channel. It imports no application
source and does not register global custom elements. React consumers create the
runtime in an effect and return `runtime.destroy` through a closure.

```ts
import { WidgetRuntime, parseLayout, registerWidgetFields } from '@webtools/widget-runtime'
import { mavlink20 } from '@webtools/mavlink/browser'

await mavlink20.ready
registerWidgetFields(Formio, mavlink20.map)
const runtime = new WidgetRuntime(host, {
    createGrid: (options, element) => GridStack.init(options, element),
    forms: Formio,
    sandboxUrl: '/tools/runtime/Widgets/SandBox.html',
    defaultHtml, // contents of @webtools/widget-runtime/assets/CustomHTML.html
    mountMenu: (element, owner) => mountApplicationActions(element, owner),
    onError: reportError,
    onNoFit: reportWidgetDoesNotFit,
}, parseLayout(savedText))
await runtime.ready
// On effect cleanup / route change:
runtime.destroy()
```

The host must have a definite height. Supply the retained GridStack **10.3.1**
factory and CSS. Formio is injected, so existing consumers keep their library
loading and configuration; the offline compatibility fixture pins **4.21.7**
for both implementations. `registerWidgetFields` registers the existing color,
MAVLink message and dynamic field inputs. Full Formio schemas and saved custom
expressions remain intact. The editor application owns Monaco and form-builder
UI; `getFormDefinition` / `setFormDefinition` and `getText` / `setText` expose the
runtime state they edit. `mountMenu` attaches app-specific settings and connection
actions to the retained menu icons and returns their cleanup callback. No vehicle
connection is made by the package.

## Ownership and reusable API

- `WidgetRuntime`: `add`, `remove`, `getWidgets`, `snapshot`, `snapshotWidgets`,
  `setEditing`, `publish`, `getChanged`, `saved`, and idempotent `destroy`.
- `WidgetHost`: source/schema/options editing, `snapshot`, change tracking,
  `getNestedRuntime`, and resource disposal. Use `owner.remove(host)` to remove
  its grid item as well as resources.
- `Layout`, `WidgetModel`, `WidgetOptions`, `WidgetMap`, `Fields` and `Json` retain
  version-one JSON, null/string positions and arbitrary Formio data.
- `parseLayout`, `assertLayout`, `serializeLayout`, `parseWidget`,
  `serializeWidget`, `messageChoices`, and
  `messageFields` provide explicit parsing, serialization and metadata contracts.
- `WidgetMessage`, `TelemetryMessage`, `telemetryChannel` and `widgetSandbox`
  describe the unchanged iframe options/script and `{ MAVLink: message }` channel
  contracts. `publish` accepts a decoded `@webtools/mavlink` message and does not
  convert protocol values.

`ready` covers asynchronous forms and nested runtime initialization. A failure
rejects readiness and disposes the failed runtime. An immediate internal rejection
handler prevents unhandled rejections when a parent is still initializing. Removal
at any setup await destroys a late-created form instead of attaching it. Frame
navigation remains asynchronous; consumers that require a rendered frame should
wait for its load/content before sending their first telemetry sample, as with the
legacy host. Widget script execution errors retain the iframe's original behavior.
Do not pass a single Formio instance to more than one host: the factory creates
one owned form for each widget.

Snapshots use GridStack DOM order and live Formio submissions, including invalid
user input, matching the existing serializer. Only valid Formio change events are
forwarded to running scripts. Cross-grid drops recreate the widget from its
snapshot, retaining the legacy nested-grid workaround while transferring ownership.
Menu widgets remain excluded from subgrids. Destruction is idempotent; editing and
publishing on a destroyed runtime throw.

## Assets and retained sandbox behavior

The exported `assets/SandBox.html` is byte-for-byte the original iframe document.
Deploy it under `runtime/Widgets/SandBox.html` and deploy the pinned MAVLink runtime
and relative `local_modules/jspack` assets under `modules/MAVLink/` at the same
root. Its `../../modules/MAVLink/mavlink.js` reference then resolves unchanged.
The built consumer stages this tree from the MAVLink package output. Menu image
references retain the existing `../images/` destinations; provide those assets in
the same layout as the existing dashboard.

`allow-scripts allow-same-origin`, wildcard `postMessage`, the `MAVLinkMSG` channel,
custom JavaScript evaluation, timer handling inside the retained sandbox, user
HTML documents and error rendering are unchanged. This migration does not claim
sandbox hardening. The separately reviewed security change and five previously
reviewed bugs remain outside this branch. Legacy dashboard and VideoOverlay source,
fixtures, vendor code and submodule revisions are untouched.

## Comparison and dependencies

Comparison: fork `main`, `ac32dd6` (merged workspace foundation PR #1). Runtime
behavior is compared directly with that revision's retained owned widget classes
and serializer. This branch locally integrates the reviewed dependencies:

- #4 / PR #43: `91109a1f793d9bedb35b066ad27a988f83ff33ca`, including #3 / PR #39
  (`3587d8df52ca89b6be8c20bc455a533c363be3ae`).
- #23 / PR #41: `3a0aefc775cd8837ebdb6faa6fc2cc2a73f9fc95`.

Initial integration used the requested reviewed heads `753a397` and `809fece`;
the newer browser-validation/JSDoc commits were subsequently merged locally.
Only root scripts and lockfile needed initial integration resolution. No GitHub
merge, auto-merge, deployment or destination change is part of this work.

## Validation

Use Node 24 and pnpm 10.23.0. Build the workspace before its typecheck so package
export declarations exist. Initialize the pinned submodules for legacy checks.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:widgets
CHROME_PATH=/path/to/chromium pnpm test:widgets:browser
```

Node's built-in suite compares exact authoritative saved-layout bytes and legacy
serialization, validates model boundaries, verifies field metadata and compares
the sandbox document byte-for-byte. Real Chromium tests build root and prefixed
consumers, use the original widget classes with the same fixture, compare live
serialized bytes, test nested/custom widgets, actual dynamic Formio choices,
controlled decoded MAVLink telemetry, viewport dimensions and repeated disposal.
The transfer test exercises GridStack's completed-drop callback and ownership
contract; it does not simulate a physical pointer drag. Formio's random component IDs are given identical deterministic entropy in both
browser implementations; no serialized fields are removed or normalized for
comparison. Telemetry arithmetic is exact for the chosen binary-representable
fixture; viewport dimensions allow half a CSS pixel of layout rounding.

Browser library requests from saved scripts are replayed from local packages at
the exact URLs' pinned versions (Plotly 2.35.0, flight-indicators-js 1.0.5, Leaflet
1.9.4, leaflet-rotatedmarker 0.2.0). All other external requests are blocked,
including map tiles. Tests never connect to live vehicles or providers. Deferred
form fixtures additionally test removal and rejection at every initialization await.

### Shared editor boundary

`registerWidgetEditor(formio)` configures common Formio builder restrictions and
color controls once per vendor instance. `restrictWidgetEditor` applies explicit
consumer-owned schema restrictions. Dashboard MAVLink builder metadata and field
selection remain in the dashboard app, separate from VideoOverlay’s editor.
`widgetBuilderOptions`, `BuilderFactory`, `WidgetBuilder`, and `EditorComponents`
are explicit exports for dashboard and later VideoOverlay consumers. The builder
owner removes its two change listeners and destroys both completed and late
builder instances. `RuntimeDependencies.onEdit` opens consumer-owned controls;
Enter and double-click select the same widget while editing is enabled.

The dashboard editor keeps preview runtime, form builder, source editor model,
and source listeners scoped to one mounted editing session. Applying writes the
source and schema through the existing `WidgetHost` methods; cancelling disposes
the preview without modifying the original widget.
`RuntimeDependencies.onWidgetDisposed` invalidates consumer selections when a host
is removed, replaced after a cross-grid drop, or disposed during layout cleanup.
Consumers compare host identity so disposing an editor preview cannot clear the
original widget's selection.

`WidgetHost.getAbout()` exposes retained palette names/descriptions independently
of serialized options. Subgrid metadata is shown in the editor without adding
fields to its legacy JSON representation.
