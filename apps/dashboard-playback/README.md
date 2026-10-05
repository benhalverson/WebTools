# Dashboard playback

Stage 13 previews saved telemetry dashboards at `/DashboardPlayback/`. React owns
connection controls, file loading, and URL restoration; `@webtools/widget-runtime`
owns the retained grids, forms, and sandbox frames. The complete public
`/TelemetryDashboard/` remains on the legacy implementation until #33. This app
has no editor and does not migrate or remove the legacy dashboard or VideoOverlay.

From the repository root, with Node 24 and pnpm 10.23.0:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter dashboard-playback dev
pnpm --filter dashboard-playback preview
pnpm dev                         # same-origin local multi-app gateway
pnpm preview                     # gateway using independent Worker builds
```

Set `WEBTOOLS_BASE_PATH=/Tools/WebTools/` consistently for build and serve;
`PORTAL_BASE_PATH` remains a compatibility fallback. Each app has an independent
Worker configuration. Public legacy destinations and sandbox permissions are
unchanged. Pinned GridStack 10.3.1 and Formio 4.21.7 assets are staged locally;
user-saved widget scripts retain their original library URLs and behavior.

The connection attempts the hash `ws` address or MissionPlanner's localhost
address on mount. It receives binary MAVLink and sends no commands or rate
requests. The existing optional GCS heartbeat sends at 1 Hz, with the original
source IDs, signing, and sequence behavior. A socket and its timer have one owner;
replacement/disposal detaches callbacks before closing. A failed initial automatic
connection stays black, manual/unexpected failure turns red, and user disconnect
returns to black.

Saved version-one JSON and compressed hash links retain their original formats.
As in legacy, settings are restored from the hash, not local/session storage.
The saved-layout panel loads complete layout files, downloads the current runtime
snapshot, and generates a reloadable URL. Editing individual widgets remains in
the complete public tool. Layout replacement destroys the old runtime; stale file
reads, default fetches, and link compression cannot overwrite newer state. Failed
mounts try the default once; a failed default is reported without a retry loop.

Prerequisites were integrated locally, preserving their commits: #5 / PR #45
(`0f4607db3dccbc7d06e5847c02465dab38d1eb80`) and #31 / PR #47
(`26687a5f54352699bb7d3ff3c9c811794043cf71`, including #23/#4/#3). The comparison
revision is the latter prerequisite's unchanged dashboard, identical to fork main
`ac32dd6815808a5f3f4894e155c8cfdb72a715f4`. All PRs target the fork's main;
this does not merge prerequisites on GitHub.

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:dashboard-playback
CHROME_PATH=/path/to/chromium pnpm test:dashboard-playback:browser
```

Node built-in tests compare exact legacy compressed bytes and link strings.
Playwright exercises actual independent development and built Worker previews at
root and configured prefix, and the same-origin gateway's public route ownership.
A loopback simulator delivers fragmented controlled MAVLink frames. It compares
real legacy widget values, serialized downloads/links, nested iframe placement,
reload/reconnect/disconnect, errors, interrupted work, and disposal. The chosen
values are binary-representable and compare exactly; iframe geometry allows at
most half a CSS pixel of browser layout rounding. Both implementations receive
identical deterministic Formio entropy and a fixed signing clock. Unsigned and
signed heartbeat packets compare byte-for-byte, including malformed numeric hash
IDs after native input sanitization. The test serves pinned libraries locally
and blocks every other origin; no live relay, vehicle, or provider is used.
