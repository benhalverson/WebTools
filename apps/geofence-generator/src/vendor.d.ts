declare module 'leaflet-editable'
declare module '@bagage/leaflet.restoreview'
// The frozen published UMD bundle has no module declaration. Expose only the used API.
declare module 'legacy-turf' {
    import type { Feature, Geometry, Polygon, MultiPolygon } from 'geojson'
    const turf: {
        /** Preserve legacy unfiltered input, including unsupported-geometry runtime errors. */
        intersect(first: Feature<Geometry>, second: Feature<Polygon | MultiPolygon>): Feature<Polygon | MultiPolygon> | null
    }
    export default turf
}
