import { decode, encodeUpload, parseText, saveText, formatValue, valueForType, DOWNLOAD, UPLOAD } from './packed.js';
import type { PackedParameter, ParameterChange, ParameterTransfer, VehicleParameterDefinition } from './types.js';

export class MAVParam {
    readonly ftp: ParameterTransfer;
    params: Map<string, PackedParameter>;
    definitions: Map<string, VehicleParameterDefinition>;
    connected: boolean;
    busy: boolean;
    private generation: number;
    private writing = false;
    private readonly listeners: Set<(model: MAVParam) => void>;
    static readonly decode = decode;
    static readonly encodeUpload = encodeUpload;
    static readonly parseText = parseText;
    static readonly saveText = saveText;
    static readonly formatValue = formatValue;
    static readonly valueForType = valueForType;
    static readonly DOWNLOAD = DOWNLOAD;
    static readonly UPLOAD = UPLOAD;
    /** Create a model for one connection; the caller owns the transfer adapter. */
    constructor({ftp}: { ftp: ParameterTransfer }) {
        this.ftp = ftp;
        this.params = new Map();
        this.definitions = new Map();
        this.connected = true;
        this.busy = false;
        this.generation = 0;
        this.listeners = new Set();
    }
    /** Register a synchronous state listener and return its unsubscribe function. */
    subscribe(callback: (model: MAVParam) => void): () => boolean { this.listeners.add(callback); return () => this.listeners.delete(callback); }
    /** Notify current listeners synchronously with the model. */
    emit(): void { for (const cb of this.listeners) cb(this); }
    /** Invalidate pending results and clear vehicle values; the owner cancels the transfer. */
    disconnect(): void { this.connected=false; this.generation++; this.params.clear(); this.emit(); }
    /** Invalidate the pending transaction; clear cached values when a write may have reached the vehicle. */
    cancelPending(): void { this.generation++; if (this.writing) { this.params.clear(); this.emit(); } }
    /** Serialize operations and restore busy state after success or rejection. */
    async transaction<T>(fn: (check: () => void) => Promise<T>): Promise<T> {
        if (!this.connected) throw new Error('Vehicle disconnected');
        if (this.busy) throw new Error('A parameter operation is already in progress');
        this.busy = true; this.emit();
        const generation = this.generation;
        try { return await fn(()=>{if (!this.connected) throw new Error('Vehicle disconnected'); if (generation !== this.generation) throw new Error('Parameter operation cancelled');}); }
        finally { this.busy=false; this.emit(); }
    }
    /** Fetch and validate the complete packed file before replacing current values. */
    async download(check: () => void): Promise<Map<string, PackedParameter>> {
        const data = await new Promise<Uint8Array | null>(resolve=>this.ftp.getFile(DOWNLOAD,resolve,{timeoutMs:20000,sizeIsEstimate:true,fixedReadSize:true}));
        check();
        if (!data) throw new Error('Parameter download failed');
        const params = decode(data);
        this.params = params;
        return params;
    }
    /** Fetch parameters and defaults under the model operation lock. */
    refresh(): Promise<Map<string, PackedParameter>> { return this.transaction(check=>this.download(check)); }
    /** Validate names, types and readonly metadata before producing non-optimistic edits. */
    changes(values: ReadonlyMap<string, number>): ParameterChange[] {
        if (!this.params.size) throw new Error('Fetch parameters first');
        const changes = [];
        for (const [name,raw] of values) {
            const p = this.params.get(name);
            if (!p) throw new Error(`Unknown parameter: ${name}`);
            const value = valueForType(raw,p.type);
            if (value === p.value) continue;
            if (this.definitions.get(name)?.readOnly) throw new Error(`${name} is read-only`);
            changes.push({...p,value,previousValue:p.value});
        }
        return changes;
    }
    /** Upload changes and require acknowledged close plus exact readback before reporting success. */
    async apply(values: ReadonlyMap<string, number>): Promise<ParameterChange[]> {
        return this.transaction(async check=>{
            this.writing = true;
            try {
            const changes = this.changes(values);
            if (!changes.length) return [];
            const bytes = encodeUpload(changes);
            const sent = await new Promise<number | null>(resolve=>this.ftp.putFile(UPLOAD,bytes,resolve,{timeoutMs:20000}));
            check();
            // Even a failed upload can have applied a prefix on file close.
            // Refresh rather than displaying optimistic cached values.
            try { await this.download(check); }
            catch (e) { this.params.clear(); throw new Error(`Upload outcome unverified: ${e instanceof Error ? e.message : String(e)}. Fetch parameters again.`); }
            if (sent === null || sent === undefined) throw new Error('Upload failed or close was not acknowledged; current values have been refreshed');
            const rejected = changes.filter(p=>this.params.get(p.name)?.value !== p.value);
            if (rejected.length) throw new Error(`Vehicle did not retain requested values: ${rejected.map(p=>p.name).join(', ')}`);
            return changes;
            } finally { this.writing = false; }
        });
    }
    /** Apply a known default through the same upload and verification path. */
    reset(name: string): Promise<ParameterChange[]> {
        const p = this.params.get(name);
        if (p?.defaultValue === undefined) return Promise.reject(new Error('Default unavailable'));
        return this.apply(new Map([[name,p.defaultValue]]));
    }
    /** Filter names and metadata with all query terms and optionally exclude defaults. */
    search(query='', nonDefault=false): PackedParameter[] {
        const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return [...this.params.values()].filter(p=>{
            if (nonDefault && (p.defaultValue === undefined || p.value === p.defaultValue)) return false;
            const d = this.definitions.get(p.name);
            const text = `${p.name} ${d?.label || ''} ${d?.description || ''}`.toLowerCase();
            return terms.every(term=>text.includes(term));
        }).sort((a,b)=>a.name.localeCompare(b.name,'en'));
    }
    /** Map MAV_TYPE values to the existing metadata vehicle names. */
    static vehicleName(type: number): string {
        if ([10,11].includes(type)) return 'Rover';
        if (type === 1 || (type >= 19 && type <= 25)) return 'Plane';
        if (type === 12) return 'Sub';
        if (type === 5) return 'AntennaTracker';
        if (type === 7) return 'Blimp';
        if (type === 4) return 'Heli';
        return 'Copter';
    }
}
