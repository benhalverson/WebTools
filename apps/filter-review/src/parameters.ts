import { parameter_input_value, param_to_string } from '@webtools/parameters'
import type { DataflashLog } from '@webtools/dataflash'
import { numbers, parameter } from './tracking.ts'
import type { FilterSettings, Notch } from './filters.ts'

export type Parameters = Record<string, string>
export const notchFields = { enable: 'ENABLE', mode: 'MODE', freq: 'FREQ', bandwidth: 'BW', attenuation: 'ATT', ref: 'REF', min_ratio: 'FM_RAT', harmonics: 'HMNCS', options: 'OPTS' } as const
export const prefixes = ['INS_HNTCH_', 'INS_HNTC2_'] as const
export const names = ['INS_GYRO_FILTER', 'SCHED_LOOP_RATE', ...prefixes.flatMap(prefix => Object.values(notchFields).map(suffix => prefix + suffix))]

/** Construct the legacy page's initial parameter values in control order. */
export function defaults(): Parameters {
    const notch: Record<string, string> = { FREQ: '80', BW: '40', ATT: '40', HMNCS: '3', MODE: '1', FM_RAT: '1' }
    return Object.fromEntries(names.map(name => [name, name === 'INS_GYRO_FILTER' ? '20.0' : name === 'SCHED_LOOP_RATE' ? '400' : notch[name.replace(/^INS_HNT(?:CH|C2)_/, '')] ?? '0']))
}

/** Decode configured filtering and the logged filter-version hint. */
export function readParameters(log: DataflashLog) {
    const values = defaults()
    for (const name of names) { const value = parameter(log, name); if (value !== undefined) values[name] = String(value) }
    const hint = log.messageTypes.VER?.expressions.includes('FV') ? numbers(log, 'VER', 'FV')[0] : 1
    return { values, version: hint !== undefined && [1, 2, 3, 4].includes(hint) ? hint : 4, bitmaskSize: parameter(log, 'INS_RAW_LOG_OPT') === undefined ? 8 : 32 }
}

/** Apply shared legacy bitmask coercion before constructing a filter. */
export function settings(values: Parameters, version: number, bitmaskSize: number): FilterSettings {
    const notches = prefixes.map(prefix => Object.fromEntries(Object.entries(notchFields).map(([key, suffix]) => [key,
        key === 'harmonics' || key === 'options' ? parameter_input_value(values[prefix + suffix] ?? '', key === 'harmonics' ? bitmaskSize : 32) : Number.parseFloat(values[prefix + suffix] ?? ''),
    ])) as unknown as Notch)
    return { version, lowpass: Number.parseFloat(values.INS_GYRO_FILTER ?? ''), notches }
}

/** Preserve input-before-select export ordering after metadata replacement. */
export function orderedNames(): string[] {
    /** The loop rate remains numeric even though its metadata supplies Values. */
    const select = (name: string) => name.endsWith('_ENABLE') || name.endsWith('_MODE')
    return [...names.filter(name => !select(name)), ...names.filter(select)]
}

/** Export only INS_ controls, using original float32 round-trip formatting. */
export function exportParameters(values: Parameters): string {
    return orderedNames().filter(name => name.startsWith('INS_')).map(name => name + ',' + param_to_string(Number(values[name] ?? '')) + '\n').join('')
}

/** Read the established whitespace/comma/equals parameter file syntax. */
export function importParameters(text: string, previous: Parameters): Parameters {
    const values = { ...previous }
    for (const line of text.split('\n')) {
        const parts = line.split(/[\s,=\t]+/)
        if (parts.length >= 2 && names.includes(parts[0]!)) values[parts[0]!] = parts[1]!
    }
    return values
}

/** Build the existing FilterTool handoff, retaining the legacy exclusive end
 * for tracking means and its deliberate lack of FFT/version query fields. */
export function filterToolUrl(location: string, values: Parameters, rate: number, tracking: import('./tracking.ts').Tracking, range: [number, number]): string {
    const url = new URL(location)
    url.pathname = url.pathname.replace(/FilterReview(?:Preview)?/, 'FilterTool')
    for (const name of orderedNames()) if (name.startsWith('INS_')) url.searchParams.append(name, values[name] ?? '')
    url.searchParams.append('GYRO_SAMPLE_RATE', String(Math.round(rate)))
    for (const [mode, name] of [[1, 'Throttle'], [2, 'RPM1'], [3, 'ESC_RPM'], [5, 'RPM2']] as const) {
        const data = tracking.sources[mode]?.average
        if (!data) continue
        let first = 0, last = 0
        for (let i = 0; i < data.time.length; i++) if (data.time[i]! < range[0]) first = i
        for (let i = 0; i < data.time.length - 1; i++) if (data.time[i]! <= range[1]) last = i + 1
        let sum = 0
        for (let i = first; i < last; i++) sum += data.value[i]!
        url.searchParams.append(name, String(sum / (last - first) * (mode === 3 ? 60 : 1)))
        if (mode === 3) url.searchParams.append('NUM_MOTORS', String(tracking.sources[3]!.instances.length))
    }
    return url.toString()
}
