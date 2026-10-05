import L from 'leaflet'
export type LocationProvider = Pick<Geolocation, 'watchPosition' | 'clearWatch'>
/** Own a location watch, retry timer and map layers; the GCS never auto-centers on the user. */
export function watchLocation(map: L.Map, provider: LocationProvider, report: (text: string) => void): () => void {
    let watch: number | null = null, retry: ReturnType<typeof setTimeout> | undefined, errors = 0, active = true
    let marker: L.CircleMarker | undefined, accuracy: L.Circle | undefined
    /** Cancel retries and remove every resource, including a valid watch ID of zero. */
    function stop(): void { active = false; clearTimeout(retry); if (watch !== null) provider.clearWatch(watch); watch = null; marker?.remove(); accuracy?.remove() }
    /** Update position/accuracy layers without disturbing the user's pan or zoom. */
    function position(pos: GeolocationPosition): void {
        if (!active) return
        errors = 0
        const ll: L.LatLngTuple = [pos.coords.latitude, pos.coords.longitude]
        if (!marker) marker = L.circleMarker(ll, { radius: 7, color: '#2962ff', fillColor: '#2962ff', fillOpacity: 0.9, weight: 2 }).addTo(map).bindPopup('You are here')
        else marker.setLatLng(ll)
        if (!accuracy) accuracy = L.circle(ll, { color: '#2962ff', weight: 1, dashArray: '4 2', fillOpacity: 0.08, radius: pos.coords.accuracy }).addTo(map)
        else { accuracy.setLatLng(ll); accuracy.setRadius(pos.coords.accuracy) }
    }
    /** Retry temporary failures after fifteen seconds, stopping on denial or fifty failures. */
    function error(err: GeolocationPositionError): void {
        if (!active) return
        errors++
        if (err.code === 1 || errors >= 50) { report(err.code === 1 ? 'Location permission denied' : 'Location unavailable after multiple attempts'); stop(); return }
        report('Location error, will retry…'); clearTimeout(retry)
        if (watch !== null) provider.clearWatch(watch)
        watch = null; retry = setTimeout(() => { retry = undefined; if (active) start() }, 15000)
    }
    /** Install one high-accuracy watch with the unchanged legacy timeout options. */
    function start(): void { watch = provider.watchPosition(position, error, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }) }
    start(); report('Locating…')
    return stop
}
/** Provide deterministic local location fixes without requesting device location. */
export const simulatedLocation: LocationProvider = {
    /** Queue a single simulated fix; retain its timer as the cancellable watch ID. */
    watchPosition(success) { return window.setTimeout(() => success({ coords: { latitude: -35.0005, longitude: 149.0005, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON() { return {} } }, timestamp: Date.now(), toJSON() { return {} } }), 0) },
    /** Cancel a pending simulated fix. */
    clearWatch(id) { window.clearTimeout(id) },
}
