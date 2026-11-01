// The world around the flight control computers: the crew, the servos, the sensors, and since P7 a
// JSBSim airframe in place of the P6 stub's point mass. GPLv3.
//
// Sensors are transmitted the way the A32NX producers transmit them (fbw-common/.../navigation/
// adirs.rs, landing_gear/mod.rs, a320_systems/.../sfcc/mod.rs): standard aeronautical signs,
// accelerometers that include gravity, discrete bits where the producers put them. Actuators follow
// the computers' orders at a finite rate, so position feedback agrees with command the way a healthy
// servo makes it agree. The airframe is our fitted A320 or JSBSim's 737 (airframe.h). The crew
// is a script that flies it through the laws, closed loop, the way a pilot would.

#pragma once

#include <memory>

#include "ElacComputer_types.h"
#include "FacComputer_types.h"
#include "SecComputer_types.h"
#include "airframe.h"

// What the crew's hands and the overhead panel are doing.
struct Crew {
  double pitch = 0;       // sidestick, +1 full pull (the computers' capt_pitch_stick_pos)
  double roll = 0;        // sidestick, the computers' capt_roll_stick_pos
  double pedals = 0;      // the computers' rudder_pedal_pos, -1..1, + left
  double speedbrake = 0;  // lever, 0 retracted .. 1 full
  bool spoilersArmed = false;
  double tla[2] = {0, 0};  // thrust lever angle, deg: 0 idle, 25 CL, 45 TOGA
  bool elacOn[2] = {false, false};
  bool secOn[3] = {false, false, false};
  bool facOn[2] = {false, false};
  double brakes = 1;      // toe brakes, both feet, 0..1; parked on them at the start
  bool gearDown = true;   // gear lever
  int flapLever = 0;      // 0, 1, 2, 3, 4 = FULL
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
  double rudder = 0;  // the surface: pedals, trim and yaw damper, inside the travel limit; + left
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
  bool noseGearCompressed() const { return air().noseWow; }
  bool mainGearCompressed() const { return air().leftWow || air().rightWow; }
  bool noseGearDownlocked() const { return air().gearPosition >= kDownlocked; }
  double wheelSpeedKn() const { return air().wheelSpeedKn; }

  Crew crew;
  Surfaces surfaces;

  // --- for the runner's checks and trace -------------------------------------------------------
  double time() const { return t_; }
  Phase phase() const { return phase_; }
  int circuit() const { return circuit_; }
  double altitudeFt() const { return air().pressureAltitudeFt; }
  double radioHeightFt() const { return air().radioHeightFt; }
  double tasKn() const { return air().tasKn; }
  double casKn() const { return air().casKn; }
  double groundSpeedKn() const { return air().groundSpeedKn; }
  double verticalSpeedFpm() const { return air().verticalSpeedFpm; }
  double alphaDeg() const { return air().alphaDeg; }
  double betaDeg() const { return air().betaDeg; }
  double pitchDeg() const { return air().pitchDeg; }
  double rollDeg() const { return air().rollDeg; }
  double pitchRateDegS() const { return air().qDegS; }  // body rates
  double rollRateDegS() const { return air().pDegS; }
  double yawRateDegS() const { return air().rDegS; }
  double loadFactor() const { return air().nz; }
  double headingDeg() const { return air().headingDeg; }
  double flightPathDeg() const { return air().flightPathDeg; }
  double flapDeg() const { return flapDeg_; }
  bool onGround() const { return mainGearCompressed(); }

  // When the airframe went below the runway, or -1. JSBSim's 737 touches the ground only with its
  // gear; anything lower has flown into it. The world freezes there: what JSBSim makes of an
  // aeroplane under the ground is not something to feed the computers.
  double crashedAt() const { return crashedAt_; }

  // The scripted crew may be overridden for a property test: a fixed stick input in a time window.
  struct Override {
    double from = -1, to = -1;
    double pitch = 0, roll = 0;
  } stickOverride;

  // From this time on, all three ADRs transmit FailureWarning, as failed ADRs do. Negative: never.
  double adrFailAt = -1;

 private:
  static constexpr double kDownlocked = 0.999;
  static constexpr double kCrashFt = 3;  // radio height below which the airframe is in the ground

  double crashedAt_ = -1;

  const AirframeState& air() const { return airframe_->state(); }

  void fly(double dt);
  void actuate(double dt, const Orders& o);
  void airframe(double dt);
  void sense();

  // The crew's hands on the thrust levers and the sidestick, split the way the A320's own modes split
  // the job: in an open climb or descent the thrust is set and the elevator holds the speed; near the
  // level the elevator holds the altitude and the thrust the speed; on a glide path the elevator
  // holds the path and the thrust the speed.
  void climbOrDescend(double altitudeTarget, double casTarget, double climbTla, double dt);
  void holdPath(double gammaTarget, double casTarget, double dt);
  void thrustFor(double casTarget, double tlaMax, double dt);
  void stickFor(double gammaTarget, double dt);
  void steerOnGround(double headingTarget);

  std::unique_ptr<Airframe> airframe_;

  double t_ = 0;
  Phase phase_ = Phase::Parked;
  double phaseStart_ = 0;
  int circuit_ = 0;
  int stage_ = 0;  // a step within a phase: the approach configures in stages
  double headingTarget_ = 360;
  double rotateAt_ = -1;  // when the takeoff rotation began

  // what the crew carries from one step to the next
  double tla_ = 0;
  double lastCas_ = 0, casRate_ = 0;      // kt, kt/s
  double gammaCmd_ = 0, gammaSpeed_ = 0;  // deg: the flight path being flown, and the one the speed asks for

  // flaps and slats: the pick-off angles the SFCCs report, and the flap surface they move
  bool conf1F_ = false;
  double slatFppu_ = 0, flapFppu_ = 0, flapDeg_ = 0;
};
