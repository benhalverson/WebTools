# @webtools/mavlink

Typed boundary for the existing MAVLink codec, compared with fork `main` at
`ac32dd6`. No generated protocol definitions, runtime fixes, jspack sources, or
checked-in authoritative fixtures are changed. This package does not connect to
vehicles, provide a transport, or change malformed-frame recovery.

## Build and consume

Run `pnpm --filter @webtools/mavlink build` first. The build copies the pinned
codec and jspack byte-for-byte, including license notices. It verifies that the
checked-in declarations still match runtime metadata. No protocol regeneration
or new runtime dependency is involved.

Node 24 CommonJS:

```js
const { mavlink20, MAVLink20Processor } = require('@webtools/mavlink');
const codec = new MAVLink20Processor(null, 42, 1);
const onHeartbeat = message => console.log(message.custom_mode);
codec.on('HEARTBEAT', onHeartbeat);
// Later, unsubscribe using the same function object.
codec.removeListener('HEARTBEAT', onHeartbeat);
const packet = new mavlink20.messages.heartbeat(11, 3, 137, 5, 4, 3).pack(codec);
```

Node ESM named imports work too. Use `@webtools/mavlink/node` for typed event
callbacks from Node ESM. Root ESM imports expose the portable common API, so
ordinary browser TypeScript configurations cannot promise Node-only events.
CommonJS `require` and the explicit Node entry expose typed event callbacks;
the browser entry deliberately does not promise Node EventEmitter behavior.
The Node listener methods (`on`, `addListener`, `once`, `prependListener`,
`prependOnceListener`, `removeListener`, and `off`) share an event-to-payload
contract. Named events receive their decoded message (including `BAD_DATA`);
`message` receives any parsed message. A handler for only one message cannot
subscribe to an uncertain union of event names. Once listeners can also be
removed before delivery using their original callback.

Browser workspace consumers:

```ts
import { mavlink20, MAVLink20Processor } from '@webtools/mavlink/browser';
await mavlink20.ready;
const codec = new MAVLink20Processor(null, 42, 1);
```

The browser module loads the unchanged codec as a **classic script**, waits for
its asynchronous jspack initialization, and exports the same objects as
`window.mavlink20` and `window.MAVLink20Processor`. If a legacy page has already
loaded the codec, those globals are reused. Legacy script tags continue working
without the package; use `import type {} from "@webtools/mavlink/globals"`
for their ambient types (the globals subpath has no runtime module).
Do not import generated `mavlink.js` as an ES module or concatenate it into one.

For a Vite production build, install the package's asset-preservation plugin:

```ts
import mavlinkAssets from '@webtools/mavlink/vite';
export default { base: '/tools/', plugins: [mavlinkAssets()] };
```

The plugin emits unchanged runtime assets under `mavlink-runtime/` and points
the browser entry at the configured base. Use an absolute base (`/`, `/tools/`,
or an absolute HTTP(S) URL); relative bases are rejected explicitly. Dev serves
the package's built files directly. With another bundler, serve the **entire**
`dist` directory intact and import its `browser.mjs` as an external module; do
not copy just the entry file or allow the bundler to transform the codec.

## Type contract

All pinned message names and constants are explicit, with named constructor
arguments and discriminated decoded-message fields. Constructed payload fields
are optional because the legacy constructors accept omitted fields; decoded
messages expose the codec's actual scalar/string/array representations and a
required `_header`. A numeric byte-string payload accepts strings or number
arrays in both environments. It decodes to a string, including trailing NULs.

64-bit inputs are `[low, high]` word tuples. Decoded values are
`[low, high, unsigned]`, not JavaScript numbers or bigint. Interpret the sign flag
when converting signed values; do not silently round through `Number`.
`parseBuffer` and `parseChar` can return `null`. Stream errors produce
`BAD_DATA`, whereas direct `decode` throws. Signing/replay state remains mutable
and has the same timestamp units and defaults as the original implementation.

Declarations are derived solely from the pinned runtime's formats, field order
maps and constant values. After an intentional upstream protocol update, run
`node packages/mavlink/tooling/generate-types.cjs`, inspect the declaration diff,
and rerun all protocol tests. The handwritten runtime-boundary template is
`src/boundary.txt`; it does not patch the codec.

## Validation

- `pnpm --filter @webtools/mavlink typecheck`: strict Node CommonJS and browser
  ESM consumers, decoded narrowing, rejected invalid field/message/64-bit types.
- `pnpm --filter @webtools/mavlink lint`: boundary, build tools and tests.
- `pnpm --filter @webtools/mavlink test`: unchanged authoritative fixture suite
  through the package, Vite production assets at a prefix, Node ESM/events,
  differential malformed-length/CRC behavior, and VM browser-branch parity.
- `pnpm test:mavlink:browser`: Playwright runs the **unchanged authoritative
  test source** in a real browser against legacy script, package module, and the prefixed Vite production bundle.
  Test-only adapters supply Node test/assert/Buffer APIs and independent Node
  crypto reference digests; no fixture or protocol implementation is replaced.
  Set `CHROME_PATH` for an installed Chromium. Requests outside the local fixture
  server are aborted.

The original root Node and application browser suites remain intact. The VM
browser check covers initialization and all 21 wire/CRC/fragmentation/64-bit/
signing/replay cases, but does not replace the real browser suite.
