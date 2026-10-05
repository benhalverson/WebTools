import { MAVFTP } from './ftp.js';
import type { TransferProcessor, TransferTransport, DownloadOptions, QueueOptions, TransferMessage } from './types.js';

/** Structural client factory supports deterministic simulated links without global state. */
export interface TransferClient {
    targetSystem: number; targetComponent: number;
    /** Start a download; completion delivers bytes or null after releasing transfer resources. */
    getFile(path: string, cb: (data: Uint8Array | null) => void, options?: DownloadOptions): void;
    /** Start an upload; completion delivers a byte count after close ACK, otherwise null. */
    putFile(path: string, data: Uint8Array, cb: (size: number | null) => void): void;
    /** Cancel active work and notify its callback with null before returning. */
    cancel(): void;
    /** Return whether the active transfer accepted this decoded reply. */
    handleMessage(message: TransferMessage | null | undefined): boolean;
}
interface JobLifetime {
    path: string;
    tag?: string | undefined; timeoutMs?: number | undefined;
    completed?: boolean; timer?: ReturnType<typeof setTimeout>;
}
interface DownloadJob extends JobLifetime {
    kind: 'download'; options: DownloadOptions;
    cb: (data: Uint8Array | null) => void;
}
interface UploadJob extends JobLifetime {
    kind: 'upload'; data: Uint8Array;
    cb: (size: number | null) => void;
}
type TransferJob = DownloadJob | UploadJob;
/** Create an isolated owner for one link, serialized jobs and their inactivity watchdogs.
 * @param createClient Optional factory for deterministic tests or compatible transfer clients.
 * Call clearLink on disconnect/disposal; the caller retains ownership of the transport.
 */
export function createFTPManager(createClient: (processor: TransferProcessor, transport: TransferTransport) => TransferClient = (processor, transport) => new MAVFTP(processor, transport)) {
    let ftp: TransferClient | null = null;
    let current: TransferJob | null = null;
    let queue: TransferJob[] = [];
    let link: { MAVLink: TransferProcessor; ws: TransferTransport; sysId: number; compId: number } | null = null;

    /** Finish a job once, releasing its watchdog before its operation-specific notification.
     * Always pump the next queued job, even when a consumer callback throws. */
    function finish(job: TransferJob, notify: () => void) {
        if (job.completed) return;
        job.completed = true;
        clearTimeout(job.timer);
        if (current === job) current = null;
        try { notify(); } finally { pump(); }
    }

    /** Restart this job’s inactivity deadline; expiry cancels only the still-active transfer. */
    function armTimeout(job: TransferJob) {
        clearTimeout(job.timer);
        job.timer = setTimeout(() => {
            if (current !== job || job.completed) return;
            ftp!.cancel();
        }, job.timeoutMs ?? 5000);
    }

    /** Start the oldest queued job when idle. Link absence/start failures complete it with null. */
    function pump() {
        if (current || !queue.length) return;
        const job = queue.shift()!;
        if (!ftp) { finish(job, () => job.cb?.(null)); return; }
        current = job;
        armTimeout(job);
        try {
            if (job.kind === 'upload') ftp.putFile(job.path, job.data, size => finish(job, () => job.cb?.(size)));
            else ftp.getFile(job.path, data => finish(job, () => job.cb?.(data)), job.options);
        }
        catch { finish(job, () => job.cb?.(null)); }
    }

    /** Remove matching queued jobs before notifying cancellation; leave active work untouched. */
    function dropQueued(predicate: (job: TransferJob) => boolean) {
        const canceled = queue.filter(predicate);
        queue = queue.filter(job => !predicate(job));
        for (const job of canceled) {
            job.completed = true;
            job.cb?.(null);
        }
    }

    const API = {
        /** Bind a discovered vehicle, canceling old-link work first. Identical links preserve active requests.
         * Invalid IDs or a missing transport leave the manager disconnected; no session reset is sent. */
        setLink(MAVLink: TransferProcessor | null, ws: TransferTransport | null, sysId: number, compId: number) {
            if (link && link.MAVLink === MAVLink && link.ws === ws &&
                link.sysId === sysId && link.compId === compId) return;
            API.clearLink();
            if (!MAVLink || !ws || !Number.isInteger(sysId) || sysId < 1 || sysId > 255 ||
                !Number.isInteger(compId) || compId < 0 || compId > 255) return;
            link = { MAVLink, ws, sysId, compId };
            ftp = createClient(MAVLink, ws);
            ftp.targetSystem = sysId;
            ftp.targetComponent = compId;
            // Do not reset sessions here: ArduPilot <=4.6 can close another
            // client's file. Start requests immediately with their watchdogs.
        },
        /** Disconnect manager ownership and complete active/queued work with null without closing the caller’s transport. */
        clearLink() {
            const previous = ftp;
            const canceled = queue;
            queue = [];
            ftp = link = null;
            previous?.cancel();
            for (const job of canceled) finish(job, () => job.cb?.(null));
        },
        /** Forward a decoded packet and refresh the watchdog only if the same active job accepts it. */
        handleMessage(m: TransferMessage | null | undefined) {
            const job = current;
            if (ftp?.handleMessage(m) && job && current === job && !job.completed) armTimeout(job);
        },
        /** Queue a download with optional tag/path deduplication. The callback receives bytes or null after completion. */
        getFile(path: string, cb: (data: Uint8Array | null) => void, opts: QueueOptions = {}) {
            if (opts.dropQueuedTag && opts.tag) dropQueued(job => job.tag === opts.tag);
            if (opts.dropQueuedPath) dropQueued(job => job.path === path);
            queue.push({ kind: 'download', path, cb, tag: opts.tag, timeoutMs: opts.timeoutMs, options: opts });
            pump();
        },
        /** Queue an upload behind prior work; its callback receives a byte count only after close ACK, otherwise null. */
        putFile(path: string, data: Uint8Array, cb: (size: number | null) => void, opts: QueueOptions = {}) {
            queue.push({ kind: 'upload', path, data, cb, timeoutMs: opts.timeoutMs });
            pump();
        },
        /** Cancel queued jobs carrying this tag, notifying each with null; active work continues. */
        cancelQueuedByTag(tag: string) { dropQueued(job => job.tag === tag); },
        /** Cancel queued jobs for this exact remote path; active work continues. */
        cancelQueuedByPath(path: string) { dropQueued(job => job.path === path); },
        /** Report whether a transfer currently owns the link. */
        isBusy() { return current !== null; },
        /** Return the number of waiting jobs, excluding the active transfer. */
        queuedCount() { return queue.length; }
    };
    return API;
}
