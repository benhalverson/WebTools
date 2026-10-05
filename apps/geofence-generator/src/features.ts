import turf from 'legacy-turf'
import osmtogeojson from 'osmtogeojson'
import type { Feature, Geometry } from 'geojson'
import type { FenceFeature } from './geometry.ts'

/** Decode legacy Overpass XML. Optional validation belongs only to new local uploads. */
export function parseWaterways(text: string, validate = false): Feature<Geometry>[] {
    const xml = new DOMParser().parseFromString(text, 'text/xml')
    if (validate && xml.querySelector('parsererror')) throw new Error('Invalid OpenStreetMap XML')
    return osmtogeojson(xml).features
}

/** Split multipolygons in their original order; preserve properties and identifiers. */
export function polygons(features: Feature<Geometry>[], crop: FenceFeature | null): FenceFeature[] {
    return features.flatMap(feature => {
        const result = crop ? turf.intersect(feature, crop) : feature
        if (!result) return []
        if (result.geometry.type !== 'Polygon' && result.geometry.type !== 'MultiPolygon') return []
        const coordinates = result.geometry.type === 'Polygon' ? [result.geometry.coordinates] : result.geometry.coordinates
        return coordinates.map(rings => ({ ...feature, geometry: { type: 'Polygon' as const, coordinates: rings } }))
    })
}

/** Match localized legacy popup labels and filename preference, including unknown names. */
export function featureName(feature: FenceFeature, language: string): { label: string; filename: string } {
    const properties = feature.properties ?? {}
    const local: unknown = properties['name:' + language.split('-')[0]]
    const name: unknown = properties.name
    return { label: local != null ? String(local) + (name != null ? ` (${String(name)})` : '') : String(name ?? 'unknown'),
        filename: String(local ?? name ?? 'unknown') }
}

/** Construct the unchanged Overpass query for the visible south/west/north/east bounds. */
export function waterQuery(south: number, west: number, north: number, east: number): string {
    const bounds = `[bbox:${south},${west},${north},${east}];`
    const areas = `(area[landuse=reservoir];
         area[natural=water][!water];
         area[water=lake];
         area[water=reservoir];
         area[water=basin];
         area[water=lagoon];
         area[water=pond];)-> .water;
         relation(pivot.water);
        out geom;`
    const ways = `(way[landuse=reservoir];
         way[natural=water][!water];
         way[water=lake];
         way[water=pond];
         way[water=basin];
         way[water=lagoon];
         way[water=reservoir];);
        out geom;`
    return 'data=' + encodeURIComponent(bounds + areas + ways)
}
