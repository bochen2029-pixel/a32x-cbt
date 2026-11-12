// The flight home's tests (orbit_return.h). Each flies the whole return through the core, from orbit to
// a stop on KDFW 17C, and states what a landing must be: on the runway's touchdown zone, near its
// centreline, a gentle sink, stopped on the runway, inside the heat, load and dynamic-pressure limits.
// Run one by name (test_return lands_from_insertion) or all; ctest runs each line below that reads
// "// TEST: <name>". GPLv3.
//
// TEST: readouts_block
// TEST: lands_from_insertion
// TEST: lands_on_a_pass_just_missed
// TEST: lands_after_a_long_wait
// TEST: lands_from_starts_round_the_day
// TEST: lands_after_leaving_the_hub
// TEST: lands_after_undocking
// TEST: lands_from_a_changed_orbit
// TEST: lands_with_its_model_wrong
// TEST: lands_with_its_model_wrong_round_the_day
// TEST: lands_when_given_back
// TEST: the_same_twice
// TEST: model_is_the_plant
// TEST: plan_says_when
// TEST: return_refused_on_the_deck
// TEST: departs_clear_of_the_mast
// TEST: blind_to_the_wind

#include "../core/orbit_core.h"
#include "../core/orbit_deck.h"
#include "../core/orbit_dock.h"
#include "../core/orbit_return.h"
#include "../core/orbit_wind.h"
#include "../core/internal.h"   // to place the craft where no crew mode takes it (departs_clear_of_the_mast)

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
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

const double LAT = 32.91569901, LON = -97.02600098, HDG = 180.3;   // KDFW 17C, docs/provenance.md 1f

double get(int i) { return oc_out()[i]; }
double ret(int i) { return oc_return_out()[i]; }

bool finite() {
    for (int i = 0; i < oc_out_len(); ++i)
        if (!std::isfinite(oc_out()[i])) return false;
    for (int i = 0; i < oc_return_out_len(); ++i)
        if (!std::isfinite(oc_return_out()[i])) return false;
    return true;
}

// Where the return starts from.
enum Start {
    IN_ORBIT,   // the crew's insertion orbit, wherever the craft has got to in it
    AT_HUB,     // held off the Ring's hub by the crew's approach
    DOCKED,     // docked at the hub's port by the crew, then let go (oc_undock)
    PILOT_BURN  // the pilot has burned along (+) or against (-) the velocity first
};

struct Run {
    double engage, tBurn, tInterface, tTerminal, tTouch, tStop;
    double dv, cross, maxG, reach;
    bool docked;
    double dockedAt;
    int passes, skipped;
    unsigned hashAtBurn, hash;
    bool finite;
    double tdHead, tdCross, tdGust, airProp;   // the wind at the touch (m/s, + a headwind, + from the right; its gust up), kg used in the air
};

// How wrong the guidance's model of the air and the craft is (oc_return_model_error); 1, 0, 0, 1, 1: right.
struct ModelError { double rho, wave, phase, lift, drag; };
const ModelError RIGHT{1, 0, 0, 1, 1};

// The day and the craft's other unknowns: the wind (oc_wind, set when the return is engaged), the mass and
// the thrust as the guidance knows them over the true, and the instruments' noise (oc_return_disturb).
struct Weather { unsigned windSeed; double wind, mass, thrust; unsigned noiseSeed; double noise; };
const Weather STILL{0, 0, 1, 1, 0, 0};

// Fly the crew to orbit, start the return at `engage` s, and fly it to a stop (or a crash, or the limit).
Run fly(double engage, Start start = IN_ORBIT, double pilotBurn = 0, ModelError err = RIGHT, Weather wx = STILL) {
    Run r{};
    r.engage = engage;
    r.tBurn = r.tInterface = r.tTerminal = r.tTouch = r.tStop = -1;
    r.finite = true;
    oc_reset(LAT, LON, HDG);
    oc_return_model_error(err.rho, err.wave, err.phase, err.lift, err.drag);
    oc_return_disturb(wx.mass, wx.thrust, wx.noiseSeed, wx.noise);
    while (get(OC_PHASE) != OC_PH_ORBIT && get(OC_T) < 1500) oc_step(50);
    if (start == AT_HUB) oc_auto(OC_AUTO_APPROACH);
    if (start == DOCKED) {   // the crew docks, then lets go: the return starts on the port, turning with it
        oc_auto(OC_AUTO_DOCK);
        while (oc_dock_out()[OC_DOCK_DOCKED] < 0.5 && get(OC_CRASHED) == 0 && get(OC_T) < 4000) oc_step(50);
        r.docked = oc_dock_out()[OC_DOCK_DOCKED] > 0.5;
        r.dockedAt = get(OC_T);
        oc_step(500);   // ten seconds held, turning with the Ring
        oc_undock();
    }
    if (start == PILOT_BURN) {   // retrograde or prograde hold, then a fifth of the drive for |pilotBurn| s
        oc_step(500);
        oc_auto(OC_AUTO_OFF);
        oc_sas(pilotBurn > 0 ? OC_SAS_PROGRADE : OC_SAS_RETROGRADE);
        oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
        oc_step(3000);
        oc_controls(0, 0, 0, 0.2, 0, 0, 0, 0, 0);
        oc_step((int)(std::fabs(pilotBurn) / OC_DT + 0.5));
        oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
    while (get(OC_T) < engage) oc_step(50);
    r.engage = get(OC_T);
    if (wx.wind > 0) oc_wind(wx.windSeed, wx.wind);
    oc_auto(OC_AUTO_RETURN);
    int phase = (int)ret(OC_RET_PHASE);
    double propAir = -1;
    while (get(OC_T) < engage + 200000) {
        oc_step(10);
        const int ph = (int)ret(OC_RET_PHASE);
        if (ph == OC_RET_PH_WAIT || ph == OC_RET_PH_DEPART) {   // the plan, as it stands before the burn
            r.dv = ret(OC_RET_DV);
            r.cross = ret(OC_RET_CROSS);
            r.passes = (int)ret(OC_RET_PASSES);
            r.skipped = (int)ret(OC_RET_SKIPPED);
            r.reach = ret(OC_RET_REACH);
        }
        if (propAir < 0 && ph >= OC_RET_PH_TERMINAL) propAir = get(OC_PROP);
        if (r.tdHead == 0 && ret(OC_RET_TOUCHED) > 0) {
            r.tdHead = oc_wind_out()[OC_WIND_HEAD];
            r.tdCross = oc_wind_out()[OC_WIND_CROSS];
            r.tdGust = oc_wind_out()[OC_WIND_GUST_U];
        }
        if (ph != phase) {
            if (ph == OC_RET_PH_BURN) { r.tBurn = get(OC_T); r.hashAtBurn = oc_hash(); }
            if (ph == OC_RET_PH_ENTRY) r.tInterface = get(OC_T);
            if (ph == OC_RET_PH_TERMINAL) r.tTerminal = get(OC_T);
            phase = ph;
        }
        if (get(OC_ON_GROUND) < 0.5 && get(OC_G) > r.maxG) r.maxG = get(OC_G);
        if (!finite()) { r.finite = false; break; }
        if (get(OC_CRASHED) > 0 || ph == OC_RET_PH_STOPPED || get(OC_AUTO) != OC_AUTO_RETURN) break;
    }
    r.tTouch = ret(OC_RET_TOUCHED) > 0 ? ret(OC_RET_TD_T) : -1;
    r.tStop = ret(OC_RET_STOPPED) > 0 ? get(OC_T) : -1;
    r.airProp = propAir >= 0 ? propAir - get(OC_PROP) : 0;
    r.hash = oc_hash();
    return r;
}

void print(const Run& r) {
    std::printf("  engaged %.0f s: burn %.0f s (%.1f m/s, %d passes let go, runway %.0f km off the plane), interface %.0f s, terminal %.0f s, "
                "touchdown %.0f s (%.2f h after engaging)\n",
                r.engage, r.tBurn, r.dv, r.passes, r.cross / 1000, r.tInterface, r.tTerminal, r.tTouch, (r.tTouch - r.engage) / 3600);
    std::printf("    heat %.0f kW/m2 peak, %.0f MJ/m2, %.0f K; load %.2f g peak; %.1f kPa peak; %d bank reversals; %.0f kg of propellant\n",
                ret(OC_RET_HEAT_PEAK) / 1000, ret(OC_RET_HEAT_LOAD) / 1e6, std::pow(ret(OC_RET_HEAT_PEAK) / (0.85 * 5.670374e-8), 0.25),
                ret(OC_RET_LOAD_PEAK), ret(OC_RET_QBAR_PEAK) / 1000, (int)ret(OC_RET_REVERSALS), ret(OC_RET_PROP_USED));
    std::printf("    touchdown %.0f m past the threshold, %.2f m off the centreline, sinking %.2f m/s at %.1f m/s, pitch %.1f deg; stopped %.0f m "
                "past it, %.2f m off\n",
                ret(OC_RET_TD_ALONG), ret(OC_RET_TD_OFF), ret(OC_RET_TD_SINK), ret(OC_RET_TD_SPEED), ret(OC_RET_TD_PITCH_DEG), ret(OC_RET_STOP_ALONG),
                ret(OC_RET_STOP_OFF));
}

// What a landing must be. These tests fly in still air with the guidance's instruments exact, and there it
// promises more than a landing: once the approach has learned the craft's coefficients it flies the same
// final whatever its model was, so
//   - the wheels touch in the touchdown zone's middle, 300 to 600 m past the threshold, where the 3 degree
//     path (the wheels 15 m over the threshold) and the flare put them;
//   - sinking 0.5 to 1.0 m/s: the flare's aim, 0.5, and no more than twice it;
//   - within 0.1 m of the centreline: the final's lateral law holds the line with a stiffness of 0.06 per
//     second squared over its last 2 km, so 0.1 m off is a side push of 6 mm/s2 left unbalanced, under the
//     8 mm/s2 of the Earth's turn that it feeds forward.
void landed(const Run& r) {
    print(r);
    CHECK(r.finite, "every readout finite");
    CHECK(get(OC_CRASHED) == 0, "not crashed, at %.0f s", get(OC_T));
    CHECK(ret(OC_RET_TOUCHED) > 0, "touched down");
    CHECK(ret(OC_RET_TD_ALONG) > 300 && ret(OC_RET_TD_ALONG) < 600, "in the touchdown zone's middle: %.0f m past the threshold", ret(OC_RET_TD_ALONG));
    CHECK(std::fabs(ret(OC_RET_TD_OFF)) < 0.1, "on the centreline: %.2f m", ret(OC_RET_TD_OFF));
    CHECK(ret(OC_RET_TD_SINK) > 0.5 && ret(OC_RET_TD_SINK) < 1.0, "the flare's touch: %.2f m/s down", ret(OC_RET_TD_SINK));
    CHECK(ret(OC_RET_STOPPED) > 0, "stopped");
    CHECK(ret(OC_RET_STOP_ALONG) > 0 && ret(OC_RET_STOP_ALONG) < OC_RET_RUNWAY_M && std::fabs(ret(OC_RET_STOP_OFF)) < OC_RET_RUNWAY_HALF_M,
          "stopped on the runway: %.0f m along, %.2f m off", ret(OC_RET_STOP_ALONG), ret(OC_RET_STOP_OFF));
    CHECK(ret(OC_RET_HEAT_PEAK) < OC_RET_HEAT_LIMIT, "heat %.0f kW/m2", ret(OC_RET_HEAT_PEAK) / 1000);
    CHECK(ret(OC_RET_LOAD_PEAK) < OC_RET_LOAD_LIMIT && r.maxG < OC_RET_LOAD_LIMIT, "load %.2f g (felt %.2f g)", ret(OC_RET_LOAD_PEAK), r.maxG);
    CHECK(ret(OC_RET_QBAR_PEAK) < OC_RET_QBAR_LIMIT, "dynamic pressure %.0f Pa", ret(OC_RET_QBAR_PEAK));
    CHECK(ret(OC_RET_OVER) == 0, "no limit passed in flight: %.0f", ret(OC_RET_OVER));
}

// ---- the tests ----------------------------------------------------------------------------------

void readoutsBlock() {
    oc_reset(LAT, LON, HDG);
    CHECK(oc_return_out_len() == OC_RET_COUNT, "%d readouts", oc_return_out_len());
    CHECK(ret(OC_RET_PHASE) == OC_RET_PH_NONE, "not flying home at the start");
    CHECK(ret(OC_RET_RANGE) < 1.0, "on the threshold: %.2f m", ret(OC_RET_RANGE));
}

// Straight after the crew's insertion: the craft waits for its pass, burns, and lands.
void landsFromInsertion() { landed(fly(800)); }

// Started too late for the pass's best burn: the plan burns at once and flies a steeper entry to reach it.
void landsOnAPassJustMissed() {
    const Run r = fly(2620);
    landed(r);
    CHECK(r.tBurn > 0 && r.tBurn < 3000, "the same pass, burning at %.0f s", r.tBurn);
}

// Started just after the day's last pass within reach: the craft waits most of a day in orbit.
void landsAfterALongWait() {
    const Run r = fly(3700);
    landed(r);
    CHECK(r.tBurn - r.engage > 12 * 3600, "a long wait: %.1f h", (r.tBurn - r.engage) / 3600);
}

// From places round the orbit and times round the day, the next pass in reach.
void landsFromStartsRoundTheDay() {
    const double starts[] = {1300, 21000, 47000, 66500, 72100, 77800};
    for (double e : starts) landed(fly(e));
}

// Held off the Ring's hub: the craft backs away from the Ring on its small thrusters first.
void landsAfterLeavingTheHub() {
    const Run r = fly(1600, AT_HUB);
    landed(r);
}

// Docked at the hub's port, then let go: the flight home starts on the port, turning with the Ring at
// 2.54 deg/s and backing off along its axis at OC_DOCK_SEPARATION, and must clear the Ring's structure
// (dock.cpp's contact model: any touch is a crash) through the wait, the turn and the burn.
void landsAfterUndocking() {
    // as the page does it: RETURN lets go and engages at once
    const Run r = fly(0, DOCKED);
    std::printf("  docked at %.0f s, let go 10 s later, the return engaged at once\n", r.dockedAt);
    CHECK(r.docked, "the crew docked by 4000 s");
    landed(r);
}

// From orbits the pilot has changed: the far side raised, and the near side lowered.
void landsFromAChangedOrbit() {
    landed(fly(3000, PILOT_BURN, 20));
    landed(fly(3000, PILOT_BURN, -15));
}

// The guidance's model of the air and the craft made wrong, the craft flying the core's own: the density
// off by a quarter and a wave of 15 % in height, the lift and drag coefficients by a tenth, at the box's
// corners. The guidance learns the error in flight, from what it feels against what it expects.
void landsWithItsModelWrong() {
    const ModelError corners[] = {
        {0.75, 0.15, 0.0, 1.10, 0.90},   // the air thinner than it thinks, its lift over drag a fifth too high
        {1.25, 0.15, 3.1, 0.90, 1.10},   // the air denser, its lift over drag a fifth too low
        {0.75, 0.00, 0.0, 0.90, 1.10},
        {1.25, 0.15, 1.6, 1.10, 0.90},
    };
    for (const ModelError& e : corners) {
        std::printf("  the model's air x%.2f (wave %.2f), lift x%.2f, drag x%.2f\n", e.rho, e.wave, e.lift, e.drag);
        landed(fly(800, IN_ORBIT, 0, e));
    }
}

// Drawn at random, as the Monte Carlo draws them (monte_carlo, below): when the return starts, anywhere in
// the day, and the model's error inside the box above.
uint64_t mix(uint64_t z) {   // SplitMix64
    z += 0x9e3779b97f4a7c15ULL;
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
    return z ^ (z >> 31);
}
struct Draw { double engage; ModelError err; Weather wx; };
struct Spread { double rho, wave, coef, wind, mass, thrust, noise; };
const Spread NARROW{0.25, 0.15, 0.10, 0, 0, 0, 0};
Draw draw(uint64_t pool, int i, Spread sp = NARROW) {
    uint64_t z = mix(pool * 1000003ULL + (uint64_t)i);
    auto u = [&](double a, double b) { z = mix(z); return a + (b - a) * ((z >> 11) * (1.0 / 9007199254740992.0)); };
    Draw d;
    d.engage = u(800, 87000);
    d.err.rho = u(1 - sp.rho, 1 + sp.rho);
    d.err.wave = u(0, sp.wave);
    d.err.phase = u(0, 6.283185307179586);
    d.err.lift = u(1 - sp.coef, 1 + sp.coef);
    d.err.drag = u(1 - sp.coef, 1 + sp.coef);
    // drawn after the rest, so that a pool drawn before these were is drawn as it was
    d.wx.windSeed = (unsigned)(u(0, 4294967295.0));
    d.wx.wind = u(0, sp.wind);
    d.wx.mass = u(1 - sp.mass, 1 + sp.mass);
    d.wx.thrust = u(1 - sp.thrust, 1 + sp.thrust);
    d.wx.noiseSeed = (unsigned)(u(0, 4294967295.0));
    d.wx.noise = sp.noise;
    return d;
}

void landsWithItsModelWrongRoundTheDay() {
    for (int i = 0; i < 4; ++i) {
        const Draw d = draw(11, i, NARROW);
        std::printf("  draw %d: the model's air x%.2f (wave %.2f), lift x%.2f, drag x%.2f\n", i, d.err.rho, d.err.wave, d.err.lift, d.err.drag);
        landed(fly(d.engage, IN_ORBIT, 0, d.err));
    }
}

// The pilot takes the controls on the way down and gives them back: in the entry, in the glide, on the
// final. The crew picks the flight home up from wherever the craft is.
void landsWhenGivenBack() {
    const double at[][2] = {{5500, 60}, {6900, 60}, {7575, 30}};   // the entry, the glide, the final (12 km out)
    for (const auto& a : at) {
        oc_reset(LAT, LON, HDG);
        while (get(OC_T) < 800) oc_step(50);
        oc_auto(OC_AUTO_RETURN);
        while (get(OC_T) < a[0]) oc_step(1);
        const int phase = (int)ret(OC_RET_PHASE);
        oc_auto(OC_AUTO_OFF);
        oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
        while (get(OC_T) < a[0] + a[1]) oc_step(1);
        oc_auto(OC_AUTO_RETURN);
        std::printf("  the pilot's from %.0f s for %.0f s (phase %d), then the crew's again (phase %.0f)\n", a[0], a[1], phase, ret(OC_RET_PHASE));
        Run r{};
        r.engage = 800;
        r.finite = true;
        while (get(OC_T) < 30000 && get(OC_CRASHED) == 0 && ret(OC_RET_PHASE) != OC_RET_PH_STOPPED) {
            oc_step(10);
            if (get(OC_ON_GROUND) < 0.5 && get(OC_G) > r.maxG) r.maxG = get(OC_G);
            r.finite = r.finite && finite();
        }
        r.tTouch = ret(OC_RET_TD_T);
        landed(r);
    }
}

// The same inputs, the same flight: the state's hash at the burn and at the stop.
void theSameTwice() {
    const Run a = fly(1300), b = fly(1300);
    std::printf("  hashes %08x %08x, then %08x %08x\n", a.hashAtBurn, a.hash, b.hashAtBurn, b.hash);
    CHECK(a.hashAtBurn == b.hashAtBurn && a.hash == b.hash, "the same flight twice");
    CHECK(a.tStop > 0, "and it landed");
}

// The guidance's model of the craft is the craft: the felt load its predictor works out for the present
// state equals the core's, all through the entry and the glide.
void modelIsThePlant() {
    oc_reset(LAT, LON, HDG);
    while (get(OC_T) < 800) oc_step(50);
    oc_auto(OC_AUTO_RETURN);
    double worst = 0, at = 0;
    int samples = 0;
    while (get(OC_T) < 20000 && ret(OC_RET_PHASE) < OC_RET_PH_APPROACH && get(OC_CRASHED) == 0) {
        oc_step(25);
        if (ret(OC_RET_PHASE) < OC_RET_PH_ENTRY || get(OC_THROTTLE) > 0) continue;
        const double d = std::fabs(oc_return_model_g() - get(OC_G));
        ++samples;
        if (d > worst) { worst = d; at = get(OC_T); }
    }
    std::printf("  %d samples from the entry to the approach: the model's load and the core's differ by %.2e g at most (%.0f s)\n", samples, worst, at);
    CHECK(samples > 1000, "%d samples", samples);
    CHECK(worst < 0.01, "%.4f g", worst);
}

// While the craft waits, the readouts say for what and when: the burn's time counts down to the burn the
// craft then makes, of the size planned.
void planSaysWhen() {
    oc_reset(LAT, LON, HDG);
    while (get(OC_T) < 1300) oc_step(50);
    oc_auto(OC_AUTO_RETURN);
    oc_step(1);
    CHECK(ret(OC_RET_PHASE) == OC_RET_PH_WAIT, "waiting: phase %.0f", ret(OC_RET_PHASE));
    CHECK(ret(OC_RET_EVENT) == OC_RET_EV_BURN, "for the burn: event %.0f", ret(OC_RET_EVENT));
    const double when = get(OC_T) + ret(OC_RET_T_EVENT), dv = ret(OC_RET_DV);
    std::printf("  at %.0f s: the burn in %.0f s, %.1f m/s; the runway %.0f km off the plane on the pass taken\n", get(OC_T), ret(OC_RET_T_EVENT), dv,
                ret(OC_RET_CROSS) / 1000);
    CHECK(dv > 80 && dv < 200, "%.1f m/s", dv);
    CHECK(std::fabs(ret(OC_RET_CROSS)) < 1.2e6, "%.0f km", ret(OC_RET_CROSS) / 1000);
    double prop = get(OC_PROP);
    while (ret(OC_RET_PHASE) == OC_RET_PH_WAIT && get(OC_T) < 200000) oc_step(5);
    std::printf("  the burn began at %.0f s (%.1f s from the first word)\n", get(OC_T), get(OC_T) - when);
    CHECK(std::fabs(get(OC_T) - when) < 30, "at %.0f s, said %.0f s", get(OC_T), when);
    while (ret(OC_RET_PHASE) == OC_RET_PH_BURN) oc_step(1);
    const double used = prop - get(OC_PROP), made = 2000 * 9.80665 * std::log((30000 + prop) / (30000 + get(OC_PROP)));
    std::printf("  burned %.0f kg: %.1f m/s, planned %.1f; the orbit now %.0f x %.0f km\n", used, made, dv, get(OC_APO) / 1000, get(OC_PERI) / 1000);
    CHECK(std::fabs(made - dv) < 0.1 * dv, "%.1f m/s made, %.1f planned", made, dv);
    CHECK(get(OC_PERI) < 70000 && get(OC_PERI) > 50000, "the orbit's low point %.0f km", get(OC_PERI) / 1000);
}

// RETURN on the Ring's deck, or riding with it, is refused and leaves whoever was flying in charge: the way out,
// backing away on the small thrusters with the gear up, is for a craft at rest by the Ring, and from the deck
// it put the belly on the deck in 0.6 s (the audit of 599e051). Parked on a pad the craft's own orbit swings
// with the Ring's turn, so RETURN is asked when its lowest point reads over 150 km; hovering over the pad it
// rides with the deck at 200 m/s past the Ring. A craft clear of the Ring, or slow by it, is not refused
// (lands_after_leaving_the_hub, lands_after_undocking).
void returnRefusedOnTheDeck() {
    oc_reset(LAT, LON, HDG);
    while (get(OC_PHASE) != OC_PH_ORBIT && get(OC_T) < 1500) oc_step(50);
    oc_auto(OC_AUTO_APPROACH);
    while (get(OC_PORT_RANGE) > 5 && get(OC_T) < 3000) oc_step(50);
    oc_auto(OC_AUTO_DECK);
    bool askedHovering = false;
    while (oc_deck_out()[OC_DECK_PHASE] != OC_DECK_PH_LANDED && get(OC_CRASHED) == 0 && get(OC_T) < 4000) {
        oc_step(10);
        if (!askedHovering && oc_deck_out()[OC_DECK_PHASE] == OC_DECK_PH_HOVER) {
            askedHovering = true;
            const double past = std::sqrt(get(OC_VREL_E) * get(OC_VREL_E) + get(OC_VREL_N) * get(OC_VREL_N) + get(OC_VREL_U) * get(OC_VREL_U));
            oc_auto(OC_AUTO_RETURN);
            std::printf("  hovering %.0f m over the pad, %.0f m/s past the Ring: RETURN refused %.0f, the deck's crew still flying (%.0f)\n",
                        oc_deck_out()[OC_DECK_HEIGHT], past, ret(OC_RET_REFUSED), get(OC_AUTO));
            CHECK(ret(OC_RET_REFUSED) == OC_RET_NO_RIDING && get(OC_AUTO) == OC_AUTO_DECK, "hovering: refused %.0f, auto %.0f", ret(OC_RET_REFUSED), get(OC_AUTO));
        }
    }
    CHECK(askedHovering, "the crew's deck landing never hovered");
    CHECK(oc_deck_out()[OC_DECK_ON_DECK] > 0 && get(OC_CRASHED) == 0, "on the deck: %.0f, crashed %.0f", oc_deck_out()[OC_DECK_ON_DECK], get(OC_CRASHED));
    while (get(OC_PERI) < 150000 && get(OC_T) < 5000) oc_step(5);
    const double auto0 = get(OC_AUTO), peri = get(OC_PERI);
    oc_auto(OC_AUTO_RETURN);
    std::printf("  parked on the deck, its own orbit's lowest point reading %.0f km: RETURN refused %.0f, auto %.0f as before\n", peri / 1000,
                ret(OC_RET_REFUSED), get(OC_AUTO));
    CHECK(ret(OC_RET_REFUSED) == OC_RET_NO_DECK && get(OC_AUTO) == auto0, "on the deck: refused %.0f, auto %.0f", ret(OC_RET_REFUSED), get(OC_AUTO));
    oc_step(3000);
    std::printf("  60 s on: crashed %.0f, on the deck %.0f, gear %.0f\n", get(OC_CRASHED), oc_deck_out()[OC_DECK_ON_DECK], get(OC_GEAR));
    CHECK(get(OC_CRASHED) == 0 && oc_deck_out()[OC_DECK_ON_DECK] > 0 && get(OC_GEAR) > 0, "60 s on: crashed %.0f, on the deck %.0f, gear %.0f", get(OC_CRASHED),
          oc_deck_out()[OC_DECK_ON_DECK], get(OC_GEAR));
}

// Backing away on the Ring's far side, the craft keeps clear of what the page draws there and the core does
// not collide with: the hub's solar mast out along the axis from 350 to 910 m, its arrays 284 m round it
// from 475 to 905 m (web/src/ring-plan.js). Placed 600 m out along the axis on that side and 350 m from it,
// at rest in the frame turning with the Ring's orbit, the craft never comes within the arrays' reach and
// its own half span, 293 m, of the axis while it is beside them. Before, the way out drew it onto the axis
// and out along it, through the arrays and the mast.
void departsClearOfTheMast() {
    using namespace oc;
    oc_reset(LAT, LON, HDG);
    while (get(OC_PHASE) != OC_PH_ORBIT && get(OC_T) < 1500) oc_step(50);
    const double t = timeOf(g);
    const V3 side = unit(cross(ring.axis, ring.normal));
    const V3 rel = ring.axis * 600.0 + side * 350.0;
    g.r = ringPos(t) + rel;
    g.v = ringVel(t) + cross(ring.normal * ring.rate, rel);
    g.w = {0, 0, 0};
    oc_auto(OC_AUTO_RETURN);
    CHECK(ret(OC_RET_PHASE) == OC_RET_PH_DEPART, "backing away: phase %.0f", ret(OC_RET_PHASE));
    double closest = 1e9, farthestOut = 0;
    while (ret(OC_RET_PHASE) == OC_RET_PH_DEPART && get(OC_CRASHED) == 0 && get(OC_T) < t + 3000) {
        oc_step(5);
        const V3 d = g.r - ringPos(timeOf(g));
        const double along = dot(d, ring.axis), off = norm(d - ring.axis * along);
        if (along > 350 - 10 && along < 910 + 50) closest = std::fmin(closest, off);
        farthestOut = std::fmax(farthestOut, along);
    }
    std::printf("  from 600 m along the axis on the far side, 350 m off it: clear of the Ring at %.0f s, %.0f m out; beside the mast and its arrays, "
                "%.0f m from the axis at the nearest\n", get(OC_T) - t, farthestOut, closest);
    CHECK(ret(OC_RET_PHASE) == OC_RET_PH_WAIT && get(OC_CRASHED) == 0, "clear: phase %.0f, crashed %.0f", ret(OC_RET_PHASE), get(OC_CRASHED));
    CHECK(closest > 293, "%.0f m from the axis beside the mast and its arrays", closest);
}

// The crew cannot see the wind, only what its instruments measure: its commands, for a state and the air data
// its probes give there, are the same to the bit whatever the wind that made those air data. Through a flight
// home in a moderate wind, at every 2 s from the entry to the stop, the crew's step is worked out twice from
// the same state and the same air data, once with the day's wind in the state and once with another day's;
// the torque, the small thrusters, the throttle, the gear, the brakes, the nose wheel, the hand law's targets
// and every field of the return's state must agree. Shown able to fail: given the other day's own air data,
// the second differs.
void blindToTheWind() {
    using namespace oc;
    oc_reset(LAT, LON, HDG);
    oc_return_disturb(1.02, 0.97, 77, 1.0);
    while (get(OC_PHASE) != OC_PH_ORBIT && get(OC_T) < 1500) oc_step(50);
    oc_wind(5, 2.0);
    oc_auto(OC_AUTO_RETURN);
    int checks = 0, apart = 0, seen = 0;
    while (get(OC_T) < 30000 && get(OC_CRASHED) == 0 && ret(OC_RET_PHASE) != OC_RET_PH_STOPPED) {
        oc_step(100);
        if (ret(OC_RET_PHASE) < OC_RET_PH_ENTRY) continue;
        const Local L = localOf(g);
        State a = g, b = g, c = g;
        b.wind.seed = 6;   // another day: the air moves otherwise here, but the probes said what they said
        c.wind.seed = 6;
        double ta = 0, tb = 0, tc = 0;
        returnCrew(a, L, &ta);
        returnCrew(b, L, &tb);
        returnCrew(c, localOf(c), &tc);   // and the other day's own air data
        auto hashOf = [](const State& x) { unsigned h = 2166136261u; returnHash(x, h); return h; };   // every field of the return's state
        auto same = [&](const State& x, const State& y, double tx, double ty) {
            return tx == ty && std::memcmp(&x.torque, &y.torque, sizeof x.torque) == 0 && std::memcmp(&x.rcs, &y.rcs, sizeof x.rcs) == 0 && x.gear == y.gear &&
                   x.brake == y.brake && x.steer == y.steer && x.thetaT == y.thetaT && x.phiT == y.phiT && x.autoMode == y.autoMode &&
                   hashOf(x) == hashOf(y);
        };
        ++checks;
        if (!same(a, b, ta, tb)) ++apart;
        if (!same(a, c, ta, tc)) ++seen;
    }
    std::printf("  %d steps from the entry to the stop in a moderate wind: the crew's commands the same whatever the wind behind the same air data at %d, "
                "different at %d; given the other wind's own air data, different at %d\n", checks, checks - apart, apart, seen);
    CHECK(checks > 200 && ret(OC_RET_PHASE) == OC_RET_PH_STOPPED, "%d checks, phase %.0f", checks, ret(OC_RET_PHASE));
    CHECK(apart == 0, "the crew's commands followed the wind itself at %d steps", apart);
    CHECK(seen > checks / 4, "the other wind's air data changed the commands at only %d steps", seen);
}

struct Test { const char* name; void (*fn)(); };
const Test tests[] = {
    {"readouts_block", readoutsBlock},
    {"lands_from_insertion", landsFromInsertion},
    {"lands_on_a_pass_just_missed", landsOnAPassJustMissed},
    {"lands_after_a_long_wait", landsAfterALongWait},
    {"lands_from_starts_round_the_day", landsFromStartsRoundTheDay},
    {"lands_after_leaving_the_hub", landsAfterLeavingTheHub},
    {"lands_after_undocking", landsAfterUndocking},
    {"lands_from_a_changed_orbit", landsFromAChangedOrbit},
    {"lands_with_its_model_wrong", landsWithItsModelWrong},
    {"lands_with_its_model_wrong_round_the_day", landsWithItsModelWrongRoundTheDay},
    {"lands_when_given_back", landsWhenGivenBack},
    {"the_same_twice", theSameTwice},
    {"model_is_the_plant", modelIsThePlant},
    {"plan_says_when", planSaysWhen},
    {"return_refused_on_the_deck", returnRefusedOnTheDeck},
    {"departs_clear_of_the_mast", departsClearOfTheMast},
    {"blind_to_the_wind", blindToTheWind},
};

// The Monte Carlo, on demand (not a ctest):
//   test_return monte_carlo <first> <count> <pool> [rho wave coef [wind mass thrust noise]]
// Runs first..first+count-1 of the pool, drawn as above (the spreads may be given: the model's density, its
// wave and its coefficients; the wind's strength up to wind, the mass and thrust as known each within that
// fraction of the true, the instruments' noise), and prints a line for each, then how many landed, with a
// 95 % Wilson interval. A landing here is the first 900 m, 3 m of the line, under 2 m/s down, stopped on the
// runway, inside the limits. Shard a big pool across processes by first.
int monteCarlo(int argc, char** argv) {
    const int first = argc > 2 ? std::atoi(argv[2]) : 0, count = argc > 3 ? std::atoi(argv[3]) : 20;
    const uint64_t pool = argc > 4 ? std::strtoull(argv[4], nullptr, 10) : 1;
    auto arg = [&](int k, double dflt) { return argc > k ? std::atof(argv[k]) : dflt; };
    const Spread sp{arg(5, 0.25), arg(6, 0.15), arg(7, 0.10), arg(8, 0), arg(9, 0), arg(10, 0), arg(11, 0)};
    int good = 0;
    std::printf("run,outcome,engage_s,rho,wave,lift,drag,burn_s,cross_km,sink,along,off,stop_along,stop_off,heat_kW,load_g,qbar_Pa,prop_kg,"
                "wind,mass,thrust,noise,td_speed,td_head,td_cross,td_gust_up,wait_h,passes,skipped,reach_km,air_prop_kg\n");
    for (int i = first; i < first + count; ++i) {
        const Draw d = draw(pool, i, sp);
        const Run r = fly(d.engage, IN_ORBIT, 0, d.err, d.wx);
        const char* why = "landed";
        if (!r.finite) why = "not-finite";
        else if (get(OC_CRASHED) > 0) why = "crashed";
        else if (ret(OC_RET_STOPPED) < 1) why = r.tBurn < 0 ? "no-plan" : "not-stopped";
        else if (!(ret(OC_RET_TD_ALONG) > 0 && ret(OC_RET_TD_ALONG) < OC_RET_ZONE_M)) why = "outside-zone";
        else if (std::fabs(ret(OC_RET_TD_OFF)) >= 3) why = "off-centreline";
        else if (ret(OC_RET_TD_SINK) >= 2) why = "hard";
        else if (!(ret(OC_RET_STOP_ALONG) < OC_RET_RUNWAY_M && std::fabs(ret(OC_RET_STOP_OFF)) < OC_RET_RUNWAY_HALF_M)) why = "overran";
        else if (ret(OC_RET_OVER) != 0 || r.maxG >= OC_RET_LOAD_LIMIT || ret(OC_RET_HEAT_PEAK) >= OC_RET_HEAT_LIMIT) why = "limit";
        good += std::strcmp(why, "landed") == 0;
        std::printf("%d,%s,%.0f,%.3f,%.3f,%.3f,%.3f,%.0f,%.0f,%.2f,%.0f,%.2f,%.0f,%.2f,%.0f,%.2f,%.0f,%.0f,%.3f,%.4f,%.4f,%.2f,%.1f,%.2f,%.2f,%.2f,%.2f,%d,%d,%.0f,%.0f\n", i,
                    why, d.engage, d.err.rho, d.err.wave, d.err.lift, d.err.drag, r.tBurn, r.cross / 1000, ret(OC_RET_TD_SINK), ret(OC_RET_TD_ALONG),
                    ret(OC_RET_TD_OFF), ret(OC_RET_STOP_ALONG), ret(OC_RET_STOP_OFF), ret(OC_RET_HEAT_PEAK) / 1000, ret(OC_RET_LOAD_PEAK), ret(OC_RET_QBAR_PEAK),
                    ret(OC_RET_PROP_USED), d.wx.wind, d.wx.mass, d.wx.thrust, d.wx.noise, ret(OC_RET_TD_SPEED), r.tdHead, r.tdCross, r.tdGust,
                    r.tBurn > 0 ? (r.tBurn - r.engage) / 3600 : -1.0, r.passes, r.skipped, r.reach / 1000, r.airProp);
        std::fflush(stdout);
    }
    const double n = count, p = n > 0 ? good / n : 0, z = 1.96, dd = 1 + z * z / n, c = (p + z * z / (2 * n)) / dd;
    const double h = z * std::sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / dd;
    std::printf("# %d of %d landed (%.1f %%; 95 %% Wilson %.1f-%.1f %%)\n", good, count, 100 * p, 100 * (c - h), 100 * (c + h));
    return 0;
}

}   // namespace

int main(int argc, char** argv) {
    if (argc > 1 && std::strcmp(argv[1], "monte_carlo") == 0) return monteCarlo(argc, argv);
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
