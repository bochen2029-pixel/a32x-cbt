// The sky's tests: where the Sun is, and (to come) the Moon. Run one by name or all; ctest runs each
// line below that reads "// TEST: <name>". GPLv3.
//
// TEST: sun_is_up_at_the_start

#include "../core/orbit_core.h"

#include <cmath>
#include <cstdio>
#include <cstring>

int main(int argc, char** argv) {
    const char* name = argc > 1 ? argv[1] : "sun_is_up_at_the_start";
    if (std::strcmp(name, "sun_is_up_at_the_start") != 0) { std::printf("no test named %s\n", name); return 2; }
    oc_reset(32.91569901, -97.02600098, 180.3);   // KDFW 17C, an early afternoon in November
    const double* o = oc_out();
    const double up = o[OC_SUN_U], south = -o[OC_SUN_N];
    const bool ok = std::fabs(std::hypot(o[OC_SUN_E], o[OC_SUN_N]) * std::hypot(1.0, 0.0) - std::sqrt(1 - up * up)) < 1e-9 &&
                    up > 0.4 && up < 0.8 && south > 0.5;
    std::printf("sun: up %.3f, south %.3f — %s\n", up, south, ok ? "ok" : "FAILED");
    return ok ? 0 : 1;
}
