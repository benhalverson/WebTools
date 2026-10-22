import { fileURLToPath } from 'node:url'

/** Use the published Turf 6 bundle so polygon-clipping and its embedded numerical
 * dependencies are identical to the legacy CDN payload, not newer semver resolutions. */
export const mapVendorAliases = {
    'legacy-turf': fileURLToPath(new URL('../node_modules/@turf/turf/turf.min.js', import.meta.url)),
}
