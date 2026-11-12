// dock_state.h — dock.cpp's state, kept in oc::State so a run replays. Owned by dock.cpp. GPLv3.
#pragma once

namespace oc {

struct DockState {
    int held;          // 0 free; 1 held by the hub's port; 2 wrecked on the ring and carried by it
    int phase;         // OC_DOCK_PH_*
    int contact;       // 1 while the probe's head presses on the port's face
    int released;      // 1 from oc_undock until the head is clear of the face
    int verdict;       // OC_DOCK_V_*: the last contact's
    int hit, hitPart;  // OC_DOCK_HIT_*, OC_DOCK_PART_*: a crash on the ring
    int refused;       // OC_DOCK_NO_*: why the crew's docking was last refused
    int autoBefore;    // who was flying before the crew's docking was asked for: a refusal hands back to them
    long long heldAt;  // the step at which the port, or the wreck's place, took hold
    V3 p0;             // the craft in the ring's frame then: what the latches draw in from, or where the wreck lies
    Q q0;              // its attitude there, body -> the ring's frame
    double gHold;      // m: the gap the crew keeps while lining up
    double cT, cSpeed, cOffset, cSlide, cAngle, cRoll, cRollRate;   // the last contact, SI and radians
};

}   // namespace oc
