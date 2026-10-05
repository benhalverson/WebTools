# Shared application routing

`@webtools/routing` contains URL conventions, not app source. Browser and Worker
consumers can import `hostingPrefix`, `applicationBase`, `applicationForPath` and
`serveAssets`. Node/Vite consumers import `stageRuntimeAssets`, `prefixedHtml` and `listeningOrigin`
from `@webtools/routing/tooling`.

The common prefix is `/` by default. Set `WEBTOOLS_BASE_PATH=/Tools/WebTools/`
when developing, building and previewing. `PORTAL_BASE_PATH` remains a supported
alias; the new variable takes precedence. Prefixes accept literal path segments
containing letters, numbers, hyphens and underscores. No query, traversal or URL
encoding is accepted. Portal mounts at the prefix; RotationCheck and the intermediate SimpleGCS preview
mount at `RotationCheck/` and `SimpleGCS-preview/`. The complete legacy GCS remains
at `SimpleGCS/` under the portal. A bare directory redirects with 308 and retains
the query; browsers preserve the fragment across that redirect.

`serveAssets(request, binding, routes)` takes a structural asset binding and an
explicit page map, reviewed asset list and optional development module list.
Unknown paths receive 404, including absent bundle assets (the asset binding
owns existence checks). It never falls back to the app shell. Vite's development
asset binding receives the app base; production assets are stored at `/`.

From the root, `pnpm dev` and `pnpm preview` start independent portal,
RotationCheck and SimpleGCS preview Vite/Worker processes and expose one local origin. The Node gateway
in `tooling/serve.ts` selects an owner via `applicationForPath`, proxies requests
and HMR upgrades, rewrites only upstream absolute Location origins, and stops
its owned children on exit or startup failure. `--port 0` supports isolated tests.

Each app also supports `pnpm --filter portal dev|build|preview` or
`pnpm --filter rotation-check dev|build|preview`, or
`pnpm --filter simplegcs dev|build|preview`. Those direct app servers expose
only that app's Worker; the portal retains its original legacy asset catalog for
unmigrated consumers. The gateway gives RotationCheck's public subtree priority,
including retained script download URLs, without loading the legacy scripts in
the migrated page. Apps import only shared packages, never another app's source.

Build outputs remain separate deployable Workers. A future hosting deployment
must apply the same prefix and ownership table to dispatch requests to these
Workers. The gateway provides local composition; deployment and production bindings are
configured separately.
