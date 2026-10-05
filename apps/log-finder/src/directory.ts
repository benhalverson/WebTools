export interface DirectoryHandle { kind: 'directory'; name: string; values(): AsyncIterable<DirectoryHandle | FileHandle> }
export interface FileHandle { kind: 'file'; name: string; getFile(): Promise<File | null> }
export interface DirectoryFile { file: File; path: string }
/** Enumerate BIN files twice for legacy progress counting, preserving traversal order.
 * Inaccessible children are skipped; failure of the root iterator propagates.
 * The signal suppresses work after the owning React lifetime is disposed. */
export async function* directoryFiles(entry: DirectoryHandle | FileHandle, signal: AbortSignal, parent?: string): AsyncGenerator<DirectoryFile> {
    if (signal.aborted) return
    const path = parent == null ? entry.name : parent + '/' + entry.name
    if (entry.kind === 'file') {
        const file = await entry.getFile()
        if (!signal.aborted && file?.name.toLowerCase().endsWith('.bin')) yield { file, path }
    } else {
        for await (const child of entry.values()) {
            if (signal.aborted) return
            try { yield* directoryFiles(child, signal, path) }
            catch { if (child.kind === 'directory') console.log('Opening ' + child.name + ' in ' + path + ' failed') }
        }
    }
}
/** Read a file with explicit abort ownership and release every reader callback. */
export function readFile(file: File, signal: AbortSignal): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        /** Settle once and detach handlers, including on error or cancellation. */
        const finish = (error?: unknown) => {
            signal.removeEventListener('abort', abort)
            reader.onload = reader.onerror = reader.onabort = null
            if (error) reject(error)
            else if (reader.result instanceof ArrayBuffer) resolve(reader.result)
            else reject(new DOMException('Problem parsing input file.'))
        }
        /** Cancel this reader when its directory selection loses ownership. */
        const abort = () => { reader.abort(); finish(new DOMException('Aborted', 'AbortError')) }
        if (signal.aborted) { abort(); return }
        signal.addEventListener('abort', abort, { once: true })
        reader.onload = () => finish()
        reader.onerror = () => finish(new DOMException('Problem parsing input file.'))
        reader.readAsArrayBuffer(file)
    })
}
