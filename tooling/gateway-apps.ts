import { applications, applicationForPath, type Application } from '@webtools/routing'
import { requestPath } from './request-path.ts'

/** Select registered applications explicitly; omission preserves the complete gateway. */
export function selectedApplications(args: readonly string[]): Application[] {
    const positions = args.flatMap((value, index) => value === '--apps' ? [index] : [])
    if (positions.length === 0) return Object.keys(applications) as Application[]
    if (positions.length !== 1) throw new Error('Specify --apps once')
    const value = args[positions[0]! + 1]
    if (!value || value.startsWith('-')) throw new Error('--apps requires comma-separated application keys')
    const keys = value.split(',')
    if (new Set(keys).size !== keys.length) throw new Error('Duplicate application key')
    return keys.map(key => {
        if (!Object.hasOwn(applications, key)) throw new Error(`Unknown application: ${key}`)
        return key as Application
    })
}

/** Resolve both HTTP and HMR through the same ownership rules, without fallback. */
export function gatewayRoute(raw: string | undefined, prefix: string, origins: Partial<Record<Application, string>>):
    { status: 400 | 503 } | { target: string; path: string } {
    const parsed = requestPath(raw)
    if (!parsed) return { status: 400 }
    const target = origins[applicationForPath(parsed.pathname, prefix)]
    return target ? { target, path: parsed.path } : { status: 503 }
}
