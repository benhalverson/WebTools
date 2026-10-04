export const scenarios = [
    ['default', 'R', 'angle', {}],
    ['negative and wrap', 'P', 'angle', { desired_pos: '-179', initial_pos: '179', initial_vel: '-15' }],
    ['positive boundary', 'R', 'angle', { desired_pos: '540', initial_pos: '-540' }],
    ['rate', 'P', 'rate', { desired_vel: '-45', initial_vel: '20', end_time: '2' }],
    ['limited', 'P', 'angle', { desired_pos: '-60', ATC_RATE_P_MAX: '25', ATC_ACC_P_MAX: '80', PTCH2SRV_RMAX_UP: '20', PTCH2SRV_RMAX_DN: '35', PTCH2SRV_ACCEL: '80' }],
    ['time constant boundary', 'R', 'angle', { ATC_INPUT_TC: '0', RLL2SRV_TCONST: '0.1' }],
    ['long minimum runtime', 'R', 'rate', { desired_vel: '0', end_time: '10' }],
]

/** Serialize the entire owned plot snapshot exactly as the unmodified legacy page. */
export function serialize(plots) { return JSON.stringify(plots) }
