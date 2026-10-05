import { array_all_equal } from '@webtools/numerics'
import { param_to_string } from '@webtools/parameters'
import { get_rotation_name } from './quaternion.ts'
import { fitTypes, type Calibration, type Compass, type FitResult } from './types.ts'
export const fitLabels = { offsets: 'Offsets', scale: 'Offsets and scale', iron: 'Offsets and iron' }
export interface Choice {
    key: string
    name: string
    result: FitResult
    original: boolean
}
export interface Selection {
    visible: string[]
    priority: string[]
}
/** Enumerate original and fitted traces in the same order as the legacy plots. */
export function choices(compass: Compass): Choice[] {
    return [
        { key: `${compass.index}:existing`, name: 'Existing cal', result: compass.orig, original: true },
        ...compass.fits.flatMap((fit, index) =>
            fitTypes.map((type) => ({
                key: `${compass.index}:${index}:${type}`,
                name: `${fitLabels[type]}<br>${fit.name}`,
                result: fit[type],
                original: false,
            })),
        ),
    ]
}
/** Recalculation retains shown fits and selects the first valid no-motor fit. */
export function calculatedSelection(compasses: Compass[], previous?: Selection): Selection {
    const visible = new Set(previous?.visible ?? compasses.map((compass) => `${compass.index}:existing`))
    for (const compass of compasses) {
        const first = choices(compass).find(
            (choice) =>
                !choice.original && choice.key.startsWith(`${compass.index}:0:`) && choice.result.valid,
        )
        if (first) visible.add(first.key)
    }
    return {
        visible: [...visible],
        priority: compasses
            .flatMap(choices)
            .filter((choice) => !choice.original)
            .map((choice) => choice.key),
    }
}
/** The last newly checked calibration wins parameter export for its compass. */
export function toggleChoice(selection: Selection, key: string, checked: boolean): Selection {
    return {
        visible: checked ? [...selection.visible, key] : selection.visible.filter((value) => value !== key),
        priority: checked
            ? [key, ...selection.priority.filter((value) => value !== key)]
            : selection.priority,
    }
}
/** Resolve a compass export independently of whether its original trace is visible. */
export function selectedChoice(compass: Compass, selection: Selection): Choice | undefined {
    const all = choices(compass)
    for (const key of selection.priority) {
        const choice = all.find((choice) => choice.key === key && !choice.original)
        if (choice && selection.visible.includes(key)) return choice
    }
    return undefined
}
/** Serialize vector groups and scalar parameters using the shared float32 formatter. */
export function parameterText(compass: Compass, params: Calibration): string {
    let text = ''
    for (const group of ['offsets', 'diagonals', 'off_diagonals', 'motor'] as const) {
        for (let i = 0; i < 3; i++)
            text += `${compass.names[group][i]},${param_to_string(params[group][i]!)}\n`
    }
    return (
        text +
        `${compass.names.scale},${param_to_string(params.scale)}\n${compass.names.orientation},${param_to_string(params.orientation)}\n`
    )
}
/** Retain warning bounds and orientation confirmation text before writing a compass. */
export function parameterWarning(compass: Compass, params: Calibration): string {
    let warning = ''
    const ranges = {
        offsets: [-1500, 1500],
        diagonals: [0.8, 1.2],
        off_diagonals: [-0.2, 0.2],
        scale: [0.8, 1.2],
    }
    for (const group of ['offsets', 'diagonals', 'off_diagonals', 'scale'] as const) {
        const names = group === 'scale' ? [compass.names.scale] : compass.names[group]
        const values = group === 'scale' ? [params.scale] : params[group]
        const range = ranges[group]
        values.forEach((value, index) => {
            if (value > range[1]!) warning += `${names[index]} ${value} larger than ${range[1]}\n`
            else if (value < range[0]!) warning += `${names[index]} ${value} less than ${range[0]}\n`
        })
    }
    if (warning) warning = `MAG ${compass.index + 1} params outside typical range:\n${warning}`
    if (compass.params.orientation != params.orientation) {
        if (warning) warning += '\n'
        warning += `MAG ${compass.index + 1} orientation (${compass.names.orientation}) changed from ${get_rotation_name(compass.params.orientation)} to ${get_rotation_name(params.orientation)}\n`
    }
    return warning
}
/** Build the exact legacy download and summary, rejecting mixed motor sources.
 * Confirmation is injected so cancellation skips just that compass, as before.
 */
export function exportParameters(
    compasses: Compass[],
    selection: Selection,
    use: readonly number[],
    confirm: (message: string) => boolean,
): { text: string; message: string } {
    let text = '',
        type = 0,
        message = 'Saved:\n'
    for (const compass of compasses) {
        const choice = selectedChoice(compass, selection)
        if (!choice) continue
        const params = choice.result.params
        const warning = parameterWarning(compass, params)
        if (warning && !confirm(warning)) continue
        if (!array_all_equal(params.motor, 0)) {
            if (type == 0) type = params.fit_type
            else if (params.fit_type != 0 && type != params.fit_type)
                throw new Error(
                    'All compasses must use the same motor fit type, current and throttle compensation cannot be used together',
                )
        }
        text += parameterText(compass, params)
        const option = use[compass.index] ?? 0
        if (option != 0) text += `${compass.names.use},${option == 1 ? 1 : 0}\n`
        message += `\tCompass ${compass.index + 1}: ${choice.name.replace('<br>', ', ')}\n`
    }
    if (!text) throw new Error('No parameters to save')
    return { text: text + `COMPASS_MOTCT,${param_to_string(type)}\n`, message }
}
