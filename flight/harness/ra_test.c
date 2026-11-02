/* The radio altimeters (world.h, raFt) through the C API: what each reads, what the scripted crew flies by, and
 * that the flight goes on without them. Each reads the true height plus its bias, or nothing once failed; the
 * crew reads RA 1, or RA 2 when RA 1 has failed; height_true_ft is the truth, for a judge. GPLv3.
 *
 *   ra_test bias FT   an approach on radio altimeters reading FT feet off: ra_ft and ra2_ft read the true height
 *                     plus FT all the way down, and the crew, flying by them, begins its flare where they read
 *                     33 ft: FT feet late in true height when they read high, early when they read low
 *   ra_test one       RA 1 failed from the start: ra_ft reads nothing, ra2_ft the truth, and the crew, flying
 *                     by RA 2, flares at 33 ft of true height, as with both
 *   ra_test both      both failed a minute into the approach: neither reads anything from then on, and the
 *                     flight goes on under the computers, its true height still known
 *   ra_test none      both failed from the start, the flare commanded at 33 ft of true height (flare=external): with
 *                     no radio height the law flies on the trigger's, carried down by the vertical speed, so the
 *                     levers come back about 1.2 s on, at its 20 ft, not at once; and it touches down inside
 *                     the judge's 360 fpm (its verdict is the approach's too: on the 737, in direct law without
 *                     radio altimeters, the approach leaves the glideslope band at 50 ft, before the flare) */

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

static int field(const char* name) {
  for (int i = 0; i < flight_state_count(); ++i) {
    if (strcmp(flight_state_name(i), name) == 0) return i;
  }
  fprintf(stderr, "no slot %s\n", name);
  exit(2);
}

static double get(const char* name) {
  return flight_state()[field(name)];
}

/* An input's slot: for a scripted crew, what it did at the last step. */
static int input(const char* name) {
  for (int i = 0; i < flight_input_count(); ++i) {
    if (strcmp(flight_input_name(i), name) == 0) return i;
  }
  fprintf(stderr, "no input %s\n", name);
  exit(2);
}

static const char* phase(void) {
  return flight_state_text(field("phase"));
}

/* Flies the scripted crew's approach to its flare, tick by tick, checking each RA against the truth as it goes:
 * ra1 and ra2 are what each should read given the truth (NAN: nothing). Returns the true height and RA 1's
 * reading on the tick the flare began; worst is the largest miss between a reading and what it should be. */
static void toFlare(double bias1, double bias2, int ra1Failed, int ra2Failed, double* trueAt, double* readAt,
                    double* worst) {
  *trueAt = *readAt = NAN;
  *worst = 0;
  for (int tick = 0; tick < 6 * 60 * 50 && isnan(*trueAt); ++tick) {
    flight_step(1);
    const double truth = get("height_true_ft"), r1 = get("ra_ft"), r2 = get("ra2_ft");
    const double miss1 = ra1Failed ? (isnan(r1) ? 0 : INFINITY) : fabs(r1 - (truth + bias1));
    const double miss2 = ra2Failed ? (isnan(r2) ? 0 : INFINITY) : fabs(r2 - (truth + bias2));
    *worst = fmax(*worst, fmax(miss1, miss2));
    if (strcmp(phase(), "flare") == 0) {
      *trueAt = truth;
      *readAt = ra1Failed ? r2 : r1;
    }
  }
}

/* On to the stop: the touchdown, as the crew made it, and the gate's verdict on it. */
static void toStop(void) {
  double sink = NAN, past = NAN;
  for (int tick = 0; tick < 3 * 60 * 50; ++tick) {
    flight_step(1);
    if (isnan(sink) && get("on_ground") == 1) {
      sink = get("vs_fpm");
      past = get("thr_along_m");
    }
    if (!isnan(get("judge_stable"))) break;
  }
  printf("  touchdown at %.0f fpm, %.0f m past the threshold; the judge: %s\n", sink, -past,
         isnan(get("judge_stable")) ? "flying" : get("judge_stable") == 1 ? "STABLE" : "NOT STABLE");
  check(!isnan(sink), "and it lands", sink);
}

int main(int argc, char** argv) {
  const char* mode = argc > 1 ? argv[1] : "";
  char scenario[128];
  if (strcmp(mode, "bias") == 0 && argc > 2) {
    const double bias = atof(argv[2]);
    snprintf(scenario, sizeof scenario, "approach;ra_bias=%g", bias);
    if (flight_start_scenario(NULL, 1, scenario) != 0) return printf("FAILED: %s did not start\n", scenario), 1;
    double trueAt, readAt, worst;
    toFlare(bias, bias, 0, 0, &trueAt, &readAt, &worst);
    printf("  %s: the flare began at %.2f ft as the radio altimeters read, %.2f ft in truth\n", scenario, readAt, trueAt);
    check(worst < 1e-9, "both read the true height plus the bias, all the way down", worst);
    check(readAt > 32.5 && readAt < 33, "the crew began its flare where they read 33 ft", readAt);
    check(fabs(trueAt - (33 - bias)) < 0.5, bias > 0 ? "late, that much below 33 ft in truth" : "early, that much above 33 ft in truth",
          trueAt);
    toStop();
  } else if (strcmp(mode, "one") == 0) {
    if (flight_start_scenario(NULL, 1, "approach;fail=ra1") != 0) return printf("FAILED: did not start\n"), 1;
    double trueAt, readAt, worst;
    toFlare(0, 0, 1, 0, &trueAt, &readAt, &worst);
    printf("  RA 1 failed: the flare began at %.2f ft as RA 2 reads, %.2f ft in truth\n", readAt, trueAt);
    check(worst < 1e-9, "RA 1 reads nothing, RA 2 the truth, all the way down", worst);
    check(trueAt > 32.5 && trueAt < 33, "the crew, flying by RA 2, flares at 33 ft of true height", trueAt);
    toStop();
  } else if (strcmp(mode, "both") == 0) {
    if (flight_start_scenario(NULL, 1, "approach;fail=ra1+ra2@60") != 0) return printf("FAILED: did not start\n"), 1;
    flight_step(59 * 50);
    const double before1 = get("ra_ft"), before2 = get("ra2_ft");
    check(!isnan(before1) && !isnan(before2) && fabs(before1 - get("height_true_ft")) < 1e-9, "before the failure, both read the truth",
          before1);
    flight_step(2 * 50);
    const double high = get("height_true_ft");
    flight_step(28 * 50);
    printf("  both failed at 60 s: at 89 s, pitch %s, lateral %s, %.0f ft true\n", flight_state_text(field("pitch_law")),
           flight_state_text(field("lateral_law")), get("height_true_ft"));
    check(isnan(get("ra_ft")) && isnan(get("ra2_ft")), "after it, neither reads anything", get("ra_ft"));
    check(get("height_true_ft") < high && get("crashed") == 0, "and the flight goes on, still descending, its true height known",
          get("height_true_ft"));
  } else if (strcmp(mode, "none") == 0) {
    if (flight_start_scenario(NULL, 1, "approach;fail=ra1+ra2;flare=external;driver=test") != 0) {
      return printf("FAILED: did not start\n"), 1;
    }
    const int tla = input("tla_1");
    while (get("height_true_ft") >= 33 && get("crashed") == 0) flight_step(1);
    check(flight_command("flare") == 1, "with no radio altimeter, the flare commanded at 33 ft", get("height_true_ft"));
    const double began = get("t_s");
    double retardAt = NAN;
    for (int tick = 0; tick < 10 * 50 && isnan(retardAt); ++tick) {
      flight_step(1);
      if (flight_inputs()[tla] == 0) retardAt = get("t_s");
    }
    printf("  the levers came back %.2f s after the flare began\n", retardAt - began);
    check(retardAt - began > 0.8 && retardAt - began < 2.0,
          "on the trigger's height carried down, at its 20 ft, not at once on a height of zero", retardAt - began);
    double sink = NAN;
    for (int tick = 0; tick < 3 * 60 * 50; ++tick) {
      flight_step(1);
      if (isnan(sink) && get("on_ground") == 1) sink = get("vs_fpm");
      if (!isnan(get("judge_stable"))) break;
    }
    printf("  touchdown at %.0f fpm; the judge: %s\n", sink, get("judge_stable") == 1 ? "STABLE" : "NOT STABLE");
    check(sink > -360 && get("crashed") == 0, "and it touches down inside the judge's 360 fpm", sink);
  } else {
    fprintf(stderr, "ra_test bias FT | one | both | none\n");
    return 2;
  }
  printf("%s\n", failures ? "FAILED" : "PASSED");
  return failures ? 1 : 0;
}
