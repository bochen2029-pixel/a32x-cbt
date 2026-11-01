// The world adapter. See efcs.h. Line references are to fbw_a320/src/FlyByWireInterface.cpp at 66021c2.
// GPLv3.

#include "efcs.h"

#include <cstring>

#include "Arinc429Utils.h"

Efcs& Efcs::instance() {
  static Efcs set;  // static storage: zero-filled before the constructor runs, as in MSFS
  return set;
}

Efcs::Efcs()
    : elacs_{Elac(true), Elac(false)},
      secs_{Sec(true, false), Sec(false, false), Sec(false, true)},
      facs_{Fac(true), Fac(false)},
      fcdcs_{Fcdc(true), Fcdc(false)} {}

void Efcs::tick(const World& w, double dt) {
  time_ += dt;
  for (int i = 0; i < 2; ++i) updateElac(w, i, dt);
  for (int i = 0; i < 3; ++i) updateSec(w, i, dt);
  for (int i = 0; i < 2; ++i) updateFac(w, i, dt);
  for (int i = 0; i < 2; ++i) updateFcdc(w, i, dt);
}

// :1350-1491
void Efcs::updateElac(const World& w, int i, double dt) {
  const int opp = i == 0 ? 1 : 0;
  auto& in = elacs_[i].modelInputs.in;

  in.time.dt = dt;
  in.time.simulation_time = time_;
  in.time.monotonic_time = time_;
  in.sim_data.slew_on = false;
  in.sim_data.pause_on = false;
  in.sim_data.tracking_mode_on_override = false;
  in.sim_data.tailstrike_protection_on = false;

  auto& d = in.discrete_inputs;
  d.ground_spoilers_active_1 = tx_.secDiscrete[0].ground_spoiler_out;
  d.ground_spoilers_active_2 = i == 0 ? tx_.secDiscrete[1].ground_spoiler_out : tx_.secDiscrete[2].ground_spoiler_out;
  d.is_unit_1 = i == 0;
  d.is_unit_2 = i == 1;
  d.opp_axis_pitch_failure = !tx_.elacDiscrete[opp].pitch_axis_ok;
  d.ap_1_disengaged = true;  // no FMGC in P6: autopilots are off
  d.ap_2_disengaged = true;
  d.opp_left_aileron_lost = !tx_.elacDiscrete[opp].left_aileron_ok;
  d.opp_right_aileron_lost = !tx_.elacDiscrete[opp].right_aileron_ok;
  d.fac_1_yaw_control_lost = !tx_.facDiscrete[0].yaw_damper_avail_for_norm_law;
  d.lgciu_1_nose_gear_pressed = w.noseGearCompressed();
  d.lgciu_2_nose_gear_pressed = w.noseGearCompressed();
  d.fac_2_yaw_control_lost = !tx_.facDiscrete[1].yaw_damper_avail_for_norm_law;
  d.lgciu_1_right_main_gear_pressed = w.mainGearCompressed();
  d.lgciu_2_right_main_gear_pressed = w.mainGearCompressed();
  d.lgciu_1_left_main_gear_pressed = w.mainGearCompressed();
  d.lgciu_2_left_main_gear_pressed = w.mainGearCompressed();
  d.ths_motor_fault = false;
  d.sfcc_1_slats_out = false;  // the driver hard-codes these false too
  d.sfcc_2_slats_out = false;
  d.l_ail_servo_failed = false;
  d.l_elev_servo_failed = false;
  d.r_ail_servo_failed = false;
  d.r_elev_servo_failed = false;
  d.ths_override_active = false;
  d.yellow_low_pressure = !w.hydPressurised[2];
  d.capt_priority_takeover_pressed = false;
  d.fo_priority_takeover_pressed = false;
  d.blue_low_pressure = !w.hydPressurised[1];
  d.green_low_pressure = !w.hydPressurised[0];
  d.elac_engaged_from_switch = w.crew.elacOn[i];
  d.normal_powersupply_lost = false;

  auto& a = in.analog_inputs;
  a.capt_pitch_stick_pos = w.crew.pitch;
  a.fo_pitch_stick_pos = 0;
  a.capt_roll_stick_pos = w.crew.roll;
  a.fo_roll_stick_pos = 0;
  a.left_elevator_pos_deg = w.surfaces.elevator[0];
  a.right_elevator_pos_deg = w.surfaces.elevator[1];
  a.ths_pos_deg = w.surfaces.ths;
  a.left_aileron_pos_deg = w.surfaces.aileron[0];
  a.right_aileron_pos_deg = w.surfaces.aileron[1];
  a.rudder_pedal_pos = w.crew.pedals;
  a.load_factor_acc_1_g = 0;  // the driver feeds zero; the laws take load factor from the IRs
  a.load_factor_acc_2_g = 0;
  a.blue_hyd_pressure_psi = w.hydPsi[1];
  a.green_hyd_pressure_psi = w.hydPsi[0];
  a.yellow_hyd_pressure_psi = w.hydPsi[2];

  auto& b = in.bus_inputs;
  b.adr_1_bus = w.adr[0];
  b.adr_2_bus = w.adr[1];
  b.adr_3_bus = w.adr[2];
  b.ir_1_bus = w.ir[0];
  b.ir_2_bus = w.ir[1];
  b.ir_3_bus = w.ir[2];
  b.fmgc_1_bus = w.fmgc[0];
  b.fmgc_2_bus = w.fmgc[1];
  b.ra_1_bus = w.ra[0];
  b.ra_2_bus = w.ra[1];
  b.sfcc_1_bus = w.sfcc[0];
  b.sfcc_2_bus = w.sfcc[1];
  b.fcdc_1_bus = tx_.fcdcBus[0];
  b.fcdc_2_bus = tx_.fcdcBus[1];
  b.sec_1_bus = tx_.secBus[0];
  b.sec_2_bus = tx_.secBus[1];
  b.elac_opp_bus = tx_.elacBus[opp];

  elacs_[i].update(dt, time_, false, true);
  tx_.elacDiscrete[i] = elacs_[i].getDiscreteOutputs();
  tx_.elacAnalog[i] = elacs_[i].getAnalogOutputs();
  tx_.elacBus[i] = elacs_[i].getBusOutputs();
}

// :1492-1651
void Efcs::updateSec(const World& w, int i, double dt) {
  const int opp = i == 0 ? 1 : 0;
  auto& in = secs_[i].modelInputs.in;

  in.time.dt = dt;
  in.time.simulation_time = time_;
  in.time.monotonic_time = time_;
  in.sim_data.slew_on = false;
  in.sim_data.pause_on = false;
  in.sim_data.tracking_mode_on_override = false;
  in.sim_data.tailstrike_protection_on = false;

  auto& d = in.discrete_inputs;
  d.sec_engaged_from_switch = w.crew.secOn[i];
  d.sec_in_emergency_powersupply = false;
  d.is_unit_1 = i == 0;
  d.is_unit_2 = i == 1;
  d.is_unit_3 = i == 2;
  const bool pitchCapable = i < 2;  // SEC 3 has no pitch channel
  d.pitch_not_avail_elac_1 = pitchCapable && !tx_.elacDiscrete[0].pitch_axis_ok;
  d.pitch_not_avail_elac_2 = pitchCapable && !tx_.elacDiscrete[1].pitch_axis_ok;
  d.left_elev_not_avail_sec_opp = pitchCapable && !tx_.secDiscrete[opp].left_elevator_ok;
  d.right_elev_not_avail_sec_opp = pitchCapable && !tx_.secDiscrete[opp].right_elevator_ok;
  d.ths_motor_fault = false;
  d.l_elev_servo_failed = false;
  d.r_elev_servo_failed = false;
  d.ths_override_active = false;
  d.digital_output_failed_elac_1 = !tx_.elacDiscrete[0].digital_output_validated;
  d.digital_output_failed_elac_2 = !tx_.elacDiscrete[1].digital_output_validated;
  d.green_low_pressure = !w.hydPressurised[0];
  d.blue_low_pressure = !w.hydPressurised[1];
  d.yellow_low_pressure = !w.hydPressurised[2];
  d.sfcc_1_slats_out = false;
  d.sfcc_2_slats_out = false;
  d.l_spoiler_1_servo_failed = false;
  d.r_spoiler_1_servo_failed = false;
  d.l_spoiler_2_servo_failed = false;
  d.r_spoiler_2_servo_failed = false;
  d.capt_priority_takeover_pressed = false;
  d.fo_priority_takeover_pressed = false;

  auto& a = in.analog_inputs;
  a.capt_pitch_stick_pos = pitchCapable ? w.crew.pitch : 0;
  a.fo_pitch_stick_pos = 0;
  a.left_elevator_pos_deg = pitchCapable ? w.surfaces.elevator[0] : 0;
  a.right_elevator_pos_deg = pitchCapable ? w.surfaces.elevator[1] : 0;
  a.ths_pos_deg = pitchCapable ? w.surfaces.ths : 0;
  a.load_factor_acc_1_g = 0;
  a.load_factor_acc_2_g = 0;
  a.capt_roll_stick_pos = w.crew.roll;
  a.fo_roll_stick_pos = 0;
  a.spd_brk_lever_pos = w.crew.spoilersArmed ? -0.05 : w.crew.speedbrake;
  a.thr_lever_1_pos = w.crew.tla[0];
  a.thr_lever_2_pos = w.crew.tla[1];
  // Spoiler pairs: SEC 3 drives 1 and 2, SEC 1 drives 3 and 4, SEC 2 drives 5 alone.
  const int first = i == 2 ? 0 : (i == 0 ? 2 : 4);
  a.left_spoiler_1_pos_deg = w.surfaces.spoiler[0][first];
  a.right_spoiler_1_pos_deg = w.surfaces.spoiler[1][first];
  // Departure: for SEC 2 the driver reads idLeftSpoilerPosition[5] here, one past its five-element
  // array (:1592-1595). SEC 2 has no second spoiler; it reads zero here.
  a.left_spoiler_2_pos_deg = first + 1 < 5 ? w.surfaces.spoiler[0][first + 1] : 0;
  a.right_spoiler_2_pos_deg = first + 1 < 5 ? w.surfaces.spoiler[1][first + 1] : 0;
  a.wheel_speed_left = w.wheelSpeedKn();
  a.wheel_speed_right = w.wheelSpeedKn();

  auto& b = in.bus_inputs;
  const int adr1 = i == 2 ? 1 : 0;  // SEC 1: ADIRS 1 and 3; SEC 2: 1 and 2; SEC 3: 2 and 3
  const int adr2 = i == 1 ? 1 : 2;
  b.adr_1_bus = w.adr[adr1];
  b.adr_2_bus = w.adr[adr2];
  b.ir_1_bus = w.ir[adr1];
  b.ir_2_bus = w.ir[adr2];
  b.fcdc_1_bus = tx_.fcdcBus[0];
  b.fcdc_2_bus = tx_.fcdcBus[1];
  b.elac_1_bus = tx_.elacBus[0];
  b.elac_2_bus = tx_.elacBus[1];
  b.sfcc_1_bus = w.sfcc[0];
  b.sfcc_2_bus = w.sfcc[1];
  b.lgciu_1_bus = w.lgciu[0];
  b.lgciu_2_bus = w.lgciu[1];

  secs_[i].update(dt, time_, false, true);
  tx_.secDiscrete[i] = secs_[i].getDiscreteOutputs();
  tx_.secAnalog[i] = secs_[i].getAnalogOutputs();
  tx_.secBus[i] = secs_[i].getBusOutputs();
}

// :2418-2535
void Efcs::updateFac(const World& w, int i, double dt) {
  const int opp = i == 0 ? 1 : 0;
  auto& in = facs_[i].modelInputs.in;

  in.time.dt = dt;
  in.time.simulation_time = time_;
  in.time.monotonic_time = time_;
  in.sim_data.slew_on = false;
  in.sim_data.pause_on = false;
  in.sim_data.tracking_mode_on_override = false;
  in.sim_data.tailstrike_protection_on = false;

  auto& d = in.discrete_inputs;
  d.ap_own_engaged = false;
  d.ap_opp_engaged = false;
  d.yaw_damper_opp_engaged = tx_.facDiscrete[opp].yaw_damper_engaged;
  d.rudder_trim_opp_engaged = tx_.facDiscrete[opp].rudder_trim_engaged;
  d.rudder_travel_lim_opp_engaged = tx_.facDiscrete[opp].rudder_travel_lim_engaged;
  d.elac_1_healthy = tx_.elacDiscrete[0].digital_output_validated;
  d.elac_2_healthy = tx_.elacDiscrete[1].digital_output_validated;
  d.engine_1_stopped = true;  // the driver hard-codes these true
  d.engine_2_stopped = true;
  d.rudder_trim_switch_left = w.crew.rudderTrimLeft;  // the driver reads the sim's trim input here
  d.rudder_trim_switch_right = w.crew.rudderTrimRight;
  d.rudder_trim_reset_button = w.crew.rudderTrimReset;
  d.fac_engaged_from_switch = w.crew.facOn[i];
  d.fac_opp_healthy = tx_.facDiscrete[opp].fac_healthy;
  d.is_unit_1 = i == 0;
  d.rudder_trim_actuator_healthy = true;
  d.rudder_travel_lim_actuator_healthy = true;
  d.slats_extended = !Arinc429Utils::bitFromValueOr(w.sfcc[i].slat_flap_actual_position_word, 12, false);
  d.nose_gear_pressed = w.noseGearCompressed();
  d.ir_3_switch = false;
  d.adr_3_switch = false;
  d.yaw_damper_has_hyd_press = i == 0 ? w.hydPressurised[0] : w.hydPressurised[2];

  auto& a = in.analog_inputs;
  a.yaw_damper_position_deg = 0;  // the driver feeds zero
  // Not negated, unlike the driver (:2464): the driver negates because the hydraulics hold the trim in
  // their frame, having negated its order on the way in. The world holds it in the computers' frame.
  a.rudder_trim_position_deg = w.surfaces.rudderTrim;
  a.rudder_travel_lim_position_deg = w.surfaces.travelLimiter;

  auto& b = in.bus_inputs;
  b.fac_opp_bus = tx_.facBus[opp];
  b.adr_own_bus = w.adr[i];
  b.adr_opp_bus = w.adr[opp];
  b.adr_3_bus = w.adr[2];
  b.ir_own_bus = w.ir[i];
  b.ir_opp_bus = w.ir[opp];
  b.ir_3_bus = w.ir[2];
  b.fmgc_own_bus = w.fmgc[i];
  b.fmgc_opp_bus = w.fmgc[opp];
  b.sfcc_own_bus = w.sfcc[i];
  b.lgciu_own_bus = w.lgciu[i];
  b.elac_1_bus = tx_.elacBus[0];
  b.elac_2_bus = tx_.elacBus[1];

  facs_[i].update(dt, time_, false, true);
  tx_.facDiscrete[i] = facs_[i].getDiscreteOutputs();
  tx_.facAnalog[i] = facs_[i].getAnalogOutputs();
  tx_.facBus[i] = facs_[i].getBusOutputs();
}

// :1653-1717
void Efcs::updateFcdc(const World& w, int i, double dt) {
  const int opp = i == 0 ? 1 : 0;

  auto& d = fcdcs_[i].discreteInputs;
  d.elac1Off = !w.crew.elacOn[0];
  d.elac1Valid = tx_.elacDiscrete[0].digital_output_validated;
  d.elac2Valid = tx_.elacDiscrete[1].digital_output_validated;
  d.sec1Off = !w.crew.secOn[0];
  d.sec1Valid = !tx_.secDiscrete[0].sec_failed;
  d.sec2Valid = !tx_.secDiscrete[1].sec_failed;
  d.eng1NotOnGroundAndNotLowOilPress = false;  // the driver hard-codes these false
  d.eng2NotOnGroundAndNotLowOilPress = false;
  d.noseGearPressed = w.noseGearCompressed();
  d.oppFcdcFailed = !tx_.fcdcDiscrete[opp].fcdcValid;
  d.sec3Off = !w.crew.secOn[2];
  d.sec3Valid = !tx_.secDiscrete[2].sec_failed;
  d.elac2Off = !w.crew.elacOn[1];
  d.sec2Off = !w.crew.secOn[1];

  auto& b = fcdcs_[i].busInputs;
  b.elac1 = tx_.elacBus[0];
  b.sec1 = tx_.secBus[0];
  b.fcdcOpp = tx_.fcdcBus[opp];
  b.elac2 = tx_.elacBus[1];
  b.sec2 = tx_.secBus[1];
  b.sec3 = tx_.secBus[2];

  fcdcs_[i].update(dt, false, true);
  tx_.fcdcDiscrete[i] = fcdcs_[i].getDiscreteOutputs();
  const FcdcBus bus = fcdcs_[i].getBusOutputs();
  static_assert(sizeof(FcdcBus) == sizeof(base_fcdc_bus), "the driver reinterprets FcdcBus as base_fcdc_bus");
  std::memcpy(&tx_.fcdcBus[i], &bus, sizeof bus);
}

// :2537-2605. Positions stay in the computers' frame: the driver's sign flips translate into the
// hydraulics' frame, and the stub's servos speak the computers' own.
Orders Efcs::orders() const {
  Orders o;
  const auto& ed = tx_.elacDiscrete;
  const auto& ea = tx_.elacAnalog;
  const auto& sd = tx_.secDiscrete;
  const auto& sa = tx_.secAnalog;

  for (int e = 0; e < 2; ++e) {  // aileron servos: energised = position control
    o.aileronActive[0][e] = ed[e].left_aileron_active_mode;
    o.aileron[0][e] = ea[e].left_aileron_pos_order;
    o.aileronActive[1][e] = ed[e].right_aileron_active_mode;
    o.aileron[1][e] = ea[e].right_aileron_pos_order;
  }

  // Elevator servos have reverted logic (a320_systems hydraulic/mod.rs, elevator_actuator_mode_from_
  // solenoid): de-energised = position control. Servo 1 (blue) takes ELAC 1 + SEC 1 orders and is
  // energised by ELAC 2 / SEC 2 damping; servo 2 (green or yellow) the reverse. Both energised damps both.
  const bool leftSolenoid[2] = {ed[1].left_elevator_damping_mode || sd[1].left_elevator_damping_mode,
                                ed[0].left_elevator_damping_mode || sd[0].left_elevator_damping_mode};
  const bool rightSolenoid[2] = {ed[1].right_elevator_damping_mode || sd[1].right_elevator_damping_mode,
                                 ed[0].right_elevator_damping_mode || sd[0].right_elevator_damping_mode};
  for (int k = 0; k < 2; ++k) {
    o.elevatorActive[0][k] = !leftSolenoid[k] && !(leftSolenoid[0] && leftSolenoid[1]);
    o.elevatorActive[1][k] = !rightSolenoid[k] && !(rightSolenoid[0] && rightSolenoid[1]);
    o.elevator[0][k] = ea[k].left_elev_pos_order_deg + sa[k].left_elev_pos_order_deg;
    o.elevator[1][k] = ea[k].right_elev_pos_order_deg + sa[k].right_elev_pos_order_deg;
  }

  o.thsActive[0] = ed[1].ths_active;
  o.ths[0] = ea[1].ths_pos_order;
  o.thsActive[1] = ed[0].ths_active || sd[0].ths_active;
  o.ths[1] = ea[0].ths_pos_order + sa[0].ths_pos_order_deg;
  o.thsActive[2] = sd[1].ths_active;
  o.ths[2] = sa[1].ths_pos_order_deg;

  const int sec[5] = {2, 2, 0, 0, 1};
  for (int k = 0; k < 5; ++k) {
    const bool firstOfPair = k == 0 || k == 2 || k == 4;
    o.spoiler[0][k] = firstOfPair ? sa[sec[k]].left_spoiler_1_pos_order_deg : sa[sec[k]].left_spoiler_2_pos_order_deg;
    o.spoiler[1][k] = firstOfPair ? sa[sec[k]].right_spoiler_1_pos_order_deg : sa[sec[k]].right_spoiler_2_pos_order_deg;
  }

  for (int f = 0; f < 2; ++f) {
    o.yawDamperActive[f] = tx_.facDiscrete[f].yaw_damper_engaged;
    o.yawDamper[f] = tx_.facAnalog[f].yaw_damper_order_deg;
    o.rudderTrimActive[f] = tx_.facDiscrete[f].rudder_trim_engaged;
    o.rudderTrim[f] = tx_.facAnalog[f].rudder_trim_order_deg;
    o.travelLimiterActive[f] = tx_.facDiscrete[f].rudder_travel_lim_engaged;
    o.travelLimiter[f] = tx_.facAnalog[f].rudder_travel_limit_order_deg;
  }
  return o;
}
