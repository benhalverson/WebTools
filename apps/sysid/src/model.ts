/** One selected DataFlash signal; compensation intentionally uses ATT sample indices. */
export interface Signal { message: string; field: string; multiplier: string | null; compensation: 'Roll' | 'Pitch' | null }
export type Mode = 'tf' | 'ss'
export type Matrix = (number | string | null)[][]
export interface Configuration {
    input: Signal; outputs: Signal[]; start: string; end: string; frequencyStart: string; frequencyEnd: string; cutoff: string
    numerator: string; denominator: string; symbols: string
    parameters: string[]; bounds: string[][]; constraints: string[][]
    matrixA: string[][]; matrixB: string[][]; H0: string[][]; H1: string[][]
}
/** Create an unselected signal, matching the legacy None options. */
export function emptySignal(): Signal { return { message: 'None', field: 'None', multiplier: null, compensation: null } }
/** Allocate independent blank cells so editing one row never mutates another. */
export function blankMatrix(rows: number, columns: number): string[][] { return Array.from({ length: rows }, () => Array<string>(columns).fill('')) }
/** Initial form values are deliberately blank, except the legacy zero time range. */
export function initialConfiguration(): Configuration {
    return { input: emptySignal(), outputs: [emptySignal()], start: '0', end: '0', frequencyStart: '', frequencyEnd: '', cutoff: '', numerator: '', denominator: '', symbols: '', parameters: [], bounds: [], constraints: [], matrixA: [], matrixB: [], H0: [], H1: [] }
}
/** Generate manual fields without changing the shared time/frequency or TF controls. */
export function generateFields(config: Configuration, outputs: number, order: number, parameters: number, constraints: number): Configuration {
    if (![outputs, order].every(n => Number.isInteger(n) && n > 0) || ![parameters, constraints].every(n => Number.isInteger(n) && n >= 0)) throw new Error('Please enter valid numbers for inputs and outputs.')
    return { ...config, input: emptySignal(), outputs: Array.from({ length: outputs }, emptySignal), parameters: Array<string>(parameters).fill(''), bounds: blankMatrix(parameters, 2), constraints: blankMatrix(constraints, 2), matrixA: blankMatrix(order, order), matrixB: blankMatrix(order, 1), H0: blankMatrix(outputs, order), H1: blankMatrix(outputs, order) }
}
export type Preset = 'MR_Roll' | 'MR_Pitch' | 'MR_Yaw' | 'MR_Vertical'
/** Reproduce the four legacy multirotor models, including 0.01745 and constraint spelling. */
export function presetConfiguration(config: Configuration, preset: Preset): Configuration {
    const lateral = preset === 'MR_Roll' || preset === 'MR_Pitch'
    const roll = preset === 'MR_Roll', yaw = preset === 'MR_Yaw'
    const parameters = lateral ? (roll ? ['Yv','Ylat','Lv','Llat','wlag','wlg'] : ['Xu','Xlon','Mu','Mlon','wlag','wlg']) : (yaw ? ['Nr','Nped','Npedp','wlag','wlg'] : ['Zw','Zcoll','wlag','wlg'])
    const next = generateFields(config, lateral ? 2 : 1, lateral ? 4 : 2, parameters.length, 1)
    next.parameters = parameters
    next.input = { ...emptySignal(), message: 'RATE', field: lateral ? (roll ? 'ROut' : 'POut') : (yaw ? 'YOut' : 'AOut') }
    next.outputs = [{ message: 'SIDD', field: lateral ? (roll ? 'Gx' : 'Gy') : (yaw ? 'Gz' : 'Az'), multiplier: lateral || yaw ? '0.01745' : null, compensation: null }]
    if (lateral) next.outputs.push({ message: 'SIDD', field: roll ? 'Ay' : 'Ax', multiplier: null, compensation: roll ? 'Roll' : 'Pitch' })
    next.constraints = [[lateral ? 'A_3_3' : 'A_1_1', lateral ? '-B_3_0' : '-B_1_0']]
    next.bounds = lateral ? [['-1','0'],['-30','30'],['-10','10'],['50','200'],['-50','0'],['0','50']] : yaw ? [['-1','0'],['0','80'],['-10','10'],['-50','0'],['0','50']] : [['-1','0'],['-100','100'],['-50','0'],['0','50']]
    next.matrixA = lateral ? [[parameters[0]!, '0', roll ? '9.81' : '-9.81', parameters[1]!], [parameters[2]!, '0','0',parameters[3]!],['0','1','0','0'],['0','0','0','wlag']] : [[parameters[0]!,parameters[1]!],['0','wlag']]
    next.matrixB = lateral ? [['0'],['0'],['0'],['wlg']] : [[yaw ? 'Npedp' : '0'],['wlg']]
    next.H0 = lateral ? [['0','1','0','0'],['0','0','0','0']] : [[yaw ? '1' : '0','0']]
    next.H1 = lateral ? [['0','0','0','0'],['1','0','0','0']] : [[yaw ? '0' : '1','0']]
    return next
}
