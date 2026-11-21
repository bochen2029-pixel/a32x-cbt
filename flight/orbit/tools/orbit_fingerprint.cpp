// orbit_fingerprint — the state's hash and every readout block's digest at 3,756 marks along twelve flights
// (the crew to orbit and on, three flights home, docking and home from the port, the deck, a pilot's climb
// and rolls), to show that a change to the core leaves them bit for bit as they were: build it at two
// commits, run both, and diff (INVARIANTS.md, O15). Not part of the page. GPLv3.
#include "../core/orbit_core.h"
#include "../core/orbit_deck.h"
#include "../core/orbit_dock.h"
#include "../core/orbit_return.h"

#include <cstdio>
#include <cstring>

namespace {

const double LAT = 32.91569901, LON = -97.02600098, HDG = 180.3;

unsigned digestOf(const double* v, int n) {   // FNV-1a over the readouts' bytes
    unsigned h = 2166136261u;
    const unsigned char* b = reinterpret_cast<const unsigned char*>(v);
    for (unsigned long i = 0; i < sizeof(double) * (unsigned long)n; ++i) { h ^= b[i]; h *= 16777619u; }
    return h;
}

void mark(const char* what) {
    std::printf("%s t=%.2f hash=%08x out=%08x ret=%08x dock=%08x deck=%08x\n", what, oc_out()[OC_T], oc_hash(), digestOf(oc_out(), oc_out_len()),
                digestOf(oc_return_out(), oc_return_out_len()), digestOf(oc_dock_out(), oc_dock_out_len()), digestOf(oc_deck_out(), oc_deck_out_len()));
}

void toOrbit() {
    oc_reset(LAT, LON, HDG);
    while (oc_out()[OC_PHASE] != OC_PH_ORBIT && oc_out()[OC_T] < 1500) { oc_step(500); mark("crew"); }
}

void home(double engage) {
    toOrbit();
    while (oc_out()[OC_T] < engage) oc_step(50);
    oc_auto(OC_AUTO_RETURN);
    mark("engage");
    for (int i = 0; i < 100000 && oc_out()[OC_CRASHED] == 0 && oc_return_out()[OC_RET_PHASE] != OC_RET_PH_STOPPED; ++i) {
        oc_step(2500);
        mark("home");
    }
    mark("end");
}

}   // namespace

int main() {
    toOrbit();
    for (int i = 0; i < 40; ++i) { oc_step(2500); mark("orbit"); }
    home(800);
    home(2620);
    home(3700);
    // the approach and docking
    toOrbit();
    oc_auto(OC_AUTO_DOCK);
    for (int i = 0; i < 80; ++i) { oc_step(2500); mark("dock"); }
    oc_undock();
    oc_auto(OC_AUTO_RETURN);
    for (int i = 0; i < 100000 && oc_out()[OC_CRASHED] == 0 && oc_return_out()[OC_RET_PHASE] != OC_RET_PH_STOPPED; ++i) { oc_step(2500); mark("undocked-home"); }
    // the deck
    toOrbit();
    oc_auto(OC_AUTO_DECK);
    for (int i = 0; i < 80; ++i) { oc_step(2500); mark("deck"); }
    // a pilot in the air: a hand-flown climb, then a dive, rolls and the thrusters
    oc_reset(LAT, LON, HDG);
    oc_step(1500);
    oc_auto(OC_AUTO_OFF);
    oc_controls(0, 0, 0, 1, 0, 0, 0, 1, 0);
    oc_step(1000); mark("pilot");
    oc_controls(0.6, 0, 0.1, 1, 0, 0, 0, 0, 0);
    oc_step(1500); mark("pilot");
    oc_controls(-0.3, 0.8, -0.2, 0.7, 0.5, -0.5, 1, 0, 0);
    oc_step(3000); mark("pilot");
    oc_controls(0, -0.5, 0, 0.2, 0, 0, 0, 0, 0);
    for (int i = 0; i < 20; ++i) { oc_step(1000); mark("pilot"); }
    return 0;
}
