// The airframe scored against the A320's targets (flight/targets/a320.csv): where the stand-in stands,
// so that a fitted A320 has numbers to beat. GPLv3.
//
//   airframe_score                    the table, scored
//   airframe_score --out score.csv    and written out
//   airframe_score --check            exit 1 unless every target and context row was measured
//
// It scores; it does not gate. Outside a band is a fact about the airframe, not a failed build.
//
// Two kinds of measurement. The bare airframe, with no computers: JSBSim sweeps its lift curve and
// trims it (airframe.h). The airframe flown: one circuit through the A32NX laws, with a full-stick roll
// added in cruise, timed as the gate's circuit is.

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
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
  double flapDeg;
  bool gearDown;
};

// The airframe on its own: lift curve peaks and trims, at the weight it was loaded at.
void measureBare(const Speeds& speeds, Airframe& a, Measures& m) {
  const double weight = a.state().weightLbs, tonnes = weight / kLbsPerTonne, area = a.wingAreaFt2();
  // flap surface angles per configuration; CONF 1 is slats alone, which the 737's tables do not see
  const Config configs[] = {{"clean", 0, false}, {"conf1", 0, false}, {"conf1f", 10, false},
                            {"conf2", 15, false}, {"conf3", 20, true},  {"full", 40, true}};
  for (const Config& c : configs) {
    const LiftPeak p = a.liftPeak(c.flapDeg, c.gearDown);
    const double vs1g = std::sqrt(2 * weight / (kRho0 * area * p.clMax)) / kFpsPerKt;
    m["vs1g-" + c.name] = {vs1g, fmt("CL max %.2f, elevator neutral", p.clMax)};
    m["stall-alpha-" + c.name] = {p.alphaDeg, fmt("CL max %.2f", p.clMax)};
  }
  for (const Config& c : {Config{"clean", 0, false}, Config{"conf2", 15, false}, Config{"full", 40, true}}) {
    const double vls = speeds.at("vls:" + c.name, tonnes);
    const TrimPoint t = a.trim(1000, vls, 0, 0, c.flapDeg, c.gearDown);
    m["vls-alpha-" + c.name] = t.ok ? Measured{t.alphaDeg, fmt("at the A320's VLS, %.0f kt", vls)}
                                    : Measured{kNaN, fmt("no trim at the A320's VLS, %.0f kt", vls)};
  }
  const double vapp = speeds.at("vls:full", tonnes) + 5;
  const TrimPoint app = a.trim(1000, vapp, 0, -3, 40, true);
  m["app-pitch-full"] = app.ok ? Measured{app.pitchDeg, fmt("%.0f kt; alpha %.1f; THS %.1f deg", vapp, app.alphaDeg, app.thsDeg)}
                               : Measured{kNaN, fmt("no trim at %.0f kt", vapp)};
  const TrimPoint cruise = a.trim(35000, 0, 0.78, 0, 0, false);
  m["cruise-pitch"] = cruise.ok ? Measured{cruise.pitchDeg, fmt("alpha %.1f; THS %.1f deg", cruise.alphaDeg, cruise.thsDeg)}
                                : Measured{kNaN, "no trim"};
  m["cruise-tla"] = cruise.ok ? Measured{cruise.tla, ""} : Measured{kNaN, "no trim"};
}

// The airframe flown through the laws: the gate's circuit, to the approach, with one extra roll.
void measureFlown(Measures& m) {
  World world;
  Efcs& efcs = Efcs::instance();
  Phase last = world.phase();
  double brakeRelease = -1, liftoff = -1, cruise = -1, climbFrom[2] = {-1, 0}, descentFrom[2] = {-1, 0};
  std::vector<double> rollTime, roll, kickTime, beta;

  const long long ticks = std::llround(13 * 60 / kDt);
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

}  // namespace

int main(int argc, char** argv) {
  std::string targetsDir = FLIGHT_TARGETS_DIR, out;
  bool check = false;
  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    if (a == "--out" && i + 1 < argc) {
      out = argv[++i];
    } else if (a == "--targets" && i + 1 < argc) {
      targetsDir = argv[++i];
    } else if (a == "--check") {
      check = true;
    } else {
      std::printf("airframe_score [--targets dir] [--out score.csv] [--check]\n");
      return 2;
    }
  }
  const auto rows = readCsv(targetsDir + "/a320.csv");
  const Speeds speeds(targetsDir + "/a320-speeds.csv");

  Airframe bare;
  const double weight = bare.state().weightLbs, tonnes = weight / kLbsPerTonne, cg = bare.state().cgPercentMac;
  Measures m;
  measureBare(speeds, bare, m);
  measureFlown(m);

  std::printf("A320 targets (%s/a320.csv) against JSBSim %s's %s at %.0f lb (%.1f t), CG %.1f %% MAC\n\n",
              targetsDir.c_str(), JSBSIM_COMMIT, Airframe::model(), weight, tonnes, cg);
  std::printf("%-19s %-7s %-5s %-21s %9s  %-15s %s\n", "id", "kind", "use", "band", "measured", "verdict", "note");

  FILE* csv = out.empty() ? nullptr : std::fopen(out.c_str(), "w");
  if (!out.empty() && !csv) {
    std::printf("cannot write %s\n", out.c_str());
    return 2;
  }
  if (csv) std::fprintf(csv, "id,kind,use,lo,hi,unit,measured,verdict,note\n");

  int counted = 0, inside = 0, fitRows = 0, fitInside = 0, unmeasured = 0;
  for (const auto& row : rows) {
    const std::string& id = row.at("id");
    const std::string& kind = row.at("kind");
    double lo = number(row.at("lo")), hi = number(row.at("hi"));
    if (!row.at("ref").empty()) {
      const double base = speeds.at(row.at("ref"), tonnes);
      lo += base;
      hi += base;
    }
    const std::string band = (std::isnan(lo) ? std::string("") : fmt("%.4g", lo)) + ".." +
                             (std::isnan(hi) ? std::string("") : fmt("%.4g", hi)) + " " + row.at("unit");
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
      value = std::isnan(v) ? "none" : fmt("%.2f", v);
      const bool in = !std::isnan(v) && (std::isnan(lo) || v >= lo) && (std::isnan(hi) || v <= hi);
      if (in) {
        verdict = "inside";
      } else if (std::isnan(v)) {
        verdict = "outside";
      } else {
        verdict = fmt("outside %+.1f", !std::isnan(lo) && v < lo ? v - lo : v - hi);
      }
      if (kind == "target") {
        ++counted;
        inside += in;
        if (row.at("use") == "fit") {
          ++fitRows;
          fitInside += in;
        }
      } else {
        verdict = "(" + verdict + ")";
      }
    }
    std::printf("%-19s %-7s %-5s %-21s %9s  %-15s %s\n", id.c_str(), kind.c_str(), row.at("use").c_str(), band.c_str(),
                value.c_str(), verdict.c_str(), note.c_str());
    if (csv) {
      std::fprintf(csv, "%s,%s,%s,%s,%s,%s,%s,%s,%s\n", id.c_str(), kind.c_str(), row.at("use").c_str(),
                   std::isnan(lo) ? "" : fmt("%.2f", lo).c_str(), std::isnan(hi) ? "" : fmt("%.2f", hi).c_str(),
                   row.at("unit").c_str(), value.c_str(), verdict.c_str(), note.c_str());
    }
  }
  if (csv) std::fclose(csv);
  std::printf("\n%s: inside %d of %d targets (%d of %d fit rows, %d of %d held-out rows); context rows are not counted\n",
              Airframe::model(), inside, counted, fitInside, fitRows, inside - fitInside, counted - fitRows);
  if (unmeasured) std::printf("%d rows were not measured\n", unmeasured);
  return check && unmeasured ? 1 : 0;
}
