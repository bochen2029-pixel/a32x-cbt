// Docking's tests (orbit_dock.h). Each states a piece of physics or a promise of the core, not how it is
// written, and reaches its situation through the controls a pilot or the page has: nothing is placed.
// Where a test can, it checks docking's own readouts against the flight's (orbit_core.h), which do not
// come from dock.cpp. Run one by name or all; ctest runs each line below that reads "// TEST: <name>".
// GPLv3.
//
// TEST: readouts_block
// TEST: crew_docks_from_hold
// TEST: capture_inside_tolerances
// TEST: crew_docks_from_orbit
// TEST: crew_docks_from_inside_the_ring
// TEST: docked_rides_the_ring
// TEST: undock_separates
// TEST: crew_docks_again_after_undock
// TEST: port_hold
// TEST: hand_docking
// TEST: fast_contact_bounces
// TEST: gross_contact_crashes
// TEST: off_centre_contact_bounces
// TEST: slow_contact_does_not_latch
// TEST: sliding_contact_bounces
// TEST: angled_contact_bounces
// TEST: spin_must_match
// TEST: roof_is_solid
// TEST: rim_wall_is_solid
// TEST: spoke_is_solid
// TEST: spoke_reaches_the_roof
// TEST: hub_is_solid
// TEST: open_middle_is_free
// TEST: approach_goes_round
// TEST: docking_refused
// TEST: judges_speed_in_the_orbit_frame
// TEST: approach_gated_like_docking
// TEST: deterministic

#include "../core/orbit_core.h"
#include "../core/orbit_dock.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <initializer_list>

namespace {

int failures = 0;

#define CHECK(cond, ...)                                              \
    do {                                                              \
        if (!(cond)) {                                                \
            std::printf("  FAIL %s:%d: %s — ", __FILE__, __LINE__, #cond); \
            std::printf(__VA_ARGS__);                                 \
            std::printf("\n");                                        \
            ++failures;                                               \
        }                                                             \
    } while (0)

const double PI = 3.14159265358979323846, D2R = PI / 180, R2D = 180 / PI;
const double WE = 7.2921159e-5;                                    // rad/s, the Earth's turn
const double LAT = 32.91569901, LON = -97.02600098, HDG = 180.3;   // KDFW 17C, docs/provenance.md 1f
const double SPIN = OC_RING_SPIN;

double get(int i) { return oc_out()[i]; }
double dk(int i) { return oc_dock_out()[i]; }
int idk(int i) { return (int)oc_dock_out()[i]; }
double clampd(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }

bool finite() {
    for (int i = 0; i < oc_out_len(); ++i)
        if (!std::isfinite(oc_out()[i])) return false;
    for (int i = 0; i < oc_dock_out_len(); ++i)
        if (!std::isfinite(oc_dock_out()[i])) return false;
    return true;
}

struct V { double x, y, z; };
V operator+(V a, V b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
V operator-(V a, V b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
V operator*(V a, double s) { return {a.x * s, a.y * s, a.z * s}; }
double dot(V a, V b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
V cross(V a, V b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
double norm(V a) { return std::sqrt(dot(a, a)); }
double angle(V a, V b) { return std::atan2(norm(cross(a, b)), dot(a, b)); }

// ---- the flight's own readouts: the site frame --------------------------------------------------

V site(int i) { return {get(i), get(i + 1), get(i + 2)}; }

// A body vector in the site frame, by the readouts' quaternion (body -> site).
V body(V v) {
    const double w = get(OC_QW);
    const V u{get(OC_QX), get(OC_QY), get(OC_QZ)};
    return v + cross(u, cross(u, v) + v * w) * 2.0;
}

// A site-frame direction among the stars: the site turns with the Earth.
V stars(V v, double t) {
    const double la = LAT * D2R, lo = LON * D2R;
    const V up{std::cos(la) * std::cos(lo), std::cos(la) * std::sin(lo), std::sin(la)}, east{-std::sin(lo), std::cos(lo), 0};
    const V ef = east * v.x + cross(up, east) * v.y + up * v.z;
    const double c = std::cos(WE * t), s = std::sin(WE * t);
    return {c * ef.x - s * ef.y, s * ef.x + c * ef.y, ef.z};
}

// The probe's head from the centre of the hub's port, by the flight's readouts alone.
double portMiss() {
    const V head = site(OC_SITE_E) + body({OC_DOCK_PROBE_M, 0, 0});
    return norm(head - (site(OC_RING_E) - site(OC_RING_AX_E) * OC_HUB_PORT_M));
}

// The craft in the ring's frame, by the flight's readouts alone: along the axis from the ring's centre,
// from the axis, and the angle about it from the nearest spoke. Seen from the ring, a craft that stands
// still among the stars goes round backwards: its angle falls at the ring's spin.
struct Where { double axial, radial, spoke; };
Where where() {
    const V ax = site(OC_RING_AX_E), ref = site(OC_RING_REF_E), d = site(OC_SITE_E) - site(OC_RING_E);
    const double x = dot(d, ref), z = dot(d, cross(ref, ax));
    const double step = 360.0 / OC_RING_SPOKES, th = std::atan2(x, z) * R2D;
    return {dot(d, ax), std::hypot(x, z), th - std::round(th / step) * step};
}

// ---- getting there ------------------------------------------------------------------------------

bool toOrbit() {
    oc_reset(LAT, LON, HDG);
    while (get(OC_PHASE) != OC_PH_ORBIT) {
        oc_step(1);
        if (get(OC_CRASHED) > 0 || get(OC_T) > 1500) { CHECK(false, "no orbit"); return false; }
    }
    oc_step(250);   // the engine's last thrust gone
    return true;
}

// To the hold point, 300 m off the hub's port, by the crew's approach.
bool toHold() {
    if (!toOrbit()) return false;
    oc_auto(OC_AUTO_APPROACH);
    const double t0 = get(OC_T);
    double last = 1e30;
    while (get(OC_T) - t0 < 3600 && get(OC_CRASHED) == 0) {
        oc_step(50);
        if (get(OC_PORT_RANGE) < 5 && std::fabs(get(OC_PORT_RANGE) - last) < 0.2) return true;
        last = get(OC_PORT_RANGE);
    }
    CHECK(false, "no hold point: %.0f m off it, crashed %.0f", get(OC_PORT_RANGE), get(OC_CRASHED));
    return false;
}

// The crew's docking, from wherever the craft is; returns the seconds to hard dock, or -1.
double crewDocks(double limit) {
    const double t0 = get(OC_T);
    oc_auto(OC_AUTO_DOCK);
    while (get(OC_T) - t0 < limit && get(OC_CRASHED) == 0) {
        oc_step(1);
        if (idk(OC_DOCK_PHASE) == OC_DOCK_PH_DOCKED) return get(OC_T) - t0;
    }
    return -1;
}

// ---- a pilot's hands on the small thrusters -----------------------------------------------------
// The attitude is left to a hold; the hands fly the docking's readouts with translation alone. With
// keys, each thruster is full on or off, as from a keyboard; without, as from a stick.

struct Hands {
    double closeMax, contact;   // m/s: the closing speed far out, and from 2 m to the face
    bool keys;
    double offY = 0, offZ = 0;  // m: where to hold off the axis, in the port's frame
    bool waitLined = true;      // close only once lined up on the port
};

double thruster(double e, bool keys) { return keys ? (e > 0.015 ? 1 : e < -0.015 ? -1 : 0) : clampd(e * 5, -1, 1); }

void handStep(const Hands& h, double closing) {
    // The readouts' offsets are in the port's frame, which turns; the thrusters are in the body's. Under
    // OC_SAS_PORT the two are one. Under any other hold they differ by the roll error, and the rates by
    // the frame's turn.
    const double ph = dk(OC_DOCK_ROLL_DEG) * D2R, c = std::cos(ph), s = std::sin(ph);
    const bool turning = std::fabs(dk(OC_DOCK_ROLL_RATE_DPS)) < 0.5;
    const double eY = dk(OC_DOCK_OFF_Y) - h.offY, eZ = dk(OC_DOCK_OFF_Z) - h.offZ;
    const double vY = dk(OC_DOCK_RATE_Y) - (turning ? 0 : SPIN * dk(OC_DOCK_OFF_Z)), vZ = dk(OC_DOCK_RATE_Z) + (turning ? 0 : SPIN * dk(OC_DOCK_OFF_Y));
    const double ey = c * eY + s * eZ, ez = -s * eY + c * eZ, vy = c * vY + s * vZ, vz = -s * vY + c * vZ;
    oc_controls(0, 0, 0, 0, thruster(closing - dk(OC_DOCK_CLOSING), h.keys), thruster(clampd(-0.3 * ey, -0.5, 0.5) - vy, h.keys),
                thruster(clampd(-0.3 * ez, -0.5, 0.5) - vz, h.keys), 0, 0);
    oc_step(1);
}

bool lined() { return dk(OC_DOCK_ANGLE_DEG) < 1 && std::fabs(dk(OC_DOCK_ROLL_DEG)) < 0.7 && std::fabs(dk(OC_DOCK_ROLL_RATE_DPS)) < 0.1; }

// Fly in to the first touch of the head on the face, then take the hands off and let the probe's spring
// do what it does: the port holds the head, or the head comes off the face again, or the craft is
// wrecked. Returns the seconds to the touch, or -1 for none. deepest: how far the head went through the
// face, m.
double handFliesIn(const Hands& h, double limit, double* deepest = nullptr) {
    const double t0 = get(OC_T), before = dk(OC_DOCK_C_T);
    while (get(OC_T) - t0 < limit && get(OC_CRASHED) == 0 && dk(OC_DOCK_C_T) == before)
        handStep(h, !h.waitLined || lined() ? clampd(0.05 * dk(OC_DOCK_GAP), h.contact, h.closeMax) : 0);
    const double took = dk(OC_DOCK_C_T) != before ? get(OC_T) - t0 : -1;
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    double deep = 0;
    for (int i = 0; i < 500 && get(OC_CRASHED) == 0 && dk(OC_DOCK_DOCKED) == 0 && dk(OC_DOCK_CONTACT) > 0; ++i) {
        deep = std::fmax(deep, -dk(OC_DOCK_GAP));
        oc_step(1);
    }
    if (deepest) *deepest = deep;
    return took;
}

// Under an attitude hold, with the nose on the axis: where the craft is from the ring's centre along its
// own axes, and how fast that changes. The body's axes stand still among the stars, so these are plain
// distances and speeds, whatever frame the readouts are in.
struct Nav { double x, y, z; };
Nav navNow() {
    const V d = site(OC_SITE_E) - site(OC_RING_E);
    return {dot(d, body({1, 0, 0})), dot(d, body({0, 1, 0})), dot(d, body({0, 0, 1}))};
}

// One step toward a place in those axes, on the small thrusters, braking at 0.4 m/s2.
Nav flyStep(Nav to, Nav was, double top) {
    const Nav n = navNow();
    auto axis = [&](double at, double before, double want) {
        const double e = want - at, v = (at - before) / OC_DT;
        const double speed = std::fmin(top, std::fmin(0.3 * std::fabs(e), std::sqrt(2 * 0.4 * std::fabs(e))));
        return clampd(((e > 0 ? speed : -speed) - v) * 2, -1, 1);
    };
    oc_controls(0, 0, 0, 0, axis(n.x, was.x, to.x), axis(n.y, was.y, to.y), axis(n.z, was.z, to.z), 0, 0);
    oc_step(1);
    return n;
}

// Fly there and stop; false if the craft crashed on the way.
bool flyTo(Nav to, double top, double limit) {
    const double t0 = get(OC_T);
    Nav was = navNow();
    oc_step(1);
    while (get(OC_T) - t0 < limit && get(OC_CRASHED) == 0) {
        const Nav before = was;
        was = flyStep(to, was, top);
        const double off = std::hypot(std::hypot(was.x - to.x, was.y - to.y), was.z - to.z);
        const double speed = std::hypot(std::hypot(was.x - before.x, was.y - before.y), was.z - before.z) / OC_DT;
        if (off < 2 && speed < 0.2) break;
    }
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    return get(OC_CRASHED) == 0;
}

// From the hold point, the pilot's hands and an attitude hold: the nose stays on the axis, and the
// body's axes stand still among the stars.
bool handsAtHold() {
    if (!toHold()) return false;
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_HOLD);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(100);
    return true;
}

// Outward along the right wing at full thrust until something is hit, keeping to a line that gains
// `gain` metres along the axis for each metre outward. Returns where the craft was a step before.
Where fliesOut(double gain, double limit) {
    const Nav from = navNow();
    Nav was = from;
    Where w = where();
    const double t0 = get(OC_T);
    oc_step(1);
    while (get(OC_T) - t0 < limit && get(OC_CRASHED) == 0) {
        const Nav n = navNow();
        const double vx = (n.x - was.x) / OC_DT, vy = (n.y - was.y) / OC_DT;
        oc_controls(0, 0, 0, 0, clampd((0.3 * (from.x + gain * (n.y - from.y) - n.x) + gain * vy - vx) * 2, -1, 1), 1, 0, 0, 0);
        oc_step(1);
        was = n;
        if (get(OC_CRASHED) == 0) w = where();
    }
    return w;
}

// Wait, hands off, for the moment to start toward the spokes' plane: such that `fromNow` seconds on, the
// ring will have turned the craft half way between two spokes.
bool waitForGap(double fromNow) {
    for (int i = 0; i < 1500; ++i) {
        double then = where().spoke - SPIN * R2D * fromNow;
        then -= std::round(then / 60) * 60;
        if (std::fabs(std::fabs(then) - 30) < 0.6) return true;
        oc_step(1);
    }
    return false;
}

const char* hitName(int h) {
    static const char* names[] = {"nothing", "the hull", "the roof", "a rim wall", "a spoke", "the hub", "the port"};
    return h >= 0 && h <= OC_DOCK_HIT_PORT ? names[h] : "?";
}
const char* partName(int p) {
    static const char* names[] = {"nothing", "the probe", "the nose", "the body", "the left wing", "the right wing", "the tail"};
    return p >= 0 && p <= OC_DOCK_PART_TAIL ? names[p] : "?";
}

// ---- the tests ----------------------------------------------------------------------------------

// The block is the header's, and a craft on the runway is not docked, has touched nothing, and is a long
// way from the port.
void readoutsBlock() {
    oc_reset(LAT, LON, HDG);
    CHECK(oc_dock_out_len() == OC_DOCK_COUNT, "%d readouts", oc_dock_out_len());
    CHECK(dk(OC_DOCK_DOCKED) == 0 && dk(OC_DOCK_PHASE) == OC_DOCK_PH_NONE, "docked %.0f, phase %.0f", dk(OC_DOCK_DOCKED), dk(OC_DOCK_PHASE));
    CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_NONE && dk(OC_DOCK_HIT) == OC_DOCK_HIT_NONE && dk(OC_DOCK_CONTACT) == 0, "a contact before any");
    CHECK(dk(OC_DOCK_RANGE) > 1e5, "the port %.0f m away", dk(OC_DOCK_RANGE));
    CHECK(finite(), "finite");
    // In orbit, the craft's place in the ring's frame is what the flight's own readouts give.
    if (!toOrbit()) return;
    const Where w = where();
    CHECK(std::fabs(dk(OC_DOCK_AXIAL) - w.axial) < 1e-6 && std::fabs(dk(OC_DOCK_RADIAL) - w.radial) < 1e-6, "axial %.3f against %.3f, radial %.3f against %.3f",
          dk(OC_DOCK_AXIAL), w.axial, dk(OC_DOCK_RADIAL), w.radial);
    CHECK(std::fabs(dk(OC_DOCK_RANGE) - portMiss()) < 1e-6, "range %.6f against %.6f", dk(OC_DOCK_RANGE), portMiss());
    CHECK(w.axial < -20000, "the craft arrives on the port's side: %.0f m along the axis", w.axial);
}

// From the hold point the crew lines up, rolls into phase with the port, closes at 1 m/s easing to
// 0.1 m/s, and is docked hard inside 400 s, on the small thrusters alone.
void crewDocksFromHold() {
    if (!toHold()) return;
    const double prop0 = get(OC_PROP), t0 = get(OC_T);
    oc_auto(OC_AUTO_DOCK);
    CHECK(get(OC_AUTO) == OC_AUTO_DOCK && dk(OC_DOCK_REFUSED) == OC_DOCK_NO_NONE, "refused: %.0f", dk(OC_DOCK_REFUSED));
    CHECK(dk(OC_DOCK_PHASE) == OC_DOCK_PH_ALIGN, "at the hold point the crew starts lining up: phase %.0f", dk(OC_DOCK_PHASE));
    int phase = idk(OC_DOCK_PHASE);
    double at[6] = {0, 0, 0, 0, 0, 0}, fastest = 0, widest = 0, lastClosing = 0;
    while (get(OC_T) - t0 < 600 && get(OC_CRASHED) == 0 && idk(OC_DOCK_PHASE) != OC_DOCK_PH_DOCKED) {
        oc_step(1);
        const int p = idk(OC_DOCK_PHASE);
        if (p != phase) {
            CHECK(p == phase + 1, "phase %d after %d", p, phase);
            at[p] = get(OC_T) - t0;
            phase = p;
        }
        if (p == OC_DOCK_PH_CLOSE) {
            if (dk(OC_DOCK_CLOSING) > fastest) fastest = dk(OC_DOCK_CLOSING);
            if (std::hypot(dk(OC_DOCK_OFF_Y), dk(OC_DOCK_OFF_Z)) > widest) widest = std::hypot(dk(OC_DOCK_OFF_Y), dk(OC_DOCK_OFF_Z));
            lastClosing = dk(OC_DOCK_CLOSING);
        }
    }
    const double took = get(OC_T) - t0;
    std::printf("  lined up after %.1f s, captured after %.1f s, docked after %.1f s; closing at most %.3f m/s, %.3f m/s at the face; at most %.3f m off the axis while closing\n",
                at[OC_DOCK_PH_CLOSE], at[OC_DOCK_PH_CAPTURED], took, fastest, lastClosing, widest);
    CHECK(dk(OC_DOCK_DOCKED) == 1 && dk(OC_DOCK_PHASE) == OC_DOCK_PH_DOCKED, "docked %.0f, phase %.0f", dk(OC_DOCK_DOCKED), dk(OC_DOCK_PHASE));
    CHECK(took < 400, "took %.0f s", took);
    CHECK(get(OC_CRASHED) == 0, "crashed into %s", hitName(idk(OC_DOCK_HIT)));
    CHECK(fastest < 1.02 && fastest > 0.95, "closing at most %.3f m/s", fastest);
    CHECK(std::fabs(lastClosing - 0.10) < 0.01, "closing %.3f m/s at the face", lastClosing);
    CHECK(widest < 0.05, "%.3f m off the axis while closing", widest);
    CHECK(get(OC_PROP) == prop0, "the main drive's propellant untouched");
    CHECK(get(OC_AUTO) == OC_AUTO_OFF && get(OC_SAS) == OC_SAS_PORT, "docked, the crew is done: auto %.0f, hold %.0f", get(OC_AUTO), get(OC_SAS));
    CHECK(finite(), "finite");
}

// The latches catch the head only inside the tolerances, and the contact is on record: what the head was
// doing a step before the port took it is inside every tolerance, and is what the record says.
void captureInsideTolerances() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_DOCK);
    double live[OC_DOCK_COUNT] = {0}, tLive = 0;
    const double t0 = get(OC_T);
    while (get(OC_T) - t0 < 600 && dk(OC_DOCK_DOCKED) == 0 && get(OC_CRASHED) == 0) {
        std::memcpy(live, oc_dock_out(), sizeof live);
        tLive = get(OC_T);
        oc_step(1);
    }
    CHECK(dk(OC_DOCK_DOCKED) == 1 && dk(OC_DOCK_PHASE) == OC_DOCK_PH_CAPTURED, "captured: docked %.0f, phase %.0f", dk(OC_DOCK_DOCKED), dk(OC_DOCK_PHASE));
    const double offset = std::hypot(live[OC_DOCK_OFF_Y], live[OC_DOCK_OFF_Z]), slide = std::hypot(live[OC_DOCK_RATE_Y], live[OC_DOCK_RATE_Z]);
    std::printf("  a step before: %.4f m to go at %.4f m/s, %.4f m off the centre moving %.4f m/s across, %.4f deg off the axis, roll %.4f deg, %.5f deg/s\n",
                live[OC_DOCK_GAP], live[OC_DOCK_CLOSING], offset, slide, live[OC_DOCK_ANGLE_DEG], live[OC_DOCK_ROLL_DEG], live[OC_DOCK_ROLL_RATE_DPS]);
    CHECK(live[OC_DOCK_GAP] >= 0 && live[OC_DOCK_GAP] < 0.01, "%.4f m in front of the face a step before", live[OC_DOCK_GAP]);
    CHECK(live[OC_DOCK_CLOSING] >= OC_DOCK_V_MIN && live[OC_DOCK_CLOSING] <= OC_DOCK_V_MAX, "closing %.4f m/s", live[OC_DOCK_CLOSING]);
    CHECK(offset <= OC_DOCK_TOL_OFFSET_M, "%.4f m off the centre", offset);
    CHECK(slide <= OC_DOCK_TOL_SLIDE, "%.4f m/s across", slide);
    CHECK(live[OC_DOCK_ANGLE_DEG] <= OC_DOCK_TOL_ANGLE_DEG, "%.4f deg off the axis", live[OC_DOCK_ANGLE_DEG]);
    CHECK(std::fabs(live[OC_DOCK_ROLL_DEG]) <= OC_DOCK_TOL_ROLL_DEG, "roll error %.4f deg", live[OC_DOCK_ROLL_DEG]);
    CHECK(std::fabs(live[OC_DOCK_ROLL_RATE_DPS]) <= OC_DOCK_TOL_ROLL_RATE_DPS, "roll-rate error %.4f deg/s", live[OC_DOCK_ROLL_RATE_DPS]);
    // the record
    CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_CAPTURED, "verdict %.0f", dk(OC_DOCK_VERDICT));
    CHECK(std::fabs(dk(OC_DOCK_C_T) - tLive - OC_DT) < 1e-9, "recorded at %.2f s, a step after %.2f s", dk(OC_DOCK_C_T), tLive);
    CHECK(std::fabs(dk(OC_DOCK_C_SPEED) - live[OC_DOCK_CLOSING]) < 0.005, "recorded %.4f m/s", dk(OC_DOCK_C_SPEED));
    CHECK(std::fabs(dk(OC_DOCK_C_OFFSET) - offset) < 0.005, "recorded %.4f m off", dk(OC_DOCK_C_OFFSET));
    CHECK(std::fabs(dk(OC_DOCK_C_ANGLE_DEG) - live[OC_DOCK_ANGLE_DEG]) < 0.01 && std::fabs(dk(OC_DOCK_C_ROLL_DEG) - live[OC_DOCK_ROLL_DEG]) < 0.01 &&
          std::fabs(dk(OC_DOCK_C_ROLL_RATE_DPS) - live[OC_DOCK_ROLL_RATE_DPS]) < 0.01, "recorded angles %.4f %.4f %.4f", dk(OC_DOCK_C_ANGLE_DEG),
          dk(OC_DOCK_C_ROLL_DEG), dk(OC_DOCK_C_ROLL_RATE_DPS));
    // and the flight's own readouts agree that the head is at the port
    CHECK(portMiss() < 0.01, "the head %.4f m from the port, by the flight's readouts", portMiss());
}

// Engaged where the crew reaches orbit, 25 km out, the crew flies to the hold point first, then docks.
void crewDocksFromOrbit() {
    if (!toOrbit()) return;
    const double range0 = dk(OC_DOCK_RANGE), prop0 = get(OC_PROP);
    oc_auto(OC_AUTO_DOCK);
    CHECK(dk(OC_DOCK_PHASE) == OC_DOCK_PH_TRANSFER, "from %.1f km the crew flies to the hold point first: phase %.0f", range0 / 1000, dk(OC_DOCK_PHASE));
    const double took = crewDocks(2400);
    std::printf("  docked %.0f s after engaging %.1f km from the port\n", took, range0 / 1000);
    CHECK(took > 0 && took < 1500, "took %.0f s", took);
    CHECK(get(OC_CRASHED) == 0, "crashed into %s", hitName(idk(OC_DOCK_HIT)));
    CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_CAPTURED && std::fabs(dk(OC_DOCK_C_SPEED) - 0.10) < 0.01, "verdict %.0f at %.3f m/s", dk(OC_DOCK_VERDICT), dk(OC_DOCK_C_SPEED));
    CHECK(get(OC_PROP) == prop0, "the main drive's propellant untouched");
}

// Engaged from inside the ring, beyond the spokes' plane, the crew does not come back the way the craft
// went in: it leaves by the far end, goes round the outside of the hull to the port's side, flies to the
// hold point and docks.
void crewDocksFromInsideTheRing() {
    if (!handsAtHold()) return;
    const Nav at = navNow();
    CHECK(flyTo({at.x, 500, 0}, 25, 300), "crashed on the way out: %s", hitName(idk(OC_DOCK_HIT)));
    // Through the plane between two spokes at 10 m/s (20 s of thrust, 100 m), to stop 250 m beyond it.
    CHECK(waitForGap(20 + (-navNow().x - 100) / 10), "no gap came round");
    double t0 = get(OC_T);
    while (get(OC_T) - t0 < 200 && get(OC_CRASHED) == 0 && navNow().x < 60) {
        oc_controls(0, 0, 0, 0, get(OC_T) - t0 < 20 ? 1 : 0, 0, 0, 0, 0);
        oc_step(1);
    }
    CHECK(flyTo({250, 500, 0}, 12, 300), "crashed beyond the plane: %s", hitName(idk(OC_DOCK_HIT)));
    const Where w0 = where();
    CHECK(w0.axial > 200 && w0.axial < 300 && w0.radial > 450 && w0.radial < 550, "inside the far end: %.0f m along the axis, %.0f m from it", w0.axial, w0.radial);
    oc_auto(OC_AUTO_DOCK);
    CHECK(get(OC_AUTO) == OC_AUTO_DOCK && dk(OC_DOCK_PHASE) == OC_DOCK_PH_TRANSFER, "auto %.0f, phase %.0f, refused %.0f", get(OC_AUTO), dk(OC_DOCK_PHASE), dk(OC_DOCK_REFUSED));
    t0 = get(OC_T);
    double inside = 1e30, furthest = 0, beyond = 0;
    while (get(OC_T) - t0 < 3600 && get(OC_CRASHED) == 0 && idk(OC_DOCK_PHASE) != OC_DOCK_PH_DOCKED) {
        oc_step(10);
        const Where w = where();
        furthest = std::fmax(furthest, w.radial);
        beyond = std::fmax(beyond, w.axial);
        // once out of the far end: between the ring's far side and the port's face again only outside the hull
        if (beyond > OC_RING_WIDTH_M / 2 + 30 && w.axial < OC_RING_WIDTH_M / 2 && w.axial > -OC_HUB_PORT_M) inside = std::fmin(inside, w.radial);
    }
    std::printf("  docked %.0f s after engaging inside the far end: out to %.0f m along the axis and %.0f m from it; passing the band never nearer the axis than %.0f m\n",
                get(OC_T) - t0, beyond, furthest, inside);
    CHECK(get(OC_CRASHED) == 0, "crashed into %s with %s", hitName(idk(OC_DOCK_HIT)), partName(idk(OC_DOCK_HIT_PART)));
    CHECK(dk(OC_DOCK_PHASE) == OC_DOCK_PH_DOCKED && dk(OC_DOCK_VERDICT) == OC_DOCK_V_CAPTURED, "phase %.0f, verdict %.0f", dk(OC_DOCK_PHASE), dk(OC_DOCK_VERDICT));
    CHECK(beyond > OC_RING_WIDTH_M / 2 + 30, "left by the far end: %.0f m along the axis", beyond);
    CHECK(inside > OC_RING_HULL_M + 100, "passed the band %.0f m from the axis", inside);
}

// Docked for ten minutes, the craft stays on the port and turns with the ring: by the flight's readouts
// its head is at the port's centre, its nose along the axis, its roof on the port's key, and its roof
// goes round the axis among the stars at the ring's spin.
void dockedRidesTheRing() {
    if (!toHold() || crewDocks(600) < 0) { CHECK(false, "no docking"); return; }
    double miss = 0, tilt = 0, key = 0, turn = 0, range = 0, readout = 0;
    V roof = stars(body({0, 0, -1}), get(OC_T));
    const V axis0 = stars(site(OC_RING_AX_E), get(OC_T));
    for (int i = 0; i < 60; ++i) {   // every ten seconds
        oc_step(500);
        const double t = get(OC_T);
        miss = std::fmax(miss, portMiss());
        tilt = std::fmax(tilt, angle(body({1, 0, 0}), site(OC_RING_AX_E)));
        key = std::fmax(key, angle(body({0, 0, -1}), site(OC_RING_REF_E)));
        const V now = stars(body({0, 0, -1}), t), axis = stars(site(OC_RING_AX_E), t);
        turn = std::fmax(turn, std::fabs(std::atan2(dot(cross(roof, now), axis), dot(roof, now)) - SPIN * 10));
        roof = now;
        range = std::fmax(range, std::fabs(get(OC_RING_RANGE) - (OC_HUB_PORT_M + OC_DOCK_PROBE_M)));
        readout = std::fmax(readout, std::fmax(dk(OC_DOCK_RANGE), std::fmax(std::fabs(dk(OC_DOCK_ROLL_RATE_DPS)), std::fabs(dk(OC_DOCK_CLOSING)))));
        CHECK(dk(OC_DOCK_DOCKED) == 1 && dk(OC_DOCK_PHASE) == OC_DOCK_PH_DOCKED && get(OC_CRASHED) == 0, "docked at %.0f s", t);
        CHECK(angle(axis, axis0) < 1e-12, "the ring's axis moved among the stars");
    }
    std::printf("  over 10 min: head %.2e m off the port, nose %.2e rad off the axis, roof %.2e rad off the key, turn in 10 s off the spin's by %.2e rad\n", miss, tilt, key, turn);
    CHECK(miss < 1e-6, "the head %.3g m off the port", miss);
    CHECK(tilt < 1e-9 && key < 1e-9, "nose %.3g rad off the axis, roof %.3g rad off the key", tilt, key);
    CHECK(turn < 1e-9, "the roof's turn in 10 s differs from the spin's by %.3g rad", turn);
    CHECK(range < 1e-6, "the centre of mass moved %.3g m along the axis", range);
    // zero to roundoff: a few unit roundoffs of a position 6,871 km from the Earth's centre, 16 u |r| = 1.2e-8 m
    // (and the rates' alike); the trajectory's last digits move it, so the bound is the arithmetic's, not a run's
    const double roundoff = 16 * 1.1102230246251565e-16 * 6.871e6;
    CHECK(readout < roundoff, "docking's readouts: range, roll rate or closing off zero by %.3g (roundoff %.2g)", readout, roundoff);
    CHECK(std::fabs(get(OC_RING_RATE)) < 1e-6, "range rate to the ring's centre %.3g m/s", get(OC_RING_RATE));
    CHECK(finite(), "finite");
}

// Undocked, the craft comes off the port at the separation speed and drifts back along -axis, still
// turning with the port until the pilot stops it.
void undockSeparates() {
    if (!toHold() || crewDocks(600) < 0) { CHECK(false, "no docking"); return; }
    oc_step(500);
    oc_undock();
    CHECK(dk(OC_DOCK_DOCKED) == 0 && dk(OC_DOCK_PHASE) == OC_DOCK_PH_NONE, "let go: docked %.0f, phase %.0f", dk(OC_DOCK_DOCKED), dk(OC_DOCK_PHASE));
    CHECK(std::fabs(dk(OC_DOCK_CLOSING) + OC_DOCK_SEPARATION) < 1e-9, "opening at %.4f m/s", -dk(OC_DOCK_CLOSING));
    CHECK(get(OC_AUTO) == OC_AUTO_OFF && get(OC_SAS) == OC_SAS_PORT, "the pilot has it, held on the port: auto %.0f, hold %.0f", get(OC_AUTO), get(OC_SAS));
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(1000);   // twenty seconds, hands off
    const double gap = dk(OC_DOCK_GAP), off = std::hypot(dk(OC_DOCK_OFF_Y), dk(OC_DOCK_OFF_Z));
    std::printf("  20 s after: %.2f m off the face, opening at %.3f m/s, %.3f m off the axis, still turning within %.4f deg/s of the port\n", gap,
                -dk(OC_DOCK_CLOSING), off, dk(OC_DOCK_ROLL_RATE_DPS));
    CHECK(gap > 2.7 && gap < 3.6, "%.2f m off the face", gap);
    CHECK(off < 0.3, "%.3f m off the axis", off);
    CHECK(dk(OC_DOCK_CLOSING) < -0.14 && dk(OC_DOCK_CLOSING) > -0.20, "opening at %.3f m/s", -dk(OC_DOCK_CLOSING));
    CHECK(std::fabs(dk(OC_DOCK_ROLL_RATE_DPS)) < 0.01 && std::fabs(dk(OC_DOCK_ROLL_DEG)) < 0.1 && dk(OC_DOCK_ANGLE_DEG) < 0.1,
          "still lined up and turning with the port: %.4f deg/s, %.3f deg, %.3f deg", dk(OC_DOCK_ROLL_RATE_DPS), dk(OC_DOCK_ROLL_DEG), dk(OC_DOCK_ANGLE_DEG));
    CHECK(dk(OC_DOCK_DOCKED) == 0 && dk(OC_DOCK_CONTACT) == 0 && get(OC_CRASHED) == 0, "free");
    CHECK(std::fabs(portMiss() - dk(OC_DOCK_RANGE)) < 1e-6 && portMiss() > 2.7, "by the flight's readouts the head is %.2f m from the port", portMiss());
    oc_sas(OC_SAS_HOLD);   // the pilot stops the spin
    oc_step(500);
    CHECK(std::fabs(dk(OC_DOCK_ROLL_RATE_DPS) + SPIN * R2D) < 0.01, "with the attitude held the craft no longer turns: %.3f deg/s against the port", dk(OC_DOCK_ROLL_RATE_DPS));
    oc_undock();           // nothing, when not held
    CHECK(dk(OC_DOCK_DOCKED) == 0 && get(OC_SAS) == OC_SAS_HOLD, "a second undock did something");
}

// Undocked and adrift a few metres off the port, the crew asked to dock again lines up where the craft
// is and goes back in, with no trip out to the hold point.
void crewDocksAgainAfterUndock() {
    if (!toHold() || crewDocks(600) < 0) { CHECK(false, "no docking"); return; }
    oc_step(500);
    const double first = dk(OC_DOCK_C_T);
    oc_undock();
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(1500);   // thirty seconds adrift
    const double gap0 = dk(OC_DOCK_GAP);
    oc_auto(OC_AUTO_DOCK);
    CHECK(dk(OC_DOCK_PHASE) == OC_DOCK_PH_ALIGN, "%.1f m off the face the crew lines up there: phase %.0f", gap0, dk(OC_DOCK_PHASE));
    const double t0 = get(OC_T);
    double furthest = 0;
    while (get(OC_T) - t0 < 300 && get(OC_CRASHED) == 0 && idk(OC_DOCK_PHASE) != OC_DOCK_PH_DOCKED) {
        oc_step(1);
        furthest = std::fmax(furthest, dk(OC_DOCK_GAP));
    }
    std::printf("  adrift %.2f m off the face; docked again %.0f s after asking, never more than %.2f m off it; contact at %.3f m/s, %.4f m off the centre\n", gap0,
                get(OC_T) - t0, furthest, dk(OC_DOCK_C_SPEED), dk(OC_DOCK_C_OFFSET));
    CHECK(dk(OC_DOCK_PHASE) == OC_DOCK_PH_DOCKED && get(OC_CRASHED) == 0, "phase %.0f, crashed %.0f", dk(OC_DOCK_PHASE), get(OC_CRASHED));
    CHECK(get(OC_T) - t0 < 120, "took %.0f s", get(OC_T) - t0);
    CHECK(furthest < gap0 + 3, "went out to %.2f m", furthest);
    CHECK(dk(OC_DOCK_C_T) > first && dk(OC_DOCK_VERDICT) == OC_DOCK_V_CAPTURED && std::fabs(dk(OC_DOCK_C_SPEED) - 0.10) < 0.02, "a second capture: verdict %.0f at %.3f m/s",
          dk(OC_DOCK_VERDICT), dk(OC_DOCK_C_SPEED));
}

// OC_SAS_PORT: hands off, the craft lines up on the port and turns with it, and stays so.
void portHold() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_OFF);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_sas(OC_SAS_PORT);
    CHECK(get(OC_SAS) == OC_SAS_PORT, "hold %.0f", get(OC_SAS));
    double settled = -1;
    const double t0 = get(OC_T);
    for (int i = 0; i < 3000; ++i) {
        oc_step(1);
        if (settled < 0 && lined()) settled = get(OC_T) - t0;
    }
    std::printf("  lined up %.1f s after the hold was asked for; a minute on: %.4f deg off the axis, roll %.4f deg, %.5f deg/s\n", settled,
                dk(OC_DOCK_ANGLE_DEG), dk(OC_DOCK_ROLL_DEG), dk(OC_DOCK_ROLL_RATE_DPS));
    CHECK(settled > 0 && settled < 30, "lined up after %.1f s", settled);
    CHECK(dk(OC_DOCK_ANGLE_DEG) < 0.01 && std::fabs(dk(OC_DOCK_ROLL_DEG)) < 0.01 && std::fabs(dk(OC_DOCK_ROLL_RATE_DPS)) < 0.001, "%.4f deg, %.4f deg, %.5f deg/s",
          dk(OC_DOCK_ANGLE_DEG), dk(OC_DOCK_ROLL_DEG), dk(OC_DOCK_ROLL_RATE_DPS));
    // by the flight's readouts: nose along the axis, roof on the key
    CHECK(angle(body({1, 0, 0}), site(OC_RING_AX_E)) < 2e-4 && angle(body({0, 0, -1}), site(OC_RING_REF_E)) < 2e-4, "nose %.2e rad off the axis, roof %.2e rad off the key",
          angle(body({1, 0, 0}), site(OC_RING_AX_E)), angle(body({0, 0, -1}), site(OC_RING_REF_E)));
    // the stick still turns the craft, and the hold brings it back
    oc_controls(1, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(100);
    CHECK(dk(OC_DOCK_ANGLE_DEG) > 5, "the stick pitched the nose %.2f deg off the axis", dk(OC_DOCK_ANGLE_DEG));
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(1500);
    CHECK(lined(), "back on the port: %.3f deg, roll %.3f deg", dk(OC_DOCK_ANGLE_DEG), dk(OC_DOCK_ROLL_DEG));
    CHECK(finite(), "finite");
}

// A pilot docks by hand: the attitude left to OC_SAS_PORT, the hands on the thrusters' keys alone, each
// full on or off, flying the readouts.
void handDocking() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PORT);
    const double t0 = get(OC_T);
    const double took = handFliesIn({1.0, 0.10, true}, 900);
    std::printf("  captured %.0f s after taking the controls: %.3f m/s, %.3f m off the centre, %.3f m/s across, %.3f deg off the axis, roll %.3f deg, %.4f deg/s\n", took,
                dk(OC_DOCK_C_SPEED), dk(OC_DOCK_C_OFFSET), dk(OC_DOCK_C_SLIDE), dk(OC_DOCK_C_ANGLE_DEG), dk(OC_DOCK_C_ROLL_DEG), dk(OC_DOCK_C_ROLL_RATE_DPS));
    CHECK(took > 0 && took < 600, "took %.0f s", took);
    CHECK(dk(OC_DOCK_DOCKED) == 1 && dk(OC_DOCK_VERDICT) == OC_DOCK_V_CAPTURED, "docked %.0f, verdict %.0f", dk(OC_DOCK_DOCKED), dk(OC_DOCK_VERDICT));
    CHECK(get(OC_CRASHED) == 0, "crashed into %s", hitName(idk(OC_DOCK_HIT)));
    CHECK(dk(OC_DOCK_C_SPEED) >= OC_DOCK_V_MIN && dk(OC_DOCK_C_SPEED) <= OC_DOCK_V_MAX && dk(OC_DOCK_C_OFFSET) <= OC_DOCK_TOL_OFFSET_M, "%.3f m/s, %.3f m off",
          dk(OC_DOCK_C_SPEED), dk(OC_DOCK_C_OFFSET));
    oc_step(400);   // the latches draw it in
    CHECK(dk(OC_DOCK_PHASE) == OC_DOCK_PH_DOCKED && portMiss() < 1e-6, "docked hard: phase %.0f, the head %.3g m off the port", dk(OC_DOCK_PHASE), portMiss());
    (void)t0;
}

// A contact at 1.5 m/s does not capture: the head bounces off the face on the probe's spring and damper,
// and the craft comes away slower than it arrived, in one piece.
void fastContactBounces() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PORT);
    double deepest = 0;
    const double took = handFliesIn({1.5, 1.5, false}, 900, &deepest);
    std::printf("  contact after %.0f s at %.3f m/s, %.3f m off the centre: %.3f m of the stroke used, away at %.3f m/s\n", took, dk(OC_DOCK_C_SPEED), dk(OC_DOCK_C_OFFSET),
                deepest, -dk(OC_DOCK_CLOSING));
    CHECK(took > 0, "no contact");
    CHECK(dk(OC_DOCK_C_SPEED) > 1.4 && dk(OC_DOCK_C_SPEED) < 1.6, "contact at %.3f m/s", dk(OC_DOCK_C_SPEED));
    CHECK(dk(OC_DOCK_C_OFFSET) < OC_DOCK_TOL_OFFSET_M, "on the centre: %.3f m off", dk(OC_DOCK_C_OFFSET));
    CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_FAST, "verdict %.0f", dk(OC_DOCK_VERDICT));
    CHECK(dk(OC_DOCK_DOCKED) == 0 && get(OC_CRASHED) == 0, "docked %.0f, crashed %.0f", dk(OC_DOCK_DOCKED), get(OC_CRASHED));
    CHECK(deepest > 0.05 && deepest < OC_DOCK_STROKE_M, "%.3f m of the %.2f m stroke", deepest, OC_DOCK_STROKE_M);
    CHECK(dk(OC_DOCK_CLOSING) < -0.3 && dk(OC_DOCK_CLOSING) > -0.9, "away at %.3f m/s", -dk(OC_DOCK_CLOSING));
    oc_step(250);
    CHECK(dk(OC_DOCK_GAP) > 1 && dk(OC_DOCK_CONTACT) == 0, "five seconds on: %.2f m off the face", dk(OC_DOCK_GAP));
    CHECK(finite(), "finite");
}

// A contact that uses the probe's whole stroke is a crash, and the readouts say what was hit; the wreck
// stays at the port.
void grossContactCrashes() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PORT);
    const double took = handFliesIn({5.0, 5.0, false}, 900);
    std::printf("  contact after %.0f s at %.2f m/s: hit %s with %s\n", took, dk(OC_DOCK_C_SPEED), hitName(idk(OC_DOCK_HIT)), partName(idk(OC_DOCK_HIT_PART)));
    CHECK(get(OC_CRASHED) == 1, "not crashed");
    CHECK(dk(OC_DOCK_HIT) == OC_DOCK_HIT_PORT && dk(OC_DOCK_HIT_PART) == OC_DOCK_PART_PROBE, "hit %s with %s", hitName(idk(OC_DOCK_HIT)), partName(idk(OC_DOCK_HIT_PART)));
    CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_FAST && dk(OC_DOCK_DOCKED) == 0, "verdict %.0f, docked %.0f", dk(OC_DOCK_VERDICT), dk(OC_DOCK_DOCKED));
    const double miss = portMiss();
    oc_step(3000);
    CHECK(std::fabs(portMiss() - miss) < 1e-6 && miss < 1, "the wreck moved from %.3f m to %.3f m off the port in a minute", miss, portMiss());
}

// A contact a metre off the centre, at the crew's own speed, does not capture.
void offCentreContactBounces() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PORT);
    Hands h{1.0, 0.10, false};
    h.offY = 1.0;
    const double took = handFliesIn(h, 900);
    std::printf("  contact after %.0f s at %.3f m/s, %.3f m off the centre; away at %.3f m/s\n", took, dk(OC_DOCK_C_SPEED), dk(OC_DOCK_C_OFFSET), -dk(OC_DOCK_CLOSING));
    CHECK(took > 0, "no contact");
    CHECK(std::fabs(dk(OC_DOCK_C_OFFSET) - 1.0) < 0.1 && std::fabs(dk(OC_DOCK_C_SPEED) - 0.1) < 0.02, "%.3f m off at %.3f m/s", dk(OC_DOCK_C_OFFSET), dk(OC_DOCK_C_SPEED));
    CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_OFFSET, "verdict %.0f", dk(OC_DOCK_VERDICT));
    CHECK(dk(OC_DOCK_DOCKED) == 0 && get(OC_CRASHED) == 0, "docked %.0f, crashed %.0f", dk(OC_DOCK_DOCKED), get(OC_CRASHED));
    CHECK(dk(OC_DOCK_CONTACT) == 0 && dk(OC_DOCK_CLOSING) < -0.01 && dk(OC_DOCK_CLOSING) > -0.1, "the head came off the face: closing %.3f m/s", dk(OC_DOCK_CLOSING));
}

// Centred, slow and lined up, but sliding across the face at three times the tolerance: the latches do
// not hold, and the head comes off the face. (The audit of c56d77b found no test reached this verdict.)
void slidingContactBounces() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PORT);
    Hands h{1.0, 0.10, false};
    const double t0 = get(OC_T), before = dk(OC_DOCK_C_T);
    while (get(OC_T) - t0 < 900 && get(OC_CRASHED) == 0 && dk(OC_DOCK_GAP) > 0.06 && dk(OC_DOCK_C_T) == before)
        handStep(h, lined() ? clampd(0.05 * dk(OC_DOCK_GAP), h.contact, h.closeMax) : 0);
    // 6 cm off the face: the small thrusters full across, still closing at 0.1 m/s, to the touch
    while (get(OC_T) - t0 < 960 && get(OC_CRASHED) == 0 && dk(OC_DOCK_C_T) == before) {
        oc_controls(0, 0, 0, 0, thruster(0.1 - dk(OC_DOCK_CLOSING), false), 1, 0, 0, 0);
        oc_step(1);
    }
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(500);
    std::printf("  contact at %.3f m/s, %.3f m off the centre, sliding at %.3f m/s: verdict %d\n", dk(OC_DOCK_C_SPEED), dk(OC_DOCK_C_OFFSET), dk(OC_DOCK_C_SLIDE),
                idk(OC_DOCK_VERDICT));
    CHECK(dk(OC_DOCK_C_T) != before, "no contact");
    CHECK(dk(OC_DOCK_C_SLIDE) > 2 * OC_DOCK_TOL_SLIDE && dk(OC_DOCK_C_OFFSET) < OC_DOCK_TOL_OFFSET_M && dk(OC_DOCK_C_SPEED) <= OC_DOCK_V_MAX,
          "sliding %.3f m/s, %.3f m off, %.3f m/s in", dk(OC_DOCK_C_SLIDE), dk(OC_DOCK_C_OFFSET), dk(OC_DOCK_C_SPEED));
    CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_SLIDING, "verdict %.0f", dk(OC_DOCK_VERDICT));
    CHECK(dk(OC_DOCK_DOCKED) == 0 && get(OC_CRASHED) == 0, "docked %.0f, crashed %.0f", dk(OC_DOCK_DOCKED), get(OC_CRASHED));
}

// Centred and slow, but the craft's axis 5 degrees off the port's, held there among the stars: the probe
// meets the drogue askew, and the latches do not hold. (Nor did any test reach this verdict.)
void angledContactBounces() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PORT);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(500);                                 // lined up, turning with the port
    oc_sas(OC_SAS_HOLD);
    oc_controls(0.2, 0, 0, 0, 0, 0, 0, 0, 0);     // pitch at 0.05 rad/s for 1.76 s: 5 degrees off the axis
    oc_step(88);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(250);                                 // held there; the port turns on, its roll unmatched
    Hands h{1.0, 0.10, false};
    h.waitLined = false;
    const double took = handFliesIn(h, 1500);
    std::printf("  contact after %.0f s at %.3f m/s, %.3f m off the centre, %.2f deg off the axis: verdict %d\n", took, dk(OC_DOCK_C_SPEED), dk(OC_DOCK_C_OFFSET),
                dk(OC_DOCK_C_ANGLE_DEG), idk(OC_DOCK_VERDICT));
    CHECK(took > 0, "no contact");
    CHECK(dk(OC_DOCK_C_ANGLE_DEG) > OC_DOCK_TOL_ANGLE_DEG && dk(OC_DOCK_C_OFFSET) < OC_DOCK_TOL_OFFSET_M && dk(OC_DOCK_C_SLIDE) < OC_DOCK_TOL_SLIDE,
          "%.2f deg off, %.3f m off, sliding %.3f m/s", dk(OC_DOCK_C_ANGLE_DEG), dk(OC_DOCK_C_OFFSET), dk(OC_DOCK_C_SLIDE));
    CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_ANGLE, "verdict %.0f", dk(OC_DOCK_VERDICT));
    CHECK(dk(OC_DOCK_DOCKED) == 0 && get(OC_CRASHED) == 0, "docked %.0f, crashed %.0f", dk(OC_DOCK_DOCKED), get(OC_CRASHED));
}

// A contact slower than the window does not trip the latches; backed off and brought in again at
// 0.1 m/s, the same craft is captured.
void slowContactDoesNotLatch() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PORT);
    Hands h{1.0, 0.015, false};
    const double took = handFliesIn(h, 1200);
    std::printf("  contact after %.0f s at %.4f m/s\n", took, dk(OC_DOCK_C_SPEED));
    CHECK(took > 0, "no contact");
    CHECK(dk(OC_DOCK_C_SPEED) > 0.005 && dk(OC_DOCK_C_SPEED) < OC_DOCK_V_MIN, "contact at %.4f m/s", dk(OC_DOCK_C_SPEED));
    CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_SLOW && dk(OC_DOCK_DOCKED) == 0 && get(OC_CRASHED) == 0, "verdict %.0f, docked %.0f", dk(OC_DOCK_VERDICT), dk(OC_DOCK_DOCKED));
    for (int i = 0; i < 1500 && dk(OC_DOCK_GAP) < 1.0; ++i) handStep(h, -0.2);   // back off a metre
    CHECK(dk(OC_DOCK_GAP) >= 1.0, "backed off to %.2f m", dk(OC_DOCK_GAP));
    h.contact = 0.10;
    const double again = handFliesIn(h, 300);
    std::printf("  and again after %.0f s at %.3f m/s\n", again, dk(OC_DOCK_C_SPEED));
    CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_CAPTURED && dk(OC_DOCK_DOCKED) == 1, "the second try: verdict %.0f, docked %.0f", dk(OC_DOCK_VERDICT), dk(OC_DOCK_DOCKED));
}

// A craft that does not turn with the port is not captured, however well it is flown in: the key is out
// of phase or the spin unmatched.
void spinMustMatch() {
    if (!handsAtHold()) return;
    Hands h{1.0, 0.10, false};
    h.waitLined = false;
    const double took = handFliesIn(h, 900);
    std::printf("  contact after %.0f s at %.3f m/s, %.3f m off the centre, the key %.1f deg out, the spin %.2f deg/s out\n", took, dk(OC_DOCK_C_SPEED), dk(OC_DOCK_C_OFFSET),
                dk(OC_DOCK_C_ROLL_DEG), dk(OC_DOCK_C_ROLL_RATE_DPS));
    CHECK(took > 0, "no contact");
    CHECK(dk(OC_DOCK_C_OFFSET) < OC_DOCK_TOL_OFFSET_M && std::fabs(dk(OC_DOCK_C_SPEED) - 0.1) < 0.02 && dk(OC_DOCK_C_ANGLE_DEG) < 1, "flown in well: %.3f m off, %.3f m/s, %.2f deg",
          dk(OC_DOCK_C_OFFSET), dk(OC_DOCK_C_SPEED), dk(OC_DOCK_C_ANGLE_DEG));
    CHECK(std::fabs(dk(OC_DOCK_C_ROLL_RATE_DPS) + SPIN * R2D) < 0.05, "the craft's turn against the port's: %.3f deg/s", dk(OC_DOCK_C_ROLL_RATE_DPS));
    CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_ROLL || dk(OC_DOCK_VERDICT) == OC_DOCK_V_ROLL_RATE, "verdict %.0f", dk(OC_DOCK_VERDICT));
    CHECK(dk(OC_DOCK_DOCKED) == 0 && get(OC_CRASHED) == 0, "docked %.0f, crashed %.0f", dk(OC_DOCK_DOCKED), get(OC_CRASHED));
}

// Flown outward from the hold point, inside the rim, the craft meets the band's roof and that is a
// crash; the readouts say what was hit and with what.
void roofIsSolid() {
    if (!handsAtHold()) return;
    const double t0 = get(OC_T);
    const Where w = fliesOut(0.10, 300);   // 470 m toward the ring's plane on the way out: inside the rim, short of the spokes
    std::printf("  after %.0f s: %.0f m from the axis, %.0f m along it: hit %s with %s\n", get(OC_T) - t0, w.radial, w.axial, hitName(idk(OC_DOCK_HIT)), partName(idk(OC_DOCK_HIT_PART)));
    CHECK(get(OC_CRASHED) == 1, "flew %.0f m from the axis without a crash", w.radial);
    CHECK(dk(OC_DOCK_HIT) == OC_DOCK_HIT_ROOF, "hit %s", hitName(idk(OC_DOCK_HIT)));
    CHECK(dk(OC_DOCK_HIT_PART) != OC_DOCK_PART_NONE, "with nothing");
    CHECK(w.radial > OC_RING_ROOF_M - 30 && w.radial < OC_RING_ROOF_M && std::fabs(w.axial) < OC_RING_WIDTH_M / 2, "%.0f m from the axis, %.0f m along it", w.radial, w.axial);
    // the wreck stays where it struck, turning with the ring
    const double radial = dk(OC_DOCK_RADIAL), axial = dk(OC_DOCK_AXIAL), spoke = where().spoke;
    oc_step(3000);
    CHECK(std::fabs(dk(OC_DOCK_RADIAL) - radial) < 1e-6 && std::fabs(dk(OC_DOCK_AXIAL) - axial) < 1e-6 && std::fabs(where().spoke - spoke) < 1e-6,
          "the wreck moved in the ring's frame: %.3f m, %.3f m, %.4f deg", dk(OC_DOCK_RADIAL) - radial, dk(OC_DOCK_AXIAL) - axial, where().spoke - spoke);
    CHECK(finite(), "finite");
}

// Flown outward beside the ring, the craft meets a rim wall from the side.
void rimWallIsSolid() {
    if (!handsAtHold()) return;
    const double t0 = get(OC_T);
    // The probe's head is 18 m ahead of the centre of mass, which starts 150 m short of the ring's side: a
    // line that takes up 132 m in 4,830 m brings the head to the wall half way between its lip and the hull.
    const Where w = fliesOut((150.0 - OC_DOCK_PROBE_M) / 4830, 300);
    std::printf("  after %.0f s: %.0f m from the axis, %.0f m along it: hit %s with %s\n", get(OC_T) - t0, w.radial, w.axial, hitName(idk(OC_DOCK_HIT)), partName(idk(OC_DOCK_HIT_PART)));
    CHECK(get(OC_CRASHED) == 1, "flew %.0f m from the axis without a crash", w.radial);
    CHECK(dk(OC_DOCK_HIT) == OC_DOCK_HIT_RIM, "hit %s", hitName(idk(OC_DOCK_HIT)));
    CHECK(dk(OC_DOCK_HIT_PART) == OC_DOCK_PART_PROBE, "with %s", partName(idk(OC_DOCK_HIT_PART)));
    CHECK(w.radial > OC_RING_RIM_M + 100 && w.radial < OC_RING_HULL_M - 100 && std::fabs(w.axial + OC_RING_WIDTH_M / 2 + OC_DOCK_PROBE_M) < 3,
          "%.0f m from the axis, %.0f m along it", w.radial, w.axial);
}

// Parked in the spokes' plane, between the hub and the rim, the craft is struck by the next spoke round.
void spokeIsSolid() {
    if (!handsAtHold()) return;
    const Nav at = navNow();
    bool ok = flyTo({at.x, 800, 0}, 25, 300);            // out along the right wing, beside the hub
    CHECK(ok, "crashed on the way out: %s", hitName(idk(OC_DOCK_HIT)));
    if (ok) ok = flyTo({-60, 800, 0}, 25, 300);          // up to the spokes' plane, just short of it
    CHECK(ok, "crashed short of the plane: %s", hitName(idk(OC_DOCK_HIT)));
    const double t0 = get(OC_T);
    Nav was = navNow();
    oc_step(1);
    while (get(OC_T) - t0 < 120 && get(OC_CRASHED) == 0) was = flyStep({0, 800, 0}, was, 5);   // into the plane, and wait
    const Where w = where();
    std::printf("  %.0f s after going in, %.0f m from the axis: hit %s with %s\n", get(OC_T) - t0, w.radial, hitName(idk(OC_DOCK_HIT)), partName(idk(OC_DOCK_HIT_PART)));
    CHECK(get(OC_CRASHED) == 1, "a minute in the spokes' plane without a crash");
    CHECK(dk(OC_DOCK_HIT) == OC_DOCK_HIT_SPOKE, "hit %s", hitName(idk(OC_DOCK_HIT)));
    CHECK(std::fabs(w.axial) < OC_RING_SPOKE_M / 2 + 25 && std::fabs(w.spoke) * D2R * w.radial < OC_RING_SPOKE_M / 2 + 25, "%.0f m along the axis, %.1f deg from a spoke", w.axial, w.spoke);
}

// The spokes run from the hub to the roof, where the band's structure begins: held still in the spokes'
// plane 50 m above the roof, between the rim walls' tops (4,620 m from the axis) and the roof (4,700 m),
// the craft is met by a spoke sweeping by at 206 m/s.
void spokeReachesTheRoof() {
    if (!handsAtHold()) return;
    const Nav at = navNow();
    bool ok = flyTo({at.x, 4550, 0}, 25, 400);                 // out along the right wing, off the band's face
    if (ok) ok = flyTo({-60, 4550, 0}, 25, 300);               // in over the band, inside the rim walls' tops
    if (ok) ok = flyTo({-60, 4650, 0}, 10, 120);               // down to 50 m above the roof, short of the spokes' plane
    CHECK(ok, "crashed on the way: %s", hitName(idk(OC_DOCK_HIT)));
    if (!ok) return;
    const Where w0 = where();
    const double t0 = get(OC_T);
    Nav was = navNow();
    oc_step(1);
    while (get(OC_T) - t0 < 60 && get(OC_CRASHED) == 0) was = flyStep({0, 4650, 0}, was, 5);   // into the plane, and wait
    const Where w = where();
    std::printf("  from %.0f m off the axis, %.0f m along it: %.0f s in the plane, hit %s at %.0f m off the axis\n", w0.radial, w0.axial, get(OC_T) - t0,
                hitName(idk(OC_DOCK_HIT)), w.radial);
    CHECK(get(OC_CRASHED) == 1 && dk(OC_DOCK_HIT) == OC_DOCK_HIT_SPOKE, "a minute in the spokes' plane above the roof: hit %s", hitName(idk(OC_DOCK_HIT)));
}

// Flown in from the side, the craft meets the hub's wall.
void hubIsSolid() {
    if (!handsAtHold()) return;
    const Nav at = navNow();
    bool ok = flyTo({at.x, 400, 0}, 25, 300);     // out along the right wing
    if (ok) ok = flyTo({-200, 400, 0}, 25, 300);  // forward, to beside the hub, clear of the spokes' plane
    CHECK(ok, "crashed on the way: %s", hitName(idk(OC_DOCK_HIT)));
    const double t0 = get(OC_T);
    Nav was = navNow();
    oc_step(1);
    while (get(OC_T) - t0 < 200 && get(OC_CRASHED) == 0) was = flyStep({-200, 0, 0}, was, 5);   // and in, toward the axis
    const Where w = where();
    std::printf("  %.0f m from the axis, %.0f m along it: hit %s with %s\n", w.radial, w.axial, hitName(idk(OC_DOCK_HIT)), partName(idk(OC_DOCK_HIT_PART)));
    CHECK(get(OC_CRASHED) == 1, "reached the axis through the hub");
    CHECK(dk(OC_DOCK_HIT) == OC_DOCK_HIT_HUB, "hit %s", hitName(idk(OC_DOCK_HIT)));
    CHECK(w.radial > OC_HUB_RADIUS_M && w.radial < OC_HUB_RADIUS_M + 25, "%.0f m from the axis", w.radial);
}

// The open middle is free: beside the hub the craft flies along the axis, through the spokes' plane
// between two spokes, and out of the rim's opening on the far side, and touches nothing.
void openMiddleIsFree() {
    if (!handsAtHold()) return;
    const Nav at = navNow();
    CHECK(flyTo({at.x, 500, 0}, 25, 300), "crashed on the way out: %s", hitName(idk(OC_DOCK_HIT)));
    // Full thrust forward for 40 s is 20 m/s and 400 m; the plane is 650 m ahead, so the craft is in it
    // 52.5 s after starting. Start when the ring will then have turned the craft half way between spokes.
    const double tWait = get(OC_T);
    CHECK(waitForGap(40 + (-navNow().x - 400) / 20), "no gap came round");
    const int waited = (int)std::lround((get(OC_T) - tWait) / OC_DT);
    double nearest = 1e9, inPlane = 0, through = 0;
    const double t0 = get(OC_T);
    while (get(OC_T) - t0 < 150 && get(OC_CRASHED) == 0 && where().axial < OC_RING_WIDTH_M / 2 + 150) {
        oc_controls(0, 0, 0, 0, get(OC_T) - t0 < 40 ? 1 : 0, 0, 0, 0, 0);
        oc_step(1);
        const Where w = where();
        if (std::fabs(w.axial) < OC_RING_SPOKE_M / 2 + 20) {   // any of the craft within the spokes' thickness
            nearest = std::fmin(nearest, std::fabs(w.spoke) * D2R * w.radial);
            inPlane += OC_DT;
        }
        if (w.axial > 0 && through == 0) through = w.radial;
    }
    const Where w = where();
    std::printf("  waited %.1f s for the gap; %.1f s in the spokes' plane, %.0f m from the axis, never nearer than %.0f m to a spoke's line; out at %.0f m along the axis\n",
                waited * OC_DT, inPlane, through, nearest, w.axial);
    CHECK(get(OC_CRASHED) == 0 && dk(OC_DOCK_HIT) == OC_DOCK_HIT_NONE, "hit %s with %s", hitName(idk(OC_DOCK_HIT)), partName(idk(OC_DOCK_HIT_PART)));
    CHECK(w.axial > OC_RING_WIDTH_M / 2 + 100, "out of the far side: %.0f m along the axis", w.axial);
    CHECK(through > OC_HUB_RADIUS_M + 100 && through < OC_RING_RIM_M, "through the plane %.0f m from the axis: beside the hub, inside the rim", through);
    CHECK(inPlane > 3 && nearest > OC_RING_SPOKE_M / 2 + 20, "%.1f s in the plane, %.0f m from a spoke's line", inPlane, nearest);
    CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_NONE && dk(OC_DOCK_CONTACT) == 0, "a contact: verdict %.0f", dk(OC_DOCK_VERDICT));
    CHECK(finite(), "finite");
}

// Half an orbit after arriving, the craft is on the far side of the ring from the port. The crew's
// approach, engaged there, goes round the ring and not through it.
void approachGoesRound() {
    if (!toOrbit()) return;
    oc_step(140000);   // 2,800 s: the ring's axis is fixed among the stars, and the craft's side of it is not
    const Where w0 = where();
    CHECK(w0.axial > OC_RING_WIDTH_M, "the craft is beyond the ring's far side: %.0f m along the axis", w0.axial);
    oc_auto(OC_AUTO_APPROACH);
    const double t0 = get(OC_T);
    double last = 1e30, arrived = -1, widest = 0, nearest = 1e30;
    while (get(OC_T) - t0 < 5400 && get(OC_CRASHED) == 0 && arrived < 0) {
        oc_step(50);
        const Where w = where();
        if (std::fabs(w.axial) < OC_RING_WIDTH_M / 2) { widest = std::fmax(widest, w.radial); nearest = std::fmin(nearest, w.radial); }
        if (get(OC_PORT_RANGE) < 5 && std::fabs(get(OC_PORT_RANGE) - last) < 0.2) arrived = get(OC_T) - t0;
        last = get(OC_PORT_RANGE);
    }
    std::printf("  from %.1f km along the axis and %.1f km off it: at the hold point after %.0f s, passing the band %.0f m from the axis\n", w0.axial / 1000, w0.radial / 1000,
                arrived, nearest);
    CHECK(get(OC_CRASHED) == 0, "crashed into %s with %s", hitName(idk(OC_DOCK_HIT)), partName(idk(OC_DOCK_HIT_PART)));
    CHECK(arrived > 0, "not at the hold point: %.0f m off it", get(OC_PORT_RANGE));
    CHECK(nearest > OC_RING_HULL_M + 100, "passed the band %.0f m from the axis", nearest);
    (void)widest;
}

// The crew's docking is refused where it makes no sense, says why, and leaves whoever was flying in charge.
void dockingRefused() {
    oc_reset(LAT, LON, HDG);
    oc_auto(OC_AUTO_DOCK);
    CHECK(dk(OC_DOCK_REFUSED) == OC_DOCK_NO_LOW && get(OC_AUTO) == OC_AUTO_CREW, "on the runway: refused %.0f, auto %.0f", dk(OC_DOCK_REFUSED), get(OC_AUTO));
    oc_step(1500);
    CHECK(get(OC_PHASE) > OC_PH_HOLD && get(OC_CRASHED) == 0, "the crew flew on: phase %.0f", get(OC_PHASE));
    if (!toOrbit()) return;
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PROGRADE);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(1500);
    oc_controls(0, 0, 0, 1, 0, 0, 0, 0, 0);   // four seconds of the main drive: 70 m/s past the ring
    oc_step(200);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(250);
    oc_auto(OC_AUTO_DOCK);
    CHECK(dk(OC_DOCK_REFUSED) == OC_DOCK_NO_FAST && get(OC_AUTO) == OC_AUTO_OFF, "passing the ring fast: refused %.0f, auto %.0f", dk(OC_DOCK_REFUSED), get(OC_AUTO));
    oc_step(50 * 1200);                       // twenty minutes on, the ring is far behind
    oc_auto(OC_AUTO_DOCK);
    CHECK(dk(OC_DOCK_REFUSED) == OC_DOCK_NO_FAR && get(OC_AUTO) == OC_AUTO_OFF, "%.0f km from the ring: refused %.0f, auto %.0f", get(OC_RING_RANGE) / 1000, dk(OC_DOCK_REFUSED),
          get(OC_AUTO));
    // and docked, asking again changes nothing
    if (!toHold() || crewDocks(600) < 0) { CHECK(false, "no docking"); return; }
    oc_auto(OC_AUTO_DOCK);
    CHECK(dk(OC_DOCK_REFUSED) == OC_DOCK_NO_DOCKED && dk(OC_DOCK_DOCKED) == 1 && get(OC_AUTO) == OC_AUTO_OFF, "docked already: refused %.0f, docked %.0f, auto %.0f",
          dk(OC_DOCK_REFUSED), dk(OC_DOCK_DOCKED), get(OC_AUTO));
}

// The speed the crew's docking judges is the flight's own relative velocity, in the frame that turns with
// the ring's orbit. Drifted back to 48 km behind in nearly the ring's own orbit, the craft passes the ring
// slowly in that frame, though the plain difference of the two velocities is over 50 m/s there (the
// orbit's turn times the distance): asked to dock, the crew does.
void judgesSpeedInTheOrbitFrame() {
    if (!toOrbit()) return;
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_HOLD);
    oc_controls(0, 0, 0, 0, 1, 0, 0, 0, 0);   // four seconds of the small thrusters, nose on the ring: 2 m/s prograde, so the craft climbs and falls behind
    oc_step(200);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    while (get(OC_RING_RANGE) < 48000 && get(OC_T) < 8000 && get(OC_CRASHED) == 0) oc_step(50);
    const V d0 = stars(site(OC_SITE_E) - site(OC_RING_E), get(OC_T));   // the craft from the ring among the stars, a step apart
    oc_step(1);
    const double plain = norm(stars(site(OC_SITE_E) - site(OC_RING_E), get(OC_T)) - d0) * (1 / OC_DT);
    const double vrel = norm(site(OC_VREL_E)), range = get(OC_RING_RANGE);
    oc_auto(OC_AUTO_DOCK);
    std::printf("  %.1f km from the ring: passing at %.1f m/s in the orbit's frame, %.1f m/s by the plain difference; refused %d, phase %d\n", range / 1000, vrel, plain,
                idk(OC_DOCK_REFUSED), idk(OC_DOCK_PHASE));
    CHECK(range > 48000 && range < OC_DOCK_ENGAGE_M, "%.1f km from the ring", range / 1000);
    CHECK(plain > OC_DOCK_ENGAGE_SPEED && vrel < 0.5 * OC_DOCK_ENGAGE_SPEED, "%.1f m/s plain, %.1f m/s in the orbit's frame", plain, vrel);
    CHECK(get(OC_AUTO) == OC_AUTO_DOCK && dk(OC_DOCK_REFUSED) == OC_DOCK_NO_NONE && dk(OC_DOCK_PHASE) == OC_DOCK_PH_TRANSFER, "auto %.0f, refused %.0f, phase %.0f",
          get(OC_AUTO), dk(OC_DOCK_REFUSED), dk(OC_DOCK_PHASE));
}

// The crew's approach is taken where docking is, and flies home to the hold point from the edge of that:
// from 48 km behind, with the periapsis kept well above the air; from 60 km, or from the runway, it is
// refused and nothing changes. (Far out, cancelling the plain difference from the Ring's velocity, n d,
// would put the periapsis into the ground: from 380 km behind it once did.)
void approachGatedLikeDocking() {
    oc_reset(LAT, LON, HDG);
    const double auto0 = get(OC_AUTO);
    oc_auto(OC_AUTO_APPROACH);
    CHECK(get(OC_AUTO) == auto0, "on the runway the approach is refused: auto %.0f", get(OC_AUTO));
    for (const double range : {48000.0, 60000.0}) {
        if (!toOrbit()) return;
        oc_auto(OC_AUTO_OFF);
        oc_sas(OC_SAS_HOLD);
        oc_controls(0, 0, 0, 0, 1, 0, 0, 0, 0);   // 2 m/s along the nose, toward the Ring: the craft climbs and falls behind
        oc_step(200);
        oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
        while (get(OC_RING_RANGE) < range && get(OC_T) < 9000 && get(OC_CRASHED) == 0) oc_step(50);
        const double vrel = norm(site(OC_VREL_E));
        oc_auto(OC_AUTO_APPROACH);
        std::printf("  %.1f km from the Ring, passing at %.1f m/s: the approach %s\n", get(OC_RING_RANGE) / 1000, vrel,
                    get(OC_AUTO) == OC_AUTO_APPROACH ? "taken" : "refused");
        if (range > OC_DOCK_ENGAGE_M) {
            CHECK(get(OC_AUTO) == OC_AUTO_OFF, "from %.1f km the approach is refused: auto %.0f", get(OC_RING_RANGE) / 1000, get(OC_AUTO));
            continue;
        }
        CHECK(get(OC_AUTO) == OC_AUTO_APPROACH, "from %.1f km the approach is taken", get(OC_RING_RANGE) / 1000);
        const double t0 = get(OC_T);
        double lowest = 1e30, arrived = -1;
        while (get(OC_T) - t0 < 4000 && get(OC_CRASHED) == 0) {
            oc_step(50);
            lowest = std::fmin(lowest, get(OC_PERI));
            if (arrived < 0 && get(OC_PORT_RANGE) < 5) arrived = get(OC_T) - t0;
            if (arrived > 0 && get(OC_T) - t0 > arrived + 60) break;
        }
        std::printf("    at the hold point after %.0f s; the periapsis never under %.1f km\n", arrived, lowest / 1000);
        CHECK(get(OC_CRASHED) == 0, "not crashed");
        CHECK(arrived > 0, "reached the hold point");
        CHECK(lowest > 450000, "the periapsis down to %.1f km", lowest / 1000);
    }
}

// The same inputs give the same docking, undocking and bounce, step for step; a different input, a
// different state.
void deterministic() {
    unsigned a[4], b[4];
    for (int run = 0; run < 2; ++run) {
        unsigned* h = run ? b : a;
        if (!toOrbit() || crewDocks(2400) < 0) { CHECK(false, "no docking"); return; }
        h[0] = oc_hash();
        oc_step(1500);
        h[1] = oc_hash();
        oc_undock();
        oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
        oc_step(1500);
        h[2] = oc_hash();
        oc_controls(0, 0, 0, 0, 1, 0, 0, 0, 0);   // back in, hard: a bounce
        oc_step(200);
        oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
        oc_step(800);
        h[3] = oc_hash();
        CHECK(dk(OC_DOCK_VERDICT) == OC_DOCK_V_FAST, "the push back in: verdict %.0f at %.2f m/s", dk(OC_DOCK_VERDICT), dk(OC_DOCK_C_SPEED));
    }
    for (int i = 0; i < 4; ++i) CHECK(a[i] == b[i], "hash %d: %08x then %08x", i, a[i], b[i]);
    CHECK(a[0] != a[1] && a[1] != a[2] && a[2] != a[3], "the hash stood still: %08x %08x %08x %08x", a[0], a[1], a[2], a[3]);
    if (!toOrbit() || crewDocks(2400) < 0) return;
    oc_step(1500);
    oc_undock();
    oc_controls(0, 0, 0, 0, 0, 0.01, 0, 0, 0);   // a breath of thruster to the right
    oc_step(1500);
    CHECK(oc_hash() != a[2], "a different input, the same hash %08x", a[2]);
}

struct Test { const char* name; void (*fn)(); };
const Test tests[] = {
    {"readouts_block", readoutsBlock},
    {"crew_docks_from_hold", crewDocksFromHold},
    {"capture_inside_tolerances", captureInsideTolerances},
    {"crew_docks_from_orbit", crewDocksFromOrbit},
    {"crew_docks_from_inside_the_ring", crewDocksFromInsideTheRing},
    {"docked_rides_the_ring", dockedRidesTheRing},
    {"undock_separates", undockSeparates},
    {"crew_docks_again_after_undock", crewDocksAgainAfterUndock},
    {"port_hold", portHold},
    {"hand_docking", handDocking},
    {"fast_contact_bounces", fastContactBounces},
    {"gross_contact_crashes", grossContactCrashes},
    {"off_centre_contact_bounces", offCentreContactBounces},
    {"slow_contact_does_not_latch", slowContactDoesNotLatch},
    {"sliding_contact_bounces", slidingContactBounces},
    {"angled_contact_bounces", angledContactBounces},
    {"spin_must_match", spinMustMatch},
    {"roof_is_solid", roofIsSolid},
    {"rim_wall_is_solid", rimWallIsSolid},
    {"spoke_is_solid", spokeIsSolid},
    {"spoke_reaches_the_roof", spokeReachesTheRoof},
    {"hub_is_solid", hubIsSolid},
    {"open_middle_is_free", openMiddleIsFree},
    {"approach_goes_round", approachGoesRound},
    {"docking_refused", dockingRefused},
    {"judges_speed_in_the_orbit_frame", judgesSpeedInTheOrbitFrame},
    {"approach_gated_like_docking", approachGatedLikeDocking},
    {"deterministic", deterministic},
};

}   // namespace

int main(int argc, char** argv) {
    int ran = 0;
    for (const Test& t : tests) {
        if (argc > 1 && std::strcmp(argv[1], t.name) != 0) continue;
        const int before = failures;
        std::printf("%s\n", t.name);
        t.fn();
        std::printf("  %s\n", failures == before ? "ok" : "FAILED");
        ++ran;
    }
    if (ran == 0) { std::printf("no test named %s\n", argc > 1 ? argv[1] : "?"); return 2; }
    return failures ? 1 : 0;
}
