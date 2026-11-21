// deck.cpp — the Ring's flight deck (orbit_deck.h): the band round its open sector, the gear on the deck,
// the craft as a jet whose swivelled drive is turned into the force a law asks for, the crew's deck landing and
// take-off by plans of the least propellant (deck_plan.h), the pilot's deck hold, and the touchdown with its
// verdict. Every number marked as chosen is a design choice for the sketch, not a measurement of any aircraft,
// ship or station. GPLv3.
//
// The frame. The Ring's own (dock.cpp's): x its ref, which turns with it, y its axis, z = x cross y; a point's
// angle about the axis in the spokes' convention is atan2(x, z), and spinward is the way it grows. Over the
// deck the craft's place is (s, h, c): s the floor's arc from the pad (R times the angle), h its height over
// the floor (R less its distance from the axis), c across, along the axis. Its velocity in the turning frame
// is u = v - w (axis x p), relative to the Ring's centre. The Ring's centre falls freely and its axis is fixed
// among the stars, so in a cylinder about that axis the motion is exactly the plane polar one: radially
// rho'' - rho psi'^2, along rho psi'' + 2 rho' psi', with psi' = s'/R + w the craft's own turn about the axis
// among the stars. The hover and the pilot's hold ask for (s'', h'', c'') and get the thrust from those, the
// turning frame's pulls (centrifugal, Coriolis) worked out, not left to feedback; only the tides, the craft and
// the Ring's centre falling a little differently, are fed forward as they are, a few thousandths of a metre a
// second squared at 5 km. The crew's plans are the same motion in Cartesian form (deck_plan.h).

#include "internal.h"

#include "deck_plan.h"

#include <cmath>
#include <cstring>

namespace oc {

namespace {

double out[OC_DECK_COUNT];

// ---- the deck's shape (orbit_core.h) ----------------------------------------------------------------

const double R = OC_RING_FLOOR_M;
const double W2 = OC_RING_WIDTH_M / 2;
const double A0 = OC_DECK_ANGLE_DEG * D2R;               // the sector's centre, in the spokes' convention
const double BETA = OC_DECK_ARC_M / 2 / OC_RING_FLOOR_M;  // its half angle: 0.15 rad, 8.6 degrees
const double W = RING_SPIN;

double padAngle(int k) { return A0 + (k - (OC_DECK_PADS - 1) / 2.0) * OC_DECK_PAD_SPACING_M / R; }

// ---- chosen -----------------------------------------------------------------------------------------

const double H_HOVER = OC_DECK_HOVER_M;
const double H_CONTACT = 3.0;    // m: the centre of mass over the floor with the legs just touching (orbit_core.cpp's GEAR)
// the hover: the height in a place loop at 0.3 /s inside a velocity loop at 1.0 /s, which the throttle alone
// serves; along and across slower, at 0.15 /s and 0.6 /s, critically damped, since a push sideways waits on a
// bank that takes the craft about a second, and at most 3 m/s2 (17 degrees of bank)
const double K_HP = 0.3, K_HV = 1.0, V_HOVER_MAX = 6;
const double K_HP_H = 0.15, K_HV_H = 0.6, A_HOVER_H = 3.0;
const double V_TOUCH = 0.25, K_DESCENT = 0.15, V_DESCENT_MAX = 2.0;   // the pilot's ease near the deck: 2 m/s easing to 0.25 at the touch
// the pilot's deck hold
const double V_TRC = 10.0, V_NUDGE = 1.0;    // m/s at the stick's stop, and at a small thruster's key
const double A_STICK = 1.5, A_HOLD = 2.0;    // m/s2: the speed a stick held at its stop winds up, and how fast it runs down let go
const double V_CLIMB = 8.0;                  // m/s: the throttle's climb and sink at its stops; centred, the height held
const double YAW_RATE = 12 * D2R;            // rad/s at full pedal
const double F_DRIVE = 0.6;                  // m/s2: under this the small thrusters do it, and the attitude stays level
// the tyres at rest: a spring and a damper to their spot, as stiff as the legs' own (GEAR_K, GEAR_C), as far as
// the runway's side grip, eight tenths of the load
const double K_TYRE = 2.0e6, C_TYRE = 3.0e5, MU_TYRE = 0.8;
// the crew's plans (deck_plan.h)
const double PLAN_THRUST = 0.85;     // the share of the drive a plan may ask for: the rest is the tracking's room
const double PLAN_JERK = 5;          // m/s3: how fast a plan's force may change, in size or way: 15 degrees a second at 19 m/s2, the swivel's rate
const double PLAN_MIN = 0.25;        // the drive's least share, lit in the last T_LIT s of a landing (the first of a climb out)
const double T_LIT = 20;
const double PLAN_SMOOTH = 0.05;     // s: the price of a change of the plan's force, which keeps it from chattering
const double PLAN_GRID = 0.75;       // the plan's intervals at its ends a quarter of the mean, where the burns are
const double ARRIVE_SHARE = 0.4, T_ARRIVE = 30;   // a climb out's last 30 s ask for at most four tenths of the drive
const double PLAN_PRICE = 0.5;       // m/s of delta-v a second of flight is worth, choosing a plan's length (0.87 kg/s at 34 t)
const double TF_LO = 40, TF_HI = 220;   // s: the lengths a landing's plan is chosen among, by golden section
const double TF_LO_UP = 30, TF_HI_UP = 200;   // and a climb out's
const double T_ORIENT = 6;           // s a plan from rest leaves the craft to turn for its first burn
const double GATE_H = OC_DECK_GATE_M, GATE_SINK = 1.5;   // a landing plan's end: the centre of mass over the pad, sinking
const double H_LIFT = 30;            // m: the take-off's straight lift, before its plan
const double REPLAN_COAST = 8, REPLAN_NEAR = 3, REPLAN_LAST = 4;   // s between plans coasting, and with a burn 12 s ahead; none in the last 4 s
const double OFF_PLAN_R = 10, OFF_PLAN_V = 2.0;   // m and m/s off the plan in a burn that make it again, at most once a second
const double TAU_LEAD = 0.4;         // s: the throttle's lag (orbit_core.cpp), by which the plan's force is fed forward
const double GATE_BOX = 4.0, GATE_DRIFT = 1.5;   // m off the gate and m/s across the deck within which the descent follows the plan
const double DESCENT_BOX = 1.0;      // m from the pad's centre within which the descent goes on from the gate
const double V_SETTLE = 0.5;         // m/s across the deck, at most, while the descent holds its height to settle over the pad
const double SIGMA_BURN = 1.0;       // m/s2: a plan's interval at more than this is a burn
const double K_TRACK_P = 0.5, K_TRACK_D = 1.3;    // the tracking: a second-order loop at 0.71 rad/s, nine tenths of critical
const double CONE_CLEAR = 40;        // m the cone's edge passes over a bulkhead's top and a rim wall's
const double HALF_SPAN = 9;          // m: the craft's wingtip from its centre line
const double T_SIDE = 15;            // s: a landing leaves its side of the Ring's plane in its last T_SIDE, a climb out after its first
const double T_POINT = 20;           // s near the deck in which a plan's thrust does not point at the deck
const double LEVEL_END = 10 * D2R;   // the thrust's lean in the last (or first) T_LEVEL s of a plan, where it meets (or leaves) the deck
const double T_LEVEL = 3;
const double A_DESCENT = 0.45;       // m/s2: the descent from the gate eases its sink steadily to V_TD, H_AIM over the floor
const double H_AIM = 3.75;           // m: the centre of mass where the descent has eased to V_TD, 0.75 m over the legs' touch: the
                                     // navigation's error in height (README: 0.3 m in the Monte Carlo) is taken at V_TD
const double V_TD = 0.3;             // m/s
const double NAV_TAU = 2.0;          // s: the navigation's errors' correlation

// The craft's hard points (body: x forward, y right wing, z down), after its drawing (web/src/craft.js): the
// probe, the nose and the canopy, the belly, the back, the drive's bells, the wingtips and the wings' leading
// edges, the fins' tips. Any of them on the deck is a crash; only the gear, 3 m below the centre of mass, lands.
struct Point { V3 at; int part; };
const Point HARD[] = {
    {{OC_DOCK_PROBE_M, 0, 0}, OC_DOCK_PART_PROBE},
    {{15.5, 0, 0.5}, OC_DOCK_PART_NOSE},
    {{10.6, 0, -1.7}, OC_DOCK_PART_NOSE},
    {{9.0, 0, 1.25}, OC_DOCK_PART_BODY},
    {{0.0, 0, 1.25}, OC_DOCK_PART_BODY},
    {{-12.0, 0, 1.25}, OC_DOCK_PART_BODY},
    {{-2.0, 0, -2.1}, OC_DOCK_PART_BODY},
    {{-17.8, -1.3, 1.05}, OC_DOCK_PART_TAIL},
    {{-17.8, 1.3, 1.05}, OC_DOCK_PART_TAIL},
    {{-14.0, -9.0, 0.6}, OC_DOCK_PART_LEFT_WING},
    {{-14.0, 9.0, 0.6}, OC_DOCK_PART_RIGHT_WING},
    {{-2.3, -4.5, 0.6}, OC_DOCK_PART_LEFT_WING},
    {{-2.3, 4.5, 0.6}, OC_DOCK_PART_RIGHT_WING},
    {{-14.6, -3.9, -5.1}, OC_DOCK_PART_TAIL},
    {{-14.6, 3.9, -5.1}, OC_DOCK_PART_TAIL},
};
const int NHARD = sizeof HARD / sizeof HARD[0];

// ---- the Ring's frame, and the craft over the deck -------------------------------------------------

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

V3 toRing(const Frame& f, V3 v) { return {dot(v, f.x), dot(v, f.y), dot(v, f.z)}; }
V3 fromRing(const Frame& f, V3 v) { return f.x * v.x + f.y * v.y + f.z * v.z; }
V3 pull(V3 r) { const double m = norm(r); return r * (-MU / (m * m * m)); }

struct Over {
    V3 p, u;            // place and velocity in the turning frame, the Ring's axes
    double rho, th;     // from the axis; the angle about it, the spokes' convention
    V3 out, spin;       // outward and spinward at the craft, the Ring's axes
    double h, c;        // over the floor, across
    double us;          // the velocity against the deck along: spinward
    double sd, hd, cd;  // the rates of the floor's arc, the height and across
    double psid;        // the craft's turn about the axis among the stars
};

Over overOf(V3 r, V3 v, const Frame& f) {
    Over o;
    o.p = toRing(f, r - f.c);
    o.u = toRing(f, v - f.vc) - V3{o.p.z, 0, -o.p.x} * W;   // less the frame's turn, w (axis x p)
    o.rho = std::hypot(o.p.x, o.p.z);
    o.th = std::atan2(o.p.x, o.p.z);
    if (o.rho > 1e-6) {
        o.out = {o.p.x / o.rho, 0, o.p.z / o.rho};
        o.spin = {o.p.z / o.rho, 0, -o.p.x / o.rho};
    } else {   // on the axis: every way is out
        o.out = {0, 0, 1};
        o.spin = {1, 0, 0};
    }
    o.h = R - o.rho;
    o.c = o.p.y;
    o.us = dot(o.u, o.spin);
    const double rr = std::fmax(o.rho, 1.0);
    o.sd = R / rr * o.us;
    o.hd = -dot(o.u, o.out);
    o.cd = o.u.y;
    o.psid = o.us / rr + W;
    return o;
}

// The craft as the deck's laws see it: the navigation's place and velocity, the truth unless a test has made the
// navigation wrong (oc_deck_disturb), its errors in the Ring's frame.
Over navOf(const State& s, const Frame& f) {
    const DeckState& k = s.deck;
    if (k.dPos == 0 && k.dVel == 0) return overOf(s.r, s.v, f);
    return overOf(s.r + fromRing(f, V3{k.noise[0], k.noise[1], k.noise[2]}), s.v + fromRing(f, V3{k.noise[3], k.noise[4], k.noise[5]}), f);
}

double arcTo(const Over& o, double angle) { return R * wrap(o.th - angle); }   // the floor's arc from angle to the craft, + spinward

// The thrust's specific force (ECI) that gives the deck's coordinates the accelerations sdd, hdd and cdd.
V3 forceFor(const Over& o, const Frame& f, double sdd, double hdd, double cdd, V3 tide) {
    const double psid = o.sd / R + W;
    const double fr = -hdd - o.rho * psid * psid;        // outward
    const double ft = o.rho * sdd / R - 2 * o.hd * psid;   // spinward
    return fromRing(f, o.out * fr + o.spin * ft + V3{0, cdd, 0}) - tide;
}

// ---- the craft as a jet -------------------------------------------------------------------------------

// The commands that give the specific force fs (ECI): the attitude, the swivel's angle, the throttle, and the
// small thrusters for what the drive cannot give. The attitude is the level one (nose along `nose`, the belly
// away from `up`) turned as little as will put the force in the plane the swivel sweeps: banked or yawed to
// bring it square to the wings, then the swivel set to its angle from the nose, and the nose pitched for what
// the swivel cannot reach (up past straight down, down before aft). No further than `tilt` from level. Under
// F_DRIVE the small thrusters do it and the craft stays level. spin: how fast the level attitude turns among
// the stars (ECI), fed forward to the rates. The mass is the guidance's, which a test may make wrong, and the
// drive's thrust for a throttle the nominal one scaled by what the crew has learnt of it in flight (estimate).
void vectored(State& s, const Local& L, V3 fs, V3 nose, V3 up, V3 spin, double tilt, double* throttle) {
    const double mass = (M_DRY + s.prop) * (1 + s.deck.dMass) / (1 + s.deck.kT);   // the drive's thrust as learnt (estimate)
    V3 x0 = nose - up * dot(nose, up);
    if (norm(x0) < 1e-9) x0 = rot(s.q, {1, 0, 0}) - up * dot(rot(s.q, {1, 0, 0}), up);
    x0 = unit(x0);
    const V3 z0 = up * -1.0, y0 = cross(z0, x0);
    V3 xb = x0, yb = y0, zb = z0;
    double delta = s.nozzle;
    const double fm = norm(fs);
    if (fm > 1e-9) {
        const V3 t = fs * (1 / fm);
        if (fm >= F_DRIVE) {
            V3 y = y0 - t * dot(t, y0);
            yb = norm(y) > 1e-6 ? unit(y) : unit(cross(x0, t));
            xb = unit(x0 - yb * dot(x0, yb));
            zb = cross(xb, yb);
            const double g = std::atan2(-dot(t, zb), dot(t, xb));
            delta = clampd(g, 0, NOZZLE_MAX);
            const double pitch = g - delta;
            xb = rotateAbout(xb, yb, pitch);
            zb = rotateAbout(zb, yb, pitch);
            const double off = std::acos(clampd(dot(zb, z0), -1, 1));
            if (off > tilt) {   // too far from level: back toward it, the force then only partly the drive's
                const V3 ax = cross(zb, z0);
                const double n = norm(ax);
                if (n > 1e-9) {
                    xb = rotateAbout(xb, ax * (1 / n), off - tilt);
                    yb = rotateAbout(yb, ax * (1 / n), off - tilt);
                    zb = rotateAbout(zb, ax * (1 / n), off - tilt);
                }
            }
        } else if (fm >= F_DRIVE * 0.5) {   // level, the swivel where the force's own angle puts it, the rest the small thrusters'
            delta = clampd(std::atan2(-dot(t, z0), dot(t, x0)), 0, NOZZLE_MAX);
        }   // under that, the swivel stays where it is: the small thrusters alone
    }
    s.nozzleCmd = delta;
    const Q target = fromAxes(xb, yb, zb);
    // the drive along its axis as it will be over the step: the swivel moved at its rate, the attitude as it is
    const double nozzleNext = s.nozzle + clampd(delta - s.nozzle, -NOZZLE_RATE * OC_DT, NOZZLE_RATE * OC_DT);
    const V3 axis = rot(s.q, thrustAxis(nozzleNext));
    const double along = dot(fs, axis);
    double cmd = 0;
    if (along > 0 && s.prop > 0 && fm >= F_DRIVE * 0.5) cmd = clampd(along * mass / T_MAX, 0, 1);
    *throttle = cmd;
    const double thrNext = (cmd == 0 && s.thr + (cmd - s.thr) * (OC_DT / 0.4) < 1e-3) ? 0 : s.thr + (cmd - s.thr) * (OC_DT / 0.4);
    const V3 rest = irot(s.q, fs - axis * (s.prop > 0 ? thrNext * T_MAX / mass : 0));
    s.rcs = {clampd(rest.x, -RCS_ACC, RCS_ACC), clampd(rest.y, -RCS_ACC, RCS_ACC), clampd(rest.z, -RCS_ACC, RCS_ACC)};
    rateLoop(s, L, ratesToward(s, target, 2.5, 0.4) + irot(s.q, spin));
}

// Nothing asked of the drive or the small thrusters, and no torque: on the deck, the gear holds the craft.
void idle(State& s, double* throttle) {
    *throttle = 0;
    s.rcs = {0, 0, 0};
    s.torque = {0, 0, 0};
    s.nozzleCmd = s.nozzle;
}

V3 noseOver(const Over& o, const Frame& f, double heading) {   // the nose's way over the deck, ECI
    return fromRing(f, o.spin * std::cos(heading) + V3{0, std::sin(heading), 0});
}

// ---- the pads, and the approach's cone ---------------------------------------------------------------

int nearestPad(const Over& o) {
    int best = (OC_DECK_PADS - 1) / 2;
    double bestD = 1e30;
    for (int i = 0; i < OC_DECK_PADS; ++i) {   // from the middle out, so that a tie goes to the middle
        const int k = (OC_DECK_PADS - 1) / 2 + (i % 2 ? (i + 1) / 2 : -(i / 2));
        const double a = padAngle(k), r = R - H_HOVER;
        const double d = norm(o.p - V3{std::sin(a) * r, 0, std::cos(a) * r});
        if (d < bestD - 1) { bestD = d; best = k; }
    }
    return best;
}

// Pad k in the Ring's frame: its centre on the floor, its up (toward the axis) and spinward; and the approach's
// cone over it. The cone's edge passes CONE_CLEAR over the top of each bulkhead (the roof's edge at the sector's
// ends: tanS spinward, tanA antispinward) and over the rim walls' tops beside the deck, the craft's half-span in
// from them (tanC).
struct Pad { V3 at, up, spin; double tanS, tanA, tanC; };

Pad padOf(int k) {
    Pad p;
    const double a = padAngle(k);
    const V3 out{std::sin(a), 0, std::cos(a)};
    p.at = out * R;
    p.up = out * -1.0;
    p.spin = {std::cos(a), 0, -std::sin(a)};
    const double rc = OC_RING_ROOF_M - CONE_CLEAR;
    auto slope = [&](double edge) {
        const V3 d = V3{std::sin(edge), 0, std::cos(edge)} * rc - p.at;
        return dot(d, p.up) / std::fabs(dot(d, p.spin));
    };
    p.tanS = slope(A0 + BETA);
    p.tanA = slope(A0 - BETA);
    p.tanC = (R - OC_RING_RIM_M + CONE_CLEAR) / (W2 - HALF_SPAN);
    return p;
}

// ---- the crew's plans ----------------------------------------------------------------------------------

V3 v3(const double* a) { return {a[0], a[1], a[2]}; }

// The specific force that keeps a craft at r moving at v in the Ring's turning frame (deck_plan.h): against the
// centrifugal pull and the Coriolis, w^2 (x, 0, z) and -2 W x v; the tide, a few thousandths of that, left out.
V3 steadyForce(V3 r, V3 v) { return {-W * W * r.x + 2 * W * v.z, 0, -W * W * r.z - 2 * W * v.x}; }

// The specific force of the drive at its nominal thrust for the throttle it is at, and the mass as the guidance takes
// it, in the Ring's frame; and with what the crew has learnt of the thrust, and the small thrusters'.
V3 driveNominal(const State& s, const Frame& f) {
    const double mass = (M_DRY + s.prop) * (1 + s.deck.dMass);
    return toRing(f, rot(s.q, thrustAxis(s.nozzle)) * (s.prop > 0 ? s.thr * T_MAX / mass : 0));
}
V3 forceNow(const State& s, const Frame& f) { return driveNominal(s, f) * (1 + s.deck.kT) + toRing(f, rot(s.q, s.rcs)); }

// Where a plan starts: when; the craft's place and velocity in the Ring's frame, as the navigation has them; its
// mass, as the guidance takes it; and the force the drive and the small thrusters give.
struct Start { double t; V3 r, v; double m; V3 u; };

Start startNow(const State& s, double t) {
    const Frame f = frameAt(t);
    const Over o = navOf(s, f);
    return {t, o.p, o.u, (M_DRY + s.prop) * (1 + s.deck.dMass), forceNow(s, f)};
}

// The plan from st, of length tf, for what the crew is doing: a landing on its pad (planKind 0), or a climb out
// from it to the approach's hold point (1). zRef: the plan's mass to linearize the drive's bound about, or none;
// share: the part of the drive the plan may ask for.
bool planFrom(const State& s, const Start& st, double tf, const double* zRef, double share, PlanResult& res) {
    const DeckState& k = s.deck;
    const Pad pad = padOf(k.pad);
    PlanSpec sp;
    sp.t0 = st.t;
    sp.r0 = st.r;
    sp.v0 = st.v;
    sp.m0 = st.m;
    sp.tf = tf;
    sp.n = PLAN_MAX;
    sp.thrustMax = share * T_MAX;
    sp.thrustMin = PLAN_MIN * T_MAX;
    sp.padAt = pad.at;
    sp.padUp = pad.up;
    sp.padSpin = pad.spin;
    sp.tanS = pad.tanS;
    sp.tanA = pad.tanA;
    sp.tanC = pad.tanC;
    sp.side = k.side;
    sp.ySide = OC_DECK_SIDE_M;
    sp.cosPoint = 0;   // not at the deck
    sp.zRef = zRef;
    sp.jerk = PLAN_JERK;
    sp.startSet = sp.endSet = true;
    sp.uStart = st.u;
    sp.smooth = PLAN_SMOOTH;
    sp.elastic = true;
    sp.grid = PLAN_GRID;
    if (k.planKind == 0) {
        sp.rN = pad.at + pad.up * GATE_H;
        sp.vN = pad.up * -GATE_SINK;
        sp.tOrient = k.burnt ? 0 : T_ORIENT;
        sp.sideFrom = 0;
        sp.sideTo = tf - T_SIDE;
        sp.pointFrom = tf - T_POINT;
        sp.pointTo = tf;
        sp.cosLast = std::cos(LEVEL_END);
        sp.tLast = T_LEVEL;
        sp.minFrom = tf - T_LIT;
        sp.minTo = tf;
    } else {
        sp.rN = V3{0, -(OC_HUB_PORT_M + OC_STANDOFF_M), 0};   // the hold point, at rest
        sp.vN = V3{0, 0, 0};
        sp.tOrient = 0;
        sp.sideFrom = k.burnt ? 0 : T_SIDE;
        sp.sideTo = tf;
        sp.pointFrom = 0;
        sp.pointTo = k.burnt ? 0 : T_POINT;
        sp.cosFirst = k.burnt ? -2 : std::cos(LEVEL_END);
        sp.tFirst = k.burnt ? 0 : T_LEVEL;
        sp.minFrom = 0;
        sp.minTo = k.burnt ? -1 : T_LIT;
        sp.thrustEnd = ARRIVE_SHARE * T_MAX;   // near the axis nothing weighs: the stop at the hold point is gentle
        sp.tEnd = T_ARRIVE;
    }
    sp.uEnd = steadyForce(sp.rN, sp.vN);
    return planLanding(sp, res);
}

// The crew's first plan, its length chosen by golden section over [lo, hi] for the least delta-v and PLAN_PRICE a
// second: SEARCH plans, one a step so that no step does more than one, all from where the craft was when the search
// began (beginSearch), the best kept in the state as it is found. The craft holds meanwhile, a few tenths of a
// second, inside the plan's first seconds, in which it turns or hovers anyway.
const int SEARCH = 13;   // the length to within 0.6 % of the bracket
const double PHI = 0.6180339887498949;

void beginSearch(State& s, double t, double lo, double hi) {
    DeckState& k = s.deck;
    const Start st = startNow(s, t);
    k.search = SEARCH;
    k.gsA = lo;
    k.gsB = hi;
    k.gsC = hi - PHI * (hi - lo);
    k.gsD = lo + PHI * (hi - lo);
    k.gsJc = k.gsJd = 0;
    k.gsBest = 1e300;
    k.st0 = st.t;
    k.sr0 = st.r;
    k.sv0 = st.v;
    k.sm0 = st.m;
    k.su0 = st.u;
    k.plan = Flown{};
}

// One plan of the search: 0 while it goes on; at its last, 1 with the best plan in the state, or -1 if none was
// found.
int searchStep(State& s, double t) {
    DeckState& k = s.deck;
    const int done = SEARCH - k.search;
    double tf;
    bool atC;
    if (done == 0) { tf = k.gsC; atC = true; }
    else if (done == 1) { tf = k.gsD; atC = false; }
    else if (k.gsJc < k.gsJd) { k.gsB = k.gsD; k.gsD = k.gsC; k.gsJd = k.gsJc; k.gsC = k.gsB - PHI * (k.gsB - k.gsA); tf = k.gsC; atC = true; }
    else { k.gsA = k.gsC; k.gsC = k.gsD; k.gsJc = k.gsJd; k.gsD = k.gsA + PHI * (k.gsB - k.gsA); tf = k.gsD; atC = false; }   // ties go long
    const Start st{k.st0, k.sr0, k.sv0, k.sm0, k.su0};
    PlanResult res;
    ++k.planSolves;
    double j = 1e300;
    if (planFrom(s, st, tf, nullptr, PLAN_THRUST, res)) {
        j = res.cost + PLAN_PRICE * tf;
        if (j < k.gsBest && storePlan(res, k.plan)) k.gsBest = j;
    }
    k.planStatus = res.status;
    k.planIters = res.iters;
    (atC ? k.gsJc : k.gsJd) = j;
    if (--k.search > 0) return 0;
    if (k.gsBest >= 1e300) { k.plan = Flown{}; return -1; }
    k.planEnd = k.plan.t0 + k.plan.tf;
    k.planNext = t + REPLAN_COAST;
    return 1;
}

// The plan made again from where the craft is, to the same end at the same time, its mass linearized about the
// plan's own, moved to the mass the craft has. Off its plan in a burn (urgent), the craft may need more than the
// plan's share of the drive to get back to it: then the whole drive, and failing that a later end, a fifth of what
// is left and two seconds more, each tried a step after the one before failed. Kept if found; else the plan flown
// goes on, and once every try has failed the failure is counted.
void replan(State& s, double t, bool urgent) {
    DeckState& k = s.deck;
    const double tf = k.planEnd - t;
    if (tf < REPLAN_LAST) { k.tryNext = 0; return; }
    const Start st = startNow(s, t);
    const Flown& p = k.plan;
    auto zAt = [&](double tt) {   // ln m on the plan, between its nodes as a line
        const int i = flownStep(p, tt);
        const double x = clampd((tt - p.t[i]) / (p.t[i + 1] - p.t[i]), 0, 1);
        return p.z[i] + (p.z[i + 1] - p.z[i]) * x;
    };
    const double shift = std::log(st.m) - zAt(t);
    const struct { double share, longer; } tries[] = {{PLAN_THRUST, 0}, {1.0, 0}, {1.0, 0.2 * tf + 2}};
    const int i = urgent ? k.tryNext : 0;
    const double len = tf + tries[i].longer;
    double zRef[PLAN_MAX + 1];
    for (int j = 0; j <= PLAN_MAX; ++j) {
        const double x = (double)j / PLAN_MAX;
        zRef[j] = zAt(t + len * (x - PLAN_GRID * std::sin(2 * PI * x) / (2 * PI))) + shift;
    }
    PlanResult res;
    ++k.planSolves;
    const bool ok = planFrom(s, st, len, zRef, tries[i].share, res) && storePlan(res, k.plan);
    k.planStatus = res.status;
    k.planIters = res.iters;
    if (ok) { k.planEnd = t + len; k.tryNext = 0; return; }
    if (urgent && i < 2) { k.tryNext = i + 1; return; }
    k.tryNext = 0;
    ++k.planFails;
}

// Whether the plan burns at time t; and whether that burn is its last: no coast after it with a burn after that.
bool burning(const Flown& p, double t) { return p.n > 0 && p.sigma[flownStep(p, t)] > SIGMA_BURN; }
bool lastBurn(const Flown& p, double t) {
    if (!burning(p, t)) return false;
    bool coast = false;
    for (int i = flownStep(p, t); i < p.n; ++i) {
        if (p.sigma[i] <= SIGMA_BURN) coast = true;
        else if (coast) return false;
    }
    return true;
}

// The crew's nose over the deck: a landing comes in nose spinward, tail first against the deck, which overtakes it,
// the nose the way the craft is pushed to take up the deck's speed; a take-off leaves nose antispinward, the way
// it is pushed to shed it.
double crewHeading(const DeckState& k) { return k.planKind == 1 ? PI : 0; }

// The first burn ahead of t within `within` seconds: its held force, in the Ring's frame; false if none.
bool burnAhead(const Flown& p, double t, double within, V3* u) {
    for (int i = p.n > 0 ? flownStep(p, t) : 0; i < p.n; ++i) {
        const double ti = p.t[i];
        if (ti > t + within) return false;
        if (p.sigma[i] > SIGMA_BURN) { *u = v3(p.u[i]); return true; }
    }
    return false;
}

// Flying the plan: the force it asks for, fed forward by the throttle's lag, and a second-order loop on the
// craft's place and velocity against the plan's, all in the Ring's frame; the drive and the small thrusters give it
// (vectored). Before a burn the craft is turned and its swivel set for it, nothing asked of the drive yet. tilt: how
// far from level it may go.
void track(State& s, const Local& L, const Frame& f, const Over& o, double t, double tilt, double* throttle) {
    DeckState& k = s.deck;
    V3 rr, vr, ur, rl, vl, ul;
    flownAt(k.plan, t, &rr, &vr, &ur);
    if (t + TAU_LEAD < k.plan.t0 + k.plan.tf) flownAt(k.plan, t + TAU_LEAD, &rl, &vl, &ul);
    else ul = steadyForce(v3(k.plan.r[k.plan.n]), v3(k.plan.v[k.plan.n]));   // past its end: what keeps the craft as it leaves it
    const V3 a = ul + (rr - o.p) * K_TRACK_P + (vr - o.u) * K_TRACK_D;
    const V3 nose = noseOver(o, f, crewHeading(k)), up = fromRing(f, o.out * -1.0), spin = f.y * o.psid;
    V3 ahead;
    if (!burning(k.plan, t + TAU_LEAD) && burnAhead(k.plan, t, T_ORIENT + 2, &ahead) && norm(a) < F_DRIVE) {
        // ready for the burn ahead: the attitude and the swivel its force would have, the drive still
        vectored(s, L, fromRing(f, unit(ahead) * (2 * F_DRIVE)), nose, up, spin, PI, throttle);
        *throttle = 0;
        const V3 body = irot(s.q, fromRing(f, a));
        s.rcs = {clampd(body.x, -RCS_ACC, RCS_ACC), clampd(body.y, -RCS_ACC, RCS_ACC), clampd(body.z, -RCS_ACC, RCS_ACC)};
        return;
    }
    vectored(s, L, fromRing(f, a), nose, up, spin, tilt, throttle);
}

// How far the craft is off its plan now, in place and velocity.
void offPlan(const DeckState& k, const Over& o, double t, double* dr, double* dv) {
    V3 rr, vr, ur;
    flownAt(k.plan, t, &rr, &vr, &ur);
    *dr = norm(o.p - rr);
    *dv = norm(o.u - vr);
}

// ---- the hover and the descent ---------------------------------------------------------------------------

// Over the pad: to its centre at the height asked, or down at the rate asked when sink >= 0; across the deck no
// faster than vMax.
void hover(State& s, const Local& L, const Frame& f, const Over& o, V3 tide, double height, double sink, double vMax, double kp, double* throttle) {
    DeckState& k = s.deck;
    const double sp = arcTo(o, padAngle(k.pad));
    const double ws = -clampd(kp * sp, -vMax, vMax), wc = -clampd(kp * o.c, -vMax, vMax);
    const double wh = sink >= 0 ? -sink : -clampd(K_HP * (o.h - height), -V_HOVER_MAX, V_HOVER_MAX);
    const double sdd = clampd(K_HV_H * (ws * R / std::fmax(o.rho, 1.0) - o.sd), -A_HOVER_H, A_HOVER_H);
    // The descent's own easing, fed forward: down the profile sink(h) = sqrt(V_TD^2 + 2 A (h - H_AIM)) the sink
    // falls as d(sink)/dt = A hd / sink, so the craft's rate is the profile's, A at it, nothing when it is still.
    // (Fed forward as A alone it held the craft still where the profile's sink is A / K_HV: 3.88 m up, hovering
    // until the propellant was gone.)
    const double ease = sink > V_TD && o.h > H_AIM ? A_DESCENT * clampd(-o.hd / sink, 0, 1.5) : 0;
    const double hdd = clampd(K_HV * (wh - o.hd) + ease, -4, 4), cdd = clampd(K_HV_H * (wc - o.cd), -A_HOVER_H, A_HOVER_H);
    vectored(s, L, forceFor(o, f, sdd, hdd, cdd, tide), noseOver(o, f, crewHeading(k)), fromRing(f, o.out * -1.0), f.y * o.psid, 25 * D2R, throttle);
}

double descentRate(double h) { return clampd(K_DESCENT * (h - H_CONTACT) + V_TOUCH, V_TOUCH, V_DESCENT_MAX); }   // the pilot's ease

// The crew's descent from the gate: the sink eased steadily, at A_DESCENT, to V_TD as the legs meet the deck; and
// across the deck no faster than will touch down still, 0.1 m/s at the touch and 0.05 m/s more a metre up.
double crewDescent(double h) { return std::fmin(V_DESCENT_MAX, std::sqrt(V_TD * V_TD + 2 * A_DESCENT * std::fmax(h - H_AIM, 0.0))); }
double descentDrift(double h) { return clampd(0.1 + 0.05 * (h - H_CONTACT), 0.1, V_HOVER_MAX); }

}   // namespace

// ---- the band round the open sector (dock.cpp's touch asks) ------------------------------------------

// For a sphere of radius r at p in the Ring's frame: past an end of the sector, inside the band, it has gone
// through a bulkhead or the roof, whichever it is less deep behind; over the sector, the rim walls go on down
// to the floor, and the bulkheads stand at its ends, the roof's edge on top of them. The floor and the
// structure under it, up to half way to the hull, are deck.cpp's own contact (deckAfterStep): 0 here.
int deckBand(V3 p, double r) {
    const double rho = std::hypot(p.x, p.z), ac = std::fabs(p.y);
    if (ac >= W2 || rho < OC_RING_RIM_M - 60) return -1;   // beside the band, or well inside the rim: the band's own box
    const double off = std::fabs(wrap(std::atan2(p.x, p.z) - A0));
    if (off > BETA + (r + 1) / rho) return -1;              // not over the sector
    if (off > BETA) {
        if (rho <= OC_RING_ROOF_M || rho >= R) return -1;
        return rho * std::sin(off - BETA) < rho - OC_RING_ROOF_M ? OC_DOCK_HIT_BULKHEAD : OC_DOCK_HIT_ROOF;
    }
    if (rho >= (R + OC_RING_HULL_M) / 2) return -1;         // the hull, from outside or near it
    if (rho >= R) return 0;
    if (std::hypot(std::fmax(OC_RING_RIM_M - rho, 0.0), W2 - ac) < r) return OC_DOCK_HIT_RIM;
    const double gap = rho * std::sin(BETA - off), along = rho * std::cos(BETA - off);
    const double above = std::fmax(OC_RING_ROOF_M - along, 0.0);
    if (std::hypot(gap, above) < r) return above > 0 ? OC_DOCK_HIT_ROOF : OC_DOCK_HIT_BULKHEAD;
    return 0;
}

// ---- the gear on the deck: part of the force model ----------------------------------------------------

// As on the runway: each leg a spring and a damper along the floor's normal (toward the axis), the tyres
// rolling along the nose with the brakes on the mains, and gripping sideways; against the deck's own motion
// at the contact, at time t. Only where the leg is over the open sector and inside the band. And as a tyre
// does at rest: where it has come to a stop it sticks to its spot of the deck (sideways always, along its roll
// only braked), held there by a stiff spring and damper as far as friction, MU_TYRE of the load, holds; the
// spot is the state's (deckAfterStep), fixed through the step. A rolling friction alone would let any small
// push roll a braked craft a little: the Earth's tide on the Ring, a hundredth of a metre a second squared
// at its rim, would rock it by a centimetre.
GearLoad deckGearLoad(const State& s, double t, V3 r, V3 v, Q q, V3 w) {
    GearLoad gl{{0, 0, 0}, {0, 0, 0}, 0};
    if (!s.gear || !s.deck.near || !ring.valid) return gl;
    const DeckState& k = s.deck;
    const Frame f = frameAt(t);
    const V3 spin = f.y * W, xb = rot(q, {1, 0, 0});
    for (int i = 0; i < 3; ++i) {
        const V3 pe = r + rot(q, GEAR[i]) - f.c;
        const V3 p = toRing(f, pe);
        const double rho = std::hypot(p.x, p.z), depth = rho - R;
        if (depth <= 0 || std::fabs(p.y) >= W2 || std::fabs(wrap(std::atan2(p.x, p.z) - A0)) >= BETA) continue;
        const V3 up = fromRing(f, V3{p.x, 0, p.z} * (-1.0 / rho));
        const V3 vp = v + rot(q, cross(w, GEAR[i])) - f.vc - cross(spin, pe);
        const double nrm = GEAR_K[i] * depth - GEAR_C[i] * dot(vp, up);
        if (nrm <= 0) continue;
        gl.contact = 1;
        const V3 fwd = unit(xb - up * dot(xb, up)), left = cross(up, fwd);
        const double vf = dot(vp, fwd), vl = dot(vp, left);
        const bool braked = i != 0 && s.brake >= 0.5;
        double roll = (0.02 + 0.5 * s.brake * (i == 0 ? 0 : 1)) * nrm * std::tanh(vf / 0.5);
        double side = clampd(4.0e5 * vl, -0.8 * nrm, 0.8 * nrm);
        if (k.stuck[i]) {   // held to its spot, as far as friction holds
            const V3 e = fromRing(f, p - k.anchor[i]);
            side = K_TYRE * dot(e, left) + C_TYRE * vl;
            if (braked) roll = K_TYRE * dot(e, fwd) + C_TYRE * vf;
            const double held = std::hypot(roll, side), most = MU_TYRE * nrm;
            if (held > most) { roll *= most / held; side *= most / held; }
        }
        const V3 force = up * nrm - fwd * roll - left * side;
        gl.force = gl.force + force;
        gl.moment = gl.moment + cross(GEAR[i], irot(q, force));
    }
    return gl;
}

namespace {

// After a step: each tyre on the deck that has come to rest against it sticks where it is; one held past what
// friction holds slips, its spot dragged after it; one moving again, or off the deck, lets go.
void tyres(State& s, const Frame& f) {
    DeckState& k = s.deck;
    const V3 spin = f.y * W, xb = rot(s.q, {1, 0, 0});
    for (int i = 0; i < 3; ++i) {
        const V3 pe = s.r + rot(s.q, GEAR[i]) - f.c;
        const V3 p = toRing(f, pe);
        const double rho = std::hypot(p.x, p.z);
        const bool on = s.gear && rho > R && std::fabs(p.y) < W2 && std::fabs(wrap(std::atan2(p.x, p.z) - A0)) < BETA;
        if (!on) { k.stuck[i] = 0; continue; }
        const V3 up = fromRing(f, V3{p.x, 0, p.z} * (-1.0 / rho));
        const V3 vp = s.v + rot(s.q, cross(s.w, GEAR[i])) - f.vc - cross(spin, pe);
        const V3 vt = vp - up * dot(vp, up);
        const V3 spot = p;   // where the tyre is, in the Ring's frame
        if (!k.stuck[i]) {
            if (norm(vt) < 0.05) { k.stuck[i] = 1; k.anchor[i] = spot; }
            continue;
        }
        if (norm(vt) > 0.3) { k.stuck[i] = 0; continue; }
        const double nrm = std::fmax(0.0, GEAR_K[i] * (rho - R) - GEAR_C[i] * dot(vp, up));
        const V3 fwd = unit(xb - up * dot(xb, up)), left = cross(up, fwd);
        const V3 e = fromRing(f, spot - k.anchor[i]);
        const bool braked = i != 0 && s.brake >= 0.5;
        const V3 et = left * dot(e, left) + (braked ? fwd * dot(e, fwd) : V3{0, 0, 0});
        const double reach = MU_TYRE * nrm / K_TYRE, d = norm(et);
        if (d > reach && d > 0) k.anchor[i] = k.anchor[i] + toRing(f, et * ((d - reach) / d));   // slipping: the spot follows
        if (!braked) k.anchor[i] = k.anchor[i] + toRing(f, fwd * dot(e, fwd));                    // rolling: the spot rolls with it
    }
}

// The navigation's errors, one step on: each a first-order Gauss-Markov process, e' = a e + sqrt(1 - a^2) sigma n,
// a = exp(-dt / NAV_TAU), n normal from a seeded generator (splitmix64, and Box and Muller's pair).
double uniform01(unsigned long long& x) {
    x += 0x9e3779b97f4a7c15ULL;
    unsigned long long z = x;
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
    z ^= z >> 31;
    return ((z >> 11) + 0.5) / 9007199254740992.0;
}
void navigate(DeckState& k) {
    if (k.dPos == 0 && k.dVel == 0) return;
    const double a = std::exp(-OC_DT / NAV_TAU), b = std::sqrt(1 - a * a);
    for (int i = 0; i < 6; i += 2) {
        const double u1 = uniform01(k.noiseSeed), u2 = uniform01(k.noiseSeed), m = std::sqrt(-2 * std::log(u1));
        const double n[2] = {m * std::cos(2 * PI * u2), m * std::sin(2 * PI * u2)};
        for (int j = 0; j < 2; ++j) {
            const int at = i + j;
            const double sigma = at < 3 ? k.dPos : k.dVel;
            k.noise[at] = a * k.noise[at] + b * sigma * n[j];
        }
    }
}

// What the crew learns of the drive in flight (Monte Carlo's thrust and mass errors are what it is for): the
// acceleration the navigation sees over the last step against the one the model expects, the drive at its nominal
// thrust for the believed mass, the small thrusters, the turning frame's pulls and the tide (which the deck's laws
// feed forward, so that it must not be learnt as the drive's); the part of the difference along
// the drive's thrust, over that thrust, is how far the drive's thrust per kilogram is off, (1 + thrust error) (1 + mass
// error) less one. Low-passed over TAU_KT and only while the drive gives at least 1 m/s2; held otherwise, and to
// within a fifth either way. The navigation's own errors, 0.05 m/s and correlated over 2 s, differenced over a
// step and averaged over TAU_KT, leave it about 0.003 off.
const double TAU_KT = 2.0;
void learnDrive(State& s, const Frame& f) {
    DeckState& k = s.deck;
    const Over o = navOf(s, f);
    const V3 drive = driveNominal(s, f), rcs = toRing(f, rot(s.q, s.rcs)), tide = toRing(f, pull(s.r) - pull(f.c));
    const V3 model = drive + rcs + tide + V3{W * W * o.p.x - 2 * W * o.u.z, 0, W * W * o.p.z + 2 * W * o.u.x};   // as deck_plan.cpp's motion
    if (k.estValid) {
        const V3 seen = (o.u - k.uPrev) * (1 / OC_DT), expect = (model + k.aPrev) * 0.5, d = (drive + k.dPrev) * 0.5;
        const double d2 = dot(d, d);
        if (d2 > 1.0) {
            const double kObs = clampd(dot(seen - expect, d) / d2, -0.5, 0.5);   // one step's view, the noise in it bounded
            k.kT = clampd(k.kT + (kObs - k.kT) * (OC_DT / TAU_KT), -0.2, 0.2);
        }
    }
    k.uPrev = o.u;
    k.aPrev = model;
    k.dPrev = drive;
    k.estValid = 1;
}

// The crew begins again, a landing or a take-off: nothing planned, nothing flown.
void freshPlan(DeckState& k, int kind) {
    k.plan = Flown{};
    k.planKind = kind;
    k.planEnd = k.planNext = 0;
    k.planSolves = k.planFails = k.planIters = 0;
    k.planStatus = -1;
    k.burnt = 0;
    k.v1 = 0;
    k.search = 0;
    k.tryNext = 0;
}

// No plan to be had from here: the crew says so and gives the craft back, at the hold point to the approach's crew,
// hovering over the pad to the pilot's deck hold.
void refusePlan(State& s) {
    DeckState& k = s.deck;
    k.refused = OC_DECK_NO_PLAN;
    k.phase = OC_DECK_PH_NONE;
    s.autoMode = k.planKind == 0 ? OC_AUTO_APPROACH : OC_AUTO_OFF;
    if (k.planKind == 1) s.sas = OC_SAS_DECK;
    k.autoBefore = s.autoMode;
    s.holdValid = 0;
}

}   // namespace

// ---- the hooks ------------------------------------------------------------------------------------------

void deckReset(State& s) {
    s.deck = DeckState{};
    s.deck.pad = -1;
    s.deck.autoBefore = OC_AUTO_CREW;   // oc_reset starts every flight with the crew
    s.deck.planStatus = -1;
    s.nozzle = 0;
    s.nozzleCmd = 0;
}

void deckEngage(State& s) {
    DeckState& k = s.deck;
    int no = OC_DECK_NO_NONE;
    const double t = timeOf(s);
    // Inside the Ring's reach the craft flies with it, and its own orbit says little: moving with the deck it
    // passes the Ring's centre at up to w r, 221.5 m/s, and the bottom of its own path swings hundreds of
    // kilometres as the Ring turns. The orbit is judged further out.
    const double range = ring.valid ? norm(s.r - ringPos(t)) : 1e30;
    const bool within = range < std::hypot(R + 500, W2 + 1500);
    const Frame f = frameAt(t);
    const Over o = navOf(s, f);
    const double off = std::fabs(wrap(o.th - A0));
    // Riding with the deck, nearer its speed than at rest among the stars, the craft needs about a g of thrust to
    // stay up: the crew picks the landing up from there, over the deck, or not at all. Over the deck it hovers to
    // the nearest pad if it can stop along the deck, braking at the hover's A_HOVER_H, short of the bulkhead
    // ahead (40 m to spare), and has the propellant for the hover's descent from where it is; else it refuses, as
    // it does over the roof or beside the deck, and the pilot keeps the craft. (Found by the audit of 599e051:
    // chosen by where the craft was alone, a crew taking over high in the final went to the hold point on the
    // small thrusters, and the craft fell.)
    const bool riding = ring.valid && o.rho > OC_RING_RIM_M - 400 && std::fabs(o.us) < 0.5 * W * o.rho;
    const double descent = (std::fmax(o.h, 0.0) / V_HOVER_MAX + 30) * (M_DRY + s.prop) * W * W * o.rho / (ISP * G0);   // kg
    if (s.dock.held == 1) no = OC_DECK_NO_DOCKED;
    else if (s.crashed) no = OC_DECK_NO_CRASHED;
    else if (k.onDeck) no = OC_DECK_NO_LANDED;
    else if (!ring.valid || (!within && orbitOf(s).peri < 150000)) no = OC_DECK_NO_LOW;
    else if (range > OC_DOCK_ENGAGE_M) no = OC_DECK_NO_FAR;
    else if (!within && norm(s.v - ringVel(t) - cross(ring.normal * ring.rate, s.r - ringPos(t))) > OC_DOCK_ENGAGE_SPEED) no = OC_DECK_NO_FAST;
    else if (riding && (off >= BETA || std::fabs(o.c) >= W2 - 30 || o.h <= 0)) no = OC_DECK_NO_RIDING;
    else if (riding && o.us * o.us / (2 * A_HOVER_H) >= R * (BETA - std::copysign(1.0, o.us) * wrap(o.th - A0)) - 40) no = OC_DECK_NO_STOP;
    else if (s.prop < (riding ? descent : OC_DECK_PROP_MIN)) no = OC_DECK_NO_PROP;
    k.refused = no;
    if (no) { s.autoMode = k.autoBefore; return; }   // refused: whoever was flying still is
    k.prop0 = s.prop;
    k.still = 0;
    freshPlan(k, 0);
    k.pad = nearestPad(o);
    k.side = o.c < 0 ? -1 : 1;
    if (riding || (off < BETA && std::fabs(o.c) < W2 - 30 && o.h > 0 && o.h < 300)) {   // over the deck: hover to the nearest pad
        // Moving faster than the hover's own 6 m/s over the deck (taken back in the final, the drive's slam under
        // way), the hover's gentle limits would not stop the craft above the deck: the crew plans the rest of the
        // landing at once instead, in one plan, of a length that takes the craft's speed off at a third of the
        // drive's spare thrust and gives the descent's last seconds; failing that, the hover.
        k.phase = OC_DECK_PH_HOVER;
        if (std::hypot(o.hd, std::hypot(o.us, o.u.y)) > V_HOVER_MAX) {
            k.burnt = 1;
            const Start st = startNow(s, t);
            const double spare = PLAN_THRUST * T_MAX / st.m - W * W * o.rho;
            const double tf = 3 * norm(st.v) / std::fmax(spare, 1.0) + T_LIT / 2;
            PlanResult res;
            ++k.planSolves;
            if (planFrom(s, st, tf, nullptr, 1.0, res) && storePlan(res, k.plan)) {
                k.planEnd = t + tf;
                k.planNext = t + 1;
                k.planStatus = res.status;
                k.planIters = res.iters;
                k.phase = OC_DECK_PH_GLIDE;
            }
        }
        return;
    }
    // Near the axis, or inside the Ring at rest among the stars: the crew plans the landing from where the craft is.
    // Elsewhere, and if no plan is found, it flies to the approach's hold point first.
    const bool nearAxis = o.rho < 1500 && std::fabs(o.c) < 1500;
    const bool inside = std::fabs(o.c) < W2 - 40 && o.rho > OC_HUB_RADIUS_M + 60 && o.rho < OC_RING_RIM_M - 300;
    if (nearAxis || inside) { beginSearch(s, t, TF_LO, TF_HI); k.phase = OC_DECK_PH_DEPART; return; }
    k.phase = OC_DECK_PH_TRANSFER;
}

// The crew's take-off: from the deck, or riding with it low over the sector.
void deckTakeoff(State& s) {
    DeckState& k = s.deck;
    int no = OC_DECK_NO_NONE;
    const double t = timeOf(s);
    const Frame f = frameAt(t);
    const Over o = navOf(s, f);
    const bool riding = ring.valid && std::fabs(o.us) < 0.1 * W * o.rho;
    const bool low = std::fabs(wrap(o.th - A0)) < BETA && std::fabs(o.c) < W2 - 30 && o.h < 100;
    if (s.dock.held == 1) no = OC_DECK_NO_DOCKED;
    else if (s.crashed) no = OC_DECK_NO_CRASHED;
    else if (!ring.valid || !(k.onDeck || (riding && low))) no = OC_DECK_NO_NOT_DOWN;
    else if (s.prop < OC_DECK_TAKEOFF_PROP_MIN) no = OC_DECK_NO_PROP;
    k.refused = no;
    if (no) { s.autoMode = k.autoBefore; return; }
    k.prop0 = s.prop;
    k.still = 0;
    freshPlan(k, 1);
    k.pad = nearestPad(o);
    k.side = -1;   // out to the hold point's side of the Ring's plane
    k.phase = OC_DECK_PH_LIFT;
    s.brake = 0;
}

void deckCrew(State& s, const Local& L, double* throttle) {
    DeckState& k = s.deck;
    *throttle = 0;
    s.brake = 0;
    s.steer = 0;
    const double t = timeOf(s);
    const Frame f = frameAt(t);
    const Over o = navOf(s, f);
    const V3 tide = pull(s.r) - pull(f.c);
    if (k.search > 0) {   // choosing the plan, one a step; meanwhile the craft holds as it is
        const int got = searchStep(s, t);
        if (got < 0) {   // none: a landing tries again from the hold point; from there, or climbing out, refused
            if (k.planKind == 0 && norm(s.r - holdPoint(t)) > 100) { k.phase = OC_DECK_PH_TRANSFER; k.planNext = t + 10; }
            else { refusePlan(s); return; }
        } else if (got > 0 && k.phase == OC_DECK_PH_LIFT) k.phase = OC_DECK_PH_CLIMB;
        if (got == 0) {
            if (k.phase == OC_DECK_PH_LIFT) {
                s.gear = 1;
                hover(s, L, f, o, tide, H_LIFT, -1, V_HOVER_MAX, K_HP_H, throttle);
            } else {
                s.rcs = {0, 0, 0};
                rateLoop(s, L, point(s, L, f.c - s.r, 1.0, 0.15));
            }
            return;
        }
    }
    if (k.phase == OC_DECK_PH_TRANSFER) {   // the approach's law, by a way that is clear of the Ring; at the hold point, the plan
        const V3 hold = holdPoint(t);
        const V3 dr = s.r - dockSafeAim(s, hold), dv = s.v - f.vc;
        const double d = norm(dr);
        const double speed = std::fmin(40.0, std::fmin(std::sqrt(2 * 0.25 * d), 0.1 * d));
        const V3 want = d > 1e-3 ? dr * (-speed / d) : V3{0, 0, 0};
        const V3 body = irot(s.q, (want - dv) * 0.5);
        s.rcs = {clampd(body.x, -RCS_ACC, RCS_ACC), clampd(body.y, -RCS_ACC, RCS_ACC), clampd(body.z, -RCS_ACC, RCS_ACC)};
        rateLoop(s, L, point(s, L, f.c - s.r, 1.0, 0.15));
        if (norm(s.r - hold) < 30 && norm(dv) < 1.0 && t >= k.planNext) {
            beginSearch(s, t, TF_LO, TF_HI);
            k.phase = OC_DECK_PH_DEPART;
        }
        return;
    }
    if (k.phase == OC_DECK_PH_LIFT) {   // straight up off the pad, then the plan out
        s.gear = 1;
        hover(s, L, f, o, tide, H_LIFT, -1, V_HOVER_MAX, K_HP_H, throttle);
        if (o.h > H_LIFT - 5 && std::fabs(o.hd) < 1.0) beginSearch(s, t, TF_LO_UP, TF_HI_UP);
        return;
    }
    const bool landing = k.phase == OC_DECK_PH_DEPART || k.phase == OC_DECK_PH_WAIT || k.phase == OC_DECK_PH_GLIDE;
    const bool climbing = k.phase == OC_DECK_PH_CLIMB || k.phase == OC_DECK_PH_COAST || k.phase == OC_DECK_PH_ARRIVE;
    if (landing || climbing) {
        const bool burn = burning(k.plan, t), last = lastBurn(k.plan, t);
        if (burn) k.burnt = 1;
        // where the plan stands: its first burn; the coast after it, small corrections and all; its last burn
        if ((k.phase == OC_DECK_PH_DEPART || k.phase == OC_DECK_PH_WAIT) && k.burnt && last) k.phase = OC_DECK_PH_GLIDE;
        else if (k.phase == OC_DECK_PH_DEPART && k.burnt && !burn) k.phase = OC_DECK_PH_WAIT;
        else if ((k.phase == OC_DECK_PH_CLIMB || k.phase == OC_DECK_PH_COAST) && k.burnt && last && o.h > 1000) k.phase = OC_DECK_PH_ARRIVE;
        else if (k.phase == OC_DECK_PH_CLIMB && k.burnt && !burn) k.phase = OC_DECK_PH_COAST;
        if (t < k.planEnd) {
            // Made again: coasting, every REPLAN_COAST seconds, and every REPLAN_NEAR with a burn 12 s ahead, so that
            // the burn is planned finely from where the craft is; burning, only when the craft is off its plan.
            const bool coasting = k.phase == OC_DECK_PH_WAIT || k.phase == OC_DECK_PH_COAST || (k.burnt && !burn);
            if (coasting && t >= k.planNext) {
                V3 ahead;
                replan(s, t, false);
                k.planNext = t + (burnAhead(k.plan, t, 12, &ahead) ? REPLAN_NEAR : REPLAN_COAST);
            } else if (k.burnt && burn && (t >= k.planNext || k.tryNext > 0)) {
                double dr, dv;
                offPlan(k, o, t, &dr, &dv);
                if (dr > OFF_PLAN_R || dv > OFF_PLAN_V || k.tryNext > 0) { replan(s, t, true); k.planNext = t + 1; }
            }
            s.gear = landing ? (k.phase == OC_DECK_PH_GLIDE ? 1 : 0) : (o.h < 50 ? 1 : 0);
            track(s, L, f, o, t, k.phase == OC_DECK_PH_GLIDE || (climbing && o.h < 300) ? 45 * D2R : PI, throttle);
            return;
        }
        if (climbing) {   // at the hold point: the approach's crew holds it there
            k.phase = OC_DECK_PH_NONE;
            s.autoMode = OC_AUTO_APPROACH;
            s.gear = 0;
            k.autoBefore = OC_AUTO_APPROACH;
            rateLoop(s, L, point(s, L, f.c - s.r, 1.0, 0.15));
            return;
        }
        // at the gate: down from it if the craft is there, else the hover first
        const double off = std::hypot(arcTo(o, padAngle(k.pad)), o.c);
        k.phase = off < GATE_BOX && std::hypot(o.us, o.u.y) < GATE_DRIFT ? OC_DECK_PH_DESCEND : OC_DECK_PH_HOVER;
        k.calm = 0;
    }
    s.gear = 1;
    if (k.phase == OC_DECK_PH_HOVER) {
        const double sp = arcTo(o, padAngle(k.pad));
        if (std::hypot(std::hypot(sp, o.c), o.h - H_HOVER) < 1.0 && norm(o.u) < 0.2) ++k.calm;
        else k.calm = 0;
        if (k.calm >= 100) { k.phase = OC_DECK_PH_DESCEND; k.calm = 0; }   // two seconds settled: down
        hover(s, L, f, o, tide, H_HOVER, -1, V_HOVER_MAX, K_HP_H, throttle);
        return;
    }
    if (k.phase == OC_DECK_PH_DESCEND && !k.onDeck) {
        // Over the pad's centre within DESCENT_BOX and still across the deck, down at the descent's rate; else
        // holding the gate's height, drawn to the centre twice as hard as the hover is (critically damped no
        // longer, seven tenths of it), no faster than V_SETTLE. A metre under the gate the descent is committed,
        // unless the craft is twice the box off, and the last metres are flown on the velocity alone, so that the
        // navigation's error in place, which the pad's centre is seen through, does not become a drift.
        const double off = std::hypot(arcTo(o, padAngle(k.pad)), o.c), drift = std::hypot(o.us, o.u.y);
        const bool low = o.h < GATE_H - 1;
        if ((off < DESCENT_BOX && drift < 0.15) || (low && off < 2 * DESCENT_BOX))
            hover(s, L, f, o, tide, 0, crewDescent(o.h), descentDrift(o.h), low ? 0 : 2 * K_HP_H, throttle);
        else
            hover(s, L, f, o, tide, GATE_H, -1, V_SETTLE, 2 * K_HP_H, throttle);
        return;
    }
    // on the deck: the drive to idle, the brakes on; the gear takes the weight as the thrust runs down
    s.brake = 1;
    idle(s, throttle);
}

bool deckPilot(State& s, const Local& L, double* throttle) {
    DeckState& k = s.deck;
    if (!ring.valid) return false;
    const double t = timeOf(s);
    const Frame f = frameAt(t);
    const Over o = navOf(s, f);
    if (o.rho > R + 300 || std::fabs(o.c) > 2500) { k.armed = 0; return false; }   // away from the Ring: the plain hold
    if (!k.armed) {   // take the craft as the hold finds it: its velocity against the deck, its heading
        k.armed = 1;
        k.setS = o.us;
        k.setC = o.u.y;
        k.setH = o.hd;
        const V3 nose = toRing(f, rot(s.q, {1, 0, 0}));
        k.heading = std::atan2(nose.y, dot(nose, o.spin));
        k.holding = k.holdingC = 0;
        k.holdingH = 0;
        if (k.pad < 0) { k.pad = nearestPad(o); k.side = o.c < 0 ? -1 : 1; }
    }
    k.heading = wrap(k.heading + clampd(hands.yaw, -1, 1) * YAW_RATE * OC_DT);
    // the throttle: the climb or the sink, centred holding the height
    const double lever = (clampd(hands.throttle, 0, 1) - 0.5) / 0.5;
    const double climb = std::fabs(lever) < 0.12 ? 0 : (lever - std::copysign(0.12, lever)) / 0.88 * V_CLIMB;
    if (k.onDeck && climb <= 0) {   // on the deck, nothing asked but to stay: the gear has it
        k.setS = k.setC = k.setH = k.cmdS = k.cmdC = 0;
        k.holding = k.holdingC = 0;
        k.holdingH = 0;
        idle(s, throttle);
        return true;
    }
    // The stick, in the nose's axes, is a velocity against the deck (TRC): V_TRC at full deflection, nothing
    // centred. Held at a stop it also winds up a speed kept on top of that, so that a long way can be flown on
    // the keys; let go, that runs down at A_HOLD, and once the craft is at rest the hold keeps its place.
    // The small thrusters' keys nudge it at V_NUDGE.
    const double fwd = -clampd(hands.pitch, -1, 1), rgt = clampd(hands.roll, -1, 1);
    const double ch = std::cos(k.heading), sh = std::sin(k.heading);
    if (std::fabs(fwd) > 0.9 || std::fabs(rgt) > 0.9) {
        k.setS += (fwd * ch - rgt * sh) * A_STICK * OC_DT;
        k.setC += (fwd * sh + rgt * ch) * A_STICK * OC_DT;
    } else {
        const double kept = std::hypot(k.setS, k.setC), left = std::fmax(0.0, kept - A_HOLD * OC_DT);
        if (kept > 0) { k.setS *= left / kept; k.setC *= left / kept; }
    }
    const double tfwd = fwd * V_TRC + clampd(hands.tx, -1, 1) * V_NUDGE, trgt = rgt * V_TRC + clampd(hands.ty, -1, 1) * V_NUDGE;
    const double ts = k.setS + tfwd * ch - trgt * sh, tc = k.setC + tfwd * sh + trgt * ch;
    // each of the deck's two ways held at its place while nothing asks the craft to move along it
    double ws = ts, wc = tc;
    if (ts != 0) k.holding = 0;
    else if (!k.holding && std::fabs(o.us) < 0.3) { k.holding = 1; k.holdPos.x = o.p.x; k.holdPos.z = o.p.z; }
    if (tc != 0) k.holdingC = 0;
    else if (!k.holdingC && std::fabs(o.u.y) < 0.3) { k.holdingC = 1; k.holdPos.y = o.p.y; }
    if (k.holding) ws = -clampd(K_HP_H * R * wrap(o.th - std::atan2(k.holdPos.x, k.holdPos.z)), -3, 3);
    if (k.holdingC) wc = -clampd(K_HP_H * (o.c - k.holdPos.y), -3, 3);
    k.cmdS = ws;
    k.cmdC = wc;
    // the throttle centred: stop the climb or the sink, then keep that height
    double wh = climb;
    if (climb != 0) k.holdingH = 0;
    else if (!k.holdingH && std::fabs(o.hd) < 0.3) { k.holdingH = 1; k.holdH = o.h; }
    if (climb == 0) wh = k.holdingH ? -clampd(K_HP * (o.h - k.holdH), -3, 3) : 0;
    // near the deck the sink is eased to a touchdown's; over the roof, to a stop 15 m above it
    const bool overDeck = std::fabs(wrap(o.th - A0)) < BETA && std::fabs(o.c) < W2;
    const double ease = overDeck ? descentRate(o.h) : K_DESCENT * std::fmax(0.0, o.h - (R - OC_RING_ROOF_M) - 15);
    if (o.h < 1000 && wh < -ease) wh = -ease;
    k.setH = wh;
    const double sdd = clampd(K_HV_H * (ws * R / std::fmax(o.rho, 1.0) - o.sd), -A_HOVER_H, A_HOVER_H);
    const double hdd = clampd(K_HV * (wh - o.hd), -5, 5), cdd = clampd(K_HV_H * (wc - o.cd), -A_HOVER_H, A_HOVER_H);
    vectored(s, L, forceFor(o, f, sdd, hdd, cdd, pull(s.r) - pull(f.c)), noseOver(o, f, k.heading), fromRing(f, o.out * -1.0),
             f.y * o.psid, 30 * D2R, throttle);
    return true;
}

// After each step, whoever flies: the navigation's errors on a step; the delta-v the crew has flown; the hard
// points against the deck, swept along the step; the gear's touch, and the touchdown's verdict; the craft at rest
// on the deck.
void deckAfterStep(State& s) {
    DeckState& k = s.deck;
    navigate(k);
    const bool crew = s.autoMode == OC_AUTO_DECK || s.autoMode == OC_AUTO_TAKEOFF;
    // what the drive gives, learnt while the crew or the deck hold flies it and nothing else pushes: not on the deck,
    // whose gear the model does not know
    if (ring.valid && (crew || (s.autoMode == OC_AUTO_OFF && s.sas == OC_SAS_DECK)) && !s.crashed && !k.onDeck) learnDrive(s, frameAt(timeOf(s)));
    else k.estValid = 0;
    if (crew) {
        const double mass = M_DRY + s.prop;
        const V3 a = rot(s.q, thrustAxis(s.nozzle)) * (s.prop > 0 ? s.thr * T_MAX * (1 + k.dThrust) / mass : 0) + rot(s.q, s.rcs);
        k.v1 += norm(a) * OC_DT;
    } else {
        k.autoBefore = s.autoMode;
        if (k.phase != OC_DECK_PH_LANDED) k.phase = OC_DECK_PH_NONE;   // the crew let go
    }
    if (!(s.autoMode == OC_AUTO_OFF && s.sas == OC_SAS_DECK)) k.armed = 0;
    if (!ring.valid || s.crashed || s.dock.held) { k.near = 0; k.onDeck = 0; k.still = 0; k.lastValid = 0; k.stuck[0] = k.stuck[1] = k.stuck[2] = 0; return; }
    const double t = timeOf(s);
    const double far = norm(s.r - ringPos(t)) - std::hypot(R + 40, W2 + 30);
    if (far > 0) {   // nowhere near the floor: the frame is not needed
        k.near = 0;
        k.onDeck = 0;
        k.still = 0;
        k.lastValid = 0;
        k.stuck[0] = k.stuck[1] = k.stuck[2] = 0;
        if (k.phase == OC_DECK_PH_LANDED) k.phase = OC_DECK_PH_NONE;
        return;
    }
    const Frame f = frameAt(t);
    const Over o = overOf(s.r, s.v, f);
    k.near = o.h < 80 && o.h > -40 && std::fabs(wrap(o.th - A0)) < BETA + 0.02 && std::fabs(o.c) < W2 + 30;
    if (!k.near) { k.onDeck = 0; k.still = 0; k.stuck[0] = k.stuck[1] = k.stuck[2] = 0; k.lastValid = 0; if (k.phase == OC_DECK_PH_LANDED) k.phase = OC_DECK_PH_NONE; return; }
    // what the next step's touchdown, if it comes, is judged from: this step's sink, its rate, the lowest leg's
    // height over the floor of the sector, the drift
    double low = 1e30;
    for (int i = 0; i < 3 && s.gear; ++i) {
        const V3 p = toRing(f, s.r + rot(s.q, GEAR[i]) - f.c);
        if (std::fabs(p.y) < W2 && std::fabs(wrap(std::atan2(p.x, p.z) - A0)) < BETA) low = std::fmin(low, R - std::hypot(p.x, p.z));
    }
    const double sinkWas = k.sinkLast, rateWas = k.sinkRate, legWas = k.legLast, driftWas = k.driftLast;
    const int validWas = k.lastValid;
    k.sinkRate = validWas ? (-o.hd - sinkWas) / OC_DT : 0;
    k.sinkLast = -o.hd;
    k.legLast = low;
    k.driftLast = std::hypot(o.us, o.u.y);
    k.lastValid = 1;
    const V3 spin = f.y * W;
    // the hard points: each along its path over the step, in pieces of half a metre
    V3 now[NHARD], vel[NHARD];
    double fastest = 0;
    for (int i = 0; i < NHARD; ++i) {
        const V3 arm = rot(s.q, HARD[i].at);
        now[i] = toRing(f, s.r + arm - f.c);
        vel[i] = toRing(f, s.v + rot(s.q, cross(s.w, HARD[i].at)) - f.vc - cross(spin, s.r + arm - f.c));
        fastest = std::fmax(fastest, norm(vel[i]));
    }
    const int pieces = 1 + (int)std::fmin(400.0, fastest * OC_DT / 0.5);
    for (int j = 1; j <= pieces; ++j) {
        const double back = OC_DT * (pieces - j) / pieces;
        for (int i = 0; i < NHARD; ++i) {
            const V3 p = now[i] - vel[i] * back;
            if (std::hypot(p.x, p.z) > R && std::fabs(p.y) < W2 && std::fabs(wrap(std::atan2(p.x, p.z) - A0)) < BETA) {
                k.verdict = OC_DECK_V_CRASHED;
                k.tdT = t - back;
                dockWreck(s, OC_DOCK_HIT_DECK, HARD[i].part, back);
                k.onDeck = 0;
                return;
            }
        }
    }
    // the gear
    int legs = 0;
    if (s.gear) {
        for (int i = 0; i < 3; ++i) {
            const V3 p = toRing(f, s.r + rot(s.q, GEAR[i]) - f.c);
            if (std::hypot(p.x, p.z) > R && std::fabs(p.y) < W2 && std::fabs(wrap(std::atan2(p.x, p.z) - A0)) < BETA) ++legs;
        }
    }
    if (legs && !k.onDeck) {   // the touchdown: the centre of mass's motion against the deck as the first leg meets it
        // Judged at the touch, not at the step's end, when the legs have already taken some of the sink: the
        // step before's sink carried down the lowest leg's last legWas metres at its rate, sink^2 + 2 rate legWas,
        // as a fall at a steady pull is; never less than the end shows. The drift no less than the step before's.
        // (Found by the audit of 599e051: judged at the step's end, a 3.13 m/s touch read 2.90, firm, and a softer
        // 3.04 a crash, by where in its step the touch fell.)
        double sink = -o.hd, drift = std::hypot(o.us, o.u.y);
        if (validWas && legWas > 0 && legWas < 3.0) sink = std::fmax(sink, std::sqrt(std::fmax(0.0, sinkWas * sinkWas + 2 * rateWas * legWas)));
        if (validWas) drift = std::fmax(drift, driftWas);
        const double tilt = std::acos(clampd(dot(fromRing(f, o.out), rot(s.q, {0, 0, 1})), -1, 1));
        int pad = 0;
        double offPad = 1e30;
        for (int i = 0; i < OC_DECK_PADS; ++i) {
            const double d = std::hypot(arcTo(o, padAngle(i)), o.c);
            if (d < offPad) { offPad = d; pad = i; }
        }
        k.tdT = t;
        k.tdSink = sink;
        k.tdDrift = drift;
        k.tdOff = offPad;
        k.tdTilt = tilt;
        k.tdPad = pad;
        k.verdict = sink > OC_DECK_CRASH_SINK || drift > OC_DECK_CRASH_DRIFT || tilt > OC_DECK_CRASH_TILT_DEG * D2R ? OC_DECK_V_CRASHED
                  : sink > OC_DECK_TOL_SINK ? OC_DECK_V_FIRM
                  : drift > OC_DECK_TOL_DRIFT ? OC_DECK_V_DRIFTING
                  : tilt > OC_DECK_TOL_TILT_DEG * D2R ? OC_DECK_V_TILTED
                  : offPad > OC_DECK_TOL_OFF_M ? OC_DECK_V_OFF_PAD
                  : OC_DECK_V_LANDED;
        if (k.verdict == OC_DECK_V_CRASHED) {
            dockWreck(s, OC_DOCK_HIT_DECK, OC_DOCK_PART_GEAR, 0);
            k.onDeck = 0;
            return;
        }
    }
    k.onDeck = legs > 0;
    tyres(s, f);
    if (legs == 3 && norm(o.u) < 0.05) ++k.still;
    else if (!legs) k.still = 0;
    if (k.still >= 50 && legs == 3 && s.autoMode != OC_AUTO_TAKEOFF) {   // at rest on the deck: the crew's landing is done, and the pilot has it
        k.phase = OC_DECK_PH_LANDED;
        if (s.autoMode == OC_AUTO_DECK) {
            s.autoMode = OC_AUTO_OFF;
            s.sas = OC_SAS_DECK;
            s.holdValid = 0;
            k.autoBefore = OC_AUTO_OFF;
        }
    }
    if (!legs && k.phase == OC_DECK_PH_LANDED) k.phase = OC_DECK_PH_NONE;
}

void deckWriteOut(const State& s) {
    std::memset(out, 0, sizeof out);
    const DeckState& k = s.deck;
    out[OC_DECK_PHASE] = k.phase;
    out[OC_DECK_PAD] = k.pad;
    out[OC_DECK_ON_DECK] = k.onDeck;
    out[OC_DECK_NOZZLE_DEG] = s.nozzle * R2D;
    out[OC_DECK_TD_VERDICT] = k.verdict;
    out[OC_DECK_TD_T] = k.tdT;
    out[OC_DECK_TD_SINK] = k.tdSink;
    out[OC_DECK_TD_DRIFT] = k.tdDrift;
    out[OC_DECK_TD_OFF] = k.tdOff;
    out[OC_DECK_TD_TILT_DEG] = k.tdTilt * R2D;
    out[OC_DECK_TD_PAD] = k.tdPad;
    out[OC_DECK_REFUSED] = k.refused;
    out[OC_DECK_PROP_USED] = k.prop0 > 0 ? k.prop0 - s.prop : 0;
    out[OC_DECK_PLAN_SOLVES] = k.planSolves;
    out[OC_DECK_FLOWN_DV] = k.v1;
    out[OC_DECK_PLAN_TIME] = -1;
    if (!ring.valid) return;
    const double t = timeOf(s);
    const Frame f = frameAt(t);
    const Over o = overOf(s.r, s.v, f);
    const int pad = k.pad >= 0 ? k.pad : (OC_DECK_PADS - 1) / 2;
    const double sp = arcTo(o, padAngle(pad));
    out[OC_DECK_S] = sp;
    out[OC_DECK_C] = o.c;
    out[OC_DECK_HEIGHT] = o.h;
    out[OC_DECK_ALONG] = o.us;
    out[OC_DECK_ACROSS] = o.u.y;
    out[OC_DECK_VERTICAL] = o.hd;
    out[OC_DECK_APPARENT_G] = o.rho > 1 ? (o.us + W * o.rho) * (o.us + W * o.rho) / (o.rho * G0) : 0;
    out[OC_DECK_SECTOR_S] = arcTo(o, A0);
    const V3 nose = toRing(f, rot(s.q, {1, 0, 0}));
    out[OC_DECK_HEADING_DEG] = std::atan2(nose.y, dot(nose, o.spin)) * R2D;
    out[OC_DECK_SET_ALONG] = k.cmdS;
    out[OC_DECK_SET_ACROSS] = k.cmdC;
    out[OC_DECK_SET_VERTICAL] = k.setH;
    const bool planning = k.plan.n > 0 && (k.phase == OC_DECK_PH_DEPART || k.phase == OC_DECK_PH_WAIT || k.phase == OC_DECK_PH_GLIDE ||
                                           k.phase == OC_DECK_PH_CLIMB || k.phase == OC_DECK_PH_COAST || k.phase == OC_DECK_PH_ARRIVE);
    if (planning) {   // the plan: what is left of it, and where the craft is against it (the deck's ILS and flight director)
        out[OC_DECK_PLAN_TIME] = std::fmax(0.0, k.planEnd - t);
        double dv = 0;
        for (int i = 0; i < k.plan.n; ++i) {
            const double t0 = k.plan.t[i], t1 = k.plan.t[i + 1];
            if (t1 > t) dv += k.plan.sigma[i] * (t1 - std::fmax(t0, t));
        }
        out[OC_DECK_PLAN_DV] = dv;
        out[OC_DECK_PLAN_PROP] = (M_DRY + s.prop) * (1 - std::exp(-dv / (ISP * G0)));
        V3 rr, vr, ur;
        flownAt(k.plan, t, &rr, &vr, &ur);
        out[OC_DECK_LOC_M] = o.c - rr.y;
        out[OC_DECK_GS_M] = o.h - (R - std::hypot(rr.x, rr.z));
        const V3 want = vr + (rr - o.p) * (K_TRACK_P / K_TRACK_D);
        out[OC_DECK_FD_ALONG] = dot(want, o.spin);
        out[OC_DECK_FD_ACROSS] = want.y;
        out[OC_DECK_FD_VERTICAL] = -dot(want, o.out);
        return;
    }
    if (k.pad < 0) return;
    // no plan: the deck's ILS is the approach's cone over the pad (its edge the glide path, its axis the course), and
    // the flight director the hover's, to the pad
    const Pad p = padOf(pad);
    out[OC_DECK_LOC_M] = o.c;
    out[OC_DECK_GS_M] = o.h - p.tanS * std::fabs(sp);
    const double scale = std::fmax(o.rho, 1.0) / R;   // the floor's arc to the craft's own
    out[OC_DECK_FD_ALONG] = -clampd(K_HP_H * sp, -V_HOVER_MAX, V_HOVER_MAX) * scale;
    out[OC_DECK_FD_ACROSS] = -clampd(K_HP_H * o.c, -V_HOVER_MAX, V_HOVER_MAX);
    out[OC_DECK_FD_VERTICAL] = k.phase == OC_DECK_PH_DESCEND || k.onDeck ? -crewDescent(o.h) : -clampd(K_HP * (o.h - H_HOVER), -V_HOVER_MAX, V_HOVER_MAX);
}

void deckHash(const State& s, unsigned& h) {
    const DeckState& k = s.deck;
    const double v[] = {s.nozzle, s.nozzleCmd, (double)k.phase, (double)k.pad, (double)k.refused, (double)k.autoBefore, (double)k.near,
                        (double)k.onDeck, (double)k.still, (double)k.calm, (double)k.side, k.prop0,
                        (double)k.planKind, k.planEnd, k.planNext, (double)k.planSolves, (double)k.planFails, (double)k.planIters, (double)k.planStatus,
                        (double)k.burnt, k.v1, (double)k.plan.n, k.plan.t0, k.plan.tf, k.plan.cost,
                        (double)k.holding, (double)k.holdingC, k.holdPos.x, k.holdPos.y, k.holdPos.z, (double)k.holdingH, k.holdH, k.setS, k.setC, k.cmdS, k.cmdC,
                        k.setH, k.heading, (double)k.armed, (double)k.verdict, (double)k.tdPad, k.tdT, k.tdSink, k.tdDrift, k.tdOff, k.tdTilt,
                        (double)k.stuck[0], (double)k.stuck[1], (double)k.stuck[2], k.anchor[0].x, k.anchor[0].y, k.anchor[0].z,
                        k.anchor[1].x, k.anchor[1].y, k.anchor[1].z, k.anchor[2].x, k.anchor[2].y, k.anchor[2].z,
                        (double)k.lastValid, k.sinkLast, k.sinkRate, k.legLast, k.driftLast,
                        k.dThrust, k.dMass, k.dLag, k.dPos, k.dVel, (double)(k.noiseSeed >> 32), (double)(k.noiseSeed & 0xffffffffULL),
                        k.noise[0], k.noise[1], k.noise[2], k.noise[3], k.noise[4], k.noise[5], k.lagged,
                        (double)k.search, k.gsA, k.gsB, k.gsC, k.gsD, k.gsJc, k.gsJd, k.gsBest, k.st0, k.sr0.x, k.sr0.y, k.sr0.z,
                        k.sv0.x, k.sv0.y, k.sv0.z, k.sm0, k.su0.x, k.su0.y, k.su0.z, (double)k.tryNext,
                        k.kT, k.uPrev.x, k.uPrev.y, k.uPrev.z, k.aPrev.x, k.aPrev.y, k.aPrev.z, k.dPrev.x, k.dPrev.y, k.dPrev.z, (double)k.estValid};
    hashDoubles(h, v, sizeof v / sizeof v[0]);
    // the plan's nodes and forces
    hashDoubles(h, k.plan.t, PLAN_MAX + 1);
    hashDoubles(h, &k.plan.r[0][0], 3 * (PLAN_MAX + 1));
    hashDoubles(h, &k.plan.v[0][0], 3 * (PLAN_MAX + 1));
    hashDoubles(h, k.plan.z, PLAN_MAX + 1);
    hashDoubles(h, &k.plan.u[0][0], 3 * PLAN_MAX);
    hashDoubles(h, k.plan.sigma, PLAN_MAX);
}

}   // namespace oc

extern "C" {

const double* oc_deck_out(void) { return oc::out; }
int oc_deck_out_len(void) { return OC_DECK_COUNT; }

void oc_deck_disturb(double thrust, double mass, double lag, double pos, double vel, unsigned seed) {
    if (!std::isfinite(thrust) || !std::isfinite(mass) || !std::isfinite(lag) || !std::isfinite(pos) || !std::isfinite(vel)) return;   // refused
    if (thrust <= -1 || mass <= -1 || lag < 0 || pos < 0 || vel < 0) return;
    oc::DeckState& k = oc::g.deck;
    k.dThrust = thrust;
    k.dMass = mass;
    k.dLag = lag;
    k.dPos = pos;
    k.dVel = vel;
    k.noiseSeed = 0x9e3779b97f4a7c15ULL ^ seed;
    for (double& n : k.noise) n = 0;
    k.lagged = oc::g.nozzle;
}

}   // extern "C"
