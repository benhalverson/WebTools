import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { vehicleIcon } from './icon.ts'
import { attachReposition } from './gestures.ts'
import { attachOperationLayers, attachTarget } from './operation-layers.ts'
import type { OperationsState } from './operations.ts'
import { attachGrid } from './grid.ts'
import { watchLocation, type LocationProvider } from './location.ts'
import type { LinkState } from './connection.ts'
import type { DisplaySettings } from './settings.ts'
export interface MapViewProps { operations: OperationsState; beginReposition: () => (lat: number, lng: number) => void; link: LinkState; display: DisplaySettings; location: LocationProvider; report: (text: string) => void; recenter: number; onMap?: ((map: L.Map | null) => void) | undefined }
/** Own one Leaflet instance per mount; telemetry/settings updates retain its viewport. */
export function MapView({ operations, beginReposition, link, display, location, report, recenter, onMap }: MapViewProps) {
    const element = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), marker = useRef<L.Marker | null>(null), centeredIdentity = useRef<string | null>(null)
    const observer = useRef(onMap)
    useEffect(() => {
        if (observer.current !== onMap) { observer.current?.(null); observer.current = onMap; if (map.current) onMap?.(map.current) }
    }, [onMap])
    useEffect(() => {
        const instance = L.map(element.current!, { zoomControl: true }).setView([0, 0], 2)
        L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 300 }).addTo(instance)
        map.current = instance; observer.current?.(instance)
        return () => { observer.current?.(null); instance.remove(); map.current = null; marker.current = null; centeredIdentity.current = null }
    }, [])
    useEffect(() => {
        const instance = map.current!
        if (!link.mapIdentity) centeredIdentity.current = null
        const t = link.telemetry
        if (!t.position) { marker.current?.remove(); marker.current = null; return }
        if (!marker.current) marker.current = L.marker(t.position, { icon: vehicleIcon(t.vehicleClass, t.heading || 0) }).addTo(instance)
        else { marker.current.setLatLng(t.position); marker.current.setIcon(vehicleIcon(t.vehicleClass, t.heading || 0)) }
        marker.current.setOpacity(link.stale ? 0.4 : 1)
        if (centeredIdentity.current !== t.identity) { instance.setView(t.position, 16); centeredIdentity.current = t.identity }
    }, [link])
    useEffect(() => { if (recenter && marker.current) map.current!.setView(marker.current.getLatLng(), Math.max(map.current!.getZoom(), 16)) }, [recenter])
    useEffect(() => { if (display.showGrid) return attachGrid(map.current!) }, [display.showGrid])
    useEffect(() => { if (display.showLocation) return watchLocation(map.current!, location, report) }, [display.showLocation, location, report])
    useEffect(() => attachOperationLayers(map.current!, operations), [operations.mission, operations.fence, operations.fenceEnabled])
    useEffect(() => attachTarget(map.current!, operations.target), [operations.target])
    useEffect(() => attachReposition(map.current!, beginReposition), [beginReposition, link.telemetry.identity])
    // This preview deliberately supplies an offline map surface. Provider selection
    // is retained in settings; complete provider-backed maps remain on the public app.
    return <main id="map" ref={element} aria-label="Vehicle map" data-provider={display.tiles} />
}
