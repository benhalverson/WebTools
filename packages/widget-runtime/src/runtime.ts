import type { GridStack, GridStackOptions, GridStackWidget, GridStackNode } from 'gridstack'
import type { Message } from '@webtools/mavlink'
import type { Fields, Layout, WidgetMap, WidgetModel, WidgetOptions, WidgetMessage } from './model.js'
import { assertLayout, telemetryChannel, widgetSandbox } from './model.js'
import type { FormFactory, WidgetForm } from './forms.js'
import { defaultScript } from './default-script.js'
import menuTemplates from './menu-templates.json' with { type: 'json' }
import menuForm from './menu-form.json' with { type: 'json' }
import subgridForm from './subgrid-form.json' with { type: 'json' }

export interface RuntimeDependencies {
    /** Supply the retained GridStack 10.3.1 factory; no vendor patch or global registration. */
    createGrid(options: GridStackOptions, element: HTMLElement): GridStack
    forms: FormFactory
    /** URL of the exported SandBox.html asset, with its retained MAVLink script path. */
    sandboxUrl: string
    defaultHtml: string
    /** Consumer-specific default script; saved source always takes precedence. */
    defaultSandboxScript?: string
    /** Read current local log bytes and synchronized seconds for newly created or reloaded frames. */
    playback?: { getLogData(): ArrayBuffer | undefined; getTime(): number }
    /** Connection and application settings remain consumer-owned and explicitly disposable. */
    mountMenu?: (element: HTMLElement, runtime: WidgetRuntime) => (() => void)
    /** Open the consumer editor without embedding application UI in the runtime. */
    onEdit?: (widget: WidgetHost) => void
    /** Invalidate consumer selection when removal or cross-grid transfer disposes a host. */
    onWidgetDisposed?: (widget: WidgetHost) => void
    onError?: (error: unknown) => void
    onNoFit?: (widget: WidgetModel) => void
}

/** An isolated grid owner. Destroy it before removing its host (including React effect cleanup). */
export class WidgetRuntime {
    readonly grid: GridStack
    readonly ready: Promise<void>
    private static readonly hosts = new WeakMap<Element, WidgetHost>()
    private readonly widgets = new Map<HTMLElement, WidgetHost>()
    private destroyed = false
    private editing = false
    private changed = false
    private channel: BroadcastChannel | undefined

    /** Mount a saved layout; readiness includes nested grids and asynchronous Formio initialization. */
    constructor(readonly element: HTMLElement, readonly dependencies: RuntimeDependencies, layout: Layout, private readonly nestedGrid = false) {
        assertLayout(layout)
        element.style.backgroundColor = layout.grid.color
        const rows = Number.parseInt(String(layout.grid.rows))
        this.grid = dependencies.createGrid({
            float: true, disableDrag: true, disableResize: true,
            column: Number.parseInt(String(layout.grid.columns)), row: rows,
            cellHeight: `${100 / rows}%`, alwaysShowResizeHandle: true, acceptWidgets: widget => !this.nestedGrid || WidgetRuntime.hosts.get(widget)?.model.type !== 'WidgetMenu',
        }, element)
        try {
            this.grid.batchUpdate(true)
            for (const widget of Object.values(layout.widgets)) this.add(widget)
            this.grid.batchUpdate(false)
        } catch (error) {
            this.destroy()
            throw error
        }
        this.ready = Promise.all([...this.widgets.values()].map(widget => widget.ready)).then(() => {
            if (!this.destroyed) this.saved()
        }).catch(error => { this.destroy(); throw error })
        // Observe immediately, while preserving the public rejection for callers awaiting ready.
        void this.ready.catch(error => dependencies.onError?.(error))
        this.grid.on('dropped', this.handleDrop)
        this.grid.on('change added removed', () => { this.changed = true })
    }

    /** Add a widget at its requested position, falling back to auto-placement as legacy does. */
    add(model: WidgetModel): WidgetHost | undefined {
        this.assertActive()
        const position: GridStackWidget = { autoPosition: false }
        for (const key of ['x', 'y', 'w', 'h'] as const) {
            if (model[key] !== null) position[key] = Number.parseInt(String(model[key]))
        }
        if (!this.grid.willItFit(position)) {
            position.autoPosition = true
            if (!this.grid.willItFit(position)) {
                if (this.dependencies.onNoFit) this.dependencies.onNoFit(model)
                else window.alert("Widget won't fit on Grid")
                return undefined
            }
        }
        const host = new WidgetHost(this, model)
        this.widgets.set(host.element, host)
        WidgetRuntime.hosts.set(host.element, host)
        try {
            this.grid.addWidget(host.element, position)
            host.mount()
            host.setEditing(this.editing)
            this.changed = true
            return host
        } catch (error) {
            this.remove(host)
            throw error
        }
    }

    /** Remove a host and all nested resources; repeated removal is harmless. */
    remove(host: WidgetHost): void {
        if (!this.widgets.delete(host.element)) return
        WidgetRuntime.hosts.delete(host.element)
        host.destroy()
        this.grid.removeWidget(host.element)
        this.changed = true
    }

    /** Transfer by snapshot/recreation, matching the legacy workaround for moved nested grids. */
    private readonly handleDrop = (_event: Event, _previous: GridStackNode, current: GridStackNode): void => {
        if (!current.el) return
        const host = WidgetRuntime.hosts.get(current.el)
        if (!host) return
        const snapshot = host.snapshot()
        host.owner.widgets.delete(host.element)
        host.owner.changed = true
        WidgetRuntime.hosts.delete(host.element)
        host.destroy()
        this.grid.removeWidget(host.element)
        this.add(snapshot)
    }

    /** Enumerate hosts in legacy DOM order, returning no released resources after disposal. */
    getWidgets(): readonly WidgetHost[] {
        if (this.destroyed) return []
        return this.grid.getGridItems().flatMap(element => {
            const widget = this.widgets.get(element)
            return widget ? [widget] : []
        })
    }

    /** Snapshot DOM positions and live form data in the retained version-one file format. */
    snapshot(): Layout {
        this.assertActive()
        return {
            header: { version: 1 },
            grid: { columns: this.grid.opts.column ?? 12, rows: this.grid.opts.maxRow ?? 0, color: this.element.style.backgroundColor },
            widgets: this.snapshotWidgets(),
        }
    }

    /** Serialize a nested grid without adding a layout header. */
    snapshotWidgets(): WidgetMap {
        return Object.fromEntries(this.getWidgets().map((widget, index) => [index, widget.snapshot()]))
    }

    /** Toggle grid handles and iframe pointer events recursively. */
    setEditing(enabled: boolean): void {
        this.assertActive()
        this.editing = enabled
        if (enabled) this.grid.enable()
        else this.grid.disable()
        for (const widget of this.widgets.values()) widget.setEditing(enabled)
    }

    /** Publish decoded controlled telemetry using the existing structured-clone envelope. */
    publish(message: Message): void {
        this.assertActive()
        this.channel ??= new BroadcastChannel(telemetryChannel)
        this.channel.postMessage({ MAVLink: message })
    }

    /** Report unsaved form, text, geometry, or nested changes. */
    getChanged(): boolean {
        return this.changed || [...this.widgets.values()].some(widget => widget.getChanged())
    }

    /** Clear change tracking after the consumer successfully saves. */
    saved(): void {
        this.changed = false
        for (const widget of this.widgets.values()) widget.saved()
    }

    /** Release child forms, frames, observers, listeners, channel, and GridStack exactly once. */
    destroy(): void {
        if (this.destroyed) return
        this.destroyed = true
        for (const widget of this.widgets.values()) {
            WidgetRuntime.hosts.delete(widget.element)
            widget.destroy()
        }
        this.widgets.clear()
        this.channel?.close()
        this.grid.offAll()
        this.grid.removeAll()
        this.grid.destroy(false)
    }

    /** Fail before using resources that have already been released. */
    private assertActive(): void {
        if (this.destroyed) throw new Error('Widget runtime is destroyed')
    }
}

/** Owns one built-in/custom widget, its iframe or nested runtime, and its asynchronous form. */
export class WidgetHost {
    readonly element = document.createElement('div')
    readonly content = document.createElement('div')
    readonly formElement = document.createElement('div')
    ready: Promise<void> = Promise.resolve()

    /** Await actual playback document readiness before export, bounding waits and releasing cancellation listeners. */
    async waitForRenderReady(signal: AbortSignal): Promise<void> {
        signal.throwIfAborted()
        if (this.destroyed) throw new Error('Widget was removed during export')
        if (this.nested) { await Promise.all(this.nested.getWidgets().map(widget => widget.waitForRenderReady(signal))); return }
        if (!this.iframe) return
        await new Promise<void>((resolve, reject) => {
            let timer: number | undefined
            const deadline = performance.now() + 5000
            /** Release the exact timer and signal callback at every terminal state. */
            const cleanup = (): void => { window.clearTimeout(timer); signal.removeEventListener('abort', abort) }
            /** Fail capture promptly without consuming or acknowledging a widget's pending frame. */
            const abort = (): void => { cleanup(); reject(signal.reason) }
            /** Observe document readiness without sending a premature frame request. */
            const check = (): void => {
                if (this.destroyed || this.readinessError || performance.now() >= deadline) {
                    cleanup(); reject(this.readinessError ?? new Error('Widget document readiness failed during export')); return
                }
                if (this.frameLoaded) { cleanup(); resolve(); return }
                timer = window.setTimeout(check, 16)
            }
            signal.addEventListener('abort', abort, { once: true }); check()
        })
    }

    /** Enumerate legacy composition layers in DOM order, retaining nested backgrounds and frame bodies. */
    getContentForRender(parent: DOMRect): { content: HTMLElement; pos: { x: number; y: number } }[] {
        if (this.destroyed) throw new Error('Widget was removed during export')
        const box = (this.nested ? this.content : this.element).getBoundingClientRect()
        const content = this.iframe ? this.iframe.contentDocument?.body : this.content
        if (!content || (this.iframe && !this.frameLoaded)) throw new Error('Widget document is not ready for export')
        return [{ content, pos: { x: box.x - parent.x, y: box.y - parent.y } },
            ...(this.nested?.getWidgets().flatMap(widget => widget.getContentForRender(parent)) ?? [])]
    }
    private options: WidgetOptions
    private form: WidgetForm | undefined
    private iframe: HTMLIFrameElement | undefined
    private frameLoaded = false
    private latestTime: number | undefined
    private rendering: Promise<void> | undefined
    private readonly pendingFrames = new Set<() => void>()
    private nested: WidgetRuntime | undefined
    private destroyed = false
    private mounted = false
    private editing = false
    private changed = false
    private formData: Fields
    private lastContent: string
    private observer: ResizeObserver | undefined
    private image: HTMLImageElement | undefined
    private gridElement: HTMLDivElement | undefined
    private menuCleanup: (() => void) | undefined
    private menuGrid: GridStack | undefined
    private documentLoaded = false
    private readinessTimer: number | undefined
    private readinessError: Error | undefined
    private readonly pendingModules = new Set<string>()
    /** Initialize each navigation after its module evaluations and load event finish. */
    private readonly loadListener = (): void => {
        this.documentLoaded = true
        if (this.pendingModules.size === 0) this.activateFrame()
    }
    /** Accept module completion only from this navigation of this custom frame. */
    private readonly readyListener = (event: MessageEvent<unknown>): void => {
        if (event.source !== this.iframe?.contentWindow || typeof event.data !== 'string') return
        if (this.pendingModules.delete(event.data) && this.pendingModules.size === 0 && this.documentLoaded) this.activateFrame()
    }

    /** Initialize once the document has actually finished evaluating its modules. */
    private activateFrame(): void {
        if (this.destroyed || this.frameLoaded) return
        this.frameLoaded = true
        window.clearTimeout(this.readinessTimer)
        this.readinessError = undefined
        this.sendInitialization()
        this.loadLog()
        const playback = this.owner.dependencies.playback
        if (playback) void this.setTime(playback.getTime()).catch(error => this.owner.dependencies.onError?.(error))
    }

    /** Await top-level module imports without modifying stored or exported custom source. */
    private customDocument(source: string): string {
        this.documentLoaded = false
        this.pendingModules.clear()
        window.clearTimeout(this.readinessTimer)
        this.readinessError = undefined
        if (!this.owner.dependencies.playback) return source
        const document = new DOMParser().parseFromString(source, 'text/html')
        const modules = document.querySelectorAll<HTMLScriptElement>('script[type="module"]:not([src])')
        if (modules.length === 0) return source
        for (const script of modules) {
            const token = `widget-module:${crypto.randomUUID()}`
            this.pendingModules.add(token)
            const content = script.textContent ?? ''
            script.textContent = `${content}\n;window.parent.postMessage(${JSON.stringify(token)},'*');`
        }
        this.readinessTimer = window.setTimeout(() => {
            if (this.destroyed || this.pendingModules.size === 0) return
            this.readinessError = new Error('Custom widget module readiness timed out or failed')
            this.owner.dependencies.onError?.(this.readinessError)
        }, 5000)

        return `${source.match(/^\s*<!doctype[^>]*>/i)?.[0] ?? ''}${document.documentElement.outerHTML}`
    }
    /** Forward only valid changed submissions, preserving live form data for serialization. */
    private readonly formListener = (event: { changed?: unknown }): void => {
        if (this.destroyed || event.changed == null || !this.form?.checkValidity(this.form.submission.data)) return
        const current = JSON.stringify(this.form.submission.data)
        if (current === this.lastContent) return
        this.lastContent = current
        this.formData = structuredClone(this.form.submission.data)
        this.changed = true
        this.applyOptions()
    }

    /**
     * Copy caller data so edits cannot mutate a saved fixture, and create a
     * bounded settings scrollport above the widget's independently sized content.
     * Keeping settings out of flex layout preserves iframe and nested-grid sizes.
     */
    constructor(readonly owner: WidgetRuntime, readonly model: WidgetModel) {
        this.options = structuredClone(model.options)
        if (model.type === 'WidgetMenu') this.options.form = structuredClone(menuForm)
        if (model.type === 'WidgetSubGrid') this.options.form = structuredClone(subgridForm)
        if (model.type === 'WidgetSandBox') {
            this.options.sandbox ??= owner.dependencies.defaultSandboxScript ?? defaultScript
            this.options.about ??= { name: 'Sandbox', info: 'Sandboxed widget allowing user defined functionality with JavaScript. User input using Formio form.' }
        }
        if (model.type === 'WidgetCustomHTML') {
            this.options.custom_HTML ??= owner.dependencies.defaultHtml
            this.options.about ??= { name: 'Custom HTML', info: 'Custom HTML allowing user defined HTML. User input using Formio form.' }
        }
        this.formData = this.options.form ? structuredClone(this.options.form_content ?? {}) : {}
        this.lastContent = JSON.stringify(this.formData)
        this.element.className = 'grid-stack-item'
        this.content.className = model.type === 'WidgetMenu' || model.type === 'WidgetSubGrid' ? 'grid-stack-item-content' : 'widget-frame-content'
        this.content.style.cssText = 'display:flex;overflow:hidden;'
        if (model.type === 'WidgetSandBox' || model.type === 'WidgetCustomHTML') this.content.style.cssText += 'position:relative;width:100%;height:100%;'
        this.element.append(this.content)
        this.formElement.style.cssText = 'position:absolute;inset:0;z-index:1;overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:5px;background:white;cursor:auto;'
        this.formElement.hidden = true
        this.content.append(this.formElement)
        this.element.addEventListener('dblclick', this.showForm)
        this.element.addEventListener('keydown', this.editKey)
    }

    /** Allocate resources only after GridStack gives this element its dimensions. */
    mount(): void {
        if (this.mounted || this.destroyed) return
        this.mounted = true
        const type = this.model.type
        if (type === 'WidgetSandBox' || type === 'WidgetCustomHTML') {
            this.iframe = document.createElement('iframe')
            this.iframe.setAttribute('sandbox', widgetSandbox)
            this.iframe.scrolling = 'no'
            this.iframe.style.cssText = 'border:none;width:100%;height:100%;overflow:hidden'
            this.iframe.addEventListener('load', this.loadListener)
            if (type === 'WidgetSandBox') this.iframe.src = this.owner.dependencies.sandboxUrl
            else {
                window.addEventListener('message', this.readyListener)
                this.iframe.srcdoc = this.customDocument(this.options.custom_HTML ?? '')
            }
            this.content.append(this.iframe)
        } else {
            this.content.style.cssText += 'border:5px solid #c8c8c8;border-radius:10px;padding:5px;'
            if (type === 'WidgetSubGrid') {
                this.gridElement = document.createElement('div')
                // Contain nested handles and child settings below this host's settings.
                this.gridElement.style.cssText = 'position:absolute;inset:0;z-index:0;'
                this.content.append(this.gridElement)
                this.updateNested()
            } else {
                this.mountMenu()
            }
        }
        this.ready = this.initializeForm().then(async () => { await this.nested?.ready }).catch(error => {
            // Cancellation keeps the public rejection but cannot remove or report against a newer layout.
            if (!this.destroyed) {
                this.owner.remove(this)
                this.owner.dependencies.onError?.(error)
            }
            throw error
        })
        // Observe rejections even when creation is immediately followed by removal.
        void this.ready.catch(() => {})
    }

    /** Show the consumer-owned form surface on edit double-click, stopping nested propagation. */
    private readonly showForm = (event: MouseEvent): void => {
        if (this.editing) {
            if (this.owner.dependencies.onEdit) this.owner.dependencies.onEdit(this)
            else this.formElement.hidden = !this.formElement.hidden
        }
        event.stopPropagation()
    }

    /** Let keyboard users open the same configuration surface as pointer users. */
    private readonly editKey = (event: KeyboardEvent): void => {
        if (!this.editing || event.target !== this.element || event.key !== 'Enter') return
        event.preventDefault()
        event.stopPropagation()
        this.owner.dependencies.onEdit?.(this)
    }

    /** Initialize Formio in legacy order; every async boundary guards removal during setup. */
    private async initializeForm(): Promise<void> {
        const form = await this.owner.dependencies.forms.createForm(this.formElement, this.options.form ?? {})
        if (this.destroyed) { form.destroy(true); return }
        this.form = form
        await form.setForm(this.options.form ?? {})
        if (this.destroyed) return
        await form.setSubmission({ data: this.formData })
        if (this.destroyed) return
        this.formData = structuredClone(form.submission.data)
        this.lastContent = JSON.stringify(this.formData)
        this.applyOptions()
        form.on('change', this.formListener)
    }

    /** Post only the established script/options envelope; sandbox privileges remain unchanged. */
    private sendInitialization(): void {
        if (this.destroyed) return
        const message: WidgetMessage = { options: this.formData }
        if (this.model.type === 'WidgetSandBox') message.script = this.options.sandbox ?? this.owner.dependencies.defaultSandboxScript ?? defaultScript
        this.iframe?.contentWindow?.postMessage(message, '*')
    }

    /** Deliver local log bytes recursively using the retained iframe message envelope. */
    loadLog(): void {
        if (this.destroyed) return
        const logData = this.owner.dependencies.playback?.getLogData()
        if (logData && this.frameLoaded) {
            this.iframe?.contentWindow?.postMessage({ logData }, '*')
            void this.setTime(this.owner.dependencies.playback?.getTime() ?? 0).catch(error => this.owner.dependencies.onError?.(error))
        }
        for (const host of this.nested?.getWidgets() ?? []) host.loadLog()
    }

    /** Await the established render acknowledgement, with bounded and cancellable listener ownership. */
    setTime(time: number): Promise<void> {
        if (this.destroyed) return Promise.resolve()
        this.latestTime = time
        if (!this.rendering) {
            /** Keep at most one outstanding acknowledgement per frame, coalescing newer scrubs. */
            const render = async (): Promise<void> => {
                while (!this.destroyed && this.latestTime !== undefined) {
                    const next = this.latestTime; this.latestTime = undefined
                    await this.renderTime(next)
                }
            }
            let completed = false
            this.rendering = render().then(() => { completed = true }).finally(() => {
                this.rendering = undefined
                // A request can arrive after the loop exits but before this finalizer runs.
                if (completed && !this.destroyed && this.latestTime !== undefined) return this.setTime(this.latestTime)
                if (!completed) this.latestTime = undefined
            })
        }
        return this.rendering
    }

    /** Send one frame request after the preceding acknowledgement has settled. */
    private async renderTime(time: number): Promise<void> {
        if (this.destroyed) return
        if (this.readinessError) throw this.readinessError
        if (this.nested) {
            await Promise.all(this.nested.getWidgets().map(host => host.setTime(time)))
            return
        }
        const target = this.iframe?.contentWindow
        if (!target || !this.frameLoaded || !this.owner.dependencies.playback) return
        await new Promise<void>((resolve, reject) => {
            /** Release this request's listener and timer on reply, timeout or widget disposal. */
            const cancel = (): void => { cleanup(); resolve() }
            /** Ignore other frames and messages, preserving the legacy renderDone protocol. */
            const receive = (event: MessageEvent<unknown>): void => {
                if (event.source === target && event.data === 'renderDone') { cleanup(); resolve() }
            }
            /** Remove the exact callback identities owned by this request. */
            const cleanup = (): void => { window.removeEventListener('message', receive); window.clearTimeout(timer); this.pendingFrames.delete(cancel) }
            const timer = window.setTimeout(() => {
                cleanup()
                this.readinessError = new Error('Widget render acknowledgement timed out; reload or edit the widget to resume')
                reject(this.readinessError)
            }, 5000)
            this.pendingFrames.add(cancel)
            window.addEventListener('message', receive)
            target.postMessage({ time }, '*')
        })
    }

    /** Apply live data to the widget, preserving options-only updates for iframe scripts. */
    private applyOptions(): void {
        if (this.destroyed) return
        this.iframe?.contentWindow?.postMessage({ options: this.formData } satisfies WidgetMessage, '*')
        if (this.owner.dependencies.playback) this.loadLog()
        if (this.model.type === 'WidgetMenu' || this.model.type === 'WidgetSubGrid') {
            if (typeof this.formData.borderColor === 'string') this.content.style.borderColor = this.formData.borderColor
            if (typeof this.formData.backgroundColor === 'string') this.content.style.backgroundColor = this.formData.backgroundColor
        }
        if (this.model.type === 'WidgetSubGrid') this.updateNested()
    }

    /** Rebuild only when dimensions change, retaining child snapshots and disposing the old grid. */
    private updateNested(): void {
        if (!this.gridElement) return
        const rows = Number(this.formData.rows ?? 2), columns = Number(this.formData.columns ?? 2)
        if (!this.nested || this.nested.grid.opts.maxRow !== rows || this.nested.grid.opts.column !== columns) {
            const widgets = this.nested?.snapshotWidgets() ?? this.options.widgets ?? {}
            this.nested?.destroy()
            this.nested = new WidgetRuntime(this.gridElement, this.owner.dependencies, {
                header: { version: 1 }, grid: { rows, columns, color: '' }, widgets,
            }, true)
            this.nested.setEditing(this.editing)
        }
        const images = this.formData.backgroundImage
        if (Array.isArray(images) && images[0] && typeof images[0] === 'object' && !Array.isArray(images[0]) && typeof images[0].url === 'string') {
            if (!this.image) {
                this.image = document.createElement('img')
                this.image.style.cssText = 'width:100%;height:100%;object-fit:contain'
                this.content.append(this.image)
                this.image.addEventListener('load', this.resizeImage)
                this.observer = new ResizeObserver(this.resizeImage)
                this.observer.observe(this.image)
            }
            this.image.src = images[0].url
            this.resizeImage()
        }
    }

    /** Match legacy image-relative subgrid sizing without retaining observers after removal. */
    private readonly resizeImage = (): void => {
        if (!this.image || !this.gridElement) return
        const bounds = this.image.getBoundingClientRect()
        const scale = Math.min(bounds.width / this.image.naturalWidth, bounds.height / this.image.naturalHeight)
        const horizontal = `${(bounds.width - this.image.naturalWidth * scale) * 0.5}px`
        const vertical = `${(bounds.height - this.image.naturalHeight * scale) * 0.5}px`
        Object.assign(this.gridElement.style, { left: horizontal, right: horizontal, top: vertical, bottom: vertical })
    }

    /** Render the retained icon templates; the consumer owns settings and connection actions. */
    private mountMenu(): void {
        const menu = document.createElement('div')
        menu.style.cssText = 'position:relative;z-index:0;width:100%;height:100%'
        this.content.append(menu)
        const grid = this.owner.dependencies.createGrid({ float: true, staticGrid: true }, menu)
        this.menuGrid = grid
        for (const html of Object.values(menuTemplates)) {
            const element = document.createElement('div')
            element.innerHTML = html
            grid.addWidget(element)
        }
        this.menuCleanup = this.owner.dependencies.mountMenu?.(menu, this.owner)
        this.observer = new ResizeObserver(() => {
            const height = menu.clientHeight, width = menu.clientWidth
            const ratio = height / width
            const columns = ratio < 1 / 1.5 ? 4 : ratio > 1.5 ? 1 : 2
            grid.column(columns)
            grid.cellHeight(`${Math.floor(height * columns / 4)}px`)
            grid.getGridItems().forEach((element, index) => grid.update(element, { x: index % columns, y: Math.floor(index / columns) }))
        })
        this.observer.observe(menu)
    }

    /** Change form values and await Formio calculations before updating the iframe or subgrid. */
    async setOptions(data: Fields): Promise<void> {
        if (this.destroyed) throw new Error('Widget is destroyed')
        await this.ready
        if (this.destroyed) return
        await this.form?.setSubmission({ data: structuredClone(data) })
        if (this.destroyed) return
        this.formData = structuredClone(this.form?.submission.data ?? data)
        this.lastContent = JSON.stringify(this.formData)
        this.changed = true
        this.applyOptions()
        await this.nested?.ready
    }

    /** Expose nested ownership for dashboard editors without exposing private registries. */
    getNestedRuntime(): WidgetRuntime | undefined { return this.nested }

    /** Read editable JavaScript or HTML without normalizing saved text. */
    getText(): string | undefined { return this.options.sandbox ?? this.options.custom_HTML }

    /** Return retained palette metadata independently of the widget's saved option shape. */
    getAbout(): Fields {
        if (this.model.type === 'WidgetSubGrid') return { name: 'Subgrid', info: 'Nestable sub grid widget' }
        return structuredClone(this.options.about ?? { name: this.model.type })
    }

    /** Return a copy of the live Formio schema, including dynamic field definitions. */
    getFormDefinition(): Fields { return structuredClone(this.form?.form ?? this.options.form ?? {}) }

    /** Update an editor's schema and await Formio before publishing calculated option values. */
    async setFormDefinition(schema: Fields): Promise<void> {
        await this.ready
        if (this.destroyed) throw new Error('Widget is destroyed')
        if (JSON.stringify(this.getFormDefinition()) !== JSON.stringify(schema)) this.changed = true
        this.options.form = structuredClone(schema)
        await this.form?.setForm(this.options.form)
        if (this.destroyed) return
        this.formData = structuredClone(this.form?.submission.data ?? this.formData)
        this.applyOptions()
    }

    /** Navigate with a new WindowProxy so queued replies cannot acknowledge a replacement document. */
    private navigateFrame(source: string): void {
        const previous = this.iframe
        if (!previous) return
        for (const cancel of this.pendingFrames) cancel()
        const frame = previous.cloneNode(false) as HTMLIFrameElement
        frame.removeAttribute('src'); frame.removeAttribute('srcdoc')
        previous.removeEventListener('load', this.loadListener)
        frame.addEventListener('load', this.loadListener)
        this.iframe = frame
        this.frameLoaded = false; this.documentLoaded = false
        this.readinessError = undefined
        // Set the final source while detached to avoid an intermediate about:blank load.
        if (this.model.type === 'WidgetSandBox') frame.src = this.owner.dependencies.sandboxUrl
        else frame.srcdoc = this.customDocument(source)
        previous.replaceWith(frame)
    }

    /** Replace editable source, retaining script reinitialization and isolated custom-document navigation. */
    setText(text: string): void {
        if (this.destroyed) throw new Error('Widget is destroyed')
        const previous = this.getText()
        if (this.model.type === 'WidgetSandBox') {
            this.options.sandbox = text
            if (this.readinessError) this.navigateFrame(text)
        } else if (this.model.type === 'WidgetCustomHTML') {
            this.options.custom_HTML = text
            this.navigateFrame(text)
        } else throw new Error('Widget has no editable source')
        if (previous !== text) this.changed = true
        this.sendInitialization()
        this.loadLog()
        if (this.frameLoaded && this.owner.dependencies.playback) void this.setTime(this.owner.dependencies.playback.getTime()).catch(error => this.owner.dependencies.onError?.(error))
    }

    /** Toggle nested handles and iframe interaction, leaving telemetry enabled during editing. */
    setEditing(enabled: boolean): void {
        this.editing = enabled
        this.element.style.cursor = enabled ? 'move' : 'auto'
        this.element.tabIndex = enabled ? 0 : -1
        if (this.iframe) this.iframe.style.pointerEvents = enabled ? 'none' : 'auto'
        if (!enabled) this.formElement.hidden = true
        this.nested?.setEditing(enabled)
    }

    /** Capture the same per-type option shape and property ordering as the legacy serializer. */
    snapshot(): WidgetModel {
        const data = this.form?.submission.data ?? this.formData
        let options: WidgetOptions
        if (this.model.type === 'WidgetMenu') options = { form_content: data }
        else if (this.model.type === 'WidgetSubGrid') options = { form_content: data, widgets: this.nested?.snapshotWidgets() ?? {} }
        else {
            options = { form: this.form?.form ?? this.options.form ?? {}, form_content: data, about: this.options.about ?? { name: this.model.type } }
            if (this.model.type === 'WidgetSandBox') options.sandbox = this.options.sandbox ?? this.owner.dependencies.defaultSandboxScript ?? defaultScript
            else options.custom_HTML = this.options.custom_HTML ?? ''
        }
        return structuredClone({ x: this.element.getAttribute('gs-x'), y: this.element.getAttribute('gs-y'), w: this.element.getAttribute('gs-w'), h: this.element.getAttribute('gs-h'), type: this.model.type, options })
    }

    /** Include unsaved nested form and geometry changes. */
    getChanged(): boolean { return this.changed || (this.nested?.getChanged() ?? false) }

    /** Mark this widget and its descendants saved. */
    saved(): void { this.changed = false; this.nested?.saved() }

    /** Idempotently release resources; late form creation resolves by destroying its own result. */
    destroy(): void {
        if (this.destroyed) return
        this.destroyed = true
        for (const cancel of this.pendingFrames) cancel()
        this.owner.dependencies.onWidgetDisposed?.(this)
        this.element.removeEventListener('dblclick', this.showForm)
        this.element.removeEventListener('keydown', this.editKey)
        this.form?.off('change', this.formListener)
        this.form?.destroy(true)
        this.iframe?.removeEventListener('load', this.loadListener)
        window.removeEventListener('message', this.readyListener)
        window.clearTimeout(this.readinessTimer)
        this.iframe?.remove()
        this.image?.removeEventListener('load', this.resizeImage)
        this.observer?.disconnect()
        this.nested?.destroy()
        this.menuCleanup?.()
        this.menuGrid?.destroy()
        this.formElement.remove()
    }
}
