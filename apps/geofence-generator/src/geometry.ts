/* oxlint-disable unicorn/no-new-array -- Preserve sparse legacy arrays and RangeError behavior. */
import { array_sum, array_mean } from '@webtools/numerics'
import type { Feature, Polygon } from 'geojson'

export type FenceFeature = Feature<Polygon>
export interface XY { x: number[]; y: number[] }
export interface Simplified { x: number[][]; y: number[][]; radius: (number | undefined)[] }
export interface FenceDownload { text: string; filename: string; simplified: Simplified; vertices: number[][][] }

/** Generate legacy QGC bytes, mutating ring order on every call, including the 228 rotations. Empty rings throw as before. */
export function generateFence(feature: FenceFeature, name: string): FenceDownload {

    const polys = feature.geometry.coordinates
    const len = polys.length

    // Origin for conversion to cartesian
    const origin = polys[0]![0]!

    // Convert to cartesian
    const cartesian = { x: new Array<number[]>(len), y: new Array<number[]>(len) }
    for (let i = 0; i<len; i++) {
        const points = polys[i]!
        let xy_len = points.length
        if ((points[0]![0]! == points[xy_len-1]![0]!) && (points[0]![1]! == points[xy_len-1]![1]!)) {
            // Drop last point if it is the same as the first
            xy_len -= 1
            points.pop()
        }


        for (let i = 0; i < 228; i++) {
            points.push(points.shift()!);
        }

        const xy = convertToCartesian(points, xy_len, origin)
        cartesian.x[i]! = xy.x
        cartesian.y[i]! = xy.y
    }

    // Simplify
    const simplified = simplify_poly(cartesian.x, cartesian.y)

    // Convert back to lat, lon
    const lat_lon = new Array<{ lat: number[]; lon: number[] }>(len)
    for (let i = 0; i<len; i++) {
        lat_lon[i]! = convertFromCartesian(simplified.x[i]!, simplified.y[i]!, origin)
    }

    // Save to file
    // sanitize name for use in file
    name = name.replace('/', '_')
    name = name.replace('\\', '_')

    let text = 'QGC WPL 110\n'
    let points = 1
    for (let i = 0; i<len; i++) {
        const poly_type = i === 0 ? 5001 : 5002
        const circle_type = i === 0 ? 5003 : 5004
        if (simplified.radius[i]! == null) {
            // polygon points
            const poly_len = lat_lon[i]!.lat.length
            for (let j = 0; j<poly_len; j++) {
                text += `${points} 0 3 ${poly_type} ${poly_len} 0 0 0 ${lat_lon[i]!.lat[j]!.toFixed(6)} ${lat_lon[i]!.lon[j]!.toFixed(6)} ${j} 1\n`
                points += 1
            }
        } else {
            // Circle point
            text += `${points} 0 3 ${circle_type} ${simplified.radius[i]!} 0 0 0 ${lat_lon[i]!.lat[0]!.toFixed(6)} ${lat_lon[i]!.lon[0]!.toFixed(6)} 0 1\n`
            points += 1
        }
    }

    return { text, filename: name + ".waypoints", simplified, vertices: polys }

}

/** Wrap longitude with JavaScript remainder, preserving negative-longitude behavior. */
export function wrap_180(angle: number): number {
    return ((angle + 180) % 360) - 180;
}

/** Clamp the latitude cosine to the legacy minimum east-west scale. */
function longitude_scale(lat: number): number {
    const scale = Math.cos(lat * (Math.PI / 180.0))
    return Math.max(scale, 0.01)
}

// convert lat lon to xy relative to origin point, note that GeoJSON uses [lon, lat]
const LATLON_TO_M = 6378100 * (Math.PI / 180.0);
/** Project GeoJSON longitude/latitude into the legacy north/east metric axes. */
export function convertToCartesian(points: number[][], len: number, origin: number[]): XY {
  const ret = { x: new Array<number>(len), y: new Array<number>(len) }
  for (let i = 0; i < len; i++) {
    ret.x[i]! = (points[i]![1]! - origin[1]!) * LATLON_TO_M;
    ret.y[i]! = wrap_180(points[i]![0]! - origin[0]!) * LATLON_TO_M * longitude_scale((points[i]![1]! + origin[1]!) * 0.5);
  }
  return ret;
}

// convert xy back to lat lon, note not GoeJSON format!
/** Invert the legacy projection without changing operation order or rounding. */
export function convertFromCartesian(x: number[], y: number[], origin: number[]): { lat: number[]; lon: number[] } {
  const len = x.length;
  const ret = { lat: new Array<number>(len), lon: new Array<number>(len) }
  for (let i = 0; i < len; i++) {
    const dlat = x[i]! / LATLON_TO_M;
    ret.lon[i]! = wrap_180(origin[0]! + ((y[i]! / LATLON_TO_M) / longitude_scale(origin[1]! + dlat / 2)));
    ret.lat[i]! = origin[1]! + dlat;
  }
  return ret;
}

// https://en.wikipedia.org/wiki/Shoelace_formula
/** Calculate unsigned shoelace area with the legacy accumulation order. */
export function polygon_area(x: number[], y: number[]): number {
    const len = x.length - 1
    let sum1 = x[len]! * y[0]!
    let sum2 = x[0]!     * y[len]!
    for (let i = 0; i<len; i++) {
        sum1 += x[i]! * y[i+1]!
        sum2 += y[i]! * x[i+1]!
    }
    return Math.abs(sum1 - sum2) * 0.5
}

// as above for thee points
/** Calculate the unsigned area used to rank removable vertices. */
function triangle_area(x: number[], y: number[]): number {
    const sum1 = x[2]! * y[0]! + x[0]! * y[1]! + x[1]! * y[2]!
    const sum2 = x[0]! * y[2]! + y[0]! * x[1]! + y[1]! * x[2]!
    return Math.abs(sum1 - sum2) * 0.5
}

// detect intersection between two points
/** Preserve the known legacy intersection defect until its separate bug-fix issue. */
export function line_intersects(seg1_start: number[], seg1_end: number[], seg2_start: number[], seg2_end: number[]): boolean {

    // do Y first, X will not trip during sweep line intersection in X axis
    const min_y_1 = Math.min(seg1_start[1]!, seg1_end[1]!)
    const max_y_2 = Math.max(seg2_start[1]!, seg2_end[1]!)
    if (min_y_1 > max_y_2) {
        return false
    }

    const max_y_1 = Math.max(seg1_start[1]!, seg1_end[1]!)
    const min_y_2 = Math.min(seg2_start[1]!, seg2_end[1]!)
    if (max_y_1 < min_y_2) {
        return false
    }

    const min_x_1 = Math.min(seg1_start[0]!, seg1_end[0]!)
    const max_x_2 = Math.max(seg2_start[0]!, seg2_end[0]!)
    if (min_x_1 > max_x_2) {
        return false
    }

    const max_x_1 = Math.max(seg1_start[0]!, seg1_end[0]!)
    const min_x_2 = Math.min(seg2_start[0]!, seg2_end[0]!)
    if (max_x_1 < min_x_2) {
        return false
    }

    // Legacy comma expressions produce scalar numbers; numeric property reads are
    // undefined, so cross products are NaN and all comparisons return false.
    // Keep the separately tracked intersection correction outside this migration.
    return false
}

// simplify polygon using Visvalingam–Whyatt
// https://en.wikipedia.org/wiki/Visvalingam%E2%80%93Whyatt_algorithm
// will not create self intersecting polygon
/** Mutate polygon arrays using legacy circle fitting and Visvalingam thresholds and tie ordering. */
export function simplify_poly(x: number[][], y: number[][]): Simplified {

    // simplification area removal threshold, set 0 to disable area threshold
    const area_threshold = 100 // m^2

    // don't simplify to less than this number of nodes
    const min_nodes = 50

    // Keep trying until less than this number of nodes
    const max_nodes = 250

    const num_poly = x.length

    // Radius of circle fence if simplified
    const radius = new Array<number | undefined>(num_poly)

    const poly_len = new Array<number>(num_poly)
    const minimum_polygon = new Array<boolean>(num_poly).fill(false)
    for (let i = 0; i<num_poly; i++) {
        poly_len[i]! = x[i]!.length
        if (poly_len[i]! <= 3) {
            minimum_polygon[i]! = true
        }
    }

    if (minimum_polygon.every(Boolean) || (array_sum(poly_len) <= min_nodes)) {
        // cant simplify any further, fewer than min number of nodes
        return { x, y, radius }
    }

    for (let i = 0; i<num_poly; i++) {
        // try replacing polygon with circle
        const center_x = array_mean(x[i]!)
        const center_y = array_mean(y[i]!)
        let radius_sum = 0
        for (let j = 0; j<poly_len[i]!; j++) {
            radius_sum += Math.sqrt(((x[i]![j]! - center_x) ** 2) + ((y[i]![j]! - center_y) ** 2))
        }
        const radius_mean = radius_sum / poly_len[i]!
        const circle_area = Math.PI * (radius_mean ** 2)
        const poly_area = polygon_area(x[i]!, y[i]!)
        if (Math.abs(circle_area -  poly_area) < area_threshold) {
            x[i]! = [center_x]
            y[i]! = [center_y]
            radius[i]! = radius_mean
            minimum_polygon[i]! = true
            poly_len[i]! = 1
        }
    }

    if (minimum_polygon.every(Boolean) || (array_sum(poly_len) <= min_nodes)) {
        // cant simplify any further, fewer than min number of nodes
        return { x, y, radius }
    }

    // Calculate the triangle areas for all polygons
    const area = new Array<number[]>(num_poly)
    for (let i = 0; i<num_poly; i++) {
        if (minimum_polygon[i]!) {
            continue
        }
        area[i]! = new Array<number>(poly_len[i]!)
        for (let j = 0; j<poly_len[i]!; j++) {
            let prev_point = j - 1
            if (prev_point < 0) {
                prev_point = poly_len[i]! - 1
            }

            let next_point = j + 1
            if (next_point >= poly_len[i]!) {
                next_point = 0
            }
            area[i]![j]! = triangle_area([x[i]![j]!, x[i]![prev_point]!, x[i]![next_point]!], [y[i]![j]!, y[i]![prev_point]!, y[i]![next_point]!])
        }
    }

    while (true) {

        // Find the smallest triangle area over all polygons
        let min_poly_val = Number.POSITIVE_INFINITY
        let min_poly_index: number | undefined
        let index_min: number | undefined
        for (let i = 0; i<num_poly; i++) {
            if (minimum_polygon[i]!) {
                continue
            }
            for (let j = 0; j<poly_len[i]!; j++) {
                if (area[i]![j]! < min_poly_val) {
                    min_poly_val = area[i]![j]!
                    min_poly_index = i
                    index_min = j
                }
            }
        }

        if ((min_poly_val > area_threshold) && (array_sum(poly_len) <= max_nodes)) {
            // reached threshold, simplification complete
            break
        }

        // Legacy fails on an undefined candidate when all areas are nonfinite and
        // the >250-node condition still requires removal. Do not invent vertex zero.
        if (min_poly_index === undefined || index_min === undefined) throw new TypeError('No simplification candidate')

        // test if removing this point will create a self intersections
        let new_intersect = false
        let prev_point = index_min - 1
        if (prev_point < 0) {
            prev_point = poly_len[min_poly_index]! - 1
        }

        let prev_prev_point = prev_point - 1
        if (prev_prev_point < 0) {
            prev_prev_point = poly_len[min_poly_index]! - 1
        }

        let next_point = index_min + 1
        if (next_point >= poly_len[min_poly_index]!) {
            next_point = 0
        }

        for (let i = 0; i<poly_len[min_poly_index]!; i++) {
            // compare all lines except the adjacent
            if ((i == prev_prev_point) || (i == prev_point) || (i == index_min) || (i == next_point)) {
                continue
            }
            let test_next_point = i + 1
            if (test_next_point >= poly_len[min_poly_index]!) {
                test_next_point = 0
            }
            if (line_intersects([x[min_poly_index]![i]!, y[min_poly_index]![i]!], [x[min_poly_index]![test_next_point]!, y[min_poly_index]![test_next_point]!], [x[min_poly_index]![prev_point]!, y[min_poly_index]![prev_point]!], [x[min_poly_index]![next_point]!, y[min_poly_index]![next_point]!])) {
                new_intersect = true
                break
            }
        }

        if (new_intersect) {
            // cant remove this point without creating intersection, set area inf so next smallest is selected
            area[min_poly_index]![index_min]! = Number.POSITIVE_INFINITY
            continue
        }

        // Remove point
        x[min_poly_index]!.splice(index_min, 1)
        y[min_poly_index]!.splice(index_min, 1)
        area[min_poly_index]!.splice(index_min, 1)
        poly_len[min_poly_index]! -= 1

        if (poly_len[min_poly_index]! == 3) {
            // cant simplify past 3 points
            minimum_polygon[min_poly_index]! = true
        }

        if (minimum_polygon.every(Boolean) || (array_sum(poly_len) <= min_nodes)) {
            // cant simplify any further, fewer than min number of nodes
            break
        }

        // recalculate area for adjacent points
        for (let j of [index_min-1, index_min]) {

            if (j >= poly_len[min_poly_index]!) {
                j = 0
            } else if (j < 0) {
                j = poly_len[min_poly_index]! - 1
            }

            let prev_point = j - 1
            if (prev_point < 0) {
                prev_point = poly_len[min_poly_index]! - 1
            }

            let next_point = j + 1
            if (next_point >= poly_len[min_poly_index]!) {
                next_point = 0
            }

            area[min_poly_index]![j]! = triangle_area([x[min_poly_index]![j]!, x[min_poly_index]![prev_point]!, x[min_poly_index]![next_point]!], [y[min_poly_index]![j]!, y[min_poly_index]![prev_point]!, y[min_poly_index]![next_point]!])
        }

        // recalculate any areas set to inf to avoid intersections
        for (let j = 0; j<poly_len[min_poly_index]!; j++) {
            if (Number.isFinite(area[min_poly_index]![j]!)) {
                continue
            }

            let prev_point = j - 1
            if (prev_point < 0) {
                prev_point = poly_len[min_poly_index]! - 1
            }
            let next_point = j + 1
            if (next_point >= poly_len[min_poly_index]!) {
                next_point = 0
            }
            area[min_poly_index]![j]! = triangle_area([x[min_poly_index]![j]!, x[min_poly_index]![prev_point]!, x[min_poly_index]![next_point]!], [y[min_poly_index]![j]!, y[min_poly_index]![prev_point]!, y[min_poly_index]![next_point]!])
        }
    }

    return { x, y, radius }
}
