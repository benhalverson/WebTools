/** Download exact serializer bytes and release the object URL after navigation starts. */
export function download(text: string, filename: string): void {
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename)
}

/** Download completed media and revoke the URL after the browser accepts navigation. */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
}
