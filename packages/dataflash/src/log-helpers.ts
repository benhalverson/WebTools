import type { DataflashLog } from "./index.js"

interface VersionMessage {
 FWS: string[]; GH?: Float64Array; APJ?: Float64Array; BU?: Float64Array; FV?: Float64Array; Maj?: Float64Array; Min?: Float64Array; Pat?: Float64Array
}
interface TextMessage { Message: string[] }

// Useful functions that are used by multiple tools

// Get firmware version and board details
export function get_version_and_board(log: DataflashLog) {

    let flight_controller: string | undefined
    let board_id: number | undefined
    let fw_string: string | undefined
    let fw_hash: string | undefined
    let os_string: string | undefined
    let build_type: number | undefined
    let filter_version: number | undefined

    const build_types: Record<string, number> = {
        ArduRover:      1,
        ArduCopter:     2,
        ArduPlane:      3,
        AntennaTracker: 4,
        ArduSub:        7,
        Blimp:         12,
    }
    const build_names = Object.fromEntries(
        Object.entries(build_types).map(([name, id]) => [id, name])
    )

    if ('VER' in log.messageTypes) {
        const VER = log.get("VER") as unknown as VersionMessage

        // Assume version does not change, just use first msg
        fw_string = VER.FWS[0]!
        if ("GH" in VER) {
            fw_hash = VER.GH![0]!.toString(16).padStart(8, '0')
        }
        if (("APJ" in VER) && (VER.APJ![0]! != 0)) {
            board_id = VER.APJ![0]!
        }
        if ("BU" in VER) {
            build_type = VER.BU![0]!
        }
        if ("FV" in VER) {
            filter_version = VER.FV![0]!
        }

        if ((build_type != null && build_names[build_type] != null) && !fw_string.startsWith(build_names[build_type]!)) {
            // If the log is from OEM-customized firmware with an
            // AP_CUSTOM_FIRMWARE_STRING, append the base firmware info.
            // This also means it will match how it appears in the MSGs,
            // so os_string and fight_controller will not be returned undefined.
            const { Maj = ['?'], Min = ['?'], Pat = ['?'] } = VER
            fw_string += ` [${build_names[build_type]} V${Maj[0]}.${Min[0]}.${Pat[0]}]`
        }
    }

    if ('MSG' in log.messageTypes) {
        const MSG = log.get("MSG") as unknown as TextMessage
        // Look for firmware string in MSGs, this marks the start of the log start msgs
        // The subsequent messages give more info, this is a bad way of doing it
        const len = MSG.Message.length
        for (let i = 0; i < len - 3; i++) {
            const msg = MSG.Message[i]
            if ((fw_string != null) && (fw_string != msg)) {
                continue
            }
            if (!MSG.Message[i+3]!.startsWith("Param space used:")) {
                // Check we have bracketed the messages we need
                continue
            }
            let types = []
            for (const type of Object.keys(build_types)) {
                types.push("(?:" + type + ")")
            }
            const regex = new RegExp("(" + types.join("|") + ").+\\((.+)\\)", 'g')
            const found = regex.exec(MSG.Message[i]!)
            if (found == null) {
                continue
            }
            if (fw_string == null) {
                fw_string = found[0]
            }
            if (build_type == null) {
                build_type = build_types[found[1]!]
            }
            if (fw_hash == null) {
                fw_hash = found[2]
            }
            os_string = MSG.Message[i+1]
            flight_controller = MSG.Message[i+2]
            break
        }
    }

    return {
        flight_controller,
        board_id,
        fw_string,
        fw_hash,
        os_string,
        build_type,
        filter_version
    }
}

// Take all log and return array of available base message types (no instances)
export function get_base_log_message_types(log: DataflashLog) {
    let all_types = Object.keys(log.messageTypes)
    let base_types = []
    for (const type of all_types) {
        if (/.+\[.+\]/gm.test(type) ) {
            // Discard instance messages
            continue
        }
        base_types.push(type)
    }
    return base_types
}
