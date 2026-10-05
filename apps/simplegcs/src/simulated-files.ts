/** Build deterministic in-memory ArduPilot mission records for the offline preview peer. */
export function simulatedFile(path: string): Uint8Array | null {
    const fence = path === '@MISSION/fence.dat'
    if (!fence && path !== '@MISSION/mission.dat') return null
    const count = fence ? 1 : 3, bytes = new Uint8Array(10 + 38 * count), view = new DataView(bytes.buffer)
    view.setUint16(0, 0x763d, true); view.setUint16(2, fence ? 1 : 0, true); view.setUint16(8, count, true)
    for (let i = 0; i < count; i++) {
        const offset = 10 + 38 * i
        view.setFloat32(offset, fence ? 150 : 0, true)
        view.setInt32(offset + 16, -350000000 + i * 5000, true); view.setInt32(offset + 20, 1490000000 + i * 5000, true)
        view.setUint16(offset + 28, i, true); view.setUint16(offset + 30, fence ? 5003 : 16, true)
        view.setUint8(offset + 34, 6); view.setUint8(offset + 36, 1); view.setUint8(offset + 37, fence ? 1 : 0)
    }
    return bytes
}
