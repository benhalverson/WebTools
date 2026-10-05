import { find_parameter_metadata, is_parameter_metadata, param_to_string } from '@webtools/parameters'
import defaults from './defaults.json' with { type: 'json' }
import metadata from '../../../FilterTool/params.json' with { type: 'json' }
import controls from './graph-controls.json' with { type: 'json' }
import type { Parameters } from './model.ts'
export { defaults, metadata, controls }
export const numericNames = Object.keys(defaults).filter(name => !controls.some(control => control.name === name))

/** Identify the metadata-replaced select inputs; legacy URL restore skips these. */
export function isSelect(name: string): boolean {
    const entry = find_parameter_metadata(metadata, name)
    return name !== 'SCHED_LOOP_RATE' && is_parameter_metadata(entry) && !!entry.Values && !entry.Bitmask
}

/** Normalize imported numeric/enum text as the legacy DOM input assignment does. */
function assign(name: string, text: string): string {
    if (isSelect(name)) {
        const entry = find_parameter_metadata(metadata, name)
        return is_parameter_metadata(entry) && entry.Values && Object.hasOwn(entry.Values, text) ? text : ''
    }
    return  /^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(text) && Number.isFinite(Number(text)) ? text : ''
}

/** Restore query state in preference to cookies, retaining select omission and case folding. */
export function initialState(href: string, cookies: string): Parameters {
    const result: Record<string, string> = { ...defaults }
    const query = href.includes('?') ? new URL(href.toLowerCase()).searchParams : null
    const cookieValues = Object.fromEntries(decodeURIComponent(cookies).split(';').map(item => {
        const separator = item.indexOf('=')
        return [item.slice(0, separator).trim(), item.slice(separator + 1)]
    }))
    for (const name of Object.keys(result)) {
        if (isSelect(name)) continue
        const text = query ? query.get(name.toLowerCase()) : cookieValues[name]
        if (text == null) continue
        const options = controls.filter(control => control.name === name)
        if (options[0]?.type === 'checkbox') result[name] = String(text === 'true')
        else if (options.length) {
            const match = options.find(option => (query ? option.value.toLowerCase() : option.value) === text)
            if (match) result[name] = match.value
        } else if (!query || !Number.isNaN(parseFloat(text))) result[name] = assign(name, String(parseFloat(text)))
    }
    return result
}

/** Import known controls in file order, including the existing QuadPlane PID alias. */
export function importParameters(current: Parameters, text: string): Parameters {
    const result = { ...current }
    for (const line of text.split('\n')) {
        const fields = line.replace('Q_A_RAT_', 'ATC_RAT_').split(/[\s,=\t]+/)
        const name = fields[0]
        if (name && numericNames.includes(name) && fields.length >= 2) result[name] = assign(name, fields[1]!)
    }
    return result
}

/** Export only INS parameters, in legacy numeric-input-then-select DOM order. */
export function exportParameters(params: Parameters): string {
    const names = numericNames.filter(name => name.startsWith('INS_'))
    return [...names.filter(name => !isSelect(name)), ...names.filter(isSelect)].map(name => `${name},${param_to_string(Number(params[name]))}\n`).join('')
}

/** Serialize both forms in control order, including selects and checked radios only. */
export function shareLink(href: string, params: Parameters): string {
    const url = new URL(href.split('?')[0]!)
    for (const name of Object.keys(defaults)) url.searchParams.append(name, params[name] ?? '')
    return url.toString()
}

/** List simulator fields actually read by enabled legacy notch modes. */
function gyroReadNames(params: Parameters): string[] {
    const names = numericNames.filter(name => name.startsWith('INS_') || name === 'GyroSampleRate')
    for (const prefix of ['INS_HNTCH_', 'INS_HNTC2_']) {
        if (parseFloat(params[prefix + 'ENABLE'] ?? '') <= 0) continue
        const mode = parseFloat(params[prefix + 'MODE'] ?? '')
        if (mode === 1) names.push('Throttle')
        if (mode === 2) names.push('RPM1')
        if (mode === 5) names.push('RPM2')
        if (mode === 3) {
            names.push('ESC_RPM')
            if (parseFloat(params[prefix + 'OPTS'] ?? '') & 2) names.push('NUM_MOTORS')
        }
    }
    return names
}

/** Persist only fields read by the requested legacy calculation, including post-PID gyro. */
export function persist(params: Parameters, pidAxis?: string): void {
    const names = pidAxis ? [`ATC_RAT_${pidAxis}_P`, `ATC_RAT_${pidAxis}_I`, `ATC_RAT_${pidAxis}_D`, `ATC_RAT_${pidAxis}_FLTE`, `ATC_RAT_${pidAxis}_FLTD`, 'SCHED_LOOP_RATE', ...controls.filter(c => c.name.startsWith('PID_') || c.name === 'filtering').map(c => c.name), ...(params.filtering === 'Post' ? gyroReadNames(params) : [])] : [...gyroReadNames(params), ...controls.filter(c => !c.name.startsWith('PID_') && c.name !== 'filtering').map(c => c.name)]
    const expires = new Date(); expires.setDate(expires.getDate() + 365)
    for (const name of new Set(names)) {
        const text = numericNames.includes(name) ? String(parseFloat(params[name] ?? '')) : params[name] ?? ''
        document.cookie = `${name}=${encodeURIComponent(text)};expires=${expires.toUTCString()};path=/`
    }
}

/** Remove only this tool's saved controls so reset cannot resurrect another PID axis. */
export function clearSavedState(): void {
    for (const name of Object.keys(defaults)) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
}
