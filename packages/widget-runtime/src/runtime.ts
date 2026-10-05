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
    /** Connection and application settings remain consumer-owned and explicitly disposable. */
    mountMenu?: (element: HTMLElement, runtime: WidgetRuntime) => (() => void)
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

    /** Enumerate hosts in the same DOM order used by legacy layout serialization. */
    getWidgets(): readonly WidgetHost[] {
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
    private options: WidgetOptions
    private form: WidgetForm | undefined
    private iframe: HTMLIFrameElement | undefined
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
    /** Initialize each iframe navigation; removal detaches this exact listener. */
    private readonly loadListener = (): void => { this.sendInitialization() }
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
            this.options.sandbox ??= defaultScript
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
            else this.iframe.srcdoc = this.options.custom_HTML ?? ''
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
        this.ready = this.initializeForm().then(async () => { await this.nested?.ready })
        // Report errors without leaving an unhandled rejection when creation is followed by removal.
        void this.ready.catch(error => this.owner.dependencies.onError?.(error))
    }

    /** Show the consumer-owned form surface on edit double-click, stopping nested propagation. */
    private readonly showForm = (event: MouseEvent): void => {
        if (this.editing) this.formElement.hidden = !this.formElement.hidden
        event.stopPropagation()
    }

    /** Initialize Formio in legacy order; every async boundary guards removal during setup. */
    private async initializeForm(): Promise<void> {
        try {
            const form = await this.owner.dependencies.forms.createForm(this.formElement, this.options.form ?? {})
            if (this.destroyed) { form.destroy(); return }
            this.form = form
            await form.setForm(this.options.form ?? {})
            if (this.destroyed) return
            await form.setSubmission({ data: this.formData })
            if (this.destroyed) return
            this.formData = structuredClone(form.submission.data)
            this.lastContent = JSON.stringify(this.formData)
            this.applyOptions()
            form.on('change', this.formListener)
        } catch (error) {
            this.destroy()
            throw error
        }
    }

    /** Post only the established script/options envelope; sandbox privileges remain unchanged. */
    private sendInitialization(): void {
        if (this.destroyed) return
        const message: WidgetMessage = { options: this.formData }
        if (this.model.type === 'WidgetSandBox') message.script = this.options.sandbox ?? defaultScript
        this.iframe?.contentWindow?.postMessage(message, '*')
    }

    /** Apply live data to the widget, preserving options-only updates for iframe scripts. */
    private applyOptions(): void {
        if (this.destroyed) return
        this.iframe?.contentWindow?.postMessage({ options: this.formData } satisfies WidgetMessage, '*')
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

    /** Replace editable source, retaining legacy script reinitialization and srcdoc navigation. */
    setText(text: string): void {
        if (this.destroyed) throw new Error('Widget is destroyed')
        const previous = this.getText()
        if (this.model.type === 'WidgetSandBox') this.options.sandbox = text
        else if (this.model.type === 'WidgetCustomHTML') {
            this.options.custom_HTML = text
            if (this.iframe) this.iframe.srcdoc = text
        } else throw new Error('Widget has no editable source')
        if (previous !== text) this.changed = true
        this.sendInitialization()
    }

    /** Toggle nested handles and iframe interaction, leaving telemetry enabled during editing. */
    setEditing(enabled: boolean): void {
        this.editing = enabled
        this.element.style.cursor = enabled ? 'move' : 'auto'
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
            if (this.model.type === 'WidgetSandBox') options.sandbox = this.options.sandbox ?? defaultScript
            else options.custom_HTML = this.iframe?.srcdoc ?? this.options.custom_HTML ?? ''
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
        this.element.removeEventListener('dblclick', this.showForm)
        this.form?.off('change', this.formListener)
        this.form?.destroy()
        this.iframe?.removeEventListener('load', this.loadListener)
        this.iframe?.remove()
        this.image?.removeEventListener('load', this.resizeImage)
        this.observer?.disconnect()
        this.nested?.destroy()
        this.menuCleanup?.()
        this.menuGrid?.destroy()
        this.formElement.remove()
    }
}
