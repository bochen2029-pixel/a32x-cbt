// return.cpp — the flight home (orbit_return.h): from orbit to a stop on the runway the craft left.
//
// The crew commands only what a pilot can: body rates through the rate loop, the throttle, the small
// thrusters, the gear, the brakes and the nose wheel. Nothing here writes where the craft is or how it
// moves; if the guidance cannot solve the flight, the craft does not arrive.
//
// How it flies, phase by phase:
//   wait      The orbit's plane stands still while the Earth turns under it, so the runway comes within
//             reach on a few passes each day. The plan shoots the whole descent forward from a trial burn
//             time, with the entry's own law, and moves the burn until the shot ends at the gate; it takes
//             the first pass whose cross-range is inside what the craft can fly, and is made again while
//             the craft waits.
//   burn      Tail first, until the orbit's lowest point is at PERI_TARGET: cut on the orbit flown, not
//             on a clock.
//   entry     Nose 40 degrees above the air's velocity, easing below Mach 5 so that the lift coefficient
//             stays what it was. The bank's size sets the range: a predictor flies the rest of the entry
//             every two seconds with the core's own air and lift, and a corrector moves the bank until
//             the predicted end is at the gate (a numerical predictor-corrector, after Lu). The bank's
//             side sets the cross-range: it reverses when the runway's bearing drifts too far to the
//             other side. A feedback on the sink rate keeps the glide from skipping, and the bank is held
//             inside what the heat, the load and the dynamic pressure allow in an equilibrium glide.
//   terminal  Below V_GATE the craft is a glider with a drive it has not lit. It flies to a circle that
//             touches the extended centreline, round it, and onto the final; the angle of attack is the
//             one whose drag spends the energy left in the path left.
//   approach  Under power, as an airliner flies it: level until the glide path comes down, then 3 degrees
//             to the runway, the speed held by the throttle, the gear down.
//   flare     The sink rate taken off in the last metres, the wheels on, the nose lowered, the brakes.
//
// Every number marked chosen is this sketch's; docs/provenance.md, 1h, names the methods. GPLv3.

#include "internal.h"

#include <cmath>
#include <cstring>

namespace oc {

namespace {

double out[OC_RET_COUNT];

// ---- the numbers (chosen) -----------------------------------------------------------------------

const double SUTTON_GRAVES = 1.7415e-4;   // W/m2 per sqrt(kg/m3 / m) (m/s)^3: Sutton and Graves, for the Earth's air
const double NOSE_RADIUS = 1.0;           // m: the radius of the nose the heat is reckoned for
const double EMISSIVITY = 0.85;           // of the hot surface
const double STEFAN = 5.670374e-8;        // W/m2/K4

// The guidance flies inside margins of the limits, so that what it cannot foresee still fits.
const double HEAT_SOFT = 0.85 * OC_RET_HEAT_LIMIT;
const double LOAD_SOFT = 2.0;             // g
const double QBAR_SOFT = 0.8 * OC_RET_QBAR_LIMIT;

const double PERI_TARGET = 60000.0;       // m: where the burn leaves the orbit's lowest point
const double BURN_THROTTLE = 0.3;
const double BURN_LEAD = 150.0;           // s: tail first this long before the burn
const double CROSS_MAX = 1200000.0;       // m: the furthest off the orbit's plane a pass may put the runway
const double BANK_PLAN = 55 * D2R;        // the bank the plan is made for: the middle of the range it buys
const double BANK_LATE = 72 * D2R;        // and the most it may plan for, to take a pass just missed
const double LATE_MAX = 500.0;            // s: how far past its best burn time a pass may still be taken
const double V_TOP = 7400.0;              // m/s: the bank profile's top; faster than this it is bank0

const double ALPHA_ENTRY = 40 * D2R;
const double BANK_END = 45 * D2R;         // the profile's bank at the gate
const double BANK_LO = 5 * D2R, BANK_HI = 80 * D2R;   // what the corrector may ask for
const double BANK_MAX = 85 * D2R;         // and what the damping may add to
const double BANK_RATE = 0.2;             // rad/s: how fast the craft rolls about its velocity
const double DAMPING = 0.7;               // of the glide's rise and fall
const double V_GATE = 800.0;              // m/s through the air: the entry ends, the terminal glide begins
const double S_GATE = 200000.0;           // m of path left to the threshold at the gate

const double HAC_R = 5000.0;              // m: the radius of the turn onto final
const double FINAL_M = 14000.0;           // m: where the turn meets the centreline, before the threshold
const double GLIDE_SLOPE = 3 * D2R;
const double CROSSING_M = 15.0;           // m: the wheels' height on the glide path over the threshold
const double V_PATTERN = 125.0;           // m/s: level, round the turn
const double V_APPROACH = 104.0;          // m/s at 33 t: on the glide path, scaled with the root of the mass
const double ALPHA_GLIDE_MAX = 30 * D2R;  // the steepest glide the terminal area asks for
const double FLARE_M = 12.0;              // m: wheels this high, the flare begins
const double SINK_TOUCH = 0.5;            // m/s: the sink rate the flare ends at
const double DEPART_NEAR = 9000.0;        // m: nearer the ring than this, back away first
const double DEPART_CLEAR = 12000.0;      // m: and this far is clear
const double DEPART_SPEED = 20.0;         // m/s

// ---- the field: the runway's own frame, and what is worked out once ------------------------------

const int TAB_N = 121;                    // Mach 0 to 6, every 0.05
struct Field {
    double sinH, cosH;                    // the runway's heading
    double clEntry;                       // the lift coefficient the entry holds
    double alphaTab[TAB_N];               // the entry's angle of attack, by Mach
} field;

V3 toEarth(V3 x, double t) {     // an ECI vector in the Earth's own axes
    const double th = WE * t, c = std::cos(th), s = std::sin(th);
    return {c * x.x + s * x.y, -s * x.x + c * x.y, x.z};
}
V3 fromEarth(V3 x, double t) {
    const double th = WE * t, c = std::cos(th), s = std::sin(th);
    return {c * x.x - s * x.y, s * x.x + c * x.y, x.z};
}

// The runway's plane: x along the landing from the threshold, y to its right; a point of the Earth is
// put at its distance over the ground and its bearing from the threshold, so the plane is true near
// the field and still tells near from far, left from right, a quarter of the world away.
struct XY { double x, y; };

XY fieldPlane(V3 earth) {
    const V3 p = unit(earth);
    const double e = dot(p, site.e), n = dot(p, site.n), hn = std::hypot(e, n);
    if (hn < 1e-12) return {0, 0};
    const double d = RE * std::atan2(hn, dot(p, site.u));
    const double pe = d * e / hn, pn = d * n / hn;
    return {pe * field.sinH + pn * field.cosH, pe * field.cosH - pn * field.sinH};
}

V3 fieldPoint(XY p) {   // and back: the point of the sphere
    const double pe = p.x * field.sinH + p.y * field.cosH, pn = p.x * field.cosH - p.y * field.sinH;
    const double d = std::hypot(pe, pn);
    if (d < 1e-9) return site.p0;
    const V3 dir = (site.e * pe + site.n * pn) * (1.0 / d);
    return (site.u * std::cos(d / RE) + dir * std::sin(d / RE)) * RE;
}

// The way to the runway: straight to a circle that touches the extended centreline FINAL_M before the
// threshold, round it, and down the final. side +1 puts the circle to the right of the landing (the
// turn onto final is to the right), -1 to the left.
struct Path {
    double togo;       // m of path to the threshold
    XY tangent;        // where the straight meets the circle
    double arc;        // rad of circle still to fly
    double dist;       // m from the circle's centre
    double theta;      // where round the circle the craft is, or will join it (the circle on the right)
};

Path circlePath(XY p, int side) {
    const double dx = p.x + FINAL_M, dy = p.y * side - HAC_R, d = std::hypot(dx, dy);
    double theta = std::atan2(dy, dx), straight = 0;
    if (d > HAC_R) {
        theta += std::acos(HAC_R / d);
        straight = std::sqrt(d * d - HAC_R * HAC_R);
    }
    double arc = std::fmod(-PI / 2 - theta, 2 * PI);
    if (arc < 0) arc += 2 * PI;
    return {straight + HAC_R * arc + FINAL_M, {-FINAL_M + HAC_R * std::cos(theta), (HAC_R + HAC_R * std::sin(theta)) * side}, arc, d, theta};
}

// ---- the craft's lift, turned round ---------------------------------------------------------------

// The angle of attack between lo and hi that gives this lift coefficient (lift rising with it there).
double alphaForLift(double want, double mach, double lo, double hi) {
    double cl, cd;
    liftDrag(hi, mach, &cl, &cd);
    if (cl <= want) return hi;
    liftDrag(lo, mach, &cl, &cd);
    if (cl >= want) return lo;
    for (int i = 0; i < 24; ++i) {
        const double mid = 0.5 * (lo + hi);
        liftDrag(mid, mach, &cl, &cd);
        if (cl < want) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
}

double dragOverLift(double alpha, double mach) {
    double cl, cd;
    liftDrag(alpha, mach, &cl, &cd);
    return cd / std::fmax(cl, 1e-6);
}

// The angle of attack of the flattest glide.
double alphaBest(double mach) {
    double lo = 2 * D2R, hi = 20 * D2R;
    for (int i = 0; i < 18; ++i) {
        const double a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
        if (dragOverLift(a, mach) < dragOverLift(b, mach)) hi = b; else lo = a;
    }
    return 0.5 * (lo + hi);
}

// The angle of attack, steeper than the flattest glide's, whose drag is this much of its lift.
double alphaForDrag(double want, double mach, double lo, double hi) {
    if (dragOverLift(lo, mach) >= want) return lo;
    if (dragOverLift(hi, mach) <= want) return hi;
    for (int i = 0; i < 24; ++i) {
        const double mid = 0.5 * (lo + hi);
        if (dragOverLift(mid, mach) < want) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
}

// The entry's angle of attack: 40 degrees at Mach 5 and faster; slower, the angle that keeps the lift
// coefficient what it was there, so the glide neither balloons nor drops as the lift's law changes.
double entryAlpha(double mach) {
    const double x = mach / 0.05;
    if (x >= TAB_N - 1) return ALPHA_ENTRY;
    if (x <= 0) return field.alphaTab[0];
    const int i = (int)x;
    return field.alphaTab[i] + (field.alphaTab[i + 1] - field.alphaTab[i]) * (x - i);
}

// ---- a point mass, for looking ahead --------------------------------------------------------------
// The predictor's craft: the plant's own gravity, air and lift (atmosphere and liftDrag are the core's),
// with the attitude taken as flown: the angle of attack the law asks for, the bank it asks for at the
// rate the craft rolls. It is only ever shot forward.

struct Pt { V3 r, v; double t; };

V3 gravity(V3 r) {
    const double rm = norm(r);
    return r * (-MU / (rm * rm * rm));
}

void coastStep(Pt& p, double h) {   // gravity alone: RK4
    const V3 k1v = gravity(p.r), k1r = p.v;
    const V3 k2v = gravity(p.r + k1r * (h / 2)), k2r = p.v + k1v * (h / 2);
    const V3 k3v = gravity(p.r + k2r * (h / 2)), k3r = p.v + k2v * (h / 2);
    const V3 k4v = gravity(p.r + k3r * h), k4r = p.v + k3v * h;
    p.r = p.r + (k1r + k2r * 2 + k3r * 2 + k4r) * (h / 6);
    p.v = p.v + (k1v + k2v * 2 + k3v * 2 + k4v) * (h / 6);
    p.t += h;
}

void coastTo(Pt& p, double t) {
    while (t - p.t > 10.0) coastStep(p, 10.0);
    if (t > p.t) coastStep(p, t - p.t);
}

// Across the wind: straight up as nearly as the wind allows, and to the right of it.
void windAxes(V3 up, V3 vhat, V3 fallback, V3* lift0, V3* right) {
    V3 l = up - vhat * dot(up, vhat);
    if (norm(l) < 1e-6) l = fallback - vhat * dot(fallback, vhat);   // flying straight up or down
    *lift0 = unit(l);
    *right = cross(vhat, *lift0);
}

// The air's push on the craft, per unit of mass: drag along the wind, lift across it, banked by bank
// about the wind. The plant's forces, with no sideslip.
V3 airAccel(V3 r, V3 v, double mass, double alpha, double bank) {
    const double rm = norm(r);
    const V3 vAir = v - cross(V3{0, 0, WE}, r);
    const double tas = norm(vAir);
    if (tas < 0.5) return {0, 0, 0};
    const Air air = atmosphere(rm - RE);
    double cl, cd;
    liftDrag(alpha, tas / air.sound, &cl, &cd);
    const V3 vhat = vAir * (1.0 / tas);
    V3 l0, right;
    windAxes(r * (1.0 / rm), vhat, V3{0, 0, 1}, &l0, &right);
    const V3 lift = l0 * std::cos(bank) + right * std::sin(bank);
    return (vhat * (-cd) + lift * cl) * (0.5 * air.rho * tas * tas * S_REF / mass);
}

// The same on the entry's schedule: the angle of attack by Mach, plus what the law has eased it by.
V3 entryAccel(V3 r, V3 v, double mass, double ease, double bank) {
    const V3 vAir = v - cross(V3{0, 0, WE}, r);
    const Air air = atmosphere(norm(r) - RE);
    return gravity(r) + airAccel(r, v, mass, entryAlpha(norm(vAir) / air.sound) + ease, bank);
}

void entryStep(Pt& p, double mass, double ease, double bank, double h) {   // RK4
    const V3 k1v = entryAccel(p.r, p.v, mass, ease, bank), k1r = p.v;
    const V3 k2r = p.v + k1v * (h / 2), k2v = entryAccel(p.r + k1r * (h / 2), k2r, mass, ease, bank);
    const V3 k3r = p.v + k2v * (h / 2), k3v = entryAccel(p.r + k2r * (h / 2), k3r, mass, ease, bank);
    const V3 k4r = p.v + k3v * h, k4v = entryAccel(p.r + k3r * h, k4r, mass, ease, bank);
    p.r = p.r + (k1r + k2r * 2 + k3r * 2 + k4r) * (h / 6);
    p.v = p.v + (k1v + k2v * 2 + k3v * 2 + k4v) * (h / 6);
    p.t += h;
}

// ---- the entry's law ------------------------------------------------------------------------------
// One law, for the craft each step and for the predictor each of its steps.

struct Law {
    double alpha;    // rad: the angle of attack
    double bank;     // rad: the bank's size
    double off;      // rad: the bearing of the way to the runway off the track, + to the right
    double tas, alt, heat, load;
};

// The bank's size where the profile puts it: bank0 at vRef and faster, BANK_END at the gate, straight
// in speed between.
double bankProfile(double bank0, double vRef, double tas) {
    const double f = clampd((tas - V_GATE) / std::fmax(100.0, vRef - V_GATE), 0, 1);
    return BANK_END + (bank0 - BANK_END) * f;
}

double deadband(double tas) {   // how far the runway's bearing may drift before the bank changes side
    return (8 + 4 * clampd((tas - 2000) / 4000, 0, 1)) * D2R;
}

Law entryLaw(V3 r, V3 v, double t, double mass, double bank0, double vRef, int side) {
    Law g;
    const double rm = norm(r);
    const V3 up = r * (1.0 / rm);
    const V3 vAir = v - cross(V3{0, 0, WE}, r);
    const double tas = norm(vAir);
    const Air air = atmosphere(rm - RE);
    const double mach = tas / air.sound, qbar = 0.5 * air.rho * tas * tas;
    g.tas = tas;
    g.alt = rm - RE;
    g.heat = SUTTON_GRAVES * std::sqrt(air.rho / NOSE_RADIUS) * tas * tas * tas;

    // The angle of attack: the schedule's, eased when the air's push would pass the load's margin.
    double alpha = entryAlpha(mach), cl, cd;
    liftDrag(alpha, mach, &cl, &cd);
    const double push = qbar * S_REF / (mass * G0);
    if (push * std::hypot(cl, cd) > LOAD_SOFT) {
        double lo = 4 * D2R, hi = alpha;
        for (int i = 0; i < 20; ++i) {
            const double mid = 0.5 * (lo + hi);
            liftDrag(mid, mach, &cl, &cd);
            if (push * std::hypot(cl, cd) > LOAD_SOFT) hi = mid; else lo = mid;
        }
        alpha = lo;
        liftDrag(alpha, mach, &cl, &cd);
    }
    g.alpha = alpha;
    g.load = push * std::hypot(cl, cd);

    // The equilibrium glide: the lift's upward part carries the weight, less what the speed round the
    // Earth already carries. The density that does it rises as the craft slows; how fast it rises is the
    // sink rate a steady glide has.
    const double hdot = dot(v, up);
    const double vh = norm(v - up * hdot);
    const double weigh = std::fmax(0.3, MU / (rm * rm) - vh * vh / rm);
    const double cb = std::cos(bankProfile(bank0, vRef, tas));
    const double dV = 20.0, tas2 = tas - dV, mach2 = tas2 / air.sound;
    double cl2, cd2;
    liftDrag(entryAlpha(mach2), mach2, &cl2, &cd2);
    const double weigh2 = std::fmax(0.3, MU / (rm * rm) - (vh - dV) * (vh - dV) / rm);
    const double cb2 = std::cos(bankProfile(bank0, vRef, tas2));
    const double dLnRho = (std::log(weigh / weigh2) - 2 * std::log(tas / tas2) - std::log(cl / cl2) - std::log(cb / cb2)) / dV;
    const double scale = 1000.0 / std::log(air.rho / atmosphere(rm - RE + 1000.0).rho);
    const double vdot = -qbar * S_REF * cd / mass - MU / (rm * rm) * hdot / std::fmax(tas, 1.0);
    const double sinkRef = clampd(-scale * dLnRho * vdot, -400.0, 0.0);

    // The bank: the profile's, less lift upward when the craft rises against the steady glide and more
    // when it sinks through it; and never so much bank that the steady glide would pass a limit.
    const double gain = 2 * DAMPING * cb / std::sqrt(weigh * scale);
    double c = cb - gain * (hdot - sinkRef);
    const double rhoHeat = NOSE_RADIUS * (HEAT_SOFT / (SUTTON_GRAVES * tas * tas * tas)) * (HEAT_SOFT / (SUTTON_GRAVES * tas * tas * tas));
    const double cHeat = 2 * mass * weigh / (tas * tas * S_REF * cl * rhoHeat);
    const double cLoad = weigh * std::hypot(1.0, cd / cl) / (LOAD_SOFT * G0);
    const double cQbar = mass * weigh / (S_REF * cl * QBAR_SOFT);
    c = std::fmax(c, std::fmin(1.0, std::fmax(cHeat, std::fmax(cLoad, cQbar))));
    g.bank = std::acos(clampd(c, std::cos(BANK_MAX), 1.0));

    // Where the way to the runway lies: the bearing of the point where the straight meets the circle.
    const Path path = circlePath(fieldPlane(toEarth(r, t)), side);
    const V3 aim = fromEarth(fieldPoint(path.tangent), t);
    const V3 ahead = unit(vAir - up * dot(vAir, up)), to = unit(aim - up * dot(aim, up));
    g.off = std::atan2(-dot(cross(ahead, to), up), dot(ahead, to));
    return g;
}

// ---- the predictor --------------------------------------------------------------------------------

struct Shot {
    int ok;              // 1: the shot reached the gate
    double miss;         // m: the path left at the gate, less S_GATE: + short, - long
    double along;        // m: the same along the gate's ground track, smooth as the runway comes abeam
    double tInterface;   // s: when it passes the entry interface, or -1
    double tGate;
    V3 rGate, vGate;     // where, ECI
    XY gate;             // and in the runway's plane
    double off;          // rad: the bearing of the way to the runway off the track there
    double heatPeak, loadPeak;
    int reversals;
};

// How far along the ground track from r, v (ECI, at time t) the runway's threshold lies, less S_GATE: +
// short of it, - past it. Through the runway coming abeam it is smooth, as the path's length is not, so
// the plan can search a burn time by it.
double alongMiss(V3 r, V3 v, double t) {
    const V3 here = unit(r), rw = unit(fromEarth(site.p0, t));
    const V3 vAir = v - cross(V3{0, 0, WE}, r);
    const V3 ahead = unit(vAir - here * dot(vAir, here));
    const V3 left = cross(here, ahead);
    const V3 foot = unit(rw - left * dot(rw, left));
    return RE * std::atan2(dot(cross(here, foot), left), dot(here, foot)) - S_GATE;
}

// Whether the bank changes side: when the way to the runway has drifted past the deadband to the other
// side, and only while it lies ahead (a runway behind is a miss the bank cannot mend by turning back).
bool reverse(int bankSide, double off, double tas) {
    return std::fabs(off) < PI / 2 && bankSide * off < -deadband(tas);
}

// Fly the rest of the entry from p: gravity alone above the air, then the entry's law, to the gate.
// side is which way the bank lies (0: not chosen yet), bank what it is now.
Shot shoot(Pt p, double mass, double bank0, double vRef, int bankSide, double bank, int side) {
    Shot o{};
    o.tInterface = -1;
    const double t0 = p.t;
    bool below = norm(p.r) - RE < OC_RET_INTERFACE_M;
    if (below) o.tInterface = p.t;
    Law g{};
    for (int i = 0; i < 8000; ++i) {
        const double alt = norm(p.r) - RE;
        if (alt > 135000.0) {   // above the air: nothing to steer by, a long step
            if (below && alt > 160000.0) break;   // skipped back out
            if (p.t - t0 > 9000.0) break;
            coastStep(p, 8.0);
            continue;
        }
        const double h = alt > 100000.0 ? 4.0 : 2.0;
        g = entryLaw(p.r, p.v, p.t, mass, bank0, vRef, side);
        if (!below && alt < OC_RET_INTERFACE_M) { below = true; o.tInterface = p.t; }
        if (bankSide == 0) bankSide = g.off >= 0 ? 1 : -1;
        else if (below && reverse(bankSide, g.off, g.tas)) { bankSide = -bankSide; ++o.reversals; }
        bank += clampd(bankSide * g.bank - bank, -BANK_RATE * h, BANK_RATE * h);
        if (g.heat > o.heatPeak) o.heatPeak = g.heat;
        if (g.load > o.loadPeak) o.loadPeak = g.load;
        if ((g.tas <= V_GATE && alt < 90000.0) || alt < 12000.0) { o.ok = g.tas <= V_GATE; break; }
        if (p.t - t0 > 9000.0) break;
        const V3 vAir = p.v - cross(V3{0, 0, WE}, p.r);
        entryStep(p, mass, g.alpha - entryAlpha(norm(vAir) / atmosphere(alt).sound), bank, h);
    }
    o.tGate = p.t;
    o.rGate = p.r;
    o.vGate = p.v;
    o.gate = fieldPlane(toEarth(p.r, p.t));
    o.off = g.off;
    const Path path = circlePath(o.gate, side);
    const double tas = norm(p.v - cross(V3{0, 0, WE}, p.r));
    if (o.ok) o.miss = (std::fabs(g.off) > PI / 2 ? -path.dist : path.togo) - S_GATE;   // past it, the runway is behind
    else if (norm(p.r) - RE < 20000.0) o.miss = path.togo - S_GATE + 200.0 * std::fmax(0.0, tas - V_GATE);   // into the ground, short
    else o.miss = -1.0e6 - 500.0 * tas;   // never came down: far too long
    o.along = o.ok ? alongMiss(p.r, p.v, p.t) : o.miss;
    return o;
}

// ---- the plan: which pass, and when to leave the orbit --------------------------------------------

double periOf(V3 r, V3 v) {   // m above the sphere: the orbit's lowest point
    const double rm = norm(r), energy = dot(v, v) / 2 - MU / rm;
    if (energy >= 0) return 1e12;
    const V3 h = cross(r, v);
    const double a = -MU / (2 * energy), e = std::sqrt(std::fmax(0.0, 1 + 2 * energy * dot(h, h) / (MU * MU)));
    return a * (1 - e) - RE;
}

// The speed to take off, tail first, that puts the orbit's lowest point at PERI_TARGET; -1 if no burn
// here does it.
double burnFor(V3 r, V3 v) {
    const V3 back = unit(v) * -1.0;
    if (periOf(r, v) <= PERI_TARGET) return 0;
    double lo = 0, hi = 600;
    if (periOf(r, v + back * hi) > PERI_TARGET) return -1;
    for (int i = 0; i < 40; ++i) {
        const double mid = 0.5 * (lo + hi);
        if (periOf(r, v + back * mid) > PERI_TARGET) lo = mid; else hi = mid;
    }
    return hi;
}

struct Trial { Shot shot; double tb, dv, bank0, cross; };

// The runway's distance off the craft's plane when the shot ends, + to the left.
double crossRange(V3 r, V3 v, double tGate) {
    return RE * std::asin(clampd(dot(unit(fromEarth(site.p0, tGate)), unit(cross(r, v))), -1, 1));
}

// Coast from p0 to tb, burn there tail first all at once, and shoot the entry with this bank.
Trial tryBurn(const Pt& p0, double tb, double mass, int side, double bank0) {
    Trial o{};
    o.tb = tb;
    o.bank0 = bank0;
    Pt p = p0;
    coastTo(p, tb);
    o.dv = burnFor(p.r, p.v);
    if (o.dv < 0) { o.shot.miss = o.shot.along = -1e7; return o; }
    p.v = p.v - unit(p.v) * o.dv;
    o.shot = shoot(p, mass * std::exp(-o.dv / (ISP * G0)), bank0, V_TOP, 0, 0, side);
    o.cross = crossRange(p.r, p.v, o.shot.tGate);
    return o;
}

// How far round the orbit's plane, ahead of the craft where it is at tb, the runway's foot on that plane
// lies a flight later: an angle about the plane's normal n, 0 to 2 pi. off: the runway's distance off the
// plane then, + to the left.
double footAhead(const Pt& p0, double tb, double flight, V3 n, double* off) {
    Pt p = p0;
    coastTo(p, tb);
    const V3 c = unit(p.r), rw = unit(fromEarth(site.p0, tb + flight));
    const V3 foot = unit(rw - n * dot(rw, n));
    double a = std::atan2(dot(cross(c, foot), n), dot(c, foot));
    if (a < 0) a += 2 * PI;
    *off = RE * std::asin(clampd(dot(rw, n), -1, 1));
    return a;
}

// The plan. The orbit's plane stands still among the stars while the Earth turns the runway under it, so
// the runway comes near the plane on a few passes a day, round the time it passes under the orbit's
// northernmost point (KDFW lies at almost the orbit's inclination). A trial shot from the earliest burn
// gives how far round the orbit, and how long after the burn, the entry ends; from that, pass by pass, the
// burn time that puts the entry's end abeam the runway, and how far off the plane the runway is then.
// The first pass close enough is shot properly: the burn time is moved until the shot, flown with the
// entry's own law, ends at the gate. A pass just missed is still taken when burning at once with more
// bank, a shorter entry, reaches it.
void plan(State& s) {
    ReturnState& R = s.ret;
    const double t = timeOf(s), mass = M_DRY + s.prop;
    const Pt p0{s.r, s.v, t};
    const Orbit orb = orbitOf(s);
    R.tPlan = t + 600.0;
    if (orb.a <= 0) { R.planned = 0; R.tEvent = -1; return; }
    const V3 n = unit(cross(s.r, s.v));
    const double rate = std::sqrt(MU / (orb.a * orb.a * orb.a)) - WE * n.z;   // rad/s: how fast the craft gains on the runway's foot
    const double pass = 2 * PI / rate;
    const int side = R.side ? R.side : 1;
    const double halfBurn = mass / (2 * BURN_THROTTLE * T_MAX);   // s per m/s: half the burn's length
    const double first = t + BURN_LEAD + 30.0;                    // the earliest the burn's middle can be

    auto usable = [](const Trial& a) { return a.dv >= 0 && a.shot.ok; };
    auto good = [&](const Trial& a) {
        return usable(a) && std::fabs(a.shot.along) < 20000.0 && std::fabs(a.cross) <= CROSS_MAX && std::fabs(a.shot.off) < 25 * D2R &&
               a.shot.heatPeak < OC_RET_HEAT_LIMIT && a.shot.loadPeak < OC_RET_LOAD_LIMIT;
    };
    // The burn time, with the plan's bank, that ends the shot at the gate: the miss falls as the burn is
    // later, about rate x RE metres a second. Secant steps, the slope kept sane.
    auto settleTime = [&](double tb) {
        const double tb0 = tb;
        Trial a = tryBurn(p0, tb, mass, side, BANK_PLAN);
        double tPrev = tb, mPrev = a.shot.along, slope = -rate * RE;
        for (int i = 0; i < 8 && usable(a) && std::fabs(a.shot.along) > 1000.0; ++i) {
            tb = std::fmax(first, tb - a.shot.along / slope);
            if (std::fabs(tb - tPrev) < 0.01) break;   // held at the earliest
            a = tryBurn(p0, tb, mass, side, BANK_PLAN);
            const double sl = (a.shot.along - mPrev) / (tb - tPrev);
            if (sl < -0.3 * rate * RE && sl > -3 * rate * RE) slope = sl;
            tPrev = tb;
            mPrev = a.shot.along;
        }
        if (usable(a) && std::fabs(a.shot.along) < 20000.0) return a;
        // Not settled: on an orbit far from round, where along it the burn falls changes how far the entry
        // reaches, and the step from the slope overshoots. Look along the pass, half a pass either way,
        // for the miss changing from short to long, and halve the step between.
        Trial lo{}, hi{};
        bool have = false;
        const double from = std::fmax(first, tb0 - 0.5 * pass);
        for (double t1 = from; t1 < tb0 + 0.5 * pass && !have; t1 += 150.0) {
            const Trial b = tryBurn(p0, t1, mass, side, BANK_PLAN);
            if (usable(b) && usable(lo) && lo.shot.along > 0 && b.shot.along <= 0 && lo.shot.along < 3.0e6) { hi = b; have = true; }
            else lo = b;
        }
        if (!have) return a;
        for (int i = 0; i < 12; ++i) {
            const Trial mid = tryBurn(p0, 0.5 * (lo.tb + hi.tb), mass, side, BANK_PLAN);
            if (!usable(mid)) break;
            (mid.shot.along > 0 ? lo : hi) = mid;
            if (std::fabs(mid.shot.along) < 1000.0) return mid;
        }
        return std::fabs(lo.shot.along) < std::fabs(hi.shot.along) ? lo : hi;
    };
    // At the earliest burn, the bank between the plan's and BANK_LATE that ends the shot at the gate: the
    // miss rises with the bank (more of the lift turned aside, a shorter entry). Bisection.
    auto settleBank = [&](double tb) {
        Trial lo = tryBurn(p0, tb, mass, side, BANK_PLAN), hi = tryBurn(p0, tb, mass, side, BANK_LATE);
        if (!usable(lo) || !usable(hi) || lo.shot.along > 0 || hi.shot.along < 0) return std::fabs(lo.shot.along) < std::fabs(hi.shot.along) ? lo : hi;
        for (int i = 0; i < 10; ++i) {
            const Trial mid = tryBurn(p0, tb, mass, side, 0.5 * (lo.bank0 + hi.bank0));
            if (!usable(mid)) break;
            (mid.shot.along < 0 ? lo : hi) = mid;
            if (std::fabs(mid.shot.along) < 1000.0) return mid;
        }
        return std::fabs(lo.shot.along) < std::fabs(hi.shot.along) ? lo : hi;
    };

    Trial a{};
    bool found = false;
    if (R.planned) {   // a plan in hand: the pass is taken, only its burn time moves
        a = R.bank0 > BANK_PLAN + 0.01 ? settleBank(std::fmax(first, R.tBurn + R.dv * halfBurn)) : settleTime(std::fmax(first, R.tBurn + R.dv * halfBurn));
        found = good(a);
    }
    if (!found) {
        R.passes = 0;
        const Trial ref = tryBurn(p0, first, mass, side, BANK_PLAN);
        if (!usable(ref)) { R.planned = 0; R.tEvent = -1; return; }
        const double flight = ref.shot.tGate - first;
        Pt pb = p0;
        coastTo(pb, first);
        const V3 c = unit(pb.r), gfoot = unit(ref.shot.rGate - n * dot(ref.shot.rGate, n));
        double reach = std::atan2(dot(cross(c, gfoot), n), dot(c, gfoot));
        if (reach < 0) reach += 2 * PI;
        const double target = reach + S_GATE / RE;   // the runway's foot this far ahead at the burn
        double off = 0;
        auto abeam = [&](double tb) {   // Newton on the angle, which falls at rate
            for (int i = 0; i < 4; ++i) tb += wrap(footAhead(p0, tb, flight, n, &off) - target) / rate;
            return tb;
        };
        const double from = first - LATE_MAX;
        double ahead = footAhead(p0, from, flight, n, &off) - target;
        ahead -= 2 * PI * std::floor(ahead / (2 * PI));
        double tb = abeam(from + ahead / rate);
        for (int k = 0; k < 48 && !found; ++k, tb = abeam(tb + pass)) {
            footAhead(p0, tb, flight, n, &off);
            const bool late = tb < first;
            if (late && first - tb > LATE_MAX) continue;
            if (std::fabs(off) <= 1.1 * CROSS_MAX) {
                a = late ? settleBank(first) : settleTime(tb);
                if (usable(a) && a.shot.along < -1000.0 && a.tb <= first + 0.01) a = settleBank(first);   // held at the earliest, still long
                found = good(a);
            }
            if (!found && !late) ++R.passes;
        }
    }
    if (!found) { R.planned = 0; R.tEvent = -1; return; }
    R.planned = 1;
    R.dv = a.dv;
    R.bank0 = a.bank0;
    R.tBurn = a.tb - a.dv * halfBurn;   // the burn starts half its length before the plan's all-at-once burn
    R.tInterface = a.shot.tInterface;
    R.tGate = a.shot.tGate;
    R.crossPlan = a.cross;
    R.side = side;
    R.tPlan = R.tBurn - t > 260.0 ? std::fmin(t + 600.0, R.tBurn - 200.0) : 1e18;   // again while it waits; a last time before the burn
}

// ---- flying it ------------------------------------------------------------------------------------

// Fly an angle of attack and a bank about the air's velocity, with no sideslip: the attitude that does
// it, and the rates that turn the craft to it. ff: rates the attitude is known to need.
void flyWind(State& s, const Local& L, double alpha, double bank, double gain, double limit, V3 ff) {
    const V3 vAir = s.v - cross(V3{0, 0, WE}, s.r);
    const V3 vhat = unit(vAir);
    V3 l0, right;
    windAxes(L.up, vhat, rot(s.q, V3{0, 0, -1}), &l0, &right);
    const V3 lift = l0 * std::cos(bank) + right * std::sin(bank);
    const V3 x = vhat * std::cos(alpha) + lift * std::sin(alpha);
    const V3 z = vhat * std::sin(alpha) - lift * std::cos(alpha);
    rateLoop(s, L, ratesToward(s, fromAxes(x, cross(z, x), z), gain, limit) + ff);
}

// The bank the craft has, about the air's velocity: where its lift points.
double bankOf(const State& s) {
    const V3 vAir = s.v - cross(V3{0, 0, WE}, s.r);
    const V3 vhat = unit(vAir);
    V3 l0, right;
    windAxes(unit(s.r), vhat, rot(s.q, V3{0, 0, -1}), &l0, &right);
    const V3 lift = unit(cross(rot(s.q, V3{0, 1, 0}), vhat));
    return std::atan2(dot(lift, right), dot(lift, l0));
}

// Where the craft is and how it moves over the ground, in the runway's plane.
struct Ground { XY p; double vx, vy, speed; };

Ground groundOf(const State& s) {
    const double t = timeOf(s);
    const V3 v = siteDir(s.v - cross(V3{0, 0, WE}, s.r), t);
    Ground g;
    g.p = fieldPlane(toEarth(s.r, t));
    g.vx = v.x * field.sinH + v.y * field.cosH;
    g.vy = v.x * field.cosH - v.y * field.sinH;
    g.speed = std::hypot(g.vx, g.vy);
    return g;
}

double wheelHeight(const State& s, const Local& L) {   // m: the lowest wheel above the ground
    double low = 1e9;
    for (int i = 0; i < 3; ++i) low = std::fmin(low, L.alt + dot(rot(s.q, GEAR[i]), L.up));
    return low;
}

double glidePath(double togo) {   // m: the craft's height on the glide path, with this much path to the threshold
    return CROSSING_M + 3.0 + togo * std::tan(GLIDE_SLOPE);
}

const double H_PATTERN = CROSSING_M + 3.0 + FINAL_M * 0.052407779283041196;   // the glide path's height where the turn ends

// Backing away from the ring, on the small thrusters: out along the hub's axis, on the craft's side of
// the ring, where nothing of the ring is.
void depart(State& s, const Local& L) {
    ReturnState& R = s.ret;
    const double t = timeOf(s);
    const V3 rel = s.r - ringPos(t), vrel = s.v - ringVel(t);
    const double along = dot(rel, ring.axis), d = norm(rel);
    const V3 away = ring.axis * (along >= 0 ? 1.0 : -1.0);
    const V3 across = rel - ring.axis * along;
    V3 want = away * clampd(0.5 + 0.02 * (std::fabs(along) - 300.0), 0.5, DEPART_SPEED);
    if (norm(across) < 400.0) want = want - across * 0.02;   // near the axis: stay on it
    const V3 body = irot(s.q, (want - vrel) * 0.5);
    s.rcs = {clampd(body.x, -RCS_ACC, RCS_ACC), clampd(body.y, -RCS_ACC, RCS_ACC), clampd(body.z, -RCS_ACC, RCS_ACC)};
    rateLoop(s, L, point(s, L, ringPos(t) - s.r, 1.0, 0.15));   // watching it go
    R.tEvent = t + (DEPART_CLEAR - d) / std::fmax(1.0, dot(vrel, away));
    if (d > DEPART_CLEAR) { R.phase = OC_RET_PH_WAIT; R.planned = 0; R.tPlan = 0; }
}

// The corrector: shoot the rest of the entry, and move the bank so the shot ends at the gate.
void correct(State& s, const Local& L) {
    ReturnState& R = s.ret;
    const double t = timeOf(s), mass = M_DRY + s.prop;
    const Pt p{s.r, s.v, t};
    const double bank = L.qbar > 1.0 ? bankOf(s) : R.bankCmd;
    R.bank0 = clampd(bankProfile(R.bank0, R.vRef, L.tas), BANK_LO, BANK_HI);   // the profile, where the craft now is on it
    R.vRef = std::fmin(L.tas, V_TOP);
    const Shot a = shoot(p, mass, R.bank0, R.vRef, R.bankSide, bank, R.side);
    if (R.cycle % 5 == 0 || R.slope <= 0) {   // how the miss moves with the bank: measured now and then
        const double step = 2 * D2R * (R.bank0 > 70 * D2R ? -1 : 1);
        const Shot b = shoot(p, mass, R.bank0 + step, R.vRef, R.bankSide, bank, R.side);
        const double slope = (b.miss - a.miss) / step;
        R.slope = slope > 1000.0 ? slope : std::fmax(R.slope, 2.0e5);
    }
    ++R.cycle;
    R.miss = a.miss;
    R.tGate = a.tGate;
    if (a.tInterface >= 0) R.tInterface = a.tInterface;
    R.bank0 = clampd(R.bank0 - clampd(a.miss / R.slope, -6 * D2R, 6 * D2R), BANK_LO, BANK_HI);
}

void startTerminal(State& s) {
    ReturnState& R = s.ret;
    const XY p = groundOf(s).p;
    R.side = circlePath(p, 1).togo <= circlePath(p, -1).togo ? 1 : -1;   // the shorter way round
    R.leg = 0;
    R.laps = 0;
    R.arc = 0;
    R.thrust = 0;
    R.phase = OC_RET_PH_TERMINAL;
}

// The bank that follows the way to the runway: to the circle, round it, down the final. Works in the
// plane with the circle on the right; the bank comes back the right way round.
double followPath(State& s, const Ground& g, double limit, bool mayExit) {
    ReturnState& R = s.ret;
    const int side = R.side;
    const double y = g.p.y * side, vy = g.vy * side;
    const Path path = circlePath(g.p, side);
    const double course = std::atan2(vy, g.vx), speed = std::fmax(g.speed, 20.0);
    double turn = 0;   // rad/s, + to the right in this plane
    if (R.leg == 0 && (path.dist < HAC_R + 60.0 || path.togo - HAC_R * path.arc - FINAL_M < 2.0 * speed)) R.leg = 1;
    if (R.leg == 1) {
        if (path.arc > R.arc + 3.0 && R.laps > 0) --R.laps;          // past the end of the turn, and round again
        else if (path.arc < 0.03 && R.laps == 0 && mayExit) R.leg = 2;   // the end of the turn: onto the final
        R.arc = path.arc;
    }
    if (R.leg == 0) {
        turn = 0.2 * wrap(std::atan2(path.tangent.y * side - y, path.tangent.x - g.p.x) - course);
        R.togo = path.togo + R.laps * 2 * PI * HAC_R;
    } else if (R.leg == 1) {
        const double theta = std::atan2(y - HAC_R, g.p.x + FINAL_M);
        const double want = theta + PI / 2 + std::atan((path.dist - HAC_R) / 1500.0);
        turn = 0.3 * wrap(want - course) + speed / HAC_R;
        double arc = std::fmod(-PI / 2 - theta, 2 * PI);
        if (arc < 0) arc += 2 * PI;
        R.togo = HAC_R * arc + FINAL_M + R.laps * 2 * PI * HAC_R;
    } else {
        turn = (-0.012 * y - 0.22 * vy) / speed;
        R.togo = -g.p.x;
    }
    return side * clampd(std::atan(turn * speed / G0), -limit, limit);
}

// The rates a turn at this bank and a curving path need, in the body: fed forward, so the attitude
// does not lag the flight path.
V3 turnRates(const Local& L, double bank, double pathRate) {
    const double turn = G0 * std::tan(bank) / std::fmax(L.tas, 30.0);
    return {0, pathRate * std::cos(bank) + turn * std::sin(bank), -pathRate * std::sin(bank) + turn * std::cos(bank)};
}

// The terminal glide: unpowered, the energy spent to plan by the angle of attack.
void terminal(State& s, const Local& L) {
    ReturnState& R = s.ret;
    const Ground g = groundOf(s);
    const double mass = M_DRY + s.prop;
    const bool high = L.alt > H_PATTERN + 500.0;
    const double bank = followPath(s, g, (L.mach > 1.2 ? 50 : 40) * D2R, !high);
    if (R.leg == 1 && R.laps == 0 && high && circlePath(g.p, R.side).arc < 0.03) R.laps = 1;   // too high to leave the turn: once more round

    // Energy, as height: what the craft has above what it should arrive with, over the path in which
    // to spend it. Drag over lift is the height a glide spends for each metre flown.
    const double energy = L.alt + L.tas * L.tas / (2 * G0);
    const double want = H_PATTERN + V_PATTERN * V_PATTERN / (2 * G0);
    const double room = std::fmax(1000.0, R.togo - FINAL_M - 3000.0);
    const double best = alphaBest(L.mach);
    const double steep = std::fmax(best, (12 + 18 * clampd((L.alt - 3000.0) / 5000.0, 0, 1)) * D2R * (ALPHA_GLIDE_MAX / (30 * D2R)));
    if (R.leg == 0) {   // more path, if the steepest glide cannot spend it all: whole turns round the circle
        const double most = dragOverLift(steep, L.mach);
        if ((energy - want) / room > 1.25 * most && R.laps < 3) ++R.laps;
        else if (R.laps > 0 && (energy - want) / std::fmax(1000.0, room - 2 * PI * HAC_R) < 0.9 * most) --R.laps;
    }
    double alpha = alphaForDrag((energy - want) / room * std::cos(bank), L.mach, best, steep);
    // Steadied, as holding the nose's attitude steadies a glide: the path steeper than this angle of
    // attack settles at wants more of it, a shallower one less. Fast and high, most of the energy spent
    // comes out of the speed, not the height, and the settled path is that much flatter.
    const double scale = 1000.0 / std::log(L.air.rho / atmosphere(L.alt + 1000.0).rho);
    const double settle = -std::atan(dragOverLift(alpha, L.mach) / (1 + L.tas * L.tas / (2 * G0 * scale)));
    const double gamma = std::asin(clampd(L.vs / std::fmax(L.tas, 1.0), -1, 1));
    alpha = clampd(alpha + 0.6 * (settle - gamma), best - 3 * D2R, steep + 4 * D2R);
    // And never more lift than the load's margin.
    const double clMax = 1.6 * mass * G0 / std::fmax(L.qbar * S_REF, 1.0);
    alpha = std::fmin(alpha, alphaForLift(clMax, L.mach, 2 * D2R, 40 * D2R));
    R.alphaCmd += clampd(alpha - R.alphaCmd, -2 * D2R * OC_DT, 2 * D2R * OC_DT);
    R.bankCmd = bank;
    flyWind(s, L, R.alphaCmd, bank, 1.5, 0.3, turnRates(L, bank, 0));

    R.tEvent = timeOf(s) + R.togo / std::fmax(g.speed, 60.0);
    const double level = R.togo > FINAL_M ? H_PATTERN : std::fmin(H_PATTERN, glidePath(R.togo));
    const double sink = std::fmax(0.0, -L.vs);
    if (L.alt < level + 60.0 + sink * sink / 5.0) { R.phase = OC_RET_PH_APPROACH; R.thrust = 0; }
}

// The approach and the flare: the height held by the lift, the speed by the throttle.
void approach(State& s, const Local& L, double* throttle) {
    ReturnState& R = s.ret;
    const Ground g = groundOf(s);
    const double mass = M_DRY + s.prop, wheels = wheelHeight(s, L);
    const bool flare = R.phase == OC_RET_PH_FLARE;
    const double bank = followPath(s, g, (flare ? 4 : wheels < 60.0 ? 10 : 30) * D2R, true);
    const double gamma = std::asin(clampd(L.vs / std::fmax(L.tas, 1.0), -1, 1));

    // The height to hold and the sink rate that goes with it; in the flare, the sink rate alone.
    double lift;   // m/s2 across the path, upward
    const double level = R.togo > FINAL_M ? H_PATTERN : std::fmin(H_PATTERN, glidePath(R.togo));
    const bool descending = level < H_PATTERN - 0.5;
    R.glideDev = L.alt - level;
    if (flare) {
        const double sink = std::fmax(SINK_TOUCH, std::fmin(SINK_TOUCH + wheels / 2.2, L.tas * std::sin(GLIDE_SLOPE)));
        lift = clampd(1.6 * (-sink - L.vs), -3.0, 4.0);
    } else {
        const double sinkRef = descending ? -g.speed * std::tan(GLIDE_SLOPE) : 0.0;
        lift = clampd(0.16 * (level - L.alt) + 0.7 * (sinkRef - L.vs), -3.0, 3.0);
        if (R.leg == 2 && wheels < FLARE_M && g.p.x > -1500.0) R.phase = OC_RET_PH_FLARE;
    }
    const double thrust = s.thr * T_MAX;
    const double need = (G0 * std::cos(gamma) + lift) / std::cos(bank) - thrust * std::sin(L.alpha) / mass;
    const double alpha = alphaForLift(need * mass / std::fmax(L.qbar * S_REF, 1.0), L.mach, -4 * D2R, (flare ? 9.5 : 18) * D2R);
    R.alphaCmd += clampd(alpha - R.alphaCmd, -4 * D2R * OC_DT, 4 * D2R * OC_DT);
    R.bankCmd = bank;
    flyWind(s, L, R.alphaCmd, bank, 2.0, 0.3, turnRates(L, bank, lift / std::fmax(L.tas, 30.0)));

    // The speed: round the turn, then slowing to the approach's, which goes with the root of the weight.
    const double vApp = V_APPROACH * std::sqrt(mass / 33000.0);
    const double vRef = vApp + (V_PATTERN - vApp) * clampd((R.togo - 7000.0) / 4000.0, 0, 1);
    double cl, cd;
    liftDrag(L.alpha, L.mach, &cl, &cd);
    const double drag = L.qbar * S_REF * cd;
    const double push = clampd(0.25 * (vRef - L.tas), -2.0, 2.5);
    R.thrust = clampd(R.thrust + 0.02 * (vRef - L.tas) * OC_DT, -0.05, 0.1);
    *throttle = flare && wheels < 7.0 ? 0 : clampd((drag + mass * (G0 * std::sin(gamma) + push)) / (T_MAX * std::cos(L.alpha)) + R.thrust, 0, 0.6);
    if (R.togo < 9000.0 || wheels < 300.0) s.gear = 1;
    R.tEvent = timeOf(s) + std::fmax(0.0, R.togo + 400.0) / std::fmax(g.speed, 40.0);
    if (s.onGround) { R.phase = OC_RET_PH_ROLLOUT; s.thetaT = L.pitch; s.phiT = 0; }
}

// On the runway: the nose lowered, the brakes on once it is down, the nose wheel steering for the
// centreline.
void rollout(State& s, const Local& L) {
    ReturnState& R = s.ret;
    const Ground g = groundOf(s);
    const bool noseDown = L.pitch < 1.0 * D2R;
    s.gear = 1;
    s.thetaT = noseDown ? L.pitch : std::fmax(-1.0 * D2R, s.thetaT - 2.5 * D2R * OC_DT);
    s.phiT = 0;
    s.brake = R.phase == OC_RET_PH_STOPPED ? 1 : noseDown ? 0.8 : 0;
    const double err = wrap(site.hdg - clampd(0.01 * g.p.y, -0.12, 0.12) - L.heading);
    s.steer = clampd(2.0 * err - 0.5 * s.w.z, -0.3, 0.3) / (1 + g.speed / 30.0);
    rateLoop(s, L, airLaw(s, L, clampd(1.0 * err, -0.1, 0.1)));
    R.togo = -g.p.x;
    R.tEvent = -1;
    if (g.speed < 0.3 && s.onGround) R.phase = OC_RET_PH_STOPPED;
}

}   // namespace

// ---- the hooks ------------------------------------------------------------------------------------

void returnReset(State& s) {
    s.ret = ReturnState{};
    field.sinH = std::sin(site.hdg);
    field.cosH = std::cos(site.hdg);
    double cd;
    liftDrag(ALPHA_ENTRY, 10.0, &field.clEntry, &cd);
    for (int i = 0; i < TAB_N; ++i) field.alphaTab[i] = alphaForLift(field.clEntry, i * 0.05, 2 * D2R, ALPHA_ENTRY);
}

// The crew picks the flight home up from wherever the craft is.
void returnEngage(State& s) {
    ReturnState& R = s.ret;
    const ReturnState was = R;
    R = ReturnState{};
    R.heat = R.heatPeak = was.heat;   // the heating and the landing are the craft's, not the crew's
    R.airborne = was.airborne;
    R.sinkLast = was.sinkLast;
    R.propAtEngage = s.prop;
    R.tEvent = -1;
    const Local L = localOf(s);
    const Orbit o = orbitOf(s);
    R.alphaCmd = L.alpha;
    R.bankCmd = 0;
    R.bank0 = BANK_PLAN;
    R.vRef = V_TOP;
    if (s.crashed) R.phase = OC_RET_PH_NONE;
    else if (s.onGround) { R.phase = OC_RET_PH_ROLLOUT; s.thetaT = L.pitch; s.phiT = 0; }
    else if (o.peri > 150000.0 && o.a > 0) {
        const bool near = ring.valid && norm(s.r - ringPos(timeOf(s))) < DEPART_NEAR;
        R.phase = near ? OC_RET_PH_DEPART : OC_RET_PH_WAIT;
        s.gear = 0;
    } else if (L.alt >= OC_RET_INTERFACE_M) { R.phase = OC_RET_PH_COAST; R.side = 1; s.gear = 0; }
    else if (L.tas > V_GATE) { R.phase = OC_RET_PH_ENTRY; R.side = 1; R.bankCmd = bankOf(s); s.gear = 0; }
    else startTerminal(s);
}

void returnCrew(State& s, const Local& L, double* throttle) {
    ReturnState& R = s.ret;
    const double t = timeOf(s);
    *throttle = 0;
    s.brake = 0;
    s.steer = 0;
    switch (R.phase) {
    case OC_RET_PH_DEPART:
        depart(s, L);
        break;
    case OC_RET_PH_WAIT: {
        if (t >= R.tPlan) plan(s);
        R.tEvent = R.planned ? R.tBurn : -1;
        const bool turn = R.planned && R.tBurn - t < BURN_LEAD;
        rateLoop(s, L, point(s, L, turn ? s.v * -1.0 : s.v, 1.0, 0.15));
        if (R.planned && t >= R.tBurn) R.phase = OC_RET_PH_BURN;
        break;
    }
    case OC_RET_PH_BURN: {   // tail first, until the orbit's lowest point is where the entry wants it
        const double peri = orbitOf(s).peri;
        const V3 back = unit(s.v) * -1.0;
        const bool aimed = dot(rot(s.q, V3{1, 0, 0}), back) > 0.9986;   // within 3 degrees
        *throttle = aimed ? clampd(BURN_THROTTLE * (peri - PERI_TARGET) / 40000.0, 0.02, BURN_THROTTLE) : 0;
        rateLoop(s, L, point(s, L, back, 1.5, 0.15));
        R.tEvent = t + std::fmax(0.0, peri - PERI_TARGET) / (3600.0 * BURN_THROTTLE * T_MAX / (M_DRY + s.prop));
        if (peri <= PERI_TARGET || s.prop <= 0) {
            *throttle = 0;
            R.phase = OC_RET_PH_COAST;
            R.tGuide = 0;
            R.slope = 0;
            R.bankSide = 0;
        }
        break;
    }
    case OC_RET_PH_COAST: {   // falling to the air, in the attitude the entry begins in
        if (t >= R.tGuide) { correct(s, L); R.tGuide = t + 30.0; }
        R.tEvent = R.tInterface;
        R.alphaCmd = ALPHA_ENTRY;
        flyWind(s, L, ALPHA_ENTRY, R.bankCmd, 1.0, 0.1, V3{0, 0, 0});
        if (L.alt < OC_RET_INTERFACE_M) { R.phase = OC_RET_PH_ENTRY; R.tGuide = 0; }
        break;
    }
    case OC_RET_PH_ENTRY: {
        if (t >= R.tGuide) { correct(s, L); R.tGuide = t + 2.0; }
        const Law g = entryLaw(s.r, s.v, t, M_DRY + s.prop, R.bank0, R.vRef, R.side);
        if (R.bankSide == 0) R.bankSide = g.off >= 0 ? 1 : -1;
        else if (reverse(R.bankSide, g.off, g.tas)) { R.bankSide = -R.bankSide; ++R.reversals; }
        R.bankCmd = R.bankSide * g.bank;
        R.alphaCmd = g.alpha;
        R.tEvent = R.tGate;
        R.togo = circlePath(fieldPlane(toEarth(s.r, t)), R.side).togo;
        flyWind(s, L, g.alpha, R.bankCmd, 1.0, BANK_RATE, V3{0, 0, 0});
        if (L.tas < V_GATE && L.alt < 90000.0) startTerminal(s);
        break;
    }
    case OC_RET_PH_TERMINAL:
        terminal(s, L);
        break;
    case OC_RET_PH_APPROACH:
    case OC_RET_PH_FLARE:
        approach(s, L, throttle);
        break;
    case OC_RET_PH_ROLLOUT:
    case OC_RET_PH_STOPPED:
        rollout(s, L);
        break;
    default:
        s.autoMode = OC_AUTO_OFF;   // nothing to fly: the pilot has it
        break;
    }
}

// After every step, whoever flies: what the air does to the craft, and the landing's numbers.
void returnAfterStep(State& s) {
    ReturnState& R = s.ret;
    const double rm = norm(s.r), mass = M_DRY + s.prop;
    const V3 up = s.r * (1.0 / rm);
    const V3 vAir = s.v - cross(V3{0, 0, WE}, s.r);
    const double tas = norm(vAir);
    const Air air = atmosphere(rm - RE);
    const double qbar = 0.5 * air.rho * tas * tas;
    R.heat = SUTTON_GRAVES * std::sqrt(air.rho / NOSE_RADIUS) * tas * tas * tas;
    R.heatLoad += R.heat * OC_DT;
    if (R.heat > R.heatPeak) R.heatPeak = R.heat;

    V3 f{s.prop > 0 ? s.thr * T_MAX : 0, 0, 0};   // the drive, the small thrusters and the air: what is felt
    f = f + s.rcs * mass;
    if (tas > 0.5 && qbar > 1e-6) {
        const V3 vb = irot(s.q, vAir);
        const double alpha = std::atan2(vb.z, vb.x), beta = std::asin(clampd(vb.y / tas, -1, 1));
        double cl, cd;
        liftDrag(alpha, tas / air.sound, &cl, &cd);
        const V3 vhat = vb * (1.0 / tas);
        f = f + (vhat * (-cd) + unit(cross(V3{0, 1, 0}, vhat)) * cl + V3{0, CY_BETA * beta, 0}) * (qbar * S_REF);
    }
    R.load = norm(f) / (mass * G0);
    if (!s.onGround) {
        if (R.load > R.loadPeak) R.loadPeak = R.load;
        if (qbar > R.qbarPeak) R.qbarPeak = qbar;
    }
    if (s.autoMode == OC_AUTO_RETURN && R.phase >= OC_RET_PH_BURN && !s.onGround) {
        if (R.heat > OC_RET_HEAT_LIMIT) R.over |= 1;
        if (R.load > OC_RET_LOAD_LIMIT) R.over |= 2;
        if (qbar > OC_RET_QBAR_LIMIT) R.over |= 4;
    }

    // The landing: the first touch after flight, and the stop.
    const double sink = -dot(vAir, up);
    if (!s.onGround && rm - RE > 20.0) {
        R.airborne = 1;
        R.touched = 0;
        R.stopped = 0;
    }
    if (s.onGround && R.airborne && !R.touched) {
        const Ground g = groundOf(s);
        R.touched = 1;
        R.tdSink = R.sinkLast;
        R.tdAlong = g.p.x;
        R.tdOff = g.p.y;
        R.tdSpeed = g.speed;
        R.tdPitch = std::asin(clampd(dot(rot(s.q, V3{1, 0, 0}), up), -1, 1));
        R.tdTime = timeOf(s);
    }
    if (R.touched && !R.stopped && s.onGround && tas < 0.3) {
        const Ground g = groundOf(s);
        R.stopped = 1;
        R.stopAlong = g.p.x;
        R.stopOff = g.p.y;
    }
    R.sinkLast = sink;
}

void returnWriteOut(const State& s) {
    const ReturnState& R = s.ret;
    const double t = timeOf(s);
    std::memset(out, 0, sizeof out);
    const bool flying = s.autoMode == OC_AUTO_RETURN;
    out[OC_RET_PHASE] = flying ? R.phase : OC_RET_PH_NONE;
    static const int events[] = {OC_RET_EV_NONE, OC_RET_EV_CLEAR, OC_RET_EV_BURN, OC_RET_EV_BURN_END, OC_RET_EV_INTERFACE, OC_RET_EV_TERMINAL,
                                 OC_RET_EV_TOUCHDOWN, OC_RET_EV_TOUCHDOWN, OC_RET_EV_TOUCHDOWN, OC_RET_EV_NONE, OC_RET_EV_NONE};
    const bool counting = flying && R.tEvent >= 0;
    out[OC_RET_EVENT] = counting ? events[R.phase] : OC_RET_EV_NONE;
    out[OC_RET_T_EVENT] = counting ? std::fmax(0.0, R.tEvent - t) : -1;
    const V3 here = unit(s.r), fieldNow = unit(fromEarth(site.p0, t));
    const double range = RE * std::acos(clampd(dot(here, fieldNow), -1, 1));
    out[OC_RET_RANGE] = range;
    const Ground g = groundOf(s);
    if (flying && R.phase >= OC_RET_PH_WAIT && R.phase <= OC_RET_PH_COAST) out[OC_RET_CROSS] = R.planned || R.phase > OC_RET_PH_WAIT ? R.crossPlan : 0;
    else if (flying && R.leg == 2) out[OC_RET_CROSS] = g.p.y;
    else {   // off the present track: the sine rule on the sphere
        const V3 vAir = s.v - cross(V3{0, 0, WE}, s.r);
        const V3 ahead = unit(vAir - here * dot(vAir, here)), to = unit(fieldNow - here * dot(fieldNow, here));
        const double off = std::atan2(-dot(cross(ahead, to), here), dot(ahead, to));
        out[OC_RET_CROSS] = norm(vAir) > 1.0 ? -RE * std::asin(clampd(std::sin(range / RE) * std::sin(off), -1, 1)) : 0;
    }
    out[OC_RET_TOGO] = flying && R.phase >= OC_RET_PH_ENTRY ? R.togo : range;
    out[OC_RET_BANK_CMD_DEG] = flying ? R.bankCmd * R2D : 0;
    out[OC_RET_ALPHA_CMD_DEG] = flying ? R.alphaCmd * R2D : 0;
    out[OC_RET_MISS] = flying && (R.phase == OC_RET_PH_COAST || R.phase == OC_RET_PH_ENTRY) ? R.miss : 0;
    out[OC_RET_REVERSALS] = R.reversals;
    out[OC_RET_DV] = R.dv;
    out[OC_RET_PASSES] = R.passes;
    out[OC_RET_HEAT] = R.heat;
    out[OC_RET_HEAT_PEAK] = R.heatPeak;
    out[OC_RET_HEAT_LOAD] = R.heatLoad;
    out[OC_RET_TEMP] = std::pow(R.heat / (EMISSIVITY * STEFAN), 0.25);
    out[OC_RET_GLOW] = std::pow(clampd((R.heat - 2.0e4) / 4.3e5, 0, 1), 0.6);
    out[OC_RET_LOAD] = R.load;
    out[OC_RET_LOAD_PEAK] = R.loadPeak;
    out[OC_RET_QBAR_PEAK] = R.qbarPeak;
    out[OC_RET_OVER] = R.over;
    out[OC_RET_GLIDE_DEV] = flying && (R.phase == OC_RET_PH_APPROACH || R.phase == OC_RET_PH_FLARE) ? R.glideDev : 0;
    out[OC_RET_TOUCHED] = R.touched;
    out[OC_RET_TD_SINK] = R.tdSink;
    out[OC_RET_TD_ALONG] = R.tdAlong;
    out[OC_RET_TD_OFF] = R.tdOff;
    out[OC_RET_TD_SPEED] = R.tdSpeed;
    out[OC_RET_TD_PITCH_DEG] = R.tdPitch * R2D;
    out[OC_RET_TD_T] = R.tdTime;
    out[OC_RET_STOPPED] = R.stopped;
    out[OC_RET_STOP_ALONG] = R.stopAlong;
    out[OC_RET_STOP_OFF] = R.stopOff;
    out[OC_RET_PROP_USED] = R.propAtEngage - s.prop;
}

void returnHash(const State& s, unsigned& h) {
    const ReturnState& R = s.ret;
    const double v[] = {
        (double)R.phase, R.heat, R.heatPeak, R.heatLoad, R.load, R.loadPeak, R.qbarPeak, (double)R.over, R.propAtEngage,
        (double)R.planned, R.tBurn, R.dv, R.tInterface, R.tGate, R.crossPlan, (double)R.passes, R.tPlan, R.tEvent,
        R.bank0, R.vRef, R.slope, (double)R.bankSide, R.bankCmd, R.alphaCmd, R.miss, R.tGuide, (double)R.cycle, (double)R.reversals,
        (double)R.side, (double)R.leg, (double)R.laps, R.arc, R.togo, R.thrust, R.glideDev,
        (double)R.airborne, R.sinkLast, (double)R.touched, R.tdSink, R.tdAlong, R.tdOff, R.tdSpeed, R.tdPitch, R.tdTime,
        (double)R.stopped, R.stopAlong, R.stopOff,
    };
    hashDoubles(h, v, sizeof v / sizeof v[0]);
}

}   // namespace oc

extern "C" {

const double* oc_return_out(void) { return oc::out; }
int oc_return_out_len(void) { return OC_RET_COUNT; }

double oc_return_model_g(void) {
    using namespace oc;
    const State& s = g;
    const double mass = M_DRY + s.prop;
    const Local L = localOf(s);
    const V3 air = airAccel(s.r, s.v, mass, L.alpha, bankOf(s));
    const V3 drive = rot(s.q, V3{s.prop > 0 ? s.thr * T_MAX / mass : 0, 0, 0});
    return norm(air + drive) / G0;
}

}   // extern "C"
