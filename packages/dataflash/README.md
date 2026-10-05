# Typed Dataflash boundary

Comparison revision: WebTools `ac32dd6` (the merged workspace foundation).
The upstream parser remains pinned at `220e354ba3cd479e4378ee4bc9989364b9098227`.
No legacy consumer, parser source, MAVLink fixture or parameter fixture changes.

`@webtools/dataflash` exposes only its root entry. `loadDataflashParser()` lazily
imports the exact upstream ES module, copied byte-for-byte with its license at
build time. Serve the entire `dist/` directory together, including `vendor/`;
bundler users must preserve this relative asset layout (do not inline the parser).
This standalone ESM asset contract works at `/` and nested hosting prefixes.
The browser consumer test uses built files, not a dev server or source imports.

The browser owns the input ArrayBuffer and all parsed data. The package does not
fetch or upload logs. Upstream installs a `self` message handler when imported,
so this API targets browsers; Node tests provide a minimal explicit `self` shim.
Use a fresh parser for each input. `processData(bytes, [])` discovers types without
loading default messages. `get` and `get_instance` expose numeric Float64Arrays,
string arrays and arrays of numeric vectors, without normalization, timestamp
conversion or precision changes. Missing fields/messages return undefined.

Instance discovery is `log.messageTypes[name]?.instances`. For instance-bearing
messages use `get_instance(name, instance, field)`; calling `get(name)` for such a
message can throw in upstream. Unsupported/corrupt inputs may throw or yield
partial results. This boundary preserves those outcomes, including caught unit
metadata errors logged to the console. It does not repair malformed logs or the
upstream worker loadType behavior. `extractStartTime()` retains upstream GPS and
leap-second semantics. The typed owned log helpers retain their legacy names,
return shape, and MSG/VER heuristics.

## Validation

Initialize only `modules/JsDataflashParser` for this package, install with the
repository's Node 24 and pnpm 10.23.0 pins, then run:

- `pnpm --filter @webtools/dataflash typecheck`
- `pnpm --filter @webtools/dataflash lint`
- `pnpm test:dataflash`
- `pnpm test:dataflash:browser` (Playwright Chromium; optional `CHROME_PATH`)

Node's built-in runner compares every recorded field/instance, field-by-field
and whole-message reads, discovery, statistics, timestamps and owned helpers
against the unchanged legacy code. Comparison is exact, including serialized
numbers; no numerical tolerance is necessary because no math changes. Tests
also compare truncated headers/FMT/tails, empty input, junk prefix and malformed
bytes, preserving either the output or exception class/message. Fixed recorded
sentinels independently guard against identical regressions in both paths.
Tests do not access external providers or hardware.
