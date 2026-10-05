import type { DataflashLog } from '@webtools/dataflash'
import { numbers, strings } from './log-fields.ts'
export interface WatchdogReport {
    lines: string[]
    icsr: number
    icsrLines: string[]
    tail: string[]
}
const errorNames = [
    'logging map failure',
    'logging missing structure',
    'logging write missing format',
    'logging  too many deletes',
    'logging bad get file name',
    'panic',
    'logging flush without semaphore',
    'logging bad current block',
    'logging bad block count',
    'logging dequeue failure',
    'Constraining NaN',
    'Watchdog reset',
    'IOMCU reset',
    'IOMCU fail',
    'SPI fail',
    'main loop stuck',
    'gcs bad link',
    'bitmask range',
    'gcs offset',
    'i2c isr',
    'flow of control',
    'sfs recursion',
    'bad rotation',
    'stack overflow',
    'imu reset',
    'gpio isr',
    'mem guard',
    'dma fail',
    'params restored',
    'invalid arguments',
]
/** Decode the legacy signed 32-bit error mask, retaining unknown-bit text. */
function maskNames(value: number): string[] {
    const result: string[] = []
    for (let i = 0; i < 32; i++)
        if ((value & (1 << i)) !== 0) result.push(String(errorNames[i]))
    return result
}
/** Combine PM/MON errors, coalesce counts and preserve legacy delta/line formatting. */
export function internalErrorLines(log: DataflashLog): string[] {
    const errors: {
        time: number
        mask: number
        line: number
        count: number
    }[] = []
    const expressions = log.messageTypes.PM?.expressions ?? []
    const mask = expressions.includes('IntE')
        ? 'IntE'
        : expressions.includes('InE')
          ? 'InE'
          : undefined
    const count = expressions.includes('ErrC')
        ? 'ErrC'
        : expressions.includes('ErC')
          ? 'ErC'
          : undefined
    const sources: [string, string, string, string][] = []
    if (mask && count && expressions.includes('ErrL'))
        sources.push(['PM', mask, 'ErrL', count])
    if (log.messageTypes.MON) sources.push(['MON', 'IErr', 'IErrLn', 'IErrCnt'])
    for (const [type, maskField, lineField, countField] of sources) {
        const message = log.get(type)
        for (const [i, time] of numbers(message, 'TimeUS').entries())
            errors.push({
                time,
                mask: numbers(message, maskField)[i]!,
                line: numbers(message, lineField)[i]!,
                count: numbers(message, countField)[i]!,
            })
    }
    errors.sort((a, b) => a.time - b.time)
    const unique: typeof errors = []
    for (const error of errors) {
        const last = unique.at(-1)
        if (!last || last.mask !== error.mask || last.line !== error.line)
            unique.push({ ...error })
        else if (error.count > last.count) last.count = error.count
    }
    const lines: string[] = []
    for (const [i, error] of unique.entries()) {
        if (error.mask === 0) continue
        const change = i ? error.mask & ~unique[i - 1]!.mask : error.mask
        const delta = error.count - (i ? unique[i - 1]!.count : 0)
        const names = maskNames(change)
        let text = `0x${change.toString(16)}: ${names.join(', ')}`
        if (
            (maskNames(error.mask).length === 0 && names.length === 1) ||
            names.length !== delta
        ) {
            const extra = [
                ...(delta > 1 ? [`${delta} times`] : []),
                ...(error.line > 0 ? [`line ${error.line}`] : []),
            ]
            if (extra.length) text += ` (${extra.join(', ')})`
        } else if (error.line > 0) text += ` (line ${error.line})`
        lines.push(text)
    }
    return lines
}
/** Decode Cortex M4/M7 ICSR exactly, including the legacy signed bit-31 shift. */
function decodeIcsr(icsr: number): string[] {
    const exceptions: Record<number, string> = {
        0: 'Thread mode',
        1: 'Reserved',
        2: 'NMI',
        3: 'Hard fault',
        4: 'Memory management fault',
        5: 'Bus fault',
        6: 'Usage fault',
        7: 'Reserved....',
        10: 'Reserved',
        11: 'SVCall',
        12: 'Reserved for Debug',
        13: 'Reserved',
        14: 'PendSV',
        15: 'SysTick',
    }
    const fields: [
        number,
        number,
        string,
        string | undefined,
        string | undefined,
    ][] = [
        [0, 8, 'VECTACTIVE', undefined, undefined],
        [9, 10, 'RESERVED1', undefined, undefined],
        [
            11,
            11,
            'RETOBASE',
            'no (or no more) active exceptions',
            'preempted active exceptions',
        ],
        [12, 18, 'VECTPENDING', undefined, undefined],
        [19, 21, 'RESERVED2', undefined, undefined],
        [22, 22, 'ISRPENDING', 'Interrupt pending', 'No pending interrupt'],
        [23, 24, 'RESERVED3', undefined, undefined],
        [
            25,
            25,
            'PENDSTCLR',
            'WO clears SysTick exception',
            'WO clears SysTick exception',
        ],
        [26, 26, 'PENDSTSET', 'SysTick pending', 'SysTick not pending'],
        [
            27,
            27,
            'PENDSVCLR',
            'WO clears pendsv exception',
            'WO clears pendsv exception',
        ],
        [28, 28, 'PENDSVSET', 'PendSV pending', 'PendSV not pending'],
        [29, 30, 'RESERVED4', undefined, undefined],
        [31, 31, 'NMIPENDSET', 'NMI pending', 'NMI not pending'],
    ]
    return fields.map(([start, stop, name, on, off]) => {
        let mask = 0
        for (let i = start; i <= stop; i++) mask |= 1 << i
        const value = (icsr & mask) >> start
        const decoded =
            name === 'VECTACTIVE' || name === 'VECTPENDING'
                ? (exceptions[value] ?? `IRQ${value - 16}`)
                : value
                  ? on
                  : off
        return `${name}: 0x${value.toString(16)}${decoded ? `  (${decoded})` : ''}`
    })
}
/** Deduplicate adjacent watchdog dumps and retain legacy fault-code and zero annotations. */
export function watchdogReports(log: DataflashLog): WatchdogReport[] {
    if (!log.messageTypes.WDOG) return []
    const message = log.get('WDOG'),
        reports: WatchdogReport[] = []
    const fields = [
        'Tsk',
        'IE',
        'IEC',
        'IEL',
        'MvMsg',
        'MvCmd',
        'SmLn',
        'FL',
        'FT',
        'FA',
        'FP',
        'ICSR',
        'LR',
    ]
    let previous: (number | string | undefined)[] | undefined
    for (let i = 0; i < numbers(message, 'TimeUS').length; i++) {
        const values = fields.map((field) => numbers(message, field)[i])
        const thread = strings(message, 'TN')[i]
        const identity = [...values, thread]
        if (
            previous &&
            identity.every((value, index) => value === previous![index])
        )
            continue
        previous = identity
        const [
            task,
            mask,
            count,
            line,
            msg,
            cmd,
            semaphore,
            faultLine,
            fault,
            address,
            priority,
            icsr,
            lr,
        ] = values as number[]
        const taskName = (
            {
                '-3': 'Waiting for sample',
                '-1': 'Pre loop',
                '-2': 'Fast loop',
            } as Record<string, string>
        )[String(task)]
        const faultName = (
            { 1: 'Reset', 2: 'NMI', 3: 'HardFault', 4: 'MemManage' } as Record<
                number,
                string
            >
        )[fault!]
        reports.push({
            lines: [
                `Scheduler Task: ${task}${taskName ? ` (${taskName})` : ''}`,
                `Internal Error Mask: ${mask}`,
                `Internal Error Count: ${count}`,
                `Internal Error Line: ${line}`,
                `Last MAVLink Message: ${msg}${msg === 0 ? ' (none)' : ''}`,
                `Last MAVLink Command: ${cmd}${cmd === 0 ? ' (none)' : ''}`,
                `Semaphore Line: ${semaphore}${semaphore === 0 ? ' (not waiting)' : ''}`,
                `Fault Line: ${faultLine}`,
                `Fault Type: ${fault}${faultName ? ` (${faultName})` : ''}`,
                `Fault Address: 0x${address!.toString(16)}`,
                `Fault Thread Priority: ${priority}`,
            ],
            icsr: icsr!,
            icsrLines: decodeIcsr(icsr!),
            tail: [
                `Fault Long Return Address: 0x${lr!.toString(16)}`,
                `Fault Thread name: ${thread}`,
            ],
        })
    }
    return reports
}
