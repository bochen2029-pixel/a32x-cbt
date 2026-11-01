// The stub world: everything around the flight control computers that P7 replaces with a real
// airframe. GPLv3.
//
// It is deliberately small. Sensors are transmitted the way the A32NX producers transmit them
// (fbw-common/.../navigation/adirs.rs, landing_gear/mod.rs, a320_systems/.../sfcc/mod.rs): standard
// aeronautical signs, accelerometers that include gravity, discrete bits where the producers put
// them. Actuators follow the computers' orders at a finite rate, so position feedback agrees with
// command the way a healthy servo makes it agree. The airframe is a stub — a point mass with a
// short-period pitch response, a first-order roll response and coordinated turns — stable enough
// to close the loop around the laws, and not A320 data. Nothing here is aerodynamics.

#pragma once

#include "ElacComputer_types.h"
#include "FacComputer_types.h"
#include "SecComputer_types.h"

// What the crew's hands and the overhead panel are doing.
struct Crew {
  double pitch = 0;       // sidestick, +1 full pull (the computers' capt_pitch_stick_pos)
  double roll = 0;        // sidestick, the computers' capt_roll_stick_pos
  double pedals = 0;      // the computers' rudder_pedal_pos, -1..1
  double speedbrake = 0;  // lever, 0 retracted .. 1 full
  bool spoilersArmed = false;
  double tla[2] = {0, 0};  // thrust lever angle, deg: 0 idle, 25 CL, 45 TOGA
  bool elacOn[2] = {false, false};
  bool secOn[3] = {false, false, false};
  bool facOn[2] = {false, false};
};

// What the computers tell the actuators, as FlyByWireInterface::updateServoSolenoidStatus hands it
// over. Every position is in the computers' own frame and sign.
struct Orders {
  bool aileronActive[2][2] = {};  // [left, right][servo driven by ELAC 1, ELAC 2]
  double aileron[2][2] = {};
  bool elevatorActive[2][2] = {};  // [left, right][servo driven by ELAC 1 + SEC 1, ELAC 2 + SEC 2]
  double elevator[2][2] = {};
  bool thsActive[3] = {};  // motors: ELAC 2; ELAC 1 + SEC 1; SEC 2
  double ths[3] = {};
  double spoiler[2][5] = {};  // [left, right][spoiler 1..5]
  bool yawDamperActive[2] = {};
  double yawDamper[2] = {};
  bool rudderTrimActive[2] = {};
  double rudderTrim[2] = {};
  bool travelLimiterActive[2] = {};
  double travelLimiter[2] = {};
};

// Surface positions, computers' frame, degrees.
struct Surfaces {
  double elevator[2] = {0, 0};  // + trailing edge down
  double ths = 0;
  double aileron[2] = {0, 0};
  double spoiler[2][5] = {};  // - extended: the computers order spoilers out with negative angles
  double yawDamper = 0;
  double rudderTrim = 0;
  double travelLimiter = 25;
};

enum class Phase { Parked, PowerUp, GroundCheck, Taxi, TakeoffRoll, Climb, Cruise, Approach, Flare, Rollout };

const char* phaseName(Phase p);

class World {
 public:
  World();

  // One 20 ms step: the crew acts on the previous instant, the actuators follow the orders, the
  // airframe moves, and the sensors are re-sampled.
  void step(double dt, const Orders& orders);

  // --- what the buses carry -------------------------------------------------------------------
  base_adr_bus adr[3] = {};
  base_ir_bus ir[3] = {};
  base_ra_bus ra[2] = {};
  base_lgciu_bus lgciu[2] = {};
  base_sfcc_bus sfcc[2] = {};
  base_fmgc_b_bus fmgc[2] = {};

  // --- discretes and analogues the driver reads from simvars -----------------------------------
  bool hydPressurised[3] = {true, true, true};  // green, blue, yellow
  double hydPsi[3] = {3000, 3000, 3000};
  bool noseGearCompressed() const { return onGround_ && theta_ < 0.5; }
  bool mainGearCompressed() const { return onGround_; }
  bool noseGearDownlocked() const { return gearDown_; }
  double wheelSpeedKn() const { return wheelSpeed_; }

  Crew crew;
  Surfaces surfaces;

  // --- for the runner's checks and trace -------------------------------------------------------
  double time() const { return t_; }
  Phase phase() const { return phase_; }
  int circuit() const { return circuit_; }
  double altitudeFt() const { return h_; }
  double tasKn() const { return v_; }
  double pitchDeg() const { return theta_; }
  double rollDeg() const { return phi_; }
  double pitchRateDegS() const { return q_; }
  double rollRateDegS() const { return p_; }
  double loadFactor() const { return n_; }
  double headingDeg() const { return psi_; }
  double flightPathDeg() const { return gamma_; }
  bool onGround() const { return onGround_; }

  // The scripted crew may be overridden for a property test: a fixed stick input in a time window.
  struct Override {
    double from = -1, to = -1;
    double pitch = 0, roll = 0;
  } stickOverride;

  // From this time on, all three ADRs transmit FailureWarning, as failed ADRs do. Negative: never.
  double adrFailAt = -1;

 private:
  void fly();
  void actuate(double dt, const Orders& o);
  void airframe(double dt);
  void sense();

  double t_ = 0;
  Phase phase_ = Phase::Parked;
  double phaseStart_ = 0;
  int circuit_ = 0;
  double headingTarget_ = 360;

  // airframe state: TAS kt, altitude ft, attitudes deg, rates deg/s
  double v_ = 0, vTarget_ = 0, vDot_ = 0;
  double h_ = 0, hDot_ = 0;
  double theta_ = 0, q_ = 0;
  double gamma_ = 0, gammaDot_ = 0;
  double phi_ = 0, p_ = 0, phiDot_ = 0;
  double psi_ = 360, psiDot_ = 0;
  double n_ = 1;
  bool onGround_ = true;
  bool gearDown_ = true;
  double wheelSpeed_ = 0;

  // configuration: 0 clean, 1, 2, 3, 4 = FULL; the FPPU angles the SFCC reports
  int conf_ = 0;
  double slatFppu_ = 0, flapFppu_ = 0;
};
