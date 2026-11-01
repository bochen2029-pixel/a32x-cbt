// Bus contract for the A32NX flight computers. Generated from
// fbw-a32nx/src/wasm/fbw_a320/src/model/*_types.h. GPLv3.
// 111 structs, 1,742 fields. Plain C, no simulator dependency.
#pragma once

#ifndef RTWTYPES_H
#define RTWTYPES_H

#if (!defined(__cplusplus))
#ifndef false
#define false                          (0U)
#endif

#ifndef true
#define true                           (1U)
#endif
#endif

typedef signed char int8_T;
typedef unsigned char uint8_T;
typedef short int16_T;
typedef unsigned short uint16_T;
typedef int int32_T;
typedef unsigned int uint32_T;
typedef float real32_T;
typedef double real64_T;
typedef double real_T;
typedef double time_T;
typedef unsigned char boolean_T;
typedef int int_T;
typedef unsigned int uint_T;
typedef unsigned long ulong_T;
typedef char char_T;
typedef unsigned char uchar_T;
typedef char_T byte_T;

#define MAX_int8_T                     ((int8_T)(127))
#define MIN_int8_T                     ((int8_T)(-128))
#define MAX_uint8_T                    ((uint8_T)(255U))
#define MAX_int16_T                    ((int16_T)(32767))
#define MIN_int16_T                    ((int16_T)(-32768))
#define MAX_uint16_T                   ((uint16_T)(65535U))
#define MAX_int32_T                    ((int32_T)(2147483647))
#define MIN_int32_T                    ((int32_T)(-2147483647-1))
#define MAX_uint32_T                   ((uint32_T)(0xFFFFFFFFU))

typedef void * pointer_T;

#endif


// ---- ElacComputer_types.h
#ifndef ElacComputer_types_h_
#define ElacComputer_types_h_
#ifndef DEFINED_TYPEDEF_FOR_pitch_efcs_law_
#define DEFINED_TYPEDEF_FOR_pitch_efcs_law_

enum class pitch_efcs_law
  : int32_T {
  NormalLaw = 0,
  AlternateLaw1,
  AlternateLaw2,
  DirectLaw,
  None
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_SignStatusMatrix_
#define DEFINED_TYPEDEF_FOR_SignStatusMatrix_

enum class SignStatusMatrix
  : int32_T {
  FailureWarning = 0,
  NoComputedData,
  FunctionalTest,
  NormalOperation
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_lateral_efcs_law_
#define DEFINED_TYPEDEF_FOR_lateral_efcs_law_

enum class lateral_efcs_law
  : int32_T {
  NormalLaw = 0,
  DirectLaw,
  None
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_arinc_429_
#define DEFINED_TYPEDEF_FOR_base_arinc_429_

struct base_arinc_429
{
  uint32_T SSM;
  real32_T Data;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_time_
#define DEFINED_TYPEDEF_FOR_base_time_

struct base_time
{
  real_T dt;
  real_T simulation_time;
  real_T monotonic_time;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sim_data_
#define DEFINED_TYPEDEF_FOR_base_sim_data_

struct base_sim_data
{
  boolean_T slew_on;
  boolean_T pause_on;
  boolean_T tracking_mode_on_override;
  boolean_T tailstrike_protection_on;
  boolean_T computer_running;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_discrete_inputs_
#define DEFINED_TYPEDEF_FOR_base_elac_discrete_inputs_

struct base_elac_discrete_inputs
{
  boolean_T ground_spoilers_active_1;
  boolean_T ground_spoilers_active_2;
  boolean_T is_unit_1;
  boolean_T is_unit_2;
  boolean_T opp_axis_pitch_failure;
  boolean_T ap_1_disengaged;
  boolean_T ap_2_disengaged;
  boolean_T opp_left_aileron_lost;
  boolean_T opp_right_aileron_lost;
  boolean_T fac_1_yaw_control_lost;
  boolean_T lgciu_1_nose_gear_pressed;
  boolean_T lgciu_2_nose_gear_pressed;
  boolean_T fac_2_yaw_control_lost;
  boolean_T lgciu_1_right_main_gear_pressed;
  boolean_T lgciu_2_right_main_gear_pressed;
  boolean_T lgciu_1_left_main_gear_pressed;
  boolean_T lgciu_2_left_main_gear_pressed;
  boolean_T ths_motor_fault;
  boolean_T sfcc_1_slats_out;
  boolean_T sfcc_2_slats_out;
  boolean_T l_ail_servo_failed;
  boolean_T l_elev_servo_failed;
  boolean_T r_ail_servo_failed;
  boolean_T r_elev_servo_failed;
  boolean_T ths_override_active;
  boolean_T yellow_low_pressure;
  boolean_T capt_priority_takeover_pressed;
  boolean_T fo_priority_takeover_pressed;
  boolean_T blue_low_pressure;
  boolean_T green_low_pressure;
  boolean_T elac_engaged_from_switch;
  boolean_T normal_powersupply_lost;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_analog_inputs_
#define DEFINED_TYPEDEF_FOR_base_elac_analog_inputs_

struct base_elac_analog_inputs
{
  real_T capt_pitch_stick_pos;
  real_T fo_pitch_stick_pos;
  real_T capt_roll_stick_pos;
  real_T fo_roll_stick_pos;
  real_T left_elevator_pos_deg;
  real_T right_elevator_pos_deg;
  real_T ths_pos_deg;
  real_T left_aileron_pos_deg;
  real_T right_aileron_pos_deg;
  real_T rudder_pedal_pos;
  real_T load_factor_acc_1_g;
  real_T load_factor_acc_2_g;
  real_T blue_hyd_pressure_psi;
  real_T green_hyd_pressure_psi;
  real_T yellow_hyd_pressure_psi;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_adr_bus_
#define DEFINED_TYPEDEF_FOR_base_adr_bus_

struct base_adr_bus
{
  base_arinc_429 altitude_standard_ft;
  base_arinc_429 altitude_corrected_1_ft;
  base_arinc_429 altitude_corrected_2_ft;
  base_arinc_429 mach;
  base_arinc_429 airspeed_computed_kn;
  base_arinc_429 airspeed_true_kn;
  base_arinc_429 vertical_speed_ft_min;
  base_arinc_429 aoa_corrected_deg;
  base_arinc_429 corrected_average_static_pressure;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_ir_bus_
#define DEFINED_TYPEDEF_FOR_base_ir_bus_

struct base_ir_bus
{
  base_arinc_429 discrete_word_1;
  base_arinc_429 latitude_deg;
  base_arinc_429 longitude_deg;
  base_arinc_429 ground_speed_kn;
  base_arinc_429 track_angle_true_deg;
  base_arinc_429 heading_true_deg;
  base_arinc_429 wind_speed_kn;
  base_arinc_429 wind_direction_true_deg;
  base_arinc_429 track_angle_magnetic_deg;
  base_arinc_429 heading_magnetic_deg;
  base_arinc_429 drift_angle_deg;
  base_arinc_429 flight_path_angle_deg;
  base_arinc_429 flight_path_accel_g;
  base_arinc_429 pitch_angle_deg;
  base_arinc_429 roll_angle_deg;
  base_arinc_429 body_pitch_rate_deg_s;
  base_arinc_429 body_roll_rate_deg_s;
  base_arinc_429 body_yaw_rate_deg_s;
  base_arinc_429 body_long_accel_g;
  base_arinc_429 body_lat_accel_g;
  base_arinc_429 body_normal_accel_g;
  base_arinc_429 track_angle_rate_deg_s;
  base_arinc_429 pitch_att_rate_deg_s;
  base_arinc_429 roll_att_rate_deg_s;
  base_arinc_429 inertial_alt_ft;
  base_arinc_429 along_track_horiz_acc_g;
  base_arinc_429 cross_track_horiz_acc_g;
  base_arinc_429 vertical_accel_g;
  base_arinc_429 inertial_vertical_speed_ft_s;
  base_arinc_429 north_south_velocity_kn;
  base_arinc_429 east_west_velocity_kn;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_b_bus_
#define DEFINED_TYPEDEF_FOR_base_fmgc_b_bus_

struct base_fmgc_b_bus
{
  base_arinc_429 fac_weight_lbs;
  base_arinc_429 fm_weight_lbs;
  base_arinc_429 fac_cg_percent;
  base_arinc_429 fm_cg_percent;
  base_arinc_429 fg_radio_height_ft;
  base_arinc_429 discrete_word_4;
  base_arinc_429 ats_discrete_word;
  base_arinc_429 discrete_word_3;
  base_arinc_429 discrete_word_1;
  base_arinc_429 discrete_word_2;
  base_arinc_429 approach_spd_target_kn;
  base_arinc_429 delta_p_ail_cmd_deg;
  base_arinc_429 delta_p_splr_cmd_deg;
  base_arinc_429 delta_r_cmd_deg;
  base_arinc_429 delta_nose_wheel_cmd_deg;
  base_arinc_429 delta_q_cmd_deg;
  base_arinc_429 n1_left_percent;
  base_arinc_429 n1_right_percent;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_ra_bus_
#define DEFINED_TYPEDEF_FOR_base_ra_bus_

struct base_ra_bus
{
  base_arinc_429 radio_height_ft;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sfcc_bus_
#define DEFINED_TYPEDEF_FOR_base_sfcc_bus_

struct base_sfcc_bus
{
  base_arinc_429 slat_flap_component_status_word;
  base_arinc_429 slat_flap_system_status_word;
  base_arinc_429 slat_flap_actual_position_word;
  base_arinc_429 slat_actual_position_deg;
  base_arinc_429 flap_actual_position_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcdc_bus_
#define DEFINED_TYPEDEF_FOR_base_fcdc_bus_

struct base_fcdc_bus
{
  base_arinc_429 efcs_status_word_1;
  base_arinc_429 efcs_status_word_2;
  base_arinc_429 efcs_status_word_3;
  base_arinc_429 efcs_status_word_4;
  base_arinc_429 efcs_status_word_5;
  base_arinc_429 capt_roll_command_deg;
  base_arinc_429 fo_roll_command_deg;
  base_arinc_429 rudder_pedal_position_deg;
  base_arinc_429 capt_pitch_command_deg;
  base_arinc_429 fo_pitch_command_deg;
  base_arinc_429 aileron_left_pos_deg;
  base_arinc_429 elevator_left_pos_deg;
  base_arinc_429 aileron_right_pos_deg;
  base_arinc_429 elevator_right_pos_deg;
  base_arinc_429 horiz_stab_trim_pos_deg;
  base_arinc_429 spoiler_1_left_pos_deg;
  base_arinc_429 spoiler_2_left_pos_deg;
  base_arinc_429 spoiler_3_left_pos_deg;
  base_arinc_429 spoiler_4_left_pos_deg;
  base_arinc_429 spoiler_5_left_pos_deg;
  base_arinc_429 spoiler_1_right_pos_deg;
  base_arinc_429 spoiler_2_right_pos_deg;
  base_arinc_429 spoiler_3_right_pos_deg;
  base_arinc_429 spoiler_4_right_pos_deg;
  base_arinc_429 spoiler_5_right_pos_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_out_bus_
#define DEFINED_TYPEDEF_FOR_base_sec_out_bus_

struct base_sec_out_bus
{
  base_arinc_429 left_spoiler_1_position_deg;
  base_arinc_429 right_spoiler_1_position_deg;
  base_arinc_429 left_spoiler_2_position_deg;
  base_arinc_429 right_spoiler_2_position_deg;
  base_arinc_429 left_elevator_position_deg;
  base_arinc_429 right_elevator_position_deg;
  base_arinc_429 ths_position_deg;
  base_arinc_429 left_sidestick_pitch_command_deg;
  base_arinc_429 right_sidestick_pitch_command_deg;
  base_arinc_429 left_sidestick_roll_command_deg;
  base_arinc_429 right_sidestick_roll_command_deg;
  base_arinc_429 speed_brake_lever_command_deg;
  base_arinc_429 speed_brake_command_deg;
  base_arinc_429 thrust_lever_angle_1_deg;
  base_arinc_429 thrust_lever_angle_2_deg;
  base_arinc_429 discrete_status_word_1;
  base_arinc_429 discrete_status_word_2;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_out_bus_
#define DEFINED_TYPEDEF_FOR_base_elac_out_bus_

struct base_elac_out_bus
{
  base_arinc_429 left_aileron_position_deg;
  base_arinc_429 right_aileron_position_deg;
  base_arinc_429 left_elevator_position_deg;
  base_arinc_429 right_elevator_position_deg;
  base_arinc_429 ths_position_deg;
  base_arinc_429 left_sidestick_pitch_command_deg;
  base_arinc_429 right_sidestick_pitch_command_deg;
  base_arinc_429 left_sidestick_roll_command_deg;
  base_arinc_429 right_sidestick_roll_command_deg;
  base_arinc_429 rudder_pedal_position_deg;
  base_arinc_429 aileron_command_deg;
  base_arinc_429 roll_spoiler_command_deg;
  base_arinc_429 yaw_damper_command_deg;
  base_arinc_429 elevator_double_pressurization_command_deg;
  base_arinc_429 speedbrake_extension_deg;
  base_arinc_429 discrete_status_word_1;
  base_arinc_429 discrete_status_word_2;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_bus_inputs_
#define DEFINED_TYPEDEF_FOR_base_elac_bus_inputs_

struct base_elac_bus_inputs
{
  base_adr_bus adr_1_bus;
  base_adr_bus adr_2_bus;
  base_adr_bus adr_3_bus;
  base_ir_bus ir_1_bus;
  base_ir_bus ir_2_bus;
  base_ir_bus ir_3_bus;
  base_fmgc_b_bus fmgc_1_bus;
  base_fmgc_b_bus fmgc_2_bus;
  base_ra_bus ra_1_bus;
  base_ra_bus ra_2_bus;
  base_sfcc_bus sfcc_1_bus;
  base_sfcc_bus sfcc_2_bus;
  base_fcdc_bus fcdc_1_bus;
  base_fcdc_bus fcdc_2_bus;
  base_sec_out_bus sec_1_bus;
  base_sec_out_bus sec_2_bus;
  base_elac_out_bus elac_opp_bus;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_elac_inputs_
#define DEFINED_TYPEDEF_FOR_elac_inputs_

struct elac_inputs
{
  base_time time;
  base_sim_data sim_data;
  base_elac_discrete_inputs discrete_inputs;
  base_elac_analog_inputs analog_inputs;
  base_elac_bus_inputs bus_inputs;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_lateral_law_outputs_
#define DEFINED_TYPEDEF_FOR_base_elac_lateral_law_outputs_

struct base_elac_lateral_law_outputs
{
  real_T left_aileron_command_deg;
  real_T right_aileron_command_deg;
  real_T roll_spoiler_command_deg;
  real_T yaw_damper_command_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_pitch_law_outputs_
#define DEFINED_TYPEDEF_FOR_base_elac_pitch_law_outputs_

struct base_elac_pitch_law_outputs
{
  real_T elevator_command_deg;
  real_T ths_command_deg;
  boolean_T elevator_double_pressurization_active;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_laws_outputs_
#define DEFINED_TYPEDEF_FOR_base_elac_laws_outputs_

struct base_elac_laws_outputs
{
  base_elac_lateral_law_outputs lateral_law_outputs;
  base_elac_pitch_law_outputs pitch_law_outputs;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_adr_computation_data_
#define DEFINED_TYPEDEF_FOR_base_elac_adr_computation_data_

struct base_elac_adr_computation_data
{
  real_T V_ias_kn;
  real_T V_tas_kn;
  real_T mach;
  real_T alpha_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_ir_computation_data_
#define DEFINED_TYPEDEF_FOR_base_elac_ir_computation_data_

struct base_elac_ir_computation_data
{
  real_T theta_deg;
  real_T phi_deg;
  real_T q_deg_s;
  real_T r_deg_s;
  real_T n_x_g;
  real_T n_y_g;
  real_T n_z_g;
  real_T theta_dot_deg_s;
  real_T phi_dot_deg_s;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_logic_outputs_
#define DEFINED_TYPEDEF_FOR_base_elac_logic_outputs_

struct base_elac_logic_outputs
{
  boolean_T on_ground;
  boolean_T pitch_law_in_flight;
  boolean_T tracking_mode_on;
  lateral_efcs_law lateral_law_capability;
  lateral_efcs_law active_lateral_law;
  pitch_efcs_law pitch_law_capability;
  pitch_efcs_law active_pitch_law;
  boolean_T abnormal_condition_law_active;
  boolean_T is_engaged_in_pitch;
  boolean_T can_engage_in_pitch;
  boolean_T has_priority_in_pitch;
  boolean_T left_elevator_avail;
  boolean_T right_elevator_avail;
  boolean_T ths_avail;
  boolean_T ths_active_commanded;
  boolean_T ths_ground_setting_active;
  boolean_T is_engaged_in_roll;
  boolean_T can_engage_in_roll;
  boolean_T has_priority_in_roll;
  boolean_T left_aileron_crosscommand_active;
  boolean_T right_aileron_crosscommand_active;
  boolean_T left_aileron_avail;
  boolean_T right_aileron_avail;
  boolean_T aileron_droop_active;
  boolean_T aileron_antidroop_active;
  boolean_T is_yellow_hydraulic_power_avail;
  boolean_T is_blue_hydraulic_power_avail;
  boolean_T is_green_hydraulic_power_avail;
  boolean_T left_sidestick_disabled;
  boolean_T right_sidestick_disabled;
  boolean_T left_sidestick_priority_locked;
  boolean_T right_sidestick_priority_locked;
  real_T total_sidestick_pitch_command;
  real_T total_sidestick_roll_command;
  boolean_T ap_authorised;
  boolean_T ap_1_control;
  boolean_T ap_2_control;
  boolean_T protection_ap_disconnect;
  boolean_T high_alpha_prot_active;
  real_T alpha_prot_deg;
  real_T alpha_max_deg;
  boolean_T high_speed_prot_active;
  real_T high_speed_prot_lo_thresh_kn;
  real_T high_speed_prot_hi_thresh_kn;
  boolean_T double_adr_failure;
  boolean_T triple_adr_failure;
  boolean_T cas_or_mach_disagree;
  boolean_T alpha_disagree;
  boolean_T double_ir_failure;
  boolean_T triple_ir_failure;
  boolean_T ir_failure_not_self_detected;
  base_elac_adr_computation_data adr_computation_data;
  base_elac_ir_computation_data ir_computation_data;
  real_T ra_computation_data_ft;
  boolean_T dual_ra_failure;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_discrete_outputs_
#define DEFINED_TYPEDEF_FOR_base_elac_discrete_outputs_

struct base_elac_discrete_outputs
{
  boolean_T pitch_axis_ok;
  boolean_T left_aileron_ok;
  boolean_T right_aileron_ok;
  boolean_T digital_output_validated;
  boolean_T ap_1_authorised;
  boolean_T ap_2_authorised;
  boolean_T left_aileron_active_mode;
  boolean_T right_aileron_active_mode;
  boolean_T left_elevator_damping_mode;
  boolean_T right_elevator_damping_mode;
  boolean_T ths_active;
  boolean_T batt_power_supply;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_analog_outputs_
#define DEFINED_TYPEDEF_FOR_base_elac_analog_outputs_

struct base_elac_analog_outputs
{
  real_T left_elev_pos_order_deg;
  real_T right_elev_pos_order_deg;
  real_T ths_pos_order;
  real_T left_aileron_pos_order;
  real_T right_aileron_pos_order;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_elac_outputs_
#define DEFINED_TYPEDEF_FOR_elac_outputs_

struct elac_outputs
{
  elac_inputs data;
  base_elac_laws_outputs laws;
  base_elac_logic_outputs logic;
  base_elac_discrete_outputs discrete_outputs;
  base_elac_analog_outputs analog_outputs;
  base_elac_out_bus bus_outputs;
};

#endif
#endif


// ---- SecComputer_types.h
#ifndef SecComputer_types_h_
#define SecComputer_types_h_
#ifndef DEFINED_TYPEDEF_FOR_pitch_efcs_law_
#define DEFINED_TYPEDEF_FOR_pitch_efcs_law_

enum class pitch_efcs_law
  : int32_T {
  NormalLaw = 0,
  AlternateLaw1,
  AlternateLaw2,
  DirectLaw,
  None
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_SignStatusMatrix_
#define DEFINED_TYPEDEF_FOR_SignStatusMatrix_

enum class SignStatusMatrix
  : int32_T {
  FailureWarning = 0,
  NoComputedData,
  FunctionalTest,
  NormalOperation
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_arinc_429_
#define DEFINED_TYPEDEF_FOR_base_arinc_429_

struct base_arinc_429
{
  uint32_T SSM;
  real32_T Data;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_time_
#define DEFINED_TYPEDEF_FOR_base_time_

struct base_time
{
  real_T dt;
  real_T simulation_time;
  real_T monotonic_time;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sim_data_
#define DEFINED_TYPEDEF_FOR_base_sim_data_

struct base_sim_data
{
  boolean_T slew_on;
  boolean_T pause_on;
  boolean_T tracking_mode_on_override;
  boolean_T tailstrike_protection_on;
  boolean_T computer_running;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_discrete_inputs_
#define DEFINED_TYPEDEF_FOR_base_sec_discrete_inputs_

struct base_sec_discrete_inputs
{
  boolean_T sec_engaged_from_switch;
  boolean_T sec_in_emergency_powersupply;
  boolean_T is_unit_1;
  boolean_T is_unit_2;
  boolean_T is_unit_3;
  boolean_T pitch_not_avail_elac_1;
  boolean_T pitch_not_avail_elac_2;
  boolean_T left_elev_not_avail_sec_opp;
  boolean_T digital_output_failed_elac_1;
  boolean_T right_elev_not_avail_sec_opp;
  boolean_T green_low_pressure;
  boolean_T blue_low_pressure;
  boolean_T yellow_low_pressure;
  boolean_T sfcc_1_slats_out;
  boolean_T sfcc_2_slats_out;
  boolean_T digital_output_failed_elac_2;
  boolean_T ths_motor_fault;
  boolean_T l_elev_servo_failed;
  boolean_T r_elev_servo_failed;
  boolean_T l_spoiler_1_servo_failed;
  boolean_T r_spoiler_1_servo_failed;
  boolean_T l_spoiler_2_servo_failed;
  boolean_T r_spoiler_2_servo_failed;
  boolean_T ths_override_active;
  boolean_T capt_priority_takeover_pressed;
  boolean_T fo_priority_takeover_pressed;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_analog_inputs_
#define DEFINED_TYPEDEF_FOR_base_sec_analog_inputs_

struct base_sec_analog_inputs
{
  real_T capt_pitch_stick_pos;
  real_T fo_pitch_stick_pos;
  real_T capt_roll_stick_pos;
  real_T fo_roll_stick_pos;
  real_T spd_brk_lever_pos;
  real_T thr_lever_1_pos;
  real_T thr_lever_2_pos;
  real_T left_elevator_pos_deg;
  real_T right_elevator_pos_deg;
  real_T ths_pos_deg;
  real_T left_spoiler_1_pos_deg;
  real_T right_spoiler_1_pos_deg;
  real_T left_spoiler_2_pos_deg;
  real_T right_spoiler_2_pos_deg;
  real_T load_factor_acc_1_g;
  real_T load_factor_acc_2_g;
  real_T wheel_speed_left;
  real_T wheel_speed_right;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_adr_bus_
#define DEFINED_TYPEDEF_FOR_base_adr_bus_

struct base_adr_bus
{
  base_arinc_429 altitude_standard_ft;
  base_arinc_429 altitude_corrected_1_ft;
  base_arinc_429 altitude_corrected_2_ft;
  base_arinc_429 mach;
  base_arinc_429 airspeed_computed_kn;
  base_arinc_429 airspeed_true_kn;
  base_arinc_429 vertical_speed_ft_min;
  base_arinc_429 aoa_corrected_deg;
  base_arinc_429 corrected_average_static_pressure;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_ir_bus_
#define DEFINED_TYPEDEF_FOR_base_ir_bus_

struct base_ir_bus
{
  base_arinc_429 discrete_word_1;
  base_arinc_429 latitude_deg;
  base_arinc_429 longitude_deg;
  base_arinc_429 ground_speed_kn;
  base_arinc_429 track_angle_true_deg;
  base_arinc_429 heading_true_deg;
  base_arinc_429 wind_speed_kn;
  base_arinc_429 wind_direction_true_deg;
  base_arinc_429 track_angle_magnetic_deg;
  base_arinc_429 heading_magnetic_deg;
  base_arinc_429 drift_angle_deg;
  base_arinc_429 flight_path_angle_deg;
  base_arinc_429 flight_path_accel_g;
  base_arinc_429 pitch_angle_deg;
  base_arinc_429 roll_angle_deg;
  base_arinc_429 body_pitch_rate_deg_s;
  base_arinc_429 body_roll_rate_deg_s;
  base_arinc_429 body_yaw_rate_deg_s;
  base_arinc_429 body_long_accel_g;
  base_arinc_429 body_lat_accel_g;
  base_arinc_429 body_normal_accel_g;
  base_arinc_429 track_angle_rate_deg_s;
  base_arinc_429 pitch_att_rate_deg_s;
  base_arinc_429 roll_att_rate_deg_s;
  base_arinc_429 inertial_alt_ft;
  base_arinc_429 along_track_horiz_acc_g;
  base_arinc_429 cross_track_horiz_acc_g;
  base_arinc_429 vertical_accel_g;
  base_arinc_429 inertial_vertical_speed_ft_s;
  base_arinc_429 north_south_velocity_kn;
  base_arinc_429 east_west_velocity_kn;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_out_bus_
#define DEFINED_TYPEDEF_FOR_base_elac_out_bus_

struct base_elac_out_bus
{
  base_arinc_429 left_aileron_position_deg;
  base_arinc_429 right_aileron_position_deg;
  base_arinc_429 left_elevator_position_deg;
  base_arinc_429 right_elevator_position_deg;
  base_arinc_429 ths_position_deg;
  base_arinc_429 left_sidestick_pitch_command_deg;
  base_arinc_429 right_sidestick_pitch_command_deg;
  base_arinc_429 left_sidestick_roll_command_deg;
  base_arinc_429 right_sidestick_roll_command_deg;
  base_arinc_429 rudder_pedal_position_deg;
  base_arinc_429 aileron_command_deg;
  base_arinc_429 roll_spoiler_command_deg;
  base_arinc_429 yaw_damper_command_deg;
  base_arinc_429 elevator_double_pressurization_command_deg;
  base_arinc_429 speedbrake_extension_deg;
  base_arinc_429 discrete_status_word_1;
  base_arinc_429 discrete_status_word_2;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcdc_bus_
#define DEFINED_TYPEDEF_FOR_base_fcdc_bus_

struct base_fcdc_bus
{
  base_arinc_429 efcs_status_word_1;
  base_arinc_429 efcs_status_word_2;
  base_arinc_429 efcs_status_word_3;
  base_arinc_429 efcs_status_word_4;
  base_arinc_429 efcs_status_word_5;
  base_arinc_429 capt_roll_command_deg;
  base_arinc_429 fo_roll_command_deg;
  base_arinc_429 rudder_pedal_position_deg;
  base_arinc_429 capt_pitch_command_deg;
  base_arinc_429 fo_pitch_command_deg;
  base_arinc_429 aileron_left_pos_deg;
  base_arinc_429 elevator_left_pos_deg;
  base_arinc_429 aileron_right_pos_deg;
  base_arinc_429 elevator_right_pos_deg;
  base_arinc_429 horiz_stab_trim_pos_deg;
  base_arinc_429 spoiler_1_left_pos_deg;
  base_arinc_429 spoiler_2_left_pos_deg;
  base_arinc_429 spoiler_3_left_pos_deg;
  base_arinc_429 spoiler_4_left_pos_deg;
  base_arinc_429 spoiler_5_left_pos_deg;
  base_arinc_429 spoiler_1_right_pos_deg;
  base_arinc_429 spoiler_2_right_pos_deg;
  base_arinc_429 spoiler_3_right_pos_deg;
  base_arinc_429 spoiler_4_right_pos_deg;
  base_arinc_429 spoiler_5_right_pos_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sfcc_bus_
#define DEFINED_TYPEDEF_FOR_base_sfcc_bus_

struct base_sfcc_bus
{
  base_arinc_429 slat_flap_component_status_word;
  base_arinc_429 slat_flap_system_status_word;
  base_arinc_429 slat_flap_actual_position_word;
  base_arinc_429 slat_actual_position_deg;
  base_arinc_429 flap_actual_position_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_lgciu_bus_
#define DEFINED_TYPEDEF_FOR_base_lgciu_bus_

struct base_lgciu_bus
{
  base_arinc_429 discrete_word_1;
  base_arinc_429 discrete_word_2;
  base_arinc_429 discrete_word_3;
  base_arinc_429 discrete_word_4;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_bus_inputs_
#define DEFINED_TYPEDEF_FOR_base_sec_bus_inputs_

struct base_sec_bus_inputs
{
  base_adr_bus adr_1_bus;
  base_adr_bus adr_2_bus;
  base_ir_bus ir_1_bus;
  base_ir_bus ir_2_bus;
  base_elac_out_bus elac_1_bus;
  base_fcdc_bus fcdc_1_bus;
  base_fcdc_bus fcdc_2_bus;
  base_elac_out_bus elac_2_bus;
  base_sfcc_bus sfcc_1_bus;
  base_sfcc_bus sfcc_2_bus;
  base_lgciu_bus lgciu_1_bus;
  base_lgciu_bus lgciu_2_bus;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_sec_inputs_
#define DEFINED_TYPEDEF_FOR_sec_inputs_

struct sec_inputs
{
  base_time time;
  base_sim_data sim_data;
  base_sec_discrete_inputs discrete_inputs;
  base_sec_analog_inputs analog_inputs;
  base_sec_bus_inputs bus_inputs;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_lateral_law_outputs_
#define DEFINED_TYPEDEF_FOR_base_sec_lateral_law_outputs_

struct base_sec_lateral_law_outputs
{
  real_T left_spoiler_1_command_deg;
  real_T right_spoiler_1_command_deg;
  real_T left_spoiler_2_command_deg;
  real_T right_spoiler_2_command_deg;
  real_T speedbrake_command_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_pitch_law_outputs_
#define DEFINED_TYPEDEF_FOR_base_sec_pitch_law_outputs_

struct base_sec_pitch_law_outputs
{
  real_T elevator_command_deg;
  real_T ths_command_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_laws_outputs_
#define DEFINED_TYPEDEF_FOR_base_sec_laws_outputs_

struct base_sec_laws_outputs
{
  base_sec_lateral_law_outputs lateral_law_outputs;
  base_sec_pitch_law_outputs pitch_law_outputs;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_adr_computation_data_
#define DEFINED_TYPEDEF_FOR_base_sec_adr_computation_data_

struct base_sec_adr_computation_data
{
  real_T V_ias_kn;
  real_T V_tas_kn;
  real_T mach;
  real_T alpha_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_ir_computation_data_
#define DEFINED_TYPEDEF_FOR_base_sec_ir_computation_data_

struct base_sec_ir_computation_data
{
  real_T theta_deg;
  real_T phi_deg;
  real_T q_deg_s;
  real_T r_deg_s;
  real_T n_x_g;
  real_T n_y_g;
  real_T n_z_g;
  real_T theta_dot_deg_s;
  real_T phi_dot_deg_s;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_logic_outputs_
#define DEFINED_TYPEDEF_FOR_base_sec_logic_outputs_

struct base_sec_logic_outputs
{
  boolean_T on_ground;
  boolean_T pitch_law_in_flight;
  boolean_T tracking_mode_on;
  pitch_efcs_law pitch_law_capability;
  pitch_efcs_law active_pitch_law;
  boolean_T abnormal_condition_law_active;
  boolean_T is_engaged_in_pitch;
  boolean_T can_engage_in_pitch;
  boolean_T has_priority_in_pitch;
  boolean_T left_elevator_avail;
  boolean_T right_elevator_avail;
  boolean_T ths_avail;
  boolean_T ths_active_commanded;
  boolean_T ths_ground_setting_active;
  boolean_T is_engaged_in_roll;
  boolean_T spoiler_pair_1_avail;
  boolean_T spoiler_pair_2_avail;
  boolean_T is_yellow_hydraulic_power_avail;
  boolean_T is_blue_hydraulic_power_avail;
  boolean_T is_green_hydraulic_power_avail;
  boolean_T left_sidestick_disabled;
  boolean_T right_sidestick_disabled;
  boolean_T left_sidestick_priority_locked;
  boolean_T right_sidestick_priority_locked;
  real_T total_sidestick_pitch_command;
  real_T total_sidestick_roll_command;
  boolean_T ground_spoilers_armed;
  boolean_T ground_spoilers_out;
  boolean_T partial_lift_dumping_active;
  boolean_T speed_brake_inhibited;
  boolean_T single_adr_failure;
  boolean_T double_adr_failure;
  boolean_T cas_or_mach_disagree;
  boolean_T alpha_disagree;
  boolean_T single_ir_failure;
  boolean_T double_ir_failure;
  boolean_T ir_disagree;
  base_sec_adr_computation_data adr_computation_data;
  base_sec_ir_computation_data ir_computation_data;
  boolean_T any_landing_gear_not_uplocked;
  boolean_T lgciu_uplock_disagree_or_fault;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_discrete_outputs_
#define DEFINED_TYPEDEF_FOR_base_sec_discrete_outputs_

struct base_sec_discrete_outputs
{
  boolean_T thr_reverse_selected;
  boolean_T left_elevator_ok;
  boolean_T right_elevator_ok;
  boolean_T ground_spoiler_out;
  boolean_T sec_failed;
  boolean_T left_elevator_damping_mode;
  boolean_T right_elevator_damping_mode;
  boolean_T ths_active;
  boolean_T batt_power_supply;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_analog_outputs_
#define DEFINED_TYPEDEF_FOR_base_sec_analog_outputs_

struct base_sec_analog_outputs
{
  real_T left_elev_pos_order_deg;
  real_T right_elev_pos_order_deg;
  real_T ths_pos_order_deg;
  real_T left_spoiler_1_pos_order_deg;
  real_T right_spoiler_1_pos_order_deg;
  real_T left_spoiler_2_pos_order_deg;
  real_T right_spoiler_2_pos_order_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sec_out_bus_
#define DEFINED_TYPEDEF_FOR_base_sec_out_bus_

struct base_sec_out_bus
{
  base_arinc_429 left_spoiler_1_position_deg;
  base_arinc_429 right_spoiler_1_position_deg;
  base_arinc_429 left_spoiler_2_position_deg;
  base_arinc_429 right_spoiler_2_position_deg;
  base_arinc_429 left_elevator_position_deg;
  base_arinc_429 right_elevator_position_deg;
  base_arinc_429 ths_position_deg;
  base_arinc_429 left_sidestick_pitch_command_deg;
  base_arinc_429 right_sidestick_pitch_command_deg;
  base_arinc_429 left_sidestick_roll_command_deg;
  base_arinc_429 right_sidestick_roll_command_deg;
  base_arinc_429 speed_brake_lever_command_deg;
  base_arinc_429 speed_brake_command_deg;
  base_arinc_429 thrust_lever_angle_1_deg;
  base_arinc_429 thrust_lever_angle_2_deg;
  base_arinc_429 discrete_status_word_1;
  base_arinc_429 discrete_status_word_2;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_sec_outputs_
#define DEFINED_TYPEDEF_FOR_sec_outputs_

struct sec_outputs
{
  sec_inputs data;
  base_sec_laws_outputs laws;
  base_sec_logic_outputs logic;
  base_sec_discrete_outputs discrete_outputs;
  base_sec_analog_outputs analog_outputs;
  base_sec_out_bus bus_outputs;
};

#endif
#endif


// ---- FacComputer_types.h
#ifndef FacComputer_types_h_
#define FacComputer_types_h_
#ifndef DEFINED_TYPEDEF_FOR_SignStatusMatrix_
#define DEFINED_TYPEDEF_FOR_SignStatusMatrix_

enum class SignStatusMatrix
  : int32_T {
  FailureWarning = 0,
  NoComputedData,
  FunctionalTest,
  NormalOperation
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_arinc_429_
#define DEFINED_TYPEDEF_FOR_base_arinc_429_

struct base_arinc_429
{
  uint32_T SSM;
  real32_T Data;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fac_bus_
#define DEFINED_TYPEDEF_FOR_base_fac_bus_

struct base_fac_bus
{
  base_arinc_429 discrete_word_1;
  base_arinc_429 gamma_a_deg;
  base_arinc_429 gamma_t_deg;
  base_arinc_429 total_weight_lbs;
  base_arinc_429 center_of_gravity_pos_percent;
  base_arinc_429 sideslip_target_deg;
  base_arinc_429 fac_slat_angle_deg;
  base_arinc_429 fac_flap_angle_deg;
  base_arinc_429 discrete_word_2;
  base_arinc_429 rudder_travel_limit_command_deg;
  base_arinc_429 delta_r_yaw_damper_deg;
  base_arinc_429 estimated_sideslip_deg;
  base_arinc_429 v_alpha_lim_kn;
  base_arinc_429 v_ls_kn;
  base_arinc_429 v_stall_kn;
  base_arinc_429 v_alpha_prot_kn;
  base_arinc_429 v_stall_warn_kn;
  base_arinc_429 speed_trend_kn;
  base_arinc_429 v_3_kn;
  base_arinc_429 v_4_kn;
  base_arinc_429 v_man_kn;
  base_arinc_429 v_max_kn;
  base_arinc_429 v_fe_next_kn;
  base_arinc_429 discrete_word_3;
  base_arinc_429 discrete_word_4;
  base_arinc_429 discrete_word_5;
  base_arinc_429 delta_r_rudder_trim_deg;
  base_arinc_429 rudder_trim_pos_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fac_analog_outputs_
#define DEFINED_TYPEDEF_FOR_base_fac_analog_outputs_

struct base_fac_analog_outputs
{
  real_T yaw_damper_order_deg;
  real_T rudder_trim_order_deg;
  real_T rudder_travel_limit_order_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fac_discrete_outputs_
#define DEFINED_TYPEDEF_FOR_base_fac_discrete_outputs_

struct base_fac_discrete_outputs
{
  boolean_T fac_healthy;
  boolean_T yaw_damper_engaged;
  boolean_T rudder_trim_engaged;
  boolean_T rudder_travel_lim_engaged;
  boolean_T rudder_travel_lim_emergency_reset;
  boolean_T yaw_damper_avail_for_norm_law;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_time_
#define DEFINED_TYPEDEF_FOR_base_time_

struct base_time
{
  real_T dt;
  real_T simulation_time;
  real_T monotonic_time;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sim_data_
#define DEFINED_TYPEDEF_FOR_base_sim_data_

struct base_sim_data
{
  boolean_T slew_on;
  boolean_T pause_on;
  boolean_T tracking_mode_on_override;
  boolean_T tailstrike_protection_on;
  boolean_T computer_running;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fac_discrete_inputs_
#define DEFINED_TYPEDEF_FOR_base_fac_discrete_inputs_

struct base_fac_discrete_inputs
{
  boolean_T ap_own_engaged;
  boolean_T ap_opp_engaged;
  boolean_T yaw_damper_opp_engaged;
  boolean_T rudder_trim_opp_engaged;
  boolean_T rudder_travel_lim_opp_engaged;
  boolean_T elac_1_healthy;
  boolean_T elac_2_healthy;
  boolean_T engine_1_stopped;
  boolean_T engine_2_stopped;
  boolean_T rudder_trim_switch_left;
  boolean_T rudder_trim_switch_right;
  boolean_T rudder_trim_reset_button;
  boolean_T fac_engaged_from_switch;
  boolean_T fac_opp_healthy;
  boolean_T is_unit_1;
  boolean_T rudder_trim_actuator_healthy;
  boolean_T rudder_travel_lim_actuator_healthy;
  boolean_T slats_extended;
  boolean_T nose_gear_pressed;
  boolean_T ir_3_switch;
  boolean_T adr_3_switch;
  boolean_T yaw_damper_has_hyd_press;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fac_analog_inputs_
#define DEFINED_TYPEDEF_FOR_base_fac_analog_inputs_

struct base_fac_analog_inputs
{
  real_T yaw_damper_position_deg;
  real_T rudder_trim_position_deg;
  real_T rudder_travel_lim_position_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_adr_bus_
#define DEFINED_TYPEDEF_FOR_base_adr_bus_

struct base_adr_bus
{
  base_arinc_429 altitude_standard_ft;
  base_arinc_429 altitude_corrected_1_ft;
  base_arinc_429 altitude_corrected_2_ft;
  base_arinc_429 mach;
  base_arinc_429 airspeed_computed_kn;
  base_arinc_429 airspeed_true_kn;
  base_arinc_429 vertical_speed_ft_min;
  base_arinc_429 aoa_corrected_deg;
  base_arinc_429 corrected_average_static_pressure;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_ir_bus_
#define DEFINED_TYPEDEF_FOR_base_ir_bus_

struct base_ir_bus
{
  base_arinc_429 discrete_word_1;
  base_arinc_429 latitude_deg;
  base_arinc_429 longitude_deg;
  base_arinc_429 ground_speed_kn;
  base_arinc_429 track_angle_true_deg;
  base_arinc_429 heading_true_deg;
  base_arinc_429 wind_speed_kn;
  base_arinc_429 wind_direction_true_deg;
  base_arinc_429 track_angle_magnetic_deg;
  base_arinc_429 heading_magnetic_deg;
  base_arinc_429 drift_angle_deg;
  base_arinc_429 flight_path_angle_deg;
  base_arinc_429 flight_path_accel_g;
  base_arinc_429 pitch_angle_deg;
  base_arinc_429 roll_angle_deg;
  base_arinc_429 body_pitch_rate_deg_s;
  base_arinc_429 body_roll_rate_deg_s;
  base_arinc_429 body_yaw_rate_deg_s;
  base_arinc_429 body_long_accel_g;
  base_arinc_429 body_lat_accel_g;
  base_arinc_429 body_normal_accel_g;
  base_arinc_429 track_angle_rate_deg_s;
  base_arinc_429 pitch_att_rate_deg_s;
  base_arinc_429 roll_att_rate_deg_s;
  base_arinc_429 inertial_alt_ft;
  base_arinc_429 along_track_horiz_acc_g;
  base_arinc_429 cross_track_horiz_acc_g;
  base_arinc_429 vertical_accel_g;
  base_arinc_429 inertial_vertical_speed_ft_s;
  base_arinc_429 north_south_velocity_kn;
  base_arinc_429 east_west_velocity_kn;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_b_bus_
#define DEFINED_TYPEDEF_FOR_base_fmgc_b_bus_

struct base_fmgc_b_bus
{
  base_arinc_429 fac_weight_lbs;
  base_arinc_429 fm_weight_lbs;
  base_arinc_429 fac_cg_percent;
  base_arinc_429 fm_cg_percent;
  base_arinc_429 fg_radio_height_ft;
  base_arinc_429 discrete_word_4;
  base_arinc_429 ats_discrete_word;
  base_arinc_429 discrete_word_3;
  base_arinc_429 discrete_word_1;
  base_arinc_429 discrete_word_2;
  base_arinc_429 approach_spd_target_kn;
  base_arinc_429 delta_p_ail_cmd_deg;
  base_arinc_429 delta_p_splr_cmd_deg;
  base_arinc_429 delta_r_cmd_deg;
  base_arinc_429 delta_nose_wheel_cmd_deg;
  base_arinc_429 delta_q_cmd_deg;
  base_arinc_429 n1_left_percent;
  base_arinc_429 n1_right_percent;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sfcc_bus_
#define DEFINED_TYPEDEF_FOR_base_sfcc_bus_

struct base_sfcc_bus
{
  base_arinc_429 slat_flap_component_status_word;
  base_arinc_429 slat_flap_system_status_word;
  base_arinc_429 slat_flap_actual_position_word;
  base_arinc_429 slat_actual_position_deg;
  base_arinc_429 flap_actual_position_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_lgciu_bus_
#define DEFINED_TYPEDEF_FOR_base_lgciu_bus_

struct base_lgciu_bus
{
  base_arinc_429 discrete_word_1;
  base_arinc_429 discrete_word_2;
  base_arinc_429 discrete_word_3;
  base_arinc_429 discrete_word_4;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_elac_out_bus_
#define DEFINED_TYPEDEF_FOR_base_elac_out_bus_

struct base_elac_out_bus
{
  base_arinc_429 left_aileron_position_deg;
  base_arinc_429 right_aileron_position_deg;
  base_arinc_429 left_elevator_position_deg;
  base_arinc_429 right_elevator_position_deg;
  base_arinc_429 ths_position_deg;
  base_arinc_429 left_sidestick_pitch_command_deg;
  base_arinc_429 right_sidestick_pitch_command_deg;
  base_arinc_429 left_sidestick_roll_command_deg;
  base_arinc_429 right_sidestick_roll_command_deg;
  base_arinc_429 rudder_pedal_position_deg;
  base_arinc_429 aileron_command_deg;
  base_arinc_429 roll_spoiler_command_deg;
  base_arinc_429 yaw_damper_command_deg;
  base_arinc_429 elevator_double_pressurization_command_deg;
  base_arinc_429 speedbrake_extension_deg;
  base_arinc_429 discrete_status_word_1;
  base_arinc_429 discrete_status_word_2;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fac_bus_inputs_
#define DEFINED_TYPEDEF_FOR_base_fac_bus_inputs_

struct base_fac_bus_inputs
{
  base_fac_bus fac_opp_bus;
  base_adr_bus adr_own_bus;
  base_adr_bus adr_opp_bus;
  base_adr_bus adr_3_bus;
  base_ir_bus ir_own_bus;
  base_ir_bus ir_opp_bus;
  base_ir_bus ir_3_bus;
  base_fmgc_b_bus fmgc_own_bus;
  base_fmgc_b_bus fmgc_opp_bus;
  base_sfcc_bus sfcc_own_bus;
  base_lgciu_bus lgciu_own_bus;
  base_elac_out_bus elac_1_bus;
  base_elac_out_bus elac_2_bus;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_fac_inputs_
#define DEFINED_TYPEDEF_FOR_fac_inputs_

struct fac_inputs
{
  base_time time;
  base_sim_data sim_data;
  base_fac_discrete_inputs discrete_inputs;
  base_fac_analog_inputs analog_inputs;
  base_fac_bus_inputs bus_inputs;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fac_laws_outputs_
#define DEFINED_TYPEDEF_FOR_base_fac_laws_outputs_

struct base_fac_laws_outputs
{
  real_T yaw_damper_command_deg;
  real_T rudder_trim_command_deg;
  real_T rudder_travel_lim_command_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fac_adr_computation_data_
#define DEFINED_TYPEDEF_FOR_base_fac_adr_computation_data_

struct base_fac_adr_computation_data
{
  real_T V_ias_kn;
  real_T V_tas_kn;
  real_T mach;
  real_T alpha_deg;
  real_T p_s_c_hpa;
  real_T altitude_corrected_ft;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fac_ir_computation_data_
#define DEFINED_TYPEDEF_FOR_base_fac_ir_computation_data_

struct base_fac_ir_computation_data
{
  real_T theta_deg;
  real_T phi_deg;
  real_T q_deg_s;
  real_T r_deg_s;
  real_T n_x_g;
  real_T n_y_g;
  real_T n_z_g;
  real_T theta_dot_deg_s;
  real_T phi_dot_deg_s;
  real_T V_gnd_kts;
  real_T V_zbi_ft_min;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fac_logic_outputs_
#define DEFINED_TYPEDEF_FOR_base_fac_logic_outputs_

struct base_fac_logic_outputs
{
  boolean_T lgciu_own_valid;
  boolean_T all_lgciu_lost;
  boolean_T left_main_gear_pressed;
  boolean_T right_main_gear_pressed;
  boolean_T main_gear_out;
  boolean_T sfcc_own_valid;
  boolean_T all_sfcc_lost;
  real32_T flap_handle_index;
  real32_T flap_angle_deg;
  real32_T slat_angle_deg;
  real_T flap_surface_angle_deg;
  real_T slat_surface_angle_deg;
  real32_T slat_flap_actual_pos;
  boolean_T on_ground;
  boolean_T tracking_mode_on;
  boolean_T double_self_detected_adr_failure;
  boolean_T double_self_detected_ir_failure;
  boolean_T double_not_self_detected_adr_failure;
  boolean_T double_not_self_detected_ir_failure;
  base_fac_adr_computation_data adr_computation_data;
  base_fac_ir_computation_data ir_computation_data;
  boolean_T all_ra_failed;
  base_arinc_429 ra_height;
  boolean_T yaw_damper_engaged;
  boolean_T yaw_damper_can_engage;
  boolean_T yaw_damper_has_priority;
  boolean_T rudder_trim_engaged;
  boolean_T rudder_trim_can_engage;
  boolean_T rudder_trim_has_priority;
  boolean_T rudder_travel_lim_engaged;
  boolean_T rudder_travel_lim_can_engage;
  boolean_T rudder_travel_lim_has_priority;
  boolean_T speed_scale_lost;
  boolean_T speed_scale_visible;
  boolean_T any_ap_engaged;
  boolean_T fmgc_own_selected;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fac_flight_envelope_outputs_
#define DEFINED_TYPEDEF_FOR_base_fac_flight_envelope_outputs_

struct base_fac_flight_envelope_outputs
{
  real_T estimated_beta_deg;
  real_T beta_target_deg;
  boolean_T beta_target_visible;
  boolean_T alpha_floor_condition;
  real_T alpha_filtered_deg;
  real_T computed_weight_lbs;
  real_T computed_cg_percent;
  real_T v_alpha_max_kn;
  real_T v_alpha_prot_kn;
  real_T v_stall_warn_kn;
  real_T v_ls_kn;
  real_T v_stall_kn;
  real_T v_3_kn;
  boolean_T v_3_visible;
  real_T v_4_kn;
  boolean_T v_4_visible;
  real_T v_man_kn;
  boolean_T v_man_visible;
  real_T v_max_kn;
  real_T v_fe_next_kn;
  boolean_T v_fe_next_visible;
  real_T v_c_trend_kn;
  real_T gamma_a_deg;
  real_T gamma_t_deg;
  boolean_T pitch_pitch_warning_active;
  boolean_T low_energy_warning_active;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_fac_outputs_
#define DEFINED_TYPEDEF_FOR_fac_outputs_

struct fac_outputs
{
  fac_inputs data;
  base_fac_laws_outputs laws;
  base_fac_logic_outputs logic;
  base_fac_flight_envelope_outputs flight_envelope;
  base_fac_discrete_outputs discrete_outputs;
  base_fac_analog_outputs analog_outputs;
  base_fac_bus bus_outputs;
};

#endif
#endif


// MISSING FcdcComputer_types.h
// ---- FcuComputer_types.h
#ifndef FcuComputer_types_h_
#define FcuComputer_types_h_
#ifndef DEFINED_TYPEDEF_FOR_efis_range_selection_
#define DEFINED_TYPEDEF_FOR_efis_range_selection_

enum class efis_range_selection
  : int32_T {
  RANGE_10 = 0,
  RANGE_20,
  RANGE_40,
  RANGE_80,
  RANGE_160,
  RANGE_320
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_efis_mode_selection_
#define DEFINED_TYPEDEF_FOR_efis_mode_selection_

enum class efis_mode_selection
  : int32_T {
  ROSE_ILS = 0,
  ROSE_VOR,
  ROSE_NAV,
  ARC,
  PLAN
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_efis_filter_selection_
#define DEFINED_TYPEDEF_FOR_efis_filter_selection_

enum class efis_filter_selection
  : int32_T {
  NONE = 0,
  CSTR,
  WPT,
  VORD,
  NDB,
  ARPT
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_efis_navaid_selection_
#define DEFINED_TYPEDEF_FOR_efis_navaid_selection_

enum class efis_navaid_selection
  : int32_T {
  NONE = 0,
  ADF,
  VOR
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_SignStatusMatrix_
#define DEFINED_TYPEDEF_FOR_SignStatusMatrix_

enum class SignStatusMatrix
  : int32_T {
  FailureWarning = 0,
  NoComputedData,
  FunctionalTest,
  NormalOperation
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_efis_panel_outputs_
#define DEFINED_TYPEDEF_FOR_base_fcu_efis_panel_outputs_

struct base_fcu_efis_panel_outputs
{
  boolean_T fd_light_on;
  boolean_T ls_light_on;
  boolean_T cstr_light_on;
  boolean_T wpt_light_on;
  boolean_T vord_light_on;
  boolean_T ndb_light_on;
  boolean_T arpt_light_on;
  int8_T baro_value_mode;
  real32_T baro_value;
  int8_T baro_mode;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_afs_panel_outputs_
#define DEFINED_TYPEDEF_FOR_base_fcu_afs_panel_outputs_

struct base_fcu_afs_panel_outputs
{
  boolean_T loc_light_on;
  boolean_T exped_light_on;
  boolean_T appr_light_on;
  boolean_T ap_1_light_on;
  boolean_T ap_2_light_on;
  boolean_T athr_light_on;
  boolean_T trk_fpa_mode;
  boolean_T mach_mode;
  real_T spd_mach_value;
  boolean_T spd_mach_dashes;
  boolean_T spd_mach_managed;
  real_T hdg_trk_value;
  boolean_T hdg_trk_dashes;
  boolean_T hdg_trk_managed;
  real_T alt_value;
  boolean_T lvl_ch_managed;
  real_T vs_fpa_value;
  boolean_T vs_fpa_dashes;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_knob_inputs_
#define DEFINED_TYPEDEF_FOR_base_fcu_knob_inputs_

struct base_fcu_knob_inputs
{
  boolean_T pushed;
  boolean_T pulled;
  int8_T turns;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_efis_panel_inputs_
#define DEFINED_TYPEDEF_FOR_base_fcu_efis_panel_inputs_

struct base_fcu_efis_panel_inputs
{
  efis_range_selection efis_range;
  efis_mode_selection efis_mode;
  efis_navaid_selection efis_navaid_1;
  efis_navaid_selection efis_navaid_2;
  boolean_T baro_is_inhg;
  base_fcu_knob_inputs baro_knob;
  boolean_T fd_button_pushed;
  boolean_T ls_button_pushed;
  boolean_T cstr_button_pushed;
  boolean_T wpt_button_pushed;
  boolean_T vord_button_pushed;
  boolean_T ndb_button_pushed;
  boolean_T arpt_button_pushed;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_afs_panel_inputs_
#define DEFINED_TYPEDEF_FOR_base_fcu_afs_panel_inputs_

struct base_fcu_afs_panel_inputs
{
  boolean_T loc_button_pressed;
  boolean_T exped_button_pressed;
  boolean_T appr_button_pressed;
  boolean_T spd_mach_button_pressed;
  boolean_T trk_fpa_button_pressed;
  boolean_T metric_alt_button_pressed;
  base_fcu_knob_inputs spd_knob;
  base_fcu_knob_inputs hdg_trk_knob;
  base_fcu_knob_inputs alt_knob;
  boolean_T alt_increment_1000;
  base_fcu_knob_inputs vs_fpa_knob;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_discrete_inputs_
#define DEFINED_TYPEDEF_FOR_base_fcu_discrete_inputs_

struct base_fcu_discrete_inputs
{
  boolean_T ap_1_engaged;
  boolean_T fd_1_engaged;
  boolean_T athr_1_engaged;
  boolean_T ap_2_engaged;
  boolean_T fd_2_engaged;
  boolean_T athr_2_engaged;
  boolean_T lights_test;
  boolean_T pin_prog_qfe_avail;
  base_fcu_efis_panel_inputs capt_efis_inputs;
  base_fcu_efis_panel_inputs fo_efis_inputs;
  base_fcu_afs_panel_inputs afs_inputs;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_arinc_429_
#define DEFINED_TYPEDEF_FOR_base_arinc_429_

struct base_arinc_429
{
  uint32_T SSM;
  real32_T Data;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_a_bus_
#define DEFINED_TYPEDEF_FOR_base_fmgc_a_bus_

struct base_fmgc_a_bus
{
  base_arinc_429 pfd_sel_spd_kts;
  base_arinc_429 runway_hdg_memorized_deg;
  base_arinc_429 preset_mach_from_mcdu;
  base_arinc_429 preset_speed_from_mcdu_kts;
  base_arinc_429 roll_fd_command;
  base_arinc_429 pitch_fd_command;
  base_arinc_429 yaw_fd_command;
  base_arinc_429 discrete_word_5;
  base_arinc_429 discrete_word_4;
  base_arinc_429 fm_alt_constraint_ft;
  base_arinc_429 altitude_ft;
  base_arinc_429 mach;
  base_arinc_429 cas_kts;
  base_arinc_429 flx_to_temp_deg_c;
  base_arinc_429 ats_discrete_word;
  base_arinc_429 ats_fma_discrete_word;
  base_arinc_429 discrete_word_3;
  base_arinc_429 discrete_word_1;
  base_arinc_429 discrete_word_2;
  base_arinc_429 discrete_word_6;
  base_arinc_429 synchro_spd_mach_value;
  base_arinc_429 low_target_speed_margin_kts;
  base_arinc_429 high_target_speed_margin_kts;
  base_arinc_429 delta_p_ail_voted_cmd_deg;
  base_arinc_429 delta_p_splr_voted_cmd_deg;
  base_arinc_429 delta_r_voted_cmd_deg;
  base_arinc_429 delta_nosewheel_voted_cmd_deg;
  base_arinc_429 delta_q_voted_cmd_deg;
  base_arinc_429 track_deg;
  base_arinc_429 heading_deg;
  base_arinc_429 fpa_deg;
  base_arinc_429 n1_command_percent;
  base_arinc_429 vertical_speed_ft_min;
  base_arinc_429 discrete_word_7;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_sim_input_
#define DEFINED_TYPEDEF_FOR_base_fcu_sim_input_

struct base_fcu_sim_input
{
  real32_T left_baro_setting_hpa;
  real32_T right_baro_setting_hpa;
  real32_T spd_mach;
  real32_T hdg_trk;
  real32_T alt;
  real32_T vs_fpa;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_time_
#define DEFINED_TYPEDEF_FOR_base_time_

struct base_time
{
  real_T dt;
  real_T simulation_time;
  real_T monotonic_time;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sim_data_
#define DEFINED_TYPEDEF_FOR_base_sim_data_

struct base_sim_data
{
  boolean_T slew_on;
  boolean_T pause_on;
  boolean_T tracking_mode_on_override;
  boolean_T tailstrike_protection_on;
  boolean_T computer_running;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_bus_inputs_
#define DEFINED_TYPEDEF_FOR_base_fcu_bus_inputs_

struct base_fcu_bus_inputs
{
  base_fmgc_a_bus fmgc_1_bus;
  base_fmgc_a_bus fmgc_2_bus;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_fcu_inputs_
#define DEFINED_TYPEDEF_FOR_fcu_inputs_

struct fcu_inputs
{
  base_time time;
  base_sim_data sim_data;
  base_fcu_sim_input sim_input;
  base_fcu_discrete_inputs discrete_inputs;
  base_fcu_bus_inputs bus_inputs;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_afs_fmgc_data_
#define DEFINED_TYPEDEF_FOR_base_afs_fmgc_data_

struct base_afs_fmgc_data
{
  real32_T v_cas_kts;
  real32_T v_mach;
  real32_T hdg_deg;
  real32_T trk_deg;
  real32_T alt_ft;
  real32_T vs_ft_min;
  real32_T fpa_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_afs_logic_outputs_
#define DEFINED_TYPEDEF_FOR_base_afs_logic_outputs_

struct base_afs_logic_outputs
{
  boolean_T fmgc_1_has_priority;
  base_afs_fmgc_data chosen_fmgc_data;
  boolean_T any_ap_fd_engaged;
  boolean_T mach_active;
  boolean_T trk_fpa_active;
  boolean_T metric_alt_active;
  boolean_T auto_speed_control;
  boolean_T selected_speed_control;
  real32_T spd_mach_display_value;
  boolean_T spd_mach_dashes;
  boolean_T hdg_trk_managed;
  boolean_T hdg_trk_selected;
  real32_T hdg_trk_display_value;
  boolean_T hdg_trk_dashes;
  boolean_T hdg_trk_preset_available;
  real32_T alt_display_value;
  boolean_T lvl_ch_managed;
  boolean_T lvl_ch_vs_fpa;
  real32_T vs_fpa_display_value;
  boolean_T vs_fpa_dashes;
  boolean_T exped_active;
  boolean_T loc_only_active;
  boolean_T appr_active;
  base_fcu_knob_inputs hdg_trk_buttons;
  base_fcu_knob_inputs spd_mach_buttons;
  base_fcu_knob_inputs alt_buttons;
  base_fcu_knob_inputs vs_fpa_buttons;
  boolean_T loc_pushed;
  boolean_T exped_pushed;
  boolean_T appr_pushed;
  boolean_T spd_mach_switching_pushed;
  boolean_T lat_value_changed;
  boolean_T alt_value_changed;
  boolean_T vpath_value_changed;
  boolean_T spd_mach_value_changed;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_efis_logic_outputs_
#define DEFINED_TYPEDEF_FOR_base_fcu_efis_logic_outputs_

struct base_fcu_efis_logic_outputs
{
  boolean_T fd_on;
  boolean_T fd_auto_activate;
  boolean_T fd_auto_deactivate;
  boolean_T ls_on;
  efis_filter_selection efis_filter;
  boolean_T baro_std;
  boolean_T baro_qnh;
  boolean_T baro_qfe;
  real32_T baro_value_hpa;
  real32_T baro_value_inhg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_logic_outputs_
#define DEFINED_TYPEDEF_FOR_base_fcu_logic_outputs_

struct base_fcu_logic_outputs
{
  base_afs_logic_outputs afs;
  base_fcu_efis_logic_outputs capt_efis;
  base_fcu_efis_logic_outputs fo_efis;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_discrete_outputs_
#define DEFINED_TYPEDEF_FOR_base_fcu_discrete_outputs_

struct base_fcu_discrete_outputs
{
  base_fcu_efis_panel_outputs capt_efis_outputs;
  base_fcu_efis_panel_outputs fo_efis_outputs;
  base_fcu_afs_panel_outputs afs_outputs;
  boolean_T fcu_healthy;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_bus_
#define DEFINED_TYPEDEF_FOR_base_fcu_bus_

struct base_fcu_bus
{
  base_arinc_429 selected_hdg_deg;
  base_arinc_429 selected_alt_ft;
  base_arinc_429 selected_spd_kts;
  base_arinc_429 selected_vz_ft_min;
  base_arinc_429 selected_mach;
  base_arinc_429 selected_trk_deg;
  base_arinc_429 selected_fpa_deg;
  base_arinc_429 ats_fma_discrete_word;
  base_arinc_429 fcu_flex_to_temp_deg_c;
  base_arinc_429 ats_discrete_word;
  base_arinc_429 eis_discrete_word_1_left;
  base_arinc_429 eis_discrete_word_1_right;
  base_arinc_429 eis_discrete_word_2_left;
  base_arinc_429 eis_discrete_word_2_right;
  base_arinc_429 baro_setting_left_hpa;
  base_arinc_429 baro_setting_right_hpa;
  base_arinc_429 baro_setting_left_inhg;
  base_arinc_429 baro_setting_right_inhg;
  base_arinc_429 fcu_discrete_word_2;
  base_arinc_429 fcu_discrete_word_1;
  base_arinc_429 n1_cmd_percent;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_fcu_outputs_
#define DEFINED_TYPEDEF_FOR_fcu_outputs_

struct fcu_outputs
{
  fcu_inputs data;
  base_fcu_logic_outputs logic;
  base_fcu_discrete_outputs discrete_outputs;
  base_fcu_bus bus_outputs;
};

#endif
#endif


// ---- FmgcComputer_types.h
#ifndef FmgcComputer_types_h_
#define FmgcComputer_types_h_
#ifndef DEFINED_TYPEDEF_FOR_fmgc_flight_phase_
#define DEFINED_TYPEDEF_FOR_fmgc_flight_phase_

enum class fmgc_flight_phase
  : int32_T {
  Preflight = 0,
  Takeoff,
  Climb,
  Cruise,
  Descent,
  Approach,
  Goaround,
  Done
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_fmgc_approach_type_
#define DEFINED_TYPEDEF_FOR_fmgc_approach_type_

enum class fmgc_approach_type
  : int32_T {
  None = 0,
  ILS,
  RNAV
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_tcas_submode_
#define DEFINED_TYPEDEF_FOR_tcas_submode_

enum class tcas_submode
  : int32_T {
  VS = 0,
  ALT_ACQ,
  ALT_HOLD
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_fmgc_des_submode_
#define DEFINED_TYPEDEF_FOR_fmgc_des_submode_

enum class fmgc_des_submode
  : int32_T {
  None = 0,
  SPEED_THRUST,
  VPATH_THRUST,
  VPATH_SPEED,
  FPA_SPEED,
  VS_SPEED
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_SignStatusMatrix_
#define DEFINED_TYPEDEF_FOR_SignStatusMatrix_

enum class SignStatusMatrix
  : int32_T {
  FailureWarning = 0,
  NoComputedData,
  FunctionalTest,
  NormalOperation
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_arinc_429_
#define DEFINED_TYPEDEF_FOR_base_arinc_429_

struct base_arinc_429
{
  uint32_T SSM;
  real32_T Data;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_ils_bus_
#define DEFINED_TYPEDEF_FOR_base_ils_bus_

struct base_ils_bus
{
  base_arinc_429 runway_heading_deg;
  base_arinc_429 ils_frequency_mhz;
  base_arinc_429 localizer_deviation_deg;
  base_arinc_429 glideslope_deviation_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_discrete_inputs_
#define DEFINED_TYPEDEF_FOR_base_fmgc_discrete_inputs_

struct base_fmgc_discrete_inputs
{
  boolean_T is_unit_1;
  boolean_T athr_opp_engaged;
  boolean_T fcu_athr_button;
  boolean_T athr_instinctive_disc;
  boolean_T fd_opp_engaged;
  boolean_T ap_opp_engaged;
  boolean_T fcu_ap_button;
  boolean_T ap_instinctive_disc;
  boolean_T powersupply_split;
  boolean_T fcu_opp_healthy;
  boolean_T fcu_own_healthy;
  boolean_T fac_opp_healthy;
  boolean_T fac_own_healthy;
  boolean_T fmgc_opp_healthy;
  boolean_T mcdu_opp_fail;
  boolean_T mcdu_own_fail;
  boolean_T nav_control_opp;
  boolean_T nav_control_own;
  boolean_T fwc_opp_valid;
  boolean_T fwc_own_valid;
  boolean_T pfd_opp_valid;
  boolean_T pfd_own_valid;
  boolean_T adc_3_switch;
  boolean_T att_3_switch;
  boolean_T left_wheel_spd_abv_70_kts;
  boolean_T right_wheel_spd_abv_70_kts;
  boolean_T bscu_opp_valid;
  boolean_T bscu_own_valid;
  boolean_T nose_gear_pressed_opp;
  boolean_T nose_gear_pressed_own;
  boolean_T elac_opp_ap_disc;
  boolean_T elac_own_ap_disc;
  boolean_T eng_opp_stop;
  boolean_T eng_own_stop;
  boolean_T tcas_ta_display;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_b_bus_
#define DEFINED_TYPEDEF_FOR_base_fmgc_b_bus_

struct base_fmgc_b_bus
{
  base_arinc_429 fac_weight_lbs;
  base_arinc_429 fm_weight_lbs;
  base_arinc_429 fac_cg_percent;
  base_arinc_429 fm_cg_percent;
  base_arinc_429 fg_radio_height_ft;
  base_arinc_429 discrete_word_4;
  base_arinc_429 ats_discrete_word;
  base_arinc_429 discrete_word_3;
  base_arinc_429 discrete_word_1;
  base_arinc_429 discrete_word_2;
  base_arinc_429 approach_spd_target_kn;
  base_arinc_429 delta_p_ail_cmd_deg;
  base_arinc_429 delta_p_splr_cmd_deg;
  base_arinc_429 delta_r_cmd_deg;
  base_arinc_429 delta_nose_wheel_cmd_deg;
  base_arinc_429 delta_q_cmd_deg;
  base_arinc_429 n1_left_percent;
  base_arinc_429 n1_right_percent;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_a_bus_
#define DEFINED_TYPEDEF_FOR_base_fmgc_a_bus_

struct base_fmgc_a_bus
{
  base_arinc_429 pfd_sel_spd_kts;
  base_arinc_429 runway_hdg_memorized_deg;
  base_arinc_429 preset_mach_from_mcdu;
  base_arinc_429 preset_speed_from_mcdu_kts;
  base_arinc_429 roll_fd_command;
  base_arinc_429 pitch_fd_command;
  base_arinc_429 yaw_fd_command;
  base_arinc_429 discrete_word_5;
  base_arinc_429 discrete_word_4;
  base_arinc_429 fm_alt_constraint_ft;
  base_arinc_429 altitude_ft;
  base_arinc_429 mach;
  base_arinc_429 cas_kts;
  base_arinc_429 flx_to_temp_deg_c;
  base_arinc_429 ats_discrete_word;
  base_arinc_429 ats_fma_discrete_word;
  base_arinc_429 discrete_word_3;
  base_arinc_429 discrete_word_1;
  base_arinc_429 discrete_word_2;
  base_arinc_429 discrete_word_6;
  base_arinc_429 synchro_spd_mach_value;
  base_arinc_429 low_target_speed_margin_kts;
  base_arinc_429 high_target_speed_margin_kts;
  base_arinc_429 delta_p_ail_voted_cmd_deg;
  base_arinc_429 delta_p_splr_voted_cmd_deg;
  base_arinc_429 delta_r_voted_cmd_deg;
  base_arinc_429 delta_nosewheel_voted_cmd_deg;
  base_arinc_429 delta_q_voted_cmd_deg;
  base_arinc_429 track_deg;
  base_arinc_429 heading_deg;
  base_arinc_429 fpa_deg;
  base_arinc_429 n1_command_percent;
  base_arinc_429 vertical_speed_ft_min;
  base_arinc_429 discrete_word_7;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_time_
#define DEFINED_TYPEDEF_FOR_base_time_

struct base_time
{
  real_T dt;
  real_T simulation_time;
  real_T monotonic_time;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_sim_data_
#define DEFINED_TYPEDEF_FOR_base_sim_data_

struct base_sim_data
{
  boolean_T slew_on;
  boolean_T pause_on;
  boolean_T tracking_mode_on_override;
  boolean_T tailstrike_protection_on;
  boolean_T computer_running;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fms_inputs_
#define DEFINED_TYPEDEF_FOR_base_fms_inputs_

struct base_fms_inputs
{
  boolean_T fm_valid;
  fmgc_flight_phase fms_flight_phase;
  fmgc_approach_type selected_approach_type;
  boolean_T backbeam_selected;
  real_T fms_loc_distance;
  real_T fms_unrealistic_gs_angle_deg;
  real_T fms_weight_lbs;
  real_T fms_cg_percent;
  boolean_T lateral_flight_plan_valid;
  boolean_T nav_capture_condition;
  real_T phi_c_deg;
  real_T xtk_nmi;
  real_T tke_deg;
  real_T phi_limit_deg;
  boolean_T direct_to_nav_engage;
  boolean_T vertical_flight_plan_valid;
  boolean_T final_app_can_engage;
  real_T next_alt_cstr_ft;
  fmgc_des_submode requested_des_submode;
  real_T alt_profile_tgt_ft;
  real_T vs_target_ft_min;
  real_T v_2_kts;
  real_T v_app_kts;
  real_T v_managed_kts;
  real_T v_upper_margin_kts;
  real_T v_lower_margin_kts;
  boolean_T show_speed_margins;
  real_T preset_spd_kts;
  real_T preset_mach;
  boolean_T preset_spd_mach_activate;
  boolean_T fms_spd_mode_activate;
  boolean_T fms_mach_mode_activate;
  real_T flex_temp_deg_c;
  real_T acceleration_alt_ft;
  real_T thrust_reduction_alt_ft;
  real_T cruise_alt_ft;
  base_arinc_429 tower_headwind_kts;
  boolean_T flap_3_approach_selected;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fac_bus_
#define DEFINED_TYPEDEF_FOR_base_fac_bus_

struct base_fac_bus
{
  base_arinc_429 discrete_word_1;
  base_arinc_429 gamma_a_deg;
  base_arinc_429 gamma_t_deg;
  base_arinc_429 total_weight_lbs;
  base_arinc_429 center_of_gravity_pos_percent;
  base_arinc_429 sideslip_target_deg;
  base_arinc_429 fac_slat_angle_deg;
  base_arinc_429 fac_flap_angle_deg;
  base_arinc_429 discrete_word_2;
  base_arinc_429 rudder_travel_limit_command_deg;
  base_arinc_429 delta_r_yaw_damper_deg;
  base_arinc_429 estimated_sideslip_deg;
  base_arinc_429 v_alpha_lim_kn;
  base_arinc_429 v_ls_kn;
  base_arinc_429 v_stall_kn;
  base_arinc_429 v_alpha_prot_kn;
  base_arinc_429 v_stall_warn_kn;
  base_arinc_429 speed_trend_kn;
  base_arinc_429 v_3_kn;
  base_arinc_429 v_4_kn;
  base_arinc_429 v_man_kn;
  base_arinc_429 v_max_kn;
  base_arinc_429 v_fe_next_kn;
  base_arinc_429 discrete_word_3;
  base_arinc_429 discrete_word_4;
  base_arinc_429 discrete_word_5;
  base_arinc_429 delta_r_rudder_trim_deg;
  base_arinc_429 rudder_trim_pos_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_adr_bus_
#define DEFINED_TYPEDEF_FOR_base_adr_bus_

struct base_adr_bus
{
  base_arinc_429 altitude_standard_ft;
  base_arinc_429 altitude_corrected_1_ft;
  base_arinc_429 altitude_corrected_2_ft;
  base_arinc_429 mach;
  base_arinc_429 airspeed_computed_kn;
  base_arinc_429 airspeed_true_kn;
  base_arinc_429 vertical_speed_ft_min;
  base_arinc_429 aoa_corrected_deg;
  base_arinc_429 corrected_average_static_pressure;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_ir_bus_
#define DEFINED_TYPEDEF_FOR_base_ir_bus_

struct base_ir_bus
{
  base_arinc_429 discrete_word_1;
  base_arinc_429 latitude_deg;
  base_arinc_429 longitude_deg;
  base_arinc_429 ground_speed_kn;
  base_arinc_429 track_angle_true_deg;
  base_arinc_429 heading_true_deg;
  base_arinc_429 wind_speed_kn;
  base_arinc_429 wind_direction_true_deg;
  base_arinc_429 track_angle_magnetic_deg;
  base_arinc_429 heading_magnetic_deg;
  base_arinc_429 drift_angle_deg;
  base_arinc_429 flight_path_angle_deg;
  base_arinc_429 flight_path_accel_g;
  base_arinc_429 pitch_angle_deg;
  base_arinc_429 roll_angle_deg;
  base_arinc_429 body_pitch_rate_deg_s;
  base_arinc_429 body_roll_rate_deg_s;
  base_arinc_429 body_yaw_rate_deg_s;
  base_arinc_429 body_long_accel_g;
  base_arinc_429 body_lat_accel_g;
  base_arinc_429 body_normal_accel_g;
  base_arinc_429 track_angle_rate_deg_s;
  base_arinc_429 pitch_att_rate_deg_s;
  base_arinc_429 roll_att_rate_deg_s;
  base_arinc_429 inertial_alt_ft;
  base_arinc_429 along_track_horiz_acc_g;
  base_arinc_429 cross_track_horiz_acc_g;
  base_arinc_429 vertical_accel_g;
  base_arinc_429 inertial_vertical_speed_ft_s;
  base_arinc_429 north_south_velocity_kn;
  base_arinc_429 east_west_velocity_kn;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_ecu_bus_
#define DEFINED_TYPEDEF_FOR_base_ecu_bus_

struct base_ecu_bus
{
  base_arinc_429 selected_tla_deg;
  base_arinc_429 n1_ref_percent;
  base_arinc_429 selected_flex_temp_deg;
  base_arinc_429 ecu_status_word_1;
  base_arinc_429 ecu_status_word_2;
  base_arinc_429 ecu_status_word_3;
  base_arinc_429 n1_limit_percent;
  base_arinc_429 n1_maximum_percent;
  base_arinc_429 n1_command_percent;
  base_arinc_429 selected_n2_actual_percent;
  base_arinc_429 selected_n1_actual_percent;
  base_arinc_429 ecu_maintenance_word_6;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_ra_bus_
#define DEFINED_TYPEDEF_FOR_base_ra_bus_

struct base_ra_bus
{
  base_arinc_429 radio_height_ft;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fcu_bus_
#define DEFINED_TYPEDEF_FOR_base_fcu_bus_

struct base_fcu_bus
{
  base_arinc_429 selected_hdg_deg;
  base_arinc_429 selected_alt_ft;
  base_arinc_429 selected_spd_kts;
  base_arinc_429 selected_vz_ft_min;
  base_arinc_429 selected_mach;
  base_arinc_429 selected_trk_deg;
  base_arinc_429 selected_fpa_deg;
  base_arinc_429 ats_fma_discrete_word;
  base_arinc_429 fcu_flex_to_temp_deg_c;
  base_arinc_429 ats_discrete_word;
  base_arinc_429 eis_discrete_word_1_left;
  base_arinc_429 eis_discrete_word_1_right;
  base_arinc_429 eis_discrete_word_2_left;
  base_arinc_429 eis_discrete_word_2_right;
  base_arinc_429 baro_setting_left_hpa;
  base_arinc_429 baro_setting_right_hpa;
  base_arinc_429 baro_setting_left_inhg;
  base_arinc_429 baro_setting_right_inhg;
  base_arinc_429 fcu_discrete_word_2;
  base_arinc_429 fcu_discrete_word_1;
  base_arinc_429 n1_cmd_percent;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_tcas_bus_
#define DEFINED_TYPEDEF_FOR_base_tcas_bus_

struct base_tcas_bus
{
  base_arinc_429 sensitivity_level;
  base_arinc_429 vertical_resolution_advisory;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_bus_inputs_
#define DEFINED_TYPEDEF_FOR_base_fmgc_bus_inputs_

struct base_fmgc_bus_inputs
{
  base_fac_bus fac_opp_bus;
  base_fac_bus fac_own_bus;
  base_adr_bus adr_3_bus;
  base_ir_bus ir_3_bus;
  base_adr_bus adr_opp_bus;
  base_ir_bus ir_opp_bus;
  base_adr_bus adr_own_bus;
  base_ir_bus ir_own_bus;
  base_ecu_bus fadec_opp_bus;
  base_ecu_bus fadec_own_bus;
  base_ra_bus ra_opp_bus;
  base_ra_bus ra_own_bus;
  base_ils_bus ils_opp_bus;
  base_ils_bus ils_own_bus;
  base_fmgc_a_bus fmgc_opp_bus;
  base_fcu_bus fcu_bus;
  base_tcas_bus tcas_bus;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_fmgc_inputs_
#define DEFINED_TYPEDEF_FOR_fmgc_inputs_

struct fmgc_inputs
{
  base_time time;
  base_sim_data sim_data;
  base_fmgc_discrete_inputs discrete_inputs;
  base_fms_inputs fms_inputs;
  base_fmgc_bus_inputs bus_inputs;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_logic_outputs_
#define DEFINED_TYPEDEF_FOR_base_fmgc_logic_outputs_

struct base_fmgc_logic_outputs
{
  boolean_T on_ground;
  boolean_T gnd_eng_stop_flt_5s;
  boolean_T one_engine_out;
  boolean_T engine_running;
  boolean_T ap_fd_athr_common_condition;
  boolean_T ap_fd_common_condition;
  boolean_T fd_own_engaged;
  boolean_T ap_own_engaged;
  boolean_T athr_own_engaged;
  boolean_T ap_inop;
  boolean_T athr_inop;
  boolean_T fmgc_opp_priority;
  boolean_T double_adr_failure;
  boolean_T double_ir_failure;
  boolean_T all_adr_valid;
  boolean_T all_ir_valid;
  base_adr_bus adr_computation_data;
  base_ir_bus ir_computation_data;
  base_arinc_429 altitude_indicated_ft;
  base_ra_bus ra_computation_data;
  boolean_T dual_ra_failure;
  boolean_T both_ra_valid;
  boolean_T fac_lg_data_failure;
  boolean_T fac_flap_slat_data_failure;
  int8_T flap_slat_lever_position;
  boolean_T fac_speeds_failure;
  boolean_T fac_weights_failure;
  boolean_T fac_rudder_control_failure;
  boolean_T both_fac_rudder_valid;
  base_fac_bus chosen_fac_bus;
  boolean_T fcu_failure;
  boolean_T ils_failure;
  boolean_T both_ils_valid;
  base_ils_bus ils_computation_data;
  boolean_T ils_tune_inhibit;
  real_T rwy_hdg_memo;
  boolean_T tcas_failure;
  boolean_T tcas_mode_available;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_lateral_modes_
#define DEFINED_TYPEDEF_FOR_base_fmgc_lateral_modes_

struct base_fmgc_lateral_modes
{
  boolean_T rwy_active;
  boolean_T nav_active;
  boolean_T loc_cpt_active;
  boolean_T loc_trk_active;
  boolean_T roll_goaround_active;
  boolean_T hdg_active;
  boolean_T trk_active;
  boolean_T rwy_loc_submode_active;
  boolean_T rwy_trk_submode_active;
  boolean_T land_active;
  boolean_T align_submode_active;
  boolean_T rollout_submode_active;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_longitudinal_modes_
#define DEFINED_TYPEDEF_FOR_base_fmgc_longitudinal_modes_

struct base_fmgc_longitudinal_modes
{
  boolean_T clb_active;
  boolean_T des_active;
  boolean_T op_clb_active;
  boolean_T op_des_active;
  boolean_T exp_clb_active;
  boolean_T exp_des_active;
  boolean_T pitch_takeoff_active;
  boolean_T pitch_goaround_active;
  boolean_T vs_active;
  boolean_T fpa_active;
  boolean_T alt_acq_active;
  boolean_T alt_hold_active;
  boolean_T fma_dash_display;
  boolean_T gs_capt_active;
  boolean_T gs_trk_active;
  boolean_T final_des_active;
  boolean_T flare_active;
  boolean_T cruise_active;
  boolean_T tcas_active;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_armed_modes_
#define DEFINED_TYPEDEF_FOR_base_fmgc_armed_modes_

struct base_fmgc_armed_modes
{
  boolean_T alt_acq_armed;
  boolean_T alt_acq_arm_possible;
  boolean_T nav_armed;
  boolean_T loc_armed;
  boolean_T land_armed;
  boolean_T glide_armed;
  boolean_T final_des_armed;
  boolean_T clb_armed;
  boolean_T des_armed;
  boolean_T tcas_armed;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_lateral_law_
#define DEFINED_TYPEDEF_FOR_lateral_law_

enum class lateral_law
  : int32_T {
  NONE = 0,
  HDG,
  TRACK,
  HPATH,
  LOC_CPT,
  LOC_TRACK,
  ROLL_OUT
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_vertical_law_
#define DEFINED_TYPEDEF_FOR_vertical_law_

enum class vertical_law
  : int32_T {
  NONE = 0,
  ALT_HOLD,
  ALT_ACQ,
  SPD_MACH,
  VS,
  FPA,
  GS,
  FLARE,
  SRS,
  VPATH
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_ap_fd_logic_outputs_
#define DEFINED_TYPEDEF_FOR_base_fmgc_ap_fd_logic_outputs_

struct base_fmgc_ap_fd_logic_outputs
{
  base_fmgc_lateral_modes lateral_modes;
  base_fmgc_longitudinal_modes longitudinal_modes;
  base_fmgc_armed_modes armed_modes;
  lateral_law active_lateral_law;
  vertical_law active_longitudinal_law;
  boolean_T auto_spd_control_active;
  boolean_T manual_spd_control_active;
  boolean_T mach_control_active;
  real_T spd_target_kts;
  real_T pfd_spd_target_kts;
  boolean_T alt_cstr_applicable;
  real_T alt_sel_or_cstr;
  boolean_T fmgc_opp_mode_sync;
  boolean_T any_ap_fd_engaged;
  boolean_T any_lateral_mode_engaged;
  boolean_T any_longitudinal_mode_engaged;
  boolean_T lateral_mode_reset;
  boolean_T longitudinal_mode_reset;
  boolean_T hdg_trk_preset_available;
  boolean_T alt_soft_mode_active;
  boolean_T fd_auto_disengage;
  boolean_T ap_fd_mode_reversion;
  boolean_T lateral_mode_reversion;
  boolean_T longitudinal_mode_reversion_vs;
  boolean_T longitudinal_mode_reversion_op_clb;
  boolean_T pitch_fd_bars_flashing;
  boolean_T roll_fd_bars_flashing;
  boolean_T loc_bc_selection;
  boolean_T vs_target_not_held;
  real_T tcas_vs_target;
  boolean_T tcas_ra_corrective;
  tcas_submode active_tcas_submode;
  boolean_T tcas_alt_acq_cond;
  boolean_T tcas_alt_hold_cond;
  boolean_T tcas_ra_inhibited;
  boolean_T trk_fpa_deselected;
  boolean_T longi_large_box_tcas;
  boolean_T land_2_capability;
  boolean_T land_3_fail_passive_capability;
  boolean_T land_3_fail_op_capability;
  boolean_T land_2_inop;
  boolean_T land_3_fail_passive_inop;
  boolean_T land_3_fail_op_inop;
  boolean_T land_2_capacity;
  boolean_T land_3_fail_passive_capacity;
  boolean_T land_3_fail_op_capacity;
  boolean_T tla_to_ga_set;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_ap_raw_output_command_
#define DEFINED_TYPEDEF_FOR_ap_raw_output_command_

struct ap_raw_output_command
{
  real_T Theta_c_deg;
  real_T Phi_c_deg;
  real_T Beta_c_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_ap_raw_laws_flare_
#define DEFINED_TYPEDEF_FOR_ap_raw_laws_flare_

struct ap_raw_laws_flare
{
  boolean_T condition_Flare;
  real_T H_dot_radio_fpm;
  real_T H_dot_c_fpm;
  real_T delta_Theta_H_dot_deg;
  real_T delta_Theta_bz_deg;
  real_T delta_Theta_bx_deg;
  real_T delta_Theta_beta_c_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_ap_raw_output_
#define DEFINED_TYPEDEF_FOR_ap_raw_output_

struct ap_raw_output
{
  real_T Phi_loc_c;
  real_T Nosewheel_c;
  ap_raw_output_command flight_director;
  ap_raw_output_command autopilot;
  ap_raw_laws_flare flare_law;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_athr_fma_mode_
#define DEFINED_TYPEDEF_FOR_athr_fma_mode_

enum class athr_fma_mode
  : int32_T {
  NONE = 0,
  MAN_TOGA,
  MAN_GA_SOFT,
  MAN_FLEX,
  MAN_DTO,
  MAN_MCT,
  MAN_THR,
  SPEED,
  MACH,
  THR_MCT,
  THR_CLB,
  THR_LVR,
  THR_IDLE,
  A_FLOOR,
  TOGA_LK
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_athr_fma_message_
#define DEFINED_TYPEDEF_FOR_athr_fma_message_

enum class athr_fma_message
  : int32_T {
  NONE = 0,
  LVR_TOGA,
  LVR_CLB,
  LVR_MCT,
  LVR_ASYM
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_athr_outputs_
#define DEFINED_TYPEDEF_FOR_base_fmgc_athr_outputs_

struct base_fmgc_athr_outputs
{
  boolean_T athr_active;
  boolean_T athr_limited;
  boolean_T alpha_floor_mode_active;
  boolean_T thrust_mode_active;
  boolean_T thrust_target_idle;
  boolean_T speed_mach_mode_active;
  boolean_T retard_mode_active;
  athr_fma_mode fma_mode;
  athr_fma_message fma_message;
  real_T n1_c_percent;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_discrete_outputs_
#define DEFINED_TYPEDEF_FOR_base_fmgc_discrete_outputs_

struct base_fmgc_discrete_outputs
{
  boolean_T athr_own_engaged;
  boolean_T fd_own_engaged;
  boolean_T ap_own_engaged;
  boolean_T fcu_own_fail;
  boolean_T fmgc_healthy;
  boolean_T ils_test_inhibit;
  boolean_T stick_rudder_lock;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_fmgc_bus_outputs_
#define DEFINED_TYPEDEF_FOR_base_fmgc_bus_outputs_

struct base_fmgc_bus_outputs
{
  base_fmgc_a_bus fmgc_a_bus;
  base_fmgc_b_bus fmgc_b_bus;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_fmgc_outputs_
#define DEFINED_TYPEDEF_FOR_fmgc_outputs_

struct fmgc_outputs
{
  fmgc_inputs data;
  base_fmgc_logic_outputs logic;
  base_fmgc_ap_fd_logic_outputs ap_fd_logic;
  ap_raw_output ap_fd_outer_loops;
  base_fmgc_athr_outputs athr;
  base_fmgc_discrete_outputs discrete_outputs;
  base_fmgc_bus_outputs bus_outputs;
};

#endif
#endif


// ---- FmgcOuterLoops_types.h
#ifndef FmgcOuterLoops_types_h_
#define FmgcOuterLoops_types_h_
#ifndef DEFINED_TYPEDEF_FOR_ap_raw_laws_flare_
#define DEFINED_TYPEDEF_FOR_ap_raw_laws_flare_

struct ap_raw_laws_flare
{
  boolean_T condition_Flare;
  real_T H_dot_radio_fpm;
  real_T H_dot_c_fpm;
  real_T delta_Theta_H_dot_deg;
  real_T delta_Theta_bz_deg;
  real_T delta_Theta_bx_deg;
  real_T delta_Theta_beta_c_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_ap_raw_output_command_
#define DEFINED_TYPEDEF_FOR_ap_raw_output_command_

struct ap_raw_output_command
{
  real_T Theta_c_deg;
  real_T Phi_c_deg;
  real_T Beta_c_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_ap_raw_output_
#define DEFINED_TYPEDEF_FOR_ap_raw_output_

struct ap_raw_output
{
  real_T Phi_loc_c;
  real_T Nosewheel_c;
  ap_raw_output_command flight_director;
  ap_raw_output_command autopilot;
  ap_raw_laws_flare flare_law;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_ap_raw_time_
#define DEFINED_TYPEDEF_FOR_ap_raw_time_

struct ap_raw_time
{
  real_T dt;
  real_T simulation_time;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_ap_raw_data_
#define DEFINED_TYPEDEF_FOR_ap_raw_data_

struct ap_raw_data
{
  real_T Theta_deg;
  real_T Phi_deg;
  real_T qk_deg_s;
  real_T rk_deg_s;
  real_T pk_deg_s;
  real_T V_ias_kn;
  real_T V_tas_kn;
  real_T V_mach;
  real_T V_gnd_kn;
  real_T alpha_deg;
  real_T beta_deg;
  real_T H_ft;
  real_T H_ind_ft;
  real_T H_radio_ft;
  real_T H_dot_ft_min;
  real_T Psi_magnetic_deg;
  real_T Psi_magnetic_track_deg;
  real_T Psi_true_deg;
  real_T Chi_true_deg;
  real_T bx_m_s2;
  real_T by_m_s2;
  real_T bz_m_s2;
  real_T nav_loc_deg;
  real_T nav_gs_deg;
  real_T nav_dme_nmi;
  real_T nav_loc_magvar_deg;
  real_T nav_loc_error_deg;
  boolean_T nav_gs_valid;
  real_T nav_gs_error_deg;
  real_T fms_xtk_nmi;
  real_T fms_tae_deg;
  real_T fms_phi_deg;
  real_T fms_phi_limit_deg;
  real_T fms_H_c_profile_ft;
  real_T fms_H_dot_c_profile_ft_min;
  real_T VLS_kn;
  real_T VMAX_kn;
  boolean_T on_ground;
  real_T zeta_deg;
  real_T total_weight_kg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_ap_raw_laws_input_
#define DEFINED_TYPEDEF_FOR_ap_raw_laws_input_

struct ap_raw_laws_input
{
  boolean_T ap_engaged;
  real_T lateral_law;
  real_T vertical_law;
  real_T Psi_c_deg;
  real_T Chi_c_deg;
  real_T H_c_ft;
  real_T H_dot_c_fpm;
  real_T FPA_c_deg;
  real_T V_c_kn;
  boolean_T ALT_soft_mode_active;
  boolean_T TCAS_mode_active;
  boolean_T FINAL_DES_mode_active;
  boolean_T GS_track_mode;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_ap_laws_output_
#define DEFINED_TYPEDEF_FOR_ap_laws_output_

struct ap_laws_output
{
  ap_raw_time time;
  ap_raw_data data;
  ap_raw_laws_input input;
  ap_raw_output output;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_lateral_law_
#define DEFINED_TYPEDEF_FOR_lateral_law_

enum class lateral_law
  : int32_T {
  NONE = 0,
  HDG,
  TRACK,
  HPATH,
  LOC_CPT,
  LOC_TRACK,
  ROLL_OUT
};

#endif
#endif


// ---- PitchNormalLaw_types.h
#ifndef PitchNormalLaw_types_h_
#define PitchNormalLaw_types_h_
#ifndef DEFINED_TYPEDEF_FOR_base_time_
#define DEFINED_TYPEDEF_FOR_base_time_

struct base_time
{
  real_T dt;
  real_T simulation_time;
  real_T monotonic_time;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_pitch_normal_input_
#define DEFINED_TYPEDEF_FOR_pitch_normal_input_

struct pitch_normal_input
{
  base_time time;
  real_T nz_g;
  real_T Theta_deg;
  real_T Phi_deg;
  real_T qk_deg_s;
  real_T qk_dot_deg_s2;
  real_T eta_deg;
  real_T eta_trim_deg;
  real_T alpha_deg;
  real_T V_ias_kn;
  real_T V_tas_kn;
  real_T H_radio_ft;
  real_T CG_percent_MAC;
  real_T total_weight_kg;
  real_T flaps_handle_index;
  real_T spoilers_left_pos;
  real_T spoilers_right_pos;
  real_T thrust_lever_1_pos;
  real_T thrust_lever_2_pos;
  boolean_T tailstrike_protection_on;
  real_T VLS_kn;
  real_T delta_eta_pos;
  boolean_T on_ground;
  real_T in_flight;
  boolean_T tracking_mode_on;
  boolean_T high_aoa_prot_active;
  boolean_T high_speed_prot_active;
  real_T alpha_prot;
  real_T alpha_max;
  real_T high_speed_prot_high_kn;
  real_T high_speed_prot_low_kn;
  real_T ap_theta_c_deg;
  boolean_T any_ap_engaged;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_pitch_data_computed_
#define DEFINED_TYPEDEF_FOR_base_pitch_data_computed_

struct base_pitch_data_computed
{
  real_T eta_trim_deg_limit_lo;
  real_T eta_trim_deg_limit_up;
  real_T delta_eta_deg;
  real_T in_flight;
  real_T in_rotation;
  real_T in_flare;
  real_T in_flight_gain;
  real_T in_rotation_gain;
  real_T nz_limit_up_g;
  real_T nz_limit_lo_g;
  boolean_T eta_trim_deg_should_freeze;
  boolean_T eta_trim_deg_reset;
  real_T eta_trim_deg_reset_deg;
  boolean_T eta_trim_deg_should_write;
  real_T eta_trim_deg_rate_limit_up_deg_s;
  real_T eta_trim_deg_rate_limit_lo_deg_s;
  real_T flare_Theta_deg;
  real_T flare_Theta_c_deg;
  real_T flare_Theta_c_rate_deg_s;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_pitch_rotation_
#define DEFINED_TYPEDEF_FOR_base_pitch_rotation_

struct base_pitch_rotation
{
  real_T qk_c_deg_s;
  real_T eta_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_pitch_normal_
#define DEFINED_TYPEDEF_FOR_base_pitch_normal_

struct base_pitch_normal
{
  real_T nz_c_g;
  real_T Cstar_g;
  real_T protection_alpha_c_deg;
  real_T protection_V_c_kn;
  real_T eta_dot_deg_s;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_pitch_law_output_
#define DEFINED_TYPEDEF_FOR_base_pitch_law_output_

struct base_pitch_law_output
{
  real_T eta_dot_deg_s;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_pitch_integrated_
#define DEFINED_TYPEDEF_FOR_base_pitch_integrated_

struct base_pitch_integrated
{
  real_T eta_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_pitch_output_
#define DEFINED_TYPEDEF_FOR_base_pitch_output_

struct base_pitch_output
{
  real_T eta_deg;
  real_T eta_trim_dot_deg_s;
  real_T eta_trim_limit_lo;
  real_T eta_trim_limit_up;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_pitch_normal_output_
#define DEFINED_TYPEDEF_FOR_pitch_normal_output_

struct pitch_normal_output
{
  pitch_normal_input input;
  base_pitch_data_computed data_computed;
  base_pitch_rotation law_rotation;
  base_pitch_normal law_normal;
  base_pitch_law_output vote;
  base_pitch_integrated integrated;
  base_pitch_output output;
};

#endif
#endif


// ---- PitchAlternateLaw_types.h
#ifndef PitchAlternateLaw_types_h_
#define PitchAlternateLaw_types_h_
#endif


// ---- PitchDirectLaw_types.h
#ifndef PitchDirectLaw_types_h_
#define PitchDirectLaw_types_h_
#endif


// ---- LateralNormalLaw_types.h
#ifndef LateralNormalLaw_types_h_
#define LateralNormalLaw_types_h_
#ifndef DEFINED_TYPEDEF_FOR_base_time_
#define DEFINED_TYPEDEF_FOR_base_time_

struct base_time
{
  real_T dt;
  real_T simulation_time;
  real_T monotonic_time;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_lateral_normal_input_
#define DEFINED_TYPEDEF_FOR_lateral_normal_input_

struct lateral_normal_input
{
  base_time time;
  real_T Theta_deg;
  real_T Phi_deg;
  real_T r_deg_s;
  real_T pk_deg_s;
  real_T V_ias_kn;
  real_T V_tas_kn;
  real_T H_radio_ft;
  real_T delta_xi_pos;
  real_T delta_zeta_pos;
  boolean_T on_ground;
  boolean_T tracking_mode_on;
  boolean_T high_aoa_prot_active;
  boolean_T high_speed_prot_active;
  real_T ap_phi_c_deg;
  real_T ap_beta_c_deg;
  boolean_T any_ap_engaged;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_roll_data_computed_
#define DEFINED_TYPEDEF_FOR_base_roll_data_computed_

struct base_roll_data_computed
{
  real_T delta_xi_deg;
  real_T in_flight;
  real_T in_flight_gain;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_roll_normal_
#define DEFINED_TYPEDEF_FOR_base_roll_normal_

struct base_roll_normal
{
  real_T pk_c_deg_s;
  real_T Phi_c_deg;
  real_T xi_deg;
  real_T zeta_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_base_roll_output_
#define DEFINED_TYPEDEF_FOR_base_roll_output_

struct base_roll_output
{
  real_T xi_deg;
  real_T zeta_deg;
};

#endif

#ifndef DEFINED_TYPEDEF_FOR_lateral_normal_output_
#define DEFINED_TYPEDEF_FOR_lateral_normal_output_

struct lateral_normal_output
{
  lateral_normal_input input;
  base_roll_data_computed data_computed;
  base_roll_normal law_normal;
  base_roll_output output;
};

#endif
#endif


// ---- LateralDirectLaw_types.h
#ifndef LateralDirectLaw_types_h_
#define LateralDirectLaw_types_h_
#endif



