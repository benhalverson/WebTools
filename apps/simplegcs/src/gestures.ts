import type L from 'leaflet'
/** Attach the legacy 600ms/10px single-pointer hold with explicit listener/timer cleanup. */
export function attachReposition(map: L.Map, beginReposition: () => (lat: number, lng: number) => void): () => void {
    const element = map.getContainer(), pointers = new Set<number>(), abort = new AbortController(), signal = abort.signal
    let timer: ReturnType<typeof setTimeout> | undefined, active: number | null = null, start: L.Point | null = null, last: L.Point | null = null
    /** Cancel the current hold without forgetting other still-depressed pointers. */
    function clear(): void { clearTimeout(timer); timer = undefined; active = null; start = last = null }
    window.addEventListener('pointerdown', event => { pointers.add(event.pointerId); if (pointers.size > 1) clear() }, { capture: true, signal })
    element.addEventListener('pointerdown', event => {
        if (pointers.size > 1 || event.button !== 0 || (event.target instanceof Element && event.target.closest('.leaflet-control, .leaflet-popup, #video-panel, button, input, select, textarea, a'))) return
        if (event.pointerType === 'touch') event.preventDefault()
        active = event.pointerId; start = last = map.mouseEventToContainerPoint(event)
        const reposition = beginReposition()
        timer = setTimeout(() => { if (last) { const point = map.containerPointToLatLng(last); reposition(point.lat, point.lng) } clear() }, 600)
    }, { passive: false, signal })
    element.addEventListener('pointermove', event => {
        if (event.pointerId !== active) return
        if (event.pointerType === 'touch') event.preventDefault()
        last = map.mouseEventToContainerPoint(event); if (start && start.distanceTo(last) > 10) clear()
    }, { passive: false, signal })
    element.addEventListener('pointerleave', event => { if (event.pointerId === active) clear() }, { signal })
    for (const name of ['pointerup', 'pointercancel'] as const) window.addEventListener(name, event => { pointers.delete(event.pointerId); if (event.pointerId === active) clear() }, { capture: true, signal })
    window.addEventListener('blur', () => { pointers.clear(); clear() }, { signal })
    element.addEventListener('contextmenu', event => event.preventDefault(), { signal })
    return () => { clear(); pointers.clear(); abort.abort() }
}
