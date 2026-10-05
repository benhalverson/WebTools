import codec = require('@webtools/mavlink');
const processor = new codec.MAVLink20Processor(null, 42, 1);
processor.on('HEARTBEAT', message => { const mode: number = message.custom_mode; void mode; });
const packet = new codec.mavlink20.messages.heartbeat(11, 3, 137, 5, 4, 3).pack(processor);
const message = processor.decode(packet);
if (message._name === 'HEARTBEAT') {
    const mode: number = message.custom_mode;
    void mode;
    // @ts-expect-error Fields from another message must not leak through narrowing.
    void message.time_usec;
}
// @ts-expect-error Misspelled message names must be rejected.
new codec.mavlink20.messages.hearbeat();
// @ts-expect-error Scalar fields are numbers, not arbitrary values.
new codec.mavlink20.messages.heartbeat('11');
// @ts-expect-error 64-bit words must not silently lose precision through number coercion.
new codec.mavlink20.messages.system_time(123);
new codec.mavlink20.messages.system_time([0xffffffff, 0xffffffff], 10).pack(processor);
processor.signing.allow_unsigned_callback = (_processor, messageId) => messageId === 0;
const parsed = processor.parseChar(null);
if (parsed?._name === 'BAD_DATA') { const reason: string = parsed._reason; void reason; }

/** A named decoded-message handler must also be usable for subscription cleanup. */
const heartbeatHandler = (message: codec.heartbeat): void => { void message.custom_mode; };
processor.on('HEARTBEAT', heartbeatHandler);
processor.removeListener('HEARTBEAT', heartbeatHandler);
for (const subscribe of ['on', 'addListener', 'once', 'prependListener', 'prependOnceListener'] as const) {
    processor[subscribe]('HEARTBEAT', heartbeatHandler).removeListener('HEARTBEAT', heartbeatHandler);
    processor[subscribe]('HEARTBEAT', heartbeatHandler).off('HEARTBEAT', heartbeatHandler);
    processor[subscribe]('BAD_DATA', message => { const reason: string = message._reason; void reason; });
    // @ts-expect-error The catch-all event can deliver messages other than heartbeat.
    processor[subscribe]('message', heartbeatHandler);
    // @ts-expect-error Another named event cannot deliver a heartbeat payload.
    processor[subscribe]('SYSTEM_TIME', heartbeatHandler);
}
declare const uncertainEvent: 'HEARTBEAT' | 'SYSTEM_TIME';
declare const aggregateEvent: 'HEARTBEAT' | 'message';
/** An aggregate callback can safely handle every event in a union. */
const allMessages = (message: codec.ParsedMessage): void => { void message._name; };
for (const method of ['on', 'addListener', 'once', 'prependListener', 'prependOnceListener', 'removeListener', 'off'] as const) {
    processor[method](uncertainEvent, allMessages);
    processor[method](aggregateEvent, allMessages);
    processor[method]('message', allMessages);
    // @ts-expect-error A narrow callback must not determine or widen the event's inferred type.
    processor[method](uncertainEvent, heartbeatHandler);
    // @ts-expect-error Unknown events are outside the codec-emitted event contract.
    processor[method]('HEARTBET', allMessages);
    // @ts-expect-error Cleanup and subscription use the same catch-all payload contract.
    processor[method]('message', heartbeatHandler);
}
