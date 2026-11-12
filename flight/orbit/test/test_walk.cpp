// The walk's tests (orbit_walk.h). Each states a piece of the physics of a turning frame, or a promise of
// the walk's core. Where the frame's two forces are at work, the test works the same motion out again
// from outside the ring, where there are no such forces and a body let go moves in a straight line, and
// holds the two equal. Run one by name (test_walk dropped_ball) or all; ctest runs each line below that
// reads "// TEST: <name>". GPLv3.
//
// TEST: readouts_block
// TEST: one_g_on_the_floor
// TEST: rest_stays_put
// TEST: spinward_is_heavier
// TEST: push_off_is_bounded
// TEST: jump_is_a_straight_line
// TEST: running_jumps
// TEST: dropped_ball
// TEST: thrown_ball
// TEST: hub_is_nearly_weightless
// TEST: lift_down
// TEST: lift_up
// TEST: call_the_lift
// TEST: walls_hold
// TEST: hatch_to_floor
// TEST: back_aboard
// TEST: plan_is_sound
// TEST: deterministic

#include "../core/orbit_core.h"
#include "../core/orbit_walk.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <initializer_list>

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

const double PI = 3.14159265358979323846, G0 = 9.80665;
const double W = OC_RING_SPIN, R = OC_RING_FLOOR_M, RL = OC_WALK_LOBBY_M;
const double CM = OC_WALK_CM_M, RB = OC_WALK_BALL_M;
const double V_LIFT = OC_WALK_LIFT_PUSH / (2 * W);
const double STREET = 2 * PI * R / OC_WALK_STREETS;
const double SPIN = 0, AXIS = PI / 2, ANTI = PI, BACK = -PI / 2;   // headings

double get(int i) { return oc_walk_out()[i]; }
bool finite() {
    for (int i = 0; i < oc_walk_out_len(); ++i)
        if (!std::isfinite(get(i))) return false;
    return true;
}

// Hands off, standing.
void still() { oc_walk_controls(0, 0, get(OC_WALK_HEADING), 0, 0, 0, 0); }
void stepFor(double seconds) { oc_walk_step((int)std::lround(seconds / OC_DT)); }

// Walk, or run, straight ahead on a heading for a while.
void go(double heading, double seconds, bool run = false) {
    oc_walk_controls(1, 0, heading, 0, run, 0, 0);
    stepFor(seconds);
}

void press(bool jump, bool use) {   // one press, let go at once
    oc_walk_controls(0, 0, get(OC_WALK_HEADING), get(OC_WALK_PITCH), 0, jump, use);
    oc_walk_controls(0, 0, get(OC_WALK_HEADING), get(OC_WALK_PITCH), 0, 0, 0);
}

// A body let go in the ring, seen from outside: it leaves radius r0 with the velocity (vs, vc, vh) it
// had in the ring's frame (spinward, along the axis, up), keeps the floor's own speed W r0 on top of
// that, and goes straight until it is at radius r1. How long that takes, and where the ring's frame
// finds it then: turned by dth round the ring from where it left, and dc along the axis.
void straightLine(double r0, double vs, double vc, double vh, double r1, double* time, double* dth, double* dc) {
    const double vt = vs + W * r0, vr = -vh;   // across and along the radius, outside
    const double a = vr * vr + vt * vt, b = r0 * vr, c = r0 * r0 - r1 * r1;
    const double t = (-b + std::sqrt(b * b - a * c)) / a;
    *time = t;
    *dth = std::atan2(vt * t, r0 + vr * t) - W * t;   // the ring has turned W t meanwhile
    *dc = vc * t;
}

// ---- the tests ----------------------------------------------------------------------------------

void readoutsBlock() {
    oc_walk_reset(OC_WALK_AT_FLOOR);
    stepFor(1);
    CHECK(oc_walk_out_len() == OC_WALK_COUNT, "%d readouts", oc_walk_out_len());
    CHECK(std::fabs(get(OC_WALK_T) - 1) < 1e-9, "the clock reads %.3f s after a second", get(OC_WALK_T));
    CHECK(finite(), "finite");
    const double t = get(OC_WALK_T);
    oc_walk_reset(7);   // no such place: refused, nothing moves
    CHECK(get(OC_WALK_T) == t, "a reset at no place was not refused");
}

// Standing on the rim floor: omega^2 r, one g.
void oneGOnTheFloor() {
    oc_walk_reset(OC_WALK_AT_FLOOR);
    stepFor(2);
    const double weight = -get(OC_WALK_FELT_H);
    std::printf("  standing on the floor: %.4f m/s2, %.4f g\n", weight, get(OC_WALK_G));
    CHECK(get(OC_WALK_WHERE) == OC_WALK_ON_FLOOR && get(OC_WALK_GROUND) == 1, "on the floor");
    CHECK(std::fabs(get(OC_WALK_G) - 1) < 0.005, "%.4f g", get(OC_WALK_G));
    CHECK(std::fabs(weight - W * W * (R - CM)) < 1e-12, "the floor's push %.6f against omega^2 r %.6f", weight, W * W * (R - CM));
    CHECK(get(OC_WALK_FELT_S) == 0 && get(OC_WALK_FELT_C) == 0, "a sideways pull at rest");
    CHECK(std::fabs(get(OC_WALK_CENTRIFUGAL) - weight) < 1e-12, "the centrifugal readout");
    CHECK(get(OC_WALK_COR_S) == 0 && get(OC_WALK_COR_C) == 0 && get(OC_WALK_COR_H) == 0, "Coriolis at rest");
    CHECK(std::fabs(get(OC_WALK_H)) < 1e-9 && std::fabs(get(OC_WALK_R) - (R - CM)) < 1e-9, "the feet %.2e m off the floor", get(OC_WALK_H));
}

// At rest the walker stays where it is, for minutes: on the floor, in the lobby, in a waiting car.
void restStaysPut() {
    for (int place : {OC_WALK_AT_FLOOR, OC_WALK_AT_HATCH, OC_WALK_AT_LIFT}) {
        oc_walk_reset(place);
        const double x = get(OC_WALK_EYE_X), y = get(OC_WALK_EYE_Y), z = get(OC_WALK_EYE_Z);
        stepFor(300);
        const double moved = std::sqrt(std::pow(get(OC_WALK_EYE_X) - x, 2) + std::pow(get(OC_WALK_EYE_Y) - y, 2) + std::pow(get(OC_WALK_EYE_Z) - z, 2));
        CHECK(moved < 1e-9, "place %d: moved %.3e m in five minutes", place, moved);
        CHECK(get(OC_WALK_SPEED) == 0 && get(OC_WALK_VH) == 0, "place %d: creeping at %.3e m/s", place, get(OC_WALK_SPEED));
        CHECK(get(OC_WALK_GROUND) == 1 && finite(), "place %d: on its feet", place);
    }
}

// Walking spinward the walker turns faster about the axis than the floor does, and weighs more:
// (W r + v)^2 / r, which is omega^2 r and 2 omega v and a little. Antispinward, less. Along the axis, the same.
void spinwardIsHeavier() {
    const double r = R - CM, standing = W * W * r;
    for (const bool run : {false, true}) {
        const double v = run ? OC_WALK_RUN : OC_WALK_PACE;
        double change[2];
        for (int way = 0; way < 2; ++way) {
            oc_walk_reset(OC_WALK_AT_FLOOR);
            CHECK(oc_walk_put(300, OC_WALK_PROMENADE_M) == 1, "the promenade is free");
            go(way == 0 ? SPIN : ANTI, 10, run);
            const double vs = get(OC_WALK_VS), weight = -get(OC_WALK_FELT_H);
            change[way] = weight - standing;
            CHECK(std::fabs(std::fabs(vs) - v) < 1e-9 && std::fabs(get(OC_WALK_VC)) < 1e-9, "walking at %.6f m/s, %.2e along the axis", vs, get(OC_WALK_VC));
            CHECK(std::fabs(weight - std::pow(W * r + vs, 2) / r) < 1e-9, "the floor's push %.6f against (W r + v)^2 / r", weight);
            // the change is 2 omega v, and v^2 / r besides: at a walk a third of a per cent of it, at a run nine tenths
            CHECK(std::fabs(change[way] - (2 * W * vs + vs * vs / r)) < 1e-9, "the change %.9f against 2 omega v + v^2 / r %.9f", change[way], 2 * W * vs + vs * vs / r);
            CHECK(std::fabs(change[way] - 2 * W * vs) < (run ? 0.01 : 0.005) * 2 * W * v, "the change %.5f against 2 omega v %.5f", change[way], 2 * W * vs);
            CHECK(std::fabs(get(OC_WALK_COR_H) + 2 * W * vs) < 1e-12 && std::fabs(get(OC_WALK_COR_S)) < 1e-12, "Coriolis: %.5f up", get(OC_WALK_COR_H));
        }
        std::printf("  %s at %.1f m/s: %+.4f m/s2 spinward (%+.2f %%), %+.4f antispinward (%+.2f %%); 2 omega v is %.4f\n", run ? "running" : "walking", v,
                    change[0], 100 * change[0] / standing, change[1], 100 * change[1] / standing, 2 * W * v);
        CHECK(change[0] > 0 && change[1] < 0, "heavier spinward, lighter antispinward");
    }
    oc_walk_reset(OC_WALK_AT_FLOOR);
    oc_walk_put(300, OC_WALK_PROMENADE_M);
    go(AXIS, 2);
    CHECK(std::fabs(get(OC_WALK_VC) - OC_WALK_PACE) < 1e-3, "walking along the axis at %.3f m/s", get(OC_WALK_VC));
    CHECK(std::fabs(-get(OC_WALK_FELT_H) - standing) < 1e-12, "along the axis the weight changed by %.3e", -get(OC_WALK_FELT_H) - standing);
}

// The legs push no harder than they can, and no harder than the soles hold: mu times the weight. On the
// rim the legs are the limit; where the weight is next to nothing, the soles are.
void pushOffIsBounded() {
    auto hardest = [](double heading) {
        double most = 0, was = 0;
        oc_walk_controls(1, 0, heading, 0, 1, 0, 0);
        for (int i = 0; i < 400; ++i) {
            oc_walk_step(1);
            const double v = get(OC_WALK_SPEED);
            if ((v - was) / OC_DT > most) most = (v - was) / OC_DT;
            was = v;
        }
        return most;
    };
    oc_walk_reset(OC_WALK_AT_FLOOR);
    oc_walk_put(300, OC_WALK_PROMENADE_M);
    const double rim = hardest(AXIS);
    oc_walk_reset(OC_WALK_AT_HATCH);
    const double lobby = hardest(AXIS);
    oc_walk_reset(OC_WALK_AT_LIFT);
    const double car = hardest(BACK);   // along the axis, where walking does not change the weight
    std::printf("  the hardest push off: %.2f m/s2 on the rim, %.3f in the lobby on its grip floor, %.3f in a car at the hub\n", rim, lobby, car);
    CHECK(std::fabs(rim - OC_WALK_PUSH) < 1e-9, "on the rim: %.3f", rim);
    CHECK(std::fabs(lobby - OC_WALK_MU * (W * W * (RL - CM) + OC_WALK_GRIP)) < 1e-9, "in the lobby: %.4f", lobby);
    CHECK(std::fabs(car - OC_WALK_MU * W * W * (RL - CM)) < 1e-9, "in a car at the hub: %.4f", car);
}

// A jump straight up, a metre high. From outside the ring the jumper keeps the floor's speed and adds the
// jump's, inward: a straight chord across the corner of the circle. It lands spinward of where it left.
void jumpIsAStraightLine() {
    oc_walk_reset(OC_WALK_AT_FLOOR);
    oc_walk_put(300, OC_WALK_PROMENADE_M);
    stepFor(1);
    const double r0 = get(OC_WALK_R), th0 = get(OC_WALK_THETA), c0 = get(OC_WALK_C);
    double time, dth, dc;
    straightLine(r0, 0, 0, OC_WALK_JUMP, r0, &time, &dth, &dc);
    press(true, false);
    double worst = 0, weightless = 1;
    // every step of the flight against the chord: the jumper's place outside, turned back into the ring's frame
    for (int i = 1; i <= 200 && get(OC_WALK_JUMPS) == 0; ++i) {
        oc_walk_step(1);
        if (get(OC_WALK_GROUND) == 1) break;
        const double t = i * OC_DT, vt = W * r0, vr = -OC_WALK_JUMP;
        const double x = r0 + vr * t, y = vt * t;   // along and across the radius it left on, outside
        const double radius = std::hypot(x, y), angle = th0 + std::atan2(y, x) - W * t;
        const double err = std::hypot(get(OC_WALK_R) - radius, radius * (get(OC_WALK_THETA) - angle));
        if (err > worst) worst = err;
        if (get(OC_WALK_G) != 0) weightless = 0;
        CHECK(std::fabs(get(OC_WALK_C) - c0) < 1e-12, "it drifted along the axis");
    }
    std::printf("  a %.3f m jump: %.4f s in the air, down %.2f mm spinward; the straight line outside says %.4f s, %.2f mm; apart by %.1e m at most on the way\n",
                get(OC_WALK_JUMP_RISE), get(OC_WALK_JUMP_T), get(OC_WALK_JUMP_DS) * 1000, time, R * dth * 1000, worst);
    CHECK(get(OC_WALK_JUMPS) == 1, "it landed");
    CHECK(std::fabs(get(OC_WALK_JUMP_RISE) - 1.0) < 0.01, "a rise of %.4f m", get(OC_WALK_JUMP_RISE));
    CHECK(worst < 1e-9, "the flight left the straight line by %.3e m", worst);
    CHECK(std::fabs(get(OC_WALK_JUMP_T) - time) < 1e-9, "%.9f s in the air against %.9f", get(OC_WALK_JUMP_T), time);
    CHECK(std::fabs(get(OC_WALK_JUMP_DS) - R * dth) < 1e-9, "down %.9f m spinward against %.9f", get(OC_WALK_JUMP_DS), R * dth);
    CHECK(get(OC_WALK_JUMP_DS) > 0.05 && get(OC_WALK_JUMP_DS) < 0.057, "spinward by %.4f m", get(OC_WALK_JUMP_DS));
    CHECK(std::fabs(get(OC_WALK_JUMP_DC)) < 1e-12, "sideways by %.3e m", get(OC_WALK_JUMP_DC));
    CHECK(weightless == 1, "weight in the air");
    stepFor(1);
    CHECK(get(OC_WALK_GROUND) == 1 && std::fabs(get(OC_WALK_H)) < 1e-9 && get(OC_WALK_SPEED) < 1e-6, "standing again after it");
}

// Jumps on the move: spinward, antispinward, along the axis, at a walk and at a run. Each lands where the
// straight line outside says. Going spinward the jumper is heavier and the jump shorter.
void runningJumps() {
    double times[2] = {0, 0};
    for (const bool run : {false, true}) {
        for (const double heading : {SPIN, ANTI, AXIS, 0.7}) {
            oc_walk_reset(OC_WALK_AT_FLOOR);
            oc_walk_put(300, OC_WALK_PROMENADE_M);
            go(heading, 4, run);
            const double r0 = get(OC_WALK_R), vs = get(OC_WALK_VS), vc = get(OC_WALK_VC);
            double time, dth, dc;
            straightLine(r0, vs, vc, OC_WALK_JUMP, r0, &time, &dth, &dc);
            oc_walk_controls(1, 0, heading, 0, run, 1, 0);
            for (int i = 0; i < 200 && get(OC_WALK_JUMPS) == 0; ++i) oc_walk_step(1);
            CHECK(get(OC_WALK_JUMPS) == 1, "heading %.2f: it landed", heading);
            CHECK(std::fabs(get(OC_WALK_JUMP_T) - time) < 1e-9, "heading %.2f: %.9f s against %.9f", heading, get(OC_WALK_JUMP_T), time);
            CHECK(std::fabs(get(OC_WALK_JUMP_DS) - R * dth) < 1e-8, "heading %.2f: %.9f m round the ring against %.9f", heading, get(OC_WALK_JUMP_DS), R * dth);
            CHECK(std::fabs(get(OC_WALK_JUMP_DC) - dc) < 1e-8, "heading %.2f: %.9f m along the axis against %.9f", heading, get(OC_WALK_JUMP_DC), dc);
            if (run && heading == SPIN) times[0] = get(OC_WALK_JUMP_T);
            if (run && heading == ANTI) times[1] = get(OC_WALK_JUMP_T);
        }
    }
    std::printf("  a running jump: %.4f s in the air spinward, %.4f s antispinward\n", times[0], times[1]);
    CHECK(times[0] < times[1] - 0.05, "the spinward jump is the shorter");
}

// A ball let go two metres up. Outside, it keeps the speed of the place it was let go from, which is
// slower than the floor's, and goes straight: the floor overtakes it, and it comes down antispinward.
void droppedBall() {
    struct Case { int place; double R; };
    for (const Case k : {Case{OC_WALK_AT_FLOOR, R}, Case{OC_WALK_AT_HATCH, RL}}) {
        oc_walk_reset(k.place);
        if (k.place == OC_WALK_AT_FLOOR) oc_walk_put(300, OC_WALK_PROMENADE_M);
        oc_walk_controls(0, 0, AXIS, 0, 0, 0, 0);
        const double r0 = k.R - 2 - RB, r1 = k.R - RB;
        double time, dth, dc;
        straightLine(r0, 0, 0, 0, r1, &time, &dth, &dc);
        oc_walk_ball(2, 0);
        CHECK(get(OC_WALK_BALL) == OC_BALL_FLYING, "the ball is let go");
        for (int i = 0; i < 2000 && get(OC_WALK_BALL_FALLS) == 0; ++i) oc_walk_step(1);
        std::printf("  a ball dropped 2 m %s: %.4f s, down %.2f mm antispinward; outside: %.4f s, %.2f mm\n", k.place == OC_WALK_AT_FLOOR ? "on the floor" : "in the lobby",
                    get(OC_WALK_BALL_T), -get(OC_WALK_BALL_DS) * 1000, time, -k.R * dth * 1000);
        CHECK(get(OC_WALK_BALL_FALLS) == 1, "it came down");
        CHECK(std::fabs(get(OC_WALK_BALL_T) - time) < 1e-9, "%.9f s against %.9f", get(OC_WALK_BALL_T), time);
        CHECK(std::fabs(get(OC_WALK_BALL_DS) - k.R * dth) < 1e-9, "%.9f m against %.9f", get(OC_WALK_BALL_DS), k.R * dth);
        CHECK(get(OC_WALK_BALL_DS) < 0 && std::fabs(get(OC_WALK_BALL_DC)) < 1e-12, "antispinward, and not along the axis");
        stepFor(30);
        CHECK(get(OC_WALK_BALL) == OC_BALL_RESTING && finite(), "it comes to rest");
    }
    // let go by a walker on the move, it keeps the hand's speed: the walker turns about the axis as the
    // floor's circle does, so the hand, half a metre further in than the walker's middle, goes a little slower
    oc_walk_reset(OC_WALK_AT_FLOOR);
    oc_walk_put(300, OC_WALK_PROMENADE_M);
    go(SPIN, 4);
    double time, dth, dc;
    straightLine(R - 1.5 - RB, get(OC_WALK_VS) * (R - 1.5 - RB) / get(OC_WALK_R), 0, 0, R - RB, &time, &dth, &dc);
    oc_walk_ball(1.5, 0);
    for (int i = 0; i < 200 && get(OC_WALK_BALL_FALLS) == 0; ++i) oc_walk_step(1);
    CHECK(std::fabs(get(OC_WALK_BALL_T) - time) < 1e-9 && std::fabs(get(OC_WALK_BALL_DS) - R * dth) < 1e-8, "let go at a walk: %.9f s, %.9f m against %.9f s, %.9f m",
          get(OC_WALK_BALL_T), get(OC_WALK_BALL_DS), time, R * dth);
}

// A ball thrown, any which way: still a straight line outside.
void thrownBall() {
    struct Throw { double heading, pitch, speed; };
    for (const Throw k : {Throw{SPIN, 0.5, 6}, Throw{ANTI, 0.5, 6}, Throw{AXIS, 0.3, 8}, Throw{2.2, 1.0, 5}}) {
        oc_walk_reset(OC_WALK_AT_FLOOR);
        oc_walk_put(300, 45);
        oc_walk_controls(0, 0, k.heading, k.pitch, 0, 0, 0);
        const double r0 = R - 1.5 - RB, level = k.speed * std::cos(k.pitch);
        double time, dth, dc;
        straightLine(r0, level * std::cos(k.heading), level * std::sin(k.heading), k.speed * std::sin(k.pitch), R - RB, &time, &dth, &dc);
        oc_walk_ball(1.5, k.speed);
        for (int i = 0; i < 500 && get(OC_WALK_BALL_FALLS) == 0; ++i) oc_walk_step(1);
        CHECK(get(OC_WALK_BALL_FALLS) == 1, "it came down");
        CHECK(std::fabs(get(OC_WALK_BALL_T) - time) < 1e-9, "heading %.1f: %.9f s against %.9f", k.heading, get(OC_WALK_BALL_T), time);
        CHECK(std::fabs(get(OC_WALK_BALL_DS) - R * dth) < 1e-8 && std::fabs(get(OC_WALK_BALL_DC) - dc) < 1e-8, "heading %.1f: %.6f, %.6f m against %.6f, %.6f",
              k.heading, get(OC_WALK_BALL_DS), get(OC_WALK_BALL_DC), R * dth, dc);
    }
    // thrown at the same speed and angle, a ball goes further antispinward than spinward: it is lighter that way
    double reach[2];
    for (int way = 0; way < 2; ++way) {
        oc_walk_reset(OC_WALK_AT_FLOOR);
        oc_walk_put(300, 45);
        oc_walk_controls(0, 0, way == 0 ? SPIN : ANTI, 0.6, 0, 0, 0);
        oc_walk_ball(1.5, 12);
        for (int i = 0; i < 500 && get(OC_WALK_BALL_FALLS) == 0; ++i) oc_walk_step(1);
        reach[way] = std::fabs(get(OC_WALK_BALL_DS));
    }
    std::printf("  thrown at 12 m/s, 34 deg up: %.2f m spinward, %.2f m antispinward\n", reach[0], reach[1]);
    CHECK(reach[1] > reach[0] + 0.5, "the antispinward throw is the longer");
}

// The hub's lobby: three hundredths of a g. A jump there is a leap of twenty seconds that comes down far
// spinward, and a run against the spin takes most of what weight there is.
void hubIsNearlyWeightless() {
    oc_walk_reset(OC_WALK_AT_HATCH);
    stepFor(1);
    const double r0 = get(OC_WALK_R), standing = -get(OC_WALK_FELT_H);
    std::printf("  standing in the lobby: %.4f m/s2, %.4f g\n", standing, get(OC_WALK_G));
    CHECK(get(OC_WALK_WHERE) == OC_WALK_IN_HUB && get(OC_WALK_USE) == OC_USE_HATCH, "at the hatch");
    CHECK(std::fabs(r0 - (RL - CM)) < 1e-9 && std::fabs(standing - W * W * r0) < 1e-12, "omega^2 r in the lobby: %.6f", standing);
    CHECK(get(OC_WALK_G) < 0.035 && get(OC_WALK_G) > 0.025, "%.4f g", get(OC_WALK_G));
    double time, dth, dc;
    straightLine(r0, 0, 0, OC_WALK_JUMP, r0, &time, &dth, &dc);
    press(true, false);
    for (int i = 0; i < 3000 && get(OC_WALK_JUMPS) == 0; ++i) oc_walk_step(1);
    std::printf("  a jump there: %.2f s in the air, %.1f m up, down %.2f m spinward; outside: %.2f s, %.2f m\n", get(OC_WALK_JUMP_T), get(OC_WALK_JUMP_RISE),
                get(OC_WALK_JUMP_DS), time, RL * dth);
    CHECK(get(OC_WALK_JUMPS) == 1, "it landed");
    CHECK(std::fabs(get(OC_WALK_JUMP_T) - time) < 1e-8, "%.9f s against %.9f", get(OC_WALK_JUMP_T), time);
    CHECK(std::fabs(get(OC_WALK_JUMP_DS) - RL * dth) < 1e-7, "%.9f m against %.9f", get(OC_WALK_JUMP_DS), RL * dth);
    CHECK(get(OC_WALK_JUMP_T) > 15 && get(OC_WALK_JUMP_DS) > 30 && get(OC_WALK_JUMP_RISE) > 20, "a leap");
    // a run against the spin: (W r - v)^2 / r
    oc_walk_reset(OC_WALK_AT_HATCH);
    go(ANTI, 20, true);
    const double vs = get(OC_WALK_VS), weight = -get(OC_WALK_FELT_H);
    std::printf("  running against the spin there at %.2f m/s: %.4f m/s2, %.0f %% of standing\n", -vs, weight, 100 * weight / standing);
    CHECK(std::fabs(vs + OC_WALK_RUN) < 1e-6, "running at %.4f m/s", vs);
    CHECK(std::fabs(weight - std::pow(W * r0 + vs, 2) / r0) < 1e-12, "%.6f against (W r + v)^2 / r", weight);
    CHECK(weight < 0.2 * standing, "lighter by far: %.4f of %.4f", weight, standing);
}

// One ride down in a car: what the rider weighs at each height, the sideways push while it moves, and
// the arrival. Returns the ride's time.
double rideDown(bool print) {
    oc_walk_reset(OC_WALK_AT_LIFT);
    CHECK(get(OC_WALK_WHERE) == OC_WALK_IN_LIFT && get(OC_WALK_LIFT) == OC_LIFT_AT_HUB && get(OC_WALK_USE) == OC_USE_RIDE, "in the car, at the hub");
    press(false, true);
    double fastest = 0, mostPush = 0, leastPart = 1, mostG = 0, worstWeight = 0, worstPush = 0, worstCor = 0, next = 0, slid = 0, across = 0;
    const double x0 = get(OC_WALK_EYE_X);   // across the car: spoke 0's spinward is the frame's x
    int steps = 0;
    while (get(OC_WALK_LIFT) != OC_LIFT_AT_FLOOR && steps < 40000) {
        oc_walk_step(1);
        ++steps;
        if (steps == 1) CHECK(get(OC_WALK_LIFT) == OC_LIFT_DOWN, "the car left");
        const double r = get(OC_WALK_R), v = get(OC_WALK_LIFT_V), a = get(OC_WALK_LIFT_A);
        const double weight = -get(OC_WALK_FELT_H), push = get(OC_WALK_FELT_S);
        if (v > fastest) fastest = v;
        if (std::fabs(push) > mostPush) mostPush = std::fabs(push);
        if (weight / (W * W * r) < leastPart) leastPart = weight / (W * W * r);
        if (get(OC_WALK_G) > mostG) mostG = get(OC_WALK_G);
        if (std::fabs(get(OC_WALK_C) - OC_WALK_LIFT_C_M) > slid) slid = std::fabs(get(OC_WALK_C) - OC_WALK_LIFT_C_M);
        if (std::fabs(get(OC_WALK_EYE_X) - x0) > across) across = std::fabs(get(OC_WALK_EYE_X) - x0);
        // what the floor pushes with is omega^2 r, less the car's own acceleration, and Coriolis's for any slide across the car
        const double law = std::fabs(weight - (W * W * (get(OC_WALK_LIFT_R) - CM) + 2 * W * get(OC_WALK_VS) - a));
        if (get(OC_WALK_GROUND) == 1 && law > worstWeight) worstWeight = law;
        // Coriolis's push for the car's speed is 2 omega v, antispinward on the way down
        const double cor = std::fabs(get(OC_WALK_COR_S) + 2 * W * (-get(OC_WALK_VH)));
        if (cor > worstCor) worstCor = cor;
        // and standing still in the car, floor and wall together hold the rider against exactly that
        if (get(OC_WALK_SPEED) == 0 && get(OC_WALK_GROUND) == 1 && get(OC_WALK_LIFT) == OC_LIFT_DOWN) {
            const double err = std::fabs(push + 2 * W * (v - a * OC_DT / 2)) - W * W * (OC_WALK_CAR_M / 2);
            if (err > worstPush) worstPush = err;
        }
        if (print && a == 0 && v > 0 && r >= next) {
            std::printf("    at %4.0f m from the axis: %.4f m/s2 (omega^2 r %.4f), %.3f g, pushed %.3f m/s2 antispinward\n", r, weight, W * W * r, get(OC_WALK_G), -push);
            CHECK(std::fabs(weight - W * W * r) < 1e-9, "at %.0f m: %.6f against omega^2 r %.6f", r, weight, W * W * r);
            next = r < 1000 ? 1000 : r + 1000;
        }
        if (get(OC_WALK_WHERE) != OC_WALK_IN_LIFT || !finite()) break;
    }
    const double time = steps * OC_DT;
    if (print) {
        std::printf("  down in %.1f s (%.1f min): cruise %.2f m/s, pushed sideways %.3f m/s2 at most (2 omega v is %.3f), never under %.2f of the weight of the place, %.3f g at most\n",
                    time, time / 60, fastest, mostPush, 2 * W * fastest, leastPart, mostG);
    }
    CHECK(get(OC_WALK_LIFT) == OC_LIFT_AT_FLOOR, "the car reached the floor");
    CHECK(std::fabs(fastest - V_LIFT) < 1e-9, "the cruise: %.4f m/s against %.4f", fastest, V_LIFT);
    CHECK(worstWeight < 1e-9, "the floor's push off its law by %.3e m/s2", worstWeight);
    CHECK(worstCor < 1e-9, "Coriolis's readout off 2 omega v by %.3e", worstCor);
    CHECK(worstPush < 1e-9, "the sideways hold off 2 omega v by %.3e m/s2 more than the car's width explains", worstPush);
    CHECK(mostPush < OC_WALK_LIFT_PUSH + 0.01 && mostPush > OC_WALK_LIFT_PUSH - 0.01, "the sideways push: %.4f m/s2", mostPush);
    CHECK(leastPart > OC_WALK_LIFT_EASE - 0.02, "the rider's weight fell to %.3f of the place's", leastPart);
    CHECK(mostG < 1 + OC_WALK_LIFT_BRAKE / G0 + 0.02 && mostG > 1.05, "%.3f g at the stop", mostG);
    CHECK(get(OC_WALK_WHERE) == OC_WALK_IN_LIFT, "the rider left the car");
    CHECK(slid < 1e-9 && across < 1e-9, "holding the rail, the rider slid %.3e m along the axis and %.3e m across the car", slid, across);
    // the arrival: at the rim floor, at rest, at one g
    CHECK(get(OC_WALK_LIFT_R) == R && get(OC_WALK_LIFT_V) == 0, "the car at %.6f m, %.3e m/s", get(OC_WALK_LIFT_R), get(OC_WALK_LIFT_V));
    stepFor(2);
    CHECK(get(OC_WALK_SPEED) == 0 && get(OC_WALK_VH) == 0 && std::fabs(get(OC_WALK_H)) < 1e-9, "the rider at rest on its floor");
    CHECK(std::fabs(-get(OC_WALK_FELT_H) - W * W * (R - CM)) < 1e-12 && get(OC_WALK_FELT_S) == 0, "one g again, and no push");
    CHECK(time > 240 && time < 420, "the ride took %.0f s", time);
    return time;
}

void liftDown() {
    rideDown(true);
    // out of the door, onto the floor
    CHECK(get(OC_WALK_WHERE) == OC_WALK_IN_LIFT && get(OC_WALK_USE) == OC_USE_RIDE, "still in the car, which would go up again");
    go(AXIS, 6);
    CHECK(get(OC_WALK_WHERE) == OC_WALK_ON_FLOOR && get(OC_WALK_C) > OC_WALK_LIFT_C_M + 4, "out on the floor, at c %.1f", get(OC_WALK_C));
    CHECK(std::fabs(get(OC_WALK_G) - 1) < 0.01, "%.3f g", get(OC_WALK_G));
}

// And up again: heavier at the start, pushed spinward on the way, almost nothing at the top.
void liftUp() {
    oc_walk_reset(OC_WALK_AT_FLOOR);
    CHECK(get(OC_WALK_LIFT) == OC_LIFT_AT_FLOOR, "the car waits at the floor");
    go(BACK, 5);
    still();
    stepFor(2);
    CHECK(get(OC_WALK_WHERE) == OC_WALK_IN_LIFT && get(OC_WALK_USE) == OC_USE_RIDE, "walked into the car: c %.2f", get(OC_WALK_C));
    press(false, true);
    double mostG = 0, mostPush = 0, leastPart = 1;
    int steps = 0;
    while (get(OC_WALK_LIFT) != OC_LIFT_AT_HUB && steps < 40000) {
        oc_walk_step(1);
        ++steps;
        if (get(OC_WALK_G) > mostG) mostG = get(OC_WALK_G);
        if (get(OC_WALK_FELT_S) > mostPush) mostPush = get(OC_WALK_FELT_S);
        const double part = -get(OC_WALK_FELT_H) / (W * W * get(OC_WALK_R));
        if (part < leastPart) leastPart = part;
    }
    std::printf("  up in %.1f s: %.3f g at the start, pushed %.3f m/s2 spinward, never under %.2f of the weight of the place\n", steps * OC_DT, mostG, mostPush, leastPart);
    CHECK(get(OC_WALK_LIFT) == OC_LIFT_AT_HUB && get(OC_WALK_LIFT_R) == RL && get(OC_WALK_LIFT_V) == 0, "the car reached the hub");
    CHECK(mostG > 1.09 && mostG < 1.13, "%.3f g at the start", mostG);
    CHECK(std::fabs(mostPush - OC_WALK_LIFT_PUSH) < 0.01, "pushed %.4f m/s2 spinward", mostPush);
    CHECK(leastPart > OC_WALK_LIFT_EASE - 0.02, "the rider's weight fell to %.3f of the place's", leastPart);
    stepFor(2);
    CHECK(get(OC_WALK_GROUND) == 1 && std::fabs(get(OC_WALK_H)) < 1e-9 && get(OC_WALK_G) < 0.035, "at rest at the top, %.4f g", get(OC_WALK_G));
    CHECK(std::fabs(steps * OC_DT - rideDown(false)) < 1.0, "up and down take the same time");
}

// A car at the other end is called, comes, and opens. Until it has, the door is shut.
void callTheLift() {
    oc_walk_reset(OC_WALK_AT_HATCH);
    CHECK(oc_walk_put(0, OC_WALK_LIFT_C_M + 6) == 1, "the plaza by the lift is free");
    CHECK(get(OC_WALK_LIFT) == OC_LIFT_AT_HUB && get(OC_WALK_USE) == OC_USE_CALL, "the car is at the hub, and can be called");
    go(BACK, 6);
    CHECK(get(OC_WALK_WHERE) == OC_WALK_ON_FLOOR && get(OC_WALK_C) > OC_WALK_LIFT_C_M + 2.5, "the shut door let the walker in: c %.2f", get(OC_WALK_C));
    press(false, true);
    oc_walk_step(1);
    CHECK(get(OC_WALK_LIFT) == OC_LIFT_DOWN && get(OC_WALK_USE) == OC_USE_NOTHING, "the car is on its way");
    int steps = 0;
    while (get(OC_WALK_LIFT) != OC_LIFT_AT_FLOOR && steps++ < 40000) oc_walk_step(1);
    CHECK(get(OC_WALK_LIFT) == OC_LIFT_AT_FLOOR, "it came, in %.0f s", steps * OC_DT);
    go(BACK, 6);
    CHECK(get(OC_WALK_WHERE) == OC_WALK_IN_LIFT, "the door is open now: c %.2f", get(OC_WALK_C));
}

// What the walker cannot walk through: the rim walls, the canal's parapets, a block, a lift's tube. And
// what it can cross: the canal, by a bridge.
void wallsHold() {
    const double rad = OC_WALK_RADIUS_M;
    oc_walk_reset(OC_WALK_AT_FLOOR);
    CHECK(oc_walk_put(300, 485) == 1, "under the rim wall is free");
    go(AXIS, 20);
    CHECK(std::fabs(get(OC_WALK_C) - (OC_RING_WIDTH_M / 2 - rad)) < 1e-9 && get(OC_WALK_SPEED) < 1e-9, "the rim wall: stopped at c %.3f", get(OC_WALK_C));
    // still pushing at it: the floor's grip drives the walker into the wall and the wall pushes back as hard, so what
    // the walker feels along the axis is nothing, and the weight is as it was
    CHECK(std::fabs(get(OC_WALK_FELT_C)) < 1e-9 && std::fabs(-get(OC_WALK_FELT_H) - W * W * (R - CM)) < 1e-12, "pushing at the wall: %.3e m/s2 along the axis", get(OC_WALK_FELT_C));
    // the parapet, walked at, run at, and jumped at
    CHECK(oc_walk_put(300, OC_WALK_PROMENADE_M) == 1, "the promenade");
    go(BACK, 10, true);
    CHECK(std::fabs(get(OC_WALK_C) - (OC_WALK_CANAL_M + OC_WALK_PARAPET_M + rad)) < 1e-9, "the parapet: stopped at c %.3f", get(OC_WALK_C));
    for (int i = 0; i < 5; ++i) {
        oc_walk_controls(1, 0, BACK, 0, 1, 1, 0);
        stepFor(0.5);
        oc_walk_controls(1, 0, BACK, 0, 1, 0, 0);
        stepFor(1.5);
    }
    CHECK(get(OC_WALK_C) > OC_WALK_CANAL_M + OC_WALK_PARAPET_M, "a jump cleared the parapet: c %.3f", get(OC_WALK_C));
    CHECK(get(OC_WALK_JUMPS) >= 4, "it jumped");
    // the water is no place to stand; a bridge is
    const double s0 = get(OC_WALK_S), c0 = get(OC_WALK_C);
    CHECK(oc_walk_put(300, 0) == 0 && get(OC_WALK_S) == s0 && get(OC_WALK_C) == c0, "the canal took the walker");
    CHECK(oc_walk_put(3 * STREET, 0) == 1, "a bridge's deck is free");
    CHECK(oc_walk_put(3 * STREET, OC_WALK_PROMENADE_M) == 1, "the bridge's end");
    go(BACK, 60);
    CHECK(get(OC_WALK_C) < -OC_WALK_PROMENADE_M, "over the bridge to c %.1f", get(OC_WALK_C));
    // a block: walk at its face
    const double* b = oc_walk_boxes();
    int block = -1;
    for (int i = 0; i < oc_walk_box_count() && block < 0; ++i)
        if (b[i * OC_WALK_BOX_FIELDS + OC_WALK_BOX_KIND] == OC_BOX_BLOCK) block = i;
    CHECK(block >= 0, "there is a block");
    if (block >= 0) {
        const double* k = b + block * OC_WALK_BOX_FIELDS;
        const double mid = (k[OC_WALK_BOX_C0] + k[OC_WALK_BOX_C1]) / 2;
        CHECK(oc_walk_put(k[OC_WALK_BOX_S], mid) == 0, "a block took the walker");
        CHECK(oc_walk_put(k[OC_WALK_BOX_S] - k[OC_WALK_BOX_HALF] - 4, mid) == 1, "beside the block is free");
        go(SPIN, 10);
        CHECK(std::fabs(get(OC_WALK_S) - (k[OC_WALK_BOX_S] - k[OC_WALK_BOX_HALF] - rad)) < 1e-6, "the block: stopped at s %.3f, its face at %.3f", get(OC_WALK_S),
              k[OC_WALK_BOX_S] - k[OC_WALK_BOX_HALF]);
    }
    // a spoke's foot
    CHECK(oc_walk_put(-60, 0) == 0, "the parapet at the deck's edge, 60 m from the spoke, took the walker");
    CHECK(oc_walk_put(-50, 0) == 1, "the plaza's deck, antispinward of the spoke");
    go(SPIN, 30);
    CHECK(std::fabs(get(OC_WALK_S) - (2 * PI * R - OC_RING_SPOKE_M / 2 - rad)) < 1e-6, "the spoke's foot: stopped %.3f m short of the spoke's line", 2 * PI * R - get(OC_WALK_S));
    CHECK(finite(), "finite");
}

// Walk on a line toward a place given across the lobby (m of arc from spoke 0) and along the axis, and stop there.
void walkTo(double x, double c) {
    for (int i = 0; i < 6000; ++i) {
        double th = get(OC_WALK_THETA);
        if (th > PI) th -= 2 * PI;
        const double here = get(OC_WALK_WHERE) == OC_WALK_ON_FLOOR ? R : RL;
        const double dx = x - th * here, dc = c - get(OC_WALK_C), far = std::hypot(dx, dc);
        const double stop = get(OC_WALK_SPEED) * get(OC_WALK_SPEED) / (2 * 0.6);   // what the soles need to stop in
        if (far < 0.15 && get(OC_WALK_SPEED) < 0.05) break;
        oc_walk_controls(far > stop + 0.1 ? 1 : 0, 0, std::atan2(dc, dx), 0, 0, 0, 0);
        oc_walk_step(1);
    }
    still();
}

// The way in: from the hatch across the lobby, round the lift's housing to its door, down, and out.
void hatchToFloor() {
    oc_walk_reset(OC_WALK_AT_HATCH);
    const double door = OC_WALK_LIFT_C_M + OC_WALK_CAR_M / 2;
    walkTo(5, 30);
    walkTo(5, door + 3);
    walkTo(0, door + 3);
    CHECK(get(OC_WALK_WHERE) == OC_WALK_IN_HUB, "at the door, in the lobby");
    walkTo(0, OC_WALK_LIFT_C_M);
    stepFor(3);
    const double walked = get(OC_WALK_T);
    CHECK(get(OC_WALK_WHERE) == OC_WALK_IN_LIFT && get(OC_WALK_USE) == OC_USE_RIDE, "in the car: c %.2f", get(OC_WALK_C));
    press(false, true);
    for (int i = 0; i < 40000 && get(OC_WALK_LIFT) != OC_LIFT_AT_FLOOR; ++i) oc_walk_step(1);
    const double rode = get(OC_WALK_T) - walked;
    CHECK(get(OC_WALK_LIFT) == OC_LIFT_AT_FLOOR && get(OC_WALK_WHERE) == OC_WALK_IN_LIFT, "down, still in the car");
    go(AXIS, 8);
    std::printf("  from the hatch to the car in %.0f s, down in %.0f s, and out at s %.1f, c %.1f: %.3f g\n", walked, rode, get(OC_WALK_S), get(OC_WALK_C), get(OC_WALK_G));
    CHECK(get(OC_WALK_WHERE) == OC_WALK_ON_FLOOR && get(OC_WALK_GROUND) == 1, "out on the floor");
    CHECK(std::fabs(get(OC_WALK_G) - 1) < 0.02 && finite(), "at one g");
}

// And the way out: at the hatch, use goes back aboard, and the walk is over.
void backAboard() {
    oc_walk_reset(OC_WALK_AT_HATCH);
    go(AXIS, 5);
    still();
    stepFor(4);
    CHECK(get(OC_WALK_USE) == OC_USE_NOTHING && get(OC_WALK_ABOARD) == 0, "away from the hatch there is nothing to use");
    press(false, true);
    oc_walk_step(1);
    CHECK(get(OC_WALK_ABOARD) == 0, "use did nothing there");
    walkTo(0, OC_WALK_LOBBY_C0_M + 1);
    CHECK(get(OC_WALK_USE) == OC_USE_HATCH, "at the hatch again: c %.2f", get(OC_WALK_C));
    press(false, true);
    oc_walk_step(1);
    CHECK(get(OC_WALK_ABOARD) == 1, "aboard");
    const double x = get(OC_WALK_EYE_X), y = get(OC_WALK_EYE_Y);
    go(AXIS, 5);
    CHECK(get(OC_WALK_EYE_X) == x && get(OC_WALK_EYE_Y) == y && get(OC_WALK_ABOARD) == 1, "the walk went on after the walker left it");
}

// The plan the walker walks in: every solid thing where it should be, and the ways through left open.
void planIsSound() {
    const int n = oc_walk_box_count();
    const double* b = oc_walk_boxes();
    int blocks = 0, parapets = 0, pylons = 0, shafts = 0, lobby = 0;
    double tallest = 0;
    for (int i = 0; i < n; ++i) {
        const double* k = b + i * OC_WALK_BOX_FIELDS;
        const int kind = (int)k[OC_WALK_BOX_KIND], zone = (int)k[OC_WALK_BOX_ZONE];
        CHECK(k[OC_WALK_BOX_HALF] > 0 && k[OC_WALK_BOX_C0] < k[OC_WALK_BOX_C1] && k[OC_WALK_BOX_H0] < k[OC_WALK_BOX_H1], "box %d has no size", i);
        CHECK(zone == OC_WALK_IN_HUB || zone == OC_WALK_ON_FLOOR, "box %d stands nowhere", i);
        if (zone == OC_WALK_IN_HUB) { ++lobby; CHECK(kind == OC_BOX_SHAFT, "box %d in the lobby", i); }
        if (kind == OC_BOX_PARAPET) ++parapets;
        if (kind == OC_BOX_PYLON) ++pylons;
        if (kind == OC_BOX_SHAFT) ++shafts;
        if (kind != OC_BOX_BLOCK) continue;
        ++blocks;
        const double s = k[OC_WALK_BOX_S], half = k[OC_WALK_BOX_HALF], c0 = k[OC_WALK_BOX_C0], c1 = k[OC_WALK_BOX_C1];
        const double near = std::fabs(c0) < std::fabs(c1) ? std::fabs(c0) : std::fabs(c1), far = std::fabs(c0) > std::fabs(c1) ? std::fabs(c0) : std::fabs(c1);
        if (k[OC_WALK_BOX_H1] > tallest) tallest = k[OC_WALK_BOX_H1];
        CHECK(c0 * c1 > 0, "block %d straddles the canal", i);
        CHECK(near > OC_WALK_PROMENADE_M + OC_WALK_PROMENADE_W_M / 2 + 10, "block %d on the promenade: c %.1f", i, near);
        CHECK(far < OC_WALK_WALLPATH_M - OC_WALK_WALLPATH_W_M / 2, "block %d on the wall's path: c %.1f", i, far);
        CHECK(near > OC_WALK_LANE_M + OC_WALK_LANE_W_M / 2 || far < OC_WALK_LANE_M - OC_WALK_LANE_W_M / 2, "block %d on the lane: c %.1f to %.1f", i, near, far);
        const double street = std::fabs(s - std::floor(s / STREET + 0.5) * STREET);
        CHECK(street - half > OC_WALK_STREET_M + 5, "block %d on a cross street: %.1f m from its line", i, street - half);
        const double spoke = std::fabs(s - std::floor(s / (10 * STREET) + 0.5) * 10 * STREET);
        CHECK(spoke - half > OC_WALK_PLAZA_M || near > OC_WALK_PLAZA_M, "block %d on a plaza", i);
        for (int j = i + 1; j < n; ++j) {   // and none in another
            const double* o = b + j * OC_WALK_BOX_FIELDS;
            if ((int)o[OC_WALK_BOX_KIND] != OC_BOX_BLOCK) continue;
            const bool apart = std::fabs(o[OC_WALK_BOX_S] - s) > o[OC_WALK_BOX_HALF] + half + 2 || o[OC_WALK_BOX_C0] > c1 + 2 || o[OC_WALK_BOX_C1] < c0 - 2;
            CHECK(apart, "blocks %d and %d touch", i, j);
        }
    }
    std::printf("  %d solid things: %d blocks (the tallest %.1f m), %d parapets, %d spokes' feet, %d walls of lift tubes, %d of them in the lobby\n", n, blocks, tallest,
                parapets, pylons, shafts, lobby);
    CHECK(n < 4096, "the plan is full: %d", n);
    CHECK(blocks > 600 && blocks < 2500, "%d blocks", blocks);
    CHECK(pylons == OC_RING_SPOKES && parapets == 4 * OC_WALK_STREETS && shafts == 13 * OC_RING_SPOKES, "%d spokes' feet, %d parapets, %d walls", pylons, parapets, shafts);
    CHECK(tallest < 20, "a block %.1f m tall is not low", tallest);
    // the promenade runs clear all the way round, on both banks, and so does the path under each wall
    oc_walk_reset(OC_WALK_AT_FLOOR);
    int blocked = 0;
    for (int i = 0; i < 6000; ++i) {
        const double s = i * (2 * PI * R / 6000);
        for (const double c : {OC_WALK_PROMENADE_M, -OC_WALK_PROMENADE_M, OC_WALK_WALLPATH_M, -OC_WALK_WALLPATH_M, OC_WALK_LANE_M, -OC_WALK_LANE_M})
            if (oc_walk_put(s, c) != 1) ++blocked;
    }
    CHECK(blocked == 0, "%d places on the paths round the ring are not free", blocked);
    // and every cross street, wall to wall
    for (int j = 0; j < OC_WALK_STREETS; ++j) {
        if (j % 10 == 0) continue;   // a spoke stands on its plaza
        for (double c = -495; c <= 495; c += 5)
            if (oc_walk_put(j * STREET, c) != 1) ++blocked;
    }
    CHECK(blocked == 0, "%d places on the cross streets are not free", blocked);
}

// The same walk twice is the same walk; another is another.
unsigned aWalk(double heading) {
    oc_walk_reset(OC_WALK_AT_LIFT);
    press(false, true);
    oc_walk_controls(1, 0.3, heading, 0.2, 0, 1, 0);   // in the moving car the rail is held: none of this moves the rider
    stepFor(30);
    oc_walk_ball(1.2, 4);
    for (int i = 0; i < 40000 && get(OC_WALK_LIFT) != OC_LIFT_AT_FLOOR; ++i) oc_walk_step(1);
    go(AXIS, 8);   // out onto the floor
    oc_walk_controls(1, 0.3, heading, 0.2, 0, 1, 0);
    stepFor(20);
    oc_walk_ball(1.2, 4);
    oc_walk_controls(0.5, -1, heading + 1, 0.4, 1, 0, 0);
    stepFor(60);
    oc_walk_controls(1, 0, AXIS, 0, 0, 1, 0);
    stepFor(15);
    oc_walk_ball(2, 9);
    go(heading, 20, true);
    return oc_walk_hash();
}

void deterministic() {
    const unsigned a = aWalk(0.4), b = aWalk(0.4), c = aWalk(0.41);
    std::printf("  hashes %08x %08x, and %08x for another walk\n", a, b, c);
    CHECK(a == b, "the same walk gave %08x and %08x", a, b);
    CHECK(a != c, "a different walk gave the same hash");
    CHECK(get(OC_WALK_WHERE) == OC_WALK_ON_FLOOR && finite(), "and it ended on the floor");
}

struct Test { const char* name; void (*fn)(); };
const Test tests[] = {
    {"readouts_block", readoutsBlock},
    {"one_g_on_the_floor", oneGOnTheFloor},
    {"rest_stays_put", restStaysPut},
    {"spinward_is_heavier", spinwardIsHeavier},
    {"push_off_is_bounded", pushOffIsBounded},
    {"jump_is_a_straight_line", jumpIsAStraightLine},
    {"running_jumps", runningJumps},
    {"dropped_ball", droppedBall},
    {"thrown_ball", thrownBall},
    {"hub_is_nearly_weightless", hubIsNearlyWeightless},
    {"lift_down", liftDown},
    {"lift_up", liftUp},
    {"call_the_lift", callTheLift},
    {"walls_hold", wallsHold},
    {"hatch_to_floor", hatchToFloor},
    {"back_aboard", backAboard},
    {"plan_is_sound", planIsSound},
    {"deterministic", deterministic},
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
