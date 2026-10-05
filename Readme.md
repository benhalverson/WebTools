## ArduPilot Web Tools

This repository contains a number of web based tools for targeted ArduPilot log review and insight.
These tools are live on [ardupilot.org](https://firmware.ardupilot.org/Tools/WebTools).
For general review see [UAVLogViewer](https://github.com/ArduPilot/UAVLogViewer).

## Development setup

### React portal and pnpm workspace

The workspace contains `apps/portal`, a React/TypeScript portal for the existing
landing page and `/Dev/` listing, and `packages/dataflash`, a typed, lazy-loaded
boundary for the unchanged upstream Dataflash parser and owned log helpers.
See [the package guide](packages/dataflash/README.md) for its browser asset
contract, recorded fixtures, and validation commands. Existing tools and their
shared browser libraries still run their original JavaScript. The portal was scaffolded with
[Cloudflare's React/Vite template](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
using C3 2.73.2, with TypeScript, deployment disabled, and no nested Git repository.

Use Node 24 LTS (`nvm use` if using nvm) and pnpm 10.23.0, pinned in
`package.json`. Install only missing prerequisites:

```console
corepack enable
corepack prepare pnpm@10.23.0 --activate
pnpm install --frozen-lockfile
git submodule update --init modules/JsDataflashParser modules/plotly.js modules/fft.js modules/tabulator
pnpm exec playwright install chromium
```

The four submodules above contain browser runtime assets. Other module builds,
MAVLink runtime files, Python wheels, and WASM binaries are already checked in;
they do not need regeneration. Submodule updates use the repository's pinned
revisions, without `--remote`. Existing MAVLink and parameter test fixtures are
also used as checked in.

Run these commands from the repository root:

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Serve the portal and unchanged tools together, normally at http://127.0.0.1:5173/ |
| `pnpm typecheck` | Generate Worker types and check strict browser, Node, and Worker TypeScript |
| `pnpm lint` | Lint only the new portal, tooling, and portal tests |
| `pnpm test` | Run the existing protocol tests and recorded Dataflash differential tests |
| `pnpm test:browser` | Run the existing SimpleGCS Playwright suite with a simulated vehicle |
| `pnpm test:video` | Run the existing video suite; leave `SIMPLEGCS_WHEP_TEST_URL` unset to skip live MediaMTX |
| `pnpm test:portal` | Build and test development and production preview at both root and a hosting prefix |
| `pnpm build` | Typecheck, stage runtime assets, and create the production build |
| `pnpm preview` | Serve the existing production build locally, normally at http://127.0.0.1:4173/ |

Browser tests use Playwright Chromium; `CHROME_PATH` can select an installed
compatible browser. The existing SimpleGCS suites also support
`SIMPLEGCS_CDP_URL`. Those suites retain their external map/UI CDN dependencies,
so network failures must be distinguished from behavioral test failures.
The portal suite blocks external calls during file-transfer testing and never
connects to vehicles, flashes hardware, or calls live providers. Its Open In
check verifies the file name and bytes through the real sender and receiver;
it does not validate log parsing or numerical results.

Set the same optional hosting prefix when developing or building/previewing:

```console
PORTAL_BASE_PATH=/Tools/WebTools/ pnpm dev
PORTAL_BASE_PATH=/Tools/WebTools/ pnpm build
PORTAL_BASE_PATH=/Tools/WebTools/ pnpm preview
```

The default prefix is `/`. Ordinary tool links, directory redirects, query
strings, hashes, iframe pages, and `SimpleGCS/video.html` stay under that
origin. Only the two listings render React; missing paths return 404.

Development and builds copy the reviewed file list in
`apps/portal/legacy-assets.json` into ignored `apps/portal/.legacy-assets/`.
The list includes runtime files and license notices, excluding tests, repository
metadata, dependency installation directories, CLI scripts, and local
`SimpleGCS/config.js`. Restart `pnpm dev` after changing legacy files to
refresh that snapshot. Add any new runtime dependency to the allowlist.
The unchanged Python workflow below remains available for local deployment
configuration.

Build output is in `apps/portal/dist/client` and `apps/portal/dist/portal`.
The portal test command leaves a default-prefix production build ready for
`pnpm preview`. An app-local deployment command is prepared as
`pnpm --filter portal deploy`; running it publishes to Cloudflare and is a
separate action from local validation. A local build does not establish live
deployment or full functional validation of every tool.

### Original static tools

These steps allow hosting of the tools locally for development purposes or for use without a internet connection.

Clone this repository (or your fork) and update the submodules:

```console
git clone --recurse-submodules https://github.com/ArduPilot/WebTools.git
```

Host locally using python by running the following command in the root of the repo:

```console
python3 -m http.server --bind 127.0.0.1
```

The landing page can then be found at `http://127.0.0.1:8000/`

You need to keep your submodules updated.
When you rebase, or switch branches, update them like so:

```console
git submodule update --init --recursive
```

## VSCode

This repository contains VSCode launch configurations for debugging with Chrome and Edge.
WebTools are either hosted with python as above or using the [LiveServer extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) which enables auto-reload.
Here is [more information on debugging with VSCode](https://code.visualstudio.com/docs/editor/debugging).

<p align="center">
<img src="images/VSCode%20debug.png" width="80%">
</p>

### RotationCheck React migration and local app routing

RotationCheck now has its own React/TypeScript app and Worker in
`apps/rotation-check`. Root `pnpm dev` and `pnpm preview` compose it with the
portal on one origin at the existing `RotationCheck/` destination. Both apps
also build and run independently with their own package scripts.

Use `WEBTOOLS_BASE_PATH` as the common prefix (`PORTAL_BASE_PATH` remains an
alias) for **all** build, development and preview commands. The default is `/`.
See [the routing API](packages/routing/README.md) for the explicit contract,
404 behavior, app ownership and future deployment integration boundary.

`pnpm test:routing`, `pnpm test:rotation-check`, and
`pnpm test:rotation-check:browser` cover URL contracts, legacy numerical parity,
and real app controls in development and built Worker preview. The comparison
revision is `753a397e818593ac0943854fd7cea3468f49f095` (issue #4 / draft PR #43,
which includes issue #3 / PR #39). The retained `RotationCheck/` scripts remain
unchanged test oracles and legacy downloads; the React page does not load them.

The issue #5 branch also includes prerequisite browser/JSDoc follow-up
`91109a1f793d9bedb35b066ad27a988f83ff33ca`; legacy comparison files remain
identical to the original comparison revision above.

### FilterReview spectrum preview

The independent React preview is at `/FilterReviewPreview/` (under
`WEBTOOLS_BASE_PATH` or the compatible `PORTAL_BASE_PATH` prefix).
Run `pnpm --filter filter-review dev`, or `pnpm build && pnpm preview`
for the same-origin gateway and built Workers. The complete public
`/FilterReview/` route remains legacy until issue #16.

The preview owns local raw/batch gyro ingestion, IMU/source controls, FFT jobs,
time selection, spectra and Open In. Each calculation uses a fresh, cancellable
Worker; the DataFlash package is served as standalone ESM with adjacent vendor
assets. Filter tracking and tuning remain in the complete tool.
`pnpm test:filter-review` runs numerical compatibility tests.
`pnpm test:filter-review:browser` exercises Chromium,
independent dev/built Workers and the gateway at root and nested prefixes.
