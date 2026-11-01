// The airframe scored against the A320's targets (flight/targets/a320.csv): where the stand-in stands,
// so that a fitted A320 has numbers to beat. GPLv3.
//
//   airframe_score                    the table, scored
//   airframe_score --out score.csv    and written out
//   airframe_score --check            exit 1 unless every target and context row was measured
//   airframe_score --only-group thrust, --skip-group thrust [--skip-group poststall]
//                                     one group of rows, or every group but those skipped
//   airframe_score --instruments, --instruments-pitch
//                                     the instruments checked against what the aircraft files say
//
// It scores; it does not gate. Outside a band is a fact about the airframe, not a failed build.
//
// Two kinds of measurement. The bare airframe, with no computers: JSBSim sweeps its lift curve, reads
// its drag and its static pitching moment, trims it, pulses its elevator and runs its engines to a
// steady thrust (airframe.h), at the weight the row names. The airframe flown: one circuit through the
// A32NX laws at the weight it is loaded to, with a full-stick roll added in cruise, timed as the gate's
// circuit is.

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <limits>
#include <map>
#include <string>
#include <vector>

#include "airframe.h"
#include "efcs.h"
#include "world.h"

namespace {

constexpr double kDt = 0.02;
constexpr double kNaN = std::numeric_limits<double>::quiet_NaN();
constexpr double kPi = 3.14159265358979323846;
constexpr double kLbsPerTonne = 2204.62;
constexpr double kRho0 = 0.0023769;  // slug/ft3, sea level, ISA
constexpr double kFpsPerKt = 1.687810;
constexpr double kMsPerKt = 0.514444;
constexpr double kKnPerLbf = 0.00444822;
constexpr int kEngines = 2;  // both airframes are twins

// When, after the circuit reaches cruise, the extra full-stick roll is flown: after the doublet (+20 to
// +24 s), before the first turn (+40 s). The pedal kick is the circuit's own, +150 to +153 s; the steep
// turn begins at +160 s.
constexpr double kRollFrom = 28, kRollTo = 30, kKickRelease = 153, kKickWindowEnd = 160;

std::string fmt(const char* f, double a = 0, double b = 0, double c = 0) {
  char buf[256];
  std::snprintf(buf, sizeof buf, f, a, b, c);
  return buf;
}

std::vector<std::string> split(const std::string& line) {
  std::vector<std::string> out(1);
  for (char ch : line) {
    if (ch == ',') {
      out.emplace_back();
    } else if (ch != '\r') {
      out.back() += ch;
    }
  }
  return out;
}

double number(const std::string& s) {
  return s.empty() ? kNaN : std::atof(s.c_str());
}

// A CSV with '#' comment lines and a header row: one map per row, by column name.
std::vector<std::map<std::string, std::string>> readCsv(const std::string& path) {
  std::ifstream in(path);
  if (!in) {
    std::fprintf(stderr, "cannot read %s\n", path.c_str());
    std::exit(2);
  }
  std::vector<std::map<std::string, std::string>> rows;
  std::vector<std::string> header;
  std::string line;
  while (std::getline(in, line)) {
    if (line.empty() || line[0] == '#' || line == "\r") continue;
    const std::vector<std::string> cells = split(line);
    if (header.empty()) {
      header = cells;
      continue;
    }
    if (cells.size() != header.size()) {
      std::fprintf(stderr, "%s: a row with %zu cells under a header of %zu: %s\n", path.c_str(), cells.size(),
                   header.size(), line.c_str());
      std::exit(2);
    }
    std::map<std::string, std::string> row;
    for (size_t k = 0; k < cells.size(); ++k) row[header[k]] = cells[k];
    rows.push_back(row);
  }
  return rows;
}

// a320-speeds.csv: "vs1g:clean" and the like, 40 to 80 t in 5 t steps, interpolated.
struct Speeds {
  std::map<std::string, std::vector<double>> table;

  explicit Speeds(const std::string& path) {
    for (const auto& row : readCsv(path)) {
      std::vector<double>& v = table[row.at("kind") + ":" + row.at("config")];
      for (int t = 40; t <= 80; t += 5) v.push_back(number(row.at("t" + std::to_string(t))));
    }
  }

  double at(const std::string& key, double tonnes) const {
    const auto it = table.find(key);
    if (it == table.end()) {
      std::fprintf(stderr, "a320-speeds.csv has no %s\n", key.c_str());
      std::exit(2);
    }
    const double x = std::max(0.0, std::min(7.999, (tonnes - 40) / 5));
    const int k = static_cast<int>(x);
    return it->second[k] + (x - k) * (it->second[k + 1] - it->second[k]);
  }
};

struct Measured {
  double value = kNaN;  // NaN with a note is a result too: no trim exists there
  std::string note;
};

using Measures = std::map<std::string, Measured>;

struct Config {
  std::string name;
  Configuration surfaces;
};

// slat and flap surface angles per configuration (a320_systems hydraulic/mod.rs). CONF 1 is slats
// alone, which the 737's tables do not see: to the 737 it is clean.
const Config kConfigs[] = {{"clean", {0, 0, false}},  {"conf1", {18, 0, false}}, {"conf1f", {18, 10, false}},
                           {"conf2", {22, 15, false}}, {"conf3", {22, 20, true}}, {"full", {27, 40, true}}};

const Config* config(const std::string& name) {
  for (const Config& c : kConfigs) {
    if (c.name == name) return &c;
  }
  return nullptr;
}

// What a thrust or a gradient row's condition names, in its own column: the thrust lever's detent, the
// configuration, the speed and the altitude. "TOGA; 150 kt; 4000 ft", "CL; Mach 0.80; FL350",
// "idle; clean; gear up; 210 kt; 5000 ft". A word the parser does not know ends the run: the column is
// the row's definition, and a row read wrongly would be scored wrongly.
struct Condition {
  double tla = kNaN;                 // 0 idle, 25 CL, 35 MCT, 45 TOGA
  const Config* config = nullptr;    // named configurations only; a thrust row names none
  double casKn = kNaN, mach = 0;     // a CAS, 0 for static, or a Mach
  double altitudeFt = kNaN;
};

std::string trim(const std::string& s) {
  const size_t a = s.find_first_not_of(' '), b = s.find_last_not_of(' ');
  return a == std::string::npos ? "" : s.substr(a, b - a + 1);
}

Condition parseCondition(const std::string& id, const std::string& text) {
  Condition c;
  size_t from = 0;
  while (from <= text.size()) {
    const size_t semicolon = std::min(text.find(';', from), text.size());
    const std::string word = trim(text.substr(from, semicolon - from));
    from = semicolon + 1;
    const char* w = word.c_str();
    char unit[16] = "";
    double v = 0;
    if (word == "TOGA") {
      c.tla = 45;
    } else if (word == "MCT") {
      c.tla = 35;
    } else if (word == "CL") {
      c.tla = 25;
    } else if (word == "idle") {
      c.tla = 0;
    } else if (word == "static") {
      c.casKn = 0;
    } else if (word == "sea level") {
      c.altitudeFt = 0;
    } else if (word == "clean") {
      c.config = config("clean");
    } else if (word == "CONF 1+F") {
      c.config = config("conf1f");
    } else if (word == "gear up" || word == "gear down") {
      if (!c.config || c.config->surfaces.gearDown != (word == "gear down")) {
        std::fprintf(stderr, "a320.csv: %s: the gear and the configuration disagree\n", id.c_str());
        std::exit(2);
      }
    } else if (std::sscanf(w, "Mach %lf", &v) == 1) {
      c.mach = v;
    } else if (std::sscanf(w, "FL%lf", &v) == 1) {
      c.altitudeFt = 100 * v;
    } else if (std::sscanf(w, "%lf %15s", &v, unit) == 2 && std::string(unit) == "kt") {
      c.casKn = v;
    } else if (std::sscanf(w, "%lf %15s", &v, unit) == 2 && std::string(unit) == "ft") {
      c.altitudeFt = v;
    } else {
      std::fprintf(stderr, "a320.csv: %s: no meaning for \"%s\" in its condition\n", id.c_str(), word.c_str());
      std::exit(2);
    }
  }
  if (std::isnan(c.tla) || std::isnan(c.altitudeFt) || (std::isnan(c.casKn) && !(c.mach > 0))) {
    std::fprintf(stderr, "a320.csv: %s: its condition names no lever, speed or altitude\n", id.c_str());
    std::exit(2);
  }
  if (std::isnan(c.casKn)) c.casKn = 0;
  return c;
}

bool endsWith(const std::string& s, const std::string& tail) {
  return s.size() >= tail.size() && s.compare(s.size() - tail.size(), tail.size(), tail) == 0;
}

// "vls-alpha-full-65t" is "vls-alpha-full" measured at the weight its row names.
std::string family(const std::string& id) {
  const size_t dash = id.rfind('-');
  if (dash == std::string::npos || id.size() < dash + 3 || id.back() != 't') return id;
  for (size_t k = dash + 1; k + 1 < id.size(); ++k) {
    if (!std::isdigit(static_cast<unsigned char>(id[k]))) return id;
  }
  return id.substr(0, dash);
}

// The Mach at which the drag of the clean airframe, held at a lift coefficient of 0.5, has risen 20
// counts above its drag at Mach 0.6: Boeing's definition of drag divergence, at the lift of an A320
// cruising near its typical weight.
Measured dragRise(Airframe& a) {
  constexpr double kCl = 0.5, kRise = 0.0020, kAltitudeFt = 35000;
  double alpha = 2;
  // the alpha for the lift coefficient, by secant from the last one found; NaN if it does not converge
  const Configuration clean;
  auto cdAt = [&](double mach) {
    double a0 = alpha, a1 = alpha + 0.5;
    AeroPoint p0 = a.aero(kAltitudeFt, mach, a0, clean), p1 = a.aero(kAltitudeFt, mach, a1, clean);
    for (int k = 0; k < 12 && std::abs(p1.cl - kCl) > 1e-6; ++k) {
      if (p1.cl == p0.cl) return kNaN;
      const double a2 = a1 + (kCl - p1.cl) * (a1 - a0) / (p1.cl - p0.cl);
      a0 = a1;
      p0 = p1;
      a1 = a2;
      p1 = a.aero(kAltitudeFt, mach, a1, clean);
    }
    if (std::abs(p1.cl - kCl) > 1e-4) return kNaN;
    alpha = a1;
    return p1.cd;
  };
  const double base = cdAt(0.60);
  if (std::isnan(base)) return {kNaN, "no lift coefficient of 0.5 at Mach 0.6"};
  double lastMach = 0.60, lastRise = 0;
  for (int k = 1; k <= 70; ++k) {
    const double mach = 0.60 + 0.005 * k;
    const double rise = cdAt(mach) - base;
    if (std::isnan(rise)) return {kNaN, fmt("no lift coefficient of 0.5 at Mach %.3f", mach)};
    if (rise >= kRise) {
      const double at = lastMach + (mach - lastMach) * (kRise - lastRise) / (rise - lastRise);
      return {at, fmt("CD %.4f at Mach 0.6; alpha %.1f deg at the rise", base, alpha)};
    }
    lastMach = mach;
    lastRise = rise;
  }
  return {kNaN, fmt("under 20 counts of rise up to Mach %.3f", lastMach)};
}

// The pitch short period of the bare airframe: the alpha response after a pulse of elevator, controls
// otherwise fixed, from its first extremum and the next of opposite sign. Their ratio is
// exp(-pi zeta / sqrt(1 - zeta^2)) for half a cycle, and the time between them half a damped period.
struct ShortPeriod {
  Measured zeta, wn;  // damping ratio; undamped natural frequency, rad/s
};

ShortPeriod shortPeriodOf(const PitchResponse& r, double recordS) {
  const std::vector<double>& x = r.alphaDeg;
  std::vector<size_t> extrema;
  for (size_t k = 1; k + 1 < x.size(); ++k) {
    if ((x[k] - x[k - 1]) * (x[k + 1] - x[k]) < 0) extrema.push_back(k);
  }
  if (extrema.empty()) return {{kNaN, "alpha did not turn after the pulse"}, {kNaN, "alpha did not turn after the pulse"}};
  const size_t first = extrema.front();
  for (size_t e : extrema) {
    if (e > first && x[e] * x[first] < 0) {
      const double decrement = std::log(std::abs(x[first] / x[e]));
      const double zeta = decrement / std::sqrt(kPi * kPi + decrement * decrement);
      const double wn = kPi / (r.t[e] - r.t[first]) / std::sqrt(1 - zeta * zeta);
      const std::string note = fmt("alpha %+.2f then %+.2f deg", x[first], x[e]);
      return {{zeta, note + fmt("; natural frequency %.2f rad/s", wn)}, {wn, note + fmt("; damping %.2f", zeta)}};
    }
  }
  // No overshoot: the half-cycle ratio would be under 1/100 of the first excursion, so zeta is at least 0.83.
  const std::string none = fmt("no overshoot within %.0f s of %+.2f deg of alpha", recordS, x[first]);
  return {{0.83, "a lower bound: " + none}, {kNaN, none}};
}

// The short period by equation error, which needs no overshoot to see it: the pulse response from its
// start fitted by least squares to alpha' = Za alpha + Zq q + Zd elevator + a and q' = Ma alpha + Mq q +
// Md elevator + b, the rates by central differences, over the seconds named, short against the phugoid,
// the constants taking up the little the speed has moved. The short period is [[Za Zq] [Ma Mq]]: its
// natural frequency the square root of the determinant, its damping ratio minus the trace over twice it.
ShortPeriod shortPeriodByEquationError(const PitchResponse& r, double overS) {
  // normal equations of [x q d 1] for each of the two rates
  double n[4][4] = {}, ya[4] = {}, yq[4] = {};
  for (size_t k = 1; k + 1 < r.fromStart.size() && r.fromStart[k] <= overS; ++k) {
    const double dt = r.fromStart[k + 1] - r.fromStart[k - 1];
    const double alphaDot = (r.alphaFromStartDeg[k + 1] - r.alphaFromStartDeg[k - 1]) / dt;
    const double qDot = (r.qDegS[k + 1] - r.qDegS[k - 1]) / dt;
    const double x[4] = {r.alphaFromStartDeg[k], r.qDegS[k], r.elevatorDeg[k], 1};
    for (int i = 0; i < 4; ++i) {
      for (int j = 0; j < 4; ++j) n[i][j] += x[i] * x[j];
      ya[i] += x[i] * alphaDot;
      yq[i] += x[i] * qDot;
    }
  }
  // Gauss-Jordan on both right-hand sides at once
  double m[4][6];
  for (int i = 0; i < 4; ++i) {
    for (int j = 0; j < 4; ++j) m[i][j] = n[i][j];
    m[i][4] = ya[i];
    m[i][5] = yq[i];
  }
  for (int c = 0; c < 4; ++c) {
    int pivot = c;
    for (int i = c + 1; i < 4; ++i) {
      if (std::abs(m[i][c]) > std::abs(m[pivot][c])) pivot = i;
    }
    if (std::abs(m[pivot][c]) < 1e-12) return {{kNaN, "the pulse response did not determine it"}, {kNaN, "the pulse response did not determine it"}};
    for (int j = 0; j < 6; ++j) std::swap(m[c][j], m[pivot][j]);
    for (int i = 0; i < 4; ++i) {
      if (i == c) continue;
      const double f = m[i][c] / m[c][c];
      for (int j = c; j < 6; ++j) m[i][j] -= f * m[c][j];
    }
  }
  const double za = m[0][4] / m[0][0], zq = m[1][4] / m[1][1], ma = m[0][5] / m[0][0], mq = m[1][5] / m[1][1];
  const double det = za * mq - zq * ma, trace = za + mq;
  const std::string note = fmt("Za %+.3f, Zq %+.3f per s; ", za, zq) + fmt("Ma %+.3f, Mq %+.3f per s", ma, mq);
  if (!(det > 0)) return {{kNaN, note + ": not oscillatory"}, {kNaN, note + ": not oscillatory"}};
  const double wn = std::sqrt(det), zeta = -trace / (2 * wn);
  return {{zeta, note + fmt("; natural frequency %.2f rad/s", wn)}, {wn, note + fmt("; damping %.2f", zeta)}};
}

Measured shortPeriod(Airframe& a) {
  constexpr double kAltitudeFt = 8000, kCasKn = 250, kPulseDeg = 2, kPulseS = 1, kRecordS = 12;
  const PitchResponse r = a.pitchPulse(kAltitudeFt, kCasKn, kPulseDeg, kPulseS, kRecordS);
  if (!r.ok) return {kNaN, "no trim at 8000 ft and 250 kt"};
  return shortPeriodOf(r, kRecordS).zeta;
}

// The full nose-up elevator of the A320, 30 deg trailing edge up, in the computers' frame.
constexpr double kElevatorFullUpDeg = -30;

// How high in alpha full nose-up elevator holds the nose, the stabiliser at 0: the static pitching moment
// about the centre of gravity in level flight at 1 g, swept upward by degrees from 4 to 40 deg, and the
// alpha where it first turns nose down, found to a sixty-fourth of a degree by halving. Above it the
// elevator cannot hold the aeroplane in steady flight.
Measured elevatorAlpha(Airframe& a, const Configuration& c) {
  double lastAlpha = 4, last = a.pitchMomentAt(c, lastAlpha, kElevatorFullUpDeg, 0);
  const double atStart = last;
  if (last <= 0) return {kNaN, fmt("nose down already at %.0f deg: Cm %+.3f", lastAlpha, last)};
  for (int k = 5; k <= 40; ++k) {
    double alpha = k, cm = a.pitchMomentAt(c, alpha, kElevatorFullUpDeg, 0);
    if (cm > 0) {
      lastAlpha = alpha;
      last = cm;
      continue;
    }
    for (int halving = 0; halving < 6; ++halving) {
      const double mid = (lastAlpha + alpha) / 2, cmMid = a.pitchMomentAt(c, mid, kElevatorFullUpDeg, 0);
      if (cmMid > 0) {
        lastAlpha = mid;
        last = cmMid;
      } else {
        alpha = mid;
        cm = cmMid;
      }
    }
    const double at = lastAlpha + (alpha - lastAlpha) * last / (last - cm);
    return {at, fmt("Cm %+.3f at 4 deg; %+.4f per deg where it turns", atStart, (cm - last) / (alpha - lastAlpha))};
  }
  return {kNaN, fmt("still nose up at 40 deg: Cm %+.3f", last)};
}

// How far the pitching moment breaks nose down past the stall: the static moment about the centre of
// gravity in level flight at 1 g, elevator and stabiliser at 0, at 6 deg past the lift peak, less the
// straight line fitted to it from 2 deg to 6 deg short of the peak, extended there.
Measured pitchBreak(Airframe& a, const Configuration& c, const LiftPeak& p) {
  const double to = p.alphaDeg - 6, at = p.alphaDeg + 6;
  if (to < 4) return {kNaN, fmt("the lift peaks at %.2f deg, too low for a line before it", p.alphaDeg)};
  double n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (double alpha = 2; alpha <= to + 1e-9; alpha += 0.5) {
    const double cm = a.pitchMomentAt(c, alpha, 0, 0);
    n += 1;
    sx += alpha;
    sy += cm;
    sxx += alpha * alpha;
    sxy += alpha * cm;
  }
  const double slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), intercept = (sy - slope * sx) / n;
  const double line = intercept + slope * at, cm = a.pitchMomentAt(c, at, 0, 0);
  return {cm - line, fmt("Cm %+.3f at %.2f deg; ", cm, at) +
                         fmt("the line from 2 to %.2f deg, %+.4f per deg, gives %+.3f", to, slope, line)};
}

// The lift past the stall as a share of the peak, so many degrees past the alpha of maximum lift.
Measured liftPastStall(Airframe& a, const Configuration& c, const LiftPeak& p, double pastDeg) {
  const double cl = a.liftAt(c, p.alphaDeg + pastDeg);
  return {cl / p.clMax, fmt("CL %.3f at %.2f deg; ", cl, p.alphaDeg + pastDeg) + fmt("CL max %.3f at %.2f deg", p.clMax, p.alphaDeg)};
}

// The bare airframe, measured row by row at the weight each row names: lift peaks once per
// configuration, everything else on demand.
class Bare {
 public:
  Bare(Airframe& a, const Speeds& speeds) : a_(a), speeds_(speeds), loadedLbs_(a.state().weightLbs) {}

  double loadedLbs() const { return loadedLbs_; }

  Measured measure(const std::string& id, const std::string& family, const std::string& measure,
                   const std::string& condition, const std::string& unit, double lbs) {
    if (std::abs(a_.state().weightLbs - lbs) > 0.5) a_.setWeightLbs(lbs);
    const double tonnes = lbs / kLbsPerTonne;
    if (id.rfind("thrust-", 0) == 0) {
      // one engine at the lever's detent, as the aircraft's thrust lever schedule sets it
      const Condition c = parseCondition(id, condition);
      const double thrust = a_.engineThrustLbs(c.altitudeFt, c.casKn, c.mach, c.tla);
      const double mach = a_.state().mach;
      if (unit == "%") {  // a share of the same lever's static thrust at the same altitude
        const double still = a_.engineThrustLbs(c.altitudeFt, 0, 0, c.tla);
        return {thrust / still * 100, fmt("%.0f lbf at Mach %.3f, %.0f lbf static", thrust, mach, still)};
      }
      return {thrust * kKnPerLbf, fmt("%.0f lbf at Mach %.3f", thrust, mach)};
    }
    if (endsWith(id, "-gradient")) {
      // the lever's thrust, both engines, less the thrust a level trim needs, over the weight: the
      // steady gradient on the energy method, sin gamma = (T - D) / W
      const Condition c = parseCondition(id, condition);
      if (!c.config) {
        std::fprintf(stderr, "a320.csv: %s: a gradient needs a configuration\n", id.c_str());
        std::exit(2);
      }
      const TrimPoint level = a_.trim(c.altitudeFt, c.casKn, c.mach, 0, c.config->surfaces);
      if (!level.ok) return {kNaN, fmt("no level trim at %.0f kt", c.casKn)};
      const double available = kEngines * a_.engineThrustLbs(c.altitudeFt, c.casKn, c.mach, c.tla);
      return {(available - level.thrustLbs) / lbs * 100,
              fmt("thrust %.0f lbf; a level trim needs %.0f lbf at alpha %.1f deg", available, level.thrustLbs,
                  level.alphaDeg)};
    }
    if (family.rfind("vs1g-", 0) == 0 && config(family.substr(5))) {
      const LiftPeak& p = peak(*config(family.substr(5)));
      const double vs1g = std::sqrt(2 * lbs / (kRho0 * a_.wingAreaFt2() * p.clMax)) / kFpsPerKt;
      return {vs1g, fmt("CL max %.2f, elevator neutral", p.clMax)};
    }
    if (family.rfind("stall-alpha-", 0) == 0 && config(family.substr(12))) {
      const LiftPeak& p = peak(*config(family.substr(12)));
      return {p.alphaDeg, fmt("CL max %.2f", p.clMax)};
    }
    if (family.rfind("vls-alpha-", 0) == 0 && config(family.substr(10))) {
      const Config& c = *config(family.substr(10));
      const double vls = speeds_.at("vls:" + c.name, tonnes);
      const TrimPoint t = a_.trim(1000, vls, 0, 0, c.surfaces);
      return t.ok ? Measured{t.alphaDeg, fmt("at the A320's VLS, %.0f kt; THS %.1f deg", vls, t.thsDeg)}
                  : Measured{kNaN, fmt("no trim at the A320's VLS, %.0f kt", vls)};
    }
    if (family == "app-pitch-full") {
      // the speed is in the row: "at VLS + 5 kt"
      const size_t at = measure.find("VLS + ");
      if (at == std::string::npos) return {kNaN, "the row names no speed above VLS"};
      const double vapp = speeds_.at("vls:full", tonnes) + std::atof(measure.c_str() + at + 6);
      const TrimPoint t = a_.trim(1000, vapp, 0, -3, config("full")->surfaces);
      return t.ok ? Measured{t.pitchDeg, fmt("%.0f kt; alpha %.1f; THS %.1f deg", vapp, t.alphaDeg, t.thsDeg)}
                  : Measured{kNaN, fmt("no trim at %.0f kt", vapp)};
    }
    if (family == "cruise-pitch" || family == "cruise-tla") {
      const TrimPoint t = a_.trim(35000, 0, 0.78, 0, config("clean")->surfaces);
      if (!t.ok) return {kNaN, "no trim"};
      return family == "cruise-pitch" ? Measured{t.pitchDeg, fmt("alpha %.1f; THS %.1f deg", t.alphaDeg, t.thsDeg)}
                                      : Measured{t.tla, ""};
    }
    if (id == "drag-rise") return dragRise(a_);
    if (id == "short-period") return shortPeriod(a_);
    if (family.rfind("short-period-", 0) == 0) {
      // in a configuration and at a speed above VLS the condition names: "CONF FULL; ...; VLS + 5 kt"
      const Config* c = family == "short-period-full" || family == "short-period-freq-full" ||
                                family == "short-period-cap-full"
                            ? config("full")
                            : nullptr;
      const size_t at = condition.find("VLS + ");
      if (!c || at == std::string::npos) return {kNaN, "no configuration or no speed above VLS in the row"};
      const double cas = speeds_.at("vls:" + c->name, tonnes) + std::atof(condition.c_str() + at + 6);
      const ShortPeriodPoint& s = shortPeriodAt(*c, cas, lbs);
      if (family == "short-period-full") return s.mode.zeta;
      if (family == "short-period-freq-full") return s.mode.wn;
      return s.cap;
    }
    if (family.rfind("elevator-alpha-", 0) == 0 && config(family.substr(15))) {
      return elevatorAlpha(a_, config(family.substr(15))->surfaces);
    }
    if (family.rfind("pitch-break-", 0) == 0 && config(family.substr(12))) {
      const Config& c = *config(family.substr(12));
      return pitchBreak(a_, c.surfaces, peak(c));
    }
    if (family.rfind("lift-past-stall-", 0) == 0) {
      // "lift-past-stall-full-15": CONF FULL, 15 deg past the peak
      const std::string rest = family.substr(16);
      const size_t dash = rest.find('-');
      const Config* c = dash == std::string::npos ? nullptr : config(rest.substr(0, dash));
      if (!c) return {kNaN, "no configuration in the row's id"};
      return liftPastStall(a_, c->surfaces, peak(*c), std::atof(rest.c_str() + dash + 1));
    }
    return {kNaN, "?"};
  }

  // Whether a row is measured on the bare airframe rather than flown.
  static bool measures(const std::string& id, const std::string& family) {
    for (const char* prefix : {"vs1g-", "stall-alpha-", "vls-alpha-", "elevator-alpha-", "pitch-break-"}) {
      const size_t n = std::strlen(prefix);
      if (family.rfind(prefix, 0) == 0 && config(family.substr(n))) return true;
    }
    return family == "app-pitch-full" || family == "cruise-pitch" || family == "cruise-tla" || id == "drag-rise" ||
           id == "short-period" || family.rfind("short-period-", 0) == 0 || family.rfind("lift-past-stall-", 0) == 0 ||
           id.rfind("thrust-", 0) == 0 || endsWith(id, "-gradient");
  }

 private:
  const LiftPeak& peak(const Config& c) {
    const auto it = peaks_.find(c.name);
    if (it != peaks_.end()) return it->second;
    return peaks_[c.name] = a_.liftPeak(c.surfaces);
  }

  // The short period of the bare airframe in a configuration, trimmed level at 1,000 ft and a CAS, after
  // a pulse of 2 deg of elevator for 1 s, by equation error over its first 6 s; and with it the control
  // anticipation parameter, the natural frequency squared over the load factor per radian of alpha,
  // n/alpha = qbar S CL_alpha / W, from the lift slope at the trim. Measured once for the rows that share it.
  struct ShortPeriodPoint {
    ShortPeriod mode;
    Measured cap;
  };
  const ShortPeriodPoint& shortPeriodAt(const Config& c, double casKn, double lbs) {
    constexpr double kAltitudeFt = 1000, kPulseDeg = 2, kPulseS = 1, kRecordS = 12, kFitS = 6;
    const std::string key = c.name + fmt(" %.3f kt %.1f lb", casKn, lbs);
    const auto it = shortPeriods_.find(key);
    if (it != shortPeriods_.end()) return it->second;
    ShortPeriodPoint& s = shortPeriods_[key];
    const PitchResponse r = a_.pitchPulse(kAltitudeFt, casKn, kPulseDeg, kPulseS, kRecordS, c.surfaces);
    if (!r.ok) {
      const Measured none{kNaN, fmt("no trim at %.0f kt", casKn)};
      s = {{none, none}, none};
      return s;
    }
    // In CONF FULL near VLS the response may not overshoot at all within the record (ours does not), so
    // the extrema the clean row reads cannot see the period; equation error can. Where both can, they
    // agree within 0.07 of damping and 0.05 rad/s (the clean row and the 737's CONF FULL, 2026-11-01).
    s.mode = shortPeriodByEquationError(r, kFitS);
    const double below = a_.aero(kAltitudeFt, r.mach, r.trimAlphaDeg - 0.5, c.surfaces).cl,
                 above = a_.aero(kAltitudeFt, r.mach, r.trimAlphaDeg + 0.5, c.surfaces).cl;
    const double clAlpha = (above - below) / (kPi / 180), nAlpha = r.qbarPsf * a_.wingAreaFt2() * clAlpha / lbs;
    const double wn = s.mode.wn.value;
    s.cap = {wn * wn / nAlpha, fmt("natural frequency %.2f rad/s; n/alpha %.2f g per rad; ", wn, nAlpha) +
                                   fmt("at %.0f kt and %.1f deg of alpha", casKn, r.trimAlphaDeg)};
    return s;
  }

  Airframe& a_;
  const Speeds& speeds_;
  const double loadedLbs_;
  std::map<std::string, LiftPeak> peaks_;
  std::map<std::string, ShortPeriodPoint> shortPeriods_;
};

// The airframe flown through the laws: the gate's circuit, to the approach, with one extra roll.
void measureFlown(Measures& m) {
  World world;
  Efcs& efcs = Efcs::instance();
  Phase last = world.phase();
  double brakeRelease = -1, liftoff = -1, cruise = -1, climbFrom[2] = {-1, 0}, descentFrom[2] = {-1, 0};
  std::vector<double> rollTime, roll, kickTime, beta;

  // to 3,000 ft on the approach, where the descent is timed: 13 minutes in, with the engines fitted
  const long long ticks = std::llround(15 * 60 / kDt);
  for (long long k = 0; k < ticks && world.crashedAt() < 0; ++k) {
    efcs.tick(world, kDt);
    world.step(kDt, efcs.orders());
    const double t = world.time(), h = world.altitudeFt();

    if (world.phase() != last) {
      last = world.phase();
      if (last == Phase::TakeoffRoll && brakeRelease < 0) brakeRelease = t;
      if (last == Phase::Cruise && cruise < 0) {
        cruise = t;
        world.stickOverride = {t + kRollFrom, t + kRollTo, 0, 1};  // full right stick, pitch neutral
      }
    }
    if (brakeRelease >= 0 && liftoff < 0 && !world.onGround()) {
      liftoff = t;
      m["lof-speed"] = {world.groundSpeedKn(), fmt("%.0f kt CAS", world.casKn())};
      m["to-accel"] = {world.groundSpeedKn() * kMsPerKt / (t - brakeRelease), fmt("%.1f s from brake release", t - brakeRelease)};
    }
    if (world.phase() == Phase::Climb) {
      if (climbFrom[0] < 0 && h >= 4000) {
        climbFrom[0] = t;
        climbFrom[1] = h;
      }
      if (climbFrom[0] >= 0 && !m.count("climb-rate") && h >= 7500) {
        m["climb-rate"] = {(h - climbFrom[1]) / (t - climbFrom[0]) * 60, fmt("at %.0f kt", world.casKn())};
      }
    }
    if (world.phase() == Phase::Approach) {
      if (descentFrom[0] < 0 && h <= 7000) {
        descentFrom[0] = t;
        descentFrom[1] = h;
      }
      if (descentFrom[0] >= 0 && !m.count("descent-rate") && h <= 3000) {
        m["descent-rate"] = {(h - descentFrom[1]) / (t - descentFrom[0]) * 60, fmt("at %.0f kt", world.casKn())};
      }
    }
    if (cruise >= 0) {
      const double c = t - cruise;
      if (c >= kRollFrom && c < kRollTo) {
        rollTime.push_back(c - kRollFrom);
        roll.push_back(world.rollRateDegS());
      }
      if (c >= kKickRelease && c < kKickWindowEnd) {
        kickTime.push_back(c);
        beta.push_back(world.betaDeg());
      }
    }
  }
  if (world.crashedAt() >= 0) {
    std::printf("the flown airframe went into the ground at %.1f s; flown measurements stop there\n", world.crashedAt());
  }

  // Roll: the steady rate over the second second of the step; the time constant to 63 % of it.
  if (!roll.empty()) {
    double sum = 0;
    int n = 0;
    for (size_t k = 0; k < roll.size(); ++k) {
      if (rollTime[k] >= 1.0) {
        sum += roll[k];
        ++n;
      }
    }
    const double steady = n ? sum / n : kNaN;
    double tau = kNaN;
    for (size_t k = 0; k < roll.size(); ++k) {
      if (roll[k] >= 0.632 * steady) {
        tau = rollTime[k];
        break;
      }
    }
    m["roll-rate"] = {steady, "mean over the second second of the step"};
    m["roll-tau"] = {tau, "time to 63 % of the steady rate"};
  }

  // Dutch roll: from the sideslip after the pedal kick, the first extremum and the next of opposite
  // sign. Their ratio is exp(-pi zeta / sqrt(1 - zeta^2)) for half a cycle.
  if (beta.size() > 2) {
    std::vector<size_t> extrema;
    for (size_t k = 1; k + 1 < beta.size(); ++k) {
      if ((beta[k] - beta[k - 1]) * (beta[k + 1] - beta[k]) < 0) extrema.push_back(k);
    }
    const size_t first = extrema.empty() ? 0 : extrema.front();
    size_t second = 0;
    for (size_t e : extrema) {
      if (e > first && beta[e] * beta[first] < 0) {
        second = e;
        break;
      }
    }
    if (second) {
      const double decrement = std::log(std::abs(beta[first] / beta[second]));
      const double zeta = decrement / std::sqrt(kPi * kPi + decrement * decrement);
      const double wd = kPi / (kickTime[second] - kickTime[first]);
      m["dutch-roll-zeta"] = {zeta, fmt("sideslip %+.2f then %+.2f deg; damped frequency %.2f rad/s", beta[first], beta[second], wd)};
    } else {
      m["dutch-roll-zeta"] = {0.7, fmt("a lower bound: no overshoot within %.0f s of %.2f deg of sideslip",
                                       kKickWindowEnd - kKickRelease, beta.front())};
    }
  }
}

// How far a fit row lies from where a fit should put it, for the fitter: 0 at the centre of a two-sided
// band and 1 at its edge, growing as the square beyond it; for a one-sided limit, 0 a unit clear of it
// (a degree of alpha), 1 on it. A row with no value costs as much as five half-bands out.
double fitCost(double v, double lo, double hi) {
  if (std::isnan(v)) return 25;
  if (!std::isnan(lo) && !std::isnan(hi)) {
    const double u = (v - (lo + hi) / 2) / ((hi - lo) / 2);
    return u * u;
  }
  if (!std::isnan(lo)) {
    const double u = std::max(0.0, lo + 1 - v);
    return u * u;
  }
  if (!std::isnan(hi)) {
    const double u = std::max(0.0, v - (hi - 1));
    return u * u;
  }
  return 0;
}

// Coefficients for the airframe, one "property value" a line, '#' for comments: what the fitter
// hands a candidate.
std::vector<std::pair<std::string, double>> readCoefficients(const std::string& path) {
  std::ifstream in(path);
  if (!in) {
    std::fprintf(stderr, "cannot read %s\n", path.c_str());
    std::exit(2);
  }
  std::vector<std::pair<std::string, double>> c;
  std::string line;
  while (std::getline(in, line)) {
    if (line.empty() || line[0] == '#' || line == "\r") continue;
    char name[256];
    double value = 0;
    if (std::sscanf(line.c_str(), "%255s %lf", name, &value) != 2) {
      std::fprintf(stderr, "%s: not \"property value\": %s\n", path.c_str(), line.c_str());
      std::exit(2);
    }
    c.emplace_back(name, value);
  }
  return c;
}

int verdict(const char* what, bool ok, const std::string& detail) {
  std::printf("  %s  %s - %s\n", ok ? "pass" : "FAIL", what, detail.c_str());
  return ok ? 0 : 1;
}

// The instruments checked against answers the 737's own file gives, so that a number the scorer prints
// is the airframe's and not the instrument's. Always on the 737, whichever airframe flies.
int instruments() {
  Airframe::select("737");
  Airframe a;
  int failed = 0;
  // 737.xml: CDgear = 0.015 times the gear position. Down, up, down: a gear left in transit by one
  // measurement shows in the next.
  const Configuration gearDown{0, 0, true}, gearUp{0, 0, false};
  const double down = a.aero(10000, 0.5, 2, gearDown).cd, up = a.aero(10000, 0.5, 2, gearUp).cd,
               again = a.aero(10000, 0.5, 2, gearDown).cd;
  failed += verdict("a measurement puts the gear where it asks",
                    std::abs(down - up - 0.015) < 1e-5 && std::abs(down - again) < 1e-9,
                    fmt("gear drag %.5f, the file's 0.015; down twice %.5f and %.5f", down - up, down, again));
  // 737.xml: CDmach is 0 to Mach 0.79 and 0.023 at 1.10, linear between, whatever the lift: 20 counts at
  // 0.79 + 0.31 * 0.002 / 0.023.
  const Measured rise = dragRise(a);
  failed += verdict("the drag rise is where the 737's Mach table puts it", std::abs(rise.value - 0.81696) < 5e-4,
                    fmt("Mach %.4f, the table's 0.8170", rise.value));
  // Elevator trailing edge down pitches the nose down: the first excursion of alpha is negative.
  const PitchResponse r = a.pitchPulse(8000, 250, 2, 1, 12);
  const Measured sp = shortPeriod(a);
  failed += verdict("a nose-down pulse lowers alpha, and the response is damped",
                    r.ok && !r.alphaDeg.empty() && *std::min_element(r.alphaDeg.begin(), r.alphaDeg.end()) < -0.1 &&
                        sp.value > 0 && sp.value < 2,
                    fmt("damping %.2f; ", sp.value) + sp.note);
  std::printf("%s\n", failed ? "FAILED" : "PASSED");
  return failed ? 1 : 0;
}

// The instruments for pitch past the normal range, checked against what our A320's file says: the static
// moment is static, the elevator's power is the file's and fades where the file says, and the two ways
// of reading a short period agree where both can.
int pitchInstruments() {
  int failed = 0;
  const Configuration full = config("full")->surfaces;
  // At 1 g the alpha has no rate, so the alpha-rate damping cannot reach the static moment.
  Airframe::select("a320");
  double withDamping[2] = {};
  for (int k = 0; k < 2; ++k) {
    Airframe::setCoefficients({{"aero/fit/cm-alphadot", k ? -40.0 : 0.0}});
    Airframe a;
    withDamping[k] = a.pitchMomentAt(full, 15, kElevatorFullUpDeg, 0);
  }
  Airframe::setCoefficients({});
  failed += verdict("the static moment carries no alpha-rate damping",
                    std::abs(withDamping[1] - withDamping[0]) < 1e-4,
                    fmt("Cm %+.5f with none, %+.5f with -40 per rad, at 15 deg in CONF FULL", withDamping[0], withDamping[1]));

  // The elevator's power: the file's cm-de, and its lift, cl-de, acting at the reference point ahead of the
  // centre of gravity; times the tail's share, 1 below the fade's onset and less above it.
  Airframe a;
  const double cmDe = a.property("aero/fit/cm-de"), clDe = a.property("aero/fit/cl-de");
  const double fade = a.property("aero/fit/tail-fade"), from = a.property("aero/fit/tail-fade-from-deg");
  const double arm = (a.property("inertia/cg-x-in") - a.property("metrics/aero-rp-x-in")) / (12 * a.property("metrics/cbarw-ft"));
  for (double alpha : {6.0, 20.0}) {
    const double share = std::max(0.25, 1 - fade * 0.1 * std::max(0.0, alpha - from));
    const double expected = share * (cmDe + clDe * arm) * (-10 * kPi / 180);
    const double measured = a.pitchMomentAt(full, alpha, -10, 0) - a.pitchMomentAt(full, alpha, 0, 0);
    failed += verdict(alpha < from ? "10 deg of elevator moves the moment as the file says"
                                   : "and past the onset of the tail's fade, by the share the file leaves it",
                      std::abs(measured / expected - 1) < 0.02,
                      fmt("%+.4f against %+.4f at %.0f deg of alpha", measured, expected, alpha) +
                          fmt(", the tail's share %.3f", share));
  }

  // Equation error, which the CONF FULL rows read, and the extrema the clean row reads, on the 737's
  // clean pulse, which overshoots enough for both.
  Airframe::select("737");
  Airframe b;
  const PitchResponse r = b.pitchPulse(8000, 250, 2, 1, 12);
  const ShortPeriod byExtrema = shortPeriodOf(r, 12), byEquations = shortPeriodByEquationError(r, 6);
  failed += verdict("two readings of a short period agree",
                    r.ok && std::abs(byExtrema.zeta.value - byEquations.zeta.value) < 0.07 &&
                        std::abs(byExtrema.wn.value - byEquations.wn.value) < 0.06,
                    fmt("damping %.3f and %.3f, ", byExtrema.zeta.value, byEquations.zeta.value) +
                        fmt("natural frequency %.3f and %.3f rad/s", byExtrema.wn.value, byEquations.wn.value));
  std::printf("%s\n", failed ? "FAILED" : "PASSED");
  return failed ? 1 : 0;
}

}  // namespace

int main(int argc, char** argv) {
  std::string targetsDir = FLIGHT_TARGETS_DIR, out, onlyGroup;
  std::vector<std::string> skipGroups;
  bool check = false, fitRowsOnly = false;
  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    if (a == "--out" && i + 1 < argc) {
      out = argv[++i];
    } else if (a == "--targets" && i + 1 < argc) {
      targetsDir = argv[++i];
    } else if (a == "--airframe" && i + 1 < argc) {
      Airframe::select(argv[++i]);
    } else if (a == "--coefficients" && i + 1 < argc) {
      Airframe::setCoefficients(readCoefficients(argv[++i]));
    } else if (a == "--fit-rows") {
      fitRowsOnly = true;
    } else if (a == "--only-group" && i + 1 < argc) {
      onlyGroup = argv[++i];
    } else if (a == "--skip-group" && i + 1 < argc) {
      skipGroups.push_back(argv[++i]);
    } else if (a == "--check") {
      check = true;
    } else if (a == "--instruments") {
      return instruments();
    } else if (a == "--instruments-pitch") {
      return pitchInstruments();
    } else {
      std::printf(
          "airframe_score [--airframe 737|a320] [--coefficients file] [--targets dir] [--out score.csv]\n"
          "               [--check] [--fit-rows] [--only-group G | --skip-group G ...]\n"
          "               [--instruments | --instruments-pitch]\n");
      return 2;
    }
  }
  const auto rows = readCsv(targetsDir + "/a320.csv");
  const Speeds speeds(targetsDir + "/a320-speeds.csv");
  // The rows this run is about: every row, or the fit rows, of a group or of every group but those
  // skipped. The fitter fits the aerodynamics, the engines and what lies past the stall apart, each on
  // its own rows.
  auto wanted = [&](const std::map<std::string, std::string>& row) {
    const std::string& group = row.at("group");
    return (!fitRowsOnly || (row.at("kind") == "target" && row.at("use") == "fit")) &&
           (onlyGroup.empty() || group == onlyGroup) &&
           std::find(skipGroups.begin(), skipGroups.end(), group) == skipGroups.end();
  };

  Airframe bare;
  const double weight = bare.state().weightLbs, tonnes = weight / kLbsPerTonne, cg = bare.state().cgPercentMac;
  // A row's weight: its own, in tonnes, or the airframe as loaded. A row with a speed reference needs one.
  auto rowLbs = [&](const std::map<std::string, std::string>& row) {
    const double t = number(row.at("weight"));
    return std::isnan(t) ? weight : t * kLbsPerTonne;
  };
  Measures m;
  Bare b(bare, speeds);
  bool flown = false;  // whether any row wanted needs the circuit flown
  for (const auto& row : rows) {
    const std::string& id = row.at("id");
    if (!wanted(row)) continue;
    if (row.at("kind") != "pending" && Bare::measures(id, family(id))) {
      m[id] = b.measure(id, family(id), row.at("measure"), row.at("condition"), row.at("unit"), rowLbs(row));
    } else if (fitRowsOnly) {
      // the fitter evaluates thousands of candidates: a fit row that needs the circuit flown is a change
      // of plan, not something to slip in
      std::fprintf(stderr, "a320.csv: fit row %s is not measured on the bare airframe\n", id.c_str());
      return 2;
    } else if (row.at("kind") != "pending") {
      flown = true;
    }
  }
  if (flown) measureFlown(m);

  std::printf("A320 targets (%s/a320.csv) against JSBSim %s's %s\n", targetsDir.c_str(), JSBSIM_COMMIT,
              Airframe::model());
  std::printf("loaded to %.0f lb (%.1f t), CG %.1f %% MAC, and flown so; the bare airframe is measured at each row's weight\n\n",
              weight, tonnes, cg);
  std::printf("%-25s %-7s %-5s %5s %-21s %9s  %-15s %s\n", "id", "kind", "use", "t", "band", "measured", "verdict",
              "note");

  FILE* csv = out.empty() ? nullptr : std::fopen(out.c_str(), "w");
  if (!out.empty() && !csv) {
    std::printf("cannot write %s\n", out.c_str());
    return 2;
  }
  if (csv) std::fprintf(csv, "id,kind,use,weight,lo,hi,unit,measured,verdict,note\n");

  int counted = 0, inside = 0, fitRows = 0, fitInside = 0, unmeasured = 0;
  double cost = 0;
  for (const auto& row : rows) {
    if (!wanted(row)) continue;
    const std::string& id = row.at("id");
    const std::string& kind = row.at("kind");
    const std::string& unit = row.at("unit");
    const std::string t = row.at("weight");
    double lo = number(row.at("lo")), hi = number(row.at("hi"));
    if (!row.at("ref").empty()) {
      if (t.empty()) {
        std::fprintf(stderr, "a320.csv: %s has a speed reference and no weight\n", id.c_str());
        return 2;
      }
      const double base = speeds.at(row.at("ref"), number(t));
      lo += base;
      hi += base;
    }
    const char* digits = unit == "Mach" ? "%.3f" : "%.4g";
    const std::string band = (std::isnan(lo) ? std::string("") : fmt(digits, lo)) + ".." +
                             (std::isnan(hi) ? std::string("") : fmt(digits, hi)) + " " + unit;
    const auto found = m.find(id);
    std::string verdict, note, value = "-";
    if (kind == "pending") {
      verdict = "pending";
    } else if (found == m.end()) {
      verdict = "NOT MEASURED";
      ++unmeasured;
    } else {
      const double v = found->second.value;
      note = found->second.note;
      value = std::isnan(v) ? "none" : fmt(unit == "Mach" ? "%.3f" : "%.2f", v);
      const bool in = !std::isnan(v) && (std::isnan(lo) || v >= lo) && (std::isnan(hi) || v <= hi);
      if (in) {
        verdict = "inside";
      } else if (std::isnan(v)) {
        verdict = "outside";
      } else {
        verdict = fmt(unit == "Mach" ? "outside %+.3f" : "outside %+.1f", !std::isnan(lo) && v < lo ? v - lo : v - hi);
      }
      if (kind == "target") {
        ++counted;
        inside += in;
        if (row.at("use") == "fit") {
          ++fitRows;
          fitInside += in;
          cost += fitCost(v, lo, hi);
        }
      } else {
        verdict = "(" + verdict + ")";
      }
    }
    std::printf("%-25s %-7s %-5s %5s %-21s %9s  %-15s %s\n", id.c_str(), kind.c_str(), row.at("use").c_str(), t.c_str(),
                band.c_str(), value.c_str(), verdict.c_str(), note.c_str());
    if (csv) {
      std::fprintf(csv, "%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n", id.c_str(), kind.c_str(), row.at("use").c_str(), t.c_str(),
                   std::isnan(lo) ? "" : fmt(unit == "Mach" ? "%.3f" : "%.2f", lo).c_str(),
                   std::isnan(hi) ? "" : fmt(unit == "Mach" ? "%.3f" : "%.2f", hi).c_str(), unit.c_str(), value.c_str(),
                   verdict.c_str(), note.c_str());
    }
  }
  if (csv) std::fclose(csv);
  if (fitRowsOnly) {
    // and once more for the fitter to read: one value a line, at full precision
    std::printf("\n");
    for (const auto& row : rows) {
      if (!wanted(row)) continue;
      const auto found = m.find(row.at("id"));
      std::printf("value %s %.17g\n", row.at("id").c_str(), found == m.end() ? kNaN : found->second.value);
    }
    std::printf("fit rows: inside %d of %d\ncost %.17g\n", fitInside, fitRows, cost);
    return unmeasured ? 1 : 0;
  }
  std::printf("\n%s: inside %d of %d targets (%d of %d fit rows, %d of %d held-out rows); context rows are not counted\n",
              Airframe::model(), inside, counted, fitInside, fitRows, inside - fitInside, counted - fitRows);
  if (unmeasured) std::printf("%d rows were not measured\n", unmeasured);
  return check && unmeasured ? 1 : 0;
}
