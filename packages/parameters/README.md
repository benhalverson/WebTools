# Typed parameters

DOM-free extraction of `Libraries/Param_Helpers.js`, `DecodeDevID.js`, and the
lookup/conversion portions of `ParameterMetadata.js`. Legacy files and existing authoritative protocol fixtures are unchanged.

Build with `pnpm --filter @webtools/parameters build`; consume only the explicit
`@webtools/parameters` entry point. The emitted declarations enforce strict types.
Run `pnpm test:parameters` for Node built-in tests against the compiled public
entry point. Core helper tests run in Node. The operation browser suite below also exercises
native cache behavior.

## API

- `get_param_name_vector3(prefix)`, `get_compass_param_names(index)` retain names.
- `get_param_value(log, name, allow_change?)` returns a value or `undefined`.
  `read_param_value` additionally returns ordered changes with the exact legacy
  message and an `ignored` flag. The caller owns logging/alerts; the model does
  not access the DOM or display notifications.
- `param_to_string` and `get_param_download_text` preserve float32 rounding,
  natural sorting, newlines, Infinity strings, and the legacy NaN error.
- `decode_devid` and `DEVICE_TYPE_*` preserve signed shifts, lookup whitespace,
  unknown device names, and CAN `sensor_id` versus other `devtype` results.
- `find_parameter_metadata(data, name)` preserves ordered prefix traversal and
  returns the original matching value as `unknown`. `is_parameter_metadata`
  narrows it only after validating every declared consumed field; unrecognized
  fields are preserved. Lookup does not validate or repair upstream data and
  deliberately retains null/primitive/malformed behavior
  (including TypeError on traversed null nodes). Avoid cyclic input as in legacy.
- `load_parameter_metadata(url, fetcher)` returns the JSON payload unchanged;
  callers inject fetch/cancellation and own errors, caching, and state.
- `parameter_input_value(input, bitmaskSize?)` and
  `parameter_bitmask_value(checkedBits, size = 32)` reproduce legacy input and
  checkbox conversion, including signed 32-bit values and JS shift behavior.

Tests compare every device lookup range/bus/type, names, changed/missing values,
float formatting, metadata traversal, invalid inputs, and bitmask widths with
unchanged legacy code. New recorded text fixtures identify the comparison source;
existing `tests/fixtures/params.json` and MAVLink fixtures are never regenerated.

## Packed vehicle parameter operations

`MAVParam` owns values, defaults, readonly validation, search and the single-operation
lock for one connection. `MAVParamDefinitions` owns per-vehicle metadata memory and
Cache API entries. Both retain the legacy public method names. Packed wire decoding
and upload encoding are separate from orchestration and require no generated codec.

```ts
import { MAVParam, MAVParamDefinitions } from '@webtools/parameters'
import { createFTPManager } from '@webtools/transfers'

const ftp = createFTPManager()
// The application supplies its existing connection using ftp.setLink(...).
const model = new MAVParam({ ftp })
const metadata = new MAVParamDefinitions()
model.definitions = (await metadata.load('Copter')).definitions
await model.refresh()
const changes = model.changes(MAVParam.parseText('EXAMPLE 1'))
// Present changes for confirmation in the consuming UI before applying.
await model.apply(new Map(changes.map(parameter => [parameter.name, parameter.value])))
const exported = MAVParam.saveText(model.params.values())
void exported

// On connection disposal, invalidate results before cancelling owned transfers.
model.disconnect()
ftp.clearLink()
```

The caller owns the connection and transfer lifetime. A cancelled transfer completes
with `null`; it must still invoke its callback so the model can release its operation
lock. Disconnect invalidates pending results and clears values; create a new model
for a new vehicle. Call the returned unsubscribe function when disposing a listener.
Listeners run synchronously and must not throw or mutate connection state during a
notification, matching the legacy subscription contract.

`apply` never sets optimistic values: it refreshes after upload completion (including
failure), checks the close acknowledgement, then verifies each exact stored value.
An unavailable readback clears model values. Integer values retain all int32 bits;
float inputs round once to float32. Text export preserves the existing header,
tab separators and numeric formatting. `defaultValue` remains `undefined` when absent.
Metadata fields are `unknown` because upstream JSON fields are preserved without
validation or coercion; consumers must narrow them before rendering typed controls.

Definitions retain `mavparam-definitions-v1`, `X-MAVParam-Cached`, canonical public
URLs, weekly freshness, explicit refresh and stale offline fallback. Inject `fetch`
and `cache` to test without a provider. No migration of unrelated legacy consumers
or generated runtime is required by this package.

`tests/mavparam.test.cjs` and `tests/fixtures/params.json` are replayed unchanged
against legacy and typed implementations. Node and real Chromium compare exact
serialized bytes, integer values, repeated cancellation/disconnect and cache traces;
Chromium additionally exercises native persistent Cache API offline fallback.
Run `pnpm test:parameters` and `CHROME_PATH=/path/to/chromium pnpm test:parameters:browser`.
