const sizes = { Q: 8, f: 4, B: 1, n: 4, N: 16, Z: 64 }
/** Encode a format's values in DataFlash little-endian storage. */
function encode(format, values) {
  const buffer = Buffer.alloc([...format].reduce((total, type) => total + sizes[type], 0))
  let offset = 0
  for (let i = 0; i < format.length; i++) {
    const type = format[i]
    const value = values[i]
    if (type === 'Q') buffer.writeBigUInt64LE(BigInt(Math.round(value)), offset)
    else if (type === 'f') buffer.writeFloatLE(value, offset)
    else if (type === 'B') buffer.writeUInt8(value, offset)
    else buffer.write(String(value), offset, sizes[type], 'ascii')
    offset += sizes[type]
  }
  return buffer
}
/** Generate configurable SID intervals and chirp signals as real binary DataFlash messages.
 * Supports every public vehicle choice and ANG or ATT; leaves real fixtures intact. */
function createLogFixture({ vehicle = 'ArduCopter', ang = false, samples = 4096, axes, rawLogOptions = false } = {}) {
  const definitions = [
    ['PARM', 'QNf', 'TimeUS,Name,Value'], ['MSG', 'QZ', 'TimeUS,Message'], ['SIDS', 'QBf', 'TimeUS,Ax,TR'],
    ['SIDD', 'Qffff', 'TimeUS,Targ,Gx,Gy,Gz'],
    ['RATE', 'Qfffffffff', 'TimeUS,ROut,POut,YOut,RDes,PDes,YDes,R,P,Y'],
    [ang ? 'ANG' : 'ATT', 'Qffffff', 'TimeUS,DesRoll,Roll,DesPitch,Pitch,DesYaw,Yaw'],
    ['SIDP', 'Qfffffffffff', 'TimeUS,Aile,Elev,Rudd,rdes,pdes,DRll,Rll,DPit,Pit,aspd,eastas'],
    ['CTUN', 'Qf', 'TimeUS,ThO'], ['FMTU', 'QBNN', 'TimeUS,FmtType,UnitIds,MultIds'],
  ]
  const chunks = []
  const byName = new Map()
  definitions.forEach(([name, format, fields], index) => {
    const id = index + 10
    const length = 3 + [...format].reduce((sum, type) => sum + sizes[type], 0)
    chunks.push(Buffer.from([0xa3, 0x95, 128]), encode('BBnNZ', [id, length, name, format, fields]))
    byName.set(name, { id, format })
  })
  /** Append a record using the message's declared binary format. */
  function message(name, values) {
    const { id, format } = byName.get(name)
    chunks.push(Buffer.from([0xa3, 0x95, id]), encode(format, values))
  }
  definitions.forEach(([, format], index) => message('FMTU', [800000, index + 10, '-'.repeat(format.length), '-'.repeat(format.length)]))
  const params = { INS_GYRO_FILTER: 40, INS_GYRO_RATE: 0, SCHED_LOOP_RATE: 400, ATC_INPUT_TC: .15, PILOT_Y_RATE_TC: .2, Q_A_INPUT_TC: .15, Q_PLT_Y_RATE_TC: .2, SCALING_SPEED: 15, RLL2SRV_TCONST: .5, PTCH2SRV_TCONST: .5, YAW2SRV_TCONST: .5 }
  for (const prefix of ['ATC_RAT_RLL_', 'ATC_RAT_PIT_', 'ATC_RAT_YAW_', 'Q_A_RAT_RLL_', 'Q_A_RAT_PIT_', 'Q_A_RAT_YAW_', 'RLL_RATE_', 'PTCH_RATE_', 'YAW_RATE_']) {
    for (const [suffix, value] of Object.entries({ P: .12, I: .12, D: .003, FF: .05, FLTT: 20, FLTE: 0, FLTD: 20, NTF: 0, NEF: 0 })) params[prefix + suffix] = value
  }
  for (const prefix of ['ATC_ANG_', 'Q_A_ANG_']) for (const axis of ['RLL', 'PIT', 'YAW']) params[prefix + axis + '_P'] = 4.5
  for (const prefix of ['INS_HNTCH_', 'INS_HNTC2_']) for (const [suffix, value] of Object.entries({ ENABLE: 0, MODE: 0, FREQ: 80, BW: 40, ATT: 40, REF: 1, FM_RAT: 1, HMNCS: 1, OPTS: 0 })) params[prefix + suffix] = value
  for (let i = 1; i <= 8; i++) for (const [suffix, value] of Object.entries({ TYPE: 0, NOTCH_FREQ: 80, NOTCH_Q: 2, NOTCH_ATT: 40 })) params[`FILT${i}_${suffix}`] = value
  if (rawLogOptions) params.INS_RAW_LOG_OPT = 0
  for (const [name, value] of Object.entries(params)) message('PARM', [900000, name, value])
  message('MSG', [900000, vehicle === 'ArduCopter' ? 'ArduCopter V4.6.2' : 'ArduPlane V4.6.2'])
  const sidAxes = axes ?? [vehicle === 'ArduPlane_FW' ? 20 : 1, vehicle === 'ArduPlane_FW' ? 21 : 2]
  for (let set = 0; set < sidAxes.length; set++) {
    const start = 1000000 + set * (samples * 2500 + 1000000)
    message('SIDS', [start, sidAxes[set], samples / 400])
    for (let i = 0; i < samples; i++) {
      const time = start + i * 2500
      const x = Math.sin(.017 * i + .00008 * i * i) + .3 * Math.sin(.13 * i)
      const y = .8 * Math.sin(.017 * (i - 2) + .00008 * (i - 2) ** 2) + .2 * Math.sin(.13 * (i - 2))
      message('SIDD', [time, x, y, y * 1.2, y * .7])
      message('RATE', [time, x * .1, x * .12, x * .07, x, x * 1.2, x * .7, y, y * 1.2, y * .7])
      message(ang ? 'ANG' : 'ATT', [time, x * .2, y * .2, x * .24, y * .24, x * .14, y * .14])
      message('SIDP', [time, x * .1, x * .12, x * .07, x, x * 1.2, x * .2, y * .2, x * .24, y * .24, 15 + .1 * Math.sin(i / 100), 1.1])
      message('CTUN', [time, .5])
    }
  }
  return Buffer.concat(chunks)
}
module.exports = { createLogFixture }
