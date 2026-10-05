/** Preserve the Web Mercator sphere and legacy zoom-to-ground-pixel conversion. */
export function metersPerPixel(latitude: number, zoom: number): number { return Math.cos(latitude * Math.PI / 180) * 2 * Math.PI * 6378137 / (256 * Math.pow(2, zoom)) }
/** Preserve power-of-ten grid selection and its latitude correction. */
export function gridSpacing(mpp: number, latitude: number): number { return Math.pow(10, Math.floor(Math.log10(Math.max(1, 150 * mpp)))) / Math.cos(latitude * Math.PI / 180) }
