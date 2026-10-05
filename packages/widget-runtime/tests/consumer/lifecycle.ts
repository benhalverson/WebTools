import { WidgetRuntime } from '../../src/index.js'
import type { FormFactory, WidgetForm, Layout, Fields } from '../../src/index.js'

/** Fail a browser assertion without adding a second testing framework. */
function check(condition: boolean, message: string): void { if (!condition) throw new Error(message) }

/** Control an async lifecycle boundary without timers or external resources. */
function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: Error) => void
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
}

/** Exercise disposal and failure at each Formio await using real GridStack and iframe resources. */
export async function runLifecycleChecks(): Promise<void> {
    const layout: Layout = { header: { version: 1 }, grid: { rows: 2, columns: 2, color: 'white' }, widgets: {
        0: { x: 0, y: 0, w: 1, h: 1, type: 'WidgetSandBox', options: { form: {}, sandbox: 'handle_msg=function(){}' } },
    } }
    for (const phase of ['create', 'schema', 'submission'] as const) {
        for (const failure of [false, true]) {
            const gate = deferred<void>()
            const entered = deferred<void>()
            const element = document.createElement('div')
            element.style.cssText = 'width:500px;height:500px'
            document.body.append(element)
            let destroyed = 0
            const listeners = new Set<(event: { changed?: unknown }) => void>()
            const form: WidgetForm = {
                form: {}, submission: { data: {} },
                /** Pause the schema stage when selected by the race fixture. */
                async setForm(schema: Fields) { this.form = schema; if (phase === 'schema') { entered.resolve(); await gate.promise } },
                /** Pause submission setup so disposal can race this exact await. */
                async setSubmission(submission) { this.submission = submission; if (phase === 'submission') { entered.resolve(); await gate.promise } },
                /** This fixture has no invalid values. */
                checkValidity() { return true },
                /** Track listeners registered after successful initialization. */
                on(_event, listener) { listeners.add(listener) },
                /** Remove the exact registered handler. */
                off(_event, listener) { listeners.delete(listener) },
                /** Count disposal so a late promise cannot double-destroy a form. */
                destroy() { destroyed++ },
            }
            const forms: FormFactory = {
                /** Pause form creation separately from schema and submission initialization. */
                async createForm() { if (phase === 'create') { entered.resolve(); await gate.promise } return form },
            }
            const runtime = new WidgetRuntime(element, {
                createGrid: (options, host) => window.GridStack.init(options, host), forms,
                sandboxUrl: `${import.meta.env.BASE_URL}runtime/Widgets/SandBox.html`, defaultHtml: '',
            }, layout)
            await entered.promise
            if (failure) gate.reject(new Error('expected lifecycle rejection'))
            else { runtime.destroy(); gate.resolve() }
            let rejected = false
            try { await runtime.ready } catch { rejected = true }
            check(rejected === failure, `${phase}: rejection contract`)
            runtime.destroy()
            check(destroyed === (failure && phase === 'create' ? 0 : 1), `${phase}: form destroyed once`)
            check(listeners.size === 0, `${phase}: listener cleanup`)
            check(element.querySelectorAll('iframe').length === 0, `${phase}: frame cleanup`)
            element.remove()
        }
    }
}
