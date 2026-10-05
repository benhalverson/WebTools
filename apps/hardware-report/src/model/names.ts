import { get_param_name_vector3 } from "@webtools/parameters"

/** Build legacy IMU names, preserving temperature ACC coefficients and TMAN spelling. */
export function get_ins_param_names(index: number) {
    index += 1

    let prefix = "INS"
    if (index > 3) {
        prefix += index
    }

    let num = ""
    if (index < 4) {
        num = String(index)
    }
    const full_num = num
    if (index == 1) {
        num = ""
    }

    const gyro_prefix = prefix + "_GYR" + num
    let gyro = { offset: get_param_name_vector3(gyro_prefix + "OFFS_"),
                 id: gyro_prefix + "_ID",
                 cal_temp: prefix + "_GYR" + full_num + "_CALTEMP" }

    const acc_prefix = prefix + "_ACC" + num
    let accel = { offset: get_param_name_vector3(acc_prefix + "OFFS_"),
                  scale: get_param_name_vector3(acc_prefix + "SCAL_"),
                  id: acc_prefix + "_ID",
                  cal_temp: prefix + "_ACC" + full_num + "_CALTEMP" }

    const tcal_prefix = prefix + "_TCAL" + full_num + "_"
    let tcal = { enabled: tcal_prefix + "ENABLE",
                 t_min: tcal_prefix + "TMIN",
                 t_max: tcal_prefix + "TMAN",
                 accel: [ get_param_name_vector3(tcal_prefix + "ACC1_"),
                          get_param_name_vector3(tcal_prefix + "ACC2_"),
                          get_param_name_vector3(tcal_prefix + "ACC3_")],
                 gyro: [ get_param_name_vector3(tcal_prefix + "ACC1_"),
                         get_param_name_vector3(tcal_prefix + "ACC2_"),
                         get_param_name_vector3(tcal_prefix + "ACC3_")],
                }

    return { gyro: gyro, accel: accel, tcal: tcal,
             pos: get_param_name_vector3(prefix + "_POS" + full_num + "_"),
             use: prefix + "_USE" + num }

}

/** Build the zero-based barometer instance parameter names. */
export function get_baro_param_names(index: number) {
    const prefix = "BARO" + (index+1) + "_"
    const wind_cmp =  prefix + "WCF_"

    return { id: prefix + "DEVID",
             gnd_press: prefix + "GND_PRESS",
             wind_comp: { enabled: wind_cmp + "ENABLE",
                          coefficients: [ wind_cmp + "FWD",
                                          wind_cmp + "BCK",
                                          wind_cmp + "RGT",
                                          wind_cmp + "LFT",
                                          wind_cmp + "UP",
                                          wind_cmp + "DN"], } }
}

/** Build airspeed names, including the first-instance TUBE_ORDER spelling. */
export function get_airspeed_param_names(index: number) {
    let num = String(index + 1)
    let tube_order_postfix = "TUBE_ORDR"
    if (index == 0) {
        num = ""
        tube_order_postfix = "TUBE_ORDER"
    }
    const prefix = "ARSPD" + num + "_"

    return { id: prefix + "DEVID",
             type: prefix + "TYPE",
             bus: prefix + "BUS",
             pin: prefix + "PIN",
             psi_range: prefix + "PSI_RANGE",
             tube_order: prefix + tube_order_postfix,
             skip_cal: prefix + "SKIP_CAL",
             use: prefix + "USE",
             offset: prefix + "OFFSET",
             ratio: prefix + "RATIO",
             auto_cal: prefix + "AUTOCAL"}

}
