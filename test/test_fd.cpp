// The flight director's tests (orbit_fd.h). Each states a promise of the director: that it shows what the
// crew would fly, that it changes nothing, and that a person who flies by its cues alone flies the crew's
// flight. Run one by name (test_fd flown_to_orbit) or all; ctest runs each line below that reads
// "// TEST: <name>". GPLv3.
//
// TEST: readouts_block
// TEST: shadow_is_the_crew
// TEST: takes_up_where_the_crew_left_off
// TEST: takes_up_the_flight_home
// TEST: leaves_the_flight_alone
// TEST: quiet_where_others_show
// TEST: flown_to_orbit
// TEST: flown_home

#include "../core/orbit_core.h"
#include "../core/orbit_dock.h"
#include "../core/orbit_fd.h"
#include "../core/orbit_return.h"
#include "../core/internal.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>

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
const double D2R = M_PI / 180, R2D = 180 / M_PI;

double get(int i) { return oc_out()[i]; }
double ret(int i) { return oc_return_out()[i]; }
double wrap180(double a) { a = std::fmod(a + 540.0, 360.0); return a < 0 ? a + 180 : a - 180; }

bool finite() {
    for (int i = 0; i < oc_out_len(); ++i)
        if (!std::isfinite(oc_out()[i])) return false;
    return true;
}

// The director's command, as read out.
struct Cmd { double valid, phase, pitch, hdg, bank, thr, alpha, liftBank, gear; };
Cmd readCmd() {
    return {get(OC_FD_VALID), get(OC_FD_PHASE), get(OC_FD_PITCH_DEG), get(OC_FD_HDG_DEG), get(OC_FD_BANK_DEG), get(OC_FD_THROTTLE),
            get(OC_FD_ALPHA_DEG), get(OC_FD_LIFT_BANK_DEG), get(OC_FD_GEAR)};
}
bool sameCmd(const Cmd& a, const Cmd& b) { return std::memcmp(&a, &b, sizeof a) == 0; }
void printCmd(const char* what, const Cmd& c) {
    std::printf("    %s: valid %.0f phase %.0f pitch %.6f hdg %.6f bank %.6f thr %.6f alpha %.4f lift bank %.4f gear %.0f\n", what, c.valid, c.phase,
                c.pitch, c.hdg, c.bank, c.thr, c.alpha, c.liftBank, c.gear);
}

// The attitude a law aimed at over the step just flown (internal.h, Aim), in the frame the step began in,
// and the throttle it asked for, from how the engine answered (the engine follows the throttle with a lag
// of 0.4 s: thr' = thr + (cmd - thr) h / 0.4).
struct Flown { int aimed; double pitch, heading, bank, throttle; };
Flown flown(const oc::State& before, const oc::State& after) {
    const oc::Local L = oc::localOf(before);
    Flown f{oc::aim.set, 0, 0, 0, 0};
    if (oc::aim.set && oc::aim.air) { f.pitch = oc::aim.theta; f.heading = L.heading; f.bank = oc::aim.phi; }
    else if (oc::aim.set) {
        const oc::V3 xb = oc::rot(oc::aim.q, {1, 0, 0}), yb = oc::rot(oc::aim.q, {0, 1, 0}), zb = oc::rot(oc::aim.q, {0, 0, 1});
        f.pitch = std::asin(oc::clampd(oc::dot(xb, L.up), -1, 1));
        f.heading = std::atan2(oc::dot(xb, L.east), oc::dot(xb, L.north));
        f.bank = std::atan2(-oc::dot(yb, L.up), -oc::dot(zb, L.up));
    }
    f.throttle = after.thr == 0 ? 0 : before.thr + (after.thr - before.thr) * (0.4 / OC_DT);
    return f;
}

// ---- the tests ----------------------------------------------------------------------------------

// The block reads out: on at reset, a command after a step, nothing once switched off, the switch read back.
void readoutsBlock() {
    oc_reset(LAT, LON, HDG);
    CHECK(get(OC_FD_ON) == 1, "on at reset: %.0f", get(OC_FD_ON));
    CHECK(get(OC_FD_VALID) == 0, "no command before a step");
    oc_step(1);
    const Cmd c = readCmd();
    printCmd("the crew's hold", c);
    CHECK(c.valid == 1 && c.phase == OC_FD_PH_HOLD, "the hold: valid %.0f, phase %.0f", c.valid, c.phase);
    CHECK(c.thr == 0 && c.gear == 1 && std::fabs(c.bank) < 1e-9, "throttle %.2f, gear %.0f, bank %.4f", c.thr, c.gear, c.bank);
    CHECK(std::fabs(c.pitch - get(OC_PITCH_DEG)) < 0.01 && std::fabs(wrap180(c.hdg - get(OC_HDG_DEG))) < 1e-3, "the pitch held %.3f (%.3f), the heading %.9f",
          c.pitch, get(OC_PITCH_DEG), wrap180(c.hdg - get(OC_HDG_DEG)));
    oc_fd(0);
    CHECK(get(OC_FD_ON) == 0 && get(OC_FD_VALID) == 0 && get(OC_FD_PHASE) == 0, "switched off: on %.0f, valid %.0f", get(OC_FD_ON), get(OC_FD_VALID));
    oc_step(100);
    CHECK(get(OC_FD_VALID) == 0, "off, nothing");
    oc_fd(1);
    CHECK(get(OC_FD_ON) == 1 && get(OC_FD_VALID) == 0, "on again: nothing until a step");
    oc_step(1);
    CHECK(get(OC_FD_VALID) == 1 && get(OC_FD_PHASE) == OC_FD_PH_HOLD, "and a command after one: phase %.0f", get(OC_FD_PHASE));
    oc_fd(7);
    CHECK(get(OC_FD_ON) == 1, "any number but nought is on");
    CHECK(finite(), "finite");
}

// While the crew flies to orbit, the director's shadow runs beside it, from its own memory, and commands
// what the crew commands, step for step and bit for bit: the same phase, the same targets and the same plan,
// the attitude the crew's law aims at, its throttle and its gear. Shown able to fail: the shadow given a
// pitch target a hundredth of a degree off as the climb begins (its ramp holding the hundredth) is told apart.
void shadowIsTheCrew() {
    for (int spoiled = 0; spoiled < 2; ++spoiled) {
        oc_reset(LAT, LON, HDG);
        long steps = 0, compared = 0, apart = 0, firstApart = -1;
        double worstAngle = 0, worstThrottle = 0;
        bool spoilt = false;
        while (get(OC_PHASE) != OC_PH_ORBIT && get(OC_T) < 1500 && get(OC_CRASHED) == 0) {
            if (spoiled && !spoilt && oc::g.phase == OC_PH_CLIMB) { oc::g.fd.thetaT += 0.01 * D2R; spoilt = true; }
            const oc::State before = oc::g;
            oc_step(1);
            ++steps;
            const oc::State& after = oc::g;
            const oc::FdState& F = after.fd;
            const Flown f = flown(before, after);
            bool same = F.valid == 1 && F.source == 1 && F.phase == after.phase && F.thetaT == after.thetaT && F.phiT == after.phiT &&
                        F.pegF0 == after.pegF0 && F.pegF1 == after.pegF1 && F.pegT == after.pegT && F.pegAt == after.pegAt &&
                        F.pegValid == after.pegValid && F.gear == after.gear && F.fdPhase == OC_FD_PH_HOLD + after.phase;
            if (f.aimed) {
                const double da = std::fmax(std::fabs(F.pitch - f.pitch), std::fmax(std::fabs(std::remainder(F.heading - f.heading, 2 * M_PI)), std::fabs(F.bank - f.bank)));
                worstAngle = std::fmax(worstAngle, da);
                same = same && da < 1e-12;
                ++compared;
            }
            worstThrottle = std::fmax(worstThrottle, std::fabs(F.throttle - f.throttle));
            same = same && std::fabs(F.throttle - f.throttle) < 1e-12;
            if (!same) { ++apart; if (firstApart < 0) firstApart = steps; }
        }
        if (!spoiled) {
            std::printf("  %ld steps of the crew's flight to orbit (%ld with an attitude to compare): apart at %ld; the attitude within %.1e rad, "
                        "the throttle %.1e\n", steps, compared, apart, worstAngle, worstThrottle);
            CHECK(get(OC_PHASE) == OC_PH_ORBIT, "reached orbit");
            CHECK(apart == 0, "the shadow and the crew apart at %ld steps, first at step %ld", apart, firstApart);
            CHECK(compared > steps - 10, "compared %ld of %ld", compared, steps);
        } else {
            std::printf("  the shadow's pitch target spoiled by 0.01 deg as the climb begins: apart from step %ld on, %ld steps\n", firstApart, apart);
            CHECK(apart > 0, "a spoiled shadow not told apart");
        }
    }
}

// Taking the controls from the crew at any moment, the director's first command is the one the crew would
// have flown next, bit for bit: on the runway, rotating, in the climb, the ascent, the burn to orbit, and
// in orbit. The crew's next step and the pilot's first are flown from the same state, restored (the core's
// state is oc::g, the hands, and what oc_reset fixes).
void takesUpWhereTheCrewLeftOff() {
    oc_reset(LAT, LON, HDG);
    const double at[] = {10, 25, 35.5, 60, 150, 300, 760};
    int k = 0;
    while (k < 7 && get(OC_T) < 1000) {
        oc_step(1);
        if (get(OC_T) + 1e-9 < at[k]) continue;
        const oc::State saved = oc::g;
        const oc::Controls hands = oc::hands;
        oc_step(1);
        const Cmd crew = readCmd();
        oc::g = saved;
        oc::hands = hands;
        oc_auto(OC_AUTO_OFF);
        oc_controls(0, 0, 0, 0, 0, 0, 0, 1, 0);
        oc_step(1);
        const Cmd pilot = readCmd();
        std::printf("  taken at %.2f s (phase %d): %s\n", saved.n * OC_DT, saved.phase, sameCmd(crew, pilot) ? "the same command" : "a different one");
        if (!sameCmd(crew, pilot)) { printCmd("crew ", crew); printCmd("pilot", pilot); }
        CHECK(sameCmd(crew, pilot), "at %.2f s the director's first command is not the crew's", saved.n * OC_DT);
        CHECK(crew.valid == 1 && crew.phase == OC_FD_PH_HOLD + saved.phase, "the crew's phase %d read as %.0f", saved.phase, crew.phase);
        oc::g = saved;
        oc::hands = hands;
        ++k;
    }
    CHECK(k == 7, "%d of 7 handovers", k);
}

// The same for the flight home: taken from the crew in the entry, the terminal glide and on final, the
// director's first command is the crew's next (its bank and angle of attack too); while the crew flies
// home, the director reads out its command, the bank and the angle of attack its own readouts give; and the
// shadow, carried on from there, keeps commanding the flight home.
void takesUpTheFlightHome() {
    oc_reset(LAT, LON, HDG);
    while (get(OC_T) < 800) oc_step(50);
    oc_auto(OC_AUTO_RETURN);
    const double at[] = {4000, 5500, 6900, 7700};
    int k = 0;
    long mirrored = 0, mirrorApart = 0;
    while (k < 4 && get(OC_T) < 9000 && get(OC_CRASHED) == 0) {
        oc_step(1);
        const int ph = (int)ret(OC_RET_PHASE);
        if (ph >= OC_RET_PH_COAST && ph <= OC_RET_PH_FLARE) {   // the crew's own, read out as the director's
            ++mirrored;
            if (get(OC_FD_VALID) != 1 || get(OC_FD_PHASE) != OC_FD_PH_ORBIT + ph || std::fabs(get(OC_FD_LIFT_BANK_DEG) - ret(OC_RET_BANK_CMD_DEG)) > 1e-9 ||
                std::fabs(get(OC_FD_ALPHA_DEG) - ret(OC_RET_ALPHA_CMD_DEG)) > 1e-9)
                ++mirrorApart;
        }
        if (get(OC_T) + 1e-9 < at[k]) continue;
        const oc::State saved = oc::g;
        const oc::Controls hands = oc::hands;
        oc_step(1);
        const Cmd crew = readCmd();
        oc::g = saved;
        oc::hands = hands;
        oc_auto(OC_AUTO_OFF);
        oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
        oc_step(1);
        const Cmd pilot = readCmd();
        std::printf("  taken at %.0f s (the flight home's phase %d): %s; bank %.2f, alpha %.2f deg\n", saved.n * OC_DT, saved.ret.phase,
                    sameCmd(crew, pilot) ? "the same command" : "a different one", crew.liftBank, crew.alpha);
        if (!sameCmd(crew, pilot)) { printCmd("crew ", crew); printCmd("pilot", pilot); }
        CHECK(sameCmd(crew, pilot), "at %.0f s the director's first command is not the crew's", saved.n * OC_DT);
        CHECK(crew.valid == 1 && crew.phase == OC_FD_PH_ORBIT + saved.ret.phase, "the flight home's phase %d read as %.0f", saved.ret.phase, crew.phase);
        // the shadow carries on: 30 s more, the pilot's hands off, it still flies the flight home
        int still = 0;
        for (int i = 0; i < 1500; ++i) { oc_step(1); still += get(OC_FD_VALID) == 1 && get(OC_FD_PHASE) > OC_FD_PH_ORBIT; }
        CHECK(still == 1500, "the shadow kept the flight home for %d of 1500 steps", still);
        CHECK(finite(), "finite");
        oc::g = saved;
        oc::hands = hands;
        ++k;
    }
    std::printf("  %ld steps of the crew flying home from the coast to the flare read out as the director's; %ld apart\n", mirrored, mirrorApart);
    CHECK(k == 4, "%d of 4 handovers", k);
    CHECK(mirrored > 100000 && mirrorApart == 0, "%ld of %ld apart", mirrorApart, mirrored);
}

// The director never changes the flight: the same controls, with it on and with it off, give the same
// flight, the state's hash less the director's own (oc_flight_hash) and the place and velocity equal bit for
// bit at every second. A pilot's take-off and climb (the crew to orbit's guidance in the shadow); the crew's
// flight to orbit (the shadow beside it); the flight home with the pilot taking the entry for a minute (the
// entry's predictor and corrector in the shadow). Shown able to fail: a throttle of 0.999 for a second.
void leavesTheFlightAlone() {
    struct Mark { unsigned hash; double r[3], v[3]; };
    auto mark = []() { Mark m; m.hash = oc_flight_hash(); oc_eci(m.r, m.v); return m; };
    auto same = [](const Mark& a, const Mark& b) { return a.hash == b.hash && std::memcmp(a.r, b.r, sizeof a.r) == 0 && std::memcmp(a.v, b.v, sizeof a.v) == 0; };
    // the pilot's take-off and climb: full power, rotate at 95 m/s to 20 degrees, a turn
    auto pilot = [&](int on, double spoil, std::vector<Mark>& marks) {
        oc_reset(LAT, LON, HDG);
        oc_fd(on);
        oc_auto(OC_AUTO_OFF);
        for (int i = 0; i < 12000; ++i) {
            const double pitch = get(OC_TAS) > 95 ? std::fmax(-1.0, std::fmin(1.0, (20 - get(OC_PITCH_DEG)) / 10)) : 0.0;
            const double roll = get(OC_ALT) > 500 && get(OC_ALT) < 3000 ? std::fmax(-1.0, std::fmin(1.0, (-25 - get(OC_ROLL_DEG)) / 30)) : 0.0;
            oc_controls(pitch, roll, 0, i >= 3000 && i < 3050 ? 1 - spoil : 1, 0, 0, 0, get(OC_ALT) < 60, 0);
            oc_step(1);
            if (i % 50 == 49) marks.push_back(mark());
        }
    };
    auto crew = [&](int on, std::vector<Mark>& marks) {
        oc_reset(LAT, LON, HDG);
        oc_fd(on);
        while (get(OC_PHASE) != OC_PH_ORBIT && get(OC_T) < 1500) { oc_step(50); marks.push_back(mark()); }
    };
    auto home = [&](int on, std::vector<Mark>& marks) {
        oc_reset(LAT, LON, HDG);
        oc_fd(on);
        while (get(OC_T) < 800) oc_step(50);
        oc_auto(OC_AUTO_RETURN);
        while (get(OC_T) < 5500) oc_step(50);
        marks.push_back(mark());
        oc_auto(OC_AUTO_OFF);
        oc_controls(0.1, -0.2, 0, 0, 0, 0, 0, 0, 0);
        while (get(OC_T) < 5560) { oc_step(50); marks.push_back(mark()); }
        oc_auto(OC_AUTO_RETURN);
        while (get(OC_T) < 6000) { oc_step(50); marks.push_back(mark()); }
    };
    auto agree = [&](const std::vector<Mark>& a, const std::vector<Mark>& b) {
        if (a.size() != b.size()) return -2;
        for (size_t i = 0; i < a.size(); ++i) if (!same(a[i], b[i])) return (int)i;
        return -1;
    };
    std::vector<Mark> a, b, c;
    pilot(1, 0, a);
    const double shown = get(OC_FD_VALID);
    pilot(0, 0, b);
    pilot(0, 0.001, c);
    std::printf("  the pilot's climb, %zu marks: with the director and without, apart at %d (-1: never); its throttle 0.999 for a second, apart at "
                "mark %d\n", a.size(), agree(a, b), agree(a, c));
    CHECK(shown == 1, "the director was on");
    CHECK(agree(a, b) == -1, "the director changed the pilot's flight at mark %d", agree(a, b));
    CHECK(agree(a, c) == 60, "a throttle of 0.999 for a second (from step 3000) parts the flights at mark %d, not 60", agree(a, c));
    a.clear(); b.clear();
    crew(1, a);
    crew(0, b);
    std::printf("  the crew's flight to orbit, %zu marks: apart at %d\n", a.size(), agree(a, b));
    CHECK(agree(a, b) == -1 && a.size() > 700, "the director changed the crew's flight at mark %d of %zu", agree(a, b), a.size());
    a.clear(); b.clear();
    home(1, a);
    home(0, b);
    std::printf("  the flight home, the pilot's for a minute in the entry, %zu marks: apart at %d\n", a.size(), agree(a, b));
    CHECK(agree(a, b) == -1 && a.size() > 400, "the director changed the flight home at mark %d of %zu", agree(a, b), a.size());
}

// Where the craft has a display of its own the director says nothing: near the Ring, holding on the port or
// over the deck, docked; and while the approach, docking or the deck landing fly.
void quietWhereOthersShow() {
    oc_reset(LAT, LON, HDG);
    while (get(OC_PHASE) != OC_PH_ORBIT) oc_step(50);
    oc_step(250);
    oc_auto(OC_AUTO_OFF);
    oc_controls(0, 0, 0, 0, 0, 0, 0, 0, 0);
    oc_step(1);
    CHECK(get(OC_FD_VALID) == 1 && get(OC_FD_PHASE) == OC_FD_PH_ORBIT, "in orbit, by hand, 25 km out: the crew's orbit phase, %.0f", get(OC_FD_PHASE));
    oc_auto(OC_AUTO_APPROACH);
    oc_step(1);
    CHECK(get(OC_FD_VALID) == 0, "the approach flies: quiet");
    while (get(OC_PORT_RANGE) > 5 || get(OC_T) < 1600) oc_step(50);   // held off the hub
    oc_auto(OC_AUTO_OFF);
    oc_step(1);
    CHECK(get(OC_FD_VALID) == 0, "by hand %.0f m from the Ring's centre: quiet", get(OC_RING_RANGE));
    oc_sas(OC_SAS_PORT);
    oc_step(1);
    CHECK(get(OC_FD_VALID) == 0, "on the port hold: quiet");
    oc_auto(OC_AUTO_DOCK);
    while (oc_dock_out()[OC_DOCK_DOCKED] < 0.5 && get(OC_T) < 5000) oc_step(50);
    CHECK(get(OC_FD_VALID) == 0, "docking, then docked: quiet");
    CHECK(oc_dock_out()[OC_DOCK_DOCKED] > 0.5, "docked");
    oc_undock();
    oc_auto(OC_AUTO_OFF);
    oc_sas(OC_SAS_HOLD);
    oc_step(1);
    CHECK(get(OC_FD_VALID) == 0, "let go at the hub: quiet");
    CHECK(finite(), "finite");
}

// ---- a person who flies by the director alone --------------------------------------------------------

// They see the cues and the craft's attitude a reaction time late, 0.3 s, and move the stick in proportion
// to each cue's error, to its stops: in the air the stick moves the pitch and bank the law holds, and a
// pitch error of 10 degrees (or a bank error of 60) is full stick; above the air it moves the rates, and 10
// degrees off in pitch or heading (20 in bank) is full stick. The throttle they move toward its cue at the
// keys' rate, 0.6 a second, or slam it full (Z) and shut (X) when the cue is full or nothing; the gear when
// its cue changes; the brakes off once the crew's hold is over, and on once down on the runway again.
// Nothing else: no runway, no horizon, no orbit's numbers. A person may also lead the cue, moving the stick
// for where its error is going as well as where it is (McRuer's pilot does where the craft lags): lead s.
struct Pilot {
    static const int DELAY = 15;   // steps: 0.3 s
    double fullBank = 60;          // degrees of bank error that is full stick in the air
    bool taper = true;             // false: the throttle full until the cue says shut, its taper ignored
    double lead = 0;               // s: the error's rate counted in, times this
    struct Seen { double valid, phase, pitch, hdg, bank, thr, gear, aPitch, aHdg, aRoll, airLaw, t; };
    Seen seen[DELAY + 1], last{};
    long n = 0, steady = 0, after = 0;
    double throttle = 0, brake = 1, was[3] = {0, 0, 0};
    double worstPitch = 0, worstBank = 0, sumPitch = 0, sumBank = 0, worstAt = 0, worstPitchAt = 0;
    int gear = 1;

    void look() {
        seen[n % (DELAY + 1)] = {get(OC_FD_VALID), get(OC_FD_PHASE), get(OC_FD_PITCH_DEG), get(OC_FD_HDG_DEG), get(OC_FD_BANK_DEG), get(OC_FD_THROTTLE),
                                 get(OC_FD_GEAR), get(OC_PITCH_DEG), get(OC_HDG_DEG), get(OC_ROLL_DEG), get(OC_AIR_LAW), get(OC_T)};
        ++n;
    }
    // What they see now: the oldest look still in mind.
    const Seen& now() const { return seen[n <= DELAY ? 0 : n % (DELAY + 1)]; }

    void fly() {
        look();
        const Seen& s = now();
        double pitch = 0, roll = 0, yaw = 0;
        if (s.valid > 0.5) {
            const double ePitch = s.pitch - s.aPitch, eBank = wrap180(s.bank - s.aRoll), eHdg = wrap180(s.hdg - s.aHdg);
            const double k = n > 1 ? lead / OC_DT : 0;   // the lead: the error's change over the step, as a rate
            const double lPitch = ePitch + k * (ePitch - was[0]), lBank = eBank + k * wrap180(eBank - was[1]), lHdg = eHdg + k * wrap180(eHdg - was[2]);
            was[0] = ePitch; was[1] = eBank; was[2] = eHdg;
            pitch = std::fmax(-1.0, std::fmin(1.0, lPitch / 10));
            if (s.airLaw > 0.5) roll = std::fmax(-1.0, std::fmin(1.0, lBank / fullBank));
            else {
                roll = std::fmax(-1.0, std::fmin(1.0, lBank / 20));
                yaw = std::fmax(-1.0, std::fmin(1.0, lHdg / 10));
            }
            // How closely the cues are flown, from the climb to the cut, where they move smoothly: not in the 5 s
            // after a step in a cue (a new phase, the turn's bank, the insertion's first pitch).
            if (std::fabs(s.pitch - last.pitch) > 0.5 || std::fabs(wrap180(s.bank - last.bank)) > 0.5 || s.phase != last.phase) after = n + 250;
            if (n > after && s.phase >= OC_FD_PH_CLIMB && s.phase <= OC_FD_PH_INSERT) {
                ++steady;
                sumPitch += std::fabs(ePitch);
                sumBank += std::fabs(eBank);
                if (std::fabs(ePitch) > worstPitch) { worstPitch = std::fabs(ePitch); worstPitchAt = s.t; }
                if (std::fabs(eBank) > worstBank) { worstBank = std::fabs(eBank); worstAt = s.t; }
            }
            last = s;
            if (s.thr <= 0.0 && throttle > 0) throttle = 0;                             // X
            else if ((s.thr >= 1.0 || !taper) && throttle < 0.9) throttle = 1;          // Z
            else if (taper) throttle += std::fmax(-0.6, std::fmin(0.6, 3 * (s.thr - throttle))) * OC_DT;   // Shift, Ctrl
            throttle = std::fmax(0.0, std::fmin(1.0, throttle));
            gear = s.gear > 0.5;
            const bool down = s.phase == OC_FD_PH_ROLLOUT || s.phase == OC_FD_PH_STOPPED;
            brake = s.phase == OC_FD_PH_HOLD || s.phase == OC_FD_PH_STOPPED ? 1 : down && s.aPitch < 1 ? 0.8 : 0;   // the nose wheel down first
        }
        oc_controls(pitch, roll, yaw, throttle, 0, 0, 0, gear, brake);
    }
};

struct End { double t, apo, peri, inc, prop, ring; bool ok; };

// Ten seconds after the burn ends, its engine's last thrust and all.
End settle(double tEnd) {
    while (get(OC_T) < tEnd + 10) oc_step(1);
    return End{tEnd, get(OC_APO), get(OC_PERI), get(OC_INC_DEG), get(OC_PROP), get(OC_RING_RANGE), get(OC_CRASHED) == 0};
}

// The person flies from the brakes on at 17C until the director says the orbit is made and they have shut
// the throttle; then ten seconds on.
struct Flight { End end; double liftoff, cut, maxQ, maxG; bool made; };
Flight flyByCues(Pilot& p) {
    oc_reset(LAT, LON, HDG);
    oc_auto(OC_AUTO_OFF);
    Flight f{{}, -1, -1, 0, 0, false};
    while (get(OC_T) < 1500 && get(OC_CRASHED) == 0) {
        p.fly();
        oc_step(1);
        if (f.liftoff < 0 && get(OC_ON_GROUND) == 0 && get(OC_ALT) > 10) f.liftoff = get(OC_T);
        f.maxQ = std::fmax(f.maxQ, get(OC_QBAR));
        if (get(OC_T) > 1) f.maxG = std::fmax(f.maxG, get(OC_G));
        if (f.cut < 0 && get(OC_FD_PHASE) == OC_FD_PH_ORBIT) f.cut = get(OC_T);
        if (f.cut > 0 && p.throttle == 0 && get(OC_T) > f.cut + 1) break;
        if (!finite()) break;
    }
    f.made = f.cut > 0 && get(OC_CRASHED) == 0 && finite();
    if (f.made) f.end = settle(get(OC_T));
    return f;
}

// A person flying by the director's cues alone, as above, takes off from 17C and reaches a round orbit at
// the Ring's height: both ends of the orbit within 10 km of 500 km, inclined within 0.3 degrees of the
// crew's, the cues flown within 5 degrees where they move smoothly (half a degree on the mean). Measured ten
// seconds after the burn ends, and the crew's own flight the same way, beside it. Shown able to fail: the
// same person ignoring the throttle cue's taper, full until it says shut, overshoots by more than the 10 km.
// And what a person who grabs for the bank, full stick at 30 degrees, meets: a roll oscillation at the
// insertion's start, where the cue steps 15 degrees up and the hand law is still the air's in air too thin
// for its roll (to 200 Pa).
void flownToOrbit() {
    oc_reset(LAT, LON, HDG);
    while (get(OC_PHASE) != OC_PH_ORBIT && get(OC_T) < 1500 && get(OC_CRASHED) == 0) oc_step(1);
    const End crew = settle(get(OC_T));
    std::printf("  the crew: engine off at %.1f s, 10 s later %.1f x %.1f km, inclined %.2f deg, %.0f kg left, the Ring %.1f km off\n", crew.t,
                crew.apo / 1000, crew.peri / 1000, crew.inc, crew.prop, crew.ring / 1000);
    CHECK(crew.ok && std::fabs(crew.apo - 500000) < 5000 && std::fabs(crew.peri - 500000) < 5000, "the crew's %.1f x %.1f km", crew.apo / 1000, crew.peri / 1000);

    Pilot p;
    const Flight f = flyByCues(p);
    CHECK(f.made, "the director never said orbit: %.0f s, crashed %.0f", get(OC_T), get(OC_CRASHED));
    if (!f.made) return;
    const End& e = f.end;
    std::printf("  by the cues: off the ground at %.1f s, the cue to shut at %.1f s, shut at %.1f s, 10 s later %.1f x %.1f km, inclined %.2f deg, "
                "%.0f kg left, the Ring %.1f km off; max q %.1f kPa, %.2f g\n", f.liftoff, f.cut, e.t, e.apo / 1000, e.peri / 1000, e.inc, e.prop,
                e.ring / 1000, f.maxQ / 1000, f.maxG);
    std::printf("  the cues flown, from the climb to the cut where they move smoothly (%.0f s): pitch within %.2f deg at worst (%.0f s; mean %.3f), bank %.2f (%.0f s; mean %.3f)\n",
                p.steady * OC_DT, p.worstPitch, p.worstPitchAt, p.sumPitch / std::fmax(1.0, (double)p.steady), p.worstBank, p.worstAt, p.sumBank / std::fmax(1.0, (double)p.steady));
    CHECK(std::fabs(e.apo - 500000) < 10000 && std::fabs(e.peri - 500000) < 10000, "by the cues %.1f x %.1f km", e.apo / 1000, e.peri / 1000);
    CHECK(std::fabs(e.inc - crew.inc) < 0.3, "inclined %.2f deg, the crew %.2f", e.inc, crew.inc);
    CHECK(f.maxQ < 40000 && f.maxG < 3.0, "max q %.0f Pa, %.2f g", f.maxQ, f.maxG);
    CHECK(p.worstPitch < 5 && p.worstBank < 5 && p.sumPitch < 0.5 * p.steady && p.sumBank < 0.5 * p.steady && p.steady * OC_DT > 400,
          "the cues flown within %.1f deg in pitch, %.1f in bank, over %.0f s", p.worstPitch,
          p.worstBank, p.steady * OC_DT);

    Pilot full;
    full.taper = false;
    const Flight g = flyByCues(full);
    std::printf("  the throttle full until the cue says shut: %.1f x %.1f km\n", g.end.apo / 1000, g.end.peri / 1000);
    CHECK(g.made && std::fabs(g.end.apo - 500000) > 10000, "the taper ignored, still within 10 km: %.1f km", g.end.apo / 1000);

    Pilot eager;
    eager.fullBank = 30;
    const Flight h = flyByCues(eager);
    std::printf("  full stick at 30 deg of bank error: the bank %.0f deg off its cue at %.0f s; %s %.1f x %.1f km\n", eager.worstBank, eager.worstAt,
                h.made ? "on to" : "no orbit,", h.end.apo / 1000, h.end.peri / 1000);
}

// The flight home, flown by a person by the cues alone: the crew flies it from the insertion orbit (engaged
// at 800 s, as test_return's lands_from_insertion) until they take the controls; then the person, as above
// and leading the cue by 0.4 s, flies it to a stop. From the wait for the pass (the burn theirs as well),
// from the fall to the air, and on final. Each lands as the flight home's own landings are judged
// (orbit_return.h, and the Monte Carlo's): down in the touchdown zone, its first 900 m, within 3 m of the
// centreline, stopped on the runway, the heat, the load and the dynamic pressure inside their limits; and the
// sink at the touch under 5 m/s, firm where the crew's is 0.74: the flare is 2 s long, quick for a hand 0.3 s
// late. Beside it, from the fall to the air, the person without the lead, who lags the pitch cue in the
// entry's bank reversals (at 70 degrees of bank the air law's pitch target turns the nose mostly in yaw) and
// passes 2.5 g.
void flownHome() {
    struct Home { int phase; double tdAlong, tdOff, tdSink, tdSpeed, stopAlong, stopOff, heat, load, qbar; bool crashed, touched, stopped; };
    auto fly = [](double from, double lead) {
        oc_reset(LAT, LON, HDG);
        while (get(OC_T) < 800) oc_step(50);
        oc_auto(OC_AUTO_RETURN);
        while (get(OC_T) < from) oc_step(10);
        Home h{};
        h.phase = (int)ret(OC_RET_PHASE);
        oc_auto(OC_AUTO_OFF);
        Pilot p;
        p.lead = lead;
        p.gear = get(OC_GEAR) > 0.5;
        p.throttle = 0;
        p.brake = 0;
        const double t0 = get(OC_T);
        while (get(OC_T) < t0 + 8000 && get(OC_CRASHED) == 0 && ret(OC_RET_STOPPED) == 0) {
            p.fly();
            oc_step(1);
        }
        h.crashed = get(OC_CRASHED) > 0;
        h.touched = ret(OC_RET_TOUCHED) > 0;
        h.stopped = ret(OC_RET_STOPPED) > 0;
        h.tdAlong = ret(OC_RET_TD_ALONG); h.tdOff = ret(OC_RET_TD_OFF); h.tdSink = ret(OC_RET_TD_SINK); h.tdSpeed = ret(OC_RET_TD_SPEED);
        h.stopAlong = ret(OC_RET_STOP_ALONG); h.stopOff = ret(OC_RET_STOP_OFF);
        h.heat = ret(OC_RET_HEAT_PEAK); h.load = ret(OC_RET_LOAD_PEAK); h.qbar = ret(OC_RET_QBAR_PEAK);
        return h;
    };
    auto print = [](const char* who, const Home& h) {
        std::printf("  %s: %s; down %.0f m past the threshold, %.2f m off the centreline, sinking %.2f m/s at %.1f m/s; stopped %.0f m down, %.2f m off; "
                    "heat %.0f kW/m2, load %.2f g, q %.1f kPa at most\n", who, h.crashed ? "CRASHED" : h.stopped ? "stopped" : "not stopped", h.tdAlong, h.tdOff,
                    h.tdSink, h.tdSpeed, h.stopAlong, h.stopOff, h.heat / 1000, h.load, h.qbar / 1000);
    };
    struct Leg { double from; const char* where; };
    const Leg legs[] = {{2600, "taken waiting for the pass"}, {4000, "taken falling to the air"}, {7700, "taken on final"}};
    for (const Leg& l : legs) {
        const Home h = fly(l.from, 0.4);
        char who[96];
        std::snprintf(who, sizeof who, "%s (%.0f s, phase %d)", l.where, l.from, h.phase);
        print(who, h);
        CHECK(!h.crashed && h.touched && h.stopped, "%s: crashed %d, touched %d, stopped %d", l.where, h.crashed, h.touched, h.stopped);
        CHECK(h.tdAlong > 0 && h.tdAlong < OC_RET_ZONE_M && std::fabs(h.tdOff) < 3, "%s: down %.0f m in, %.2f m off", l.where, h.tdAlong, h.tdOff);
        CHECK(h.stopAlong < OC_RET_RUNWAY_M && std::fabs(h.stopOff) < OC_RET_RUNWAY_HALF_M, "%s: stopped %.0f m down, %.2f m off", l.where, h.stopAlong, h.stopOff);
        CHECK(h.heat < OC_RET_HEAT_LIMIT && h.load < OC_RET_LOAD_LIMIT && h.qbar < OC_RET_QBAR_LIMIT, "%s: %.0f W/m2, %.2f g, %.0f Pa", l.where, h.heat, h.load, h.qbar);
        CHECK(h.tdSink < 5, "%s: down at %.2f m/s", l.where, h.tdSink);
    }
    print("taken falling to the air, the person without the lead", fly(4000, 0));
}

struct Test { const char* name; void (*fn)(); };
const Test tests[] = {
    {"readouts_block", readoutsBlock},
    {"shadow_is_the_crew", shadowIsTheCrew},
    {"takes_up_where_the_crew_left_off", takesUpWhereTheCrewLeftOff},
    {"takes_up_the_flight_home", takesUpTheFlightHome},
    {"leaves_the_flight_alone", leavesTheFlightAlone},
    {"quiet_where_others_show", quietWhereOthersShow},
    {"flown_to_orbit", flownToOrbit},
    {"flown_home", flownHome},
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
