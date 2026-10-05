import { mavlink_msgs } from './mavlink.ts'
export interface TelemetryMessage { time: number[]; size: number[]; version: Set<number>; signed: number | boolean }
export interface Component { next_seq: number; received: number; dropped: number; msg: Record<string, TelemetryMessage>; version: Set<number>; signed: number | boolean }
export type Systems = Record<string, Record<string, Component>>
interface Header { version: number; header_length: number; payload_length: number; sequence: number; srcSystem: number; srcComponent: number; msgId: number; signed: number | boolean }
/** Decode only names, sizes, timestamps and sequence statistics. Preserve legacy
 * byte resynchronization, CRC checks, signed frame lengths and wrap accounting. */
export function parseTlog(log_file: ArrayBuffer): Systems {
    // Very basic Tlog parsing, does not look into messages, just gets type and size
    let data = new DataView(log_file)

    // Start at 8 since were looking for MAVlink header which comes after 64 bit timestamp
    const timestamp_length = 8

    let first_timestamp: bigint | undefined
    let end_time = 0

    const system: Systems = {}
    let offset = timestamp_length
    while (offset < log_file.byteLength) {
        const magic = data.getUint8(offset)
        let header: Header
        if (magic == 0xFE) {
            // MAVLink 1
            // 6 byte header, 2 byte crc
            const header_length = 8
            if ((offset + header_length) > log_file.byteLength) {
                // Header does not fit in remaining space
                break
            }
            header = {
                version: 1,
                header_length,
                payload_length: data.getUint8(offset + 1),
                sequence: data.getUint8(offset + 2),
                srcSystem: data.getUint8(offset + 3),
                srcComponent: data.getUint8(offset + 4),
                msgId: data.getUint8(offset + 5),
                signed: false
            }

        } else if (magic == 0xFD) {
            // MAVLink 2
            // 10 byte header, 2 byte crc
            const header_length = 12
            if ((offset + header_length) > log_file.byteLength) {
                // Header does not fit in remaining space
                break
            }

            const incompat_flags = data.getUint8(offset + 2)
            //const compat_flags = data.getUint8(offset + 3)

            header = {
                version: 2,
                header_length,
                payload_length: data.getUint8(offset + 1),
                sequence: data.getUint8(offset + 4),
                srcSystem: data.getUint8(offset + 5),
                srcComponent: data.getUint8(offset + 6),
                msgId: (data.getUint8(offset + 9) << 16) + (data.getUint8(offset + 8) << 8) + data.getUint8(offset + 7),
                signed: (incompat_flags & 0x01) != 0
            }

        } else {
            // Invalid header
            offset += 1
            continue
        }

        const total_msg_length = header.header_length + header.payload_length + (header.signed ? 13 : 0)
        if ((offset + total_msg_length) > log_file.byteLength) {
            // Message does not fit in remaining space
            break
        }

        const message = mavlink_msgs[header.msgId]
        if (message == null) {
            // Invalid ID
            offset += 1
            continue
        }

        /** Accumulate one byte using the legacy CRC-16/MCRF4XX checksum. */
        function x25Crc(byte: number, crc: number): number {
            let tmp = byte ^ (crc & 0xFF)
            tmp = (tmp ^ (tmp << 4)) & 0xFF
            crc = (crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)
            return crc & 0xFFFF
        }

        // Calculate checksum
        let crc = 0xFFFF
        const crc_len = header.header_length + header.payload_length - 2
        for (let i = 1; i < crc_len ; i++) {
            crc = x25Crc(data.getUint8(offset + i), crc)
        }
        crc = x25Crc(message.CRC, crc)

        const expected_crc = data.getUint16(offset + crc_len, true)
        if (crc != expected_crc) {
            // Invalid crc
            offset += 1
            continue
        }

        // Get system
        if (!(header.srcSystem in system)) {
            system[header.srcSystem] = {}
        }
        const sys = system[header.srcSystem]!

        // Get component
        if (!(header.srcComponent in sys)) {
            sys[header.srcComponent] = {
                next_seq: header.sequence,
                received: 0,
                dropped: 0,
                msg: {},
                version: new Set(),
                signed: false
            }
        }
        const comp = sys[header.srcComponent]!
        comp.received++

        // Get message
        if (!(message.name in comp.msg)) {
            comp.msg[message.name] = {
                time: [],
                size: [],
                version: new Set(),
                signed: false
            }
        }
        const msg = comp.msg[message.name]!

        // Get timestamp
        const time_stamp = data.getBigUint64(offset-timestamp_length)
        if (first_timestamp == null) {
            first_timestamp = time_stamp

            const date = new Date(Number(time_stamp/1000n))
            console.log("Start time: " + date.toString())
        }

        // Time since log start in seconds
        const time = Number(time_stamp - first_timestamp) / 1000000

        if (time < end_time) {
            throw new Error("Time went backwards!")
        }
        end_time = time

        // Update message stats
        msg.time.push(time)
        msg.size.push(total_msg_length * 8)
        msg.version.add(header.version)
        msg.signed = Number(msg.signed) | Number(header.signed)

        // Update component stats
        comp.version.add(header.version)
        comp.signed = Number(comp.signed) | Number(header.signed)

        // Check sequence for dropped packets
        let seq = header.sequence
        if (seq < comp.next_seq) {
            // Deal with wrap at 255
            seq += 256
        }
        comp.dropped += seq - comp.next_seq
        comp.next_seq = (seq + 1) % 256

        // Advance by message length
        offset += total_msg_length + timestamp_length
    }

    return system
}
