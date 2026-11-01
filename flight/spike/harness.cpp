// Headless spike: drive the real A32NX ELAC outside MSFS.
// Build: cl /std:c++17 /EHsc /I<model dir> harness.cpp <model dir>\*.cpp
// Purpose: prove the law computers run with no simulator, and see the outputs move.

#include "ElacComputer.h"

#include <cmath>
#include <cstdio>
#include <cstring>

static base_arinc_429 W(float v)
{
  base_arinc_429 w;
  w.SSM = 3;  // NormalOperation: 0=FW 1=NCD 2=FT 3=NO
  w.Data = v;
  return w;
}

static void fillEnvironment(elac_inputs& in)
{
  base_adr_bus adr;
  std::memset(&adr, 0, sizeof adr);
  adr.altitude_standard_ft = W(8000);
  adr.altitude_corrected_1_ft = W(8000);
  adr.altitude_corrected_2_ft = W(8000);
  adr.mach = W(0.42f);
  adr.airspeed_computed_kn = W(250);
  adr.airspeed_true_kn = W(280);
  adr.vertical_speed_ft_min = W(0);
  adr.aoa_corrected_deg = W(2.5f);
  adr.corrected_average_static_pressure = W(1013);

  base_ir_bus ir;
  std::memset(&ir, 0, sizeof ir);
  ir.heading_true_deg = W(0);
  ir.heading_magnetic_deg = W(0);
  ir.track_angle_true_deg = W(0);
  ir.track_angle_magnetic_deg = W(0);
  ir.pitch_angle_deg = W(2.0f);
  ir.roll_angle_deg = W(0);
  ir.body_pitch_rate_deg_s = W(0);
  ir.body_roll_rate_deg_s = W(0);
  ir.body_yaw_rate_deg_s = W(0);
  ir.body_normal_accel_g = W(1.0f);
  ir.body_long_accel_g = W(0);
  ir.body_lat_accel_g = W(0);
  ir.inertial_alt_ft = W(8000);
  ir.ground_speed_kn = W(250);

  base_ra_bus ra;
  std::memset(&ra, 0, sizeof ra);
  ra.radio_height_ft = W(2000);

  base_sfcc_bus sfcc;
  std::memset(&sfcc, 0, sizeof sfcc);

  // three ADR lanes and three IR lanes alive
  in.bus_inputs.adr_1_bus = adr;
  in.bus_inputs.adr_2_bus = adr;
  in.bus_inputs.adr_3_bus = adr;
  in.bus_inputs.ir_1_bus = ir;
  in.bus_inputs.ir_2_bus = ir;
  in.bus_inputs.ir_3_bus = ir;
  in.bus_inputs.ra_1_bus = ra;
  in.bus_inputs.ra_2_bus = ra;
  in.bus_inputs.sfcc_1_bus = sfcc;
  in.bus_inputs.sfcc_2_bus = sfcc;

  in.analog_inputs.load_factor_acc_1_g = 1.0f;
  in.analog_inputs.load_factor_acc_2_g = 1.0f;
  in.analog_inputs.blue_hyd_pressure_psi = 3000;
  in.analog_inputs.green_hyd_pressure_psi = 3000;
  in.analog_inputs.yellow_hyd_pressure_psi = 3000;

  in.discrete_inputs.is_unit_1 = false;   // unit 2 holds pitch priority (ElacComputer.cpp:867-868)
  in.discrete_inputs.elac_engaged_from_switch = true;
  // opponent ELAC alive and reporting: every word valid, all bits set
  base_elac_out_bus opp;
  std::memset(&opp, 0, sizeof opp);
  base_arinc_429* w = reinterpret_cast<base_arinc_429*>(&opp);
  for (size_t k = 0; k < sizeof opp / sizeof(base_arinc_429); ++k) { w[k].SSM = 3; w[k].Data = 3.4e38f; }
  in.bus_inputs.elac_opp_bus = opp;
  in.sim_data.computer_running = true;
  in.time.dt = 0.02f;
}

int main()
{
  ElacComputer elac;
  elac.initialize();

  ElacComputer::ExternalInputs_ElacComputer_T in;
  std::memset(&in, 0, sizeof in);

  const double dt = 0.02;      // 50 Hz
  const int steps = 3000;      // 60 s
  double t = 0.0;

  fillEnvironment(in.in);

  std::printf("%6s %8s %10s %10s %10s %8s\n", "t", "stick", "elevCmd", "busElevL", "thsCmd", "inflt");
  bool prev_ok = false;

  for (int i = 0; i < steps; ++i) {
    t = i * dt;

    // 10 s neutral, 2 s ramp to full nose-up, hold 20 s, release back to neutral
    double stick = 0.0;
    if (t >= 10.0 && t < 12.0) stick = -(t - 10.0) / 2.0;
    else if (t >= 12.0 && t < 32.0) stick = -1.0;
    else if (t >= 32.0 && t < 34.0) stick = -1.0 + (t - 32.0) / 2.0;

    in.in.time.dt = (float)dt;
    in.in.time.simulation_time = t;
    in.in.time.monotonic_time = t;
    in.in.analog_inputs.capt_pitch_stick_pos = (float)stick;
    in.in.analog_inputs.fo_pitch_stick_pos = 0.0f;

    elac.setExternalInputs(&in);
    elac.step();
    const ElacComputer::ExternalOutputs_ElacComputer_T& y = elac.getExternalOutputs();

    bool ok = y.out.discrete_outputs.pitch_axis_ok;
    bool changed = (ok != prev_ok);
    prev_ok = ok;

    if (i % 25 == 0 || changed) {
      std::printf("  stk=%.3f tot=%.3f law=%d eng=%d can=%d pri=%d grnd=%d\n",
                  (double)y.out.data.analog_inputs.capt_pitch_stick_pos,
                  (double)y.out.logic.total_sidestick_pitch_command,
                  (int)y.out.logic.active_pitch_law,
                  (int)y.out.logic.is_engaged_in_pitch,
                  (int)y.out.logic.can_engage_in_pitch,
                  (int)y.out.logic.has_priority_in_pitch,
                  (int)y.out.logic.on_ground);
      std::printf("%6.2f %8.3f %10.4f %10.4f %10.4f %8d%s\n", t, stick,
                  (double)y.out.laws.pitch_law_outputs.elevator_command_deg,
                  (double)y.out.bus_outputs.left_elevator_position_deg.Data,
                  (double)y.out.laws.pitch_law_outputs.ths_command_deg,
                  (int)y.out.logic.pitch_law_in_flight,
                  changed ? "  <-- pitch_axis_ok changed" : "");
    }
  }

  const ElacComputer::ExternalOutputs_ElacComputer_T& y = elac.getExternalOutputs();
  std::printf("\nfinal: pitch_axis_ok=%d digital_output_validated=%d ap_1_authorised=%d\n",
              (int)y.out.discrete_outputs.pitch_axis_ok,
              (int)y.out.discrete_outputs.digital_output_validated,
              (int)y.out.discrete_outputs.ap_1_authorised);

  bool finite = true;
  const float vals[] = {y.out.bus_outputs.left_elevator_position_deg.Data,
                        y.out.bus_outputs.right_elevator_position_deg.Data,
                        y.out.bus_outputs.left_aileron_position_deg.Data,
                        y.out.bus_outputs.ths_position_deg.Data,
                        y.out.bus_outputs.rudder_pedal_position_deg.Data};
  for (float v : vals) if (!std::isfinite(v)) finite = false;

  std::printf("all outputs finite: %s\n", finite ? "yes" : "NO");
  return finite ? 0 : 1;
}






