// The airframe: JSBSim flying an aircraft definition, with the A32NX servos positioning its surfaces.
// GPLv3; JSBSim is LGPL-2.1, linked and never copied.
//
// Everything that crosses this boundary is in the A32NX computers' frame and in the units the
// aircraft's own instruments use — degrees, knots, feet, g — so world.cpp never sees JSBSim and
// JSBSim never sees the computers. airframe.cpp is the one place the two frames meet.
//
// Two aircraft definitions can fly (select() below):
// - "737": JSBSim's 737, read unmodified from the pinned clone (docs/provenance.md says why not its
//   A320): an A320-class airframe, not an A320. It has one pitch control with the trim folded in, no
//   slats and no roll spoilers, so the stabiliser acts through its elevator and the rest is dropped.
// - "a320": an A320 of ours, flight/jsbsim/aircraft/A320-fit, fitted to flight/targets/a320.csv. It
//   takes the stabiliser, the slats and each wing's spoilers as they are, and its engines and thrust
//   lever schedule are its own.
// Each one's own flight controls still run, and a system of ours (flight/jsbsim/a32nx-surfaces.xml)
// overrides their outputs in the same pass, so the aerodynamics see the servos' positions and nothing
// else.

#pragma once

#include <memory>
#include <string>
#include <utility>
#include <vector>

// What the world hands the airframe for one tick.
struct AirframeControls {
  // Surfaces, computers' frame, degrees.
  double elevator = 0;          // + trailing edge down; the mean of left and right
  double ths = 0;               // + nose down
  double aileron[2] = {0, 0};   // left, right; + trailing edge down
  double spoiler[2][5] = {};    // left, right, spoilers 1..5; extended is negative
  double rudder = 0;            // + trailing edge left: the computers' yaw damper and pedal sense
  double slat = 0;              // slat surface angle
  double flap = 0;              // flap surface angle
  // The rest of the aeroplane.
  double tla[2] = {0, 0};       // thrust lever angle, deg: -20 MAX REV, -6 REV IDLE, 0 idle, 25 CL, 35 MCT, 45 TOGA
  double brake[2] = {0, 0};     // left, right; 0..1 of full braking
  double noseWheel = 0;         // nose wheel steering angle, deg, + right
  bool gearDown = true;         // the gear lever
};

// What the airframe is doing after the tick. Truth, not sensor output: the world encodes sensors.
struct AirframeState {
  // air data, ISA, standard setting
  double pressureAltitudeFt = 0;
  double casKn = 0, tasKn = 0, mach = 0;
  double verticalSpeedFpm = 0;
  double alphaDeg = 0, betaDeg = 0;
  double staticPressureHpa = 1013.25;
  // attitude and motion
  double pitchDeg = 0, rollDeg = 0, headingDeg = 360;   // true heading, (0, 360]
  double pDegS = 0, qDegS = 0, rDegS = 0;               // body rates
  double rollRateDegS = 0, pitchRateDegS = 0, headingRateDegS = 0;  // Euler angle rates
  double nx = 0, ny = 0, nz = 1;                        // specific force, g: what accelerometers feel
  double groundSpeedKn = 0, trackDeg = 360, flightPathDeg = 0;
  double latitudeDeg = 0, longitudeDeg = 0;
  double radioHeightFt = 0;                             // reads zero standing on the runway
  // gear, engines, mass
  bool noseWow = true, leftWow = true, rightWow = true;
  double wheelSpeedKn = 0;                              // main wheels
  double gearPosition = 1;                              // 0 up and locked .. 1 down and locked
  double n1[2] = {0, 0};
  double weightLbs = 0, cgPercentMac = 0;
  // the pilot's eye, the definition's EYEPOINT (the left seat), from the CG in body axes: forward, right, up
  double eyeFwdM = 0, eyeRightM = 0, eyeUpM = 0;
  // the CG's height above the ground standing on the gear, where the radio height reads zero
  double cgHeightM = 0;
  // where the aircraft file has them (airframe.cpp): 0 approach idle .. 1 ground idle; and each
  // reverser, 0 stowed .. 1 deployed. Zero on an airframe without them.
  double groundIdle = 0, reverser[2] = {0, 0};
};

// The bare airframe measured, for scoring it against targets (score.cpp).
struct Configuration {
  double slatDeg = 0, flapDeg = 0;  // surface angles
  bool gearDown = false;
};

struct LiftPeak {
  double clMax = 0, alphaDeg = 0;
};

struct TrimPoint {
  bool ok = false;  // JSBSim's trim converged
  double alphaDeg = 0, pitchDeg = 0;
  double pitchControlDeg = 0;  // the pitch control the trim needed, in elevator degrees (elevator + 1.8 THS)
  double thsDeg = 0;           // the stabiliser, with the elevator at rest as autotrim leaves it
  double tla = 0;              // thrust lever angle for the thrust the trim needed
  double thrustLbs = 0;        // that thrust, all engines together
};

// The airframe's own lift and drag coefficients at a state, from its aerodynamics alone: no trim, pitch
// controls at neutral, so what the tail lifts at neutral is in them and what a trim would add is not.
struct AeroPoint {
  double cl = 0, cd = 0;
};

// The free response after a pulse of pitch control, everything else held where the trim left it.
struct PitchResponse {
  bool ok = false;                  // the trim before the pulse converged
  std::vector<double> t, alphaDeg;  // from the end of the pulse: seconds, alpha less its trimmed value
  double trimAlphaDeg = 0, mach = 0, qbarPsf = 0;  // the trim it started from
  // the whole of it, from the start of the pulse, every 20 ms: seconds, alpha less its trimmed value,
  // body pitch rate, and the elevator moved from where the trim left it
  std::vector<double> fromStart, alphaFromStartDeg, qDegS, elevatorDeg;
};

// Where the airframe begins. By default, as since P7's slice 1: on the gear at 47 N 8 E (a latitude
// JSBSim takes as geocentric), sea level, heading 360, no wind. A start on a real runway gives a geodetic
// position, the field's elevation and a heading; an airborne start then flies from a height above that
// field, trimmed by JSBSim at a speed and flight path in a configuration, the wind already blowing.
struct AirframeStart {
  double latDeg = 47.0, lonDeg = 8.0;
  bool geodetic = false;
  double fieldElevationFt = 0, headingDeg = 0;
  bool airborne = false;
  double heightFt = 0, casKn = 0, gammaDeg = 0;
  Configuration config;
  double windFromDeg = 0, windKn = 0;  // steady, from a true direction
  double turbulence = 0;               // MIL-F-8785C (Tustin) severity: 0 none, 3 moderate
};

class Airframe {
 public:
  // Which aircraft definition every Airframe built from now on loads: "737" or "a320". Unless this is
  // called, FLIGHT_AIRFRAME in the environment says, and unless that does, the default. An unknown
  // name ends the process.
  static void select(const std::string& key);
  static const std::string& selected();
  // What reports call the selected aircraft, after "JSBSim <commit>'s".
  static const char* model();
  // Whether the speeds the FAC computes (VLS, VS1g: an A320's, from its weight and CG) are the selected
  // aircraft's own. On the 737 they are an A320's, and nothing should fly by them.
  static bool facSpeedsAreItsOwn();
  // Coefficients loaded over the aircraft definition's own, by property name, for the fitter: every
  // Airframe built from now on gets them. A name the aircraft does not declare ends the process.
  static void setCoefficients(const std::vector<std::pair<std::string, double>>& coefficients);

  // Loads the aircraft, puts it on a sea-level runway at 47 N 8 E heading 360 with engines at idle
  // and brakes on, and lets it settle on its gear. A load failure is reported and ends the process.
  Airframe() : Airframe(AirframeStart{}) {}
  explicit Airframe(const AirframeStart& start);
  ~Airframe();

  // An airborne start's trim: the stabiliser and thrust lever angle it begins at, and whether JSBSim
  // found one. A start on the gear has none.
  const TrimPoint& startTrim() const;

  // One tick: JSBSim runs at 200 Hz, four frames per 20 ms.
  void step(double dt, const AirframeControls& controls);

  const AirframeState& state() const;

  double wingAreaFt2() const;
  // A property of the loaded aircraft, by name, for the fitter's record; NaN if it has none.
  double property(const std::string& name) const;

  // Measurements. Each one re-initialises JSBSim: use them on an airframe that is not flying.
  // The weight they are made at: the total brought to this by changing the empty weight, which keeps
  // its centre of gravity, so the loaded CG moves a little toward it. The inertia is not changed.
  void setWeightLbs(double lbs);
  // The lift coefficient against alpha at 1,000 ft and 150 kt, elevator at neutral, swept from 0 to
  // 25 deg in quarter degrees: where it peaks.
  LiftPeak liftPeak(const Configuration& c);
  // Lift and drag coefficients, wings level, no sideslip, at an altitude, Mach and alpha.
  AeroPoint aero(double altitudeFt, double mach, double alphaDeg, const Configuration& c);
  // The lift coefficient at an alpha, where liftPeak() sweeps: 1,000 ft, 150 kt, elevator at neutral.
  double liftAt(const Configuration& c, double alphaDeg);
  // The aerodynamic pitching moment coefficient about the centre of gravity at an alpha, at 1,000 ft in
  // steady level flight at 1 g, with the elevator and the stabiliser where asked (degrees, + trailing edge
  // down, + nose down) and no pitch rate: the static moment a pilot holding that elevator meets.
  double pitchMomentAt(const Configuration& c, double alphaDeg, double elevatorDeg, double thsDeg);
  // JSBSim's longitudinal trim, wings level, on a flight path, at a CAS or, when mach > 0, a Mach. The
  // trim works the stabiliser where the aircraft has one, and the 737's elevator otherwise.
  TrimPoint trim(double altitudeFt, double casKn, double mach, double gammaDeg, const Configuration& c);
  // Trimmed in level flight, clean unless a configuration is given, then the elevator moved by pulseDeg
  // for pulseS seconds and returned, the stabiliser and the thrust left where the trim put them: the
  // airframe's own pitch response, as direct law would show it. Alpha is sampled every 20 ms for recordS
  // seconds after the pulse.
  PitchResponse pitchPulse(double altitudeFt, double casKn, double pulseDeg, double pulseS, double recordS,
                           const Configuration& c = Configuration{});
  // The thrust of one engine, lbf, with the levers at a thrust lever angle, at an altitude and a CAS or,
  // when mach > 0, a Mach; a CAS of 0 is static. The engine model run to its steady state, as JSBSim's
  // trim runs it, through the thrust lever schedule the aircraft flies with.
  double engineThrustLbs(double altitudeFt, double casKn, double mach, double tla);

  Airframe(const Airframe&) = delete;
  Airframe& operator=(const Airframe&) = delete;

 private:
  // trim(), its alpha held under a limit given rather than found by a lift sweep
  TrimPoint trimmed(double altitudeFt, double casKn, double mach, double gammaDeg, const Configuration& c,
                    double alphaLimitDeg);
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
