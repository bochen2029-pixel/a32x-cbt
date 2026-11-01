/* An approach start on LSZH 14's ILS, through the C API: the aircraft begins where the scenario says,
 * the beams read what they should there, the computers come up in normal law in the air, and with the
 * stick let go the trimmed aircraft stays on the path. GPLv3.
 *
 *   ils_test "<scenario>" <loc dots expected> <gs dots expected> */

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
  for (int i = 0; flight_state_name(i); ++i) {
    if (strcmp(flight_state_name(i), name) == 0) return i;
  }
  fprintf(stderr, "no state slot %s\n", name);
  exit(2);
}

int main(int argc, char** argv) {
  if (argc != 4) {
    fprintf(stderr, "ils_test <scenario> <loc dots> <gs dots>\n");
    return 2;
  }
  const double locWanted = atof(argv[2]), gsWanted = atof(argv[3]);
  check(flight_start_scenario(NULL, 0, "approach;nonsense=1") == -3, "a scenario not understood is refused", 0);
  check(flight_start_scenario(NULL, 0, "runway;fail=adr4") == -3, "so is a failure of a unit there is not", 0);
  check(flight_start_scenario(NULL, 0, "runway;fail=ir1+ir2@soon") == -3, "and one at no time", 0);
  check(flight_start_scenario(NULL, 0, "runway;fail=") == -3, "and a failure of nothing", 0);
  if (flight_start_scenario(NULL, 0, argv[1]) != 0) {
    printf("FAILED: the scenario did not start\n");
    return 1;
  }
  const double* s = flight_state();
  printf("  start: %.2f nm from the threshold, %.0f ft above it, %.0f kt, heading %.1f\n",
         s[field("thr_along_m")] / 1852, s[field("thr_height_ft")], s[field("cas_kn")], s[field("heading_deg")]);
  check(fabs(s[field("loc_dots")] - locWanted) < 0.05, "the localizer reads where the scenario put it", s[field("loc_dots")]);
  check(fabs(s[field("gs_dots")] - gsWanted) < 0.1, "the glideslope too", s[field("gs_dots")]);
  check(s[field("loc_valid")] == 1 && s[field("gs_valid")] == 1, "both beams received", s[field("gs_valid")]);
  check(fabs(s[field("rwy_heading_deg")] - 180.3) < 1e-9 && fabs(s[field("rwy_elev_ft")] - 562) < 1e-9,
        "the runway is KDFW 17C, the main airport", s[field("rwy_heading_deg")]);
  check(s[field("on_ground")] == 0 && s[field("gear_pos")] > 0.999, "in the air, gear down", s[field("gear_pos")]);

  flight_step(150);
  s = flight_state();
  check(s[field("healthy")] == 1, "every computer healthy in the air after three seconds", s[field("healthy")]);
  check(strcmp(flight_state_text(field("pitch_law")), "normal") == 0, "pitch normal law", s[field("pitch_law")]);

  /* Hands off for 30 s: normal law holds the flight path the trim began on, so the beams barely move. */
  double worstGs = 0, worstPitch = 0;
  for (int k = 0; k < 30; ++k) {
    flight_step(50);
    s = flight_state();
    if (fabs(s[field("gs_dots")] - gsWanted) > worstGs) worstGs = fabs(s[field("gs_dots")] - gsWanted);
    if (fabs(s[field("pitch_deg")]) > worstPitch) worstPitch = fabs(s[field("pitch_deg")]);
  }
  printf("  after 33 s hands off: %.2f nm out, %.0f ft, %.0f kt, loc %.2f, gs %.2f dots\n", s[field("thr_along_m")] / 1852,
         s[field("thr_height_ft")], s[field("cas_kn")], s[field("loc_dots")], s[field("gs_dots")]);
  check(worstGs < 0.5, "hands off, the trimmed aircraft stays within half a dot of where it began", worstGs);
  check(worstPitch < 8, "and its pitch stays an approach's", worstPitch);
  check(s[field("crashed")] == 0, "and nothing hit the ground", s[field("crashed")]);

  printf("%s\n", failures ? "FAILED" : "PASSED");
  return failures ? 1 : 0;
}
