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
