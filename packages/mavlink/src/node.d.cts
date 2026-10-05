import type { Logger, NodeProcessor } from './index.js';
export { mavlink20 } from './index.js';
export type * from './index.js';
export declare const MAVLink20Processor: {
    new(logger?: Logger | null, srcSystem?: number, srcComponent?: number): NodeProcessor;
};
