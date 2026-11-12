// deck.cpp — the Ring's flight deck (orbit_deck.h): the band round its open sector, the gear on the deck,
// the craft as a jet whose swivelled drive is turned into the force a law asks for, the crew's deck landing,
// the pilot's deck hold, and the touchdown with its verdict. Every number marked as chosen is a design choice
// for the sketch, not a measurement of any aircraft, ship or station. GPLv3.
//
// The frame. The Ring's own (dock.cpp's): x its ref, which turns with it, y its axis, z = x cross y; a point's
// angle about the axis in the spokes' convention is atan2(x, z), and spinward is the way it grows. Over the
// deck the craft's place is (s, h, c): s the floor's arc from the pad (R times the angle), h its height over
// the floor (R less its distance from the axis), c across, along the axis. Its velocity in the turning frame
// is u = v - w (axis x p), relative to the Ring's centre. The Ring's centre falls freely and its axis is fixed
// among the stars, so in a cylinder about that axis the motion is exactly the plane polar one: radially
// rho'' - rho psi'^2, along rho psi'' + 2 rho' psi', with psi' = s'/R + w the craft's own turn about the axis
// among the stars. Every law here asks for (s'', h'', c'') and gets the thrust from those, the turning frame's
// pulls (centrifugal, Coriolis) worked out, not left to feedback; only the tides, the craft and the Ring's
// centre falling a little differently, are fed forward as they are, a few thousandths of a metre a second
// squared at 5 km.

#include "internal.h"

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
const double SPOKE_STEP = 2 * PI / OC_RING_SPOKES;

double padAngle(int k) { return A0 + (k - (OC_DECK_PADS - 1) / 2.0) * OC_DECK_PAD_SPACING_M / R; }

// ---- chosen -----------------------------------------------------------------------------------------

const double H_GLIDE = OC_DECK_GLIDE_M, H_HOVER = OC_DECK_HOVER_M, SIDE_M = OC_DECK_SIDE_M;
const double H_CONTACT = 3.0;    // m: the centre of mass over the floor with the legs just touching (orbit_core.cpp's GEAR)
const double CLEAR_M = 355;      // m: the glide path's least height where it crosses the sector's end, 55 m over the bulkhead's top
const double FINAL_MAX_M = 900;  // m: the longest final, from the glide's height down to the hover
const double CURVE_ACC = 3.0;    // m/s2: the most the final's bend may ask of the vertical, at its top: it sets the speed there
const double FINAL_V_MAX = 45;   // m/s: and the fastest the craft goes into it
const double K_FINAL = 0.2;      // 1/s: the last metres to the hover point, the speed in proportion to the distance
const double A_BLEED_MIN = 3.0, A_BLEED_MAX = 5.0, A_BLEED = 4.0;   // m/s2: the bleed's deceleration, the glide started anywhere in its window
const double SPOKE_CLEAR_M = 120;   // m of the floor's arc past the last spoke before the craft leaves its side for the centreline
const double V_DEPART = 60, A_DEPART = 1.0, K_DEPART = 0.15;   // the departure: top speed, braking, the last metres
const double WAIT_MARGIN_S = 20;    // s the craft means to wait at its point before the glide's window opens
// the laws' gains: the glide path's height and course as a second-order loop at 0.5 rad/s, nine tenths of
// critical; the speed along it at 0.6 /s
const double K_GP = 0.25, K_GD = 0.9, K_GV = 0.6;
// the hover: the height in a place loop at 0.3 /s inside a velocity loop at 1.0 /s, which the throttle alone
// serves; along and across slower, at 0.15 /s and 0.6 /s, critically damped, since a push sideways waits on a
// bank that takes the craft about a second, and at most 3 m/s2 (17 degrees of bank)
const double K_HP = 0.3, K_HV = 1.0, V_HOVER_MAX = 6;
const double K_HP_H = 0.15, K_HV_H = 0.6, A_HOVER_H = 3.0;
const double V_TOUCH = 0.25, K_DESCENT = 0.15, V_DESCENT_MAX = 2.0;   // the descent: 2 m/s easing to 0.25 at the touch
// the pilot's deck hold
const double V_TRC = 10.0, V_NUDGE = 1.0;    // m/s at the stick's stop, and at a small thruster's key
const double A_STICK = 1.5, A_HOLD = 2.0;    // m/s2: the speed a stick held at its stop winds up, and how fast it runs down let go
const double V_CLIMB = 8.0;                  // m/s: the throttle's climb and sink at its stops; centred, the height held
const double YAW_RATE = 12 * D2R;            // rad/s at full pedal
const double F_DRIVE = 0.6;                  // m/s2: under this the small thrusters do it, and the attitude stays level
// the tyres at rest: a spring and a damper to their spot, as stiff as the legs' own (GEAR_K, GEAR_C), as far as
// the runway's side grip, eight tenths of the load
const double K_TYRE = 2.0e6, C_TYRE = 3.0e5, MU_TYRE = 0.8;

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
// the stars (ECI), fed forward to the rates.
void vectored(State& s, const Local& L, V3 fs, V3 nose, V3 up, V3 spin, double tilt, double* throttle) {
    const double mass = M_DRY + s.prop;
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

// ---- the approach path: the deck's ILS --------------------------------------------------------------

// The path to pad k, as a function of s, the floor's arc still to go: at H_GLIDE, following the floor's curve,
// out to the final's start sK; then down a smooth step to the hover's height over the pad. Across, to the
// craft's side of the spokes' plane until past the last spoke spinward of the sector, then onto the
// centreline before the final. The speed along it: the bleed at `as` down to vK at sK, then the final's
// deceleration aF, the last metres in proportion.
struct Path { double h, dh, ddh, c, dc, ddc, v, dv; };

double smooth(double x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
double smoothD(double x) { return x <= 0 || x >= 1 ? 0 : 6 * x * (1 - x); }
double smoothDD(double x) { return x <= 0 || x >= 1 ? 0 : 6 - 12 * x; }
// The course across: a step smoother still, its second derivative nought at both ends, so the turn onto the
// centreline asks for no sudden sideways push at either end.
double smoother(double x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10); }
double smootherD(double x) { return x <= 0 || x >= 1 ? 0 : 30 * x * x * (x - 1) * (x - 1); }
double smootherDD(double x) { return x <= 0 || x >= 1 ? 0 : 60 * x * (x - 1) * (2 * x - 1); }

// The final for pad k, set once the pad is chosen: it starts as far out as the clearance over the sector's
// end lets it (the path at least CLEAR_M up where it crosses the end), and no further than FINAL_MAX_M; its
// speed at the top is what keeps the bend's pull on the vertical to CURVE_ACC; its deceleration takes that
// to nothing at the pad. The course leaves the craft's side SPOKE_CLEAR_M past the first spoke spinward of
// the sector and is on the centreline 100 m before the final.
void setPad(DeckState& k, int pad) {
    const double need = (CLEAR_M - H_HOVER) / (H_GLIDE - H_HOVER);
    double lo = 0.5, hi = 1.0;   // smooth is monotonic: bisect for the x at which it reaches need
    for (int i = 0; i < 40; ++i) { const double m = (lo + hi) / 2; (smooth(m) < need ? lo : hi) = m; }
    const double sE = R * (A0 + BETA - padAngle(pad));   // the sector's spinward end, before the pad
    k.pad = pad;
    k.sK = std::fmin(sE / hi, FINAL_MAX_M);
    const double bend = 6 * (H_GLIDE - H_HOVER) / (k.sK * k.sK);   // the path's sharpest bend, at its top
    k.vK = std::fmin(FINAL_V_MAX, std::sqrt(CURVE_ACC / bend));
    k.aF = k.vK * k.vK / (2 * k.sK);
    const double spoke = std::ceil((A0 + BETA) / SPOKE_STEP) * SPOKE_STEP;
    k.sL0 = k.sK + 100;
    k.sL1 = std::fmax(R * (spoke - padAngle(pad)) - SPOKE_CLEAR_M, k.sL0 + 200);
    if (!(k.as > 0)) k.as = A_BLEED;
}

Path pathAt(const DeckState& k, double s) {
    Path p{};
    if (s >= k.sK) p.h = H_GLIDE;
    else if (s <= 0) p.h = H_HOVER;
    else {
        const double x = s / k.sK, span = H_GLIDE - H_HOVER;
        p.h = H_HOVER + span * smooth(x);
        p.dh = span * smoothD(x) / k.sK;
        p.ddh = span * smoothDD(x) / (k.sK * k.sK);
    }
    const double L0 = k.sL0, L1 = k.sL1;
    const double x = (s - L0) / (L1 - L0), side = k.side * SIDE_M;
    p.c = side * smoother(x);
    p.dc = side * smootherD(x) / (L1 - L0);
    p.ddc = side * smootherDD(x) / ((L1 - L0) * (L1 - L0));
    if (s >= k.sK) {
        p.v = std::sqrt(k.vK * k.vK + 2 * k.as * (s - k.sK));
        p.dv = k.as / p.v;
    } else if (s > 0) {
        const double v1 = std::sqrt(2 * k.aF * s), v2 = K_FINAL * s;
        if (v1 < v2) { p.v = v1; p.dv = k.aF / v1; } else { p.v = v2; p.dv = K_FINAL; }
    }
    return p;
}

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

// The glide's window: the arc before the pad at which the bleed, started from the deck's own speed, fits
// between A_BLEED_MIN and A_BLEED_MAX.
double windowAt(const DeckState& k, double a) { return k.sK + (W * W * R * R - k.vK * k.vK) / (2 * a); }

// ---- the crew's laws, by phase ---------------------------------------------------------------------

// The glide: the speed along the path set by the distance still to go, the height and the course held to
// the path's, each through its own loop, the turning frame's pulls worked out in forceFor.
void glide(State& s, const Local& L, const Frame& f, const Over& o, V3 tide, double* throttle) {
    DeckState& k = s.deck;
    const double sp = arcTo(o, padAngle(k.pad));
    const Path p = pathAt(k, sp);
    const double sdd = p.v * p.dv + K_GV * (-p.v - o.sd);
    const double hdd = p.ddh * o.sd * o.sd + p.dh * sdd - K_GP * (o.h - p.h) - K_GD * (o.hd - p.dh * o.sd);
    const double cdd = p.ddc * o.sd * o.sd + p.dc * sdd - K_GP * (o.c - p.c) - K_GD * (o.cd - p.dc * o.sd);
    vectored(s, L, forceFor(o, f, sdd, hdd, cdd, tide), noseOver(o, f, 0), fromRing(f, o.out * -1.0), f.y * o.psid, 45 * D2R, throttle);
}

// Over the pad: to its centre at the height asked, or down at the rate asked when sink >= 0.
void hover(State& s, const Local& L, const Frame& f, const Over& o, V3 tide, double height, double sink, double* throttle) {
    DeckState& k = s.deck;
    const double sp = arcTo(o, padAngle(k.pad));
    const double ws = -clampd(K_HP_H * sp, -V_HOVER_MAX, V_HOVER_MAX), wc = -clampd(K_HP_H * o.c, -V_HOVER_MAX, V_HOVER_MAX);
    const double wh = sink >= 0 ? -sink : -clampd(K_HP * (o.h - height), -V_HOVER_MAX, V_HOVER_MAX);
    const double sdd = clampd(K_HV_H * (ws * R / std::fmax(o.rho, 1.0) - o.sd), -A_HOVER_H, A_HOVER_H);
    const double hdd = clampd(K_HV * (wh - o.hd), -4, 4), cdd = clampd(K_HV_H * (wc - o.cd), -A_HOVER_H, A_HOVER_H);
    vectored(s, L, forceFor(o, f, sdd, hdd, cdd, tide), noseOver(o, f, 0), fromRing(f, o.out * -1.0), f.y * o.psid, 25 * D2R, throttle);
}

double descentRate(double h) { return clampd(K_DESCENT * (h - H_CONTACT) + V_TOUCH, V_TOUCH, V_DESCENT_MAX); }

// Where to wait for the glide: H_GLIDE over the floor and SIDE_M to the craft's side of the centreline, at
// rest among the stars, at the angle about the axis the pad will have turned to, its glide's window
// opening, WAIT_MARGIN_S after the craft is expected there. dist: the way still to go.
V3 waitPoint(const DeckState& k, double t, double dist, double speed) {
    const double go = dist / V_DEPART + V_DEPART / (2 * A_DEPART) + 2 / K_DEPART - speed / (2 * A_DEPART) + WAIT_MARGIN_S;
    const Frame g = frameAt(t + std::fmax(go, 0.0));
    const double a = padAngle(k.pad) + windowAt(k, A_BLEED_MAX) / R;
    return (g.x * std::sin(a) + g.z * std::cos(a)) * (R - H_GLIDE) + g.y * (k.side * SIDE_M);
}

void beginDepart(State& s, const Over& o) {
    DeckState& k = s.deck;
    k.phase = OC_DECK_PH_DEPART;
    k.side = o.c < 0 ? -1 : 1;
    setPad(k, nearestPad(o));
    k.as = A_BLEED;
    k.holdAt = waitPoint(k, timeOf(s), std::hypot(R - H_GLIDE - o.rho, k.side * SIDE_M - o.c), 0);
}

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

}   // namespace

// ---- the hooks ------------------------------------------------------------------------------------------

void deckReset(State& s) {
    s.deck = DeckState{};
    s.deck.pad = -1;
    s.deck.autoBefore = OC_AUTO_CREW;   // oc_reset starts every flight with the crew
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
    if (s.dock.held == 1) no = OC_DECK_NO_DOCKED;
    else if (s.crashed) no = OC_DECK_NO_CRASHED;
    else if (k.onDeck) no = OC_DECK_NO_LANDED;
    else if (!ring.valid || (!within && orbitOf(s).peri < 150000)) no = OC_DECK_NO_LOW;
    else if (range > OC_DOCK_ENGAGE_M) no = OC_DECK_NO_FAR;
    else if (!within && norm(s.v - ringVel(t) - cross(ring.normal * ring.rate, s.r - ringPos(t))) > OC_DOCK_ENGAGE_SPEED) no = OC_DECK_NO_FAST;
    else if (s.prop < OC_DECK_PROP_MIN) no = OC_DECK_NO_PROP;
    k.refused = no;
    if (no) { s.autoMode = k.autoBefore; return; }   // refused: whoever was flying still is
    k.prop0 = s.prop;
    k.still = 0;
    const Frame f = frameAt(t);
    const Over o = overOf(s.r, s.v, f);
    const double off = std::fabs(wrap(o.th - A0));
    if (off < BETA && std::fabs(o.c) < W2 - 30 && o.h > 0 && o.h < CLEAR_M - 10) {   // over the deck already: to the nearest pad
        setPad(k, nearestPad(o));
        k.side = o.c < 0 ? -1 : 1;
        k.phase = OC_DECK_PH_HOVER;
        return;
    }
    const bool inside = std::fabs(o.c) < W2 - 40 && std::fabs(o.c) > SIDE_M * 0.9 && o.rho > OC_HUB_RADIUS_M + 60 && o.rho < R - H_GLIDE + 20;
    const bool offEnd = std::fabs(o.c) > W2 + 40 && std::fabs(o.c) < 1500 && o.rho < 1500;
    if (inside || offEnd) beginDepart(s, o);   // out into the Ring from where it is
    else k.phase = OC_DECK_PH_TRANSFER;        // to the hold point first, round the Ring if it must
}

void deckCrew(State& s, const Local& L, double* throttle) {
    DeckState& k = s.deck;
    *throttle = 0;
    s.brake = 0;
    s.steer = 0;
    const double t = timeOf(s);
    const Frame f = frameAt(t);
    const Over o = overOf(s.r, s.v, f);
    const V3 tide = pull(s.r) - pull(f.c);
    if (k.phase == OC_DECK_PH_TRANSFER) {   // the approach's law, by a way that is clear of the Ring
        const V3 hold = holdPoint(t);
        const V3 dr = s.r - dockSafeAim(s, hold), dv = s.v - f.vc;
        const double d = norm(dr);
        const double speed = std::fmin(40.0, std::fmin(std::sqrt(2 * 0.25 * d), 0.1 * d));
        const V3 want = d > 1e-3 ? dr * (-speed / d) : V3{0, 0, 0};
        const V3 body = irot(s.q, (want - dv) * 0.5);
        s.rcs = {clampd(body.x, -RCS_ACC, RCS_ACC), clampd(body.y, -RCS_ACC, RCS_ACC), clampd(body.z, -RCS_ACC, RCS_ACC)};
        rateLoop(s, L, point(s, L, f.c - s.r, 1.0, 0.15));
        if (norm(s.r - hold) < 30 && norm(dv) < 1.0) beginDepart(s, o);
        return;
    }
    if (k.phase == OC_DECK_PH_DEPART || k.phase == OC_DECK_PH_WAIT) {
        const V3 rr = s.r - f.c, vr = s.v - f.vc;
        if (k.phase == OC_DECK_PH_DEPART && std::hypot(dot(rr, f.x), dot(rr, f.z)) < 1500)   // near the axis every way out is as long: aim afresh
            k.holdAt = waitPoint(k, t, norm(rr - k.holdAt), norm(vr));
        const V3 dr = rr - k.holdAt;
        const double d = norm(dr);
        const V3 outAt = unit(k.holdAt - f.y * dot(k.holdAt, f.y));
        V3 acc;
        if (k.phase == OC_DECK_PH_DEPART) {
            const double speed = std::fmin(V_DEPART, std::fmin(std::sqrt(2 * A_DEPART * d), K_DEPART * d));
            const V3 want = d > 1e-6 ? dr * (-speed / d) : V3{0, 0, 0};
            acc = (want - vr) * 0.6;
            if (norm(acc) > 2.0) acc = unit(acc) * 2.0;
            if (d < 30 && norm(vr) < 1.0) k.phase = OC_DECK_PH_WAIT;
        } else {
            acc = dr * -0.02 - vr * 0.3;
        }
        // the glide's window: the pad far enough ahead that the bleed fits, and the craft near its point
        const double sp = arcTo(o, padAngle(k.pad));
        if (d < 80 && norm(vr) < 2.0 && sp >= windowAt(k, A_BLEED_MAX) && sp <= windowAt(k, A_BLEED_MIN)) {
            k.phase = OC_DECK_PH_GLIDE;
            k.as = (o.sd * o.sd - k.vK * k.vK) / (2 * (sp - k.sK));
            s.gear = 1;
            glide(s, L, f, o, tide, throttle);
            return;
        }
        vectored(s, L, acc - tide, cross(f.y, outAt), outAt * -1.0, {0, 0, 0}, PI, throttle);
        return;
    }
    s.gear = 1;
    if (k.phase == OC_DECK_PH_GLIDE) {
        if (arcTo(o, padAngle(k.pad)) < 8) k.phase = OC_DECK_PH_HOVER;
        else { glide(s, L, f, o, tide, throttle); return; }
    }
    if (k.phase == OC_DECK_PH_HOVER) {
        const double sp = arcTo(o, padAngle(k.pad));
        if (std::hypot(std::hypot(sp, o.c), o.h - H_HOVER) < 1.0 && norm(o.u) < 0.2) ++k.calm;
        else k.calm = 0;
        if (k.calm >= 100) { k.phase = OC_DECK_PH_DESCEND; k.calm = 0; }   // two seconds settled: down
        hover(s, L, f, o, tide, H_HOVER, -1, throttle);
        return;
    }
    if (k.phase == OC_DECK_PH_DESCEND && !k.onDeck) {
        hover(s, L, f, o, tide, 0, descentRate(o.h), throttle);
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
    const Over o = overOf(s.r, s.v, f);
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
        if (k.pad < 0) { setPad(k, nearestPad(o)); k.side = o.c < 0 ? -1 : 1; }
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

// After each step, whoever flies: the hard points against the deck, swept along the step; the gear's touch,
// and the touchdown's verdict; the craft at rest on the deck.
void deckAfterStep(State& s) {
    DeckState& k = s.deck;
    if (s.autoMode != OC_AUTO_DECK) {
        k.autoBefore = s.autoMode;
        if (k.phase != OC_DECK_PH_LANDED) k.phase = OC_DECK_PH_NONE;   // the crew let go
    }
    if (!(s.autoMode == OC_AUTO_OFF && s.sas == OC_SAS_DECK)) k.armed = 0;
    if (!ring.valid || s.crashed || s.dock.held) { k.near = 0; k.onDeck = 0; k.still = 0; k.stuck[0] = k.stuck[1] = k.stuck[2] = 0; return; }
    const double t = timeOf(s);
    const double far = norm(s.r - ringPos(t)) - std::hypot(R + 40, W2 + 30);
    if (far > 0) {   // nowhere near the floor: the frame is not needed
        k.near = 0;
        k.onDeck = 0;
        k.still = 0;
        k.stuck[0] = k.stuck[1] = k.stuck[2] = 0;
        if (k.phase == OC_DECK_PH_LANDED) k.phase = OC_DECK_PH_NONE;
        return;
    }
    const Frame f = frameAt(t);
    const Over o = overOf(s.r, s.v, f);
    k.near = o.h < 80 && o.h > -40 && std::fabs(wrap(o.th - A0)) < BETA + 0.02 && std::fabs(o.c) < W2 + 30;
    if (!k.near) { k.onDeck = 0; k.still = 0; k.stuck[0] = k.stuck[1] = k.stuck[2] = 0; if (k.phase == OC_DECK_PH_LANDED) k.phase = OC_DECK_PH_NONE; return; }
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
        const double sink = -o.hd, drift = std::hypot(o.us, o.u.y);
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
    if (k.still >= 50 && legs == 3) {   // at rest on the deck: the crew's landing is done, and the pilot has it, held on the deck
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
    if (!ring.valid) return;
    const Frame f = frameAt(timeOf(s));
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
    if (k.pad < 0) return;
    // the approach path, and what the guidance would have the craft do now (the flight director)
    DeckState n = k;
    if (!(n.as > 0)) n.as = A_BLEED;
    const Path p = pathAt(n, sp);
    out[OC_DECK_LOC_M] = o.c - p.c;
    out[OC_DECK_GS_M] = o.h - p.h;
    const double scale = std::fmax(o.rho, 1.0) / R;   // the floor's arc to the craft's own
    double fa = -p.v * scale, fc = p.dc * o.sd - K_GP / K_GD * (o.c - p.c), fv = p.dh * o.sd - K_GP / K_GD * (o.h - p.h);
    if (k.phase == OC_DECK_PH_HOVER || k.phase == OC_DECK_PH_DESCEND || (k.phase != OC_DECK_PH_GLIDE && std::fabs(sp) < 30 && o.h < 60)) {
        fa = -clampd(K_HP_H * sp, -V_HOVER_MAX, V_HOVER_MAX) * scale;
        fc = -clampd(K_HP_H * o.c, -V_HOVER_MAX, V_HOVER_MAX);
        fv = k.phase == OC_DECK_PH_DESCEND || k.onDeck ? -descentRate(o.h) : -clampd(K_HP * (o.h - H_HOVER), -V_HOVER_MAX, V_HOVER_MAX);
    } else if (k.phase == OC_DECK_PH_DEPART || k.phase == OC_DECK_PH_WAIT || k.phase == OC_DECK_PH_TRANSFER) {
        fa = -W * o.rho;   // at rest among the stars: the deck sweeping by
        fc = 0;
        fv = 0;
    }
    out[OC_DECK_FD_ALONG] = fa;
    out[OC_DECK_FD_ACROSS] = fc;
    out[OC_DECK_FD_VERTICAL] = fv;
}

void deckHash(const State& s, unsigned& h) {
    const DeckState& k = s.deck;
    const double v[] = {s.nozzle, s.nozzleCmd, (double)k.phase, (double)k.pad, (double)k.refused, (double)k.autoBefore, (double)k.near,
                        (double)k.onDeck, (double)k.still, (double)k.calm, (double)k.side, k.holdAt.x, k.holdAt.y, k.holdAt.z, k.as, k.sK, k.vK, k.aF, k.sL0, k.sL1,
                        k.prop0, (double)k.holding, (double)k.holdingC, k.holdPos.x, k.holdPos.y, k.holdPos.z, (double)k.holdingH, k.holdH, k.setS, k.setC, k.cmdS, k.cmdC,
                        k.setH, k.heading, (double)k.armed, (double)k.verdict, (double)k.tdPad, k.tdT, k.tdSink, k.tdDrift, k.tdOff, k.tdTilt,
                        (double)k.stuck[0], (double)k.stuck[1], (double)k.stuck[2], k.anchor[0].x, k.anchor[0].y, k.anchor[0].z,
                        k.anchor[1].x, k.anchor[1].y, k.anchor[1].z, k.anchor[2].x, k.anchor[2].y, k.anchor[2].z};
    hashDoubles(h, v, sizeof v / sizeof v[0]);
}

}   // namespace oc

extern "C" {

const double* oc_deck_out(void) { return oc::out; }
int oc_deck_out_len(void) { return OC_DECK_COUNT; }

}   // extern "C"
