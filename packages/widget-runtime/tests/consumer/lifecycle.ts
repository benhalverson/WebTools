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
            let deletedFromGlobal = false
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
                destroy(deleteFromGlobal) { destroyed++; deletedFromGlobal = deleteFromGlobal === true },
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
            check(runtime.getWidgets().length === 0, `${phase}: disposed grid enumeration is empty`)
            check(destroyed === (failure && phase === 'create' ? 0 : 1), `${phase}: form destroyed once`)
            check(destroyed === 0 || deletedFromGlobal, `${phase}: disposal removes the Formio registry entry`)
            check(listeners.size === 0, `${phase}: listener cleanup`)
            check(element.querySelectorAll('iframe').length === 0, `${phase}: frame cleanup`)
            element.remove()
        }
    }
    await runTelemetryReadinessChecks()
    await runPlaybackChecks()
}

/** Keep telemetry-only consumers free of unsolicited video acknowledgement requests. */
async function runTelemetryReadinessChecks(): Promise<void> {
    const element = document.createElement('div')
    element.style.cssText = 'width:500px;height:500px'
    document.body.append(element)
    const runtime = new WidgetRuntime(element, {
        createGrid: (options, host) => window.GridStack.init(options, host), forms: window.Formio,
        sandboxUrl: `${import.meta.env.BASE_URL}runtime/Widgets/SandBox.html`, defaultHtml: '',
    }, { header: { version: 1 }, grid: { rows: 1, columns: 1, color: '' }, widgets: {
        0: { x: 0, y: 0, w: 1, h: 1, type: 'WidgetCustomHTML', options: {
            custom_HTML: '<html><body><output></output><script>addEventListener("message",event=>{document.querySelector("output").textContent+=Object.keys(event.data).join(",")+";"})</script></body></html>',
        } },
    } })
    try {
        const frame = element.querySelector('iframe')
        check(frame !== null, 'telemetry fixture frame exists')
        if (!frame) return
        const loaded = new Promise<void>(resolve => frame.addEventListener('load', () => resolve(), { once: true }))
        await Promise.all([runtime.ready, loaded])
        await new Promise(resolve => window.setTimeout(resolve, 50))
        const received = frame.contentDocument?.querySelector('output')?.textContent ?? ''
        check(received.includes('options'), 'telemetry frame still receives its initialization')
        check(!received.includes('time'), 'telemetry-only initialization never sends a playback request')
    } finally { runtime.destroy(); element.remove() }
}

/** Verify late handler readiness, slow replies and terminal timeouts in real iframes. */
async function runPlaybackChecks(): Promise<void> {
    const element = document.createElement('div')
    element.style.cssText = 'width:500px;height:500px'
    document.body.append(element)
    const source = `<!doctype html><html><head><script type="module">await new Promise(resolve=>setTimeout(resolve,50))</script></head><body><output id="events">[]</output><script type="module">
        addEventListener('message',()=>{});
        await new Promise(resolve=>setTimeout(resolve,150));
        const events=[];const output=document.querySelector('#events');
        addEventListener('message',async event=>{if(event.data.retainAck)event.source.postMessage('renderDone','*');if('time' in event.data){
            events.push('start:'+event.data.time);output.textContent=JSON.stringify(events);
            await new Promise(resolve=>setTimeout(resolve,300));
            events.push('done:'+event.data.time);output.textContent=JSON.stringify(events);
            event.source.postMessage('renderDone','*');
        }});
    </script></body></html>`
    const layout: Layout = { header: { version: 1 }, grid: { rows: 1, columns: 1, color: '' }, widgets: {
        0: { x: 0, y: 0, w: 1, h: 1, type: 'WidgetCustomHTML', options: { custom_HTML: source } },
    } }
    const errors: string[] = []
    const runtime = new WidgetRuntime(element, {
        onError: error => errors.push(String(error)),
        createGrid: (options, host) => window.GridStack.init(options, host), forms: window.Formio,
        sandboxUrl: `${import.meta.env.BASE_URL}runtime/Widgets/SandBox.html`, defaultHtml: '', playback: { getLogData: () => undefined, getTime: () => 0 },
    }, layout)
    /** Wait longer than one deliberately slow response without blocking browser events. */
    const pause = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds))
    try {
        await runtime.ready
        await pause(800)
        const host = runtime.getWidgets()[0]!
        check(host.getText() === source && host.snapshot().options.custom_HTML === source, 'stored custom source preserved')
        const first = host.setTime(1)
        const second = host.setTime(2)
        await Promise.all([first, second])
        const events = element.querySelector('iframe')!.contentDocument!.querySelector('#events')!.textContent
        check(events === '["start:0","done:0","start:1","done:1","start:2","done:2"]', `serialized slow acknowledgements: ${events}`)
        const previousWindow = element.querySelector('iframe')!.contentWindow
        const heldAck = deferred<MessageEvent<unknown>>()
        /** Hold a genuine old-document acknowledgement to replay delayed parent delivery. */
        const retainAck = (event: MessageEvent<unknown>): void => {
            if (event.source === previousWindow && event.data === 'renderDone') {
                event.stopImmediatePropagation()
                heldAck.resolve(event)
            }
        }
        window.addEventListener('message', retainAck, true)
        previousWindow!.postMessage({ retainAck: true }, '*')
        let acknowledgement: MessageEvent<unknown>
        try { acknowledgement = await heldAck.promise }
        finally { window.removeEventListener('message', retainAck, true) }
        host.setText('<!doctype html><html><body><output id="events">0</output><script>onmessage=event=>{if("time" in event.data)document.querySelector("#events").textContent=String(Number(document.querySelector("#events").textContent)+1)}</script></body></html>')
        check(element.querySelector('iframe')!.contentWindow !== previousWindow, 'ordinary source replacement owns a new frame window')
        await pause(100)
        let rejected = false
        const pending = host.setTime(9).catch(() => { rejected = true })
        window.dispatchEvent(acknowledgement)
        await pause(100)
        check(element.querySelector('iframe')!.contentDocument!.querySelector('#events')!.textContent === '1', 'old document acknowledgement cannot release replacement frame queue')
        await pending
        check(rejected, 'missing acknowledgement must reject')
        await pause(200)
        check(element.querySelector('iframe')!.contentDocument!.querySelector('#events')!.textContent === '1', 'timeout must not restart or retry time requests')
        const expiredFrame = element.querySelector('iframe')!.contentWindow
        host.setText('<!doctype html><html><body><script>addEventListener("error",event=>{if(event.message.includes("fixture module failure"))event.preventDefault()})</script><script type="module">throw new Error("fixture module failure")</script><script type="module">addEventListener("message",event=>{if("time" in event.data)event.source.postMessage("renderDone","*")})</script></body></html>')
        check(element.querySelector('iframe')!.contentWindow !== expiredFrame, 'timeout recovery owns a new frame window')
        await pause(5200)
        check(errors.some(error => error.includes('module readiness timed out or failed')), 'module failure must report bounded readiness error')
        rejected = false
        try { await host.setTime(10) } catch { rejected = true }
        check(rejected, 'failed readiness must reject further playback requests')
        runtime.remove(host)
        const sandbox = runtime.add({ x: 0, y: 0, w: 1, h: 1, type: 'WidgetSandBox', options: { form: {}, sandbox: 'handle_msg=function(){}' } })
        if (!sandbox) throw new Error('sandbox fixture was not created')
        await sandbox.ready
        await pause(5200)
        const expiredSandbox = sandbox.element.querySelector('iframe')!.contentWindow
        sandbox.setText('handle_msg=function(){return undefined}')
        check(sandbox.element.querySelector('iframe')!.contentWindow !== expiredSandbox, 'sandbox timeout recovery owns a new frame window')
    } finally { runtime.destroy(); element.remove() }
}
