import type { Ref } from 'react'
export interface FileInputProps {
    id: string
    accept?: string
    disabled?: boolean
    inputRef?: Ref<HTMLInputElement>
    onFile: (file: File | null) => void
}
export function FileInput({ id, accept, disabled, inputRef, onFile }: FileInputProps) {
    return <input ref={inputRef} id={id} type="file" accept={accept} disabled={disabled} onChange={event => onFile(event.currentTarget.files?.[0] ?? null)} />
}
/** Inject the existing FileSaver.saveAs; keep its download/browser semantics. */
export type SaveAs = (data: Blob, filename: string) => void
export function downloadFile(saveAs: SaveAs, data: Blob, filename: string): void {
    saveAs(data, filename)
}
