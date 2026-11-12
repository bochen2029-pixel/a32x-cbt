// The walk's tests (orbit_walk.h). A stub until the walk is built: its readouts' block is there.
// Run one by name or all; ctest runs each line below that reads "// TEST: <name>". GPLv3.
//
// TEST: readouts_block

#include "../core/orbit_core.h"
#include "../core/orbit_walk.h"

#include <cstdio>
#include <cstring>

int main(int argc, char** argv) {
    const char* name = argc > 1 ? argv[1] : "readouts_block";
    if (std::strcmp(name, "readouts_block") != 0) { std::printf("no test named %s\n", name); return 2; }
    oc_walk_reset();
    oc_walk_step(50);
    const bool ok = oc_walk_out_len() == OC_WALK_COUNT && oc_walk_out()[OC_WALK_T] > 0.99 && oc_walk_out()[OC_WALK_T] < 1.01;
    std::printf("%s\n", ok ? "ok" : "FAILED");
    return ok ? 0 : 1;
}
