import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileInput, LoadingOverlay, downloadFile, useLoading } from '@webtools/react-workflows'
import type { Feature, Geometry } from 'geojson'
import { FenceMap, type Selection } from './map.ts'
import { featureName, parseWaterways, polygons, waterQuery } from './features.ts'
import { generateFence, type FenceFeature } from './geometry.ts'

/** Own request cancellation, selected geometry, popup controls, files and the map lifetime. */
export default function App() {
    const element = useRef<HTMLDivElement>(null)
    const map = useRef<FenceMap | undefined>(undefined)
    const request = useRef<AbortController | undefined>(undefined)
    const [ready, setReady] = useState(false)
    const [zoom, setZoom] = useState(5)
    const [features, setFeatures] = useState<Feature<Geometry>[]>([])
    const [crop, setCrop] = useState<FenceFeature | null>(null)
    const [selection, setSelection] = useState<Selection | null>(null)
    const [canCrop, setCanCrop] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [query, setQuery] = useState('')
    const [places, setPlaces] = useState<{ name: string; bounds: [number, number, number, number] }[]>([])
    /** Convert errors into a visible message without losing the editor session. */
    const report = useCallback((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)), [])
    const loading = useLoading(report)
    useEffect(() => {
        const lifetime = new AbortController()
        if (element.current) void FenceMap.create(element.current, { zoom: setZoom, crop: setCrop, select: setSelection }, lifetime.signal)
            .then(instance => { if (instance) { map.current = instance; setReady(true) } }).catch(report)
        return () => { lifetime.abort(); request.current?.abort(); map.current?.dispose(); map.current = undefined }
    }, [report])
    const displayed = useMemo(() => {
        try { return { features: polygons(features, crop), error: '' } }
        catch (reason) { return { features: [] as FenceFeature[], error: reason instanceof Error ? reason.message : String(reason) } }
    }, [features, crop])
    useEffect(() => { if (ready) map.current?.setFeatures(displayed.features) }, [ready, displayed])

    /** Abort the previous operation; its completion can no longer update this editor. */
    function begin(): AbortController {
        request.current?.abort()
        const controller = new AbortController()
        request.current = controller
        setBusy(true); setError('')
        return controller
    }
    /** End only the operation that still owns the editor's loading state. */
    function finish(controller: AbortController): void {
        if (request.current === controller && !controller.signal.aborted) { request.current = undefined; setBusy(false) }
    }
    /** Clear obsolete geometry and reset editable cropping when replacing the dataset. */
    function reset(): void {
        map.current?.clearCrop(); setCrop(null); setSelection(null); setFeatures([]); setCanCrop(true)
    }
    /** Fetch the visible water features using the unchanged encoded Overpass query. */
    async function search(): Promise<void> {
        if (!map.current || zoom < 11) return
        const controller = begin()
        await loading.run(async () => {
            if (controller.signal.aborted || !map.current) return
            reset()
            const bounds = map.current.map.getBounds()
            try {
                const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST',
                    body: waterQuery(bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()), signal: controller.signal })
                // Legacy interprets the body regardless of HTTP status.
                const text = await response.text()
                if (!controller.signal.aborted) setFeatures(parseWaterways(text))
                finish(controller)
            } catch (reason) { if (!controller.signal.aborted) throw reason }
        })
    }
    /** Cancel network/file work immediately; ignored late completions cannot replace geometry. */
    function cancel(): void { request.current?.abort(); request.current = undefined; setBusy(false); loading.cancel() }
    /** Read a local recorded Overpass response with cancellation guarding the asynchronous file read. */
    async function importFile(file: File | null): Promise<void> {
        if (!file) return
        const controller = begin()
        try {
            const text = await file.text()
            if (controller.signal.aborted) return
            const parsed = parseWaterways(text, true)
            reset(); setFeatures(parsed)
        } catch (reason) { if (!controller.signal.aborted) report(reason) }
        finally { finish(controller) }
    }
    /** Resolve place names through the legacy Nominatim provider with explicit request ownership. */
    async function locate(): Promise<void> {
        const controller = begin()
        setPlaces([])
        try {
            const url = new URL('https://nominatim.openstreetmap.org/search')
            url.search = new URLSearchParams({ q: query, limit: '5', format: 'json', addressdetails: '1' }).toString()
            const response = await fetch(url, { signal: controller.signal })
            if (!response.ok) throw new Error(`Location search failed (${response.status})`)
            const data: unknown = await response.json()
            if (!Array.isArray(data)) throw new Error('Invalid location response')
            const results = data.map((item: unknown) => {
                if (typeof item !== 'object' || !item || !('display_name' in item) || !('boundingbox' in item)
                    || typeof item.display_name !== 'string' || !Array.isArray(item.boundingbox) || item.boundingbox.length !== 4) throw new Error('Invalid location result')
                const bounds = item.boundingbox.map(Number)
                if (!bounds.every(Number.isFinite)) throw new Error('Invalid location bounds')
                return { name: item.display_name, bounds: bounds as [number, number, number, number] }
            })
            if (!controller.signal.aborted) { setPlaces(results); if (!results.length) setError('No results found') }
        } catch (reason) { if (!controller.signal.aborted) report(reason) }
        finally { finish(controller) }
    }
    /** Serialize the selected mutable rings and delegate the unchanged Blob to FileSaver. */
    function download(): void {
        if (!selection) return
        void loading.run(() => {
            const result = generateFence(selection.feature, featureName(selection.feature, navigator.language).filename)
            const save: unknown = Reflect.get(window, 'saveAs')
            if (typeof save !== 'function') throw new Error('File download support is unavailable')
            downloadFile((blob, filename) => { save(blob, filename) }, new Blob([result.text], { type: 'text/plain;charset=utf-8' }), result.filename)
        })
    }
    const base = import.meta.env.BASE_URL
    return <>
        <div id="mapid" ref={element} />
        <div id="menu"><table><tbody><tr><td><a href="https://ardupilot.org"><img src={base + 'images/ArduPilot.png'} /></a></td>
            <td className="description"><h1>Geofence Generator</h1>Fences generated using <a href="https://www.openstreetmap.org/">OpenStreetMap</a> <a href="https://wiki.openstreetmap.org/wiki/Overpass_API">Overpass API</a>.<br /><br />
                <input id="search" type="button" value="Search" disabled={!ready || zoom < 11 || busy} title={zoom < 11 ? 'Zoom in to enable search' : 'Search the current area'} onClick={() => void search()} />{' '}
                <input id="crop" type="button" value="Crop" disabled={!canCrop || busy} title="Add cropping polygon" onClick={() => map.current?.addCrop()} />
                <span style={{ display: 'inline-block', width: 220 }} />
                <img src={base + 'images/question-circle.svg'} style={{ width: 20, verticalAlign: 'middle' }} alt="Help" title="Locate the area, zoom in and search for water features. Click a feature to download its fence. Crop adds an editable cropping polygon." />
            </td><td><a href="https://github.com/ArduPilot/WebTools"><img src={base + 'images/github-mark.png'} style={{ width: 60 }} /><br /><img src={base + 'images/GitHub_Logo.png'} style={{ width: 60 }} /></a></td></tr></tbody></table></div>
        <div className="location-search"><form onSubmit={event => { event.preventDefault(); void locate() }}><input aria-label="Search location" placeholder="Search..." value={query} onChange={event => setQuery(event.target.value)} /><button disabled={!ready || busy || !query.trim()}>Find</button></form>
            {places.map((place, index) => <button key={index} onClick={() => { const [s, n, w, e] = place.bounds; map.current?.map.fitBounds([[s, w], [n, e]]); setPlaces([]) }}>{place.name}</button>)}
            <details><summary>Import OpenStreetMap XML</summary><FileInput id="osm-file" accept=".osm,.xml" disabled={!ready || busy} onFile={file => void importFile(file)} /></details>
        </div>
        <LoadingOverlay visible={busy || loading.visible} />
        {(busy || loading.visible || error || displayed.error) && <div className="request-controls">{(busy || loading.visible) && <button onClick={cancel}>Cancel</button>}{(error || displayed.error) && <span role="alert">{error || displayed.error}</span>}</div>}
        {selection && createPortal(<><span>Name: {featureName(selection.feature, navigator.language).label}</span><br />Points: {selection.feature.geometry.coordinates.reduce((total, ring) => total + ring.length, 0)}<br /><input type="button" value="Download" onClick={download} /></>, selection.container)}
    </>
}
