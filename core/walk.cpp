// walk.cpp — a person inside the ring (orbit_walk.h), in the ring's turning frame. GPLv3.
//
// The frame: x along ref, y along the axis, z along ref x axis, turning at W about +y. At angle th round
// the ring the outward radius is (sin th, 0, cos th), spinward is (cos th, 0, -sin th), and up is the
// radius reversed. In this frame a free body has the acceleration
//
//     W^2 (x, 0, z)  -  2 W y^ x v        centrifugal, and Coriolis's
//
// and nothing else: the ring is in free fall, so the Earth's pull is not felt (its tide across the ring,
// six parts in ten thousand of a g, is left out). Everything below is those two terms and what touches
// the walker: a floor, a wall, the soles' friction.
//
// The walker is a point, the centre of mass, OC_WALK_CM_M above the feet. In the air it flies free, by
// Runge-Kutta on the two terms. On a floor it is held to it: the floor's push is what keeps the point on
// the floor's path, and the legs move it along the floor as hard as they push and the soles hold. Two
// kinds of floor: a cylinder about the axis (the rim's, the lobby's) and a lift car's flat one, which
// moves along its spoke.

#include "internal.h"
#include "orbit_walk.h"

#include <cmath>
#include <cstring>

namespace {

using namespace oc;

const double W = OC_RING_SPIN;
const double RF = OC_RING_FLOOR_M, RL = OC_WALK_LOBBY_M;
const double ROOF = OC_RING_FLOOR_M - OC_RING_ROOF_M;   // the roof above the rim floor
const double CM = OC_WALK_CM_M, TALL = OC_WALK_TALL_M, RAD = OC_WALK_RADIUS_M, RB = OC_WALK_BALL_M;
const double CC = OC_WALK_LIFT_C_M, CAR = OC_WALK_CAR_M / 2, WALL = OC_WALK_SHAFT_WALL_M, DOOR = OC_WALK_DOOR_M / 2;
const double HOUSING = OC_WALK_CAR_TALL_M + WALL;        // the top of a lift's housing in the lobby
const double V_LIFT = OC_WALK_LIFT_PUSH / (2 * W);       // the cruise: the speed whose Coriolis push is the one chosen
const double TAU = 0.25;                                 // s: how soon the legs reach the pace asked (chosen)
const int SPOKES = OC_RING_SPOKES;
const double SECTOR = 2 * PI / SPOKES;
const double S_RIM = 2 * PI * RF;                        // once round the rim floor
const double STREET = S_RIM / OC_WALK_STREETS;           // from one cross street to the next

inline double sq(double v) { return v * v; }
inline double easing() { return W * std::sqrt(OC_WALK_LIFT_EASE); }   // 1/s: the rate of the hub's easing
inline double wrapPi(double a) {                                      // into [-pi, pi)
    a = std::fmod(a + PI, 2 * PI);
    return (a < 0 ? a + 2 * PI : a) - PI;
}
inline V3 outward(double th) { return {std::sin(th), 0, std::cos(th)}; }
inline V3 spinward(double th) { return {std::cos(th), 0, -std::sin(th)}; }
inline V3 along(double c) { return {0, c, 0}; }
inline double angleOf(V3 p) { return std::atan2(p.x, p.z); }
inline double radiusOf(V3 p) { return std::hypot(p.x, p.z); }
inline double spokeAngle(int k) { return k * SECTOR; }
inline int nearestSpoke(double th) {
    int k = (int)std::floor(th / SECTOR + 0.5) % SPOKES;
    return k < 0 ? k + SPOKES : k;
}
inline double floorOf(int zone) { return zone == OC_WALK_IN_HUB ? RL : RF; }
inline void limit(double* a, double* b, double most) {
    const double m = std::hypot(*a, *b);
    if (m > most) { *a *= most / m; *b *= most / m; }
}

// ---- the frame's two forces, and free flight under them -----------------------------------------

inline V3 frameAcc(V3 p, V3 v) { return {W * W * p.x - 2 * W * v.z, 0, W * W * p.z + 2 * W * v.x}; }

struct Fly { V3 p, v; };

Fly fly(Fly a, double h) {   // one Runge-Kutta step of h
    const V3 k1p = a.v, k1v = frameAcc(a.p, a.v);
    const V3 k2p = a.v + k1v * (h / 2), k2v = frameAcc(a.p + k1p * (h / 2), k2p);
    const V3 k3p = a.v + k2v * (h / 2), k3v = frameAcc(a.p + k2p * (h / 2), k3p);
    const V3 k4p = a.v + k3v * h, k4v = frameAcc(a.p + k3p * h, k4p);
    return {a.p + (k1p + 2.0 * k2p + 2.0 * k3p + k4p) * (h / 6), a.v + (k1v + 2.0 * k2v + 2.0 * k3v + k4v) * (h / 6)};
}

// ---- the state ----------------------------------------------------------------------------------

struct Car {
    int state, phase;   // OC_LIFT_*; within a ride: 0 easing or starting, 1 the cruise, 2 stopping
    double r, v, a;     // its floor from the axis, outward speed, and the step's acceleration
    double t, brake;    // the easing's clock; the stop's deceleration
    double r0, v0, bend;   // the floor's path through the step in hand: r0 + v0 tau + bend tau^2 / 2
};

struct Ball {
    int state, zone, spoke, fell;
    V3 p, v;
    double th0, c0, t0;         // where and when it was let go
    long long falls;
    double ds, dc, tFall;       // the last fall
};

struct Walker {
    long long n;
    int started;
    V3 p, v;                    // the centre of mass and its velocity, in the ring's frame
    double heading, pitch;
    int zone, spoke, ground, aboard;
    double groundH;             // what the feet are on, above the floor of the place
    double fwd, right;          // what the walker means to do
    int run, jumpIn, useIn, jumpNow, useNow;
    double pushS, pushC, pushH; // what held the walker over the last step, per unit mass: spinward, along the axis, up
    int jumping;                // in the air from a jump
    double jumpTh, jumpC, jumpAt, jumpH, jumpTop;
    long long jumps;
    double jumpDs, jumpDc, jumpT, jumpRise;
    Car car[OC_RING_SPOKES];
    Ball ball;
};

Walker w;
double out[OC_WALK_COUNT];

// ---- the plan: the solid things of the lobby and the floor --------------------------------------

struct Box { double zone, kind, s, half, c0, c1, h0, h1; };   // as the page reads them: OC_WALK_BOX_*
const int MAX_BOXES = 4096;
Box boxes[MAX_BOXES];
int nBoxes = 0;
bool planned = false;

void addBox(int zone, int kind, double s, double half, double c0, double c1, double h0, double h1) {
    if (nBoxes >= MAX_BOXES) return;   // the tests hold the plan under this
    boxes[nBoxes++] = {(double)zone, (double)kind, s, half, c0, c1, h0, h1};
}

// Whole numbers only, so the plan is the same to the last bit on every machine.
inline unsigned mix(unsigned h, unsigned v) {
    h ^= v;
    h *= 16777619u;
    h ^= h >> 15;
    h *= 2246822519u;
    h ^= h >> 13;
    return h;
}
inline double part(unsigned h) { return (h >> 8) * (1.0 / 16777216.0); }   // 0..1

// Whether a cross street's place along the ring is a spoke's, with its plaza.
inline bool isPlaza(int street) { return street % (OC_WALK_STREETS / SPOKES) == 0; }

void plan() {
    if (planned) return;
    planned = true;
    nBoxes = 0;
    // the lifts' housings: at each station three walls of the tube, the door's jambs and the wall over it
    const int places[] = {OC_WALK_IN_HUB, OC_WALK_ON_FLOOR};
    for (int zone : places) {
        const double R = floorOf(zone), top = zone == OC_WALK_IN_HUB ? HOUSING : ROOF;
        for (int k = 0; k < SPOKES; ++k) {
            const double s = spokeAngle(k) * R, outer = CAR + WALL, jamb = (outer - DOOR) / 2;
            addBox(zone, OC_BOX_SHAFT, s, outer, CC - outer, CC - CAR, 0, top);
            addBox(zone, OC_BOX_SHAFT, s - CAR - WALL / 2, WALL / 2, CC - CAR, CC + CAR, 0, top);
            addBox(zone, OC_BOX_SHAFT, s + CAR + WALL / 2, WALL / 2, CC - CAR, CC + CAR, 0, top);
            addBox(zone, OC_BOX_SHAFT, s - DOOR - jamb, jamb, CC + CAR, CC + outer, 0, top);
            addBox(zone, OC_BOX_SHAFT, s + DOOR + jamb, jamb, CC + CAR, CC + outer, 0, top);
            addBox(zone, OC_BOX_SHAFT, s, DOOR, CC + CAR, CC + outer, OC_WALK_DOOR_TALL_M, top);
            if (zone == OC_WALK_IN_HUB) addBox(zone, OC_BOX_SHAFT, s, outer, CC - outer, CC + outer, OC_WALK_CAR_TALL_M, top);   // its lid
        }
    }
    // the spokes' feet
    for (int k = 0; k < SPOKES; ++k)
        addBox(OC_WALK_ON_FLOOR, OC_BOX_PYLON, spokeAngle(k) * RF, OC_RING_SPOKE_M / 2, -OC_RING_SPOKE_M / 2, OC_RING_SPOKE_M / 2, 0, ROOF);
    // the canal's parapets: along both banks from deck to deck, and across the canal at each deck's sides
    const double bank = OC_WALK_CANAL_M, thick = OC_WALK_PARAPET_M, tall = OC_WALK_PARAPET_TALL_M;
    for (int j = 0; j < OC_WALK_STREETS; ++j) {
        const double deck0 = isPlaza(j) ? OC_WALK_PLAZA_DECK_M : OC_WALK_STREET_M;
        const double deck1 = isPlaza((j + 1) % OC_WALK_STREETS) ? OC_WALK_PLAZA_DECK_M : OC_WALK_STREET_M;
        const double a = j * STREET + deck0, b = (j + 1) * STREET - deck1;
        addBox(OC_WALK_ON_FLOOR, OC_BOX_PARAPET, (a + b) / 2, (b - a) / 2, bank, bank + thick, 0, tall);
        addBox(OC_WALK_ON_FLOOR, OC_BOX_PARAPET, (a + b) / 2, (b - a) / 2, -bank - thick, -bank, 0, tall);
        addBox(OC_WALK_ON_FLOOR, OC_BOX_PARAPET, a + thick / 2, thick / 2, -bank, bank, 0, tall);
        addBox(OC_WALK_ON_FLOOR, OC_BOX_PARAPET, b - thick / 2, thick / 2, -bank, bank, 0, tall);
    }
    // the blocks: lots in rows between the cross streets, built on more often near a spoke and near the
    // canal; parkland where they are not. Low, plain, unfurnished.
    const int ALONG = 8, ACROSS = 5;
    const double edge = OC_WALK_STREET_M + 10, lotS = (STREET - 2 * edge) / ALONG, lotC = 82, firstC = 60, margin = 6;
    for (int j = 0; j < OC_WALK_STREETS; ++j) {
        const int fromSpoke = j % (OC_WALK_STREETS / SPOKES), toSpoke = OC_WALK_STREETS / SPOKES - 1 - fromSpoke;
        const int far = fromSpoke < toSpoke ? fromSpoke : toSpoke;   // streets from the nearer spoke's plaza
        const double town = far == 0 ? 0.70 : far == 1 ? 0.45 : far == 2 ? 0.25 : 0.12;
        for (int side = 0; side < 2; ++side) {
            for (int a = 0; a < ALONG; ++a) {
                for (int b = 0; b < ACROSS; ++b) {
                    unsigned h = mix(mix(mix(mix(2166136261u, (unsigned)j), (unsigned)side), (unsigned)a), (unsigned)b);
                    const double chance = town * (b == 0 ? 1.25 : b == ACROSS - 1 ? 0.6 : 1.0);
                    if (part(h) >= chance) continue;
                    const double u1 = part(h = mix(h, 1)), u2 = part(h = mix(h, 2)), u3 = part(h = mix(h, 3));
                    const double u4 = part(h = mix(h, 4)), u5 = part(h = mix(h, 5));
                    const double len = 16 + 28 * u1, wid = 14 + 26 * u2, high = 5 + 11 * u3 * u3;
                    const double s = j * STREET + edge + (a + 0.5) * lotS + (lotS - 2 * margin - len) * (u4 - 0.5);
                    const double c = firstC + (b + 0.5) * lotC + (lotC - 2 * margin - wid) * (u5 - 0.5);
                    // none on a plaza
                    const double fromPlaza = std::fabs(s - std::floor(s / (S_RIM / SPOKES) + 0.5) * (S_RIM / SPOKES));
                    if (fromPlaza - len / 2 < OC_WALK_PLAZA_M + 10 && c - wid / 2 < OC_WALK_PLAZA_M + 10) continue;
                    const double c0 = c - wid / 2, c1 = c + wid / 2;
                    addBox(OC_WALK_ON_FLOOR, OC_BOX_BLOCK, s, len / 2, side ? -c1 : c0, side ? -c0 : c1, 0, high);
                }
            }
        }
    }
}

// A lift's door stands shut unless its car waits at that station.
inline bool doorShut(int zone, int k) {
    return w.car[k].state != (zone == OC_WALK_IN_HUB ? OC_LIFT_AT_HUB : OC_LIFT_AT_FLOOR);
}

// Push a body out of the solid things of a place: th and c where its middle is, h its foot above the
// floor now and hWas a step ago, rad and tall its size; us and uc, its speed along the floor, lose what
// drove it in. A thing whose top the foot was above is not a wall but a floor: the highest such top
// under the body's middle is returned, 0 for the place's own floor.
double solids(int zone, double& th, double& c, double h, double hWas, double rad, double tall, double& us, double& uc) {
    const double R = floorOf(zone);
    const double lo = zone == OC_WALK_IN_HUB ? OC_WALK_LOBBY_C0_M : -OC_RING_WIDTH_M / 2;
    const double hi = zone == OC_WALK_IN_HUB ? OC_WALK_LOBBY_C1_M : OC_RING_WIDTH_M / 2;
    if (c < lo + rad) { c = lo + rad; if (uc < 0) uc = 0; }
    if (c > hi - rad) { c = hi - rad; if (uc > 0) uc = 0; }
    double top = 0;
    auto meet = [&](double s, double half, double c0, double c1, double h0, double h1) {
        const double ds = R * wrapPi(th - s / R);
        if (hWas >= h1 - 1e-9) {   // it was above this: a floor, if under the body's middle
            if (std::fabs(ds) <= half && c >= c0 && c <= c1 && h1 > top) top = h1;
            return;
        }
        if (h + tall <= h0) return;   // it passes beneath
        if (std::fabs(ds) >= half + rad || c <= c0 - rad || c >= c1 + rad) return;
        const double ps = half + rad - std::fabs(ds), pLow = c - (c0 - rad), pHigh = (c1 + rad) - c;
        if (ps < pLow && ps < pHigh) {   // out by the shortest way
            const double way = ds < 0 ? -1.0 : 1.0;
            th += way * ps / R;
            if (us * way < 0) us = 0;
        } else if (pLow < pHigh) {
            c -= pLow;
            if (uc > 0) uc = 0;
        } else {
            c += pHigh;
            if (uc < 0) uc = 0;
        }
    };
    for (int i = 0; i < nBoxes; ++i) {
        const Box& b = boxes[i];
        if ((int)b.zone == zone) meet(b.s, b.half, b.c0, b.c1, b.h0, b.h1);
    }
    const int k = nearestSpoke(th);
    if (doorShut(zone, k)) meet(spokeAngle(k) * R, DOOR, CC + CAR, CC + CAR + WALL, 0, OC_WALK_DOOR_TALL_M);
    return top;
}

// Whether a cross street or a plaza decks the canal at s.
bool decked(double s) {
    const double j = std::floor(s / STREET + 0.5);
    int street = (int)j % OC_WALK_STREETS;
    if (street < 0) street += OC_WALK_STREETS;
    return std::fabs(s - j * STREET) < (isPlaza(street) ? OC_WALK_PLAZA_DECK_M : OC_WALK_STREET_M);
}

// ---- the lifts ----------------------------------------------------------------------------------
// A car's ride, chosen for what its riders feel. Its speed's Coriolis push, 2 W v, is sideways and has
// nothing to do with where the car is, so the cruise is the speed whose push is OC_WALK_LIFT_PUSH. At the
// hub the riders weigh next to nothing, and a car that left faster than they fall would leave them on its
// ceiling: it leaves, and arrives, at OC_WALK_LIFT_EASE of the weight they have where it is, which is
// r'' = ease W^2 r, a hyperbolic cosine in time. At the rim it starts and stops at OC_WALK_LIFT_BRAKE.

void moveCar(Car& c) {
    const double dt = OC_DT, r0 = c.r, v0 = c.v, k = easing();
    double r1 = r0, v1 = 0;
    if (c.state == OC_LIFT_DOWN) {
        if (c.phase == 0) {          // easing away from the hub
            c.t += dt;
            r1 = RL * std::cosh(k * c.t);
            v1 = RL * k * std::sinh(k * c.t);
            if (v1 >= V_LIFT) { v1 = V_LIFT; r1 = r0 + (v0 + v1) / 2 * dt; c.phase = 1; }
        } else if (c.phase == 1) {   // the cruise
            v1 = V_LIFT;
            r1 = r0 + V_LIFT * dt;
            if (RF - r1 <= V_LIFT * V_LIFT / (2 * OC_WALK_LIFT_BRAKE)) {
                c.phase = 2;
                c.brake = V_LIFT * V_LIFT / (2 * (RF - r1));
                c.t = V_LIFT / c.brake;
            }
        } else {                     // stopping at the rim
            c.t -= dt;
            if (c.t <= 0) { r1 = RF; v1 = 0; c.state = OC_LIFT_AT_FLOOR; }
            else { v1 = c.brake * c.t; r1 = RF - c.brake * c.t * c.t / 2; }
        }
    } else if (c.state == OC_LIFT_UP) {
        if (c.phase == 0) {          // starting from the rim
            v1 = v0 - OC_WALK_LIFT_BRAKE * dt;
            if (v1 <= -V_LIFT) { v1 = -V_LIFT; c.phase = 1; }
            r1 = r0 + (v0 + v1) / 2 * dt;
        } else if (c.phase == 1) {   // the cruise, until the easing's speed at this height is the cruise's
            const double rs = std::sqrt(sq(RL) + sq(V_LIFT / k));   // there: the easing's hyperbola meets the cruise
            if (r0 - V_LIFT * dt > rs) {
                v1 = -V_LIFT;
                r1 = r0 - V_LIFT * dt;
            } else {   // the cruise reaches it within this step, and the easing takes the rest of the step
                c.phase = 2;
                c.t = std::acosh(rs / RL) / k - (dt - (r0 - rs) / V_LIFT);
                r1 = RL * std::cosh(k * c.t);
                v1 = -RL * k * std::sinh(k * c.t);
            }
        } else {                     // easing in to the hub
            c.t -= dt;
            if (c.t <= 0) { r1 = RL; v1 = 0; c.state = OC_LIFT_AT_HUB; }
            else { r1 = RL * std::cosh(k * c.t); v1 = -RL * k * std::sinh(k * c.t); }
        }
    }
    c.r0 = r0;
    c.v0 = v0;
    c.r = r1;
    c.v = v1;
    c.a = (v1 - v0) / dt;
    c.bend = 2 * (r1 - r0 - v0 * dt) / (dt * dt);
}

inline double carFloor(const Car& c, double tau) { return c.r0 + c.v0 * tau + c.bend * tau * tau / 2; }
inline double carSpeed(const Car& c, double tau) { return c.v0 + c.a * tau; }
inline bool waiting(const Car& c) { return c.state == OC_LIFT_AT_HUB || c.state == OC_LIFT_AT_FLOOR; }

void park(Car& c, int state) {
    c = Car{};
    c.state = state;
    c.r = c.r0 = state == OC_LIFT_AT_HUB ? RL : RF;
}

void send(Car& c, int state) {
    c.state = state;
    c.phase = 0;
    c.t = 0;
}

// ---- the walker ---------------------------------------------------------------------------------

inline void feel(double s, double c, double h) { w.pushS = s; w.pushC = c; w.pushH = h; }

// The pace the walker means to keep over the floor: spinward and along the axis.
void wanted(double* ts, double* tc) {
    double f = clampd(w.fwd, -1, 1), r = clampd(w.right, -1, 1);
    const double m = std::hypot(f, r);
    if (m > 1) { f /= m; r /= m; }
    const double pace = w.run ? OC_WALK_RUN : OC_WALK_PACE, ch = std::cos(w.heading), sh = std::sin(w.heading);
    *ts = pace * (f * ch - r * sh);
    *tc = pace * (f * sh + r * ch);
}

void inAir(double tau0, int depth);

// On the lobby's floor or the rim's, for dt: held to a circle about the axis.
void onFloor(double dt) {
    const double R = floorOf(w.zone), r = R - w.groundH - CM;
    double th = angleOf(w.p), c = w.p.y;
    double us = dot(w.v, spinward(th)), uc = w.v.y;
    // The floor's push is what keeps the walker on the circle: the frame's pull outward, Coriolis's for
    // the walker's own speed round the ring, and the turn of the path itself. Together r (W + us/r)^2:
    // the walker's whole turning about the axis, seen from outside.
    const double weight = r * sq(W + us / r);
    double ts, tc;
    wanted(&ts, &tc);
    double fs = (ts - us) / TAU, fc = (tc - uc) / TAU;
    limit(&fs, &fc, OC_WALK_PUSH);
    limit(&fs, &fc, OC_WALK_MU * (weight + (w.zone == OC_WALK_IN_HUB ? OC_WALK_GRIP : 0)));
    us += fs * dt;
    uc += fc * dt;
    if (ts == 0 && tc == 0 && us * us + uc * uc < 1e-12) us = uc = 0;   // standing: the soles hold
    double pushS = fs, pushC = fc;
    if (us != 0 || uc != 0) {   // at rest nothing is rewritten, so nothing creeps
        const double us0 = us, uc0 = uc;
        th += us / r * dt;
        c += uc * dt;
        const double top = solids(w.zone, th, c, w.groundH, w.groundH, RAD, TALL, us, uc);
        pushS += (us - us0) / dt;
        pushC += (uc - uc0) / dt;
        w.p = outward(th) * r + along(c);
        w.v = spinward(th) * us + along(uc);
        if (top < w.groundH) w.ground = 0;   // off an edge
    }
    feel(pushS, pushC, weight);
}

// A car's walls about a body in it: x across the car, c along the axis, h the body's foot above the
// car's floor; cWas where it was. The door, in the +axis wall, is open while the car waits.
void carWalls(const Car& car, double& x, double& c, double cWas, double h, double rad, double tall, double& ux, double& uc) {
    const double lim = CAR - rad;
    if (x > lim) { x = lim; if (ux > 0) ux = 0; }
    if (x < -lim) { x = -lim; if (ux < 0) ux = 0; }
    if (c < CC - lim) { c = CC - lim; if (uc < 0) uc = 0; }
    if (c > CC + lim) {
        const bool fits = waiting(car) && h + tall <= OC_WALK_DOOR_TALL_M;
        if (fits && (cWas > CC + lim || std::fabs(x) <= DOOR - rad)) {   // in the doorway: between its jambs
            if (x > DOOR - rad) { x = DOOR - rad; if (ux > 0) ux = 0; }
            if (x < -(DOOR - rad)) { x = -(DOOR - rad); if (ux < 0) ux = 0; }
        } else {
            c = CC + lim;
            if (uc > 0) uc = 0;
        }
    }
}

// On a car's floor, from tau0 into the step to its end: held to a flat floor that moves along its spoke.
// While the car moves the rider holds its rail: near the hub the soles hold a tenth of a metre per second
// squared and the ride pushes sideways at OC_WALK_LIFT_PUSH, so a rider left free would slide into a wall.
// The car carries them where they stand, and what holds them is the floor's push and the rail's. At a
// station the car waits and they walk.
void inCar(double tau0, int depth) {
    const Car& car = w.car[w.spoke];
    const double dt = OC_DT - tau0, thk = spokeAngle(w.spoke);
    const V3 down = outward(thk), sp = spinward(thk);
    double x = dot(w.p, sp), c = w.p.y;
    double ux = dot(w.v, sp), uc = w.v.y;   // over the car's floor: the car moves only along its spoke
    // Along the floor the frame pushes too: Coriolis's for the car's speed, sideways, and the small
    // spread of the outward pull across a flat floor.
    const double fall = (carSpeed(car, tau0) + carSpeed(car, OC_DT)) / 2;
    const double frame = W * W * x - 2 * W * fall;
    if (!waiting(car)) {   // holding the rail: at rest in the car, where the step ends
        const double z1 = carFloor(car, OC_DT) - CM;
        w.p = down * z1 + sp * x + along(c);
        w.v = down * carSpeed(car, OC_DT);
        feel(-frame, 0, W * W * z1 - car.a);
        return;
    }
    const double z = carFloor(car, OC_DT) - CM;   // where the step ends, as the readouts are
    // The floor's push: the frame's pull along the spoke, Coriolis's for the walker's speed across the
    // car, less what the car's own acceleration takes away.
    const double weight = W * W * z + 2 * W * ux - car.a;
    if (weight <= 0 && depth < 2) {   // the floor fell away faster than the rider
        w.ground = 0;
        inAir(tau0, depth + 1);
        return;
    }
    // The soles hold against the frame's push along the floor if they can.
    double ts, tc;
    wanted(&ts, &tc);
    double ls = (ts - ux) / TAU, lc = (tc - uc) / TAU;
    limit(&ls, &lc, OC_WALK_PUSH);
    double fs = ls - frame, fc = lc;
    limit(&fs, &fc, OC_WALK_MU * (weight > 0 ? weight : 0));
    ux += (fs + frame) * dt;
    uc += fc * dt;
    if (ts == 0 && tc == 0 && ux * ux + uc * uc < 1e-12) ux = uc = 0;
    const double ux0 = ux, uc0 = uc, cWas = c;
    x += ux * dt;
    c += uc * dt;
    carWalls(car, x, c, cWas, 0, RAD, TALL, ux, uc);
    w.p = down * (carFloor(car, OC_DT) - CM) + sp * x + along(c);
    w.v = down * carSpeed(car, OC_DT) + sp * ux + along(uc);
    feel(fs + (ux - ux0) / dt, fc + (uc - uc0) / dt, weight);
}

// The feet come down on something: what was under them takes the fall.
void land(V3 p, V3 v, double top, double when) {
    w.ground = 1;
    w.groundH = top;
    double th, c = p.y, here;
    if (w.zone == OC_WALK_IN_LIFT) {
        const Car& car = w.car[w.spoke];
        const double thk = spokeAngle(w.spoke), x = dot(p, spinward(thk));
        here = carFloor(car, when);
        w.p = outward(thk) * (here - CM) + spinward(thk) * x + along(c);
        w.v = outward(thk) * carSpeed(car, when) + spinward(thk) * dot(v, spinward(thk)) + along(v.y);
        th = thk + x / here;
    } else {
        th = angleOf(p);
        here = floorOf(w.zone);
        w.p = outward(th) * (here - top - CM) + along(c);
        w.v = spinward(th) * dot(v, spinward(th)) + along(v.y);
    }
    if (w.jumping) {
        w.jumping = 0;
        ++w.jumps;
        w.jumpDs = here * wrapPi(th - w.jumpTh);
        w.jumpDc = c - w.jumpC;
        w.jumpT = w.n * OC_DT + when - w.jumpAt;
        w.jumpRise = w.jumpTop - w.jumpH;
    }
}

// The moment within [0, dt] at which gap(t), below zero before and not after, crosses zero.
template <class Gap> double crossing(double dt, Gap gap) {
    if (gap(0.0) >= 0) return 0;
    double lo = 0, hi = dt;
    for (int i = 0; i < 48; ++i) {
        const double mid = (lo + hi) / 2;
        if (gap(mid) < 0) lo = mid; else hi = mid;
    }
    return hi;
}

// In the air in a car, from tau0 into the step: free, inside a box that moves.
void airInCar(double tau0, int depth) {
    const Car& car = w.car[w.spoke];
    const double dt = OC_DT - tau0, thk = spokeAngle(w.spoke);
    const V3 down = outward(thk), sp = spinward(thk);
    const Fly a{w.p, w.v};
    Fly b = fly(a, dt);
    double x = dot(b.p, sp), c = b.p.y, z = dot(b.p, down);
    double ux = dot(b.v, sp), uc = b.v.y, uz = dot(b.v, down);
    const double f1 = carFloor(car, OC_DT), x0 = x, c0 = c, z0 = z;
    carWalls(car, x, c, a.p.y, f1 - (z + CM), RAD, TALL, ux, uc);
    const double ceiling = f1 - OC_WALK_CAR_TALL_M + TALL - CM;   // the centre of mass with the head on the ceiling
    if (z < ceiling) { z = ceiling; if (uz < carSpeed(car, OC_DT)) uz = carSpeed(car, OC_DT); }
    const bool touched = x != x0 || c != c0 || z != z0;
    if (touched) b = {down * z + sp * x + along(c), down * uz + sp * ux + along(uc)};
    const double h = f1 - (z + CM);
    if (h > w.jumpTop) w.jumpTop = h;
    if (h <= 0) {   // the feet have reached the floor
        double tau = dt;
        Fly at = b;
        if (!touched) {
            tau = crossing(dt, [&](double t) { return dot(fly(a, t).p, down) + CM - carFloor(car, tau0 + t); });
            at = fly(a, tau);
        }
        land(at.p, at.v, 0, tau0 + tau);
        if (tau0 + tau < OC_DT && depth < 2) inCar(tau0 + tau, depth + 1);
        else feel(0, 0, 0);
        return;
    }
    w.p = b.p;
    w.v = b.v;
    feel(0, 0, 0);
}

// In the air over the lobby's floor or the rim's, from tau0 into the step.
void inAir(double tau0, int depth) {
    if (w.zone == OC_WALK_IN_LIFT) { airInCar(tau0, depth); return; }
    const double dt = OC_DT - tau0, R = floorOf(w.zone);
    const Fly a{w.p, w.v};
    Fly b = fly(a, dt);
    const double hWas = R - (radiusOf(a.p) + CM), rb = radiusOf(b.p);
    double th = angleOf(b.p), c = b.p.y;
    double us = dot(b.v, spinward(th)), uc = b.v.y;
    const double fall = dot(b.v, outward(th)), th0 = th, c0 = c;
    const double top = solids(w.zone, th, c, R - (rb + CM), hWas, RAD, TALL, us, uc);
    const bool touched = th != th0 || c != c0;
    if (touched) b = {outward(th) * rb + along(c), spinward(th) * us + along(uc) + outward(th) * fall};
    const double h = R - (rb + CM);
    if (h > w.jumpTop) w.jumpTop = h;
    if (h <= top) {   // the feet have reached what is under them
        double tau = dt;
        Fly at = b;
        if (!touched) {
            tau = crossing(dt, [&](double t) { return radiusOf(fly(a, t).p) + CM - (R - top); });
            at = fly(a, tau);
        }
        land(at.p, at.v, top, tau0 + tau);
        if (tau0 + tau < OC_DT) onFloor(OC_DT - tau0 - tau);
        else feel(0, 0, 0);
        return;
    }
    w.p = b.p;
    w.v = b.v;
    feel(0, 0, 0);
}

// Where the walker's up is: their own radius, or in a car its spoke's.
inline double upAngle() { return w.zone == OC_WALK_IN_LIFT ? spokeAngle(w.spoke) : angleOf(w.p); }

// The feet above the floor of the place.
double feetAbove() {
    if (w.zone == OC_WALK_IN_LIFT) return w.car[w.spoke].r - (dot(w.p, outward(spokeAngle(w.spoke))) + CM);
    return floorOf(w.zone) - (radiusOf(w.p) + CM);
}

void jumpOff() {
    const double th = upAngle();
    w.v = w.v - outward(th) * OC_WALK_JUMP;
    w.ground = 0;
    w.jumping = 1;
    w.jumpTh = angleOf(w.p);
    w.jumpC = w.p.y;
    w.jumpAt = w.n * OC_DT;
    w.jumpH = w.jumpTop = w.groundH;
}

// A car's doorway is where one place meets another: through it the walker is in the car, or out.
void rezone() {
    const double th = angleOf(w.p), c = w.p.y;
    if (w.zone == OC_WALK_IN_LIFT) {
        const Car& car = w.car[w.spoke];
        if (waiting(car) && c > CC + CAR + 0.01) {
            w.zone = car.state == OC_LIFT_AT_HUB ? OC_WALK_IN_HUB : OC_WALK_ON_FLOOR;
            w.groundH = 0;
        }
        return;
    }
    const int k = nearestSpoke(th);
    const double x = floorOf(w.zone) * wrapPi(th - spokeAngle(k));
    if (!doorShut(w.zone, k) && std::fabs(x) < CAR && c > CC - CAR && c < CC + CAR - 0.01 && feetAbove() + TALL <= OC_WALK_DOOR_TALL_M) {
        w.zone = OC_WALK_IN_LIFT;
        w.spoke = k;
        w.groundH = 0;
    }
}

// What use would do where the walker stands.
int useWould() {
    if (w.aboard) return OC_USE_NOTHING;
    if (w.zone == OC_WALK_IN_LIFT) return waiting(w.car[w.spoke]) ? OC_USE_RIDE : OC_USE_NOTHING;
    const double th = angleOf(w.p), c = w.p.y, R = floorOf(w.zone);
    if (w.zone == OC_WALK_IN_HUB && std::fabs(R * wrapPi(th)) < 2.5 && c < OC_WALK_LOBBY_C0_M + 3.0) return OC_USE_HATCH;
    const int k = nearestSpoke(th);
    const bool atDoor = std::fabs(R * wrapPi(th - spokeAngle(k))) < 4 && c > CC + CAR && c < CC + CAR + 6;
    const int farEnd = w.zone == OC_WALK_IN_HUB ? OC_LIFT_AT_FLOOR : OC_LIFT_AT_HUB;
    return atDoor && w.car[k].state == farEnd ? OC_USE_CALL : OC_USE_NOTHING;
}

void doUse() {
    const int what = useWould();
    if (what == OC_USE_HATCH) w.aboard = 1;
    if (what == OC_USE_RIDE) {
        Car& car = w.car[w.spoke];
        send(car, car.state == OC_LIFT_AT_HUB ? OC_LIFT_DOWN : OC_LIFT_UP);
    }
    if (what == OC_USE_CALL) send(w.car[nearestSpoke(angleOf(w.p))], w.zone == OC_WALK_IN_HUB ? OC_LIFT_UP : OC_LIFT_DOWN);
}

// ---- the ball -----------------------------------------------------------------------------------
// It flies as the walker does, under the frame's two forces. Off a floor it comes back at half its speed
// and keeps four fifths of its slide; slow enough, it stays where it is.

void ballStep() {
    Ball& b = w.ball;
    if (b.state == OC_BALL_NONE) return;
    const bool car = b.zone == OC_WALK_IN_LIFT;
    const double thk = spokeAngle(b.spoke);
    if (b.state == OC_BALL_RESTING) {
        if (car) {   // it rides the car
            const V3 down = outward(thk), sp = spinward(thk);
            b.p = down * (w.car[b.spoke].r - RB) + sp * dot(b.p, sp) + along(b.p.y);
            b.v = down * w.car[b.spoke].v;
        }
        return;
    }
    const Fly a{b.p, b.v};
    Fly e = fly(a, OC_DT);
    if (car) {
        const Car& lift = w.car[b.spoke];
        const V3 down = outward(thk), sp = spinward(thk);
        double x = dot(e.p, sp), c = e.p.y, z = dot(e.p, down);
        double ux = dot(e.v, sp), uc = e.v.y, uz = dot(e.v, down);
        const double f1 = lift.r, lim = CAR - RB;
        if (std::fabs(x) > lim) { x = x > 0 ? lim : -lim; ux = -0.5 * ux; }
        if (std::fabs(c - CC) > lim) { c = CC + (c > CC ? lim : -lim); uc = -0.5 * uc; }
        if (z - RB < f1 - OC_WALK_CAR_TALL_M) { z = f1 - OC_WALK_CAR_TALL_M + RB; if (uz < lift.v) uz = lift.v + 0.5 * (lift.v - uz); }
        if (z + RB >= f1) {
            if (!b.fell) {
                const double tau = crossing(OC_DT, [&](double t) { return dot(fly(a, t).p, down) + RB - carFloor(lift, t); });
                const Fly at = fly(a, tau);
                b.fell = 1;
                ++b.falls;
                b.ds = dot(at.p, sp) - b.th0;
                b.dc = at.p.y - b.c0;
                b.tFall = w.n * OC_DT + tau - b.t0;
            }
            z = f1 - RB;
            const double into = uz - lift.v;
            if (into < 0.4) { b.state = OC_BALL_RESTING; ux = uc = 0; uz = lift.v; }
            else { uz = lift.v - 0.5 * into; ux *= 0.8; uc *= 0.8; }
        }
        b.p = down * z + sp * x + along(c);
        b.v = down * uz + sp * ux + along(uc);
        return;
    }
    const double R = floorOf(b.zone), hWas = R - (radiusOf(a.p) + RB), re = radiusOf(e.p);
    double th = angleOf(e.p), c = e.p.y;
    double us = dot(e.v, spinward(th)), uc = e.v.y, fall = dot(e.v, outward(th));
    const double top = solids(b.zone, th, c, R - (re + RB), hWas, RB, 2 * RB, us, uc);
    double r = re;
    if (r + RB >= R - top) {
        if (!b.fell) {
            const double tau = crossing(OC_DT, [&](double t) { return radiusOf(fly(a, t).p) + RB - (R - top); });
            const Fly at = fly(a, tau);
            b.fell = 1;
            ++b.falls;
            b.ds = R * wrapPi(angleOf(at.p) - b.th0);
            b.dc = at.p.y - b.c0;
            b.tFall = w.n * OC_DT + tau - b.t0;
        }
        r = R - top - RB;
        if (fall < 0.4) { b.state = OC_BALL_RESTING; us = uc = fall = 0; }
        else { fall = -0.5 * fall; us *= 0.8; uc *= 0.8; }
    }
    b.p = outward(th) * r + along(c);
    b.v = spinward(th) * us + along(uc) + outward(th) * fall;
}

// ---- the step, the readouts ---------------------------------------------------------------------

void stepOnce() {
    const bool jump = w.jumpNow != 0, use = w.useNow != 0;
    w.jumpNow = w.useNow = 0;
    if (!w.aboard && use) doUse();
    if (w.aboard) { ++w.n; return; }   // the walk is over: only its clock runs
    for (int k = 0; k < SPOKES; ++k) moveCar(w.car[k]);
    const bool holding = w.zone == OC_WALK_IN_LIFT && !waiting(w.car[w.spoke]);   // the rail is in both hands
    if (jump && w.ground && !holding) jumpOff();
    if (!w.ground) inAir(0, 0);
    else if (w.zone == OC_WALK_IN_LIFT) inCar(0, 0);
    else onFloor(OC_DT);
    rezone();
    ballStep();
    ++w.n;
}

void walkWriteOut() {
    std::memset(out, 0, sizeof out);
    if (!w.started) return;
    const double th = angleOf(w.p), up = upAngle();
    const V3 down = outward(up), sp = spinward(up);
    const int k = w.zone == OC_WALK_IN_LIFT ? w.spoke : nearestSpoke(th);
    const Car& car = w.car[k];
    out[OC_WALK_T] = w.n * OC_DT;
    out[OC_WALK_WHERE] = w.zone;
    out[OC_WALK_SPOKE] = k;
    out[OC_WALK_THETA] = th < 0 ? th + 2 * PI : th;
    out[OC_WALK_S] = out[OC_WALK_THETA] * RF;
    out[OC_WALK_C] = w.p.y;
    out[OC_WALK_H] = feetAbove();
    out[OC_WALK_R] = radiusOf(w.p);
    out[OC_WALK_UP_THETA] = up < 0 ? up + 2 * PI : up;
    const V3 eye = w.p - down * (OC_WALK_EYE_M - CM);
    out[OC_WALK_EYE_X] = eye.x; out[OC_WALK_EYE_Y] = eye.y; out[OC_WALK_EYE_Z] = eye.z;
    out[OC_WALK_VS] = dot(w.v, sp); out[OC_WALK_VC] = w.v.y; out[OC_WALK_VH] = -dot(w.v, down);
    out[OC_WALK_SPEED] = std::hypot(out[OC_WALK_VS], out[OC_WALK_VC]);
    out[OC_WALK_HEADING] = w.heading;
    out[OC_WALK_PITCH] = w.pitch;
    out[OC_WALK_GROUND] = w.ground;
    out[OC_WALK_G] = std::sqrt(sq(w.pushS) + sq(w.pushC) + sq(w.pushH)) / G0;
    out[OC_WALK_FELT_S] = -w.pushS; out[OC_WALK_FELT_C] = -w.pushC; out[OC_WALK_FELT_H] = -w.pushH;
    out[OC_WALK_CENTRIFUGAL] = W * W * radiusOf(w.p);
    const V3 cor{-2 * W * w.v.z, 0, 2 * W * w.v.x};
    out[OC_WALK_COR_S] = dot(cor, sp); out[OC_WALK_COR_C] = cor.y; out[OC_WALK_COR_H] = -dot(cor, down);
    out[OC_WALK_LIFT] = car.state;
    out[OC_WALK_LIFT_R] = car.r;
    out[OC_WALK_LIFT_V] = car.v;
    out[OC_WALK_LIFT_A] = car.a;
    out[OC_WALK_USE] = useWould();
    out[OC_WALK_ABOARD] = w.aboard;
    out[OC_WALK_JUMPS] = (double)w.jumps;
    out[OC_WALK_JUMP_DS] = w.jumpDs; out[OC_WALK_JUMP_DC] = w.jumpDc;
    out[OC_WALK_JUMP_T] = w.jumpT; out[OC_WALK_JUMP_RISE] = w.jumpRise;
    out[OC_WALK_BALL] = w.ball.state;
    out[OC_WALK_BALL_X] = w.ball.p.x; out[OC_WALK_BALL_Y] = w.ball.p.y; out[OC_WALK_BALL_Z] = w.ball.p.z;
    out[OC_WALK_BALL_FALLS] = (double)w.ball.falls;
    out[OC_WALK_BALL_DS] = w.ball.ds; out[OC_WALK_BALL_DC] = w.ball.dc; out[OC_WALK_BALL_T] = w.ball.tFall;
    for (int i = 0; i < SPOKES; ++i) out[OC_WALK_CAR_R0 + i] = w.car[i].r;
}

// Stand the walker at rest on a floor: the push it feels there is its weight.
void stand(int zone, int spoke, double th, double c, double heading) {
    w.zone = zone;
    w.spoke = spoke;
    w.ground = 1;
    w.groundH = 0;
    w.heading = heading;
    w.pitch = 0;
    w.jumping = 0;
    w.v = {0, 0, 0};
    if (zone == OC_WALK_IN_LIFT) {
        const double thk = spokeAngle(spoke), z = w.car[spoke].r - CM;
        w.p = outward(thk) * z + along(c);
        feel(0, 0, W * W * z);
    } else {
        const double r = floorOf(zone) - CM;
        w.p = outward(th) * r + along(c);
        feel(0, 0, W * W * r);
    }
}

}   // namespace

extern "C" {

void oc_walk_reset(int place) {
    if (place != OC_WALK_AT_HATCH && place != OC_WALK_AT_LIFT && place != OC_WALK_AT_FLOOR) return;
    plan();
    w = Walker{};
    w.started = 1;
    for (int k = 0; k < SPOKES; ++k) park(w.car[k], OC_LIFT_AT_HUB);
    if (place == OC_WALK_AT_HATCH) stand(OC_WALK_IN_HUB, 0, 0, OC_WALK_LOBBY_C0_M + 1.2, PI / 2);
    if (place == OC_WALK_AT_LIFT) stand(OC_WALK_IN_LIFT, 0, 0, CC, PI / 2);
    if (place == OC_WALK_AT_FLOOR) {
        park(w.car[0], OC_LIFT_AT_FLOOR);
        stand(OC_WALK_ON_FLOOR, 0, 0, CC + CAR + WALL + 3, PI / 2);
    }
    walkWriteOut();
}

int oc_walk_put(double s_m, double c_m) {
    if (!w.started || w.aboard || !std::isfinite(s_m) || !std::isfinite(c_m)) return 0;
    double th = wrapPi(s_m / RF), c = c_m, us = 0, uc = 0;
    const double th0 = th;
    if (std::fabs(c) < OC_WALK_CANAL_M && !decked((th < 0 ? th + 2 * PI : th) * RF)) return 0;   // the canal's water
    const double top = solids(OC_WALK_ON_FLOOR, th, c, 0, 0, RAD, TALL, us, uc);
    if (th != th0 || c != c_m || top != 0) return 0;
    stand(OC_WALK_ON_FLOOR, nearestSpoke(th), th, c, w.heading);
    walkWriteOut();
    return 1;
}

void oc_walk_controls(double fwd, double right, double heading, double pitch, int run, int jump, int use) {
    if (!std::isfinite(fwd) || !std::isfinite(right) || !std::isfinite(heading) || !std::isfinite(pitch)) return;
    w.fwd = clampd(fwd, -1, 1);
    w.right = clampd(right, -1, 1);
    w.heading = wrapPi(heading);
    w.pitch = clampd(pitch, -PI / 2, PI / 2);
    w.run = run != 0;
    if (jump && !w.jumpIn) w.jumpNow = 1;
    if (use && !w.useIn) w.useNow = 1;
    w.jumpIn = jump != 0;
    w.useIn = use != 0;
}

void oc_walk_ball(double height_m, double speed) {
    if (!w.started || w.aboard || !std::isfinite(height_m) || !std::isfinite(speed)) return;
    if (height_m < 0 || height_m > 3 || speed < 0 || speed > 30) return;
    Ball& b = w.ball;
    const long long falls = b.falls;
    const double ds = b.ds, dc = b.dc, tFall = b.tFall;
    b = Ball{};
    b.falls = falls; b.ds = ds; b.dc = dc; b.tFall = tFall;
    b.state = OC_BALL_FLYING;
    b.zone = w.zone;
    b.spoke = w.spoke;
    b.t0 = w.n * OC_DT;
    const double ch = std::cos(w.heading), sh = std::sin(w.heading), cp = std::cos(w.pitch), sn = std::sin(w.pitch);
    const double ahead = 0.5, up = upAngle();
    V3 look;
    if (w.zone == OC_WALK_IN_LIFT) {
        const V3 down = outward(up), sp = spinward(up);
        const double x = dot(w.p, sp) + ahead * ch, c = w.p.y + ahead * sh;
        b.p = down * (w.car[w.spoke].r - height_m - RB) + sp * x + along(c);
        look = sp * (cp * ch) + along(cp * sh) - down * sn;
        b.th0 = x;
    } else {
        const double R = floorOf(w.zone), th = angleOf(w.p) + ahead * ch / R, c = w.p.y + ahead * sh;
        b.p = outward(th) * (R - w.groundH - height_m - RB) + along(c);
        look = spinward(th) * (cp * ch) + along(cp * sh) - outward(th) * sn;
        b.th0 = th;
    }
    b.c0 = b.p.y;
    // The hand's velocity. In a car, or in the air, the walker's own. Standing or walking on a floor about
    // the axis, the walker turns about the axis as the floor's circle does, so the hand, further in, goes
    // round at the same rate: slower than the middle by its radius over the middle's.
    V3 hand = w.v;
    if (w.zone != OC_WALK_IN_LIFT && w.ground) {
        const double r = radiusOf(w.p), us = dot(w.v, spinward(angleOf(w.p)));
        hand = spinward(angleOf(b.p)) * (us * radiusOf(b.p) / r) + along(w.v.y);
    }
    b.v = hand + look * speed;
    walkWriteOut();
}

void oc_walk_step(int n) {
    if (!w.started) return;
    for (int i = 0; i < n; ++i) stepOnce();
    walkWriteOut();
}

const double* oc_walk_out(void) { return out; }
int oc_walk_out_len(void) { return OC_WALK_COUNT; }

int oc_walk_box_count(void) { plan(); return nBoxes; }
const double* oc_walk_boxes(void) { plan(); return &boxes[0].zone; }

unsigned oc_walk_hash(void) {
    unsigned h = 2166136261u;
    const double a[] = {(double)w.n, w.p.x, w.p.y, w.p.z, w.v.x, w.v.y, w.v.z, w.heading, w.pitch, (double)w.zone, (double)w.spoke,
                        (double)w.ground, (double)w.aboard, w.groundH, w.pushS, w.pushC, w.pushH, (double)w.jumping, (double)w.jumps,
                        w.jumpDs, w.jumpDc, w.jumpT, w.jumpRise, (double)w.ball.state, w.ball.p.x, w.ball.p.y, w.ball.p.z,
                        w.ball.v.x, w.ball.v.y, w.ball.v.z, (double)w.ball.falls, w.ball.ds, w.ball.dc, w.ball.tFall};
    hashDoubles(h, a, sizeof a / sizeof a[0]);
    for (int k = 0; k < SPOKES; ++k) {
        const double c[] = {(double)w.car[k].state, (double)w.car[k].phase, w.car[k].r, w.car[k].v, w.car[k].t, w.car[k].brake};
        hashDoubles(h, c, sizeof c / sizeof c[0]);
    }
    return h;
}

}   // extern "C"
