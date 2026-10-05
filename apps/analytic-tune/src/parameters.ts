import { find_parameter_metadata, is_parameter_metadata, param_to_string } from "@webtools/parameters"

export type Vehicle = "ArduCopter" | "ArduPlane_VTOL" | "ArduPlane_FW"
export type Axis = "Roll" | "Pitch" | "Yaw"
export type Parameters = Record<string, string>

// Original input order controls serialized export order.
export const parameterDefinitions: readonly { name: string; value: string; group: string }[] = [
    {
        "name": "GyroSampleRate",
        "value": "2000",
        "group": ""
    },
    {
        "name": "INS_GYRO_FILTER",
        "value": "20.0",
        "group": ""
    },
    {
        "name": "INS_HNTCH_ENABLE",
        "value": "1",
        "group": ""
    },
    {
        "name": "INS_HNTCH_MODE",
        "value": "1",
        "group": ""
    },
    {
        "name": "INS_HNTCH_FREQ",
        "value": "150",
        "group": ""
    },
    {
        "name": "INS_HNTCH_BW",
        "value": "75",
        "group": ""
    },
    {
        "name": "INS_HNTCH_ATT",
        "value": "40",
        "group": ""
    },
    {
        "name": "INS_HNTCH_REF",
        "value": "0.29",
        "group": ""
    },
    {
        "name": "INS_HNTCH_FM_RAT",
        "value": "0",
        "group": ""
    },
    {
        "name": "INS_HNTCH_HMNCS",
        "value": "3",
        "group": ""
    },
    {
        "name": "INS_HNTCH_OPTS",
        "value": "0",
        "group": ""
    },
    {
        "name": "INS_HNTC2_ENABLE",
        "value": "0",
        "group": ""
    },
    {
        "name": "INS_HNTC2_MODE",
        "value": "0",
        "group": ""
    },
    {
        "name": "INS_HNTC2_FREQ",
        "value": "0",
        "group": ""
    },
    {
        "name": "INS_HNTC2_BW",
        "value": "0",
        "group": ""
    },
    {
        "name": "INS_HNTC2_ATT",
        "value": "0",
        "group": ""
    },
    {
        "name": "INS_HNTC2_REF",
        "value": "0",
        "group": ""
    },
    {
        "name": "INS_HNTC2_FM_RAT",
        "value": "0",
        "group": ""
    },
    {
        "name": "INS_HNTC2_HMNCS",
        "value": "0",
        "group": ""
    },
    {
        "name": "INS_HNTC2_OPTS",
        "value": "0",
        "group": ""
    },
    {
        "name": "SCHED_LOOP_RATE",
        "value": "400",
        "group": ""
    },
    {
        "name": "ATC_INPUT_TC",
        "value": "0.15",
        "group": "RollPitchTC"
    },
    {
        "name": "Q_A_INPUT_TC",
        "value": "0.15",
        "group": "QRollPitchTC"
    },
    {
        "name": "PILOT_Y_RATE_TC",
        "value": "0.0",
        "group": "YawTC"
    },
    {
        "name": "Q_PLT_Y_RATE_TC",
        "value": "0.0",
        "group": "QYawTC"
    },
    {
        "name": "ATC_ANG_RLL_P",
        "value": "4.5",
        "group": "RollPIDS"
    },
    {
        "name": "ATC_RAT_RLL_FF",
        "value": "0.0",
        "group": "RollPIDS"
    },
    {
        "name": "ATC_RAT_RLL_P",
        "value": "0.288",
        "group": "RollPIDS"
    },
    {
        "name": "ATC_RAT_RLL_I",
        "value": "0.288",
        "group": "RollPIDS"
    },
    {
        "name": "ATC_RAT_RLL_D",
        "value": "0.0117",
        "group": "RollPIDS"
    },
    {
        "name": "ATC_RAT_RLL_D_FF",
        "value": "0.0",
        "group": "RollPIDS"
    },
    {
        "name": "ATC_RAT_RLL_FLTT",
        "value": "1.77",
        "group": "RollPIDS"
    },
    {
        "name": "ATC_RAT_RLL_FLTE",
        "value": "0",
        "group": "RollPIDS"
    },
    {
        "name": "ATC_RAT_RLL_FLTD",
        "value": "20",
        "group": "RollPIDS"
    },
    {
        "name": "Q_A_ANG_RLL_P",
        "value": "4.5",
        "group": "QRollPIDS"
    },
    {
        "name": "Q_A_RAT_RLL_FF",
        "value": "0.0",
        "group": "QRollPIDS"
    },
    {
        "name": "Q_A_RAT_RLL_P",
        "value": "0.288",
        "group": "QRollPIDS"
    },
    {
        "name": "Q_A_RAT_RLL_I",
        "value": "0.288",
        "group": "QRollPIDS"
    },
    {
        "name": "Q_A_RAT_RLL_D",
        "value": "0.0117",
        "group": "QRollPIDS"
    },
    {
        "name": "Q_A_RAT_RLL_D_FF",
        "value": "0.0",
        "group": "QRollPIDS"
    },
    {
        "name": "Q_A_RAT_RLL_FLTT",
        "value": "1.77",
        "group": "QRollPIDS"
    },
    {
        "name": "Q_A_RAT_RLL_FLTE",
        "value": "0",
        "group": "QRollPIDS"
    },
    {
        "name": "Q_A_RAT_RLL_FLTD",
        "value": "20",
        "group": "QRollPIDS"
    },
    {
        "name": "RLL2SRV_TCONST",
        "value": "0.25",
        "group": "FWRollPIDS"
    },
    {
        "name": "RLL_RATE_FF",
        "value": "0.0",
        "group": "FWRollPIDS"
    },
    {
        "name": "RLL_RATE_P",
        "value": "0.288",
        "group": "FWRollPIDS"
    },
    {
        "name": "RLL_RATE_I",
        "value": "0.288",
        "group": "FWRollPIDS"
    },
    {
        "name": "RLL_RATE_D",
        "value": "0.0117",
        "group": "FWRollPIDS"
    },
    {
        "name": "RLL_RATE_D_FF",
        "value": "0.0",
        "group": "FWRollPIDS"
    },
    {
        "name": "RLL_RATE_FLTT",
        "value": "1.77",
        "group": "FWRollPIDS"
    },
    {
        "name": "RLL_RATE_FLTE",
        "value": "0",
        "group": "FWRollPIDS"
    },
    {
        "name": "RLL_RATE_FLTD",
        "value": "20",
        "group": "FWRollPIDS"
    },
    {
        "name": "ATC_ANG_PIT_P",
        "value": "4.5",
        "group": "PitchPIDS"
    },
    {
        "name": "ATC_RAT_PIT_FF",
        "value": "0.0",
        "group": "PitchPIDS"
    },
    {
        "name": "ATC_RAT_PIT_P",
        "value": "0.288",
        "group": "PitchPIDS"
    },
    {
        "name": "ATC_RAT_PIT_I",
        "value": "0.288",
        "group": "PitchPIDS"
    },
    {
        "name": "ATC_RAT_PIT_D",
        "value": "0.0117",
        "group": "PitchPIDS"
    },
    {
        "name": "ATC_RAT_PIT_D_FF",
        "value": "0.0",
        "group": "PitchPIDS"
    },
    {
        "name": "ATC_RAT_PIT_FLTT",
        "value": "1.77",
        "group": "PitchPIDS"
    },
    {
        "name": "ATC_RAT_PIT_FLTE",
        "value": "0",
        "group": "PitchPIDS"
    },
    {
        "name": "ATC_RAT_PIT_FLTD",
        "value": "20",
        "group": "PitchPIDS"
    },
    {
        "name": "Q_A_ANG_PIT_P",
        "value": "4.5",
        "group": "QPitchPIDS"
    },
    {
        "name": "Q_A_RAT_PIT_FF",
        "value": "0.0",
        "group": "QPitchPIDS"
    },
    {
        "name": "Q_A_RAT_PIT_P",
        "value": "0.288",
        "group": "QPitchPIDS"
    },
    {
        "name": "Q_A_RAT_PIT_I",
        "value": "0.288",
        "group": "QPitchPIDS"
    },
    {
        "name": "Q_A_RAT_PIT_D",
        "value": "0.0117",
        "group": "QPitchPIDS"
    },
    {
        "name": "Q_A_RAT_PIT_D_FF",
        "value": "0.0",
        "group": "QPitchPIDS"
    },
    {
        "name": "Q_A_RAT_PIT_FLTT",
        "value": "1.77",
        "group": "QPitchPIDS"
    },
    {
        "name": "Q_A_RAT_PIT_FLTE",
        "value": "0",
        "group": "QPitchPIDS"
    },
    {
        "name": "Q_A_RAT_PIT_FLTD",
        "value": "20",
        "group": "QPitchPIDS"
    },
    {
        "name": "PTCH2SRV_TCONST",
        "value": "0.5",
        "group": "FWPitchPIDS"
    },
    {
        "name": "PTCH_RATE_FF",
        "value": "0.0",
        "group": "FWPitchPIDS"
    },
    {
        "name": "PTCH_RATE_P",
        "value": "0.288",
        "group": "FWPitchPIDS"
    },
    {
        "name": "PTCH_RATE_I",
        "value": "0.288",
        "group": "FWPitchPIDS"
    },
    {
        "name": "PTCH_RATE_D",
        "value": "0.0117",
        "group": "FWPitchPIDS"
    },
    {
        "name": "PTCH_RATE_D_FF",
        "value": "0.0",
        "group": "FWPitchPIDS"
    },
    {
        "name": "PTCH_RATE_FLTT",
        "value": "1.77",
        "group": "FWPitchPIDS"
    },
    {
        "name": "PTCH_RATE_FLTE",
        "value": "0",
        "group": "FWPitchPIDS"
    },
    {
        "name": "PTCH_RATE_FLTD",
        "value": "20",
        "group": "FWPitchPIDS"
    },
    {
        "name": "ATC_ANG_YAW_P",
        "value": "4.5",
        "group": "YawPIDS"
    },
    {
        "name": "ATC_RAT_YAW_FF",
        "value": "0.0",
        "group": "YawPIDS"
    },
    {
        "name": "ATC_RAT_YAW_P",
        "value": "0.288",
        "group": "YawPIDS"
    },
    {
        "name": "ATC_RAT_YAW_I",
        "value": "0.288",
        "group": "YawPIDS"
    },
    {
        "name": "ATC_RAT_YAW_D",
        "value": "0.0117",
        "group": "YawPIDS"
    },
    {
        "name": "ATC_RAT_YAW_D_FF",
        "value": "0.0",
        "group": "YawPIDS"
    },
    {
        "name": "ATC_RAT_YAW_FLTT",
        "value": "1.77",
        "group": "YawPIDS"
    },
    {
        "name": "ATC_RAT_YAW_FLTE",
        "value": "0",
        "group": "YawPIDS"
    },
    {
        "name": "ATC_RAT_YAW_FLTD",
        "value": "20",
        "group": "YawPIDS"
    },
    {
        "name": "Q_A_ANG_YAW_P",
        "value": "4.5",
        "group": "QYawPIDS"
    },
    {
        "name": "Q_A_RAT_YAW_FF",
        "value": "0.0",
        "group": "QYawPIDS"
    },
    {
        "name": "Q_A_RAT_YAW_P",
        "value": "0.288",
        "group": "QYawPIDS"
    },
    {
        "name": "Q_A_RAT_YAW_I",
        "value": "0.288",
        "group": "QYawPIDS"
    },
    {
        "name": "Q_A_RAT_YAW_D",
        "value": "0.0117",
        "group": "QYawPIDS"
    },
    {
        "name": "Q_A_RAT_YAW_D_FF",
        "value": "0.0",
        "group": "QYawPIDS"
    },
    {
        "name": "Q_A_RAT_YAW_FLTT",
        "value": "1.77",
        "group": "QYawPIDS"
    },
    {
        "name": "Q_A_RAT_YAW_FLTE",
        "value": "0",
        "group": "QYawPIDS"
    },
    {
        "name": "Q_A_RAT_YAW_FLTD",
        "value": "20",
        "group": "QYawPIDS"
    },
    {
        "name": "ATC_RAT_RLL_NTF",
        "value": "0",
        "group": "RollNOTCH"
    },
    {
        "name": "ATC_RAT_RLL_NEF",
        "value": "0",
        "group": "RollNOTCH"
    },
    {
        "name": "Q_A_RAT_RLL_NTF",
        "value": "0",
        "group": "QRollNOTCH"
    },
    {
        "name": "Q_A_RAT_RLL_NEF",
        "value": "0",
        "group": "QRollNOTCH"
    },
    {
        "name": "RLL_RATE_NTF",
        "value": "0",
        "group": "FWRollNOTCH"
    },
    {
        "name": "RLL_RATE_NEF",
        "value": "0",
        "group": "FWRollNOTCH"
    },
    {
        "name": "ATC_RAT_PIT_NTF",
        "value": "0",
        "group": "PitchNOTCH"
    },
    {
        "name": "ATC_RAT_PIT_NEF",
        "value": "0",
        "group": "PitchNOTCH"
    },
    {
        "name": "Q_A_RAT_PIT_NTF",
        "value": "0",
        "group": "QPitchNOTCH"
    },
    {
        "name": "Q_A_RAT_PIT_NEF",
        "value": "0",
        "group": "QPitchNOTCH"
    },
    {
        "name": "PTCH_RATE_NTF",
        "value": "0",
        "group": "FWPitchNOTCH"
    },
    {
        "name": "PTCH_RATE_NEF",
        "value": "0",
        "group": "FWPitchNOTCH"
    },
    {
        "name": "ATC_RAT_YAW_NTF",
        "value": "0",
        "group": "YawNOTCH"
    },
    {
        "name": "ATC_RAT_YAW_NEF",
        "value": "0",
        "group": "YawNOTCH"
    },
    {
        "name": "Q_A_RAT_YAW_NTF",
        "value": "0",
        "group": "QYawNOTCH"
    },
    {
        "name": "Q_A_RAT_YAW_NEF",
        "value": "0",
        "group": "QYawNOTCH"
    },
    {
        "name": "YAW_RATE_NTF",
        "value": "0",
        "group": "FWYawNOTCH"
    },
    {
        "name": "YAW_RATE_NEF",
        "value": "0",
        "group": "FWYawNOTCH"
    },
    {
        "name": "FILT1_TYPE",
        "value": "0",
        "group": "FILT1"
    },
    {
        "name": "FILT1_NOTCH_FREQ",
        "value": "0",
        "group": "FILT1"
    },
    {
        "name": "FILT1_NOTCH_Q",
        "value": "2",
        "group": "FILT1"
    },
    {
        "name": "FILT1_NOTCH_ATT",
        "value": "40",
        "group": "FILT1"
    },
    {
        "name": "FILT2_TYPE",
        "value": "0",
        "group": "FILT2"
    },
    {
        "name": "FILT2_NOTCH_FREQ",
        "value": "0",
        "group": "FILT2"
    },
    {
        "name": "FILT2_NOTCH_Q",
        "value": "2",
        "group": "FILT2"
    },
    {
        "name": "FILT2_NOTCH_ATT",
        "value": "40",
        "group": "FILT2"
    },
    {
        "name": "FILT3_TYPE",
        "value": "0",
        "group": "FILT3"
    },
    {
        "name": "FILT3_NOTCH_FREQ",
        "value": "0",
        "group": "FILT3"
    },
    {
        "name": "FILT3_NOTCH_Q",
        "value": "2",
        "group": "FILT3"
    },
    {
        "name": "FILT3_NOTCH_ATT",
        "value": "40",
        "group": "FILT3"
    },
    {
        "name": "FILT4_TYPE",
        "value": "0",
        "group": "FILT4"
    },
    {
        "name": "FILT4_NOTCH_FREQ",
        "value": "0",
        "group": "FILT4"
    },
    {
        "name": "FILT4_NOTCH_Q",
        "value": "2",
        "group": "FILT4"
    },
    {
        "name": "FILT4_NOTCH_ATT",
        "value": "40",
        "group": "FILT4"
    },
    {
        "name": "FILT5_TYPE",
        "value": "0",
        "group": "FILT5"
    },
    {
        "name": "FILT5_NOTCH_FREQ",
        "value": "0",
        "group": "FILT5"
    },
    {
        "name": "FILT5_NOTCH_Q",
        "value": "2",
        "group": "FILT5"
    },
    {
        "name": "FILT5_NOTCH_ATT",
        "value": "40",
        "group": "FILT5"
    },
    {
        "name": "FILT6_TYPE",
        "value": "0",
        "group": "FILT6"
    },
    {
        "name": "FILT6_NOTCH_FREQ",
        "value": "0",
        "group": "FILT6"
    },
    {
        "name": "FILT6_NOTCH_Q",
        "value": "2",
        "group": "FILT6"
    },
    {
        "name": "FILT6_NOTCH_ATT",
        "value": "40",
        "group": "FILT6"
    },
    {
        "name": "FILT7_TYPE",
        "value": "0",
        "group": "FILT7"
    },
    {
        "name": "FILT7_NOTCH_FREQ",
        "value": "0",
        "group": "FILT7"
    },
    {
        "name": "FILT7_NOTCH_Q",
        "value": "2",
        "group": "FILT7"
    },
    {
        "name": "FILT7_NOTCH_ATT",
        "value": "40",
        "group": "FILT7"
    },
    {
        "name": "FILT8_TYPE",
        "value": "0",
        "group": "FILT8"
    },
    {
        "name": "FILT8_NOTCH_FREQ",
        "value": "0",
        "group": "FILT8"
    },
    {
        "name": "FILT8_NOTCH_Q",
        "value": "2",
        "group": "FILT8"
    },
    {
        "name": "FILT8_NOTCH_ATT",
        "value": "40",
        "group": "FILT8"
    },
    {
        "name": "Throttle",
        "value": "0.3",
        "group": ""
    },
    {
        "name": "NUM_MOTORS",
        "value": "1",
        "group": ""
    },
    {
        "name": "ESC_RPM",
        "value": "2500",
        "group": ""
    },
    {
        "name": "RPM1",
        "value": "2500",
        "group": ""
    },
    {
        "name": "RPM2",
        "value": "2500",
        "group": ""
    }
]

/** Resolve the legacy vehicle and axis parameter namespaces. */
export function parameterPrefixes(vehicle: Vehicle, axis: Axis) {
    const vehicleAtcPrefix = vehicle === 'ArduCopter' ? 'ATC_' : vehicle === 'ArduPlane_VTOL' ? 'Q_A_' : ''
    const vehiclePltPrefix = vehicle === 'ArduCopter' ? 'PILOT_' : vehicle === 'ArduPlane_VTOL' ? 'Q_PLT_' : ''
    const axisPrefix = axis === 'Roll' ? 'RLL' : axis === 'Yaw' ? 'YAW' : vehicle === 'ArduPlane_FW' ? 'PTCH' : 'PIT'
    return { vehicleAtcPrefix, vehiclePltPrefix, axisPrefix,
        ratePrefix: vehicle === 'ArduPlane_FW' ? `${axisPrefix}_RATE_` : `${vehicleAtcPrefix}RAT_${axisPrefix}_`,
        anglePrefix: vehicle === 'ArduPlane_FW' ? `${axisPrefix}2SRV_` : `${vehicleAtcPrefix}ANG_${axisPrefix}_` }
}

/** Initialize raw inputs, retaining the original case-insensitive query behavior. */
export function initialParameters(href = ''): Parameters {
    const query = new URL(href.toLowerCase(), 'https://local.invalid/').searchParams
    return Object.fromEntries(parameterDefinitions.map(({ name, value }) => {
        const queried = parseFloat(query.get(name.toLowerCase()) ?? '')
        return [name, Number.isNaN(queried) ? value : String(queried)]
    }))
}

/** Apply recognized parameter lines, preserving spelling, separators and raw values. */
export function importParameters(current: Parameters, text: string): Parameters {
    const next = { ...current }
    for (const line of text.split('\n')) {
        const [name, value] = line.split(/[\s,=\t]+/)
        if (name !== undefined && value !== undefined && Object.hasOwn(next, name)) next[name] = value
    }
    return next
}

/** Serialize inputs followed by metadata selects, exactly as the legacy form does. */
export function exportParameters(values: Parameters, vehicle: Vehicle, axis: Axis, metadata: unknown): string {
    const prefixes = parameterPrefixes(vehicle, axis)
    const nef = controlValue(`${prefixes.ratePrefix}NEF`, values[`${prefixes.ratePrefix}NEF`] ?? '', metadata)
    const ntf = controlValue(`${prefixes.ratePrefix}NTF`, values[`${prefixes.ratePrefix}NTF`] ?? '', metadata)
    /** Metadata enums replace inputs; bitmasks remain numeric inputs. */
    function isSelect(name: string): boolean {
        const entry = metadata == null ? undefined : find_parameter_metadata(metadata, name)
        return name !== 'SCHED_LOOP_RATE' && is_parameter_metadata(entry) && Boolean(entry.Values) && !entry.Bitmask
    }
    let result = ''
    for (const select of [false, true]) {
        for (const { name } of parameterDefinitions) {
            if (isSelect(name) !== select) continue
            const count = [name.startsWith(prefixes.vehicleAtcPrefix + 'INPUT_') && axis !== 'Yaw',
                name.startsWith(prefixes.vehiclePltPrefix) && axis === 'Yaw', name.startsWith(prefixes.ratePrefix),
                name.startsWith(prefixes.anglePrefix), Number(nef) > 0 && name.startsWith(`FILT${nef}_`),
                Number(ntf) > 0 && nef !== ntf && name.startsWith(`FILT${ntf}_`), name.startsWith('INS_'), name.startsWith('SCHED_')]
                .filter(Boolean).length
            result += `${name},${param_to_string(Number(controlValue(name, values[name] ?? '', metadata)))}\n`.repeat(count)
            // Fixed-wing yaw's empty pilot prefix also matches metadata checkbox IDs.
            const entry = metadata == null ? undefined : find_parameter_metadata(metadata, name)
            if (!select && vehicle === 'ArduPlane_FW' && axis === 'Yaw' && is_parameter_metadata(entry) && entry.Bitmask) {
                if (Object.keys(entry.Bitmask).length) throw new Error('Could not convert on to float string')
            }
        }
    }
    return result
}

/** Match the legacy spinner's power-of-two increments without coercing typed entries. */
export function nextWindowSize(previous: number, entered: number): number {
    const delta = entered - previous
    if (Math.abs(delta) !== 1) return entered
    const exponent = Math.log2(previous)
    return 2 ** (Number.isInteger(exponent) ? exponent + Math.sign(delta) : Math.floor(exponent) + (delta > 0 ? 1 : 0))
}

/** Determine visibility from owned React state, including selected controller notches. */
export function parameterVisible(name: string, group: string, values: Parameters, vehicle: Vehicle, axis: Axis): boolean {
    const { ratePrefix } = parameterPrefixes(vehicle, axis)
    const vehicleGroup = vehicle === 'ArduCopter' ? '' : vehicle === 'ArduPlane_VTOL' ? 'Q' : 'FW'
    if (group.startsWith('FILT')) return [values[ratePrefix + 'NEF'], values[ratePrefix + 'NTF']].some(value => Number(value) > 0 && group === `FILT${value}`)
    if (group) return group === `${vehicleGroup}${axis}PIDS` || group === `${vehicleGroup}${axis}NOTCH`
        || vehicle !== 'ArduPlane_FW' && group === `${vehicleGroup}${axis === 'Yaw' ? 'YawTC' : 'RollPitchTC'}`
    const modes = ['INS_HNTCH_', 'INS_HNTC2_'].filter(prefix => Number(values[prefix + 'ENABLE']) > 0).map(prefix => Math.floor(Number(values[prefix + 'MODE'])))
    if (name === 'Throttle') return modes.includes(1)
    if (name === 'ESC_RPM' || name === 'NUM_MOTORS') return modes.includes(3)
    if (name === 'RPM1' || name === 'RPM2') return modes.includes(2) || modes.includes(5)
    return true
}

/** Apply only the original log-loading whitelist, retaining inactive vehicle gains. */
export function mergeLogParameters(current: Parameters, incoming: Record<string, number>, vehicle: Vehicle): Parameters {
    const next = { ...current }
    const ratePrefixes = (['Roll', 'Pitch', 'Yaw'] as const).map(axis => parameterPrefixes(vehicle, axis).ratePrefix)
    for (const [name, value] of Object.entries(incoming)) {
        if (!Object.hasOwn(next, name)) continue
        if (name === 'SCHED_LOOP_RATE' && !(value > 0)) continue
        if (name.startsWith('INS_HNTC') || name.startsWith('FILT') || ratePrefixes.some(prefix => name.startsWith(prefix))
            || ['INS_GYRO_FILTER', 'ATC_INPUT_TC', 'PILOT_Y_RATE_TC', 'ATC_ANG_RLL_P', 'ATC_ANG_PIT_P', 'ATC_ANG_YAW_P',
                'Q_A_INPUT_TC', 'Q_PLT_Y_RATE_TC', 'Q_A_ANG_RLL_P', 'Q_A_ANG_PIT_P', 'Q_A_ANG_YAW_P',
                'RLL2SRV_TCONST', 'PTCH2SRV_TCONST', 'YAW2SRV_TCONST', 'GyroSampleRate', 'SCHED_LOOP_RATE'].includes(name)) next[name] = String(value)
    }
    return next
}

/** Match native numeric input sanitization and unmatched enum selection. */
export function controlValue(name: string, value: string, metadata: unknown): string {
    const entry = metadata == null ? undefined : find_parameter_metadata(metadata, name)
    if (name !== 'SCHED_LOOP_RATE' && is_parameter_metadata(entry) && entry.Values && !entry.Bitmask) return Object.hasOwn(entry.Values, value) ? value : ''
    return value === '' || /^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value) && Number.isFinite(Number(value)) ? value : ''
}
