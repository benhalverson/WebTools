import type { DataflashLog } from '@webtools/dataflash'
import { Duration, DateTime } from 'luxon'

/** Select timestamp offsets by physical message position, exactly as the legacy reader does. */
export function timestampBounds(log: DataflashLog): { first: number | undefined; last: number | undefined } {
    let first: number | undefined, last: number | undefined
    for (const message of log.FMT) {
        if (!message) continue
        const index = message.Columns.indexOf('TimeUS')
        if (index === -1 || message.Format.charAt(index) !== 'Q') continue
        const valueOffset = message.FormatOffset[index]
        if (valueOffset === undefined) continue
        for (const offsets of message.InstancesOffsetArray ? Object.values(message.InstancesOffsetArray) : [message.OffsetArray]) {
            const start = offsets[0], end = offsets.at(-1)
            if (start === undefined || end === undefined) continue
            const startOffset = start + valueOffset, endOffset = end + valueOffset
            if (first === undefined || startOffset < first) first = startOffset
            if (last === undefined || endOffset > last) last = endOffset
        }
    }
    return { first, last }
}

/** Align the first recorded timestamp with the start of the video, preserving microsecond precision. */
export function defaultOffset(log: DataflashLog): number {
    const { first } = timestampBounds(log)
    if (first === undefined) return 0
    log.offset = first
    return -log.parse_type('Q') / 1_000_000
}

/** Return the physical first-to-last timestamp duration; do not substitute extrema of timestamp values. */
export function logDurationUS(log: DataflashLog): number | undefined {
    const { first, last } = timestampBounds(log)
    if (first === undefined || last === undefined) return undefined
    log.offset = first
    const start = log.parse_type('Q')
    log.offset = last
    return log.parse_type('Q') - start
}

/** Preserve the existing synchronization sign and seconds interpretation. */
export function logTime(videoTime: number, offset: number): number { return videoTime - offset }

/** Match the preview's minutes/seconds display without rounding subsecond scrubs. */
export function formatTime(time: number): string { return `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}` }

/** Retain the legacy STAT_FLTTIME first/last interpretation and unknown/zero sentinels. */
export function flightTime(log: DataflashLog): string {
    if (!log.messageTypes.PARM) return 'Unknown'
    const parameters = log.get('PARM')
    const names = parameters?.Name, values = parameters?.Value
    if (!Array.isArray(names) || !(values instanceof Float64Array)) return 'Unknown'
    let start: number | undefined, end: number | undefined
    for (let index = 0; index < names.length; index++) {
        if (names[index] !== 'STAT_FLTTIME') continue
        start ??= values[index]; end = values[index]
    }
    if (start === undefined || end === undefined) return 'Unknown'
    return end === start ? '-' : Duration.fromMillis((end - start) * 1000).rescale().toHuman({ listStyle: 'narrow', unitDisplay: 'short' })
}

/** Produce the retained local-time date, flight-time and rounded duration labels. */
export function logInformation(log: DataflashLog): { date: string; flight: string; duration: string } {
    const date = log.extractStartTime(), duration = logDurationUS(log)
    return { date: DateTime.fromJSDate(date ?? new Date(NaN)).toFormat('dd/MM/yyyy hh:mm:ss a'), flight: flightTime(log), duration: duration === undefined ? '' : Duration.fromMillis(Math.round(duration / 1_000_000) * 1000).rescale().toHuman({ listStyle: 'narrow', unitDisplay: 'short' }) }
}
