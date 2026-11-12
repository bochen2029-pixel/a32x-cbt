// return.cpp — the flight home (orbit_return.h). A stub: OC_AUTO_RETURN hands the craft back to the
// pilot until the return is built. GPLv3.

#include "internal.h"

#include <cstring>

namespace oc {

namespace {
double out[OC_RET_COUNT];
}

void returnReset(State& s) { s.ret = ReturnState{}; }
void returnEngage(State& s) { s.ret.phase = OC_RET_PH_NONE; }

void returnCrew(State& s, const Local& L, double* throttle) {
    (void)L;
    *throttle = 0;
    s.autoMode = OC_AUTO_OFF;   // not built yet: the pilot has it
}

void returnAfterStep(State& s) { (void)s; }

void returnWriteOut(const State& s) {
    std::memset(out, 0, sizeof out);
    out[OC_RET_PHASE] = s.ret.phase;
}

void returnHash(const State& s, unsigned& h) { hashBytes(h, &s.ret.phase, sizeof s.ret.phase); }

}   // namespace oc

extern "C" {
const double* oc_return_out(void) { return oc::out; }
int oc_return_out_len(void) { return OC_RET_COUNT; }
}
