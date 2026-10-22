import L from 'leaflet'
import type { FenceFeature } from './geometry.ts'

interface EditablePolygon extends L.Polygon { enableEdit(): void; disableEdit(): void }
interface RestorableMap extends L.Map { restoreView(): boolean }
let plugins: Promise<void> | undefined

/** Load the pinned Leaflet plugins once; the legacy restore plugin requires L during installation and restoration. */
async function loadPlugins(): Promise<void> {
    plugins ??= (async () => {
        await import('leaflet-editable')
        const previous: unknown = Reflect.get(window, 'L')
        Reflect.set(window, 'L', L)
        try { await import('@bagage/leaflet.restoreview') }
        finally {
            if (previous === undefined) Reflect.deleteProperty(window, 'L')
            else Reflect.set(window, 'L', previous)
        }
    })()
    return plugins
}

/** The pinned restore plugin also reads global L while restoring a saved view. */
function restoreView(map: RestorableMap): boolean {
    const previous: unknown = Reflect.get(window, 'L')
    Reflect.set(window, 'L', L)
    try { return map.restoreView() }
    finally {
        if (previous === undefined) Reflect.deleteProperty(window, 'L')
        else Reflect.set(window, 'L', previous)
    }
}

export interface Selection { feature: FenceFeature; container: HTMLElement }
export interface MapCallbacks {
    zoom: (zoom: number) => void
    crop: (feature: FenceFeature) => void
    select: (selection: Selection | null) => void
}

/** Own the Leaflet map, editable crop, feature layers and their event listeners. */
export class FenceMap {
    readonly map: L.Map
    private cropLayer: EditablePolygon | undefined
    private layers = L.layerGroup()
    private readonly callbacks: MapCallbacks

    /** Install map resources only after plugins are available and the caller is still mounted. */
    static async create(element: HTMLElement, callbacks: MapCallbacks, signal: AbortSignal): Promise<FenceMap | undefined> {
        await loadPlugins()
        if (signal.aborted) return undefined
        return new FenceMap(element, callbacks)
    }

    /** Initialize the original projection, saved viewport and tile attribution. */
    private constructor(element: HTMLElement, callbacks: MapCallbacks) {
        this.callbacks = callbacks
        this.map = L.map(element, { editable: true, zoomControl: false } as L.MapOptions)
        L.control.zoom().addTo(this.map)
        if (!restoreView(this.map as RestorableMap)) this.map.setView([51.505, -0.09], 5)
        L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(this.map)
        this.layers.addTo(this.map)
        this.map.on('zoomend', this.onZoom)
        this.map.on('editable:vertex:dragend', this.onCrop)
        this.map.on('popupclose', this.onClose)
        this.onZoom()
    }

    /** Report viewport zoom to React so it owns search availability. */
    private readonly onZoom = (): void => { this.callbacks.zoom(this.map.getZoom()) }
    /** Publish edited crop vertices after Leaflet finishes its drag. */
    private readonly onCrop = (): void => {
        if (this.cropLayer) this.callbacks.crop(this.cropLayer.toGeoJSON() as FenceFeature)
    }
    /** Release React popup content when Leaflet closes or replaces its container. */
    private readonly onClose = (): void => { this.callbacks.select(null) }

    /** Replace rendered geometry without retaining listeners from obsolete features. */
    setFeatures(features: FenceFeature[]): void {
        this.map.closePopup()
        this.layers.clearLayers()
        for (const feature of features) {
            const layer = L.geoJSON(feature)
            const container = document.createElement('div')
            layer.bindPopup(container)
            layer.on('popupopen', () => this.callbacks.select({ feature, container }))
            layer.addTo(this.layers)
        }
    }

    /** Draw the same screen-relative crop rectangle and activate pinned vertex editing. */
    addCrop(): void {
        this.clearCrop()
        const bounds = this.map.getBounds()
        const northEast = this.map.project(bounds.getNorthEast())
        const southWest = this.map.project(bounds.getSouthWest())
        const radius = { x: (northEast.x - southWest.x) * 0.5, y: (southWest.y - northEast.y) * 0.5 }
        const center = { x: (northEast.x + southWest.x) * 0.5, y: (northEast.y + southWest.y) * 0.5 }
        const top = center.y - radius.y * 0.7
        const bottom = center.y + radius.y * 0.95
        const left = center.x - radius.x * 0.95
        const right = center.x + radius.x * 0.95
        const points = [[right, top], [right, bottom], [left, bottom], [left, top]].map(([x, y]) => this.map.unproject([x!, y!]))
        this.cropLayer = L.polygon(points, { color: '#FF0000', fill: false }).addTo(this.map) as EditablePolygon
        this.cropLayer.enableEdit()
        this.onCrop()
    }

    /** Detach editing handles before removing the crop layer. */
    clearCrop(): void {
        this.cropLayer?.disableEdit()
        this.cropLayer?.remove()
        this.cropLayer = undefined
    }

    /** Remove all map listeners, tile requests, editing handles and DOM resources. */
    dispose(): void {
        this.clearCrop()
        this.layers.clearLayers()
        this.map.off('zoomend', this.onZoom)
        this.map.off('editable:vertex:dragend', this.onCrop)
        this.map.off('popupclose', this.onClose)
        this.map.remove()
        this.map.off()
    }
}
