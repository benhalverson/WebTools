import { get_version_and_board, type DataflashLog } from '@webtools/dataflash'
import { buildReport, type Parameters, type HardwareReport } from './report.ts'
import { numbers, strings } from './log-fields.ts'
import {
    watchdogReports,
    internalErrorLines,
    type WatchdogReport,
} from './log-errors.ts'

export interface CanNode {
    driver: string
    node: number
    name: string
    version: string
    uid1: number
    uid2: number
    hash: string
}
export interface LogHardwareReport {
    hardware: HardwareReport
    watchdogDetected: boolean
    version: ReturnType<typeof get_version_and_board>
    can: CanNode[]
    watchdogs: WatchdogReport[]
    internalErrors: string[]
    iomcu: string[]
}
/** Collect unique CAN announcements in legacy driver/node order. */
function canNodes(log: DataflashLog): CanNode[] {
    const groups: Record<string, Record<number, CanNode[]>> = {}
    for (const inst of Object.keys(log.messageTypes.CAND?.instances ?? {})) {
        const message = log.get_instance('CAND', inst)
        for (const [i, name] of strings(message, 'Name').entries()) {
            const driver = log.messageTypes.CAND?.expressions.includes('Driver')
                ? String(numbers(message, 'Driver')[i])
                : 'all'
            const entry: CanNode = {
                driver,
                node: parseFloat(inst),
                name,
                version: `${numbers(message, 'Major')[i]}.${numbers(message, 'Minor')[i]}`,
                uid1: numbers(message, 'UID1')[i]!,
                uid2: numbers(message, 'UID2')[i]!,
                hash: numbers(message, 'Version')
                    [i]!.toString(16)
                    .padStart(8, '0'),
            }
            const group = (groups[driver] ??= {})
            const nodes = (group[entry.node] ??= [])
            if (
                !nodes.some(
                    (other) =>
                        other.name === name &&
                        other.version === entry.version &&
                        other.uid1 === entry.uid1 &&
                        other.uid2 === entry.uid2 &&
                        other.hash === entry.hash,
                )
            )
                nodes.push(entry)
        }
    }
    return Object.values(groups).flatMap((group) => Object.values(group).flat())
}
const gpsTypes: Record<number, string> = {
    0: 'None',
    1: 'AUTO',
    2: 'uBlox',
    5: 'NMEA',
    6: 'SiRF',
    7: 'HIL',
    8: 'SwiftNav',
    9: 'DroneCAN',
    10: 'SBF',
    11: 'GSOF',
    13: 'ERB',
    14: 'MAV',
    15: 'NOVA',
    16: 'HemisphereNMEA',
    17: 'uBlox-MovingBaseline-Base',
    18: 'uBlox-MovingBaseline-Rover',
    19: 'MSP',
    20: 'AllyStar',
    21: 'ExternalAHRS',
    22: 'DroneCAN-MovingBaseline-Base',
    23: 'DroneCAN-MovingBaseline-Rover',
    24: 'UnicoreNMEA',
    25: 'UnicoreMovingBaselineNMEA',
    26: 'SBF-DualAntenna',
}
/** Add log health to parameter devices, preserving the legacy swapped IMU health labels. */
function sensorHealth(
    hardware: HardwareReport,
    log: DataflashLog,
    can: CanNode[],
    params: Parameters,
): void {
    for (const section of hardware.sections) {
        const type = (
            {
                INS: 'IMU',
                COMPASS: 'MAG',
                BARO: 'BARO',
                ARSPD: 'ARSP',
            } as Record<string, string>
        )[section.id]
        for (const device of section.devices) {
            const index = Number(device.title.split(' ').at(-1)) - 1
            const instance = String(index)
            if (type && instance in (log.messageTypes[type]?.instances ?? {})) {
                const message = log.get_instance(type, instance)
                const fields: [string, string][] =
                    type === 'IMU'
                        ? [
                              ['Accel health', 'GH'],
                              ['Gyro health', 'AH'],
                          ]
                        : type === 'MAG'
                          ? device.lines.length > 1
                              ? [['Health', 'Health']]
                              : []
                          : type === 'BARO'
                            ? log.messageTypes.BARO?.expressions.includes(
                                  'Health',
                              )
                                ? [['Health', 'Health']]
                                : log.messageTypes.BARO?.expressions.includes(
                                        'H',
                                    )
                                  ? [['Health', 'H']]
                                  : []
                            : [['Health', 'H']]
                for (const [label, field] of fields) {
                    if (device.breaksAfter)
                        device.breaksAfter[device.lines.length - 1] = 1
                    device.lines.push(
                        `${label}: ${numbers(message, field).every((value) => value === 1) ? '✅' : '❌'}`,
                    )
                    device.breaksAfter?.push(0)
                }
            }
            for (let i = device.lines.length - 1; i >= 0; i--) {
                const match = device.lines[i]!.match(
                    /bus: (\d+) node id: (\d+)/,
                )
                if (!match) continue
                const node =
                    can.find(
                        (item) =>
                            item.driver === match[1] &&
                            item.node === Number(match[2]),
                    ) ??
                    can.find(
                        (item) =>
                            item.driver === 'all' &&
                            item.node === Number(match[2]),
                    )
                if (node) {
                    device.lines.splice(i + 1, 0, `Name: ${node.name}`)
                    device.breaksAfter?.splice(
                        i,
                        1,
                        1,
                        i === device.lines.length - 2 ? 0 : 1,
                    )
                }
            }
        }
    }
    const devices = []
    const messages = log.messageTypes.MSG
        ? strings(log.get('MSG'), 'Message')
        : []
    for (let i = 1; i <= 2; i++) {
        const old = `GPS_TYPE${i === 1 ? '' : i}`
        const legacy = old in params
        const type = params[legacy ? old : `GPS${i}_TYPE`]
        if (type == null || type === 0) continue
        let name: string | undefined
        for (const message of messages)
            if (
                message.startsWith('GPS') &&
                Number(message.match(/(?<=GPS\s)(\d+)/)?.[0]) === i
            )
                name = message.match(/(?<=as\s)(\S+)/i)?.[0] ?? name
        if (name == null) continue
        const lines = gpsTypes[type]
            ? [`Type ${type}: ${gpsTypes[type]}`, name]
            : [name]
        if ([9, 22, 23].includes(type)) {
            const nodeId =
                params[legacy ? `GPS_CAN_NODEID${i}` : `GPS${i}_CAN_NODEID`]
            const nodes = can.filter((node) => node.node === nodeId)
            const drivers = new Set(nodes.map((node) => node.driver))
            if (drivers.size === 1 && nodes[0])
                lines.push(`Name: ${nodes[0].name}`)
        }
        devices.push({
            title: `GPS ${i}`,
            lines,
            breaksAfter: lines.map(() => 1),
        })
    }
    if (devices.length) {
        const airspeed = hardware.sections.findIndex(
            (section) => section.id === 'ARSPD',
        )
        hardware.sections.splice(
            airspeed < 0 ? hardware.sections.length : airspeed,
            0,
            { id: 'GPS', title: 'GPS', devices },
        )
    }
}
/** Derive report metadata and health from one parser instance with no retained global state. */
export function buildLogReport(
    log: DataflashLog,
    params: Parameters,
): LogHardwareReport {
    const hardware = buildReport(params),
        can = canNodes(log)
    sensorHealth(hardware, log, can, params)
    const iomcu: string[] = []
    if (log.messageTypes.IOMC) {
        const message = log.get('IOMC')
        for (const [field, label] of [
            ['RSErr', 'Status read errors'],
            ['Nerr', 'Flight Controller errors'],
            ['Nerr2', 'IOMCU errors'],
            ['NDel', 'Delayed packets'],
        ]) {
            if (field === 'RSErr' && !message?.RSErr) continue
            const value = numbers(message, field!).reduce(
                (max, item) => Math.max(max, item),
                -Infinity,
            )
            iomcu.push(`${label}: ${value} ${value === 0 ? '✅' : '❌'}`)
        }
    }
    return {
        hardware,
        can,
        watchdogDetected: 'WDOG' in log.messageTypes,
        version: get_version_and_board(log),
        watchdogs: watchdogReports(log),
        internalErrors: internalErrorLines(log),
        iomcu,
    }
}
