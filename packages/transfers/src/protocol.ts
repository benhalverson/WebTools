import type { FTPOperation } from './types.js';

/** Encode the legacy little-endian FTP header and zero-padded body.
 * @param headerLength Header width; normal MAVFTP packets use 12 bytes.
 * @param maxPayload Maximum body size; normal MAVFTP packets use 239 bytes.
 * @throws RangeError for oversized/invalid payload lengths.
 */
export function packOperation(seq: number, session: number, opcode: number, size: number, req_opcode: number, burst_complete: number, offset: number, payload: Uint8Array | null, headerLength = 12, maxPayload = 239) {
        if (!Number.isInteger(size) || size < 0 || size > maxPayload ||
            (payload && payload.length > maxPayload)) {
            throw new RangeError('Invalid FTP payload size');
        }
        const bytes = new Uint8Array(headerLength + maxPayload);
        const view = new DataView(bytes.buffer);
        view.setUint16(0, seq, true);
        view.setUint8(2, session);
        view.setUint8(3, opcode);
        view.setUint8(4, size);
        view.setUint8(5, req_opcode);
        view.setUint8(6, burst_complete);
        view.setUint32(8, offset, true);
        if (payload) bytes.set(payload, headerLength);
        return bytes;
    }

/** Decode a payload without copying typed-array input; preserves its byte offset.
 * Legacy strings and numeric/string arrays are normalized to bytes.
 * @returns A payload view or null when framing/declared length is invalid.
 */
export function parseOperation(payload: unknown, headerLength = 12, maxPayload = 239): FTPOperation | null {
        if (typeof payload === 'string') {
            payload = Uint8Array.from(payload, c => c.charCodeAt(0));
        } else if (Array.isArray(payload)) {
            payload = Uint8Array.from(payload, c => typeof c === 'string' ? c.charCodeAt(0) : c);
        }
        if (!(payload instanceof Uint8Array) || payload.length < headerLength) return null;
        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const size = view.getUint8(4);
        if (size > maxPayload || headerLength + size > payload.length) return null;
        return { seq: view.getUint16(0, true), session: view.getUint8(2),
            opcode: view.getUint8(3), size, req_opcode: view.getUint8(5),
            burst_complete: view.getUint8(6), offset: view.getUint32(8, true),
            payload: payload.subarray(headerLength, headerLength + size) };
    }
