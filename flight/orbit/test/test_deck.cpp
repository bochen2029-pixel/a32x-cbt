// The flight deck's tests (orbit_deck.h). Each states a piece of physics or a promise of the core, not how
// it is written, and reaches its situation through the controls a pilot or the page has: nothing is placed.
// Where a test can, it checks the deck's own readouts against the flight's (orbit_core.h), which do not come
// from deck.cpp. Run one by name or all; ctest runs each line below that reads "// TEST: <name>". GPLv3.
//
// TEST: readouts_block
// TEST: hover_takes_w2r
// TEST: crew_lands_from_hold
// TEST: glide_bleeds_the_deck_speed
// TEST: crew_lands_from_orbit
// TEST: monte_carlo
// TEST: parked_stays_put
// TEST: pilot_lands_by_hand
// TEST: lift_off_and_hold
// TEST: hard_touchdown_crashes
// TEST: firm_touchdown_is_not_a_crash
// TEST: bulkhead_is_solid
// TEST: roof_outside_is_solid
// TEST: open_roof_lets_through
// TEST: swivel_at_its_rate
// TEST: landing_refused
// TEST: deterministic
// TEST: propellant_budget

#include "../core/orbit_core.h"
#include "../core/orbit_deck.h"
#include "../core/orbit_dock.h"

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

const double PI = 3.14159265358979323846, D2R = PI / 180, R2D = 180 / PI;
const double G0 = 9.80665;
const double LAT = 32.91569901, LON = -97.02600098, HDG = 180.3;   // KDFW 17C, docs/provenance.md 1f
const double W = OC_RING_SPIN, R = OC_RING_FLOOR_M;
const double ISP = 2000;                                           // s: the drive's (README: the one fiction)

double get(int i) { return oc_out()[i]; }
double dk(int i) { return oc_deck_out()[i]; }
int idk(int i) { return (int)oc_deck_out()[i]; }
double dock(int i) { return oc_dock_out()[i]; }

bool finite() {
    for (int i = 0; i < oc_out_len(); ++i)
        if (!std::isfinite(oc_out()[i])) return false;
    for (int i = 0; i < oc_deck_out_len(); ++i)
        if (!std::isfinite(oc_deck_out()[i])) return false;
    return true;
}

struct V { double x, y, z; };
V operator+(V a, V b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
V operator-(V a, V b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
V operator*(V a, double s) { return {a.x * s, a.y * s, a.z * s}; }
double dot(V a, V b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
V cross(V a, V b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
double norm(V a) { return std::sqrt(dot(a, a)); }
V unit(V a) { return a * (1 / norm(a)); }

// ---- the flight's own readouts: the site frame ----------------------------------------------------

V site(int i) { return {get(i), get(i + 1), get(i + 2)}; }

V body(V v) {   // a body vector in the site frame, by the readouts' quaternion
    const double w = get(OC_QW);
    const V u{get(OC_QX), get(OC_QY), get(OC_QZ)};
    return v + cross(u, cross(u, v) + v * w) * 2.0;
}

// The craft in the Ring's frame by the flight's readouts alone: its distance from the axis, along it, and its
// angle about it in the spokes' convention.
struct Where { double radial, axial, angle; };
Where where() {
    const V ax = site(OC_RING_AX_E), ref = site(OC_RING_REF_E), d = site(OC_SITE_E) - site(OC_RING_E);
    const double x = dot(d, ref), z = dot(d, cross(ref, ax));
    return {std::hypot(x, z), dot(d, ax), std::atan2(x, z)};
}

double padAngle(int k) { return (OC_DECK_ANGLE_DEG * D2R) + (k - (OC_DECK_PADS - 1) / 2.0) * OC_DECK_PAD_SPACING_M / R; }
double wrap(double a) { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; }

const char* hitName(int h) {
    static const char* names[] = {"nothing", "the hull", "the roof", "a rim wall", "a spoke", "the hub", "the port", "the deck", "a bulkhead"};
    return h >= 0 && h <= OC_DOCK_HIT_BULKHEAD ? names[h] : "?";
}
const char* partName(int p) {
    static const char* names[] = {"nothing", "the probe", "the nose", "the body", "the left wing", "the right wing", "the tail", "the gear"};
    return p >= 0 && p <= OC_DOCK_PART_GEAR ? names[p] : "?";
}

// ---- getting there ----------------------------------------------------------------------------------

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
    CHECK(false, "no hold point: %.0f m off it", get(OC_PORT_RANGE));
    return false;
}

// What a landing came to, as the readouts recorded it.
struct Landing {
    double took = -1;                 // s from engaging to the craft at rest on the deck, the crew done
    double phaseAt[8] = {0};          // s from engaging to each phase's start
    double sink, drift, off, tilt;    // the touchdown's
    int verdict = 0, pad = -1;
    double prop = 0;                  // kg used
    double worstLoc = 0, worstGs = 0; // m off the path in the glide, after its first minute's capture
};

// The crew's landing, from wherever the craft is; the record, took -1 if the craft is not at rest on a pad.
Landing crewLands(double limit, bool quiet = false) {
    Landing L;
    const double t0 = get(OC_T);
    oc_auto(OC_AUTO_DECK);
    int phase = idk(OC_DECK_PHASE);
    L.phaseAt[phase] = 0;
    double glideAt = -1;
    while (get(OC_T) - t0 < limit && get(OC_CRASHED) == 0) {
        oc_step(1);
        const int p = idk(OC_DECK_PHASE);
        if (p != phase) { L.phaseAt[p] = get(OC_T) - t0; phase = p; if (p == OC_DECK_PH_GLIDE) glideAt = get(OC_T); }
        if (p == OC_DECK_PH_GLIDE && get(OC_T) - glideAt > 10) {
            L.worstLoc = std::fmax(L.worstLoc, std::fabs(dk(OC_DECK_LOC_M)));
            L.worstGs = std::fmax(L.worstGs, std::fabs(dk(OC_DECK_GS_M)));
        }
        if (p == OC_DECK_PH_LANDED && get(OC_AUTO) == OC_AUTO_OFF) { L.took = get(OC_T) - t0; break; }
    }
    L.sink = dk(OC_DECK_TD_SINK);
    L.drift = dk(OC_DECK_TD_DRIFT);
    L.off = dk(OC_DECK_TD_OFF);
    L.tilt = dk(OC_DECK_TD_TILT_DEG);
    L.verdict = idk(OC_DECK_TD_VERDICT);
    L.pad = idk(OC_DECK_TD_PAD);
    L.prop = dk(OC_DECK_PROP_USED);
    if (!quiet && get(OC_CRASHED) > 0) std::printf("  crashed: %s hit %s\n", partName((int)dock(OC_DOCK_HIT_PART)), hitName((int)dock(OC_DOCK_HIT)));
    return L;
}

bool inTolerance(const Landing& L) {
    return L.verdict == OC_DECK_V_LANDED && L.sink <= OC_DECK_TOL_SINK && L.sink > 0 && L.drift <= OC_DECK_TOL_DRIFT && L.off <= OC_DECK_TOL_OFF_M &&
           L.tilt <= OC_DECK_TOL_TILT_DEG;
}

// The crew lands from the hold point; the pilot then has it, on the deck.
bool landed() {
    if (!toHold()) return false;
    const Landing L = crewLands(900);
    CHECK(L.took > 0 && get(OC_CRASHED) == 0, "no landing");
    return L.took > 0 && get(OC_CRASHED) == 0;
}

// Over the pad in the crew's hover, then the pilot takes it in the deck hold, the throttle at its centre.
bool hoverByHand() {
    if (!toHold()) return false;
    oc_auto(OC_AUTO_DECK);
    const double t0 = get(OC_T);
    while (get(OC_T) - t0 < 900 && get(OC_CRASHED) == 0 && idk(OC_DECK_PHASE) != OC_DECK_PH_DESCEND) oc_step(1);
    if (idk(OC_DECK_PHASE) != OC_DECK_PH_DESCEND) { CHECK(false, "no hover: phase %d", idk(OC_DECK_PHASE)); return false; }
    oc_controls(0, 0, 0, 0.5, 0, 0, 0, 1, 0);
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_DECK);
    oc_step(250);
    return get(OC_CRASHED) == 0;
}

// ---- the tests ----------------------------------------------------------------------------------------

// The block is the header's. On the runway nothing is chosen and nothing has touched the deck; in orbit the
// deck's coordinates are what the flight's own readouts give: the height over the floor is the floor's
// radius less the distance from the Ring's axis, and across is the distance along it.
void readoutsBlock() {
    oc_reset(LAT, LON, HDG);
    CHECK(oc_deck_out_len() == OC_DECK_COUNT, "%d readouts", oc_deck_out_len());
    CHECK(dk(OC_DECK_PHASE) == OC_DECK_PH_NONE && dk(OC_DECK_PAD) == -1 && dk(OC_DECK_ON_DECK) == 0, "phase %.0f, pad %.0f, on deck %.0f", dk(OC_DECK_PHASE),
          dk(OC_DECK_PAD), dk(OC_DECK_ON_DECK));
    CHECK(dk(OC_DECK_TD_VERDICT) == OC_DECK_V_NONE && dk(OC_DECK_NOZZLE_DEG) == 0, "verdict %.0f, nozzle %.1f", dk(OC_DECK_TD_VERDICT), dk(OC_DECK_NOZZLE_DEG));
    CHECK(finite(), "finite");
    if (!toOrbit()) return;
    const Where w = where();
    CHECK(std::fabs(dk(OC_DECK_HEIGHT) - (R - w.radial)) < 1e-4 && std::fabs(dk(OC_DECK_C) - w.axial) < 1e-4, "height %.4f against %.4f, across %.4f against %.4f",
          dk(OC_DECK_HEIGHT), R - w.radial, dk(OC_DECK_C), w.axial);
    CHECK(std::fabs(dk(OC_DECK_SECTOR_S) - R * wrap(w.angle - OC_DECK_ANGLE_DEG * D2R)) < 1e-3, "along the deck %.3f against %.3f", dk(OC_DECK_SECTOR_S),
          R * wrap(w.angle - OC_DECK_ANGLE_DEG * D2R));
    // in orbit beside the Ring, keeping station in its orbit, the craft is nearly at rest among the stars: the
    // deck would sweep past it at w r and give its motion no weight
    const double r = w.radial;
    std::printf("  in orbit, %.1f km from the axis: against the deck %.1f m/s along (w r = %.1f), apparent %.5f g\n", r / 1000, dk(OC_DECK_ALONG), W * r,
                dk(OC_DECK_APPARENT_G));
    CHECK(std::fabs(dk(OC_DECK_ALONG) + W * r) < 0.02 * W * r && dk(OC_DECK_APPARENT_G) < 0.01, "along %.1f, apparent %.4f g", dk(OC_DECK_ALONG), dk(OC_DECK_APPARENT_G));
}

// Hovering still in the Ring's turning frame takes thrust toward its axis of m w^2 r: by the flight's own
// readouts, the felt acceleration is w^2 r and points from the craft to the axis. Over the pad in the crew's
// hover, 20 m up; and lifted by hand to 150 m.
void hoverTakesW2r() {
    if (!hoverByHand()) return;
    for (int leg = 0; leg < 2; ++leg) {
        if (leg == 1) {   // up to 150 m by hand, and hold
            oc_controls(0, 0, 0, 1.0, 0, 0, 0, 1, 0);
            while (dk(OC_DECK_HEIGHT) < 145 && get(OC_CRASHED) == 0) oc_step(1);
            oc_controls(0, 0, 0, 0.5, 0, 0, 0, 1, 0);
            oc_step(1500);
        }
        double worst = 0, worstDir = 0, speed = 0;
        const double prop0 = get(OC_PROP), mass0 = get(OC_MASS);
        for (int i = 0; i < 500; ++i) {
            oc_step(1);
            const Where w = where();
            const double want = W * W * w.radial / G0;
            worst = std::fmax(worst, std::fabs(get(OC_G) - want) / want);
            // the drive's thrust, with the swivel at its angle: from the nose toward the top
            const double nz = dk(OC_DECK_NOZZLE_DEG) * D2R;
            const V thrust = body({std::cos(nz), 0, -std::sin(nz)});
            const V ax = site(OC_RING_AX_E), d = site(OC_SITE_E) - site(OC_RING_E);
            const V toAxis = unit(d * -1.0 + ax * dot(d, ax));
            worstDir = std::fmax(worstDir, std::acos(std::fmin(1.0, dot(unit(thrust), toAxis))) * R2D);
            speed = std::fmax(speed, std::hypot(std::hypot(dk(OC_DECK_ALONG), dk(OC_DECK_ACROSS)), dk(OC_DECK_VERTICAL)));
        }
        const Where w = where();
        std::printf("  hovering %.1f m over the floor, %.1f m from the axis: felt %.5f g against w^2 r = %.5f g (worst %.2e of it); the thrust within %.3f deg of the axis's way; still to %.4f m/s\n",
                    dk(OC_DECK_HEIGHT), w.radial, get(OC_G), W * W * w.radial / G0, worst, worstDir, speed);
        CHECK(worst < 2e-3, "felt %.5f g against %.5f g", get(OC_G), W * W * w.radial / G0);
        CHECK(worstDir < 1.0, "the thrust %.3f deg off the way to the axis", worstDir);
        CHECK(speed < 0.05, "moving %.4f m/s against the deck", speed);
        CHECK(std::fabs(dk(OC_DECK_APPARENT_G) - W * W * w.radial / G0) < 1e-3, "apparent %.5f g", dk(OC_DECK_APPARENT_G));
        // and the drive's flow for it: the thrust over the exhaust's speed, m w^2 r / (Isp g0)
        const double flow = (prop0 - get(OC_PROP)) / (500 * OC_DT), want = 0.5 * (mass0 + get(OC_MASS)) * W * W * w.radial / (ISP * G0);
        std::printf("  the drive's flow %.4f kg/s against m w^2 r / (Isp g0) = %.4f kg/s\n", flow, want);
        CHECK(std::fabs(flow - want) < 2e-3 * want, "%.4f kg/s against %.4f", flow, want);
    }
    CHECK(get(OC_CRASHED) == 0 && finite(), "crashed %.0f", get(OC_CRASHED));
}

// From the hold point the crew lands on a pad at zero-zero: out into the Ring, the glide, the hover and the
// descent, inside every tolerance and in under six minutes. Then the pilot has it, held on the deck.
void crewLandsFromHold() {
    if (!toHold()) return;
    const double prop0 = get(OC_PROP);
    const Landing L = crewLands(900);
    std::printf("  out at %.0f s, the glide at %.0f s, the hover at %.0f s, down at %.0f s, at rest on the deck at %.0f s\n", L.phaseAt[OC_DECK_PH_DEPART],
                L.phaseAt[OC_DECK_PH_GLIDE], L.phaseAt[OC_DECK_PH_HOVER], L.phaseAt[OC_DECK_PH_DESCEND], L.took);
    std::printf("  touchdown on pad %d: sink %.3f m/s, drift %.3f m/s, %.2f m from the centre, %.2f deg off level; %.0f kg of propellant\n", L.pad, L.sink, L.drift,
                L.off, L.tilt, L.prop);
    CHECK(L.took > 0 && L.took < 360, "took %.0f s", L.took);
    CHECK(inTolerance(L), "verdict %d: sink %.3f, drift %.3f, off %.2f, tilt %.2f", L.verdict, L.sink, L.drift, L.off, L.tilt);
    CHECK(get(OC_AUTO) == OC_AUTO_OFF && get(OC_SAS) == OC_SAS_DECK, "landed, the pilot has it held on the deck: auto %.0f, hold %.0f", get(OC_AUTO), get(OC_SAS));
    CHECK(dk(OC_DECK_ON_DECK) == 1 && dk(OC_DECK_PHASE) == OC_DECK_PH_LANDED, "on deck %.0f, phase %.0f", dk(OC_DECK_ON_DECK), dk(OC_DECK_PHASE));
    CHECK(std::fabs(dk(OC_DECK_PROP_USED) - (prop0 - get(OC_PROP))) < 1e-6, "propellant used %.3f against %.3f", dk(OC_DECK_PROP_USED), prop0 - get(OC_PROP));
    CHECK(L.worstLoc < 12 && L.worstGs < 12, "off the path %.1f m across, %.1f m in height", L.worstLoc, L.worstGs);
    // by the flight's own readouts: on the floor's radius, less the legs' 3 m, within a pad's radius of a pad
    const Where w = where();
    const double offPad = std::hypot(R * wrap(w.angle - padAngle(L.pad)), w.axial);
    CHECK(std::fabs(R - w.radial - 3.0) < 0.1 && offPad < 1.0, "the centre of mass %.3f m over the floor, %.3f m from the pad's centre", R - w.radial, offPad);
    CHECK(finite(), "finite");
}

// The glide is the airliner's part: the speed against the deck bleeds from the deck's own (the craft at rest
// among the stars) to nothing, the weight the motion gives grows from nothing to one g, and the swivel turns
// from near aft toward straight down as it does; all the while on the deck's approach path.
void glideBleedsTheDeckSpeed() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_DECK);
    const double t0 = get(OC_T);
    while (get(OC_T) - t0 < 900 && get(OC_CRASHED) == 0 && idk(OC_DECK_PHASE) != OC_DECK_PH_GLIDE) oc_step(1);
    CHECK(idk(OC_DECK_PHASE) == OC_DECK_PH_GLIDE, "no glide: phase %d", idk(OC_DECK_PHASE));
    const double along0 = dk(OC_DECK_ALONG), g0 = dk(OC_DECK_APPARENT_G), r0 = where().radial;
    double nozzleLow = 90, nozzleEnd = 0, g = 0, crossedRoof = -1, loc = 0, gs = 0;
    int samples = 0, rising = 0;
    double lastG = g0, tGlide = get(OC_T);
    while (get(OC_T) - t0 < 900 && get(OC_CRASHED) == 0 && idk(OC_DECK_PHASE) == OC_DECK_PH_GLIDE) {
        oc_step(50);
        nozzleLow = std::fmin(nozzleLow, dk(OC_DECK_NOZZLE_DEG));
        nozzleEnd = dk(OC_DECK_NOZZLE_DEG);
        g = dk(OC_DECK_APPARENT_G);
        if (g >= lastG - 0.01) ++rising;
        ++samples;
        lastG = g;
        if (crossedRoof < 0 && dk(OC_DECK_HEIGHT) < R - OC_RING_ROOF_M) crossedRoof = std::fabs(dk(OC_DECK_SECTOR_S));
        if (get(OC_T) - tGlide > 10) { loc = std::fmax(loc, std::fabs(dk(OC_DECK_LOC_M))); gs = std::fmax(gs, std::fabs(dk(OC_DECK_GS_M))); }
    }
    std::printf("  the glide from %.1f m/s against the deck (w r = %.1f) at %.4f g, to %.2f m/s at %.3f g over %.0f s; the swivel as low as %.1f deg, then %.1f deg; through the roof's gap %.0f m from the sector's centre; off the path at most %.1f m across, %.1f m in height\n",
                along0, W * r0, g0, dk(OC_DECK_ALONG), g, get(OC_T) - tGlide, nozzleLow, nozzleEnd, crossedRoof, loc, gs);
    CHECK(std::fabs(along0 + W * r0) < 2.0 && g0 < 0.01, "the glide starts at rest among the stars: %.2f m/s against %.2f, %.4f g", along0, -W * r0, g0);
    CHECK(std::fabs(dk(OC_DECK_ALONG)) < 3.0 && g > 0.97, "it ends near rest against the deck: %.2f m/s, %.3f g", dk(OC_DECK_ALONG), g);
    CHECK(rising >= samples - 2, "the weight grows all the way: %d of %d samples", rising, samples);
    CHECK(nozzleLow < 15 && nozzleEnd > 80, "the swivel near aft early (%.1f deg), near down late (%.1f deg)", nozzleLow, nozzleEnd);
    CHECK(crossedRoof >= 0 && crossedRoof < OC_DECK_ARC_M / 2, "below the roof's height only over the sector: %.0f m from its centre", crossedRoof);
    CHECK(loc < 12 && gs < 12, "off the path %.1f m across, %.1f m in height", loc, gs);
}

// From where the craft reaches orbit, 25 km from the Ring, the crew flies to the hold point first, then lands.
void crewLandsFromOrbit() {
    if (!toOrbit()) return;
    const double range0 = get(OC_RING_RANGE);
    oc_auto(OC_AUTO_DECK);
    CHECK(dk(OC_DECK_PHASE) == OC_DECK_PH_TRANSFER, "from %.1f km the crew flies to the hold point first: phase %.0f", range0 / 1000, dk(OC_DECK_PHASE));
    const Landing L = crewLands(2400);
    std::printf("  engaged %.1f km from the Ring: out from the hold point at %.0f s, at rest on pad %d at %.0f s; sink %.3f m/s, drift %.3f m/s, %.2f m off, %.2f deg; %.0f kg\n",
                range0 / 1000, L.phaseAt[OC_DECK_PH_DEPART], L.pad, L.took, L.sink, L.drift, L.off, L.tilt, L.prop);
    CHECK(L.took > 0 && L.took < 1300, "took %.0f s", L.took);
    CHECK(inTolerance(L), "verdict %d: sink %.3f, drift %.3f, off %.2f, tilt %.2f", L.verdict, L.sink, L.drift, L.off, L.tilt);
}

// A spread of starting offsets round the hold point, each by seeded thruster pulses, a coast and a turn of
// the stick: every one lands inside the tolerances. The worst of each number is printed.
struct Rng {
    unsigned long long x;
    double next() { x = x * 6364136223846793005ULL + 1442695040888963407ULL; return (double)(x >> 11) / 9007199254740992.0; }
    double pm() { return next() * 2 - 1; }
};

void monteCarlo() {
    const int N = 24;
    int good = 0, pads[OC_DECK_PADS] = {0};
    double worstSink = 0, worstDrift = 0, worstOff = 0, worstTilt = 0, worstTook = 0, worstProp = 0, worstLoc = 0, worstGs = 0, bestTook = 1e9;
    double reach = 0, speed = 0;
    for (int seed = 1; seed <= N; ++seed) {
        Rng r{0x9e3779b97f4a7c15ULL * (unsigned long long)seed};
        if (!toHold()) return;
        oc_auto(OC_AUTO_OFF);
        oc_sas(OC_SAS_HOLD);
        oc_controls(0, 0, 0, 0, r.pm(), r.pm(), r.pm(), 1, 0);   // up to 0.5 m/s2 a side for two seconds
        oc_step(100);
        oc_controls(r.pm(), r.pm(), r.pm(), 0, 0, 0, 0, 1, 0);   // a turn of the stick
        oc_step(25 + (int)(r.next() * 100));
        oc_controls(0, 0, 0, 0, 0, 0, 0, 1, 0);
        oc_step(50 * (int)(r.next() * 100));                       // and a coast of up to 100 s
        reach = std::fmax(reach, get(OC_PORT_RANGE));
        speed = std::fmax(speed, std::hypot(std::hypot(get(OC_VREL_E), get(OC_VREL_N)), get(OC_VREL_U)));
        const double from = get(OC_PORT_RANGE);
        const Landing L = crewLands(1200, true);
        const bool ok = L.took > 0 && inTolerance(L) && get(OC_CRASHED) == 0;
        std::printf("  seed %2d: from %5.1f m off the hold point: %s on pad %d in %.0f s, sink %.3f, drift %.3f, %.2f m off, %.2f deg, %.0f kg; off the path %.1f, %.1f m\n", seed,
                    from, ok ? "landed" : get(OC_CRASHED) > 0 ? "CRASHED" : "NOT LANDED", L.pad, L.took, L.sink, L.drift, L.off, L.tilt, L.prop, L.worstLoc, L.worstGs);
        if (ok) {
            ++good;
            ++pads[L.pad];
            worstSink = std::fmax(worstSink, L.sink);
            worstDrift = std::fmax(worstDrift, L.drift);
            worstOff = std::fmax(worstOff, L.off);
            worstTilt = std::fmax(worstTilt, L.tilt);
            worstTook = std::fmax(worstTook, L.took);
            bestTook = std::fmin(bestTook, L.took);
            worstProp = std::fmax(worstProp, L.prop);
            worstLoc = std::fmax(worstLoc, L.worstLoc);
            worstGs = std::fmax(worstGs, L.worstGs);
        }
    }
    std::printf("  %d of %d landed, on pads %d, %d, %d; starting up to %.0f m off the hold point and %.2f m/s; the worst: sink %.3f m/s, drift %.3f m/s, %.2f m off the centre, %.2f deg off level, %.0f to %.0f s, %.0f kg, off the path %.1f m across and %.1f m in height\n",
                good, N, pads[0], pads[1], pads[2], reach, speed, worstSink, worstDrift, worstOff, worstTilt, bestTook, worstTook, worstProp, worstLoc, worstGs);
    CHECK(good == N, "%d of %d landed", good, N);
}

// On a pad, the drive idle and the brakes on, the craft stays put for ten minutes: the deck carries it round
// at w r, the gear takes its weight, one g, and nothing in it creeps.
void parkedStaysPut() {
    if (!landed()) return;
    oc_controls(0, 0, 0, 0, 0, 0, 0, 1, 1);   // the pilot's hands: the brakes on, the throttle shut
    oc_step(250);
    const double s0 = dk(OC_DECK_SECTOR_S), c0 = dk(OC_DECK_C), h0 = dk(OC_DECK_HEIGHT);
    double moved = 0, speed = 0, gLow = 9, gHigh = 0;
    for (int i = 0; i < 600; ++i) {
        oc_step(50);
        moved = std::fmax(moved, std::hypot(std::hypot(dk(OC_DECK_SECTOR_S) - s0, dk(OC_DECK_C) - c0), dk(OC_DECK_HEIGHT) - h0));
        speed = std::fmax(speed, std::hypot(std::hypot(dk(OC_DECK_ALONG), dk(OC_DECK_ACROSS)), dk(OC_DECK_VERTICAL)));
        gLow = std::fmin(gLow, get(OC_G));
        gHigh = std::fmax(gHigh, get(OC_G));
        if (get(OC_CRASHED) > 0 || dk(OC_DECK_ON_DECK) == 0) break;
    }
    const double want = W * W * where().radial / G0;
    std::printf("  ten minutes on the pad: moved at most %.2e m, %.2e m/s; felt %.6f to %.6f g against w^2 r %.6f g; the gear %.4f m compressed\n", moved, speed, gLow,
                gHigh, want, 3.0 - h0);
    CHECK(get(OC_CRASHED) == 0 && dk(OC_DECK_ON_DECK) == 1, "crashed %.0f, on deck %.0f", get(OC_CRASHED), dk(OC_DECK_ON_DECK));
    CHECK(moved < 1e-3 && speed < 1e-3, "moved %.3g m, %.3g m/s", moved, speed);
    CHECK(std::fabs(gLow - want) < 2e-3 && std::fabs(gHigh - want) < 2e-3, "felt %.5f to %.5f g against %.5f", gLow, gHigh, want);
    CHECK(dk(OC_DECK_NOZZLE_DEG) >= 0 && get(OC_THROTTLE) == 0, "the drive at idle: %.3f", get(OC_THROTTLE));
    CHECK(finite(), "finite");
}

// The pilot lands by hand from the hover, on the keys alone: the stick is a velocity against the deck and
// centred holds the place; the throttle pulled back sinks the craft, and the law eases the sink to a
// touchdown's near the deck.
void pilotLandsByHand() {
    if (!hoverByHand()) return;
    // to one side with the stick, at its stop for four seconds, and let go: the hold stops it and keeps the place
    const double c0 = dk(OC_DECK_C), s0 = dk(OC_DECK_SECTOR_S);
    oc_controls(0, 1, 0, 0.5, 0, 0, 0, 1, 0);
    oc_step(200);
    const double fast = dk(OC_DECK_ACROSS);
    oc_controls(0, 0, 0, 0.5, 0, 0, 0, 1, 0);
    oc_step(1000);
    const double c1 = dk(OC_DECK_C), drift = std::hypot(dk(OC_DECK_ALONG), dk(OC_DECK_ACROSS));
    oc_step(500);
    std::printf("  the stick right for 4 s: %.2f m/s, %.2f m across in all and %.3f m along; let go, at rest in 20 s and held there to %.3f m in the next 10 s, moving %.3f m/s\n",
                fast, c1 - c0, dk(OC_DECK_SECTOR_S) - s0, dk(OC_DECK_C) - c1, drift);
    CHECK(fast > 6 && fast < 14 && c1 - c0 > 15 && c1 - c0 < 80, "%.2f m/s, %.2f m across", fast, c1 - c0);
    CHECK(std::fabs(dk(OC_DECK_SECTOR_S) - s0) < 0.5, "the place along held while flown across: %.3f m", dk(OC_DECK_SECTOR_S) - s0);
    CHECK(std::fabs(dk(OC_DECK_C) - c1) < 0.2 && drift < 0.05, "held to %.3f m, %.3f m/s", dk(OC_DECK_C) - c1, drift);
    // back over the pad's centre, as a pilot would: the stick part way, as far as the offset asks
    for (int i = 0; i < 6000 && (std::fabs(dk(OC_DECK_C)) > 0.3 || std::fabs(dk(OC_DECK_ACROSS)) > 0.1); ++i) {
        oc_controls(0, std::fmax(-0.8, std::fmin(0.8, -0.04 * dk(OC_DECK_C))), 0, 0.5, 0, 0, 0, 1, 0);
        oc_step(1);
    }
    oc_controls(0, 0, 0, 0.5, 0, 0, 0, 1, 0);
    oc_step(500);
    // and down: the throttle shut, all the way
    const double t0 = get(OC_T);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 1, 1);
    while (get(OC_T) - t0 < 120 && get(OC_CRASHED) == 0 && dk(OC_DECK_ON_DECK) == 0) oc_step(1);
    oc_step(250);
    std::printf("  the throttle shut: down in %.1f s, sink %.3f m/s, drift %.3f m/s, %.2f m from the centre, %.2f deg; verdict %d\n", get(OC_T) - t0,
                dk(OC_DECK_TD_SINK), dk(OC_DECK_TD_DRIFT), dk(OC_DECK_TD_OFF), dk(OC_DECK_TD_TILT_DEG), idk(OC_DECK_TD_VERDICT));
    CHECK(get(OC_CRASHED) == 0 && dk(OC_DECK_ON_DECK) == 1, "crashed %.0f", get(OC_CRASHED));
    CHECK(dk(OC_DECK_TD_SINK) <= OC_DECK_TOL_SINK && dk(OC_DECK_TD_DRIFT) <= OC_DECK_TOL_DRIFT && dk(OC_DECK_TD_OFF) <= OC_DECK_TOL_OFF_M,
          "sink %.3f, drift %.3f, off %.2f", dk(OC_DECK_TD_SINK), dk(OC_DECK_TD_DRIFT), dk(OC_DECK_TD_OFF));
    CHECK(idk(OC_DECK_TD_VERDICT) == OC_DECK_V_LANDED, "verdict %d", idk(OC_DECK_TD_VERDICT));
    CHECK(get(OC_THROTTLE) == 0, "on the deck, the throttle shut: the drive idle (%.3f)", get(OC_THROTTLE));
}

// Landed, the pilot opens the throttle: the craft lifts off, and with the throttle back at its centre it
// stops climbing and holds its height. The stick held forward (spinward, the nose's way) flies it along the
// deck; let go, it comes to rest and holds the place.
void liftOffAndHold() {
    if (!landed()) return;
    oc_controls(0, 0, 0, 1.0, 0, 0, 0, 1, 0);
    const double t0 = get(OC_T);
    while (get(OC_T) - t0 < 60 && dk(OC_DECK_HEIGHT) < 40) oc_step(1);
    const double up = get(OC_T) - t0;
    oc_controls(0, 0, 0, 0.5, 0, 0, 0, 1, 0);
    oc_step(500);
    const double h1 = dk(OC_DECK_HEIGHT);
    oc_step(1000);
    std::printf("  the throttle open: off the deck and 40 m up in %.1f s; centred, %.2f m and 20 s later %.2f m over the floor\n", up, h1, dk(OC_DECK_HEIGHT));
    CHECK(up < 20 && dk(OC_DECK_ON_DECK) == 0, "%.1f s to 40 m", up);
    CHECK(std::fabs(dk(OC_DECK_HEIGHT) - h1) < 0.1 && std::fabs(dk(OC_DECK_VERTICAL)) < 0.02, "held %.2f m, then %.2f m", h1, dk(OC_DECK_HEIGHT));
    // forward at the stop for four seconds: the TRC's speed and what the held stick winds up
    const double s0 = dk(OC_DECK_SECTOR_S);
    oc_controls(-1, 0, 0, 0.5, 0, 0, 0, 1, 0);
    oc_step(200);
    const double fast = dk(OC_DECK_ALONG);
    oc_controls(0, 0, 0, 0.5, 0, 0, 0, 1, 0);
    oc_step(1500);
    const double s1 = dk(OC_DECK_SECTOR_S);
    oc_step(1000);
    std::printf("  the stick forward 4 s: %.2f m/s spinward against the deck; let go, at rest %.1f m on, then held to %.3f m in 20 s at %.4f m/s\n", fast, s1 - s0,
                dk(OC_DECK_SECTOR_S) - s1, dk(OC_DECK_ALONG));
    CHECK(fast > 8 && fast < 15, "%.2f m/s", fast);
    CHECK(std::fabs(dk(OC_DECK_SECTOR_S) - s1) < 0.2 && std::fabs(dk(OC_DECK_ALONG)) < 0.02, "moved %.3f m", dk(OC_DECK_SECTOR_S) - s1);
    CHECK(std::fabs(dk(OC_DECK_HEIGHT) - h1) < 0.5, "the height held through it: %.2f m against %.2f", dk(OC_DECK_HEIGHT), h1);
    CHECK(get(OC_CRASHED) == 0 && finite(), "crashed %.0f", get(OC_CRASHED));
}

// Let go of the deck hold a few metres up, the drive left as it was set to the plain hold's throttle, shut:
// the craft falls the rest of the way under one g and strikes the deck harder than the gear takes.
void hardTouchdownCrashes() {
    if (!hoverByHand()) return;
    oc_controls(0, 0, 0, 0, 0, 0, 0, 1, 0);
    while (dk(OC_DECK_HEIGHT) > 12 && get(OC_CRASHED) == 0) oc_step(1);   // down to 12 m in the hold
    oc_sas(OC_SAS_HOLD);                                                   // and let go: the throttle shut
    const double t0 = get(OC_T);
    while (get(OC_T) - t0 < 30 && get(OC_CRASHED) == 0) oc_step(1);
    std::printf("  fell from 12 m: struck at %.2f m/s; verdict %d; hit %s with %s\n", dk(OC_DECK_TD_SINK), idk(OC_DECK_TD_VERDICT), hitName((int)dock(OC_DOCK_HIT)),
                partName((int)dock(OC_DOCK_HIT_PART)));
    CHECK(get(OC_CRASHED) == 1, "not crashed");
    CHECK(idk(OC_DECK_TD_VERDICT) == OC_DECK_V_CRASHED && dk(OC_DECK_TD_SINK) > OC_DECK_CRASH_SINK, "verdict %d at %.2f m/s", idk(OC_DECK_TD_VERDICT),
          dk(OC_DECK_TD_SINK));
    CHECK(dock(OC_DOCK_HIT) == OC_DOCK_HIT_DECK && dock(OC_DOCK_HIT_PART) == OC_DOCK_PART_GEAR, "hit %s with %s", hitName((int)dock(OC_DOCK_HIT)),
          partName((int)dock(OC_DOCK_HIT_PART)));
    // the wreck stays where it struck, turning with the Ring
    const double s0 = dk(OC_DECK_SECTOR_S), c0 = dk(OC_DECK_C), h0 = dk(OC_DECK_HEIGHT);
    oc_step(3000);
    CHECK(std::fabs(dk(OC_DECK_SECTOR_S) - s0) < 1e-6 && std::fabs(dk(OC_DECK_C) - c0) < 1e-6 && std::fabs(dk(OC_DECK_HEIGHT) - h0) < 1e-6, "the wreck moved");
    CHECK(finite(), "finite");
}

// A touchdown harder than the crew's tolerance but inside what the gear takes is a firm landing, not a crash:
// let go 1 m above the touch, the craft meets the deck at about 3 m/s... less: from 0.12 m it is 1.5 m/s.
void firmTouchdownIsNotACrash() {
    if (!hoverByHand()) return;
    oc_controls(0, 0, 0, 0, 0, 0, 0, 1, 0);
    while (dk(OC_DECK_HEIGHT) > 3.12 && get(OC_CRASHED) == 0) oc_step(1);   // the legs 12 cm over the deck, sinking at the eased rate
    oc_sas(OC_SAS_HOLD);
    const double t0 = get(OC_T);
    while (get(OC_T) - t0 < 30 && get(OC_CRASHED) == 0 && dk(OC_DECK_ON_DECK) == 0) oc_step(1);
    oc_step(500);
    std::printf("  let go with the legs 12 cm up: down at %.2f m/s, verdict %d, crashed %.0f\n", dk(OC_DECK_TD_SINK), idk(OC_DECK_TD_VERDICT), get(OC_CRASHED));
    CHECK(get(OC_CRASHED) == 0 && dk(OC_DECK_ON_DECK) == 1, "crashed %.0f, on deck %.0f", get(OC_CRASHED), dk(OC_DECK_ON_DECK));
    CHECK(idk(OC_DECK_TD_VERDICT) == OC_DECK_V_FIRM && dk(OC_DECK_TD_SINK) > OC_DECK_TOL_SINK && dk(OC_DECK_TD_SINK) < OC_DECK_CRASH_SINK, "verdict %d at %.2f m/s",
          idk(OC_DECK_TD_VERDICT), dk(OC_DECK_TD_SINK));
}

// Flown by hand along the deck into the spinward end, the craft meets the bulkhead, and that is a crash.
void bulkheadIsSolid() {
    if (!hoverByHand()) return;
    oc_controls(-1, 0, 0, 0.5, 0, 0, 0, 1, 0);   // the stick held forward, spinward: toward the near end
    const double t0 = get(OC_T);
    double last = dk(OC_DECK_SECTOR_S), speed = 0;
    while (get(OC_T) - t0 < 120 && get(OC_CRASHED) == 0) { last = dk(OC_DECK_SECTOR_S); speed = dk(OC_DECK_ALONG); oc_step(1); }
    std::printf("  at %.1f m/s along the deck: hit %s with %s, %.1f m from the sector's centre, %.1f m over the floor\n", speed, hitName((int)dock(OC_DOCK_HIT)),
                partName((int)dock(OC_DOCK_HIT_PART)), last, dk(OC_DECK_HEIGHT));
    CHECK(get(OC_CRASHED) == 1, "not crashed");
    CHECK(dock(OC_DOCK_HIT) == OC_DOCK_HIT_BULKHEAD, "hit %s", hitName((int)dock(OC_DOCK_HIT)));
    CHECK(last > OC_DECK_ARC_M / 2 - 30 && last < OC_DECK_ARC_M / 2, "%.1f m along", last);
}

// Over the roof outside the open sector, at the height the crew waits at, the craft let down onto the roof
// meets it: the roof is solid there, as everywhere but the sector.
void roofOutsideIsSolid() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_DECK);
    const double t0 = get(OC_T);
    while (get(OC_T) - t0 < 900 && get(OC_CRASHED) == 0 && idk(OC_DECK_PHASE) < OC_DECK_PH_WAIT) oc_step(1);
    // wait until the craft is over the roof well clear of the sector, then let it down with the small thrusters
    while (get(OC_CRASHED) == 0 && std::fabs(dk(OC_DECK_SECTOR_S)) < 3000) oc_step(1);
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_HOLD);
    oc_controls(0, 0, 0, 0, 0, 0, 1, 1, 0);   // down: along the body's z, outward
    double h = dk(OC_DECK_HEIGHT), s = dk(OC_DECK_SECTOR_S);
    const double t1 = get(OC_T);
    while (get(OC_T) - t1 < 200 && get(OC_CRASHED) == 0) { h = dk(OC_DECK_HEIGHT); s = dk(OC_DECK_SECTOR_S); oc_step(1); }
    std::printf("  let down %.0f m along the deck from the sector's centre: hit %s with %s at %.1f m over the floor\n", s, hitName((int)dock(OC_DOCK_HIT)),
                partName((int)dock(OC_DOCK_HIT_PART)), h);
    CHECK(get(OC_CRASHED) == 1, "not crashed");
    CHECK(dock(OC_DOCK_HIT) == OC_DOCK_HIT_ROOF, "hit %s", hitName((int)dock(OC_DOCK_HIT)));
    CHECK(std::fabs(s) > OC_DECK_ARC_M / 2 && h > R - OC_RING_ROOF_M && h < R - OC_RING_ROOF_M + 25, "%.0f m along, %.1f m up", s, h);
}

// The roof stops at the sector's ends: let down the same way over the sector's middle, the craft passes the
// roof's height and meets nothing until the deck. The craft is held level by hand on the small thrusters,
// and is wrecked on its belly at the end: the gear is up.
void openRoofLetsThrough() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_DECK);
    const double t0 = get(OC_T);
    while (get(OC_T) - t0 < 900 && get(OC_CRASHED) == 0 && idk(OC_DECK_PHASE) < OC_DECK_PH_HOVER) oc_step(1);
    CHECK(idk(OC_DECK_PHASE) == OC_DECK_PH_HOVER, "no hover: phase %d", idk(OC_DECK_PHASE));
    // up to 380 m by hand, the gear up, then down on the small thrusters past the roof's height
    oc_controls(0, 0, 0, 1.0, 0, 0, 0, 0, 0);
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_DECK);
    while (get(OC_CRASHED) == 0 && dk(OC_DECK_HEIGHT) < 370) oc_step(1);
    oc_controls(0, 0, 0, 0.5, 0, 0, 0, 0, 0);
    oc_step(1500);
    const double top = dk(OC_DECK_HEIGHT);
    double lowest = top, s = 0;
    oc_controls(0, 0, 0, 0.32, 0, 0, 0, 0, 0);   // a sink of 3 m/s, which the hold eases near the deck
    const double t1 = get(OC_T);
    while (get(OC_T) - t1 < 400 && get(OC_CRASHED) == 0) { lowest = std::fmin(lowest, dk(OC_DECK_HEIGHT)); s = dk(OC_DECK_SECTOR_S); oc_step(1); }
    std::printf("  from %.0f m over the floor, %.0f m along the sector, down through the roof's height: lowest %.2f m; hit %s with %s\n", top, s, lowest,
                hitName((int)dock(OC_DOCK_HIT)), partName((int)dock(OC_DOCK_HIT_PART)));
    CHECK(lowest < 5, "down to %.1f m", lowest);
    CHECK(get(OC_CRASHED) == 1 && dock(OC_DOCK_HIT) == OC_DOCK_HIT_DECK && dock(OC_DOCK_HIT_PART) == OC_DOCK_PART_BODY, "the gear up, the belly on the deck: hit %s with %s",
          hitName((int)dock(OC_DOCK_HIT)), partName((int)dock(OC_DOCK_HIT_PART)));
}

// The swivel turns at OC_DECK_SWIVEL_DPS and no further than straight down, and a law that does not ask for
// it brings it aft: the crew's landing to the hover, then out in the Ring again, where the crew waits, the
// plain hold takes over from the crew.
void swivelAtItsRate() {
    if (!toHold()) return;
    oc_auto(OC_AUTO_DECK);
    double fastest = 0, last = dk(OC_DECK_NOZZLE_DEG), top = 0;
    const double t0 = get(OC_T);
    while (get(OC_T) - t0 < 900 && get(OC_CRASHED) == 0 && idk(OC_DECK_PHASE) != OC_DECK_PH_DESCEND) {
        oc_step(1);
        fastest = std::fmax(fastest, std::fabs(dk(OC_DECK_NOZZLE_DEG) - last) / OC_DT);
        last = dk(OC_DECK_NOZZLE_DEG);
        top = std::fmax(top, last);
    }
    std::printf("  the swivel at most %.2f deg/s (its rate %.1f), down to %.3f deg\n", fastest, OC_DECK_SWIVEL_DPS, top);
    CHECK(fastest <= OC_DECK_SWIVEL_DPS * (1 + 1e-9) && fastest > 0.9 * OC_DECK_SWIVEL_DPS, "%.3f deg/s", fastest);
    CHECK(top <= 90 + 1e-9 && top > 89, "down to %.3f deg", top);
    // again from the hold point, as far as the wait, and there the plain hold
    if (!toHold()) return;
    oc_auto(OC_AUTO_DECK);
    while (get(OC_CRASHED) == 0 && idk(OC_DECK_PHASE) == OC_DECK_PH_DEPART && dk(OC_DECK_HEIGHT) > 1000) oc_step(1);
    while (get(OC_CRASHED) == 0 && idk(OC_DECK_PHASE) == OC_DECK_PH_DEPART && dk(OC_DECK_NOZZLE_DEG) < 60) oc_step(1);   // braking, the swivel down
    const double from = dk(OC_DECK_NOZZLE_DEG);
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_HOLD);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 1, 0);
    const double t1 = get(OC_T);
    while (get(OC_T) - t1 < 20 && dk(OC_DECK_NOZZLE_DEG) > 0) oc_step(1);
    std::printf("  from %.1f deg, aft again %.2f s after the plain hold took over (%.2f s at its rate)\n", from, get(OC_T) - t1, from / OC_DECK_SWIVEL_DPS);
    CHECK(from > 60, "the swivel at %.1f deg", from);
    CHECK(dk(OC_DECK_NOZZLE_DEG) == 0 && std::fabs(get(OC_T) - t1 - from / OC_DECK_SWIVEL_DPS) < 0.05, "aft after %.2f s", get(OC_T) - t1);
}

// The crew's landing is refused where it makes no sense, says why, and leaves whoever was flying in charge.
// Riding with the Ring it is not refused for the craft's own orbit, whose bottom the deck's speed swings by
// hundreds of kilometres; on the deck it is refused for being there.
void landingRefused() {
    oc_reset(LAT, LON, HDG);
    oc_auto(OC_AUTO_DECK);
    CHECK(dk(OC_DECK_REFUSED) == OC_DECK_NO_LOW && get(OC_AUTO) == OC_AUTO_CREW, "on the runway: refused %.0f, auto %.0f", dk(OC_DECK_REFUSED), get(OC_AUTO));
    oc_step(1500);
    CHECK(get(OC_PHASE) > OC_PH_HOLD && get(OC_CRASHED) == 0, "the crew flew on: phase %.0f", get(OC_PHASE));
    if (!toOrbit()) return;
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_PROGRADE);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(1500);
    oc_controls(0, 0, 0, 1, 0, 0, 0, 0, 0);   // four seconds of the main drive: 70 m/s past the Ring
    oc_step(200);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(250);
    oc_auto(OC_AUTO_DECK);
    CHECK(dk(OC_DECK_REFUSED) == OC_DECK_NO_FAST && get(OC_AUTO) == OC_AUTO_OFF, "passing the Ring fast: refused %.0f, auto %.0f", dk(OC_DECK_REFUSED), get(OC_AUTO));
    oc_step(50 * 1200);   // twenty minutes on, the Ring is far behind
    oc_auto(OC_AUTO_DECK);
    CHECK(dk(OC_DECK_REFUSED) == OC_DECK_NO_FAR && get(OC_AUTO) == OC_AUTO_OFF, "%.0f km from the Ring: refused %.0f", get(OC_RING_RANGE) / 1000, dk(OC_DECK_REFUSED));
    // on the deck, the craft's own orbit low or not
    if (!landed()) return;
    oc_auto(OC_AUTO_DECK);
    std::printf("  on the deck, its own orbit's bottom at %.0f km: refused %.0f\n", get(OC_PERI) / 1000, dk(OC_DECK_REFUSED));
    CHECK(dk(OC_DECK_REFUSED) == OC_DECK_NO_LANDED && get(OC_AUTO) == OC_AUTO_OFF, "on the deck: refused %.0f, auto %.0f", dk(OC_DECK_REFUSED), get(OC_AUTO));
    // lifted off and hovering, the crew takes it back to the nearest pad
    oc_controls(0, 0, 0, 1.0, 0, 0, 0, 1, 0);
    while (dk(OC_DECK_HEIGHT) < 30) oc_step(1);
    oc_controls(0, 0, 0, 0.5, 0, 0, 0, 1, 0);
    oc_step(500);
    oc_auto(OC_AUTO_DECK);
    CHECK(dk(OC_DECK_REFUSED) == OC_DECK_NO_NONE && get(OC_AUTO) == OC_AUTO_DECK && dk(OC_DECK_PHASE) == OC_DECK_PH_HOVER, "hovering: refused %.0f, auto %.0f, phase %.0f",
          dk(OC_DECK_REFUSED), get(OC_AUTO), dk(OC_DECK_PHASE));
    // docked at the hub, the crew does not land
    if (!toHold()) return;
    oc_auto(OC_AUTO_DOCK);
    for (int i = 0; i < 30000 && dock(OC_DOCK_PHASE) != OC_DOCK_PH_DOCKED; ++i) oc_step(1);
    oc_auto(OC_AUTO_DECK);
    CHECK(dk(OC_DECK_REFUSED) == OC_DECK_NO_DOCKED && get(OC_AUTO) == OC_AUTO_OFF, "docked: refused %.0f, auto %.0f", dk(OC_DECK_REFUSED), get(OC_AUTO));
}

// The same inputs give the same landing, step for step; a different input, a different one.
void deterministic() {
    unsigned a[3], b[3];
    for (int run = 0; run < 2; ++run) {
        unsigned* h = run ? b : a;
        if (!toHold()) return;
        oc_auto(OC_AUTO_DECK);
        oc_step(6000);
        h[0] = oc_hash();
        oc_step(4000);
        h[1] = oc_hash();
        const Landing L = crewLands(900, true);
        CHECK(L.took > 0, "no landing");
        oc_step(500);
        h[2] = oc_hash();
    }
    for (int i = 0; i < 3; ++i) CHECK(a[i] == b[i], "hash %d: %08x then %08x", i, a[i], b[i]);
    CHECK(a[0] != a[1] && a[1] != a[2], "the hash stood still");
    if (!toHold()) return;
    oc_controls(0, 0, 0, 0, 0, 0.01, 0, 1, 0);   // a breath of thruster to the right before asking
    oc_auto(OC_AUTO_OFF);
    oc_step(50);
    oc_auto(OC_AUTO_DECK);
    oc_step(5950);
    CHECK(oc_hash() != a[0], "a different input, the same hash");
}

// What a landing costs, by part, and the delta-v it is: matching the deck alone is w r, 221.5 m/s, and the
// rocket equation with the drive's 2,000 s turns the propellant used into the delta-v spent. The crew's
// landing is refused under OC_DECK_PROP_MIN, which must cover it with room to spare.
void propellantBudget() {
    if (!toHold()) return;
    const double prop0 = get(OC_PROP), mass0 = get(OC_MASS);
    oc_auto(OC_AUTO_DECK);
    double atPhase[8] = {0};
    int phase = idk(OC_DECK_PHASE);
    for (double& a : atPhase) a = prop0;
    const double t0 = get(OC_T);
    while (get(OC_T) - t0 < 900 && get(OC_CRASHED) == 0 && !(idk(OC_DECK_PHASE) == OC_DECK_PH_LANDED && get(OC_AUTO) == OC_AUTO_OFF)) {
        oc_step(1);
        const int p = idk(OC_DECK_PHASE);
        if (p != phase) { atPhase[p] = get(OC_PROP); phase = p; }
    }
    const double used = prop0 - get(OC_PROP), dv = ISP * G0 * std::log(mass0 / get(OC_MASS));
    std::printf("  from the hold point at %.0f kg: %.0f kg of %.0f, %.0f m/s of delta-v (w r is %.1f): out and the wait %.0f, the glide %.0f, the hover %.0f, the descent %.0f; %.0f kg left\n",
                mass0, used, prop0, dv, W * R, atPhase[OC_DECK_PH_DEPART] - atPhase[OC_DECK_PH_GLIDE], atPhase[OC_DECK_PH_GLIDE] - atPhase[OC_DECK_PH_HOVER],
                atPhase[OC_DECK_PH_HOVER] - atPhase[OC_DECK_PH_DESCEND], atPhase[OC_DECK_PH_DESCEND] - get(OC_PROP), get(OC_PROP));
    CHECK(get(OC_CRASHED) == 0 && dk(OC_DECK_PHASE) == OC_DECK_PH_LANDED, "no landing");
    CHECK(dv > W * R, "%.0f m/s, under the deck's own speed", dv);
    CHECK(used < 0.95 * OC_DECK_PROP_MIN && get(OC_PROP) > 0, "used %.0f kg against the %.0f the landing asks to start", used, OC_DECK_PROP_MIN);
}

struct Test { const char* name; void (*fn)(); };
const Test tests[] = {
    {"readouts_block", readoutsBlock},
    {"hover_takes_w2r", hoverTakesW2r},
    {"crew_lands_from_hold", crewLandsFromHold},
    {"glide_bleeds_the_deck_speed", glideBleedsTheDeckSpeed},
    {"crew_lands_from_orbit", crewLandsFromOrbit},
    {"monte_carlo", monteCarlo},
    {"parked_stays_put", parkedStaysPut},
    {"pilot_lands_by_hand", pilotLandsByHand},
    {"lift_off_and_hold", liftOffAndHold},
    {"hard_touchdown_crashes", hardTouchdownCrashes},
    {"firm_touchdown_is_not_a_crash", firmTouchdownIsNotACrash},
    {"bulkhead_is_solid", bulkheadIsSolid},
    {"roof_outside_is_solid", roofOutsideIsSolid},
    {"open_roof_lets_through", openRoofLetsThrough},
    {"swivel_at_its_rate", swivelAtItsRate},
    {"landing_refused", landingRefused},
    {"deterministic", deterministic},
    {"propellant_budget", propellantBudget},
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
