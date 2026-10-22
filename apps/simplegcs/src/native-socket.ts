import type { Socket } from './connection.ts'
/** Adapt native event callbacks without weakening the codec's binary transport contract. */
export function nativeSocket(url: string): Socket {
    const socket = new WebSocket(url)
    const adapter: Socket = {
        get readyState() { return socket.readyState },
        get binaryType() { return socket.binaryType },
        set binaryType(value: string) { socket.binaryType = value === 'arraybuffer' ? 'arraybuffer' : 'blob' },
        onopen: null, onclose: null, onerror: null, onmessage: null,
        /** Forward complete packed bytes to the submitted native socket. */
        send(bytes) { socket.send(Uint8Array.from(bytes)) },
        /** Release native listeners before closing; retained messages cannot reach a disposed owner. */
        close(code, reason) { socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null; socket.close(code, reason) },
    }
    socket.onopen = () => adapter.onopen?.()
    socket.onclose = () => adapter.onclose?.()
    socket.onerror = () => adapter.onerror?.()
    socket.onmessage = event => { if (event.data instanceof ArrayBuffer) adapter.onmessage?.({ data: event.data }) }
    return adapter
}
