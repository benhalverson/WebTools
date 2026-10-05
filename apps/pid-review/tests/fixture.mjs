/** Encode a synthetic local Dataflash log using the pinned parser's documented field layouts. */
export function fixture({ vehicle = 2, count = 1538, detailed = true, dff = true, changes = true, gap = true } = {}) {
    const chunks = [], definitions = new Map()
    /** Register a standard FMT record and remember its payload layout. */
    function define(id, name, format, fields) {
        const sizes = { Q: 8, f: 4, N: 16, Z: 64 }
        const length = 3 + [...format].reduce((sum, field) => sum + sizes[field], 0)
        const record = Buffer.alloc(89); record.set([0xa3, 0x95, 128, id, length]); record.write(name, 5, 4); record.write(format, 9, 16); record.write(fields.join(','), 25, 64)
        definitions.set(name, { id, format, length }); chunks.push(record)
    }
    /** Encode one message without calling hardware, providers, or external services. */
    function record(name, values) {
        const { id, format, length } = definitions.get(name), bytes = Buffer.alloc(length); bytes.set([0xa3, 0x95, id]); let offset = 3
        ;[...format].forEach((field, i) => {
            if (field === 'Q') { bytes.writeBigUInt64LE(BigInt(values[i]), offset); offset += 8 }
            else if (field === 'f') { bytes.writeFloatLE(values[i], offset); offset += 4 }
            else { const length = field === 'N' ? 16 : 64; bytes.write(values[i], offset, length); offset += length }
        }); chunks.push(bytes)
    }
    define(1, 'MSG', 'QZ', ['TimeUS', 'Message']); define(2, 'PARM', 'QNf', ['TimeUS', 'Name', 'Value'])
    define(3, 'RATE', 'Qffffffffff', ['TimeUS', 'RDes', 'R', 'ROut', 'PDes', 'P', 'POut', 'YDes', 'Y', 'YOut', 'AOut'])
    const ids = vehicle === 1 ? ['PIDS', 'PIDA'] : vehicle === 3 ? ['PIDR', 'PIDP', 'PIDY', 'PIQR', 'PIQP', 'PIQY'] : ['PIDR', 'PIDP', 'PIDY']
    if (detailed) ids.forEach((id, i) => define(4 + i, id, dff ? 'Qffffffff' : 'Qfffffff', ['TimeUS', 'Tar', 'Act', 'Err', 'P', 'I', 'D', 'FF', ...(dff ? ['DFF'] : [])]))
    const prefixes = vehicle === 1 ? ['ATC_STR_RAT_', 'ATC_SPEED_'] : vehicle === 3 ? ['RLL_RATE_', 'PTCH_RATE_', 'YAW_RATE_', 'Q_A_RAT_RLL_', 'Q_A_RAT_PIT_', 'Q_A_RAT_YAW_'] : ['ATC_RAT_RLL_', 'ATC_RAT_PIT_', 'ATC_RAT_YAW_']
    record('MSG', [0, ['Unsupported', 'ArduRover', 'ArduCopter', 'ArduPlane'][vehicle] + ' V4.6.0 (12345678)'])
    for (const text of ['ChibiOS: synthetic', 'Synthetic board', 'Param space used: 1/1']) record('MSG', [0, text])
    for (const prefix of prefixes) for (const [suffix, value] of [['P', 0.1], ['I', 0.2], ['D', 0.01], ['FF', 0.05]]) record('PARM', [0, prefix + suffix, value])
    for (let i = 0; i < count; i++) {
        const time = 1000000 + i * 10000 + (gap && i >= 500 ? 1000000 : 0), target = Math.sin(i * 0.07), actual = 0.8 * Math.sin((i - 2) * 0.07)
        if (changes && i === 900) for (const prefix of prefixes) record('PARM', [time, prefix + 'P', 0.12])
        record('RATE', [time, target * 60, actual * 60, 0.5 * actual, target * 50, actual * 50, 0.4 * actual, target * 40, actual * 40, 0.3 * actual, 0.6])
        if (detailed) ids.forEach((id, axis) => { const scale = vehicle === 3 && axis < 3 || vehicle === 1 && axis === 1 ? 60 : 1; record(id, [time, target * scale, actual * scale, (target - actual) * scale, target * 0.1, 0.02, actual * 0.03, target * 0.04, ...(dff ? [actual * 0.005] : [])]) })
    }
    return Buffer.concat(chunks)
}
