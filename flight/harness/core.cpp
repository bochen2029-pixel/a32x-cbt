// The flight core. See core.h. GPLv3.

#include "core.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <iterator>
#include <memory>
#include <string>

#include "airframe.h"
#include "efcs.h"
#include "laws.h"

namespace {

constexpr double kDt = 0.02;  // 50 Hz, the rate the computers are built for
constexpr double kRunwayStartPastThresholdM = 150;  // where a runway start stands, lined up

// Input slots. Signs and units are the crew's (world.h): stick +1 full pull and full right, pedals
// +1 full left, thrust lever angle 0 idle .. 45 TOGA, rudder_trim +1 the switch held left and -1 right,
// pitch_trim the trim wheel turned at that fraction of its rate, + nose up.
const std::vector<const char*> kInputs = {
    "pitch",      "roll",      "pedals",     "tla_1",       "tla_2",
    "brakes",     "speedbrake", "spoilers_armed", "flap_lever", "gear_down",
    "rudder_trim", "rudder_trim_reset",
    "elac_1",     "elac_2",    "sec_1",      "sec_2",       "sec_3",
    "fac_1",      "fac_2",
    "pitch_trim"};

// State slots. Air data in ISA with the standard setting; attitude and rates in degrees; heading and
// track true; ra_ft zero standing on the runway. Surfaces in the computers' frame, except the
// spoilers, given as extension (+ out). pitch_law, lateral_law and phase are codes; flight_state_text
// names them.
const std::vector<const char*> kState = {
    "t_s",          "lat_deg",      "lon_deg",       "alt_ft",       "ra_ft",
    "cas_kn",       "tas_kn",       "gs_kn",         "vs_fpm",       "mach",
    "pitch_deg",    "roll_deg",     "heading_deg",   "track_deg",    "alpha_deg",
    "beta_deg",     "gamma_deg",    "nz_g",          "p_deg_s",      "q_deg_s",
    "r_deg_s",      "flap_deg",     "gear_pos",      "on_ground",    "nose_on_ground",
    "elevator_deg", "ths_deg",      "aileron_l_deg", "aileron_r_deg", "rudder_deg",
    "rudder_trim_deg", "spoiler_l_deg", "spoiler_r_deg", "n1_1",      "n1_2",
    "pitch_law",    "lateral_law",  "healthy",       "crashed",      "phase",
    // the ILS (runway.h): where each beam lies from the aircraft, + right and + up, in dots
    "loc_dots",     "gs_dots",      "loc_valid",     "gs_valid",
    "thr_along_m",  "thr_right_m",  "thr_height_ft",
    // the runway, fixed for the flight: its landing threshold, and the pavement past and before it
    "rwy_lat_deg",  "rwy_lon_deg",  "rwy_elev_ft",   "rwy_heading_deg", "rwy_length_m",
    "rwy_width_m",  "rwy_displaced_m",
    // the gate's judge (judge.h): the FAC's VLS (NaN when it transmits none) and the approach speed the
    // pilot is held to; whether this step is inside the stabilised window (0 or 1) and inside every band
    // of it (NaN outside the window); the verdict once the aircraft has stopped (1 stable, 0 not, NaN
    // before); and the first touchdown's distance past the threshold
    "vls_kn",       "vapp_kn",      "judge_window",  "judge_in_bands", "judge_stable",
    "judge_touchdown_m",
    // the pilot's eye, the airframe definition's own EYEPOINT (the left seat), from the CG in body axes:
    // forward, right, up, metres; a view puts its camera there; and the CG's height above the ground
    // standing on the gear, where ra_ft reads zero, so a view puts the wheels on the runway
    "eye_fwd_m",    "eye_right_m",  "eye_up_m",      "cg_height_m"};

int slot(const std::vector<const char*>& names, const char* name) {
  for (size_t k = 0; k < names.size(); ++k) {
    if (std::string(names[k]) == name) return static_cast<int>(k);
  }
  return -1;
}

double bounded(double v, double lo, double hi, double previous) {
  return std::isfinite(v) ? std::max(lo, std::min(hi, v)) : previous;  // a non-finite input changes nothing
}

// Where a unit's failure time is kept: adr1-3, ir1-3, green, blue, yellow, elac1-2, sec1-3.
double* failureSlot(Failures& f, const std::string& unit) {
  struct Indexed {
    const char* prefix;
    double* times;
    int count;
  };
  for (const Indexed& u : {Indexed{"adr", f.adr, 3}, Indexed{"ir", f.ir, 3}, Indexed{"elac", f.elac, 2}, Indexed{"sec", f.sec, 3}}) {
    const std::string prefix = u.prefix;
    if (unit.size() == prefix.size() + 1 && unit.compare(0, prefix.size(), prefix) == 0) {
      const int k = unit.back() - '1';
      return k >= 0 && k < u.count ? &u.times[k] : nullptr;
    }
  }
  if (unit == "green") return &f.hyd[0];
  if (unit == "blue") return &f.hyd[1];
  if (unit == "yellow") return &f.hyd[2];
  return nullptr;
}

// A failure list (core.h): groups separated by commas, each the units that fail together joined by
// '+' (or by spaces, as a '+' in a page's address arrives), and after an '@' the seconds from the
// start at which they fail; without one, from the start.
bool parseFailures(const std::string& text, Failures& f, std::string& error) {
  for (size_t at = 0; at <= text.size();) {
    const size_t end = std::min(text.find(',', at), text.size());
    std::string group = text.substr(at, end - at);
    at = end + 1;
    double when = 0;
    const size_t mark = group.find('@');
    if (mark != std::string::npos) {
      char* stop = nullptr;
      when = std::strtod(group.c_str() + mark + 1, &stop);
      if (mark + 1 == group.size() || !stop || *stop != '\0' || !(when >= 0)) {
        error = "'" + group + "': after @, the seconds from the start";
        return false;
      }
      group.resize(mark);
    }
    int units = 0;
    for (size_t u = 0; u <= group.size();) {
      const size_t stop = std::min(group.find_first_of("+ ", u), group.size());
      const std::string unit = group.substr(u, stop - u);
      u = stop + 1;
      if (unit.empty()) continue;
      double* slot = failureSlot(f, unit);
      if (!slot) {
        error = "no unit called '" + unit + "': adr1-3, ir1-3, green, blue, yellow, elac1-2, sec1-3";
        return false;
      }
      *slot = when;
      ++units;
    }
    if (units == 0) {
      error = "'" + group + "' names no unit to fail";
      return false;
    }
  }
  return true;
}

std::unique_ptr<FlightCore> g_core;
std::vector<double> g_state;

}  // namespace

FlightCore::FlightCore(bool scripted, const WorldStart& start) : world_(start) {
  world_.scripted = scripted;
  judge_.begin(world_);
  toInputs(world_.crew, inputs_);
  if (!scripted) {
    // A crew at the controls finds the FLT CTL pushbuttons pressed: in the inputs, not the crew, so the
    // world starts exactly as the scripted crew's does and a recording replays to the same bytes.
    for (const char* pb : {"elac_1", "elac_2", "sec_1", "sec_2", "sec_3", "fac_1", "fac_2"}) inputs_[slot(kInputs, pb)] = 1;
  }
}

Efcs& FlightCore::efcs() {
  return Efcs::instance();
}

void FlightCore::step(const std::function<void()>& between) {
  Efcs& e = Efcs::instance();
  e.tick(world_, kDt);
  if (between) between();
  if (!world_.scripted) fromInputs(inputs_, world_.crew);
  world_.step(kDt, e.orders());
  if (world_.scripted) toInputs(world_.crew, inputs_);
  judge_.observe(world_, e.transmitted());
}

const std::vector<const char*>& FlightCore::inputNames() {
  return kInputs;
}

const std::vector<const char*>& FlightCore::stateNames() {
  return kState;
}

void FlightCore::toInputs(const Crew& c, std::vector<double>& v) {
  v.assign(kInputs.size(), 0);
  const double values[] = {c.pitch,
                           c.roll,
                           c.pedals,
                           c.tla[0],
                           c.tla[1],
                           c.brakes,
                           c.speedbrake,
                           c.spoilersArmed ? 1.0 : 0.0,
                           static_cast<double>(c.flapLever),
                           c.gearDown ? 1.0 : 0.0,
                           (c.rudderTrimLeft ? 1.0 : 0.0) - (c.rudderTrimRight ? 1.0 : 0.0),
                           c.rudderTrimReset ? 1.0 : 0.0,
                           c.elacOn[0] ? 1.0 : 0.0,
                           c.elacOn[1] ? 1.0 : 0.0,
                           c.secOn[0] ? 1.0 : 0.0,
                           c.secOn[1] ? 1.0 : 0.0,
                           c.secOn[2] ? 1.0 : 0.0,
                           c.facOn[0] ? 1.0 : 0.0,
                           c.facOn[1] ? 1.0 : 0.0,
                           c.pitchTrim};
  static_assert(sizeof values / sizeof values[0] == 20, "one value per input slot");
  std::copy(std::begin(values), std::end(values), v.begin());
}

void FlightCore::fromInputs(const std::vector<double>& v, Crew& c) {
  auto on = [&v](int k, bool previous) { return std::isfinite(v[k]) ? v[k] >= 0.5 : previous; };
  c.pitch = bounded(v[0], -1, 1, c.pitch);
  c.roll = bounded(v[1], -1, 1, c.roll);
  c.pedals = bounded(v[2], -1, 1, c.pedals);
  c.tla[0] = bounded(v[3], 0, 45, c.tla[0]);
  c.tla[1] = bounded(v[4], 0, 45, c.tla[1]);
  c.brakes = bounded(v[5], 0, 1, c.brakes);
  c.speedbrake = bounded(v[6], 0, 1, c.speedbrake);
  c.spoilersArmed = on(7, c.spoilersArmed);
  c.flapLever = static_cast<int>(std::lround(bounded(v[8], 0, 4, c.flapLever)));
  c.gearDown = on(9, c.gearDown);
  if (std::isfinite(v[10])) {
    c.rudderTrimLeft = v[10] >= 0.5;
    c.rudderTrimRight = v[10] <= -0.5;
  }
  c.rudderTrimReset = on(11, c.rudderTrimReset);
  c.elacOn[0] = on(12, c.elacOn[0]);
  c.elacOn[1] = on(13, c.elacOn[1]);
  c.secOn[0] = on(14, c.secOn[0]);
  c.secOn[1] = on(15, c.secOn[1]);
  c.secOn[2] = on(16, c.secOn[2]);
  c.facOn[0] = on(17, c.facOn[0]);
  c.facOn[1] = on(18, c.facOn[1]);
  c.pitchTrim = bounded(v[19], -1, 1, c.pitchTrim);
}

void FlightCore::writeState(std::vector<double>& s) const {
  const World& w = world_;
  const AirframeState& a = w.airframeState();
  const Surfaces& f = w.surfaces;
  const Transmitted& tx = Efcs::instance().transmitted();
  const IlsReading ils = w.ils();
  const Runway& r = w.runway();
  double thrLat = 0, thrLon = 0;
  threshold(r, thrLat, thrLon);
  auto extension = [&f](int side) {
    double most = 0;
    for (double v : f.spoiler[side]) most = std::max(most, -v);
    return most;
  };
  const double values[] = {w.time(),
                           a.latitudeDeg,
                           a.longitudeDeg,
                           a.pressureAltitudeFt,
                           a.radioHeightFt,
                           a.casKn,
                           a.tasKn,
                           a.groundSpeedKn,
                           a.verticalSpeedFpm,
                           a.mach,
                           a.pitchDeg,
                           a.rollDeg,
                           a.headingDeg,
                           a.trackDeg,
                           a.alphaDeg,
                           a.betaDeg,
                           a.flightPathDeg,
                           a.nz,
                           a.pDegS,
                           a.qDegS,
                           a.rDegS,
                           w.flapDeg(),
                           a.gearPosition,
                           w.onGround() ? 1.0 : 0.0,
                           a.noseWow ? 1.0 : 0.0,
                           (f.elevator[0] + f.elevator[1]) / 2,
                           f.ths,
                           f.aileron[0],
                           f.aileron[1],
                           f.rudder,
                           f.rudderTrim,
                           extension(0),
                           extension(1),
                           a.n1[0],
                           a.n1[1],
                           static_cast<double>(pitchLaw(tx.fcdcBus[0].efcs_status_word_1)),
                           static_cast<double>(lateralLaw(tx.fcdcBus[0].efcs_status_word_1)),
                           allHealthy(tx) ? 1.0 : 0.0,
                           w.crashedAt() >= 0 ? 1.0 : 0.0,
                           static_cast<double>(w.phase()),
                           ils.locDots,
                           ils.gsDots,
                           ils.locValid ? 1.0 : 0.0,
                           ils.gsValid ? 1.0 : 0.0,
                           ils.alongM,
                           ils.rightM,
                           ils.heightM / 0.3048,
                           thrLat,
                           thrLon,
                           r.elevationFt,
                           r.headingDeg,
                           r.lengthM - r.displacedM,
                           r.widthM,
                           r.displacedM,
                           judge_.vlsKn(),
                           judge_.vappKn(),
                           judge_.inWindow() ? 1.0 : 0.0,
                           judge_.inWindow() ? (judge_.inBands() ? 1.0 : 0.0) : NAN,
                           judge_.active() && judge_.finished() ? (judge_.stable() ? 1.0 : 0.0) : NAN,
                           judge_.touchdown().pastM,
                           a.eyeFwdM,
                           a.eyeRightM,
                           a.eyeUpM,
                           a.cgHeightM};
  static_assert(sizeof values / sizeof values[0] == 64, "one value per state slot");
  s.assign(std::begin(values), std::end(values));
}

const char* FlightCore::stateText(int index) const {
  const base_arinc_429& word = Efcs::instance().transmitted().fcdcBus[0].efcs_status_word_1;
  if (index == slot(kState, "pitch_law")) return name(pitchLaw(word));
  if (index == slot(kState, "lateral_law")) return name(lateralLaw(word));
  if (index == slot(kState, "phase")) return world_.scripted ? phaseName(world_.phase()) : "crew";
  return nullptr;
}

bool FlightCore::parseScenario(const char* text, WorldStart& start, std::string& error) {
  start = WorldStart{};
  std::string s = text ? text : "";
  std::vector<std::string> parts;
  for (size_t at = 0; at <= s.size();) {
    const size_t end = std::min(s.find(';', at), s.size());
    parts.push_back(s.substr(at, end - at));
    at = end + 1;
  }
  const std::string kind = parts[0].empty() ? "runway" : parts[0];
  if (kind == "reference") {  // P6's and slice 1's start: 47 N 8 E (geocentric), sea level, heading 360
    if (parts.size() > 1) {
      error = "the reference start takes no options";
      return false;
    }
    return true;
  }
  if (kind != "runway" && kind != "approach" && kind != "air") {
    error = "no scenario called '" + kind + "'";
    return false;
  }
  const bool air = kind == "air";
  Runway r = kdfw17c();  // the main airport (runway.h)
  double distance = 10, loc = 0, gs = 0, cas = air ? 250 : 140, lever = air ? 0 : 4, alt = 10000;
  double windFrom = 0, windKn = 0, turbulence = 0;
  std::string manoeuvre = "hold";
  for (size_t k = 1; k < parts.size(); ++k) {
    const size_t eq = parts[k].find('=');
    const std::string key = parts[k].substr(0, eq), value = eq == std::string::npos ? "" : parts[k].substr(eq + 1);
    if (key == "runway") {
      if (!runwayNamed(value, r)) {
        error = "no runway called '" + value + "': KDFW17C or LSZH14";
        return false;
      }
      continue;
    }
    if (key == "fail") {
      if (!parseFailures(value, start.failures, error)) return false;
      continue;
    }
    if (key == "manoeuvre" && air) {
      for (const char* m : {"hold", "bank", "pull", "push", "alpha", "speed"}) {
        if (value == m) manoeuvre = value;
      }
      if (manoeuvre != value) {
        error = "no manoeuvre called '" + value + "': hold, bank, pull, push, alpha, speed";
        return false;
      }
      continue;
    }
    if (kind == "runway") {
      error = "the runway start takes only runway= and fail=";
      return false;
    }
    char* end = nullptr;
    const double v = std::strtod(value.c_str(), &end);
    const bool number = !value.empty() && end && (*end == '\0' || (key == "wind" && *end == '/'));
    if (!number) {
      error = "'" + parts[k] + "' is not key=number";
      return false;
    }
    if (air && (key == "distance" || key == "loc" || key == "gs")) {
      error = "an air start takes alt=, cas=, lever=, manoeuvre=, wind=, turbulence=, runway= and fail=";
      return false;
    }
    if (key == "distance") distance = v;
    else if (key == "loc") loc = v;
    else if (key == "gs") gs = v;
    else if (key == "alt" && air) alt = v;
    else if (key == "cas") cas = v;
    else if (key == "lever") lever = v;
    else if (key == "turbulence") turbulence = v;
    else if (key == "wind") {
      windFrom = v;
      windKn = *end == '/' ? std::strtod(end + 1, nullptr) : 0;
    } else {
      error = "no option called '" + key + "'";
      return false;
    }
  }
  AirframeStart& a = start.airframe;
  a.geodetic = true;
  a.fieldElevationFt = r.elevationFt;
  a.headingDeg = r.headingDeg;
  start.runway = r;
  if (kind == "runway") {  // on the gear, lined up 150 m past the threshold: the default start
    onCentreline(r, kRunwayStartPastThresholdM, a.latDeg, a.lonDeg);
    return true;
  }
  if (air) {  // level over the threshold on the runway's heading, trimmed, the test pilot flying
    if (!(alt >= r.elevationFt + 2000 && alt <= 39000) || !(cas > 100 && cas <= 400) || !(lever >= 0 && lever <= 4)) {
      error = "alt 2,000 ft above the field to 39,000 ft, cas 100..400 kt, lever 0..4";
      return false;
    }
    threshold(r, a.latDeg, a.lonDeg);
    a.heightFt = alt - r.elevationFt;
    a.airborne = true;
    a.casKn = cas;
    a.gammaDeg = 0;
    a.windFromDeg = windFrom;
    a.windKn = windKn;
    a.turbulence = turbulence;
    start.flapLever = static_cast<int>(lever);
    start.gearDown = lever >= 3;
    start.manoeuvre = manoeuvre;
    return true;
  }
  if (!(distance > 0.5 && distance < 20) || !(cas > 100 && cas < 250) || !(lever >= 0 && lever <= 4)) {
    error = "distance 0.5..20 nm, cas 100..250 kt, lever 0..4";
    return false;
  }
  onApproach(r, distance, loc, gs, a.latDeg, a.lonDeg, a.heightFt);
  a.airborne = true;
  a.casKn = cas;
  a.gammaDeg = -r.glideDeg;
  a.windFromDeg = windFrom;
  a.windKn = windKn;
  a.turbulence = turbulence;
  start.flapLever = static_cast<int>(lever);
  start.gearDown = lever >= 3;
  return true;
}

// --- the C API -----------------------------------------------------------------------------------

extern "C" {

int flight_start(const char* airframe, int scripted) {
  return flight_start_scenario(airframe, scripted, "");
}

int flight_start_scenario(const char* airframe, int scripted, const char* scenario) {
  if (g_core) return -1;
  WorldStart start;
  std::string error;
  if (!FlightCore::parseScenario(scenario, start, error)) {
    std::fprintf(stderr, "flight_start_scenario: %s\n", error.c_str());
    return -3;
  }
  if (airframe && *airframe) Airframe::select(airframe);
  g_core = std::make_unique<FlightCore>(scripted != 0, start);
  g_core->writeState(g_state);
  return 0;
}

double* flight_inputs(void) {
  return g_core ? g_core->inputs().data() : nullptr;
}

int flight_input_count(void) {
  return static_cast<int>(kInputs.size());
}

const char* flight_input_name(int index) {
  return index >= 0 && index < static_cast<int>(kInputs.size()) ? kInputs[index] : nullptr;
}

int flight_step(int ticks) {
  if (!g_core || ticks <= 0) return 0;
  for (int k = 0; k < ticks; ++k) g_core->step();
  g_core->writeState(g_state);
  return ticks;
}

const double* flight_state(void) {
  return g_core ? g_state.data() : nullptr;
}

int flight_state_count(void) {
  return static_cast<int>(kState.size());
}

const char* flight_state_name(int index) {
  return index >= 0 && index < static_cast<int>(kState.size()) ? kState[index] : nullptr;
}

const char* flight_state_text(int index) {
  return g_core && index >= 0 && index < static_cast<int>(kState.size()) ? g_core->stateText(index) : nullptr;
}

const char* flight_debrief(void) {
  static std::string text;
  if (!g_core) return nullptr;
  text = g_core->judge().debrief();
  return text.c_str();
}

}  // extern "C"
