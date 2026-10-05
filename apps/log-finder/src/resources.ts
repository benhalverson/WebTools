import { vendors, type MapInstance, type Tooltip, type TooltipOptions } from './vendors.ts'
/** Own tooltip, map, transfer, read and object-URL lifetimes for one table. */
export class TableResources {
    private controller = new AbortController()
    private tips = new Set<Tooltip>()
    private urls = new Map<string, number>()
    readonly maps = new Set<MapInstance>()
    readonly transfers = new Set<() => void>()
    /** Current read cancellation signal; redraw creates a new lifetime. */
    get signal(): AbortSignal { return this.controller.signal }
    /** Track each tooltip so redraw and unmount remove its detached DOM. */
    tip(element: HTMLElement, options: TooltipOptions): void { this.tips.add(vendors().tippy(element, options)) }
    /** Trigger the legacy text download and release its temporary URL after dispatch. */
    download(blob: Blob, name: string): void {
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url; anchor.download = name; anchor.click()
        this.urls.set(url, window.setTimeout(() => { URL.revokeObjectURL(url); this.urls.delete(url) }, 40000))
    }
    /** Clear presentation resources on redraw without cancelling independent Open In transfers. */
    clearCells(): void {
        this.controller.abort(); this.controller = new AbortController()
        for (const tip of this.tips) tip.destroy()
        this.tips.clear()
        for (const map of this.maps) map.remove()
        this.maps.clear()
    }
    /** Dispose all resources when the React table owner unmounts. */
    dispose(): void {
        this.clearCells()
        for (const transfer of this.transfers) transfer()
        this.transfers.clear()
        for (const [url, timer] of this.urls) { clearTimeout(timer); URL.revokeObjectURL(url) }
        this.urls.clear()
    }
}
