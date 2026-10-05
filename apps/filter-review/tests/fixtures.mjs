import { Buffer } from 'node:buffer'
const sizes = { B: 1, H: 2, Q: 8, f: 4, n: 4, N: 16, Z: 64, a: 64 }

/** Encode deliberately synthetic DataFlash records using the documented wire
 * widths, independent of the production parser and spectrum implementation. */
function record(id, format, values) {
    const bytes = Buffer.alloc(3 + [...format].reduce((sum, type) => sum + sizes[type], 0))
    bytes.set([0xa3, 0x95, id])
    let offset = 3
    for (const [index, type] of [...format].entries()) {
        const value = values[index]
        if (type === 'B') bytes.writeUInt8(value, offset)
        else if (type === 'H') bytes.writeUInt16LE(value, offset)
        else if (type === 'Q') bytes.writeBigUInt64LE(BigInt(value), offset)
        else if (type === 'f') bytes.writeFloatLE(value, offset)
        else if (type === 'a') value.forEach((sample, i) => bytes.writeInt16LE(sample, offset + i * 2))
        else bytes.write(value, offset, sizes[type], 'ascii')
        offset += sizes[type]
    }
    return bytes
}

/** Construct raw, batch, and combined fixtures with two IMUs, gaps, pre/post
 * options, known tones, changing batch rates/scales and a terminal batch.
 * No authoritative checked-in fixture is changed or replaced. */
export function fixture(kind = 'both', options = 0, throttle = []) {
    const definitions = [
        [128, 'FMT', 'BBnNZ', 'Type,Length,Name,Format,Columns'],
        [129, 'FMTU', 'QBNN', 'TimeUS,FmtType,UnitIds,MultIds'],
        [130, 'PARM', 'QNf', 'TimeUS,Name,Value'],
        [131, 'GYR', 'QBQfff', 'TimeUS,I,SampleUS,GyrX,GyrY,GyrZ'],
        [132, 'ISBH', 'QHBBHHQf', 'TimeUS,N,type,instance,mul,smp_cnt,SampleUS,smp_rate'],
        [133, 'ISBD', 'QHHaaa', 'TimeUS,N,seqno,x,y,z'],
        [134, 'RATE', 'Qf', 'TimeUS,AOut'],
    ]
    const chunks = definitions.filter(([, name]) => kind === 'both' || name !== (kind === 'batch' ? 'GYR' : 'ISBH') && name !== (kind === 'batch' ? 'GYR' : 'ISBD')).map(([id, name, format, columns]) =>
        record(128, 'BBnNZ', [id, 3 + [...format].reduce((sum, type) => sum + sizes[type], 0), name, format, columns]))
    chunks.push(record(129, 'QBNN', [1, 130, 's--', '---']))
    for (const [i, value] of throttle.entries()) chunks.push(record(134, 'Qf', [1000000 + i * 1000000, value]))
    if (kind !== 'batch') chunks.push(record(129, 'QBNN', [1, 131, 's#s---', '------']))
    for (const [name, value] of [['INS_GYR_ID', 1], ['INS_GYR2_ID', options ? 0 : 2], ['INS_RAW_LOG_OPT', options], ['INS_LOG_BAT_OPT', options]]) chunks.push(record(130, 'QNf', [1, name, value]))
    if (kind !== 'batch') for (let i = 0; i < 4096; i++) for (let instance = 0; instance < 2; instance++) {
        const time = 1000000 + i * 1000 + (i >= 2048 ? 1000000 : 0)
        chunks.push(record(131, 'QBQfff', [time, instance, time, Math.sin(i * Math.PI / 8), Math.cos(i * Math.PI / 16), instance + i / 4096]))
    }
    if (kind !== 'raw') for (let batch = 0; batch < 9; batch++) {
        const multiplier = batch % 2 ? 20 : 10
        chunks.push(record(132, 'QHBBHHQf', [1000000 + batch * 400000, batch, 1, batch % 2, multiplier, 256, 1000000 + batch * 400000, batch % 3 ? 1000 : 800]))
        for (let sequence = 0; sequence < 8; sequence++) {
            const samples = Array.from({ length: 32 }, (_, j) => Math.round(100 * Math.sin((j + sequence * 32) * Math.PI / 8)))
            chunks.push(record(133, 'QHHaaa', [1, batch, sequence, samples, samples.map(x => -x), samples.map(x => Math.round(x / 2))]))
        }
    }
    return Buffer.concat(chunks)
}
