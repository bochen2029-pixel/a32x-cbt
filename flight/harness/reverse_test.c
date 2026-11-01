/* Ground idle and reverse thrust through the C API (airframe.cpp): on an airframe whose file has them (our
 * A320), ground idle on the ground and approach idle in the air, and reversers that deploy only on the
 * ground with the levers below idle, in 2 s, give reverse idle until they are out, then reverse thrust to
 * MAX REV; on one without them (JSBSim's 737), one idle, and below idle is idle. GPLv3.
 *
 *   reverse_test ground   a runway start, the crew's hands on the levers: deploy, push back; then the
 *                         levers forward with the doors out, and again with them half out: each
 *                         time the engines hold idle until the doors have stowed
 *   reverse_test air      an air start: in flight the levers in reverse deploy nothing */

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

static double get(const char* name) {
  return flight_state()[field(name)];
}

static void set(const char* name, double v) {
  flight_inputs()[slot(name, flight_input_count, flight_input_name)] = v;
}

static void levers(double tla) {
  set("tla_1", tla);
  set("tla_2", tla);
}

/* The engines' N1, the higher of the two. */
static double n1(void) {
  return fmax(get("n1_1"), get("n1_2"));
}

/* The levers to TOGA wherever the reversers are: a step at a time until both are stowed, then 5 s more. How
 * long the stowing took, the highest N1 while either was out, N1 when stowed, and N1 5 s later. */
static void togaUntilStowed(double* stowS, double* highest, double* atStow, double* later) {
  levers(45);
  int k = 0;
  *highest = 0;
  while (k < 3 * 50 && (get("reverser_1") > 0 || get("reverser_2") > 0)) {
    flight_step(1);
    ++k;
    if (get("reverser_1") > 0 || get("reverser_2") > 0) *highest = fmax(*highest, n1());
  }
  *stowS = k / 50.0;
  *atStow = n1();
  flight_step(5 * 50);
  *later = n1();
}

/* Seconds of flight, and how far back along the runway the aircraft went (+ toward the threshold). */
static double roll(double seconds) {
  const double before = get("thr_along_m");
  flight_step((int)(seconds * 50 + 0.5));
  return get("thr_along_m") - before;
}

int main(int argc, char** argv) {
  const char* mode = argc > 1 ? argv[1] : "";
  const int ground = strcmp(mode, "ground") == 0, air = strcmp(mode, "air") == 0;
  if (!ground && !air) {
    fprintf(stderr, "reverse_test ground | air\n");
    return 2;
  }
  const char* airframe = getenv("FLIGHT_AIRFRAME");
  const int has = !(airframe && strcmp(airframe, "737") == 0);  /* our A320 has them; the 737 has not */
  if (flight_start_scenario(NULL, 0, ground ? "runway" : "air;alt=3000;cas=180;lever=1") != 0) {
    printf("FAILED: the scenario did not start\n");
    return 1;
  }
  printf("  %s: %s\n", flight_airframe(), has ? "ground idle and reverse" : "neither");

  if (air) {
    levers(-20);
    flight_step(5 * 50);
    check(get("on_ground") == 0, "in the air", get("ra_ft"));
    check(get("reverser_1") == 0 && get("reverser_2") == 0, "the levers in reverse deploy nothing in flight",
          get("reverser_1"));
    check(get("ground_idle") == 0, "and the idle is approach idle", get("ground_idle"));
    printf("%s\n", failures ? "FAILED" : "PASSED");
    return failures ? 1 : 0;
  }

  set("brakes", 1);
  levers(0);
  flight_step(2 * 50);
  check(get("ground_idle") == (has ? 1 : 0), has ? "parked: ground idle" : "parked: one idle, nothing to select",
        get("ground_idle"));

  /* The levers to MAX REV on the brakes: the reversers take their 2 s to come out, and until they are out
   * the engines stay at idle, whatever the levers ask. */
  const double idleN1 = n1();
  levers(-20);
  double half = NAN, highestDeploying = 0;
  for (int k = 1; k <= 105; ++k) {
    flight_step(1);
    if (k == 50) half = get("reverser_1");
    if (get("reverser_1") < 1 || get("reverser_2") < 1) highestDeploying = fmax(highestDeploying, n1());
  }
  const double out = get("reverser_1");
  if (has) {
    check(half > 0.4 && half < 0.6, "a second after the levers go back, the reversers are half out", half);
    check(out == 1 && get("reverser_2") == 1, "and fully out at 2 s", out);
    check(highestDeploying <= idleN1 + 0.5, "and until they are, the engines stay at idle", highestDeploying);
  } else {
    check(out == 0 && get("reverser_2") == 0, "no reversers to deploy", out);
  }

  /* Off the brakes from a standstill, 12 s at each: reverse idle barely stirs an aircraft on its wheels,
   * MAX REV, once the engines have spooled up, pushes it back. */
  set("brakes", 0);
  levers(-6);
  const double atRevIdle = roll(12);
  set("brakes", 1);
  flight_step(10 * 50);  /* to a stop */
  set("brakes", 0);
  levers(-20);
  const double atMaxRev = roll(12);
  printf("  12 s off the brakes: %.2f m back at reverse idle, %.2f m at MAX REV\n", atRevIdle, atMaxRev);
  if (has) {
    check(atMaxRev > 1, "MAX REV pushes the aircraft back", atMaxRev);
    check(atMaxRev > atRevIdle + 1, "further than reverse idle does", atMaxRev - atRevIdle);
  } else {
    check(atRevIdle < 0.5 && atMaxRev < 0.5, "below idle is idle: it does not go back", atMaxRev);
  }

  /* From MAX REV straight to TOGA, on the brakes: the doors stow in 2 s, and until they have, the engines
   * run down towards idle rather than up, so that no forward thrust goes out through open doors; then they
   * spool up. Without reversers, nothing holds them back. */
  set("brakes", 1);
  double stowS = 0, highest = 0, atStow = 0, later = 0;
  const double atMaxRevN1 = n1();
  togaUntilStowed(&stowS, &highest, &atStow, &later);
  printf("  MAX REV to TOGA: N1 %.1f %%; the doors stowed after %.2f s, N1 at most %.1f %% meanwhile, %.1f %% then, "
         "%.1f %% 5 s later\n", atMaxRevN1, stowS, highest, atStow, later);
  if (has) {
    check(stowS >= 1.9 && stowS <= 2.1, "the levers forward stow the reversers in 2 s", stowS);
    check(highest <= atMaxRevN1 + 0.1, "and until they have, the engines do not spool up", highest);
    check(later > atStow + 10, "then they do", later);
  } else {
    check(stowS == 0, "no reversers to stow", stowS);
    check(later > atMaxRevN1 + 10, "and nothing holds the engines back", later);
  }

  /* A change of mind: back to idle, the levers to MAX REV, and a second later, the doors half out, to TOGA.
   * The doors go back in from where they are, and the engines hold idle until they are stowed. */
  levers(0);
  flight_step(10 * 50);
  const double idleAgainN1 = n1();
  levers(-20);
  flight_step(50);
  const double halfOut = get("reverser_1");
  togaUntilStowed(&stowS, &highest, &atStow, &later);
  printf("  a change of mind: the doors %.2f out after a second, in again %.2f s after the push, N1 at most %.1f %% "
         "meanwhile against %.1f %% at idle, %.1f %% 5 s later\n", halfOut, stowS, highest, idleAgainN1, later);
  if (has) {
    check(halfOut > 0.4 && halfOut < 0.6 && stowS >= 0.9 && stowS <= 1.1,
          "pushed to TOGA a second after MAX REV, the doors go back in from half out, in a second", stowS);
    check(highest <= idleAgainN1 + 0.5, "and the engines stay at idle until they are in", highest);
    check(later > atStow + 10, "then they spool up", later);
  }
  printf("%s\n", failures ? "FAILED" : "PASSED");
  return failures ? 1 : 0;
}
