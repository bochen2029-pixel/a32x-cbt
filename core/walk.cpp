// walk.cpp — a person inside the ring (orbit_walk.h). A stub: the clock runs and nothing else. GPLv3.

#include "internal.h"
#include "orbit_walk.h"

#include <cstring>

namespace {
long long steps = 0;
double out[OC_WALK_COUNT];

void writeOut() {
    std::memset(out, 0, sizeof out);
    out[OC_WALK_T] = steps * OC_DT;
}
}   // namespace

extern "C" {
void oc_walk_reset(void) { steps = 0; writeOut(); }
void oc_walk_controls(double fwd, double right, double turn, int jump, int use) { (void)fwd; (void)right; (void)turn; (void)jump; (void)use; }
void oc_walk_step(int n) { steps += n; writeOut(); }
const double* oc_walk_out(void) { return out; }
int oc_walk_out_len(void) { return OC_WALK_COUNT; }
unsigned oc_walk_hash(void) { unsigned h = 2166136261u; oc::hashBytes(h, &steps, sizeof steps); return h; }
}
