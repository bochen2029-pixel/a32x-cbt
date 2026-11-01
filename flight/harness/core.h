// The flight core: the A32NX computers and the world stepped together at 50 Hz, behind a small C API —
// start, inputs, step, state — for a caller that is not this harness: the browser's WebAssembly module
// first. GPLv3.
//
// One flight per process. The A32NX computers rely on zero-filled static storage (flight/README.md,
// Findings), so a second flight needs a fresh process or a fresh WebAssembly instance; flight_start
// refuses a second call.
//
// Inputs and state are arrays of doubles, each slot named. A caller finds the slot it wants by name
// (flight_input_name, flight_state_name) rather than by a number of its own, so the two sides cannot
// drift apart. A switch or a flag is 0 or 1.

#pragma once

#ifdef __cplusplus
extern "C" {
#endif

// Starts the flight on the runway: the airframe ("a320", "737"; null or empty for the default),
// engines at idle, parked on the brakes. scripted = 1: the harness's own crew flies it, power-up to
// landing, and writes what it did into the inputs after each step. scripted = 0: the caller's inputs
// fly it, its inputs starting with the FLT CTL pushbuttons pressed. Returns 0, or -1 for a second call.
int flight_start(const char* airframe, int scripted);

// The same, from a scenario: "runway" (or empty) is flight_start's; "approach" starts in the air on LSZH
// 14's ILS, options after it separated by semicolons — distance=NM (10), loc=DOTS (0), gs=DOTS (0),
// cas=KT (140), lever=0..4 (4, FULL), wind=FROM/KT (0/0), turbulence=SEVERITY (0) — in CONF and gear
// for the lever, trimmed. There the scripted crew flies the ILS to a landing and a stop. A scenario not
// understood returns -3.
int flight_start_scenario(const char* airframe, int scripted, const char* scenario);

// The inputs, read before each step when the crew is not scripted.
double* flight_inputs(void);
int flight_input_count(void);
const char* flight_input_name(int index);  // null past the last

// Runs ticks steps of 20 ms; returns how many ran (0 before flight_start).
int flight_step(int ticks);

// The state after the last step.
const double* flight_state(void);
int flight_state_count(void);
const char* flight_state_name(int index);  // null past the last
// A field's value as a word, for the fields that are names (laws, phase); null for the rest.
const char* flight_state_text(int index);

#ifdef __cplusplus
}

#include <functional>
#include <string>
#include <vector>

#include "world.h"

class Efcs;

// The same core for C++. The harness's runner steps through it too, so there is one step loop.
class FlightCore {
 public:
  explicit FlightCore(bool scripted, const WorldStart& start = WorldStart{});

  // A scenario's text (flight_start_scenario) made into a start; false and a reason if not understood.
  static bool parseScenario(const char* text, WorldStart& start, std::string& error);

  // One tick: the computers act on the world as it stands, then the crew's inputs for this tick are
  // set (unless scripted), then the world moves. `between` runs after the computers and before the
  // world, for a caller that observes the computers' outputs at that instant.
  void step(const std::function<void()>& between = nullptr);

  World& world() { return world_; }
  const World& world() const { return world_; }
  Efcs& efcs();
  bool scripted() const { return world_.scripted; }

  // The input slots, in the C API's order. For a scripted crew, what the script did this tick.
  std::vector<double>& inputs() { return inputs_; }
  static const std::vector<const char*>& inputNames();
  static void toInputs(const Crew& crew, std::vector<double>& inputs);
  static void fromInputs(const std::vector<double>& inputs, Crew& crew);

  // The state slots, in the C API's order.
  static const std::vector<const char*>& stateNames();
  void writeState(std::vector<double>& state) const;
  const char* stateText(int index) const;

 private:
  World world_;
  std::vector<double> inputs_;
};
#endif
