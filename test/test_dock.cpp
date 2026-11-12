// The docking's tests (orbit_dock.h). A stub until the docking is built: its readouts' block is there.
// Run one by name or all; ctest runs each line below that reads "// TEST: <name>". GPLv3.
//
// TEST: readouts_block

#include "../core/orbit_core.h"
#include "../core/orbit_dock.h"

#include <cstdio>
#include <cstring>

int main(int argc, char** argv) {
    const char* name = argc > 1 ? argv[1] : "readouts_block";
    if (std::strcmp(name, "readouts_block") != 0) { std::printf("no test named %s\n", name); return 2; }
    oc_reset(32.91569901, -97.02600098, 180.3);
    const bool ok = oc_dock_out_len() == OC_DOCK_COUNT && oc_dock_out()[OC_DOCK_DOCKED] == 0;
    std::printf("%s\n", ok ? "ok" : "FAILED");
    return ok ? 0 : 1;
}
