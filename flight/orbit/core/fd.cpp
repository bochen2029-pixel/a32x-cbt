// fd.cpp — the flight director (orbit_fd.h): the crew's guidance, run in the shadow while a person flies.
//
// Each step, before the step's law, the guidance for the phase the craft is in is asked what it would
// command, on a copy of the state that carries the guidance's own memory (fd.cpp keeps it in s.fd): the
// crew to orbit's crew() or the flight home's returnCrew(), the very functions the crews fly by. What the
// guidance aimed at (internal.h, Aim) is the director's attitude; the throttle and the gear are what it set.
// Nothing of the flight is written, only s.fd: a law run on a copy changes the copy.
//
// While the crew to orbit flies, the same shadow runs beside it, and its command is the crew's own; while
// the crew flies home, its command is read after its law (the flight home's guidance is dear to run twice:
// its predictor flies the rest of the entry every two seconds). Taking the controls from either, the shadow
// carries on from the crew's memory as it stands; from anyone else, or with the director switched on, it
// starts as the crew would if handed the craft (oc_auto, returnEngage).
//
// GPLv3.

#include "internal.h"

#include <cmath>

namespace oc {

namespace {

enum { SRC_NONE = 0, SRC_CREW = 1, SRC_HOME = 2 };

// Near the Ring the docking reticle and the deck's display say what to fly (orbit_dock.h, orbit_deck.h):
// within the deck's reach of its centre, the director says nothing.
const double NEAR_RING = std::hypot(OC_RING_FLOOR_M + 500.0, OC_RING_WIDTH_M / 2 + 1500.0);

struct Att { double pitch, heading, bank; };

// An attitude's pitch, heading and bank where the craft is, reckoned as localOf reckons the craft's own.
Att eulerOf(Q q, const Local& L) {
    const V3 xb = rot(q, {1, 0, 0}), yb = rot(q, {0, 1, 0}), zb = rot(q, {0, 0, 1});
    return {std::asin(clampd(dot(xb, L.up), -1, 1)), std::atan2(dot(xb, L.east), dot(xb, L.north)), std::atan2(-dot(yb, L.up), -dot(zb, L.up))};
}

bool nearRing(const State& s) { return ring.valid && norm(s.r - ringPos(timeOf(s))) < NEAR_RING; }

// The step's command, from what the guidance's law aimed at: an attitude, or the air law's pitch and bank
// with the heading the craft's own (in the air the law turns the craft by its bank). A law that aimed at
// nothing this step (the crew's last step of the burn, which only cuts the engine) leaves the last attitude.
void command(FdState& F, const Local& L, double throttle, int phase) {
    if (aim.set && aim.air) { F.pitch = aim.theta; F.heading = L.heading; F.bank = aim.phi; }
    else if (aim.set) {
        const Att a = eulerOf(aim.q, L);
        F.pitch = a.pitch; F.heading = a.heading; F.bank = a.bank;
    }
    F.throttle = clampd(throttle, 0, 1);
    F.fdPhase = phase;
    F.alpha = F.liftBank = 0;
    F.valid = 1;
}

// ---- the crew to orbit --------------------------------------------------------------------------------

// Its memory as it stands in the state: as the crew starts, or as the pilot takes over from it.
void takeCrew(FdState& F, const State& s) {
    F.source = SRC_CREW;
    F.phase = s.phase;
    F.thetaT = s.thetaT;
    F.phiT = s.phiT;
    F.pegF0 = s.pegF0; F.pegF1 = s.pegF1; F.pegT = s.pegT; F.pegAt = s.pegAt;
    F.pegValid = s.pegValid;
    F.gear = s.gear;
}

// As the crew would start if handed the craft (oc_auto): its phase from where the craft is, its targets the
// craft's attitude, no plan yet.
void startCrew(FdState& F, const State& s, const Local& L) {
    F.source = SRC_CREW;
    F.phase = crewPhaseFor(s, L);
    F.thetaT = L.pitch;
    F.phiT = L.roll;
    F.pegF0 = F.pegF1 = F.pegT = F.pegAt = 0;
    F.pegValid = 0;
    F.gear = !s.onGround && L.alt > 40 ? 0 : s.gear;
}

// Whether the craft has gone back past the phase the shadow is in (the crew's phases only go forward), so
// that the crew, handed it now, would take it up from an earlier one: with a margin past crewPhaseFor's
// bounds, so that a craft flown along one does not flicker between two phases.
bool goneBack(const State& s, const Local& L, int phase) {
    if (crewPhaseFor(s, L) >= phase) return false;
    if (s.onGround) return true;
    if (phase == OC_PH_ORBIT) return orbitOf(s).peri < 120000;
    if (phase == OC_PH_INSERT) return L.alt < 25000 || L.qbar > 2000;
    if (phase == OC_PH_ASCENT) return L.alt < 1500;
    return true;
}

void shadowCrew(State& s, const Local& L) {
    FdState& F = s.fd;
    State c = s;   // the craft as it is, the crew's memory the shadow's
    c.autoMode = OC_AUTO_CREW;
    c.phase = F.phase;
    c.thetaT = F.thetaT;
    c.phiT = F.phiT;
    c.pegF0 = F.pegF0; c.pegF1 = F.pegF1; c.pegT = F.pegT; c.pegAt = F.pegAt;
    c.pegValid = F.pegValid;
    c.gear = F.gear;
    c.rcs = {0, 0, 0};
    c.nozzleCmd = 0;
    double throttle = 0;
    aim.set = 0;
    crew(c, L, &throttle);
    F.phase = c.phase;
    F.thetaT = c.thetaT;
    F.phiT = c.phiT;
    F.pegF0 = c.pegF0; F.pegF1 = c.pegF1; F.pegT = c.pegT; F.pegAt = c.pegAt;
    F.pegValid = c.pegValid;
    F.gear = c.gear;
    command(F, L, throttle, OC_FD_PH_HOLD + c.phase);
}

// ---- the flight home ----------------------------------------------------------------------------------

// Its command: an attitude, the throttle, and in the air its angle of attack and its bank about the air.
void homeCommand(FdState& F, const State& c, const Local& L, double throttle) {
    const int ph = c.ret.phase;
    command(F, L, throttle, OC_FD_PH_ORBIT + ph);
    if (ph >= OC_RET_PH_COAST && ph <= OC_RET_PH_FLARE) {
        F.alpha = c.ret.alphaCmd;
        F.liftBank = c.ret.bankCmd;
    }
}

// Its memory as it stands, taken over from the crew flying it.
void takeHome(FdState& F, const State& s) {
    F.source = SRC_HOME;
    F.ret = s.ret;
    F.thetaT = s.thetaT;
    F.phiT = s.phiT;
    F.gear = s.gear;
}

// Picked up from where the craft is, as the crew picks it up when handed the craft (returnEngage).
void startHome(FdState& F, const State& s) {
    State c = s;
    returnEngage(c);
    takeHome(F, c);
}

void shadowHome(State& s, const Local& L) {
    FdState& F = s.fd;
    State c = s;
    c.autoMode = OC_AUTO_RETURN;
    c.ret = F.ret;
    c.thetaT = F.thetaT;
    c.phiT = F.phiT;
    c.gear = F.gear;
    c.rcs = {0, 0, 0};
    c.nozzleCmd = 0;
    double throttle = 0;
    aim.set = 0;
    returnCrew(c, L, &throttle);
    F.ret = c.ret;
    F.thetaT = c.thetaT;
    F.phiT = c.phiT;
    F.gear = c.gear;
    if (c.ret.phase == OC_RET_PH_NONE) { F.valid = 0; return; }
    homeCommand(F, c, L, throttle);
}

}   // namespace

// ---- the hooks ----------------------------------------------------------------------------------------

void fdReset(State& s) {
    s.fd = FdState{};
    s.fd.on = 1;
    s.fd.last = -1;
}

void fdHanded(State& s, int from) {
    s.fd.handed = 1;
    s.fd.from = from;
}

void fdBefore(State& s, const Local& L) {
    FdState& F = s.fd;
    const int who = s.autoMode;
    const bool handover = F.handed || who != F.last;
    const int from = F.handed ? F.from : F.last;
    F.handed = 0;
    F.last = who;
    if (who == OC_AUTO_RETURN) F.home = 1;       // a flight home is under way
    else if (who == OC_AUTO_CREW) F.home = 0;    // the crew is flying to orbit instead
    const bool quiet = nearRing(s) || (who == OC_AUTO_OFF && (s.sas == OC_SAS_PORT || s.sas == OC_SAS_DECK));
    if (!F.on || s.crashed || quiet) {
        F.source = SRC_NONE;
        F.valid = 0;
        aim.set = 0;
        return;
    }
    switch (who) {
    case OC_AUTO_CREW:
        if (handover || F.source != SRC_CREW) takeCrew(F, s);
        shadowCrew(s, L);   // beside the crew: its command is the crew's own
        break;
    case OC_AUTO_RETURN:
        F.source = SRC_HOME;   // its own command, read after its law (fdAfter)
        break;
    case OC_AUTO_OFF:
        if (handover || F.source == SRC_NONE) {
            if (from == OC_AUTO_CREW) takeCrew(F, s);
            else if (from == OC_AUTO_RETURN && s.ret.phase != OC_RET_PH_NONE) takeHome(F, s);
            else if (F.home) startHome(F, s);
            else startCrew(F, s, L);
        }
        // Off the runway again after a flight home, the flight home is over: the crew to orbit's guidance.
        if (F.source == SRC_HOME && F.ret.phase >= OC_RET_PH_ROLLOUT && !s.onGround && L.alt > 20) {
            F.home = 0;
            startCrew(F, s, L);
        }
        if (F.source == SRC_CREW && goneBack(s, L, F.phase)) startCrew(F, s, L);
        if (F.source == SRC_CREW) shadowCrew(s, L);
        else shadowHome(s, L);
        break;
    default:   // the approach, docking, the deck landing: displays of their own
        F.source = SRC_NONE;
        F.valid = 0;
    }
    aim.set = 0;   // the step's own law aims afresh
}

void fdAfter(State& s, const Local& L, double throttle) {
    FdState& F = s.fd;
    if (F.last != OC_AUTO_RETURN || F.source != SRC_HOME) return;
    if (s.ret.phase == OC_RET_PH_NONE) { F.valid = 0; return; }
    F.gear = s.gear;
    homeCommand(F, s, L, throttle);
}

void fdWriteOut(const State& s, double* out) {
    const FdState& F = s.fd;
    out[OC_FD_ON] = F.on;
    if (!(F.on && F.valid && !s.crashed && !s.dock.held)) return;   // writeOut has zeroed the rest
    out[OC_FD_VALID] = 1;
    out[OC_FD_PHASE] = F.fdPhase;
    out[OC_FD_PITCH_DEG] = F.pitch * R2D;
    out[OC_FD_HDG_DEG] = std::fmod(F.heading * R2D + 360, 360);
    out[OC_FD_BANK_DEG] = F.bank * R2D;
    out[OC_FD_THROTTLE] = F.throttle;
    out[OC_FD_ALPHA_DEG] = F.alpha * R2D;
    out[OC_FD_LIFT_BANK_DEG] = F.liftBank * R2D;
    out[OC_FD_GEAR] = F.gear;
}

void fdHash(const State& s, unsigned& h) {
    const FdState& F = s.fd;
    const double v[] = {(double)F.on, (double)F.last, (double)F.handed, (double)F.from, (double)F.home, (double)F.source, (double)F.phase,
                        F.thetaT, F.phiT, F.pegF0, F.pegF1, F.pegT, F.pegAt, (double)F.pegValid, (double)F.gear,
                        (double)F.valid, (double)F.fdPhase, F.pitch, F.heading, F.bank, F.throttle, F.alpha, F.liftBank};
    hashDoubles(h, v, sizeof v / sizeof v[0]);
    State carrier;   // returnHash reads a state's ret: the shadow's own, carried in one
    carrier.ret = F.ret;
    returnHash(carrier, h);
}

}   // namespace oc

extern "C" {

void oc_fd(int on) {
    oc::g.fd.on = on ? 1 : 0;
    if (!oc::g.fd.on) { oc::g.fd.source = 0; oc::g.fd.valid = 0; }
    oc::writeOut();
}

}   // extern "C"
