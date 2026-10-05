import L from 'leaflet'
import type { OperationsState } from './operations.ts'
/** Own mission/fence layers for one snapshot; cleanup leaves telemetry and viewport untouched. */
export function attachOperationLayers(map: L.Map, state: Pick<OperationsState, 'mission' | 'fence' | 'fenceEnabled'>): () => void {
    const group = L.layerGroup().addTo(map)
    if (state.mission.length) {
        L.polyline(state.mission.map((p): L.LatLngTuple => [p.lat, p.lng]), { color: '#2196f3', weight: 3, opacity: 0.9 }).addTo(group)
        for (const p of state.mission) L.circleMarker([p.lat, p.lng], { radius: 5, color: '#0d47a1', fillColor: '#64b5f6', fillOpacity: 0.9, weight: 2 })
            .bindTooltip(String(p.seq), { permanent: true, direction: 'top', className: 'mission-wp-label' }).addTo(group)
    }
    state.fence.forEach((fence, index) => {
        const color = [5001, 5003].includes(fence.type) ? '#4caf50' : '#f44336'
        const style = { color, fillColor: color, fillOpacity: 0, weight: state.fenceEnabled ? 6 : 3, opacity: 1, dashArray: state.fenceEnabled ? undefined : '6,6' }
        if ('vertices' in fence) L.polygon(fence.vertices.map((p): L.LatLngTuple => [p.lat, p.lng]), style).addTo(group)
        else { const circle = L.circle([fence.lat, fence.lng], { ...style, radius: fence.radius }).addTo(group); if (fence.type === 5003) circle.bindPopup(`Circle Inclusion #${index}<br>Radius: ${fence.radius}m`) }
    })
    return () => { group.remove() }
}
/** Render the latest reported guided target and retire it on the legacy one-second cleanup tick. */
export function attachTarget(map: L.Map, target: OperationsState['target']): () => void {
    if (!target) return () => {}
    const marker = L.circleMarker([target.lat, target.lng], { radius: 8, color: '#f44336', fillColor: '#f44336', fillOpacity: 0.6, weight: 2 }).bindPopup('Target Position').addTo(map)
    const timer = setInterval(() => { if (Date.now() - target.seen > 5000) { marker.remove(); clearInterval(timer) } }, 1000)
    return () => { clearInterval(timer); marker.remove() }
}
