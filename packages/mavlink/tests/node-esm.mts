import { MAVLink20Processor } from '@webtools/mavlink/node';
new MAVLink20Processor().on('HEARTBEAT', message => {
    const mode: number = message.custom_mode;
    void mode;
});
