# Typed virtual-file transfers

`@webtools/transfers` provides `MAVFTP`, `MissionParser`, and
`createFTPManager()` through native ESM and CommonJS exports. It depends on the
pinned `@webtools/mavlink` runtime boundary. No connection is opened by this package.

```ts
import { MAVLink20Processor } from '@webtools/mavlink';
import { createFTPManager, MissionParser } from '@webtools/transfers';

const processor = new MAVLink20Processor(null, 255, 190);
const manager = createFTPManager();
// transport.send(bytes) belongs to the caller's already-established link.
manager.setLink(processor, transport, 42, 1);
manager.getFile('@MISSION/mission.dat', bytes => {
    if (bytes === null) return; // rejection, cancellation, timeout, or link failure
    const items = new MissionParser().parseMission(bytes);
    // items contain the original MAVLink mission command fields and pack() method.
});
manager.putFile('@PARAM/param.pck', parameterBytes, written => {
    // number on acknowledged close, null on failure; zero is a successful empty file.
});
// Forward decoded packets using manager.handleMessage(message).
// On disconnect or owner disposal:
manager.clearLink();
```

Each manager owns its queue, active transfer, retry timer and inactivity watchdog.
The caller owns the transport and MAVLink processor. `clearLink()` cancels active
and queued work; cancellation callbacks receive `null`. Accepted replies extend
only the current job's watchdog. Tag/path cancellation affects queued jobs only.
Repeated discovery of the same link preserves active work. There is no global
manager, automatic session reset, background connection or provider access.

For virtual parameter files, pass `{sizeIsEstimate: true, fixedReadSize: true}`
to `getFile`. The original retry limits, session correlation, sequence wrap,
concurrency, and close-ACK semantics are retained. Errors deliberately remain
callback `null` outcomes to preserve the existing contract. The lower-level
`MAVFTP` exposes `cancel()` and explicit administrative `resetSessions()`.
Callbacks remain synchronous with completion; callers must account for reentrancy.

The modules separate wire encoding (`protocol.ts`), link-level transfer state
(`ftp.ts`), serialized job ownership (`manager.ts`), and owned binary decoding
(`mission.ts`). Mission payload fields are complete; generated message headers
are optional until a message is packed/decoded. Fence command discriminators
narrow circle radius/coordinates and polygon vertex arrays.

Browser builds use the existing `@webtools/mavlink/vite` asset plugin and an
absolute Vite base. This keeps the generated runtime and jspack in their original
classic-script environment. Serve JavaScript as UTF-8 (the runtime has Unicode
identifiers). The production browser fixture verifies a `/tools/` base.

## Comparison and compatibility

Legacy `modules/MAVLink/mavftp.js`, `SimpleGCS/ftp_manager.js`, mission/fence UI
consumers and the Node CLI continue using their existing script entry points.
Typed consumers use the package exports described above.

`tests/parity.test.cjs` reads both authoritative suites unchanged and runs every
scenario against legacy and typed exports. It compares full outgoing packet
bytes (including headers/CRC), send times, completion/file bytes, decoded mission
and fence values, and assertion observations. No numerical tolerance is needed:
both implementations perform the same reads and arithmetic. The browser suite
repeats all scenarios against the legacy scripts and an actual production bundle
in Chromium; small test-only adapters supply Node assertions, Buffer writes and
deterministic timers. Real Node built-in mock timers independently verify timing.
The consumer test drives both import modes through an in-memory simulated link.

With Node 24 and pnpm 10.23.0, run from the repository root:

```sh
pnpm --filter @webtools/transfers typecheck
pnpm --filter @webtools/transfers lint
pnpm --filter @webtools/transfers test
CHROME_PATH=/usr/bin/chromium pnpm --filter @webtools/transfers test:browser
```
