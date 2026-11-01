/* The flight core's C API, used from C: the header is C, the slots are found by name, the inputs fly
 * the aircraft, and a second start is refused. GPLv3. */

#include <math.h>
#include <stdio.h>
#include <string.h>

#include "core.h"

static int failures = 0;

static void check(int ok, const char* what) {
  printf("  %s  %s\n", ok ? "pass" : "FAIL", what);
  if (!ok) ++failures;
}

static int input(const char* name) {
  for (int i = 0; flight_input_name(i); ++i) {
    if (strcmp(flight_input_name(i), name) == 0) return i;
  }
  return -1;
}

static int field(const char* name) {
  for (int i = 0; flight_state_name(i); ++i) {
    if (strcmp(flight_state_name(i), name) == 0) return i;
  }
  return -1;
}

static int count(const char* (*name)(int)) {
  int n = 0;
  while (name(n)) ++n;
  return n;
}

int main(void) {
  check(count(flight_input_name) == flight_input_count(), "the input names end where the count says");
  check(count(flight_state_name) == flight_state_count(), "the state names end where the count says");
  check(flight_step(1) == 0 && flight_state() == NULL && flight_inputs() == NULL, "nothing runs before the start");

  check(flight_start(NULL, 0) == 0, "a flight starts, the crew outside");
  check(flight_start(NULL, 0) == -1, "a second start in the same process is refused");

  double* in = flight_inputs();
  check(in[input("elac_1")] == 1 && in[input("fac_2")] == 1, "the FLT CTL pushbuttons start pressed");
  check(in[input("brakes")] == 1 && in[input("gear_down")] == 1, "parked on the brakes, gear down");

  flight_step(150);
  const double* s = flight_state();
  check(fabs(s[field("t_s")] - 3.0) < 1e-9, "150 steps are three seconds");
  check(s[field("healthy")] == 1, "every computer healthy after three seconds");
  check(s[field("on_ground")] == 1 && s[field("gs_kn")] < 0.5, "standing still on the runway");
  check(flight_state_text(field("pitch_law")) != NULL && flight_state_text(field("t_s")) == NULL,
        "laws have names, numbers do not");
  check(strcmp(flight_state_text(field("phase")), "crew") == 0, "the phase says an outside crew flies");

  in[input("brakes")] = 0;
  in[input("tla_1")] = in[input("tla_2")] = 45;
  flight_step(1000);
  s = flight_state();
  printf("  after 20 s at TOGA: %.0f kt over the ground, heading %.1f deg\n", s[field("gs_kn")], s[field("heading_deg")]);
  check(s[field("gs_kn")] > 60 && s[field("on_ground")] == 1, "brakes off and TOGA: it rolls, still on the runway");

  in[input("pitch")] = NAN;
  flight_step(1);
  check(isfinite(flight_state()[field("elevator_deg")]), "a NaN on the stick changes nothing");

  printf("%s\n", failures ? "FAILED" : "PASSED");
  return failures ? 1 : 0;
}
