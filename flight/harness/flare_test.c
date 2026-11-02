/* The scripted crew's flare (world.h, FlareOptions) through the C API, as a driver outside the harness reaches it:
 * what begins it, what a command does, the floor under it, the law on the trigger, and the wind it lands in. GPLv3.
 *
 *   flare_test formula    today's crew: its formula begins the flare where the radio height reads 33 ft; it takes no
 *                         command; it lands STABLE; its crew line says script
 *   flare_test command    flare=external: the formula never begins it, past 33 ft and on; a command at 31 ft does,
 *                         at the next step, once; it lands STABLE; the crew line names the driver
 *   flare_test floor      flare=external with nobody commanding and floor=20: the floor begins it at 20 ft of true
 *                         height, and says so
 *   flare_test time       flare_law=time: today's law flown on the height the trigger stood for, 33 ft, carried
 *                         down by the vertical speed, reading no altimeter; begun by the formula, it lands STABLE
 *   flare_test options    what the scenario text refuses, and a command on the runway, which nothing takes
 *   flare_test wind FROM/KT [HEAD CROSS]   the wind along and across the runway, + a headwind and + from the right */

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

/* Steps until the true height is below `below` or the flare has begun; returns whether the flare began. */
static int descendTo(double below) {
  for (int tick = 0; tick < 6 * 60 * 50; ++tick) {
    if (get("flare_by") != 0 || get("height_true_ft") < below) return get("flare_by") != 0;
    flight_step(1);
  }
  return get("flare_by") != 0;
}

/* Steps tick by tick until the flare begins; returns the true height then. */
static double toFlare(void) {
  for (int tick = 0; tick < 6 * 60 * 50; ++tick) {
    flight_step(1);
    if (get("flare_by") != 0) return get("height_true_ft");
  }
  return NAN;
}

/* On to the stop: the first touchdown and the gate's verdict. */
static double toStop(void) {
  double sink = NAN;
  for (int tick = 0; tick < 3 * 60 * 50; ++tick) {
    flight_step(1);
    if (isnan(sink) && get("on_ground") == 1) sink = get("vs_fpm");
    if (!isnan(get("judge_stable"))) break;
  }
  printf("  touchdown at %.0f fpm; the judge: %s\n", sink,
         isnan(get("judge_stable")) ? "flying" : get("judge_stable") == 1 ? "STABLE" : "NOT STABLE");
  return get("judge_stable");
}

static const char* by(void) {
  return flight_state_text(field("flare_by"));
}

int main(int argc, char** argv) {
  const char* mode = argc > 1 ? argv[1] : "";
  if (strcmp(mode, "formula") == 0) {
    if (flight_start_scenario(NULL, 1, "approach") != 0) return printf("FAILED: did not start\n"), 1;
    check(strcmp(flight_crew(), "script") == 0, "today's crew flies it: its crew line says script", 0);
    check(flight_command("flare") == 0, "and it takes no command: its formula begins the flare", 0);
    const double at = toFlare();
    printf("  the flare begun by the %s at %.2f ft\n", by(), at);
    check(strcmp(by(), "formula") == 0 && at > 32 && at < 33, "where the radio height read 33 ft", at);
    check(get("flaring") == 1, "and the aircraft is in it", get("flaring"));
    check(toStop() == 1, "it lands STABLE", get("judge_stable"));
  } else if (strcmp(mode, "command") == 0) {
    if (flight_start_scenario(NULL, 1, "approach;flare=external;driver=test") != 0) return printf("FAILED: did not start\n"), 1;
    check(strcmp(flight_crew(), "test") == 0, "the crew line names the driver", 0);
    check(!descendTo(31), "with flare=external the formula never begins it, past 33 ft and down to 31", get("height_true_ft"));
    const double at = get("height_true_ft");
    check(flight_command("flare") == 1, "a command at 31 ft is taken", at);
    check(get("flare_by") == 0, "and acts at the next step, not before", get("flare_by"));
    flight_step(1);
    printf("  the flare begun by the %s at %.2f ft\n", by(), get("height_true_ft"));
    check(strcmp(by(), "command") == 0 && get("flaring") == 1, "which begins the flare", get("flare_by"));
    check(flight_command("flare") == 0, "once: a second command is not taken", 0);
    check(toStop() == 1, "it lands STABLE", get("judge_stable"));
  } else if (strcmp(mode, "floor") == 0) {
    if (flight_start_scenario(NULL, 1, "approach;flare=external;floor=20") != 0) return printf("FAILED: did not start\n"), 1;
    check(strcmp(flight_crew(), "external") == 0, "a driver unnamed is called external", 0);
    const double at = toFlare();
    printf("  nobody commanding, the flare begun by the %s at %.2f ft\n", by(), at);
    check(strcmp(by(), "floor") == 0 && at > 19.5 && at < 20, "the floor begins it at 20 ft of true height", at);
    toStop();
    check(get("crashed") == 0, "and it lands", get("crashed"));
  } else if (strcmp(mode, "time") == 0) {
    if (flight_start_scenario(NULL, 1, "approach;flare_law=time") != 0) return printf("FAILED: did not start\n"), 1;
    const double at = toFlare();
    printf("  the flare begun by the %s at %.2f ft, flown on the height that stands for\n", by(), at);
    check(strcmp(by(), "formula") == 0, "the formula begins it, as today", at);
    check(toStop() == 1, "and on the trigger's height, carried down by the vertical speed, it lands STABLE", get("judge_stable"));
  } else if (strcmp(mode, "options") == 0) {
    const char* refused[] = {"approach;driver=jev", "approach;flare=sideways", "approach;flare_law=fast",
                             "approach;floor=500", "approach;floor=x", "approach;flare=external;driver=Jev",
                             "approach;flare=external;driver=a,b"};
    for (size_t k = 0; k < sizeof refused / sizeof refused[0]; ++k) {
      check(flight_start_scenario(NULL, 1, refused[k]) == -3, refused[k], 0);
    }
    check(flight_command("flare") == 0 && flight_crew() == NULL, "before a flight, nothing takes a command", 0);
    if (flight_start_scenario(NULL, 1, "runway;flare=external;driver=jev;flare_law=time;floor=20") != 0) {
      return printf("FAILED: the runway start with the flare's options did not start\n"), 1;
    }
    flight_step(50);
    check(flight_command("flare") == 0 && get("flare_by") == 0, "on the runway, parked, a command is not taken", get("flare_by"));
  } else if (strcmp(mode, "wind") == 0 && argc > 4) {
    char scenario[64];
    snprintf(scenario, sizeof scenario, "approach;wind=%s", argv[2]);
    if (flight_start_scenario(NULL, 1, scenario) != 0) return printf("FAILED: %s did not start\n", scenario), 1;
    flight_step(50);
    const double head = get("wind_head_kn"), cross = get("wind_cross_kn");
    printf("  %s on runway heading %.1f: %.2f kt along, %.2f kt across\n", scenario, get("rwy_heading_deg"), head, cross);
    check(fabs(head - atof(argv[3])) < 0.5, "the headwind", head);
    check(fabs(cross - atof(argv[4])) < 0.5, "the crosswind, + from the right", cross);
  } else {
    fprintf(stderr, "flare_test formula | command | floor | time | options | wind FROM/KT HEAD CROSS\n");
    return 2;
  }
  printf("%s\n", failures ? "FAILED" : "PASSED");
  return failures ? 1 : 0;
}
