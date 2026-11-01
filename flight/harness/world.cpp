// The stub world. See world.h for what it is and is not. GPLv3.

#include "world.h"

#include <algorithm>
#include <cmath>
#include <initializer_list>
#include <utility>

#include "Arinc429Utils.h"

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kG = 9.80665;          // m/s2
constexpr double kMsPerKt = 0.514444;   // m/s per knot
constexpr double kFtsPerKt = 1.687810;  // ft/s per knot
constexpr double kDeg = kPi / 180.0;

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

double wrap360(double deg) {
  deg = std::fmod(deg, 360.0);
  return deg <= 0 ? deg + 360.0 : deg;
}

double wrap180(double deg) {
  deg = std::fmod(deg + 180.0, 360.0);
  if (deg < 0) deg += 360.0;
  return deg - 180.0;
}

// Airframe constants. A stub: plausible magnitudes, not A320 data.
constexpr double kVref = 250;        // kt at which clean alpha 2.5 holds 1 g
constexpr double kAlpha0 = 2.5;      // deg
constexpr double kOmegaSp = 2.5;     // rad/s, short-period natural frequency
constexpr double kZetaSp = 0.8;
constexpr double kElevatorToAlpha = 0.35;  // deg of trimmed alpha per deg of elevator, trailing edge down = nose down
constexpr double kThsToAlpha = 0.6;        // deg of trimmed alpha per deg of THS
constexpr double kThsSign = -1.0;          // the computers' THS frame: positive = nose down, like the elevator
constexpr double kRollTau = 0.4;           // s
constexpr double kRollPerAileron = 1.5;    // deg/s of roll rate per deg of differential aileron
constexpr double kRollPerSpoiler = 0.4;    // deg/s per deg of differential spoiler
constexpr double kAileronSign = 1.0;       // + (left - right)/2 rolls right: positive aileron is trailing edge down
constexpr double kVr = 145;                // kt, rotation
constexpr double kTailstrikeDeg = 11.5;

// Zero-lift alpha by configuration: flaps buy lift at a given alpha.
const double kAlphaZeroLift[5] = {-2.0, -4.0, -5.0, -6.0, -8.0};
// FPPU angles the SFCC reports (slats, flaps) per configuration.
const double kSlatFppu[5] = {0, 222.27, 272.27, 272.27, 334.16};
const double kFlapFppu[5] = {0, 0, 145.51, 168.35, 251.97};

// The sidestick of a pilot flying a flight path angle and a heading through the laws.
double pitchFor(double gammaTarget, double gamma, double q) {
  return clamp(0.08 * (gammaTarget - gamma) - 0.02 * q, -0.6, 0.6);
}

double rollFor(double headingTarget, double heading, double phi, double bankLimit = 25) {
  const double phiTarget = clamp(2.0 * wrap180(headingTarget - heading), -bankLimit, bankLimit);
  return clamp(0.05 * (phiTarget - phi), -0.5, 0.5);
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

World::World() {
  sense();
}

void World::step(double dt, const Orders& orders) {
  t_ += dt;
  fly();
  actuate(dt, orders);
  airframe(dt);
  sense();
}

// The scripted crew: a circuit, flown through the laws, repeated until the run ends.
void World::fly() {
  const double inPhase = t_ - phaseStart_;
  auto enter = [this](Phase p) {
    phase_ = p;
    phaseStart_ = t_;
  };
  Crew& c = crew;
  c.pitch = c.roll = c.pedals = 0;

  switch (phase_) {
    case Phase::Parked:
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

    case Phase::Taxi:
      c.spoilersArmed = true;
      c.tla[0] = c.tla[1] = 0;
      conf_ = 1;
      vTarget_ = inPhase < 10 ? 15 : 0;
      if (inPhase >= 25) enter(Phase::TakeoffRoll);
      break;

    case Phase::TakeoffRoll:
      c.tla[0] = c.tla[1] = 45;
      vTarget_ = 170;
      if (v_ >= kVr) c.pitch = theta_ < 12 ? 0.6 : pitchFor(7, gamma_, q_);
      if (!onGround_) {
        c.spoilersArmed = false;
        enter(Phase::Climb);
      }
      break;

    case Phase::Climb: {
      const double target = 8000;
      if (h_ > 100) gearDown_ = false;
      if (h_ > 1500) c.tla[0] = c.tla[1] = 25;
      if (h_ > 3000) conf_ = 0;
      vTarget_ = h_ > 3000 ? 250 : 170;
      headingTarget_ = h_ > 3000 && h_ < 6000 ? 90 : 360;
      c.pitch = pitchFor(clamp(0.004 * (target - h_), -4, 7), gamma_, q_);
      c.roll = rollFor(headingTarget_, psi_, phi_);
      if (h_ > target - 50) enter(Phase::Cruise);
      break;
    }

    case Phase::Cruise: {  // hold 8000 ft and work the laws: doublet, turns, speedbrake, pedals
      c.pitch = pitchFor(clamp(0.004 * (8000 - h_), -4, 4), gamma_, q_);
      c.roll = rollFor(headingTarget_, psi_, phi_);
      if (inPhase >= 20 && inPhase < 22) c.pitch = 0.5;
      if (inPhase >= 22 && inPhase < 24) c.pitch = -0.5;
      if (inPhase >= 40 && inPhase < 80) headingTarget_ = 180;  // a 180-degree turn at 25 degrees of bank
      if (inPhase >= 80 && inPhase < 120) headingTarget_ = 360;
      c.speedbrake = inPhase >= 120 && inPhase < 140 ? 1.0 : 0.0;
      if (inPhase >= 150 && inPhase < 153) c.pedals = 0.3;
      if (inPhase >= 160 && inPhase < 175) c.roll = phi_ > -45 ? -0.5 : -0.1;  // a steep turn, held into it
      if (inPhase >= 175 && inPhase < 200) c.roll = rollFor(headingTarget_, psi_, phi_, 45);
      if (inPhase >= 210) enter(Phase::Approach);
      break;
    }

    case Phase::Approach: {  // down to 2000 ft, configure, then a three-degree path to the runway
      const double glide = 2000;
      double gammaTarget = clamp(0.004 * (glide - h_), -3.5, 3);
      if (inPhase > 60 && h_ < glide + 100) gammaTarget = -3;
      c.pitch = pitchFor(gammaTarget, gamma_, q_);
      c.roll = rollFor(360, psi_, phi_);
      vTarget_ = inPhase < 60 ? 210 : (inPhase < 100 ? 170 : 140);
      conf_ = inPhase < 40 ? 0 : (inPhase < 70 ? 1 : (inPhase < 90 ? 2 : (inPhase < 110 ? 3 : 4)));
      if (inPhase > 70) gearDown_ = true;
      c.spoilersArmed = inPhase > 80;
      c.tla[0] = c.tla[1] = 25;
      if (h_ < 40 && inPhase > 100) enter(Phase::Flare);
      break;
    }

    case Phase::Flare:
      c.pitch = 0.25;
      c.tla[0] = c.tla[1] = h_ < 20 ? 0 : 25;
      c.roll = rollFor(360, psi_, phi_);
      if (onGround_) enter(Phase::Rollout);
      break;

    case Phase::Rollout:
      c.tla[0] = c.tla[1] = 0;
      vTarget_ = 0;
      if (v_ < 30) {
        c.spoilersArmed = false;
        conf_ = 0;
      }
      if (v_ < 1 && inPhase > 20) {
        ++circuit_;
        enter(Phase::Taxi);
      }
      break;
  }

  if (t_ >= stickOverride.from && t_ < stickOverride.to) {
    c.pitch = stickOverride.pitch;
    c.roll = stickOverride.roll;
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

  // hydraulics stay pressurised: the stub has engines running from the first instant
  for (int k = 0; k < 3; ++k) {
    hydPressurised[k] = true;
    hydPsi[k] = 3000;
  }

  slatFppu_ = follow(slatFppu_, kSlatFppu[conf_], 11, dt);
  flapFppu_ = follow(flapFppu_, kFlapFppu[conf_], 6, dt);
}

void World::airframe(double dt) {
  // speed: an autothrust that gets what it asks for; braking on the ground below the target
  const double accel = onGround_ && vTarget_ < v_ ? 4.0 : 2.5;
  vDot_ = clamp((vTarget_ - v_) / 12.0, -accel, onGround_ ? 3.0 : 2.0);
  v_ = std::max(0.0, v_ + vDot_ * dt);
  const double vMs = std::max(v_, 1.0) * kMsPerKt;

  // pitch: a short-period response about the alpha the surfaces trim to
  const double elevator = (surfaces.elevator[0] + surfaces.elevator[1]) / 2;
  const double alphaTrim = kAlpha0 - kElevatorToAlpha * elevator + kThsSign * kThsToAlpha * surfaces.ths;
  const double alpha = theta_ - gamma_;
  const double q2 = std::min(1.0, (v_ / kVr) * (v_ / kVr));  // the tail has authority with airspeed
  double qDot = q2 * kOmegaSp * kOmegaSp * (alphaTrim - alpha) - 2 * kZetaSp * kOmegaSp * q_;

  // roll: first order to the rate the surfaces ask for. Spoilers extend negative in the computers'
  // frame, and the wing whose spoilers rise goes down: left minus right rolls right.
  double spoilerDiff = 0;
  for (int k = 0; k < 5; ++k) spoilerDiff += (surfaces.spoiler[0][k] - surfaces.spoiler[1][k]) / 5;
  const double rollCmd = kRollPerAileron * kAileronSign * (surfaces.aileron[0] - surfaces.aileron[1]) / 2 +
                         kRollPerSpoiler * spoilerDiff;

  // load factor from lift, and the flight path it bends
  const double vRatio = v_ / kVref;
  const double lift = (alpha - kAlphaZeroLift[conf_]) / (kAlpha0 - kAlphaZeroLift[0]) * vRatio * vRatio;

  if (onGround_) {
    p_ = phi_ = phiDot_ = 0;
    gamma_ = gammaDot_ = 0;
    psiDot_ = 0;
    h_ = hDot_ = 0;
    // the main gear is the pivot: the nose rises only when the tail lifts it, and whatever weight
    // the wing is not yet carrying pushes it back onto the nose wheel
    qDot -= 8.0 * (1.0 - clamp(lift, 0.0, 1.0));
    if (theta_ <= 0 && qDot <= 0) {
      theta_ = 0;
      q_ = 0;
    } else {
      q_ += qDot * dt;
      theta_ = clamp(theta_ + q_ * dt, 0, kTailstrikeDeg);
      if (theta_ == 0 || theta_ == kTailstrikeDeg) q_ = 0;
    }
    n_ = 1;
    if (lift > 1.0 && v_ > kVr - 10) onGround_ = false;  // rotate and fly
    wheelSpeed_ = v_;
    return;
  }

  q_ += qDot * dt;
  theta_ += q_ * dt;

  p_ += (rollCmd - p_) / kRollTau * dt;
  phi_ = clamp(phi_ + p_ * dt, -80, 80);
  phiDot_ = p_;

  n_ = std::max(-1.0, lift);
  gammaDot_ = (kG / vMs) * (n_ * std::cos(phi_ * kDeg) - std::cos(gamma_ * kDeg)) / kDeg;
  gamma_ = clamp(gamma_ + gammaDot_ * dt, -30, 30);
  psiDot_ = (kG / vMs) * n_ * std::sin(phi_ * kDeg) / std::cos(gamma_ * kDeg) / kDeg;
  psi_ = wrap360(psi_ + psiDot_ * dt);

  hDot_ = v_ * kFtsPerKt * std::sin(gamma_ * kDeg);
  h_ += hDot_ * dt;
  wheelSpeed_ = std::max(0.0, wheelSpeed_ - 10 * dt);

  if (h_ <= 0) {  // touchdown
    h_ = 0;
    onGround_ = true;
    gamma_ = 0;
    phi_ = p_ = 0;
    wheelSpeed_ = v_;
  }
}

// Sample the sensors and transmit them the way the A32NX producers do.
void World::sense() {
  // ISA, flat earth, field at sea level, no wind
  const double tempK = h_ < 36089 ? 288.15 - 0.0019812 * h_ : 216.65;
  const double sound = 38.967854 * std::sqrt(tempK);
  const double pressure = 1013.25 * std::pow(tempK / 288.15, 5.25588);
  const double density = std::pow(tempK / 288.15, 4.25588);
  const double cas = v_ * std::sqrt(density);
  const unsigned airSsm = cas < 30 ? kNcd : kNo;
  const double alpha = theta_ - gamma_;

  const bool adrFailed = adrFailAt >= 0 && t_ >= adrFailAt;
  for (auto& a : adr) {
    if (adrFailed) {
      a = base_adr_bus{};  // all-zero is FailureWarning on every word
      continue;
    }
    a.altitude_standard_ft = word(h_);
    a.altitude_corrected_1_ft = word(h_);
    a.altitude_corrected_2_ft = word(h_);
    a.mach = word(v_ / sound, airSsm);
    a.airspeed_computed_kn = word(cas, airSsm);
    a.airspeed_true_kn = word(v_, airSsm);
    a.vertical_speed_ft_min = word(hDot_ * 60);
    a.aoa_corrected_deg = word(alpha, airSsm);
    a.corrected_average_static_pressure = word(pressure);
  }

  // body rates from the Euler rates, inverting the kinematics adirs.rs applies
  const double cphi = std::cos(phi_ * kDeg), sphi = std::sin(phi_ * kDeg);
  const double cth = std::cos(theta_ * kDeg), sth = std::sin(theta_ * kDeg);
  const double thetaDot = q_;
  const double pBody = phiDot_ - psiDot_ * sth;
  const double qBody = thetaDot * cphi + psiDot_ * cth * sphi;
  const double rBody = -thetaDot * sphi + psiDot_ * cth * cphi;
  const double longAccel = vDot_ * kMsPerKt / kG + sth;

  for (auto& r : ir) {
    r.latitude_deg = word(47.0);
    r.longitude_deg = word(8.0);
    r.ground_speed_kn = word(v_ * std::cos(gamma_ * kDeg));
    r.track_angle_true_deg = word(psi_);
    r.heading_true_deg = word(psi_);
    r.wind_speed_kn = word(0);
    r.wind_direction_true_deg = word(0);
    r.track_angle_magnetic_deg = word(psi_);
    r.heading_magnetic_deg = word(psi_);
    r.drift_angle_deg = word(0);
    r.flight_path_angle_deg = word(gamma_);
    r.pitch_angle_deg = word(theta_);
    r.roll_angle_deg = word(phi_);
    r.body_pitch_rate_deg_s = word(qBody);
    r.body_roll_rate_deg_s = word(pBody);
    r.body_yaw_rate_deg_s = word(rBody);
    r.body_long_accel_g = word(longAccel);
    r.body_lat_accel_g = word(0);
    r.body_normal_accel_g = word(n_);
    r.track_angle_rate_deg_s = word(psiDot_);  // the driver feeds heading rate here (contract/12)
    r.pitch_att_rate_deg_s = word(thetaDot);
    r.roll_att_rate_deg_s = word(phiDot_);
    r.inertial_vertical_speed_ft_s = word(hDot_ * 60);  // fed ft/min, as the producer does (contract/12)
  }

  // radio altimeter: valid below 2500 ft, out of range above it the way ala52b.rs reports it
  for (auto& r : ra) r.radio_height_ft = h_ < 2500 ? word(h_) : word(8192, kNcd);

  const bool compressed = onGround_;
  const bool noseCompressed = noseGearCompressed();
  const bool down = gearDown_;
  for (auto& l : lgciu) {
    // landing_gear/mod.rs: gear and doors locked where the handle says, no transit modelled
    l.discrete_word_1 = discrete({{11, false}, {12, false}, {13, false}, {14, false}, {15, false}, {16, false},
                                  {17, false}, {18, false}, {19, false}, {23, down}, {24, down}, {25, down},
                                  {26, compressed}, {27, compressed}, {28, noseCompressed}, {29, down}});
    l.discrete_word_2 = discrete({{11, compressed}, {12, noseCompressed}, {13, compressed}, {14, compressed}, {15, down}});
    l.discrete_word_3 = discrete({{11, down}, {12, down}, {13, down}, {14, !down}});
    l.discrete_word_4 = discrete({{22, true}, {26, true}});
  }

  for (auto& s : sfcc) {
    // sfcc/mod.rs: label 046 detent bits, and the actual-position bits from the FPPU angles
    s.slat_flap_component_status_word = base_arinc_429{};  // no producer on the aircraft either
    s.slat_flap_system_status_word = discrete({{17, conf_ == 0}, {18, conf_ == 1}, {19, conf_ == 2},
                                               {20, conf_ == 3}, {21, conf_ == 4}, {28, true}, {29, true}});
    const double sl = slatFppu_, fl = flapFppu_;
    s.slat_flap_actual_position_word =
        discrete({{11, true}, {12, sl > -5 && sl < 6.2}, {13, sl > 210.4 && sl < 337}, {14, sl > 321.8 && sl < 337},
                  {15, sl > 327.4 && sl < 337}, {18, true}, {19, fl > -5 && fl < 2.5}, {20, fl > 140.7 && fl < 254},
                  {21, fl > 163.7 && fl < 254}, {22, fl > 247.8 && fl < 254}, {23, fl > 250 && fl < 254}});
    s.slat_actual_position_deg = word(sl);
    s.flap_actual_position_deg = word(fl);
  }

  // FMGC: not part of P6. A stub that says it is alive, autopilot off, with a weight and a CG.
  for (int k = 0; k < 2; ++k) {
    base_fmgc_b_bus& f = fmgc[k];
    f = base_fmgc_b_bus{};
    f.fac_weight_lbs = word(141000);
    f.fm_weight_lbs = word(141000);
    f.fac_cg_percent = word(28);
    f.fm_cg_percent = word(28);
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
    f.n1_left_percent = word(20 + crew.tla[0] * 1.7);
    f.n1_right_percent = word(20 + crew.tla[1] * 1.7);
  }
}
