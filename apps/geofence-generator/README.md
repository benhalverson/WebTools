# Geofence Generator

Independent React/TypeScript app and Worker for the existing `GeofenceGenerator/` public path. React owns search, selection, popup actions, imported XML and request state; `FenceMap` owns Leaflet layers, editing handles and disposal. No retained owned page script executes in the app.

Use Node 24 and pnpm 10.23.0:

```sh
pnpm --filter geofence-generator dev
pnpm --filter geofence-generator build
pnpm --filter geofence-generator preview
pnpm test:geofence
pnpm test:geofence:browser
```

Set `WEBTOOLS_BASE_PATH=/Tools/WebTools/` before building or starting development; `PORTAL_BASE_PATH` remains a compatibility fallback. Root `pnpm dev` / `pnpm preview` compose the independent Workers through the common same-origin gateway. Production hosting must supply a dispatcher using the shared routing contract.

Leaflet 1.9.4, Editable 1.2.0, restoreview 1.0.1, osmtogeojson 3.0.0-beta.5 and the published Turf 6.5.0 UMD bundle are pinned locally. The explicit `legacy-turf` build alias preserves the clipping implementation embedded in the legacy CDN bundle instead of resolving newer transitive numerical code. The geocoder controls are React-owned; the original Nominatim service and bounding-box semantics are retained. Offline tests replay exact pinned vendors and verify every legacy HTML integrity attribute before use.

Numerical/export tests execute unchanged scripts read with `git show` from the immutable comparison revision declared in the tests. Preserve the existing negative-remainder projection, broken intersection result, simplification tie order, nonfinite failure, 228 ring rotations, in-place repeated-export mutation, filename replacement and QGC formatting. These are compatibility contracts, not endorsements of the separate geometry bugs. The shared loading workflow retains double-frame scheduling and its sticky error state; explicit Cancel abandons pending work and dismisses that state.

Fixtures distinguish synthetic water polygons from a recorded OSM server response with attribution. Chromium tests block all live providers, compare actual legacy selection/crop/export results, and exercise independent dev/Worker root/prefix routes. The test-only built lifecycle host repeatedly unmounts the production App without navigating; it is never a public Worker endpoint. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium binary locally.
