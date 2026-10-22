import type { DataflashLog, Message } from '@webtools/dataflash'
import { get_param_download_text } from '@webtools/parameters'
import type { Parameters } from './report.ts'

export interface ParameterChange { time: number; value: number }
export interface LogParameters {
    params: Parameters
    defaults: Parameters
    /** Includes STAT_ values for parity; the view omits those automatic changes. */
    changes: Record<string, ParameterChange[]>
}
export interface ExtractedDownload {
    name: string
    text: string
    incomplete: boolean
}
export interface WaypointGroup {
    title: 'Mission' | 'Polygon fence' | 'Rally points'
    downloads: ExtractedDownload[]
}
export interface EmbeddedFile { name: string; contents: Uint8Array; crashDump: boolean }
interface Waypoint {
    command_total: number; sequence: number; command: number
    param1: number; param2: number; param3: number; param4: number
    latitude: number; longitude: number; altitude: number; frame: number
}
interface Mission { total: number; items: (Waypoint | undefined)[] }

/** Read a numeric parser column without converting units or integer precision. */
function numbers(message: Message, name: string): Float64Array {
    const field = message[name]
    if (!(field instanceof Float64Array)) throw new TypeError(`Missing numeric field ${name}`)
    return field
}

/** Collect last logged values, last finite-or-infinite defaults and exact change times.
 * Repeated identical observations advance the original timestamp, as in legacy.
 * NaN defaults are ignored; NaN parameter observations still count as changes.
 */
export function extractLogParameters(log: DataflashLog): LogParameters {
    const message = log.get('PARM')
    if (!message) throw new Error('No parameter values found in log')
    const names = message.Name
    if (!Array.isArray(names) || names.some(name => typeof name !== 'string')) throw new TypeError('Missing parameter names')
    const values = numbers(message, 'Value')
    const times = numbers(message, 'TimeUS')
    const defaultValues = 'Default' in message ? numbers(message, 'Default') : undefined
    const params: Record<string, number> = {}, defaults: Record<string, number> = {}, changes: LogParameters['changes'] = {}
    const previousTimes: Record<string, number> = {}
    for (let i = 0; i < names.length; i++) {
        const name = names[i] as string
        const value = values[i]!, time = times[i]! * 0.000001
        if (name in params && params[name] !== value) {
            const history = changes[name] ??= [{ time: previousTimes[name]!, value: params[name]! }]
            history.push({ time, value })
        }
        params[name] = value
        previousTimes[name] = time
        const defaultValue = defaultValues?.[i]
        if (defaultValue !== undefined && !Number.isNaN(defaultValue)) defaults[name] = defaultValue
    }
    return { params, defaults, changes }
}

/** Filter defaults with legacy equality, retaining parameters without a known default. */
export function changedParameters(params: Parameters, defaults: Parameters): Parameters {
    return Object.fromEntries(Object.entries(params).filter(([name, value]) => !(name in defaults) || value !== defaults[name]))
}

/** Serialize changed parameters through the shared float32-compatible formatter. */
export function exportChangedParameters(params: Parameters, defaults: Parameters): string {
    return get_param_download_text(changedParameters(params, defaults))
}

/** Compare a repeated slot; unseen slots extend the existing mission instead of splitting it. */
function sameWaypoint(a: Waypoint, b: Waypoint | undefined): boolean {
    return b === undefined || (Object.keys(a) as (keyof Waypoint)[]).every(key => a[key] === b[key])
}

/** Group successive records by total and conflicting slot, preserving sparse sequence numbers. */
function groupMissions(items: readonly Waypoint[]): Mission[] {
    const missions: Mission[] = []
    for (const item of items) {
        let mission = missions.at(-1)
        if (!mission || mission.total !== item.command_total || !sameWaypoint(item, mission.items[item.sequence])) {
            mission = { total: item.command_total, items: [] }
            missions.push(mission)
        }
        mission.items[item.sequence] = item
    }
    return missions
}

/** Serialize QGC WPL bytes exactly, including legacy latitude scaling and sparse-item warnings. */
function serializeMission(mission: Mission, name: string): ExtractedDownload {
    let text = 'QGC WPL 110\n', count = 0
    for (const item of mission.items) {
        if (!item) continue
        count++
        text += [item.sequence, 0, item.frame, item.command,
            item.param1.toFixed(8), item.param2.toFixed(8), item.param3.toFixed(8), item.param4.toFixed(8),
            (item.latitude / 10 ** 7).toFixed(8), (item.longitude / 10 ** 7).toFixed(8), item.altitude.toFixed(6), 1].join('\t') + '\n'
    }
    return { name, text, incomplete: mission.total !== count }
}

/** Read the three independently versioned waypoint streams, preserving unknown-type skips and rally flags. */
export function extractWaypoints(log: DataflashLog): WaypointGroup[] {
    const groups: WaypointGroup[] = []
    for (const [type, title, prefix] of [
        ['CMD', 'Mission', 'waypoints'], ['FNCE', 'Polygon fence', 'fence'], ['RALY', 'Rally points', 'rally'],
    ] as const) {
        if (!(type in log.messageTypes)) continue
        const message = log.get(type)
        if (!message) throw new TypeError(`Missing ${type} message`)
        const total = numbers(message, type === 'CMD' ? 'CTot' : 'Tot')
        /** Access the unchanged numeric row value selected by a protocol field. */
        const value = (name: string, index: number): number => numbers(message, name)[index]!
        const items: Waypoint[] = []
        for (let i = 0; i < total.length; i++) {
            if (type === 'CMD') {
                items.push({ command_total: total[i]!, sequence: value('CNum', i), command: value('CId', i),
                    param1: value('Prm1', i), param2: value('Prm2', i), param3: value('Prm3', i), param4: value('Prm4', i),
                    latitude: value('Lat', i), longitude: value('Lng', i), altitude: value('Alt', i), frame: value('Frame', i) })
                continue
            }
            let command = 5100, param1 = 0, frame = 3, altitude = 0
            if (type === 'FNCE') {
                frame = 0
                switch (value('Type', i)) {
                    case 98: command = 5001; param1 = value('Count', i); break
                    case 97: command = 5002; param1 = value('Count', i); break
                    case 95: command = 5000; break
                    case 93: command = 5004; param1 = value('Radius', i); break
                    case 92: command = 5003; param1 = value('Radius', i); break
                    default: continue
                }
            } else {
                altitude = value('Alt', i)
                if ('Flags' in message) {
                    const flags = value('Flags', i)
                    if ((flags & 4) !== 0) {
                        const altFrame = (flags & 24) >> 3
                        if (altFrame === 2) continue
                        frame = altFrame === 0 ? 0 : altFrame === 3 ? 10 : 3
                    }
                }
            }
            items.push({ command_total: total[i]!, sequence: value('Seq', i) + 1, command, param1,
                param2: 0, param3: 0, param4: 0, latitude: value('Lat', i), longitude: value('Lng', i), altitude, frame })
        }
        groups.push({ title, downloads: groupMissions(items).map((mission, index) => serializeMission(mission, `${prefix}_${index}.txt`)) })
    }
    return groups
}

/** Detach extracted bytes before releasing the upstream FILE buffers; filenames remain unchanged. */
export function extractEmbeddedFiles(log: DataflashLog): EmbeddedFile[] {
    if (!('FILE' in log.messageTypes)) return []
    try {
        log.parseAtOffset('FILE')
        log.processFiles()
        return Object.entries(log.files ?? {}).map(([name, contents]) => ({ name, contents: new Uint8Array(contents), crashDump: name.endsWith('crash_dump.bin') }))
    } finally {
        log.messages.FILE = null
        log.files = null
    }
}
