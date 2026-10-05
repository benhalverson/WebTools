/** Wire types are validated at runtime; numeric inputs retain legacy validation errors. */
export interface ParameterValue { name: string; value: number; type: number }
export interface PackedParameter extends ParameterValue { defaultValue: number | undefined }
export interface ParameterChange extends PackedParameter { previousValue: number }
/** Definitions preserve upstream JSON fields without coercing display or enum values. */
export interface VehicleParameterDefinition {
    name?: string;
    label?: unknown;
    description?: unknown;
    units?: unknown;
    range?: unknown;
    increment?: unknown;
    values?: unknown;
    bitmask?: unknown;
    readOnly?: boolean;
    rebootRequired?: boolean;
}
/** Structural adapter for FTPManager; the caller owns transfer cancellation and connection lifetime. */
export interface ParameterTransfer {
    /** Complete with full bytes or null on failure/cancellation; completion releases the model lock. */
    getFile(path: string, callback: (data: Uint8Array | null) => void,
        options: { timeoutMs: number; sizeIsEstimate: boolean; fixedReadSize: boolean }): void;
    /** Complete with acknowledged byte count or null; cancellation must invoke the callback. */
    putFile(path: string, data: Uint8Array, callback: (result: number | null) => void,
        options: { timeoutMs: number }): void;
}
/** Minimal browser Cache API surface also usable by offline test adapters. */
export interface DefinitionCache {
    /** Open the legacy named cache; failures are handled by the memory/offline fallback. */
    open(name: string): Promise<{
        /** Return an unconsumed response for a canonical metadata URL when present. */
        match(url: string): Promise<Response | undefined>;
        /** Persist response data and its cache timestamp header. */
        put(url: string, response: Response): Promise<unknown>;
    }>;
}
export interface DefinitionOptions {
    fetch?: typeof globalThis.fetch;
    cache?: DefinitionCache;
    maxAge?: number;
    baseUrl?: string;
}
export interface DefinitionResult {
    definitions: Map<string, VehicleParameterDefinition>;
    cached: boolean;
    stale: boolean;
}
