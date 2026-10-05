import type { mission_item_int, Outgoing, MessageBase } from '@webtools/mavlink';

/** Processor accepted by the pinned codec, in either module environment. */
export type TransferProcessor = Parameters<MessageBase['pack']>[0];

/** A link only needs to accept complete MAVLink packets. No connection is opened here. */
export interface TransferTransport { send(bytes: Uint8Array): unknown }
export interface DownloadOptions { sizeIsEstimate?: boolean; fixedReadSize?: boolean }
export interface QueueOptions extends DownloadOptions {
    tag?: string | undefined; timeoutMs?: number | undefined;
    dropQueuedTag?: boolean; dropQueuedPath?: boolean;
}
export interface FTPOperation {
    seq: number; session: number; opcode: number; size: number;
    req_opcode: number; burst_complete: number; offset: number; payload: Uint8Array;
}
export interface FTPRequest {
    opcode: number; offset: number; size: number; payload: Uint8Array | null;
    seq: number; retries: number; sentTime: number;
}
export type TransferResult = Uint8Array | number | boolean | null;
export type MissionItem = Outgoing<mission_item_int, object>;
export interface FencePoint { lat: number; lng: number }
export type Fence =
    | (CircleFence & { type: 5003 }) | (CircleFence & { type: 5004 })
    | (PolygonFence & { type: 5001 }) | (PolygonFence & { type: 5002 });
export interface CircleFence extends FencePoint { type: 5003 | 5004; radius: number }
export interface PolygonFence { type: 5001 | 5002; vertices: FencePoint[]; vertex_count: number }
/** Minimal envelope permits callers to forward arbitrary decoded messages. */
export interface TransferMessage {
    _name?: string; _header?: { srcSystem: number; srcComponent: number };
    target_system?: number; target_component?: number; payload?: unknown;
}
