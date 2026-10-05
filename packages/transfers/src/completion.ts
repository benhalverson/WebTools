import type { TransferResult } from './types.js';

/** The active operation owns the callback and its result contract. */
export type TransferCompletion =
    | { kind: 'download'; callback: (data: Uint8Array | null) => void }
    | { kind: 'upload'; callback: (size: number | null) => void }
    | { kind: 'reset'; callback: (acknowledged: boolean | null) => void };

/** Dispatch after state/timer cleanup; callbacks may immediately start new work. */
export function notifyCompletion(completion: TransferCompletion, result: TransferResult): void {
    switch (completion.kind) {
        case 'download':
            if (result === null || result instanceof Uint8Array) return completion.callback(result);
            break;
        case 'upload':
            if (result === null || typeof result === 'number') return completion.callback(result);
            break;
        case 'reset':
            if (result === null || typeof result === 'boolean') return completion.callback(result);
            break;
    }
    // An internal programming error, never a remote-packet error. Keep a wrong
    // operation's result from escaping through a typed consumer callback.
    throw new TypeError(`Invalid ${completion.kind} completion result`);
}
