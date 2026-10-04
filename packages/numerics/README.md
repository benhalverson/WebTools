# Typed numerics

Explicit public ESM exports for the owned `Libraries/Array_Math.js` and
`Libraries/fft.js` helpers. Legacy pages continue using those unchanged scripts.

## Setup and validation

Use Node 24 and pnpm 10.23.0. Initialize the existing pinned FFT submodule:

```
git submodule update --init modules/fft.js
pnpm install --frozen-lockfile
pnpm --filter @webtools/numerics build
pnpm --filter @webtools/numerics typecheck
pnpm --filter @webtools/numerics lint
pnpm --filter @webtools/numerics test
pnpm --filter @webtools/numerics test:browser
```

The last command needs Playwright Chromium (`pnpm exec playwright install chromium`).
The browser test builds a real Vite consumer of the compiled public package and
serves it under `/numerics-test/`; it also compares repeated number-input edits
against the original DOM helper. It does not contact external services.

## Compatibility boundary

Comparison revision: `ac32dd6815808a5f3f4894e155c8cfdb72a715f4`.
FFT submodule: `f8be92e1369f684da3e121e4c5b7fbcc8d50f868` (4.0.4).
`build-vendor.mjs` copies the pinned CommonJS `lib/fft.js` **byte for byte**, along
with the upstream README containing its MIT license. It never installs a new FFT
version or rebuilds the vendor. The legacy comparison uses the same revision's
browser `dist/fft.js`, also unchanged. `src/vendor/fft.d.cts` describes only the
supported public numerical surface rather than adopting upstream's broad types.

`tests/fixtures/legacy.json` records unchanged classic-script outputs, generated
by the explicit manual `node packages/numerics/tests/capture.mjs` command. The
fixture preserves holes, undefined, negative zero, non-finite numbers, exceptions,
scaling, identity-return behavior, and unsorted interpolation quirks. Tests never
regenerate it. The same scenarios run against the **compiled package export**.
Node parity requires exact equality, not approximate equality. Browser parity uses
1e-12 absolute/relative tolerance only for finite numbers to accommodate platform
math-library last-bit differences; all exceptional values and structures are exact.
The inverse-FFT round trip also allows 1e-12 for ordinary floating-point error.

The typed API expects numeric arrays, while runtime tests additionally record
legacy JavaScript coercions for malformed inputs. Indexed assertions preserve
legacy arithmetic on missing values; they do not normalize, pad, validate, clamp,
or reorder input. Interpolation and copy/conversion outputs explicitly include undefined when a source
component can be missing. Arithmetic-only outputs retain numeric types because
missing operands become NaN. Mutable interleaved copy buffers should be declared
as `(number | undefined)[]` by consumers.
`run_fft` retains missing-channel sparse windows and the first-channel requirement.
Channel names should not overlap `center` or another channel's `Max` property,
as in the original flat result object; no collision handling is introduced.
No previously reviewed bug fixes are included.
