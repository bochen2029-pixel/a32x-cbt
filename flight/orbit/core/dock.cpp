// dock.cpp — docking at the hub, and contact with the ring (orbit_dock.h). A stub: OC_AUTO_DOCK hands
// the craft back to the pilot until docking is built. GPLv3.

#include "internal.h"

#include <cstring>

namespace oc {

namespace {
double out[OC_DOCK_COUNT];
}

void dockReset(State& s) { s.dock = DockState{}; }
void dockEngage(State& s) { (void)s; }
bool dockRide(State& s) { return s.dock.docked != 0; }

void dockCrew(State& s, const Local& L, double* throttle) {
    (void)L;
    *throttle = 0;
    s.autoMode = OC_AUTO_OFF;   // not built yet: the pilot has it
}

void dockAfterStep(State& s) { (void)s; }

void dockWriteOut(const State& s) {
    std::memset(out, 0, sizeof out);
    out[OC_DOCK_DOCKED] = s.dock.docked;
}

void dockHash(const State& s, unsigned& h) { hashBytes(h, &s.dock.docked, sizeof s.dock.docked); }

}   // namespace oc

extern "C" {
const double* oc_dock_out(void) { return oc::out; }
int oc_dock_out_len(void) { return OC_DOCK_COUNT; }
void oc_undock(void) { oc::g.dock.docked = 0; }
}
