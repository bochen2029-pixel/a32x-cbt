/* The gate's judge through the C API, as the browser reads it (judge.h; ROADMAP.md, P7: how a hand-flown
 * ILS is judged). Stepped one tick at a time, the state's judge_* slots and flight_debrief() are watched
 * from the start to the stop. GPLv3.
 *
 *   judge_test scripted   the scripted crew flies 17C's ILS to a stop: judged STABLE, every band held
 *   judge_test hands-off  nobody flies it: the trimmed aircraft drifts off the beams and never flares;
 *                         the judge says what broke, the hard touchdown among it, and once the test has
 *                         stopped it, that the approach was NOT STABLE
 *   judge_test runway     a runway start: there is no approach to judge */

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "core.h"

static int failures = 0;

static void check(int ok, const char* what, double value) {
  printf("  %s  %s (%.3f)\n", ok ? "pass" : "FAIL", what, value);
  if (!ok) ++failures;
}

static int slot(const char* name, int (*count)(void), const char* (*nameAt)(int)) {
  for (int i = 0; i < count(); ++i) {
    if (strcmp(nameAt(i), name) == 0) return i;
  }
  fprintf(stderr, "no slot %s\n", name);
  exit(2);
}

static int field(const char* name) {
  return slot(name, flight_state_count, flight_state_name);
}

static int input(const char* name) {
  return slot(name, flight_input_count, flight_input_name);
}

int main(int argc, char** argv) {
  const char* mode = argc > 1 ? argv[1] : "";
  const int scripted = strcmp(mode, "scripted") == 0, handsOff = strcmp(mode, "hands-off") == 0;
  const int runway = strcmp(mode, "runway") == 0;
  if (!scripted && !handsOff && !runway) {
    fprintf(stderr, "judge_test scripted | hands-off | runway\n");
    return 2;
  }
  const char* airframe = getenv("FLIGHT_AIRFRAME");
  const int a737 = airframe && strcmp(airframe, "737") == 0;
  if (flight_start_scenario(NULL, scripted, runway ? "runway" : "approach") != 0) {
    printf("FAILED: the scenario did not start\n");
    return 1;
  }

  if (runway) {
    flight_step(500);
    const double* s = flight_state();
    check(s[field("judge_window")] == 0 && isnan(s[field("judge_in_bands")]), "no stabilised window on the runway",
          s[field("judge_window")]);
    check(isnan(s[field("judge_stable")]), "and no verdict", s[field("judge_stable")]);
    check(strstr(flight_debrief(), "no approach to judge") != NULL, "the debrief says there is no approach to judge", 0);
    printf("%s\n", failures ? "FAILED" : "PASSED");
    return failures ? 1 : 0;
  }

  check(strstr(flight_debrief(), "flying") != NULL && strstr(flight_debrief(), "FAIL") == NULL,
        "before the window, the debrief says flying and nothing is broken", 0);
  long long windowTicks = 0, outOfBands = 0;
  int entered = 0, left = 0;
  double vappAtEntry = NAN, vlsAtEntry = NAN, touchdownM = NAN;
  int touchedDown = 0;
  const double* s = flight_state();
  for (int tick = 0; tick < 6 * 60 * 50; ++tick) {
    if (handsOff && s[field("on_ground")] == 1) {  /* the test stops it on the runway: idle, brakes */
      double* in = flight_inputs();
      in[input("tla_1")] = in[input("tla_2")] = 0;
      in[input("brakes")] = 1;
    }
    flight_step(1);
    s = flight_state();
    const double window = s[field("judge_window")];
    if (window == 1) {
      if (!entered) {
        entered = 1;
        vappAtEntry = s[field("vapp_kn")];
        vlsAtEntry = s[field("vls_kn")];
      }
      ++windowTicks;
      if (s[field("judge_in_bands")] != 1) ++outOfBands;
    } else if (entered && !left) {
      left = 1;
    }
    if (!touchedDown && s[field("on_ground")] == 1) {
      touchedDown = 1;
      touchdownM = s[field("judge_touchdown_m")];
    }
    if (!isnan(s[field("judge_stable")])) break;
  }
  const char* debrief = flight_debrief();
  printf("%s", debrief);

  check(entered && left, "the stabilised window was entered and left", (double)windowTicks / 50);
  if (a737) {
    check(vappAtEntry == 140, "on the 737, whose FAC computes an A320's speeds, Vapp is the scripted crew's 140 kt", vappAtEntry);
  } else {
    check(vlsAtEntry > 110 && vlsAtEntry < 140, "on the A320, the FAC's VLS at 1,000 ft", vlsAtEntry);
    check(vappAtEntry == vlsAtEntry + 5, "and Vapp is VLS + 5 kt, kept from there", vappAtEntry);
  }
  check(touchdownM > 0, "the touchdown point, past the threshold", touchdownM);
  if (scripted) {
    check(outOfBands == 0, "the scripted crew held every window band at every step", (double)outOfBands);
    check(s[field("judge_stable")] == 1, "stopped, the verdict is STABLE", s[field("judge_stable")]);
    check(strstr(debrief, "\nSTABLE\n") != NULL && strstr(debrief, "FAIL") == NULL && strstr(debrief, "....") == NULL,
          "and the debrief says so, every band judged and held", 0);
  } else {
    /* the in-band slot goes false exactly when a window band breaks, as the debrief tells it */
    const int windowBandBroken = strstr(debrief, "FAIL  localizer") || strstr(debrief, "FAIL  glideslope") ||
                                 strstr(debrief, "FAIL  sink rate under") || strstr(debrief, "FAIL  gear down") ||
                                 strstr(debrief, "FAIL  speed") || strstr(debrief, "FAIL  bank");
    check(windowBandBroken == (outOfBands > 0), "the in-band slot went false exactly when a window band broke",
          (double)outOfBands);
    check(strstr(debrief, "FAIL  sink rate at touchdown under 360 fpm") != NULL, "it never flared: a hard touchdown", 0);
    check(s[field("judge_stable")] == 0, "stopped, the verdict is NOT STABLE", s[field("judge_stable")]);
    check(strstr(debrief, "NOT STABLE") != NULL, "and the debrief says so", 0);
  }
  printf("%s\n", failures ? "FAILED" : "PASSED");
  return failures ? 1 : 0;
}
