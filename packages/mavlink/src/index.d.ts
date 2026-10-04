// Generated declarations from the pinned runtime metadata; do not hand edit.
/** Bytes accepted by the pinned codec; Buffer is a Uint8Array in Node. */
export type Bytes = number[] | Uint8Array;
/** jspack encodes low/high words, never a JS number or bigint. */
export type Int64Input = [low: number, high: number];
export type Int64 = [low: number, high: number, unsigned: boolean];
export type StringInput = string | number[];
/** Constructors allow empty/partial payloads; only decoded messages have complete fields. */
export type Outgoing<M extends MessageBase, Fields> = Omit<M, keyof Fields | "_header" | "_payload" | "_msgbuf" | "crc"> & Partial<Fields> & Pick<MessageBase, "_header" | "_payload" | "_msgbuf" | "crc">;
export interface Header {
    msgId: number; mlen: number; seq: number; srcSystem: number; srcComponent: number;
    incompat_flags: number; compat_flags: number;
    pack(): number[];
}
export interface MessageBase {
    _id: number; _name: string; _format: string;
    fieldnames: string[]; order_map: number[]; len_map: number[]; array_len_map: number[];
    crc_extra: number;
    _instance_field: string | undefined; _instance_offset: number;
    _header?: Header; _payload?: Bytes; _msgbuf?: Bytes;
    _signed?: boolean; _link_id?: number | undefined; crc?: number;
    pack(processor: MAVLink20Processor): number[];
    sign_packet(processor: MAVLink20Processor): void;
}
export interface BadData {
    _id: -1; _name: 'BAD_DATA'; _data: Bytes; _reason: string; _msgbuf: Bytes;
}
export interface Signing {
    secret_key: Uint8Array; timestamp: number; link_id: number; sign_outgoing: boolean;
    allow_unsigned_callback: ((processor: MAVLink20Processor, messageId: number) => boolean) | undefined;
    stream_timestamps: Record<string, number>;
    sig_count: number; badsig_count: number; goodsig_count: number; unsigned_count: number; reject_count: number;
}
/** Runtime logger receives a message on decode and (level, text) on parse errors. */
export interface Logger { log(level: string | Message, message?: string): void; }
export declare class MAVLink20Processor {
    constructor(logger?: Logger | null, srcSystem?: number, srcComponent?: number);
    logger: Logger | null | undefined;
    seq: number; srcSystem: number; srcComponent: number;
    buf: Uint8Array; bufInError: Uint8Array;
    signing: Signing;
    expected_length: number; protocol_marker: number; incompat_flags?: number;
    have_prefix_error: boolean; little_endian: boolean; crc_extra: boolean; sort_fields: boolean;
    startup_time: number; total_packets_sent: number; total_bytes_sent: number;
    total_packets_received: number; total_bytes_received: number; total_receive_errors: number;
    file?: { write(bytes: number[]): unknown };
    decode(bytes: Bytes): Message;
    parseChar(bytes: Bytes | number | null): ParsedMessage | null;
    parseBuffer(bytes: Bytes): ParsedMessage[] | null;
    parsePayload(): Message | null;
    parsePrefix(): void;
    parseLength(): void;
    pushBuffer(bytes: Bytes | number): void;
    concat_buffer(a: Bytes, b: Bytes): Uint8Array;
    bytes_needed(): number;
    check_signature(bytes: Bytes, srcSystem: number, srcComponent: number): boolean;
    send(message: MessageBase): void;
    log(level: string | Message, message?: string): void;
}
/** Events are a Node-only capability; the browser runtime does not emit them. */
export interface NodeProcessor extends MAVLink20Processor {
    on<N extends ParsedMessage['_name']>(event: N, listener: (message: Extract<ParsedMessage, { _name: N }>) => void): this;
    on(event: 'message', listener: (message: ParsedMessage) => void): this;
    removeListener(event: string, listener: (message: ParsedMessage) => void): this;
}

export interface sensor_offsets extends MessageBase {
    _name: 'SENSOR_OFFSETS';
    _header: Header;
    mag_ofs_x: number;
    mag_ofs_y: number;
    mag_ofs_z: number;
    mag_declination: number;
    raw_press: number;
    raw_temp: number;
    gyro_cal_x: number;
    gyro_cal_y: number;
    gyro_cal_z: number;
    accel_cal_x: number;
    accel_cal_y: number;
    accel_cal_z: number;
}
export interface set_mag_offsets extends MessageBase {
    _name: 'SET_MAG_OFFSETS';
    _header: Header;
    target_system: number;
    target_component: number;
    mag_ofs_x: number;
    mag_ofs_y: number;
    mag_ofs_z: number;
}
export interface meminfo extends MessageBase {
    _name: 'MEMINFO';
    _header: Header;
    brkval: number;
    freemem: number;
    freemem32: number;
}
export interface ap_adc extends MessageBase {
    _name: 'AP_ADC';
    _header: Header;
    adc1: number;
    adc2: number;
    adc3: number;
    adc4: number;
    adc5: number;
    adc6: number;
}
export interface digicam_configure extends MessageBase {
    _name: 'DIGICAM_CONFIGURE';
    _header: Header;
    target_system: number;
    target_component: number;
    mode: number;
    shutter_speed: number;
    aperture: number;
    iso: number;
    exposure_type: number;
    command_id: number;
    engine_cut_off: number;
    extra_param: number;
    extra_value: number;
}
export interface digicam_control extends MessageBase {
    _name: 'DIGICAM_CONTROL';
    _header: Header;
    target_system: number;
    target_component: number;
    session: number;
    zoom_pos: number;
    zoom_step: number;
    focus_lock: number;
    shot: number;
    command_id: number;
    extra_param: number;
    extra_value: number;
}
export interface mount_configure extends MessageBase {
    _name: 'MOUNT_CONFIGURE';
    _header: Header;
    target_system: number;
    target_component: number;
    mount_mode: number;
    stab_roll: number;
    stab_pitch: number;
    stab_yaw: number;
}
export interface mount_control extends MessageBase {
    _name: 'MOUNT_CONTROL';
    _header: Header;
    target_system: number;
    target_component: number;
    input_a: number;
    input_b: number;
    input_c: number;
    save_position: number;
}
export interface mount_status extends MessageBase {
    _name: 'MOUNT_STATUS';
    _header: Header;
    target_system: number;
    target_component: number;
    pointing_a: number;
    pointing_b: number;
    pointing_c: number;
    mount_mode: number;
}
export interface fence_point extends MessageBase {
    _name: 'FENCE_POINT';
    _header: Header;
    target_system: number;
    target_component: number;
    idx: number;
    count: number;
    lat: number;
    lng: number;
}
export interface fence_fetch_point extends MessageBase {
    _name: 'FENCE_FETCH_POINT';
    _header: Header;
    target_system: number;
    target_component: number;
    idx: number;
}
export interface ahrs extends MessageBase {
    _name: 'AHRS';
    _header: Header;
    omegaIx: number;
    omegaIy: number;
    omegaIz: number;
    accel_weight: number;
    renorm_val: number;
    error_rp: number;
    error_yaw: number;
}
export interface simstate extends MessageBase {
    _name: 'SIMSTATE';
    _header: Header;
    roll: number;
    pitch: number;
    yaw: number;
    xacc: number;
    yacc: number;
    zacc: number;
    xgyro: number;
    ygyro: number;
    zgyro: number;
    lat: number;
    lng: number;
}
export interface hwstatus extends MessageBase {
    _name: 'HWSTATUS';
    _header: Header;
    Vcc: number;
    I2Cerr: number;
}
export interface radio extends MessageBase {
    _name: 'RADIO';
    _header: Header;
    rssi: number;
    remrssi: number;
    txbuf: number;
    noise: number;
    remnoise: number;
    rxerrors: number;
    fixed: number;
}
export interface limits_status extends MessageBase {
    _name: 'LIMITS_STATUS';
    _header: Header;
    limits_state: number;
    last_trigger: number;
    last_action: number;
    last_recovery: number;
    last_clear: number;
    breach_count: number;
    mods_enabled: number;
    mods_required: number;
    mods_triggered: number;
}
export interface wind extends MessageBase {
    _name: 'WIND';
    _header: Header;
    direction: number;
    speed: number;
    speed_z: number;
}
export interface data16 extends MessageBase {
    _name: 'DATA16';
    _header: Header;
    type: number;
    len: number;
    data: string;
}
export interface data32 extends MessageBase {
    _name: 'DATA32';
    _header: Header;
    type: number;
    len: number;
    data: string;
}
export interface data64 extends MessageBase {
    _name: 'DATA64';
    _header: Header;
    type: number;
    len: number;
    data: string;
}
export interface data96 extends MessageBase {
    _name: 'DATA96';
    _header: Header;
    type: number;
    len: number;
    data: string;
}
export interface rangefinder extends MessageBase {
    _name: 'RANGEFINDER';
    _header: Header;
    distance: number;
    voltage: number;
}
export interface airspeed_autocal extends MessageBase {
    _name: 'AIRSPEED_AUTOCAL';
    _header: Header;
    vx: number;
    vy: number;
    vz: number;
    diff_pressure: number;
    EAS2TAS: number;
    ratio: number;
    state_x: number;
    state_y: number;
    state_z: number;
    Pax: number;
    Pby: number;
    Pcz: number;
}
export interface rally_point extends MessageBase {
    _name: 'RALLY_POINT';
    _header: Header;
    target_system: number;
    target_component: number;
    idx: number;
    count: number;
    lat: number;
    lng: number;
    alt: number;
    break_alt: number;
    land_dir: number;
    flags: number;
}
export interface rally_fetch_point extends MessageBase {
    _name: 'RALLY_FETCH_POINT';
    _header: Header;
    target_system: number;
    target_component: number;
    idx: number;
}
export interface compassmot_status extends MessageBase {
    _name: 'COMPASSMOT_STATUS';
    _header: Header;
    throttle: number;
    current: number;
    interference: number;
    CompensationX: number;
    CompensationY: number;
    CompensationZ: number;
}
export interface ahrs2 extends MessageBase {
    _name: 'AHRS2';
    _header: Header;
    roll: number;
    pitch: number;
    yaw: number;
    altitude: number;
    lat: number;
    lng: number;
}
export interface camera_status extends MessageBase {
    _name: 'CAMERA_STATUS';
    _header: Header;
    time_usec: Int64;
    target_system: number;
    cam_idx: number;
    img_idx: number;
    event_id: number;
    p1: number;
    p2: number;
    p3: number;
    p4: number;
}
export interface camera_feedback extends MessageBase {
    _name: 'CAMERA_FEEDBACK';
    _header: Header;
    time_usec: Int64;
    target_system: number;
    cam_idx: number;
    img_idx: number;
    lat: number;
    lng: number;
    alt_msl: number;
    alt_rel: number;
    roll: number;
    pitch: number;
    yaw: number;
    foc_len: number;
    flags: number;
    completed_captures: number;
}
export interface battery2 extends MessageBase {
    _name: 'BATTERY2';
    _header: Header;
    voltage: number;
    current_battery: number;
}
export interface ahrs3 extends MessageBase {
    _name: 'AHRS3';
    _header: Header;
    roll: number;
    pitch: number;
    yaw: number;
    altitude: number;
    lat: number;
    lng: number;
    v1: number;
    v2: number;
    v3: number;
    v4: number;
}
export interface autopilot_version_request extends MessageBase {
    _name: 'AUTOPILOT_VERSION_REQUEST';
    _header: Header;
    target_system: number;
    target_component: number;
}
export interface remote_log_data_block extends MessageBase {
    _name: 'REMOTE_LOG_DATA_BLOCK';
    _header: Header;
    target_system: number;
    target_component: number;
    seqno: number;
    data: string;
}
export interface remote_log_block_status extends MessageBase {
    _name: 'REMOTE_LOG_BLOCK_STATUS';
    _header: Header;
    target_system: number;
    target_component: number;
    seqno: number;
    status: number;
}
export interface led_control extends MessageBase {
    _name: 'LED_CONTROL';
    _header: Header;
    target_system: number;
    target_component: number;
    instance: number;
    pattern: number;
    custom_len: number;
    custom_bytes: string;
}
export interface mag_cal_progress extends MessageBase {
    _name: 'MAG_CAL_PROGRESS';
    _header: Header;
    compass_id: number;
    cal_mask: number;
    cal_status: number;
    attempt: number;
    completion_pct: number;
    completion_mask: string;
    direction_x: number;
    direction_y: number;
    direction_z: number;
}
export interface ekf_status_report extends MessageBase {
    _name: 'EKF_STATUS_REPORT';
    _header: Header;
    flags: number;
    velocity_variance: number;
    pos_horiz_variance: number;
    pos_vert_variance: number;
    compass_variance: number;
    terrain_alt_variance: number;
    airspeed_variance: number;
}
export interface pid_tuning extends MessageBase {
    _name: 'PID_TUNING';
    _header: Header;
    axis: number;
    desired: number;
    achieved: number;
    FF: number;
    P: number;
    I: number;
    D: number;
    SRate: number;
    PDmod: number;
}
export interface deepstall extends MessageBase {
    _name: 'DEEPSTALL';
    _header: Header;
    landing_lat: number;
    landing_lon: number;
    path_lat: number;
    path_lon: number;
    arc_entry_lat: number;
    arc_entry_lon: number;
    altitude: number;
    expected_travel_distance: number;
    cross_track_error: number;
    stage: number;
}
export interface gimbal_report extends MessageBase {
    _name: 'GIMBAL_REPORT';
    _header: Header;
    target_system: number;
    target_component: number;
    delta_time: number;
    delta_angle_x: number;
    delta_angle_y: number;
    delta_angle_z: number;
    delta_velocity_x: number;
    delta_velocity_y: number;
    delta_velocity_z: number;
    joint_roll: number;
    joint_el: number;
    joint_az: number;
}
export interface gimbal_control extends MessageBase {
    _name: 'GIMBAL_CONTROL';
    _header: Header;
    target_system: number;
    target_component: number;
    demanded_rate_x: number;
    demanded_rate_y: number;
    demanded_rate_z: number;
}
export interface gimbal_torque_cmd_report extends MessageBase {
    _name: 'GIMBAL_TORQUE_CMD_REPORT';
    _header: Header;
    target_system: number;
    target_component: number;
    rl_torque_cmd: number;
    el_torque_cmd: number;
    az_torque_cmd: number;
}
export interface gopro_heartbeat extends MessageBase {
    _name: 'GOPRO_HEARTBEAT';
    _header: Header;
    status: number;
    capture_mode: number;
    flags: number;
}
export interface gopro_get_request extends MessageBase {
    _name: 'GOPRO_GET_REQUEST';
    _header: Header;
    target_system: number;
    target_component: number;
    cmd_id: number;
}
export interface gopro_get_response extends MessageBase {
    _name: 'GOPRO_GET_RESPONSE';
    _header: Header;
    cmd_id: number;
    status: number;
    value: string;
}
export interface gopro_set_request extends MessageBase {
    _name: 'GOPRO_SET_REQUEST';
    _header: Header;
    target_system: number;
    target_component: number;
    cmd_id: number;
    value: string;
}
export interface gopro_set_response extends MessageBase {
    _name: 'GOPRO_SET_RESPONSE';
    _header: Header;
    cmd_id: number;
    status: number;
}
export interface rpm extends MessageBase {
    _name: 'RPM';
    _header: Header;
    rpm1: number;
    rpm2: number;
}
export interface device_op_read extends MessageBase {
    _name: 'DEVICE_OP_READ';
    _header: Header;
    target_system: number;
    target_component: number;
    request_id: number;
    bustype: number;
    bus: number;
    address: number;
    busname: string;
    regstart: number;
    count: number;
    bank: number;
}
export interface device_op_read_reply extends MessageBase {
    _name: 'DEVICE_OP_READ_REPLY';
    _header: Header;
    request_id: number;
    result: number;
    regstart: number;
    count: number;
    data: string;
    bank: number;
}
export interface device_op_write extends MessageBase {
    _name: 'DEVICE_OP_WRITE';
    _header: Header;
    target_system: number;
    target_component: number;
    request_id: number;
    bustype: number;
    bus: number;
    address: number;
    busname: string;
    regstart: number;
    count: number;
    data: string;
    bank: number;
}
export interface device_op_write_reply extends MessageBase {
    _name: 'DEVICE_OP_WRITE_REPLY';
    _header: Header;
    request_id: number;
    result: number;
}
export interface secure_command extends MessageBase {
    _name: 'SECURE_COMMAND';
    _header: Header;
    target_system: number;
    target_component: number;
    sequence: number;
    operation: number;
    data_length: number;
    sig_length: number;
    data: string;
}
export interface secure_command_reply extends MessageBase {
    _name: 'SECURE_COMMAND_REPLY';
    _header: Header;
    sequence: number;
    operation: number;
    result: number;
    data_length: number;
    data: string;
}
export interface adap_tuning extends MessageBase {
    _name: 'ADAP_TUNING';
    _header: Header;
    axis: number;
    desired: number;
    achieved: number;
    error: number;
    theta: number;
    omega: number;
    sigma: number;
    theta_dot: number;
    omega_dot: number;
    sigma_dot: number;
    f: number;
    f_dot: number;
    u: number;
}
export interface vision_position_delta extends MessageBase {
    _name: 'VISION_POSITION_DELTA';
    _header: Header;
    time_usec: Int64;
    time_delta_usec: Int64;
    angle_delta: number[];
    position_delta: number[];
    confidence: number;
}
export interface aoa_ssa extends MessageBase {
    _name: 'AOA_SSA';
    _header: Header;
    time_usec: Int64;
    AOA: number;
    SSA: number;
}
export interface esc_telemetry_1_to_4 extends MessageBase {
    _name: 'ESC_TELEMETRY_1_TO_4';
    _header: Header;
    temperature: string;
    voltage: number[];
    current: number[];
    totalcurrent: number[];
    rpm: number[];
    count: number[];
}
export interface esc_telemetry_5_to_8 extends MessageBase {
    _name: 'ESC_TELEMETRY_5_TO_8';
    _header: Header;
    temperature: string;
    voltage: number[];
    current: number[];
    totalcurrent: number[];
    rpm: number[];
    count: number[];
}
export interface esc_telemetry_9_to_12 extends MessageBase {
    _name: 'ESC_TELEMETRY_9_TO_12';
    _header: Header;
    temperature: string;
    voltage: number[];
    current: number[];
    totalcurrent: number[];
    rpm: number[];
    count: number[];
}
export interface osd_param_config extends MessageBase {
    _name: 'OSD_PARAM_CONFIG';
    _header: Header;
    target_system: number;
    target_component: number;
    request_id: number;
    osd_screen: number;
    osd_index: number;
    param_id: string;
    config_type: number;
    min_value: number;
    max_value: number;
    increment: number;
}
export interface osd_param_config_reply extends MessageBase {
    _name: 'OSD_PARAM_CONFIG_REPLY';
    _header: Header;
    request_id: number;
    result: number;
}
export interface osd_param_show_config extends MessageBase {
    _name: 'OSD_PARAM_SHOW_CONFIG';
    _header: Header;
    target_system: number;
    target_component: number;
    request_id: number;
    osd_screen: number;
    osd_index: number;
}
export interface osd_param_show_config_reply extends MessageBase {
    _name: 'OSD_PARAM_SHOW_CONFIG_REPLY';
    _header: Header;
    request_id: number;
    result: number;
    param_id: string;
    config_type: number;
    min_value: number;
    max_value: number;
    increment: number;
}
export interface obstacle_distance_3d extends MessageBase {
    _name: 'OBSTACLE_DISTANCE_3D';
    _header: Header;
    time_boot_ms: number;
    sensor_type: number;
    frame: number;
    obstacle_id: number;
    x: number;
    y: number;
    z: number;
    min_distance: number;
    max_distance: number;
}
export interface water_depth extends MessageBase {
    _name: 'WATER_DEPTH';
    _header: Header;
    time_boot_ms: number;
    id: number;
    healthy: number;
    lat: number;
    lng: number;
    alt: number;
    roll: number;
    pitch: number;
    yaw: number;
    distance: number;
    temperature: number;
}
export interface mcu_status extends MessageBase {
    _name: 'MCU_STATUS';
    _header: Header;
    id: number;
    MCU_temperature: number;
    MCU_voltage: number;
    MCU_voltage_min: number;
    MCU_voltage_max: number;
}
export interface esc_telemetry_13_to_16 extends MessageBase {
    _name: 'ESC_TELEMETRY_13_TO_16';
    _header: Header;
    temperature: string;
    voltage: number[];
    current: number[];
    totalcurrent: number[];
    rpm: number[];
    count: number[];
}
export interface esc_telemetry_17_to_20 extends MessageBase {
    _name: 'ESC_TELEMETRY_17_TO_20';
    _header: Header;
    temperature: string;
    voltage: number[];
    current: number[];
    totalcurrent: number[];
    rpm: number[];
    count: number[];
}
export interface esc_telemetry_21_to_24 extends MessageBase {
    _name: 'ESC_TELEMETRY_21_TO_24';
    _header: Header;
    temperature: string;
    voltage: number[];
    current: number[];
    totalcurrent: number[];
    rpm: number[];
    count: number[];
}
export interface esc_telemetry_25_to_28 extends MessageBase {
    _name: 'ESC_TELEMETRY_25_TO_28';
    _header: Header;
    temperature: string;
    voltage: number[];
    current: number[];
    totalcurrent: number[];
    rpm: number[];
    count: number[];
}
export interface esc_telemetry_29_to_32 extends MessageBase {
    _name: 'ESC_TELEMETRY_29_TO_32';
    _header: Header;
    temperature: string;
    voltage: number[];
    current: number[];
    totalcurrent: number[];
    rpm: number[];
    count: number[];
}
export interface command_int_stamped extends MessageBase {
    _name: 'COMMAND_INT_STAMPED';
    _header: Header;
    utc_time: number;
    vehicle_timestamp: Int64;
    target_system: number;
    target_component: number;
    frame: number;
    command: number;
    current: number;
    autocontinue: number;
    param1: number;
    param2: number;
    param3: number;
    param4: number;
    x: number;
    y: number;
    z: number;
}
export interface command_long_stamped extends MessageBase {
    _name: 'COMMAND_LONG_STAMPED';
    _header: Header;
    utc_time: number;
    vehicle_timestamp: Int64;
    target_system: number;
    target_component: number;
    command: number;
    confirmation: number;
    param1: number;
    param2: number;
    param3: number;
    param4: number;
    param5: number;
    param6: number;
    param7: number;
}
export interface sens_power extends MessageBase {
    _name: 'SENS_POWER';
    _header: Header;
    adc121_vspb_volt: number;
    adc121_cspb_amp: number;
    adc121_cs1_amp: number;
    adc121_cs2_amp: number;
}
export interface sens_mppt extends MessageBase {
    _name: 'SENS_MPPT';
    _header: Header;
    mppt_timestamp: Int64;
    mppt1_volt: number;
    mppt1_amp: number;
    mppt1_pwm: number;
    mppt1_status: number;
    mppt2_volt: number;
    mppt2_amp: number;
    mppt2_pwm: number;
    mppt2_status: number;
    mppt3_volt: number;
    mppt3_amp: number;
    mppt3_pwm: number;
    mppt3_status: number;
}
export interface aslctrl_data extends MessageBase {
    _name: 'ASLCTRL_DATA';
    _header: Header;
    timestamp: Int64;
    aslctrl_mode: number;
    h: number;
    hRef: number;
    hRef_t: number;
    PitchAngle: number;
    PitchAngleRef: number;
    q: number;
    qRef: number;
    uElev: number;
    uThrot: number;
    uThrot2: number;
    nZ: number;
    AirspeedRef: number;
    SpoilersEngaged: number;
    YawAngle: number;
    YawAngleRef: number;
    RollAngle: number;
    RollAngleRef: number;
    p: number;
    pRef: number;
    r: number;
    rRef: number;
    uAil: number;
    uRud: number;
}
export interface aslctrl_debug extends MessageBase {
    _name: 'ASLCTRL_DEBUG';
    _header: Header;
    i32_1: number;
    i8_1: number;
    i8_2: number;
    f_1: number;
    f_2: number;
    f_3: number;
    f_4: number;
    f_5: number;
    f_6: number;
    f_7: number;
    f_8: number;
}
export interface asluav_status extends MessageBase {
    _name: 'ASLUAV_STATUS';
    _header: Header;
    LED_status: number;
    SATCOM_status: number;
    Servo_status: string;
    Motor_rpm: number;
}
export interface ekf_ext extends MessageBase {
    _name: 'EKF_EXT';
    _header: Header;
    timestamp: Int64;
    Windspeed: number;
    WindDir: number;
    WindZ: number;
    Airspeed: number;
    beta: number;
    alpha: number;
}
export interface asl_obctrl extends MessageBase {
    _name: 'ASL_OBCTRL';
    _header: Header;
    timestamp: Int64;
    uElev: number;
    uThrot: number;
    uThrot2: number;
    uAilL: number;
    uAilR: number;
    uRud: number;
    obctrl_status: number;
}
export interface sens_atmos extends MessageBase {
    _name: 'SENS_ATMOS';
    _header: Header;
    timestamp: Int64;
    TempAmbient: number;
    Humidity: number;
}
export interface sens_batmon extends MessageBase {
    _name: 'SENS_BATMON';
    _header: Header;
    batmon_timestamp: Int64;
    temperature: number;
    voltage: number;
    current: number;
    SoC: number;
    batterystatus: number;
    serialnumber: number;
    safetystatus: number;
    operationstatus: number;
    cellvoltage1: number;
    cellvoltage2: number;
    cellvoltage3: number;
    cellvoltage4: number;
    cellvoltage5: number;
    cellvoltage6: number;
}
export interface fw_soaring_data extends MessageBase {
    _name: 'FW_SOARING_DATA';
    _header: Header;
    timestamp: Int64;
    timestampModeChanged: Int64;
    xW: number;
    xR: number;
    xLat: number;
    xLon: number;
    VarW: number;
    VarR: number;
    VarLat: number;
    VarLon: number;
    LoiterRadius: number;
    LoiterDirection: number;
    DistToSoarPoint: number;
    vSinkExp: number;
    z1_LocalUpdraftSpeed: number;
    z2_DeltaRoll: number;
    z1_exp: number;
    z2_exp: number;
    ThermalGSNorth: number;
    ThermalGSEast: number;
    TSE_dot: number;
    DebugVar1: number;
    DebugVar2: number;
    ControlMode: number;
    valid: number;
}
export interface sensorpod_status extends MessageBase {
    _name: 'SENSORPOD_STATUS';
    _header: Header;
    timestamp: Int64;
    visensor_rate_1: number;
    visensor_rate_2: number;
    visensor_rate_3: number;
    visensor_rate_4: number;
    recording_nodes_count: number;
    cpu_temp: number;
    free_space: number;
}
export interface sens_power_board extends MessageBase {
    _name: 'SENS_POWER_BOARD';
    _header: Header;
    timestamp: Int64;
    pwr_brd_status: number;
    pwr_brd_led_status: number;
    pwr_brd_system_volt: number;
    pwr_brd_servo_volt: number;
    pwr_brd_digital_volt: number;
    pwr_brd_mot_l_amp: number;
    pwr_brd_mot_r_amp: number;
    pwr_brd_analog_amp: number;
    pwr_brd_digital_amp: number;
    pwr_brd_ext_amp: number;
    pwr_brd_aux_amp: number;
}
export interface gsm_link_status extends MessageBase {
    _name: 'GSM_LINK_STATUS';
    _header: Header;
    timestamp: Int64;
    gsm_modem_type: number;
    gsm_link_type: number;
    rssi: number;
    rsrp_rscp: number;
    sinr_ecio: number;
    rsrq: number;
}
export interface satcom_link_status extends MessageBase {
    _name: 'SATCOM_LINK_STATUS';
    _header: Header;
    timestamp: Int64;
    last_heartbeat: Int64;
    failed_sessions: number;
    successful_sessions: number;
    signal_quality: number;
    ring_pending: number;
    tx_session_pending: number;
    rx_session_pending: number;
}
export interface sensor_airflow_angles extends MessageBase {
    _name: 'SENSOR_AIRFLOW_ANGLES';
    _header: Header;
    timestamp: Int64;
    angleofattack: number;
    angleofattack_valid: number;
    sideslip: number;
    sideslip_valid: number;
}
export interface sys_status extends MessageBase {
    _name: 'SYS_STATUS';
    _header: Header;
    onboard_control_sensors_present: number;
    onboard_control_sensors_enabled: number;
    onboard_control_sensors_health: number;
    load: number;
    voltage_battery: number;
    current_battery: number;
    battery_remaining: number;
    drop_rate_comm: number;
    errors_comm: number;
    errors_count1: number;
    errors_count2: number;
    errors_count3: number;
    errors_count4: number;
}
export interface system_time extends MessageBase {
    _name: 'SYSTEM_TIME';
    _header: Header;
    time_unix_usec: Int64;
    time_boot_ms: number;
}
export interface ping extends MessageBase {
    _name: 'PING';
    _header: Header;
    time_usec: Int64;
    seq: number;
    target_system: number;
    target_component: number;
}
export interface change_operator_control extends MessageBase {
    _name: 'CHANGE_OPERATOR_CONTROL';
    _header: Header;
    target_system: number;
    control_request: number;
    version: number;
    passkey: string;
}
export interface change_operator_control_ack extends MessageBase {
    _name: 'CHANGE_OPERATOR_CONTROL_ACK';
    _header: Header;
    gcs_system_id: number;
    control_request: number;
    ack: number;
}
export interface auth_key extends MessageBase {
    _name: 'AUTH_KEY';
    _header: Header;
    key: string;
}
export interface set_mode extends MessageBase {
    _name: 'SET_MODE';
    _header: Header;
    target_system: number;
    base_mode: number;
    custom_mode: number;
}
export interface param_request_read extends MessageBase {
    _name: 'PARAM_REQUEST_READ';
    _header: Header;
    target_system: number;
    target_component: number;
    param_id: string;
    param_index: number;
}
export interface param_request_list extends MessageBase {
    _name: 'PARAM_REQUEST_LIST';
    _header: Header;
    target_system: number;
    target_component: number;
}
export interface param_value extends MessageBase {
    _name: 'PARAM_VALUE';
    _header: Header;
    param_id: string;
    param_value: number;
    param_type: number;
    param_count: number;
    param_index: number;
}
export interface param_set extends MessageBase {
    _name: 'PARAM_SET';
    _header: Header;
    target_system: number;
    target_component: number;
    param_id: string;
    param_value: number;
    param_type: number;
}
export interface gps_raw_int extends MessageBase {
    _name: 'GPS_RAW_INT';
    _header: Header;
    time_usec: Int64;
    fix_type: number;
    lat: number;
    lon: number;
    alt: number;
    eph: number;
    epv: number;
    vel: number;
    cog: number;
    satellites_visible: number;
    alt_ellipsoid: number;
    h_acc: number;
    v_acc: number;
    vel_acc: number;
    hdg_acc: number;
    yaw: number;
}
export interface gps_status extends MessageBase {
    _name: 'GPS_STATUS';
    _header: Header;
    satellites_visible: number;
    satellite_prn: string;
    satellite_used: string;
    satellite_elevation: string;
    satellite_azimuth: string;
    satellite_snr: string;
}
export interface scaled_imu extends MessageBase {
    _name: 'SCALED_IMU';
    _header: Header;
    time_boot_ms: number;
    xacc: number;
    yacc: number;
    zacc: number;
    xgyro: number;
    ygyro: number;
    zgyro: number;
    xmag: number;
    ymag: number;
    zmag: number;
    temperature: number;
}
export interface raw_imu extends MessageBase {
    _name: 'RAW_IMU';
    _header: Header;
    time_usec: Int64;
    xacc: number;
    yacc: number;
    zacc: number;
    xgyro: number;
    ygyro: number;
    zgyro: number;
    xmag: number;
    ymag: number;
    zmag: number;
    id: number;
    temperature: number;
}
export interface raw_pressure extends MessageBase {
    _name: 'RAW_PRESSURE';
    _header: Header;
    time_usec: Int64;
    press_abs: number;
    press_diff1: number;
    press_diff2: number;
    temperature: number;
}
export interface scaled_pressure extends MessageBase {
    _name: 'SCALED_PRESSURE';
    _header: Header;
    time_boot_ms: number;
    press_abs: number;
    press_diff: number;
    temperature: number;
    temperature_press_diff: number;
}
export interface attitude extends MessageBase {
    _name: 'ATTITUDE';
    _header: Header;
    time_boot_ms: number;
    roll: number;
    pitch: number;
    yaw: number;
    rollspeed: number;
    pitchspeed: number;
    yawspeed: number;
}
export interface attitude_quaternion extends MessageBase {
    _name: 'ATTITUDE_QUATERNION';
    _header: Header;
    time_boot_ms: number;
    q1: number;
    q2: number;
    q3: number;
    q4: number;
    rollspeed: number;
    pitchspeed: number;
    yawspeed: number;
    repr_offset_q: number[];
}
export interface local_position_ned extends MessageBase {
    _name: 'LOCAL_POSITION_NED';
    _header: Header;
    time_boot_ms: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
}
export interface global_position_int extends MessageBase {
    _name: 'GLOBAL_POSITION_INT';
    _header: Header;
    time_boot_ms: number;
    lat: number;
    lon: number;
    alt: number;
    relative_alt: number;
    vx: number;
    vy: number;
    vz: number;
    hdg: number;
}
export interface rc_channels_scaled extends MessageBase {
    _name: 'RC_CHANNELS_SCALED';
    _header: Header;
    time_boot_ms: number;
    port: number;
    chan1_scaled: number;
    chan2_scaled: number;
    chan3_scaled: number;
    chan4_scaled: number;
    chan5_scaled: number;
    chan6_scaled: number;
    chan7_scaled: number;
    chan8_scaled: number;
    rssi: number;
}
export interface rc_channels_raw extends MessageBase {
    _name: 'RC_CHANNELS_RAW';
    _header: Header;
    time_boot_ms: number;
    port: number;
    chan1_raw: number;
    chan2_raw: number;
    chan3_raw: number;
    chan4_raw: number;
    chan5_raw: number;
    chan6_raw: number;
    chan7_raw: number;
    chan8_raw: number;
    rssi: number;
}
export interface servo_output_raw extends MessageBase {
    _name: 'SERVO_OUTPUT_RAW';
    _header: Header;
    time_usec: number;
    port: number;
    servo1_raw: number;
    servo2_raw: number;
    servo3_raw: number;
    servo4_raw: number;
    servo5_raw: number;
    servo6_raw: number;
    servo7_raw: number;
    servo8_raw: number;
    servo9_raw: number;
    servo10_raw: number;
    servo11_raw: number;
    servo12_raw: number;
    servo13_raw: number;
    servo14_raw: number;
    servo15_raw: number;
    servo16_raw: number;
}
export interface mission_request_partial_list extends MessageBase {
    _name: 'MISSION_REQUEST_PARTIAL_LIST';
    _header: Header;
    target_system: number;
    target_component: number;
    start_index: number;
    end_index: number;
    mission_type: number;
}
export interface mission_write_partial_list extends MessageBase {
    _name: 'MISSION_WRITE_PARTIAL_LIST';
    _header: Header;
    target_system: number;
    target_component: number;
    start_index: number;
    end_index: number;
    mission_type: number;
}
export interface mission_item extends MessageBase {
    _name: 'MISSION_ITEM';
    _header: Header;
    target_system: number;
    target_component: number;
    seq: number;
    frame: number;
    command: number;
    current: number;
    autocontinue: number;
    param1: number;
    param2: number;
    param3: number;
    param4: number;
    x: number;
    y: number;
    z: number;
    mission_type: number;
}
export interface mission_request extends MessageBase {
    _name: 'MISSION_REQUEST';
    _header: Header;
    target_system: number;
    target_component: number;
    seq: number;
    mission_type: number;
}
export interface mission_set_current extends MessageBase {
    _name: 'MISSION_SET_CURRENT';
    _header: Header;
    target_system: number;
    target_component: number;
    seq: number;
}
export interface mission_current extends MessageBase {
    _name: 'MISSION_CURRENT';
    _header: Header;
    seq: number;
    total: number;
    mission_state: number;
    mission_mode: number;
}
export interface mission_request_list extends MessageBase {
    _name: 'MISSION_REQUEST_LIST';
    _header: Header;
    target_system: number;
    target_component: number;
    mission_type: number;
}
export interface mission_count extends MessageBase {
    _name: 'MISSION_COUNT';
    _header: Header;
    target_system: number;
    target_component: number;
    count: number;
    mission_type: number;
}
export interface mission_clear_all extends MessageBase {
    _name: 'MISSION_CLEAR_ALL';
    _header: Header;
    target_system: number;
    target_component: number;
    mission_type: number;
}
export interface mission_item_reached extends MessageBase {
    _name: 'MISSION_ITEM_REACHED';
    _header: Header;
    seq: number;
}
export interface mission_ack extends MessageBase {
    _name: 'MISSION_ACK';
    _header: Header;
    target_system: number;
    target_component: number;
    type: number;
    mission_type: number;
}
export interface set_gps_global_origin extends MessageBase {
    _name: 'SET_GPS_GLOBAL_ORIGIN';
    _header: Header;
    target_system: number;
    latitude: number;
    longitude: number;
    altitude: number;
    time_usec: Int64;
}
export interface gps_global_origin extends MessageBase {
    _name: 'GPS_GLOBAL_ORIGIN';
    _header: Header;
    latitude: number;
    longitude: number;
    altitude: number;
    time_usec: Int64;
}
export interface param_map_rc extends MessageBase {
    _name: 'PARAM_MAP_RC';
    _header: Header;
    target_system: number;
    target_component: number;
    param_id: string;
    param_index: number;
    parameter_rc_channel_index: number;
    param_value0: number;
    scale: number;
    param_value_min: number;
    param_value_max: number;
}
export interface mission_request_int extends MessageBase {
    _name: 'MISSION_REQUEST_INT';
    _header: Header;
    target_system: number;
    target_component: number;
    seq: number;
    mission_type: number;
}
export interface safety_set_allowed_area extends MessageBase {
    _name: 'SAFETY_SET_ALLOWED_AREA';
    _header: Header;
    target_system: number;
    target_component: number;
    frame: number;
    p1x: number;
    p1y: number;
    p1z: number;
    p2x: number;
    p2y: number;
    p2z: number;
}
export interface safety_allowed_area extends MessageBase {
    _name: 'SAFETY_ALLOWED_AREA';
    _header: Header;
    frame: number;
    p1x: number;
    p1y: number;
    p1z: number;
    p2x: number;
    p2y: number;
    p2z: number;
}
export interface attitude_quaternion_cov extends MessageBase {
    _name: 'ATTITUDE_QUATERNION_COV';
    _header: Header;
    time_usec: Int64;
    q: number[];
    rollspeed: number;
    pitchspeed: number;
    yawspeed: number;
    covariance: number[];
}
export interface nav_controller_output extends MessageBase {
    _name: 'NAV_CONTROLLER_OUTPUT';
    _header: Header;
    nav_roll: number;
    nav_pitch: number;
    nav_bearing: number;
    target_bearing: number;
    wp_dist: number;
    alt_error: number;
    aspd_error: number;
    xtrack_error: number;
}
export interface global_position_int_cov extends MessageBase {
    _name: 'GLOBAL_POSITION_INT_COV';
    _header: Header;
    time_usec: Int64;
    estimator_type: number;
    lat: number;
    lon: number;
    alt: number;
    relative_alt: number;
    vx: number;
    vy: number;
    vz: number;
    covariance: number[];
}
export interface local_position_ned_cov extends MessageBase {
    _name: 'LOCAL_POSITION_NED_COV';
    _header: Header;
    time_usec: Int64;
    estimator_type: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    ax: number;
    ay: number;
    az: number;
    covariance: number[];
}
export interface rc_channels extends MessageBase {
    _name: 'RC_CHANNELS';
    _header: Header;
    time_boot_ms: number;
    chancount: number;
    chan1_raw: number;
    chan2_raw: number;
    chan3_raw: number;
    chan4_raw: number;
    chan5_raw: number;
    chan6_raw: number;
    chan7_raw: number;
    chan8_raw: number;
    chan9_raw: number;
    chan10_raw: number;
    chan11_raw: number;
    chan12_raw: number;
    chan13_raw: number;
    chan14_raw: number;
    chan15_raw: number;
    chan16_raw: number;
    chan17_raw: number;
    chan18_raw: number;
    rssi: number;
}
export interface request_data_stream extends MessageBase {
    _name: 'REQUEST_DATA_STREAM';
    _header: Header;
    target_system: number;
    target_component: number;
    req_stream_id: number;
    req_message_rate: number;
    start_stop: number;
}
export interface data_stream extends MessageBase {
    _name: 'DATA_STREAM';
    _header: Header;
    stream_id: number;
    message_rate: number;
    on_off: number;
}
export interface manual_control extends MessageBase {
    _name: 'MANUAL_CONTROL';
    _header: Header;
    target: number;
    x: number;
    y: number;
    z: number;
    r: number;
    buttons: number;
    buttons2: number;
    enabled_extensions: number;
    s: number;
    t: number;
    aux1: number;
    aux2: number;
    aux3: number;
    aux4: number;
    aux5: number;
    aux6: number;
}
export interface rc_channels_override extends MessageBase {
    _name: 'RC_CHANNELS_OVERRIDE';
    _header: Header;
    target_system: number;
    target_component: number;
    chan1_raw: number;
    chan2_raw: number;
    chan3_raw: number;
    chan4_raw: number;
    chan5_raw: number;
    chan6_raw: number;
    chan7_raw: number;
    chan8_raw: number;
    chan9_raw: number;
    chan10_raw: number;
    chan11_raw: number;
    chan12_raw: number;
    chan13_raw: number;
    chan14_raw: number;
    chan15_raw: number;
    chan16_raw: number;
    chan17_raw: number;
    chan18_raw: number;
}
export interface mission_item_int extends MessageBase {
    _name: 'MISSION_ITEM_INT';
    _header: Header;
    target_system: number;
    target_component: number;
    seq: number;
    frame: number;
    command: number;
    current: number;
    autocontinue: number;
    param1: number;
    param2: number;
    param3: number;
    param4: number;
    x: number;
    y: number;
    z: number;
    mission_type: number;
}
export interface vfr_hud extends MessageBase {
    _name: 'VFR_HUD';
    _header: Header;
    airspeed: number;
    groundspeed: number;
    heading: number;
    throttle: number;
    alt: number;
    climb: number;
}
export interface command_int extends MessageBase {
    _name: 'COMMAND_INT';
    _header: Header;
    target_system: number;
    target_component: number;
    frame: number;
    command: number;
    current: number;
    autocontinue: number;
    param1: number;
    param2: number;
    param3: number;
    param4: number;
    x: number;
    y: number;
    z: number;
}
export interface command_long extends MessageBase {
    _name: 'COMMAND_LONG';
    _header: Header;
    target_system: number;
    target_component: number;
    command: number;
    confirmation: number;
    param1: number;
    param2: number;
    param3: number;
    param4: number;
    param5: number;
    param6: number;
    param7: number;
}
export interface command_ack extends MessageBase {
    _name: 'COMMAND_ACK';
    _header: Header;
    command: number;
    result: number;
    progress: number;
    result_param2: number;
    target_system: number;
    target_component: number;
}
export interface manual_setpoint extends MessageBase {
    _name: 'MANUAL_SETPOINT';
    _header: Header;
    time_boot_ms: number;
    roll: number;
    pitch: number;
    yaw: number;
    thrust: number;
    mode_switch: number;
    manual_override_switch: number;
}
export interface set_attitude_target extends MessageBase {
    _name: 'SET_ATTITUDE_TARGET';
    _header: Header;
    time_boot_ms: number;
    target_system: number;
    target_component: number;
    type_mask: number;
    q: number[];
    body_roll_rate: number;
    body_pitch_rate: number;
    body_yaw_rate: number;
    thrust: number;
}
export interface attitude_target extends MessageBase {
    _name: 'ATTITUDE_TARGET';
    _header: Header;
    time_boot_ms: number;
    type_mask: number;
    q: number[];
    body_roll_rate: number;
    body_pitch_rate: number;
    body_yaw_rate: number;
    thrust: number;
}
export interface set_position_target_local_ned extends MessageBase {
    _name: 'SET_POSITION_TARGET_LOCAL_NED';
    _header: Header;
    time_boot_ms: number;
    target_system: number;
    target_component: number;
    coordinate_frame: number;
    type_mask: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    afx: number;
    afy: number;
    afz: number;
    yaw: number;
    yaw_rate: number;
}
export interface position_target_local_ned extends MessageBase {
    _name: 'POSITION_TARGET_LOCAL_NED';
    _header: Header;
    time_boot_ms: number;
    coordinate_frame: number;
    type_mask: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    afx: number;
    afy: number;
    afz: number;
    yaw: number;
    yaw_rate: number;
}
export interface set_position_target_global_int extends MessageBase {
    _name: 'SET_POSITION_TARGET_GLOBAL_INT';
    _header: Header;
    time_boot_ms: number;
    target_system: number;
    target_component: number;
    coordinate_frame: number;
    type_mask: number;
    lat_int: number;
    lon_int: number;
    alt: number;
    vx: number;
    vy: number;
    vz: number;
    afx: number;
    afy: number;
    afz: number;
    yaw: number;
    yaw_rate: number;
}
export interface position_target_global_int extends MessageBase {
    _name: 'POSITION_TARGET_GLOBAL_INT';
    _header: Header;
    time_boot_ms: number;
    coordinate_frame: number;
    type_mask: number;
    lat_int: number;
    lon_int: number;
    alt: number;
    vx: number;
    vy: number;
    vz: number;
    afx: number;
    afy: number;
    afz: number;
    yaw: number;
    yaw_rate: number;
}
export interface local_position_ned_system_global_offset extends MessageBase {
    _name: 'LOCAL_POSITION_NED_SYSTEM_GLOBAL_OFFSET';
    _header: Header;
    time_boot_ms: number;
    x: number;
    y: number;
    z: number;
    roll: number;
    pitch: number;
    yaw: number;
}
export interface hil_state extends MessageBase {
    _name: 'HIL_STATE';
    _header: Header;
    time_usec: Int64;
    roll: number;
    pitch: number;
    yaw: number;
    rollspeed: number;
    pitchspeed: number;
    yawspeed: number;
    lat: number;
    lon: number;
    alt: number;
    vx: number;
    vy: number;
    vz: number;
    xacc: number;
    yacc: number;
    zacc: number;
}
export interface hil_controls extends MessageBase {
    _name: 'HIL_CONTROLS';
    _header: Header;
    time_usec: Int64;
    roll_ailerons: number;
    pitch_elevator: number;
    yaw_rudder: number;
    throttle: number;
    aux1: number;
    aux2: number;
    aux3: number;
    aux4: number;
    mode: number;
    nav_mode: number;
}
export interface hil_rc_inputs_raw extends MessageBase {
    _name: 'HIL_RC_INPUTS_RAW';
    _header: Header;
    time_usec: Int64;
    chan1_raw: number;
    chan2_raw: number;
    chan3_raw: number;
    chan4_raw: number;
    chan5_raw: number;
    chan6_raw: number;
    chan7_raw: number;
    chan8_raw: number;
    chan9_raw: number;
    chan10_raw: number;
    chan11_raw: number;
    chan12_raw: number;
    rssi: number;
}
export interface hil_actuator_controls extends MessageBase {
    _name: 'HIL_ACTUATOR_CONTROLS';
    _header: Header;
    time_usec: Int64;
    controls: number[];
    mode: number;
    flags: Int64;
}
export interface optical_flow extends MessageBase {
    _name: 'OPTICAL_FLOW';
    _header: Header;
    time_usec: Int64;
    sensor_id: number;
    flow_x: number;
    flow_y: number;
    flow_comp_m_x: number;
    flow_comp_m_y: number;
    quality: number;
    ground_distance: number;
    flow_rate_x: number;
    flow_rate_y: number;
}
export interface global_vision_position_estimate extends MessageBase {
    _name: 'GLOBAL_VISION_POSITION_ESTIMATE';
    _header: Header;
    usec: Int64;
    x: number;
    y: number;
    z: number;
    roll: number;
    pitch: number;
    yaw: number;
    covariance: number[];
    reset_counter: number;
}
export interface vision_position_estimate extends MessageBase {
    _name: 'VISION_POSITION_ESTIMATE';
    _header: Header;
    usec: Int64;
    x: number;
    y: number;
    z: number;
    roll: number;
    pitch: number;
    yaw: number;
    covariance: number[];
    reset_counter: number;
}
export interface vision_speed_estimate extends MessageBase {
    _name: 'VISION_SPEED_ESTIMATE';
    _header: Header;
    usec: Int64;
    x: number;
    y: number;
    z: number;
    covariance: number[];
    reset_counter: number;
}
export interface vicon_position_estimate extends MessageBase {
    _name: 'VICON_POSITION_ESTIMATE';
    _header: Header;
    usec: Int64;
    x: number;
    y: number;
    z: number;
    roll: number;
    pitch: number;
    yaw: number;
    covariance: number[];
}
export interface highres_imu extends MessageBase {
    _name: 'HIGHRES_IMU';
    _header: Header;
    time_usec: Int64;
    xacc: number;
    yacc: number;
    zacc: number;
    xgyro: number;
    ygyro: number;
    zgyro: number;
    xmag: number;
    ymag: number;
    zmag: number;
    abs_pressure: number;
    diff_pressure: number;
    pressure_alt: number;
    temperature: number;
    fields_updated: number;
    id: number;
}
export interface optical_flow_rad extends MessageBase {
    _name: 'OPTICAL_FLOW_RAD';
    _header: Header;
    time_usec: Int64;
    sensor_id: number;
    integration_time_us: number;
    integrated_x: number;
    integrated_y: number;
    integrated_xgyro: number;
    integrated_ygyro: number;
    integrated_zgyro: number;
    temperature: number;
    quality: number;
    time_delta_distance_us: number;
    distance: number;
}
export interface hil_sensor extends MessageBase {
    _name: 'HIL_SENSOR';
    _header: Header;
    time_usec: Int64;
    xacc: number;
    yacc: number;
    zacc: number;
    xgyro: number;
    ygyro: number;
    zgyro: number;
    xmag: number;
    ymag: number;
    zmag: number;
    abs_pressure: number;
    diff_pressure: number;
    pressure_alt: number;
    temperature: number;
    fields_updated: number;
    id: number;
}
export interface sim_state extends MessageBase {
    _name: 'SIM_STATE';
    _header: Header;
    q1: number;
    q2: number;
    q3: number;
    q4: number;
    roll: number;
    pitch: number;
    yaw: number;
    xacc: number;
    yacc: number;
    zacc: number;
    xgyro: number;
    ygyro: number;
    zgyro: number;
    lat: number;
    lon: number;
    alt: number;
    std_dev_horz: number;
    std_dev_vert: number;
    vn: number;
    ve: number;
    vd: number;
    lat_int: number;
    lon_int: number;
}
export interface radio_status extends MessageBase {
    _name: 'RADIO_STATUS';
    _header: Header;
    rssi: number;
    remrssi: number;
    txbuf: number;
    noise: number;
    remnoise: number;
    rxerrors: number;
    fixed: number;
}
export interface file_transfer_protocol extends MessageBase {
    _name: 'FILE_TRANSFER_PROTOCOL';
    _header: Header;
    target_network: number;
    target_system: number;
    target_component: number;
    payload: string;
}
export interface timesync extends MessageBase {
    _name: 'TIMESYNC';
    _header: Header;
    tc1: Int64;
    ts1: Int64;
}
export interface camera_trigger extends MessageBase {
    _name: 'CAMERA_TRIGGER';
    _header: Header;
    time_usec: Int64;
    seq: number;
}
export interface hil_gps extends MessageBase {
    _name: 'HIL_GPS';
    _header: Header;
    time_usec: Int64;
    fix_type: number;
    lat: number;
    lon: number;
    alt: number;
    eph: number;
    epv: number;
    vel: number;
    vn: number;
    ve: number;
    vd: number;
    cog: number;
    satellites_visible: number;
    id: number;
    yaw: number;
}
export interface hil_optical_flow extends MessageBase {
    _name: 'HIL_OPTICAL_FLOW';
    _header: Header;
    time_usec: Int64;
    sensor_id: number;
    integration_time_us: number;
    integrated_x: number;
    integrated_y: number;
    integrated_xgyro: number;
    integrated_ygyro: number;
    integrated_zgyro: number;
    temperature: number;
    quality: number;
    time_delta_distance_us: number;
    distance: number;
}
export interface hil_state_quaternion extends MessageBase {
    _name: 'HIL_STATE_QUATERNION';
    _header: Header;
    time_usec: Int64;
    attitude_quaternion: number[];
    rollspeed: number;
    pitchspeed: number;
    yawspeed: number;
    lat: number;
    lon: number;
    alt: number;
    vx: number;
    vy: number;
    vz: number;
    ind_airspeed: number;
    true_airspeed: number;
    xacc: number;
    yacc: number;
    zacc: number;
}
export interface scaled_imu2 extends MessageBase {
    _name: 'SCALED_IMU2';
    _header: Header;
    time_boot_ms: number;
    xacc: number;
    yacc: number;
    zacc: number;
    xgyro: number;
    ygyro: number;
    zgyro: number;
    xmag: number;
    ymag: number;
    zmag: number;
    temperature: number;
}
export interface log_request_list extends MessageBase {
    _name: 'LOG_REQUEST_LIST';
    _header: Header;
    target_system: number;
    target_component: number;
    start: number;
    end: number;
}
export interface log_entry extends MessageBase {
    _name: 'LOG_ENTRY';
    _header: Header;
    id: number;
    num_logs: number;
    last_log_num: number;
    time_utc: number;
    size: number;
}
export interface log_request_data extends MessageBase {
    _name: 'LOG_REQUEST_DATA';
    _header: Header;
    target_system: number;
    target_component: number;
    id: number;
    ofs: number;
    count: number;
}
export interface log_data extends MessageBase {
    _name: 'LOG_DATA';
    _header: Header;
    id: number;
    ofs: number;
    count: number;
    data: string;
}
export interface log_erase extends MessageBase {
    _name: 'LOG_ERASE';
    _header: Header;
    target_system: number;
    target_component: number;
}
export interface log_request_end extends MessageBase {
    _name: 'LOG_REQUEST_END';
    _header: Header;
    target_system: number;
    target_component: number;
}
export interface gps_inject_data extends MessageBase {
    _name: 'GPS_INJECT_DATA';
    _header: Header;
    target_system: number;
    target_component: number;
    len: number;
    data: string;
}
export interface gps2_raw extends MessageBase {
    _name: 'GPS2_RAW';
    _header: Header;
    time_usec: Int64;
    fix_type: number;
    lat: number;
    lon: number;
    alt: number;
    eph: number;
    epv: number;
    vel: number;
    cog: number;
    satellites_visible: number;
    dgps_numch: number;
    dgps_age: number;
    yaw: number;
    alt_ellipsoid: number;
    h_acc: number;
    v_acc: number;
    vel_acc: number;
    hdg_acc: number;
}
export interface power_status extends MessageBase {
    _name: 'POWER_STATUS';
    _header: Header;
    Vcc: number;
    Vservo: number;
    flags: number;
}
export interface serial_control extends MessageBase {
    _name: 'SERIAL_CONTROL';
    _header: Header;
    device: number;
    flags: number;
    timeout: number;
    baudrate: number;
    count: number;
    data: string;
}
export interface gps_rtk extends MessageBase {
    _name: 'GPS_RTK';
    _header: Header;
    time_last_baseline_ms: number;
    rtk_receiver_id: number;
    wn: number;
    tow: number;
    rtk_health: number;
    rtk_rate: number;
    nsats: number;
    baseline_coords_type: number;
    baseline_a_mm: number;
    baseline_b_mm: number;
    baseline_c_mm: number;
    accuracy: number;
    iar_num_hypotheses: number;
}
export interface gps2_rtk extends MessageBase {
    _name: 'GPS2_RTK';
    _header: Header;
    time_last_baseline_ms: number;
    rtk_receiver_id: number;
    wn: number;
    tow: number;
    rtk_health: number;
    rtk_rate: number;
    nsats: number;
    baseline_coords_type: number;
    baseline_a_mm: number;
    baseline_b_mm: number;
    baseline_c_mm: number;
    accuracy: number;
    iar_num_hypotheses: number;
}
export interface scaled_imu3 extends MessageBase {
    _name: 'SCALED_IMU3';
    _header: Header;
    time_boot_ms: number;
    xacc: number;
    yacc: number;
    zacc: number;
    xgyro: number;
    ygyro: number;
    zgyro: number;
    xmag: number;
    ymag: number;
    zmag: number;
    temperature: number;
}
export interface data_transmission_handshake extends MessageBase {
    _name: 'DATA_TRANSMISSION_HANDSHAKE';
    _header: Header;
    type: number;
    size: number;
    width: number;
    height: number;
    packets: number;
    payload: number;
    jpg_quality: number;
}
export interface encapsulated_data extends MessageBase {
    _name: 'ENCAPSULATED_DATA';
    _header: Header;
    seqnr: number;
    data: string;
}
export interface distance_sensor extends MessageBase {
    _name: 'DISTANCE_SENSOR';
    _header: Header;
    time_boot_ms: number;
    min_distance: number;
    max_distance: number;
    current_distance: number;
    type: number;
    id: number;
    orientation: number;
    covariance: number;
    horizontal_fov: number;
    vertical_fov: number;
    quaternion: number[];
    signal_quality: number;
}
export interface terrain_request extends MessageBase {
    _name: 'TERRAIN_REQUEST';
    _header: Header;
    lat: number;
    lon: number;
    grid_spacing: number;
    mask: Int64;
}
export interface terrain_data extends MessageBase {
    _name: 'TERRAIN_DATA';
    _header: Header;
    lat: number;
    lon: number;
    grid_spacing: number;
    gridbit: number;
    data: number[];
}
export interface terrain_check extends MessageBase {
    _name: 'TERRAIN_CHECK';
    _header: Header;
    lat: number;
    lon: number;
}
export interface terrain_report extends MessageBase {
    _name: 'TERRAIN_REPORT';
    _header: Header;
    lat: number;
    lon: number;
    spacing: number;
    terrain_height: number;
    current_height: number;
    pending: number;
    loaded: number;
}
export interface scaled_pressure2 extends MessageBase {
    _name: 'SCALED_PRESSURE2';
    _header: Header;
    time_boot_ms: number;
    press_abs: number;
    press_diff: number;
    temperature: number;
    temperature_press_diff: number;
}
export interface att_pos_mocap extends MessageBase {
    _name: 'ATT_POS_MOCAP';
    _header: Header;
    time_usec: Int64;
    q: number[];
    x: number;
    y: number;
    z: number;
    covariance: number[];
}
export interface set_actuator_control_target extends MessageBase {
    _name: 'SET_ACTUATOR_CONTROL_TARGET';
    _header: Header;
    time_usec: Int64;
    group_mlx: number;
    target_system: number;
    target_component: number;
    controls: number[];
}
export interface actuator_control_target extends MessageBase {
    _name: 'ACTUATOR_CONTROL_TARGET';
    _header: Header;
    time_usec: Int64;
    group_mlx: number;
    controls: number[];
}
export interface altitude extends MessageBase {
    _name: 'ALTITUDE';
    _header: Header;
    time_usec: Int64;
    altitude_monotonic: number;
    altitude_amsl: number;
    altitude_local: number;
    altitude_relative: number;
    altitude_terrain: number;
    bottom_clearance: number;
}
export interface resource_request extends MessageBase {
    _name: 'RESOURCE_REQUEST';
    _header: Header;
    request_id: number;
    uri_type: number;
    uri: string;
    transfer_type: number;
    storage: string;
}
export interface scaled_pressure3 extends MessageBase {
    _name: 'SCALED_PRESSURE3';
    _header: Header;
    time_boot_ms: number;
    press_abs: number;
    press_diff: number;
    temperature: number;
    temperature_press_diff: number;
}
export interface follow_target extends MessageBase {
    _name: 'FOLLOW_TARGET';
    _header: Header;
    timestamp: Int64;
    est_capabilities: number;
    lat: number;
    lon: number;
    alt: number;
    vel: number[];
    acc: number[];
    attitude_q: number[];
    rates: number[];
    position_cov: number[];
    custom_state: Int64;
}
export interface control_system_state extends MessageBase {
    _name: 'CONTROL_SYSTEM_STATE';
    _header: Header;
    time_usec: Int64;
    x_acc: number;
    y_acc: number;
    z_acc: number;
    x_vel: number;
    y_vel: number;
    z_vel: number;
    x_pos: number;
    y_pos: number;
    z_pos: number;
    airspeed: number;
    vel_variance: number[];
    pos_variance: number[];
    q: number[];
    roll_rate: number;
    pitch_rate: number;
    yaw_rate: number;
}
export interface battery_status extends MessageBase {
    _name: 'BATTERY_STATUS';
    _header: Header;
    id: number;
    battery_function: number;
    type: number;
    temperature: number;
    voltages: number[];
    current_battery: number;
    current_consumed: number;
    energy_consumed: number;
    battery_remaining: number;
    time_remaining: number;
    charge_state: number;
    voltages_ext: number[];
    mode: number;
    fault_bitmask: number;
}
export interface autopilot_version extends MessageBase {
    _name: 'AUTOPILOT_VERSION';
    _header: Header;
    capabilities: Int64;
    flight_sw_version: number;
    middleware_sw_version: number;
    os_sw_version: number;
    board_version: number;
    flight_custom_version: string;
    middleware_custom_version: string;
    os_custom_version: string;
    vendor_id: number;
    product_id: number;
    uid: Int64;
    uid2: string;
}
export interface landing_target extends MessageBase {
    _name: 'LANDING_TARGET';
    _header: Header;
    time_usec: Int64;
    target_num: number;
    frame: number;
    angle_x: number;
    angle_y: number;
    distance: number;
    size_x: number;
    size_y: number;
    x: number;
    y: number;
    z: number;
    q: number[];
    type: number;
    position_valid: number;
}
export interface fence_status extends MessageBase {
    _name: 'FENCE_STATUS';
    _header: Header;
    breach_status: number;
    breach_count: number;
    breach_type: number;
    breach_time: number;
    breach_mitigation: number;
}
export interface mag_cal_report extends MessageBase {
    _name: 'MAG_CAL_REPORT';
    _header: Header;
    compass_id: number;
    cal_mask: number;
    cal_status: number;
    autosaved: number;
    fitness: number;
    ofs_x: number;
    ofs_y: number;
    ofs_z: number;
    diag_x: number;
    diag_y: number;
    diag_z: number;
    offdiag_x: number;
    offdiag_y: number;
    offdiag_z: number;
    orientation_confidence: number;
    old_orientation: number;
    new_orientation: number;
    scale_factor: number;
}
export interface efi_status extends MessageBase {
    _name: 'EFI_STATUS';
    _header: Header;
    health: number;
    ecu_index: number;
    rpm: number;
    fuel_consumed: number;
    fuel_flow: number;
    engine_load: number;
    throttle_position: number;
    spark_dwell_time: number;
    barometric_pressure: number;
    intake_manifold_pressure: number;
    intake_manifold_temperature: number;
    cylinder_head_temperature: number;
    ignition_timing: number;
    injection_time: number;
    exhaust_gas_temperature: number;
    throttle_out: number;
    pt_compensation: number;
    ignition_voltage: number;
    fuel_pressure: number;
}
export interface estimator_status extends MessageBase {
    _name: 'ESTIMATOR_STATUS';
    _header: Header;
    time_usec: Int64;
    flags: number;
    vel_ratio: number;
    pos_horiz_ratio: number;
    pos_vert_ratio: number;
    mag_ratio: number;
    hagl_ratio: number;
    tas_ratio: number;
    pos_horiz_accuracy: number;
    pos_vert_accuracy: number;
}
export interface wind_cov extends MessageBase {
    _name: 'WIND_COV';
    _header: Header;
    time_usec: Int64;
    wind_x: number;
    wind_y: number;
    wind_z: number;
    var_horiz: number;
    var_vert: number;
    wind_alt: number;
    horiz_accuracy: number;
    vert_accuracy: number;
}
export interface gps_input extends MessageBase {
    _name: 'GPS_INPUT';
    _header: Header;
    time_usec: Int64;
    gps_id: number;
    ignore_flags: number;
    time_week_ms: number;
    time_week: number;
    fix_type: number;
    lat: number;
    lon: number;
    alt: number;
    hdop: number;
    vdop: number;
    vn: number;
    ve: number;
    vd: number;
    speed_accuracy: number;
    horiz_accuracy: number;
    vert_accuracy: number;
    satellites_visible: number;
    yaw: number;
}
export interface gps_rtcm_data extends MessageBase {
    _name: 'GPS_RTCM_DATA';
    _header: Header;
    flags: number;
    len: number;
    data: string;
}
export interface high_latency extends MessageBase {
    _name: 'HIGH_LATENCY';
    _header: Header;
    base_mode: number;
    custom_mode: number;
    landed_state: number;
    roll: number;
    pitch: number;
    heading: number;
    throttle: number;
    heading_sp: number;
    latitude: number;
    longitude: number;
    altitude_amsl: number;
    altitude_sp: number;
    airspeed: number;
    airspeed_sp: number;
    groundspeed: number;
    climb_rate: number;
    gps_nsat: number;
    gps_fix_type: number;
    battery_remaining: number;
    temperature: number;
    temperature_air: number;
    failsafe: number;
    wp_num: number;
    wp_distance: number;
}
export interface high_latency2 extends MessageBase {
    _name: 'HIGH_LATENCY2';
    _header: Header;
    timestamp: number;
    type: number;
    autopilot: number;
    custom_mode: number;
    latitude: number;
    longitude: number;
    altitude: number;
    target_altitude: number;
    heading: number;
    target_heading: number;
    target_distance: number;
    throttle: number;
    airspeed: number;
    airspeed_sp: number;
    groundspeed: number;
    windspeed: number;
    wind_heading: number;
    eph: number;
    epv: number;
    temperature_air: number;
    climb_rate: number;
    battery: number;
    wp_num: number;
    failure_flags: number;
    custom0: number;
    custom1: number;
    custom2: number;
}
export interface vibration extends MessageBase {
    _name: 'VIBRATION';
    _header: Header;
    time_usec: Int64;
    vibration_x: number;
    vibration_y: number;
    vibration_z: number;
    clipping_0: number;
    clipping_1: number;
    clipping_2: number;
}
export interface home_position extends MessageBase {
    _name: 'HOME_POSITION';
    _header: Header;
    latitude: number;
    longitude: number;
    altitude: number;
    x: number;
    y: number;
    z: number;
    q: number[];
    approach_x: number;
    approach_y: number;
    approach_z: number;
    time_usec: Int64;
}
export interface set_home_position extends MessageBase {
    _name: 'SET_HOME_POSITION';
    _header: Header;
    target_system: number;
    latitude: number;
    longitude: number;
    altitude: number;
    x: number;
    y: number;
    z: number;
    q: number[];
    approach_x: number;
    approach_y: number;
    approach_z: number;
    time_usec: Int64;
}
export interface message_interval extends MessageBase {
    _name: 'MESSAGE_INTERVAL';
    _header: Header;
    message_id: number;
    interval_us: number;
}
export interface extended_sys_state extends MessageBase {
    _name: 'EXTENDED_SYS_STATE';
    _header: Header;
    vtol_state: number;
    landed_state: number;
}
export interface adsb_vehicle extends MessageBase {
    _name: 'ADSB_VEHICLE';
    _header: Header;
    ICAO_address: number;
    lat: number;
    lon: number;
    altitude_type: number;
    altitude: number;
    heading: number;
    hor_velocity: number;
    ver_velocity: number;
    callsign: string;
    emitter_type: number;
    tslc: number;
    flags: number;
    squawk: number;
}
export interface collision extends MessageBase {
    _name: 'COLLISION';
    _header: Header;
    src: number;
    id: number;
    action: number;
    threat_level: number;
    time_to_minimum_delta: number;
    altitude_minimum_delta: number;
    horizontal_minimum_delta: number;
}
export interface v2_extension extends MessageBase {
    _name: 'V2_EXTENSION';
    _header: Header;
    target_network: number;
    target_system: number;
    target_component: number;
    message_type: number;
    payload: string;
}
export interface memory_vect extends MessageBase {
    _name: 'MEMORY_VECT';
    _header: Header;
    address: number;
    ver: number;
    type: number;
    value: string;
}
export interface debug_vect extends MessageBase {
    _name: 'DEBUG_VECT';
    _header: Header;
    name: string;
    time_usec: Int64;
    x: number;
    y: number;
    z: number;
}
export interface named_value_float extends MessageBase {
    _name: 'NAMED_VALUE_FLOAT';
    _header: Header;
    time_boot_ms: number;
    name: string;
    value: number;
}
export interface named_value_int extends MessageBase {
    _name: 'NAMED_VALUE_INT';
    _header: Header;
    time_boot_ms: number;
    name: string;
    value: number;
}
export interface statustext extends MessageBase {
    _name: 'STATUSTEXT';
    _header: Header;
    severity: number;
    text: string;
    id: number;
    chunk_seq: number;
}
export interface debug extends MessageBase {
    _name: 'DEBUG';
    _header: Header;
    time_boot_ms: number;
    ind: number;
    value: number;
}
export interface setup_signing extends MessageBase {
    _name: 'SETUP_SIGNING';
    _header: Header;
    target_system: number;
    target_component: number;
    secret_key: string;
    initial_timestamp: Int64;
}
export interface button_change extends MessageBase {
    _name: 'BUTTON_CHANGE';
    _header: Header;
    time_boot_ms: number;
    last_change_ms: number;
    state: number;
}
export interface play_tune extends MessageBase {
    _name: 'PLAY_TUNE';
    _header: Header;
    target_system: number;
    target_component: number;
    tune: string;
    tune2: string;
}
export interface camera_information extends MessageBase {
    _name: 'CAMERA_INFORMATION';
    _header: Header;
    time_boot_ms: number;
    vendor_name: string;
    model_name: string;
    firmware_version: number;
    focal_length: number;
    sensor_size_h: number;
    sensor_size_v: number;
    resolution_h: number;
    resolution_v: number;
    lens_id: number;
    flags: number;
    cam_definition_version: number;
    cam_definition_uri: string;
    gimbal_device_id: number;
}
export interface camera_settings extends MessageBase {
    _name: 'CAMERA_SETTINGS';
    _header: Header;
    time_boot_ms: number;
    mode_id: number;
    zoomLevel: number;
    focusLevel: number;
}
export interface storage_information extends MessageBase {
    _name: 'STORAGE_INFORMATION';
    _header: Header;
    time_boot_ms: number;
    storage_id: number;
    storage_count: number;
    status: number;
    total_capacity: number;
    used_capacity: number;
    available_capacity: number;
    read_speed: number;
    write_speed: number;
    type: number;
    name: string;
}
export interface camera_capture_status extends MessageBase {
    _name: 'CAMERA_CAPTURE_STATUS';
    _header: Header;
    time_boot_ms: number;
    image_status: number;
    video_status: number;
    image_interval: number;
    recording_time_ms: number;
    available_capacity: number;
    image_count: number;
}
export interface camera_image_captured extends MessageBase {
    _name: 'CAMERA_IMAGE_CAPTURED';
    _header: Header;
    time_boot_ms: number;
    time_utc: Int64;
    camera_id: number;
    lat: number;
    lon: number;
    alt: number;
    relative_alt: number;
    q: number[];
    image_index: number;
    capture_result: number;
    file_url: string;
}
export interface flight_information extends MessageBase {
    _name: 'FLIGHT_INFORMATION';
    _header: Header;
    time_boot_ms: number;
    arming_time_utc: Int64;
    takeoff_time_utc: Int64;
    flight_uuid: Int64;
}
export interface mount_orientation extends MessageBase {
    _name: 'MOUNT_ORIENTATION';
    _header: Header;
    time_boot_ms: number;
    roll: number;
    pitch: number;
    yaw: number;
    yaw_absolute: number;
}
export interface logging_data extends MessageBase {
    _name: 'LOGGING_DATA';
    _header: Header;
    target_system: number;
    target_component: number;
    sequence: number;
    length: number;
    first_message_offset: number;
    data: string;
}
export interface logging_data_acked extends MessageBase {
    _name: 'LOGGING_DATA_ACKED';
    _header: Header;
    target_system: number;
    target_component: number;
    sequence: number;
    length: number;
    first_message_offset: number;
    data: string;
}
export interface logging_ack extends MessageBase {
    _name: 'LOGGING_ACK';
    _header: Header;
    target_system: number;
    target_component: number;
    sequence: number;
}
export interface video_stream_information extends MessageBase {
    _name: 'VIDEO_STREAM_INFORMATION';
    _header: Header;
    stream_id: number;
    count: number;
    type: number;
    flags: number;
    framerate: number;
    resolution_h: number;
    resolution_v: number;
    bitrate: number;
    rotation: number;
    hfov: number;
    name: string;
    uri: string;
    encoding: number;
}
export interface video_stream_status extends MessageBase {
    _name: 'VIDEO_STREAM_STATUS';
    _header: Header;
    stream_id: number;
    flags: number;
    framerate: number;
    resolution_h: number;
    resolution_v: number;
    bitrate: number;
    rotation: number;
    hfov: number;
}
export interface camera_fov_status extends MessageBase {
    _name: 'CAMERA_FOV_STATUS';
    _header: Header;
    time_boot_ms: number;
    lat_camera: number;
    lon_camera: number;
    alt_camera: number;
    lat_image: number;
    lon_image: number;
    alt_image: number;
    q: number[];
    hfov: number;
    vfov: number;
}
export interface camera_tracking_image_status extends MessageBase {
    _name: 'CAMERA_TRACKING_IMAGE_STATUS';
    _header: Header;
    tracking_status: number;
    tracking_mode: number;
    target_data: number;
    point_x: number;
    point_y: number;
    radius: number;
    rec_top_x: number;
    rec_top_y: number;
    rec_bottom_x: number;
    rec_bottom_y: number;
}
export interface camera_tracking_geo_status extends MessageBase {
    _name: 'CAMERA_TRACKING_GEO_STATUS';
    _header: Header;
    tracking_status: number;
    lat: number;
    lon: number;
    alt: number;
    h_acc: number;
    v_acc: number;
    vel_n: number;
    vel_e: number;
    vel_d: number;
    vel_acc: number;
    dist: number;
    hdg: number;
    hdg_acc: number;
}
export interface camera_thermal_range extends MessageBase {
    _name: 'CAMERA_THERMAL_RANGE';
    _header: Header;
    time_boot_ms: number;
    stream_id: number;
    camera_device_id: number;
    max: number;
    max_point_x: number;
    max_point_y: number;
    min: number;
    min_point_x: number;
    min_point_y: number;
}
export interface gimbal_manager_information extends MessageBase {
    _name: 'GIMBAL_MANAGER_INFORMATION';
    _header: Header;
    time_boot_ms: number;
    cap_flags: number;
    gimbal_device_id: number;
    roll_min: number;
    roll_max: number;
    pitch_min: number;
    pitch_max: number;
    yaw_min: number;
    yaw_max: number;
}
export interface gimbal_manager_status extends MessageBase {
    _name: 'GIMBAL_MANAGER_STATUS';
    _header: Header;
    time_boot_ms: number;
    flags: number;
    gimbal_device_id: number;
    primary_control_sysid: number;
    primary_control_compid: number;
    secondary_control_sysid: number;
    secondary_control_compid: number;
}
export interface gimbal_manager_set_attitude extends MessageBase {
    _name: 'GIMBAL_MANAGER_SET_ATTITUDE';
    _header: Header;
    target_system: number;
    target_component: number;
    flags: number;
    gimbal_device_id: number;
    q: number[];
    angular_velocity_x: number;
    angular_velocity_y: number;
    angular_velocity_z: number;
}
export interface gimbal_device_information extends MessageBase {
    _name: 'GIMBAL_DEVICE_INFORMATION';
    _header: Header;
    time_boot_ms: number;
    vendor_name: string;
    model_name: string;
    custom_name: string;
    firmware_version: number;
    hardware_version: number;
    uid: Int64;
    cap_flags: number;
    custom_cap_flags: number;
    roll_min: number;
    roll_max: number;
    pitch_min: number;
    pitch_max: number;
    yaw_min: number;
    yaw_max: number;
    gimbal_device_id: number;
}
export interface gimbal_device_set_attitude extends MessageBase {
    _name: 'GIMBAL_DEVICE_SET_ATTITUDE';
    _header: Header;
    target_system: number;
    target_component: number;
    flags: number;
    q: number[];
    angular_velocity_x: number;
    angular_velocity_y: number;
    angular_velocity_z: number;
}
export interface gimbal_device_attitude_status extends MessageBase {
    _name: 'GIMBAL_DEVICE_ATTITUDE_STATUS';
    _header: Header;
    target_system: number;
    target_component: number;
    time_boot_ms: number;
    flags: number;
    q: number[];
    angular_velocity_x: number;
    angular_velocity_y: number;
    angular_velocity_z: number;
    failure_flags: number;
    delta_yaw: number;
    delta_yaw_velocity: number;
    gimbal_device_id: number;
}
export interface autopilot_state_for_gimbal_device extends MessageBase {
    _name: 'AUTOPILOT_STATE_FOR_GIMBAL_DEVICE';
    _header: Header;
    target_system: number;
    target_component: number;
    time_boot_us: Int64;
    q: number[];
    q_estimated_delay_us: number;
    vx: number;
    vy: number;
    vz: number;
    v_estimated_delay_us: number;
    feed_forward_angular_velocity_z: number;
    estimator_status: number;
    landed_state: number;
    angular_velocity_z: number;
}
export interface gimbal_manager_set_pitchyaw extends MessageBase {
    _name: 'GIMBAL_MANAGER_SET_PITCHYAW';
    _header: Header;
    target_system: number;
    target_component: number;
    flags: number;
    gimbal_device_id: number;
    pitch: number;
    yaw: number;
    pitch_rate: number;
    yaw_rate: number;
}
export interface gimbal_manager_set_manual_control extends MessageBase {
    _name: 'GIMBAL_MANAGER_SET_MANUAL_CONTROL';
    _header: Header;
    target_system: number;
    target_component: number;
    flags: number;
    gimbal_device_id: number;
    pitch: number;
    yaw: number;
    pitch_rate: number;
    yaw_rate: number;
}
export interface wifi_config_ap extends MessageBase {
    _name: 'WIFI_CONFIG_AP';
    _header: Header;
    ssid: string;
    password: string;
}
export interface ais_vessel extends MessageBase {
    _name: 'AIS_VESSEL';
    _header: Header;
    MMSI: number;
    lat: number;
    lon: number;
    COG: number;
    heading: number;
    velocity: number;
    turn_rate: number;
    navigational_status: number;
    type: number;
    dimension_bow: number;
    dimension_stern: number;
    dimension_port: number;
    dimension_starboard: number;
    callsign: string;
    name: string;
    tslc: number;
    flags: number;
}
export interface uavcan_node_status extends MessageBase {
    _name: 'UAVCAN_NODE_STATUS';
    _header: Header;
    time_usec: Int64;
    uptime_sec: number;
    health: number;
    mode: number;
    sub_mode: number;
    vendor_specific_status_code: number;
}
export interface uavcan_node_info extends MessageBase {
    _name: 'UAVCAN_NODE_INFO';
    _header: Header;
    time_usec: Int64;
    uptime_sec: number;
    name: string;
    hw_version_major: number;
    hw_version_minor: number;
    hw_unique_id: string;
    sw_version_major: number;
    sw_version_minor: number;
    sw_vcs_commit: number;
}
export interface param_ext_request_read extends MessageBase {
    _name: 'PARAM_EXT_REQUEST_READ';
    _header: Header;
    target_system: number;
    target_component: number;
    param_id: string;
    param_index: number;
}
export interface param_ext_request_list extends MessageBase {
    _name: 'PARAM_EXT_REQUEST_LIST';
    _header: Header;
    target_system: number;
    target_component: number;
}
export interface param_ext_value extends MessageBase {
    _name: 'PARAM_EXT_VALUE';
    _header: Header;
    param_id: string;
    param_value: string;
    param_type: number;
    param_count: number;
    param_index: number;
}
export interface param_ext_set extends MessageBase {
    _name: 'PARAM_EXT_SET';
    _header: Header;
    target_system: number;
    target_component: number;
    param_id: string;
    param_value: string;
    param_type: number;
}
export interface param_ext_ack extends MessageBase {
    _name: 'PARAM_EXT_ACK';
    _header: Header;
    param_id: string;
    param_value: string;
    param_type: number;
    param_result: number;
}
export interface obstacle_distance extends MessageBase {
    _name: 'OBSTACLE_DISTANCE';
    _header: Header;
    time_usec: Int64;
    sensor_type: number;
    distances: number[];
    increment: number;
    min_distance: number;
    max_distance: number;
    increment_f: number;
    angle_offset: number;
    frame: number;
}
export interface odometry extends MessageBase {
    _name: 'ODOMETRY';
    _header: Header;
    time_usec: Int64;
    frame_id: number;
    child_frame_id: number;
    x: number;
    y: number;
    z: number;
    q: number[];
    vx: number;
    vy: number;
    vz: number;
    rollspeed: number;
    pitchspeed: number;
    yawspeed: number;
    pose_covariance: number[];
    velocity_covariance: number[];
    reset_counter: number;
    estimator_type: number;
    quality: number;
}
export interface trajectory_representation_waypoints extends MessageBase {
    _name: 'TRAJECTORY_REPRESENTATION_WAYPOINTS';
    _header: Header;
    time_usec: Int64;
    valid_points: number;
    pos_x: number[];
    pos_y: number[];
    pos_z: number[];
    vel_x: number[];
    vel_y: number[];
    vel_z: number[];
    acc_x: number[];
    acc_y: number[];
    acc_z: number[];
    pos_yaw: number[];
    vel_yaw: number[];
    command: number[];
}
export interface trajectory_representation_bezier extends MessageBase {
    _name: 'TRAJECTORY_REPRESENTATION_BEZIER';
    _header: Header;
    time_usec: Int64;
    valid_points: number;
    pos_x: number[];
    pos_y: number[];
    pos_z: number[];
    delta: number[];
    pos_yaw: number[];
}
export interface isbd_link_status extends MessageBase {
    _name: 'ISBD_LINK_STATUS';
    _header: Header;
    timestamp: Int64;
    last_heartbeat: Int64;
    failed_sessions: number;
    successful_sessions: number;
    signal_quality: number;
    ring_pending: number;
    tx_session_pending: number;
    rx_session_pending: number;
}
export interface raw_rpm extends MessageBase {
    _name: 'RAW_RPM';
    _header: Header;
    index: number;
    frequency: number;
}
export interface utm_global_position extends MessageBase {
    _name: 'UTM_GLOBAL_POSITION';
    _header: Header;
    time: Int64;
    uas_id: string;
    lat: number;
    lon: number;
    alt: number;
    relative_alt: number;
    vx: number;
    vy: number;
    vz: number;
    h_acc: number;
    v_acc: number;
    vel_acc: number;
    next_lat: number;
    next_lon: number;
    next_alt: number;
    update_rate: number;
    flight_state: number;
    flags: number;
}
export interface debug_float_array extends MessageBase {
    _name: 'DEBUG_FLOAT_ARRAY';
    _header: Header;
    time_usec: Int64;
    name: string;
    array_id: number;
    data: number[];
}
export interface smart_battery_info extends MessageBase {
    _name: 'SMART_BATTERY_INFO';
    _header: Header;
    id: number;
    battery_function: number;
    type: number;
    capacity_full_specification: number;
    capacity_full: number;
    cycle_count: number;
    serial_number: string;
    device_name: string;
    weight: number;
    discharge_minimum_voltage: number;
    charging_minimum_voltage: number;
    resting_minimum_voltage: number;
    charging_maximum_voltage: number;
    cells_in_series: number;
    discharge_maximum_current: number;
    discharge_maximum_burst_current: number;
    manufacture_date: string;
}
export interface generator_status extends MessageBase {
    _name: 'GENERATOR_STATUS';
    _header: Header;
    status: Int64;
    generator_speed: number;
    battery_current: number;
    load_current: number;
    power_generated: number;
    bus_voltage: number;
    rectifier_temperature: number;
    bat_current_setpoint: number;
    generator_temperature: number;
    runtime: number;
    time_until_maintenance: number;
}
export interface actuator_output_status extends MessageBase {
    _name: 'ACTUATOR_OUTPUT_STATUS';
    _header: Header;
    time_usec: Int64;
    active: number;
    actuator: number[];
}
export interface relay_status extends MessageBase {
    _name: 'RELAY_STATUS';
    _header: Header;
    time_boot_ms: number;
    on: number;
    present: number;
}
export interface tunnel extends MessageBase {
    _name: 'TUNNEL';
    _header: Header;
    target_system: number;
    target_component: number;
    payload_type: number;
    payload_length: number;
    payload: string;
}
export interface can_frame extends MessageBase {
    _name: 'CAN_FRAME';
    _header: Header;
    target_system: number;
    target_component: number;
    bus: number;
    len: number;
    id: number;
    data: string;
}
export interface canfd_frame extends MessageBase {
    _name: 'CANFD_FRAME';
    _header: Header;
    target_system: number;
    target_component: number;
    bus: number;
    len: number;
    id: number;
    data: string;
}
export interface can_filter_modify extends MessageBase {
    _name: 'CAN_FILTER_MODIFY';
    _header: Header;
    target_system: number;
    target_component: number;
    bus: number;
    operation: number;
    num_ids: number;
    ids: number[];
}
export interface wheel_distance extends MessageBase {
    _name: 'WHEEL_DISTANCE';
    _header: Header;
    time_usec: Int64;
    count: number;
    distance: number[];
}
export interface winch_status extends MessageBase {
    _name: 'WINCH_STATUS';
    _header: Header;
    time_usec: Int64;
    line_length: number;
    speed: number;
    tension: number;
    voltage: number;
    current: number;
    temperature: number;
    status: number;
}
export interface open_drone_id_basic_id extends MessageBase {
    _name: 'OPEN_DRONE_ID_BASIC_ID';
    _header: Header;
    target_system: number;
    target_component: number;
    id_or_mac: string;
    id_type: number;
    ua_type: number;
    uas_id: string;
}
export interface open_drone_id_location extends MessageBase {
    _name: 'OPEN_DRONE_ID_LOCATION';
    _header: Header;
    target_system: number;
    target_component: number;
    id_or_mac: string;
    status: number;
    direction: number;
    speed_horizontal: number;
    speed_vertical: number;
    latitude: number;
    longitude: number;
    altitude_barometric: number;
    altitude_geodetic: number;
    height_reference: number;
    height: number;
    horizontal_accuracy: number;
    vertical_accuracy: number;
    barometer_accuracy: number;
    speed_accuracy: number;
    timestamp: number;
    timestamp_accuracy: number;
}
export interface open_drone_id_authentication extends MessageBase {
    _name: 'OPEN_DRONE_ID_AUTHENTICATION';
    _header: Header;
    target_system: number;
    target_component: number;
    id_or_mac: string;
    authentication_type: number;
    data_page: number;
    last_page_index: number;
    length: number;
    timestamp: number;
    authentication_data: string;
}
export interface open_drone_id_self_id extends MessageBase {
    _name: 'OPEN_DRONE_ID_SELF_ID';
    _header: Header;
    target_system: number;
    target_component: number;
    id_or_mac: string;
    description_type: number;
    description: string;
}
export interface open_drone_id_system extends MessageBase {
    _name: 'OPEN_DRONE_ID_SYSTEM';
    _header: Header;
    target_system: number;
    target_component: number;
    id_or_mac: string;
    operator_location_type: number;
    classification_type: number;
    operator_latitude: number;
    operator_longitude: number;
    area_count: number;
    area_radius: number;
    area_ceiling: number;
    area_floor: number;
    category_eu: number;
    class_eu: number;
    operator_altitude_geo: number;
    timestamp: number;
}
export interface open_drone_id_operator_id extends MessageBase {
    _name: 'OPEN_DRONE_ID_OPERATOR_ID';
    _header: Header;
    target_system: number;
    target_component: number;
    id_or_mac: string;
    operator_id_type: number;
    operator_id: string;
}
export interface open_drone_id_arm_status extends MessageBase {
    _name: 'OPEN_DRONE_ID_ARM_STATUS';
    _header: Header;
    status: number;
    error: string;
}
export interface open_drone_id_message_pack extends MessageBase {
    _name: 'OPEN_DRONE_ID_MESSAGE_PACK';
    _header: Header;
    target_system: number;
    target_component: number;
    id_or_mac: string;
    single_message_size: number;
    msg_pack_size: number;
    messages: string;
}
export interface open_drone_id_system_update extends MessageBase {
    _name: 'OPEN_DRONE_ID_SYSTEM_UPDATE';
    _header: Header;
    target_system: number;
    target_component: number;
    operator_latitude: number;
    operator_longitude: number;
    operator_altitude_geo: number;
    timestamp: number;
}
export interface hygrometer_sensor extends MessageBase {
    _name: 'HYGROMETER_SENSOR';
    _header: Header;
    id: number;
    temperature: number;
    humidity: number;
}
export interface mission_checksum extends MessageBase {
    _name: 'MISSION_CHECKSUM';
    _header: Header;
    mission_type: number;
    checksum: number;
}
export interface airspeed extends MessageBase {
    _name: 'AIRSPEED';
    _header: Header;
    id: number;
    airspeed: number;
    temperature: number;
    raw_press: number;
    flags: number;
}
export interface radio_rc_channels extends MessageBase {
    _name: 'RADIO_RC_CHANNELS';
    _header: Header;
    target_system: number;
    target_component: number;
    time_last_update_ms: number;
    flags: number;
    count: number;
    channels: number[];
}
export interface available_modes extends MessageBase {
    _name: 'AVAILABLE_MODES';
    _header: Header;
    number_modes: number;
    mode_index: number;
    standard_mode: number;
    custom_mode: number;
    properties: number;
    mode_name: string;
}
export interface current_mode extends MessageBase {
    _name: 'CURRENT_MODE';
    _header: Header;
    standard_mode: number;
    custom_mode: number;
    intended_custom_mode: number;
}
export interface available_modes_monitor extends MessageBase {
    _name: 'AVAILABLE_MODES_MONITOR';
    _header: Header;
    seq: number;
}
export interface gnss_integrity extends MessageBase {
    _name: 'GNSS_INTEGRITY';
    _header: Header;
    id: number;
    system_errors: number;
    authentication_state: number;
    jamming_state: number;
    spoofing_state: number;
    raim_state: number;
    raim_hfom: number;
    raim_vfom: number;
    corrections_quality: number;
    system_status_summary: number;
    gnss_signal_quality: number;
    post_processing_quality: number;
}
export interface icarous_heartbeat extends MessageBase {
    _name: 'ICAROUS_HEARTBEAT';
    _header: Header;
    status: number;
}
export interface icarous_kinematic_bands extends MessageBase {
    _name: 'ICAROUS_KINEMATIC_BANDS';
    _header: Header;
    numBands: number;
    type1: number;
    min1: number;
    max1: number;
    type2: number;
    min2: number;
    max2: number;
    type3: number;
    min3: number;
    max3: number;
    type4: number;
    min4: number;
    max4: number;
    type5: number;
    min5: number;
    max5: number;
}
export interface heartbeat extends MessageBase {
    _name: 'HEARTBEAT';
    _header: Header;
    type: number;
    autopilot: number;
    base_mode: number;
    custom_mode: number;
    system_status: number;
    mavlink_version: number;
}
export interface array_test_0 extends MessageBase {
    _name: 'ARRAY_TEST_0';
    _header: Header;
    v1: number;
    ar_i8: string;
    ar_u8: string;
    ar_u16: number[];
    ar_u32: number[];
}
export interface array_test_1 extends MessageBase {
    _name: 'ARRAY_TEST_1';
    _header: Header;
    ar_u32: number[];
}
export interface array_test_3 extends MessageBase {
    _name: 'ARRAY_TEST_3';
    _header: Header;
    v: number;
    ar_u32: number[];
}
export interface array_test_4 extends MessageBase {
    _name: 'ARRAY_TEST_4';
    _header: Header;
    ar_u32: number[];
    v: number;
}
export interface array_test_5 extends MessageBase {
    _name: 'ARRAY_TEST_5';
    _header: Header;
    c1: string;
    c2: string;
}
export interface array_test_6 extends MessageBase {
    _name: 'ARRAY_TEST_6';
    _header: Header;
    v1: number;
    v2: number;
    v3: number;
    ar_u32: number[];
    ar_i32: number[];
    ar_u16: number[];
    ar_i16: number[];
    ar_u8: string;
    ar_i8: string;
    ar_c: string;
    ar_d: number[];
    ar_f: number[];
}
export interface array_test_7 extends MessageBase {
    _name: 'ARRAY_TEST_7';
    _header: Header;
    ar_d: number[];
    ar_f: number[];
    ar_u32: number[];
    ar_i32: number[];
    ar_u16: number[];
    ar_i16: number[];
    ar_u8: string;
    ar_i8: string;
    ar_c: string;
}
export interface array_test_8 extends MessageBase {
    _name: 'ARRAY_TEST_8';
    _header: Header;
    v3: number;
    ar_d: number[];
    ar_u16: number[];
}
export interface test_types extends MessageBase {
    _name: 'TEST_TYPES';
    _header: Header;
    c: string;
    s: string;
    u8: number;
    u16: number;
    u32: number;
    u64: Int64;
    s8: number;
    s16: number;
    s32: number;
    s64: Int64;
    f: number;
    d: number;
    u8_array: string;
    u16_array: number[];
    u32_array: number[];
    u64_array: Int64[];
    s8_array: string;
    s16_array: number[];
    s32_array: number[];
    s64_array: Int64[];
    f_array: number[];
    d_array: number[];
}
export interface nav_filter_bias extends MessageBase {
    _name: 'NAV_FILTER_BIAS';
    _header: Header;
    usec: Int64;
    accel_0: number;
    accel_1: number;
    accel_2: number;
    gyro_0: number;
    gyro_1: number;
    gyro_2: number;
}
export interface radio_calibration extends MessageBase {
    _name: 'RADIO_CALIBRATION';
    _header: Header;
    aileron: number[];
    elevator: number[];
    rudder: number[];
    gyro: number[];
    pitch: number[];
    throttle: number[];
}
export interface ualberta_sys_status extends MessageBase {
    _name: 'UALBERTA_SYS_STATUS';
    _header: Header;
    mode: number;
    nav_mode: number;
    pilot: number;
}
export interface uavionix_adsb_out_cfg extends MessageBase {
    _name: 'UAVIONIX_ADSB_OUT_CFG';
    _header: Header;
    ICAO: number;
    callsign: string;
    emitterType: number;
    aircraftSize: number;
    gpsOffsetLat: number;
    gpsOffsetLon: number;
    stallSpeed: number;
    rfSelect: number;
}
export interface uavionix_adsb_out_dynamic extends MessageBase {
    _name: 'UAVIONIX_ADSB_OUT_DYNAMIC';
    _header: Header;
    utcTime: number;
    gpsLat: number;
    gpsLon: number;
    gpsAlt: number;
    gpsFix: number;
    numSats: number;
    baroAltMSL: number;
    accuracyHor: number;
    accuracyVert: number;
    accuracyVel: number;
    velVert: number;
    velNS: number;
    VelEW: number;
    emergencyStatus: number;
    state: number;
    squawk: number;
}
export interface uavionix_adsb_transceiver_health_report extends MessageBase {
    _name: 'UAVIONIX_ADSB_TRANSCEIVER_HEALTH_REPORT';
    _header: Header;
    rfHealth: number;
}
export interface uavionix_adsb_out_cfg_registration extends MessageBase {
    _name: 'UAVIONIX_ADSB_OUT_CFG_REGISTRATION';
    _header: Header;
    registration: string;
}
export interface uavionix_adsb_out_cfg_flightid extends MessageBase {
    _name: 'UAVIONIX_ADSB_OUT_CFG_FLIGHTID';
    _header: Header;
    flight_id: string;
}
export interface uavionix_adsb_get extends MessageBase {
    _name: 'UAVIONIX_ADSB_GET';
    _header: Header;
    ReqMessageId: number;
}
export interface uavionix_adsb_out_control extends MessageBase {
    _name: 'UAVIONIX_ADSB_OUT_CONTROL';
    _header: Header;
    state: number;
    baroAltMSL: number;
    squawk: number;
    emergencyStatus: number;
    flight_id: string;
    x_bit: number;
}
export interface uavionix_adsb_out_status extends MessageBase {
    _name: 'UAVIONIX_ADSB_OUT_STATUS';
    _header: Header;
    state: number;
    squawk: number;
    NIC_NACp: number;
    boardTemp: number;
    fault: number;
    flight_id: string;
}
export interface loweheiser_gov_efi extends MessageBase {
    _name: 'LOWEHEISER_GOV_EFI';
    _header: Header;
    volt_batt: number;
    curr_batt: number;
    curr_gen: number;
    curr_rot: number;
    fuel_level: number;
    throttle: number;
    runtime: number;
    until_maintenance: number;
    rectifier_temp: number;
    generator_temp: number;
    efi_batt: number;
    efi_rpm: number;
    efi_pw: number;
    efi_fuel_flow: number;
    efi_fuel_consumed: number;
    efi_baro: number;
    efi_mat: number;
    efi_clt: number;
    efi_tps: number;
    efi_exhaust_gas_temperature: number;
    efi_index: number;
    generator_status: number;
    efi_status: number;
}
export interface storm32_gimbal_manager_information extends MessageBase {
    _name: 'STORM32_GIMBAL_MANAGER_INFORMATION';
    _header: Header;
    gimbal_id: number;
    device_cap_flags: number;
    manager_cap_flags: number;
    roll_min: number;
    roll_max: number;
    pitch_min: number;
    pitch_max: number;
    yaw_min: number;
    yaw_max: number;
}
export interface storm32_gimbal_manager_status extends MessageBase {
    _name: 'STORM32_GIMBAL_MANAGER_STATUS';
    _header: Header;
    gimbal_id: number;
    supervisor: number;
    device_flags: number;
    manager_flags: number;
    profile: number;
}
export interface storm32_gimbal_manager_control extends MessageBase {
    _name: 'STORM32_GIMBAL_MANAGER_CONTROL';
    _header: Header;
    target_system: number;
    target_component: number;
    gimbal_id: number;
    client: number;
    device_flags: number;
    manager_flags: number;
    q: number[];
    angular_velocity_x: number;
    angular_velocity_y: number;
    angular_velocity_z: number;
}
export interface storm32_gimbal_manager_control_pitchyaw extends MessageBase {
    _name: 'STORM32_GIMBAL_MANAGER_CONTROL_PITCHYAW';
    _header: Header;
    target_system: number;
    target_component: number;
    gimbal_id: number;
    client: number;
    device_flags: number;
    manager_flags: number;
    pitch: number;
    yaw: number;
    pitch_rate: number;
    yaw_rate: number;
}
export interface storm32_gimbal_manager_correct_roll extends MessageBase {
    _name: 'STORM32_GIMBAL_MANAGER_CORRECT_ROLL';
    _header: Header;
    target_system: number;
    target_component: number;
    gimbal_id: number;
    client: number;
    roll: number;
}
export interface qshot_status extends MessageBase {
    _name: 'QSHOT_STATUS';
    _header: Header;
    mode: number;
    shot_state: number;
}
export interface autopilot_state_for_gimbal_device_ext extends MessageBase {
    _name: 'AUTOPILOT_STATE_FOR_GIMBAL_DEVICE_EXT';
    _header: Header;
    target_system: number;
    target_component: number;
    time_boot_us: Int64;
    wind_x: number;
    wind_y: number;
    wind_correction_angle: number;
}
export interface frsky_passthrough_array extends MessageBase {
    _name: 'FRSKY_PASSTHROUGH_ARRAY';
    _header: Header;
    time_boot_ms: number;
    count: number;
    packet_buf: string;
}
export interface param_value_array extends MessageBase {
    _name: 'PARAM_VALUE_ARRAY';
    _header: Header;
    param_count: number;
    param_index_first: number;
    param_array_len: number;
    flags: number;
    packet_buf: string;
}
export interface mlrs_radio_link_stats extends MessageBase {
    _name: 'MLRS_RADIO_LINK_STATS';
    _header: Header;
    target_system: number;
    target_component: number;
    flags: number;
    rx_LQ_rc: number;
    rx_LQ_ser: number;
    rx_rssi1: number;
    rx_snr1: number;
    tx_LQ_ser: number;
    tx_rssi1: number;
    tx_snr1: number;
    rx_rssi2: number;
    rx_snr2: number;
    tx_rssi2: number;
    tx_snr2: number;
    frequency1: number;
    frequency2: number;
}
export interface mlrs_radio_link_information extends MessageBase {
    _name: 'MLRS_RADIO_LINK_INFORMATION';
    _header: Header;
    target_system: number;
    target_component: number;
    type: number;
    mode: number;
    tx_power: number;
    rx_power: number;
    tx_frame_rate: number;
    rx_frame_rate: number;
    mode_str: string;
    band_str: string;
    tx_ser_data_rate: number;
    rx_ser_data_rate: number;
    tx_receive_sensitivity: number;
    rx_receive_sensitivity: number;
}
export interface mlrs_radio_link_flow_control extends MessageBase {
    _name: 'MLRS_RADIO_LINK_FLOW_CONTROL';
    _header: Header;
    tx_ser_rate: number;
    rx_ser_rate: number;
    tx_used_ser_bandwidth: number;
    rx_used_ser_bandwidth: number;
    txbuf: number;
}
export interface avss_prs_sys_status extends MessageBase {
    _name: 'AVSS_PRS_SYS_STATUS';
    _header: Header;
    time_boot_ms: number;
    error_status: number;
    battery_status: number;
    arm_status: number;
    charge_status: number;
}
export interface avss_drone_position extends MessageBase {
    _name: 'AVSS_DRONE_POSITION';
    _header: Header;
    time_boot_ms: number;
    lat: number;
    lon: number;
    alt: number;
    ground_alt: number;
    barometer_alt: number;
}
export interface avss_drone_imu extends MessageBase {
    _name: 'AVSS_DRONE_IMU';
    _header: Header;
    time_boot_ms: number;
    q1: number;
    q2: number;
    q3: number;
    q4: number;
    xacc: number;
    yacc: number;
    zacc: number;
    xgyro: number;
    ygyro: number;
    zgyro: number;
}
export interface avss_drone_operation_mode extends MessageBase {
    _name: 'AVSS_DRONE_OPERATION_MODE';
    _header: Header;
    time_boot_ms: number;
    M300_operation_mode: number;
    horsefly_operation_mode: number;
}
export interface cubepilot_raw_rc extends MessageBase {
    _name: 'CUBEPILOT_RAW_RC';
    _header: Header;
    rc_raw: string;
}
export interface herelink_video_stream_information extends MessageBase {
    _name: 'HERELINK_VIDEO_STREAM_INFORMATION';
    _header: Header;
    camera_id: number;
    status: number;
    framerate: number;
    resolution_h: number;
    resolution_v: number;
    bitrate: number;
    rotation: number;
    uri: string;
}
export interface herelink_telem extends MessageBase {
    _name: 'HERELINK_TELEM';
    _header: Header;
    rssi: number;
    snr: number;
    rf_freq: number;
    link_bw: number;
    link_rate: number;
    cpu_temp: number;
    board_temp: number;
}
export interface cubepilot_firmware_update_start extends MessageBase {
    _name: 'CUBEPILOT_FIRMWARE_UPDATE_START';
    _header: Header;
    target_system: number;
    target_component: number;
    size: number;
    crc: number;
}
export interface cubepilot_firmware_update_resp extends MessageBase {
    _name: 'CUBEPILOT_FIRMWARE_UPDATE_RESP';
    _header: Header;
    target_system: number;
    target_component: number;
    offset: number;
}
export interface airlink_auth extends MessageBase {
    _name: 'AIRLINK_AUTH';
    _header: Header;
    login: string;
    password: string;
}
export interface airlink_auth_response extends MessageBase {
    _name: 'AIRLINK_AUTH_RESPONSE';
    _header: Header;
    resp_type: number;
}
export type Message = sensor_offsets | set_mag_offsets | meminfo | ap_adc | digicam_configure | digicam_control | mount_configure | mount_control | mount_status | fence_point | fence_fetch_point | ahrs | simstate | hwstatus | radio | limits_status | wind | data16 | data32 | data64 | data96 | rangefinder | airspeed_autocal | rally_point | rally_fetch_point | compassmot_status | ahrs2 | camera_status | camera_feedback | battery2 | ahrs3 | autopilot_version_request | remote_log_data_block | remote_log_block_status | led_control | mag_cal_progress | ekf_status_report | pid_tuning | deepstall | gimbal_report | gimbal_control | gimbal_torque_cmd_report | gopro_heartbeat | gopro_get_request | gopro_get_response | gopro_set_request | gopro_set_response | rpm | device_op_read | device_op_read_reply | device_op_write | device_op_write_reply | secure_command | secure_command_reply | adap_tuning | vision_position_delta | aoa_ssa | esc_telemetry_1_to_4 | esc_telemetry_5_to_8 | esc_telemetry_9_to_12 | osd_param_config | osd_param_config_reply | osd_param_show_config | osd_param_show_config_reply | obstacle_distance_3d | water_depth | mcu_status | esc_telemetry_13_to_16 | esc_telemetry_17_to_20 | esc_telemetry_21_to_24 | esc_telemetry_25_to_28 | esc_telemetry_29_to_32 | command_int_stamped | command_long_stamped | sens_power | sens_mppt | aslctrl_data | aslctrl_debug | asluav_status | ekf_ext | asl_obctrl | sens_atmos | sens_batmon | fw_soaring_data | sensorpod_status | sens_power_board | gsm_link_status | satcom_link_status | sensor_airflow_angles | sys_status | system_time | ping | change_operator_control | change_operator_control_ack | auth_key | set_mode | param_request_read | param_request_list | param_value | param_set | gps_raw_int | gps_status | scaled_imu | raw_imu | raw_pressure | scaled_pressure | attitude | attitude_quaternion | local_position_ned | global_position_int | rc_channels_scaled | rc_channels_raw | servo_output_raw | mission_request_partial_list | mission_write_partial_list | mission_item | mission_request | mission_set_current | mission_current | mission_request_list | mission_count | mission_clear_all | mission_item_reached | mission_ack | set_gps_global_origin | gps_global_origin | param_map_rc | mission_request_int | safety_set_allowed_area | safety_allowed_area | attitude_quaternion_cov | nav_controller_output | global_position_int_cov | local_position_ned_cov | rc_channels | request_data_stream | data_stream | manual_control | rc_channels_override | mission_item_int | vfr_hud | command_int | command_long | command_ack | manual_setpoint | set_attitude_target | attitude_target | set_position_target_local_ned | position_target_local_ned | set_position_target_global_int | position_target_global_int | local_position_ned_system_global_offset | hil_state | hil_controls | hil_rc_inputs_raw | hil_actuator_controls | optical_flow | global_vision_position_estimate | vision_position_estimate | vision_speed_estimate | vicon_position_estimate | highres_imu | optical_flow_rad | hil_sensor | sim_state | radio_status | file_transfer_protocol | timesync | camera_trigger | hil_gps | hil_optical_flow | hil_state_quaternion | scaled_imu2 | log_request_list | log_entry | log_request_data | log_data | log_erase | log_request_end | gps_inject_data | gps2_raw | power_status | serial_control | gps_rtk | gps2_rtk | scaled_imu3 | data_transmission_handshake | encapsulated_data | distance_sensor | terrain_request | terrain_data | terrain_check | terrain_report | scaled_pressure2 | att_pos_mocap | set_actuator_control_target | actuator_control_target | altitude | resource_request | scaled_pressure3 | follow_target | control_system_state | battery_status | autopilot_version | landing_target | fence_status | mag_cal_report | efi_status | estimator_status | wind_cov | gps_input | gps_rtcm_data | high_latency | high_latency2 | vibration | home_position | set_home_position | message_interval | extended_sys_state | adsb_vehicle | collision | v2_extension | memory_vect | debug_vect | named_value_float | named_value_int | statustext | debug | setup_signing | button_change | play_tune | camera_information | camera_settings | storage_information | camera_capture_status | camera_image_captured | flight_information | mount_orientation | logging_data | logging_data_acked | logging_ack | video_stream_information | video_stream_status | camera_fov_status | camera_tracking_image_status | camera_tracking_geo_status | camera_thermal_range | gimbal_manager_information | gimbal_manager_status | gimbal_manager_set_attitude | gimbal_device_information | gimbal_device_set_attitude | gimbal_device_attitude_status | autopilot_state_for_gimbal_device | gimbal_manager_set_pitchyaw | gimbal_manager_set_manual_control | wifi_config_ap | ais_vessel | uavcan_node_status | uavcan_node_info | param_ext_request_read | param_ext_request_list | param_ext_value | param_ext_set | param_ext_ack | obstacle_distance | odometry | trajectory_representation_waypoints | trajectory_representation_bezier | isbd_link_status | raw_rpm | utm_global_position | debug_float_array | smart_battery_info | generator_status | actuator_output_status | relay_status | tunnel | can_frame | canfd_frame | can_filter_modify | wheel_distance | winch_status | open_drone_id_basic_id | open_drone_id_location | open_drone_id_authentication | open_drone_id_self_id | open_drone_id_system | open_drone_id_operator_id | open_drone_id_arm_status | open_drone_id_message_pack | open_drone_id_system_update | hygrometer_sensor | mission_checksum | airspeed | radio_rc_channels | available_modes | current_mode | available_modes_monitor | gnss_integrity | icarous_heartbeat | icarous_kinematic_bands | heartbeat | array_test_0 | array_test_1 | array_test_3 | array_test_4 | array_test_5 | array_test_6 | array_test_7 | array_test_8 | test_types | nav_filter_bias | radio_calibration | ualberta_sys_status | uavionix_adsb_out_cfg | uavionix_adsb_out_dynamic | uavionix_adsb_transceiver_health_report | uavionix_adsb_out_cfg_registration | uavionix_adsb_out_cfg_flightid | uavionix_adsb_get | uavionix_adsb_out_control | uavionix_adsb_out_status | loweheiser_gov_efi | storm32_gimbal_manager_information | storm32_gimbal_manager_status | storm32_gimbal_manager_control | storm32_gimbal_manager_control_pitchyaw | storm32_gimbal_manager_correct_roll | qshot_status | autopilot_state_for_gimbal_device_ext | frsky_passthrough_array | param_value_array | mlrs_radio_link_stats | mlrs_radio_link_information | mlrs_radio_link_flow_control | avss_prs_sys_status | avss_drone_position | avss_drone_imu | avss_drone_operation_mode | cubepilot_raw_rc | herelink_video_stream_information | herelink_telem | cubepilot_firmware_update_start | cubepilot_firmware_update_resp | airlink_auth | airlink_auth_response;
export type ParsedMessage = Message | BadData;
export interface MessageConstructors {
    sensor_offsets: { new(mag_ofs_x?: number, mag_ofs_y?: number, mag_ofs_z?: number, mag_declination?: number, raw_press?: number, raw_temp?: number, gyro_cal_x?: number, gyro_cal_y?: number, gyro_cal_z?: number, accel_cal_x?: number, accel_cal_y?: number, accel_cal_z?: number): Outgoing<sensor_offsets, { mag_ofs_x: number; mag_ofs_y: number; mag_ofs_z: number; mag_declination: number; raw_press: number; raw_temp: number; gyro_cal_x: number; gyro_cal_y: number; gyro_cal_z: number; accel_cal_x: number; accel_cal_y: number; accel_cal_z: number }> };
    set_mag_offsets: { new(target_system?: number, target_component?: number, mag_ofs_x?: number, mag_ofs_y?: number, mag_ofs_z?: number): Outgoing<set_mag_offsets, { target_system: number; target_component: number; mag_ofs_x: number; mag_ofs_y: number; mag_ofs_z: number }> };
    meminfo: { new(brkval?: number, freemem?: number, freemem32?: number): Outgoing<meminfo, { brkval: number; freemem: number; freemem32: number }> };
    ap_adc: { new(adc1?: number, adc2?: number, adc3?: number, adc4?: number, adc5?: number, adc6?: number): Outgoing<ap_adc, { adc1: number; adc2: number; adc3: number; adc4: number; adc5: number; adc6: number }> };
    digicam_configure: { new(target_system?: number, target_component?: number, mode?: number, shutter_speed?: number, aperture?: number, iso?: number, exposure_type?: number, command_id?: number, engine_cut_off?: number, extra_param?: number, extra_value?: number): Outgoing<digicam_configure, { target_system: number; target_component: number; mode: number; shutter_speed: number; aperture: number; iso: number; exposure_type: number; command_id: number; engine_cut_off: number; extra_param: number; extra_value: number }> };
    digicam_control: { new(target_system?: number, target_component?: number, session?: number, zoom_pos?: number, zoom_step?: number, focus_lock?: number, shot?: number, command_id?: number, extra_param?: number, extra_value?: number): Outgoing<digicam_control, { target_system: number; target_component: number; session: number; zoom_pos: number; zoom_step: number; focus_lock: number; shot: number; command_id: number; extra_param: number; extra_value: number }> };
    mount_configure: { new(target_system?: number, target_component?: number, mount_mode?: number, stab_roll?: number, stab_pitch?: number, stab_yaw?: number): Outgoing<mount_configure, { target_system: number; target_component: number; mount_mode: number; stab_roll: number; stab_pitch: number; stab_yaw: number }> };
    mount_control: { new(target_system?: number, target_component?: number, input_a?: number, input_b?: number, input_c?: number, save_position?: number): Outgoing<mount_control, { target_system: number; target_component: number; input_a: number; input_b: number; input_c: number; save_position: number }> };
    mount_status: { new(target_system?: number, target_component?: number, pointing_a?: number, pointing_b?: number, pointing_c?: number, mount_mode?: number): Outgoing<mount_status, { target_system: number; target_component: number; pointing_a: number; pointing_b: number; pointing_c: number; mount_mode: number }> };
    fence_point: { new(target_system?: number, target_component?: number, idx?: number, count?: number, lat?: number, lng?: number): Outgoing<fence_point, { target_system: number; target_component: number; idx: number; count: number; lat: number; lng: number }> };
    fence_fetch_point: { new(target_system?: number, target_component?: number, idx?: number): Outgoing<fence_fetch_point, { target_system: number; target_component: number; idx: number }> };
    ahrs: { new(omegaIx?: number, omegaIy?: number, omegaIz?: number, accel_weight?: number, renorm_val?: number, error_rp?: number, error_yaw?: number): Outgoing<ahrs, { omegaIx: number; omegaIy: number; omegaIz: number; accel_weight: number; renorm_val: number; error_rp: number; error_yaw: number }> };
    simstate: { new(roll?: number, pitch?: number, yaw?: number, xacc?: number, yacc?: number, zacc?: number, xgyro?: number, ygyro?: number, zgyro?: number, lat?: number, lng?: number): Outgoing<simstate, { roll: number; pitch: number; yaw: number; xacc: number; yacc: number; zacc: number; xgyro: number; ygyro: number; zgyro: number; lat: number; lng: number }> };
    hwstatus: { new(Vcc?: number, I2Cerr?: number): Outgoing<hwstatus, { Vcc: number; I2Cerr: number }> };
    radio: { new(rssi?: number, remrssi?: number, txbuf?: number, noise?: number, remnoise?: number, rxerrors?: number, fixed?: number): Outgoing<radio, { rssi: number; remrssi: number; txbuf: number; noise: number; remnoise: number; rxerrors: number; fixed: number }> };
    limits_status: { new(limits_state?: number, last_trigger?: number, last_action?: number, last_recovery?: number, last_clear?: number, breach_count?: number, mods_enabled?: number, mods_required?: number, mods_triggered?: number): Outgoing<limits_status, { limits_state: number; last_trigger: number; last_action: number; last_recovery: number; last_clear: number; breach_count: number; mods_enabled: number; mods_required: number; mods_triggered: number }> };
    wind: { new(direction?: number, speed?: number, speed_z?: number): Outgoing<wind, { direction: number; speed: number; speed_z: number }> };
    data16: { new(type?: number, len?: number, data?: StringInput): Outgoing<data16, { type: number; len: number; data: StringInput }> };
    data32: { new(type?: number, len?: number, data?: StringInput): Outgoing<data32, { type: number; len: number; data: StringInput }> };
    data64: { new(type?: number, len?: number, data?: StringInput): Outgoing<data64, { type: number; len: number; data: StringInput }> };
    data96: { new(type?: number, len?: number, data?: StringInput): Outgoing<data96, { type: number; len: number; data: StringInput }> };
    rangefinder: { new(distance?: number, voltage?: number): Outgoing<rangefinder, { distance: number; voltage: number }> };
    airspeed_autocal: { new(vx?: number, vy?: number, vz?: number, diff_pressure?: number, EAS2TAS?: number, ratio?: number, state_x?: number, state_y?: number, state_z?: number, Pax?: number, Pby?: number, Pcz?: number): Outgoing<airspeed_autocal, { vx: number; vy: number; vz: number; diff_pressure: number; EAS2TAS: number; ratio: number; state_x: number; state_y: number; state_z: number; Pax: number; Pby: number; Pcz: number }> };
    rally_point: { new(target_system?: number, target_component?: number, idx?: number, count?: number, lat?: number, lng?: number, alt?: number, break_alt?: number, land_dir?: number, flags?: number): Outgoing<rally_point, { target_system: number; target_component: number; idx: number; count: number; lat: number; lng: number; alt: number; break_alt: number; land_dir: number; flags: number }> };
    rally_fetch_point: { new(target_system?: number, target_component?: number, idx?: number): Outgoing<rally_fetch_point, { target_system: number; target_component: number; idx: number }> };
    compassmot_status: { new(throttle?: number, current?: number, interference?: number, CompensationX?: number, CompensationY?: number, CompensationZ?: number): Outgoing<compassmot_status, { throttle: number; current: number; interference: number; CompensationX: number; CompensationY: number; CompensationZ: number }> };
    ahrs2: { new(roll?: number, pitch?: number, yaw?: number, altitude?: number, lat?: number, lng?: number): Outgoing<ahrs2, { roll: number; pitch: number; yaw: number; altitude: number; lat: number; lng: number }> };
    camera_status: { new(time_usec?: Int64Input, target_system?: number, cam_idx?: number, img_idx?: number, event_id?: number, p1?: number, p2?: number, p3?: number, p4?: number): Outgoing<camera_status, { time_usec: Int64Input; target_system: number; cam_idx: number; img_idx: number; event_id: number; p1: number; p2: number; p3: number; p4: number }> };
    camera_feedback: { new(time_usec?: Int64Input, target_system?: number, cam_idx?: number, img_idx?: number, lat?: number, lng?: number, alt_msl?: number, alt_rel?: number, roll?: number, pitch?: number, yaw?: number, foc_len?: number, flags?: number, completed_captures?: number): Outgoing<camera_feedback, { time_usec: Int64Input; target_system: number; cam_idx: number; img_idx: number; lat: number; lng: number; alt_msl: number; alt_rel: number; roll: number; pitch: number; yaw: number; foc_len: number; flags: number; completed_captures: number }> };
    battery2: { new(voltage?: number, current_battery?: number): Outgoing<battery2, { voltage: number; current_battery: number }> };
    ahrs3: { new(roll?: number, pitch?: number, yaw?: number, altitude?: number, lat?: number, lng?: number, v1?: number, v2?: number, v3?: number, v4?: number): Outgoing<ahrs3, { roll: number; pitch: number; yaw: number; altitude: number; lat: number; lng: number; v1: number; v2: number; v3: number; v4: number }> };
    autopilot_version_request: { new(target_system?: number, target_component?: number): Outgoing<autopilot_version_request, { target_system: number; target_component: number }> };
    remote_log_data_block: { new(target_system?: number, target_component?: number, seqno?: number, data?: StringInput): Outgoing<remote_log_data_block, { target_system: number; target_component: number; seqno: number; data: StringInput }> };
    remote_log_block_status: { new(target_system?: number, target_component?: number, seqno?: number, status?: number): Outgoing<remote_log_block_status, { target_system: number; target_component: number; seqno: number; status: number }> };
    led_control: { new(target_system?: number, target_component?: number, instance?: number, pattern?: number, custom_len?: number, custom_bytes?: StringInput): Outgoing<led_control, { target_system: number; target_component: number; instance: number; pattern: number; custom_len: number; custom_bytes: StringInput }> };
    mag_cal_progress: { new(compass_id?: number, cal_mask?: number, cal_status?: number, attempt?: number, completion_pct?: number, completion_mask?: StringInput, direction_x?: number, direction_y?: number, direction_z?: number): Outgoing<mag_cal_progress, { compass_id: number; cal_mask: number; cal_status: number; attempt: number; completion_pct: number; completion_mask: StringInput; direction_x: number; direction_y: number; direction_z: number }> };
    ekf_status_report: { new(flags?: number, velocity_variance?: number, pos_horiz_variance?: number, pos_vert_variance?: number, compass_variance?: number, terrain_alt_variance?: number, airspeed_variance?: number): Outgoing<ekf_status_report, { flags: number; velocity_variance: number; pos_horiz_variance: number; pos_vert_variance: number; compass_variance: number; terrain_alt_variance: number; airspeed_variance: number }> };
    pid_tuning: { new(axis?: number, desired?: number, achieved?: number, FF?: number, P?: number, I?: number, D?: number, SRate?: number, PDmod?: number): Outgoing<pid_tuning, { axis: number; desired: number; achieved: number; FF: number; P: number; I: number; D: number; SRate: number; PDmod: number }> };
    deepstall: { new(landing_lat?: number, landing_lon?: number, path_lat?: number, path_lon?: number, arc_entry_lat?: number, arc_entry_lon?: number, altitude?: number, expected_travel_distance?: number, cross_track_error?: number, stage?: number): Outgoing<deepstall, { landing_lat: number; landing_lon: number; path_lat: number; path_lon: number; arc_entry_lat: number; arc_entry_lon: number; altitude: number; expected_travel_distance: number; cross_track_error: number; stage: number }> };
    gimbal_report: { new(target_system?: number, target_component?: number, delta_time?: number, delta_angle_x?: number, delta_angle_y?: number, delta_angle_z?: number, delta_velocity_x?: number, delta_velocity_y?: number, delta_velocity_z?: number, joint_roll?: number, joint_el?: number, joint_az?: number): Outgoing<gimbal_report, { target_system: number; target_component: number; delta_time: number; delta_angle_x: number; delta_angle_y: number; delta_angle_z: number; delta_velocity_x: number; delta_velocity_y: number; delta_velocity_z: number; joint_roll: number; joint_el: number; joint_az: number }> };
    gimbal_control: { new(target_system?: number, target_component?: number, demanded_rate_x?: number, demanded_rate_y?: number, demanded_rate_z?: number): Outgoing<gimbal_control, { target_system: number; target_component: number; demanded_rate_x: number; demanded_rate_y: number; demanded_rate_z: number }> };
    gimbal_torque_cmd_report: { new(target_system?: number, target_component?: number, rl_torque_cmd?: number, el_torque_cmd?: number, az_torque_cmd?: number): Outgoing<gimbal_torque_cmd_report, { target_system: number; target_component: number; rl_torque_cmd: number; el_torque_cmd: number; az_torque_cmd: number }> };
    gopro_heartbeat: { new(status?: number, capture_mode?: number, flags?: number): Outgoing<gopro_heartbeat, { status: number; capture_mode: number; flags: number }> };
    gopro_get_request: { new(target_system?: number, target_component?: number, cmd_id?: number): Outgoing<gopro_get_request, { target_system: number; target_component: number; cmd_id: number }> };
    gopro_get_response: { new(cmd_id?: number, status?: number, value?: StringInput): Outgoing<gopro_get_response, { cmd_id: number; status: number; value: StringInput }> };
    gopro_set_request: { new(target_system?: number, target_component?: number, cmd_id?: number, value?: StringInput): Outgoing<gopro_set_request, { target_system: number; target_component: number; cmd_id: number; value: StringInput }> };
    gopro_set_response: { new(cmd_id?: number, status?: number): Outgoing<gopro_set_response, { cmd_id: number; status: number }> };
    rpm: { new(rpm1?: number, rpm2?: number): Outgoing<rpm, { rpm1: number; rpm2: number }> };
    device_op_read: { new(target_system?: number, target_component?: number, request_id?: number, bustype?: number, bus?: number, address?: number, busname?: StringInput, regstart?: number, count?: number, bank?: number): Outgoing<device_op_read, { target_system: number; target_component: number; request_id: number; bustype: number; bus: number; address: number; busname: StringInput; regstart: number; count: number; bank: number }> };
    device_op_read_reply: { new(request_id?: number, result?: number, regstart?: number, count?: number, data?: StringInput, bank?: number): Outgoing<device_op_read_reply, { request_id: number; result: number; regstart: number; count: number; data: StringInput; bank: number }> };
    device_op_write: { new(target_system?: number, target_component?: number, request_id?: number, bustype?: number, bus?: number, address?: number, busname?: StringInput, regstart?: number, count?: number, data?: StringInput, bank?: number): Outgoing<device_op_write, { target_system: number; target_component: number; request_id: number; bustype: number; bus: number; address: number; busname: StringInput; regstart: number; count: number; data: StringInput; bank: number }> };
    device_op_write_reply: { new(request_id?: number, result?: number): Outgoing<device_op_write_reply, { request_id: number; result: number }> };
    secure_command: { new(target_system?: number, target_component?: number, sequence?: number, operation?: number, data_length?: number, sig_length?: number, data?: StringInput): Outgoing<secure_command, { target_system: number; target_component: number; sequence: number; operation: number; data_length: number; sig_length: number; data: StringInput }> };
    secure_command_reply: { new(sequence?: number, operation?: number, result?: number, data_length?: number, data?: StringInput): Outgoing<secure_command_reply, { sequence: number; operation: number; result: number; data_length: number; data: StringInput }> };
    adap_tuning: { new(axis?: number, desired?: number, achieved?: number, error?: number, theta?: number, omega?: number, sigma?: number, theta_dot?: number, omega_dot?: number, sigma_dot?: number, f?: number, f_dot?: number, u?: number): Outgoing<adap_tuning, { axis: number; desired: number; achieved: number; error: number; theta: number; omega: number; sigma: number; theta_dot: number; omega_dot: number; sigma_dot: number; f: number; f_dot: number; u: number }> };
    vision_position_delta: { new(time_usec?: Int64Input, time_delta_usec?: Int64Input, angle_delta?: number[], position_delta?: number[], confidence?: number): Outgoing<vision_position_delta, { time_usec: Int64Input; time_delta_usec: Int64Input; angle_delta: number[]; position_delta: number[]; confidence: number }> };
    aoa_ssa: { new(time_usec?: Int64Input, AOA?: number, SSA?: number): Outgoing<aoa_ssa, { time_usec: Int64Input; AOA: number; SSA: number }> };
    esc_telemetry_1_to_4: { new(temperature?: StringInput, voltage?: number[], current?: number[], totalcurrent?: number[], rpm?: number[], count?: number[]): Outgoing<esc_telemetry_1_to_4, { temperature: StringInput; voltage: number[]; current: number[]; totalcurrent: number[]; rpm: number[]; count: number[] }> };
    esc_telemetry_5_to_8: { new(temperature?: StringInput, voltage?: number[], current?: number[], totalcurrent?: number[], rpm?: number[], count?: number[]): Outgoing<esc_telemetry_5_to_8, { temperature: StringInput; voltage: number[]; current: number[]; totalcurrent: number[]; rpm: number[]; count: number[] }> };
    esc_telemetry_9_to_12: { new(temperature?: StringInput, voltage?: number[], current?: number[], totalcurrent?: number[], rpm?: number[], count?: number[]): Outgoing<esc_telemetry_9_to_12, { temperature: StringInput; voltage: number[]; current: number[]; totalcurrent: number[]; rpm: number[]; count: number[] }> };
    osd_param_config: { new(target_system?: number, target_component?: number, request_id?: number, osd_screen?: number, osd_index?: number, param_id?: StringInput, config_type?: number, min_value?: number, max_value?: number, increment?: number): Outgoing<osd_param_config, { target_system: number; target_component: number; request_id: number; osd_screen: number; osd_index: number; param_id: StringInput; config_type: number; min_value: number; max_value: number; increment: number }> };
    osd_param_config_reply: { new(request_id?: number, result?: number): Outgoing<osd_param_config_reply, { request_id: number; result: number }> };
    osd_param_show_config: { new(target_system?: number, target_component?: number, request_id?: number, osd_screen?: number, osd_index?: number): Outgoing<osd_param_show_config, { target_system: number; target_component: number; request_id: number; osd_screen: number; osd_index: number }> };
    osd_param_show_config_reply: { new(request_id?: number, result?: number, param_id?: StringInput, config_type?: number, min_value?: number, max_value?: number, increment?: number): Outgoing<osd_param_show_config_reply, { request_id: number; result: number; param_id: StringInput; config_type: number; min_value: number; max_value: number; increment: number }> };
    obstacle_distance_3d: { new(time_boot_ms?: number, sensor_type?: number, frame?: number, obstacle_id?: number, x?: number, y?: number, z?: number, min_distance?: number, max_distance?: number): Outgoing<obstacle_distance_3d, { time_boot_ms: number; sensor_type: number; frame: number; obstacle_id: number; x: number; y: number; z: number; min_distance: number; max_distance: number }> };
    water_depth: { new(time_boot_ms?: number, id?: number, healthy?: number, lat?: number, lng?: number, alt?: number, roll?: number, pitch?: number, yaw?: number, distance?: number, temperature?: number): Outgoing<water_depth, { time_boot_ms: number; id: number; healthy: number; lat: number; lng: number; alt: number; roll: number; pitch: number; yaw: number; distance: number; temperature: number }> };
    mcu_status: { new(id?: number, MCU_temperature?: number, MCU_voltage?: number, MCU_voltage_min?: number, MCU_voltage_max?: number): Outgoing<mcu_status, { id: number; MCU_temperature: number; MCU_voltage: number; MCU_voltage_min: number; MCU_voltage_max: number }> };
    esc_telemetry_13_to_16: { new(temperature?: StringInput, voltage?: number[], current?: number[], totalcurrent?: number[], rpm?: number[], count?: number[]): Outgoing<esc_telemetry_13_to_16, { temperature: StringInput; voltage: number[]; current: number[]; totalcurrent: number[]; rpm: number[]; count: number[] }> };
    esc_telemetry_17_to_20: { new(temperature?: StringInput, voltage?: number[], current?: number[], totalcurrent?: number[], rpm?: number[], count?: number[]): Outgoing<esc_telemetry_17_to_20, { temperature: StringInput; voltage: number[]; current: number[]; totalcurrent: number[]; rpm: number[]; count: number[] }> };
    esc_telemetry_21_to_24: { new(temperature?: StringInput, voltage?: number[], current?: number[], totalcurrent?: number[], rpm?: number[], count?: number[]): Outgoing<esc_telemetry_21_to_24, { temperature: StringInput; voltage: number[]; current: number[]; totalcurrent: number[]; rpm: number[]; count: number[] }> };
    esc_telemetry_25_to_28: { new(temperature?: StringInput, voltage?: number[], current?: number[], totalcurrent?: number[], rpm?: number[], count?: number[]): Outgoing<esc_telemetry_25_to_28, { temperature: StringInput; voltage: number[]; current: number[]; totalcurrent: number[]; rpm: number[]; count: number[] }> };
    esc_telemetry_29_to_32: { new(temperature?: StringInput, voltage?: number[], current?: number[], totalcurrent?: number[], rpm?: number[], count?: number[]): Outgoing<esc_telemetry_29_to_32, { temperature: StringInput; voltage: number[]; current: number[]; totalcurrent: number[]; rpm: number[]; count: number[] }> };
    command_int_stamped: { new(utc_time?: number, vehicle_timestamp?: Int64Input, target_system?: number, target_component?: number, frame?: number, command?: number, current?: number, autocontinue?: number, param1?: number, param2?: number, param3?: number, param4?: number, x?: number, y?: number, z?: number): Outgoing<command_int_stamped, { utc_time: number; vehicle_timestamp: Int64Input; target_system: number; target_component: number; frame: number; command: number; current: number; autocontinue: number; param1: number; param2: number; param3: number; param4: number; x: number; y: number; z: number }> };
    command_long_stamped: { new(utc_time?: number, vehicle_timestamp?: Int64Input, target_system?: number, target_component?: number, command?: number, confirmation?: number, param1?: number, param2?: number, param3?: number, param4?: number, param5?: number, param6?: number, param7?: number): Outgoing<command_long_stamped, { utc_time: number; vehicle_timestamp: Int64Input; target_system: number; target_component: number; command: number; confirmation: number; param1: number; param2: number; param3: number; param4: number; param5: number; param6: number; param7: number }> };
    sens_power: { new(adc121_vspb_volt?: number, adc121_cspb_amp?: number, adc121_cs1_amp?: number, adc121_cs2_amp?: number): Outgoing<sens_power, { adc121_vspb_volt: number; adc121_cspb_amp: number; adc121_cs1_amp: number; adc121_cs2_amp: number }> };
    sens_mppt: { new(mppt_timestamp?: Int64Input, mppt1_volt?: number, mppt1_amp?: number, mppt1_pwm?: number, mppt1_status?: number, mppt2_volt?: number, mppt2_amp?: number, mppt2_pwm?: number, mppt2_status?: number, mppt3_volt?: number, mppt3_amp?: number, mppt3_pwm?: number, mppt3_status?: number): Outgoing<sens_mppt, { mppt_timestamp: Int64Input; mppt1_volt: number; mppt1_amp: number; mppt1_pwm: number; mppt1_status: number; mppt2_volt: number; mppt2_amp: number; mppt2_pwm: number; mppt2_status: number; mppt3_volt: number; mppt3_amp: number; mppt3_pwm: number; mppt3_status: number }> };
    aslctrl_data: { new(timestamp?: Int64Input, aslctrl_mode?: number, h?: number, hRef?: number, hRef_t?: number, PitchAngle?: number, PitchAngleRef?: number, q?: number, qRef?: number, uElev?: number, uThrot?: number, uThrot2?: number, nZ?: number, AirspeedRef?: number, SpoilersEngaged?: number, YawAngle?: number, YawAngleRef?: number, RollAngle?: number, RollAngleRef?: number, p?: number, pRef?: number, r?: number, rRef?: number, uAil?: number, uRud?: number): Outgoing<aslctrl_data, { timestamp: Int64Input; aslctrl_mode: number; h: number; hRef: number; hRef_t: number; PitchAngle: number; PitchAngleRef: number; q: number; qRef: number; uElev: number; uThrot: number; uThrot2: number; nZ: number; AirspeedRef: number; SpoilersEngaged: number; YawAngle: number; YawAngleRef: number; RollAngle: number; RollAngleRef: number; p: number; pRef: number; r: number; rRef: number; uAil: number; uRud: number }> };
    aslctrl_debug: { new(i32_1?: number, i8_1?: number, i8_2?: number, f_1?: number, f_2?: number, f_3?: number, f_4?: number, f_5?: number, f_6?: number, f_7?: number, f_8?: number): Outgoing<aslctrl_debug, { i32_1: number; i8_1: number; i8_2: number; f_1: number; f_2: number; f_3: number; f_4: number; f_5: number; f_6: number; f_7: number; f_8: number }> };
    asluav_status: { new(LED_status?: number, SATCOM_status?: number, Servo_status?: StringInput, Motor_rpm?: number): Outgoing<asluav_status, { LED_status: number; SATCOM_status: number; Servo_status: StringInput; Motor_rpm: number }> };
    ekf_ext: { new(timestamp?: Int64Input, Windspeed?: number, WindDir?: number, WindZ?: number, Airspeed?: number, beta?: number, alpha?: number): Outgoing<ekf_ext, { timestamp: Int64Input; Windspeed: number; WindDir: number; WindZ: number; Airspeed: number; beta: number; alpha: number }> };
    asl_obctrl: { new(timestamp?: Int64Input, uElev?: number, uThrot?: number, uThrot2?: number, uAilL?: number, uAilR?: number, uRud?: number, obctrl_status?: number): Outgoing<asl_obctrl, { timestamp: Int64Input; uElev: number; uThrot: number; uThrot2: number; uAilL: number; uAilR: number; uRud: number; obctrl_status: number }> };
    sens_atmos: { new(timestamp?: Int64Input, TempAmbient?: number, Humidity?: number): Outgoing<sens_atmos, { timestamp: Int64Input; TempAmbient: number; Humidity: number }> };
    sens_batmon: { new(batmon_timestamp?: Int64Input, temperature?: number, voltage?: number, current?: number, SoC?: number, batterystatus?: number, serialnumber?: number, safetystatus?: number, operationstatus?: number, cellvoltage1?: number, cellvoltage2?: number, cellvoltage3?: number, cellvoltage4?: number, cellvoltage5?: number, cellvoltage6?: number): Outgoing<sens_batmon, { batmon_timestamp: Int64Input; temperature: number; voltage: number; current: number; SoC: number; batterystatus: number; serialnumber: number; safetystatus: number; operationstatus: number; cellvoltage1: number; cellvoltage2: number; cellvoltage3: number; cellvoltage4: number; cellvoltage5: number; cellvoltage6: number }> };
    fw_soaring_data: { new(timestamp?: Int64Input, timestampModeChanged?: Int64Input, xW?: number, xR?: number, xLat?: number, xLon?: number, VarW?: number, VarR?: number, VarLat?: number, VarLon?: number, LoiterRadius?: number, LoiterDirection?: number, DistToSoarPoint?: number, vSinkExp?: number, z1_LocalUpdraftSpeed?: number, z2_DeltaRoll?: number, z1_exp?: number, z2_exp?: number, ThermalGSNorth?: number, ThermalGSEast?: number, TSE_dot?: number, DebugVar1?: number, DebugVar2?: number, ControlMode?: number, valid?: number): Outgoing<fw_soaring_data, { timestamp: Int64Input; timestampModeChanged: Int64Input; xW: number; xR: number; xLat: number; xLon: number; VarW: number; VarR: number; VarLat: number; VarLon: number; LoiterRadius: number; LoiterDirection: number; DistToSoarPoint: number; vSinkExp: number; z1_LocalUpdraftSpeed: number; z2_DeltaRoll: number; z1_exp: number; z2_exp: number; ThermalGSNorth: number; ThermalGSEast: number; TSE_dot: number; DebugVar1: number; DebugVar2: number; ControlMode: number; valid: number }> };
    sensorpod_status: { new(timestamp?: Int64Input, visensor_rate_1?: number, visensor_rate_2?: number, visensor_rate_3?: number, visensor_rate_4?: number, recording_nodes_count?: number, cpu_temp?: number, free_space?: number): Outgoing<sensorpod_status, { timestamp: Int64Input; visensor_rate_1: number; visensor_rate_2: number; visensor_rate_3: number; visensor_rate_4: number; recording_nodes_count: number; cpu_temp: number; free_space: number }> };
    sens_power_board: { new(timestamp?: Int64Input, pwr_brd_status?: number, pwr_brd_led_status?: number, pwr_brd_system_volt?: number, pwr_brd_servo_volt?: number, pwr_brd_digital_volt?: number, pwr_brd_mot_l_amp?: number, pwr_brd_mot_r_amp?: number, pwr_brd_analog_amp?: number, pwr_brd_digital_amp?: number, pwr_brd_ext_amp?: number, pwr_brd_aux_amp?: number): Outgoing<sens_power_board, { timestamp: Int64Input; pwr_brd_status: number; pwr_brd_led_status: number; pwr_brd_system_volt: number; pwr_brd_servo_volt: number; pwr_brd_digital_volt: number; pwr_brd_mot_l_amp: number; pwr_brd_mot_r_amp: number; pwr_brd_analog_amp: number; pwr_brd_digital_amp: number; pwr_brd_ext_amp: number; pwr_brd_aux_amp: number }> };
    gsm_link_status: { new(timestamp?: Int64Input, gsm_modem_type?: number, gsm_link_type?: number, rssi?: number, rsrp_rscp?: number, sinr_ecio?: number, rsrq?: number): Outgoing<gsm_link_status, { timestamp: Int64Input; gsm_modem_type: number; gsm_link_type: number; rssi: number; rsrp_rscp: number; sinr_ecio: number; rsrq: number }> };
    satcom_link_status: { new(timestamp?: Int64Input, last_heartbeat?: Int64Input, failed_sessions?: number, successful_sessions?: number, signal_quality?: number, ring_pending?: number, tx_session_pending?: number, rx_session_pending?: number): Outgoing<satcom_link_status, { timestamp: Int64Input; last_heartbeat: Int64Input; failed_sessions: number; successful_sessions: number; signal_quality: number; ring_pending: number; tx_session_pending: number; rx_session_pending: number }> };
    sensor_airflow_angles: { new(timestamp?: Int64Input, angleofattack?: number, angleofattack_valid?: number, sideslip?: number, sideslip_valid?: number): Outgoing<sensor_airflow_angles, { timestamp: Int64Input; angleofattack: number; angleofattack_valid: number; sideslip: number; sideslip_valid: number }> };
    sys_status: { new(onboard_control_sensors_present?: number, onboard_control_sensors_enabled?: number, onboard_control_sensors_health?: number, load?: number, voltage_battery?: number, current_battery?: number, battery_remaining?: number, drop_rate_comm?: number, errors_comm?: number, errors_count1?: number, errors_count2?: number, errors_count3?: number, errors_count4?: number): Outgoing<sys_status, { onboard_control_sensors_present: number; onboard_control_sensors_enabled: number; onboard_control_sensors_health: number; load: number; voltage_battery: number; current_battery: number; battery_remaining: number; drop_rate_comm: number; errors_comm: number; errors_count1: number; errors_count2: number; errors_count3: number; errors_count4: number }> };
    system_time: { new(time_unix_usec?: Int64Input, time_boot_ms?: number): Outgoing<system_time, { time_unix_usec: Int64Input; time_boot_ms: number }> };
    ping: { new(time_usec?: Int64Input, seq?: number, target_system?: number, target_component?: number): Outgoing<ping, { time_usec: Int64Input; seq: number; target_system: number; target_component: number }> };
    change_operator_control: { new(target_system?: number, control_request?: number, version?: number, passkey?: StringInput): Outgoing<change_operator_control, { target_system: number; control_request: number; version: number; passkey: StringInput }> };
    change_operator_control_ack: { new(gcs_system_id?: number, control_request?: number, ack?: number): Outgoing<change_operator_control_ack, { gcs_system_id: number; control_request: number; ack: number }> };
    auth_key: { new(key?: StringInput): Outgoing<auth_key, { key: StringInput }> };
    set_mode: { new(target_system?: number, base_mode?: number, custom_mode?: number): Outgoing<set_mode, { target_system: number; base_mode: number; custom_mode: number }> };
    param_request_read: { new(target_system?: number, target_component?: number, param_id?: StringInput, param_index?: number): Outgoing<param_request_read, { target_system: number; target_component: number; param_id: StringInput; param_index: number }> };
    param_request_list: { new(target_system?: number, target_component?: number): Outgoing<param_request_list, { target_system: number; target_component: number }> };
    param_value: { new(param_id?: StringInput, param_value?: number, param_type?: number, param_count?: number, param_index?: number): Outgoing<param_value, { param_id: StringInput; param_value: number; param_type: number; param_count: number; param_index: number }> };
    param_set: { new(target_system?: number, target_component?: number, param_id?: StringInput, param_value?: number, param_type?: number): Outgoing<param_set, { target_system: number; target_component: number; param_id: StringInput; param_value: number; param_type: number }> };
    gps_raw_int: { new(time_usec?: Int64Input, fix_type?: number, lat?: number, lon?: number, alt?: number, eph?: number, epv?: number, vel?: number, cog?: number, satellites_visible?: number, alt_ellipsoid?: number, h_acc?: number, v_acc?: number, vel_acc?: number, hdg_acc?: number, yaw?: number): Outgoing<gps_raw_int, { time_usec: Int64Input; fix_type: number; lat: number; lon: number; alt: number; eph: number; epv: number; vel: number; cog: number; satellites_visible: number; alt_ellipsoid: number; h_acc: number; v_acc: number; vel_acc: number; hdg_acc: number; yaw: number }> };
    gps_status: { new(satellites_visible?: number, satellite_prn?: StringInput, satellite_used?: StringInput, satellite_elevation?: StringInput, satellite_azimuth?: StringInput, satellite_snr?: StringInput): Outgoing<gps_status, { satellites_visible: number; satellite_prn: StringInput; satellite_used: StringInput; satellite_elevation: StringInput; satellite_azimuth: StringInput; satellite_snr: StringInput }> };
    scaled_imu: { new(time_boot_ms?: number, xacc?: number, yacc?: number, zacc?: number, xgyro?: number, ygyro?: number, zgyro?: number, xmag?: number, ymag?: number, zmag?: number, temperature?: number): Outgoing<scaled_imu, { time_boot_ms: number; xacc: number; yacc: number; zacc: number; xgyro: number; ygyro: number; zgyro: number; xmag: number; ymag: number; zmag: number; temperature: number }> };
    raw_imu: { new(time_usec?: Int64Input, xacc?: number, yacc?: number, zacc?: number, xgyro?: number, ygyro?: number, zgyro?: number, xmag?: number, ymag?: number, zmag?: number, id?: number, temperature?: number): Outgoing<raw_imu, { time_usec: Int64Input; xacc: number; yacc: number; zacc: number; xgyro: number; ygyro: number; zgyro: number; xmag: number; ymag: number; zmag: number; id: number; temperature: number }> };
    raw_pressure: { new(time_usec?: Int64Input, press_abs?: number, press_diff1?: number, press_diff2?: number, temperature?: number): Outgoing<raw_pressure, { time_usec: Int64Input; press_abs: number; press_diff1: number; press_diff2: number; temperature: number }> };
    scaled_pressure: { new(time_boot_ms?: number, press_abs?: number, press_diff?: number, temperature?: number, temperature_press_diff?: number): Outgoing<scaled_pressure, { time_boot_ms: number; press_abs: number; press_diff: number; temperature: number; temperature_press_diff: number }> };
    attitude: { new(time_boot_ms?: number, roll?: number, pitch?: number, yaw?: number, rollspeed?: number, pitchspeed?: number, yawspeed?: number): Outgoing<attitude, { time_boot_ms: number; roll: number; pitch: number; yaw: number; rollspeed: number; pitchspeed: number; yawspeed: number }> };
    attitude_quaternion: { new(time_boot_ms?: number, q1?: number, q2?: number, q3?: number, q4?: number, rollspeed?: number, pitchspeed?: number, yawspeed?: number, repr_offset_q?: number[]): Outgoing<attitude_quaternion, { time_boot_ms: number; q1: number; q2: number; q3: number; q4: number; rollspeed: number; pitchspeed: number; yawspeed: number; repr_offset_q: number[] }> };
    local_position_ned: { new(time_boot_ms?: number, x?: number, y?: number, z?: number, vx?: number, vy?: number, vz?: number): Outgoing<local_position_ned, { time_boot_ms: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }> };
    global_position_int: { new(time_boot_ms?: number, lat?: number, lon?: number, alt?: number, relative_alt?: number, vx?: number, vy?: number, vz?: number, hdg?: number): Outgoing<global_position_int, { time_boot_ms: number; lat: number; lon: number; alt: number; relative_alt: number; vx: number; vy: number; vz: number; hdg: number }> };
    rc_channels_scaled: { new(time_boot_ms?: number, port?: number, chan1_scaled?: number, chan2_scaled?: number, chan3_scaled?: number, chan4_scaled?: number, chan5_scaled?: number, chan6_scaled?: number, chan7_scaled?: number, chan8_scaled?: number, rssi?: number): Outgoing<rc_channels_scaled, { time_boot_ms: number; port: number; chan1_scaled: number; chan2_scaled: number; chan3_scaled: number; chan4_scaled: number; chan5_scaled: number; chan6_scaled: number; chan7_scaled: number; chan8_scaled: number; rssi: number }> };
    rc_channels_raw: { new(time_boot_ms?: number, port?: number, chan1_raw?: number, chan2_raw?: number, chan3_raw?: number, chan4_raw?: number, chan5_raw?: number, chan6_raw?: number, chan7_raw?: number, chan8_raw?: number, rssi?: number): Outgoing<rc_channels_raw, { time_boot_ms: number; port: number; chan1_raw: number; chan2_raw: number; chan3_raw: number; chan4_raw: number; chan5_raw: number; chan6_raw: number; chan7_raw: number; chan8_raw: number; rssi: number }> };
    servo_output_raw: { new(time_usec?: number, port?: number, servo1_raw?: number, servo2_raw?: number, servo3_raw?: number, servo4_raw?: number, servo5_raw?: number, servo6_raw?: number, servo7_raw?: number, servo8_raw?: number, servo9_raw?: number, servo10_raw?: number, servo11_raw?: number, servo12_raw?: number, servo13_raw?: number, servo14_raw?: number, servo15_raw?: number, servo16_raw?: number): Outgoing<servo_output_raw, { time_usec: number; port: number; servo1_raw: number; servo2_raw: number; servo3_raw: number; servo4_raw: number; servo5_raw: number; servo6_raw: number; servo7_raw: number; servo8_raw: number; servo9_raw: number; servo10_raw: number; servo11_raw: number; servo12_raw: number; servo13_raw: number; servo14_raw: number; servo15_raw: number; servo16_raw: number }> };
    mission_request_partial_list: { new(target_system?: number, target_component?: number, start_index?: number, end_index?: number, mission_type?: number): Outgoing<mission_request_partial_list, { target_system: number; target_component: number; start_index: number; end_index: number; mission_type: number }> };
    mission_write_partial_list: { new(target_system?: number, target_component?: number, start_index?: number, end_index?: number, mission_type?: number): Outgoing<mission_write_partial_list, { target_system: number; target_component: number; start_index: number; end_index: number; mission_type: number }> };
    mission_item: { new(target_system?: number, target_component?: number, seq?: number, frame?: number, command?: number, current?: number, autocontinue?: number, param1?: number, param2?: number, param3?: number, param4?: number, x?: number, y?: number, z?: number, mission_type?: number): Outgoing<mission_item, { target_system: number; target_component: number; seq: number; frame: number; command: number; current: number; autocontinue: number; param1: number; param2: number; param3: number; param4: number; x: number; y: number; z: number; mission_type: number }> };
    mission_request: { new(target_system?: number, target_component?: number, seq?: number, mission_type?: number): Outgoing<mission_request, { target_system: number; target_component: number; seq: number; mission_type: number }> };
    mission_set_current: { new(target_system?: number, target_component?: number, seq?: number): Outgoing<mission_set_current, { target_system: number; target_component: number; seq: number }> };
    mission_current: { new(seq?: number, total?: number, mission_state?: number, mission_mode?: number): Outgoing<mission_current, { seq: number; total: number; mission_state: number; mission_mode: number }> };
    mission_request_list: { new(target_system?: number, target_component?: number, mission_type?: number): Outgoing<mission_request_list, { target_system: number; target_component: number; mission_type: number }> };
    mission_count: { new(target_system?: number, target_component?: number, count?: number, mission_type?: number): Outgoing<mission_count, { target_system: number; target_component: number; count: number; mission_type: number }> };
    mission_clear_all: { new(target_system?: number, target_component?: number, mission_type?: number): Outgoing<mission_clear_all, { target_system: number; target_component: number; mission_type: number }> };
    mission_item_reached: { new(seq?: number): Outgoing<mission_item_reached, { seq: number }> };
    mission_ack: { new(target_system?: number, target_component?: number, type?: number, mission_type?: number): Outgoing<mission_ack, { target_system: number; target_component: number; type: number; mission_type: number }> };
    set_gps_global_origin: { new(target_system?: number, latitude?: number, longitude?: number, altitude?: number, time_usec?: Int64Input): Outgoing<set_gps_global_origin, { target_system: number; latitude: number; longitude: number; altitude: number; time_usec: Int64Input }> };
    gps_global_origin: { new(latitude?: number, longitude?: number, altitude?: number, time_usec?: Int64Input): Outgoing<gps_global_origin, { latitude: number; longitude: number; altitude: number; time_usec: Int64Input }> };
    param_map_rc: { new(target_system?: number, target_component?: number, param_id?: StringInput, param_index?: number, parameter_rc_channel_index?: number, param_value0?: number, scale?: number, param_value_min?: number, param_value_max?: number): Outgoing<param_map_rc, { target_system: number; target_component: number; param_id: StringInput; param_index: number; parameter_rc_channel_index: number; param_value0: number; scale: number; param_value_min: number; param_value_max: number }> };
    mission_request_int: { new(target_system?: number, target_component?: number, seq?: number, mission_type?: number): Outgoing<mission_request_int, { target_system: number; target_component: number; seq: number; mission_type: number }> };
    safety_set_allowed_area: { new(target_system?: number, target_component?: number, frame?: number, p1x?: number, p1y?: number, p1z?: number, p2x?: number, p2y?: number, p2z?: number): Outgoing<safety_set_allowed_area, { target_system: number; target_component: number; frame: number; p1x: number; p1y: number; p1z: number; p2x: number; p2y: number; p2z: number }> };
    safety_allowed_area: { new(frame?: number, p1x?: number, p1y?: number, p1z?: number, p2x?: number, p2y?: number, p2z?: number): Outgoing<safety_allowed_area, { frame: number; p1x: number; p1y: number; p1z: number; p2x: number; p2y: number; p2z: number }> };
    attitude_quaternion_cov: { new(time_usec?: Int64Input, q?: number[], rollspeed?: number, pitchspeed?: number, yawspeed?: number, covariance?: number[]): Outgoing<attitude_quaternion_cov, { time_usec: Int64Input; q: number[]; rollspeed: number; pitchspeed: number; yawspeed: number; covariance: number[] }> };
    nav_controller_output: { new(nav_roll?: number, nav_pitch?: number, nav_bearing?: number, target_bearing?: number, wp_dist?: number, alt_error?: number, aspd_error?: number, xtrack_error?: number): Outgoing<nav_controller_output, { nav_roll: number; nav_pitch: number; nav_bearing: number; target_bearing: number; wp_dist: number; alt_error: number; aspd_error: number; xtrack_error: number }> };
    global_position_int_cov: { new(time_usec?: Int64Input, estimator_type?: number, lat?: number, lon?: number, alt?: number, relative_alt?: number, vx?: number, vy?: number, vz?: number, covariance?: number[]): Outgoing<global_position_int_cov, { time_usec: Int64Input; estimator_type: number; lat: number; lon: number; alt: number; relative_alt: number; vx: number; vy: number; vz: number; covariance: number[] }> };
    local_position_ned_cov: { new(time_usec?: Int64Input, estimator_type?: number, x?: number, y?: number, z?: number, vx?: number, vy?: number, vz?: number, ax?: number, ay?: number, az?: number, covariance?: number[]): Outgoing<local_position_ned_cov, { time_usec: Int64Input; estimator_type: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; ax: number; ay: number; az: number; covariance: number[] }> };
    rc_channels: { new(time_boot_ms?: number, chancount?: number, chan1_raw?: number, chan2_raw?: number, chan3_raw?: number, chan4_raw?: number, chan5_raw?: number, chan6_raw?: number, chan7_raw?: number, chan8_raw?: number, chan9_raw?: number, chan10_raw?: number, chan11_raw?: number, chan12_raw?: number, chan13_raw?: number, chan14_raw?: number, chan15_raw?: number, chan16_raw?: number, chan17_raw?: number, chan18_raw?: number, rssi?: number): Outgoing<rc_channels, { time_boot_ms: number; chancount: number; chan1_raw: number; chan2_raw: number; chan3_raw: number; chan4_raw: number; chan5_raw: number; chan6_raw: number; chan7_raw: number; chan8_raw: number; chan9_raw: number; chan10_raw: number; chan11_raw: number; chan12_raw: number; chan13_raw: number; chan14_raw: number; chan15_raw: number; chan16_raw: number; chan17_raw: number; chan18_raw: number; rssi: number }> };
    request_data_stream: { new(target_system?: number, target_component?: number, req_stream_id?: number, req_message_rate?: number, start_stop?: number): Outgoing<request_data_stream, { target_system: number; target_component: number; req_stream_id: number; req_message_rate: number; start_stop: number }> };
    data_stream: { new(stream_id?: number, message_rate?: number, on_off?: number): Outgoing<data_stream, { stream_id: number; message_rate: number; on_off: number }> };
    manual_control: { new(target?: number, x?: number, y?: number, z?: number, r?: number, buttons?: number, buttons2?: number, enabled_extensions?: number, s?: number, t?: number, aux1?: number, aux2?: number, aux3?: number, aux4?: number, aux5?: number, aux6?: number): Outgoing<manual_control, { target: number; x: number; y: number; z: number; r: number; buttons: number; buttons2: number; enabled_extensions: number; s: number; t: number; aux1: number; aux2: number; aux3: number; aux4: number; aux5: number; aux6: number }> };
    rc_channels_override: { new(target_system?: number, target_component?: number, chan1_raw?: number, chan2_raw?: number, chan3_raw?: number, chan4_raw?: number, chan5_raw?: number, chan6_raw?: number, chan7_raw?: number, chan8_raw?: number, chan9_raw?: number, chan10_raw?: number, chan11_raw?: number, chan12_raw?: number, chan13_raw?: number, chan14_raw?: number, chan15_raw?: number, chan16_raw?: number, chan17_raw?: number, chan18_raw?: number): Outgoing<rc_channels_override, { target_system: number; target_component: number; chan1_raw: number; chan2_raw: number; chan3_raw: number; chan4_raw: number; chan5_raw: number; chan6_raw: number; chan7_raw: number; chan8_raw: number; chan9_raw: number; chan10_raw: number; chan11_raw: number; chan12_raw: number; chan13_raw: number; chan14_raw: number; chan15_raw: number; chan16_raw: number; chan17_raw: number; chan18_raw: number }> };
    mission_item_int: { new(target_system?: number, target_component?: number, seq?: number, frame?: number, command?: number, current?: number, autocontinue?: number, param1?: number, param2?: number, param3?: number, param4?: number, x?: number, y?: number, z?: number, mission_type?: number): Outgoing<mission_item_int, { target_system: number; target_component: number; seq: number; frame: number; command: number; current: number; autocontinue: number; param1: number; param2: number; param3: number; param4: number; x: number; y: number; z: number; mission_type: number }> };
    vfr_hud: { new(airspeed?: number, groundspeed?: number, heading?: number, throttle?: number, alt?: number, climb?: number): Outgoing<vfr_hud, { airspeed: number; groundspeed: number; heading: number; throttle: number; alt: number; climb: number }> };
    command_int: { new(target_system?: number, target_component?: number, frame?: number, command?: number, current?: number, autocontinue?: number, param1?: number, param2?: number, param3?: number, param4?: number, x?: number, y?: number, z?: number): Outgoing<command_int, { target_system: number; target_component: number; frame: number; command: number; current: number; autocontinue: number; param1: number; param2: number; param3: number; param4: number; x: number; y: number; z: number }> };
    command_long: { new(target_system?: number, target_component?: number, command?: number, confirmation?: number, param1?: number, param2?: number, param3?: number, param4?: number, param5?: number, param6?: number, param7?: number): Outgoing<command_long, { target_system: number; target_component: number; command: number; confirmation: number; param1: number; param2: number; param3: number; param4: number; param5: number; param6: number; param7: number }> };
    command_ack: { new(command?: number, result?: number, progress?: number, result_param2?: number, target_system?: number, target_component?: number): Outgoing<command_ack, { command: number; result: number; progress: number; result_param2: number; target_system: number; target_component: number }> };
    manual_setpoint: { new(time_boot_ms?: number, roll?: number, pitch?: number, yaw?: number, thrust?: number, mode_switch?: number, manual_override_switch?: number): Outgoing<manual_setpoint, { time_boot_ms: number; roll: number; pitch: number; yaw: number; thrust: number; mode_switch: number; manual_override_switch: number }> };
    set_attitude_target: { new(time_boot_ms?: number, target_system?: number, target_component?: number, type_mask?: number, q?: number[], body_roll_rate?: number, body_pitch_rate?: number, body_yaw_rate?: number, thrust?: number): Outgoing<set_attitude_target, { time_boot_ms: number; target_system: number; target_component: number; type_mask: number; q: number[]; body_roll_rate: number; body_pitch_rate: number; body_yaw_rate: number; thrust: number }> };
    attitude_target: { new(time_boot_ms?: number, type_mask?: number, q?: number[], body_roll_rate?: number, body_pitch_rate?: number, body_yaw_rate?: number, thrust?: number): Outgoing<attitude_target, { time_boot_ms: number; type_mask: number; q: number[]; body_roll_rate: number; body_pitch_rate: number; body_yaw_rate: number; thrust: number }> };
    set_position_target_local_ned: { new(time_boot_ms?: number, target_system?: number, target_component?: number, coordinate_frame?: number, type_mask?: number, x?: number, y?: number, z?: number, vx?: number, vy?: number, vz?: number, afx?: number, afy?: number, afz?: number, yaw?: number, yaw_rate?: number): Outgoing<set_position_target_local_ned, { time_boot_ms: number; target_system: number; target_component: number; coordinate_frame: number; type_mask: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; afx: number; afy: number; afz: number; yaw: number; yaw_rate: number }> };
    position_target_local_ned: { new(time_boot_ms?: number, coordinate_frame?: number, type_mask?: number, x?: number, y?: number, z?: number, vx?: number, vy?: number, vz?: number, afx?: number, afy?: number, afz?: number, yaw?: number, yaw_rate?: number): Outgoing<position_target_local_ned, { time_boot_ms: number; coordinate_frame: number; type_mask: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; afx: number; afy: number; afz: number; yaw: number; yaw_rate: number }> };
    set_position_target_global_int: { new(time_boot_ms?: number, target_system?: number, target_component?: number, coordinate_frame?: number, type_mask?: number, lat_int?: number, lon_int?: number, alt?: number, vx?: number, vy?: number, vz?: number, afx?: number, afy?: number, afz?: number, yaw?: number, yaw_rate?: number): Outgoing<set_position_target_global_int, { time_boot_ms: number; target_system: number; target_component: number; coordinate_frame: number; type_mask: number; lat_int: number; lon_int: number; alt: number; vx: number; vy: number; vz: number; afx: number; afy: number; afz: number; yaw: number; yaw_rate: number }> };
    position_target_global_int: { new(time_boot_ms?: number, coordinate_frame?: number, type_mask?: number, lat_int?: number, lon_int?: number, alt?: number, vx?: number, vy?: number, vz?: number, afx?: number, afy?: number, afz?: number, yaw?: number, yaw_rate?: number): Outgoing<position_target_global_int, { time_boot_ms: number; coordinate_frame: number; type_mask: number; lat_int: number; lon_int: number; alt: number; vx: number; vy: number; vz: number; afx: number; afy: number; afz: number; yaw: number; yaw_rate: number }> };
    local_position_ned_system_global_offset: { new(time_boot_ms?: number, x?: number, y?: number, z?: number, roll?: number, pitch?: number, yaw?: number): Outgoing<local_position_ned_system_global_offset, { time_boot_ms: number; x: number; y: number; z: number; roll: number; pitch: number; yaw: number }> };
    hil_state: { new(time_usec?: Int64Input, roll?: number, pitch?: number, yaw?: number, rollspeed?: number, pitchspeed?: number, yawspeed?: number, lat?: number, lon?: number, alt?: number, vx?: number, vy?: number, vz?: number, xacc?: number, yacc?: number, zacc?: number): Outgoing<hil_state, { time_usec: Int64Input; roll: number; pitch: number; yaw: number; rollspeed: number; pitchspeed: number; yawspeed: number; lat: number; lon: number; alt: number; vx: number; vy: number; vz: number; xacc: number; yacc: number; zacc: number }> };
    hil_controls: { new(time_usec?: Int64Input, roll_ailerons?: number, pitch_elevator?: number, yaw_rudder?: number, throttle?: number, aux1?: number, aux2?: number, aux3?: number, aux4?: number, mode?: number, nav_mode?: number): Outgoing<hil_controls, { time_usec: Int64Input; roll_ailerons: number; pitch_elevator: number; yaw_rudder: number; throttle: number; aux1: number; aux2: number; aux3: number; aux4: number; mode: number; nav_mode: number }> };
    hil_rc_inputs_raw: { new(time_usec?: Int64Input, chan1_raw?: number, chan2_raw?: number, chan3_raw?: number, chan4_raw?: number, chan5_raw?: number, chan6_raw?: number, chan7_raw?: number, chan8_raw?: number, chan9_raw?: number, chan10_raw?: number, chan11_raw?: number, chan12_raw?: number, rssi?: number): Outgoing<hil_rc_inputs_raw, { time_usec: Int64Input; chan1_raw: number; chan2_raw: number; chan3_raw: number; chan4_raw: number; chan5_raw: number; chan6_raw: number; chan7_raw: number; chan8_raw: number; chan9_raw: number; chan10_raw: number; chan11_raw: number; chan12_raw: number; rssi: number }> };
    hil_actuator_controls: { new(time_usec?: Int64Input, controls?: number[], mode?: number, flags?: Int64Input): Outgoing<hil_actuator_controls, { time_usec: Int64Input; controls: number[]; mode: number; flags: Int64Input }> };
    optical_flow: { new(time_usec?: Int64Input, sensor_id?: number, flow_x?: number, flow_y?: number, flow_comp_m_x?: number, flow_comp_m_y?: number, quality?: number, ground_distance?: number, flow_rate_x?: number, flow_rate_y?: number): Outgoing<optical_flow, { time_usec: Int64Input; sensor_id: number; flow_x: number; flow_y: number; flow_comp_m_x: number; flow_comp_m_y: number; quality: number; ground_distance: number; flow_rate_x: number; flow_rate_y: number }> };
    global_vision_position_estimate: { new(usec?: Int64Input, x?: number, y?: number, z?: number, roll?: number, pitch?: number, yaw?: number, covariance?: number[], reset_counter?: number): Outgoing<global_vision_position_estimate, { usec: Int64Input; x: number; y: number; z: number; roll: number; pitch: number; yaw: number; covariance: number[]; reset_counter: number }> };
    vision_position_estimate: { new(usec?: Int64Input, x?: number, y?: number, z?: number, roll?: number, pitch?: number, yaw?: number, covariance?: number[], reset_counter?: number): Outgoing<vision_position_estimate, { usec: Int64Input; x: number; y: number; z: number; roll: number; pitch: number; yaw: number; covariance: number[]; reset_counter: number }> };
    vision_speed_estimate: { new(usec?: Int64Input, x?: number, y?: number, z?: number, covariance?: number[], reset_counter?: number): Outgoing<vision_speed_estimate, { usec: Int64Input; x: number; y: number; z: number; covariance: number[]; reset_counter: number }> };
    vicon_position_estimate: { new(usec?: Int64Input, x?: number, y?: number, z?: number, roll?: number, pitch?: number, yaw?: number, covariance?: number[]): Outgoing<vicon_position_estimate, { usec: Int64Input; x: number; y: number; z: number; roll: number; pitch: number; yaw: number; covariance: number[] }> };
    highres_imu: { new(time_usec?: Int64Input, xacc?: number, yacc?: number, zacc?: number, xgyro?: number, ygyro?: number, zgyro?: number, xmag?: number, ymag?: number, zmag?: number, abs_pressure?: number, diff_pressure?: number, pressure_alt?: number, temperature?: number, fields_updated?: number, id?: number): Outgoing<highres_imu, { time_usec: Int64Input; xacc: number; yacc: number; zacc: number; xgyro: number; ygyro: number; zgyro: number; xmag: number; ymag: number; zmag: number; abs_pressure: number; diff_pressure: number; pressure_alt: number; temperature: number; fields_updated: number; id: number }> };
    optical_flow_rad: { new(time_usec?: Int64Input, sensor_id?: number, integration_time_us?: number, integrated_x?: number, integrated_y?: number, integrated_xgyro?: number, integrated_ygyro?: number, integrated_zgyro?: number, temperature?: number, quality?: number, time_delta_distance_us?: number, distance?: number): Outgoing<optical_flow_rad, { time_usec: Int64Input; sensor_id: number; integration_time_us: number; integrated_x: number; integrated_y: number; integrated_xgyro: number; integrated_ygyro: number; integrated_zgyro: number; temperature: number; quality: number; time_delta_distance_us: number; distance: number }> };
    hil_sensor: { new(time_usec?: Int64Input, xacc?: number, yacc?: number, zacc?: number, xgyro?: number, ygyro?: number, zgyro?: number, xmag?: number, ymag?: number, zmag?: number, abs_pressure?: number, diff_pressure?: number, pressure_alt?: number, temperature?: number, fields_updated?: number, id?: number): Outgoing<hil_sensor, { time_usec: Int64Input; xacc: number; yacc: number; zacc: number; xgyro: number; ygyro: number; zgyro: number; xmag: number; ymag: number; zmag: number; abs_pressure: number; diff_pressure: number; pressure_alt: number; temperature: number; fields_updated: number; id: number }> };
    sim_state: { new(q1?: number, q2?: number, q3?: number, q4?: number, roll?: number, pitch?: number, yaw?: number, xacc?: number, yacc?: number, zacc?: number, xgyro?: number, ygyro?: number, zgyro?: number, lat?: number, lon?: number, alt?: number, std_dev_horz?: number, std_dev_vert?: number, vn?: number, ve?: number, vd?: number, lat_int?: number, lon_int?: number): Outgoing<sim_state, { q1: number; q2: number; q3: number; q4: number; roll: number; pitch: number; yaw: number; xacc: number; yacc: number; zacc: number; xgyro: number; ygyro: number; zgyro: number; lat: number; lon: number; alt: number; std_dev_horz: number; std_dev_vert: number; vn: number; ve: number; vd: number; lat_int: number; lon_int: number }> };
    radio_status: { new(rssi?: number, remrssi?: number, txbuf?: number, noise?: number, remnoise?: number, rxerrors?: number, fixed?: number): Outgoing<radio_status, { rssi: number; remrssi: number; txbuf: number; noise: number; remnoise: number; rxerrors: number; fixed: number }> };
    file_transfer_protocol: { new(target_network?: number, target_system?: number, target_component?: number, payload?: StringInput): Outgoing<file_transfer_protocol, { target_network: number; target_system: number; target_component: number; payload: StringInput }> };
    timesync: { new(tc1?: Int64Input, ts1?: Int64Input): Outgoing<timesync, { tc1: Int64Input; ts1: Int64Input }> };
    camera_trigger: { new(time_usec?: Int64Input, seq?: number): Outgoing<camera_trigger, { time_usec: Int64Input; seq: number }> };
    hil_gps: { new(time_usec?: Int64Input, fix_type?: number, lat?: number, lon?: number, alt?: number, eph?: number, epv?: number, vel?: number, vn?: number, ve?: number, vd?: number, cog?: number, satellites_visible?: number, id?: number, yaw?: number): Outgoing<hil_gps, { time_usec: Int64Input; fix_type: number; lat: number; lon: number; alt: number; eph: number; epv: number; vel: number; vn: number; ve: number; vd: number; cog: number; satellites_visible: number; id: number; yaw: number }> };
    hil_optical_flow: { new(time_usec?: Int64Input, sensor_id?: number, integration_time_us?: number, integrated_x?: number, integrated_y?: number, integrated_xgyro?: number, integrated_ygyro?: number, integrated_zgyro?: number, temperature?: number, quality?: number, time_delta_distance_us?: number, distance?: number): Outgoing<hil_optical_flow, { time_usec: Int64Input; sensor_id: number; integration_time_us: number; integrated_x: number; integrated_y: number; integrated_xgyro: number; integrated_ygyro: number; integrated_zgyro: number; temperature: number; quality: number; time_delta_distance_us: number; distance: number }> };
    hil_state_quaternion: { new(time_usec?: Int64Input, attitude_quaternion?: number[], rollspeed?: number, pitchspeed?: number, yawspeed?: number, lat?: number, lon?: number, alt?: number, vx?: number, vy?: number, vz?: number, ind_airspeed?: number, true_airspeed?: number, xacc?: number, yacc?: number, zacc?: number): Outgoing<hil_state_quaternion, { time_usec: Int64Input; attitude_quaternion: number[]; rollspeed: number; pitchspeed: number; yawspeed: number; lat: number; lon: number; alt: number; vx: number; vy: number; vz: number; ind_airspeed: number; true_airspeed: number; xacc: number; yacc: number; zacc: number }> };
    scaled_imu2: { new(time_boot_ms?: number, xacc?: number, yacc?: number, zacc?: number, xgyro?: number, ygyro?: number, zgyro?: number, xmag?: number, ymag?: number, zmag?: number, temperature?: number): Outgoing<scaled_imu2, { time_boot_ms: number; xacc: number; yacc: number; zacc: number; xgyro: number; ygyro: number; zgyro: number; xmag: number; ymag: number; zmag: number; temperature: number }> };
    log_request_list: { new(target_system?: number, target_component?: number, start?: number, end?: number): Outgoing<log_request_list, { target_system: number; target_component: number; start: number; end: number }> };
    log_entry: { new(id?: number, num_logs?: number, last_log_num?: number, time_utc?: number, size?: number): Outgoing<log_entry, { id: number; num_logs: number; last_log_num: number; time_utc: number; size: number }> };
    log_request_data: { new(target_system?: number, target_component?: number, id?: number, ofs?: number, count?: number): Outgoing<log_request_data, { target_system: number; target_component: number; id: number; ofs: number; count: number }> };
    log_data: { new(id?: number, ofs?: number, count?: number, data?: StringInput): Outgoing<log_data, { id: number; ofs: number; count: number; data: StringInput }> };
    log_erase: { new(target_system?: number, target_component?: number): Outgoing<log_erase, { target_system: number; target_component: number }> };
    log_request_end: { new(target_system?: number, target_component?: number): Outgoing<log_request_end, { target_system: number; target_component: number }> };
    gps_inject_data: { new(target_system?: number, target_component?: number, len?: number, data?: StringInput): Outgoing<gps_inject_data, { target_system: number; target_component: number; len: number; data: StringInput }> };
    gps2_raw: { new(time_usec?: Int64Input, fix_type?: number, lat?: number, lon?: number, alt?: number, eph?: number, epv?: number, vel?: number, cog?: number, satellites_visible?: number, dgps_numch?: number, dgps_age?: number, yaw?: number, alt_ellipsoid?: number, h_acc?: number, v_acc?: number, vel_acc?: number, hdg_acc?: number): Outgoing<gps2_raw, { time_usec: Int64Input; fix_type: number; lat: number; lon: number; alt: number; eph: number; epv: number; vel: number; cog: number; satellites_visible: number; dgps_numch: number; dgps_age: number; yaw: number; alt_ellipsoid: number; h_acc: number; v_acc: number; vel_acc: number; hdg_acc: number }> };
    power_status: { new(Vcc?: number, Vservo?: number, flags?: number): Outgoing<power_status, { Vcc: number; Vservo: number; flags: number }> };
    serial_control: { new(device?: number, flags?: number, timeout?: number, baudrate?: number, count?: number, data?: StringInput): Outgoing<serial_control, { device: number; flags: number; timeout: number; baudrate: number; count: number; data: StringInput }> };
    gps_rtk: { new(time_last_baseline_ms?: number, rtk_receiver_id?: number, wn?: number, tow?: number, rtk_health?: number, rtk_rate?: number, nsats?: number, baseline_coords_type?: number, baseline_a_mm?: number, baseline_b_mm?: number, baseline_c_mm?: number, accuracy?: number, iar_num_hypotheses?: number): Outgoing<gps_rtk, { time_last_baseline_ms: number; rtk_receiver_id: number; wn: number; tow: number; rtk_health: number; rtk_rate: number; nsats: number; baseline_coords_type: number; baseline_a_mm: number; baseline_b_mm: number; baseline_c_mm: number; accuracy: number; iar_num_hypotheses: number }> };
    gps2_rtk: { new(time_last_baseline_ms?: number, rtk_receiver_id?: number, wn?: number, tow?: number, rtk_health?: number, rtk_rate?: number, nsats?: number, baseline_coords_type?: number, baseline_a_mm?: number, baseline_b_mm?: number, baseline_c_mm?: number, accuracy?: number, iar_num_hypotheses?: number): Outgoing<gps2_rtk, { time_last_baseline_ms: number; rtk_receiver_id: number; wn: number; tow: number; rtk_health: number; rtk_rate: number; nsats: number; baseline_coords_type: number; baseline_a_mm: number; baseline_b_mm: number; baseline_c_mm: number; accuracy: number; iar_num_hypotheses: number }> };
    scaled_imu3: { new(time_boot_ms?: number, xacc?: number, yacc?: number, zacc?: number, xgyro?: number, ygyro?: number, zgyro?: number, xmag?: number, ymag?: number, zmag?: number, temperature?: number): Outgoing<scaled_imu3, { time_boot_ms: number; xacc: number; yacc: number; zacc: number; xgyro: number; ygyro: number; zgyro: number; xmag: number; ymag: number; zmag: number; temperature: number }> };
    data_transmission_handshake: { new(type?: number, size?: number, width?: number, height?: number, packets?: number, payload?: number, jpg_quality?: number): Outgoing<data_transmission_handshake, { type: number; size: number; width: number; height: number; packets: number; payload: number; jpg_quality: number }> };
    encapsulated_data: { new(seqnr?: number, data?: StringInput): Outgoing<encapsulated_data, { seqnr: number; data: StringInput }> };
    distance_sensor: { new(time_boot_ms?: number, min_distance?: number, max_distance?: number, current_distance?: number, type?: number, id?: number, orientation?: number, covariance?: number, horizontal_fov?: number, vertical_fov?: number, quaternion?: number[], signal_quality?: number): Outgoing<distance_sensor, { time_boot_ms: number; min_distance: number; max_distance: number; current_distance: number; type: number; id: number; orientation: number; covariance: number; horizontal_fov: number; vertical_fov: number; quaternion: number[]; signal_quality: number }> };
    terrain_request: { new(lat?: number, lon?: number, grid_spacing?: number, mask?: Int64Input): Outgoing<terrain_request, { lat: number; lon: number; grid_spacing: number; mask: Int64Input }> };
    terrain_data: { new(lat?: number, lon?: number, grid_spacing?: number, gridbit?: number, data?: number[]): Outgoing<terrain_data, { lat: number; lon: number; grid_spacing: number; gridbit: number; data: number[] }> };
    terrain_check: { new(lat?: number, lon?: number): Outgoing<terrain_check, { lat: number; lon: number }> };
    terrain_report: { new(lat?: number, lon?: number, spacing?: number, terrain_height?: number, current_height?: number, pending?: number, loaded?: number): Outgoing<terrain_report, { lat: number; lon: number; spacing: number; terrain_height: number; current_height: number; pending: number; loaded: number }> };
    scaled_pressure2: { new(time_boot_ms?: number, press_abs?: number, press_diff?: number, temperature?: number, temperature_press_diff?: number): Outgoing<scaled_pressure2, { time_boot_ms: number; press_abs: number; press_diff: number; temperature: number; temperature_press_diff: number }> };
    att_pos_mocap: { new(time_usec?: Int64Input, q?: number[], x?: number, y?: number, z?: number, covariance?: number[]): Outgoing<att_pos_mocap, { time_usec: Int64Input; q: number[]; x: number; y: number; z: number; covariance: number[] }> };
    set_actuator_control_target: { new(time_usec?: Int64Input, group_mlx?: number, target_system?: number, target_component?: number, controls?: number[]): Outgoing<set_actuator_control_target, { time_usec: Int64Input; group_mlx: number; target_system: number; target_component: number; controls: number[] }> };
    actuator_control_target: { new(time_usec?: Int64Input, group_mlx?: number, controls?: number[]): Outgoing<actuator_control_target, { time_usec: Int64Input; group_mlx: number; controls: number[] }> };
    altitude: { new(time_usec?: Int64Input, altitude_monotonic?: number, altitude_amsl?: number, altitude_local?: number, altitude_relative?: number, altitude_terrain?: number, bottom_clearance?: number): Outgoing<altitude, { time_usec: Int64Input; altitude_monotonic: number; altitude_amsl: number; altitude_local: number; altitude_relative: number; altitude_terrain: number; bottom_clearance: number }> };
    resource_request: { new(request_id?: number, uri_type?: number, uri?: StringInput, transfer_type?: number, storage?: StringInput): Outgoing<resource_request, { request_id: number; uri_type: number; uri: StringInput; transfer_type: number; storage: StringInput }> };
    scaled_pressure3: { new(time_boot_ms?: number, press_abs?: number, press_diff?: number, temperature?: number, temperature_press_diff?: number): Outgoing<scaled_pressure3, { time_boot_ms: number; press_abs: number; press_diff: number; temperature: number; temperature_press_diff: number }> };
    follow_target: { new(timestamp?: Int64Input, est_capabilities?: number, lat?: number, lon?: number, alt?: number, vel?: number[], acc?: number[], attitude_q?: number[], rates?: number[], position_cov?: number[], custom_state?: Int64Input): Outgoing<follow_target, { timestamp: Int64Input; est_capabilities: number; lat: number; lon: number; alt: number; vel: number[]; acc: number[]; attitude_q: number[]; rates: number[]; position_cov: number[]; custom_state: Int64Input }> };
    control_system_state: { new(time_usec?: Int64Input, x_acc?: number, y_acc?: number, z_acc?: number, x_vel?: number, y_vel?: number, z_vel?: number, x_pos?: number, y_pos?: number, z_pos?: number, airspeed?: number, vel_variance?: number[], pos_variance?: number[], q?: number[], roll_rate?: number, pitch_rate?: number, yaw_rate?: number): Outgoing<control_system_state, { time_usec: Int64Input; x_acc: number; y_acc: number; z_acc: number; x_vel: number; y_vel: number; z_vel: number; x_pos: number; y_pos: number; z_pos: number; airspeed: number; vel_variance: number[]; pos_variance: number[]; q: number[]; roll_rate: number; pitch_rate: number; yaw_rate: number }> };
    battery_status: { new(id?: number, battery_function?: number, type?: number, temperature?: number, voltages?: number[], current_battery?: number, current_consumed?: number, energy_consumed?: number, battery_remaining?: number, time_remaining?: number, charge_state?: number, voltages_ext?: number[], mode?: number, fault_bitmask?: number): Outgoing<battery_status, { id: number; battery_function: number; type: number; temperature: number; voltages: number[]; current_battery: number; current_consumed: number; energy_consumed: number; battery_remaining: number; time_remaining: number; charge_state: number; voltages_ext: number[]; mode: number; fault_bitmask: number }> };
    autopilot_version: { new(capabilities?: Int64Input, flight_sw_version?: number, middleware_sw_version?: number, os_sw_version?: number, board_version?: number, flight_custom_version?: StringInput, middleware_custom_version?: StringInput, os_custom_version?: StringInput, vendor_id?: number, product_id?: number, uid?: Int64Input, uid2?: StringInput): Outgoing<autopilot_version, { capabilities: Int64Input; flight_sw_version: number; middleware_sw_version: number; os_sw_version: number; board_version: number; flight_custom_version: StringInput; middleware_custom_version: StringInput; os_custom_version: StringInput; vendor_id: number; product_id: number; uid: Int64Input; uid2: StringInput }> };
    landing_target: { new(time_usec?: Int64Input, target_num?: number, frame?: number, angle_x?: number, angle_y?: number, distance?: number, size_x?: number, size_y?: number, x?: number, y?: number, z?: number, q?: number[], type?: number, position_valid?: number): Outgoing<landing_target, { time_usec: Int64Input; target_num: number; frame: number; angle_x: number; angle_y: number; distance: number; size_x: number; size_y: number; x: number; y: number; z: number; q: number[]; type: number; position_valid: number }> };
    fence_status: { new(breach_status?: number, breach_count?: number, breach_type?: number, breach_time?: number, breach_mitigation?: number): Outgoing<fence_status, { breach_status: number; breach_count: number; breach_type: number; breach_time: number; breach_mitigation: number }> };
    mag_cal_report: { new(compass_id?: number, cal_mask?: number, cal_status?: number, autosaved?: number, fitness?: number, ofs_x?: number, ofs_y?: number, ofs_z?: number, diag_x?: number, diag_y?: number, diag_z?: number, offdiag_x?: number, offdiag_y?: number, offdiag_z?: number, orientation_confidence?: number, old_orientation?: number, new_orientation?: number, scale_factor?: number): Outgoing<mag_cal_report, { compass_id: number; cal_mask: number; cal_status: number; autosaved: number; fitness: number; ofs_x: number; ofs_y: number; ofs_z: number; diag_x: number; diag_y: number; diag_z: number; offdiag_x: number; offdiag_y: number; offdiag_z: number; orientation_confidence: number; old_orientation: number; new_orientation: number; scale_factor: number }> };
    efi_status: { new(health?: number, ecu_index?: number, rpm?: number, fuel_consumed?: number, fuel_flow?: number, engine_load?: number, throttle_position?: number, spark_dwell_time?: number, barometric_pressure?: number, intake_manifold_pressure?: number, intake_manifold_temperature?: number, cylinder_head_temperature?: number, ignition_timing?: number, injection_time?: number, exhaust_gas_temperature?: number, throttle_out?: number, pt_compensation?: number, ignition_voltage?: number, fuel_pressure?: number): Outgoing<efi_status, { health: number; ecu_index: number; rpm: number; fuel_consumed: number; fuel_flow: number; engine_load: number; throttle_position: number; spark_dwell_time: number; barometric_pressure: number; intake_manifold_pressure: number; intake_manifold_temperature: number; cylinder_head_temperature: number; ignition_timing: number; injection_time: number; exhaust_gas_temperature: number; throttle_out: number; pt_compensation: number; ignition_voltage: number; fuel_pressure: number }> };
    estimator_status: { new(time_usec?: Int64Input, flags?: number, vel_ratio?: number, pos_horiz_ratio?: number, pos_vert_ratio?: number, mag_ratio?: number, hagl_ratio?: number, tas_ratio?: number, pos_horiz_accuracy?: number, pos_vert_accuracy?: number): Outgoing<estimator_status, { time_usec: Int64Input; flags: number; vel_ratio: number; pos_horiz_ratio: number; pos_vert_ratio: number; mag_ratio: number; hagl_ratio: number; tas_ratio: number; pos_horiz_accuracy: number; pos_vert_accuracy: number }> };
    wind_cov: { new(time_usec?: Int64Input, wind_x?: number, wind_y?: number, wind_z?: number, var_horiz?: number, var_vert?: number, wind_alt?: number, horiz_accuracy?: number, vert_accuracy?: number): Outgoing<wind_cov, { time_usec: Int64Input; wind_x: number; wind_y: number; wind_z: number; var_horiz: number; var_vert: number; wind_alt: number; horiz_accuracy: number; vert_accuracy: number }> };
    gps_input: { new(time_usec?: Int64Input, gps_id?: number, ignore_flags?: number, time_week_ms?: number, time_week?: number, fix_type?: number, lat?: number, lon?: number, alt?: number, hdop?: number, vdop?: number, vn?: number, ve?: number, vd?: number, speed_accuracy?: number, horiz_accuracy?: number, vert_accuracy?: number, satellites_visible?: number, yaw?: number): Outgoing<gps_input, { time_usec: Int64Input; gps_id: number; ignore_flags: number; time_week_ms: number; time_week: number; fix_type: number; lat: number; lon: number; alt: number; hdop: number; vdop: number; vn: number; ve: number; vd: number; speed_accuracy: number; horiz_accuracy: number; vert_accuracy: number; satellites_visible: number; yaw: number }> };
    gps_rtcm_data: { new(flags?: number, len?: number, data?: StringInput): Outgoing<gps_rtcm_data, { flags: number; len: number; data: StringInput }> };
    high_latency: { new(base_mode?: number, custom_mode?: number, landed_state?: number, roll?: number, pitch?: number, heading?: number, throttle?: number, heading_sp?: number, latitude?: number, longitude?: number, altitude_amsl?: number, altitude_sp?: number, airspeed?: number, airspeed_sp?: number, groundspeed?: number, climb_rate?: number, gps_nsat?: number, gps_fix_type?: number, battery_remaining?: number, temperature?: number, temperature_air?: number, failsafe?: number, wp_num?: number, wp_distance?: number): Outgoing<high_latency, { base_mode: number; custom_mode: number; landed_state: number; roll: number; pitch: number; heading: number; throttle: number; heading_sp: number; latitude: number; longitude: number; altitude_amsl: number; altitude_sp: number; airspeed: number; airspeed_sp: number; groundspeed: number; climb_rate: number; gps_nsat: number; gps_fix_type: number; battery_remaining: number; temperature: number; temperature_air: number; failsafe: number; wp_num: number; wp_distance: number }> };
    high_latency2: { new(timestamp?: number, type?: number, autopilot?: number, custom_mode?: number, latitude?: number, longitude?: number, altitude?: number, target_altitude?: number, heading?: number, target_heading?: number, target_distance?: number, throttle?: number, airspeed?: number, airspeed_sp?: number, groundspeed?: number, windspeed?: number, wind_heading?: number, eph?: number, epv?: number, temperature_air?: number, climb_rate?: number, battery?: number, wp_num?: number, failure_flags?: number, custom0?: number, custom1?: number, custom2?: number): Outgoing<high_latency2, { timestamp: number; type: number; autopilot: number; custom_mode: number; latitude: number; longitude: number; altitude: number; target_altitude: number; heading: number; target_heading: number; target_distance: number; throttle: number; airspeed: number; airspeed_sp: number; groundspeed: number; windspeed: number; wind_heading: number; eph: number; epv: number; temperature_air: number; climb_rate: number; battery: number; wp_num: number; failure_flags: number; custom0: number; custom1: number; custom2: number }> };
    vibration: { new(time_usec?: Int64Input, vibration_x?: number, vibration_y?: number, vibration_z?: number, clipping_0?: number, clipping_1?: number, clipping_2?: number): Outgoing<vibration, { time_usec: Int64Input; vibration_x: number; vibration_y: number; vibration_z: number; clipping_0: number; clipping_1: number; clipping_2: number }> };
    home_position: { new(latitude?: number, longitude?: number, altitude?: number, x?: number, y?: number, z?: number, q?: number[], approach_x?: number, approach_y?: number, approach_z?: number, time_usec?: Int64Input): Outgoing<home_position, { latitude: number; longitude: number; altitude: number; x: number; y: number; z: number; q: number[]; approach_x: number; approach_y: number; approach_z: number; time_usec: Int64Input }> };
    set_home_position: { new(target_system?: number, latitude?: number, longitude?: number, altitude?: number, x?: number, y?: number, z?: number, q?: number[], approach_x?: number, approach_y?: number, approach_z?: number, time_usec?: Int64Input): Outgoing<set_home_position, { target_system: number; latitude: number; longitude: number; altitude: number; x: number; y: number; z: number; q: number[]; approach_x: number; approach_y: number; approach_z: number; time_usec: Int64Input }> };
    message_interval: { new(message_id?: number, interval_us?: number): Outgoing<message_interval, { message_id: number; interval_us: number }> };
    extended_sys_state: { new(vtol_state?: number, landed_state?: number): Outgoing<extended_sys_state, { vtol_state: number; landed_state: number }> };
    adsb_vehicle: { new(ICAO_address?: number, lat?: number, lon?: number, altitude_type?: number, altitude?: number, heading?: number, hor_velocity?: number, ver_velocity?: number, callsign?: StringInput, emitter_type?: number, tslc?: number, flags?: number, squawk?: number): Outgoing<adsb_vehicle, { ICAO_address: number; lat: number; lon: number; altitude_type: number; altitude: number; heading: number; hor_velocity: number; ver_velocity: number; callsign: StringInput; emitter_type: number; tslc: number; flags: number; squawk: number }> };
    collision: { new(src?: number, id?: number, action?: number, threat_level?: number, time_to_minimum_delta?: number, altitude_minimum_delta?: number, horizontal_minimum_delta?: number): Outgoing<collision, { src: number; id: number; action: number; threat_level: number; time_to_minimum_delta: number; altitude_minimum_delta: number; horizontal_minimum_delta: number }> };
    v2_extension: { new(target_network?: number, target_system?: number, target_component?: number, message_type?: number, payload?: StringInput): Outgoing<v2_extension, { target_network: number; target_system: number; target_component: number; message_type: number; payload: StringInput }> };
    memory_vect: { new(address?: number, ver?: number, type?: number, value?: StringInput): Outgoing<memory_vect, { address: number; ver: number; type: number; value: StringInput }> };
    debug_vect: { new(name?: StringInput, time_usec?: Int64Input, x?: number, y?: number, z?: number): Outgoing<debug_vect, { name: StringInput; time_usec: Int64Input; x: number; y: number; z: number }> };
    named_value_float: { new(time_boot_ms?: number, name?: StringInput, value?: number): Outgoing<named_value_float, { time_boot_ms: number; name: StringInput; value: number }> };
    named_value_int: { new(time_boot_ms?: number, name?: StringInput, value?: number): Outgoing<named_value_int, { time_boot_ms: number; name: StringInput; value: number }> };
    statustext: { new(severity?: number, text?: StringInput, id?: number, chunk_seq?: number): Outgoing<statustext, { severity: number; text: StringInput; id: number; chunk_seq: number }> };
    debug: { new(time_boot_ms?: number, ind?: number, value?: number): Outgoing<debug, { time_boot_ms: number; ind: number; value: number }> };
    setup_signing: { new(target_system?: number, target_component?: number, secret_key?: StringInput, initial_timestamp?: Int64Input): Outgoing<setup_signing, { target_system: number; target_component: number; secret_key: StringInput; initial_timestamp: Int64Input }> };
    button_change: { new(time_boot_ms?: number, last_change_ms?: number, state?: number): Outgoing<button_change, { time_boot_ms: number; last_change_ms: number; state: number }> };
    play_tune: { new(target_system?: number, target_component?: number, tune?: StringInput, tune2?: StringInput): Outgoing<play_tune, { target_system: number; target_component: number; tune: StringInput; tune2: StringInput }> };
    camera_information: { new(time_boot_ms?: number, vendor_name?: StringInput, model_name?: StringInput, firmware_version?: number, focal_length?: number, sensor_size_h?: number, sensor_size_v?: number, resolution_h?: number, resolution_v?: number, lens_id?: number, flags?: number, cam_definition_version?: number, cam_definition_uri?: StringInput, gimbal_device_id?: number): Outgoing<camera_information, { time_boot_ms: number; vendor_name: StringInput; model_name: StringInput; firmware_version: number; focal_length: number; sensor_size_h: number; sensor_size_v: number; resolution_h: number; resolution_v: number; lens_id: number; flags: number; cam_definition_version: number; cam_definition_uri: StringInput; gimbal_device_id: number }> };
    camera_settings: { new(time_boot_ms?: number, mode_id?: number, zoomLevel?: number, focusLevel?: number): Outgoing<camera_settings, { time_boot_ms: number; mode_id: number; zoomLevel: number; focusLevel: number }> };
    storage_information: { new(time_boot_ms?: number, storage_id?: number, storage_count?: number, status?: number, total_capacity?: number, used_capacity?: number, available_capacity?: number, read_speed?: number, write_speed?: number, type?: number, name?: StringInput): Outgoing<storage_information, { time_boot_ms: number; storage_id: number; storage_count: number; status: number; total_capacity: number; used_capacity: number; available_capacity: number; read_speed: number; write_speed: number; type: number; name: StringInput }> };
    camera_capture_status: { new(time_boot_ms?: number, image_status?: number, video_status?: number, image_interval?: number, recording_time_ms?: number, available_capacity?: number, image_count?: number): Outgoing<camera_capture_status, { time_boot_ms: number; image_status: number; video_status: number; image_interval: number; recording_time_ms: number; available_capacity: number; image_count: number }> };
    camera_image_captured: { new(time_boot_ms?: number, time_utc?: Int64Input, camera_id?: number, lat?: number, lon?: number, alt?: number, relative_alt?: number, q?: number[], image_index?: number, capture_result?: number, file_url?: StringInput): Outgoing<camera_image_captured, { time_boot_ms: number; time_utc: Int64Input; camera_id: number; lat: number; lon: number; alt: number; relative_alt: number; q: number[]; image_index: number; capture_result: number; file_url: StringInput }> };
    flight_information: { new(time_boot_ms?: number, arming_time_utc?: Int64Input, takeoff_time_utc?: Int64Input, flight_uuid?: Int64Input): Outgoing<flight_information, { time_boot_ms: number; arming_time_utc: Int64Input; takeoff_time_utc: Int64Input; flight_uuid: Int64Input }> };
    mount_orientation: { new(time_boot_ms?: number, roll?: number, pitch?: number, yaw?: number, yaw_absolute?: number): Outgoing<mount_orientation, { time_boot_ms: number; roll: number; pitch: number; yaw: number; yaw_absolute: number }> };
    logging_data: { new(target_system?: number, target_component?: number, sequence?: number, length?: number, first_message_offset?: number, data?: StringInput): Outgoing<logging_data, { target_system: number; target_component: number; sequence: number; length: number; first_message_offset: number; data: StringInput }> };
    logging_data_acked: { new(target_system?: number, target_component?: number, sequence?: number, length?: number, first_message_offset?: number, data?: StringInput): Outgoing<logging_data_acked, { target_system: number; target_component: number; sequence: number; length: number; first_message_offset: number; data: StringInput }> };
    logging_ack: { new(target_system?: number, target_component?: number, sequence?: number): Outgoing<logging_ack, { target_system: number; target_component: number; sequence: number }> };
    video_stream_information: { new(stream_id?: number, count?: number, type?: number, flags?: number, framerate?: number, resolution_h?: number, resolution_v?: number, bitrate?: number, rotation?: number, hfov?: number, name?: StringInput, uri?: StringInput, encoding?: number): Outgoing<video_stream_information, { stream_id: number; count: number; type: number; flags: number; framerate: number; resolution_h: number; resolution_v: number; bitrate: number; rotation: number; hfov: number; name: StringInput; uri: StringInput; encoding: number }> };
    video_stream_status: { new(stream_id?: number, flags?: number, framerate?: number, resolution_h?: number, resolution_v?: number, bitrate?: number, rotation?: number, hfov?: number): Outgoing<video_stream_status, { stream_id: number; flags: number; framerate: number; resolution_h: number; resolution_v: number; bitrate: number; rotation: number; hfov: number }> };
    camera_fov_status: { new(time_boot_ms?: number, lat_camera?: number, lon_camera?: number, alt_camera?: number, lat_image?: number, lon_image?: number, alt_image?: number, q?: number[], hfov?: number, vfov?: number): Outgoing<camera_fov_status, { time_boot_ms: number; lat_camera: number; lon_camera: number; alt_camera: number; lat_image: number; lon_image: number; alt_image: number; q: number[]; hfov: number; vfov: number }> };
    camera_tracking_image_status: { new(tracking_status?: number, tracking_mode?: number, target_data?: number, point_x?: number, point_y?: number, radius?: number, rec_top_x?: number, rec_top_y?: number, rec_bottom_x?: number, rec_bottom_y?: number): Outgoing<camera_tracking_image_status, { tracking_status: number; tracking_mode: number; target_data: number; point_x: number; point_y: number; radius: number; rec_top_x: number; rec_top_y: number; rec_bottom_x: number; rec_bottom_y: number }> };
    camera_tracking_geo_status: { new(tracking_status?: number, lat?: number, lon?: number, alt?: number, h_acc?: number, v_acc?: number, vel_n?: number, vel_e?: number, vel_d?: number, vel_acc?: number, dist?: number, hdg?: number, hdg_acc?: number): Outgoing<camera_tracking_geo_status, { tracking_status: number; lat: number; lon: number; alt: number; h_acc: number; v_acc: number; vel_n: number; vel_e: number; vel_d: number; vel_acc: number; dist: number; hdg: number; hdg_acc: number }> };
    camera_thermal_range: { new(time_boot_ms?: number, stream_id?: number, camera_device_id?: number, max?: number, max_point_x?: number, max_point_y?: number, min?: number, min_point_x?: number, min_point_y?: number): Outgoing<camera_thermal_range, { time_boot_ms: number; stream_id: number; camera_device_id: number; max: number; max_point_x: number; max_point_y: number; min: number; min_point_x: number; min_point_y: number }> };
    gimbal_manager_information: { new(time_boot_ms?: number, cap_flags?: number, gimbal_device_id?: number, roll_min?: number, roll_max?: number, pitch_min?: number, pitch_max?: number, yaw_min?: number, yaw_max?: number): Outgoing<gimbal_manager_information, { time_boot_ms: number; cap_flags: number; gimbal_device_id: number; roll_min: number; roll_max: number; pitch_min: number; pitch_max: number; yaw_min: number; yaw_max: number }> };
    gimbal_manager_status: { new(time_boot_ms?: number, flags?: number, gimbal_device_id?: number, primary_control_sysid?: number, primary_control_compid?: number, secondary_control_sysid?: number, secondary_control_compid?: number): Outgoing<gimbal_manager_status, { time_boot_ms: number; flags: number; gimbal_device_id: number; primary_control_sysid: number; primary_control_compid: number; secondary_control_sysid: number; secondary_control_compid: number }> };
    gimbal_manager_set_attitude: { new(target_system?: number, target_component?: number, flags?: number, gimbal_device_id?: number, q?: number[], angular_velocity_x?: number, angular_velocity_y?: number, angular_velocity_z?: number): Outgoing<gimbal_manager_set_attitude, { target_system: number; target_component: number; flags: number; gimbal_device_id: number; q: number[]; angular_velocity_x: number; angular_velocity_y: number; angular_velocity_z: number }> };
    gimbal_device_information: { new(time_boot_ms?: number, vendor_name?: StringInput, model_name?: StringInput, custom_name?: StringInput, firmware_version?: number, hardware_version?: number, uid?: Int64Input, cap_flags?: number, custom_cap_flags?: number, roll_min?: number, roll_max?: number, pitch_min?: number, pitch_max?: number, yaw_min?: number, yaw_max?: number, gimbal_device_id?: number): Outgoing<gimbal_device_information, { time_boot_ms: number; vendor_name: StringInput; model_name: StringInput; custom_name: StringInput; firmware_version: number; hardware_version: number; uid: Int64Input; cap_flags: number; custom_cap_flags: number; roll_min: number; roll_max: number; pitch_min: number; pitch_max: number; yaw_min: number; yaw_max: number; gimbal_device_id: number }> };
    gimbal_device_set_attitude: { new(target_system?: number, target_component?: number, flags?: number, q?: number[], angular_velocity_x?: number, angular_velocity_y?: number, angular_velocity_z?: number): Outgoing<gimbal_device_set_attitude, { target_system: number; target_component: number; flags: number; q: number[]; angular_velocity_x: number; angular_velocity_y: number; angular_velocity_z: number }> };
    gimbal_device_attitude_status: { new(target_system?: number, target_component?: number, time_boot_ms?: number, flags?: number, q?: number[], angular_velocity_x?: number, angular_velocity_y?: number, angular_velocity_z?: number, failure_flags?: number, delta_yaw?: number, delta_yaw_velocity?: number, gimbal_device_id?: number): Outgoing<gimbal_device_attitude_status, { target_system: number; target_component: number; time_boot_ms: number; flags: number; q: number[]; angular_velocity_x: number; angular_velocity_y: number; angular_velocity_z: number; failure_flags: number; delta_yaw: number; delta_yaw_velocity: number; gimbal_device_id: number }> };
    autopilot_state_for_gimbal_device: { new(target_system?: number, target_component?: number, time_boot_us?: Int64Input, q?: number[], q_estimated_delay_us?: number, vx?: number, vy?: number, vz?: number, v_estimated_delay_us?: number, feed_forward_angular_velocity_z?: number, estimator_status?: number, landed_state?: number, angular_velocity_z?: number): Outgoing<autopilot_state_for_gimbal_device, { target_system: number; target_component: number; time_boot_us: Int64Input; q: number[]; q_estimated_delay_us: number; vx: number; vy: number; vz: number; v_estimated_delay_us: number; feed_forward_angular_velocity_z: number; estimator_status: number; landed_state: number; angular_velocity_z: number }> };
    gimbal_manager_set_pitchyaw: { new(target_system?: number, target_component?: number, flags?: number, gimbal_device_id?: number, pitch?: number, yaw?: number, pitch_rate?: number, yaw_rate?: number): Outgoing<gimbal_manager_set_pitchyaw, { target_system: number; target_component: number; flags: number; gimbal_device_id: number; pitch: number; yaw: number; pitch_rate: number; yaw_rate: number }> };
    gimbal_manager_set_manual_control: { new(target_system?: number, target_component?: number, flags?: number, gimbal_device_id?: number, pitch?: number, yaw?: number, pitch_rate?: number, yaw_rate?: number): Outgoing<gimbal_manager_set_manual_control, { target_system: number; target_component: number; flags: number; gimbal_device_id: number; pitch: number; yaw: number; pitch_rate: number; yaw_rate: number }> };
    wifi_config_ap: { new(ssid?: StringInput, password?: StringInput): Outgoing<wifi_config_ap, { ssid: StringInput; password: StringInput }> };
    ais_vessel: { new(MMSI?: number, lat?: number, lon?: number, COG?: number, heading?: number, velocity?: number, turn_rate?: number, navigational_status?: number, type?: number, dimension_bow?: number, dimension_stern?: number, dimension_port?: number, dimension_starboard?: number, callsign?: StringInput, name?: StringInput, tslc?: number, flags?: number): Outgoing<ais_vessel, { MMSI: number; lat: number; lon: number; COG: number; heading: number; velocity: number; turn_rate: number; navigational_status: number; type: number; dimension_bow: number; dimension_stern: number; dimension_port: number; dimension_starboard: number; callsign: StringInput; name: StringInput; tslc: number; flags: number }> };
    uavcan_node_status: { new(time_usec?: Int64Input, uptime_sec?: number, health?: number, mode?: number, sub_mode?: number, vendor_specific_status_code?: number): Outgoing<uavcan_node_status, { time_usec: Int64Input; uptime_sec: number; health: number; mode: number; sub_mode: number; vendor_specific_status_code: number }> };
    uavcan_node_info: { new(time_usec?: Int64Input, uptime_sec?: number, name?: StringInput, hw_version_major?: number, hw_version_minor?: number, hw_unique_id?: StringInput, sw_version_major?: number, sw_version_minor?: number, sw_vcs_commit?: number): Outgoing<uavcan_node_info, { time_usec: Int64Input; uptime_sec: number; name: StringInput; hw_version_major: number; hw_version_minor: number; hw_unique_id: StringInput; sw_version_major: number; sw_version_minor: number; sw_vcs_commit: number }> };
    param_ext_request_read: { new(target_system?: number, target_component?: number, param_id?: StringInput, param_index?: number): Outgoing<param_ext_request_read, { target_system: number; target_component: number; param_id: StringInput; param_index: number }> };
    param_ext_request_list: { new(target_system?: number, target_component?: number): Outgoing<param_ext_request_list, { target_system: number; target_component: number }> };
    param_ext_value: { new(param_id?: StringInput, param_value?: StringInput, param_type?: number, param_count?: number, param_index?: number): Outgoing<param_ext_value, { param_id: StringInput; param_value: StringInput; param_type: number; param_count: number; param_index: number }> };
    param_ext_set: { new(target_system?: number, target_component?: number, param_id?: StringInput, param_value?: StringInput, param_type?: number): Outgoing<param_ext_set, { target_system: number; target_component: number; param_id: StringInput; param_value: StringInput; param_type: number }> };
    param_ext_ack: { new(param_id?: StringInput, param_value?: StringInput, param_type?: number, param_result?: number): Outgoing<param_ext_ack, { param_id: StringInput; param_value: StringInput; param_type: number; param_result: number }> };
    obstacle_distance: { new(time_usec?: Int64Input, sensor_type?: number, distances?: number[], increment?: number, min_distance?: number, max_distance?: number, increment_f?: number, angle_offset?: number, frame?: number): Outgoing<obstacle_distance, { time_usec: Int64Input; sensor_type: number; distances: number[]; increment: number; min_distance: number; max_distance: number; increment_f: number; angle_offset: number; frame: number }> };
    odometry: { new(time_usec?: Int64Input, frame_id?: number, child_frame_id?: number, x?: number, y?: number, z?: number, q?: number[], vx?: number, vy?: number, vz?: number, rollspeed?: number, pitchspeed?: number, yawspeed?: number, pose_covariance?: number[], velocity_covariance?: number[], reset_counter?: number, estimator_type?: number, quality?: number): Outgoing<odometry, { time_usec: Int64Input; frame_id: number; child_frame_id: number; x: number; y: number; z: number; q: number[]; vx: number; vy: number; vz: number; rollspeed: number; pitchspeed: number; yawspeed: number; pose_covariance: number[]; velocity_covariance: number[]; reset_counter: number; estimator_type: number; quality: number }> };
    trajectory_representation_waypoints: { new(time_usec?: Int64Input, valid_points?: number, pos_x?: number[], pos_y?: number[], pos_z?: number[], vel_x?: number[], vel_y?: number[], vel_z?: number[], acc_x?: number[], acc_y?: number[], acc_z?: number[], pos_yaw?: number[], vel_yaw?: number[], command?: number[]): Outgoing<trajectory_representation_waypoints, { time_usec: Int64Input; valid_points: number; pos_x: number[]; pos_y: number[]; pos_z: number[]; vel_x: number[]; vel_y: number[]; vel_z: number[]; acc_x: number[]; acc_y: number[]; acc_z: number[]; pos_yaw: number[]; vel_yaw: number[]; command: number[] }> };
    trajectory_representation_bezier: { new(time_usec?: Int64Input, valid_points?: number, pos_x?: number[], pos_y?: number[], pos_z?: number[], delta?: number[], pos_yaw?: number[]): Outgoing<trajectory_representation_bezier, { time_usec: Int64Input; valid_points: number; pos_x: number[]; pos_y: number[]; pos_z: number[]; delta: number[]; pos_yaw: number[] }> };
    isbd_link_status: { new(timestamp?: Int64Input, last_heartbeat?: Int64Input, failed_sessions?: number, successful_sessions?: number, signal_quality?: number, ring_pending?: number, tx_session_pending?: number, rx_session_pending?: number): Outgoing<isbd_link_status, { timestamp: Int64Input; last_heartbeat: Int64Input; failed_sessions: number; successful_sessions: number; signal_quality: number; ring_pending: number; tx_session_pending: number; rx_session_pending: number }> };
    raw_rpm: { new(index?: number, frequency?: number): Outgoing<raw_rpm, { index: number; frequency: number }> };
    utm_global_position: { new(time?: Int64Input, uas_id?: StringInput, lat?: number, lon?: number, alt?: number, relative_alt?: number, vx?: number, vy?: number, vz?: number, h_acc?: number, v_acc?: number, vel_acc?: number, next_lat?: number, next_lon?: number, next_alt?: number, update_rate?: number, flight_state?: number, flags?: number): Outgoing<utm_global_position, { time: Int64Input; uas_id: StringInput; lat: number; lon: number; alt: number; relative_alt: number; vx: number; vy: number; vz: number; h_acc: number; v_acc: number; vel_acc: number; next_lat: number; next_lon: number; next_alt: number; update_rate: number; flight_state: number; flags: number }> };
    debug_float_array: { new(time_usec?: Int64Input, name?: StringInput, array_id?: number, data?: number[]): Outgoing<debug_float_array, { time_usec: Int64Input; name: StringInput; array_id: number; data: number[] }> };
    smart_battery_info: { new(id?: number, battery_function?: number, type?: number, capacity_full_specification?: number, capacity_full?: number, cycle_count?: number, serial_number?: StringInput, device_name?: StringInput, weight?: number, discharge_minimum_voltage?: number, charging_minimum_voltage?: number, resting_minimum_voltage?: number, charging_maximum_voltage?: number, cells_in_series?: number, discharge_maximum_current?: number, discharge_maximum_burst_current?: number, manufacture_date?: StringInput): Outgoing<smart_battery_info, { id: number; battery_function: number; type: number; capacity_full_specification: number; capacity_full: number; cycle_count: number; serial_number: StringInput; device_name: StringInput; weight: number; discharge_minimum_voltage: number; charging_minimum_voltage: number; resting_minimum_voltage: number; charging_maximum_voltage: number; cells_in_series: number; discharge_maximum_current: number; discharge_maximum_burst_current: number; manufacture_date: StringInput }> };
    generator_status: { new(status?: Int64Input, generator_speed?: number, battery_current?: number, load_current?: number, power_generated?: number, bus_voltage?: number, rectifier_temperature?: number, bat_current_setpoint?: number, generator_temperature?: number, runtime?: number, time_until_maintenance?: number): Outgoing<generator_status, { status: Int64Input; generator_speed: number; battery_current: number; load_current: number; power_generated: number; bus_voltage: number; rectifier_temperature: number; bat_current_setpoint: number; generator_temperature: number; runtime: number; time_until_maintenance: number }> };
    actuator_output_status: { new(time_usec?: Int64Input, active?: number, actuator?: number[]): Outgoing<actuator_output_status, { time_usec: Int64Input; active: number; actuator: number[] }> };
    relay_status: { new(time_boot_ms?: number, on?: number, present?: number): Outgoing<relay_status, { time_boot_ms: number; on: number; present: number }> };
    tunnel: { new(target_system?: number, target_component?: number, payload_type?: number, payload_length?: number, payload?: StringInput): Outgoing<tunnel, { target_system: number; target_component: number; payload_type: number; payload_length: number; payload: StringInput }> };
    can_frame: { new(target_system?: number, target_component?: number, bus?: number, len?: number, id?: number, data?: StringInput): Outgoing<can_frame, { target_system: number; target_component: number; bus: number; len: number; id: number; data: StringInput }> };
    canfd_frame: { new(target_system?: number, target_component?: number, bus?: number, len?: number, id?: number, data?: StringInput): Outgoing<canfd_frame, { target_system: number; target_component: number; bus: number; len: number; id: number; data: StringInput }> };
    can_filter_modify: { new(target_system?: number, target_component?: number, bus?: number, operation?: number, num_ids?: number, ids?: number[]): Outgoing<can_filter_modify, { target_system: number; target_component: number; bus: number; operation: number; num_ids: number; ids: number[] }> };
    wheel_distance: { new(time_usec?: Int64Input, count?: number, distance?: number[]): Outgoing<wheel_distance, { time_usec: Int64Input; count: number; distance: number[] }> };
    winch_status: { new(time_usec?: Int64Input, line_length?: number, speed?: number, tension?: number, voltage?: number, current?: number, temperature?: number, status?: number): Outgoing<winch_status, { time_usec: Int64Input; line_length: number; speed: number; tension: number; voltage: number; current: number; temperature: number; status: number }> };
    open_drone_id_basic_id: { new(target_system?: number, target_component?: number, id_or_mac?: StringInput, id_type?: number, ua_type?: number, uas_id?: StringInput): Outgoing<open_drone_id_basic_id, { target_system: number; target_component: number; id_or_mac: StringInput; id_type: number; ua_type: number; uas_id: StringInput }> };
    open_drone_id_location: { new(target_system?: number, target_component?: number, id_or_mac?: StringInput, status?: number, direction?: number, speed_horizontal?: number, speed_vertical?: number, latitude?: number, longitude?: number, altitude_barometric?: number, altitude_geodetic?: number, height_reference?: number, height?: number, horizontal_accuracy?: number, vertical_accuracy?: number, barometer_accuracy?: number, speed_accuracy?: number, timestamp?: number, timestamp_accuracy?: number): Outgoing<open_drone_id_location, { target_system: number; target_component: number; id_or_mac: StringInput; status: number; direction: number; speed_horizontal: number; speed_vertical: number; latitude: number; longitude: number; altitude_barometric: number; altitude_geodetic: number; height_reference: number; height: number; horizontal_accuracy: number; vertical_accuracy: number; barometer_accuracy: number; speed_accuracy: number; timestamp: number; timestamp_accuracy: number }> };
    open_drone_id_authentication: { new(target_system?: number, target_component?: number, id_or_mac?: StringInput, authentication_type?: number, data_page?: number, last_page_index?: number, length?: number, timestamp?: number, authentication_data?: StringInput): Outgoing<open_drone_id_authentication, { target_system: number; target_component: number; id_or_mac: StringInput; authentication_type: number; data_page: number; last_page_index: number; length: number; timestamp: number; authentication_data: StringInput }> };
    open_drone_id_self_id: { new(target_system?: number, target_component?: number, id_or_mac?: StringInput, description_type?: number, description?: StringInput): Outgoing<open_drone_id_self_id, { target_system: number; target_component: number; id_or_mac: StringInput; description_type: number; description: StringInput }> };
    open_drone_id_system: { new(target_system?: number, target_component?: number, id_or_mac?: StringInput, operator_location_type?: number, classification_type?: number, operator_latitude?: number, operator_longitude?: number, area_count?: number, area_radius?: number, area_ceiling?: number, area_floor?: number, category_eu?: number, class_eu?: number, operator_altitude_geo?: number, timestamp?: number): Outgoing<open_drone_id_system, { target_system: number; target_component: number; id_or_mac: StringInput; operator_location_type: number; classification_type: number; operator_latitude: number; operator_longitude: number; area_count: number; area_radius: number; area_ceiling: number; area_floor: number; category_eu: number; class_eu: number; operator_altitude_geo: number; timestamp: number }> };
    open_drone_id_operator_id: { new(target_system?: number, target_component?: number, id_or_mac?: StringInput, operator_id_type?: number, operator_id?: StringInput): Outgoing<open_drone_id_operator_id, { target_system: number; target_component: number; id_or_mac: StringInput; operator_id_type: number; operator_id: StringInput }> };
    open_drone_id_arm_status: { new(status?: number, error?: StringInput): Outgoing<open_drone_id_arm_status, { status: number; error: StringInput }> };
    open_drone_id_message_pack: { new(target_system?: number, target_component?: number, id_or_mac?: StringInput, single_message_size?: number, msg_pack_size?: number, messages?: StringInput): Outgoing<open_drone_id_message_pack, { target_system: number; target_component: number; id_or_mac: StringInput; single_message_size: number; msg_pack_size: number; messages: StringInput }> };
    open_drone_id_system_update: { new(target_system?: number, target_component?: number, operator_latitude?: number, operator_longitude?: number, operator_altitude_geo?: number, timestamp?: number): Outgoing<open_drone_id_system_update, { target_system: number; target_component: number; operator_latitude: number; operator_longitude: number; operator_altitude_geo: number; timestamp: number }> };
    hygrometer_sensor: { new(id?: number, temperature?: number, humidity?: number): Outgoing<hygrometer_sensor, { id: number; temperature: number; humidity: number }> };
    mission_checksum: { new(mission_type?: number, checksum?: number): Outgoing<mission_checksum, { mission_type: number; checksum: number }> };
    airspeed: { new(id?: number, airspeed?: number, temperature?: number, raw_press?: number, flags?: number): Outgoing<airspeed, { id: number; airspeed: number; temperature: number; raw_press: number; flags: number }> };
    radio_rc_channels: { new(target_system?: number, target_component?: number, time_last_update_ms?: number, flags?: number, count?: number, channels?: number[]): Outgoing<radio_rc_channels, { target_system: number; target_component: number; time_last_update_ms: number; flags: number; count: number; channels: number[] }> };
    available_modes: { new(number_modes?: number, mode_index?: number, standard_mode?: number, custom_mode?: number, properties?: number, mode_name?: StringInput): Outgoing<available_modes, { number_modes: number; mode_index: number; standard_mode: number; custom_mode: number; properties: number; mode_name: StringInput }> };
    current_mode: { new(standard_mode?: number, custom_mode?: number, intended_custom_mode?: number): Outgoing<current_mode, { standard_mode: number; custom_mode: number; intended_custom_mode: number }> };
    available_modes_monitor: { new(seq?: number): Outgoing<available_modes_monitor, { seq: number }> };
    gnss_integrity: { new(id?: number, system_errors?: number, authentication_state?: number, jamming_state?: number, spoofing_state?: number, raim_state?: number, raim_hfom?: number, raim_vfom?: number, corrections_quality?: number, system_status_summary?: number, gnss_signal_quality?: number, post_processing_quality?: number): Outgoing<gnss_integrity, { id: number; system_errors: number; authentication_state: number; jamming_state: number; spoofing_state: number; raim_state: number; raim_hfom: number; raim_vfom: number; corrections_quality: number; system_status_summary: number; gnss_signal_quality: number; post_processing_quality: number }> };
    icarous_heartbeat: { new(status?: number): Outgoing<icarous_heartbeat, { status: number }> };
    icarous_kinematic_bands: { new(numBands?: number, type1?: number, min1?: number, max1?: number, type2?: number, min2?: number, max2?: number, type3?: number, min3?: number, max3?: number, type4?: number, min4?: number, max4?: number, type5?: number, min5?: number, max5?: number): Outgoing<icarous_kinematic_bands, { numBands: number; type1: number; min1: number; max1: number; type2: number; min2: number; max2: number; type3: number; min3: number; max3: number; type4: number; min4: number; max4: number; type5: number; min5: number; max5: number }> };
    heartbeat: { new(type?: number, autopilot?: number, base_mode?: number, custom_mode?: number, system_status?: number, mavlink_version?: number): Outgoing<heartbeat, { type: number; autopilot: number; base_mode: number; custom_mode: number; system_status: number; mavlink_version: number }> };
    array_test_0: { new(v1?: number, ar_i8?: StringInput, ar_u8?: StringInput, ar_u16?: number[], ar_u32?: number[]): Outgoing<array_test_0, { v1: number; ar_i8: StringInput; ar_u8: StringInput; ar_u16: number[]; ar_u32: number[] }> };
    array_test_1: { new(ar_u32?: number[]): Outgoing<array_test_1, { ar_u32: number[] }> };
    array_test_3: { new(v?: number, ar_u32?: number[]): Outgoing<array_test_3, { v: number; ar_u32: number[] }> };
    array_test_4: { new(ar_u32?: number[], v?: number): Outgoing<array_test_4, { ar_u32: number[]; v: number }> };
    array_test_5: { new(c1?: StringInput, c2?: StringInput): Outgoing<array_test_5, { c1: StringInput; c2: StringInput }> };
    array_test_6: { new(v1?: number, v2?: number, v3?: number, ar_u32?: number[], ar_i32?: number[], ar_u16?: number[], ar_i16?: number[], ar_u8?: StringInput, ar_i8?: StringInput, ar_c?: StringInput, ar_d?: number[], ar_f?: number[]): Outgoing<array_test_6, { v1: number; v2: number; v3: number; ar_u32: number[]; ar_i32: number[]; ar_u16: number[]; ar_i16: number[]; ar_u8: StringInput; ar_i8: StringInput; ar_c: StringInput; ar_d: number[]; ar_f: number[] }> };
    array_test_7: { new(ar_d?: number[], ar_f?: number[], ar_u32?: number[], ar_i32?: number[], ar_u16?: number[], ar_i16?: number[], ar_u8?: StringInput, ar_i8?: StringInput, ar_c?: StringInput): Outgoing<array_test_7, { ar_d: number[]; ar_f: number[]; ar_u32: number[]; ar_i32: number[]; ar_u16: number[]; ar_i16: number[]; ar_u8: StringInput; ar_i8: StringInput; ar_c: StringInput }> };
    array_test_8: { new(v3?: number, ar_d?: number[], ar_u16?: number[]): Outgoing<array_test_8, { v3: number; ar_d: number[]; ar_u16: number[] }> };
    test_types: { new(c?: StringInput, s?: StringInput, u8?: number, u16?: number, u32?: number, u64?: Int64Input, s8?: number, s16?: number, s32?: number, s64?: Int64Input, f?: number, d?: number, u8_array?: StringInput, u16_array?: number[], u32_array?: number[], u64_array?: Int64Input[], s8_array?: StringInput, s16_array?: number[], s32_array?: number[], s64_array?: Int64Input[], f_array?: number[], d_array?: number[]): Outgoing<test_types, { c: StringInput; s: StringInput; u8: number; u16: number; u32: number; u64: Int64Input; s8: number; s16: number; s32: number; s64: Int64Input; f: number; d: number; u8_array: StringInput; u16_array: number[]; u32_array: number[]; u64_array: Int64Input[]; s8_array: StringInput; s16_array: number[]; s32_array: number[]; s64_array: Int64Input[]; f_array: number[]; d_array: number[] }> };
    nav_filter_bias: { new(usec?: Int64Input, accel_0?: number, accel_1?: number, accel_2?: number, gyro_0?: number, gyro_1?: number, gyro_2?: number): Outgoing<nav_filter_bias, { usec: Int64Input; accel_0: number; accel_1: number; accel_2: number; gyro_0: number; gyro_1: number; gyro_2: number }> };
    radio_calibration: { new(aileron?: number[], elevator?: number[], rudder?: number[], gyro?: number[], pitch?: number[], throttle?: number[]): Outgoing<radio_calibration, { aileron: number[]; elevator: number[]; rudder: number[]; gyro: number[]; pitch: number[]; throttle: number[] }> };
    ualberta_sys_status: { new(mode?: number, nav_mode?: number, pilot?: number): Outgoing<ualberta_sys_status, { mode: number; nav_mode: number; pilot: number }> };
    uavionix_adsb_out_cfg: { new(ICAO?: number, callsign?: StringInput, emitterType?: number, aircraftSize?: number, gpsOffsetLat?: number, gpsOffsetLon?: number, stallSpeed?: number, rfSelect?: number): Outgoing<uavionix_adsb_out_cfg, { ICAO: number; callsign: StringInput; emitterType: number; aircraftSize: number; gpsOffsetLat: number; gpsOffsetLon: number; stallSpeed: number; rfSelect: number }> };
    uavionix_adsb_out_dynamic: { new(utcTime?: number, gpsLat?: number, gpsLon?: number, gpsAlt?: number, gpsFix?: number, numSats?: number, baroAltMSL?: number, accuracyHor?: number, accuracyVert?: number, accuracyVel?: number, velVert?: number, velNS?: number, VelEW?: number, emergencyStatus?: number, state?: number, squawk?: number): Outgoing<uavionix_adsb_out_dynamic, { utcTime: number; gpsLat: number; gpsLon: number; gpsAlt: number; gpsFix: number; numSats: number; baroAltMSL: number; accuracyHor: number; accuracyVert: number; accuracyVel: number; velVert: number; velNS: number; VelEW: number; emergencyStatus: number; state: number; squawk: number }> };
    uavionix_adsb_transceiver_health_report: { new(rfHealth?: number): Outgoing<uavionix_adsb_transceiver_health_report, { rfHealth: number }> };
    uavionix_adsb_out_cfg_registration: { new(registration?: StringInput): Outgoing<uavionix_adsb_out_cfg_registration, { registration: StringInput }> };
    uavionix_adsb_out_cfg_flightid: { new(flight_id?: StringInput): Outgoing<uavionix_adsb_out_cfg_flightid, { flight_id: StringInput }> };
    uavionix_adsb_get: { new(ReqMessageId?: number): Outgoing<uavionix_adsb_get, { ReqMessageId: number }> };
    uavionix_adsb_out_control: { new(state?: number, baroAltMSL?: number, squawk?: number, emergencyStatus?: number, flight_id?: StringInput, x_bit?: number): Outgoing<uavionix_adsb_out_control, { state: number; baroAltMSL: number; squawk: number; emergencyStatus: number; flight_id: StringInput; x_bit: number }> };
    uavionix_adsb_out_status: { new(state?: number, squawk?: number, NIC_NACp?: number, boardTemp?: number, fault?: number, flight_id?: StringInput): Outgoing<uavionix_adsb_out_status, { state: number; squawk: number; NIC_NACp: number; boardTemp: number; fault: number; flight_id: StringInput }> };
    loweheiser_gov_efi: { new(volt_batt?: number, curr_batt?: number, curr_gen?: number, curr_rot?: number, fuel_level?: number, throttle?: number, runtime?: number, until_maintenance?: number, rectifier_temp?: number, generator_temp?: number, efi_batt?: number, efi_rpm?: number, efi_pw?: number, efi_fuel_flow?: number, efi_fuel_consumed?: number, efi_baro?: number, efi_mat?: number, efi_clt?: number, efi_tps?: number, efi_exhaust_gas_temperature?: number, efi_index?: number, generator_status?: number, efi_status?: number): Outgoing<loweheiser_gov_efi, { volt_batt: number; curr_batt: number; curr_gen: number; curr_rot: number; fuel_level: number; throttle: number; runtime: number; until_maintenance: number; rectifier_temp: number; generator_temp: number; efi_batt: number; efi_rpm: number; efi_pw: number; efi_fuel_flow: number; efi_fuel_consumed: number; efi_baro: number; efi_mat: number; efi_clt: number; efi_tps: number; efi_exhaust_gas_temperature: number; efi_index: number; generator_status: number; efi_status: number }> };
    storm32_gimbal_manager_information: { new(gimbal_id?: number, device_cap_flags?: number, manager_cap_flags?: number, roll_min?: number, roll_max?: number, pitch_min?: number, pitch_max?: number, yaw_min?: number, yaw_max?: number): Outgoing<storm32_gimbal_manager_information, { gimbal_id: number; device_cap_flags: number; manager_cap_flags: number; roll_min: number; roll_max: number; pitch_min: number; pitch_max: number; yaw_min: number; yaw_max: number }> };
    storm32_gimbal_manager_status: { new(gimbal_id?: number, supervisor?: number, device_flags?: number, manager_flags?: number, profile?: number): Outgoing<storm32_gimbal_manager_status, { gimbal_id: number; supervisor: number; device_flags: number; manager_flags: number; profile: number }> };
    storm32_gimbal_manager_control: { new(target_system?: number, target_component?: number, gimbal_id?: number, client?: number, device_flags?: number, manager_flags?: number, q?: number[], angular_velocity_x?: number, angular_velocity_y?: number, angular_velocity_z?: number): Outgoing<storm32_gimbal_manager_control, { target_system: number; target_component: number; gimbal_id: number; client: number; device_flags: number; manager_flags: number; q: number[]; angular_velocity_x: number; angular_velocity_y: number; angular_velocity_z: number }> };
    storm32_gimbal_manager_control_pitchyaw: { new(target_system?: number, target_component?: number, gimbal_id?: number, client?: number, device_flags?: number, manager_flags?: number, pitch?: number, yaw?: number, pitch_rate?: number, yaw_rate?: number): Outgoing<storm32_gimbal_manager_control_pitchyaw, { target_system: number; target_component: number; gimbal_id: number; client: number; device_flags: number; manager_flags: number; pitch: number; yaw: number; pitch_rate: number; yaw_rate: number }> };
    storm32_gimbal_manager_correct_roll: { new(target_system?: number, target_component?: number, gimbal_id?: number, client?: number, roll?: number): Outgoing<storm32_gimbal_manager_correct_roll, { target_system: number; target_component: number; gimbal_id: number; client: number; roll: number }> };
    qshot_status: { new(mode?: number, shot_state?: number): Outgoing<qshot_status, { mode: number; shot_state: number }> };
    autopilot_state_for_gimbal_device_ext: { new(target_system?: number, target_component?: number, time_boot_us?: Int64Input, wind_x?: number, wind_y?: number, wind_correction_angle?: number): Outgoing<autopilot_state_for_gimbal_device_ext, { target_system: number; target_component: number; time_boot_us: Int64Input; wind_x: number; wind_y: number; wind_correction_angle: number }> };
    frsky_passthrough_array: { new(time_boot_ms?: number, count?: number, packet_buf?: StringInput): Outgoing<frsky_passthrough_array, { time_boot_ms: number; count: number; packet_buf: StringInput }> };
    param_value_array: { new(param_count?: number, param_index_first?: number, param_array_len?: number, flags?: number, packet_buf?: StringInput): Outgoing<param_value_array, { param_count: number; param_index_first: number; param_array_len: number; flags: number; packet_buf: StringInput }> };
    mlrs_radio_link_stats: { new(target_system?: number, target_component?: number, flags?: number, rx_LQ_rc?: number, rx_LQ_ser?: number, rx_rssi1?: number, rx_snr1?: number, tx_LQ_ser?: number, tx_rssi1?: number, tx_snr1?: number, rx_rssi2?: number, rx_snr2?: number, tx_rssi2?: number, tx_snr2?: number, frequency1?: number, frequency2?: number): Outgoing<mlrs_radio_link_stats, { target_system: number; target_component: number; flags: number; rx_LQ_rc: number; rx_LQ_ser: number; rx_rssi1: number; rx_snr1: number; tx_LQ_ser: number; tx_rssi1: number; tx_snr1: number; rx_rssi2: number; rx_snr2: number; tx_rssi2: number; tx_snr2: number; frequency1: number; frequency2: number }> };
    mlrs_radio_link_information: { new(target_system?: number, target_component?: number, type?: number, mode?: number, tx_power?: number, rx_power?: number, tx_frame_rate?: number, rx_frame_rate?: number, mode_str?: StringInput, band_str?: StringInput, tx_ser_data_rate?: number, rx_ser_data_rate?: number, tx_receive_sensitivity?: number, rx_receive_sensitivity?: number): Outgoing<mlrs_radio_link_information, { target_system: number; target_component: number; type: number; mode: number; tx_power: number; rx_power: number; tx_frame_rate: number; rx_frame_rate: number; mode_str: StringInput; band_str: StringInput; tx_ser_data_rate: number; rx_ser_data_rate: number; tx_receive_sensitivity: number; rx_receive_sensitivity: number }> };
    mlrs_radio_link_flow_control: { new(tx_ser_rate?: number, rx_ser_rate?: number, tx_used_ser_bandwidth?: number, rx_used_ser_bandwidth?: number, txbuf?: number): Outgoing<mlrs_radio_link_flow_control, { tx_ser_rate: number; rx_ser_rate: number; tx_used_ser_bandwidth: number; rx_used_ser_bandwidth: number; txbuf: number }> };
    avss_prs_sys_status: { new(time_boot_ms?: number, error_status?: number, battery_status?: number, arm_status?: number, charge_status?: number): Outgoing<avss_prs_sys_status, { time_boot_ms: number; error_status: number; battery_status: number; arm_status: number; charge_status: number }> };
    avss_drone_position: { new(time_boot_ms?: number, lat?: number, lon?: number, alt?: number, ground_alt?: number, barometer_alt?: number): Outgoing<avss_drone_position, { time_boot_ms: number; lat: number; lon: number; alt: number; ground_alt: number; barometer_alt: number }> };
    avss_drone_imu: { new(time_boot_ms?: number, q1?: number, q2?: number, q3?: number, q4?: number, xacc?: number, yacc?: number, zacc?: number, xgyro?: number, ygyro?: number, zgyro?: number): Outgoing<avss_drone_imu, { time_boot_ms: number; q1: number; q2: number; q3: number; q4: number; xacc: number; yacc: number; zacc: number; xgyro: number; ygyro: number; zgyro: number }> };
    avss_drone_operation_mode: { new(time_boot_ms?: number, M300_operation_mode?: number, horsefly_operation_mode?: number): Outgoing<avss_drone_operation_mode, { time_boot_ms: number; M300_operation_mode: number; horsefly_operation_mode: number }> };
    cubepilot_raw_rc: { new(rc_raw?: StringInput): Outgoing<cubepilot_raw_rc, { rc_raw: StringInput }> };
    herelink_video_stream_information: { new(camera_id?: number, status?: number, framerate?: number, resolution_h?: number, resolution_v?: number, bitrate?: number, rotation?: number, uri?: StringInput): Outgoing<herelink_video_stream_information, { camera_id: number; status: number; framerate: number; resolution_h: number; resolution_v: number; bitrate: number; rotation: number; uri: StringInput }> };
    herelink_telem: { new(rssi?: number, snr?: number, rf_freq?: number, link_bw?: number, link_rate?: number, cpu_temp?: number, board_temp?: number): Outgoing<herelink_telem, { rssi: number; snr: number; rf_freq: number; link_bw: number; link_rate: number; cpu_temp: number; board_temp: number }> };
    cubepilot_firmware_update_start: { new(target_system?: number, target_component?: number, size?: number, crc?: number): Outgoing<cubepilot_firmware_update_start, { target_system: number; target_component: number; size: number; crc: number }> };
    cubepilot_firmware_update_resp: { new(target_system?: number, target_component?: number, offset?: number): Outgoing<cubepilot_firmware_update_resp, { target_system: number; target_component: number; offset: number }> };
    airlink_auth: { new(login?: StringInput, password?: StringInput): Outgoing<airlink_auth, { login: StringInput; password: StringInput }> };
    airlink_auth_response: { new(resp_type?: number): Outgoing<airlink_auth_response, { resp_type: number }> };
    bad_data: { new(data: Bytes, reason: string): BadData };
}
export interface Runtime {
    ready: Promise<void>;
    messages: MessageConstructors;
    map: Record<number, { format: string; type: MessageConstructors[keyof Omit<MessageConstructors, "bad_data">]; order_map: number[]; crc_extra: number }>;
    x25Crc(bytes: Bytes, crc?: number): number;
    sha256(bytes: Bytes): Uint8Array;
    create_signature(key: Bytes, bytes: Bytes): Uint8Array;
    header: { new(msgId: number, mlen?: number, seq?: number, srcSystem?: number, srcComponent?: number, incompat_flags?: number, compat_flags?: number): Header };
    WIRE_PROTOCOL_VERSION: "2.0";
    PROTOCOL_MARKER_V1: 254;
    PROTOCOL_MARKER_V2: 253;
    HEADER_LEN_V1: 6;
    HEADER_LEN_V2: 10;
    HEADER_LEN: 10;
    MAVLINK_TYPE_CHAR: 0;
    MAVLINK_TYPE_UINT8_T: 1;
    MAVLINK_TYPE_INT8_T: 2;
    MAVLINK_TYPE_UINT16_T: 3;
    MAVLINK_TYPE_INT16_T: 4;
    MAVLINK_TYPE_UINT32_T: 5;
    MAVLINK_TYPE_INT32_T: 6;
    MAVLINK_TYPE_UINT64_T: 7;
    MAVLINK_TYPE_INT64_T: 8;
    MAVLINK_TYPE_FLOAT: 9;
    MAVLINK_TYPE_DOUBLE: 10;
    MAVLINK_IFLAG_SIGNED: 1;
    MAVLINK_SIGNATURE_BLOCK_LEN: 13;
    ACCELCAL_VEHICLE_POS_LEVEL: 1;
    ACCELCAL_VEHICLE_POS_LEFT: 2;
    ACCELCAL_VEHICLE_POS_RIGHT: 3;
    ACCELCAL_VEHICLE_POS_NOSEDOWN: 4;
    ACCELCAL_VEHICLE_POS_NOSEUP: 5;
    ACCELCAL_VEHICLE_POS_BACK: 6;
    ACCELCAL_VEHICLE_POS_SUCCESS: 16777215;
    ACCELCAL_VEHICLE_POS_FAILED: 16777216;
    ACCELCAL_VEHICLE_POS_ENUM_END: 16777217;
    HEADING_TYPE_COURSE_OVER_GROUND: 0;
    HEADING_TYPE_HEADING: 1;
    HEADING_TYPE_DEFAULT: 2;
    HEADING_TYPE_ENUM_END: 3;
    MAV_CMD_NAV_WAYPOINT: 16;
    MAV_CMD_NAV_LOITER_UNLIM: 17;
    MAV_CMD_NAV_LOITER_TURNS: 18;
    MAV_CMD_NAV_LOITER_TIME: 19;
    MAV_CMD_NAV_RETURN_TO_LAUNCH: 20;
    MAV_CMD_NAV_LAND: 21;
    MAV_CMD_NAV_TAKEOFF: 22;
    MAV_CMD_NAV_LAND_LOCAL: 23;
    MAV_CMD_NAV_TAKEOFF_LOCAL: 24;
    MAV_CMD_NAV_FOLLOW: 25;
    MAV_CMD_NAV_CONTINUE_AND_CHANGE_ALT: 30;
    MAV_CMD_NAV_LOITER_TO_ALT: 31;
    MAV_CMD_DO_FOLLOW: 32;
    MAV_CMD_DO_FOLLOW_REPOSITION: 33;
    MAV_CMD_NAV_ROI: 80;
    MAV_CMD_NAV_PATHPLANNING: 81;
    MAV_CMD_NAV_SPLINE_WAYPOINT: 82;
    MAV_CMD_NAV_ALTITUDE_WAIT: 83;
    MAV_CMD_NAV_VTOL_TAKEOFF: 84;
    MAV_CMD_NAV_VTOL_LAND: 85;
    MAV_CMD_NAV_GUIDED_ENABLE: 92;
    MAV_CMD_NAV_DELAY: 93;
    MAV_CMD_NAV_PAYLOAD_PLACE: 94;
    MAV_CMD_NAV_LAST: 95;
    MAV_CMD_CONDITION_DELAY: 112;
    MAV_CMD_CONDITION_CHANGE_ALT: 113;
    MAV_CMD_CONDITION_DISTANCE: 114;
    MAV_CMD_CONDITION_YAW: 115;
    MAV_CMD_CONDITION_LAST: 159;
    MAV_CMD_DO_SET_MODE: 176;
    MAV_CMD_DO_JUMP: 177;
    MAV_CMD_DO_CHANGE_SPEED: 178;
    MAV_CMD_DO_SET_HOME: 179;
    MAV_CMD_DO_SET_PARAMETER: 180;
    MAV_CMD_DO_SET_RELAY: 181;
    MAV_CMD_DO_REPEAT_RELAY: 182;
    MAV_CMD_DO_SET_SERVO: 183;
    MAV_CMD_DO_REPEAT_SERVO: 184;
    MAV_CMD_DO_FLIGHTTERMINATION: 185;
    MAV_CMD_DO_CHANGE_ALTITUDE: 186;
    MAV_CMD_DO_RETURN_PATH_START: 188;
    MAV_CMD_DO_LAND_START: 189;
    MAV_CMD_DO_RALLY_LAND: 190;
    MAV_CMD_DO_GO_AROUND: 191;
    MAV_CMD_DO_REPOSITION: 192;
    MAV_CMD_DO_PAUSE_CONTINUE: 193;
    MAV_CMD_DO_SET_REVERSE: 194;
    MAV_CMD_DO_SET_ROI_LOCATION: 195;
    MAV_CMD_DO_SET_ROI_WPNEXT_OFFSET: 196;
    MAV_CMD_DO_SET_ROI_NONE: 197;
    MAV_CMD_DO_SET_ROI_SYSID: 198;
    MAV_CMD_DO_CONTROL_VIDEO: 200;
    MAV_CMD_DO_SET_ROI: 201;
    MAV_CMD_DO_DIGICAM_CONFIGURE: 202;
    MAV_CMD_DO_DIGICAM_CONTROL: 203;
    MAV_CMD_DO_MOUNT_CONFIGURE: 204;
    MAV_CMD_DO_MOUNT_CONTROL: 205;
    MAV_CMD_DO_SET_CAM_TRIGG_DIST: 206;
    MAV_CMD_DO_FENCE_ENABLE: 207;
    MAV_CMD_DO_PARACHUTE: 208;
    MAV_CMD_DO_MOTOR_TEST: 209;
    MAV_CMD_DO_INVERTED_FLIGHT: 210;
    MAV_CMD_DO_GRIPPER: 211;
    MAV_CMD_DO_AUTOTUNE_ENABLE: 212;
    MAV_CMD_NAV_SET_YAW_SPEED: 213;
    MAV_CMD_DO_SET_CAM_TRIGG_INTERVAL: 214;
    MAV_CMD_DO_SET_RESUME_REPEAT_DIST: 215;
    MAV_CMD_DO_SPRAYER: 216;
    MAV_CMD_DO_SEND_SCRIPT_MESSAGE: 217;
    MAV_CMD_DO_AUX_FUNCTION: 218;
    MAV_CMD_DO_MOUNT_CONTROL_QUAT: 220;
    MAV_CMD_DO_GUIDED_MASTER: 221;
    MAV_CMD_DO_GUIDED_LIMITS: 222;
    MAV_CMD_DO_ENGINE_CONTROL: 223;
    MAV_CMD_DO_SET_MISSION_CURRENT: 224;
    MAV_CMD_DO_LAST: 240;
    MAV_CMD_PREFLIGHT_CALIBRATION: 241;
    MAV_CMD_PREFLIGHT_SET_SENSOR_OFFSETS: 242;
    MAV_CMD_PREFLIGHT_UAVCAN: 243;
    MAV_CMD_PREFLIGHT_STORAGE: 245;
    MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN: 246;
    MAV_CMD_OVERRIDE_GOTO: 252;
    MAV_CMD_OBLIQUE_SURVEY: 260;
    MAV_CMD_DO_SET_STANDARD_MODE: 262;
    MAV_CMD_MISSION_START: 300;
    MAV_CMD_COMPONENT_ARM_DISARM: 400;
    MAV_CMD_RUN_PREARM_CHECKS: 401;
    MAV_CMD_GET_HOME_POSITION: 410;
    MAV_CMD_START_RX_PAIR: 500;
    MAV_CMD_GET_MESSAGE_INTERVAL: 510;
    MAV_CMD_SET_MESSAGE_INTERVAL: 511;
    MAV_CMD_REQUEST_MESSAGE: 512;
    MAV_CMD_REQUEST_PROTOCOL_VERSION: 519;
    MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES: 520;
    MAV_CMD_REQUEST_CAMERA_INFORMATION: 521;
    MAV_CMD_REQUEST_CAMERA_SETTINGS: 522;
    MAV_CMD_REQUEST_STORAGE_INFORMATION: 525;
    MAV_CMD_STORAGE_FORMAT: 526;
    MAV_CMD_REQUEST_CAMERA_CAPTURE_STATUS: 527;
    MAV_CMD_REQUEST_FLIGHT_INFORMATION: 528;
    MAV_CMD_RESET_CAMERA_SETTINGS: 529;
    MAV_CMD_SET_CAMERA_MODE: 530;
    MAV_CMD_SET_CAMERA_ZOOM: 531;
    MAV_CMD_SET_CAMERA_FOCUS: 532;
    MAV_CMD_SET_STORAGE_USAGE: 533;
    MAV_CMD_SET_CAMERA_SOURCE: 534;
    MAV_CMD_JUMP_TAG: 600;
    MAV_CMD_DO_JUMP_TAG: 601;
    MAV_CMD_DO_SET_SYS_CMP_ID: 610;
    MAV_CMD_DO_SET_GLOBAL_ORIGIN: 611;
    MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW: 1000;
    MAV_CMD_DO_GIMBAL_MANAGER_CONFIGURE: 1001;
    MAV_CMD_IMAGE_START_CAPTURE: 2000;
    MAV_CMD_IMAGE_STOP_CAPTURE: 2001;
    MAV_CMD_DO_TRIGGER_CONTROL: 2003;
    MAV_CMD_CAMERA_TRACK_POINT: 2004;
    MAV_CMD_CAMERA_TRACK_RECTANGLE: 2005;
    MAV_CMD_CAMERA_STOP_TRACKING: 2010;
    MAV_CMD_VIDEO_START_CAPTURE: 2500;
    MAV_CMD_VIDEO_STOP_CAPTURE: 2501;
    MAV_CMD_VIDEO_START_STREAMING: 2502;
    MAV_CMD_VIDEO_STOP_STREAMING: 2503;
    MAV_CMD_REQUEST_VIDEO_STREAM_INFORMATION: 2504;
    MAV_CMD_REQUEST_VIDEO_STREAM_STATUS: 2505;
    MAV_CMD_LOGGING_START: 2510;
    MAV_CMD_LOGGING_STOP: 2511;
    MAV_CMD_AIRFRAME_CONFIGURATION: 2520;
    MAV_CMD_CONTROL_HIGH_LATENCY: 2600;
    MAV_CMD_PANORAMA_CREATE: 2800;
    MAV_CMD_DO_VTOL_TRANSITION: 3000;
    MAV_CMD_ARM_AUTHORIZATION_REQUEST: 3001;
    MAV_CMD_SET_GUIDED_SUBMODE_STANDARD: 4000;
    MAV_CMD_SET_GUIDED_SUBMODE_CIRCLE: 4001;
    MAV_CMD_NAV_FENCE_RETURN_POINT: 5000;
    MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION: 5001;
    MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION: 5002;
    MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION: 5003;
    MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION: 5004;
    MAV_CMD_NAV_RALLY_POINT: 5100;
    MAV_CMD_UAVCAN_GET_NODE_INFO: 5200;
    MAV_CMD_DO_SET_SAFETY_SWITCH_STATE: 5300;
    MAV_CMD_DO_ADSB_OUT_IDENT: 10001;
    MAV_CMD_LOWEHEISER_SET_STATE: 10151;
    MAV_CMD_PAYLOAD_PREPARE_DEPLOY: 30001;
    MAV_CMD_PAYLOAD_CONTROL_DEPLOY: 30002;
    MAV_CMD_WAYPOINT_USER_1: 31000;
    MAV_CMD_WAYPOINT_USER_2: 31001;
    MAV_CMD_WAYPOINT_USER_3: 31002;
    MAV_CMD_WAYPOINT_USER_4: 31003;
    MAV_CMD_WAYPOINT_USER_5: 31004;
    MAV_CMD_SPATIAL_USER_1: 31005;
    MAV_CMD_SPATIAL_USER_2: 31006;
    MAV_CMD_SPATIAL_USER_3: 31007;
    MAV_CMD_SPATIAL_USER_4: 31008;
    MAV_CMD_SPATIAL_USER_5: 31009;
    MAV_CMD_USER_1: 31010;
    MAV_CMD_USER_2: 31011;
    MAV_CMD_USER_3: 31012;
    MAV_CMD_USER_4: 31013;
    MAV_CMD_USER_5: 31014;
    MAV_CMD_CAN_FORWARD: 32000;
    MAV_CMD_RESET_MPPT: 40001;
    MAV_CMD_PAYLOAD_CONTROL: 40002;
    MAV_CMD_POWER_OFF_INITIATED: 42000;
    MAV_CMD_SOLO_BTN_FLY_CLICK: 42001;
    MAV_CMD_SOLO_BTN_FLY_HOLD: 42002;
    MAV_CMD_SOLO_BTN_PAUSE_CLICK: 42003;
    MAV_CMD_FIXED_MAG_CAL: 42004;
    MAV_CMD_FIXED_MAG_CAL_FIELD: 42005;
    MAV_CMD_FIXED_MAG_CAL_YAW: 42006;
    MAV_CMD_SET_EKF_SOURCE_SET: 42007;
    MAV_CMD_DO_START_MAG_CAL: 42424;
    MAV_CMD_DO_ACCEPT_MAG_CAL: 42425;
    MAV_CMD_DO_CANCEL_MAG_CAL: 42426;
    MAV_CMD_SET_FACTORY_TEST_MODE: 42427;
    MAV_CMD_DO_SEND_BANNER: 42428;
    MAV_CMD_ACCELCAL_VEHICLE_POS: 42429;
    MAV_CMD_GIMBAL_RESET: 42501;
    MAV_CMD_GIMBAL_AXIS_CALIBRATION_STATUS: 42502;
    MAV_CMD_GIMBAL_REQUEST_AXIS_CALIBRATION: 42503;
    MAV_CMD_GIMBAL_FULL_RESET: 42505;
    MAV_CMD_DO_WINCH: 42600;
    MAV_CMD_FLASH_BOOTLOADER: 42650;
    MAV_CMD_BATTERY_RESET: 42651;
    MAV_CMD_DEBUG_TRAP: 42700;
    MAV_CMD_SCRIPTING: 42701;
    MAV_CMD_NAV_SCRIPT_TIME: 42702;
    MAV_CMD_NAV_ATTITUDE_TIME: 42703;
    MAV_CMD_GUIDED_CHANGE_SPEED: 43000;
    MAV_CMD_GUIDED_CHANGE_ALTITUDE: 43001;
    MAV_CMD_GUIDED_CHANGE_HEADING: 43002;
    MAV_CMD_EXTERNAL_POSITION_ESTIMATE: 43003;
    MAV_CMD_EXTERNAL_WIND_ESTIMATE: 43004;
    MAV_CMD_SET_HAGL: 43005;
    MAV_CMD_STORM32_DO_GIMBAL_MANAGER_CONTROL_PITCHYAW: 60002;
    MAV_CMD_STORM32_DO_GIMBAL_MANAGER_SETUP: 60010;
    MAV_CMD_QSHOT_DO_CONFIGURE: 60020;
    MAV_CMD_PRS_SET_ARM: 60050;
    MAV_CMD_PRS_GET_ARM: 60051;
    MAV_CMD_PRS_GET_BATTERY: 60052;
    MAV_CMD_PRS_GET_ERR: 60053;
    MAV_CMD_PRS_SET_ARM_ALTI: 60070;
    MAV_CMD_PRS_GET_ARM_ALTI: 60071;
    MAV_CMD_PRS_SHUTDOWN: 60072;
    MAV_CMD_ENUM_END: 60073;
    SCRIPTING_CMD_REPL_START: 0;
    SCRIPTING_CMD_REPL_STOP: 1;
    SCRIPTING_CMD_STOP: 2;
    SCRIPTING_CMD_STOP_AND_RESTART: 3;
    SCRIPTING_CMD_ENUM_END: 4;
    SECURE_COMMAND_GET_SESSION_KEY: 0;
    SECURE_COMMAND_GET_REMOTEID_SESSION_KEY: 1;
    SECURE_COMMAND_REMOVE_PUBLIC_KEYS: 2;
    SECURE_COMMAND_GET_PUBLIC_KEYS: 3;
    SECURE_COMMAND_SET_PUBLIC_KEYS: 4;
    SECURE_COMMAND_GET_REMOTEID_CONFIG: 5;
    SECURE_COMMAND_SET_REMOTEID_CONFIG: 6;
    SECURE_COMMAND_FLASH_BOOTLOADER: 7;
    SECURE_COMMAND_OP_ENUM_END: 8;
    LIMITS_INIT: 0;
    LIMITS_DISABLED: 1;
    LIMITS_ENABLED: 2;
    LIMITS_TRIGGERED: 3;
    LIMITS_RECOVERING: 4;
    LIMITS_RECOVERED: 5;
    LIMITS_STATE_ENUM_END: 6;
    LIMIT_GPSLOCK: 1;
    LIMIT_GEOFENCE: 2;
    LIMIT_ALTITUDE: 4;
    LIMIT_MODULE_ENUM_END: 5;
    FAVORABLE_WIND: 1;
    LAND_IMMEDIATELY: 2;
    ALT_FRAME_VALID: 4;
    ALT_FRAME: 24;
    RALLY_FLAGS_ENUM_END: 25;
    CAMERA_STATUS_TYPE_HEARTBEAT: 0;
    CAMERA_STATUS_TYPE_TRIGGER: 1;
    CAMERA_STATUS_TYPE_DISCONNECT: 2;
    CAMERA_STATUS_TYPE_ERROR: 3;
    CAMERA_STATUS_TYPE_LOWBATT: 4;
    CAMERA_STATUS_TYPE_LOWSTORE: 5;
    CAMERA_STATUS_TYPE_LOWSTOREV: 6;
    CAMERA_STATUS_TYPES_ENUM_END: 7;
    CAMERA_FEEDBACK_PHOTO: 0;
    CAMERA_FEEDBACK_VIDEO: 1;
    CAMERA_FEEDBACK_BADEXPOSURE: 2;
    CAMERA_FEEDBACK_CLOSEDLOOP: 3;
    CAMERA_FEEDBACK_OPENLOOP: 4;
    CAMERA_FEEDBACK_FLAGS_ENUM_END: 5;
    MAV_MODE_GIMBAL_UNINITIALIZED: 0;
    MAV_MODE_GIMBAL_CALIBRATING_PITCH: 1;
    MAV_MODE_GIMBAL_CALIBRATING_ROLL: 2;
    MAV_MODE_GIMBAL_CALIBRATING_YAW: 3;
    MAV_MODE_GIMBAL_INITIALIZED: 4;
    MAV_MODE_GIMBAL_ACTIVE: 5;
    MAV_MODE_GIMBAL_RATE_CMD_TIMEOUT: 6;
    MAV_MODE_GIMBAL_ENUM_END: 7;
    GIMBAL_AXIS_YAW: 0;
    GIMBAL_AXIS_PITCH: 1;
    GIMBAL_AXIS_ROLL: 2;
    GIMBAL_AXIS_ENUM_END: 3;
    GIMBAL_AXIS_CALIBRATION_STATUS_IN_PROGRESS: 0;
    GIMBAL_AXIS_CALIBRATION_STATUS_SUCCEEDED: 1;
    GIMBAL_AXIS_CALIBRATION_STATUS_FAILED: 2;
    GIMBAL_AXIS_CALIBRATION_STATUS_ENUM_END: 3;
    GIMBAL_AXIS_CALIBRATION_REQUIRED_UNKNOWN: 0;
    GIMBAL_AXIS_CALIBRATION_REQUIRED_TRUE: 1;
    GIMBAL_AXIS_CALIBRATION_REQUIRED_FALSE: 2;
    GIMBAL_AXIS_CALIBRATION_REQUIRED_ENUM_END: 3;
    GOPRO_HEARTBEAT_STATUS_DISCONNECTED: 0;
    GOPRO_HEARTBEAT_STATUS_INCOMPATIBLE: 1;
    GOPRO_HEARTBEAT_STATUS_CONNECTED: 2;
    GOPRO_HEARTBEAT_STATUS_ERROR: 3;
    GOPRO_HEARTBEAT_STATUS_ENUM_END: 4;
    GOPRO_FLAG_RECORDING: 1;
    GOPRO_HEARTBEAT_FLAGS_ENUM_END: 2;
    GOPRO_REQUEST_SUCCESS: 0;
    GOPRO_REQUEST_FAILED: 1;
    GOPRO_REQUEST_STATUS_ENUM_END: 2;
    GOPRO_COMMAND_POWER: 0;
    GOPRO_COMMAND_CAPTURE_MODE: 1;
    GOPRO_COMMAND_SHUTTER: 2;
    GOPRO_COMMAND_BATTERY: 3;
    GOPRO_COMMAND_MODEL: 4;
    GOPRO_COMMAND_VIDEO_SETTINGS: 5;
    GOPRO_COMMAND_LOW_LIGHT: 6;
    GOPRO_COMMAND_PHOTO_RESOLUTION: 7;
    GOPRO_COMMAND_PHOTO_BURST_RATE: 8;
    GOPRO_COMMAND_PROTUNE: 9;
    GOPRO_COMMAND_PROTUNE_WHITE_BALANCE: 10;
    GOPRO_COMMAND_PROTUNE_COLOUR: 11;
    GOPRO_COMMAND_PROTUNE_GAIN: 12;
    GOPRO_COMMAND_PROTUNE_SHARPNESS: 13;
    GOPRO_COMMAND_PROTUNE_EXPOSURE: 14;
    GOPRO_COMMAND_TIME: 15;
    GOPRO_COMMAND_CHARGING: 16;
    GOPRO_COMMAND_ENUM_END: 17;
    GOPRO_CAPTURE_MODE_VIDEO: 0;
    GOPRO_CAPTURE_MODE_PHOTO: 1;
    GOPRO_CAPTURE_MODE_BURST: 2;
    GOPRO_CAPTURE_MODE_TIME_LAPSE: 3;
    GOPRO_CAPTURE_MODE_MULTI_SHOT: 4;
    GOPRO_CAPTURE_MODE_PLAYBACK: 5;
    GOPRO_CAPTURE_MODE_SETUP: 6;
    GOPRO_CAPTURE_MODE_UNKNOWN: 255;
    GOPRO_CAPTURE_MODE_ENUM_END: 256;
    GOPRO_RESOLUTION_480p: 0;
    GOPRO_RESOLUTION_720p: 1;
    GOPRO_RESOLUTION_960p: 2;
    GOPRO_RESOLUTION_1080p: 3;
    GOPRO_RESOLUTION_1440p: 4;
    GOPRO_RESOLUTION_2_7k_17_9: 5;
    GOPRO_RESOLUTION_2_7k_16_9: 6;
    GOPRO_RESOLUTION_2_7k_4_3: 7;
    GOPRO_RESOLUTION_4k_16_9: 8;
    GOPRO_RESOLUTION_4k_17_9: 9;
    GOPRO_RESOLUTION_720p_SUPERVIEW: 10;
    GOPRO_RESOLUTION_1080p_SUPERVIEW: 11;
    GOPRO_RESOLUTION_2_7k_SUPERVIEW: 12;
    GOPRO_RESOLUTION_4k_SUPERVIEW: 13;
    GOPRO_RESOLUTION_ENUM_END: 14;
    GOPRO_FRAME_RATE_12: 0;
    GOPRO_FRAME_RATE_15: 1;
    GOPRO_FRAME_RATE_24: 2;
    GOPRO_FRAME_RATE_25: 3;
    GOPRO_FRAME_RATE_30: 4;
    GOPRO_FRAME_RATE_48: 5;
    GOPRO_FRAME_RATE_50: 6;
    GOPRO_FRAME_RATE_60: 7;
    GOPRO_FRAME_RATE_80: 8;
    GOPRO_FRAME_RATE_90: 9;
    GOPRO_FRAME_RATE_100: 10;
    GOPRO_FRAME_RATE_120: 11;
    GOPRO_FRAME_RATE_240: 12;
    GOPRO_FRAME_RATE_12_5: 13;
    GOPRO_FRAME_RATE_ENUM_END: 14;
    GOPRO_FIELD_OF_VIEW_WIDE: 0;
    GOPRO_FIELD_OF_VIEW_MEDIUM: 1;
    GOPRO_FIELD_OF_VIEW_NARROW: 2;
    GOPRO_FIELD_OF_VIEW_ENUM_END: 3;
    GOPRO_VIDEO_SETTINGS_TV_MODE: 1;
    GOPRO_VIDEO_SETTINGS_FLAGS_ENUM_END: 2;
    GOPRO_PHOTO_RESOLUTION_5MP_MEDIUM: 0;
    GOPRO_PHOTO_RESOLUTION_7MP_MEDIUM: 1;
    GOPRO_PHOTO_RESOLUTION_7MP_WIDE: 2;
    GOPRO_PHOTO_RESOLUTION_10MP_WIDE: 3;
    GOPRO_PHOTO_RESOLUTION_12MP_WIDE: 4;
    GOPRO_PHOTO_RESOLUTION_ENUM_END: 5;
    GOPRO_PROTUNE_WHITE_BALANCE_AUTO: 0;
    GOPRO_PROTUNE_WHITE_BALANCE_3000K: 1;
    GOPRO_PROTUNE_WHITE_BALANCE_5500K: 2;
    GOPRO_PROTUNE_WHITE_BALANCE_6500K: 3;
    GOPRO_PROTUNE_WHITE_BALANCE_RAW: 4;
    GOPRO_PROTUNE_WHITE_BALANCE_ENUM_END: 5;
    GOPRO_PROTUNE_COLOUR_STANDARD: 0;
    GOPRO_PROTUNE_COLOUR_NEUTRAL: 1;
    GOPRO_PROTUNE_COLOUR_ENUM_END: 2;
    GOPRO_PROTUNE_GAIN_400: 0;
    GOPRO_PROTUNE_GAIN_800: 1;
    GOPRO_PROTUNE_GAIN_1600: 2;
    GOPRO_PROTUNE_GAIN_3200: 3;
    GOPRO_PROTUNE_GAIN_6400: 4;
    GOPRO_PROTUNE_GAIN_ENUM_END: 5;
    GOPRO_PROTUNE_SHARPNESS_LOW: 0;
    GOPRO_PROTUNE_SHARPNESS_MEDIUM: 1;
    GOPRO_PROTUNE_SHARPNESS_HIGH: 2;
    GOPRO_PROTUNE_SHARPNESS_ENUM_END: 3;
    GOPRO_PROTUNE_EXPOSURE_NEG_5_0: 0;
    GOPRO_PROTUNE_EXPOSURE_NEG_4_5: 1;
    GOPRO_PROTUNE_EXPOSURE_NEG_4_0: 2;
    GOPRO_PROTUNE_EXPOSURE_NEG_3_5: 3;
    GOPRO_PROTUNE_EXPOSURE_NEG_3_0: 4;
    GOPRO_PROTUNE_EXPOSURE_NEG_2_5: 5;
    GOPRO_PROTUNE_EXPOSURE_NEG_2_0: 6;
    GOPRO_PROTUNE_EXPOSURE_NEG_1_5: 7;
    GOPRO_PROTUNE_EXPOSURE_NEG_1_0: 8;
    GOPRO_PROTUNE_EXPOSURE_NEG_0_5: 9;
    GOPRO_PROTUNE_EXPOSURE_ZERO: 10;
    GOPRO_PROTUNE_EXPOSURE_POS_0_5: 11;
    GOPRO_PROTUNE_EXPOSURE_POS_1_0: 12;
    GOPRO_PROTUNE_EXPOSURE_POS_1_5: 13;
    GOPRO_PROTUNE_EXPOSURE_POS_2_0: 14;
    GOPRO_PROTUNE_EXPOSURE_POS_2_5: 15;
    GOPRO_PROTUNE_EXPOSURE_POS_3_0: 16;
    GOPRO_PROTUNE_EXPOSURE_POS_3_5: 17;
    GOPRO_PROTUNE_EXPOSURE_POS_4_0: 18;
    GOPRO_PROTUNE_EXPOSURE_POS_4_5: 19;
    GOPRO_PROTUNE_EXPOSURE_POS_5_0: 20;
    GOPRO_PROTUNE_EXPOSURE_ENUM_END: 21;
    GOPRO_CHARGING_DISABLED: 0;
    GOPRO_CHARGING_ENABLED: 1;
    GOPRO_CHARGING_ENUM_END: 2;
    GOPRO_MODEL_UNKNOWN: 0;
    GOPRO_MODEL_HERO_3_PLUS_SILVER: 1;
    GOPRO_MODEL_HERO_3_PLUS_BLACK: 2;
    GOPRO_MODEL_HERO_4_SILVER: 3;
    GOPRO_MODEL_HERO_4_BLACK: 4;
    GOPRO_MODEL_ENUM_END: 5;
    GOPRO_BURST_RATE_3_IN_1_SECOND: 0;
    GOPRO_BURST_RATE_5_IN_1_SECOND: 1;
    GOPRO_BURST_RATE_10_IN_1_SECOND: 2;
    GOPRO_BURST_RATE_10_IN_2_SECOND: 3;
    GOPRO_BURST_RATE_10_IN_3_SECOND: 4;
    GOPRO_BURST_RATE_30_IN_1_SECOND: 5;
    GOPRO_BURST_RATE_30_IN_2_SECOND: 6;
    GOPRO_BURST_RATE_30_IN_3_SECOND: 7;
    GOPRO_BURST_RATE_30_IN_6_SECOND: 8;
    GOPRO_BURST_RATE_ENUM_END: 9;
    MAV_CMD_DO_AUX_FUNCTION_SWITCH_LEVEL_LOW: 0;
    MAV_CMD_DO_AUX_FUNCTION_SWITCH_LEVEL_MIDDLE: 1;
    MAV_CMD_DO_AUX_FUNCTION_SWITCH_LEVEL_HIGH: 2;
    MAV_CMD_DO_AUX_FUNCTION_SWITCH_LEVEL_ENUM_END: 3;
    LED_CONTROL_PATTERN_OFF: 0;
    LED_CONTROL_PATTERN_FIRMWAREUPDATE: 1;
    LED_CONTROL_PATTERN_CUSTOM: 255;
    LED_CONTROL_PATTERN_ENUM_END: 256;
    EKF_ATTITUDE: 1;
    EKF_VELOCITY_HORIZ: 2;
    EKF_VELOCITY_VERT: 4;
    EKF_POS_HORIZ_REL: 8;
    EKF_POS_HORIZ_ABS: 16;
    EKF_POS_VERT_ABS: 32;
    EKF_POS_VERT_AGL: 64;
    EKF_CONST_POS_MODE: 128;
    EKF_PRED_POS_HORIZ_REL: 256;
    EKF_PRED_POS_HORIZ_ABS: 512;
    EKF_UNINITIALIZED: 1024;
    EKF_GPS_GLITCHING: 32768;
    EKF_STATUS_FLAGS_ENUM_END: 32769;
    PID_TUNING_ROLL: 1;
    PID_TUNING_PITCH: 2;
    PID_TUNING_YAW: 3;
    PID_TUNING_ACCZ: 4;
    PID_TUNING_STEER: 5;
    PID_TUNING_LANDING: 6;
    PID_TUNING_AXIS_ENUM_END: 7;
    MAV_REMOTE_LOG_DATA_BLOCK_STOP: 2147483645;
    MAV_REMOTE_LOG_DATA_BLOCK_START: 2147483646;
    MAV_REMOTE_LOG_DATA_BLOCK_COMMANDS_ENUM_END: 2147483647;
    MAV_REMOTE_LOG_DATA_BLOCK_NACK: 0;
    MAV_REMOTE_LOG_DATA_BLOCK_ACK: 1;
    MAV_REMOTE_LOG_DATA_BLOCK_STATUSES_ENUM_END: 2;
    DEVICE_OP_BUSTYPE_I2C: 0;
    DEVICE_OP_BUSTYPE_SPI: 1;
    DEVICE_OP_BUSTYPE_ENUM_END: 2;
    DEEPSTALL_STAGE_FLY_TO_LANDING: 0;
    DEEPSTALL_STAGE_ESTIMATE_WIND: 1;
    DEEPSTALL_STAGE_WAIT_FOR_BREAKOUT: 2;
    DEEPSTALL_STAGE_FLY_TO_ARC: 3;
    DEEPSTALL_STAGE_ARC: 4;
    DEEPSTALL_STAGE_APPROACH: 5;
    DEEPSTALL_STAGE_LAND: 6;
    DEEPSTALL_STAGE_ENUM_END: 7;
    PLANE_MODE_MANUAL: 0;
    PLANE_MODE_CIRCLE: 1;
    PLANE_MODE_STABILIZE: 2;
    PLANE_MODE_TRAINING: 3;
    PLANE_MODE_ACRO: 4;
    PLANE_MODE_FLY_BY_WIRE_A: 5;
    PLANE_MODE_FLY_BY_WIRE_B: 6;
    PLANE_MODE_CRUISE: 7;
    PLANE_MODE_AUTOTUNE: 8;
    PLANE_MODE_AUTO: 10;
    PLANE_MODE_RTL: 11;
    PLANE_MODE_LOITER: 12;
    PLANE_MODE_TAKEOFF: 13;
    PLANE_MODE_AVOID_ADSB: 14;
    PLANE_MODE_GUIDED: 15;
    PLANE_MODE_INITIALIZING: 16;
    PLANE_MODE_QSTABILIZE: 17;
    PLANE_MODE_QHOVER: 18;
    PLANE_MODE_QLOITER: 19;
    PLANE_MODE_QLAND: 20;
    PLANE_MODE_QRTL: 21;
    PLANE_MODE_QAUTOTUNE: 22;
    PLANE_MODE_QACRO: 23;
    PLANE_MODE_THERMAL: 24;
    PLANE_MODE_LOITER_ALT_QLAND: 25;
    PLANE_MODE_AUTOLAND: 26;
    PLANE_MODE_ENUM_END: 27;
    COPTER_MODE_STABILIZE: 0;
    COPTER_MODE_ACRO: 1;
    COPTER_MODE_ALT_HOLD: 2;
    COPTER_MODE_AUTO: 3;
    COPTER_MODE_GUIDED: 4;
    COPTER_MODE_LOITER: 5;
    COPTER_MODE_RTL: 6;
    COPTER_MODE_CIRCLE: 7;
    COPTER_MODE_LAND: 9;
    COPTER_MODE_DRIFT: 11;
    COPTER_MODE_SPORT: 13;
    COPTER_MODE_FLIP: 14;
    COPTER_MODE_AUTOTUNE: 15;
    COPTER_MODE_POSHOLD: 16;
    COPTER_MODE_BRAKE: 17;
    COPTER_MODE_THROW: 18;
    COPTER_MODE_AVOID_ADSB: 19;
    COPTER_MODE_GUIDED_NOGPS: 20;
    COPTER_MODE_SMART_RTL: 21;
    COPTER_MODE_FLOWHOLD: 22;
    COPTER_MODE_FOLLOW: 23;
    COPTER_MODE_ZIGZAG: 24;
    COPTER_MODE_SYSTEMID: 25;
    COPTER_MODE_AUTOROTATE: 26;
    COPTER_MODE_AUTO_RTL: 27;
    COPTER_MODE_TURTLE: 28;
    COPTER_MODE_ENUM_END: 29;
    SUB_MODE_STABILIZE: 0;
    SUB_MODE_ACRO: 1;
    SUB_MODE_ALT_HOLD: 2;
    SUB_MODE_AUTO: 3;
    SUB_MODE_GUIDED: 4;
    SUB_MODE_CIRCLE: 7;
    SUB_MODE_SURFACE: 9;
    SUB_MODE_POSHOLD: 16;
    SUB_MODE_MANUAL: 19;
    SUB_MODE_MOTORDETECT: 20;
    SUB_MODE_SURFTRAK: 21;
    SUB_MODE_ENUM_END: 22;
    ROVER_MODE_MANUAL: 0;
    ROVER_MODE_ACRO: 1;
    ROVER_MODE_STEERING: 3;
    ROVER_MODE_HOLD: 4;
    ROVER_MODE_LOITER: 5;
    ROVER_MODE_FOLLOW: 6;
    ROVER_MODE_SIMPLE: 7;
    ROVER_MODE_DOCK: 8;
    ROVER_MODE_CIRCLE: 9;
    ROVER_MODE_AUTO: 10;
    ROVER_MODE_RTL: 11;
    ROVER_MODE_SMART_RTL: 12;
    ROVER_MODE_GUIDED: 15;
    ROVER_MODE_INITIALIZING: 16;
    ROVER_MODE_ENUM_END: 17;
    TRACKER_MODE_MANUAL: 0;
    TRACKER_MODE_STOP: 1;
    TRACKER_MODE_SCAN: 2;
    TRACKER_MODE_SERVO_TEST: 3;
    TRACKER_MODE_GUIDED: 4;
    TRACKER_MODE_AUTO: 10;
    TRACKER_MODE_INITIALIZING: 16;
    TRACKER_MODE_ENUM_END: 17;
    OSD_PARAM_NONE: 0;
    OSD_PARAM_SERIAL_PROTOCOL: 1;
    OSD_PARAM_SERVO_FUNCTION: 2;
    OSD_PARAM_AUX_FUNCTION: 3;
    OSD_PARAM_FLIGHT_MODE: 4;
    OSD_PARAM_FAILSAFE_ACTION: 5;
    OSD_PARAM_FAILSAFE_ACTION_1: 6;
    OSD_PARAM_FAILSAFE_ACTION_2: 7;
    OSD_PARAM_NUM_TYPES: 8;
    OSD_PARAM_CONFIG_TYPE_ENUM_END: 9;
    OSD_PARAM_SUCCESS: 0;
    OSD_PARAM_INVALID_SCREEN: 1;
    OSD_PARAM_INVALID_PARAMETER_INDEX: 2;
    OSD_PARAM_INVALID_PARAMETER: 3;
    OSD_PARAM_CONFIG_ERROR_ENUM_END: 4;
    GSM_LINK_TYPE_NONE: 0;
    GSM_LINK_TYPE_UNKNOWN: 1;
    GSM_LINK_TYPE_2G: 2;
    GSM_LINK_TYPE_3G: 3;
    GSM_LINK_TYPE_4G: 4;
    GSM_LINK_TYPE_ENUM_END: 5;
    GSM_MODEM_TYPE_UNKNOWN: 0;
    GSM_MODEM_TYPE_HUAWEI_E3372: 1;
    GSM_MODEM_TYPE_ENUM_END: 2;
    FIRMWARE_VERSION_TYPE_DEV: 0;
    FIRMWARE_VERSION_TYPE_ALPHA: 64;
    FIRMWARE_VERSION_TYPE_BETA: 128;
    FIRMWARE_VERSION_TYPE_RC: 192;
    FIRMWARE_VERSION_TYPE_OFFICIAL: 255;
    FIRMWARE_VERSION_TYPE_ENUM_END: 256;
    HL_FAILURE_FLAG_GPS: 1;
    HL_FAILURE_FLAG_DIFFERENTIAL_PRESSURE: 2;
    HL_FAILURE_FLAG_ABSOLUTE_PRESSURE: 4;
    HL_FAILURE_FLAG_3D_ACCEL: 8;
    HL_FAILURE_FLAG_3D_GYRO: 16;
    HL_FAILURE_FLAG_3D_MAG: 32;
    HL_FAILURE_FLAG_TERRAIN: 64;
    HL_FAILURE_FLAG_BATTERY: 128;
    HL_FAILURE_FLAG_RC_RECEIVER: 256;
    HL_FAILURE_FLAG_OFFBOARD_LINK: 512;
    HL_FAILURE_FLAG_ENGINE: 1024;
    HL_FAILURE_FLAG_GEOFENCE: 2048;
    HL_FAILURE_FLAG_ESTIMATOR: 4096;
    HL_FAILURE_FLAG_MISSION: 8192;
    HL_FAILURE_FLAG_ENUM_END: 8193;
    MAV_GOTO_DO_HOLD: 0;
    MAV_GOTO_DO_CONTINUE: 1;
    MAV_GOTO_HOLD_AT_CURRENT_POSITION: 2;
    MAV_GOTO_HOLD_AT_SPECIFIED_POSITION: 3;
    MAV_GOTO_ENUM_END: 4;
    MAV_MODE_PREFLIGHT: 0;
    MAV_MODE_MANUAL_DISARMED: 64;
    MAV_MODE_TEST_DISARMED: 66;
    MAV_MODE_STABILIZE_DISARMED: 80;
    MAV_MODE_GUIDED_DISARMED: 88;
    MAV_MODE_AUTO_DISARMED: 92;
    MAV_MODE_MANUAL_ARMED: 192;
    MAV_MODE_TEST_ARMED: 194;
    MAV_MODE_STABILIZE_ARMED: 208;
    MAV_MODE_GUIDED_ARMED: 216;
    MAV_MODE_AUTO_ARMED: 220;
    MAV_MODE_ENUM_END: 221;
    MAV_SYS_STATUS_SENSOR_3D_GYRO: 1;
    MAV_SYS_STATUS_SENSOR_3D_ACCEL: 2;
    MAV_SYS_STATUS_SENSOR_3D_MAG: 4;
    MAV_SYS_STATUS_SENSOR_ABSOLUTE_PRESSURE: 8;
    MAV_SYS_STATUS_SENSOR_DIFFERENTIAL_PRESSURE: 16;
    MAV_SYS_STATUS_SENSOR_GPS: 32;
    MAV_SYS_STATUS_SENSOR_OPTICAL_FLOW: 64;
    MAV_SYS_STATUS_SENSOR_VISION_POSITION: 128;
    MAV_SYS_STATUS_SENSOR_LASER_POSITION: 256;
    MAV_SYS_STATUS_SENSOR_EXTERNAL_GROUND_TRUTH: 512;
    MAV_SYS_STATUS_SENSOR_ANGULAR_RATE_CONTROL: 1024;
    MAV_SYS_STATUS_SENSOR_ATTITUDE_STABILIZATION: 2048;
    MAV_SYS_STATUS_SENSOR_YAW_POSITION: 4096;
    MAV_SYS_STATUS_SENSOR_Z_ALTITUDE_CONTROL: 8192;
    MAV_SYS_STATUS_SENSOR_XY_POSITION_CONTROL: 16384;
    MAV_SYS_STATUS_SENSOR_MOTOR_OUTPUTS: 32768;
    MAV_SYS_STATUS_SENSOR_RC_RECEIVER: 65536;
    MAV_SYS_STATUS_SENSOR_3D_GYRO2: 131072;
    MAV_SYS_STATUS_SENSOR_3D_ACCEL2: 262144;
    MAV_SYS_STATUS_SENSOR_3D_MAG2: 524288;
    MAV_SYS_STATUS_GEOFENCE: 1048576;
    MAV_SYS_STATUS_AHRS: 2097152;
    MAV_SYS_STATUS_TERRAIN: 4194304;
    MAV_SYS_STATUS_REVERSE_MOTOR: 8388608;
    MAV_SYS_STATUS_LOGGING: 16777216;
    MAV_SYS_STATUS_SENSOR_BATTERY: 33554432;
    MAV_SYS_STATUS_SENSOR_PROXIMITY: 67108864;
    MAV_SYS_STATUS_SENSOR_SATCOM: 134217728;
    MAV_SYS_STATUS_PREARM_CHECK: 268435456;
    MAV_SYS_STATUS_OBSTACLE_AVOIDANCE: 536870912;
    MAV_SYS_STATUS_SENSOR_PROPULSION: 1073741824;
    MAV_SYS_STATUS_SENSOR_ENUM_END: 1073741825;
    MAV_FRAME_GLOBAL: 0;
    MAV_FRAME_LOCAL_NED: 1;
    MAV_FRAME_MISSION: 2;
    MAV_FRAME_GLOBAL_RELATIVE_ALT: 3;
    MAV_FRAME_LOCAL_ENU: 4;
    MAV_FRAME_GLOBAL_INT: 5;
    MAV_FRAME_GLOBAL_RELATIVE_ALT_INT: 6;
    MAV_FRAME_LOCAL_OFFSET_NED: 7;
    MAV_FRAME_BODY_NED: 8;
    MAV_FRAME_BODY_OFFSET_NED: 9;
    MAV_FRAME_GLOBAL_TERRAIN_ALT: 10;
    MAV_FRAME_GLOBAL_TERRAIN_ALT_INT: 11;
    MAV_FRAME_BODY_FRD: 12;
    MAV_FRAME_RESERVED_13: 13;
    MAV_FRAME_RESERVED_14: 14;
    MAV_FRAME_RESERVED_15: 15;
    MAV_FRAME_RESERVED_16: 16;
    MAV_FRAME_RESERVED_17: 17;
    MAV_FRAME_RESERVED_18: 18;
    MAV_FRAME_RESERVED_19: 19;
    MAV_FRAME_LOCAL_FRD: 20;
    MAV_FRAME_LOCAL_FLU: 21;
    MAV_FRAME_ENUM_END: 22;
    MAVLINK_DATA_STREAM_IMG_JPEG: 0;
    MAVLINK_DATA_STREAM_IMG_BMP: 1;
    MAVLINK_DATA_STREAM_IMG_RAW8U: 2;
    MAVLINK_DATA_STREAM_IMG_RAW32U: 3;
    MAVLINK_DATA_STREAM_IMG_PGM: 4;
    MAVLINK_DATA_STREAM_IMG_PNG: 5;
    MAVLINK_DATA_STREAM_TYPE_ENUM_END: 6;
    FENCE_BREACH_NONE: 0;
    FENCE_BREACH_MINALT: 1;
    FENCE_BREACH_MAXALT: 2;
    FENCE_BREACH_BOUNDARY: 3;
    FENCE_BREACH_ENUM_END: 4;
    FENCE_MITIGATE_UNKNOWN: 0;
    FENCE_MITIGATE_NONE: 1;
    FENCE_MITIGATE_VEL_LIMIT: 2;
    FENCE_MITIGATE_ENUM_END: 3;
    FENCE_TYPE_ALT_MAX: 1;
    FENCE_TYPE_CIRCLE: 2;
    FENCE_TYPE_POLYGON: 4;
    FENCE_TYPE_ALT_MIN: 8;
    FENCE_TYPE_ENUM_END: 9;
    MAV_MOUNT_MODE_RETRACT: 0;
    MAV_MOUNT_MODE_NEUTRAL: 1;
    MAV_MOUNT_MODE_MAVLINK_TARGETING: 2;
    MAV_MOUNT_MODE_RC_TARGETING: 3;
    MAV_MOUNT_MODE_GPS_POINT: 4;
    MAV_MOUNT_MODE_SYSID_TARGET: 5;
    MAV_MOUNT_MODE_HOME_LOCATION: 6;
    MAV_MOUNT_MODE_ENUM_END: 7;
    GIMBAL_DEVICE_CAP_FLAGS_HAS_RETRACT: 1;
    GIMBAL_DEVICE_CAP_FLAGS_HAS_NEUTRAL: 2;
    GIMBAL_DEVICE_CAP_FLAGS_HAS_ROLL_AXIS: 4;
    GIMBAL_DEVICE_CAP_FLAGS_HAS_ROLL_FOLLOW: 8;
    GIMBAL_DEVICE_CAP_FLAGS_HAS_ROLL_LOCK: 16;
    GIMBAL_DEVICE_CAP_FLAGS_HAS_PITCH_AXIS: 32;
    GIMBAL_DEVICE_CAP_FLAGS_HAS_PITCH_FOLLOW: 64;
    GIMBAL_DEVICE_CAP_FLAGS_HAS_PITCH_LOCK: 128;
    GIMBAL_DEVICE_CAP_FLAGS_HAS_YAW_AXIS: 256;
    GIMBAL_DEVICE_CAP_FLAGS_HAS_YAW_FOLLOW: 512;
    GIMBAL_DEVICE_CAP_FLAGS_HAS_YAW_LOCK: 1024;
    GIMBAL_DEVICE_CAP_FLAGS_SUPPORTS_INFINITE_YAW: 2048;
    GIMBAL_DEVICE_CAP_FLAGS_SUPPORTS_YAW_IN_EARTH_FRAME: 4096;
    GIMBAL_DEVICE_CAP_FLAGS_HAS_RC_INPUTS: 8192;
    GIMBAL_DEVICE_CAP_FLAGS_ENUM_END: 8193;
    GIMBAL_MANAGER_CAP_FLAGS_HAS_RETRACT: 1;
    GIMBAL_MANAGER_CAP_FLAGS_HAS_NEUTRAL: 2;
    GIMBAL_MANAGER_CAP_FLAGS_HAS_ROLL_AXIS: 4;
    GIMBAL_MANAGER_CAP_FLAGS_HAS_ROLL_FOLLOW: 8;
    GIMBAL_MANAGER_CAP_FLAGS_HAS_ROLL_LOCK: 16;
    GIMBAL_MANAGER_CAP_FLAGS_HAS_PITCH_AXIS: 32;
    GIMBAL_MANAGER_CAP_FLAGS_HAS_PITCH_FOLLOW: 64;
    GIMBAL_MANAGER_CAP_FLAGS_HAS_PITCH_LOCK: 128;
    GIMBAL_MANAGER_CAP_FLAGS_HAS_YAW_AXIS: 256;
    GIMBAL_MANAGER_CAP_FLAGS_HAS_YAW_FOLLOW: 512;
    GIMBAL_MANAGER_CAP_FLAGS_HAS_YAW_LOCK: 1024;
    GIMBAL_MANAGER_CAP_FLAGS_SUPPORTS_INFINITE_YAW: 2048;
    GIMBAL_MANAGER_CAP_FLAGS_SUPPORTS_YAW_IN_EARTH_FRAME: 4096;
    GIMBAL_MANAGER_CAP_FLAGS_HAS_RC_INPUTS: 8192;
    GIMBAL_MANAGER_CAP_FLAGS_CAN_POINT_LOCATION_LOCAL: 65536;
    GIMBAL_MANAGER_CAP_FLAGS_CAN_POINT_LOCATION_GLOBAL: 131072;
    GIMBAL_MANAGER_CAP_FLAGS_ENUM_END: 131073;
    GIMBAL_DEVICE_FLAGS_RETRACT: 1;
    GIMBAL_DEVICE_FLAGS_NEUTRAL: 2;
    GIMBAL_DEVICE_FLAGS_ROLL_LOCK: 4;
    GIMBAL_DEVICE_FLAGS_PITCH_LOCK: 8;
    GIMBAL_DEVICE_FLAGS_YAW_LOCK: 16;
    GIMBAL_DEVICE_FLAGS_YAW_IN_VEHICLE_FRAME: 32;
    GIMBAL_DEVICE_FLAGS_YAW_IN_EARTH_FRAME: 64;
    GIMBAL_DEVICE_FLAGS_ACCEPTS_YAW_IN_EARTH_FRAME: 128;
    GIMBAL_DEVICE_FLAGS_RC_EXCLUSIVE: 256;
    GIMBAL_DEVICE_FLAGS_RC_MIXED: 512;
    GIMBAL_DEVICE_FLAGS_ENUM_END: 513;
    GIMBAL_MANAGER_FLAGS_RETRACT: 1;
    GIMBAL_MANAGER_FLAGS_NEUTRAL: 2;
    GIMBAL_MANAGER_FLAGS_ROLL_LOCK: 4;
    GIMBAL_MANAGER_FLAGS_PITCH_LOCK: 8;
    GIMBAL_MANAGER_FLAGS_YAW_LOCK: 16;
    GIMBAL_MANAGER_FLAGS_YAW_IN_VEHICLE_FRAME: 32;
    GIMBAL_MANAGER_FLAGS_YAW_IN_EARTH_FRAME: 64;
    GIMBAL_MANAGER_FLAGS_ACCEPTS_YAW_IN_EARTH_FRAME: 128;
    GIMBAL_MANAGER_FLAGS_RC_EXCLUSIVE: 256;
    GIMBAL_MANAGER_FLAGS_RC_MIXED: 512;
    GIMBAL_MANAGER_FLAGS_ENUM_END: 513;
    GIMBAL_DEVICE_ERROR_FLAGS_AT_ROLL_LIMIT: 1;
    GIMBAL_DEVICE_ERROR_FLAGS_AT_PITCH_LIMIT: 2;
    GIMBAL_DEVICE_ERROR_FLAGS_AT_YAW_LIMIT: 4;
    GIMBAL_DEVICE_ERROR_FLAGS_ENCODER_ERROR: 8;
    GIMBAL_DEVICE_ERROR_FLAGS_POWER_ERROR: 16;
    GIMBAL_DEVICE_ERROR_FLAGS_MOTOR_ERROR: 32;
    GIMBAL_DEVICE_ERROR_FLAGS_SOFTWARE_ERROR: 64;
    GIMBAL_DEVICE_ERROR_FLAGS_COMMS_ERROR: 128;
    GIMBAL_DEVICE_ERROR_FLAGS_CALIBRATION_RUNNING: 256;
    GIMBAL_DEVICE_ERROR_FLAGS_NO_MANAGER: 512;
    GIMBAL_DEVICE_ERROR_FLAGS_ENUM_END: 513;
    GRIPPER_ACTION_RELEASE: 0;
    GRIPPER_ACTION_GRAB: 1;
    GRIPPER_ACTIONS_ENUM_END: 2;
    WINCH_RELAXED: 0;
    WINCH_RELATIVE_LENGTH_CONTROL: 1;
    WINCH_RATE_CONTROL: 2;
    WINCH_LOCK: 3;
    WINCH_DELIVER: 4;
    WINCH_HOLD: 5;
    WINCH_RETRACT: 6;
    WINCH_LOAD_LINE: 7;
    WINCH_ABANDON_LINE: 8;
    WINCH_ACTIONS_ENUM_END: 9;
    UAVCAN_NODE_HEALTH_OK: 0;
    UAVCAN_NODE_HEALTH_WARNING: 1;
    UAVCAN_NODE_HEALTH_ERROR: 2;
    UAVCAN_NODE_HEALTH_CRITICAL: 3;
    UAVCAN_NODE_HEALTH_ENUM_END: 4;
    UAVCAN_NODE_MODE_OPERATIONAL: 0;
    UAVCAN_NODE_MODE_INITIALIZATION: 1;
    UAVCAN_NODE_MODE_MAINTENANCE: 2;
    UAVCAN_NODE_MODE_SOFTWARE_UPDATE: 3;
    UAVCAN_NODE_MODE_OFFLINE: 7;
    UAVCAN_NODE_MODE_ENUM_END: 8;
    STORAGE_STATUS_EMPTY: 0;
    STORAGE_STATUS_UNFORMATTED: 1;
    STORAGE_STATUS_READY: 2;
    STORAGE_STATUS_NOT_SUPPORTED: 3;
    STORAGE_STATUS_ENUM_END: 4;
    STORAGE_TYPE_UNKNOWN: 0;
    STORAGE_TYPE_USB_STICK: 1;
    STORAGE_TYPE_SD: 2;
    STORAGE_TYPE_MICROSD: 3;
    STORAGE_TYPE_CF: 4;
    STORAGE_TYPE_CFE: 5;
    STORAGE_TYPE_XQD: 6;
    STORAGE_TYPE_HD: 7;
    STORAGE_TYPE_OTHER: 254;
    STORAGE_TYPE_ENUM_END: 255;
    STORAGE_USAGE_FLAG_SET: 1;
    STORAGE_USAGE_FLAG_PHOTO: 2;
    STORAGE_USAGE_FLAG_VIDEO: 4;
    STORAGE_USAGE_FLAG_LOGS: 8;
    STORAGE_USAGE_FLAG_ENUM_END: 9;
    AUTOTUNE_AXIS_ROLL: 1;
    AUTOTUNE_AXIS_PITCH: 2;
    AUTOTUNE_AXIS_YAW: 4;
    AUTOTUNE_AXIS_ENUM_END: 5;
    MAV_DATA_STREAM_ALL: 0;
    MAV_DATA_STREAM_RAW_SENSORS: 1;
    MAV_DATA_STREAM_EXTENDED_STATUS: 2;
    MAV_DATA_STREAM_RC_CHANNELS: 3;
    MAV_DATA_STREAM_RAW_CONTROLLER: 4;
    MAV_DATA_STREAM_POSITION: 6;
    MAV_DATA_STREAM_EXTRA1: 10;
    MAV_DATA_STREAM_EXTRA2: 11;
    MAV_DATA_STREAM_EXTRA3: 12;
    MAV_DATA_STREAM_ENUM_END: 13;
    MAV_ROI_NONE: 0;
    MAV_ROI_WPNEXT: 1;
    MAV_ROI_WPINDEX: 2;
    MAV_ROI_LOCATION: 3;
    MAV_ROI_TARGET: 4;
    MAV_ROI_ENUM_END: 5;
    MAV_PARAM_TYPE_UINT8: 1;
    MAV_PARAM_TYPE_INT8: 2;
    MAV_PARAM_TYPE_UINT16: 3;
    MAV_PARAM_TYPE_INT16: 4;
    MAV_PARAM_TYPE_UINT32: 5;
    MAV_PARAM_TYPE_INT32: 6;
    MAV_PARAM_TYPE_UINT64: 7;
    MAV_PARAM_TYPE_INT64: 8;
    MAV_PARAM_TYPE_REAL32: 9;
    MAV_PARAM_TYPE_REAL64: 10;
    MAV_PARAM_TYPE_ENUM_END: 11;
    MAV_PARAM_EXT_TYPE_UINT8: 1;
    MAV_PARAM_EXT_TYPE_INT8: 2;
    MAV_PARAM_EXT_TYPE_UINT16: 3;
    MAV_PARAM_EXT_TYPE_INT16: 4;
    MAV_PARAM_EXT_TYPE_UINT32: 5;
    MAV_PARAM_EXT_TYPE_INT32: 6;
    MAV_PARAM_EXT_TYPE_UINT64: 7;
    MAV_PARAM_EXT_TYPE_INT64: 8;
    MAV_PARAM_EXT_TYPE_REAL32: 9;
    MAV_PARAM_EXT_TYPE_REAL64: 10;
    MAV_PARAM_EXT_TYPE_CUSTOM: 11;
    MAV_PARAM_EXT_TYPE_ENUM_END: 12;
    MAV_RESULT_ACCEPTED: 0;
    MAV_RESULT_TEMPORARILY_REJECTED: 1;
    MAV_RESULT_DENIED: 2;
    MAV_RESULT_UNSUPPORTED: 3;
    MAV_RESULT_FAILED: 4;
    MAV_RESULT_IN_PROGRESS: 5;
    MAV_RESULT_COMMAND_LONG_ONLY: 7;
    MAV_RESULT_COMMAND_INT_ONLY: 8;
    MAV_RESULT_ENUM_END: 9;
    MAV_MISSION_ACCEPTED: 0;
    MAV_MISSION_ERROR: 1;
    MAV_MISSION_UNSUPPORTED_FRAME: 2;
    MAV_MISSION_UNSUPPORTED: 3;
    MAV_MISSION_NO_SPACE: 4;
    MAV_MISSION_INVALID: 5;
    MAV_MISSION_INVALID_PARAM1: 6;
    MAV_MISSION_INVALID_PARAM2: 7;
    MAV_MISSION_INVALID_PARAM3: 8;
    MAV_MISSION_INVALID_PARAM4: 9;
    MAV_MISSION_INVALID_PARAM5_X: 10;
    MAV_MISSION_INVALID_PARAM6_Y: 11;
    MAV_MISSION_INVALID_PARAM7: 12;
    MAV_MISSION_INVALID_SEQUENCE: 13;
    MAV_MISSION_DENIED: 14;
    MAV_MISSION_OPERATION_CANCELLED: 15;
    MAV_MISSION_RESULT_ENUM_END: 16;
    MAV_SEVERITY_EMERGENCY: 0;
    MAV_SEVERITY_ALERT: 1;
    MAV_SEVERITY_CRITICAL: 2;
    MAV_SEVERITY_ERROR: 3;
    MAV_SEVERITY_WARNING: 4;
    MAV_SEVERITY_NOTICE: 5;
    MAV_SEVERITY_INFO: 6;
    MAV_SEVERITY_DEBUG: 7;
    MAV_SEVERITY_ENUM_END: 8;
    MAV_POWER_STATUS_BRICK_VALID: 1;
    MAV_POWER_STATUS_SERVO_VALID: 2;
    MAV_POWER_STATUS_USB_CONNECTED: 4;
    MAV_POWER_STATUS_PERIPH_OVERCURRENT: 8;
    MAV_POWER_STATUS_PERIPH_HIPOWER_OVERCURRENT: 16;
    MAV_POWER_STATUS_CHANGED: 32;
    MAV_POWER_STATUS_ENUM_END: 33;
    SERIAL_CONTROL_DEV_TELEM1: 0;
    SERIAL_CONTROL_DEV_TELEM2: 1;
    SERIAL_CONTROL_DEV_GPS1: 2;
    SERIAL_CONTROL_DEV_GPS2: 3;
    SERIAL_CONTROL_DEV_SHELL: 10;
    SERIAL_CONTROL_SERIAL0: 100;
    SERIAL_CONTROL_SERIAL1: 101;
    SERIAL_CONTROL_SERIAL2: 102;
    SERIAL_CONTROL_SERIAL3: 103;
    SERIAL_CONTROL_SERIAL4: 104;
    SERIAL_CONTROL_SERIAL5: 105;
    SERIAL_CONTROL_SERIAL6: 106;
    SERIAL_CONTROL_SERIAL7: 107;
    SERIAL_CONTROL_SERIAL8: 108;
    SERIAL_CONTROL_SERIAL9: 109;
    SERIAL_CONTROL_DEV_ENUM_END: 110;
    SERIAL_CONTROL_FLAG_REPLY: 1;
    SERIAL_CONTROL_FLAG_RESPOND: 2;
    SERIAL_CONTROL_FLAG_EXCLUSIVE: 4;
    SERIAL_CONTROL_FLAG_BLOCKING: 8;
    SERIAL_CONTROL_FLAG_MULTI: 16;
    SERIAL_CONTROL_FLAG_ENUM_END: 17;
    MAV_DISTANCE_SENSOR_LASER: 0;
    MAV_DISTANCE_SENSOR_ULTRASOUND: 1;
    MAV_DISTANCE_SENSOR_INFRARED: 2;
    MAV_DISTANCE_SENSOR_RADAR: 3;
    MAV_DISTANCE_SENSOR_UNKNOWN: 4;
    MAV_DISTANCE_SENSOR_ENUM_END: 5;
    MAV_SENSOR_ROTATION_NONE: 0;
    MAV_SENSOR_ROTATION_YAW_45: 1;
    MAV_SENSOR_ROTATION_YAW_90: 2;
    MAV_SENSOR_ROTATION_YAW_135: 3;
    MAV_SENSOR_ROTATION_YAW_180: 4;
    MAV_SENSOR_ROTATION_YAW_225: 5;
    MAV_SENSOR_ROTATION_YAW_270: 6;
    MAV_SENSOR_ROTATION_YAW_315: 7;
    MAV_SENSOR_ROTATION_ROLL_180: 8;
    MAV_SENSOR_ROTATION_ROLL_180_YAW_45: 9;
    MAV_SENSOR_ROTATION_ROLL_180_YAW_90: 10;
    MAV_SENSOR_ROTATION_ROLL_180_YAW_135: 11;
    MAV_SENSOR_ROTATION_PITCH_180: 12;
    MAV_SENSOR_ROTATION_ROLL_180_YAW_225: 13;
    MAV_SENSOR_ROTATION_ROLL_180_YAW_270: 14;
    MAV_SENSOR_ROTATION_ROLL_180_YAW_315: 15;
    MAV_SENSOR_ROTATION_ROLL_90: 16;
    MAV_SENSOR_ROTATION_ROLL_90_YAW_45: 17;
    MAV_SENSOR_ROTATION_ROLL_90_YAW_90: 18;
    MAV_SENSOR_ROTATION_ROLL_90_YAW_135: 19;
    MAV_SENSOR_ROTATION_ROLL_270: 20;
    MAV_SENSOR_ROTATION_ROLL_270_YAW_45: 21;
    MAV_SENSOR_ROTATION_ROLL_270_YAW_90: 22;
    MAV_SENSOR_ROTATION_ROLL_270_YAW_135: 23;
    MAV_SENSOR_ROTATION_PITCH_90: 24;
    MAV_SENSOR_ROTATION_PITCH_270: 25;
    MAV_SENSOR_ROTATION_PITCH_180_YAW_90: 26;
    MAV_SENSOR_ROTATION_PITCH_180_YAW_270: 27;
    MAV_SENSOR_ROTATION_ROLL_90_PITCH_90: 28;
    MAV_SENSOR_ROTATION_ROLL_180_PITCH_90: 29;
    MAV_SENSOR_ROTATION_ROLL_270_PITCH_90: 30;
    MAV_SENSOR_ROTATION_ROLL_90_PITCH_180: 31;
    MAV_SENSOR_ROTATION_ROLL_270_PITCH_180: 32;
    MAV_SENSOR_ROTATION_ROLL_90_PITCH_270: 33;
    MAV_SENSOR_ROTATION_ROLL_180_PITCH_270: 34;
    MAV_SENSOR_ROTATION_ROLL_270_PITCH_270: 35;
    MAV_SENSOR_ROTATION_ROLL_90_PITCH_180_YAW_90: 36;
    MAV_SENSOR_ROTATION_ROLL_90_YAW_270: 37;
    MAV_SENSOR_ROTATION_ROLL_90_PITCH_68_YAW_293: 38;
    MAV_SENSOR_ROTATION_PITCH_315: 39;
    MAV_SENSOR_ROTATION_ROLL_90_PITCH_315: 40;
    MAV_SENSOR_ROTATION_CUSTOM: 100;
    MAV_SENSOR_ORIENTATION_ENUM_END: 101;
    MAV_PROTOCOL_CAPABILITY_MISSION_FLOAT: 1;
    MAV_PROTOCOL_CAPABILITY_PARAM_FLOAT: 2;
    MAV_PROTOCOL_CAPABILITY_MISSION_INT: 4;
    MAV_PROTOCOL_CAPABILITY_COMMAND_INT: 8;
    MAV_PROTOCOL_CAPABILITY_PARAM_UNION: 16;
    MAV_PROTOCOL_CAPABILITY_FTP: 32;
    MAV_PROTOCOL_CAPABILITY_SET_ATTITUDE_TARGET: 64;
    MAV_PROTOCOL_CAPABILITY_SET_POSITION_TARGET_LOCAL_NED: 128;
    MAV_PROTOCOL_CAPABILITY_SET_POSITION_TARGET_GLOBAL_INT: 256;
    MAV_PROTOCOL_CAPABILITY_TERRAIN: 512;
    MAV_PROTOCOL_CAPABILITY_SET_ACTUATOR_TARGET: 1024;
    MAV_PROTOCOL_CAPABILITY_FLIGHT_TERMINATION: 2048;
    MAV_PROTOCOL_CAPABILITY_COMPASS_CALIBRATION: 4096;
    MAV_PROTOCOL_CAPABILITY_MAVLINK2: 8192;
    MAV_PROTOCOL_CAPABILITY_MISSION_FENCE: 16384;
    MAV_PROTOCOL_CAPABILITY_MISSION_RALLY: 32768;
    MAV_PROTOCOL_CAPABILITY_FLIGHT_INFORMATION: 65536;
    MAV_PROTOCOL_CAPABILITY_ENUM_END: 65537;
    MAV_MISSION_TYPE_MISSION: 0;
    MAV_MISSION_TYPE_FENCE: 1;
    MAV_MISSION_TYPE_RALLY: 2;
    MAV_MISSION_TYPE_ALL: 255;
    MAV_MISSION_TYPE_ENUM_END: 256;
    MAV_ESTIMATOR_TYPE_UNKNOWN: 0;
    MAV_ESTIMATOR_TYPE_NAIVE: 1;
    MAV_ESTIMATOR_TYPE_VISION: 2;
    MAV_ESTIMATOR_TYPE_VIO: 3;
    MAV_ESTIMATOR_TYPE_GPS: 4;
    MAV_ESTIMATOR_TYPE_GPS_INS: 5;
    MAV_ESTIMATOR_TYPE_MOCAP: 6;
    MAV_ESTIMATOR_TYPE_LIDAR: 7;
    MAV_ESTIMATOR_TYPE_AUTOPILOT: 8;
    MAV_ESTIMATOR_TYPE_ENUM_END: 9;
    MAV_BATTERY_TYPE_UNKNOWN: 0;
    MAV_BATTERY_TYPE_LIPO: 1;
    MAV_BATTERY_TYPE_LIFE: 2;
    MAV_BATTERY_TYPE_LION: 3;
    MAV_BATTERY_TYPE_NIMH: 4;
    MAV_BATTERY_TYPE_ENUM_END: 5;
    MAV_BATTERY_FUNCTION_UNKNOWN: 0;
    MAV_BATTERY_FUNCTION_ALL: 1;
    MAV_BATTERY_FUNCTION_PROPULSION: 2;
    MAV_BATTERY_FUNCTION_AVIONICS: 3;
    MAV_BATTERY_TYPE_PAYLOAD: 4;
    MAV_BATTERY_FUNCTION_ENUM_END: 5;
    MAV_BATTERY_CHARGE_STATE_UNDEFINED: 0;
    MAV_BATTERY_CHARGE_STATE_OK: 1;
    MAV_BATTERY_CHARGE_STATE_LOW: 2;
    MAV_BATTERY_CHARGE_STATE_CRITICAL: 3;
    MAV_BATTERY_CHARGE_STATE_EMERGENCY: 4;
    MAV_BATTERY_CHARGE_STATE_FAILED: 5;
    MAV_BATTERY_CHARGE_STATE_UNHEALTHY: 6;
    MAV_BATTERY_CHARGE_STATE_CHARGING: 7;
    MAV_BATTERY_CHARGE_STATE_ENUM_END: 8;
    MAV_BATTERY_MODE_UNKNOWN: 0;
    MAV_BATTERY_MODE_AUTO_DISCHARGING: 1;
    MAV_BATTERY_MODE_HOT_SWAP: 2;
    MAV_BATTERY_MODE_ENUM_END: 3;
    MAV_BATTERY_FAULT_DEEP_DISCHARGE: 1;
    MAV_BATTERY_FAULT_SPIKES: 2;
    MAV_BATTERY_FAULT_CELL_FAIL: 4;
    MAV_BATTERY_FAULT_OVER_CURRENT: 8;
    MAV_BATTERY_FAULT_OVER_TEMPERATURE: 16;
    MAV_BATTERY_FAULT_UNDER_TEMPERATURE: 32;
    MAV_BATTERY_FAULT_INCOMPATIBLE_VOLTAGE: 64;
    MAV_BATTERY_FAULT_INCOMPATIBLE_FIRMWARE: 128;
    BATTERY_FAULT_INCOMPATIBLE_CELLS_CONFIGURATION: 256;
    MAV_BATTERY_FAULT_ENUM_END: 257;
    MAV_GENERATOR_STATUS_FLAG_OFF: 1;
    MAV_GENERATOR_STATUS_FLAG_READY: 2;
    MAV_GENERATOR_STATUS_FLAG_GENERATING: 4;
    MAV_GENERATOR_STATUS_FLAG_CHARGING: 8;
    MAV_GENERATOR_STATUS_FLAG_REDUCED_POWER: 16;
    MAV_GENERATOR_STATUS_FLAG_MAXPOWER: 32;
    MAV_GENERATOR_STATUS_FLAG_OVERTEMP_WARNING: 64;
    MAV_GENERATOR_STATUS_FLAG_OVERTEMP_FAULT: 128;
    MAV_GENERATOR_STATUS_FLAG_ELECTRONICS_OVERTEMP_WARNING: 256;
    MAV_GENERATOR_STATUS_FLAG_ELECTRONICS_OVERTEMP_FAULT: 512;
    MAV_GENERATOR_STATUS_FLAG_ELECTRONICS_FAULT: 1024;
    MAV_GENERATOR_STATUS_FLAG_POWERSOURCE_FAULT: 2048;
    MAV_GENERATOR_STATUS_FLAG_COMMUNICATION_WARNING: 4096;
    MAV_GENERATOR_STATUS_FLAG_COOLING_WARNING: 8192;
    MAV_GENERATOR_STATUS_FLAG_POWER_RAIL_FAULT: 16384;
    MAV_GENERATOR_STATUS_FLAG_OVERCURRENT_FAULT: 32768;
    MAV_GENERATOR_STATUS_FLAG_BATTERY_OVERCHARGE_CURRENT_FAULT: 65536;
    MAV_GENERATOR_STATUS_FLAG_OVERVOLTAGE_FAULT: 131072;
    MAV_GENERATOR_STATUS_FLAG_BATTERY_UNDERVOLT_FAULT: 262144;
    MAV_GENERATOR_STATUS_FLAG_START_INHIBITED: 524288;
    MAV_GENERATOR_STATUS_FLAG_MAINTENANCE_REQUIRED: 1048576;
    MAV_GENERATOR_STATUS_FLAG_WARMING_UP: 2097152;
    MAV_GENERATOR_STATUS_FLAG_IDLE: 4194304;
    MAV_GENERATOR_STATUS_FLAG_ENUM_END: 4194305;
    MAV_VTOL_STATE_UNDEFINED: 0;
    MAV_VTOL_STATE_TRANSITION_TO_FW: 1;
    MAV_VTOL_STATE_TRANSITION_TO_MC: 2;
    MAV_VTOL_STATE_MC: 3;
    MAV_VTOL_STATE_FW: 4;
    MAV_VTOL_STATE_ENUM_END: 5;
    MAV_LANDED_STATE_UNDEFINED: 0;
    MAV_LANDED_STATE_ON_GROUND: 1;
    MAV_LANDED_STATE_IN_AIR: 2;
    MAV_LANDED_STATE_TAKEOFF: 3;
    MAV_LANDED_STATE_LANDING: 4;
    MAV_LANDED_STATE_ENUM_END: 5;
    ADSB_ALTITUDE_TYPE_PRESSURE_QNH: 0;
    ADSB_ALTITUDE_TYPE_GEOMETRIC: 1;
    ADSB_ALTITUDE_TYPE_ENUM_END: 2;
    ADSB_EMITTER_TYPE_NO_INFO: 0;
    ADSB_EMITTER_TYPE_LIGHT: 1;
    ADSB_EMITTER_TYPE_SMALL: 2;
    ADSB_EMITTER_TYPE_LARGE: 3;
    ADSB_EMITTER_TYPE_HIGH_VORTEX_LARGE: 4;
    ADSB_EMITTER_TYPE_HEAVY: 5;
    ADSB_EMITTER_TYPE_HIGHLY_MANUV: 6;
    ADSB_EMITTER_TYPE_ROTOCRAFT: 7;
    ADSB_EMITTER_TYPE_UNASSIGNED: 8;
    ADSB_EMITTER_TYPE_GLIDER: 9;
    ADSB_EMITTER_TYPE_LIGHTER_AIR: 10;
    ADSB_EMITTER_TYPE_PARACHUTE: 11;
    ADSB_EMITTER_TYPE_ULTRA_LIGHT: 12;
    ADSB_EMITTER_TYPE_UNASSIGNED2: 13;
    ADSB_EMITTER_TYPE_UAV: 14;
    ADSB_EMITTER_TYPE_SPACE: 15;
    ADSB_EMITTER_TYPE_UNASSGINED3: 16;
    ADSB_EMITTER_TYPE_EMERGENCY_SURFACE: 17;
    ADSB_EMITTER_TYPE_SERVICE_SURFACE: 18;
    ADSB_EMITTER_TYPE_POINT_OBSTACLE: 19;
    ADSB_EMITTER_TYPE_ENUM_END: 20;
    ADSB_FLAGS_VALID_COORDS: 1;
    ADSB_FLAGS_VALID_ALTITUDE: 2;
    ADSB_FLAGS_VALID_HEADING: 4;
    ADSB_FLAGS_VALID_VELOCITY: 8;
    ADSB_FLAGS_VALID_CALLSIGN: 16;
    ADSB_FLAGS_VALID_SQUAWK: 32;
    ADSB_FLAGS_SIMULATED: 64;
    ADSB_FLAGS_VERTICAL_VELOCITY_VALID: 128;
    ADSB_FLAGS_BARO_VALID: 256;
    ADSB_FLAGS_SOURCE_UAT: 32768;
    ADSB_FLAGS_ENUM_END: 32769;
    MAV_DO_REPOSITION_FLAGS_CHANGE_MODE: 1;
    MAV_DO_REPOSITION_FLAGS_RELATIVE_YAW: 2;
    MAV_DO_REPOSITION_FLAGS_VTOL_HOVER: 4;
    MAV_DO_REPOSITION_FLAGS_FW_LOITER: 8;
    MAV_DO_REPOSITION_FLAGS_ENUM_END: 9;
    SPEED_TYPE_AIRSPEED: 0;
    SPEED_TYPE_GROUNDSPEED: 1;
    SPEED_TYPE_CLIMB_SPEED: 2;
    SPEED_TYPE_DESCENT_SPEED: 3;
    SPEED_TYPE_ENUM_END: 4;
    ESTIMATOR_ATTITUDE: 1;
    ESTIMATOR_VELOCITY_HORIZ: 2;
    ESTIMATOR_VELOCITY_VERT: 4;
    ESTIMATOR_POS_HORIZ_REL: 8;
    ESTIMATOR_POS_HORIZ_ABS: 16;
    ESTIMATOR_POS_VERT_ABS: 32;
    ESTIMATOR_POS_VERT_AGL: 64;
    ESTIMATOR_CONST_POS_MODE: 128;
    ESTIMATOR_PRED_POS_HORIZ_REL: 256;
    ESTIMATOR_PRED_POS_HORIZ_ABS: 512;
    ESTIMATOR_GPS_GLITCH: 1024;
    ESTIMATOR_ACCEL_ERROR: 2048;
    ESTIMATOR_STATUS_FLAGS_ENUM_END: 2049;
    MOTOR_TEST_ORDER_DEFAULT: 0;
    MOTOR_TEST_ORDER_SEQUENCE: 1;
    MOTOR_TEST_ORDER_BOARD: 2;
    MOTOR_TEST_ORDER_ENUM_END: 3;
    MOTOR_TEST_THROTTLE_PERCENT: 0;
    MOTOR_TEST_THROTTLE_PWM: 1;
    MOTOR_TEST_THROTTLE_PILOT: 2;
    MOTOR_TEST_COMPASS_CAL: 3;
    MOTOR_TEST_THROTTLE_TYPE_ENUM_END: 4;
    GPS_INPUT_IGNORE_FLAG_ALT: 1;
    GPS_INPUT_IGNORE_FLAG_HDOP: 2;
    GPS_INPUT_IGNORE_FLAG_VDOP: 4;
    GPS_INPUT_IGNORE_FLAG_VEL_HORIZ: 8;
    GPS_INPUT_IGNORE_FLAG_VEL_VERT: 16;
    GPS_INPUT_IGNORE_FLAG_SPEED_ACCURACY: 32;
    GPS_INPUT_IGNORE_FLAG_HORIZONTAL_ACCURACY: 64;
    GPS_INPUT_IGNORE_FLAG_VERTICAL_ACCURACY: 128;
    GPS_INPUT_IGNORE_FLAGS_ENUM_END: 129;
    MAV_COLLISION_ACTION_NONE: 0;
    MAV_COLLISION_ACTION_REPORT: 1;
    MAV_COLLISION_ACTION_ASCEND_OR_DESCEND: 2;
    MAV_COLLISION_ACTION_MOVE_HORIZONTALLY: 3;
    MAV_COLLISION_ACTION_MOVE_PERPENDICULAR: 4;
    MAV_COLLISION_ACTION_RTL: 5;
    MAV_COLLISION_ACTION_HOVER: 6;
    MAV_COLLISION_ACTION_ENUM_END: 7;
    MAV_COLLISION_THREAT_LEVEL_NONE: 0;
    MAV_COLLISION_THREAT_LEVEL_LOW: 1;
    MAV_COLLISION_THREAT_LEVEL_HIGH: 2;
    MAV_COLLISION_THREAT_LEVEL_ENUM_END: 3;
    MAV_COLLISION_SRC_ADSB: 0;
    MAV_COLLISION_SRC_MAVLINK_GPS_GLOBAL_INT: 1;
    MAV_COLLISION_SRC_ENUM_END: 2;
    GPS_FIX_TYPE_NO_GPS: 0;
    GPS_FIX_TYPE_NO_FIX: 1;
    GPS_FIX_TYPE_2D_FIX: 2;
    GPS_FIX_TYPE_3D_FIX: 3;
    GPS_FIX_TYPE_DGPS: 4;
    GPS_FIX_TYPE_RTK_FLOAT: 5;
    GPS_FIX_TYPE_RTK_FIXED: 6;
    GPS_FIX_TYPE_STATIC: 7;
    GPS_FIX_TYPE_PPP: 8;
    GPS_FIX_TYPE_ENUM_END: 9;
    RTK_BASELINE_COORDINATE_SYSTEM_ECEF: 0;
    RTK_BASELINE_COORDINATE_SYSTEM_NED: 1;
    RTK_BASELINE_COORDINATE_SYSTEM_ENUM_END: 2;
    LANDING_TARGET_TYPE_LIGHT_BEACON: 0;
    LANDING_TARGET_TYPE_RADIO_BEACON: 1;
    LANDING_TARGET_TYPE_VISION_FIDUCIAL: 2;
    LANDING_TARGET_TYPE_VISION_OTHER: 3;
    LANDING_TARGET_TYPE_ENUM_END: 4;
    VTOL_TRANSITION_HEADING_VEHICLE_DEFAULT: 0;
    VTOL_TRANSITION_HEADING_NEXT_WAYPOINT: 1;
    VTOL_TRANSITION_HEADING_TAKEOFF: 2;
    VTOL_TRANSITION_HEADING_SPECIFIED: 3;
    VTOL_TRANSITION_HEADING_ANY: 4;
    VTOL_TRANSITION_HEADING_ENUM_END: 5;
    CAMERA_CAP_FLAGS_CAPTURE_VIDEO: 1;
    CAMERA_CAP_FLAGS_CAPTURE_IMAGE: 2;
    CAMERA_CAP_FLAGS_HAS_MODES: 4;
    CAMERA_CAP_FLAGS_CAN_CAPTURE_IMAGE_IN_VIDEO_MODE: 8;
    CAMERA_CAP_FLAGS_CAN_CAPTURE_VIDEO_IN_IMAGE_MODE: 16;
    CAMERA_CAP_FLAGS_HAS_IMAGE_SURVEY_MODE: 32;
    CAMERA_CAP_FLAGS_HAS_BASIC_ZOOM: 64;
    CAMERA_CAP_FLAGS_HAS_BASIC_FOCUS: 128;
    CAMERA_CAP_FLAGS_HAS_VIDEO_STREAM: 256;
    CAMERA_CAP_FLAGS_HAS_TRACKING_POINT: 512;
    CAMERA_CAP_FLAGS_HAS_TRACKING_RECTANGLE: 1024;
    CAMERA_CAP_FLAGS_HAS_TRACKING_GEO_STATUS: 2048;
    CAMERA_CAP_FLAGS_HAS_THERMAL_RANGE: 4096;
    CAMERA_CAP_FLAGS_ENUM_END: 4097;
    VIDEO_STREAM_STATUS_FLAGS_RUNNING: 1;
    VIDEO_STREAM_STATUS_FLAGS_THERMAL: 2;
    VIDEO_STREAM_STATUS_FLAGS_THERMAL_RANGE_ENABLED: 4;
    VIDEO_STREAM_STATUS_FLAGS_ENUM_END: 5;
    VIDEO_STREAM_TYPE_RTSP: 0;
    VIDEO_STREAM_TYPE_RTPUDP: 1;
    VIDEO_STREAM_TYPE_TCP_MPEG: 2;
    VIDEO_STREAM_TYPE_MPEG_TS: 3;
    VIDEO_STREAM_TYPE_ENUM_END: 4;
    VIDEO_STREAM_ENCODING_UNKNOWN: 0;
    VIDEO_STREAM_ENCODING_H264: 1;
    VIDEO_STREAM_ENCODING_H265: 2;
    VIDEO_STREAM_ENCODING_ENUM_END: 3;
    CAMERA_TRACKING_STATUS_FLAGS_IDLE: 0;
    CAMERA_TRACKING_STATUS_FLAGS_ACTIVE: 1;
    CAMERA_TRACKING_STATUS_FLAGS_ERROR: 2;
    CAMERA_TRACKING_STATUS_FLAGS_ENUM_END: 3;
    CAMERA_TRACKING_MODE_NONE: 0;
    CAMERA_TRACKING_MODE_POINT: 1;
    CAMERA_TRACKING_MODE_RECTANGLE: 2;
    CAMERA_TRACKING_MODE_ENUM_END: 3;
    CAMERA_TRACKING_TARGET_DATA_EMBEDDED: 1;
    CAMERA_TRACKING_TARGET_DATA_RENDERED: 2;
    CAMERA_TRACKING_TARGET_DATA_IN_STATUS: 4;
    CAMERA_TRACKING_TARGET_DATA_ENUM_END: 5;
    ZOOM_TYPE_STEP: 0;
    ZOOM_TYPE_CONTINUOUS: 1;
    ZOOM_TYPE_RANGE: 2;
    ZOOM_TYPE_FOCAL_LENGTH: 3;
    CAMERA_ZOOM_TYPE_ENUM_END: 4;
    FOCUS_TYPE_STEP: 0;
    FOCUS_TYPE_CONTINUOUS: 1;
    FOCUS_TYPE_RANGE: 2;
    FOCUS_TYPE_METERS: 3;
    FOCUS_TYPE_AUTO: 4;
    FOCUS_TYPE_AUTO_SINGLE: 5;
    FOCUS_TYPE_AUTO_CONTINUOUS: 6;
    SET_FOCUS_TYPE_ENUM_END: 7;
    CAMERA_SOURCE_DEFAULT: 0;
    CAMERA_SOURCE_RGB: 1;
    CAMERA_SOURCE_IR: 2;
    CAMERA_SOURCE_NDVI: 3;
    CAMERA_SOURCE_ENUM_END: 4;
    PARAM_ACK_ACCEPTED: 0;
    PARAM_ACK_VALUE_UNSUPPORTED: 1;
    PARAM_ACK_FAILED: 2;
    PARAM_ACK_IN_PROGRESS: 3;
    PARAM_ACK_ENUM_END: 4;
    CAMERA_MODE_IMAGE: 0;
    CAMERA_MODE_VIDEO: 1;
    CAMERA_MODE_IMAGE_SURVEY: 2;
    CAMERA_MODE_ENUM_END: 3;
    MAV_ARM_AUTH_DENIED_REASON_GENERIC: 0;
    MAV_ARM_AUTH_DENIED_REASON_NONE: 1;
    MAV_ARM_AUTH_DENIED_REASON_INVALID_WAYPOINT: 2;
    MAV_ARM_AUTH_DENIED_REASON_TIMEOUT: 3;
    MAV_ARM_AUTH_DENIED_REASON_AIRSPACE_IN_USE: 4;
    MAV_ARM_AUTH_DENIED_REASON_BAD_WEATHER: 5;
    MAV_ARM_AUTH_DENIED_REASON_ENUM_END: 6;
    RC_TYPE_SPEKTRUM_DSM2: 0;
    RC_TYPE_SPEKTRUM_DSMX: 1;
    RC_TYPE_ENUM_END: 2;
    ENGINE_CONTROL_OPTIONS_ALLOW_START_WHILE_DISARMED: 1;
    ENGINE_CONTROL_OPTIONS_ENUM_END: 2;
    POSITION_TARGET_TYPEMASK_X_IGNORE: 1;
    POSITION_TARGET_TYPEMASK_Y_IGNORE: 2;
    POSITION_TARGET_TYPEMASK_Z_IGNORE: 4;
    POSITION_TARGET_TYPEMASK_VX_IGNORE: 8;
    POSITION_TARGET_TYPEMASK_VY_IGNORE: 16;
    POSITION_TARGET_TYPEMASK_VZ_IGNORE: 32;
    POSITION_TARGET_TYPEMASK_AX_IGNORE: 64;
    POSITION_TARGET_TYPEMASK_AY_IGNORE: 128;
    POSITION_TARGET_TYPEMASK_AZ_IGNORE: 256;
    POSITION_TARGET_TYPEMASK_FORCE_SET: 512;
    POSITION_TARGET_TYPEMASK_YAW_IGNORE: 1024;
    POSITION_TARGET_TYPEMASK_YAW_RATE_IGNORE: 2048;
    POSITION_TARGET_TYPEMASK_ENUM_END: 2049;
    ATTITUDE_TARGET_TYPEMASK_BODY_ROLL_RATE_IGNORE: 1;
    ATTITUDE_TARGET_TYPEMASK_BODY_PITCH_RATE_IGNORE: 2;
    ATTITUDE_TARGET_TYPEMASK_BODY_YAW_RATE_IGNORE: 4;
    ATTITUDE_TARGET_TYPEMASK_THROTTLE_IGNORE: 64;
    ATTITUDE_TARGET_TYPEMASK_ATTITUDE_IGNORE: 128;
    ATTITUDE_TARGET_TYPEMASK_ENUM_END: 129;
    UTM_FLIGHT_STATE_UNKNOWN: 1;
    UTM_FLIGHT_STATE_GROUND: 2;
    UTM_FLIGHT_STATE_AIRBORNE: 3;
    UTM_FLIGHT_STATE_EMERGENCY: 16;
    UTM_FLIGHT_STATE_NOCTRL: 32;
    UTM_FLIGHT_STATE_ENUM_END: 33;
    UTM_DATA_AVAIL_FLAGS_TIME_VALID: 1;
    UTM_DATA_AVAIL_FLAGS_UAS_ID_AVAILABLE: 2;
    UTM_DATA_AVAIL_FLAGS_POSITION_AVAILABLE: 4;
    UTM_DATA_AVAIL_FLAGS_ALTITUDE_AVAILABLE: 8;
    UTM_DATA_AVAIL_FLAGS_RELATIVE_ALTITUDE_AVAILABLE: 16;
    UTM_DATA_AVAIL_FLAGS_HORIZONTAL_VELO_AVAILABLE: 32;
    UTM_DATA_AVAIL_FLAGS_VERTICAL_VELO_AVAILABLE: 64;
    UTM_DATA_AVAIL_FLAGS_NEXT_WAYPOINT_AVAILABLE: 128;
    UTM_DATA_AVAIL_FLAGS_ENUM_END: 129;
    PRECISION_LAND_MODE_DISABLED: 0;
    PRECISION_LAND_MODE_OPPORTUNISTIC: 1;
    PRECISION_LAND_MODE_REQUIRED: 2;
    PRECISION_LAND_MODE_ENUM_END: 3;
    PARACHUTE_DISABLE: 0;
    PARACHUTE_ENABLE: 1;
    PARACHUTE_RELEASE: 2;
    PARACHUTE_ACTION_ENUM_END: 3;
    MAV_TUNNEL_PAYLOAD_TYPE_UNKNOWN: 0;
    MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED0: 200;
    MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED1: 201;
    MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED2: 202;
    MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED3: 203;
    MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED4: 204;
    MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED5: 205;
    MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED6: 206;
    MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED7: 207;
    MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED8: 208;
    MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED9: 209;
    MAV_TUNNEL_PAYLOAD_TYPE_ENUM_END: 210;
    MAV_ODID_ID_TYPE_NONE: 0;
    MAV_ODID_ID_TYPE_SERIAL_NUMBER: 1;
    MAV_ODID_ID_TYPE_CAA_REGISTRATION_ID: 2;
    MAV_ODID_ID_TYPE_UTM_ASSIGNED_UUID: 3;
    MAV_ODID_ID_TYPE_SPECIFIC_SESSION_ID: 4;
    MAV_ODID_ID_TYPE_ENUM_END: 5;
    MAV_ODID_UA_TYPE_NONE: 0;
    MAV_ODID_UA_TYPE_AEROPLANE: 1;
    MAV_ODID_UA_TYPE_HELICOPTER_OR_MULTIROTOR: 2;
    MAV_ODID_UA_TYPE_GYROPLANE: 3;
    MAV_ODID_UA_TYPE_HYBRID_LIFT: 4;
    MAV_ODID_UA_TYPE_ORNITHOPTER: 5;
    MAV_ODID_UA_TYPE_GLIDER: 6;
    MAV_ODID_UA_TYPE_KITE: 7;
    MAV_ODID_UA_TYPE_FREE_BALLOON: 8;
    MAV_ODID_UA_TYPE_CAPTIVE_BALLOON: 9;
    MAV_ODID_UA_TYPE_AIRSHIP: 10;
    MAV_ODID_UA_TYPE_FREE_FALL_PARACHUTE: 11;
    MAV_ODID_UA_TYPE_ROCKET: 12;
    MAV_ODID_UA_TYPE_TETHERED_POWERED_AIRCRAFT: 13;
    MAV_ODID_UA_TYPE_GROUND_OBSTACLE: 14;
    MAV_ODID_UA_TYPE_OTHER: 15;
    MAV_ODID_UA_TYPE_ENUM_END: 16;
    MAV_ODID_STATUS_UNDECLARED: 0;
    MAV_ODID_STATUS_GROUND: 1;
    MAV_ODID_STATUS_AIRBORNE: 2;
    MAV_ODID_STATUS_EMERGENCY: 3;
    MAV_ODID_STATUS_REMOTE_ID_SYSTEM_FAILURE: 4;
    MAV_ODID_STATUS_ENUM_END: 5;
    MAV_ODID_HEIGHT_REF_OVER_TAKEOFF: 0;
    MAV_ODID_HEIGHT_REF_OVER_GROUND: 1;
    MAV_ODID_HEIGHT_REF_ENUM_END: 2;
    MAV_ODID_HOR_ACC_UNKNOWN: 0;
    MAV_ODID_HOR_ACC_10NM: 1;
    MAV_ODID_HOR_ACC_4NM: 2;
    MAV_ODID_HOR_ACC_2NM: 3;
    MAV_ODID_HOR_ACC_1NM: 4;
    MAV_ODID_HOR_ACC_0_5NM: 5;
    MAV_ODID_HOR_ACC_0_3NM: 6;
    MAV_ODID_HOR_ACC_0_1NM: 7;
    MAV_ODID_HOR_ACC_0_05NM: 8;
    MAV_ODID_HOR_ACC_30_METER: 9;
    MAV_ODID_HOR_ACC_10_METER: 10;
    MAV_ODID_HOR_ACC_3_METER: 11;
    MAV_ODID_HOR_ACC_1_METER: 12;
    MAV_ODID_HOR_ACC_ENUM_END: 13;
    MAV_ODID_VER_ACC_UNKNOWN: 0;
    MAV_ODID_VER_ACC_150_METER: 1;
    MAV_ODID_VER_ACC_45_METER: 2;
    MAV_ODID_VER_ACC_25_METER: 3;
    MAV_ODID_VER_ACC_10_METER: 4;
    MAV_ODID_VER_ACC_3_METER: 5;
    MAV_ODID_VER_ACC_1_METER: 6;
    MAV_ODID_VER_ACC_ENUM_END: 7;
    MAV_ODID_SPEED_ACC_UNKNOWN: 0;
    MAV_ODID_SPEED_ACC_10_METERS_PER_SECOND: 1;
    MAV_ODID_SPEED_ACC_3_METERS_PER_SECOND: 2;
    MAV_ODID_SPEED_ACC_1_METERS_PER_SECOND: 3;
    MAV_ODID_SPEED_ACC_0_3_METERS_PER_SECOND: 4;
    MAV_ODID_SPEED_ACC_ENUM_END: 5;
    MAV_ODID_TIME_ACC_UNKNOWN: 0;
    MAV_ODID_TIME_ACC_0_1_SECOND: 1;
    MAV_ODID_TIME_ACC_0_2_SECOND: 2;
    MAV_ODID_TIME_ACC_0_3_SECOND: 3;
    MAV_ODID_TIME_ACC_0_4_SECOND: 4;
    MAV_ODID_TIME_ACC_0_5_SECOND: 5;
    MAV_ODID_TIME_ACC_0_6_SECOND: 6;
    MAV_ODID_TIME_ACC_0_7_SECOND: 7;
    MAV_ODID_TIME_ACC_0_8_SECOND: 8;
    MAV_ODID_TIME_ACC_0_9_SECOND: 9;
    MAV_ODID_TIME_ACC_1_0_SECOND: 10;
    MAV_ODID_TIME_ACC_1_1_SECOND: 11;
    MAV_ODID_TIME_ACC_1_2_SECOND: 12;
    MAV_ODID_TIME_ACC_1_3_SECOND: 13;
    MAV_ODID_TIME_ACC_1_4_SECOND: 14;
    MAV_ODID_TIME_ACC_1_5_SECOND: 15;
    MAV_ODID_TIME_ACC_ENUM_END: 16;
    MAV_ODID_AUTH_TYPE_NONE: 0;
    MAV_ODID_AUTH_TYPE_UAS_ID_SIGNATURE: 1;
    MAV_ODID_AUTH_TYPE_OPERATOR_ID_SIGNATURE: 2;
    MAV_ODID_AUTH_TYPE_MESSAGE_SET_SIGNATURE: 3;
    MAV_ODID_AUTH_TYPE_NETWORK_REMOTE_ID: 4;
    MAV_ODID_AUTH_TYPE_SPECIFIC_AUTHENTICATION: 5;
    MAV_ODID_AUTH_TYPE_ENUM_END: 6;
    MAV_ODID_DESC_TYPE_TEXT: 0;
    MAV_ODID_DESC_TYPE_EMERGENCY: 1;
    MAV_ODID_DESC_TYPE_EXTENDED_STATUS: 2;
    MAV_ODID_DESC_TYPE_ENUM_END: 3;
    MAV_ODID_OPERATOR_LOCATION_TYPE_TAKEOFF: 0;
    MAV_ODID_OPERATOR_LOCATION_TYPE_LIVE_GNSS: 1;
    MAV_ODID_OPERATOR_LOCATION_TYPE_FIXED: 2;
    MAV_ODID_OPERATOR_LOCATION_TYPE_ENUM_END: 3;
    MAV_ODID_CLASSIFICATION_TYPE_UNDECLARED: 0;
    MAV_ODID_CLASSIFICATION_TYPE_EU: 1;
    MAV_ODID_CLASSIFICATION_TYPE_ENUM_END: 2;
    MAV_ODID_CATEGORY_EU_UNDECLARED: 0;
    MAV_ODID_CATEGORY_EU_OPEN: 1;
    MAV_ODID_CATEGORY_EU_SPECIFIC: 2;
    MAV_ODID_CATEGORY_EU_CERTIFIED: 3;
    MAV_ODID_CATEGORY_EU_ENUM_END: 4;
    MAV_ODID_CLASS_EU_UNDECLARED: 0;
    MAV_ODID_CLASS_EU_CLASS_0: 1;
    MAV_ODID_CLASS_EU_CLASS_1: 2;
    MAV_ODID_CLASS_EU_CLASS_2: 3;
    MAV_ODID_CLASS_EU_CLASS_3: 4;
    MAV_ODID_CLASS_EU_CLASS_4: 5;
    MAV_ODID_CLASS_EU_CLASS_5: 6;
    MAV_ODID_CLASS_EU_CLASS_6: 7;
    MAV_ODID_CLASS_EU_ENUM_END: 8;
    MAV_ODID_OPERATOR_ID_TYPE_CAA: 0;
    MAV_ODID_OPERATOR_ID_TYPE_ENUM_END: 1;
    MAV_ODID_ARM_STATUS_GOOD_TO_ARM: 0;
    MAV_ODID_ARM_STATUS_PRE_ARM_FAIL_GENERIC: 1;
    MAV_ODID_ARM_STATUS_ENUM_END: 2;
    AIS_TYPE_UNKNOWN: 0;
    AIS_TYPE_RESERVED_1: 1;
    AIS_TYPE_RESERVED_2: 2;
    AIS_TYPE_RESERVED_3: 3;
    AIS_TYPE_RESERVED_4: 4;
    AIS_TYPE_RESERVED_5: 5;
    AIS_TYPE_RESERVED_6: 6;
    AIS_TYPE_RESERVED_7: 7;
    AIS_TYPE_RESERVED_8: 8;
    AIS_TYPE_RESERVED_9: 9;
    AIS_TYPE_RESERVED_10: 10;
    AIS_TYPE_RESERVED_11: 11;
    AIS_TYPE_RESERVED_12: 12;
    AIS_TYPE_RESERVED_13: 13;
    AIS_TYPE_RESERVED_14: 14;
    AIS_TYPE_RESERVED_15: 15;
    AIS_TYPE_RESERVED_16: 16;
    AIS_TYPE_RESERVED_17: 17;
    AIS_TYPE_RESERVED_18: 18;
    AIS_TYPE_RESERVED_19: 19;
    AIS_TYPE_WIG: 20;
    AIS_TYPE_WIG_HAZARDOUS_A: 21;
    AIS_TYPE_WIG_HAZARDOUS_B: 22;
    AIS_TYPE_WIG_HAZARDOUS_C: 23;
    AIS_TYPE_WIG_HAZARDOUS_D: 24;
    AIS_TYPE_WIG_RESERVED_1: 25;
    AIS_TYPE_WIG_RESERVED_2: 26;
    AIS_TYPE_WIG_RESERVED_3: 27;
    AIS_TYPE_WIG_RESERVED_4: 28;
    AIS_TYPE_WIG_RESERVED_5: 29;
    AIS_TYPE_FISHING: 30;
    AIS_TYPE_TOWING: 31;
    AIS_TYPE_TOWING_LARGE: 32;
    AIS_TYPE_DREDGING: 33;
    AIS_TYPE_DIVING: 34;
    AIS_TYPE_MILITARY: 35;
    AIS_TYPE_SAILING: 36;
    AIS_TYPE_PLEASURE: 37;
    AIS_TYPE_RESERVED_20: 38;
    AIS_TYPE_RESERVED_21: 39;
    AIS_TYPE_HSC: 40;
    AIS_TYPE_HSC_HAZARDOUS_A: 41;
    AIS_TYPE_HSC_HAZARDOUS_B: 42;
    AIS_TYPE_HSC_HAZARDOUS_C: 43;
    AIS_TYPE_HSC_HAZARDOUS_D: 44;
    AIS_TYPE_HSC_RESERVED_1: 45;
    AIS_TYPE_HSC_RESERVED_2: 46;
    AIS_TYPE_HSC_RESERVED_3: 47;
    AIS_TYPE_HSC_RESERVED_4: 48;
    AIS_TYPE_HSC_UNKNOWN: 49;
    AIS_TYPE_PILOT: 50;
    AIS_TYPE_SAR: 51;
    AIS_TYPE_TUG: 52;
    AIS_TYPE_PORT_TENDER: 53;
    AIS_TYPE_ANTI_POLLUTION: 54;
    AIS_TYPE_LAW_ENFORCEMENT: 55;
    AIS_TYPE_SPARE_LOCAL_1: 56;
    AIS_TYPE_SPARE_LOCAL_2: 57;
    AIS_TYPE_MEDICAL_TRANSPORT: 58;
    AIS_TYPE_NONECOMBATANT: 59;
    AIS_TYPE_PASSENGER: 60;
    AIS_TYPE_PASSENGER_HAZARDOUS_A: 61;
    AIS_TYPE_PASSENGER_HAZARDOUS_B: 62;
    AIS_TYPE_AIS_TYPE_PASSENGER_HAZARDOUS_C: 63;
    AIS_TYPE_PASSENGER_HAZARDOUS_D: 64;
    AIS_TYPE_PASSENGER_RESERVED_1: 65;
    AIS_TYPE_PASSENGER_RESERVED_2: 66;
    AIS_TYPE_PASSENGER_RESERVED_3: 67;
    AIS_TYPE_AIS_TYPE_PASSENGER_RESERVED_4: 68;
    AIS_TYPE_PASSENGER_UNKNOWN: 69;
    AIS_TYPE_CARGO: 70;
    AIS_TYPE_CARGO_HAZARDOUS_A: 71;
    AIS_TYPE_CARGO_HAZARDOUS_B: 72;
    AIS_TYPE_CARGO_HAZARDOUS_C: 73;
    AIS_TYPE_CARGO_HAZARDOUS_D: 74;
    AIS_TYPE_CARGO_RESERVED_1: 75;
    AIS_TYPE_CARGO_RESERVED_2: 76;
    AIS_TYPE_CARGO_RESERVED_3: 77;
    AIS_TYPE_CARGO_RESERVED_4: 78;
    AIS_TYPE_CARGO_UNKNOWN: 79;
    AIS_TYPE_TANKER: 80;
    AIS_TYPE_TANKER_HAZARDOUS_A: 81;
    AIS_TYPE_TANKER_HAZARDOUS_B: 82;
    AIS_TYPE_TANKER_HAZARDOUS_C: 83;
    AIS_TYPE_TANKER_HAZARDOUS_D: 84;
    AIS_TYPE_TANKER_RESERVED_1: 85;
    AIS_TYPE_TANKER_RESERVED_2: 86;
    AIS_TYPE_TANKER_RESERVED_3: 87;
    AIS_TYPE_TANKER_RESERVED_4: 88;
    AIS_TYPE_TANKER_UNKNOWN: 89;
    AIS_TYPE_OTHER: 90;
    AIS_TYPE_OTHER_HAZARDOUS_A: 91;
    AIS_TYPE_OTHER_HAZARDOUS_B: 92;
    AIS_TYPE_OTHER_HAZARDOUS_C: 93;
    AIS_TYPE_OTHER_HAZARDOUS_D: 94;
    AIS_TYPE_OTHER_RESERVED_1: 95;
    AIS_TYPE_OTHER_RESERVED_2: 96;
    AIS_TYPE_OTHER_RESERVED_3: 97;
    AIS_TYPE_OTHER_RESERVED_4: 98;
    AIS_TYPE_OTHER_UNKNOWN: 99;
    AIS_TYPE_ENUM_END: 100;
    UNDER_WAY: 0;
    AIS_NAV_ANCHORED: 1;
    AIS_NAV_UN_COMMANDED: 2;
    AIS_NAV_RESTRICTED_MANOEUVERABILITY: 3;
    AIS_NAV_DRAUGHT_CONSTRAINED: 4;
    AIS_NAV_MOORED: 5;
    AIS_NAV_AGROUND: 6;
    AIS_NAV_FISHING: 7;
    AIS_NAV_SAILING: 8;
    AIS_NAV_RESERVED_HSC: 9;
    AIS_NAV_RESERVED_WIG: 10;
    AIS_NAV_RESERVED_1: 11;
    AIS_NAV_RESERVED_2: 12;
    AIS_NAV_RESERVED_3: 13;
    AIS_NAV_AIS_SART: 14;
    AIS_NAV_UNKNOWN: 15;
    AIS_NAV_STATUS_ENUM_END: 16;
    AIS_FLAGS_POSITION_ACCURACY: 1;
    AIS_FLAGS_VALID_COG: 2;
    AIS_FLAGS_VALID_VELOCITY: 4;
    AIS_FLAGS_HIGH_VELOCITY: 8;
    AIS_FLAGS_VALID_TURN_RATE: 16;
    AIS_FLAGS_TURN_RATE_SIGN_ONLY: 32;
    AIS_FLAGS_VALID_DIMENSIONS: 64;
    AIS_FLAGS_LARGE_BOW_DIMENSION: 128;
    AIS_FLAGS_LARGE_STERN_DIMENSION: 256;
    AIS_FLAGS_LARGE_PORT_DIMENSION: 512;
    AIS_FLAGS_LARGE_STARBOARD_DIMENSION: 1024;
    AIS_FLAGS_VALID_CALLSIGN: 2048;
    AIS_FLAGS_VALID_NAME: 4096;
    AIS_FLAGS_ENUM_END: 4097;
    MAV_WINCH_STATUS_HEALTHY: 1;
    MAV_WINCH_STATUS_FULLY_RETRACTED: 2;
    MAV_WINCH_STATUS_MOVING: 4;
    MAV_WINCH_STATUS_CLUTCH_ENGAGED: 8;
    MAV_WINCH_STATUS_FLAG_ENUM_END: 9;
    MAG_CAL_NOT_STARTED: 0;
    MAG_CAL_WAITING_TO_START: 1;
    MAG_CAL_RUNNING_STEP_ONE: 2;
    MAG_CAL_RUNNING_STEP_TWO: 3;
    MAG_CAL_SUCCESS: 4;
    MAG_CAL_FAILED: 5;
    MAG_CAL_BAD_ORIENTATION: 6;
    MAG_CAL_BAD_RADIUS: 7;
    MAG_CAL_STATUS_ENUM_END: 8;
    CAN_FILTER_REPLACE: 0;
    CAN_FILTER_ADD: 1;
    CAN_FILTER_REMOVE: 2;
    CAN_FILTER_OP_ENUM_END: 3;
    NAV_VTOL_LAND_OPTIONS_DEFAULT: 0;
    NAV_VTOL_LAND_OPTIONS_FW_SPIRAL_APPROACH: 1;
    NAV_VTOL_LAND_OPTIONS_FW_APPROACH: 2;
    NAV_VTOL_LAND_OPTIONS_ENUM_END: 3;
    MISSION_STATE_UNKNOWN: 0;
    MISSION_STATE_NO_MISSION: 1;
    MISSION_STATE_NOT_STARTED: 2;
    MISSION_STATE_ACTIVE: 3;
    MISSION_STATE_PAUSED: 4;
    MISSION_STATE_COMPLETE: 5;
    MISSION_STATE_ENUM_END: 6;
    SAFETY_SWITCH_STATE_SAFE: 0;
    SAFETY_SWITCH_STATE_DANGEROUS: 1;
    SAFETY_SWITCH_STATE_ENUM_END: 2;
    AIRSPEED_SENSOR_UNHEALTHY: 1;
    AIRSPEED_SENSOR_USING: 2;
    AIRSPEED_SENSOR_FLAGS_ENUM_END: 3;
    RADIO_RC_CHANNELS_FLAGS_FAILSAFE: 1;
    RADIO_RC_CHANNELS_FLAGS_OUTDATED: 2;
    RADIO_RC_CHANNELS_FLAGS_ENUM_END: 3;
    MAV_STANDARD_MODE_NON_STANDARD: 0;
    MAV_STANDARD_MODE_POSITION_HOLD: 1;
    MAV_STANDARD_MODE_ORBIT: 2;
    MAV_STANDARD_MODE_CRUISE: 3;
    MAV_STANDARD_MODE_ALTITUDE_HOLD: 4;
    MAV_STANDARD_MODE_RETURN_HOME: 5;
    MAV_STANDARD_MODE_SAFE_RECOVERY: 6;
    MAV_STANDARD_MODE_MISSION: 7;
    MAV_STANDARD_MODE_LAND: 8;
    MAV_STANDARD_MODE_TAKEOFF: 9;
    MAV_STANDARD_MODE_ENUM_END: 10;
    MAV_MODE_PROPERTY_ADVANCED: 1;
    MAV_MODE_PROPERTY_NOT_USER_SELECTABLE: 2;
    MAV_MODE_PROPERTY_ENUM_END: 3;
    GPS_SYSTEM_ERROR_INCOMING_CORRECTIONS: 1;
    GPS_SYSTEM_ERROR_CONFIGURATION: 2;
    GPS_SYSTEM_ERROR_SOFTWARE: 4;
    GPS_SYSTEM_ERROR_ANTENNA: 8;
    GPS_SYSTEM_ERROR_EVENT_CONGESTION: 16;
    GPS_SYSTEM_ERROR_CPU_OVERLOAD: 32;
    GPS_SYSTEM_ERROR_OUTPUT_CONGESTION: 64;
    GPS_SYSTEM_ERROR_FLAGS_ENUM_END: 65;
    GPS_AUTHENTICATION_STATE_UNKNOWN: 0;
    GPS_AUTHENTICATION_STATE_INITIALIZING: 1;
    GPS_AUTHENTICATION_STATE_ERROR: 2;
    GPS_AUTHENTICATION_STATE_OK: 3;
    GPS_AUTHENTICATION_STATE_DISABLED: 4;
    GPS_AUTHENTICATION_STATE_ENUM_END: 5;
    GPS_JAMMING_STATE_UNKNOWN: 0;
    GPS_JAMMING_STATE_OK: 1;
    GPS_JAMMING_STATE_MITIGATED: 2;
    GPS_JAMMING_STATE_DETECTED: 3;
    GPS_JAMMING_STATE_ENUM_END: 4;
    GPS_SPOOFING_STATE_UNKNOWN: 0;
    GPS_SPOOFING_STATE_OK: 1;
    GPS_SPOOFING_STATE_MITIGATED: 2;
    GPS_SPOOFING_STATE_DETECTED: 3;
    GPS_SPOOFING_STATE_ENUM_END: 4;
    GPS_RAIM_STATE_UNKNOWN: 0;
    GPS_RAIM_STATE_DISABLED: 1;
    GPS_RAIM_STATE_OK: 2;
    GPS_RAIM_STATE_FAILED: 3;
    GPS_RAIM_STATE_ENUM_END: 4;
    ICAROUS_TRACK_BAND_TYPE_NONE: 0;
    ICAROUS_TRACK_BAND_TYPE_NEAR: 1;
    ICAROUS_TRACK_BAND_TYPE_RECOVERY: 2;
    ICAROUS_TRACK_BAND_TYPES_ENUM_END: 3;
    ICAROUS_FMS_STATE_IDLE: 0;
    ICAROUS_FMS_STATE_TAKEOFF: 1;
    ICAROUS_FMS_STATE_CLIMB: 2;
    ICAROUS_FMS_STATE_CRUISE: 3;
    ICAROUS_FMS_STATE_APPROACH: 4;
    ICAROUS_FMS_STATE_LAND: 5;
    ICAROUS_FMS_STATE_ENUM_END: 6;
    MAV_AUTOPILOT_GENERIC: 0;
    MAV_AUTOPILOT_RESERVED: 1;
    MAV_AUTOPILOT_SLUGS: 2;
    MAV_AUTOPILOT_ARDUPILOTMEGA: 3;
    MAV_AUTOPILOT_OPENPILOT: 4;
    MAV_AUTOPILOT_GENERIC_WAYPOINTS_ONLY: 5;
    MAV_AUTOPILOT_GENERIC_WAYPOINTS_AND_SIMPLE_NAVIGATION_ONLY: 6;
    MAV_AUTOPILOT_GENERIC_MISSION_FULL: 7;
    MAV_AUTOPILOT_INVALID: 8;
    MAV_AUTOPILOT_PPZ: 9;
    MAV_AUTOPILOT_UDB: 10;
    MAV_AUTOPILOT_FP: 11;
    MAV_AUTOPILOT_PX4: 12;
    MAV_AUTOPILOT_SMACCMPILOT: 13;
    MAV_AUTOPILOT_AUTOQUAD: 14;
    MAV_AUTOPILOT_ARMAZILA: 15;
    MAV_AUTOPILOT_AEROB: 16;
    MAV_AUTOPILOT_ASLUAV: 17;
    MAV_AUTOPILOT_SMARTAP: 18;
    MAV_AUTOPILOT_AIRRAILS: 19;
    MAV_AUTOPILOT_REFLEX: 20;
    MAV_AUTOPILOT_ENUM_END: 21;
    MAV_TYPE_GENERIC: 0;
    MAV_TYPE_FIXED_WING: 1;
    MAV_TYPE_QUADROTOR: 2;
    MAV_TYPE_COAXIAL: 3;
    MAV_TYPE_HELICOPTER: 4;
    MAV_TYPE_ANTENNA_TRACKER: 5;
    MAV_TYPE_GCS: 6;
    MAV_TYPE_AIRSHIP: 7;
    MAV_TYPE_FREE_BALLOON: 8;
    MAV_TYPE_ROCKET: 9;
    MAV_TYPE_GROUND_ROVER: 10;
    MAV_TYPE_SURFACE_BOAT: 11;
    MAV_TYPE_SUBMARINE: 12;
    MAV_TYPE_HEXAROTOR: 13;
    MAV_TYPE_OCTOROTOR: 14;
    MAV_TYPE_TRICOPTER: 15;
    MAV_TYPE_FLAPPING_WING: 16;
    MAV_TYPE_KITE: 17;
    MAV_TYPE_ONBOARD_CONTROLLER: 18;
    MAV_TYPE_VTOL_DUOROTOR: 19;
    MAV_TYPE_VTOL_QUADROTOR: 20;
    MAV_TYPE_VTOL_TILTROTOR: 21;
    MAV_TYPE_VTOL_RESERVED2: 22;
    MAV_TYPE_VTOL_RESERVED3: 23;
    MAV_TYPE_VTOL_RESERVED4: 24;
    MAV_TYPE_VTOL_RESERVED5: 25;
    MAV_TYPE_GIMBAL: 26;
    MAV_TYPE_ADSB: 27;
    MAV_TYPE_PARAFOIL: 28;
    MAV_TYPE_DODECAROTOR: 29;
    MAV_TYPE_CAMERA: 30;
    MAV_TYPE_CHARGING_STATION: 31;
    MAV_TYPE_FLARM: 32;
    MAV_TYPE_SERVO: 33;
    MAV_TYPE_ODID: 34;
    MAV_TYPE_DECAROTOR: 35;
    MAV_TYPE_BATTERY: 36;
    MAV_TYPE_PARACHUTE: 37;
    MAV_TYPE_LOG: 38;
    MAV_TYPE_OSD: 39;
    MAV_TYPE_IMU: 40;
    MAV_TYPE_GPS: 41;
    MAV_TYPE_WINCH: 42;
    MAV_TYPE_ENUM_END: 43;
    MAV_MODE_FLAG_CUSTOM_MODE_ENABLED: 1;
    MAV_MODE_FLAG_TEST_ENABLED: 2;
    MAV_MODE_FLAG_AUTO_ENABLED: 4;
    MAV_MODE_FLAG_GUIDED_ENABLED: 8;
    MAV_MODE_FLAG_STABILIZE_ENABLED: 16;
    MAV_MODE_FLAG_HIL_ENABLED: 32;
    MAV_MODE_FLAG_MANUAL_INPUT_ENABLED: 64;
    MAV_MODE_FLAG_SAFETY_ARMED: 128;
    MAV_MODE_FLAG_ENUM_END: 129;
    MAV_MODE_FLAG_DECODE_POSITION_CUSTOM_MODE: 1;
    MAV_MODE_FLAG_DECODE_POSITION_TEST: 2;
    MAV_MODE_FLAG_DECODE_POSITION_AUTO: 4;
    MAV_MODE_FLAG_DECODE_POSITION_GUIDED: 8;
    MAV_MODE_FLAG_DECODE_POSITION_STABILIZE: 16;
    MAV_MODE_FLAG_DECODE_POSITION_HIL: 32;
    MAV_MODE_FLAG_DECODE_POSITION_MANUAL: 64;
    MAV_MODE_FLAG_DECODE_POSITION_SAFETY: 128;
    MAV_MODE_FLAG_DECODE_POSITION_ENUM_END: 129;
    MAV_STATE_UNINIT: 0;
    MAV_STATE_BOOT: 1;
    MAV_STATE_CALIBRATING: 2;
    MAV_STATE_STANDBY: 3;
    MAV_STATE_ACTIVE: 4;
    MAV_STATE_CRITICAL: 5;
    MAV_STATE_EMERGENCY: 6;
    MAV_STATE_POWEROFF: 7;
    MAV_STATE_FLIGHT_TERMINATION: 8;
    MAV_STATE_ENUM_END: 9;
    MAV_COMP_ID_ALL: 0;
    MAV_COMP_ID_AUTOPILOT1: 1;
    MAV_COMP_ID_USER1: 25;
    MAV_COMP_ID_USER2: 26;
    MAV_COMP_ID_USER3: 27;
    MAV_COMP_ID_USER4: 28;
    MAV_COMP_ID_USER5: 29;
    MAV_COMP_ID_USER6: 30;
    MAV_COMP_ID_USER7: 31;
    MAV_COMP_ID_USER8: 32;
    MAV_COMP_ID_USER9: 33;
    MAV_COMP_ID_USER10: 34;
    MAV_COMP_ID_USER11: 35;
    MAV_COMP_ID_USER12: 36;
    MAV_COMP_ID_USER13: 37;
    MAV_COMP_ID_USER14: 38;
    MAV_COMP_ID_USER15: 39;
    MAV_COMP_ID_USER16: 40;
    MAV_COMP_ID_USER17: 41;
    MAV_COMP_ID_USER18: 42;
    MAV_COMP_ID_USER19: 43;
    MAV_COMP_ID_USER20: 44;
    MAV_COMP_ID_USER21: 45;
    MAV_COMP_ID_USER22: 46;
    MAV_COMP_ID_USER23: 47;
    MAV_COMP_ID_USER24: 48;
    MAV_COMP_ID_USER25: 49;
    MAV_COMP_ID_USER26: 50;
    MAV_COMP_ID_USER27: 51;
    MAV_COMP_ID_USER28: 52;
    MAV_COMP_ID_USER29: 53;
    MAV_COMP_ID_USER30: 54;
    MAV_COMP_ID_USER31: 55;
    MAV_COMP_ID_USER32: 56;
    MAV_COMP_ID_USER33: 57;
    MAV_COMP_ID_USER34: 58;
    MAV_COMP_ID_USER35: 59;
    MAV_COMP_ID_USER36: 60;
    MAV_COMP_ID_USER37: 61;
    MAV_COMP_ID_USER38: 62;
    MAV_COMP_ID_USER39: 63;
    MAV_COMP_ID_USER40: 64;
    MAV_COMP_ID_USER41: 65;
    MAV_COMP_ID_USER42: 66;
    MAV_COMP_ID_USER43: 67;
    MAV_COMP_ID_TELEMETRY_RADIO: 68;
    MAV_COMP_ID_USER45: 69;
    MAV_COMP_ID_USER46: 70;
    MAV_COMP_ID_USER47: 71;
    MAV_COMP_ID_USER48: 72;
    MAV_COMP_ID_USER49: 73;
    MAV_COMP_ID_USER50: 74;
    MAV_COMP_ID_USER51: 75;
    MAV_COMP_ID_USER52: 76;
    MAV_COMP_ID_USER53: 77;
    MAV_COMP_ID_USER54: 78;
    MAV_COMP_ID_USER55: 79;
    MAV_COMP_ID_USER56: 80;
    MAV_COMP_ID_USER57: 81;
    MAV_COMP_ID_USER58: 82;
    MAV_COMP_ID_USER59: 83;
    MAV_COMP_ID_USER60: 84;
    MAV_COMP_ID_USER61: 85;
    MAV_COMP_ID_USER62: 86;
    MAV_COMP_ID_USER63: 87;
    MAV_COMP_ID_USER64: 88;
    MAV_COMP_ID_USER65: 89;
    MAV_COMP_ID_USER66: 90;
    MAV_COMP_ID_USER67: 91;
    MAV_COMP_ID_USER68: 92;
    MAV_COMP_ID_USER69: 93;
    MAV_COMP_ID_USER70: 94;
    MAV_COMP_ID_USER71: 95;
    MAV_COMP_ID_USER72: 96;
    MAV_COMP_ID_USER73: 97;
    MAV_COMP_ID_USER74: 98;
    MAV_COMP_ID_USER75: 99;
    MAV_COMP_ID_CAMERA: 100;
    MAV_COMP_ID_CAMERA2: 101;
    MAV_COMP_ID_CAMERA3: 102;
    MAV_COMP_ID_CAMERA4: 103;
    MAV_COMP_ID_CAMERA5: 104;
    MAV_COMP_ID_CAMERA6: 105;
    MAV_COMP_ID_SERVO1: 140;
    MAV_COMP_ID_SERVO2: 141;
    MAV_COMP_ID_SERVO3: 142;
    MAV_COMP_ID_SERVO4: 143;
    MAV_COMP_ID_SERVO5: 144;
    MAV_COMP_ID_SERVO6: 145;
    MAV_COMP_ID_SERVO7: 146;
    MAV_COMP_ID_SERVO8: 147;
    MAV_COMP_ID_SERVO9: 148;
    MAV_COMP_ID_SERVO10: 149;
    MAV_COMP_ID_SERVO11: 150;
    MAV_COMP_ID_SERVO12: 151;
    MAV_COMP_ID_SERVO13: 152;
    MAV_COMP_ID_SERVO14: 153;
    MAV_COMP_ID_GIMBAL: 154;
    MAV_COMP_ID_LOG: 155;
    MAV_COMP_ID_ADSB: 156;
    MAV_COMP_ID_OSD: 157;
    MAV_COMP_ID_PERIPHERAL: 158;
    MAV_COMP_ID_QX1_GIMBAL: 159;
    MAV_COMP_ID_FLARM: 160;
    MAV_COMP_ID_PARACHUTE: 161;
    MAV_COMP_ID_GIMBAL2: 171;
    MAV_COMP_ID_GIMBAL3: 172;
    MAV_COMP_ID_GIMBAL4: 173;
    MAV_COMP_ID_GIMBAL5: 174;
    MAV_COMP_ID_GIMBAL6: 175;
    MAV_COMP_ID_BATTERY: 180;
    MAV_COMP_ID_BATTERY2: 181;
    MAV_COMP_ID_MAVCAN: 189;
    MAV_COMP_ID_MISSIONPLANNER: 190;
    MAV_COMP_ID_ONBOARD_COMPUTER: 191;
    MAV_COMP_ID_ONBOARD_COMPUTER2: 192;
    MAV_COMP_ID_ONBOARD_COMPUTER3: 193;
    MAV_COMP_ID_ONBOARD_COMPUTER4: 194;
    MAV_COMP_ID_PATHPLANNER: 195;
    MAV_COMP_ID_OBSTACLE_AVOIDANCE: 196;
    MAV_COMP_ID_VISUAL_INERTIAL_ODOMETRY: 197;
    MAV_COMP_ID_PAIRING_MANAGER: 198;
    MAV_COMP_ID_IMU: 200;
    MAV_COMP_ID_IMU_2: 201;
    MAV_COMP_ID_IMU_3: 202;
    MAV_COMP_ID_GPS: 220;
    MAV_COMP_ID_GPS2: 221;
    MAV_COMP_ID_ODID_TXRX_1: 236;
    MAV_COMP_ID_ODID_TXRX_2: 237;
    MAV_COMP_ID_ODID_TXRX_3: 238;
    MAV_COMP_ID_UDP_BRIDGE: 240;
    MAV_COMP_ID_UART_BRIDGE: 241;
    MAV_COMP_ID_TUNNEL_NODE: 242;
    MAV_COMP_ID_SYSTEM_CONTROL: 250;
    MAV_COMPONENT_ENUM_END: 251;
    MAV_BOOL_FALSE: 0;
    MAV_BOOL_TRUE: 1;
    MAV_BOOL_ENUM_END: 2;
    MODE_MANUAL_DIRECT: 1;
    MODE_MANUAL_SCALED: 2;
    MODE_AUTO_PID_ATT: 3;
    MODE_AUTO_PID_VEL: 4;
    MODE_AUTO_PID_POS: 5;
    UALBERTA_AUTOPILOT_MODE_ENUM_END: 6;
    NAV_AHRS_INIT: 1;
    NAV_AHRS: 2;
    NAV_INS_GPS_INIT: 3;
    NAV_INS_GPS: 4;
    UALBERTA_NAV_MODE_ENUM_END: 5;
    PILOT_MANUAL: 1;
    PILOT_AUTO: 2;
    PILOT_ROTO: 3;
    UALBERTA_PILOT_MODE_ENUM_END: 4;
    UAVIONIX_ADSB_OUT_DYNAMIC_STATE_INTENT_CHANGE: 1;
    UAVIONIX_ADSB_OUT_DYNAMIC_STATE_AUTOPILOT_ENABLED: 2;
    UAVIONIX_ADSB_OUT_DYNAMIC_STATE_NICBARO_CROSSCHECKED: 4;
    UAVIONIX_ADSB_OUT_DYNAMIC_STATE_ON_GROUND: 8;
    UAVIONIX_ADSB_OUT_DYNAMIC_STATE_IDENT: 16;
    UAVIONIX_ADSB_OUT_DYNAMIC_STATE_ENUM_END: 17;
    UAVIONIX_ADSB_OUT_RF_SELECT_RX_ENABLED: 1;
    UAVIONIX_ADSB_OUT_RF_SELECT_TX_ENABLED: 2;
    UAVIONIX_ADSB_OUT_RF_SELECT_ENUM_END: 3;
    UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_NONE_0: 0;
    UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_NONE_1: 1;
    UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_2D: 2;
    UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_3D: 3;
    UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_DGPS: 4;
    UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_RTK: 5;
    UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_ENUM_END: 6;
    UAVIONIX_ADSB_RF_HEALTH_OK: 1;
    UAVIONIX_ADSB_RF_HEALTH_FAIL_TX: 2;
    UAVIONIX_ADSB_RF_HEALTH_FAIL_RX: 16;
    UAVIONIX_ADSB_RF_HEALTH_ENUM_END: 17;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_NO_DATA: 0;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L15M_W23M: 1;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L25M_W28P5M: 2;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L25_34M: 3;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L35_33M: 4;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L35_38M: 5;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L45_39P5M: 6;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L45_45M: 7;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L55_45M: 8;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L55_52M: 9;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L65_59P5M: 10;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L65_67M: 11;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L75_W72P5M: 12;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L75_W80M: 13;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L85_W80M: 14;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_L85_W90M: 15;
    UAVIONIX_ADSB_OUT_CFG_AIRCRAFT_SIZE_ENUM_END: 16;
    UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LAT_NO_DATA: 0;
    UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LAT_LEFT_2M: 1;
    UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LAT_LEFT_4M: 2;
    UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LAT_LEFT_6M: 3;
    UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LAT_RIGHT_0M: 4;
    UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LAT_RIGHT_2M: 5;
    UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LAT_RIGHT_4M: 6;
    UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LAT_RIGHT_6M: 7;
    UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LAT_ENUM_END: 8;
    UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LON_NO_DATA: 0;
    UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LON_APPLIED_BY_SENSOR: 1;
    UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LON_ENUM_END: 2;
    UAVIONIX_ADSB_OUT_NO_EMERGENCY: 0;
    UAVIONIX_ADSB_OUT_GENERAL_EMERGENCY: 1;
    UAVIONIX_ADSB_OUT_LIFEGUARD_EMERGENCY: 2;
    UAVIONIX_ADSB_OUT_MINIMUM_FUEL_EMERGENCY: 3;
    UAVIONIX_ADSB_OUT_NO_COMM_EMERGENCY: 4;
    UAVIONIX_ADSB_OUT_UNLAWFUL_INTERFERANCE_EMERGENCY: 5;
    UAVIONIX_ADSB_OUT_DOWNED_AIRCRAFT_EMERGENCY: 6;
    UAVIONIX_ADSB_OUT_RESERVED: 7;
    UAVIONIX_ADSB_EMERGENCY_STATUS_ENUM_END: 8;
    UAVIONIX_ADSB_OUT_CONTROL_STATE_EXTERNAL_BARO_CROSSCHECKED: 1;
    UAVIONIX_ADSB_OUT_CONTROL_STATE_ON_GROUND: 4;
    UAVIONIX_ADSB_OUT_CONTROL_STATE_IDENT_BUTTON_ACTIVE: 8;
    UAVIONIX_ADSB_OUT_CONTROL_STATE_MODE_A_ENABLED: 16;
    UAVIONIX_ADSB_OUT_CONTROL_STATE_MODE_C_ENABLED: 32;
    UAVIONIX_ADSB_OUT_CONTROL_STATE_MODE_S_ENABLED: 64;
    UAVIONIX_ADSB_OUT_CONTROL_STATE_1090ES_TX_ENABLED: 128;
    UAVIONIX_ADSB_OUT_CONTROL_STATE_ENUM_END: 129;
    UAVIONIX_ADSB_XBIT_ENABLED: 128;
    UAVIONIX_ADSB_XBIT_ENUM_END: 129;
    UAVIONIX_ADSB_OUT_STATUS_STATE_ON_GROUND: 1;
    UAVIONIX_ADSB_OUT_STATUS_STATE_INTERROGATED_SINCE_LAST: 2;
    UAVIONIX_ADSB_OUT_STATUS_STATE_XBIT_ENABLED: 4;
    UAVIONIX_ADSB_OUT_STATUS_STATE_IDENT_ACTIVE: 8;
    UAVIONIX_ADSB_OUT_STATUS_STATE_MODE_A_ENABLED: 16;
    UAVIONIX_ADSB_OUT_STATUS_STATE_MODE_C_ENABLED: 32;
    UAVIONIX_ADSB_OUT_STATUS_STATE_MODE_S_ENABLED: 64;
    UAVIONIX_ADSB_OUT_STATUS_STATE_1090ES_TX_ENABLED: 128;
    UAVIONIX_ADSB_OUT_STATUS_STATE_ENUM_END: 129;
    UAVIONIX_ADSB_NIC_CR_20_NM: 1;
    UAVIONIX_ADSB_NIC_CR_8_NM: 2;
    UAVIONIX_ADSB_NIC_CR_4_NM: 3;
    UAVIONIX_ADSB_NIC_CR_2_NM: 4;
    UAVIONIX_ADSB_NIC_CR_1_NM: 5;
    UAVIONIX_ADSB_NIC_CR_0_3_NM: 6;
    UAVIONIX_ADSB_NIC_CR_0_2_NM: 7;
    UAVIONIX_ADSB_NIC_CR_0_1_NM: 8;
    UAVIONIX_ADSB_NIC_CR_75_M: 9;
    UAVIONIX_ADSB_NIC_CR_25_M: 10;
    UAVIONIX_ADSB_NIC_CR_7_5_M: 11;
    UAVIONIX_ADSB_NACP_EPU_10_NM: 16;
    UAVIONIX_ADSB_NACP_EPU_4_NM: 32;
    UAVIONIX_ADSB_NACP_EPU_2_NM: 48;
    UAVIONIX_ADSB_NACP_EPU_1_NM: 64;
    UAVIONIX_ADSB_NACP_EPU_0_5_NM: 80;
    UAVIONIX_ADSB_NACP_EPU_0_3_NM: 96;
    UAVIONIX_ADSB_NACP_EPU_0_1_NM: 112;
    UAVIONIX_ADSB_NACP_EPU_0_05_NM: 128;
    UAVIONIX_ADSB_NACP_EPU_30_M: 144;
    UAVIONIX_ADSB_NACP_EPU_10_M: 160;
    UAVIONIX_ADSB_NACP_EPU_3_M: 176;
    UAVIONIX_ADSB_OUT_STATUS_NIC_NACP_ENUM_END: 177;
    UAVIONIX_ADSB_OUT_STATUS_FAULT_STATUS_MESSAGE_UNAVAIL: 8;
    UAVIONIX_ADSB_OUT_STATUS_FAULT_GPS_NO_POS: 16;
    UAVIONIX_ADSB_OUT_STATUS_FAULT_GPS_UNAVAIL: 32;
    UAVIONIX_ADSB_OUT_STATUS_FAULT_TX_SYSTEM_FAIL: 64;
    UAVIONIX_ADSB_OUT_STATUS_FAULT_MAINT_REQ: 128;
    UAVIONIX_ADSB_OUT_STATUS_FAULT_ENUM_END: 129;
    MAV_STORM32_TUNNEL_PAYLOAD_TYPE_STORM32_CH1_IN: 200;
    MAV_STORM32_TUNNEL_PAYLOAD_TYPE_STORM32_CH1_OUT: 201;
    MAV_STORM32_TUNNEL_PAYLOAD_TYPE_STORM32_CH2_IN: 202;
    MAV_STORM32_TUNNEL_PAYLOAD_TYPE_STORM32_CH2_OUT: 203;
    MAV_STORM32_TUNNEL_PAYLOAD_TYPE_STORM32_CH3_IN: 204;
    MAV_STORM32_TUNNEL_PAYLOAD_TYPE_STORM32_CH3_OUT: 205;
    MAV_STORM32_TUNNEL_PAYLOAD_TYPE_ENUM_END: 206;
    MAV_STORM32_GIMBAL_MANAGER_CAP_FLAGS_HAS_PROFILES: 1;
    MAV_STORM32_GIMBAL_MANAGER_CAP_FLAGS_ENUM_END: 2;
    MAV_STORM32_GIMBAL_MANAGER_FLAGS_RC_ACTIVE: 1;
    MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_ONBOARD_ACTIVE: 2;
    MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_AUTOPILOT_ACTIVE: 4;
    MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_GCS_ACTIVE: 8;
    MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_CAMERA_ACTIVE: 16;
    MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_GCS2_ACTIVE: 32;
    MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_CAMERA2_ACTIVE: 64;
    MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_CUSTOM_ACTIVE: 128;
    MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_CUSTOM2_ACTIVE: 256;
    MAV_STORM32_GIMBAL_MANAGER_FLAGS_SET_SUPERVISON: 512;
    MAV_STORM32_GIMBAL_MANAGER_FLAGS_SET_RELEASE: 1024;
    MAV_STORM32_GIMBAL_MANAGER_FLAGS_ENUM_END: 1025;
    MAV_STORM32_GIMBAL_MANAGER_CLIENT_NONE: 0;
    MAV_STORM32_GIMBAL_MANAGER_CLIENT_ONBOARD: 1;
    MAV_STORM32_GIMBAL_MANAGER_CLIENT_AUTOPILOT: 2;
    MAV_STORM32_GIMBAL_MANAGER_CLIENT_GCS: 3;
    MAV_STORM32_GIMBAL_MANAGER_CLIENT_CAMERA: 4;
    MAV_STORM32_GIMBAL_MANAGER_CLIENT_GCS2: 5;
    MAV_STORM32_GIMBAL_MANAGER_CLIENT_CAMERA2: 6;
    MAV_STORM32_GIMBAL_MANAGER_CLIENT_CUSTOM: 7;
    MAV_STORM32_GIMBAL_MANAGER_CLIENT_CUSTOM2: 8;
    MAV_STORM32_GIMBAL_MANAGER_CLIENT_ENUM_END: 9;
    MAV_STORM32_GIMBAL_MANAGER_PROFILE_DEFAULT: 0;
    MAV_STORM32_GIMBAL_MANAGER_PROFILE_CUSTOM: 1;
    MAV_STORM32_GIMBAL_MANAGER_PROFILE_COOPERATIVE: 2;
    MAV_STORM32_GIMBAL_MANAGER_PROFILE_EXCLUSIVE: 3;
    MAV_STORM32_GIMBAL_MANAGER_PROFILE_PRIORITY_COOPERATIVE: 4;
    MAV_STORM32_GIMBAL_MANAGER_PROFILE_PRIORITY_EXCLUSIVE: 5;
    MAV_STORM32_GIMBAL_MANAGER_PROFILE_ENUM_END: 6;
    MAV_QSHOT_MODE_UNDEFINED: 0;
    MAV_QSHOT_MODE_DEFAULT: 1;
    MAV_QSHOT_MODE_GIMBAL_RETRACT: 2;
    MAV_QSHOT_MODE_GIMBAL_NEUTRAL: 3;
    MAV_QSHOT_MODE_GIMBAL_MISSION: 4;
    MAV_QSHOT_MODE_GIMBAL_RC_CONTROL: 5;
    MAV_QSHOT_MODE_POI_TARGETING: 6;
    MAV_QSHOT_MODE_SYSID_TARGETING: 7;
    MAV_QSHOT_MODE_CABLECAM_2POINT: 8;
    MAV_QSHOT_MODE_HOME_TARGETING: 9;
    MAV_QSHOT_MODE_ENUM_END: 10;
    MLRS_RADIO_LINK_STATS_FLAGS_RSSI_DBM: 1;
    MLRS_RADIO_LINK_STATS_FLAGS_RX_RECEIVE_ANTENNA2: 2;
    MLRS_RADIO_LINK_STATS_FLAGS_RX_TRANSMIT_ANTENNA1: 4;
    MLRS_RADIO_LINK_STATS_FLAGS_RX_TRANSMIT_ANTENNA2: 8;
    MLRS_RADIO_LINK_STATS_FLAGS_TX_RECEIVE_ANTENNA2: 16;
    MLRS_RADIO_LINK_STATS_FLAGS_TX_TRANSMIT_ANTENNA1: 32;
    MLRS_RADIO_LINK_STATS_FLAGS_TX_TRANSMIT_ANTENNA2: 64;
    MLRS_RADIO_LINK_STATS_FLAGS_ENUM_END: 65;
    MLRS_RADIO_LINK_TYPE_GENERIC: 0;
    MLRS_RADIO_LINK_TYPE_HERELINK: 1;
    MLRS_RADIO_LINK_TYPE_DRAGONLINK: 2;
    MLRS_RADIO_LINK_TYPE_RFD900: 3;
    MLRS_RADIO_LINK_TYPE_CROSSFIRE: 4;
    MLRS_RADIO_LINK_TYPE_EXPRESSLRS: 5;
    MLRS_RADIO_LINK_TYPE_MLRS: 6;
    MLRS_RADIO_LINK_TYPE_ENUM_END: 7;
    PRS_NOT_STEADY: 1;
    PRS_DTM_NOT_ARMED: 2;
    PRS_OTM_NOT_ARMED: 3;
    MAV_AVSS_COMMAND_FAILURE_REASON_ENUM_END: 4;
    MODE_M300_MANUAL_CTRL: 0;
    MODE_M300_ATTITUDE: 1;
    MODE_M300_P_GPS: 6;
    MODE_M300_HOTPOINT_MODE: 9;
    MODE_M300_ASSISTED_TAKEOFF: 10;
    MODE_M300_AUTO_TAKEOFF: 11;
    MODE_M300_AUTO_LANDING: 12;
    MODE_M300_NAVI_GO_HOME: 15;
    MODE_M300_NAVI_SDK_CTRL: 17;
    MODE_M300_S_SPORT: 31;
    MODE_M300_FORCE_AUTO_LANDING: 33;
    MODE_M300_T_TRIPOD: 38;
    MODE_M300_SEARCH_MODE: 40;
    MODE_M300_ENGINE_START: 41;
    AVSS_M300_OPERATION_MODE_ENUM_END: 42;
    MODE_HORSEFLY_MANUAL_CTRL: 0;
    MODE_HORSEFLY_AUTO_TAKEOFF: 1;
    MODE_HORSEFLY_AUTO_LANDING: 2;
    MODE_HORSEFLY_NAVI_GO_HOME: 3;
    MODE_HORSEFLY_DROP: 4;
    AVSS_HORSEFLY_OPERATION_MODE_ENUM_END: 5;
    AIRLINK_ERROR_LOGIN_OR_PASS: 0;
    AIRLINK_AUTH_OK: 1;
    AIRLINK_AUTH_RESPONSE_TYPE_ENUM_END: 2;
    MAVLINK_MSG_ID_BAD_DATA: -1;
    MAVLINK_MSG_ID_SENSOR_OFFSETS: 150;
    MAVLINK_MSG_ID_SET_MAG_OFFSETS: 151;
    MAVLINK_MSG_ID_MEMINFO: 152;
    MAVLINK_MSG_ID_AP_ADC: 153;
    MAVLINK_MSG_ID_DIGICAM_CONFIGURE: 154;
    MAVLINK_MSG_ID_DIGICAM_CONTROL: 155;
    MAVLINK_MSG_ID_MOUNT_CONFIGURE: 156;
    MAVLINK_MSG_ID_MOUNT_CONTROL: 157;
    MAVLINK_MSG_ID_MOUNT_STATUS: 158;
    MAVLINK_MSG_ID_FENCE_POINT: 160;
    MAVLINK_MSG_ID_FENCE_FETCH_POINT: 161;
    MAVLINK_MSG_ID_AHRS: 163;
    MAVLINK_MSG_ID_SIMSTATE: 164;
    MAVLINK_MSG_ID_HWSTATUS: 165;
    MAVLINK_MSG_ID_RADIO: 166;
    MAVLINK_MSG_ID_LIMITS_STATUS: 167;
    MAVLINK_MSG_ID_WIND: 168;
    MAVLINK_MSG_ID_DATA16: 169;
    MAVLINK_MSG_ID_DATA32: 170;
    MAVLINK_MSG_ID_DATA64: 171;
    MAVLINK_MSG_ID_DATA96: 172;
    MAVLINK_MSG_ID_RANGEFINDER: 173;
    MAVLINK_MSG_ID_AIRSPEED_AUTOCAL: 174;
    MAVLINK_MSG_ID_RALLY_POINT: 175;
    MAVLINK_MSG_ID_RALLY_FETCH_POINT: 176;
    MAVLINK_MSG_ID_COMPASSMOT_STATUS: 177;
    MAVLINK_MSG_ID_AHRS2: 178;
    MAVLINK_MSG_ID_CAMERA_STATUS: 179;
    MAVLINK_MSG_ID_CAMERA_FEEDBACK: 180;
    MAVLINK_MSG_ID_BATTERY2: 181;
    MAVLINK_MSG_ID_AHRS3: 182;
    MAVLINK_MSG_ID_AUTOPILOT_VERSION_REQUEST: 183;
    MAVLINK_MSG_ID_REMOTE_LOG_DATA_BLOCK: 184;
    MAVLINK_MSG_ID_REMOTE_LOG_BLOCK_STATUS: 185;
    MAVLINK_MSG_ID_LED_CONTROL: 186;
    MAVLINK_MSG_ID_MAG_CAL_PROGRESS: 191;
    MAVLINK_MSG_ID_EKF_STATUS_REPORT: 193;
    MAVLINK_MSG_ID_PID_TUNING: 194;
    MAVLINK_MSG_ID_DEEPSTALL: 195;
    MAVLINK_MSG_ID_GIMBAL_REPORT: 200;
    MAVLINK_MSG_ID_GIMBAL_CONTROL: 201;
    MAVLINK_MSG_ID_GIMBAL_TORQUE_CMD_REPORT: 214;
    MAVLINK_MSG_ID_GOPRO_HEARTBEAT: 215;
    MAVLINK_MSG_ID_GOPRO_GET_REQUEST: 216;
    MAVLINK_MSG_ID_GOPRO_GET_RESPONSE: 217;
    MAVLINK_MSG_ID_GOPRO_SET_REQUEST: 218;
    MAVLINK_MSG_ID_GOPRO_SET_RESPONSE: 219;
    MAVLINK_MSG_ID_RPM: 226;
    MAVLINK_MSG_ID_DEVICE_OP_READ: 11000;
    MAVLINK_MSG_ID_DEVICE_OP_READ_REPLY: 11001;
    MAVLINK_MSG_ID_DEVICE_OP_WRITE: 11002;
    MAVLINK_MSG_ID_DEVICE_OP_WRITE_REPLY: 11003;
    MAVLINK_MSG_ID_SECURE_COMMAND: 11004;
    MAVLINK_MSG_ID_SECURE_COMMAND_REPLY: 11005;
    MAVLINK_MSG_ID_ADAP_TUNING: 11010;
    MAVLINK_MSG_ID_VISION_POSITION_DELTA: 11011;
    MAVLINK_MSG_ID_AOA_SSA: 11020;
    MAVLINK_MSG_ID_ESC_TELEMETRY_1_TO_4: 11030;
    MAVLINK_MSG_ID_ESC_TELEMETRY_5_TO_8: 11031;
    MAVLINK_MSG_ID_ESC_TELEMETRY_9_TO_12: 11032;
    MAVLINK_MSG_ID_OSD_PARAM_CONFIG: 11033;
    MAVLINK_MSG_ID_OSD_PARAM_CONFIG_REPLY: 11034;
    MAVLINK_MSG_ID_OSD_PARAM_SHOW_CONFIG: 11035;
    MAVLINK_MSG_ID_OSD_PARAM_SHOW_CONFIG_REPLY: 11036;
    MAVLINK_MSG_ID_OBSTACLE_DISTANCE_3D: 11037;
    MAVLINK_MSG_ID_WATER_DEPTH: 11038;
    MAVLINK_MSG_ID_MCU_STATUS: 11039;
    MAVLINK_MSG_ID_ESC_TELEMETRY_13_TO_16: 11040;
    MAVLINK_MSG_ID_ESC_TELEMETRY_17_TO_20: 11041;
    MAVLINK_MSG_ID_ESC_TELEMETRY_21_TO_24: 11042;
    MAVLINK_MSG_ID_ESC_TELEMETRY_25_TO_28: 11043;
    MAVLINK_MSG_ID_ESC_TELEMETRY_29_TO_32: 11044;
    MAVLINK_MSG_ID_COMMAND_INT_STAMPED: 223;
    MAVLINK_MSG_ID_COMMAND_LONG_STAMPED: 224;
    MAVLINK_MSG_ID_SENS_POWER: 8002;
    MAVLINK_MSG_ID_SENS_MPPT: 8003;
    MAVLINK_MSG_ID_ASLCTRL_DATA: 8004;
    MAVLINK_MSG_ID_ASLCTRL_DEBUG: 8005;
    MAVLINK_MSG_ID_ASLUAV_STATUS: 8006;
    MAVLINK_MSG_ID_EKF_EXT: 8007;
    MAVLINK_MSG_ID_ASL_OBCTRL: 8008;
    MAVLINK_MSG_ID_SENS_ATMOS: 8009;
    MAVLINK_MSG_ID_SENS_BATMON: 8010;
    MAVLINK_MSG_ID_FW_SOARING_DATA: 8011;
    MAVLINK_MSG_ID_SENSORPOD_STATUS: 8012;
    MAVLINK_MSG_ID_SENS_POWER_BOARD: 8013;
    MAVLINK_MSG_ID_GSM_LINK_STATUS: 8014;
    MAVLINK_MSG_ID_SATCOM_LINK_STATUS: 8015;
    MAVLINK_MSG_ID_SENSOR_AIRFLOW_ANGLES: 8016;
    MAVLINK_MSG_ID_SYS_STATUS: 1;
    MAVLINK_MSG_ID_SYSTEM_TIME: 2;
    MAVLINK_MSG_ID_PING: 4;
    MAVLINK_MSG_ID_CHANGE_OPERATOR_CONTROL: 5;
    MAVLINK_MSG_ID_CHANGE_OPERATOR_CONTROL_ACK: 6;
    MAVLINK_MSG_ID_AUTH_KEY: 7;
    MAVLINK_MSG_ID_SET_MODE: 11;
    MAVLINK_MSG_ID_PARAM_REQUEST_READ: 20;
    MAVLINK_MSG_ID_PARAM_REQUEST_LIST: 21;
    MAVLINK_MSG_ID_PARAM_VALUE: 22;
    MAVLINK_MSG_ID_PARAM_SET: 23;
    MAVLINK_MSG_ID_GPS_RAW_INT: 24;
    MAVLINK_MSG_ID_GPS_STATUS: 25;
    MAVLINK_MSG_ID_SCALED_IMU: 26;
    MAVLINK_MSG_ID_RAW_IMU: 27;
    MAVLINK_MSG_ID_RAW_PRESSURE: 28;
    MAVLINK_MSG_ID_SCALED_PRESSURE: 29;
    MAVLINK_MSG_ID_ATTITUDE: 30;
    MAVLINK_MSG_ID_ATTITUDE_QUATERNION: 31;
    MAVLINK_MSG_ID_LOCAL_POSITION_NED: 32;
    MAVLINK_MSG_ID_GLOBAL_POSITION_INT: 33;
    MAVLINK_MSG_ID_RC_CHANNELS_SCALED: 34;
    MAVLINK_MSG_ID_RC_CHANNELS_RAW: 35;
    MAVLINK_MSG_ID_SERVO_OUTPUT_RAW: 36;
    MAVLINK_MSG_ID_MISSION_REQUEST_PARTIAL_LIST: 37;
    MAVLINK_MSG_ID_MISSION_WRITE_PARTIAL_LIST: 38;
    MAVLINK_MSG_ID_MISSION_ITEM: 39;
    MAVLINK_MSG_ID_MISSION_REQUEST: 40;
    MAVLINK_MSG_ID_MISSION_SET_CURRENT: 41;
    MAVLINK_MSG_ID_MISSION_CURRENT: 42;
    MAVLINK_MSG_ID_MISSION_REQUEST_LIST: 43;
    MAVLINK_MSG_ID_MISSION_COUNT: 44;
    MAVLINK_MSG_ID_MISSION_CLEAR_ALL: 45;
    MAVLINK_MSG_ID_MISSION_ITEM_REACHED: 46;
    MAVLINK_MSG_ID_MISSION_ACK: 47;
    MAVLINK_MSG_ID_SET_GPS_GLOBAL_ORIGIN: 48;
    MAVLINK_MSG_ID_GPS_GLOBAL_ORIGIN: 49;
    MAVLINK_MSG_ID_PARAM_MAP_RC: 50;
    MAVLINK_MSG_ID_MISSION_REQUEST_INT: 51;
    MAVLINK_MSG_ID_SAFETY_SET_ALLOWED_AREA: 54;
    MAVLINK_MSG_ID_SAFETY_ALLOWED_AREA: 55;
    MAVLINK_MSG_ID_ATTITUDE_QUATERNION_COV: 61;
    MAVLINK_MSG_ID_NAV_CONTROLLER_OUTPUT: 62;
    MAVLINK_MSG_ID_GLOBAL_POSITION_INT_COV: 63;
    MAVLINK_MSG_ID_LOCAL_POSITION_NED_COV: 64;
    MAVLINK_MSG_ID_RC_CHANNELS: 65;
    MAVLINK_MSG_ID_REQUEST_DATA_STREAM: 66;
    MAVLINK_MSG_ID_DATA_STREAM: 67;
    MAVLINK_MSG_ID_MANUAL_CONTROL: 69;
    MAVLINK_MSG_ID_RC_CHANNELS_OVERRIDE: 70;
    MAVLINK_MSG_ID_MISSION_ITEM_INT: 73;
    MAVLINK_MSG_ID_VFR_HUD: 74;
    MAVLINK_MSG_ID_COMMAND_INT: 75;
    MAVLINK_MSG_ID_COMMAND_LONG: 76;
    MAVLINK_MSG_ID_COMMAND_ACK: 77;
    MAVLINK_MSG_ID_MANUAL_SETPOINT: 81;
    MAVLINK_MSG_ID_SET_ATTITUDE_TARGET: 82;
    MAVLINK_MSG_ID_ATTITUDE_TARGET: 83;
    MAVLINK_MSG_ID_SET_POSITION_TARGET_LOCAL_NED: 84;
    MAVLINK_MSG_ID_POSITION_TARGET_LOCAL_NED: 85;
    MAVLINK_MSG_ID_SET_POSITION_TARGET_GLOBAL_INT: 86;
    MAVLINK_MSG_ID_POSITION_TARGET_GLOBAL_INT: 87;
    MAVLINK_MSG_ID_LOCAL_POSITION_NED_SYSTEM_GLOBAL_OFFSET: 89;
    MAVLINK_MSG_ID_HIL_STATE: 90;
    MAVLINK_MSG_ID_HIL_CONTROLS: 91;
    MAVLINK_MSG_ID_HIL_RC_INPUTS_RAW: 92;
    MAVLINK_MSG_ID_HIL_ACTUATOR_CONTROLS: 93;
    MAVLINK_MSG_ID_OPTICAL_FLOW: 100;
    MAVLINK_MSG_ID_GLOBAL_VISION_POSITION_ESTIMATE: 101;
    MAVLINK_MSG_ID_VISION_POSITION_ESTIMATE: 102;
    MAVLINK_MSG_ID_VISION_SPEED_ESTIMATE: 103;
    MAVLINK_MSG_ID_VICON_POSITION_ESTIMATE: 104;
    MAVLINK_MSG_ID_HIGHRES_IMU: 105;
    MAVLINK_MSG_ID_OPTICAL_FLOW_RAD: 106;
    MAVLINK_MSG_ID_HIL_SENSOR: 107;
    MAVLINK_MSG_ID_SIM_STATE: 108;
    MAVLINK_MSG_ID_RADIO_STATUS: 109;
    MAVLINK_MSG_ID_FILE_TRANSFER_PROTOCOL: 110;
    MAVLINK_MSG_ID_TIMESYNC: 111;
    MAVLINK_MSG_ID_CAMERA_TRIGGER: 112;
    MAVLINK_MSG_ID_HIL_GPS: 113;
    MAVLINK_MSG_ID_HIL_OPTICAL_FLOW: 114;
    MAVLINK_MSG_ID_HIL_STATE_QUATERNION: 115;
    MAVLINK_MSG_ID_SCALED_IMU2: 116;
    MAVLINK_MSG_ID_LOG_REQUEST_LIST: 117;
    MAVLINK_MSG_ID_LOG_ENTRY: 118;
    MAVLINK_MSG_ID_LOG_REQUEST_DATA: 119;
    MAVLINK_MSG_ID_LOG_DATA: 120;
    MAVLINK_MSG_ID_LOG_ERASE: 121;
    MAVLINK_MSG_ID_LOG_REQUEST_END: 122;
    MAVLINK_MSG_ID_GPS_INJECT_DATA: 123;
    MAVLINK_MSG_ID_GPS2_RAW: 124;
    MAVLINK_MSG_ID_POWER_STATUS: 125;
    MAVLINK_MSG_ID_SERIAL_CONTROL: 126;
    MAVLINK_MSG_ID_GPS_RTK: 127;
    MAVLINK_MSG_ID_GPS2_RTK: 128;
    MAVLINK_MSG_ID_SCALED_IMU3: 129;
    MAVLINK_MSG_ID_DATA_TRANSMISSION_HANDSHAKE: 130;
    MAVLINK_MSG_ID_ENCAPSULATED_DATA: 131;
    MAVLINK_MSG_ID_DISTANCE_SENSOR: 132;
    MAVLINK_MSG_ID_TERRAIN_REQUEST: 133;
    MAVLINK_MSG_ID_TERRAIN_DATA: 134;
    MAVLINK_MSG_ID_TERRAIN_CHECK: 135;
    MAVLINK_MSG_ID_TERRAIN_REPORT: 136;
    MAVLINK_MSG_ID_SCALED_PRESSURE2: 137;
    MAVLINK_MSG_ID_ATT_POS_MOCAP: 138;
    MAVLINK_MSG_ID_SET_ACTUATOR_CONTROL_TARGET: 139;
    MAVLINK_MSG_ID_ACTUATOR_CONTROL_TARGET: 140;
    MAVLINK_MSG_ID_ALTITUDE: 141;
    MAVLINK_MSG_ID_RESOURCE_REQUEST: 142;
    MAVLINK_MSG_ID_SCALED_PRESSURE3: 143;
    MAVLINK_MSG_ID_FOLLOW_TARGET: 144;
    MAVLINK_MSG_ID_CONTROL_SYSTEM_STATE: 146;
    MAVLINK_MSG_ID_BATTERY_STATUS: 147;
    MAVLINK_MSG_ID_AUTOPILOT_VERSION: 148;
    MAVLINK_MSG_ID_LANDING_TARGET: 149;
    MAVLINK_MSG_ID_FENCE_STATUS: 162;
    MAVLINK_MSG_ID_MAG_CAL_REPORT: 192;
    MAVLINK_MSG_ID_EFI_STATUS: 225;
    MAVLINK_MSG_ID_ESTIMATOR_STATUS: 230;
    MAVLINK_MSG_ID_WIND_COV: 231;
    MAVLINK_MSG_ID_GPS_INPUT: 232;
    MAVLINK_MSG_ID_GPS_RTCM_DATA: 233;
    MAVLINK_MSG_ID_HIGH_LATENCY: 234;
    MAVLINK_MSG_ID_HIGH_LATENCY2: 235;
    MAVLINK_MSG_ID_VIBRATION: 241;
    MAVLINK_MSG_ID_HOME_POSITION: 242;
    MAVLINK_MSG_ID_SET_HOME_POSITION: 243;
    MAVLINK_MSG_ID_MESSAGE_INTERVAL: 244;
    MAVLINK_MSG_ID_EXTENDED_SYS_STATE: 245;
    MAVLINK_MSG_ID_ADSB_VEHICLE: 246;
    MAVLINK_MSG_ID_COLLISION: 247;
    MAVLINK_MSG_ID_V2_EXTENSION: 248;
    MAVLINK_MSG_ID_MEMORY_VECT: 249;
    MAVLINK_MSG_ID_DEBUG_VECT: 250;
    MAVLINK_MSG_ID_NAMED_VALUE_FLOAT: 251;
    MAVLINK_MSG_ID_NAMED_VALUE_INT: 252;
    MAVLINK_MSG_ID_STATUSTEXT: 253;
    MAVLINK_MSG_ID_DEBUG: 254;
    MAVLINK_MSG_ID_SETUP_SIGNING: 256;
    MAVLINK_MSG_ID_BUTTON_CHANGE: 257;
    MAVLINK_MSG_ID_PLAY_TUNE: 258;
    MAVLINK_MSG_ID_CAMERA_INFORMATION: 259;
    MAVLINK_MSG_ID_CAMERA_SETTINGS: 260;
    MAVLINK_MSG_ID_STORAGE_INFORMATION: 261;
    MAVLINK_MSG_ID_CAMERA_CAPTURE_STATUS: 262;
    MAVLINK_MSG_ID_CAMERA_IMAGE_CAPTURED: 263;
    MAVLINK_MSG_ID_FLIGHT_INFORMATION: 264;
    MAVLINK_MSG_ID_MOUNT_ORIENTATION: 265;
    MAVLINK_MSG_ID_LOGGING_DATA: 266;
    MAVLINK_MSG_ID_LOGGING_DATA_ACKED: 267;
    MAVLINK_MSG_ID_LOGGING_ACK: 268;
    MAVLINK_MSG_ID_VIDEO_STREAM_INFORMATION: 269;
    MAVLINK_MSG_ID_VIDEO_STREAM_STATUS: 270;
    MAVLINK_MSG_ID_CAMERA_FOV_STATUS: 271;
    MAVLINK_MSG_ID_CAMERA_TRACKING_IMAGE_STATUS: 275;
    MAVLINK_MSG_ID_CAMERA_TRACKING_GEO_STATUS: 276;
    MAVLINK_MSG_ID_CAMERA_THERMAL_RANGE: 277;
    MAVLINK_MSG_ID_GIMBAL_MANAGER_INFORMATION: 280;
    MAVLINK_MSG_ID_GIMBAL_MANAGER_STATUS: 281;
    MAVLINK_MSG_ID_GIMBAL_MANAGER_SET_ATTITUDE: 282;
    MAVLINK_MSG_ID_GIMBAL_DEVICE_INFORMATION: 283;
    MAVLINK_MSG_ID_GIMBAL_DEVICE_SET_ATTITUDE: 284;
    MAVLINK_MSG_ID_GIMBAL_DEVICE_ATTITUDE_STATUS: 285;
    MAVLINK_MSG_ID_AUTOPILOT_STATE_FOR_GIMBAL_DEVICE: 286;
    MAVLINK_MSG_ID_GIMBAL_MANAGER_SET_PITCHYAW: 287;
    MAVLINK_MSG_ID_GIMBAL_MANAGER_SET_MANUAL_CONTROL: 288;
    MAVLINK_MSG_ID_WIFI_CONFIG_AP: 299;
    MAVLINK_MSG_ID_AIS_VESSEL: 301;
    MAVLINK_MSG_ID_UAVCAN_NODE_STATUS: 310;
    MAVLINK_MSG_ID_UAVCAN_NODE_INFO: 311;
    MAVLINK_MSG_ID_PARAM_EXT_REQUEST_READ: 320;
    MAVLINK_MSG_ID_PARAM_EXT_REQUEST_LIST: 321;
    MAVLINK_MSG_ID_PARAM_EXT_VALUE: 322;
    MAVLINK_MSG_ID_PARAM_EXT_SET: 323;
    MAVLINK_MSG_ID_PARAM_EXT_ACK: 324;
    MAVLINK_MSG_ID_OBSTACLE_DISTANCE: 330;
    MAVLINK_MSG_ID_ODOMETRY: 331;
    MAVLINK_MSG_ID_TRAJECTORY_REPRESENTATION_WAYPOINTS: 332;
    MAVLINK_MSG_ID_TRAJECTORY_REPRESENTATION_BEZIER: 333;
    MAVLINK_MSG_ID_ISBD_LINK_STATUS: 335;
    MAVLINK_MSG_ID_RAW_RPM: 339;
    MAVLINK_MSG_ID_UTM_GLOBAL_POSITION: 340;
    MAVLINK_MSG_ID_DEBUG_FLOAT_ARRAY: 350;
    MAVLINK_MSG_ID_SMART_BATTERY_INFO: 370;
    MAVLINK_MSG_ID_GENERATOR_STATUS: 373;
    MAVLINK_MSG_ID_ACTUATOR_OUTPUT_STATUS: 375;
    MAVLINK_MSG_ID_RELAY_STATUS: 376;
    MAVLINK_MSG_ID_TUNNEL: 385;
    MAVLINK_MSG_ID_CAN_FRAME: 386;
    MAVLINK_MSG_ID_CANFD_FRAME: 387;
    MAVLINK_MSG_ID_CAN_FILTER_MODIFY: 388;
    MAVLINK_MSG_ID_WHEEL_DISTANCE: 9000;
    MAVLINK_MSG_ID_WINCH_STATUS: 9005;
    MAVLINK_MSG_ID_OPEN_DRONE_ID_BASIC_ID: 12900;
    MAVLINK_MSG_ID_OPEN_DRONE_ID_LOCATION: 12901;
    MAVLINK_MSG_ID_OPEN_DRONE_ID_AUTHENTICATION: 12902;
    MAVLINK_MSG_ID_OPEN_DRONE_ID_SELF_ID: 12903;
    MAVLINK_MSG_ID_OPEN_DRONE_ID_SYSTEM: 12904;
    MAVLINK_MSG_ID_OPEN_DRONE_ID_OPERATOR_ID: 12905;
    MAVLINK_MSG_ID_OPEN_DRONE_ID_ARM_STATUS: 12918;
    MAVLINK_MSG_ID_OPEN_DRONE_ID_MESSAGE_PACK: 12915;
    MAVLINK_MSG_ID_OPEN_DRONE_ID_SYSTEM_UPDATE: 12919;
    MAVLINK_MSG_ID_HYGROMETER_SENSOR: 12920;
    MAVLINK_MSG_ID_MISSION_CHECKSUM: 53;
    MAVLINK_MSG_ID_AIRSPEED: 295;
    MAVLINK_MSG_ID_RADIO_RC_CHANNELS: 420;
    MAVLINK_MSG_ID_AVAILABLE_MODES: 435;
    MAVLINK_MSG_ID_CURRENT_MODE: 436;
    MAVLINK_MSG_ID_AVAILABLE_MODES_MONITOR: 437;
    MAVLINK_MSG_ID_GNSS_INTEGRITY: 441;
    MAVLINK_MSG_ID_ICAROUS_HEARTBEAT: 42000;
    MAVLINK_MSG_ID_ICAROUS_KINEMATIC_BANDS: 42001;
    MAVLINK_MSG_ID_HEARTBEAT: 0;
    MAVLINK_MSG_ID_ARRAY_TEST_0: 17150;
    MAVLINK_MSG_ID_ARRAY_TEST_1: 17151;
    MAVLINK_MSG_ID_ARRAY_TEST_3: 17153;
    MAVLINK_MSG_ID_ARRAY_TEST_4: 17154;
    MAVLINK_MSG_ID_ARRAY_TEST_5: 17155;
    MAVLINK_MSG_ID_ARRAY_TEST_6: 17156;
    MAVLINK_MSG_ID_ARRAY_TEST_7: 17157;
    MAVLINK_MSG_ID_ARRAY_TEST_8: 17158;
    MAVLINK_MSG_ID_TEST_TYPES: 17000;
    MAVLINK_MSG_ID_NAV_FILTER_BIAS: 220;
    MAVLINK_MSG_ID_RADIO_CALIBRATION: 221;
    MAVLINK_MSG_ID_UALBERTA_SYS_STATUS: 222;
    MAVLINK_MSG_ID_UAVIONIX_ADSB_OUT_CFG: 10001;
    MAVLINK_MSG_ID_UAVIONIX_ADSB_OUT_DYNAMIC: 10002;
    MAVLINK_MSG_ID_UAVIONIX_ADSB_TRANSCEIVER_HEALTH_REPORT: 10003;
    MAVLINK_MSG_ID_UAVIONIX_ADSB_OUT_CFG_REGISTRATION: 10004;
    MAVLINK_MSG_ID_UAVIONIX_ADSB_OUT_CFG_FLIGHTID: 10005;
    MAVLINK_MSG_ID_UAVIONIX_ADSB_GET: 10006;
    MAVLINK_MSG_ID_UAVIONIX_ADSB_OUT_CONTROL: 10007;
    MAVLINK_MSG_ID_UAVIONIX_ADSB_OUT_STATUS: 10008;
    MAVLINK_MSG_ID_LOWEHEISER_GOV_EFI: 10151;
    MAVLINK_MSG_ID_STORM32_GIMBAL_MANAGER_INFORMATION: 60010;
    MAVLINK_MSG_ID_STORM32_GIMBAL_MANAGER_STATUS: 60011;
    MAVLINK_MSG_ID_STORM32_GIMBAL_MANAGER_CONTROL: 60012;
    MAVLINK_MSG_ID_STORM32_GIMBAL_MANAGER_CONTROL_PITCHYAW: 60013;
    MAVLINK_MSG_ID_STORM32_GIMBAL_MANAGER_CORRECT_ROLL: 60014;
    MAVLINK_MSG_ID_QSHOT_STATUS: 60020;
    MAVLINK_MSG_ID_AUTOPILOT_STATE_FOR_GIMBAL_DEVICE_EXT: 60000;
    MAVLINK_MSG_ID_FRSKY_PASSTHROUGH_ARRAY: 60040;
    MAVLINK_MSG_ID_PARAM_VALUE_ARRAY: 60041;
    MAVLINK_MSG_ID_MLRS_RADIO_LINK_STATS: 60045;
    MAVLINK_MSG_ID_MLRS_RADIO_LINK_INFORMATION: 60046;
    MAVLINK_MSG_ID_MLRS_RADIO_LINK_FLOW_CONTROL: 60047;
    MAVLINK_MSG_ID_AVSS_PRS_SYS_STATUS: 60050;
    MAVLINK_MSG_ID_AVSS_DRONE_POSITION: 60051;
    MAVLINK_MSG_ID_AVSS_DRONE_IMU: 60052;
    MAVLINK_MSG_ID_AVSS_DRONE_OPERATION_MODE: 60053;
    MAVLINK_MSG_ID_CUBEPILOT_RAW_RC: 50001;
    MAVLINK_MSG_ID_HERELINK_VIDEO_STREAM_INFORMATION: 50002;
    MAVLINK_MSG_ID_HERELINK_TELEM: 50003;
    MAVLINK_MSG_ID_CUBEPILOT_FIRMWARE_UPDATE_START: 50004;
    MAVLINK_MSG_ID_CUBEPILOT_FIRMWARE_UPDATE_RESP: 50005;
    MAVLINK_MSG_ID_AIRLINK_AUTH: 52000;
    MAVLINK_MSG_ID_AIRLINK_AUTH_RESPONSE: 52001;
}
export declare const mavlink20: Runtime;
