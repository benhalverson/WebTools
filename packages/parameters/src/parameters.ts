// Helpers to return parameter values and names

/** Append X, Y, and Z to the prefix in axis order, without inserting separators. */
export function get_param_name_vector3(prefix: string): [string, string, string] {
    return [prefix + "X", prefix + "Y", prefix + "Z"]
}

/**
 * Build the parameter names for a compass instance, including its vector axes.
 * An index numerically equal to one uses unsuffixed names; other indices retain
 * their original spelling as a suffix, including the legacy COMPASS_EXTERN form.
 */
export function get_compass_param_names(index: number | string) {

    let use_name = "COMPASS_USE"
    let offset = "COMPASS_OFS"
    let diagonals = "COMPASS_DIA"
    let off_diagonals = "COMPASS_ODI"
    let motor = "COMPASS_MOT"
    let scale = "COMPASS_SCALE"
    let orient = "COMPASS_ORIENT"
    let external = "COMPASS_EXTERNAL"
    let id = "COMPASS_DEV_ID"

    if (Number(index) != 1) {
        use_name += index
        offset += index
        diagonals += index
        off_diagonals += index
        motor += index
        scale += index
        orient += index
        external = "COMPASS_EXTERN" + index
        id += index
    }

    return { use: use_name,
             offsets: get_param_name_vector3(offset + "_"), 
             diagonals: get_param_name_vector3(diagonals + "_"), 
             off_diagonals: get_param_name_vector3(off_diagonals + "_"), 
             motor: get_param_name_vector3(motor + "_"),
             scale: scale,
             orientation: orient,
             external: external,
             id: id }
}

export interface ParameterLog {
    Name: readonly string[]
    Value: ArrayLike<number | undefined>
}
export interface ParameterChange {
    name: string
    previous: number
    next: number | undefined
    ignored: boolean
    message: string
}
export interface ParameterReadResult {
    value: number | undefined
    changes: ParameterChange[]
}

/**
 * Read matching log entries in order and collect changes without notifications.
 * Missing entries return undefined. Undefined values do not establish a previous
 * value for change detection, preserving the legacy handling of sparse logs.
 * @param allow_change False stops at the first change, retaining the prior value
 * and recording that change as ignored; otherwise the last matching value wins.
 * @returns The selected value and ordered changes with legacy notification text.
 */
export function read_param_value(param_log: ParameterLog, name: string, allow_change?: boolean): ParameterReadResult {
    let value: number | undefined
    const changes: ParameterChange[] = []
    for (let i = 0; i < param_log.Name.length; i++) {
        if (param_log.Name[i] === name) {
            const new_value = param_log.Value[i]
            if ((value != null) && (value != new_value)) {
                const ignored = allow_change === false
                const message = (ignored ? "Ignoring param change " : "") + name + " changed from " + value + " to " + new_value
                changes.push({ name, previous: value, next: new_value, ignored, message })
                if (ignored) return { value, changes }
            }
            value = new_value
        }
    }
    return { value, changes }
}

/**
 * Read the last matching parameter value, or undefined when it is absent.
 * With allow_change false, return the value before the first detected change.
 * This emits no notifications; use read_param_value for the change records.
 */
export function get_param_value(param_log: ParameterLog, name: string, allow_change?: boolean): number | undefined {
    return read_param_value(param_log, name, allow_change).value
}

/**
 * Format a value after float32 rounding using the legacy 7-to-9-digit search.
 * Trailing zeros are omitted, signed zero becomes "0", and infinities retain
 * their JavaScript spelling.
 * @throws When no representation round-trips to the float32 value, including NaN.
 */
export function param_to_string(value: number): string
{
    // Make sure number can be represented by 32 bit float
    const float_val = Math.fround(value)

    const significant_figures = [7,8,9]
    for (const figures of significant_figures) {
        // Convert to a string with the given number of figures
        // This gives the value we want, but with trailing zeros
        const string_val = float_val.toPrecision(figures)

        // Go back to number
        const number_val = Number(string_val)
        if (float_val != Math.fround(number_val)) {
            // Did not get original value, try more digits
            continue
        }

        // Convert number back to string with no trailing zeros
        return number_val.toString()
    }

    throw new Error("Could not convert " + value.toString() + " to float string")
}

/**
 * Serialize own enumerable parameters as naturally sorted name,value lines.
 * Each value uses param_to_string and each line ends with a newline; an empty
 * record produces an empty string. Sorting follows the host's default locale.
 * @throws Propagates formatting errors for values such as NaN.
 */
export function get_param_download_text(params: Readonly<Record<string, number>>): string
{
    // Natural sort to match MAVProxy and Mission Planner param file ordering
    const keys = Object.keys(params).sort((a, b) =>
        a.localeCompare(b, undefined, {numeric: true})
    )

    let text = ""
    for (const key of keys) {
        text += key + "," + param_to_string(params[key]!) + "\n";
    }
    return text
}
