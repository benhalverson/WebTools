# Telemetry dashboard

The public `/TelemetryDashboard/` app is served by its independent Worker.
React owns dashboard connection settings, menus, file and URL loading, widget
configuration and source editing. `@webtools/widget-runtime` owns grids, forms,
nested layouts and sandbox frames. The app and its Worker build independently.

Use Node 24 and pnpm 10.23.0 from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter dashboard-playback dev
pnpm --filter dashboard-playback preview
pnpm dev                         # same-origin multi-app gateway
pnpm preview                     # gateway with independent Worker builds
```

Set `WEBTOOLS_BASE_PATH=/Tools/WebTools/` consistently for build and serve;
`PORTAL_BASE_PATH` remains a compatibility fallback. Vendor assets are staged
locally with pinned versions. User-saved widget scripts retain their original
source, library URLs and sandbox permissions.

Enable widget editing in dashboard settings. Drag and resize widgets directly,
or press Enter on a focused widget to configure its position, dimensions and
fields. Click empty dashboard space or Add widget to open the live preview
palette. Drag previews into a root or nested grid; the palette’s buttons and
destination selector also support keyboard creation. Source editing has an
isolated preview, Monaco editor and Formio builder. Apply writes the draft;
Cancel releases the preview without changing the original widget.

Load layout accepts version-one dashboard or individual-widget JSON. Save layout
and Save widget preserve the legacy formats and custom source. Dashboard links
copy a URL encoding layout and connection settings in the hash. If clipboard
access is unavailable, the generated link remains selectable. Settings are not persisted in
local or session storage. Layout replacement disposes the previous runtime and
invalidates outstanding reads. Failed initial layouts fall back once to the
default. Failure to create an additional widget leaves the existing layout intact.

The connection attempts the hash `ws` address or MissionPlanner’s localhost
address on mount. It receives MAVLink without sending commands or rate requests.
The optional GCS heartbeat retains its source IDs, signing and sequence behavior.
Connection replacement and disposal detach callbacks, stop timers and close the
socket. No live relay is necessary for the automated checks.

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:widgets
pnpm test:dashboard-playback
CHROME_PATH=/path/to/chromium pnpm test:dashboard-playback:browser
```

The browser harness runs development and Worker previews at root and a configured
prefix, using a loopback MAVLink simulator and an unchanged legacy implementation
from the declared comparison revision. External requests are blocked. It checks
real pointer and keyboard controls, serialization bytes, connection recovery,
interrupted work and resource cleanup. Use `DASHBOARD_TEST_PREFIX` and
`DASHBOARD_TEST_MODE=dev|preview` to restrict the matrix while debugging; omit both
for acceptance validation.

After modifying shared packages, rebuild them and restart Vite with `--force` to
refresh optimized workspace dependencies. The browser harness always does this.
