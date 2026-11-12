// dock.cpp — docking at the hub, and contact with the ring (orbit_dock.h): the port's geometry, the
// capture and the hard contact, the ride while held, the crew's docking, the hold a pilot docks under,
// and the craft against the ring's structure. Every number marked as chosen is a design choice for the
// sketch, not a measurement of any docking system. GPLv3.

#include "internal.h"

#include <cmath>
#include <cstring>

namespace oc {

namespace {

double out[OC_DOCK_COUNT];

enum { HELD_PORT = 1, HELD_WRECK = 2 };

// ---- chosen -------------------------------------------------------------------------------------

const V3 PROBE{OC_DOCK_PROBE_M, 0, 0};   // the probe's head, body axes

// The probe's spring and damper, pressed by the port's face. With the craft at 34 t in orbit: a period of
// 1.26 s, three tenths of critical damping, a rebound at about half the closing speed (the damper only
// pushes), and 13 cm of stroke for each metre a second of it, so the whole stroke goes at about 3 m/s.
const double CONTACT_K = 8.6e5;    // N/m
const double CONTACT_C = 1.03e5;   // N s/m

// The crew's closing: 1 m/s far out, easing in proportion to the gap from 20 m, 0.1 m/s from 2 m to the
// face: the middle of the capture's window on a scale of ratios.
const double CLOSE_MAX = 1.0, CLOSE_K = 0.05, CLOSE_CONTACT = 0.10;
const double GATE_M = 5.0;        // inside this the crew goes on only while lined up to a third of the tolerances
const double ALIGN_MIN_M = 3.0;   // and lines up no closer than this
const double ARRIVE_M = 20.0;     // from the hold point: near enough to start lining up
const double TURN_IN_M = 1000.0;  // from the hold point: the nose leaves the ring's centre for the port's attitude
const double LINED = 1.0 / 3.0;   // "lined up": inside this share of each tolerance

// The craft against the ring: a few spheres, body axes (x forward, y right wing, z down), after the
// drawing's shape (web/src/craft.js). The probe's head is first: at the port's face it has rules of its own.
struct Ball { V3 at; double r; int part; };
const Ball BALLS[] = {
    {{OC_DOCK_PROBE_M, 0, 0}, 0.15, OC_DOCK_PART_PROBE},
    {{13.0, 0, 0.2}, 2.0, OC_DOCK_PART_NOSE},
    {{-13.5, -7.6, 0.35}, 1.6, OC_DOCK_PART_LEFT_WING},
    {{-13.5, 7.6, 0.35}, 1.6, OC_DOCK_PART_RIGHT_WING},
    {{-15.0, 0, -2.5}, 3.2, OC_DOCK_PART_TAIL},
    {{6.5, 0, 0}, 3.0, OC_DOCK_PART_BODY},
    {{-1.0, 0, 0}, 4.4, OC_DOCK_PART_BODY},
    {{-10.0, 0, 0}, 5.0, OC_DOCK_PART_BODY},
};
const int NBALLS = sizeof BALLS / sizeof BALLS[0];
const double REACH = 22.0;   // m: the craft's furthest point from its centre of mass

// The way round the ring (dockSafeAim): what counts as clear of it, and the corners of the way.
const double CLEAR_Y = OC_RING_WIDTH_M / 2 + 50;   // beyond the band's sides
const double CLEAR_R = OC_RING_HULL_M + 260;       // outside the hull
const double WAY_Y = OC_RING_WIDTH_M / 2 + 200, WAY_R = OC_RING_HULL_M + 560;
const double INSIDE_R = OC_RING_RIM_M - 120;       // inside the rim walls' lips

// ---- the ring's frame, and the port in it -------------------------------------------------------

// The ring at time t: its centre and velocity, and its axes in ECI: x the key (ringRef), y the axis,
// z = x cross y. The page draws the ring in the same axes (web/src/ring.js).
struct Frame { V3 c, vc, x, y, z; };

Frame frameAt(double t) {
    Frame f;
    f.c = ringPos(t);
    f.vc = ringVel(t);
    f.x = ringRef(t);
    f.y = ring.axis;
    f.z = cross(f.x, f.y);
    return f;
}

V3 toRing(const Frame& f, V3 p) { const V3 d = p - f.c; return {dot(d, f.x), dot(d, f.y), dot(d, f.z)}; }
V3 dirToRing(const Frame& f, V3 v) { return {dot(v, f.x), dot(v, f.y), dot(v, f.z)}; }
V3 dirFromRing(const Frame& f, V3 v) { return f.x * v.x + f.y * v.y + f.z * v.z; }
Q frameQ(const Frame& f) { return fromAxes(f.x, f.y, f.z); }

// A craft lined up on the port: nose along the axis, into the port; roof toward the key. Its right wing
// is then along -z of the ring's frame and its belly along -x.
Q portAttitude(const Frame& f) { return fromAxes(f.y, f.z * -1.0, f.x * -1.0); }

// The same attitude in the ring's frame, and the centre of mass's place there, when docked.
Q dockedAttitude() { return fromAxes({0, 1, 0}, {0, 0, -1}, {-1, 0, 0}); }
const V3 DOCKED_AT{0, -(OC_HUB_PORT_M + OC_DOCK_PROBE_M), 0};

V3 pull(V3 r) { const double m = norm(r); return r * (-MU / (m * m * m)); }

// The craft's velocity past the ring in the frame that turns with the ring's orbit (OC_VREL_*): a craft
// keeping station in the same orbit has none, at any range. The plain difference of the two velocities
// would read 55 m/s for a craft keeping station 50 km behind.
V3 passing(const State& s) {
    const double t = timeOf(s);
    return s.v - ringVel(t) - cross(ring.normal * ring.rate, s.r - ringPos(t));
}

// What a docking pilot reads: the probe's head against the port.
struct Geo {
    V3 head;                        // ECI
    double range, gap, closing;     // head to the port's centre; in front of its face; toward it
    double offY, offZ, rateY, rateZ, offset;   // off the axis, in the port's turning frame
    double slide;                   // across the face, not turning with it
    double angle, pitch, yaw, roll, rollRate;
};

Geo geometry(const State& s, const Frame& f) {
    Geo g;
    const V3 a = f.y, right = f.z * -1.0, belly = f.x * -1.0;   // of a craft lined up on the port
    g.head = s.r + rot(s.q, PROBE);
    const V3 d = g.head - (f.c - a * OC_HUB_PORT_M);
    const V3 dv = s.v + rot(s.q, cross(s.w, PROBE)) - f.vc;     // the port is on the axis: it moves as the centre does
    g.range = norm(d);
    g.gap = -dot(d, a);
    g.closing = dot(dv, a);
    g.offY = dot(d, right);
    g.offZ = dot(d, belly);
    g.offset = std::hypot(g.offY, g.offZ);
    g.rateY = dot(dv, right) + RING_SPIN * g.offZ;   // the frame turns: right swings toward belly at the spin
    g.rateZ = dot(dv, belly) - RING_SPIN * g.offY;
    g.slide = norm(dv - a * g.closing);
    const V3 ab = irot(s.q, a);                      // the port's axis, seen from the craft
    g.angle = std::atan2(std::hypot(ab.y, ab.z), ab.x);
    g.pitch = std::atan2(-ab.z, ab.x);
    g.yaw = std::atan2(ab.y, ab.x);
    const V3 roof = rot(s.q, {0, 0, -1});
    g.roll = std::atan2(dot(roof, right), dot(roof, f.x));
    g.rollRate = dot(rot(s.q, s.w), a) - RING_SPIN;
    return g;
}

// ---- the ring's structure -----------------------------------------------------------------------

// How far outside a box a point is, in the plane: negative inside. dx and dy are the point's distances
// past the box's half-widths.
double outsideBox(double dx, double dy) {
    return std::hypot(std::fmax(dx, 0.0), std::fmax(dy, 0.0)) + std::fmin(std::fmax(dx, dy), 0.0);
}

// What a sphere of radius r at p, in the ring's frame, touches: OC_DOCK_HIT_*, or none. The ring is a
// figure of revolution but for its spokes and its flight deck: the band a closed box in (distance from the
// axis, distance along it), from the roof out to the hull between the rim walls; the rim walls' lips, thin,
// inside the roof; the hub a cylinder; each spoke a square beam in the middle plane. Over the deck's open
// sector the band is deck.cpp's to say (deckBand): no roof, the bulkheads at its ends, and the deck itself,
// which the gear lands on and the rest of the craft crashes on, deck.cpp's own contact.
int touch(V3 p, double r) {
    const double rho = std::hypot(p.x, p.z), ay = std::fabs(p.y);
    const double mid = (OC_RING_ROOF_M + OC_RING_HULL_M) / 2, half = (OC_RING_HULL_M - OC_RING_ROOF_M) / 2;
    const double bx = std::fabs(rho - mid) - half, by = ay - OC_RING_WIDTH_M / 2;
    const int deck = deckBand(p, r);
    if (deck > 0) return deck;
    if (deck < 0 && outsideBox(bx, by) < r) return by > bx ? OC_DOCK_HIT_RIM : (rho > mid ? OC_DOCK_HIT_HULL : OC_DOCK_HIT_ROOF);
    if (deck < 0 && rho < OC_RING_ROOF_M && std::hypot(std::fmax(OC_RING_RIM_M - rho, 0.0), by) < r) return OC_DOCK_HIT_RIM;
    if (outsideBox(rho - OC_HUB_RADIUS_M, ay - OC_HUB_PORT_M) < r) return OC_DOCK_HIT_HUB;
    const double sh = OC_RING_SPOKE_M / 2;
    if (ay < sh + r && rho < OC_RING_RIM_M + r) {
        const double step = 2 * PI / OC_RING_SPOKES;
        const double th = std::atan2(p.x, p.z);   // spoke k lies at k steps (orbit_core.h)
        const double off = th - std::round(th / step) * step;
        const double along = rho * std::cos(off), across = rho * std::sin(off);
        const double qx = std::fabs(along - (OC_HUB_RADIUS_M + OC_RING_RIM_M) / 2) - (OC_RING_RIM_M - OC_HUB_RADIUS_M) / 2;
        const double qy = ay - sh, qz = std::fabs(across) - sh;
        const double mx = std::fmax(qx, 0.0), my = std::fmax(qy, 0.0), mz = std::fmax(qz, 0.0);
        if (std::sqrt(mx * mx + my * my + mz * mz) + std::fmin(std::fmax(qx, std::fmax(qy, qz)), 0.0) < r) return OC_DOCK_HIT_SPOKE;
    }
    return OC_DOCK_HIT_NONE;
}

// Whether the head, at p in the ring's frame, is at the port's face rather than at any other part of the
// hub: in front of the face or through it, and nearer to it than to the hub's side.
bool atFace(V3 p) {
    const double rho = std::hypot(p.x, p.z), pen = p.y + OC_HUB_PORT_M;
    return p.y < 0 && rho < OC_HUB_RADIUS_M && pen <= OC_HUB_RADIUS_M - rho;
}

// ---- held: captured, docked, or wrecked on the ring ----------------------------------------------

void take(State& s, const Frame& f, int how) {
    DockState& k = s.dock;
    k.held = how;
    k.heldAt = s.n;
    k.p0 = toRing(f, s.r);
    k.q0 = qmul(qconj(frameQ(f)), s.q);
    k.contact = 0;
    s.thr = 0;
    s.rcs = {0, 0, 0};
    s.torque = {0, 0, 0};
}

// Put the craft where the ring holds it: at p with attitude q in the ring's frame, moving there at pd
// and turning at wr (body axes) besides the ring's own turn.
void place(State& s, const Frame& f, V3 p, V3 pd, Q q, V3 wr) {
    const V3 spin = f.y * RING_SPIN;
    s.r = f.c + dirFromRing(f, p);
    s.q = qunit(qmul(frameQ(f), q));
    s.v = f.vc + cross(spin, s.r - f.c) + dirFromRing(f, pd);
    s.w = irot(s.q, spin) + wr;
}

// A crash on the ring: the wreck stays where it touched, `back` seconds before the step's end.
void wreck(State& s, const Frame& f, int what, int part, double back) {
    DockState& k = s.dock;
    s.crashed = 1;
    take(s, f, HELD_WRECK);
    k.p0 = k.p0 - dirToRing(f, s.v - f.vc - cross(f.y * RING_SPIN, s.r - f.c)) * back;
    k.hit = what;
    k.hitPart = part;
    k.phase = OC_DOCK_PH_NONE;
    place(s, f, k.p0, {0, 0, 0}, k.q0, {0, 0, 0});
}

}   // namespace

// ---- the hooks ----------------------------------------------------------------------------------

void dockReset(State& s) {
    s.dock = DockState{};
    s.dock.autoBefore = OC_AUTO_CREW;   // oc_reset starts every flight with the crew
}

// The body rates that hold the craft lined up on the port: toward the port's attitude, and turning with it.
V3 dockHoldRates(const State& s) {
    const Frame f = frameAt(timeOf(s));
    return ratesToward(s, portAttitude(f), 1.0, 0.25) + irot(s.q, f.y * RING_SPIN);
}

// Where to fly so as to reach goal, a point on the port's side of the ring, without meeting the ring:
// goal itself where a straight line to it is clear, else the next corner of a way round. Seen along the
// axis the ring is a band from the rim walls' lips out to the hull, 1 km long; the way round goes out
// past the hull and down its outside. Inside the rim it leaves along the axis by the nearer end, and
// that crosses the spokes' plane with no eye for the spokes: the one case it does not make safe.
V3 dockSafeAim(const State& s, V3 goal) {
    if (!ring.valid) return goal;
    const V3 c = ringPos(timeOf(s)), a = ring.axis, d = s.r - c;
    const double y = dot(d, a);
    const V3 lat = d - a * y;
    const double rho = norm(lat);
    const V3 outward = rho > 1 ? lat * (1 / rho) : ring.normal;
    if (y <= -CLEAR_Y) return goal;                                         // the port's side: straight there
    if (rho >= CLEAR_R) return c + outward * WAY_R - a * WAY_Y;             // outside the hull: down it to the port's side
    if (y >= CLEAR_Y) return c + outward * WAY_R + a * WAY_Y;               // the far side: out past the hull
    if (rho > OC_RING_HULL_M) return c + outward * WAY_R + a * y;           // beside the hull: straight out
    if (rho >= INSIDE_R) return c + outward * (INSIDE_R - 300) + a * y;     // under the roof: inward first
    return c + lat + a * (y < 0 ? -WAY_Y : WAY_Y);                          // inside the rim: out along the axis
}

void dockEngage(State& s) {
    DockState& k = s.dock;
    int no = OC_DOCK_NO_NONE;
    if (k.held == HELD_PORT) no = OC_DOCK_NO_DOCKED;
    else if (s.crashed) no = OC_DOCK_NO_CRASHED;
    else if (!ring.valid || orbitOf(s).peri < 150000) no = OC_DOCK_NO_LOW;
    else if (norm(s.r - ringPos(timeOf(s))) > OC_DOCK_ENGAGE_M) no = OC_DOCK_NO_FAR;
    else if (norm(passing(s)) > OC_DOCK_ENGAGE_SPEED) no = OC_DOCK_NO_FAST;
    k.refused = no;
    if (no) { s.autoMode = k.autoBefore; return; }   // refused: whoever was flying still is
    // In front of the port and near the axis already, the crew lines up where the craft is; from anywhere
    // else it flies to the hold point first.
    const Frame f = frameAt(timeOf(s));
    const V3 vh = s.r + f.y * OC_DOCK_PROBE_M - (f.c - f.y * OC_HUB_PORT_M);
    const double gap = -dot(vh, f.y), off = norm(vh + f.y * gap);
    const bool corridor = gap > 0.5 && gap < OC_STANDOFF_M && off < 5 + 0.05 * gap;
    k.phase = corridor ? OC_DOCK_PH_ALIGN : OC_DOCK_PH_TRANSFER;
    k.gHold = std::fmax(gap, ALIGN_MIN_M);
}

// While held the step is the ring's: the craft's place, velocity, attitude and rates are worked out from
// the ring's at the step's end, never integrated, so nothing drifts.
bool dockRide(State& s) {
    DockState& k = s.dock;
    if (s.autoMode != OC_AUTO_DOCK) k.autoBefore = s.autoMode;
    if (!k.held || !ring.valid) return false;
    const Frame f = frameAt((s.n + 1) * OC_DT);
    s.thr = 0;
    s.rcs = {0, 0, 0};
    s.torque = {0, 0, 0};
    s.onGround = 0;
    const double drawn = (s.n + 1 - k.heldAt) * OC_DT / OC_DOCK_DRAW_S;
    if (k.held == HELD_PORT && drawn >= 1) {   // docked: the port's own place and attitude
        k.phase = OC_DOCK_PH_DOCKED;
        s.q = portAttitude(f);
        s.r = f.c - f.y * (OC_HUB_PORT_M + OC_DOCK_PROBE_M);
        s.v = f.vc;
        s.w = {RING_SPIN, 0, 0};
        return true;
    }
    V3 p = k.p0, pd{0, 0, 0}, wr{0, 0, 0};
    Q q = k.q0;
    if (k.held == HELD_PORT) {   // captured: the latches draw the craft in, easing at both ends
        const double e = drawn * drawn * (3 - 2 * drawn), ed = 6 * drawn * (1 - drawn) / OC_DOCK_DRAW_S;
        p = k.p0 + (DOCKED_AT - k.p0) * e;
        pd = (DOCKED_AT - k.p0) * ed;
        Q dq = qmul(qconj(k.q0), dockedAttitude());   // the turn still to make, about one axis of the body
        if (dq.w < 0) dq = {-dq.w, -dq.x, -dq.y, -dq.z};
        const double sn = std::sqrt(dq.x * dq.x + dq.y * dq.y + dq.z * dq.z), ang = 2 * std::atan2(sn, dq.w);
        const V3 ax = sn > 1e-12 ? V3{dq.x, dq.y, dq.z} * (1 / sn) : V3{1, 0, 0};
        const double h = ang * e / 2;
        q = qmul(k.q0, Q{std::cos(h), ax.x * std::sin(h), ax.y * std::sin(h), ax.z * std::sin(h)});
        wr = ax * (ang * ed);
    }
    place(s, f, p, pd, q, wr);
    return true;
}

// The crew's docking: to the hold point, on to the axis, into phase with the port, in, and capture.
void dockCrew(State& s, const Local& L, double* throttle) {
    DockState& k = s.dock;
    *throttle = 0;
    s.brake = 0;
    s.steer = 0;
    const double t = timeOf(s);
    const Frame f = frameAt(t);
    const Geo g = geometry(s, f);
    const V3 a = f.y, dv = s.v - f.vc;   // the craft past the ring's centre
    V3 want{0, 0, 0};                    // the velocity wanted, past the ring's centre
    V3 acc;
    bool far = false;
    if (k.phase == OC_DOCK_PH_TRANSFER) {   // the approach's law, by a way that is clear of the ring
        const V3 hold = holdPoint(t);
        const V3 dr = s.r - dockSafeAim(s, hold);
        const double d = norm(dr);
        const double speed = std::fmin(40.0, std::fmin(std::sqrt(2 * 0.25 * d), 0.1 * d));
        if (d > 1e-3) want = dr * (-speed / d);
        const double left = norm(s.r - hold);
        far = left > TURN_IN_M;
        if (left < ARRIVE_M) { k.phase = OC_DOCK_PH_ALIGN; k.gHold = OC_STANDOFF_M - OC_DOCK_PROBE_M; }
    }
    if (k.phase == OC_DOCK_PH_TRANSFER) {
        acc = (want - dv) * 0.5;
    } else {
        // On the axis. The law steers where the head will be once the craft is lined up, the centre of mass
        // and the probe's length along the axis, so that turning the craft does not move the target.
        const V3 vh = s.r + a * OC_DOCK_PROBE_M - (f.c - a * OC_HUB_PORT_M);
        const double gap = -dot(vh, a);
        const V3 lat = vh + a * gap;
        const double off = norm(lat);
        const double across = std::fmin(2.0, std::fmin(0.25 * off, std::sqrt(2 * 0.2 * off)));
        want = off > 1e-9 ? lat * (-across / off) : V3{0, 0, 0};
        const bool lined = g.angle < LINED * OC_DOCK_TOL_ANGLE_DEG * D2R && std::fabs(g.roll) < LINED * OC_DOCK_TOL_ROLL_DEG * D2R &&
                           std::fabs(g.rollRate) < LINED * OC_DOCK_TOL_ROLL_RATE_DPS * D2R;
        double closing;
        if (k.phase == OC_DOCK_PH_ALIGN) {
            closing = clampd(0.2 * (gap - k.gHold), -1.0, 1.0);
            if (lined && off < 0.5 && g.slide < 0.05) k.phase = OC_DOCK_PH_CLOSE;
        } else {
            closing = clampd(CLOSE_K * gap, CLOSE_CONTACT, CLOSE_MAX);
            const bool tight = lined && g.offset < LINED * OC_DOCK_TOL_OFFSET_M && g.slide < LINED * OC_DOCK_TOL_SLIDE;
            if (gap < GATE_M && !tight) closing = 0;   // inside the gate: wait there until lined up
        }
        want = want + a * closing;
        // The pull that differs between the craft and the ring is fed forward: at the port it is a
        // thousandth of a metre a second squared, which a minute's closing would turn into metres.
        acc = (want - dv) * 1.0 + pull(f.c) - pull(s.r);
    }
    const V3 body = irot(s.q, acc);
    s.rcs = {clampd(body.x, -RCS_ACC, RCS_ACC), clampd(body.y, -RCS_ACC, RCS_ACC), clampd(body.z, -RCS_ACC, RCS_ACC)};
    rateLoop(s, L, far ? point(s, L, f.c - s.r, 1.0, 0.15) : dockHoldRates(s));
}

// After each step, whoever flies: the craft against the ring's structure, and the probe's head against
// the port's face.
void dockAfterStep(State& s) {
    DockState& k = s.dock;
    if (!ring.valid || s.crashed || k.held) return;
    if (s.autoMode != OC_AUTO_DOCK) k.phase = OC_DOCK_PH_NONE;   // the crew let go
    const Frame f = frameAt(timeOf(s));
    const V3 spin = f.y * RING_SPIN;
    // The craft's motion through the ring's frame over the step, which turns with the ring.
    const V3 u = dirToRing(f, s.v - f.vc - cross(spin, s.r - f.c));
    const double travel = (norm(u) + norm(s.w) * REACH) * OC_DT;
    const double bound = std::hypot(OC_RING_HULL_M, OC_RING_WIDTH_M / 2) + REACH + travel;
    if (dot(s.r - f.c, s.r - f.c) > bound * bound) { k.contact = 0; k.released = 0; return; }

    // Each sphere along its path over the step, so that nothing thin is stepped over: the path is cut
    // into pieces no longer than half the smallest sphere's radius.
    V3 now[NBALLS], vel[NBALLS];
    for (int i = 0; i < NBALLS; ++i) {
        const V3 p = s.r + rot(s.q, BALLS[i].at);
        now[i] = toRing(f, p);
        vel[i] = dirToRing(f, s.v + rot(s.q, cross(s.w, BALLS[i].at)) - f.vc - cross(spin, p - f.c));
    }
    const int pieces = 1 + (int)std::fmin(4000.0, travel / 0.8);
    for (int j = 1; j <= pieces; ++j) {
        const double back = OC_DT * (pieces - j) / pieces;
        for (int i = 0; i < NBALLS; ++i) {
            const V3 p = now[i] - vel[i] * back;
            int what = touch(p, BALLS[i].r);
            if (i == 0 && what == OC_DOCK_HIT_HUB && atFace(p)) what = OC_DOCK_HIT_NONE;   // the head at the port: below
            if (what) { wreck(s, f, what, BALLS[i].part, back); return; }
        }
    }

    // The head at the port's face.
    const double pen = now[0].y + OC_HUB_PORT_M;   // how far through the face
    if (!atFace(now[0]) || pen <= 0 || (k.released && pen < 0.02)) {
        k.contact = 0;
        if (pen < -0.05) k.released = 0;
        return;
    }
    k.released = 0;
    const Geo g = geometry(s, f);
    if (!k.contact) {   // the first touch: the latches catch the head, or they do not
        k.contact = 1;
        k.cT = timeOf(s);
        k.cSpeed = g.closing;
        k.cOffset = g.offset;
        k.cSlide = g.slide;
        k.cAngle = g.angle;
        k.cRoll = g.roll;
        k.cRollRate = g.rollRate;
        k.verdict = g.closing > OC_DOCK_V_MAX ? OC_DOCK_V_FAST
                  : g.offset > OC_DOCK_TOL_OFFSET_M ? OC_DOCK_V_OFFSET
                  : g.slide > OC_DOCK_TOL_SLIDE ? OC_DOCK_V_SLIDING
                  : g.angle > OC_DOCK_TOL_ANGLE_DEG * D2R ? OC_DOCK_V_ANGLE
                  : std::fabs(g.roll) > OC_DOCK_TOL_ROLL_DEG * D2R ? OC_DOCK_V_ROLL
                  : std::fabs(g.rollRate) > OC_DOCK_TOL_ROLL_RATE_DPS * D2R ? OC_DOCK_V_ROLL_RATE
                  : g.closing < OC_DOCK_V_MIN ? OC_DOCK_V_SLOW
                  : OC_DOCK_V_CAPTURED;
        if (k.verdict == OC_DOCK_V_CAPTURED) {
            take(s, f, HELD_PORT);
            k.phase = OC_DOCK_PH_CAPTURED;
            s.autoMode = OC_AUTO_OFF;   // the docking is done; after an undock the pilot has it, held on the port
            s.sas = OC_SAS_PORT;
            s.holdValid = 0;
            return;
        }
    }
    if (pen > OC_DOCK_STROKE_M) { wreck(s, f, OC_DOCK_HIT_PORT, OC_DOCK_PART_PROBE, 0); return; }
    // A hard contact: the face pushes the head back along the axis, through the probe's spring and damper.
    const double force = std::fmax(0.0, CONTACT_K * pen + CONTACT_C * g.closing);
    const V3 push = f.y * -force;
    s.v = s.v + push * (OC_DT / (M_DRY + s.prop));
    const V3 tq = irot(s.q, cross(g.head - s.r, push));
    s.w = s.w + V3{tq.x / IXX, tq.y / IYY, tq.z / IZZ} * OC_DT;
}

// A crash elsewhere on the ring (deck.cpp's: the deck itself), recorded and left as docking's own are.
void dockWreck(State& s, int what, int part, double back) {
    if (!ring.valid || s.crashed) return;
    wreck(s, frameAt(timeOf(s)), what, part, back);
}

void dockWriteOut(const State& s) {
    std::memset(out, 0, sizeof out);
    if (!ring.valid) return;
    const DockState& k = s.dock;
    const Frame f = frameAt(timeOf(s));
    const Geo g = geometry(s, f);
    out[OC_DOCK_DOCKED] = k.held == HELD_PORT;
    out[OC_DOCK_PHASE] = k.phase;
    out[OC_DOCK_RANGE] = g.range;
    out[OC_DOCK_GAP] = g.gap;
    out[OC_DOCK_CLOSING] = g.closing;
    out[OC_DOCK_OFF_Y] = g.offY;
    out[OC_DOCK_OFF_Z] = g.offZ;
    out[OC_DOCK_RATE_Y] = g.rateY;
    out[OC_DOCK_RATE_Z] = g.rateZ;
    out[OC_DOCK_ANGLE_DEG] = g.angle * R2D;
    out[OC_DOCK_PITCH_DEG] = g.pitch * R2D;
    out[OC_DOCK_YAW_DEG] = g.yaw * R2D;
    out[OC_DOCK_ROLL_DEG] = g.roll * R2D;
    out[OC_DOCK_ROLL_RATE_DPS] = g.rollRate * R2D;
    out[OC_DOCK_CONTACT] = k.contact;
    out[OC_DOCK_VERDICT] = k.verdict;
    out[OC_DOCK_C_T] = k.cT;
    out[OC_DOCK_C_SPEED] = k.cSpeed;
    out[OC_DOCK_C_OFFSET] = k.cOffset;
    out[OC_DOCK_C_SLIDE] = k.cSlide;
    out[OC_DOCK_C_ANGLE_DEG] = k.cAngle * R2D;
    out[OC_DOCK_C_ROLL_DEG] = k.cRoll * R2D;
    out[OC_DOCK_C_ROLL_RATE_DPS] = k.cRollRate * R2D;
    out[OC_DOCK_HIT] = k.hit;
    out[OC_DOCK_HIT_PART] = k.hitPart;
    out[OC_DOCK_REFUSED] = k.refused;
    const V3 at = toRing(f, s.r);
    out[OC_DOCK_AXIAL] = at.y;
    out[OC_DOCK_RADIAL] = std::hypot(at.x, at.z);
}

void dockHash(const State& s, unsigned& h) {
    const DockState& k = s.dock;
    const double v[] = {(double)k.held, (double)k.phase, (double)k.contact, (double)k.released, (double)k.verdict,
                        (double)k.hit, (double)k.hitPart, (double)k.refused, (double)k.autoBefore, (double)k.heldAt,
                        k.p0.x, k.p0.y, k.p0.z, k.q0.w, k.q0.x, k.q0.y, k.q0.z, k.gHold,
                        k.cT, k.cSpeed, k.cOffset, k.cSlide, k.cAngle, k.cRoll, k.cRollRate};
    hashDoubles(h, v, sizeof v / sizeof v[0]);
}

}   // namespace oc

extern "C" {

const double* oc_dock_out(void) { return oc::out; }
int oc_dock_out_len(void) { return OC_DOCK_COUNT; }

void oc_undock(void) {
    using namespace oc;
    DockState& k = g.dock;
    if (k.held != HELD_PORT) return;
    k.held = 0;
    k.phase = OC_DOCK_PH_NONE;
    k.contact = 0;
    k.released = 1;
    g.v = g.v - ring.axis * OC_DOCK_SEPARATION;
    g.autoMode = OC_AUTO_OFF;   // the pilot has it, held on the port: the craft goes on turning with it
    g.sas = OC_SAS_PORT;
    g.holdValid = 0;
    g.atmoLaw = 0;
    writeOut();
}

}   // extern "C"
