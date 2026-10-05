import { mavlink20 } from '@webtools/mavlink';
import { notifyCompletion } from './completion.js';
import type { TransferCompletion } from './completion.js';
import { packOperation, parseOperation } from './protocol.js';
import type { TransferProcessor, TransferTransport, DownloadOptions, FTPOperation, FTPRequest, TransferResult, TransferMessage } from './types.js';

// MAVLink FTP client with acknowledged downloads and uploads. Replies are correlated with the vehicle,
// session and request so delayed packets cannot complete a later transfer.
export class MAVFTP {
    MAVLink: TransferProcessor;
    ws: TransferTransport;
    OP = { None: 0, TerminateSession: 1, ResetSessions: 2, ListDirectory: 3,
            OpenFileRO: 4, ReadFile: 5, CreateFile: 6, WriteFile: 7, RemoveFile: 8,
            CreateDirectory: 9, RemoveDirectory: 10, OpenFileWO: 11, TruncateFile: 12,
            Rename: 13, CalcFileCRC32: 14, BurstReadFile: 15, Ack: 128, Nack: 129 };
    ERR = { None: 0, Fail: 1, FailErrno: 2, InvalidDataSize: 3,
            InvalidSession: 4, NoSessionsAvailable: 5, EndOfFile: 6,
            UnknownCommand: 7, FileExists: 8, FileProtected: 9, FileNotFound: 10 };
    HDR_LEN = 12;
    MAX_PAYLOAD = 239;
    seq = 0;
    session = 0;
    targetSystem = 1;
    targetComponent = 1;
    burstSize = 80;
    openFileTimeout = 3000;
    burstReadTimeout = 3000;
    readGapTimeout = 1000;
    maxOpenRetries = 5;
    maxBurstRetries = 5;
    maxGapRetries = 20;
    maxConcurrentReads = 5;
    maxFileSize = 64 * 1024 * 1024;
    private currentFile: string | null = null;
    private sessionOpen = false;
    private callback: TransferCompletion | null = null;
    private timeoutCheckInterval: ReturnType<typeof setInterval> | null = null;
    private pendingReset: FTPRequest | null = null;
    private pendingWrite: FTPRequest | null = null;
    private uploadBuffer: Uint8Array | null = null;
    private pendingOpenFile: FTPRequest | null = null;
    private pendingBurstRead: FTPRequest | null = null;
    private pendingReads = new Map<number, FTPRequest>();
    private fileBuffer: Uint8Array | null = null;
    private readGaps: { offset: number; length: number }[] = [];

    // Assigned when a download/upload begins; these fields are not read before it.
    private declare fileSize: number;
    private declare sizeIsEstimate: boolean;
    private declare fixedReadSize: boolean;
    private declare actualSize: number | null;
    private declare highestReceivedOffset: number;
    private declare uploadOffset: number;

    /** Bind an existing processor and caller-owned transport; does not connect or start timers. */
    constructor(mavlink: TransferProcessor, ws: TransferTransport) {
        this.MAVLink = mavlink;
        this.ws = ws;
    }

    /** Encode a fixed-width FTP operation using this client’s configured header/payload limits.
     * @throws RangeError when the declared or supplied payload exceeds the protocol limit. */
    packOp(seq: number, session: number, opcode: number, size: number, req_opcode: number, burst_complete: number, offset: number, payload: Uint8Array | null) {
        return packOperation(seq, session, opcode, size, req_opcode, burst_complete, offset, payload, this.HDR_LEN, this.MAX_PAYLOAD);
    }

    /** Decode an FTP payload, accepting legacy byte strings/arrays. Returns null for truncated or invalid framing. */
    parseOp(payload: unknown): FTPOperation | null {
        return parseOperation(payload, this.HDR_LEN, this.MAX_PAYLOAD);
    }

    /** Send one complete MAVLink packet and advance transport/FTP counters with their original wrap rules.
     * @param seq Reuse a prior request sequence for retries; a new request defaults to the next sequence.
     * @returns The sequence used. Transport exceptions propagate to the operation owner. */
    sendOp(opcode: number, size: number, req_opcode: number, burst_complete: number, offset: number, payload: Uint8Array | null, seq = this.seq) {
        const packed = this.packOp(seq, this.session, opcode, size, req_opcode, burst_complete, offset, payload);
        const msg = new mavlink20.messages.file_transfer_protocol(0, this.targetSystem,
            this.targetComponent, Array.from(packed));
        this.ws.send(Uint8Array.from(msg.pack(this.MAVLink)));
        this.MAVLink.seq = (this.MAVLink.seq + 1) & 255;
        if (seq === this.seq) this.seq = (this.seq + 1) & 65535;
        return seq;
    }

    // Burst replies consume sequence numbers too. Stay beyond the newest
    // accepted reply so ArduPilot won't mistake our next request for a retry.
    // Serial-number arithmetic also handles wrap and reordered burst packets.
    /** Advance past accepted burst replies using serial-number arithmetic; reordered replies never move backwards. */
    advanceSequence(replySeq: number) {
        const next = (replySeq + 1) & 65535;
        if (((next - this.seq) & 65535) < 32768) this.seq = next;
    }

    /** Send and timestamp a request whose sequence, payload and retry budget remain stable across retries. */
    private request(opcode: number, offset: number, size: number, payload: Uint8Array | null = null): FTPRequest {
        const request = { opcode, offset, size, payload, seq: this.seq, retries: 0, sentTime: Date.now() };
        this.sendOp(opcode, size, 0, 0, offset, payload, request.seq);
        return request;
    }

    /** Retry only after a full timeout. Exhaustion completes the active operation with null.
     * @returns False when the operation was exhausted; absent/not-yet-due requests return true. */
    private retry(request: FTPRequest | null, timeout: number, maxRetries: number) {
        if (!request || Date.now() - request.sentTime < timeout) return true;
        if (request.retries >= maxRetries) {
            this.complete(null);
            return false;
        }
        request.retries++;
        request.sentTime = Date.now();
        this.sendOp(request.opcode, request.size, 0, 0, request.offset, request.payload, request.seq);
        return true;
    }

    /** Service active request deadlines; a transport exception fails the transfer and releases its timer. */
    private checkTimeouts() {
        try {
            if (!this.retry(this.pendingReset, this.openFileTimeout, this.maxOpenRetries)) return;
            if (!this.retry(this.pendingWrite, this.openFileTimeout, this.maxOpenRetries)) return;
            if (!this.retry(this.pendingOpenFile, this.openFileTimeout, this.maxOpenRetries)) return;
            if (!this.retry(this.pendingBurstRead, this.burstReadTimeout, this.maxBurstRetries)) return;
            for (const request of this.pendingReads.values()) {
                if (!this.retry(request, this.readGapTimeout, this.maxGapRetries)) return;
            }
        } catch {
            this.complete(null);
        }
    }

    // Explicit administrative reset only. ArduPilot <=4.6 does not scope this
    // to the GCS identity, so it may close another client's active file.
    /** Explicitly reset remote sessions after canceling current work.
     * @param callback Receives true on ACK or null on rejection, timeout or cancellation.
     * ArduPilot <=4.6 may reset another client’s file; never called automatically. */
    resetSessions(callback: (result: boolean | null) => void) {
        this.cancel();
        this.callback = { kind: 'reset', callback };
        try {
            this.pendingReset = this.request(this.OP.ResetSessions, 0, 0);
            this.timeoutCheckInterval = setInterval(() => this.checkTimeouts(), 250);
        } catch { this.complete(null); }
    }

    /** Download a path, canceling previous work first.
     * @param options Enable estimated-size EOF recovery and fixed-width gap reads for virtual files.
     * @param callback Receives exact file bytes or null, after cleanup; may synchronously start another transfer.
     * Invalid paths fail synchronously. The caller retains ownership of the transport. */
    getFile(filename: string, callback: (data: Uint8Array | null) => void, options: DownloadOptions = {}) {
        this.cancel();
        const bytes = new TextEncoder().encode(filename);
        if (!bytes.length || bytes.length > this.MAX_PAYLOAD || bytes.includes(0)) {
            callback(null);
            return;
        }
        this.session = (this.session + 1) & 255;
        this.currentFile = filename;
        this.callback = { kind: 'download', callback };
        this.fileSize = 0;
        this.sizeIsEstimate = options.sizeIsEstimate === true;
        this.fixedReadSize = options.fixedReadSize === true;
        this.actualSize = null;
        this.highestReceivedOffset = 0;
        this.fileBuffer = null;
        this.readGaps = [];
        this.pendingReads.clear();
        try {
            this.pendingOpenFile = this.request(this.OP.OpenFileRO, 0, bytes.length, bytes);
            this.timeoutCheckInterval = setInterval(() => this.checkTimeouts(), 250);
        } catch {
            this.complete(null);
        }
    }

    // Stop-and-wait writes retain their sequence on retry. Wait for the close
    // ACK too: virtual files such as @PARAM apply their contents on close.
    /** Upload a defensive copy of data using stop-and-wait writes.
     * @param callback Receives the byte count only after close ACK, or null on failure/cancellation.
     * Retries preserve bytes and sequence; virtual files may apply data only on close. */
    putFile(filename: string, data: Uint8Array, callback: (size: number | null) => void) {
        this.cancel();
        const name = new TextEncoder().encode(filename);
        if (!name.length || name.length > this.MAX_PAYLOAD || name.includes(0) ||
            !(data instanceof Uint8Array) || data.length > this.maxFileSize) {
            callback(null);
            return;
        }
        this.session = (this.session + 1) & 255;
        this.currentFile = filename;
        this.callback = { kind: 'upload', callback };
        this.uploadBuffer = data.slice();
        this.uploadOffset = 0;
        try {
            this.pendingWrite = this.request(this.OP.CreateFile, 0, name.length, name);
            this.timeoutCheckInterval = setInterval(() => this.checkTimeouts(), 250);
        } catch { this.complete(null); }
    }

    /** Correlate a write/create/close reply and advance one upload step. Unmatched replies do not advance state. */
    private handleWrite(op: FTPOperation) {
        const request = this.pendingWrite;
        if (!request || op.req_opcode !== request.opcode ||
            op.seq !== ((request.seq + 1) & 65535)) return false;
        if (op.opcode === this.OP.Nack) { this.complete(null); return true; }
        if (op.offset !== request.offset) return false;
        if (request.opcode === this.OP.CreateFile) this.sessionOpen = true;
        if (request.opcode === this.OP.TerminateSession) {
            this.sessionOpen = false;
            const size = this.uploadBuffer!.length;
            this.currentFile = null; // Already closed; don't send another close.
            this.complete(size);
            return true;
        }
        if (request.opcode === this.OP.WriteFile) this.uploadOffset += request.size;
        if (this.uploadOffset === this.uploadBuffer!.length) {
            this.pendingWrite = this.request(this.OP.TerminateSession, 0, 0);
        } else {
            const bytes = this.uploadBuffer!.subarray(this.uploadOffset, this.uploadOffset + this.MAX_PAYLOAD);
            this.pendingWrite = this.request(this.OP.WriteFile, this.uploadOffset, bytes.length, bytes);
        }
        return true;
    }

    // Clear state before invoking callers, which may immediately start another file.
    /** Release request state and timers before notifying the active operation’s typed callback.
     * Sends best-effort close only for an acknowledged open session; callback reentrancy is preserved. */
    private complete(data: TransferResult) {
        const callback = this.callback;
        const active = this.sessionOpen;
        this.sessionOpen = false;
        this.callback = null;
        this.currentFile = null;
        clearInterval(this.timeoutCheckInterval!);
        this.timeoutCheckInterval = null;
        this.pendingReset = null;
        this.pendingWrite = null;
        this.uploadBuffer = null;
        this.pendingOpenFile = this.pendingBurstRead = null;
        this.pendingReads.clear();
        this.fileBuffer = null;
        this.readGaps = [];
        if (active) {
            try { this.sendOp(this.OP.TerminateSession, 0, 0, 0, 0, null); } catch { /* Link closed. */ }
        }
        if (callback) notifyCompletion(callback, data);
    }

    /** Cancel active work with a null result; repeated cancellation has no additional callback. */
    cancel() { this.complete(null); }
    /** Compatibility alias for cancellation, including best-effort remote session cleanup. */
    terminateSession() { this.cancel(); }

    /** Accept only replies for this vehicle, destination, session and active request.
     * @returns Whether the reply was accepted, allowing the manager to extend its inactivity watchdog.
     * Late or unrelated messages return false without advancing the next transfer. */
    handleMessage(m: TransferMessage | null | undefined) {
        if ((this.currentFile === null && !this.pendingReset) || m?._name !== 'FILE_TRANSFER_PROTOCOL' ||
            m._header?.srcSystem !== this.targetSystem || m._header?.srcComponent !== this.targetComponent ||
            m.target_system !== this.MAVLink.srcSystem || m.target_component !== this.MAVLink.srcComponent) return false;
        const op = this.parseOp(m.payload);
        if (!op || op.session !== this.session || (op.opcode !== this.OP.Ack && op.opcode !== this.OP.Nack)) return false;
        try {
            if (this.pendingReset) {
                if (op.req_opcode !== this.OP.ResetSessions ||
                    op.seq !== ((this.pendingReset.seq + 1) & 65535)) return false;
                this.complete(op.opcode === this.OP.Ack ? true : null);
                return true;
            }
            if (this.uploadBuffer) return this.handleWrite(op);
            if (op.req_opcode === this.OP.OpenFileRO) {
                const request = this.pendingOpenFile;
                if (!request || op.seq !== ((request.seq + 1) & 65535)) return false;
                if (op.opcode === this.OP.Nack) { this.complete(null); return true; }
                this.sessionOpen = true;
                if (op.size !== 4) return false;
                this.fileSize = new DataView(op.payload.buffer, op.payload.byteOffset, 4).getUint32(0, true);
                if (this.fileSize > this.maxFileSize) { this.complete(null); return true; }
                this.pendingOpenFile = null;
                this.fileBuffer = new Uint8Array(this.fileSize);
                if (!this.fileSize && !this.sizeIsEstimate) { this.complete(this.fileBuffer); return true; }
                this.readGaps = [{ offset: 0, length: this.fileSize }];
                this.pendingBurstRead = this.request(this.OP.BurstReadFile, 0, this.burstSize);
                return true;
            }
            if (!this.fileBuffer) return false;
            if (op.req_opcode === this.OP.BurstReadFile) {
                if (!this.pendingBurstRead) return false;
                if (op.opcode === this.OP.Nack) {
                    if (op.size < 1) return false;
                    if (op.payload[0] !== this.ERR.EndOfFile) {
                        this.advanceSequence(op.seq);
                        this.complete(null);
                    } else {
                        if (op.size !== 1) return false;
                        if (this.sizeIsEstimate) {
                            // Virtual parameter files only advertise an estimate.
                            // The EOF offset bounds the file; still recover every
                            // missing byte below it before reporting completion.
                            if (op.offset < this.highestReceivedOffset || op.offset < this.pendingBurstRead.offset || op.offset > this.maxFileSize) return false;
                            this.actualSize = op.offset;
                            this.resizeFile(op.offset);
                        }
                        this.advanceSequence(op.seq);
                        this.pendingBurstRead = null;
                        this.checkReadSend();
                    }
                    return true;
                }
                if (!this.storeData(op)) return false;
                this.advanceSequence(op.seq);
                if (!this.readGaps.length && (!this.sizeIsEstimate || this.actualSize !== null)) { this.complete(this.fileBuffer); return true; }
                this.pendingBurstRead.sentTime = Date.now();
                this.pendingBurstRead.retries = 0;
                const nextOffset = op.offset + op.size;
                if (op.burst_complete && nextOffset > this.pendingBurstRead.offset) {
                    if (nextOffset >= this.fileSize && !this.sizeIsEstimate) {
                        this.pendingBurstRead = null;
                        this.checkReadSend();
                    } else {
                        this.pendingBurstRead = this.request(this.OP.BurstReadFile, nextOffset, this.burstSize);
                    }
                }
                return true;
            }
            if (op.req_opcode === this.OP.ReadFile) {
                const seq = (op.seq - 1) & 65535;
                const request = this.pendingReads.get(seq);
                if (!request || op.offset !== request.offset) return false;
                if (op.opcode === this.OP.Nack) { this.complete(null); return true; }
                if (op.size > request.size || !this.storeData(op)) return false;
                this.pendingReads.delete(seq);
                if (!this.readGaps.length) this.complete(this.fileBuffer);
                else this.checkReadSend();
                return true;
            }
        } catch {
            this.complete(null);
        }
        return false;
    }

    /** Resize estimated files while retaining received bytes and clipping/extending missing intervals. */
    private resizeFile(size: number) {
        const oldSize = this.fileSize;
        const buffer = new Uint8Array(size);
        buffer.set(this.fileBuffer!.subarray(0, size));
        this.fileBuffer = buffer;
        this.fileSize = size;
        if (size > oldSize) this.readGaps.push({offset:oldSize,length:size-oldSize});
        else this.readGaps = this.readGaps.filter(g=>g.offset<size).map(g=>({offset:g.offset,length:Math.min(g.length,size-g.offset)}));
    }

    /** Store a bounded nonempty reply and subtract its interval from missing ranges.
     * Returns false for invalid bounds; duplicates and reordered packets preserve the same missing intervals. */
    private storeData(op: FTPOperation) {
        const end = op.offset + op.size;
        if (!op.size || end > this.maxFileSize) return false;
        if (end > this.fileSize && this.sizeIsEstimate && this.actualSize === null) this.resizeFile(end);
        if (end > this.fileSize) return false;
        this.highestReceivedOffset = Math.max(this.highestReceivedOffset, end);
        this.fileBuffer!.set(op.payload, op.offset);
        const missing = [];
        for (const gap of this.readGaps) {
            const gapEnd = gap.offset + gap.length;
            if (end <= gap.offset || op.offset >= gapEnd) missing.push(gap);
            else {
                if (gap.offset < op.offset) missing.push({ offset: gap.offset, length: op.offset - gap.offset });
                if (end < gapEnd) missing.push({ offset: end, length: gapEnd - end });
            }
        }
        this.readGaps = missing;
        return true;
    }

    /** Fill missing intervals in order, respecting in-flight reads and the configured concurrency limit.
     * An empty gap set completes the download after releasing its resources. */
    private checkReadSend() {
        if (!this.readGaps.length) { this.complete(this.fileBuffer); return; }
        for (const gap of this.readGaps) {
            const end = gap.offset + gap.length;
            for (let offset = gap.offset; offset < end;) {
                const pending = [...this.pendingReads.values()].find(r => offset >= r.offset && offset < r.offset + r.size);
                if (pending) { offset = pending.offset + pending.size; continue; }
                if (this.pendingReads.size >= this.maxConcurrentReads) return;
                const nextPending = [...this.pendingReads.values()].filter(r => r.offset > offset).map(r => r.offset);
                const size = this.fixedReadSize ? this.burstSize : Math.min(this.burstSize, end - offset, ...nextPending.map(o => o - offset));
                const request = this.request(this.OP.ReadFile, offset, size);
                this.pendingReads.set(request.seq, request);
                offset += size;
            }
        }
    }
}
