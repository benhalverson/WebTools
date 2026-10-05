import L from 'leaflet'
import type { DisplaySettings } from './settings.ts'

export const tileProviders: Record<string, { url: string; opts: L.TileLayerOptions }> = {
                "osm": {
                    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                    opts: { maxZoom: 19, attribution: "© OpenStreetMap" }
                },
                "opentopomap": {
                    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
                    opts: { maxZoom: 17, attribution: "© OpenTopoMap (CC-BY-SA)" }
                },
                "carto-light": {
                    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
                    opts: { maxZoom: 20, subdomains: "abcd", attribution: "© OpenStreetMap © CARTO" }
                },
                "carto-dark": {
                    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
                    opts: { maxZoom: 20, subdomains: "abcd", attribution: "© OpenStreetMap © CARTO" }
                },
                "esri-world-imagery": {
                    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                    opts: { maxZoom: 20, attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" }
                },
                "au-ga-topo": {
                    url: "https://services.ga.gov.au/gis/rest/services/NationalBaseMap/MapServer/tile/{z}/{y}/{x}",
                    opts: { maxZoom: 20, attribution: "© Geoscience Australia" }
                },
                "uk-os-opendata": {
                    url: "https://tiles.arcgis.com/tiles/knu9Ytn4VsWTJ4CG/arcgis/rest/services/OS_Open_Zoomstack_3857/MapServer/tile/{z}/{y}/{x}",
                    opts: { maxZoom: 20, attribution: "© Ordnance Survey OpenData" }
                }
            }
const googleTypes: Record<string, string> = { google: 'roadmap', 'google-terrain': 'terrain', 'google-satellite': 'satellite', 'google-hybrid': 'hybrid' }
declare global { interface Window { L?: typeof L; google?: { maps?: unknown }; __onGMapsLoaded?: () => void } }
declare module 'leaflet' { namespace gridLayer { function googleMutant(options: { type: string }): GridLayer } }

let mutant: Promise<void> | undefined
/** Load the unchanged pinned classic plugin against this app's Leaflet instance once. */
function loadMutant(): Promise<void> {
    if (mutant) return mutant
    window.L = L
    mutant = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = import.meta.env.BASE_URL + 'vendor/Leaflet.GoogleMutant.js'
        script.onload = () => resolve()
        script.onerror = () => { mutant = undefined; script.remove(); reject(new Error('Google map plugin unavailable')) }
        document.head.appendChild(script)
    })
    return mutant
}
let googleState: 'idle' | 'loading' | 'ready' = 'idle'
const googleListeners = new Set<{ ready: () => void; failed: () => void }>()
/** Keep one SDK loader dispatcher alive while subscriptions belong to mounted provider layers. */
function loadGoogle(key: string, ready: () => void, failed: () => void): () => void {
    if (window.google?.maps || googleState === 'ready') { ready(); return () => {} }
    const listener = { ready, failed }; googleListeners.add(listener)
    if (googleState === 'idle') {
        googleState = 'loading'
        const script = document.createElement('script')
        /** Notify only current owners; a late SDK callback remains a safe callable dispatcher. */
        window.__onGMapsLoaded = () => { googleState = 'ready'; const listeners = [...googleListeners]; googleListeners.clear(); listeners.forEach(item => item.ready()) }
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&callback=__onGMapsLoaded`
        script.async = true; script.defer = true
        /** Release failed loader ownership and allow a subsequent selected provider to retry. */
        script.onerror = () => { googleState = 'idle'; script.remove(); const listeners = [...googleListeners]; googleListeners.clear(); listeners.forEach(item => item.failed()) }
        document.head.appendChild(script)
    }
    return () => { googleListeners.delete(listener) }
}
/** Own the provider layer and loader subscription so replaced maps never acquire stale layers. */
export function attachTiles(map: L.Map, settings: DisplaySettings): () => void {
    let active = true, layer: L.Layer | undefined, unsubscribe: (() => void) | undefined
    /** Install the exact legacy XYZ metadata, including unknown-provider fallback. */
    function fallback(): void {
        if (!active) return
        const meta = tileProviders[settings.tiles] ?? tileProviders.osm!
        layer = L.tileLayer(meta.url, meta.opts).addTo(map)
    }
    /** Complete Google setup only while this exact provider lifetime remains mounted. */
    function ready(): void {
        if (!active) return
        void loadMutant().then(() => { if (active) { try { layer = L.gridLayer.googleMutant({ type: googleTypes[settings.tiles]! }).addTo(map) } catch { fallback() } } }, fallback)
    }
    if (!googleTypes[settings.tiles] || !settings.googleKey) fallback()
    else unsubscribe = loadGoogle(settings.googleKey, ready, fallback)
    return () => { active = false; unsubscribe?.(); layer?.remove() }
}
