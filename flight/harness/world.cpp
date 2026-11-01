// The world. See world.h for what it is and is not. GPLv3.

#include "world.h"

#include <algorithm>
#include <cmath>
#include <initializer_list>
#include <utility>

#include "Arinc429Utils.h"

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kDeg = kPi / 180.0;
constexpr double kFtsPerKt = 1.687810;  // ft/s per knot

constexpr unsigned kNo = 3, kNcd = 1;  // SSM: NormalOperation, NoComputedData

base_arinc_429 word(double value, unsigned ssm = kNo) {
  base_arinc_429 w;
  w.SSM = ssm;
  w.Data = static_cast<float>(value);
  return w;
}

base_arinc_429 discrete(std::initializer_list<std::pair<int, bool>> bits) {
  base_arinc_429 w = word(0);
  for (const auto& b : bits) Arinc429Utils::setBit(w, b.first, b.second);
  return w;
}

double clamp(double x, double lo, double hi) {
  return std::max(lo, std::min(hi, x));
}

// Move toward a target at a bounded rate.
double follow(double x, double target, double ratePerS, double dt) {
  return x + clamp(target - x, -ratePerS * dt, ratePerS * dt);
}

double wrap180(double deg) {
  deg = std::fmod(deg + 180.0, 360.0);
  if (deg < 0) deg += 360.0;
  return deg - 180.0;
}

// The SFCCs' slat and flap pick-off angles at each lever position, CONF 1+F's flap angle, and the
// surface angle each pick-off angle means (a320_systems hydraulic/mod.rs).
const double kSlatFppu[5] = {0, 222.27, 272.27, 272.27, 334.16};
const double kFlapFppu[5] = {0, 0, 145.51, 168.35, 251.97};
constexpr double kFlap1FFppu = 120.22;
const double kFlapFppuBreak[12] = {0, 35.66, 69.32, 89.7, 105.29, 120.22, 145.51, 168.35, 189.87, 210.69, 231.25, 251.97};
const double kFlapSurfaceDeg[12] = {0, 0, 2.5, 5, 7.5, 10, 15, 20, 25, 30, 35, 40};
const double kSlatFppuBreak[6] = {0, 66.83, 167.08, 222.27, 272.27, 334.16};
const double kSlatSurfaceDeg[6] = {0, 5.4, 13.5, 18, 22, 27};

template <int N>
double surfaceDeg(double fppu, const double (&breaks)[N], const double (&degrees)[N]) {
  if (fppu <= breaks[0]) return degrees[0];
  for (int k = 1; k < N; ++k) {
    if (fppu <= breaks[k]) {
      const double f = (fppu - breaks[k - 1]) / (breaks[k] - breaks[k - 1]);
      return degrees[k - 1] + f * (degrees[k] - degrees[k - 1]);
    }
  }
  return degrees[N - 1];
}

double flapSurfaceDeg(double fppu) {
  return surfaceDeg(fppu, kFlapFppuBreak, kFlapSurfaceDeg);
}

double slatSurfaceDeg(double fppu) {
  return surfaceDeg(fppu, kSlatFppuBreak, kSlatSurfaceDeg);
}

constexpr double kRudderPedalDeg = 25;    // full pedal (a320_systems: rudder travel 50 deg, end to end)
constexpr double kPedalSteeringDeg = 6;   // nose wheel at full pedal; the tiller is not modelled

// The crew's numbers for either airframe: JSBSim's 737 at about 107,000 lb and our A320 at 65 t.
// Calibrated airspeeds, knots. The 737 stalls near 150 kt clean and 113 kt at full flap; it has no
// slats, so CONF 1 is clean to it. The A320 stalls at 157 kt clean and 106 kt at full flap, and its
// VLS in CONF FULL is 129 kt. The approach speed is 1.23 VS for the 737 and VLS + 11 for the A320,
// and every speed stays under the A320's flap limits.
constexpr double kVr = 140;              // rotate
constexpr double kV2 = 165;              // initial climb in CONF 1+F, to the acceleration altitude
constexpr double kVFlapsUp = 200;        // accelerate to this in 1+F (limit 215), then retract
constexpr double kVSlatsIn = 225;        // until the slats are in (CONF 1 limit 230)
constexpr double kVClean = 250;          // clean, below 10,000 ft
constexpr double kVApp = 140;            // final approach, CONF FULL (limit 177)
constexpr double kTaxiKn = 15;           // groundspeed
constexpr double kRotateDegS = 3;        // pitch rate of the rotation
constexpr double kRotateToDeg = 12.5;    // pitch the rotation aims at; the wheels leave before it
constexpr double kAccelerationFt = 1500; // take-off thrust to here, then climb thrust and accelerate
constexpr double kCruiseFt = 8000, kPatternFt = 2000;
// The flare: from 33 ft the sink rate is taken down exponentially, 3 s to e, toward 2 ft/s, and the
// sidestick pulls 0.10 per ft/s of sink above that. 33 ft is where 3 s meets the glide's 12 ft/s. The
// pilot eases off as the pull is felt, 0.08 per deg/s of pitch rate and 1.0 per g above one. Without
// that lead, an airframe whose lift rises faster with alpha than the 737's (our A320 in CONF FULL, 6.3
// per rad against 4.35) gets more lift from the same rotation than it needs, and floats off.
constexpr double kFlareFt = 33, kFlareTauS = 3, kFlareGain = 0.10, kFlarePitchRate = 0.08, kFlareLoad = 1.0;
// Approach, configured in stages as the speed comes back: the speed flown in each stage, and the
// speed below which the next configuration goes in (CONF 1, 2, 3 with the gear, FULL).
const double kVStage[5] = {210, 200, 180, 165, kVApp};
const double kVNextStage[4] = {215, 203, 183, 168};

// The sidestick of a pilot flying a flight path angle and a heading through the laws.
double pitchFor(double gammaTarget, double gamma, double q) {
  return clamp(0.08 * (gammaTarget - gamma) - 0.02 * q, -0.6, 0.6);
}

// Bank held closed loop, damped on roll rate: in normal law the stick asks for roll rate, in direct
// law for aileron, and this flies both.
double bankFor(double phiTarget, double phi, double p) {
  return clamp(0.05 * (phiTarget - phi) - 0.02 * p, -0.5, 0.5);
}

double rollFor(double headingTarget, double heading, double phi, double p, double bankLimit = 25) {
  return bankFor(clamp(2.0 * wrap180(headingTarget - heading), -bankLimit, bankLimit), phi, p);
}

}  // namespace

const char* phaseName(Phase p) {
  switch (p) {
    case Phase::Parked: return "parked";
    case Phase::PowerUp: return "power-up";
    case Phase::GroundCheck: return "ground-check";
    case Phase::Taxi: return "taxi";
    case Phase::TakeoffRoll: return "takeoff";
    case Phase::Climb: return "climb";
    case Phase::Cruise: return "cruise";
    case Phase::Approach: return "approach";
    case Phase::Flare: return "flare";
    case Phase::Rollout: return "rollout";
  }
  return "?";
}

World::World() : airframe_(std::make_unique<Airframe>()) {
  lastCas_ = air().casKn;
  sense();
}

void World::step(double dt, const Orders& orders) {
  t_ += dt;
  fly(dt);
  actuate(dt, orders);
  if (crashedAt_ < 0) {
    airframe(dt);
    if (air().radioHeightFt < -kCrashFt) crashedAt_ = t_;
  }
  sense();
}

// A pilot's hand on the thrust levers: forward for a speed deficit, back for an acceleration.
void World::thrustFor(double casTarget, double tlaMax, double dt) {
  const double rate = clamp(1.0 * (casTarget - air().casKn) - 4.0 * casRate_, -8, 8);  // deg/s
  tla_ = clamp(tla_ + rate * dt, 0, tlaMax);
}

// The sidestick for a flight path, the path itself moved no faster than 1.5 deg/s.
void World::stickFor(double gammaTarget, double dt) {
  gammaCmd_ = follow(gammaCmd_, gammaTarget, 1.5, dt);
  crew.pitch = pitchFor(gammaCmd_, air().flightPathDeg, air().qDegS);
}

// More than 400 ft from the level: an open climb at climb (or take-off) thrust, or an open descent
// at idle, with the elevator on the speed — too fast or accelerating asks for more climb. Within
// 400 ft: the elevator brings the altitude in and the thrust keeps the speed.
void World::climbOrDescend(double altitudeTarget, double casTarget, double climbTla, double dt) {
  const AirframeState& a = air();
  const double dh = altitudeTarget - a.pressureAltitudeFt;
  if (std::abs(dh) > 400) {
    tla_ = follow(tla_, dh > 0 ? climbTla : 0, 8, dt);
    gammaSpeed_ = clamp(gammaSpeed_ + (0.07 * (a.casKn - casTarget) + 0.8 * casRate_) * dt, dh > 0 ? 0 : -6,
                        dh > 0 ? 10 : 0);
    stickFor(gammaSpeed_, dt);
  } else {
    thrustFor(casTarget, climbTla, dt);
    gammaSpeed_ = gammaCmd_;
    stickFor(clamp(0.01 * dh, -4, 4), dt);
  }
}

// A fixed flight path, the thrust on the speed: the glide path.
void World::holdPath(double gammaTarget, double casTarget, double dt) {
  thrustFor(casTarget, 25, dt);
  gammaSpeed_ = gammaCmd_;
  stickFor(gammaTarget, dt);
}

// On the runway the feet keep the heading: rudder at speed, nose wheel slow. Pedals are + left.
void World::steerOnGround(double headingTarget) {
  crew.pedals = clamp(0.15 * wrap180(air().headingDeg - headingTarget) + 0.3 * air().headingRateDegS, -1, 1);
}

// The scripted crew: a circuit, flown through the laws, repeated until the run ends.
void World::fly(double dt) {
  const AirframeState& a = air();
  casRate_ += ((a.casKn - lastCas_) / dt - casRate_) * std::min(1.0, dt / 1.0);  // read over about a second
  lastCas_ = a.casKn;

  const double inPhase = t_ - phaseStart_;
  auto enter = [this](Phase p) {
    phase_ = p;
    phaseStart_ = t_;
    stage_ = 0;
  };
  Crew& c = crew;
  c.pitch = c.roll = c.pedals = 0;
  const double h = a.pressureAltitudeFt, gamma = a.flightPathDeg, q = a.qDegS;
  const double phi = a.rollDeg, p = a.pDegS, psi = a.headingDeg;

  switch (phase_) {
    case Phase::Parked:
      c.brakes = 1;
      if (t_ >= 1.0) enter(Phase::PowerUp);
      break;

    case Phase::PowerUp:  // the FLT CTL pushbuttons, then the self-tests run
      for (bool& on : c.elacOn) on = true;
      for (bool& on : c.secOn) on = true;
      for (bool& on : c.facOn) on = true;
      if (inPhase >= 20) enter(Phase::GroundCheck);
      break;

    case Phase::GroundCheck: {  // full and free: pitch, roll, pedals, three seconds each
      const int leg = static_cast<int>(inPhase / 3.0);
      const double sticks[6][3] = {{1, 0, 0}, {-1, 0, 0}, {0, -1, 0}, {0, 1, 0}, {0, 0, -1}, {0, 0, 1}};
      if (leg < 6) {
        c.pitch = sticks[leg][0];
        c.roll = sticks[leg][1];
        c.pedals = sticks[leg][2];
      }
      if (inPhase >= 25) enter(Phase::Taxi);
      break;
    }

    case Phase::Taxi:  // walking pace for ten seconds, then stop and hold, configured for takeoff
      c.spoilersArmed = true;
      c.flapLever = 1;
      c.gearDown = true;
      if (inPhase < 10) {
        c.brakes = 0;
        tla_ = clamp(2.0 * (kTaxiKn - a.groundSpeedKn), 0, 15);
      } else {
        tla_ = 0;
        c.brakes = 0.5;
      }
      steerOnGround(360);
      if (inPhase >= 25) enter(Phase::TakeoffRoll);
      break;

    case Phase::TakeoffRoll:
      c.brakes = 0;
      tla_ = 45;
      steerOnGround(360);
      if (a.casKn >= kVr) {  // rotate at a steady rate toward the climb attitude
        if (rotateAt_ < 0) rotateAt_ = t_;
        const double pitchTarget = std::min(kRotateToDeg, kRotateDegS * (t_ - rotateAt_));
        c.pitch = clamp(0.12 * (pitchTarget - a.pitchDeg) + 0.1 * (kRotateDegS - q), -0.2, 0.9);
      }
      if (!onGround() && a.radioHeightFt > 5) {
        c.spoilersArmed = false;
        rotateAt_ = -1;
        gammaCmd_ = gammaSpeed_ = gamma;
        enter(Phase::Climb);
      }
      break;

    case Phase::Climb: {  // gear up, take-off thrust to 1500 ft, then accelerate and clean up
      if (a.radioHeightFt > 100) c.gearDown = false;
      if (c.flapLever == 1 && h > kAccelerationFt && a.casKn > kVFlapsUp - 5) c.flapLever = 0;
      double v = h > kAccelerationFt ? kVFlapsUp : kV2;
      if (c.flapLever == 0) v = slatFppu_ < 1 && flapFppu_ < 1 ? kVClean : kVSlatsIn;
      headingTarget_ = h > 3000 && h < 6000 ? 90 : 360;
      climbOrDescend(kCruiseFt, v, h > kAccelerationFt ? 25 : 45, dt);
      c.roll = rollFor(headingTarget_, psi, phi, p);
      if (std::abs(kCruiseFt - h) < 50) enter(Phase::Cruise);
      break;
    }

    case Phase::Cruise: {  // hold 8000 ft and work the laws: doublet, turns, speedbrake, pedals
      climbOrDescend(kCruiseFt, kVClean, 25, dt);
      c.roll = rollFor(headingTarget_, psi, phi, p);
      if (inPhase >= 20 && inPhase < 22) c.pitch = 0.5;
      if (inPhase >= 22 && inPhase < 24) c.pitch = -0.5;
      if (inPhase >= 40 && inPhase < 80) headingTarget_ = 180;  // a 180-degree turn at 25 degrees of bank
      if (inPhase >= 80 && inPhase < 120) headingTarget_ = 360;
      c.speedbrake = inPhase >= 120 && inPhase < 140 ? 1.0 : 0.0;
      if (inPhase >= 150 && inPhase < 153) c.pedals = 0.3;
      // A steep turn at 45 degrees. Past 33 degrees normal law rolls back toward 33 unless the stick
      // holds the bank, so the crew holds it firmly.
      if (inPhase >= 160 && inPhase < 175) c.roll = clamp(0.12 * (-45 - phi) - 0.03 * p, -0.5, 0.5);
      if (inPhase >= 175 && inPhase < 200) c.roll = rollFor(headingTarget_, psi, phi, p, 45);
      if (inPhase >= 210) enter(Phase::Approach);
      break;
    }

    case Phase::Approach: {  // down to 2000 ft, configure as the speed comes back, then three degrees
      if (stage_ < 4 && a.casKn < kVNextStage[stage_] && (stage_ > 0 || h < kPatternFt + 150)) {
        c.flapLever = ++stage_;
        if (stage_ == 3) c.gearDown = true;
        if (stage_ == 4) c.spoilersArmed = true;
      }
      // established at the approach speed in CONF FULL: start down
      if (stage_ == 4 && a.casKn < kVApp + 4 && flapFppu_ > kFlapFppu[4] - 1) stage_ = 5;
      if (stage_ < 5) {
        climbOrDescend(kPatternFt, kVStage[stage_], 25, dt);
      } else {
        holdPath(-3.0, kVApp, dt);
      }
      c.roll = rollFor(360, psi, phi, p);
      if (stage_ == 5 && a.radioHeightFt < kFlareFt) enter(Phase::Flare);
      break;
    }

    case Phase::Flare: {  // sink rate down exponentially, to two feet a second at the wheels
      const double height = std::max(0.0, a.radioHeightFt);
      const double sinkTarget = height / kFlareTauS + 2.0;  // ft/s
      const double sink = -a.verticalSpeedFpm / 60;
      c.pitch = clamp(kFlareGain * (sink - sinkTarget) - kFlarePitchRate * q - kFlareLoad * (a.nz - 1), -0.3, 0.8);
      gammaCmd_ = gammaSpeed_ = gamma;
      if (height < 20) {
        tla_ = 0;  // retard
      } else {
        thrustFor(kVApp, 25, dt);
      }
      c.roll = rollFor(360, psi, phi, p);
      if (onGround()) enter(Phase::Rollout);
      break;
    }

    case Phase::Rollout:
      tla_ = 0;
      c.brakes = a.noseWow ? 0.3 : 0;
      steerOnGround(360);
      if (a.groundSpeedKn < 30) {
        c.spoilersArmed = false;
        c.flapLever = 0;
      }
      if (a.groundSpeedKn < 1 && inPhase > 20) {
        ++circuit_;
        c.brakes = 1;
        enter(Phase::Taxi);
      }
      break;
  }

  c.tla[0] = c.tla[1] = tla_;

  if (t_ >= stickOverride.from && t_ < stickOverride.to) {
    c.pitch = stickOverride.pitch;
    c.roll = stickOverride.roll;
  }

  c.rudderTrimLeft = c.rudderTrimRight = c.rudderTrimReset = false;
  if (trimTest.direction != 0 && phase_ == Phase::Cruise) {
    const double s = t_ - phaseStart_;
    if (s >= trimTest.from && s < trimTest.to) {
      c.rudderTrimLeft = trimTest.direction > 0;
      c.rudderTrimRight = trimTest.direction < 0;
    }
    if (s >= trimTest.from && s < trimTest.handsOffTo) c.pitch = c.roll = 0;
    c.rudderTrimReset = s >= trimTest.handsOffTo && s < trimTest.handsOffTo + 1;
  }
}

// Servos follow the computers. A surface follows its active servo; with two active it follows their
// mean; with none it is in damping mode and the air slowly centres it.
void World::actuate(double dt, const Orders& o) {
  auto servo = [dt](double pos, const bool active[2], const double cmd[2], double rate) {
    if (active[0] && active[1]) return follow(pos, (cmd[0] + cmd[1]) / 2, rate, dt);
    if (active[0]) return follow(pos, cmd[0], rate, dt);
    if (active[1]) return follow(pos, cmd[1], rate, dt);
    return follow(pos, 0.0, 5.0, dt);
  };
  for (int side = 0; side < 2; ++side) {
    surfaces.aileron[side] = servo(surfaces.aileron[side], o.aileronActive[side], o.aileron[side], 50);
    surfaces.elevator[side] = servo(surfaces.elevator[side], o.elevatorActive[side], o.elevator[side], 40);
    for (int k = 0; k < 5; ++k) surfaces.spoiler[side][k] = follow(surfaces.spoiler[side][k], o.spoiler[side][k], 40, dt);
  }

  int thsMotors = 0;
  double thsCmd = 0;
  for (int m = 0; m < 3; ++m) {
    if (o.thsActive[m]) {
      thsCmd += o.ths[m];
      ++thsMotors;
    }
  }
  if (thsMotors) surfaces.ths = follow(surfaces.ths, thsCmd / thsMotors, 1.0, dt);

  for (int f = 0; f < 2; ++f) {
    if (o.yawDamperActive[f]) surfaces.yawDamper = follow(surfaces.yawDamper, o.yawDamper[f], 25, dt);
    if (o.rudderTrimActive[f]) surfaces.rudderTrim = follow(surfaces.rudderTrim, o.rudderTrim[f], 1.5, dt);
    if (o.travelLimiterActive[f]) surfaces.travelLimiter = follow(surfaces.travelLimiter, o.travelLimiter[f], 3, dt);
  }

  // The rudder, as a320_systems' rudder mechanical assembly sums it: pedals, trim and yaw damper,
  // inside the travel limiter. Its frame is the hydraulics' (+ right), and all three arrive there
  // negated from the computers' frame: the pedals by the driver, the yaw damper order and the trim
  // order by the hydraulics on the way in (hydraulic/mod.rs: A320YawDamperController::angle_request,
  // "FBW negative is right"; A320RudderTrimTravelLimiterController::read, "Trim commands from FBW is
  // negative for right positive for left"). So in the computers' frame all three count the same way.
  const double rudder = clamp(crew.pedals * kRudderPedalDeg + surfaces.rudderTrim + surfaces.yawDamper,
                              -surfaces.travelLimiter, surfaces.travelLimiter);
  surfaces.rudder = follow(surfaces.rudder, rudder, 40, dt);

  // hydraulics stay pressurised: the engines run from the first instant
  for (int k = 0; k < 3; ++k) {
    hydPressurised[k] = true;
    hydPsi[k] = 3000;
  }

  // Slats and flaps. Lever 1 is CONF 1+F below 100 kt and holds it to 210 kt; otherwise CONF 1.
  const int lever = std::max(0, std::min(4, crew.flapLever));
  if (lever == 1) {
    if (air().casKn < 100) conf1F_ = true;
    if (air().casKn > 210) conf1F_ = false;
  } else {
    conf1F_ = false;
  }
  slatFppu_ = follow(slatFppu_, kSlatFppu[lever], 11, dt);
  flapFppu_ = follow(flapFppu_, lever == 1 && conf1F_ ? kFlap1FFppu : kFlapFppu[lever], 6, dt);
  flapDeg_ = flapSurfaceDeg(flapFppu_);
}

// The airframe takes the surfaces where the servos put them, and the rest from the crew.
void World::airframe(double dt) {
  AirframeControls c;
  c.elevator = (surfaces.elevator[0] + surfaces.elevator[1]) / 2;
  c.ths = surfaces.ths;
  for (int side = 0; side < 2; ++side) {
    c.aileron[side] = surfaces.aileron[side];
    for (int k = 0; k < 5; ++k) c.spoiler[side][k] = surfaces.spoiler[side][k];
    c.tla[side] = crew.tla[side];
    c.brake[side] = crew.brakes;
  }
  c.rudder = surfaces.rudder;
  c.slat = slatSurfaceDeg(slatFppu_);
  c.flap = flapDeg_;
  c.noseWheel = -crew.pedals * kPedalSteeringDeg;  // left pedal turns the nose wheel left
  c.gearDown = crew.gearDown;
  airframe_->step(dt, c);
}

// Sample the sensors and transmit them the way the A32NX producers do.
void World::sense() {
  // ISA, the field at sea level, no wind, no magnetic variation
  const AirframeState& a = air();
  const unsigned airSsm = a.casKn < 30 ? kNcd : kNo;

  const bool adrFailed = adrFailAt >= 0 && t_ >= adrFailAt;
  for (auto& d : adr) {
    if (adrFailed) {
      d = base_adr_bus{};  // all-zero is FailureWarning on every word
      continue;
    }
    d.altitude_standard_ft = word(a.pressureAltitudeFt);
    d.altitude_corrected_1_ft = word(a.pressureAltitudeFt);
    d.altitude_corrected_2_ft = word(a.pressureAltitudeFt);
    d.mach = word(a.mach, airSsm);
    d.airspeed_computed_kn = word(a.casKn, airSsm);
    d.airspeed_true_kn = word(a.tasKn, airSsm);
    d.vertical_speed_ft_min = word(a.verticalSpeedFpm);
    d.aoa_corrected_deg = word(a.alphaDeg, airSsm);
    d.corrected_average_static_pressure = word(a.staticPressureHpa);
  }

  for (auto& r : ir) {
    r.latitude_deg = word(a.latitudeDeg);
    r.longitude_deg = word(a.longitudeDeg);
    r.ground_speed_kn = word(a.groundSpeedKn);
    r.track_angle_true_deg = word(a.trackDeg);
    r.heading_true_deg = word(a.headingDeg);
    r.wind_speed_kn = word(0);
    r.wind_direction_true_deg = word(0);
    r.track_angle_magnetic_deg = word(a.trackDeg);
    r.heading_magnetic_deg = word(a.headingDeg);
    r.drift_angle_deg = word(a.groundSpeedKn > 0.5 ? wrap180(a.trackDeg - a.headingDeg) : 0);
    r.flight_path_angle_deg = word(a.flightPathDeg);
    r.pitch_angle_deg = word(a.pitchDeg);
    r.roll_angle_deg = word(a.rollDeg);
    r.body_pitch_rate_deg_s = word(a.qDegS);
    r.body_roll_rate_deg_s = word(a.pDegS);
    r.body_yaw_rate_deg_s = word(a.rDegS);
    r.body_long_accel_g = word(a.nx);
    r.body_lat_accel_g = word(a.ny);
    r.body_normal_accel_g = word(a.nz);
    r.track_angle_rate_deg_s = word(a.headingRateDegS);  // the driver feeds heading rate here (contract/12)
    r.pitch_att_rate_deg_s = word(a.pitchRateDegS);
    r.roll_att_rate_deg_s = word(a.rollRateDegS);
    r.inertial_vertical_speed_ft_s = word(a.verticalSpeedFpm);  // fed ft/min, as the producer does (contract/12)
  }

  // radio altimeter: valid below 2500 ft, out of range above it the way ala52b.rs reports it
  for (auto& r : ra) r.radio_height_ft = a.radioHeightFt < 2500 ? word(a.radioHeightFt) : word(8192, kNcd);

  const bool compressed = mainGearCompressed();
  const bool noseCompressed = noseGearCompressed();
  const bool down = noseGearDownlocked();
  for (auto& l : lgciu) {
    // landing_gear/mod.rs: gear and doors locked where the gear is, doors not modelled
    l.discrete_word_1 = discrete({{11, false}, {12, false}, {13, false}, {14, false}, {15, false}, {16, false},
                                  {17, false}, {18, false}, {19, false}, {23, down}, {24, down}, {25, down},
                                  {26, compressed}, {27, compressed}, {28, noseCompressed}, {29, down}});
    l.discrete_word_2 = discrete({{11, compressed}, {12, noseCompressed}, {13, compressed}, {14, compressed}, {15, down}});
    l.discrete_word_3 = discrete({{11, down}, {12, down}, {13, down}, {14, !down}});
    l.discrete_word_4 = discrete({{22, true}, {26, true}});
  }

  const int lever = std::max(0, std::min(4, crew.flapLever));
  for (auto& s : sfcc) {
    // sfcc/mod.rs: label 046 detent bits, and the actual-position bits from the FPPU angles
    s.slat_flap_component_status_word = base_arinc_429{};  // no producer on the aircraft either
    s.slat_flap_system_status_word = discrete({{17, lever == 0}, {18, lever == 1}, {19, lever == 2},
                                               {20, lever == 3}, {21, lever == 4}, {28, true}, {29, true}});
    const double sl = slatFppu_, fl = flapFppu_;
    s.slat_flap_actual_position_word =
        discrete({{11, true}, {12, sl > -5 && sl < 6.2}, {13, sl > 210.4 && sl < 337}, {14, sl > 321.8 && sl < 337},
                  {15, sl > 327.4 && sl < 337}, {18, true}, {19, fl > -5 && fl < 2.5}, {20, fl > 140.7 && fl < 254},
                  {21, fl > 163.7 && fl < 254}, {22, fl > 247.8 && fl < 254}, {23, fl > 250 && fl < 254}});
    s.slat_actual_position_deg = word(sl);
    s.flap_actual_position_deg = word(fl);
  }

  // FMGC: not part of P7. A stub that says it is alive, autopilot off, with the airframe's weight and CG.
  for (int k = 0; k < 2; ++k) {
    base_fmgc_b_bus& f = fmgc[k];
    f = base_fmgc_b_bus{};
    f.fac_weight_lbs = word(a.weightLbs);
    f.fm_weight_lbs = word(a.weightLbs);
    f.fac_cg_percent = word(a.cgPercentMac);
    f.fm_cg_percent = word(a.cgPercentMac);
    f.fg_radio_height_ft = ra[k].radio_height_ft;
    f.discrete_word_1 = word(0);
    f.discrete_word_2 = word(0);
    f.discrete_word_3 = word(0);
    f.discrete_word_4 = word(0);
    f.ats_discrete_word = word(0);
    f.approach_spd_target_kn = word(0, kNcd);
    f.delta_p_ail_cmd_deg = word(0, kNcd);
    f.delta_p_splr_cmd_deg = word(0, kNcd);
    f.delta_r_cmd_deg = word(0, kNcd);
    f.delta_nose_wheel_cmd_deg = word(0, kNcd);
    f.delta_q_cmd_deg = word(0, kNcd);
    f.n1_left_percent = word(a.n1[0]);
    f.n1_right_percent = word(a.n1[1]);
  }
}
