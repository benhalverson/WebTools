// Helpers to return parameter values and names

// Helper for Vector3 param names
export function get_param_name_vector3(prefix: string): [string, string, string] {
    return [prefix + "X", prefix + "Y", prefix + "Z"]
}

// Get Compass params names for given index
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

/** Pure counterpart of get_param_value; consumers own alerts/logging. */
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

/** Value-only convenience API; use read_param_value for notification details. */
export function get_param_value(param_log: ParameterLog, name: string, allow_change?: boolean): number | undefined {
    return read_param_value(param_log, name, allow_change).value
}

// Return a string for a given param value
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

// Return formatted text for param download
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
