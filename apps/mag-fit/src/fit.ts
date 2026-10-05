/* oxlint-disable unicorn/no-new-array -- Preserve sparse allocation and original numerical evaluation. */
import { array_mean, array_scale, array_sqrt } from "@webtools/numerics"
import { Quaternion, slerp, right_angle_rotation, get_rotation_name } from "./quaternion.ts"
import { apply_params, wrap_2PI, calc_error } from "./calibration.ts"
import { emptyFit, type LogData, type FitOptions, type FitOutput, type VectorSeries, type QuaternionSeries, type Calibration, type Matrix, type MatrixApi, type FitResult } from "./types.ts"
const offsets_range = [-1500, 1500], diagonals_range = [0.8, 1.2], off_diagonals_range = [-0.2, 0.2], scale_range = [0.8, 1.2]
/** Calculate all legacy fit variants on a fresh session copy; no DOM, vendor plot, or asynchronous state is retained. */
export function calculateFit(data: LogData, options: FitOptions, mlMatrix: MatrixApi): FitOutput {
const MAG_Data = structuredClone(data.compasses)
const earth_field = data.earth
const attitude = data.attitudes[options.attitude]!
if (!attitude) throw new Error("No attitude source selected")
const source = { ...attitude, x: [] as number[], y: [] as number[], z: [] as number[] }
const warnings: string[] = []
// Look through time array and return first index before start time
/** Keep the final sample strictly before the requested start, including the legacy zero fallback. */
function find_start_index(time: number[]) {
    const start_time = options.start

    var start_index = 0
    for (let j = 0; j<time.length; j++) {
        // Move forward start index while time is less than start time
        if (time[j]! < start_time) {
            start_index = j
        }
    }
    return start_index
}

// Look through time array and return first index after end time
/** Keep the first sample after the requested end with the legacy final-index handling. */
function find_end_index(time: number[]) {
    const end_time = options.end

    var end_index = 0
    for (let j = 0; j<time.length-1; j++) {
        // Move forward end index while time is less than end time
        if (time[j]! <= end_time) {
            end_index = j + 1
        }
    }
    return end_index
}

// Calculate yaw estimate from compass only, tilt correction
/** Tilt-compensate magnetic heading from the selected quaternions and model declination. */
function get_yaw(mag_field: VectorSeries, quaternion: QuaternionSeries) {
    const len = mag_field.x.length
    const declination_rad = earth_field.declination * (Math.PI / 180)

    let yaw = new Array<number>(len)
    let quat = new Quaternion()
    for (let i = 0; i < len; i++) {

        // Populate quaternion
        quat.q1 = quaternion.q1[i]!
        quat.q2 = quaternion.q2[i]!
        quat.q3 = quaternion.q3[i]!
        quat.q4 = quaternion.q4[i]!

        // Get roll and pitch
        const roll = quat.get_euler_roll()
        const pitch = quat.get_euler_pitch()

        // Rotate from body frame to earth frame with roll and pitch only
        // Only X/Y components are required for heading

        // Pre-cal some trig
        const cp = Math.cos(pitch)
        const sp = Math.sin(pitch)
        const sr = Math.sin(roll)
        const cr = Math.cos(roll)

        const X = cp * mag_field.x[i]! + sr * sp * mag_field.y[i]! + cr * sp * mag_field.z[i]!
        const Y =                     -1.0 * cr * mag_field.y[i]! +      sr * mag_field.z[i]!

        yaw[i]! = wrap_2PI(Math.atan2(Y,X) + declination_rad)
    }

    return yaw
}

// Calculate error weights based on attitude binning
const num_bins = 80
/** Assign expected field directions to the nearest of 80 Fibonacci unit-sphere bins. */
function calculate_bins() {
    const start = performance.now()

    // Fibonacci lattice of unit radius
    const bins = { x: new Array<number>(num_bins), y: new Array<number>(num_bins), z: new Array<number>(num_bins) }
    for (let i = 0; i < num_bins; i++) {
        const k = i + 0.5;

        const phi = Math.acos(1.0 - 2.0 * k / num_bins)
        const theta = Math.PI * (1 + Math.sqrt(5)) * k

        bins.x[i]! = Math.cos(theta) * Math.sin(phi)
        bins.y[i]! = Math.sin(theta) * Math.sin(phi)
        bins.z[i]! = Math.cos(phi)
    }

    for (let i = 0; i < MAG_Data.length; i++) {
        if (MAG_Data[i]! == null) {
            continue
        }
        const len = MAG_Data[i]!.expected.x.length
        MAG_Data[i]!.expected.bins = new Array<number>(len)

        // Find the closest bin to each point
        for (let j = 0; j < len; j++) {
            // Convert to unit
            let x = MAG_Data[i]!.expected.x[j]!
            let y = MAG_Data[i]!.expected.y[j]!
            let z = MAG_Data[i]!.expected.z[j]!
            const length = Math.sqrt(x**2 + y**2 + z**2)
            x /= length
            y /= length
            z /= length

            // Check all points
            let min_dist = Infinity
            for (let k = 0; k < num_bins; k++) {
                const dist_sq = (x - bins.x[k]!)**2 + (y - bins.y[k]!)**2 + (z - bins.z[k]!)**2

                if (dist_sq < min_dist) {
                    min_dist = dist_sq
                    MAG_Data[i]!.expected.bins[j]! = k
                }
            }
        }
    }

    const end = performance.now();
    console.log(`Binning took: ${end - start} ms`);
}

/** Weight each populated direction bin equally and report full-sphere coverage. */
function get_weights(bins: number[]) {

    const count = new Array<number>(num_bins).fill(0)

    const len = bins.length
    let num_unique_bins = 0
    let total_bins = 0
    for (let i = 0; i < len; i++) {
        if (count[bins[i]!]! == 0) {
            num_unique_bins++
        }
        count[bins[i]!]!++
        total_bins++
    }
    const mean_bin_size = total_bins / num_unique_bins
    const coverage = num_unique_bins / num_bins

    let weights = new Array<number>(len).fill(1)

    for (let i = 0; i < len; i++) {
        // Scale by mean_bin_size so that the average weight is 1, this give comparable error magnitude to the un-weighted case
        weights[i]! = mean_bin_size / count[bins[i]!]!
    }

    return { weights, coverage }
}

/** Compare supported rotations using weighted demeaned error and the original confidence ratio. */
function check_orientation() {

    const start = performance.now()

    for (let i = 0; i < 3; i++) {
        if (MAG_Data[i]! == null || !MAG_Data[i]!.rotate) {
            continue
        }

        const option = options.orientations[MAG_Data[i]!.index] ?? 0
        const fix = (option == 1) || (option == 2)
        const include_45 = (option == 2)

        // Find the start and end index
        const start_index = find_start_index(MAG_Data[i]!.time)
        const end_index = find_end_index(MAG_Data[i]!.time)+1
        const num_samples = end_index - start_index

        // Get weighting based on bins
        const weights = get_weights(MAG_Data[i]!.expected.bins.slice(start_index, end_index)).weights

        // Calculate average earth filed to match sensor to
        let ef_mean = { x:0.0, y:0.0, z:0.0 }
        for (let j = 0; j < num_samples; j++) {
            const data_index = start_index + j

            ef_mean.x += MAG_Data[i]!.expected.x[data_index]!
            ef_mean.y += MAG_Data[i]!.expected.y[data_index]!
            ef_mean.z += MAG_Data[i]!.expected.z[data_index]!
        }
        ef_mean.x /= num_samples
        ef_mean.y /= num_samples
        ef_mean.z /= num_samples

        let rotation = new Quaternion()

        // Try all rotations
        const last_rotation = 43
        let rot_error = []
        for (let rot = 0; rot <= last_rotation; rot++) {
            // Skip the weird ones
            if ((rot == 38) || (rot == 41)) {
                // ROTATION_ROLL_90_PITCH_68_yAW_293
                // ROTATION_PITCH_7
                continue
            }

            // Skip 45's if not enabled
            if (!include_45 && !right_angle_rotation(rot)) {
                continue
            }

            if (!rotation.from_rotation(rot)) {
                continue
            }

            // Rotate and take average
            let x = new Array<number>(num_samples)
            let y = new Array<number>(num_samples)
            let z = new Array<number>(num_samples)
            let mean = { x:0.0, y:0.0, z:0.0 }
            for (let j = 0; j < num_samples; j++) {
                const data_index = start_index + j

                const tmp = rotation.rotate([MAG_Data[i]!.raw.x[data_index]!,
                                             MAG_Data[i]!.raw.y[data_index]!,
                                             MAG_Data[i]!.raw.z[data_index]!])

                x[j]! = tmp[0]!
                y[j]! = tmp[1]!
                z[j]! = tmp[2]!

                mean.x += x[j]!
                mean.y += y[j]!
                mean.z += z[j]!
            }
            mean.x /= num_samples
            mean.y /= num_samples
            mean.z /= num_samples

            const offsets = {
                x: ef_mean.x - mean.x,
                y: ef_mean.y - mean.y,
                z: ef_mean.z - mean.z
            }

            let error_sum = 0
            for (let j = 0; j < num_samples; j++) {
                const data_index = start_index + j

                error_sum += ((x[j]! - MAG_Data[i]!.expected.x[data_index]! + offsets.x)**2 +
                              (y[j]! - MAG_Data[i]!.expected.y[data_index]! + offsets.y)**2 +
                              (z[j]! - MAG_Data[i]!.expected.z[data_index]! + offsets.z)**2) * weights[j]!
            }

            rot_error.push({ rotation: rot, error: error_sum / num_samples })

        }

        rot_error.sort((a, b) => a.error - b.error);

        const first = rot_error[0]!
        const second = rot_error[1]!

        const is_correct = (first.rotation == MAG_Data[i]!.params.orientation)
        const cost_ratio = second.error / first.error

        // best error must be half that of next best to be sure
        const check_valid = cost_ratio > 2

        const correct_txt = is_correct ? "correct" : "incorrect"
        let txt = "Mag " + (MAG_Data[i]!.index+1) + " " + correct_txt + " orientation " + get_rotation_name(MAG_Data[i]!.params.orientation)
        if (!is_correct) {
            txt += ", best orientation: " + get_rotation_name(first.rotation)
        }
        txt += ", second best orientation: " + get_rotation_name(second.rotation)
        txt += ", cost ratio: " + (cost_ratio).toFixed(2)
        console.log(txt)

        // Ordinal rotation
        MAG_Data[i]!.rotation = MAG_Data[i]!.params.orientation

        if (check_valid && !is_correct) {
            // Found incorrect rotation
            if (fix) {
                MAG_Data[i]!.rotation = first.rotation

            } else {
                // Warn user but do not fix
                warnings.push(
                    "Mag " + (MAG_Data[i]!.index+1) + " possible incorrect orientation: " + get_rotation_name(MAG_Data[i]!.params.orientation) + "\n" +
                    "Should be: " + get_rotation_name(first.rotation) + " ?\n" +
                    "Cost ratio: " + (cost_ratio).toFixed(2)
                )

            }

        }

        // Apply rotation
        let rot = new Quaternion()
        rot.from_rotation(MAG_Data[i]!.rotation)

        const len = MAG_Data[i]!.raw.x.length
        MAG_Data[i]!.rotated = { x: new Array<number>(len), y: new Array<number>(len), z: new Array<number>(len) }
        for (let j = 0; j < len; j++) {
            const tmp = rot.rotate([ MAG_Data[i]!.raw.x[j]!,
                                     MAG_Data[i]!.raw.y[j]!,
                                     MAG_Data[i]!.raw.z[j]! ])

            MAG_Data[i]!.rotated.x[j]! = tmp[0]!
            MAG_Data[i]!.rotated.y[j]! = tmp[1]!
            MAG_Data[i]!.rotated.z[j]! = tmp[2]!
        }

    }

    const end = performance.now();
    console.log(`Orientation check took: ${end - start} ms`);
}

/** Rotate the modeled earth field into each sample body frame using quaternion conjugation. */
function get_body_frame_ef(quaternion: QuaternionSeries) {

    const len = quaternion.q1.length

    const ret = { x: new Array<number>(len), y: new Array<number>(len), z: new Array<number>(len) }

    let q = new Quaternion()
    for (let i = 0; i < len; i++) {

        // Invert and load into helper
        q.q1 =  quaternion.q1[i]!
        q.q2 = -quaternion.q2[i]!
        q.q3 = -quaternion.q3[i]!
        q.q4 = -quaternion.q4[i]!

        const tmp = q.rotate(earth_field.vector)

        ret.x[i]! = tmp[0]!
        ret.y[i]! = tmp[1]!
        ret.z[i]! = tmp[2]!

    }

    return ret
}

/** Interpolate the selected attitude to each compass clock, then derive expected fields and yaw. */
function select_body_frame_attitude() {

    // Calculate expected for this source
    Object.assign(source, get_body_frame_ef(source.quaternion))

    // Interpolate expected to logged compass and calculate error
    for (let i = 0; i < MAG_Data.length; i++) {
        if (MAG_Data[i]! == null) {
            continue
        }

        // Spherical interpolation between arrays of quatenions
        /** Interpolate sorted quaternion samples with endpoint clamping and the original sequential search. */
        function array_slerp(values: QuaternionSeries, index: number[], query_index: number[]) {

            const len = query_index.length
            let ret: QuaternionSeries = { q1: new Array<number>(len), q2: new Array<number>(len), q3: new Array<number>(len), q4: new Array<number>(len), yaw: [] }

            const last_value_index = index.length - 1
            let interpolate_index = 0
            for (let i = 0; i < len; i++) {

                if (query_index[i]! <= index[0]!) {
                    // Before start
                    ret.q1[i]! = values.q1[0]!
                    ret.q2[i]! = values.q2[0]!
                    ret.q3[i]! = values.q3[0]!
                    ret.q4[i]! = values.q4[0]!

                    continue
                }
                if (query_index[i]! >= index[last_value_index]!) {
                    // After end
                    ret.q1[i]! = values.q1[last_value_index]!
                    ret.q2[i]! = values.q2[last_value_index]!
                    ret.q3[i]! = values.q3[last_value_index]!
                    ret.q4[i]! = values.q4[last_value_index]!
                    continue
                }

                // increment index until there is a point after the target
                for (interpolate_index; interpolate_index < last_value_index; interpolate_index++) {
                    if (query_index[i]! < index[interpolate_index+1]!) {
                        const ratio = (query_index[i]! - index[interpolate_index]!) / (index[interpolate_index+1]! - index[interpolate_index]!)

                        // Create A and C quaternions
                        const a = { q1: values.q1[interpolate_index]!,     q2: values.q2[interpolate_index]!,     q3: values.q3[interpolate_index]!,     q4: values.q4[interpolate_index]!}
                        const c = { q1: values.q1[interpolate_index + 1]!, q2: values.q2[interpolate_index + 1]!, q3: values.q3[interpolate_index + 1]!, q4: values.q4[interpolate_index + 1]!}

                        // interpolate
                        const b = slerp(a, c, ratio)

                        ret.q1[i]! = b.q1
                        ret.q2[i]! = b.q2
                        ret.q3[i]! = b.q3
                        ret.q4[i]! = b.q4

                        break
                    }
                }

            }
            return ret
        }

        MAG_Data[i]!.quaternion = array_slerp(source.quaternion, source.quaternion.time, MAG_Data[i]!.time)

        // Get yaw from quaternion for comparison later
        let quat = new Quaternion()
        const len = MAG_Data[i]!.quaternion.q1.length
        MAG_Data[i]!.quaternion.yaw = new Array<number>(len)
        for (let j = 0; j < len; j++) {

            // Populate quaternion
            quat.q1 = MAG_Data[i]!.quaternion.q1[j]!
            quat.q2 = MAG_Data[i]!.quaternion.q2[j]!
            quat.q3 = MAG_Data[i]!.quaternion.q3[j]!
            quat.q4 = MAG_Data[i]!.quaternion.q4[j]!

            MAG_Data[i]!.quaternion.yaw[j]! = quat.get_euler_yaw()

        }

        // Rotate earth field into body frame
        MAG_Data[i]!.expected = { ...get_body_frame_ef(MAG_Data[i]!.quaternion), bins: [] }

        // Error between existing calibration and expected
        MAG_Data[i]!.orig.error = calc_error(MAG_Data[i]!.expected, MAG_Data[i]!.orig)

        // Yaw estimate from existing calibration
        MAG_Data[i]!.orig.yaw = get_yaw(MAG_Data[i]!.orig, MAG_Data[i]!.quaternion)
    }
}

/** Solve offset, scale and iron variants with optional motor regressors and legacy parameter bounds. */
function fit() {

    const start = performance.now()

    // Run fit
    for (let i = 0; i < MAG_Data.length; i++) {
        if (MAG_Data[i]! == null) {
            continue
        }

        // Find the start and end index
        const start_index = find_start_index(MAG_Data[i]!.time)
        const end_index = find_end_index(MAG_Data[i]!.time)+1
        const num_samples = end_index - start_index

        // Get weighting based on bins
        const weight_obj = get_weights(MAG_Data[i]!.expected.bins.slice(start_index, end_index))
        const weights = weight_obj.weights
        const sqrt_weight = array_sqrt(weights)

        // Update coverage graphic
        MAG_Data[i]!.coverage = weight_obj.coverage

        // Calculate original fit error for selected samples only
        let error_sum = 0
        for (let j = 0; j < num_samples; j++) {
            error_sum += weights[j]! * MAG_Data[i]!.orig.error[start_index + j]!**2
        }
        MAG_Data[i]!.orig.mean_error = Math.sqrt(error_sum / num_samples)

        let rot: VectorSeries = { x: [], y: [], z: [] }
        let orientation: number
        if (!MAG_Data[i]!.rotate) {
            // Use raw directly
            rot.x = MAG_Data[i]!.raw.x
            rot.y = MAG_Data[i]!.raw.y
            rot.z = MAG_Data[i]!.raw.z

            // Original orientation
            orientation = MAG_Data[i]!.params.orientation

        } else {
            // use rotation corrected
            rot.x = MAG_Data[i]!.rotated.x
            rot.y = MAG_Data[i]!.rotated.y
            rot.z = MAG_Data[i]!.rotated.z

            // New orientation (possibly)
            orientation = MAG_Data[i]!.rotation

        }

        // Solve in the form Ax = B
        let A = new mlMatrix.Matrix(num_samples*3, 12)
        let B = new mlMatrix.Matrix(num_samples*3, 1)
        let B2 = new mlMatrix.Matrix(num_samples*3, 1)

        /** Write the symmetric iron correction columns into the weighted least-squares design matrix. */
        function setup_iron(A: Matrix, row: number, colum: number, x: number, y: number, z: number) {

            const x_row = row + 0
            const y_row = row + 1
            const z_row = row + 2

            // Diagonal 1
            A.data[x_row]![colum]! = x
            A.data[y_row]![colum]! = 0.0
            A.data[z_row]![colum]! = 0.0

            // Diagonal 2
            colum++
            A.data[x_row]![colum]! = 0.0
            A.data[y_row]![colum]! = y
            A.data[z_row]![colum]! = 0.0

            // Diagonal 3
            colum++
            A.data[x_row]![colum]! = 0.0
            A.data[y_row]![colum]! = 0.0
            A.data[z_row]![colum]! = z

            // Off Diagonal 1
            colum++
            A.data[x_row]![colum]! = y
            A.data[y_row]![colum]! = x
            A.data[z_row]![colum]! = 0.0

            // Off Diagonal 2
            colum++
            A.data[x_row]![colum]! = z
            A.data[y_row]![colum]! = 0.0
            A.data[z_row]![colum]! = x

            // Off Diagonal 3
            colum++
            A.data[x_row]![colum]! = 0.0
            A.data[y_row]![colum]! = z
            A.data[z_row]![colum]! = y
        }

        /** Write independent axis offsets with the square-root sample weight. */
        function setup_offsets(A: Matrix, row: number, colum: number, weight: number) {

            const x_row = row + 0
            const y_row = row + 1
            const z_row = row + 2

            // Offset 1
            A.data[x_row]![colum]! = weight
            A.data[y_row]![colum]! = 0.0
            A.data[z_row]![colum]! = 0.0

            // Offset 2
            colum++
            A.data[x_row]![colum]! = 0.0
            A.data[y_row]![colum]! = weight
            A.data[z_row]![colum]! = 0.0

            // Offset 3
            colum++
            A.data[x_row]![colum]! = 0.0
            A.data[y_row]![colum]! = 0.0
            A.data[z_row]![colum]! = weight

        }

        /** Write independent motor regressors using the weighted current sample. */
        function setup_motor(A: Matrix, row: number, colum: number, val: number) {

            const x_row = row + 0
            const y_row = row + 1
            const z_row = row + 2

            // Motor 1
            A.data[x_row]![colum]! = val
            A.data[y_row]![colum]! = 0.0
            A.data[z_row]![colum]! = 0.0

            // Motor 2
            colum++
            A.data[x_row]![colum]! = 0.0
            A.data[y_row]![colum]! = val
            A.data[z_row]![colum]! = 0.0

            // Motor 3
            colum++
            A.data[x_row]![colum]! = 0.0
            A.data[y_row]![colum]! = 0.0
            A.data[z_row]![colum]! = val

        }

        /** Write the single isotropic scale regressor for all three measured axes. */
        function setup_scale(A: Matrix, row: number, colum: number, x: number, y: number, z: number) {

            const x_row = row + 0
            const y_row = row + 1
            const z_row = row + 2

            // Scale
            A.data[x_row]![colum]! = x
            A.data[y_row]![colum]! = y
            A.data[z_row]![colum]! = z

        }

        // Populate A and B
        for (let j = 0; j < num_samples; j++) {
            const index = j*3
            const data_index = start_index + j

            // A matrix, all fits include offsets, setup rest later
            setup_offsets(A, index, 0, sqrt_weight[j]!)

            // B Matrix if scale or iron are included
            B.data[index+0]![0]! = MAG_Data[i]!.expected.x[data_index]! * sqrt_weight[j]!
            B.data[index+1]![0]! = MAG_Data[i]!.expected.y[data_index]! * sqrt_weight[j]!
            B.data[index+2]![0]! = MAG_Data[i]!.expected.z[data_index]! * sqrt_weight[j]!

            // B Matrix for offsets only
            B2.data[index+0]![0]! = (MAG_Data[i]!.expected.x[data_index]! - rot.x[data_index]!) * sqrt_weight[j]!
            B2.data[index+1]![0]! = (MAG_Data[i]!.expected.y[data_index]! - rot.y[data_index]!) * sqrt_weight[j]!
            B2.data[index+2]![0]! = (MAG_Data[i]!.expected.z[data_index]! - rot.z[data_index]!) * sqrt_weight[j]!
        }

        for (let fit of MAG_Data[i]!.fits) {

            /** Complete calibration defaults, check strict fit bounds and evaluate residual and heading diagnostics. */
            function evaluate_fit(params: Omit<Partial<Calibration>, "motor"> & { offsets: number[]; motor: number[] | undefined }) {

                /** Retain the strict legacy fit acceptance bounds for offsets, iron and scale. */
                function params_valid(params: Calibration) {
                    /** Test strict interval membership so boundary values remain invalid fits. */
                    function check_range(val: number, range: readonly number[]) {
                        return (val > range[0]!) && (val < range[1]!)
                    }

                    let ret = 1
                    for (let i = 0; i < 3; i++) {
                        ret &= +check_range(params.offsets[i]!, offsets_range)
                        ret &= +check_range(params.diagonals[i]!, diagonals_range)
                        ret &= +check_range(params.off_diagonals[i]!, off_diagonals_range)
                    }
                    ret &= +check_range(params.scale, scale_range)
                    return ret
                }



                // Populate any unset params with defaults
                if (params.fit_type == null) {
                    params.fit_type = 0
                }
                if (params.diagonals == null) {
                    params.diagonals = [1.0, 1.0, 1.0]
                }
                if (params.off_diagonals == null) {
                    params.off_diagonals = [0.0, 0.0, 0.0,]
                }
                if (params.scale == null) {
                    params.scale = 1.0
                }
                if (params.motor == null) {
                    params.motor = [0.0, 0.0, 0.0]
                }
                params.orientation = orientation

                // Check param ranges
                const resolved = params as Calibration
                let ret: FitResult = { ...emptyFit(), params: resolved, valid: !!params_valid(resolved) }

                if (!ret.valid) {
                    return ret
                }

                apply_params(ret, rot, resolved, fit.value)
                ret.error = calc_error(MAG_Data[i]!.expected, ret)

                // Calculate error for selected samples only
                let error_sum = 0
                for (let j = 0; j < num_samples; j++) {
                    error_sum += weights[j]! * ret.error[start_index + j]!**2
                }
                ret.mean_error = Math.sqrt(error_sum / num_samples)

                ret.yaw = get_yaw(ret, MAG_Data[i]!.quaternion)

                return ret
            }


            const fit_mot = fit.value != null

            // Just fitting offsets, possibly with motor correction
            A.columns = fit_mot ? 6 : 3

            if (fit_mot) {
                for (let j = 0; j < num_samples; j++) {
                    const index = j*3
                    const data_index = start_index + j
                    setup_motor(A, index, 3, fit.value![data_index]! * sqrt_weight[j]!)
                }
            }

            // Solve
            let params = mlMatrix.solve(A, B2)

            // Extract params
            let offsets = [ params.get(0,0), params.get(1,0), params.get(2,0) ]

            let motor
            if (fit_mot) {
                motor = [params.get(3,0), params.get(4,0), params.get(5,0)]
            }

            Object.assign(fit.offsets, evaluate_fit({offsets, motor, fit_type: fit.type }))


            // Just fitting offsets and scale, possibly with motor correction
            A.columns = fit_mot ? 7 : 4

            // Offsets already in column 0,1,2
            // Add scale and motor
            for (let j = 0; j < num_samples; j++) {
                const index = j*3
                const data_index = start_index + j

                setup_scale(A, index, 3, rot.x[data_index]! * sqrt_weight[j]!, rot.y[data_index]! * sqrt_weight[j]!, rot.z[data_index]! * sqrt_weight[j]!)

                if (fit_mot) {
                    setup_motor(A, index, 4, fit.value![data_index]! * sqrt_weight[j]!)
                }
            }

            // Solve
            params = mlMatrix.solve(A, B)

            // Extract params
            let scale = params.get(3,0)

            // Remove scale from offsets
            offsets = array_scale([ params.get(0,0), params.get(1,0), params.get(2,0) ], 1 / scale)

            if (fit_mot) {
                motor = [params.get(4,0), params.get(5,0), params.get(6,0)]
            }
            Object.assign(fit.scale, evaluate_fit({offsets, scale, motor, fit_type: fit.type }))

            // Fitting offsets and iron matrix, possibly with motor correction

            // Adjust size of A matrix depending if full mot fit is being done
            A.columns = fit_mot ? 12 : 9

            for (let j = 0; j < num_samples; j++) {
                const index = j*3
                const data_index = start_index + j

                setup_iron(A, index, 3, rot.x[data_index]! * sqrt_weight[j]!, rot.y[data_index]! * sqrt_weight[j]!, rot.z[data_index]! * sqrt_weight[j]!)

                if (fit_mot) {
                    setup_motor(A, index, 9, fit.value![data_index]! * sqrt_weight[j]!)
                }

            }

            // Solve
            params = mlMatrix.solve(A, B)

            // Extract params
            let diagonals =     [ params.get(3,0), params.get(4,0), params.get(5,0) ]
            let off_diagonals = [ params.get(6,0), params.get(7,0), params.get(8,0) ]

            // Remove iron correction from offsets
            const iron = new mlMatrix.Matrix([
                [diagonals[0]!,     off_diagonals[0]!, off_diagonals[1]!],
                [off_diagonals[0]!, diagonals[1]!,     off_diagonals[2]!],
                [off_diagonals[1]!, off_diagonals[2]!, diagonals[2]!]
            ])
            const uncorrected_offsets = new mlMatrix.Matrix([[params.get(0,0), params.get(1,0), params.get(2,0)]])
            offsets = Array.from(uncorrected_offsets.mmul(mlMatrix.inverse(iron)).data[0]!)

            // Normalize iron matrix into scale param
            scale = array_mean(diagonals)
            diagonals = array_scale(diagonals, 1 / scale)
            off_diagonals = array_scale(off_diagonals, 1 / scale)

            if (fit_mot) {
                motor = [params.get(9,0), params.get(10,0), params.get(11,0)]
            }

            Object.assign(fit.iron, evaluate_fit({offsets, scale, diagonals, off_diagonals, motor, fit_type: fit.type}))


        }

    }

    const end = performance.now();
    console.log(`Fit took: ${end - start} ms`);

}


select_body_frame_attitude(); calculate_bins(); check_orientation(); fit();
return { compasses: MAG_Data, source, warnings }
}
