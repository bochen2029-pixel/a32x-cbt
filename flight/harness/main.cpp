// The law harness: ELAC 1-2, SEC 1-3, FAC 1-2 and FCDC 1-2 from A32NX, unmodified, stepped at 50 Hz
// in a world whose airframe is JSBSim flying our fitted A320, or the 737 (world.h, airframe.h). GPLv3.
//
//   law_harness --minutes 30 --gate         the P6 gate: thirty simulated minutes, all of it checked
//   law_harness --minutes 3 --check-determinism
//   law_harness --minutes 18 --check-replay  the scripted crew recorded, then replayed as an outside crew
//   law_harness --minutes 6 --expect normal-law
//   law_harness --minutes 30 --trace run.csv
//
// It steps the world through the flight core (core.h), the same loop the browser's module runs.
//
// Every tick, every word on every computer's output bus and every analogue output is checked for
// NaN and infinity. Laws are read the way the aircraft reads them: from the FCDC's EFCS status word.

#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#ifdef _WIN32
#include <process.h>
#else
#include <unistd.h>
#endif

#include "Arinc429Utils.h"
#include "core.h"
#include "efcs.h"
#include "laws.h"
#include "world.h"

#ifdef _WIN32
#define popen _popen
#define pclose _pclose
#endif

namespace {

constexpr double kDt = 0.02;  // 50 Hz, the rate the computers are built for

// The RUD TRIM test, in seconds after the start of cruise: after the doublet and before the turn, the
// switch held left for six seconds, the stick neutral until the hands come back, then RESET.
constexpr double kTrimFrom = 26, kTrimTo = 32, kTrimHandsOffTo = 40;

// --- the non-finite scan -------------------------------------------------------------------------
// Every output bus is nothing but ARINC 429 words and every analogue block nothing but doubles, so a
// scan of the whole set needs no field list to fall out of date. The asserts hold that true.
template <typename Bus>
int badWords(const Bus& bus) {
  static_assert(sizeof(Bus) % sizeof(base_arinc_429) == 0, "a bus is whole ARINC words");
  const auto* w = reinterpret_cast<const base_arinc_429*>(&bus);
  int bad = 0;
  for (size_t k = 0; k < sizeof(Bus) / sizeof(base_arinc_429); ++k) bad += !std::isfinite(w[k].Data);
  return bad;
}

template <typename Analog>
int badDoubles(const Analog& a) {
  static_assert(sizeof(Analog) % sizeof(double) == 0, "an analogue block is whole doubles");
  const auto* d = reinterpret_cast<const double*>(&a);
  int bad = 0;
  for (size_t k = 0; k < sizeof(Analog) / sizeof(double); ++k) bad += !std::isfinite(d[k]);
  return bad;
}

struct Scan {
  long long bad = 0;
  double firstBadAt = -1;
  std::string firstBadWhere;

  void check(const Transmitted& t, double time) {
    auto note = [&](int n, const char* where, int unit) {
      if (n) {
        bad += n;
        if (firstBadAt < 0) {
          firstBadAt = time;
          firstBadWhere = std::string(where) + " " + std::to_string(unit + 1);
        }
      }
    };
    for (int i = 0; i < 2; ++i) note(badWords(t.elacBus[i]) + badDoubles(t.elacAnalog[i]), "ELAC", i);
    for (int i = 0; i < 3; ++i) note(badWords(t.secBus[i]) + badDoubles(t.secAnalog[i]), "SEC", i);
    for (int i = 0; i < 2; ++i) note(badWords(t.facBus[i]) + badDoubles(t.facAnalog[i]), "FAC", i);
    for (int i = 0; i < 2; ++i) note(badWords(t.fcdcBus[i]), "FCDC", i);
  }

  static long long valuesPerTick() {
    return 2 * (sizeof(base_elac_out_bus) / 8 + sizeof(base_elac_analog_outputs) / 8) +
           3 * (sizeof(base_sec_out_bus) / 8 + sizeof(base_sec_analog_outputs) / 8) +
           2 * (sizeof(base_fac_bus) / 8 + sizeof(base_fac_analog_outputs) / 8) + 2 * (sizeof(base_fcdc_bus) / 8);
  }
};

// FNV-1a over everything the computers transmitted, every tick: the run's fingerprint.
struct Digest {
  uint64_t h = 1469598103934665603ull;
  template <typename T>
  void add(const T& v) {
    const auto* b = reinterpret_cast<const unsigned char*>(&v);
    for (size_t k = 0; k < sizeof(T); ++k) {
      h ^= b[k];
      h *= 1099511628211ull;
    }
  }
  void add(const Transmitted& t) {
    for (int i = 0; i < 2; ++i) add(t.elacBus[i]), add(t.elacAnalog[i]), add(t.elacDiscrete[i]);
    for (int i = 0; i < 3; ++i) add(t.secBus[i]), add(t.secAnalog[i]), add(t.secDiscrete[i]);
    for (int i = 0; i < 2; ++i) add(t.facBus[i]), add(t.facAnalog[i]), add(t.facDiscrete[i]);
    for (int i = 0; i < 2; ++i) add(t.fcdcBus[i]), add(t.fcdcDiscrete[i]);
  }
};

std::string unhealthyList(const Transmitted& t) {
  std::string s;
  for (int i = 0; i < 2; ++i) if (!t.elacDiscrete[i].digital_output_validated) s += " ELAC" + std::to_string(i + 1);
  for (int i = 0; i < 3; ++i) if (t.secDiscrete[i].sec_failed) s += " SEC" + std::to_string(i + 1);
  for (int i = 0; i < 2; ++i) if (!t.facDiscrete[i].fac_healthy) s += " FAC" + std::to_string(i + 1);
  for (int i = 0; i < 2; ++i) if (!t.fcdcDiscrete[i].fcdcValid) s += " FCDC" + std::to_string(i + 1);
  return s.empty() ? " none" : s;
}

struct Range {
  double lo = 1e300, hi = -1e300;
  void add(double v) {
    lo = std::min(lo, v);
    hi = std::max(hi, v);
  }
};

struct Options {
  double minutes = 30;
  bool gate = false;
  bool digestOnly = false;
  bool determinism = false;
  bool replayCheck = false;
  double failAdrAt = -1;
  std::string fail;   // the instructor's failures (core.h, fail=), folded into the scenario
  std::string expect;
  std::string trace;
  std::string record, replay;  // a crew recording to write from the scripted crew, or to fly from
  std::string scenario;        // where the flight starts (core.h, flight_start_scenario); empty: the runway
};

// The worst a measure reached, and the height above the threshold (or the distance past it) where.
struct Worst {
  double value = NAN, at = NAN;
  void add(double v, double where) {
    if (std::isnan(value) || v > value) {
      value = v;
      at = where;
    }
  }
};

struct Results {
  long long ticks = 0;
  double wallSeconds = 0;
  Scan scan;
  uint64_t digest = 0;
  bool worldFinite = true;
  double worldBadAt = -1;
  // health
  double healthyFrom = -1;
  long long unhealthyTicksAfterUp = 0;
  std::string unhealthyAtEnd;
  bool healthyBeforeSwitches = false;
  // laws in flight, from FCDC 1
  long long flightTicks = 0;
  std::map<std::string, long long> pitchLawTicks, lateralLawTicks;
  double firstNonNormalAt = -1;
  std::string firstNonNormal;
  // laws in settled flight once an injected failure has had five seconds to be noticed
  long long afterFailureTicks = 0;
  std::map<std::string, long long> afterFailurePitchLaw;
  // after the first failure, from five seconds on, the laws in settled flight: before the gear is down,
  // and once it has been down and locked for three seconds
  double failAt = -1;
  long long beforeGearTicks = 0, gearDownTicks = 0;
  std::map<std::string, long long> beforeGearPitch, beforeGearLateral, gearDownPitch;
  // what moved
  Range elevator, ths, aileron, spoiler, pitch, bank, load, altitude;
  Range checkPullElevator, checkPushElevator, checkLeftAileron, checkRightAileron;
  Range doubletPullQ, doubletPushQ, doubletPullN;
  int touchdowns = 0;
  double crashedAt = -1;
  std::map<std::string, double> firstEntered;
  // each touchdown: the sink rate in the last airborne tick, the attitude and speed at contact, and
  // the peak load factor in the two seconds after
  struct Touchdown {
    double at = 0, sinkFpm = 0, pitch = 0, bank = 0, cas = 0, peakG = 0;
  };
  std::vector<Touchdown> landings;
  // steady flight — no pitch rate, one g, wings level: where the elevator rests, and where the THS sits
  long long steadyTicks = 0;
  double steadyElevatorSum = 0;
  Range ths1g;
  // the cruise pedal kick: the sideslip it raised, and what was left of it four to seven seconds after
  double kickBeta = 0, kickResidualR = -1, kickResidualBeta = -1;
  // the RUD TRIM test, at the end of its hands-off window: what the engaged FAC ordered (+ left) and read
  // back, the rudder (+ left) and the sideslip (+ nose left of the flight path); then the trim after RESET
  double trimOrder = NAN, trimReadBack = NAN, trimRudder = NAN, trimBeta = NAN, trimAfterReset = NAN;
  // an ILS approach: the stabilised window from 1,000 ft above the threshold to 50 ft before the first
  // touchdown, each measure's worst and the height where; then the touchdown and rollout on the runway
  bool ilsApproach = false;
  long long ilsTicks = 0;
  Worst ilsLocDots, ilsGsDots, ilsSinkFpm, ilsBankDeg, ilsFastKn, ilsSlowKn, ilsLoadDev;
  double ilsUnconfiguredAtFt = NAN;
  double touchdownPastM = NAN, touchdownOffM = NAN;  // from the threshold, and from the centreline (+ right)
  double landingRunwayHalfWidthM = NAN;
  Worst rolloutOffM;                                  // where: metres past the threshold
};

// A crew recording: a line of input values per tick, the columns named by the first line in the flight
// core's order (core.h), every value written so that it reads back as the same double. A run recorded
// from the scripted crew and replayed through the core as an outside crew must give the same bytes.
class Recording {
 public:
  bool open(const std::string& path, bool write) {
    f_ = std::fopen(path.c_str(), write ? "w" : "r");
    if (!f_) return fail("cannot " + std::string(write ? "write " : "read ") + path);
    std::string names;
    for (const char* n : FlightCore::inputNames()) names += (names.empty() ? "" : ",") + std::string(n);
    if (write) {
      std::fprintf(f_, "%s\n", names.c_str());
      return true;
    }
    char line[4096];
    if (!std::fgets(line, sizeof line, f_) || std::string(line, std::strcspn(line, "\r\n")) != names) {
      return fail(path + ": its columns are not this core's inputs (" + names + ")");
    }
    return true;
  }
  void write(const std::vector<double>& v) {
    for (size_t k = 0; k < v.size(); ++k) std::fprintf(f_, k ? ",%.17g" : "%.17g", v[k]);
    std::fprintf(f_, "\n");
  }
  bool read(std::vector<double>& v) {
    char line[4096];
    if (!std::fgets(line, sizeof line, f_)) return fail("the recording ended before the run did");
    char* p = line;
    for (double& x : v) {
      char* end = nullptr;
      x = std::strtod(p, &end);
      if (end == p) return fail("a malformed line in the recording");
      p = *end == ',' ? end + 1 : end;
    }
    return true;
  }
  ~Recording() {
    if (f_) std::fclose(f_);
  }
  const std::string& error() const { return error_; }

 private:
  bool fail(const std::string& why) {
    if (error_.empty()) error_ = why;
    return false;
  }
  FILE* f_ = nullptr;
  std::string error_;
};

// The first of the instructor's failures, in seconds from the start; -1 if none.
double earliestFailure(const Failures& f) {
  double at = -1;
  auto take = [&at](const double* times, int n) {
    for (int k = 0; k < n; ++k) {
      if (times[k] >= 0 && (at < 0 || times[k] < at)) at = times[k];
    }
  };
  take(f.adr, 3);
  take(f.ir, 3);
  take(f.hyd, 3);
  take(f.elac, 2);
  take(f.sec, 3);
  return at;
}

Results run(const Options& opt, FILE* trace) {
  Recording recording;
  const bool replaying = !opt.replay.empty();
  if (replaying || !opt.record.empty()) {
    if (!recording.open(replaying ? opt.replay : opt.record, !replaying)) {
      std::printf("%s\n", recording.error().c_str());
      std::exit(2);
    }
  }
  WorldStart worldStart;
  std::string why;
  if (!FlightCore::parseScenario(opt.scenario.c_str(), worldStart, why)) {
    std::printf("--scenario: %s\n", why.c_str());
    std::exit(2);
  }
  FlightCore core(!replaying, worldStart);
  World& world = core.world();
  if (opt.failAdrAt >= 0) {
    for (double& at : world.failures.adr) at = opt.failAdrAt;
  }
  if (opt.expect == "rudder-trim") world.trimTest = {kTrimFrom, kTrimTo, kTrimHandsOffTo, +1};
  Efcs& efcs = core.efcs();
  Results r;
  r.failAt = earliestFailure(world.failures);
  double gearDownAt = -1;
  Digest digest;

  const long long ticks = static_cast<long long>(std::llround(opt.minutes * 60 / kDt));
  bool wasOnGround = true;
  double lastAirborneVs = 0;
  Phase lastPhase = world.phase();
  double liftoffAt = -1;
  double cruiseAt = -1;
  r.firstEntered[phaseName(world.phase())] = 0;

  if (trace) {
    std::fprintf(trace,
                 "t,phase,alt_ft,tas_kn,pitch_deg,bank_deg,heading_deg,nz_g,q_deg_s,stick_pitch,stick_roll,"
                 "elev_l,elev_r,ths,ail_l,ail_r,spoiler3_l,spoiler3_r,pitch_law,lateral_law,healthy,"
                 "cas_kn,ra_ft,vs_fpm,alpha_deg,beta_deg,gamma_deg,r_deg_s,pedals,rudder,tla,flap_deg\n");
  }

  const auto start = std::chrono::steady_clock::now();
  for (long long k = 0; k < ticks; ++k) {
    if (replaying && !recording.read(core.inputs())) {
      std::printf("%s, at %.2f s\n", recording.error().c_str(), world.time());
      std::exit(2);
    }
    double t = 0;
    bool healthy = false, settledInFlight = false;
    PitchLawState pl = PitchLawState::None;
    LateralLawState ll = LateralLawState::None;

    // The computers have acted and the world has not yet moved: what they transmitted, and the world
    // they acted on.
    core.step([&] {
      const Transmitted& tx = efcs.transmitted();
      t = world.time();

      r.scan.check(tx, t);
      digest.add(tx);

      // health: the switches go on at 1 s; give the slowest self-test 20 s
      healthy = allHealthy(tx);
      if (t < 1.0 && healthy) r.healthyBeforeSwitches = true;
      if (healthy && r.healthyFrom < 0) r.healthyFrom = t;
      if (t > 21 && !healthy) ++r.unhealthyTicksAfterUp;

      // laws, in flight: from five seconds after liftoff until the flare
      pl = pitchLaw(tx.fcdcBus[0].efcs_status_word_1);
      ll = lateralLaw(tx.fcdcBus[0].efcs_status_word_1);
      if (wasOnGround && !world.onGround()) liftoffAt = t;
      if (!wasOnGround && world.onGround()) {
        ++r.touchdowns;
        r.landings.push_back({t, lastAirborneVs, world.pitchDeg(), world.rollDeg(), world.casKn(), world.loadFactor()});
        if (world.ilsApproach() && r.landings.size() == 1) {
          const IlsReading ir = world.ils();
          r.touchdownPastM = -ir.alongM;
          r.touchdownOffM = ir.rightM;
          r.landingRunwayHalfWidthM = world.runway().widthM / 2;
        }
      }
      wasOnGround = world.onGround();
      if (!world.onGround()) lastAirborneVs = world.verticalSpeedFpm();
      settledInFlight = !world.onGround() && liftoffAt >= 0 && t - liftoffAt > 5 && world.phase() != Phase::Flare;
      if (settledInFlight) {
        ++r.flightTicks;
        ++r.pitchLawTicks[name(pl)];
        ++r.lateralLawTicks[name(ll)];
        if ((pl != PitchLawState::Normal || ll != LateralLawState::Normal) && r.firstNonNormalAt < 0) {
          r.firstNonNormalAt = t;
          r.firstNonNormal = std::string("pitch ") + name(pl) + ", lateral " + name(ll) + " in " + phaseName(world.phase());
        }
        if (r.failAt >= 0 && t > r.failAt + 5) {
          ++r.afterFailureTicks;
          ++r.afterFailurePitchLaw[name(pl)];
          if (!r.landings.empty()) {
            // after the first landing the laws are no longer the failure's approach
          } else if (!world.crew.gearDown && world.crew.flapLever < 3 && !world.noseGearDownlocked()) {  // not yet configuring to land
            gearDownAt = -1;
            ++r.beforeGearTicks;
            ++r.beforeGearPitch[name(pl)];
            ++r.beforeGearLateral[name(ll)];
          } else if (world.noseGearDownlocked()) {
            if (gearDownAt < 0) gearDownAt = t;
            if (t - gearDownAt > 3) {
              ++r.gearDownTicks;
              ++r.gearDownPitch[name(pl)];
            }
          }
        }
      }
    });
    if (!opt.record.empty()) recording.write(core.inputs());

    if (world.ilsApproach()) {
      r.ilsApproach = true;
      const IlsReading ir = world.ils();
      const double ft = ir.heightM / 0.3048;
      if (r.landings.empty() && !world.onGround() && ft <= 1000 && ft >= 50) {
        const double vapp = World::approachSpeedKn();
        ++r.ilsTicks;
        r.ilsLocDots.add(std::abs(ir.locDots), ft);
        r.ilsGsDots.add(std::abs(ir.gsDots), ft);
        r.ilsSinkFpm.add(-world.verticalSpeedFpm(), ft);
        r.ilsBankDeg.add(std::abs(world.rollDeg()), ft);
        r.ilsLoadDev.add(std::abs(world.loadFactor() - 1), ft);
        r.ilsFastKn.add(world.casKn() - vapp, ft);
        r.ilsSlowKn.add(vapp - world.casKn(), ft);
        const bool configured = world.crew.flapLever == 4 && world.flapDeg() > 39.5 &&
                                world.airframeState().gearPosition >= 0.999;
        if (!configured && std::isnan(r.ilsUnconfiguredAtFt)) r.ilsUnconfiguredAtFt = ft;
      }
      if (!r.landings.empty() && world.groundSpeedKn() > 1) r.rolloutOffM.add(std::abs(ir.rightM), -ir.alongM);
    }

    const Transmitted& tx = efcs.transmitted();
    const Surfaces& s = world.surfaces;
    const double state[] = {world.altitudeFt(), world.tasKn(), world.pitchDeg(), world.rollDeg(), world.loadFactor(),
                            world.headingDeg(), s.elevator[0], s.elevator[1], s.ths, s.aileron[0], s.aileron[1]};
    for (double v : state) {
      if (!std::isfinite(v) && r.worldFinite) {
        r.worldFinite = false;
        r.worldBadAt = t;
      }
    }

    if (world.phase() != lastPhase) {
      lastPhase = world.phase();
      if (!r.firstEntered.count(phaseName(lastPhase))) r.firstEntered[phaseName(lastPhase)] = world.time();
      if (lastPhase == Phase::Cruise && cruiseAt < 0) cruiseAt = world.time();
    }

    r.elevator.add((s.elevator[0] + s.elevator[1]) / 2);
    r.ths.add(s.ths);
    r.aileron.add(s.aileron[0]);
    r.spoiler.add(s.spoiler[0][2]);
    r.pitch.add(world.pitchDeg());
    r.bank.add(world.rollDeg());
    r.load.add(world.loadFactor());
    r.altitude.add(world.altitudeFt());
    if (!r.landings.empty() && world.time() - r.landings.back().at <= 2) {
      r.landings.back().peakG = std::max(r.landings.back().peakG, world.loadFactor());
    }

    // the ground check legs: pull, push, left, right, three seconds each from 21 s
    const double gc = r.firstEntered.count("ground-check") ? world.time() - r.firstEntered["ground-check"] : -1;
    if (world.phase() == Phase::GroundCheck) {
      if (gc > 2 && gc < 3) r.checkPullElevator.add(s.elevator[0]);
      if (gc > 5 && gc < 6) r.checkPushElevator.add(s.elevator[0]);
      if (gc > 8 && gc < 9) r.checkLeftAileron.add(s.aileron[0] - s.aileron[1]);
      if (gc > 11 && gc < 12) r.checkRightAileron.add(s.aileron[0] - s.aileron[1]);
    }
    // the cruise doublet: pull 0.5 at +20 s for 2 s, push at +22 s for 2 s
    if (cruiseAt >= 0 && world.phase() == Phase::Cruise) {
      const double c = world.time() - cruiseAt;
      if (c > 20 && c < 22.5) r.doubletPullQ.add(world.pitchRateDegS()), r.doubletPullN.add(world.loadFactor());
      if (c > 22 && c < 24.5) r.doubletPushQ.add(world.pitchRateDegS());
      // the pedal kick: 0.3 of left pedal from +150 s to +153 s, the steep turn from +160 s
      if (c > 150 && c < 157) r.kickBeta = std::max(r.kickBeta, std::abs(world.betaDeg()));
      if (c > 157 && c < 160) {
        r.kickResidualR = std::max(r.kickResidualR, std::abs(world.yawRateDegS()));
        r.kickResidualBeta = std::max(r.kickResidualBeta, std::abs(world.betaDeg()));
      }
      if (world.trimTest.direction != 0) {
        const int f = tx.facDiscrete[0].rudder_trim_engaged ? 0 : 1;
        if (c < kTrimHandsOffTo) {  // the last values written are the window's end
          r.trimOrder = tx.facAnalog[f].rudder_trim_order_deg;
          r.trimReadBack = tx.facBus[f].rudder_trim_pos_deg.Data;
          r.trimRudder = s.rudder;
          r.trimBeta = world.betaDeg();
        }
        if (c < kTrimHandsOffTo + 15) r.trimAfterReset = s.rudderTrim;
      }
    }

    if (settledInFlight && std::abs(world.pitchRateDegS()) < 0.2 && std::abs(world.loadFactor() - 1) < 0.03 &&
        std::abs(world.rollDeg()) < 3) {
      ++r.steadyTicks;
      r.steadyElevatorSum += std::abs((s.elevator[0] + s.elevator[1]) / 2);
      r.ths1g.add(s.ths);
    }

    if (trace && k % 25 == 0) {
      std::fprintf(trace, "%.2f,%s,%.1f,%.1f,%.2f,%.2f,%.1f,%.3f,%.2f,%.3f,%.3f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%s,%s,%d,",
                   world.time(), phaseName(world.phase()), world.altitudeFt(), world.tasKn(), world.pitchDeg(),
                   world.rollDeg(), world.headingDeg(), world.loadFactor(), world.pitchRateDegS(), world.crew.pitch,
                   world.crew.roll, s.elevator[0], s.elevator[1], s.ths, s.aileron[0], s.aileron[1], s.spoiler[0][2],
                   s.spoiler[1][2], name(pl), name(ll), healthy ? 1 : 0);
      std::fprintf(trace, "%.1f,%.1f,%.0f,%.2f,%.2f,%.2f,%.2f,%.3f,%.2f,%.1f,%.1f\n", world.casKn(), world.radioHeightFt(),
                   world.verticalSpeedFpm(), world.alphaDeg(), world.betaDeg(), world.flightPathDeg(),
                   world.yawRateDegS(), world.crew.pedals, s.rudder, world.crew.tla[0], world.flapDeg());
    }
    ++r.ticks;
  }
  r.wallSeconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
  r.digest = digest.h;
  r.unhealthyAtEnd = unhealthyList(efcs.transmitted());
  r.crashedAt = world.crashedAt();
  return r;
}

int verdict(const char* what, bool ok, const std::string& detail) {
  std::printf("  %s  %s%s%s\n", ok ? "pass" : "FAIL", what, detail.empty() ? "" : " - ", detail.c_str());
  return ok ? 0 : 1;
}

std::string fmt(const char* f, double a, double b = 0, double c = 0) {
  char buf[256];
  std::snprintf(buf, sizeof buf, f, a, b, c);
  return buf;
}

double share(const std::map<std::string, long long>& m, const char* key, long long total) {
  const auto it = m.find(key);
  return total ? (it == m.end() ? 0.0 : static_cast<double>(it->second) / total) : 0.0;
}

// Verdicts are separate statements: operands of + are evaluated in no fixed order, and the report
// should read in the order it is written.
// The first landing of the run, against the A320's limits: 600 fpm and 2.6 g are its hard-landing
// thresholds and 11.7 deg of pitch touches its tail. 360 fpm, 6 ft/s, is this harness's bar for a
// normal landing, well inside them.
int landingChecks(const Results& r) {
  int failed = verdict("a landing was flown", !r.landings.empty(), fmt("%.0f touchdowns", static_cast<double>(r.landings.size())));
  if (!r.landings.empty()) {
    const auto& l = r.landings.front();
    int bounces = 0;
    for (const auto& b : r.landings) bounces += b.at > l.at && b.at - l.at < 30;
    failed += verdict("touched down at a normal sink rate", l.sinkFpm > -360, fmt("%.0f fpm", l.sinkFpm));
    failed += verdict("mains first, tail clear", l.pitch > 0 && l.pitch < 10, fmt("pitch %.1f deg", l.pitch));
    failed += verdict("wings level", std::abs(l.bank) < 3, fmt("bank %.1f deg", l.bank));
    failed += verdict("under the hard-landing load factor", l.peakG < 2.6, fmt("peak %.2f g", l.peakG));
    failed += verdict("and it stayed down", bounces == 0, fmt("%.0f bounces", bounces));
  }
  return failed;
}

int checkExpectation(const std::string& which, const Results& r, const Options& opt) {
  int failed = 0;
  if (which == "power-up") {
    failed += verdict("dark before the FLT CTL pushbuttons", !r.healthyBeforeSwitches, "");
    failed += verdict("all nine computers healthy after the self-tests", r.healthyFrom > 1 && r.healthyFrom < 21,
                      fmt("healthy from %.2f s", r.healthyFrom));
    failed += verdict("and they stay healthy", r.unhealthyTicksAfterUp == 0,
                      fmt("%.0f unhealthy ticks after 21 s", static_cast<double>(r.unhealthyTicksAfterUp)));
  } else if (which == "ground-check") {
    failed += verdict("full pull drives the elevator trailing edge up", r.checkPullElevator.lo < -20,
                      fmt("left elevator reached %.1f deg", r.checkPullElevator.lo));
    failed += verdict("full push drives it trailing edge down", r.checkPushElevator.hi > 10,
                      fmt("left elevator reached %.1f deg", r.checkPushElevator.hi));
    failed += verdict("left and right roll deflect the ailerons opposite ways",
                      r.checkLeftAileron.lo * r.checkRightAileron.hi < 0 || r.checkLeftAileron.hi * r.checkRightAileron.lo < 0,
                      fmt("differential %.1f then %.1f deg", r.checkLeftAileron.lo, r.checkRightAileron.hi));
  } else if (which == "normal-law") {
    const double p = share(r.pitchLawTicks, "normal", r.flightTicks), l = share(r.lateralLawTicks, "normal", r.flightTicks);
    failed += verdict("airborne long enough to judge", r.flightTicks > 50 * 60, fmt("%.0f s settled in flight", r.flightTicks * kDt));
    failed += verdict("pitch normal law throughout", p >= 0.999, fmt("%.2f %% of settled flight", 100 * p));
    failed += verdict("lateral normal law throughout", l >= 0.999, fmt("%.2f %% of settled flight", 100 * l));
  } else if (which == "stick-response") {
    failed += verdict("the cruise doublet's pull pitches the nose up", r.doubletPullQ.hi > 1.5,
                      fmt("pitch rate peaked at %+.2f deg/s", r.doubletPullQ.hi));
    failed += verdict("and loads the airframe", r.doubletPullN.hi > 1.15, fmt("load factor peaked at %.2f g", r.doubletPullN.hi));
    failed += verdict("the push pitches it down", r.doubletPushQ.lo < -1.5, fmt("pitch rate reached %+.2f deg/s", r.doubletPushQ.lo));
  } else if (which == "autotrim") {
    // Normal law trims with the stabiliser: in steady flight the elevator comes back to rest.
    const double elevator = r.steadyTicks ? r.steadyElevatorSum / r.steadyTicks : 99;
    failed += verdict("steady flight long enough to judge", r.steadyTicks > 50 * 30, fmt("%.0f s steady", r.steadyTicks * kDt));
    failed += verdict("the elevator rests near neutral in steady flight", elevator < 1.0,
                      fmt("mean |elevator| %.2f deg", elevator));
    failed += verdict("because the THS carries the trim", std::max(std::abs(r.ths1g.lo), std::abs(r.ths1g.hi)) > 1.0,
                      fmt("THS %.2f..%.2f deg in steady flight", r.ths1g.lo, r.ths1g.hi));
  } else if (which == "pedal-kick") {
    // Three seconds of left pedal in cruise: the aircraft yaws, and the FACs' yaw damper takes it out.
    failed += verdict("the kick yaws the aircraft", r.kickBeta > 1.5, fmt("sideslip peaked at %.2f deg", r.kickBeta));
    failed += verdict("four to seven seconds after it the yaw rate is gone", r.kickResidualR >= 0 && r.kickResidualR < 0.5,
                      fmt("yaw rate at most %.2f deg/s", r.kickResidualR));
    failed += verdict("and so is the sideslip", r.kickResidualBeta >= 0 && r.kickResidualBeta < 0.5,
                      fmt("sideslip at most %.2f deg", r.kickResidualBeta));
  } else if (which == "rudder-trim") {
    // The RUD TRIM switch held left for six seconds in cruise, the stick left alone: the FAC orders left
    // trim and reads back the trim it ordered, the rudder trails left and the nose swings left of the
    // flight path; RESET centres it. Sideslip, not heading, because the window can open mid-turn and
    // normal law holds whatever bank the hands left. A sign wrong anywhere fails one of these.
    failed += verdict("the FAC orders left trim", r.trimOrder > 0.5, fmt("%.2f deg ordered (+ left)", r.trimOrder));
    failed += verdict("and reads back the trim it ordered", std::abs(r.trimReadBack - r.trimOrder) < 0.3,
                      fmt("read back %.2f deg against %.2f ordered", r.trimReadBack, r.trimOrder));
    failed += verdict("the rudder trails left", r.trimRudder > 0.5, fmt("rudder %.2f deg (+ left)", r.trimRudder));
    failed += verdict("and the nose swings left of the flight path", r.trimBeta > 1.0,
                      fmt("sideslip %.2f deg (+ nose left)", r.trimBeta));
    failed += verdict("RESET centres the trim", std::abs(r.trimAfterReset) < 0.2,
                      fmt("trim %.2f deg 15 s after RESET", r.trimAfterReset));
  } else if (which == "landing") {
    failed += landingChecks(r);
  } else if (which.rfind("laws=", 0) == 0) {
    // A failure's laws, as the computers chose them, and the landing flown in them (ROADMAP.md, P7 step
    // 3): laws=PITCH/LATERAL[,PITCH] names the pitch and lateral law in flight before the gear is down,
    // and the pitch law once it is down, each as the FCDC reports it, held throughout from five seconds
    // after the failure.
    const std::string spec = which.substr(5);
    const size_t comma = spec.find(','), slash = spec.find('/');
    const std::string before = spec.substr(0, comma), gearDown = comma == std::string::npos ? "" : spec.substr(comma + 1);
    const std::string pitch = before.substr(0, slash), lateral = slash == std::string::npos ? "" : before.substr(slash + 1);
    auto seen = [](const std::map<std::string, long long>& m) {
      std::string out;
      for (const auto& [law, n] : m) out += (out.empty() ? "" : ", ") + law + fmt(" %.0f s", n * kDt);
      return out.empty() ? std::string("none flown") : out;
    };
    failed += verdict("a failure in flight", r.failAt >= 0 && r.afterFailureTicks > 50 * 30,
                      fmt("at %.0f s, then %.0f s of settled flight", r.failAt, r.afterFailureTicks * kDt));
    failed += verdict(("pitch " + pitch + " law before the gear is down").c_str(),
                      r.beforeGearTicks > 50 * 20 && share(r.beforeGearPitch, pitch.c_str(), r.beforeGearTicks) == 1,
                      seen(r.beforeGearPitch));
    failed += verdict(("lateral " + lateral + " law").c_str(),
                      r.beforeGearTicks > 50 * 20 && share(r.beforeGearLateral, lateral.c_str(), r.beforeGearTicks) == 1,
                      seen(r.beforeGearLateral));
    if (!gearDown.empty()) {
      failed += verdict(("pitch " + gearDown + " law with the gear down").c_str(),
                        r.gearDownTicks > 50 * 10 && share(r.gearDownPitch, gearDown.c_str(), r.gearDownTicks) == 1,
                        seen(r.gearDownPitch));
    }
    failed += landingChecks(r);
  } else if (which == "ils") {
    // A hand-flown ILS's bands (ROADMAP.md, P7: how a hand-flown ILS is judged), here applied to the
    // scripted crew: stabilised from 1,000 ft above the threshold to 50 ft, then the touchdown and the
    // rollout against the runway. Each band prints its worst and where it happened.
    const double vapp = World::approachSpeedKn();
    auto worst = [](const Worst& w, const char* unit) {
      return std::isnan(w.value) ? std::string("never measured") : fmt("worst %.2f ", w.value) + unit + fmt(" at %.0f ft", w.at);
    };
    failed += verdict("an approach start", r.ilsApproach, opt.scenario.empty() ? "no --scenario" : opt.scenario);
    failed += verdict("the stabilised window was flown, 1,000 ft to 50 ft", r.ilsTicks * kDt > 60,
                      fmt("%.0f s of it", r.ilsTicks * kDt));
    failed += verdict("localizer within 1 dot", r.ilsLocDots.value <= 1, worst(r.ilsLocDots, "dots"));
    failed += verdict("glideslope within 1 dot", r.ilsGsDots.value <= 1, worst(r.ilsGsDots, "dots"));
    failed += verdict("sink rate under 1,000 fpm", r.ilsSinkFpm.value < 1000, worst(r.ilsSinkFpm, "fpm"));
    failed += verdict("gear down and CONF FULL from 1,000 ft", std::isnan(r.ilsUnconfiguredAtFt),
                      std::isnan(r.ilsUnconfiguredAtFt) ? std::string("throughout") : fmt("not at %.0f ft", r.ilsUnconfiguredAtFt));
    failed += verdict("speed within Vapp -5/+10 kt", r.ilsFastKn.value <= 10 && r.ilsSlowKn.value <= 5,
                      fmt("Vapp %.0f kt; %+.1f to ", vapp, -r.ilsSlowKn.value) + fmt("%+.1f kt", r.ilsFastKn.value));
    failed += verdict("bank within 7 deg", r.ilsBankDeg.value <= 7, worst(r.ilsBankDeg, "deg"));
    failed += verdict("normal law on the approach", r.flightTicks > 0 && share(r.pitchLawTicks, "normal", r.flightTicks) == 1 &&
                      share(r.lateralLawTicks, "normal", r.flightTicks) == 1, r.firstNonNormalAt < 0 ? "throughout" : r.firstNonNormal);
    failed += verdict("a landing", !r.landings.empty(), fmt("%.0f touchdowns", static_cast<double>(r.landings.size())));
    if (!r.landings.empty()) {
      const auto& l = r.landings.front();
      int bounces = 0;
      for (const auto& b : r.landings) bounces += b.at > l.at && b.at - l.at < 30;
      failed += verdict("sink rate at touchdown under 360 fpm", l.sinkFpm > -360, fmt("%.0f fpm", l.sinkFpm));
      failed += verdict("load factor at touchdown under 2.6 g", l.peakG < 2.6, fmt("peak %.2f g", l.peakG));
      failed += verdict("pitch at touchdown 0 to 10 deg", l.pitch > 0 && l.pitch < 10, fmt("%.1f deg", l.pitch));
      failed += verdict("touchdown 300 to 900 m past the threshold", r.touchdownPastM >= 300 && r.touchdownPastM <= 900,
                        fmt("%.0f m", r.touchdownPastM));
      failed += verdict("on the centreline at touchdown, within 5 m", std::abs(r.touchdownOffM) <= 5,
                        fmt("%+.1f m (+ right)", r.touchdownOffM));
      failed += verdict("and through the rollout", r.rolloutOffM.value <= 5,
                        fmt("worst %.1f m, ", r.rolloutOffM.value) + fmt("%.0f m past the threshold", r.rolloutOffM.at));
      failed += verdict("and it stayed down", bounces == 0, fmt("%.0f bounces", bounces));
    }
  } else if (which == "turbulence") {
    // Light turbulence on the approach: the gusts are felt — the load factor strays 0.12 to 0.28 g from
    // one on the approach, where still air leaves it at 0.00 — normal law holds, and the scripted crew
    // gets the aircraft onto the runway. How it lands there is not asked: its flare is not robust in
    // gusts. From 18 starts per airframe at KDFW 17C (wind 250 to 290 deg, 11 to 19 kt, 9.5 to 10.5 nm),
    // 10 of each broke a landing limit and 4 (A320) and 6 (737) landed hard; in still air all 36 landed
    // well. Which gusts a run meets is the standard library's: JSBSim draws them from
    // std::default_random_engine and std::normal_distribution, whose algorithms differ between MSVC,
    // libstdc++ and libc++, so the same seed flies different gusts on each. The touchdown is printed.
    failed += verdict("an approach start in turbulence", r.ilsApproach && opt.scenario.find("turbulence") != std::string::npos,
                      opt.scenario.empty() ? "no --scenario" : opt.scenario);
    failed += verdict("the gusts are felt: the load factor strays past 0.05 g on the approach", r.ilsLoadDev.value > 0.05,
                      std::isnan(r.ilsLoadDev.value) ? std::string("never measured")
                                                     : fmt("worst %.2f g from one at %.0f ft", r.ilsLoadDev.value, r.ilsLoadDev.at));
    failed += verdict("normal law on the approach", r.flightTicks > 0 && share(r.pitchLawTicks, "normal", r.flightTicks) == 1 &&
                      share(r.lateralLawTicks, "normal", r.flightTicks) == 1, r.firstNonNormalAt < 0 ? "throughout" : r.firstNonNormal);
    failed += verdict("a landing", !r.landings.empty(), fmt("%.0f touchdowns", static_cast<double>(r.landings.size())));
    if (!r.landings.empty()) {
      const auto& l = r.landings.front();
      failed += verdict("on the runway", std::abs(r.touchdownOffM) <= r.landingRunwayHalfWidthM && r.touchdownPastM > 0,
                        fmt("%.0f m past the threshold, ", r.touchdownPastM) + fmt("%+.1f m from the centreline (+ right)", r.touchdownOffM));
      std::printf("  info  touchdown at %.0f fpm, peak %.2f g, pitch %.1f deg: not judged in gusts\n", l.sinkFpm, l.peakG, l.pitch);
    }
  } else if (which == "law-degrades") {
    // The negative control for the gate's law check: lose all air data and normal law must go.
    std::string seen;
    for (const auto& [law, n] : r.afterFailurePitchLaw) seen += " " + law + fmt(" %.0f s", n * kDt);
    failed += verdict("a failure was injected in flight, and flown through", r.failAt >= 0 && r.afterFailureTicks > 50 * 30,
                      fmt("%.0f s of settled flight after it", r.afterFailureTicks * kDt));
    failed += verdict("pitch normal law is gone once all three ADRs fail",
                      r.afterFailureTicks > 0 && share(r.afterFailurePitchLaw, "normal", r.afterFailureTicks) == 0,
                      "pitch law after the failure:" + seen);
  } else {
    std::printf("unknown expectation '%s'\n", which.c_str());
    return 1;
  }
  return failed;
}

// The negative control for the gate's NaN check: a NaN planted in each kind of output is caught.
int scannerSelfTest() {
  Transmitted clean = {};
  Scan none;
  none.check(clean, 0);

  Transmitted planted = {};
  planted.elacBus[1].discrete_status_word_2.Data = std::nanf("");
  planted.secAnalog[2].right_spoiler_2_pos_order_deg = INFINITY;
  planted.facBus[0].v_max_kn.Data = -INFINITY;
  planted.fcdcBus[1].spoiler_5_right_pos_deg.Data = std::nanf("");
  Scan four;
  four.check(planted, 7.5);

  int failed = 0;
  failed += verdict("a clean set scans clean", none.bad == 0, fmt("%.0f bad", static_cast<double>(none.bad)));
  failed += verdict("a NaN or infinity in each of an ELAC bus, a SEC analogue, a FAC bus, an FCDC bus is caught",
                    four.bad == 4 && four.firstBadWhere == "ELAC 2" && four.firstBadAt == 7.5,
                    fmt("%.0f caught, first in ", static_cast<double>(four.bad)) + four.firstBadWhere);
  return failed;
}

int gate(const Results& r, const Options& opt) {
  const double p = share(r.pitchLawTicks, "normal", r.flightTicks), l = share(r.lateralLawTicks, "normal", r.flightTicks);
  int failed = 0;
  failed += verdict("thirty minutes at 50 Hz", opt.minutes >= 30 && r.ticks == 90000, fmt("%.0f ticks of 20 ms", static_cast<double>(r.ticks)));
  failed += verdict("no NaN or infinity on any output, any tick", r.scan.bad == 0,
                    r.scan.bad ? fmt("%.0f bad values, first at %.2f s", static_cast<double>(r.scan.bad), r.scan.firstBadAt) + " in " + r.scan.firstBadWhere
                               : fmt("%.0f values checked", static_cast<double>(r.ticks * Scan::valuesPerTick())));
  failed += verdict("the world stayed finite", r.worldFinite, r.worldFinite ? "" : fmt("first non-finite at %.2f s", r.worldBadAt));
  failed += verdict("every computer healthy once up, to the end", r.unhealthyTicksAfterUp == 0 && r.unhealthyAtEnd == " none",
                    fmt("healthy from %.2f s; %.0f unhealthy ticks after", r.healthyFrom, static_cast<double>(r.unhealthyTicksAfterUp)) + "; at the end:" + r.unhealthyAtEnd);
  failed += verdict("normal law in pitch and roll throughout settled flight", p >= 0.999 && l >= 0.999,
                    fmt("pitch %.2f %%, lateral %.2f %% of %.0f s", 100 * p, 100 * l, r.flightTicks * kDt) +
                        (r.firstNonNormalAt >= 0 ? fmt("; first departure at %.2f s: ", r.firstNonNormalAt) + r.firstNonNormal : ""));
  failed += verdict("a whole circuit flown: up, around, down", r.touchdowns >= 1, fmt("%.0f touchdowns", r.touchdowns));
  failed += verdict("the surfaces actually moved", r.elevator.hi - r.elevator.lo > 10 && r.aileron.hi - r.aileron.lo > 10,
                    fmt("elevator %.1f..%.1f, aileron %.1f..", r.elevator.lo, r.elevator.hi, r.aileron.lo) + fmt("%.1f deg", r.aileron.hi));
  return failed;
}

std::string self(const char* argv0) {
  return std::string("\"") + argv0 + "\"";
}

long long processId() {
#ifdef _WIN32
  return _getpid();
#else
  return getpid();
#endif
}

// A fresh process's digest, and its first touchdown when it had one. `extra` is appended to its
// command line.
bool childDigest(const char* argv0, double minutes, std::string& out, std::string* touchdown = nullptr,
                 const std::string& extra = "") {
  std::string cmd = self(argv0) + " --digest --minutes " + fmt("%.3f", minutes) + extra;
#ifdef _WIN32
  // cmd /c strips the first and the last quote of a line that holds more than two: give it a pair of
  // its own to strip, so a quoted executable and a quoted scenario both survive.
  cmd = "\"" + cmd + "\"";
#endif
  FILE* p = popen(cmd.c_str(), "r");
  if (!p) return false;
  char line[256];
  while (std::fgets(line, sizeof line, p)) {
    if (std::strncmp(line, "digest ", 7) == 0) out = std::string(line + 7, std::strcspn(line + 7, "\r\n"));
    if (touchdown && std::strncmp(line, "touchdown ", 10) == 0 && touchdown->empty()) {
      *touchdown = std::string(line, std::strcspn(line, "\r\n"));
    }
  }
  return pclose(p) == 0 && !out.empty();
}

void usage() {
  std::printf(
      "law_harness [--minutes N] [--gate] [--check-determinism] [--check-replay] [--trace file.csv] [--digest]\n"
      "            [--expect power-up|ground-check|normal-law|stick-response|autotrim|pedal-kick|rudder-trim|landing|\n"
      "                      law-degrades|ils|turbulence|scanner-catches-nan]\n"
      "            [--fail-adr-at SECONDS] [--record crew.csv | --replay crew.csv]\n"
      "            [--scenario \"runway;runway=LSZH14\" | \"approach;distance=10;loc=0;gs=0;cas=140;wind=270/15\" | \"reference\"]\n");
}

}  // namespace

int main(int argc, char** argv) {
  Options opt;
  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    auto next = [&](const char* flag) -> std::string {
      if (i + 1 >= argc) {
        std::printf("%s needs a value\n", flag);
        std::exit(2);
      }
      return argv[++i];
    };
    if (a == "--minutes") opt.minutes = std::atof(next("--minutes").c_str());
    else if (a == "--gate") opt.gate = true;
    else if (a == "--digest") opt.digestOnly = true;
    else if (a == "--check-determinism") opt.determinism = true;
    else if (a == "--check-replay") opt.replayCheck = true;
    else if (a == "--record") opt.record = next("--record");
    else if (a == "--replay") opt.replay = next("--replay");
    else if (a == "--scenario") opt.scenario = next("--scenario");
    else if (a == "--fail") opt.fail = next("--fail");
    else if (a == "--expect") opt.expect = next("--expect");
    else if (a == "--fail-adr-at") opt.failAdrAt = std::atof(next("--fail-adr-at").c_str());
    else if (a == "--trace") opt.trace = next("--trace");
    else {
      usage();
      return 2;
    }
  }
  if (!(opt.minutes > 0)) {
    std::printf("--minutes must be positive\n");
    return 2;
  }
  if (opt.expect == "scanner-catches-nan") {
    const int failed = scannerSelfTest();
    std::printf("%s\n", failed ? "FAILED" : "PASSED");
    return failed ? 1 : 0;
  }
  if (opt.gate && (opt.failAdrAt >= 0 || !opt.fail.empty() || opt.scenario.find("fail=") != std::string::npos)) {
    std::printf("the gate runs a healthy aircraft: --gate and a failure do not mix\n");
    return 2;
  }

  // the failures go into the scenario, so a replay check's children fly them too
  if (!opt.fail.empty()) {
    opt.scenario = (opt.scenario.empty() ? std::string("runway") : opt.scenario) + ";fail=" + opt.fail;
    opt.fail.clear();
  }

  if (!opt.record.empty() && !opt.replay.empty()) {
    std::printf("--record writes what the scripted crew does, --replay flies a recording: one or the other\n");
    return 2;
  }

  if (opt.determinism) {
    std::string a, b;
    const bool ran = childDigest(argv[0], opt.minutes, a) && childDigest(argv[0], opt.minutes, b);
    std::printf("A32NX %s, two fresh processes, %.1f simulated minutes each\n", A32NX_COMMIT, opt.minutes);
    return verdict("the same run gives the same bytes", ran && a == b, ran ? "digests " + a + " and " + b : "a child run failed");
  }

  // The scripted crew's inputs recorded in one fresh process and flown back through the flight core,
  // as an outside crew, in another: the same bytes from every computer, and the same touchdown.
  if (opt.replayCheck) {
    // A recording of this process's own: checks run side by side (ctest -j) write different files.
    const std::string file = "replay-check-" + std::to_string(processId()) + ".csv";
    const std::string scenario = opt.scenario.empty() ? "" : " --scenario \"" + opt.scenario + "\"";
    std::string a, b, ta, tb;
    const bool ran = childDigest(argv[0], opt.minutes, a, &ta, scenario + " --record " + file) &&
                     childDigest(argv[0], opt.minutes, b, &tb, scenario + " --replay " + file);
    std::printf("A32NX %s, %s, %.1f simulated minutes recorded and replayed in fresh processes\n", A32NX_COMMIT,
                Airframe::model(), opt.minutes);
    int failed = verdict("the replay gives the same bytes", ran && a == b, ran ? "digests " + a + " and " + b : "a child run failed");
    failed += verdict("and the same touchdown", ran && !ta.empty() && ta == tb,
                      ta.empty() ? std::string("no touchdown recorded") : ta + (ta == tb ? "" : "; replayed: " + tb));
    if (failed) {
      std::printf("the recording is kept: %s\n", file.c_str());
    } else {
      std::remove(file.c_str());
    }
    std::printf("%s\n", failed ? "FAILED" : "PASSED");
    return failed ? 1 : 0;
  }

  FILE* trace = nullptr;
  if (!opt.trace.empty()) {
    trace = std::fopen(opt.trace.c_str(), "w");
    if (!trace) {
      std::printf("cannot write %s\n", opt.trace.c_str());
      return 2;
    }
  }
  const Results r = run(opt, trace);
  if (trace) std::fclose(trace);

  if (opt.digestOnly) {
    std::printf("digest %016llx\n", static_cast<unsigned long long>(r.digest));
    if (!r.landings.empty()) {
      const auto& l = r.landings.front();
      std::printf("touchdown at %.2f s: sink %.1f fpm, pitch %.2f deg, bank %.2f deg, %.1f kt, peak %.3f g\n", l.at,
                  l.sinkFpm, l.pitch, l.bank, l.cas, l.peakG);
    }
    return r.scan.bad == 0 && r.crashedAt < 0 ? 0 : 1;
  }

  const double sim = r.ticks * kDt;
  std::printf("A32NX %s: ELAC x2, SEC x3, FAC x2, FCDC x2 flying JSBSim %s's %s\n", A32NX_COMMIT, JSBSIM_COMMIT,
              Airframe::model());
  std::printf("%.0f ticks = %.1f simulated s in %.2f wall s (%.0fx real time)\n", static_cast<double>(r.ticks), sim,
              r.wallSeconds, sim / std::max(r.wallSeconds, 1e-9));
  std::printf("flight: %d touchdowns; altitude %.0f..%.0f ft, pitch %.1f..%.1f deg, bank %.1f..%.1f deg, load %.2f..%.2f g\n",
              r.touchdowns, r.altitude.lo, r.altitude.hi, r.pitch.lo, r.pitch.hi, r.bank.lo, r.bank.hi, r.load.lo, r.load.hi);
  std::printf("surfaces: elevator %.1f..%.1f, THS %.2f..%.2f, aileron %.1f..%.1f, spoiler 3 %.1f..%.1f deg\n",
              r.elevator.lo, r.elevator.hi, r.ths.lo, r.ths.hi, r.aileron.lo, r.aileron.hi, r.spoiler.lo, r.spoiler.hi);
  for (const auto& l : r.landings) {
    std::printf("touchdown at %.1f s: sink %.0f fpm, pitch %.1f deg, bank %.1f deg, %.0f kt, peak %.2f g\n", l.at, l.sinkFpm,
                l.pitch, l.bank, l.cas, l.peakG);
  }
  std::printf("phases first entered:");
  for (const auto& [phase, at] : r.firstEntered) std::printf(" %s %.0fs", phase.c_str(), at);
  std::printf("\nlaws in settled flight (%.0f s):", r.flightTicks * kDt);
  for (const auto& [law, n] : r.pitchLawTicks) std::printf(" pitch-%s %.1f%%", law.c_str(), 100.0 * n / std::max(1LL, r.flightTicks));
  for (const auto& [law, n] : r.lateralLawTicks) std::printf(" lateral-%s %.1f%%", law.c_str(), 100.0 * n / std::max(1LL, r.flightTicks));
  std::printf("\nnon-finite outputs: %lld of %lld values checked; digest %016llx\n", r.scan.bad,
              r.ticks * Scan::valuesPerTick(), static_cast<unsigned long long>(r.digest));

  int failed = 0;
  // Whatever the run was asked, an airframe that flew into the ground voids what came after it.
  if (r.crashedAt >= 0) {
    failed += verdict("the airframe stayed out of the ground", false,
                      fmt("it went below the runway at %.1f s, and the world froze there", r.crashedAt));
  }
  if (!opt.expect.empty()) failed += checkExpectation(opt.expect, r, opt);
  if (opt.gate) failed += gate(r, opt);
  if (opt.gate || !opt.expect.empty() || failed) std::printf("%s\n", failed ? "FAILED" : "PASSED");
  return failed ? 1 : 0;
}
