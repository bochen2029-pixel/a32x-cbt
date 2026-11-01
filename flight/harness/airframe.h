// The airframe: JSBSim flying an aircraft definition read from the pinned clone, with the A32NX
// servos positioning its surfaces. GPLv3; JSBSim is LGPL-2.1, linked and never copied.
//
// Everything that crosses this boundary is in the A32NX computers' frame and in the units the
// aircraft's own instruments use — degrees, knots, feet, g — so world.cpp never sees JSBSim and
// JSBSim never sees the computers. airframe.cpp is the one place the two frames meet.
//
// The aircraft definition is JSBSim's 737 (docs/provenance.md says why not its A320): an A320-class
// airframe, not an A320. Its own flight controls still run, and a system of ours
// (flight/jsbsim/a32nx-surfaces.xml) overrides their outputs in the same pass, so the aerodynamics
// see the servos' positions and nothing else.

#pragma once

#include <memory>
#include <vector>

// What the world hands the airframe for one tick.
struct AirframeControls {
  // Surfaces, computers' frame, degrees.
  double elevator = 0;          // + trailing edge down; the mean of left and right
  double ths = 0;               // + nose down
  double aileron[2] = {0, 0};   // left, right; + trailing edge down
  double spoiler[2][5] = {};    // left, right, spoilers 1..5; extended is negative
  double rudder = 0;            // + trailing edge left: the computers' yaw damper and pedal sense
  double flap = 0;              // flap surface angle
  // The rest of the aeroplane.
  double tla[2] = {0, 0};       // thrust lever angle, deg: 0 idle, 25 CL, 35 MCT, 45 TOGA
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
};

// The bare airframe measured, for scoring it against targets (score.cpp).
struct LiftPeak {
  double clMax = 0, alphaDeg = 0;
};

struct TrimPoint {
  bool ok = false;  // JSBSim's trim converged
  double alphaDeg = 0, pitchDeg = 0;
  double pitchControlDeg = 0;  // the pitch control the trim needed, in elevator degrees (elevator + 1.8 THS)
  double thsDeg = 0;           // the same as THS alone, the elevator at rest as autotrim leaves it
  double tla = 0;              // thrust lever angle for the thrust the trim needed
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
};

class Airframe {
 public:
  // Loads the aircraft, puts it on a sea-level runway at 47 N 8 E heading 360 with engines at idle
  // and brakes on, and lets it settle on its gear. A load failure is reported and ends the process.
  Airframe();
  ~Airframe();

  // One tick: JSBSim runs at 200 Hz, four frames per 20 ms.
  void step(double dt, const AirframeControls& controls);

  const AirframeState& state() const;

  static const char* model();
  double wingAreaFt2() const;

  // Measurements. Each one re-initialises JSBSim: use them on an airframe that is not flying.
  // The weight they are made at: the total brought to this by changing the empty weight, which keeps
  // its centre of gravity, so the loaded CG moves a little toward it. The inertia is not changed.
  void setWeightLbs(double lbs);
  // The lift coefficient against alpha at 1,000 ft and 150 kt, elevator at neutral, swept from 0 to
  // 25 deg in quarter degrees: where it peaks.
  LiftPeak liftPeak(double flapDeg, bool gearDown);
  // Lift and drag coefficients, wings level, no sideslip, at an altitude, Mach and alpha.
  AeroPoint aero(double altitudeFt, double mach, double alphaDeg, double flapDeg, bool gearDown);
  // JSBSim's longitudinal trim, wings level, on a flight path, at a CAS or, when mach > 0, a Mach.
  TrimPoint trim(double altitudeFt, double casKn, double mach, double gammaDeg, double flapDeg, bool gearDown);
  // Trimmed clean in level flight, then the elevator moved by pulseDeg for pulseS seconds and returned,
  // the stabiliser and the thrust left where the trim put them: the airframe's own pitch response, as
  // direct law would show it. Alpha is sampled every 20 ms for recordS seconds after the pulse.
  PitchResponse pitchPulse(double altitudeFt, double casKn, double pulseDeg, double pulseS, double recordS);

  Airframe(const Airframe&) = delete;
  Airframe& operator=(const Airframe&) = delete;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
