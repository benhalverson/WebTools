import { blankRows, calculate, defaultParameters, parseParameterFile, parameterNames, type Calculation, type ParameterName, type ThrustRow } from './model.ts'
import { exampleRows } from './example.ts'

export interface State { rows: readonly ThrustRow[]; replacement: readonly ThrustRow[]; revision: number; calculation: Calculation; inputs: Record<ParameterName, string> }
export type Action = { type: 'edit'; name: ParameterName; value: string } | { type: 'commit'; name: ParameterName } | { type: 'rows'; rows: ThrustRow[] } | { type: 'reset' } | { type: 'example' } | { type: 'import'; text: string }

/** Create the original ten-row reset state without fitting an empty dataset. */
export function initialState(revision = 0): State {
    const parameters = defaultParameters()
    const rows = blankRows()
    return { rows, replacement: rows, revision, calculation: calculate(rows, { parameters, saveHover: false, hoverDisplay: '' }),
        inputs: Object.fromEntries(parameterNames.map(name => [name, parameters[name] === null ? '' : String(parameters[name])])) as Record<ParameterName, string> }
}

/** Fit one snapshot and update only fields that the legacy calculation writes. */
function recalculate(state: State, forcedExpo?: number): State {
    const calculation = calculate(state.rows, state.calculation.state, forcedExpo)
    // Empty data only clears traces; legacy retains the last PWM axis range.
    if (!calculation.pwmData.length) calculation.pwmRange = state.calculation.pwmRange
    const inputs = { ...state.inputs }
    if (calculation.expoData.length) {
        inputs.MOT_THST_EXPO = Number.isFinite(calculation.state.parameters.MOT_THST_EXPO) ? calculation.expoDisplay : ''
        inputs.MOT_THST_HOVER = calculation.state.hoverDisplay
    }
    return { ...state, calculation, inputs }
}

/** Commit a native change, retaining the legacy distinction between spin-min input and change events. */
function commit(state: State, name: ParameterName): State {
    const parameters = { ...state.calculation.state.parameters }
    const inputs = { ...state.inputs }
    if (name !== 'MOT_SPIN_MIN') parameters[name] = parseFloat(inputs[name])
    if (name === 'MOT_SPIN_ARM') {
        // Both DOM values were strings; preserve the intentional lexical comparison.
        if (inputs.MOT_SPIN_MIN < inputs.MOT_SPIN_ARM) inputs.MOT_SPIN_MIN = inputs.MOT_SPIN_ARM
        parameters.MOT_SPIN_MIN = parseFloat(inputs.MOT_SPIN_MIN)
    }
    return recalculate({ ...state, inputs, calculation: { ...state.calculation, state: { ...state.calculation.state, parameters } } }, name === 'MOT_THST_EXPO' ? parseFloat(inputs[name]) : undefined)
}

/** Apply user edits and ordered file changes atomically while preserving legacy fitting/export quirks. */
export function reduce(state: State, action: Action): State {
    switch (action.type) {
        case 'edit': {
            const inputs = { ...state.inputs, [action.name]: action.value }
            if (action.name !== 'MOT_SPIN_MIN') return { ...state, inputs }
            if (inputs.MOT_SPIN_MIN < inputs.MOT_SPIN_ARM) inputs.MOT_SPIN_MIN = inputs.MOT_SPIN_ARM
            return { ...state, inputs, calculation: { ...state.calculation, state: { ...state.calculation.state,
                parameters: { ...state.calculation.state.parameters, MOT_SPIN_MIN: parseFloat(inputs.MOT_SPIN_MIN) } } } }
        }
        case 'commit': return commit(state, action.name)
        case 'rows': return recalculate({ ...state, rows: action.rows })
        case 'reset': {
            const next = initialState(state.revision + 1)
            next.calculation.pwmRange = state.calculation.pwmRange
            return next
        }
        case 'example': {
            const next = recalculate({ ...state, rows: exampleRows, replacement: exampleRows, revision: state.revision + 1 })
            return commit({ ...next, inputs: { ...next.inputs, COPTER_AUW: '2.5' } }, 'COPTER_AUW')
        }
        case 'import': {
            let next = state
            for (const { name, value } of parseParameterFile(action.text)) {
                next = commit({ ...next, inputs: { ...next.inputs, [name]: Number.isFinite(value) ? String(value) : '' } }, name)
            }
            return next
        }
    }
}
