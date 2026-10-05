import type { Ref } from 'react'
export interface FileInputProps {
    id: string
    accept?: string
    disabled?: boolean
    inputRef?: Ref<HTMLInputElement>
    onFile: (file: File | null) => void
}
/** Render a single-file picker and report its first File, or null when cleared.
 * The callback receives the original File without reading or transforming it;
 * inputRef exposes the native input for caller-owned integration. */
export function FileInput({ id, accept, disabled, inputRef, onFile }: FileInputProps) {
    return <input ref={inputRef} id={id} type="file" accept={accept} disabled={disabled} onChange={event => onFile(event.currentTarget.files?.[0] ?? null)} />
}
/** Inject the existing FileSaver.saveAs; keep its download/browser semantics. */
export type SaveAs = (data: Blob, filename: string) => void
/** Delegate the original Blob and filename to the injected legacy FileSaver.
 * Browser download behavior belongs to saveAs; synchronous errors propagate
 * unchanged and this wrapper does not signal download completion. */
export function downloadFile(saveAs: SaveAs, data: Blob, filename: string): void {
    saveAs(data, filename)
}
