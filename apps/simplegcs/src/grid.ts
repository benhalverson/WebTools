import L from 'leaflet'
import { metersPerPixel, gridSpacing } from './grid-math.ts'
/** Attach one canvas and its exact map listeners; the returned cleanup owns both. */
export function attachGrid(map: L.Map): () => void {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
    if (!ctx) return () => {}
    canvas.style.cssText = 'position:absolute; top:0; left:0; pointer-events:none;'
    map.getPanes().overlayPane.appendChild(canvas)
    /** Keep the overlay aligned with Leaflet's moving layer origin. */
    function position(): void { const p = map.containerPointToLayerPoint([0, 0]); canvas.style.transform = `translate(${p.x}px, ${p.y}px)` }
    /** Draw the legacy expanded metric grid at the current size, zoom and latitude. */
    function draw(): void {
        if (!ctx) return
        const size = map.getSize(), dpr = window.devicePixelRatio || 1
        canvas.width = Math.round(size.x * dpr); canvas.height = Math.round(size.y * dpr); canvas.style.width = size.x + 'px'; canvas.style.height = size.y + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const bounds = map.getBounds(), center = map.getCenter(), latSpan = bounds.getNorth() - bounds.getSouth(), lngSpan = bounds.getEast() - bounds.getWest()
        const expanded = L.latLngBounds([[bounds.getSouth() - latSpan * 2, bounds.getWest() - lngSpan * 2], [bounds.getNorth() + latSpan * 2, bounds.getEast() + lngSpan * 2]])
        const spacing = gridSpacing(metersPerPixel(center.lat, map.getZoom()), center.lat), crs = map.options.crs!
        const nw = crs.project(expanded.getNorthWest()), se = crs.project(expanded.getSouthEast())
        const minX = Math.min(nw.x, se.x), maxX = Math.max(nw.x, se.x), minY = Math.min(nw.y, se.y), maxY = Math.max(nw.y, se.y), topLeft = map.containerPointToLayerPoint([0, 0])
        ctx.save(); ctx.translate(-topLeft.x, -topLeft.y); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255, 235, 59, 0.6)'; ctx.beginPath()
        for (let x = Math.floor(minX / spacing) * spacing; x <= maxX; x += spacing) {
            const p1 = map.latLngToLayerPoint(crs.unproject(L.point(x, minY))), p2 = map.latLngToLayerPoint(crs.unproject(L.point(x, maxY)))
            ctx.moveTo(Math.round(p1.x) + 0.5, Math.round(p1.y)); ctx.lineTo(Math.round(p2.x) + 0.5, Math.round(p2.y))
        }
        for (let y = Math.floor(minY / spacing) * spacing; y <= maxY; y += spacing) {
            const p1 = map.latLngToLayerPoint(crs.unproject(L.point(minX, y))), p2 = map.latLngToLayerPoint(crs.unproject(L.point(maxX, y)))
            ctx.moveTo(Math.round(p1.x), Math.round(p1.y) + 0.5); ctx.lineTo(Math.round(p2.x), Math.round(p2.y) + 0.5)
        }
        ctx.stroke(); ctx.restore()
    }
    map.on('zoom move', position); map.on('moveend zoomend resize viewreset', draw); draw(); position()
    return () => { map.off('zoom move', position); map.off('moveend zoomend resize viewreset', draw); canvas.remove() }
}
