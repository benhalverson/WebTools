import type { DataflashConstructor, DataflashLog } from '@webtools/dataflash'

export interface LogService {
    load(buffer: ArrayBuffer): Promise<void>
    getMessage(type: string): Promise<string | undefined>
    hasLog(): boolean
    dispose(): void
}

/** Retain client-side discovery and the legacy last-instance JSON serialization.
 * Loading the staged package keeps its pinned parser relative import intact.
 */
export function createLogService(assetBase: string, loadParser?: () => Promise<DataflashConstructor>): LogService {
    /** Import the typed package beside its pinned vendor module at this public mount. */
    async function browserParser(): Promise<DataflashConstructor> {
        const url = new URL(assetBase + 'parser/index.js', window.location.origin)
        const module = await import(/* @vite-ignore */ url.href) as { loadDataflashParser(): Promise<DataflashConstructor> }
        return module.loadDataflashParser()
    }
    let log: DataflashLog | undefined
    let generation = 0
    let disposed = false
    return {
        /** Discover message types from one local file; ignore an obsolete import. */
        async load(buffer) {
            const current = ++generation
            const Parser = await (loadParser ?? browserParser)()
            if (disposed || current !== generation) return
            const next = new Parser()
            log = next
            next.processData(buffer, [])
        },
        /** Match legacy get, including its last-instance selection and typed-array JSON. */
        async getMessage(type) {
            const definition = log?.messageTypes[type]
            if (!log || !definition) return undefined
            let output
            if (definition.instances) {
                for (const instance of Object.keys(definition.instances)) output = log.get_instance(type, instance)
            } else output = log.get(type)
            return output ? JSON.stringify(output) : undefined
        },
        /** Report whether a log is available for the assistant's get tool. */
        hasLog() { return log !== undefined },
        /** Release local log buffers and prevent late imports from restoring them. */
        dispose() { disposed = true; generation++; log = undefined },
    }
}
