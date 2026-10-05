import { readFile } from 'node:fs/promises'
/** Wrap authoritative pymavlink frames with fixed big-endian microsecond timestamps.
 * Packets remain byte-identical: repeated sequence numbers intentionally exercise
 * legacy dropped-packet wrap accounting rather than fabricating corrected values. */
export async function tlogFixture() {
    const source = JSON.parse(await readFile(new URL('../../../tests/fixtures/mavlink.json', import.meta.url)))
    const packets = [...source.messages.slice(0, 6).map(message => Buffer.from(message.hex, 'hex')), Buffer.from(source.signed, 'hex'), Buffer.from(source.v1, 'hex')]
    return Buffer.concat(packets.map((packet, index) => { const timestamp = Buffer.alloc(8); timestamp.writeBigUInt64BE(1700000000000000n + BigInt(index) * 3250000n); return Buffer.concat([timestamp, packet]) }))
}
/** Copy the exact visible byte range so Buffer pooling cannot enter parser input. */
export function arrayBuffer(bytes) { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
