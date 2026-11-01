// Port contract for the A32NX flight computers, recovered from
// fbw-a32nx/src/wasm/fbw_a320/src/interface/SimConnectData.h (196 lines, 152 fields).
// GPLv3. Field names and units are upstream verbatim; MSFS SDK types replaced.
// Units are the name suffix. Never convert inside the computers.

export interface Vec3 { x: number; y: number; z: number }          // body axes
export interface LatLonAlt { lat: number; lon: number; alt: number }

// world -> computers
export interface SimData {
  nz_g: number;
  Theta_deg: number;
  Phi_deg: number;
  bodyRotationVelocity: Vec3;
  bodyRotationAcceleration: Vec3;
  bx_m_s2: number;
  by_m_s2: number;
  bz_m_s2: number;
  Psi_magnetic_deg: number;
  Psi_true_deg: number;
  Psi_magnetic_track_deg: number;
  eta_pos: number;
  eta_trim_deg: number;
  xi_pos: number;
  zeta_pos: number;
  zeta_trim_pos: number;
  alpha_deg: number;
  beta_deg: number;
  beta_dot_deg_s: number;
  V_ias_kn: number;
  V_tas_kn: number;
  V_mach: number;
  V_gnd_kn: number;
  H_ft: number;
  H_ind_ft: number;
  H_radio_ft: number;
  H_dot_fpm: number;
  CG_percent_MAC: number;
  total_weight_kg: number;
  gear_animation_pos_0: number;
  gear_animation_pos_1: number;
  gear_animation_pos_2: number;
  spoilers_handle_position: number;
  spoilers_left_pos: number;
  spoilers_right_pos: number;
  slew_on: boolean;
  autopilot_master_on: boolean;
  ap_fd_1_active: boolean;
  ap_fd_2_active: boolean;
  ap_V_c_kn: number;
  ap_H_c_ft: number;
  simulationTime: number;
  simulation_rate: number;
  ice_structure_percent: number;
  linear_cl_alpha_per_deg: number;
  alpha_stall_deg: number;
  alpha_zero_lift_deg: number;
  ambient_density_kg_per_m3: number;
  ambient_pressure_mbar: number;
  ambient_temperature_celsius: number;
  ambient_wind_x_kn: number;
  ambient_wind_y_kn: number;
  ambient_wind_z_kn: number;
  ambient_wind_velocity_kn: number;
  ambient_wind_direction_deg: number;
  total_air_temperature_celsius: number;
  latitude_deg: number;
  longitude_deg: number;
  throttle_lever_1_pos: number;
  throttle_lever_2_pos: number;
  engine_1_thrust_lbf: number;
  engine_2_thrust_lbf: number;
  nav_valid: boolean;
  nav_loc_deg: number;
  nav_gs_deg: number;
  nav_dme_valid: boolean;
  nav_dme_nmi: number;
  nav_loc_valid: boolean;
  nav_loc_error_deg: number;
  nav_gs_valid: boolean;
  nav_gs_error_deg: number;
  isAutoThrottleActive: boolean;
  engine_n1_1: number;
  engine_n1_2: number;
  gpsIsFlightPlanActive: number;
  gpsWpCrossTrack: number;
  gpsWpTrackAngleError: number;
  gpsCourseToSteer: number;
  commanded_engine_N1_1_percent: number;
  commanded_engine_N1_2_percent: number;
  engine_N1_1_percent: number;
  engine_N1_2_percent: number;
  corrected_engine_N1_1_percent: number;
  corrected_engine_N1_2_percent: number;
  engineEngineOilTemperature_1: number;
  engineEngineOilTemperature_2: number;
  engineEngineOilPressure_1: number;
  engineEngineOilPressure_2: number;
  engine_combustion_1: boolean;
  engine_combustion_2: boolean;
  is_mach_mode_active: boolean;
  speed_slot_index: number;
  engineAntiIce_1: boolean;
  engineAntiIce_2: boolean;
  simOnGround: boolean;
  kohlsmanSetting_1: number;
  kohlsmanSetting_2: number;
  kohlsmanSettingStd_4: number;
  cameraState: number;
  altitude_m: number;
  nav_loc_magvar_deg: number;
  nav_loc_pos: LatLonAlt;
  nav_gs_pos: LatLonAlt;
  brakeLeftPosition: number;
  brakeRightPosition: number;
  flapsHandleIndex: number;
  gearHandlePosition: number;
  assistanceTakeoffEnabled: boolean;
  assistanceLandingEnabled: boolean;
  aiAutoTrimActive: boolean;
  aiControlsActive: boolean;
  wheelRpmLeft: number;
  wheelRpmRight: number;
  seaLevelPressure: number;
}

// computers -> world
export interface In {
  inputs: [number, number, number];   // pitch, roll, yaw stick
}

// computers -> world
export interface InRudderTrim {
  rudderTrimSwitchLeft: number;
  rudderTrimSwitchRight: number;
  rudderTrimReset: number;
}

// computers -> world
export interface InAutopilot {
  AP_engage: number;
  AP_1_push: number;
  AP_2_push: number;
  AP_disconnect: number;
  HDG_push: number;
  HDG_pull: number;
  ALT_push: number;
  ALT_pull: number;
  VS_push: number;
  VS_pull: number;
  LOC_push: number;
  APPR_push: number;
  EXPED_push: number;
  DIR_TO_trigger: number;
  mach_mode_activate: number;
  spd_mode_activate: number;
  preset_spd_activate: number;
  baro_left_set: number;
  baro_right_set: number;
  SPD_MACH_set: number;
  HDG_TRK_set: number;
  ALT_set: number;
  VS_FPA_set: number;
}

// computers -> world
export interface InThrottles {
  ATHR_push: number;
  ATHR_disconnect: number;
  ATHR_reset_disable: number;
}

// computers -> world
export interface OutZetaTrim {
  zeta_trim_pos: number;
}

// computers -> world
export interface OutThrottles {
  throttleLeverPosition_1: number;
  throttleLeverPosition_2: number;
  throttleManagedMode_1: number;
  throttleManagedMode_2: number;
}

// computers -> world
export interface OutFlaps {
  flapsHandleIndex: number;
}

// computers -> world
export interface OutSpoilers {
  spoilersHandlePosition: number;
}

// computers -> world
export interface OutAltimeter {
  kohlsmanSettingStd: number;
}


