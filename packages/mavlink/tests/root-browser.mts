// Ordinary Bundler resolution, without customConditions: ['browser'], must not
// promise Node-only capabilities while Vite loads the browser implementation.
import { MAVLink20Processor, mavlink20 } from '@webtools/mavlink';
const processor = new MAVLink20Processor(null, 42, 1);
// @ts-expect-error Root ESM imports must expose only the portable API.
processor.on('message', () => {});
void new mavlink20.messages.heartbeat(11, 3, 137, 5, 4, 3).pack(processor);

for (const method of ['addListener', 'once', 'prependListener', 'prependOnceListener', 'removeListener', 'off'] as const) {
    // @ts-expect-error Portable processors do not promise Node listener APIs.
    processor[method]('message', () => {});
}
