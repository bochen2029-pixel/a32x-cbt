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

#include <string>

#include <memory>

#include "ElacComputer_types.h"
#include "FacComputer_types.h"
#include "SecComputer_types.h"
#include "airframe.h"
#include "runway.h"

// What the crew's hands and the overhead panel are doing.
struct Crew {
  double pitch = 0;       // sidestick, +1 full pull (the computers' capt_pitch_stick_pos)
  double roll = 0;        // sidestick, the computers' capt_roll_stick_pos
  double pedals = 0;      // the computers' rudder_pedal_pos, -1..1, + left
  double speedbrake = 0;  // lever, 0 retracted .. 1 full
  bool spoilersArmed = false;
  double tla[2] = {0, 0};  // thrust lever angle, deg: -20 MAX REV, -6 REV IDLE, 0 idle, 25 CL, 45 TOGA
  bool elacOn[2] = {false, false};
  bool secOn[3] = {false, false, false};
  bool facOn[2] = {false, false};
  double brakes = 1;      // toe brakes, both feet, 0..1; parked on them at the start
  bool gearDown = true;   // gear lever
  int flapLever = 0;      // 0, 1, 2, 3, 4 = FULL
  bool rudderTrimLeft = false, rudderTrimRight = false;  // RUD TRIM switch, momentary
  bool rudderTrimReset = false;                          // RUD TRIM RESET pushbutton
  double pitchTrim = 0;   // the pitch trim wheel, turned at this fraction of its rate, -1..1, + nose up
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
  // and what the FCDC tells the cockpit: pitch direct law, the PFD's USE MAN PITCH TRIM
  bool pitchDirect = false;
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

// The instructor's failures (ROADMAP.md, P7 step 3): each unit fails from its time on, in seconds after
// the start; negative is never. A failed ADR or IR transmits FailureWarning on every word; a failed
// hydraulic system loses its pressure, and with it the servos, the THS motor and the slat and flap
// motors it drives; a failed ELAC or SEC stops, as A32NX's failure stops it (the computer's
// faultActive). The computers decide what law that leaves.
struct Failures {
  double adr[3] = {-1, -1, -1};
  double ir[3] = {-1, -1, -1};
  double hyd[3] = {-1, -1, -1};  // green, blue, yellow
  double elac[2] = {-1, -1};
  double sec[3] = {-1, -1, -1};
  double ra[2] = {-1, -1};       // the radio altimeters
};

// How the scripted crew begins its flare and flies it, so that a driver outside the harness can decide when (the
// Jev landing experiment, flight/README.md; core.h, flare=). The default is today's crew: its formula begins the
// flare when the radio height, as the crew reads it, is below 33 ft, and its law steers the sink rate down against
// that height.
struct FlareOptions {
  bool external = false;  // flare=external: the formula never begins it; a command does (World::command)
  bool timeLaw = false;   // flare_law=time: today's law flown from the trigger on, not on a radio height (World)
  double floorFt = 0;     // floor=FT: whatever the trigger, the flare begins by this true height (0: never)
  std::string driver;     // driver=NAME: who sends the command, for a recording's crew line
};

// Where the world begins: the airframe's start, the runway it is judged against, the levers the crew
// finds set, and what will fail. The default is P7's slice 1: on the gear at the start, a runway drawn
// 150 m behind it.
struct WorldStart {
  AirframeStart airframe;
  Runway runway;           // empty name: the default runway, made from where the airframe starts
  int flapLever = 0;
  bool gearDown = true;
  Failures failures;
  // Each radio altimeter's error, feet: it reads the true height plus this (0: true). Off unless asked for, as
  // a failure is: the instructor's lie, for a crew or a judge to catch.
  double raBiasFt[2] = {0, 0};
  // In the air, a test pilot's manoeuvre (core.h, "air"): hold, bank, pull, push, alpha or speed. Empty:
  // the scripted circuit, or the ILS from an approach start.
  std::string manoeuvre;
  FlareOptions flare;
};

class World {
 public:
  World() : World(WorldStart{}) {}
  explicit World(const WorldStart& start);

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

  // The crew is this world's own script unless scripted is false; then crew is whatever the caller
  // set before the step — a recording, or a person at the controls (core.h).
  bool scripted = true;
  Crew crew;
  Surfaces surfaces;

  // --- for the runner's checks and trace -------------------------------------------------------
  double time() const { return t_; }
  Phase phase() const { return phase_; }
  // The test pilot's manoeuvre and the stage of it now: settle, slow (alpha only), input, release,
  // recover; empty when there is none.
  const std::string& manoeuvre() const { return manoeuvre_; }
  const char* testStage() const;
  int circuit() const { return circuit_; }
  double altitudeFt() const { return air().pressureAltitudeFt; }
  double radioHeightFt() const { return air().radioHeightFt; }  // the truth
  // A radio altimeter as it reads (k = 0, 1): the true height plus its bias, NaN once it has failed. And the
  // height the crew flies by: RA 1, or RA 2 when RA 1 has failed, NaN when both have.
  double raFt(int k) const;
  double crewRadioHeightFt() const;

  // A command from outside the harness (core.h, flight_command). "flare" begins the scripted crew's flare at its
  // next step, where its flare is external (FlareOptions) and the approach is flown down to it; true if taken.
  bool command(const std::string& name);
  // What began the flare: nothing yet, the crew's formula, a command, or the floor.
  enum FlareBy { kFlareByNone = 0, kFlareByFormula = 1, kFlareByCommand = 2, kFlareByFloor = 3 };
  int flareBy() const { return flareBy_; }
  const FlareOptions& flareOptions() const { return flare_; }
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
  const AirframeState& airframeState() const { return air(); }
  const Runway& runway() const { return runway_; }
  // An approach start (WorldStart.airframe.airborne): the scripted crew flies the ILS to a landing.
  bool ilsApproach() const { return ilsCrew_; }
  // The final approach speed the scripted crew flies, CAS.
  static double approachSpeedKn();
  IlsReading ils() const { return readIls(runway_, air().latitudeDeg, air().longitudeDeg, air().radioHeightFt); }

  // When the airframe went below the runway, or -1. JSBSim's 737 touches the ground only with its
  // gear; anything lower has flown into it. The world freezes there: what JSBSim makes of an
  // aeroplane under the ground is not something to feed the computers.
  double crashedAt() const { return crashedAt_; }

  // The scripted crew may be overridden for a property test: a fixed stick input in a time window.
  struct Override {
    double from = -1, to = -1;
    double pitch = 0, roll = 0;
  } stickOverride;

  // What fails, and when (Failures); whether a unit has failed by now.
  Failures failures;
  bool failed(double at) const { return at >= 0 && t_ >= at; }

  // A property test's hand on the RUD TRIM switch, in seconds after the start of cruise: the switch
  // held from `from` to `to` (+1 left, -1 right), the stick neutral from `from` to `handsOffTo` so that
  // the crew's heading hold does not fight the trim, then the RESET pushbutton pressed for a second.
  // Off when direction is 0.
  struct TrimTest {
    double from = 0, to = 0, handsOffTo = 0;
    int direction = 0;
  } trimTest;

 private:
  static constexpr double kDownlocked = 0.999;
  static constexpr double kCrashFt = 3;  // radio height below which the airframe is in the ground

  double crashedAt_ = -1;
  double raBiasFt_[2] = {0, 0};  // WorldStart::raBiasFt

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
  // The ILS crew: the beams on the approach, the centreline over the runway and on it.
  void flyIls(double dt);
  void rollToCentreline(double bankLimit);
  // The test pilot (flyTest): its manoeuvre, and the level flight it starts from and comes back to.
  void flyTest(double dt);
  std::string manoeuvre_;
  double testAltFt_ = 0, testCasKn_ = 0, testHeadingDeg_ = 0;

  std::unique_ptr<Airframe> airframe_;
  Runway runway_;
  bool ilsCrew_ = false;

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
  // the flare (FlareOptions): how it is begun and flown; what began it; under flare_law=time the height it flies
  // on, the trigger's height carried down by the vertical speed; a command waiting for the next step
  bool beginFlare(double radio);
  FlareOptions flare_;
  int flareBy_ = kFlareByNone;
  double flareHeightFt_ = 0;
  bool flareCommanded_ = false;
  double gammaCmd_ = 0, gammaSpeed_ = 0;  // deg: the flight path being flown, and the one the speed asks for

  // flaps and slats: the pick-off angles the SFCCs report, and the flap surface they move
  bool conf1F_ = false;
  double slatFppu_ = 0, flapFppu_ = 0, flapDeg_ = 0;

  // In direct law the crew's hand holds the load factor its stick would have asked of normal law, and
  // turns the trim wheel against what it holds (directLawHands).
  void directLawHands(double dt);
  bool pitchDirect_ = false;  // the PFD's USE MAN PITCH TRIM: the FCDC reports pitch direct law
  double handHeld_ = 0;       // the stick the hand has been holding, over a few seconds
  bool trimming_ = false;
  int elevatorsWorking_ = 2;  // elevators with an active, pressurised servo
};
