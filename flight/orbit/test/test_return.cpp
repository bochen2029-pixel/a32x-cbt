// The flight home's tests (orbit_return.h). A stub until the flight home is built: its readouts' block is there.
// Run one by name or all; ctest runs each line below that reads "// TEST: <name>". GPLv3.
//
// TEST: readouts_block

#include "../core/orbit_core.h"
#include "../core/orbit_return.h"

#include <cstdio>
#include <cstring>

int main(int argc, char** argv) {
    const char* name = argc > 1 ? argv[1] : "readouts_block";
    if (std::strcmp(name, "readouts_block") != 0) { std::printf("no test named %s\n", name); return 2; }
    oc_reset(32.91569901, -97.02600098, 180.3);
    const bool ok = oc_return_out_len() == OC_RET_COUNT && oc_return_out()[OC_RET_PHASE] == OC_RET_PH_NONE;
    std::printf("%s\n", ok ? "ok" : "FAILED");
    return ok ? 0 : 1;
}
