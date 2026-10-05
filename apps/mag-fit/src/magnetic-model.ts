import { Quaternion } from './quaternion.ts'
import { SAMPLING_RES, SAMPLING_MIN_LAT, SAMPLING_MAX_LAT, SAMPLING_MIN_LON, SAMPLING_MAX_LON, intensity_table, declination_table, inclination_table } from './magnetic-data.ts'
/** Bilinearly interpolate the unchanged ten-degree legacy magnetic tables. */
export function interpolate_table(table: readonly (readonly number[])[], latitude_deg: number, longitude_deg: number) {
    // interpolate inside a table for a given lat/lon in degrees
    // round down to nearest sampling resolution
    const min_lat = Math.floor(latitude_deg / SAMPLING_RES) * SAMPLING_RES
    const min_lon = Math.floor(longitude_deg / SAMPLING_RES) * SAMPLING_RES

    // find index of nearest low sampling point
    const min_lat_index = Math.floor(-(SAMPLING_MIN_LAT) + min_lat) / SAMPLING_RES
    const min_lon_index = Math.floor(-(SAMPLING_MIN_LON) + min_lon) / SAMPLING_RES

    // calculate intensity
    const data_sw = table[min_lat_index]![min_lon_index]!
    const data_se = table[min_lat_index]![min_lon_index + 1]!
    const data_ne = table[min_lat_index + 1]![min_lon_index + 1]!
    const data_nw = table[min_lat_index + 1]![min_lon_index]!

    // perform bilinear interpolation on the four grid corners
    const data_min = ((longitude_deg - min_lon) / SAMPLING_RES) * (data_se - data_sw) + data_sw
    const data_max = ((longitude_deg - min_lon) / SAMPLING_RES) * (data_ne - data_nw) + data_nw

    return ((latitude_deg - min_lat) / SAMPLING_RES) * (data_max - data_min) + data_min
}

/** Return gauss and degrees within the original half-open geographic bounds. */
export function get_mag_field_ef(latitude_deg: number, longitude_deg: number) {
    // limit to table bounds
    if (latitude_deg < SAMPLING_MIN_LAT) {
        return
    }
    if (latitude_deg >= SAMPLING_MAX_LAT) {
        return
    }
    if (longitude_deg < SAMPLING_MIN_LON) {
        return
    }
    if (longitude_deg >= SAMPLING_MAX_LON) {
        return
    }

    // gauss
    const intensity = interpolate_table(intensity_table, latitude_deg, longitude_deg)

    // deg
    const declination = interpolate_table(declination_table, latitude_deg, longitude_deg)
    const inclination = interpolate_table(inclination_table, latitude_deg, longitude_deg)

    return { declination, inclination, intensity }
}

/** Rotate the modeled field into earth-frame milligauss, retaining the legacy model. */
export function expected_earth_field_lat_lon(lat: number | undefined, lon: number | undefined) {

    if ((lat == null) || (lon == null)) {
        return
    }

    // return expected magnetic field for a location
    const field = get_mag_field_ef(lat, lon)
    if (field == null) {
        return
    }

    let Q = new Quaternion()
    Q.from_euler(0.0, -field.inclination * (Math.PI/180), field.declination * (Math.PI/180))

    return { ...field, vector: Q.rotate([field.intensity*1000.0, 0.0, 0.0]) }
}
