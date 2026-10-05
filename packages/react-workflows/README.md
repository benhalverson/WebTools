# Shared React workflows

React controls and lifecycle helpers backed by `@webtools/parameters` and the pinned browser libraries.

## Supported API

- `ParameterControl`: controlled raw string state, parameter name, optional raw
  metadata document. Omitted, null, or undefined metadata renders the numeric
  fallback while loading. Later metadata changes preserve the parent-owned value
  and never emit `onChange`; malformed nested prefix nodes still follow the
  legacy lookup contract. Narrows `find_parameter_metadata` through `is_parameter_metadata`.
  Labels, units, values, optional range constraints, disabled controls, and
  signed bitmasks use the typed parameter package. `allowValues=false` retains
  a number input; `bitmaskSize` controls signed conversion and hidden bits.
  Optional `step` and `placeholder` preserve native numeric input attributes.
  Unknown enumerated values remain unselected, matching the native legacy select.
- `Plot`: inject the existing pinned `Plotly` bundle through `PlotlyApi`. Creates
  a plot, uses `Plotly.react` for changed data/layout/config, and owns only its
  relayout listener and vendor DOM node. Updates are serialized; pending work is
  isolated from a subsequent mount. Purge and listener disposal run on unmount.
  `deferInitialData=true` initializes with undefined data before applying the first
  snapshot with `react`, preserving the pinned vendor's initial Reset axes behavior
  for consumers such as Thrust Expo. Disposal is checked between both operations;
  the default initializes with the first data snapshot as before.
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

## Regression test maintenance

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
