import { MAVLink20Processor } from '@webtools/mavlink/node';
new MAVLink20Processor().on('HEARTBEAT', message => {
    const mode: number = message.custom_mode;
    void mode;
});

/** Explicit Node ESM consumers can unsubscribe with the same typed callback. */
const heartbeatHandler = (message: import('@webtools/mavlink/node').heartbeat): void => { void message.custom_mode; };
const processor = new MAVLink20Processor();
processor.on('HEARTBEAT', heartbeatHandler).removeListener('HEARTBEAT', heartbeatHandler);
processor.once('HEARTBEAT', heartbeatHandler).off('HEARTBEAT', heartbeatHandler);
