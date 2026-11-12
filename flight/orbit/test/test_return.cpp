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

#include "../core/orbit_core.h"
#include "../core/orbit_dock.h"
#include "../core/orbit_return.h"

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
    double dv, cross, maxG;
    bool docked;
    double dockedAt;
    int passes;
    unsigned hashAtBurn, hash;
    bool finite;
};

// How wrong the guidance's model of the air and the craft is (oc_return_model_error); 1, 0, 0, 1, 1: right.
struct ModelError { double rho, wave, phase, lift, drag; };
const ModelError RIGHT{1, 0, 0, 1, 1};

// Fly the crew to orbit, start the return at `engage` s, and fly it to a stop (or a crash, or the limit).
Run fly(double engage, Start start = IN_ORBIT, double pilotBurn = 0, ModelError err = RIGHT) {
    Run r{};
    r.engage = engage;
    r.tBurn = r.tInterface = r.tTerminal = r.tTouch = r.tStop = -1;
    r.finite = true;
    oc_reset(LAT, LON, HDG);
    oc_return_model_error(err.rho, err.wave, err.phase, err.lift, err.drag);
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
    oc_auto(OC_AUTO_RETURN);
    int phase = (int)ret(OC_RET_PHASE);
    while (get(OC_T) < engage + 200000) {
        oc_step(10);
        const int ph = (int)ret(OC_RET_PHASE);
        if (ph == OC_RET_PH_WAIT || ph == OC_RET_PH_DEPART) {   // the plan, as it stands before the burn
            r.dv = ret(OC_RET_DV);
            r.cross = ret(OC_RET_CROSS);
            r.passes = (int)ret(OC_RET_PASSES);
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

// What a landing must be.
void landed(const Run& r) {
    print(r);
    CHECK(r.finite, "every readout finite");
    CHECK(get(OC_CRASHED) == 0, "not crashed, at %.0f s", get(OC_T));
    CHECK(ret(OC_RET_TOUCHED) > 0, "touched down");
    CHECK(ret(OC_RET_TD_ALONG) > 0 && ret(OC_RET_TD_ALONG) < OC_RET_ZONE_M, "in the touchdown zone: %.0f m past the threshold", ret(OC_RET_TD_ALONG));
    CHECK(std::fabs(ret(OC_RET_TD_OFF)) < 3.0, "near the centreline: %.2f m", ret(OC_RET_TD_OFF));
    CHECK(ret(OC_RET_TD_SINK) < 2.0, "a gentle touch: %.2f m/s down", ret(OC_RET_TD_SINK));
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
struct Draw { double engage; ModelError err; };
Draw draw(uint64_t pool, int i, double rhoSpread = 0.25, double waveMax = 0.15, double coefSpread = 0.10) {
    uint64_t z = mix(pool * 1000003ULL + (uint64_t)i);
    auto u = [&](double a, double b) { z = mix(z); return a + (b - a) * ((z >> 11) * (1.0 / 9007199254740992.0)); };
    Draw d;
    d.engage = u(800, 87000);
    d.err.rho = u(1 - rhoSpread, 1 + rhoSpread);
    d.err.wave = u(0, waveMax);
    d.err.phase = u(0, 6.283185307179586);
    d.err.lift = u(1 - coefSpread, 1 + coefSpread);
    d.err.drag = u(1 - coefSpread, 1 + coefSpread);
    return d;
}

void landsWithItsModelWrongRoundTheDay() {
    for (int i = 0; i < 4; ++i) {
        const Draw d = draw(11, i);
        std::printf("  draw %d: the model's air x%.2f (wave %.2f), lift x%.2f, drag x%.2f\n", i, d.err.rho, d.err.wave, d.err.lift, d.err.drag);
        landed(fly(d.engage, IN_ORBIT, 0, d.err));
    }
}

// The pilot takes the controls on the way down and gives them back: in the entry, in the glide, on the
// final. The crew picks the flight home up from wherever the craft is.
void landsWhenGivenBack() {
    const double at[][2] = {{5500, 60}, {6900, 60}, {7700, 30}};
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
};

// The Monte Carlo, on demand (not a ctest): test_return monte_carlo <first> <count> <pool> [rho wave coef].
// Runs first..first+count-1 of the pool, drawn as above (the spreads may be given), and prints a line for
// each, then how many landed, with a 95 % Wilson interval. Shard a big pool across processes by first.
int monteCarlo(int argc, char** argv) {
    const int first = argc > 2 ? std::atoi(argv[2]) : 0, count = argc > 3 ? std::atoi(argv[3]) : 20;
    const uint64_t pool = argc > 4 ? std::strtoull(argv[4], nullptr, 10) : 1;
    const double rho = argc > 5 ? std::atof(argv[5]) : 0.25, wave = argc > 6 ? std::atof(argv[6]) : 0.15, coef = argc > 7 ? std::atof(argv[7]) : 0.10;
    int good = 0;
    std::printf("run,outcome,engage_s,rho,wave,lift,drag,burn_s,cross_km,sink,along,off,stop_along,stop_off,heat_kW,load_g,qbar_Pa,prop_kg\n");
    for (int i = first; i < first + count; ++i) {
        const Draw d = draw(pool, i, rho, wave, coef);
        const Run r = fly(d.engage, IN_ORBIT, 0, d.err);
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
        std::printf("%d,%s,%.0f,%.3f,%.3f,%.3f,%.3f,%.0f,%.0f,%.2f,%.0f,%.2f,%.0f,%.2f,%.0f,%.2f,%.0f,%.0f\n", i, why, d.engage, d.err.rho, d.err.wave, d.err.lift,
                    d.err.drag, r.tBurn, r.cross / 1000, ret(OC_RET_TD_SINK), ret(OC_RET_TD_ALONG), ret(OC_RET_TD_OFF), ret(OC_RET_STOP_ALONG),
                    ret(OC_RET_STOP_OFF), ret(OC_RET_HEAT_PEAK) / 1000, ret(OC_RET_LOAD_PEAK), ret(OC_RET_QBAR_PEAK), ret(OC_RET_PROP_USED));
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
