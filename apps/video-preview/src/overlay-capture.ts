import type { WidgetHost, WidgetRuntime } from '@webtools/widget-runtime'
import { parseVideoPalette } from './format.ts'

export interface OverlayLayer { content: HTMLElement; pos: { x: number; y: number }; native: boolean }
interface Prepared { copy: HTMLElement; width: number; height: number }
interface Snapshot { source: string; image: ImageBitmap; canvas: OffscreenCanvas; verified: boolean }
const svgNamespace = 'http://www.w3.org/2000/svg'
const properties = (`display visibility position top right bottom left width height min-width min-height max-width max-height
    box-sizing margin padding border border-radius background-color opacity overflow overflow-x overflow-y transform transform-origin
    color font font-family font-size font-style font-weight font-variant line-height letter-spacing word-spacing text-align
    text-decoration white-space vertical-align fill fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-opacity
    stroke-dasharray clip-path paint-order text-anchor dominant-baseline object-fit z-index flex flex-direction align-items justify-content`).split(/\s+/)
const svgProperties = (`display visibility opacity transform transform-origin color font-family font-size font-style font-weight
    font-variant letter-spacing word-spacing text-decoration white-space fill fill-opacity fill-rule stroke stroke-width stroke-linecap
    stroke-linejoin stroke-opacity stroke-dasharray stroke-dashoffset stroke-miterlimit clip-path paint-order text-anchor
    dominant-baseline vector-effect`).split(/\s+/)
const inherited = new Set(`visibility color font-family font-size font-style font-weight font-variant letter-spacing word-spacing
    white-space fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-opacity stroke-dasharray
    stroke-dashoffset stroke-miterlimit paint-order text-anchor`.split(/\s+/))

/** Release a wait promptly on cancellation while observing and disposing late results. */
export function abortable<T>(operation: Promise<T>, signal: AbortSignal, release: (value: T) => void = () => {}): Promise<T> {
    return new Promise((resolve, reject) => {
        const abort = (): void => { signal.removeEventListener('abort', abort); reject(signal.reason) }
        operation.then(value => {
            signal.removeEventListener('abort', abort)
            if (signal.aborted) { release(value); reject(signal.reason) }
            else resolve(value)
        }, error => { signal.removeEventListener('abort', abort); reject(error) })
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
    })
}

/** Match live script bytes and typed runtime ownership, including every nested descendant. */
export function supportsWidget(widget: WidgetHost, scripts: ReadonlySet<string>): boolean {
    if (widget.model.type === 'WidgetSandBox') return scripts.has(widget.getText() ?? '')
    if (widget.model.type !== 'WidgetSubGrid') return false
    const nested = widget.getNestedRuntime()
    return !!nested && !widget.content.querySelector(':scope > img') && nested.getWidgets().every(child => supportsWidget(child, scripts))
}

/** Pair the runtime's existing composition order with each layer's actual host. */
export function overlayLayers(owner: WidgetRuntime, parent: DOMRect, scripts: ReadonlySet<string>): OverlayLayer[] {
    const hosts = (widget: WidgetHost): WidgetHost[] => [widget, ...(widget.getNestedRuntime()?.getWidgets().flatMap(hosts) ?? [])]
    return owner.getWidgets().flatMap(widget => {
        const ordered = hosts(widget)
        return widget.getContentForRender(parent).map((item, index) => ({ ...item, native: supportsWidget(ordered[index]!, scripts) }))
    })
}

/** Own only one export's native documents, embedded assets and latest serialized snapshots. */
export class OverlayCapture {
    readonly scripts: ReadonlySet<string>
    private readonly lifetime = new AbortController()
    private readonly snapshots = new Map<object, Snapshot>()
    private readonly assets = new Map<string, Promise<string>>()
    private readonly failed = new WeakSet<HTMLElement>()
    private closed = false
    private combinedDisabled = false
    private readonly detach: () => void

    constructor(scripts: ReadonlySet<string>, signal: AbortSignal) {
        this.scripts = scripts
        const abort = (): void => this.dispose()
        signal.addEventListener('abort', abort, { once: true })
        this.detach = () => signal.removeEventListener('abort', abort)
        if (signal.aborted) this.dispose()
    }

    /** Resolve palette assets relative to the runtime's prefixed sandbox and probe actual readable pixels. */
    static async create(owner: WidgetRuntime, signal: AbortSignal): Promise<OverlayCapture | undefined> {
        if (!owner.getWidgets().length) return undefined
        let capture: OverlayCapture | undefined
        try {
            const sandbox = new URL(owner.dependencies.sandboxUrl, owner.element.ownerDocument.baseURI)
            const response = await fetch(new URL('../Default_Palette.json', sandbox), { signal })
            if (!response.ok) return undefined
            const palette = parseVideoPalette(await abortable(response.text(), signal))
            const names = new Set(['Graph', 'Attitude gauge', 'Value'])
            const scripts = new Set(Object.values(palette).flatMap(widget =>
                typeof widget.options.about?.name === 'string' && names.has(widget.options.about.name) && typeof widget.options.sandbox === 'string'
                    ? [widget.options.sandbox] : []))
            if (!scripts.size) return undefined
            capture = new OverlayCapture(scripts, signal)
            const probe = owner.element.ownerDocument.createElement('div')
            probe.style.cssText = 'width:2px;height:2px;background:rgb(1,2,3)'
            const image = await capture.toImage(probe, 2, 2, 1, probe)
            const canvas = new OffscreenCanvas(2, 2)
            try {
                const context = canvas.getContext('2d')
                if (!context) throw new Error('Canvas rendering is unavailable')
                context.drawImage(image, 0, 0)
                const pixel = context.getImageData(0, 0, 1, 1).data
                if (pixel[0] !== 1 || pixel[1] !== 2 || pixel[2] !== 3 || pixel[3] !== 255) throw new Error('SVG capture is unsupported')
            } finally { canvas.width = 0; canvas.height = 0; capture.retain([]) }
            return capture
        } catch {
            capture?.dispose()
            signal.throwIfAborted()
            return undefined
        }
    }

    /** Forget removed or replaced documents immediately instead of retaining one cache per historical frame. */
    retain(keys: readonly object[]): void {
        const current = new Set(keys)
        for (const [key, snapshot] of this.snapshots) if (!current.has(key)) {
            snapshot.image.close(); snapshot.canvas.width = 0; snapshot.canvas.height = 0
            this.snapshots.delete(key)
        }
    }

    /** Reuse only snapshots already compared with the pinned renderer at this exact scale. */
    isVerified(image: ImageBitmap): boolean {
        return [...this.snapshots.values()].some(snapshot => snapshot.image === image && snapshot.verified)
    }

    /** Preserve exact pixels when the browser and html2canvas rasterize borders or transforms differently. */
    verify(image: ImageBitmap, reference: HTMLCanvasElement | OffscreenCanvas, combined = false): ImageBitmap {
        this.active()
        const snapshot = [...this.snapshots.values()].find(value => value.image === image)
        if (!snapshot) throw new Error('Capture snapshot was superseded')
        const canvas = snapshot.canvas
        canvas.width = reference.width; canvas.height = reference.height
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        const actual = context.getImageData(0, 0, canvas.width, canvas.height).data
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(reference, 0, 0)
        const expected = context.getImageData(0, 0, canvas.width, canvas.height).data
        const equal = image.width === reference.width && image.height === reference.height && actual.every((value, index) => value === expected[index])
        if (!equal) {
            image.close()
            snapshot.image = canvas.transferToImageBitmap()
            if (combined) this.combinedDisabled = true
        }
        snapshot.verified = true
        return snapshot.image
    }

    /** Abort IO and release bitmap/backing storage once; late promises cannot repopulate this owner. */
    dispose(): void {
        if (this.closed) return
        this.closed = true
        this.detach()
        this.lifetime.abort()
        this.retain([])
        this.assets.clear()
    }

    private active(): void { this.lifetime.signal.throwIfAborted() }

    /** Inline the exact bundled gauge's pinned image bytes into the serialized cache identity. */
    private asset(url: string): Promise<string> {
        let pending = this.assets.get(url)
        if (!pending) {
            pending = fetch(url, { signal: this.lifetime.signal }).then(async response => {
                if (!response.ok) throw new Error('Overlay image unavailable')
                const blob = await response.blob()
                this.active()
                return new Promise<string>((resolve, reject) => {
                    const reader = new FileReader()
                    const abort = (): void => reader.abort()
                    const cleanup = (): void => this.lifetime.signal.removeEventListener('abort', abort)
                    reader.onload = () => { cleanup(); resolve(String(reader.result)) }
                    reader.onerror = () => { cleanup(); reject(reader.error) }
                    reader.onabort = () => { cleanup(); reject(this.lifetime.signal.reason) }
                    this.lifetime.signal.addEventListener('abort', abort, { once: true })
                    reader.readAsDataURL(blob)
                })
            })
            this.assets.set(url, pending)
        }
        return pending
    }

    /** Serialize current computed appearance, descending through same-origin bundled widget documents. */
    private async clone(node: Node, parentStyles?: Record<string, string>): Promise<Node | null> {
        this.active()
        if (node.nodeType !== 1) {
            if (node.nodeType === 3 && node.textContent?.trim() && node.parentElement?.namespaceURI !== svgNamespace) {
                // html2canvas 1.4.1's HTML font metrics place the baseline one pixel below the browser's.
                // Move only glyphs; SVG text and the surrounding layout keep their original geometry.
                const text = document.createElement('span')
                text.style.cssText = 'position:relative;top:1px'
                text.textContent = node.textContent
                return text
            }
            return node.cloneNode(false)
        }
        const element = node as HTMLElement
        if (['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName) || element.classList.contains('ui-resizable-handle')) return null
        if (['CANVAS', 'VIDEO', 'INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) throw new Error('Unsupported capture element')
        const view = element.ownerDocument.defaultView
        if (!view) throw new Error('Widget document was replaced')
        const style = view.getComputedStyle(element)
        if (style.display === 'none') return null
        // A foreignObject image cannot load the document's external web fonts.
        for (const font of element.ownerDocument.fonts) {
            if (style.fontFamily.split(',').some(family => family.trim().replace(/["']/g, '') === font.family.replace(/["']/g, ''))) {
                throw new Error('External font requires document capture')
            }
        }
        for (const name of ['background-image', 'filter', 'backdrop-filter', 'mask-image', 'border-image-source', 'box-shadow', 'text-shadow', 'perspective']) {
            const value = style.getPropertyValue(name)
            if (value && value !== 'none') throw new Error('Unsupported capture styling')
        }
        if (style.mixBlendMode !== 'normal') throw new Error('Unsupported capture blending')
        const svgShape = element.namespaceURI === svgNamespace && element.localName !== 'svg'
        if (!svgShape) for (const pseudo of ['::before', '::after']) {
            const content = view.getComputedStyle(element, pseudo).content
            if (content && content !== 'none' && content !== 'normal') throw new Error('Unsupported generated content')
        }
        const copy = element.tagName === 'IFRAME' ? document.createElement('div') : element.cloneNode(false) as HTMLElement
        // Include every computed property in cache identity, even unsupported properties
        // whose appearance is preserved by a verified html2canvas snapshot.
        copy.setAttribute('data-capture-style', JSON.stringify([...style].map(property => [property, style.getPropertyValue(property)])))
        const selected = svgShape ? svgProperties : properties
        const styles = Object.fromEntries(selected.map(property => [property, style.getPropertyValue(property)]))
        copy.style.cssText = selected.filter(property => {
            if (svgShape && inherited.has(property) && styles[property] === parentStyles?.[property]) {
                copy.removeAttribute(property)
                return false
            }
            return true
        }).map(property => `${property}:${styles[property]}`).join(';').replace(/url\(["']?[^)]*#([^)'" ]+)["']?\)/g, 'url(#$1)')
        if (element.tagName === 'IMG') {
            const source = element as HTMLImageElement
            copy.setAttribute('src', await this.asset(source.currentSrc || source.src))
            copy.removeAttribute('srcset')
        }
        if (element.tagName === 'IFRAME') {
            const frame = element as HTMLIFrameElement
            const body = frame.contentDocument?.body
            if (!body) throw new Error('Widget document unavailable')
            const viewport = document.createElement('div')
            viewport.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden'
            const child = await this.clone(body)
            if (frame.contentDocument?.body !== body) throw new Error('Widget document was replaced')
            if (child) viewport.append(child)
            copy.append(viewport)
        } else {
            const children = await Promise.all([...element.childNodes].map(child => this.clone(child, styles)))
            for (const child of children) if (child) copy.append(child)
        }
        this.active()
        return copy
    }

    private async prepare(content: HTMLElement): Promise<Prepared> {
        const doc = content.ownerDocument, view = doc.defaultView
        if (!view || !content.isConnected) throw new Error('Widget document was replaced')
        await abortable(doc.fonts.ready, this.lifetime.signal)
        const body = content === doc.body, rect = content.getBoundingClientRect()
        const width = body ? view.innerWidth : rect.width, height = body ? view.innerHeight : rect.height
        const copy = await this.clone(content) as HTMLElement | null
        if (!copy || !content.isConnected || (view.frameElement && (view.frameElement as HTMLIFrameElement).contentDocument !== doc)) throw new Error('Widget document was replaced')
        const ids = new Set<string>()
        for (const element of [copy, ...copy.querySelectorAll('[id]')]) {
            if (!element.id) continue
            if (ids.has(element.id)) throw new Error('Nested documents require isolated SVG identifiers')
            ids.add(element.id)
        }
        if (!body) {
            copy.style.margin = '0'; copy.style.position = 'absolute'
            copy.style.left = '0'; copy.style.top = '0'; copy.style.transform = 'none'
        }
        return { copy, width, height }
    }

    /** Cache only byte-identical complete snapshots, rasterizing SVG to avoid retaining old document trees. */
    private async toImage(copy: HTMLElement, width: number, height: number, scale: number, key: object): Promise<ImageBitmap> {
        this.active()
        const svg = document.createElementNS(svgNamespace, 'svg')
        svg.setAttribute('width', String(Math.floor(Math.ceil(width) * scale)))
        svg.setAttribute('height', String(Math.floor(Math.ceil(height) * scale)))
        svg.setAttribute('viewBox', `0 0 ${Math.ceil(width)} ${Math.ceil(height)}`)
        const foreign = document.createElementNS(svgNamespace, 'foreignObject')
        foreign.setAttribute('width', '100%'); foreign.setAttribute('height', '100%')
        foreign.append(copy); svg.append(foreign)
        const source = new XMLSerializer().serializeToString(svg)
        const previous = this.snapshots.get(key)
        if (previous?.source === source) return previous.image
        const image = new Image()
        let canvas: OffscreenCanvas | undefined
        try {
            image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source)
            await abortable(image.decode(), this.lifetime.signal)
            this.active()
            canvas = previous?.canvas ?? new OffscreenCanvas(image.width, image.height)
            canvas.width = image.width; canvas.height = image.height
            const context = canvas.getContext('2d')
            if (!context) throw new Error('Canvas rendering is unavailable')
            context.drawImage(image, 0, 0)
            const bitmap = canvas.transferToImageBitmap()
            previous?.image.close()
            this.snapshots.set(key, { source, image: bitmap, canvas, verified: false })
            return bitmap
        } catch (error) {
            if (canvas && canvas !== previous?.canvas) { canvas.width = 0; canvas.height = 0 }
            throw error
        } finally { image.src = '' }
    }

    /** Combine only compatible layers; duplicate SVG IDs retain separate document scopes. */
    async captureOverlay(items: readonly OverlayLayer[], bounds: DOMRect, scale: number): Promise<ImageBitmap | null> {
        if (this.combinedDisabled || !items.length || !items.every(item => item.native && !this.failed.has(item.content))) return null
        try {
            const prepared = await Promise.all(items.map(item => this.prepare(item.content)))
            const root = document.createElement('div')
            root.style.cssText = `position:relative;width:${bounds.width}px;height:${bounds.height}px`
            const ids = new Set<string>()
            for (const [index, value] of prepared.entries()) {
                for (const node of [value.copy, ...value.copy.querySelectorAll('[id]')]) {
                    if (!node.id) continue
                    if (ids.has(node.id)) { this.combinedDisabled = true; return null }
                    ids.add(node.id)
                }
                const viewport = document.createElement('div'), position = items[index]!.pos
                viewport.style.cssText = `position:absolute;left:${position.x}px;top:${position.y}px;width:${Math.ceil(value.width)}px;height:${Math.ceil(value.height)}px;overflow:hidden;isolation:isolate`
                viewport.append(value.copy); root.append(viewport)
            }
            const image = await this.toImage(root, bounds.width, bounds.height, scale, this)
            this.retain([this])
            return image
        } catch {
            this.active()
            this.combinedDisabled = true
            return null
        }
    }

    /** Capture compatible layers independently, leaving failed or custom content to the existing renderer. */
    async capture(item: OverlayLayer, scale: number): Promise<ImageBitmap | null> {
        if (!item.native || this.failed.has(item.content)) return null
        try {
            const { copy, width, height } = await this.prepare(item.content)
            return await this.toImage(copy, width, height, scale, item.content)
        } catch {
            this.active()
            this.failed.add(item.content)
            return null
        }
    }
}
