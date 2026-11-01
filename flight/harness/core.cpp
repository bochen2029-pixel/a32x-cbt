// The flight core. See core.h. GPLv3.

#include "core.h"

#include <algorithm>
#include <cmath>
#include <iterator>
#include <memory>
#include <string>

#include "airframe.h"
#include "efcs.h"
#include "laws.h"

namespace {

constexpr double kDt = 0.02;  // 50 Hz, the rate the computers are built for

// Input slots. Signs and units are the crew's (world.h): stick +1 full pull and full right, pedals
// +1 full left, thrust lever angle 0 idle .. 45 TOGA, rudder_trim +1 the switch held left and -1 right.
const std::vector<const char*> kInputs = {
    "pitch",      "roll",      "pedals",     "tla_1",       "tla_2",
    "brakes",     "speedbrake", "spoilers_armed", "flap_lever", "gear_down",
    "rudder_trim", "rudder_trim_reset",
    "elac_1",     "elac_2",    "sec_1",      "sec_2",       "sec_3",
    "fac_1",      "fac_2"};

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
    "pitch_law",    "lateral_law",  "healthy",       "crashed",      "phase"};

int slot(const std::vector<const char*>& names, const char* name) {
  for (size_t k = 0; k < names.size(); ++k) {
    if (std::string(names[k]) == name) return static_cast<int>(k);
  }
  return -1;
}

double bounded(double v, double lo, double hi, double previous) {
  return std::isfinite(v) ? std::max(lo, std::min(hi, v)) : previous;  // a non-finite input changes nothing
}

std::unique_ptr<FlightCore> g_core;
std::vector<double> g_state;

}  // namespace

FlightCore::FlightCore(bool scripted) {
  world_.scripted = scripted;
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
                           c.facOn[1] ? 1.0 : 0.0};
  static_assert(sizeof values / sizeof values[0] == 19, "one value per input slot");
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
}

void FlightCore::writeState(std::vector<double>& s) const {
  const World& w = world_;
  const AirframeState& a = w.airframeState();
  const Surfaces& f = w.surfaces;
  const Transmitted& tx = Efcs::instance().transmitted();
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
                           static_cast<double>(w.phase())};
  static_assert(sizeof values / sizeof values[0] == 40, "one value per state slot");
  s.assign(std::begin(values), std::end(values));
}

const char* FlightCore::stateText(int index) const {
  const base_arinc_429& word = Efcs::instance().transmitted().fcdcBus[0].efcs_status_word_1;
  if (index == slot(kState, "pitch_law")) return name(pitchLaw(word));
  if (index == slot(kState, "lateral_law")) return name(lateralLaw(word));
  if (index == slot(kState, "phase")) return world_.scripted ? phaseName(world_.phase()) : "crew";
  return nullptr;
}

// --- the C API -----------------------------------------------------------------------------------

extern "C" {

int flight_start(const char* airframe, int scripted) {
  if (g_core) return -1;
  if (airframe && *airframe) Airframe::select(airframe);
  g_core = std::make_unique<FlightCore>(scripted != 0);
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

}  // extern "C"
