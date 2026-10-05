# Shared React workflows (migration stage 2)

Dependency: issue #3 / draft PR #39, exact commit
`066ca70a2c28bd9c2d789743dfa7291c9da0b42c`. This branch targets the fork's
`main`, so its PR includes the dependency until #39 merges. Behavior comparison:
the unchanged `Libraries/*.js` and `HardwareReport` at foundation commit
`ac32dd6` (also unchanged at the dependency commit). No public tool is switched.

## Supported API

- `ParameterControl`: controlled raw string state, parameter name, optional raw
  metadata document. Omitted, null, or undefined metadata renders the numeric
  fallback while loading. Later metadata changes preserve the parent-owned value
  and never emit `onChange`; malformed nested prefix nodes still follow the
  legacy lookup contract. Narrows `find_parameter_metadata` through `is_parameter_metadata`.
  Labels, units, values, optional range constraints, disabled controls, and
  signed bitmasks use the typed parameter package. `allowValues=false` retains
  a number input; `bitmaskSize` controls signed conversion and hidden bits.
  Unknown enumerated values remain unselected, matching the native legacy select.
- `Plot`: inject the existing pinned `Plotly` bundle through `PlotlyApi`. Creates
  a plot, uses `Plotly.react` for changed data/layout/config, and owns only its
  relayout listener and vendor DOM node. Updates are serialized; pending work is
  isolated from a subsequent mount. Purge and listener disposal run on unmount.
  `PlotFields` is an open vendor-options record with `unknown` field values, not
  a claim that the entire vendor library is statically described. Consumers
  narrow relayout payloads. `onError` exposes vendor failures without wrapping
  or replacing the algorithms. Keep data/layout/config identities stable when
  unrelated state changes, and replace their identities when plots should update.
- `FileInput`: exposes the selected `File` to React state. `downloadFile` delegates
  the original Blob and filename to injected legacy `FileSaver.saveAs` without
  re-encoding or replacing its browser-specific download behavior.
- `useLoading` and `LoadingOverlay`: retain styling and double-animation-frame
  scheduling. **Deliberately preserve the reviewed legacy bug:** the returned
  promise resolves after scheduling (not completion), and rejection leaves the
  overlay visible. Rejection is reported through `onError`; this does not repair
  or conceal the failure overlay. Unmount cancels queued frames and prevents
  stale state changes; it cannot cancel arbitrary caller-owned operations.
- `OpenIn`: React renders the same destination input buttons and enable rules.
  Relative same-origin paths retain common hosting prefixes. `transferFile`
  returns an idempotent disposer for the legacy load listener or FileReader/delay
  timer. Its optional fourth `onSettled` callback must not throw and runs once
  on completion, cancellation, failure, or popup blocking; it can run before
  `transferFile` returns. External completion clears payload/reader/recipient
  ownership and unregisters the component disposer while still mounted. Each
  pending transfer survives prop changes independently. Same-origin listeners
  deliberately keep sending the original File on every load until disposal.
  Popup blocking settles cleanly rather than dereferencing null.
  `useOpenInReceiver` awaits optional readiness and delivers File/ArrayBuffer to
  owned state, removing its message listener on unmount. Its structural wire
  narrowing is not origin authentication.

The cross-tool security fix is **not** included: outgoing messages still target
`*`, incoming messages do not authenticate origin/source, and the external viewer
still receives an ArrayBuffer after 2000ms. The same-origin receiver is an actual
unmodified `HardwareReport` page in the browser suite. Existing scripts and
consumers, generated artifacts, vendor pins and licenses are retained. This is
an integration package plus test consumer, not a wrapper-only tool migration.

## Validation

Use Node 24 and pnpm 10.23.0, with the runtime assets described in the root README.

```
pnpm install --frozen-lockfile
pnpm --filter @webtools/parameters build
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:parameters
pnpm test:react-workflows
pnpm --filter @webtools/react-workflows build:consumer
pnpm test:react-workflows:browser
```

The browser runner builds the consumer independently for `/` and
`/Tools/WebTools/`, serves its production output alongside unchanged legacy
assets, and aborts all off-origin requests. It verifies rendered numeric/enum/
bitmask edits, real imperative Plotly updates/relayout, original download bytes,
actual HardwareReport file transfer with name/bytes preserved, the legacy sender
wire format in reverse, repeated StrictMode mounts, message-listener removal,
plot purge, and the intentionally retained failure overlay. A deterministic
consumer also holds `newPlot`/`react` promises across unmount/remount, rejects and
retries both vendor operations, and releases receiver readiness after unmount. It checks missing
assets and page errors. `CHROME_PATH` selects a local browser;
`WORKFLOWS_CDP_URL` may select an already-authorized reachable test browser.
Neither option bypasses browser/security restrictions.

Node tests execute the unchanged legacy OpenIn source in a VM and compare
ordering, labels, availability, payload/filename/bytes, and wildcard behavior.
They also check external transport delay/cancellation, control markup contracts,
and delegation of exact Blob identity to FileSaver. No Jest/Vitest is used.

Validation: strict workspace typecheck/lint, production builds, 116 retained
Node tests, 10 parameter tests and 9 workflow Node tests passed. Real Chromium
151.0.7922.173 passed the built workflow suite at `/` and `/Tools/WebTools/`,
including HardwareReport filename/bytes, unknown enum preservation, pending
Plotly operations, rejection/retry, readiness-delayed receiver cleanup, and
repeated mounts. The fixture server normalizes its repository root before
checking path containment. The intentional failure overlay is unmounted with
a programmatic host-control click because it intercepts pointer input.
No live provider, hardware or deployment was used.

## PR43 regression evidence

Reproduced against `91109a1f793d9bedb35b066ad27a988f83ff33ca` using
Chromium 151.0.7922.173, Node 24.19.0, and pnpm 10.23.0 at `/` and
`/Tools/WebTools/`. Both initial null and undefined documents threw
`Cannot convert undefined or null to object`. Native FileReader and real 2000ms
external timers demonstrated this lifetime after delivery and forced Chromium
GC, while React remained mounted:

| Sender | Reader alive | 4 MiB ArrayBuffer alive | Recipient stand-in alive |
| --- | --- | --- | --- |
| Unchanged legacy | no | no | no |
| Original PR43 | yes | yes | no |
| Corrected React | no | no | no |

`tests/regressions.mjs` stores only WeakRefs and primitive delivery evidence;
it never keeps sent payloads or remote object handles alive. The external
recipient is a local stand-in that discards messages; no external provider is
contacted. Forced GC uses a separate CDP task before dereferencing WeakRefs.
The test also keeps pending buffers/recipients live, repeats concurrent sends,
changes file props, cancels multiple recipients on unmount, and deliberately
retains a completed public disposer to check its cleared references. The
unchanged HardwareReport browser test still checks an actual recipient window,
original filename and exact bytes. Deterministic Node tests cover read
cancellation/error/abort, blocked windows, throwing open/read/postMessage calls,
settlement counts and same-origin repeat loads. Metadata browser regressions
cover null/undefined through enum/bitmask/range loading and back, unknown enum
rerenders, preserved controlled values, and no change callbacks during loading.

The `WORKFLOWS_BASELINE=1` browser-runner mode is only for applying this regression
harness to the original implementation; it asserts the two pre-fix failures.
The normal command asserts corrected behavior and legacy parity.

Correction validation also passed the six portal checks (development and built
preview at root/prefix) and the video browser suite. The retained SimpleGCS
browser gate was attempted, but this environment cannot load its pinned public
CDN assets: unpkg requests fail with `ERR_TUNNEL_CONNECTION_FAILED`, and the
jsDelivr HLS request fails certificate validation. Missing Leaflet then raises
`L is not defined`, preventing its connection-dialog assertion. Those files and
tests are unchanged; this gate is not reported as passed. No TLS bypass or
production/vendor changes were used to conceal that environment limitation.
