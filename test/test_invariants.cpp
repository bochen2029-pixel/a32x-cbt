// The sketch's invariants (flight/orbit/INVARIANTS.md), each stated as physics or as a promise of the
// core, with the tolerance it is held to and where that tolerance comes from. Run one by name
// (test_invariants vacuum_conserves) or all (test_invariants); ctest runs each line below that reads
// "// TEST: <name>". GPLv3.
//
// Unlike the parts' own tests, this program reads the core's state and its force laws through
// internal.h: the ledgers have to see the commands a step held and the forces the model says act, and
// replay has to see every field. Everything a page can see it reads through orbit_core.h.
//
// A line reading "// DEFECT: <name>" names a test of an invariant the core breaks today. ctest does not
// run it, so the suite stays green; run it by name (or "test_invariants defects") to see it fail. When
// the fix lands, the line becomes a "// TEST:" line. INVARIANTS.md lists each, with the fix proposed.
//
// TEST: certified_numbers
// TEST: vacuum_conserves
// TEST: thin_air_ledger
// TEST: ascent_work_energy
// TEST: mass_bookkeeping
// TEST: frames_round_trip
// TEST: readouts_are_derived
// TEST: replay_and_resume
// TEST: crew_flight_finite
// TEST: abuse_finite
// TEST: ring_shape
// TEST: hash_covers_the_state
// TEST: nonfinite_controls_refused
// TEST: escape_periapsis

#include "../core/orbit_core.h"
#include "../core/orbit_deck.h"
#include "../core/orbit_dock.h"
#include "../core/orbit_return.h"
#include "../core/orbit_walk.h"
#include "../core/internal.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <limits>
#include <vector>

namespace {

int failures = 0;

#define CHECK(cond, ...)                                                   \
    do {                                                                   \
        if (!(cond)) {                                                     \
            std::printf("  FAIL %s:%d: %s — ", __FILE__, __LINE__, #cond); \
            std::printf(__VA_ARGS__);                                      \
            std::printf("\n");                                             \
            ++failures;                                                    \
        }                                                                  \
    } while (0)

using oc::V3;

// ---- the certified numbers: flight/orbit/evidence/INDEX.md names each receipt -------------------
// These are this program's own, written from the sources, not read from the core; certified_numbers
// holds the core's equal to them.

const double MU = 3.986004418e14;    // m3/s2: IERS Conventions 2010 and WGS 84 (a measured value; cited)
const double RE = 6371000.0;         // m: the Earth's mean radius, IUGG's 6,371.0088 km to the km (cited)
const double WE = 7.2921159e-5;      // rad/s: 2 pi over the mean sidereal day, 86,164.0905 s (we-sidereal)
const double G0 = 9.80665;           // m/s2: standard gravity, exact (g0)
const double PI = 3.14159265358979323846;
const double H = OC_DT;              // s: the step
const double U = 1.1102230246251565e-16;   // 2^-53: the unit roundoff of a double
const double LAT = 32.91569901, LON = -97.02600098, HDG = 180.3;   // KDFW 17C (docs/provenance.md, 1f)
const double FLOW_FULL = 36.0;       // kg/s at full thrust: 1.2 x 60 t x g0 / (2,000 s x g0) (flow)

double get(int i) { return oc_out()[i]; }

// The first readout of any block that is not finite: the block's name, its index in *index; or nullptr.
const char* firstNonFinite(int* index) {
    struct Block { const char* name; const double* v; int n; };
    const Block blocks[] = {{"oc_out", oc_out(), oc_out_len()}, {"oc_dock_out", oc_dock_out(), oc_dock_out_len()},
                            {"oc_return_out", oc_return_out(), oc_return_out_len()}, {"oc_deck_out", oc_deck_out(), oc_deck_out_len()}};
    for (const Block& b : blocks)
        for (int i = 0; i < b.n; ++i)
            if (!std::isfinite(b.v[i])) { *index = i; return b.name; }
    return nullptr;
}

V3 eciR() { double r[3], v[3]; oc_eci(r, v); return {r[0], r[1], r[2]}; }
V3 eciV() { double r[3], v[3]; oc_eci(r, v); return {v[0], v[1], v[2]}; }
double energyOf(V3 r, V3 v) { return oc::dot(v, v) / 2 - MU / oc::norm(r); }

// Fly the scripted crew to the end of its burn (phase ORBIT); false if it did not get there.
bool crewToOrbit() {
    oc_reset(LAT, LON, HDG);
    while (get(OC_PHASE) != OC_PH_ORBIT) {
        oc_step(1);
        if (get(OC_CRASHED) > 0 || get(OC_T) > 1500) return false;
    }
    return true;
}

// From the crew's orbit, a pilot's two prograde burns: the top to 5,000 km, then, at the top, the
// bottom to 800 km. The model's air pushes only above 1e-6 Pa of dynamic pressure, and from 800 km up it
// is under 1e-7 Pa at any bound orbit's speed (evidence: qbar-800km), so the orbit is a vacuum's.
bool raiseAboveTheAir() {
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PROGRADE);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(1500);   // settle on prograde
    oc_controls(0, 0, 0, 1, 0, 0, 0, 0, 0);
    for (long i = 0; get(OC_APO) < 5.0e6; ++i) { oc_step(1); if (get(OC_PROP) <= 0 || i > 10000) return false; }
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(250);    // the thrust's tail
    for (long i = 0; get(OC_VS) < 1.0; ++i) { oc_step(1); if (i > 50000) return false; }
    for (long i = 0; get(OC_VS) > 0.0; ++i) { oc_step(1); if (i > 1000000) return false; }   // to the top
    oc_controls(0, 0, 0, 1, 0, 0, 0, 0, 0);
    for (long i = 0; get(OC_PERI) < 8.0e5; ++i) { oc_step(1); if (get(OC_PROP) <= 0 || i > 10000) return false; }
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(250);
    return get(OC_THROTTLE) == 0 && get(OC_PERI) > 7.5e5;
}

// ---- the ledger: the work done on each kilogram, step by step --------------------------------------
// The non-gravitational acceleration the model says acts on the craft in state s with the commands it
// holds for the step: the drive along the nose, the air (README.md: lift across the wind in the plane
// of symmetry, drag along it, a side force with sideslip), the small thrusters and the gear. Restated
// here, through the core's own atmosphere and coefficients, so that a force the integrator applies and
// this list does not know shows as a residual. A new force in the core's deriv() belongs here too.

struct Forces {
    V3 thrust, air, rcs, gear;
    V3 total() const { return thrust + air + rcs + gear; }
};

Forces forcesOn(const oc::State& s) {
    Forces f{{0, 0, 0}, {0, 0, 0}, {0, 0, 0}, {0, 0, 0}};
    const double rm = oc::norm(s.r), mass = oc::M_DRY + s.prop;
    const V3 vAir = s.v - oc::cross(V3{0, 0, oc::WE}, s.r);   // the air turns with the Earth
    const V3 vb = oc::irot(s.q, vAir);
    const double tas = oc::norm(vb);
    if (tas > 0.5) {
        const oc::Air air = oc::atmosphere(rm - oc::RE);
        const double qbar = 0.5 * air.rho * tas * tas;
        if (qbar > 1e-6) {
            const double alpha = std::atan2(vb.z, vb.x), beta = std::asin(oc::clampd(vb.y / tas, -1, 1));
            double cl, cd;
            oc::liftDrag(alpha, tas / air.sound, &cl, &cd);
            const V3 along = vb * (1.0 / tas);
            const V3 across = oc::unit(oc::cross(V3{0, 1, 0}, along));
            f.air = oc::rot(s.q, (along * (-cd) + across * cl + V3{0, oc::CY_BETA * beta, 0}) * (qbar * oc::S_REF)) * (1.0 / mass);
        }
    }
    f.thrust = oc::rot(s.q, V3{s.prop > 0 ? s.thr * oc::T_MAX : 0, 0, 0}) * (1.0 / mass);
    f.rcs = oc::rot(s.q, s.rcs);
    f.gear = oc::gearLoad(s, s.r, s.v, s.q, s.w).force * (1.0 / mass);
    return f;
}

// A sum kept to the last bit (Kahan's compensated summation), so that the ledger's own additions add no
// rounding to what it measures.
struct Sum {
    double s = 0, c = 0;
    void add(double x) { const double y = x - c, t = s + y; c = (t - s) - y; s = t; }
};
struct Sum3 {
    Sum x, y, z;
    void add(V3 v) { x.add(v.x); y.add(v.y); z.add(v.z); }
    V3 value() const { return {x.s, y.s, z.s}; }
};

// Over each step the power P = a·v (a the non-gravitational acceleration) is integrated twice: by
// Simpson's rule, through a midpoint state interpolated by cubic Hermite from the step's ends, and by the
// trapezoid rule. Simpson's rule and RK4 are fourth order: over a step where the forces are smooth their
// errors are O(h^5), of order P'''' h^5. The trapezoid rule is second order: its error, P'' h^3 / 12, is
// what its difference from Simpson's measures, step by step. Where the forces change on a time scale tau,
// each derivative brings a factor 1/tau, so the fourth-order errors are smaller than the measured
// second-order one by a factor of order (h/tau)^2 / 240; the bound takes (h/tau)^2, with tau the rate
// loop's 0.25 s (orbit_core.cpp's rateLoop, a gain of 4 a second), the fastest time scale aloft. On the
// ground the gear's contact switches within a step, where all three drop to low order together; there the
// bound is the trapezoid's gap itself. The same is done for the torque about the Earth's centre, r x a,
// against the angular momentum.
const double TAU = 0.25;
const double ORDER = (H / TAU) * (H / TAU);

struct Ledger {
    long steps = 0;
    Sum dE, simpson, trapezoid, gap, thrust, air, rcs, gear, planted, hGap;
    Sum3 dH, hSimpson;
    double eScale = 0, hScale = 0;   // the largest v^2 + mu/r and |r||v| met: the rounding's scale
    double residual() const { return dE.s - simpson.s; }
    double hResidual() const { return oc::norm(dH.value() - hSimpson.value()); }
};

void ledgerStep(Ledger& L, const oc::State& before, const oc::State& after) {
    // the step's commands are set before it is integrated, and held: take them from after
    oc::State A = before;
    A.thr = after.thr; A.rcs = after.rcs; A.steer = after.steer; A.brake = after.brake; A.gear = after.gear;
    const oc::State& B = after;
    const Forces fa = forcesOn(A), fb = forcesOn(B);
    auto gravity = [](V3 r) { const double rm = oc::norm(r); return r * (-MU / (rm * rm * rm)); };
    // the midpoint: cubic Hermite in r and v (with the accelerations at the ends) and in q (with q'),
    // the mass flow being constant over a step
    oc::State M = A;
    const V3 aA = gravity(A.r) + fa.total(), aB = gravity(B.r) + fb.total();
    M.r = (A.r + B.r) * 0.5 + (A.v - B.v) * (H / 8);
    M.v = (A.v + B.v) * 0.5 + (aA - aB) * (H / 8);
    const oc::Q qa = oc::qmul(A.q, oc::Q{0, A.w.x / 2, A.w.y / 2, A.w.z / 2}), qb = oc::qmul(B.q, oc::Q{0, B.w.x / 2, B.w.y / 2, B.w.z / 2});
    M.q = oc::qunit(oc::Q{(A.q.w + B.q.w) / 2 + (qa.w - qb.w) * H / 8, (A.q.x + B.q.x) / 2 + (qa.x - qb.x) * H / 8,
                          (A.q.y + B.q.y) / 2 + (qa.y - qb.y) * H / 8, (A.q.z + B.q.z) / 2 + (qa.z - qb.z) * H / 8});
    M.w = (A.w + B.w) * 0.5;
    M.prop = (A.prop + B.prop) / 2;
    const Forces fm = forcesOn(M);
    auto simpson = [&](V3 Forces::*k) { return H / 6 * (oc::dot(fa.*k, A.v) + 4 * oc::dot(fm.*k, M.v) + oc::dot(fb.*k, B.v)); };
    const double pa = oc::dot(fa.total(), A.v), pm = oc::dot(fm.total(), M.v), pb = oc::dot(fb.total(), B.v);
    const double S = H / 6 * (pa + 4 * pm + pb), T = H / 2 * (pa + pb);
    L.simpson.add(S);
    L.trapezoid.add(T);
    L.gap.add(std::fabs(T - S));
    L.dE.add(energyOf(B.r, B.v) - energyOf(A.r, A.v));
    L.thrust.add(simpson(&Forces::thrust));
    L.air.add(simpson(&Forces::air));
    L.rcs.add(simpson(&Forces::rcs));
    L.gear.add(simpson(&Forces::gear));
    L.planted.add(H / 6 * 1e-5 * (oc::norm(A.v) + 4 * oc::norm(M.v) + oc::norm(B.v)));
    const V3 ta = oc::cross(A.r, fa.total()), tm = oc::cross(M.r, fm.total()), tb = oc::cross(B.r, fb.total());
    const V3 hs = (ta + tm * 4 + tb) * (H / 6), ht = (ta + tb) * (H / 2);
    L.hSimpson.add(hs);
    L.hGap.add(oc::norm(ht - hs));
    L.dH.add(oc::cross(B.r, B.v) - oc::cross(A.r, A.v));
    const double es = oc::dot(B.v, B.v) + MU / oc::norm(B.r), hsc = oc::norm(B.r) * oc::norm(B.v);
    if (es > L.eScale) L.eScale = es;
    if (hsc > L.hScale) L.hScale = hsc;
    ++L.steps;
}

// The rounding of N steps, each of which rounds r and v to doubles (about a unit roundoff of each, twice:
// the sums and the state): every rounding the same way, N 2u (v^2 + mu/r) in energy; or, as Brouwer's law
// (1937) has it for orbits integrated with unbiased rounding, a random walk, here at six standard
// deviations. The walk is the bound used; the worst case is printed beside it.
double roundingWorst(long n, double scale) { return n * 2 * U * scale; }
double roundingWalk(long n, double scale) { return 6 * std::sqrt((double)n) * 2 * U * scale; }

// The ledger's bounds: aloft, the fourth-order error and the rounding; on the ground, the gap itself.
double boundAloft(const Ledger& L) { return ORDER * L.gap.s + roundingWalk(L.steps, L.eScale); }
double hBoundAloft(const Ledger& L) { return ORDER * L.hGap.s + roundingWalk(L.steps, L.hScale); }
double boundOnGround(const Ledger& L) { return L.gap.s + roundingWalk(L.steps, L.eScale); }

// ---- the tests --------------------------------------------------------------------------------------

// The core's constants are the certified ones, and the numbers README.md states follow from them.
// Each check names its receipt in flight/orbit/evidence/INDEX.md.
void certifiedNumbers() {
    CHECK(oc::MU == MU, "mu %.10g, certified %.10g", oc::MU, MU);
    CHECK(oc::RE == RE, "RE %.10g, certified %.10g", oc::RE, RE);
    CHECK(oc::WE == WE, "WE %.10g, certified %.10g (we-sidereal)", oc::WE, WE);
    CHECK(oc::G0 == G0, "g0 %.10g, certified %.10g (g0)", oc::G0, G0);
    CHECK(OC_DT == 0.02, "the step %.6g s", OC_DT);
    // the drive: 1.2 x the take-off weight, 706,078.8 N (tmax), and its flow at full thrust, 36 kg/s (flow)
    CHECK(oc::M_DRY + oc::M_PROP0 == 60000.0 && oc::M_PROP0 == 30000.0, "the masses %.1f + %.1f", oc::M_DRY, oc::M_PROP0);
    CHECK(std::fabs(oc::T_MAX - 706078.8) <= 706078.8 * 4 * U, "full thrust %.6f N", oc::T_MAX);
    CHECK(std::fabs(oc::T_MAX / (oc::ISP * oc::G0) - FLOW_FULL) <= FLOW_FULL * 4 * U, "flow %.15g kg/s", oc::T_MAX / (oc::ISP * oc::G0));
    // a round 500 km orbit: 7,616.5608 m/s (vcirc-500km) and Kepler's 5,668.144 s (kepler-500km)
    const double r500 = RE + 500000.0;
    const double vc = std::sqrt(MU / r500), period = 2 * PI * std::sqrt(r500 * r500 * r500 / MU);
    CHECK(std::fabs(vc - 7616.5608062629) < 1e-9, "circular speed %.10f", vc);
    CHECK(std::fabs(period - 5668.1443690612) < 1e-9, "Kepler's period %.10f", period);
    // the Ring: one g at the floor to 0.06 % (ring-g), a turn in 141.8 s (ring-turn)
    const double g = OC_RING_SPIN * OC_RING_SPIN * OC_RING_FLOOR_M / G0;
    CHECK(std::fabs(g - 1) < 1e-3, "the Ring's floor at %.6f g", g);
    CHECK(std::fabs(2 * PI / OC_RING_SPIN - 142) < 0.5, "the Ring turns in %.3f s", 2 * PI / OC_RING_SPIN);
    std::printf("  full thrust %.1f N, %.1f kg/s; 500 km: %.4f m/s, %.4f s; the Ring %.5f g, %.3f s a turn\n", oc::T_MAX,
                oc::T_MAX / (oc::ISP * oc::G0), vc, period, g, 2 * PI / OC_RING_SPIN);
}

// Above the model's air the craft feels gravity alone. Over two revolutions of an eccentric orbit
// (800 x 5,000 km) its energy and angular momentum hold to the rounding of the steps, and each
// revolution closes after Kepler's period for its energy. The bound is Brouwer's random walk of the
// roundings, at six standard deviations: RK4's own error, of order (2 pi / steps a revolution)^4 = 4e-20
// a revolution, is far below it.
void vacuumConserves() {
    if (!crewToOrbit() || !raiseAboveTheAir()) { CHECK(false, "no orbit above the air: %.0f x %.0f km", get(OC_APO) / 1000, get(OC_PERI) / 1000); return; }
    oc_sas(OC_SAS_HOLD);
    // start at the bottom of the orbit, where the acceleration is square to the velocity, so the time
    // past the start point is read to second order from a straight line
    for (long i = 0; oc::dot(eciR(), eciV()) >= 0; ++i) { oc_step(1); if (i > 1000000) { CHECK(false, "no descent"); return; } }
    for (long i = 0; oc::dot(eciR(), eciV()) < 0; ++i) { oc_step(1); if (i > 1000000) { CHECK(false, "no bottom"); return; } }
    const V3 r0 = eciR(), v0 = eciV();
    const double e0 = energyOf(r0, v0), t0 = get(OC_T);
    const V3 h0 = oc::cross(r0, v0);
    const double a = -MU / (2 * e0), period = 2 * PI * std::sqrt(a * a * a / MU);
    const double eScale = oc::dot(v0, v0) + MU / oc::norm(r0), hScale = oc::norm(r0) * oc::norm(v0);
    std::printf("  %.1f x %.1f km, a = %.3f km, Kepler's period %.6f s\n", get(OC_PERI) / 1000, get(OC_APO) / 1000, a / 1000, period);
    double worstE = 0, worstH = 0, maxQbar = 0;
    long n = 0;
    for (int rev = 1; rev <= 2; ++rev) {
        const long until = (long)std::floor(rev * period / H) - 2;
        for (; n < until; ++n) {
            oc_step(1);
            const V3 r = eciR(), v = eciV();
            const double de = std::fabs(energyOf(r, v) - e0), dh = oc::norm(oc::cross(r, v) - h0);
            if (de > worstE) worstE = de;
            if (dh > worstH) worstH = dh;
            if (get(OC_QBAR) > maxQbar) maxQbar = get(OC_QBAR);
        }
        double best = 1e30, measured = 0, miss = 0;   // the step nearest the start point
        const V3 a0 = r0 * (-MU / std::pow(oc::norm(r0), 3));
        for (int k = 0; k < 5; ++k, ++n) {
            oc_step(1);
            const V3 d = eciR() - r0;
            const double past = oc::dot(d, v0) / oc::dot(v0, v0);   // s past the start point
            if (std::fabs(past) < std::fabs(best)) {
                best = past;
                measured = get(OC_T) - t0 - past;
                miss = oc::norm(d - v0 * past - a0 * (past * past / 2));
            }
        }
        // the period's own bound: 3/2 of the energy's, relative (Kepler's third law), plus the straight
        // line's error at the bottom, of order (mu/r^3) h^3 / 6 = 1e-12 s, and t's own rounding, 1e-12 s
        const double tol = 1.5 * roundingWalk(n, eScale) / std::fabs(e0) * rev * period + 1e-10;
        std::printf("  revolution %d: %.9f s against Kepler's %.9f s (%.2e s; bound %.1e s), %.2e m off the start point\n", rev,
                    measured, rev * period, measured - rev * period, tol, miss);
        CHECK(std::fabs(measured - rev * period) <= tol, "revolution %d: %.9f s, Kepler's %.9f s", rev, measured, rev * period);
        CHECK(miss <= oc::norm(v0) * tol + 1e-6, "revolution %d: %.3e m off the start point", rev, miss);
    }
    const double tolE = roundingWalk(n, eScale), tolH = roundingWalk(n, hScale);
    std::printf("  %ld steps: energy within %.2e J/kg (%.1e of it; bound %.1e), angular momentum %.2e m2/s (%.1e; bound %.1e); worst rounding %.1e\n", n,
                worstE, worstE / std::fabs(e0), tolE, worstH, worstH / oc::norm(h0), tolH, roundingWorst(n, eScale));
    CHECK(maxQbar < 1e-6, "the air pushes: %.3g Pa", maxQbar);
    CHECK(worstE <= tolE, "energy moved %.3e J/kg, bound %.3e", worstE, tolE);
    CHECK(worstH <= tolH, "angular momentum moved %.3e m2/s, bound %.3e", worstH, tolH);
    CHECK(get(OC_THROTTLE) == 0 && get(OC_CRASHED) == 0, "coasting");
}

// In the crew's 500 km orbit the thin air is still there: a few hundredths of a joule per kilogram a
// revolution. The energy and the angular momentum change by the drag's work and torque and by nothing
// else, to the ledger's bound, and the loss is what the air's density there predicts.
void thinAirLedger() {
    if (!crewToOrbit()) { CHECK(false, "no orbit"); return; }
    oc_step(500);   // the thrust's tail gone; the crew points at the Ring
    Ledger L;
    const double revolution = 2 * PI * std::sqrt(std::pow(-MU / (2 * energyOf(eciR(), eciV())), 3) / MU);
    const long steps = (long)(2 * revolution / H);
    Sum rho;
    for (long i = 0; i < steps; ++i) {
        const oc::State before = oc::g;
        oc_step(1);
        ledgerStep(L, before, oc::g);
        double r, p, t, a;
        oc_atmosphere(get(OC_ALT), &r, &p, &t, &a);
        rho.add(r);
    }
    const double tolE = boundAloft(L), tolH = hBoundAloft(L);
    std::printf("  2 revolutions, %ld steps: energy %+.6e J/kg, the air's work %+.6e; residual %.2e J/kg (bound %.2e)\n", L.steps, L.dE.s, L.air.s,
                L.residual(), tolE);
    std::printf("  angular momentum moved %.4e m2/s; residual %.2e (bound %.2e)\n", oc::norm(L.dH.value()), L.hResidual(), tolH);
    CHECK(L.thrust.s == 0 && L.rcs.s == 0 && L.gear.s == 0, "only the air acts: %g %g %g", L.thrust.s, L.rcs.s, L.gear.s);
    CHECK(std::fabs(L.residual()) <= tolE, "energy: residual %.3e J/kg, bound %.3e", L.residual(), tolE);
    CHECK(L.hResidual() <= tolH, "angular momentum: residual %.3e m2/s, bound %.3e", L.hResidual(), tolH);
    // the drag's loss from the density alone: -1/2 rho v_air^2 S c_d v / m over the time, with c_d the
    // core's 0.020 at hypersonic speed and the nose near the track, v_air the speed through air that
    // turns with the Earth. The angle of attack and the air's turn are good to a few per cent: a factor 1.2.
    const double v = oc::norm(eciV()), vAir = v - oc::WE * oc::norm(eciR()) * std::cos(get(OC_INC_DEG) * PI / 180);
    const double predicted = -0.5 * (rho.s / steps) * vAir * vAir * oc::S_REF * 0.020 * v / get(OC_MASS) * steps * H;
    std::printf("  the drag took %.4e J/kg; the density alone says %.4e\n", L.air.s, predicted);
    CHECK(L.air.s < 0 && L.air.s / predicted > 1 / 1.2 && L.air.s / predicted < 1.2, "the air took %.4e J/kg, the density says %.4e", L.air.s, predicted);
}

// The powered ascent: from the first step with the gear up to the end of the thrust's tail, the energy
// each kilogram gains is the work of the drive and the air on it, the integral of (F_thrust + F_air)/m · v
// (per kilogram: the mass halves on the way, so the craft's total energy obeys no such balance), and the
// angular momentum changes by the torque of the same forces about the Earth's centre. The take-off roll
// is held to its own, looser bound. The ledger's power to see: without the air it misses by the air's
// work, and a force of one micro-g along the track, unknown to it, would show a hundred times over.
void ascentWorkEnergy() {
    oc_reset(LAT, LON, HDG);
    Ledger roll;   // brake release to the gear coming up: the wheels on the runway, then just off it
    while (get(OC_PHASE) < OC_PH_ROLL) oc_step(1);
    while (oc::g.gear) {
        const oc::State before = oc::g;
        oc_step(1);
        ledgerStep(roll, before, oc::g);
        if (get(OC_CRASHED) > 0 || get(OC_T) > 200) { CHECK(false, "no take-off"); return; }
    }
    Ledger L;
    while (get(OC_PHASE) != OC_PH_ORBIT || get(OC_THROTTLE) > 0) {
        const oc::State before = oc::g;
        oc_step(1);
        ledgerStep(L, before, oc::g);
        if (get(OC_CRASHED) > 0 || get(OC_T) > 1500) { CHECK(false, "no orbit"); return; }
    }
    const double tolE = boundAloft(L), tolH = hBoundAloft(L), tolRoll = boundOnGround(roll);
    std::printf("  aloft, %ld steps: energy %+.6e J/kg = drive %+.6e + air %+.6e; residual %.2e J/kg (bound %.2e; the trapezoid's gap %.2e, worst rounding %.1e)\n",
                L.steps, L.dE.s, L.thrust.s, L.air.s, L.residual(), tolE, L.gap.s, roundingWorst(L.steps, L.eScale));
    std::printf("  angular momentum moved %.6e m2/s; residual %.2e (bound %.2e)\n", oc::norm(L.dH.value()), L.hResidual(), tolH);
    std::printf("  the roll, %ld steps: energy %+.6e J/kg = drive %+.6e + air %+.6e + gear %+.6e; residual %.2e J/kg (bound %.2e)\n", roll.steps,
                roll.dE.s, roll.thrust.s, roll.air.s, roll.gear.s, roll.residual(), tolRoll);
    CHECK(L.gear.s == 0 && L.rcs.s == 0, "only the drive and the air act aloft: gear %g, thrusters %g", L.gear.s, L.rcs.s);
    CHECK(std::fabs(L.residual()) <= tolE, "energy: residual %.3e J/kg, bound %.3e", L.residual(), tolE);
    CHECK(L.hResidual() <= tolH, "angular momentum: residual %.3e m2/s, bound %.3e", L.hResidual(), tolH);
    CHECK(std::fabs(roll.residual()) <= tolRoll, "the roll: residual %.3e J/kg, bound %.3e", roll.residual(), tolRoll);
    // the ledger can fail: leave the air out, or let one micro-g act unseen
    CHECK(std::fabs(L.dE.s - (L.simpson.s - L.air.s)) > 100 * tolE, "the ledger without the air still closes: %.3e", L.dE.s - (L.simpson.s - L.air.s));
    CHECK(L.planted.s > 100 * tolE, "one micro-g along the track would do %.3e J/kg, bound %.3e", L.planted.s, tolE);
    std::printf("  without the air the ledger misses by %.3e J/kg; one micro-g unseen would add %.3e\n", L.dE.s - (L.simpson.s - L.air.s), L.planted.s);
}

// The propellant used is the integral of the flow: thrust over exhaust speed, 36 kg/s at full thrust
// (flow), at the throttle's value held over each step. The mass read out is the dry mass and the
// propellant. The propellant never rises and never goes below nothing; the small thrusters, which the
// sketch does not fuel (README.md, "What is not"), take none; and a burn to the last kilogram ends with
// the tank exactly empty and the drive stopped.
void massBookkeeping() {
    oc_reset(LAT, LON, HDG);
    Sum flowed;
    double worst = 0, prev = get(OC_PROP);
    bool rose = false, massOk = true;
    long n = 0;
    while (get(OC_PHASE) != OC_PH_ORBIT || get(OC_THROTTLE) > 0) {
        oc_step(1);
        ++n;
        flowed.add(get(OC_THROTTLE) * FLOW_FULL * H);   // the throttle read out is the value the step held
        worst = std::fmax(worst, std::fabs((oc::M_PROP0 - get(OC_PROP)) - flowed.s));
        if (get(OC_PROP) > prev) rose = true;
        prev = get(OC_PROP);
        if (get(OC_MASS) != 30000.0 + get(OC_PROP)) massOk = false;
        if (get(OC_CRASHED) > 0 || get(OC_T) > 1500) { CHECK(false, "no orbit"); return; }
    }
    // each step rounds the propellant, a unit roundoff of up to 30 t, and its flow: N 2u M_PROP0
    const double tol = n * 2 * U * oc::M_PROP0;
    std::printf("  to orbit, %ld steps: used %.6f kg, the flow's integral %.6f kg; worst difference %.2e kg (bound %.1e)\n", n,
                oc::M_PROP0 - get(OC_PROP), flowed.s, worst, tol);
    CHECK(worst <= tol, "the propellant used and the flow part by %.3e kg, bound %.3e", worst, tol);
    CHECK(!rose, "the propellant rose");
    CHECK(massOk, "the mass read out is not the dry mass and the propellant");
    oc_step(250);   // the drive's last spool-down gone (it burns as it falls), so what follows is the thrusters'
    const double before = get(OC_PROP);   // the approach: the small thrusters alone
    oc_auto(OC_AUTO_APPROACH);
    for (int i = 0; i < 50000 && get(OC_PROP) == before; ++i) oc_step(1);
    CHECK(get(OC_PROP) == before, "the thrusters took %.6f kg", before - get(OC_PROP));
    oc_auto(OC_AUTO_OFF);   // and to the last kilogram, retrograde: from the hold point that leads away from
    oc_sas(OC_SAS_RETROGRADE);   // the ring, which is solid since docking (prograde runs into a spoke)
    oc_step(1500);   // turned round on the thrusters before the drive lights
    oc_controls(0, 0, 0, 1, 0, 0, 0, 0, 0);
    Sum burnt;
    const double start = get(OC_PROP);
    bool negative = false;
    long k = 0;
    while (get(OC_PROP) > 0 && k < 20000) {
        oc_step(1);
        ++k;
        burnt.add(get(OC_THROTTLE) * FLOW_FULL * H);
        if (get(OC_PROP) < 0) negative = true;
    }
    oc_step(5);
    std::printf("  the burn to empty: %.6f kg in %.2f s, the flow's integral %.6f kg; the drive at %g after\n", start, k * H, burnt.s, get(OC_THROTTLE));
    CHECK(get(OC_PROP) == 0 && !negative, "the tank ends at %.9g kg", get(OC_PROP));
    CHECK(get(OC_THROTTLE) == 0, "the drive runs on an empty tank: %g", get(OC_THROTTLE));
    CHECK(get(OC_MASS) == oc::M_DRY, "the mass %.6f kg, dry %.6f", get(OC_MASS), oc::M_DRY);
    // the last step finds less than its full share left: the flow's integral passes the tank's contents
    // by less than one step's flow at full thrust
    CHECK(burnt.s - start >= -k * 2 * U * oc::M_PROP0 && burnt.s - start < FLOW_FULL * H, "%.6f kg flowed from %.6f", burnt.s, start);
}

// The site frame's axes at the start point, from orbit_core.h's definition, and the way back from a site
// vector (a point, or a direction) to the inertial frame: the Earth has turned WE t since the start.
struct SiteAxes {
    V3 up, east, north, pole;   // pole: the Earth's axis, in site axes
    SiteAxes() {
        const double la = LAT * PI / 180, lo = LON * PI / 180;
        up = {std::cos(la) * std::cos(lo), std::cos(la) * std::sin(lo), std::sin(la)};
        east = {-std::sin(lo), std::cos(lo), 0};
        north = oc::cross(up, east);
        pole = {0, std::cos(la), std::sin(la)};
    }
    V3 toInertial(V3 site, double t, bool point) const {
        const V3 ef = east * site.x + north * site.y + up * (site.z + (point ? RE : 0));
        const double c = std::cos(WE * t), s = std::sin(WE * t);
        return {c * ef.x - s * ef.y, s * ef.x + c * ef.y, ef.z};
    }
    V3 toSite(V3 x, double t) const {   // a direction
        const double c = std::cos(WE * t), s = std::sin(WE * t);
        const V3 ef{c * x.x + s * x.y, -s * x.x + c * x.y, x.z};
        return {oc::dot(ef, east), oc::dot(ef, north), oc::dot(ef, up)};
    }
};

double wrapDeg(double d) { while (d > 180) d -= 360; while (d < -180) d += 360; return d; }

// The frames are one frame seen three ways (orbit_core.h): inertial, Earth-fixed (turned WE t about the
// pole) and the site's east, north and up at the start. At every step of the crew's flight and its
// approach: the site position reported, carried back through the Earth-fixed frame, is the inertial
// position; latitude, longitude and height are that point's on the sphere; the body-to-site quaternion is
// a unit one, its axes orthonormal and right-handed, and they give the heading, pitch and roll reported;
// the Ring's axis and reference are unit and square; the Sun stays fixed among the stars; the core's two
// copies of the transform (writeOut's and sitePos's) agree; and the frame comes back to itself after a
// sidereal day. Each bound is a few unit roundoffs of the quantity. The check can fail: the Earth's turn
// read one step late misses by metres.
void framesRoundTrip() {
    const SiteAxes S;
    double worstPos = 0, nearestLate = 1e30, worstLat = 0, worstLon = 0, worstAlt = 0, worstQ = 0, worstAxes = 0, worstAngles = 0, worstRing = 0,
           worstSun = 0, worstCopy = 0;
    V3 sun0{0, 0, 0};
    long n = 0;
    auto check = [&]() {
        const double t = get(OC_T);
        const V3 r = eciR(), p{get(OC_SITE_E), get(OC_SITE_N), get(OC_SITE_U)};
        const double tolPos = 16 * U * (oc::norm(r) + RE);
        worstPos = std::fmax(worstPos, oc::norm(S.toInertial(p, t, true) - r) / tolPos);
        nearestLate = std::fmin(nearestLate, oc::norm(S.toInertial(p, t + H, true) - r));
        const double c = std::cos(WE * t), s = std::sin(WE * t);
        const V3 ef{c * r.x + s * r.y, -s * r.x + c * r.y, r.z};
        const double deg = 180 / PI;
        worstLat = std::fmax(worstLat, std::fabs(std::asin(ef.z / oc::norm(ef)) * deg - get(OC_LAT_DEG)) / (16 * U * deg));
        worstLon = std::fmax(worstLon, std::fabs(wrapDeg(std::atan2(ef.y, ef.x) * deg - get(OC_LON_DEG))) / (16 * U * deg * 180));
        worstAlt = std::fmax(worstAlt, std::fabs(oc::norm(r) - RE - get(OC_ALT)) / (4 * U * oc::norm(r)));
        const double qw = get(OC_QW), qx = get(OC_QX), qy = get(OC_QY), qz = get(OC_QZ);
        worstQ = std::fmax(worstQ, std::fabs(qw * qw + qx * qx + qy * qy + qz * qz - 1) / (8 * U));
        const V3 fwd{1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qw * qz), 2 * (qx * qz - qw * qy)};   // web/src/frames.js's bodyAxes
        const V3 right{2 * (qx * qy - qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qw * qx)};
        const V3 down{2 * (qx * qz + qw * qy), 2 * (qy * qz - qw * qx), 1 - 2 * (qx * qx + qy * qy)};
        worstAxes = std::fmax(worstAxes, std::fmax(std::fmax(std::fabs(oc::dot(fwd, right)), std::fabs(oc::dot(fwd, down))),
                                                   std::fmax(std::fabs(oc::dot(right, down)), oc::norm(oc::cross(fwd, right) - down))) / (32 * U));
        const V3 lu = oc::unit(p + V3{0, 0, RE}), le = oc::unit(oc::cross(S.pole, lu)), ln = oc::cross(lu, le);
        const double pitch = std::asin(oc::clampd(oc::dot(fwd, lu), -1, 1));
        if (std::fabs(pitch) < 85 * PI / 180) {   // heading and roll lose their meaning at the vertical
            const double tolAngle = 64 * U / std::cos(pitch) * deg;
            const double dh = wrapDeg(std::atan2(oc::dot(fwd, le), oc::dot(fwd, ln)) * deg - get(OC_HDG_DEG));
            const double dp = pitch * deg - get(OC_PITCH_DEG);
            const double dr = wrapDeg(std::atan2(-oc::dot(right, lu), -oc::dot(down, lu)) * deg - get(OC_ROLL_DEG));
            worstAngles = std::fmax(worstAngles, std::fmax(std::fabs(dh), std::fmax(std::fabs(dp), std::fabs(dr))) / tolAngle);
        }
        const V3 ax{get(OC_RING_AX_E), get(OC_RING_AX_N), get(OC_RING_AX_U)}, ref{get(OC_RING_REF_E), get(OC_RING_REF_N), get(OC_RING_REF_U)};
        worstRing = std::fmax(worstRing, std::fmax(std::fabs(oc::norm(ax) - 1), std::fmax(std::fabs(oc::norm(ref) - 1), std::fabs(oc::dot(ax, ref)))) / (8 * U));
        const V3 sun{get(OC_SUN_E), get(OC_SUN_N), get(OC_SUN_U)}, sunI = S.toInertial(sun, t, false);
        if (n == 0) sun0 = sunI;
        worstSun = std::fmax(worstSun, oc::norm(sunI - sun0) / (16 * U));
        worstCopy = std::fmax(worstCopy, std::fmax(oc::norm(oc::sitePos(oc::g.r, t) - p) / tolPos, oc::norm(oc::siteDir(oc::sunEci, t) - sun) / (8 * U)));
        ++n;
    };
    oc_reset(LAT, LON, HDG);
    check();
    while (get(OC_PHASE) != OC_PH_ORBIT) {
        oc_step(1);
        check();
        if (get(OC_CRASHED) > 0 || get(OC_T) > 1500) { CHECK(false, "no orbit"); return; }
    }
    oc_auto(OC_AUTO_APPROACH);
    for (int i = 0; i < 50000; ++i) { oc_step(1); check(); }
    // after a sidereal day the Earth-fixed frame is where it began, among the stars
    const double day = 2 * PI / oc::WE;
    double worstDay = 0;
    const V3 dirs[] = {{1, 0, 0}, {0, 1, 0}, {0, 0, 1}, oc::unit(V3{1, 2, 3}), oc::sunEci};
    for (const V3& d : dirs) worstDay = std::fmax(worstDay, oc::norm(oc::siteDir(d, day) - oc::siteDir(d, 0)) / (16 * U));
    std::printf("  %ld steps; worst, in units of each bound: position %.3f, latitude %.3f, longitude %.3f, height %.3f, |q| %.3f, axes %.3f,\n"
                "  angles %.3f, the Ring's axes %.3f, the Sun %.3f, the second copy %.3f, a sidereal day %.3f; a step late misses by %.2f m\n",
                n, worstPos, worstLat, worstLon, worstAlt, worstQ, worstAxes, worstAngles, worstRing, worstSun, worstCopy, worstDay, nearestLate);
    CHECK(worstPos <= 1, "the site position comes back %.3g bounds off", worstPos);
    CHECK(worstLat <= 1 && worstLon <= 1 && worstAlt <= 1, "latitude %.3g, longitude %.3g, height %.3g bounds off", worstLat, worstLon, worstAlt);
    CHECK(worstQ <= 1 && worstAxes <= 1, "the site quaternion: |q| %.3g, axes %.3g bounds off", worstQ, worstAxes);
    CHECK(worstAngles <= 1, "heading, pitch and roll %.3g bounds off", worstAngles);
    CHECK(worstRing <= 1, "the Ring's axes %.3g bounds off", worstRing);
    CHECK(worstSun <= 1, "the Sun moved among the stars: %.3g bounds", worstSun);
    CHECK(worstCopy <= 1, "the core's two transforms part: %.3g bounds", worstCopy);
    CHECK(worstDay <= 1, "a sidereal day does not bring the frame back: %.3g bounds", worstDay);
    CHECK(nearestLate > 1, "a step late still comes back within %.3g m", nearestLate);
}

// Every readout is computed from the state when it is read, none kept apart to drift. Recomputed here
// from the inertial position and velocity and orbit_core.h's definitions, they agree to rounding through
// the crew's flight, its approach and the hold: height, speeds, Mach, dynamic pressure, the orbit's top,
// bottom and inclination, mass, time and the window. The Ring stays on a round 500 km orbit at Kepler's
// rate (vcirc-500km), its axis fixed among the stars and its reference turning at OC_RING_SPIN; the
// range, closing rate, relative velocity and hold point's range follow from it. A craft holding off the
// hub reads n x 650 m = 0.72 m/s against the frame turning with the Ring's orbit (hold-vrel). Standing,
// the felt acceleration is gravity less the Earth's turn (felt-g); in orbit it is the thin air's next to
// nothing. And reading changes nothing: a step of none, or a second read, gives the same numbers and hash.
void readoutsAreDerived() {
    const SiteAxes S;
    const double R = RE + 500000.0, nRing = std::sqrt(MU / (R * R * R));
    // the Ring's orbit normal, from two of its places twenty seconds apart
    oc_reset(LAT, LON, HDG);
    const V3 ring0 = S.toInertial(V3{get(OC_RING_E), get(OC_RING_N), get(OC_RING_U)}, 0, true);
    const V3 axis0 = S.toInertial(V3{get(OC_RING_AX_E), get(OC_RING_AX_N), get(OC_RING_AX_U)}, 0, false);
    oc_step(1000);
    const V3 normal = oc::unit(oc::cross(ring0, S.toInertial(V3{get(OC_RING_E), get(OC_RING_N), get(OC_RING_U)}, get(OC_T), true)));
    double worst[12] = {0};   // in units of each bound
    const char* what[12] = {"time and window", "height", "speeds", "Mach and pressure", "top and bottom", "inclination", "mass",
                            "the Ring's radius and rate", "the Ring's axis and spin", "range and rate", "relative velocity", "hold point"};
    long n = 0;
    double lastT = -1;
    V3 lastRing{0, 0, 0}, lastRef{0, 0, 0};
    auto up = [&](int k, double ratio) { if (!(ratio <= worst[k])) worst[k] = ratio; };
    auto check = [&](long steps) {
        const double t = get(OC_T);
        const V3 r = eciR(), v = eciV();
        up(0, std::fmax(std::fabs(t - steps * H), std::fabs(get(OC_WINDOW) - (oc::T_GO - t))) / (4 * U * (t + 1)));
        up(1, std::fabs(oc::norm(r) - RE - get(OC_ALT)) / (4 * U * oc::norm(r)));
        const V3 vAir = v - oc::cross(V3{0, 0, WE}, r);
        const double tas = oc::norm(vAir), sv = 8 * U * (oc::norm(v) + 1);
        up(2, std::fmax(std::fabs(oc::norm(v) - get(OC_VORB)), std::fmax(std::fabs(oc::dot(v, oc::unit(r)) - get(OC_VS)), std::fabs(tas - get(OC_TAS)))) / sv);
        double rho, p, temp, a;
        oc_atmosphere(oc::norm(r) - RE, &rho, &p, &temp, &a);
        up(3, std::fmax(std::fabs(tas / a - get(OC_MACH)) / (8 * U * (tas / a + 1e-300)), std::fabs(0.5 * rho * tas * tas - get(OC_QBAR)) / (8 * U * (get(OC_QBAR) + 1e-300))));
        const double energy = energyOf(r, v);
        const V3 h = oc::cross(r, v);
        if (energy < 0) {
            const double sma = -MU / (2 * energy), ecc = std::sqrt(std::fmax(0.0, 1 + 2 * energy * oc::dot(h, h) / (MU * MU)));
            const double tol = 16 * U * sma * (1 + 1 / std::fmax(ecc, 1e-12));   // e from 1 + 2 E h^2 / mu^2 loses digits as e goes to 0
            up(4, std::fmax(std::fabs(sma * (1 + ecc) - RE - get(OC_APO)), std::fabs(sma * (1 - ecc) - RE - get(OC_PERI))) / tol);
        }
        up(5, std::fabs(std::acos(h.z / oc::norm(h)) * 180 / PI - get(OC_INC_DEG)) / (64 * U * 180 / PI / std::fmax(std::sin(get(OC_INC_DEG) * PI / 180), 1e-3)));
        up(6, std::fabs(get(OC_MASS) - (oc::M_DRY + get(OC_PROP))) / (U * oc::M_DRY));
        // the Ring
        const V3 ringI = S.toInertial(V3{get(OC_RING_E), get(OC_RING_N), get(OC_RING_U)}, t, true);
        const V3 axisI = S.toInertial(V3{get(OC_RING_AX_E), get(OC_RING_AX_N), get(OC_RING_AX_U)}, t, false);
        const V3 refI = S.toInertial(V3{get(OC_RING_REF_E), get(OC_RING_REF_N), get(OC_RING_REF_U)}, t, false);
        double ratio = std::fabs(oc::norm(ringI) - R) / (32 * U * R);
        if (lastT >= 0) {   // the angles the Ring turned and spun since the last check; the core's own
            const double dt = t - lastT;   // angles, rate t and spin t, carry a rounding of u of themselves
            const double turned = std::atan2(oc::dot(oc::cross(lastRing, ringI), normal), oc::dot(lastRing, ringI));
            ratio = std::fmax(ratio, std::fabs(turned - nRing * dt) / (64 * U + 8 * U * nRing * (t + 1000)));
            const double spun = std::atan2(oc::dot(oc::cross(lastRef, refI), axisI), oc::dot(lastRef, refI));
            up(8, std::fabs(spun - OC_RING_SPIN * dt) / (64 * U + 8 * U * OC_RING_SPIN * t));
        }
        up(7, ratio);
        up(8, oc::norm(axisI - axis0) / (32 * U));
        const V3 vRing = oc::cross(normal, ringI) * nRing;
        const V3 dr = ringI - r, dv = vRing - v;
        const double range = oc::norm(dr), sr = 32 * U * (oc::norm(r) + 1);
        up(9, std::fabs(range - get(OC_RING_RANGE)) / sr);
        if (range > 1) up(9, std::fabs(oc::dot(dr, dv) / range - get(OC_RING_RATE)) / (64 * U * (oc::norm(v) + oc::norm(vRing)) + 64 * U * oc::norm(r) * oc::norm(dv) / range));
        const V3 vrel = S.toSite(v - vRing - oc::cross(normal * nRing, r - ringI), t);
        up(10, oc::norm(vrel - V3{get(OC_VREL_E), get(OC_VREL_N), get(OC_VREL_U)}) / (64 * U * (oc::norm(v) + nRing * oc::norm(r))));
        up(11, std::fabs(oc::norm(ringI - axisI * (OC_HUB_PORT_M + OC_STANDOFF_M) - r) - get(OC_PORT_RANGE)) / sr);
        lastT = t;
        lastRing = ringI;
        lastRef = refI;
        ++n;
    };
    oc_reset(LAT, LON, HDG);
    long steps = 0;
    check(steps);
    while (get(OC_PHASE) != OC_PH_ORBIT) {
        oc_step(1);
        check(++steps);
        if (get(OC_CRASHED) > 0 || get(OC_T) > 1500) { CHECK(false, "no orbit"); return; }
    }
    oc_step(500);
    steps += 500;
    double coastG = 0;   // in orbit, the crew pointing at the Ring: the thin air alone pushes
    for (int i = 0; i < 1000; ++i) { oc_step(1); check(++steps); coastG = std::fmax(coastG, get(OC_G)); }
    oc_auto(OC_AUTO_APPROACH);
    double heldAt = -1;
    for (int i = 0; i < 60000; ++i) {
        oc_step(5);
        steps += 5;
        check(steps);
        if (heldAt < 0 && get(OC_PORT_RANGE) < 1) heldAt = get(OC_T);
    }
    const double vrel = std::sqrt(get(OC_VREL_E) * get(OC_VREL_E) + get(OC_VREL_N) * get(OC_VREL_N) + get(OC_VREL_U) * get(OC_VREL_U));
    std::printf("  %ld checks; worst, in units of each bound:", n);
    for (int k = 0; k < 12; ++k) std::printf("%s %s %.3f", k % 4 ? "," : "\n   ", what[k], worst[k]);
    std::printf("\n  held off the hub from %.0f s: %.4f m/s against the turning frame, n x 650 m = %.4f; coasting at %.2e g\n", heldAt, vrel,
                nRing * (OC_HUB_PORT_M + OC_STANDOFF_M), coastG);
    for (int k = 0; k < 12; ++k) CHECK(worst[k] <= 1, "%s: %.3g bounds off", what[k], worst[k]);
    CHECK(heldAt > 0 && std::fabs(vrel - nRing * (OC_HUB_PORT_M + OC_STANDOFF_M)) < 0.01, "holding, the relative speed reads %.4f m/s", vrel);
    // the thin air at 500 km: 1/2 rho v^2 S c_d / m, with c_d under 0.1, is under 7e-10 g
    CHECK(coastG < 1e-9, "coasting, the felt acceleration is %.3g g", coastG);
    // reading changes nothing
    double copy[OC_COUNT];
    std::memcpy(copy, oc_out(), sizeof copy);
    const unsigned h0 = oc_hash();
    double rr[3], vv[3], rho, p, temp, a;
    oc_eci(rr, vv);
    oc_atmosphere(12345, &rho, &p, &temp, &a);
    oc_step(0);
    oc_walk_step(7);
    CHECK(std::memcmp(copy, oc_out(), sizeof copy) == 0 && oc_hash() == h0, "a read changed the state or the readouts");
    // standing on the runway: gravity less the Earth's turn, against the plumb-line ground
    oc_reset(LAT, LON, HDG);
    oc_auto(OC_AUTO_OFF);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 1, 1);
    oc_step(1500);
    const V3 r = eciR();
    const V3 spin = oc::cross(V3{0, 0, WE}, oc::cross(V3{0, 0, WE}, r));
    const double felt = oc::norm(spin + r * (MU / std::pow(oc::norm(r), 3))) / G0;
    std::printf("  standing: %.6f g; gravity less the Earth's turn %.6f g\n", get(OC_G), felt);
    CHECK(std::fabs(get(OC_G) - felt) < 1e-4, "standing, the felt acceleration is %.6f g against %.6f", get(OC_G), felt);
}

// ---- replay ---------------------------------------------------------------------------------------

// A digest of every field of the state and of the pilot's hands, which persist from one step to the
// next: what replay must reproduce, a superset of what oc_hash folds in.
unsigned digest() {
    const oc::State& s = oc::g;
    const oc::Controls& c = oc::hands;
    const double d[] = {(double)s.n, s.r.x, s.r.y, s.r.z, s.v.x, s.v.y, s.v.z, s.q.w, s.q.x, s.q.y, s.q.z, s.w.x, s.w.y, s.w.z, s.prop, s.thr,
                        (double)s.gear, (double)s.onGround, (double)s.crashed, (double)s.autoMode, (double)s.sas, (double)s.phase, (double)s.atmoLaw,
                        s.thetaT, s.phiT, s.pegF0, s.pegF1, s.pegT, s.pegAt, (double)s.pegValid, s.hold.w, s.hold.x, s.hold.y, s.hold.z,
                        (double)s.holdValid, s.torque.x, s.torque.y, s.torque.z, s.rcs.x, s.rcs.y, s.rcs.z, s.steer, s.brake, (double)s.ret.phase,
                        (double)s.dock.held, (double)s.dock.phase, (double)s.dock.contact, (double)s.dock.released, (double)s.dock.verdict,
                        (double)s.dock.hit, (double)s.dock.hitPart, (double)s.dock.refused, (double)s.dock.autoBefore, (double)s.dock.heldAt,
                        s.dock.p0.x, s.dock.p0.y, s.dock.p0.z, s.dock.q0.w, s.dock.q0.x, s.dock.q0.y, s.dock.q0.z, s.dock.gHold, s.dock.cT,
                        s.dock.cSpeed, s.dock.cOffset, s.dock.cSlide, s.dock.cAngle, s.dock.cRoll, s.dock.cRollRate, c.pitch, c.roll, c.yaw, c.throttle, c.tx, c.ty, c.tz, (double)c.gearDown, c.brake};
    unsigned h = 2166136261u;
    oc::hashDoubles(h, d, (int)(sizeof d / sizeof d[0]));
    return h;
}

// What a page sends, step by step: at a step, before it, the controls, a crew mode or a hold mode.
struct Act { long at; int what; double a[9]; };   // what: 0 controls, 1 oc_auto, 2 oc_sas

const Act SCRIPT[] = {
    {16000, 1, {OC_AUTO_OFF}},
    {16000, 0, {0.2, -0.3, 0.1, 1, 0, 0, 0, 0, 0}},   // the pilot takes it at 320 s and pulls
    {16500, 2, {OC_SAS_PROGRADE}},
    {16500, 0, {0, 0, 0, 1, 0, 0, 0, 0, 0}},
    {17000, 1, {OC_AUTO_CREW}},                       // the crew picks it up where it is
    {45000, 1, {OC_AUTO_APPROACH}},
    {60000, 1, {OC_AUTO_OFF}},
    {60000, 2, {OC_SAS_TARGET}},
    {60000, 0, {0, 0, 0, 0, 1, 0, 0, 0, 0}},
    {60500, 0, {0, 0.4, 0, 0, 0, 0.5, -0.5, 0, 0}},
    {61000, 0, {0, 0, 0, 0, 0, 0, 0, 0, 0}},
};
const int SCRIPT_LEN = sizeof SCRIPT / sizeof SCRIPT[0];
const long REPLAY_END = 64000, REPLAY_EVERY = 4000;

struct Mark {
    long at;
    unsigned hash, digest;
    double out[OC_COUNT], r[3], v[3];
};

Mark markNow(long at) {
    Mark m;
    m.at = at;
    m.hash = oc_hash();
    m.digest = digest();
    std::memcpy(m.out, oc_out(), sizeof m.out);
    oc_eci(m.r, m.v);
    return m;
}

bool sameMark(const Mark& a, const Mark& b) {
    return a.at == b.at && a.hash == b.hash && a.digest == b.digest && std::memcmp(a.out, b.out, sizeof a.out) == 0 && std::memcmp(a.r, b.r, sizeof a.r) == 0 &&
           std::memcmp(a.v, b.v, sizeof a.v) == 0;
}

void apply(const Act& a) {
    if (a.what == 0) oc_controls(a.a[0], a.a[1], a.a[2], a.a[3], a.a[4], a.a[5], a.a[6], (int)a.a[7], a.a[8]);
    else if (a.what == 1) oc_auto((int)a.a[0]);
    else oc_sas((int)a.a[0]);
}

// Everything a page may read between steps; none of it may change the flight.
void readEverything() {
    double r[3], v[3], rho, p, t, a;
    (void)oc_out(); (void)oc_out_len(); (void)oc_hash(); oc_eci(r, v); oc_atmosphere(7777, &rho, &p, &t, &a);
    (void)oc_dock_out(); (void)oc_return_out(); oc_step(0); oc_walk_step(3); (void)oc_walk_hash();
}

// Fly the script from step `from` (the core already there) to `until`, marking each multiple of
// REPLAY_EVERY before that step's inputs. With `pieces`, the steps go in pieces of pseudo-random size,
// with everything read between them.
void fly(const Act* script, int len, long from, long until, std::vector<Mark>& marks, bool pieces, unsigned seed) {
    long n = from;
    unsigned x = seed;
    while (true) {
        if (n % REPLAY_EVERY == 0) marks.push_back(markNow(n));
        if (n >= until) break;
        for (int i = 0; i < len; ++i) if (script[i].at == n) apply(script[i]);
        long next = std::min(until, (n / REPLAY_EVERY + 1) * REPLAY_EVERY);
        for (int i = 0; i < len; ++i) if (script[i].at > n && script[i].at < next) next = script[i].at;
        for (long todo = next - n; todo > 0;) {
            long piece = todo;
            if (pieces) {
                x = x * 1103515245u + 12345u;
                piece = std::min(todo, 1 + (long)((x >> 16) % 997));
            }
            oc_step((int)piece);
            todo -= piece;
            if (pieces) readEverything();
        }
        n = next;
    }
}

// The same inputs give the same flight, bit for bit, however it is stepped: in one call between inputs,
// in pieces with everything read between them, or stopped part way, the core used for another flight,
// and resumed by re-stepping the inputs from the start. Compared at every mark: the hash, a digest of
// every field of the state, every readout and the inertial state. The comparison can fail: one throttle
// setting of 0.999 for 1 parts the flights.
void replayAndResume() {
    std::vector<Mark> straight, pieces, before, resumed, prefix, other;
    oc_reset(LAT, LON, HDG);
    fly(SCRIPT, SCRIPT_LEN, 0, REPLAY_END, straight, false, 0);
    oc_reset(LAT, LON, HDG);
    fly(SCRIPT, SCRIPT_LEN, 0, REPLAY_END, pieces, true, 12345);
    const long K = 7 * REPLAY_EVERY;   // stop here, at a mark, in the middle of the burn to orbit
    oc_reset(LAT, LON, HDG);
    fly(SCRIPT, SCRIPT_LEN, 0, K, before, false, 0);
    oc_reset(0, 0, 90);   // the core flies something else meanwhile
    oc_auto(OC_AUTO_OFF);
    oc_controls(1, 1, 1, 1, 1, 1, 1, 0, 1);
    oc_step(3000);
    oc_reset(LAT, LON, HDG);   // and the flight resumes by re-stepping
    fly(SCRIPT, SCRIPT_LEN, 0, K, prefix, false, 0);
    resumed.clear();
    fly(SCRIPT, SCRIPT_LEN, K, REPLAY_END, resumed, false, 0);
    resumed.erase(resumed.begin());   // its first mark is the prefix's last
    resumed.insert(resumed.begin(), prefix.begin(), prefix.end());
    Act changed[SCRIPT_LEN];
    std::memcpy(changed, SCRIPT, sizeof changed);
    changed[1].a[3] = 0.999;
    oc_reset(LAT, LON, HDG);
    fly(changed, SCRIPT_LEN, 0, REPLAY_END, other, false, 0);
    auto agree = [](const std::vector<Mark>& a, const std::vector<Mark>& b, long* firstApart) {
        *firstApart = -1;
        if (a.size() != b.size()) return false;
        for (size_t i = 0; i < a.size(); ++i)
            if (!sameMark(a[i], b[i])) { *firstApart = a[i].at; return false; }
        return true;
    };
    long apart = -1;
    std::printf("  %zu marks to step %ld (t %.0f s, phase %.0f, %s): final hash %08x, digest %08x\n", straight.size(), REPLAY_END, straight.back().out[OC_T],
                straight.back().out[OC_PHASE], straight.back().out[OC_CRASHED] > 0 ? "crashed" : "flying", straight.back().hash, straight.back().digest);
    CHECK(straight.size() == (size_t)(REPLAY_END / REPLAY_EVERY + 1) && straight.back().out[OC_CRASHED] == 0, "the script's flight: %zu marks", straight.size());
    CHECK(agree(straight, pieces, &apart), "stepped in pieces, with reads between, the flight parts at step %ld", apart);
    CHECK(before.size() == prefix.size() && agree(before, prefix, &apart), "re-stepped to the stop, the flight parts at step %ld", apart);
    CHECK(agree(straight, resumed, &apart), "stopped and resumed, the flight parts at step %ld", apart);
    CHECK(!agree(straight, other, &apart) && apart > 16000 && apart <= 20000, "a throttle of 0.999 for 1 parts the flight at step %ld", apart);
    std::printf("  a throttle of 0.999 for 1 at step 16000 parts the flights at the mark of step %ld\n", apart);
}

// ---- finiteness ---------------------------------------------------------------------------------------

struct Scan {
    long steps = 0, bad = 0;
    const char* where = nullptr;
    int index = -1;
    double at = 0;
    void operator()() {
        int i;
        const char* b = firstNonFinite(&i);
        if (!b && !std::isfinite(oc_walk_out()[OC_WALK_T])) { b = "oc_walk_out"; i = OC_WALK_T; }
        if (b) { if (!bad) { where = b; index = i; at = get(OC_T); } ++bad; }
        ++steps;
    }
};

// No readout of any block is ever NaN or infinite through the crew's whole flight: the hold, the
// take-off, the climb, the ascent, the burn to orbit, the approach to the hub and three hours holding
// there. Every step is scanned.
void crewFlightFinite() {
    Scan scan;
    oc_reset(LAT, LON, HDG);
    scan();
    while (get(OC_PHASE) != OC_PH_ORBIT) {
        oc_step(1);
        scan();
        if (get(OC_CRASHED) > 0 || get(OC_T) > 1500) { CHECK(false, "no orbit"); return; }
    }
    oc_auto(OC_AUTO_APPROACH);
    const double until = get(OC_T) + 3 * 3600;
    while (get(OC_T) < until) { oc_step(1); scan(); }
    std::printf("  %ld steps to %.0f s, %ld with a readout not finite; held %.2f m off the hold point\n", scan.steps, get(OC_T), scan.bad, get(OC_PORT_RANGE));
    CHECK(scan.bad == 0, "%s[%d] not finite at %.2f s, and %ld steps in all", scan.where, scan.index, scan.at, scan.bad);
    CHECK(get(OC_PORT_RANGE) < 5, "the crew holds %.1f m off the hold point", get(OC_PORT_RANGE));
}

struct Rng {
    unsigned long long x;
    double next() { x = x * 6364136223846793005ULL + 1442695040888963407ULL; return (double)(x >> 11) / 9007199254740992.0; }
};

// A control as a careless or broken hand gives it: in range, at a stop, nothing, far out, or infinite.
double wild(Rng& r) {
    const double k = r.next(), sign = r.next() < 0.5 ? -1 : 1;
    if (k < 0.5) return r.next() * 2 - 1;
    if (k < 0.7) return sign;
    if (k < 0.8) return 0;
    if (k < 0.9) return sign * 1e308;
    return sign * std::numeric_limits<double>::infinity();
}

// A scenario: where the abuse starts, flown again from the start after every crash, so that the abuse
// is of a craft that flies and not of a wreck.
struct Abuse {
    Rng r{20261112};
    Scan scan;
    long crashes = 0, alive = 0;
    void run(void (*start)(Scan&), long steps) {
        start(scan);
        for (long left = steps; left > 0;) {
            const long piece = 1 + (long)(r.next() * 150);
            oc_controls(wild(r), wild(r), wild(r), r.next() < 0.3 ? wild(r) : r.next(), wild(r), wild(r), wild(r), r.next() < 0.5,
                        r.next() < 0.3 ? wild(r) : (r.next() < 0.5 ? 1 : 0));
            if (r.next() < 0.1) oc_sas((int)(r.next() * 8) - 2);    // OC_SAS_* and modes that do not exist
            if (r.next() < 0.05) oc_auto((int)(r.next() * 8) - 1);  // OC_AUTO_* and modes that do not exist
            for (long i = 0; i < piece && left > 0; ++i, --left) {
                oc_step(1);
                scan();
                if (get(OC_CRASHED) > 0) {
                    ++crashes;
                    for (int k = 0; k < 50; ++k) { oc_step(1); scan(); }   // the wreck reads out too
                    start(scan);
                    break;
                }
                ++alive;
            }
        }
    }
};

void onTheRunway(Scan& scan) { oc_reset(LAT, LON, HDG); oc_auto(OC_AUTO_OFF); scan(); }
void inTheAir(Scan& scan) { oc_reset(LAT, LON, HDG); while (get(OC_T) < 60) { oc_step(1); scan(); } oc_auto(OC_AUTO_OFF); }
void highAndFast(Scan& scan) { oc_reset(LAT, LON, HDG); while (get(OC_PHASE) < OC_PH_INSERT) { oc_step(1); scan(); } oc_auto(OC_AUTO_OFF); }
void inOrbit(Scan& scan) { oc_reset(LAT, LON, HDG); while (get(OC_PHASE) != OC_PH_ORBIT && get(OC_T) < 1500) { oc_step(1); scan(); } }
void overThePole(Scan& scan) { oc_reset(90, 0, 0); for (int i = 0; i < 20000; ++i) { oc_step(1); scan(); } oc_auto(OC_AUTO_OFF); }
void overTheSouthPole(Scan& scan) { oc_reset(-90, 45, 180); for (int i = 0; i < 20000; ++i) { oc_step(1); scan(); } oc_auto(OC_AUTO_OFF); }
void onTheEquator(Scan& scan) { oc_reset(0, 180, 270); for (int i = 0; i < 20000; ++i) { oc_step(1); scan(); } oc_auto(OC_AUTO_OFF); }

// A pilot who does everything wrong: the stick, the pedals and the thrusters from stop to stop and far
// beyond (the core clamps them), the throttle slammed, the gear and brakes cycled, the hold and the crew's
// modes switched at random and modes that do not exist asked for. On the runway, in the thick of the air,
// high and fast, in orbit, on a path that leaves the Earth for good, and from the poles and the equator
// (where the crew is flown at reset to place the Ring, and again after); through crashes, after each of
// which the scenario starts again. Every readout of every block stays finite at every step.
void abuseFinite() {
    Abuse a;
    a.run(onTheRunway, 30000);
    a.run(inTheAir, 30000);
    a.run(highAndFast, 30000);
    a.run(inOrbit, 60000);
    a.run(overThePole, 10000);
    a.run(overTheSouthPole, 10000);
    a.run(onTheEquator, 10000);
    oc_reset(LAT, LON, HDG);   // leaving: the pilot takes it at 350 s and burns everything prograde
    while (get(OC_T) < 350) { oc_step(1); a.scan(); }
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PROGRADE);
    oc_controls(0, 0, 0, 1, 0, 0, 0, 0, 0);
    while (get(OC_PROP) > 0 && get(OC_CRASHED) == 0) { oc_step(1); a.scan(); }
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (int i = 0; i < 50000; ++i) { oc_step(1); a.scan(); }
    const double escape = energyOf(eciR(), eciV());
    std::printf("  %ld steps, %ld of them abused in flight; %ld crashes; the path out at %+.4e J/kg; %ld steps with a readout not finite\n", a.scan.steps,
                a.alive, a.crashes, escape, a.scan.bad);
    CHECK(a.scan.bad == 0, "%s[%d] not finite at %.2f s, and %ld steps in all", a.scan.where, a.scan.index, a.scan.at, a.scan.bad);
    CHECK(a.crashes > 0 && a.alive > 100000 && escape > 0, "the abuse did not go where it says: %ld crashes, %ld steps alive, %.4e J/kg on the way out",
          a.crashes, a.alive, escape);
}

// The Ring's numbers are one set (orbit_core.h's OC_RING_* and OC_HUB_*, which web/test/core.test.mjs
// holds the page's equal to), and they are the shape README.md describes: one g at the floor (ring-g),
// a turn in 142 s (ring-turn), a roof 300 m over the floor, the hull outside it, the rim walls' inner edge
// under the roof, the hub inside them, six spokes, and the approach's hold point clear of the band.
void ringShape() {
    const double g = OC_RING_SPIN * OC_RING_SPIN * OC_RING_FLOOR_M / G0;
    CHECK(std::fabs(g - 1) < 1e-3, "the floor at %.5f g", g);
    CHECK(std::fabs(2 * PI / OC_RING_SPIN - 142) < 0.5, "a turn in %.3f s", 2 * PI / OC_RING_SPIN);
    CHECK(oc::RING_SPIN == OC_RING_SPIN, "the core spins the Ring at %.6g, the header says %.6g", oc::RING_SPIN, OC_RING_SPIN);
    CHECK(OC_RING_FLOOR_M - OC_RING_ROOF_M == 300, "the roof %.0f m over the floor", OC_RING_FLOOR_M - OC_RING_ROOF_M);
    CHECK(OC_RING_HULL_M > OC_RING_FLOOR_M && OC_RING_RIM_M < OC_RING_ROOF_M && OC_HUB_RADIUS_M < OC_RING_RIM_M, "hull %.0f, floor %.0f, roof %.0f, rim %.0f, hub %.0f",
          OC_RING_HULL_M, OC_RING_FLOOR_M, OC_RING_ROOF_M, OC_RING_RIM_M, OC_HUB_RADIUS_M);
    CHECK(OC_RING_SPOKES == 6 && OC_RING_SPOKE_M < OC_RING_WIDTH_M, "%d spokes of %.0f m", OC_RING_SPOKES, OC_RING_SPOKE_M);
    CHECK(OC_HUB_PORT_M > OC_HUB_RADIUS_M / 2 && OC_HUB_PORT_M + OC_STANDOFF_M > OC_RING_WIDTH_M / 2, "the hold point %.0f m out, the band %.0f m to a side",
          OC_HUB_PORT_M + OC_STANDOFF_M, OC_RING_WIDTH_M / 2);
    std::printf("  the floor at %.5f g, a turn in %.2f s; the hold point %.0f m out along the axis, the band's face at %.0f m\n", g, 2 * PI / OC_RING_SPIN,
                OC_HUB_PORT_M + OC_STANDOFF_M, OC_RING_WIDTH_M / 2);
}

// ---- the defects: each test states an invariant the core breaks today -----------------------------

// The hash is the state's (orbit_core.h: "a hash of the whole state"): equal hashes, equal futures. Who
// flies, what the hold points at and the pilot's hands all decide the future; a change of any must change
// the hash. Today oc_hash folds in the position, velocity, attitude, rates, propellant, thrust, phase and
// the crash only: a crew and a pilot in the same place hash alike, and then part.
void hashCoversTheState() {
    struct Case { const char* what; int kind; };
    const Case cases[] = {{"who flies (oc_auto)", 0}, {"what the hold points at (oc_sas)", 1}, {"the pilot's hands (oc_controls)", 2}};
    for (const Case& c : cases) {
        unsigned now[2], later[2];
        for (int branch = 0; branch < 2; ++branch) {
            if (!crewToOrbit()) { CHECK(false, "no orbit"); return; }
            oc_step(500);
            if (c.kind > 0) { oc_auto(OC_AUTO_OFF); oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0); oc_step(500); }
            if (branch == 1) {
                if (c.kind == 0) oc_auto(OC_AUTO_OFF);
                else if (c.kind == 1) oc_sas(OC_SAS_RETROGRADE);
                else oc_controls(0, 0, 0, 1, 0, 0, 0, 0, 0);
            }
            now[branch] = oc_hash();
            oc_step(2000);
            later[branch] = oc_hash();
        }
        std::printf("  %s: %08x and %08x now; %08x and %08x 40 s on\n", c.what, now[0], now[1], later[0], later[1]);
        CHECK(now[0] != now[1] || later[0] == later[1], "%s: equal hashes (%08x), then %08x and %08x", c.what, now[0], later[0], later[1]);
    }
}

// A control that is not a number is refused, as the house rule refuses a write outside its range: the
// call is a no-op. Today the NaN reaches the state, and every readout is NaN from then until a reset. Each
// of the eight controls in turn, with the pilot flying, on the runway and in the air a minute after brake
// release (the brake acts only through the wheels, the roll target only off them).
void nonfiniteControlsRefused() {
    const double nan = std::numeric_limits<double>::quiet_NaN();
    const char* names[] = {"pitch", "roll", "yaw", "throttle", "tx", "ty", "tz", "brake"};
    const double c[8] = {0.1, -0.1, 0.05, 0.8, 0.2, 0, 0, 0.5};
    for (int air = 0; air < 2; ++air) {
        auto start = [&]() {
            oc_reset(LAT, LON, HDG);
            if (air) oc_step(3000);   // the crew has it off the ground and climbing
            oc_auto(OC_AUTO_OFF);
            oc_controls(c[0], c[1], c[2], c[3], c[4], c[5], c[6], !air, c[7]);
            oc_step(100);
        };
        start();
        oc_step(100);
        const unsigned clean = oc_hash();
        for (int k = 0; k < 8; ++k) {
            double d[8];
            std::memcpy(d, c, sizeof d);
            d[k] = nan;
            start();
            oc_controls(d[0], d[1], d[2], d[3], d[4], d[5], d[6], !air, d[7]);
            oc_step(100);
            int i = -1;
            const char* bad = firstNonFinite(&i);
            std::printf("  %s, a NaN %s: %s; hash %08x, without it %08x\n", air ? "in the air" : "on the runway", names[k], bad ? "readouts not finite" : "the readouts finite",
                        oc_hash(), clean);
            CHECK(!bad && oc_hash() == clean, "%s, a NaN %s was not refused: %s[%d]", air ? "in the air" : "on the runway", names[k], bad ? bad : "-", i);
        }
    }
}

// On a path that leaves the Earth for good, the periapsis read out is the hyperbola's, h^2/(mu (1 + e))
// above the sphere. Today orbitOf writes the parabola's, h^2/(2 mu), which is (1 + e)/2 times as far out.
void escapePeriapsis() {
    oc_reset(LAT, LON, HDG);
    while (get(OC_T) < 350) oc_step(1);
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PROGRADE);
    oc_controls(0, 0, 0, 1, 0, 0, 0, 0, 0);
    while (get(OC_PROP) > 0 && get(OC_CRASHED) == 0) oc_step(1);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(50);
    const V3 r = eciR(), v = eciV();
    const double energy = energyOf(r, v), h2 = oc::dot(oc::cross(r, v), oc::cross(r, v));
    if (!(energy > 0)) { CHECK(false, "not leaving: %.4e J/kg", energy); return; }
    const double ecc = std::sqrt(1 + 2 * energy * h2 / (MU * MU)), peri = h2 / (MU * (1 + ecc)) - RE;
    std::printf("  leaving at %+.4e J/kg, e = %.5f: the periapsis reads %.3f km, the hyperbola's is %.3f km; the top reads %.3g m\n", energy, ecc,
                get(OC_PERI) / 1000, peri / 1000, get(OC_APO));
    CHECK(std::fabs(get(OC_PERI) - peri) <= 1, "the periapsis reads %.3f km, the hyperbola's is %.3f km", get(OC_PERI) / 1000, peri / 1000);
}

}   // namespace

namespace {

struct Test { const char* name; void (*fn)(); bool defect; };
const Test tests[] = {
    {"certified_numbers", certifiedNumbers, false},
    {"vacuum_conserves", vacuumConserves, false},
    {"thin_air_ledger", thinAirLedger, false},
    {"ascent_work_energy", ascentWorkEnergy, false},
    {"mass_bookkeeping", massBookkeeping, false},
    {"frames_round_trip", framesRoundTrip, false},
    {"readouts_are_derived", readoutsAreDerived, false},
    {"replay_and_resume", replayAndResume, false},
    {"crew_flight_finite", crewFlightFinite, false},
    {"abuse_finite", abuseFinite, false},
    {"ring_shape", ringShape, false},
    {"hash_covers_the_state", hashCoversTheState, true},
    {"nonfinite_controls_refused", nonfiniteControlsRefused, true},
    {"escape_periapsis", escapePeriapsis, true},
};

}   // namespace

// No argument runs every test that ctest runs; a name runs that test, a defect's included; "defects" runs
// the defects' tests, each of which fails while its defect stands.
int main(int argc, char** argv) {
    int ran = 0;
    for (const Test& t : tests) {
        const bool all = argc < 2, defects = argc > 1 && std::strcmp(argv[1], "defects") == 0;
        if (all ? t.defect : defects ? !t.defect : std::strcmp(argv[1], t.name) != 0) continue;
        const int before = failures;
        std::printf("%s%s\n", t.name, t.defect ? " (a defect's test: it fails until the fix)" : "");
        t.fn();
        std::printf("  %s\n", failures == before ? "ok" : "FAILED");
        ++ran;
    }
    if (ran == 0) { std::printf("no test named %s\n", argc > 1 ? argv[1] : "?"); return 2; }
    return failures ? 1 : 0;
}
