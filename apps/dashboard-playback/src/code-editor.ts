import type * as Monaco from 'monaco-editor'

interface Loader {
    config(options: { paths: Record<string, string> }): void
    (modules: string[], resolve: () => void, reject: (error: unknown) => void): void
}
declare global {
    interface Window {
        require: Loader
        monaco: typeof Monaco
    }
}
let loading: Promise<typeof Monaco> | undefined

/** Load the same Monaco AMD API as legacy from this app's pinned, locally staged assets. */
export function loadCodeEditor(): Promise<typeof Monaco> {
    if (loading) return loading
    loading = new Promise<typeof Monaco>((resolve, reject) => {
        const base = new URL(`${import.meta.env.BASE_URL}assets/monaco/`, location.origin).href
        const script = document.createElement('script')
        script.src = base + 'vs/loader.js'
        /** Resolve only after the language editor module and its local dependencies load. */
        script.onload = () => {
            script.remove()
            window.require.config({ paths: { vs: base + 'vs' } })
            window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject)
        }
        /** Permit an explicit retry after a failed asset request. */
        script.onerror = () => { script.remove(); reject(new Error('Unable to load widget source editor')) }
        document.head.append(script)
    }).catch(error => { loading = undefined; throw error })
    return loading
}
