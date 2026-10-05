import { mavlink20, MAVLink20Processor } from '@webtools/mavlink/browser';
await mavlink20.ready;
const processor = new MAVLink20Processor(null, 42, 1);
const heartbeat = new mavlink20.messages.heartbeat(11, 3, 137, 5, 4, 3);
const result = processor.parseBuffer(Uint8Array.from(heartbeat.pack(processor)));
for (const message of result ?? []) {
    if (message._name === 'SYSTEM_TIME') {
        const [low, high, unsigned] = message.time_unix_usec;
        const exact = BigInt(low) + (BigInt(high) << 32n);
        void [exact, unsigned];
    }
}
// @ts-expect-error Browser codec does not expose Node event subscriptions.
processor.on('message', () => {});

for (const method of ['addListener', 'once', 'prependListener', 'prependOnceListener', 'removeListener', 'off'] as const) {
    // @ts-expect-error Portable processors do not promise Node listener APIs.
    processor[method]('message', () => {});
}
