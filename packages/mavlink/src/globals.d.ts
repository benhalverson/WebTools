import type { mavlink20 as runtime, MAVLink20Processor as Processor } from './index.js';
/** Opt in only on pages that load the legacy classic script. Await ready first. */
declare global {
    const mavlink20: typeof runtime;
    const MAVLink20Processor: typeof Processor;
    interface Window {
        mavlink20: typeof runtime;
        MAVLink20Processor: typeof Processor;
    }
}
export {};
