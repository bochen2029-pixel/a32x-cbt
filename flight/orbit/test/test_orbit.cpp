// The sketch core's tests. Each states a piece of physics or a promise of the core, not how it is
// written. Run one by name (test_orbit atmosphere) or all (test_orbit); ctest runs each by name.
//
// TEST: atmosphere
// TEST: ground_settles
// TEST: deterministic
// TEST: crew_reaches_orbit
// TEST: kepler_holds
// TEST: rocket_equation
// TEST: attitude_hold
// TEST: hand_flown_takeoff
// TEST: thrusters_translate
// TEST: approach_holds
// TEST: crew_takes_over

#include "../core/orbit_core.h"

#include <cmath>
#include <cstdio>
#include <cstring>

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

const double MU = 3.986004418e14, RE = 6371000.0;
const double LAT = 32.91569901, LON = -97.02600098, HDG = 180.3;   // KDFW 17C, docs/provenance.md 1f

const double* out() { return oc_out(); }
double get(int i) { return oc_out()[i]; }
bool finite() {
    for (int i = 0; i < oc_out_len(); ++i)
        if (!std::isfinite(out()[i])) return false;
    return true;
}

double energy() {
    double r[3], v[3];
    oc_eci(r, v);
    const double rm = std::sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]);
    return (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) / 2 - MU / rm;
}

void angularMomentum(double* h) {
    double r[3], v[3];
    oc_eci(r, v);
    h[0] = r[1] * v[2] - r[2] * v[1];
    h[1] = r[2] * v[0] - r[0] * v[2];
    h[2] = r[0] * v[1] - r[1] * v[0];
}

// Fly the scripted crew to orbit; returns the seconds it took, or -1.
double crewToOrbit(double* maxQ = nullptr, double* maxG = nullptr) {
    oc_reset(LAT, LON, HDG);
    double q = 0, g = 0;
    while (get(OC_PHASE) != OC_PH_ORBIT) {
        oc_step(1);
        if (get(OC_CRASHED) > 0 || get(OC_T) > 1500 || !finite()) return -1;
        if (get(OC_QBAR) > q) q = get(OC_QBAR);
        if (get(OC_T) > 1 && get(OC_G) > g) g = get(OC_G);
    }
    if (maxQ) *maxQ = q;
    if (maxG) *maxG = g;
    return get(OC_T);
}

// ---- the tests ----------------------------------------------------------------------------------

// The 1976 standard atmosphere, against the standard's own table (geometric heights).
void atmosphere() {
    struct Row { double h, rho, p, t; };
    const Row rows[] = {
        {0, 1.2250, 101325, 288.15},   {5000, 0.73643, 54048, 255.68}, {11000, 0.36480, 22700, 216.77},
        {20000, 0.088910, 5529.3, 216.65}, {32000, 0.013555, 889.06, 228.49}, {50000, 1.0269e-3, 79.779, 270.65},
        {71000, 7.1965e-5, 4.4795, 216.85}, {80000, 1.8458e-5, 1.0524, 198.64},
    };
    for (const Row& r : rows) {
        double rho, p, t, a;
        oc_atmosphere(r.h, &rho, &p, &t, &a);
        CHECK(std::fabs(rho / r.rho - 1) < 0.005, "density at %.0f m: %.5g, table %.5g", r.h, rho, r.rho);
        CHECK(std::fabs(p / r.p - 1) < 0.005, "pressure at %.0f m: %.5g, table %.5g", r.h, p, r.p);
        CHECK(std::fabs(t - r.t) < 0.5, "temperature at %.0f m: %.2f, table %.2f", r.h, t, r.t);
    }
    double rho, p, t, a;
    oc_atmosphere(0, &rho, &p, &t, &a);
    CHECK(std::fabs(a - 340.29) < 0.1, "sound at sea level %.2f", a);
    // Above 86 km the core fits exponentials through the standard's densities at 86, 120, 200 and 500 km.
    const Row thin[] = {{100000, 5.604e-7, 0, 0}, {120000, 2.222e-8, 0, 0}, {200000, 2.541e-10, 0, 0}, {500000, 5.215e-13, 0, 0}};
    for (const Row& r : thin) {
        oc_atmosphere(r.h, &rho, &p, &t, &a);
        CHECK(std::fabs(rho / r.rho - 1) < 0.2, "density at %.0f km: %.4g, table %.4g", r.h / 1000, rho, r.rho);
    }
    double prev = 2;
    for (double h = 0; h <= 600000; h += 500) {   // and it never rises with height
        oc_atmosphere(h, &rho, &p, &t, &a);
        CHECK(rho > 0 && rho <= prev, "density at %.0f m: %.4g after %.4g", h, rho, prev);
        prev = rho;
    }
}

// Parked with the brakes on, the craft settles on its gear and stays put; the Earth turns under it,
// and it turns with the Earth.
void groundSettles() {
    oc_reset(LAT, LON, HDG);
    oc_auto(OC_AUTO_OFF);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 1, 1);
    oc_step(250);
    const double e0 = get(OC_SITE_E), n0 = get(OC_SITE_N), u0 = get(OC_SITE_U);
    oc_step(1500);
    CHECK(get(OC_ON_GROUND) > 0, "on the ground");
    CHECK(get(OC_CRASHED) == 0, "not crashed");
    CHECK(std::hypot(get(OC_SITE_E) - e0, get(OC_SITE_N) - n0) < 0.01, "moved %.4f m", std::hypot(get(OC_SITE_E) - e0, get(OC_SITE_N) - n0));
    CHECK(std::fabs(get(OC_SITE_U) - u0) < 0.002, "sank %.4f m", get(OC_SITE_U) - u0);
    CHECK(std::fabs(get(OC_PITCH_DEG)) < 0.5 && std::fabs(get(OC_ROLL_DEG)) < 0.1, "attitude %.2f %.2f", get(OC_PITCH_DEG), get(OC_ROLL_DEG));
    CHECK(std::fabs(get(OC_TAS)) < 0.01, "airspeed %.4f", get(OC_TAS));
    CHECK(std::fabs(get(OC_G) - 1) < 0.01, "felt %.4f g standing", get(OC_G));
    CHECK(finite(), "finite");
}

// The same inputs give the same state, step for step; a different input gives a different one.
void deterministic() {
    unsigned a[3], b[3];
    for (int run = 0; run < 2; ++run) {
        unsigned* h = run ? b : a;
        oc_reset(LAT, LON, HDG);
        oc_step(1500);
        h[0] = oc_hash();
        oc_auto(OC_AUTO_OFF);
        oc_controls(0.3, -0.2, 0.1, 0.8, 0, 0, 0, 1, 0);
        oc_step(2000);
        h[1] = oc_hash();
        oc_controls(-0.1, 0.4, 0, 1, 0, 0, 0, 0, 0);
        oc_step(3000);
        h[2] = oc_hash();
    }
    for (int i = 0; i < 3; ++i) CHECK(a[i] == b[i], "hash %d: %08x then %08x", i, a[i], b[i]);
    oc_reset(LAT, LON, HDG);
    oc_step(1500);
    oc_auto(OC_AUTO_OFF);
    oc_controls(0.3, -0.2, 0.1, 0.79, 0, 0, 0, 1, 0);
    oc_step(2000);
    CHECK(oc_hash() != a[1], "a different throttle, the same hash %08x", a[1]);
}

// The scripted crew takes off from 17C, flies the ascent and ends the burn in a round orbit at the
// ring's height, inclined as a launch due east from the field's latitude must be, with the ring
// waiting ahead.
void crewReachesOrbit() {
    double maxQ = 0, maxG = 0;
    const double t = crewToOrbit(&maxQ, &maxG);
    CHECK(t > 0, "reached orbit");
    if (t < 0) return;
    std::printf("  orbit at %.0f s: %.1f x %.1f km, %.2f deg, %.0f kg left, max q %.0f Pa, max %.2f g\n", t, get(OC_APO) / 1000,
                get(OC_PERI) / 1000, get(OC_INC_DEG), get(OC_PROP), maxQ, maxG);
    CHECK(t < 900, "took %.0f s", t);
    CHECK(std::fabs(get(OC_APO) - 500000) < 5000, "apoapsis %.1f km", get(OC_APO) / 1000);
    CHECK(std::fabs(get(OC_PERI) - 500000) < 5000, "periapsis %.1f km", get(OC_PERI) / 1000);
    CHECK(std::fabs(get(OC_INC_DEG) - LAT) < 0.5, "inclination %.2f", get(OC_INC_DEG));
    CHECK(get(OC_PROP) > 2000, "propellant left %.0f kg", get(OC_PROP));
    CHECK(maxQ < 40000, "max q %.0f Pa", maxQ);
    CHECK(maxG < 3.0, "max %.2f g", maxG);
    CHECK(get(OC_RING_RANGE) > 20000 && get(OC_RING_RANGE) < 30000, "ring at %.1f km", get(OC_RING_RANGE) / 1000);
    CHECK(std::fabs(get(OC_RING_RATE)) < 5, "ring closing at %.2f m/s", get(OC_RING_RATE));
    // The ring keeps station: five minutes on it is still in reach.
    oc_step(15000);
    CHECK(get(OC_RING_RANGE) > 15000 && get(OC_RING_RANGE) < 40000, "ring at %.1f km after 5 min", get(OC_RING_RANGE) / 1000);
}

// In orbit with the engine off, the energy and angular momentum of the orbit stay what they were for a
// whole revolution, and the revolution takes Kepler's period.
void keplerHolds() {
    if (crewToOrbit() < 0) { CHECK(false, "no orbit"); return; }
    oc_step(500);   // the engine's last thrust gone
    const double e0 = energy();
    double h0[3], h1[3];
    angularMomentum(h0);
    const double a = -MU / (2 * e0), period = 2 * M_PI * std::sqrt(a * a * a / MU);
    double r0[3], v0[3];
    oc_eci(r0, v0);
    const double start = get(OC_T);
    oc_step((int)std::floor(period / OC_DT) - 5);
    double back = 1e30, when = 0;   // the closest return, step by step
    for (int i = 0; i < 10; ++i) {
        oc_step(1);
        double r1[3], v1[3];
        oc_eci(r1, v1);
        const double d = std::sqrt((r1[0] - r0[0]) * (r1[0] - r0[0]) + (r1[1] - r0[1]) * (r1[1] - r0[1]) + (r1[2] - r0[2]) * (r1[2] - r0[2]));
        if (d < back) { back = d; when = get(OC_T) - start; }
    }
    const double e1 = energy();
    angularMomentum(h1);
    CHECK(std::fabs(e1 / e0 - 1) < 1e-7, "energy %.10g then %.10g", e0, e1);
    const double dh = std::sqrt((h1[0] - h0[0]) * (h1[0] - h0[0]) + (h1[1] - h0[1]) * (h1[1] - h0[1]) + (h1[2] - h0[2]) * (h1[2] - h0[2]));
    CHECK(dh / std::sqrt(h0[0] * h0[0] + h0[1] * h0[1] + h0[2] * h0[2]) < 1e-7, "angular momentum moved %.3g", dh);
    const double speed = std::sqrt(v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2]);
    CHECK(std::fabs(when - period) <= OC_DT, "closest return after %.2f s; Kepler's period is %.2f s", when, period);
    CHECK(back < speed * OC_DT / 2 + 5, "closest return %.1f m from where it started", back);
    std::printf("  period %.1f s (%.2f min), back within %.1f m at %.2f s\n", period, period / 60, back, when);
    CHECK(finite(), "finite");
}

// The drive is what the header says: propellant flows at thrust over exhaust speed, and the speed it
// buys is the rocket equation's.
void rocketEquation() {
    if (crewToOrbit() < 0) { CHECK(false, "no orbit"); return; }
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PROGRADE);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(1500);   // settle on prograde
    double r0[3], v0[3];
    oc_eci(r0, v0);
    const double m0 = get(OC_MASS);
    oc_controls(0, 0, 0, 1, 0, 0, 0, 0, 0);
    oc_step(1000);   // 20 s at full power
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(250);    // and the thrust's tail
    const double m1 = get(OC_MASS);
    double r1[3], v1[3];
    oc_eci(r1, v1);
    // Δv from the rocket equation, against the change in orbital energy it should make (prograde, so
    // the work is thrust times distance; checked through the vis-viva speed at the same radius).
    const double ve = 2000 * 9.80665;
    const double dvRocket = ve * std::log(m0 / m1);
    const double used = m0 - m1;
    std::printf("  used %.1f kg, rocket equation %.1f m/s\n", used, dvRocket);
    CHECK(used > 0, "propellant used");
    // full thrust is 1.2 x the take-off weight: 60 t
    const double flow = 1.2 * 60000 * 9.80665 / ve;
    CHECK(used > flow * 20 * 0.98 && used < flow * 21, "flow: %.1f kg in ~20.4 s at %.2f kg/s", used, flow);
    const double rm0 = std::sqrt(r0[0] * r0[0] + r0[1] * r0[1] + r0[2] * r0[2]);
    const double rm1 = std::sqrt(r1[0] * r1[0] + r1[1] * r1[1] + r1[2] * r1[2]);
    const double s0 = std::sqrt(v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2]);
    const double s1 = std::sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]);
    // the speed gained, corrected for the climb the burn makes (energy: v^2/2 - mu/r)
    const double s1AtR0 = std::sqrt(s1 * s1 + 2 * MU * (1 / rm0 - 1 / rm1));
    CHECK(std::fabs((s1AtR0 - s0) / dvRocket - 1) < 0.02, "speed gained %.1f m/s, rocket equation %.1f", s1AtR0 - s0, dvRocket);
    CHECK(get(OC_APO) > 500000 + 30000, "the burn raised the top to %.1f km", get(OC_APO) / 1000);
}

// Hands off above the air, the attitude holds; on prograde, the nose finds the velocity.
void attitudeHold() {
    if (crewToOrbit() < 0) { CHECK(false, "no orbit"); return; }
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_HOLD);
    oc_controls(0, 0.5, 0, 0, 0, 0, 0, 0, 0);   // roll a while
    oc_step(150);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);     // and let go
    oc_step(500);
    const double qw = get(OC_QW), qx = get(OC_QX), qy = get(OC_QY), qz = get(OC_QZ);
    oc_step(1000);
    // the attitude in the site frame turns with the Earth and the orbit, so compare it through the
    // body rates: a held attitude in inertial space; check the quaternion moved only by the frame's turn
    const double dot = std::fabs(qw * get(OC_QW) + qx * get(OC_QX) + qy * get(OC_QY) + qz * get(OC_QZ));
    CHECK(dot > 0.98, "attitude drifted: dot %.4f", dot);
    oc_sas(OC_SAS_PROGRADE);
    oc_step(2500);
    // prograde: the velocity relative to the ring is nearly the orbit's; compare the nose with the
    // inertial velocity through pitch: in a round orbit prograde is the local horizon, along the track
    CHECK(std::fabs(get(OC_PITCH_DEG)) < 1.0, "prograde pitch %.2f deg", get(OC_PITCH_DEG));
    CHECK(finite(), "finite");
}

// A pilot can fly it off the runway by hand: full power, rotate at 95 m/s, gear up, climb.
void handFlownTakeoff() {
    oc_reset(LAT, LON, HDG);
    oc_auto(OC_AUTO_OFF);
    oc_controls(0, 0, 0, 1, 0, 0, 0, 1, 0);
    int liftedAt = -1;
    for (int i = 0; i < 3000; ++i) {
        const double pitch = get(OC_TAS) > 95 && get(OC_PITCH_DEG) < 15 ? 0.6 : 0.0;
        const int gear = get(OC_ALT) < 60;
        oc_controls(pitch, 0, 0, 1, 0, 0, 0, gear, 0);
        oc_step(1);
        if (liftedAt < 0 && get(OC_ON_GROUND) == 0 && get(OC_ALT) > 10) liftedAt = i;
        if (get(OC_CRASHED) > 0) break;
    }
    CHECK(get(OC_CRASHED) == 0, "crashed");
    CHECK(liftedAt > 0 && liftedAt * OC_DT < 30, "lifted off at %.1f s", liftedAt * OC_DT);
    CHECK(get(OC_ALT) > 1500, "at 60 s, %.0f m up", get(OC_ALT));
    CHECK(get(OC_GEAR) == 0, "gear up");
    CHECK(std::fabs(get(OC_ROLL_DEG)) < 2 && std::fabs(get(OC_HDG_DEG) - HDG) < 2, "roll %.2f, heading %.2f", get(OC_ROLL_DEG), get(OC_HDG_DEG));
    // and a level turn holds its bank and its height
    for (int i = 0; i < 50; ++i) { oc_controls(0, 0.5, 0, 0.6, 0, 0, 0, 0, 0); oc_step(1); }   // 22.5 deg of bank asked
    const double h0 = get(OC_ALT), hdg0 = get(OC_HDG_DEG);
    for (int i = 0; i < 1000; ++i) { oc_controls(0, 0, 0, 0.6, 0, 0, 0, 0, 0); oc_step(1); }
    CHECK(get(OC_ROLL_DEG) > 18 && get(OC_ROLL_DEG) < 27, "bank held at %.1f deg", get(OC_ROLL_DEG));
    CHECK(get(OC_HDG_DEG) > hdg0 + 5, "turned right from %.1f to %.1f", hdg0, get(OC_HDG_DEG));
    CHECK(std::fabs(get(OC_BETA_DEG)) < 1, "sideslip %.2f deg", get(OC_BETA_DEG));
    CHECK(get(OC_ALT) > h0 - 300, "height %.0f m then %.0f m", h0, get(OC_ALT));
}

// In orbit the small thrusters move the craft without turning it: a push forward closes on the ring.
void thrustersTranslate() {
    if (crewToOrbit() < 0) { CHECK(false, "no orbit"); return; }
    oc_step(3000);   // the crew points at the ring
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_TARGET);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(500);
    const double rate0 = get(OC_RING_RATE);
    const double prop0 = get(OC_PROP);
    oc_controls(0, 0, 0, 0, 1, 0, 0, 0, 0);   // forward, 0.5 m/s^2, for 10 s
    oc_step(500);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(5);
    CHECK(get(OC_RING_RATE) < rate0 - 4.0 && get(OC_RING_RATE) > rate0 - 6.0, "closing rate %.2f then %.2f m/s", rate0, get(OC_RING_RATE));
    CHECK(get(OC_PROP) == prop0, "the main drive's propellant untouched");
}

// From where the crew hands over, the approach flies to the hold point off the hub's port, on the
// small thrusters alone, and stops there.
void approachHolds() {
    if (crewToOrbit() < 0) { CHECK(false, "no orbit"); return; }
    oc_step(250);   // the engine's last thrust gone
    const double prop0 = get(OC_PROP);
    oc_auto(OC_AUTO_APPROACH);
    double t0 = get(OC_T), arrived = -1, last = 1e30;
    while (get(OC_T) - t0 < 3600) {
        oc_step(50);   // a second at a time: arrived when within 5 m and moving less than 0.2 m/s off it
        if (arrived < 0 && get(OC_PORT_RANGE) < 5 && std::fabs(get(OC_PORT_RANGE) - last) < 0.2) arrived = get(OC_T) - t0;
        last = get(OC_PORT_RANGE);
        CHECK(get(OC_RING_RANGE) > OC_HUB_PORT_M + 50, "inside the hub's reach: %.0f m from the centre", get(OC_RING_RANGE));
        if (get(OC_RING_RANGE) <= OC_HUB_PORT_M + 50) return;
    }
    std::printf("  at the hold point after %.0f s\n", arrived);
    CHECK(arrived > 0 && arrived < 1800, "arrived after %.0f s", arrived);
    CHECK(get(OC_PORT_RANGE) < 5, "held %.1f m off the hold point", get(OC_PORT_RANGE));
    CHECK(std::fabs(get(OC_RING_RANGE) - (OC_HUB_PORT_M + OC_STANDOFF_M)) < 10, "%.0f m from the ring's centre", get(OC_RING_RANGE));
    CHECK(get(OC_PROP) == prop0, "the main drive's propellant untouched");
    CHECK(finite(), "finite");
}

// A pilot flies the take-off and hands the climb to the crew, which takes it from there to orbit.
void crewTakesOver() {
    oc_reset(LAT, LON, HDG);
    oc_auto(OC_AUTO_OFF);
    for (int i = 0; i < 4000 && get(OC_ALT) < 3000; ++i) {
        const double pitch = get(OC_TAS) > 95 ? std::fmax(-1.0, std::fmin(1.0, (20 - get(OC_PITCH_DEG)) / 10)) : 0.0;
        oc_controls(pitch, 0, 0, 1, 0, 0, 0, get(OC_ALT) < 60, 0);
        oc_step(1);
    }
    CHECK(get(OC_ALT) >= 3000 && get(OC_CRASHED) == 0, "the pilot's climb: %.0f m", get(OC_ALT));
    oc_auto(OC_AUTO_CREW);
    CHECK(get(OC_PHASE) == OC_PH_ASCENT, "the crew takes it at phase %.0f", get(OC_PHASE));
    while (get(OC_PHASE) != OC_PH_ORBIT && get(OC_T) < 1500 && get(OC_CRASHED) == 0) oc_step(10);
    std::printf("  orbit at %.0f s: %.1f x %.1f km, %.2f deg\n", get(OC_T), get(OC_APO) / 1000, get(OC_PERI) / 1000, get(OC_INC_DEG));
    CHECK(get(OC_PHASE) == OC_PH_ORBIT, "reached orbit");
    CHECK(std::fabs(get(OC_APO) - 500000) < 10000 && std::fabs(get(OC_PERI) - 500000) < 10000, "%.1f x %.1f km", get(OC_APO) / 1000, get(OC_PERI) / 1000);
}

struct Test { const char* name; void (*fn)(); };
const Test tests[] = {
    {"atmosphere", atmosphere},         {"ground_settles", groundSettles},  {"deterministic", deterministic},
    {"crew_reaches_orbit", crewReachesOrbit}, {"kepler_holds", keplerHolds}, {"rocket_equation", rocketEquation},
    {"attitude_hold", attitudeHold},    {"hand_flown_takeoff", handFlownTakeoff}, {"thrusters_translate", thrustersTranslate},
    {"approach_holds", approachHolds},  {"crew_takes_over", crewTakesOver},
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
