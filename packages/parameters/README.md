# Typed parameters

DOM-free extraction of `Libraries/Param_Helpers.js`, `DecodeDevID.js`, and the
lookup/conversion portions of `ParameterMetadata.js`.

Build with `pnpm --filter @webtools/parameters build`; consume only the explicit
`@webtools/parameters` entry point. The emitted declarations enforce strict types.
Run `pnpm test:parameters` for Node built-in tests against the compiled public
entry point. No browser is required for this DOM-free package; rendering and
browser lifecycle coverage belong to `@webtools/react-workflows`.

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
