# Shared React workflows (migration stage 2)

Dependency: issue #3 / draft PR #39, exact commit
`066ca70a2c28bd9c2d789743dfa7291c9da0b42c`. This branch targets the fork's
`main`, so its PR includes the dependency until #39 merges. Behavior comparison:
the unchanged `Libraries/*.js` and `HardwareReport` at foundation commit
`ac32dd6` (also unchanged at the dependency commit). No public tool is switched.

## Supported API

- `ParameterControl`: controlled raw string state, parameter name, raw metadata
  document; narrows `find_parameter_metadata` through `is_parameter_metadata`.
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
  returns a disposer for the legacy load listener or FileReader/delay timer.
  Popup blocking returns a no-op disposer rather than dereferencing null.
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
Node tests, 10 parameter tests and 5 workflow Node tests passed. Real Chromium
151.0.7922.173 passed the built workflow suite at `/` and `/Tools/WebTools/`,
including HardwareReport filename/bytes, unknown enum preservation, pending
Plotly operations, rejection/retry, readiness-delayed receiver cleanup, and
repeated mounts. The fixture server normalizes its repository root before
checking path containment. The intentional failure overlay is unmounted with
a programmatic host-control click because it intercepts pointer input.
No live provider, hardware or deployment was used.
