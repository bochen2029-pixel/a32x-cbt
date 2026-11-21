// deck_plan.h — a landing on the Ring's deck, or a climb out from it, as a convex problem (deck_plan.cpp): what the
// crew's plans are (deck.cpp) and what the tests' oracle solves. MIT.
//
// In the Ring's own frame, which turns at w about its axis and whose centre falls freely, the craft's motion is
//
//     r'' = u + w^2 (x, 0, z) - 2 W x r' + T(t) r          (W = w y; x the Ring's ref, y its axis, z = x cross y)
//
// u the specific force of the drive (and the small thrusters), the centrifugal and Coriolis pulls exact, and T the
// Earth's tidal tensor at the Ring's centre, mu / |c|^3 (3 c c' - I), turned into the frame: the craft and the
// Ring's centre fall a little differently, and to first order in r that difference is linear. So the motion is
// linear in (r, r', u), and a minimum-propellant landing is the lossless convexification of Acikmese and Ploen
// (2007): with sigma >= |u| a slack on the thrust per kilogram and z = ln m, the mass falls as z' = -sigma / (Isp g0),
// and the thrust's bounds rho1 <= |T| <= rho2 become rho1 e^-z <= sigma <= rho2 e^-z, each taken about a reference
// z0(t) for ln m, with d = z - z0. The upper one by its tangent, sigma <= rho2 e^-z0 (1 - d), which lies below e^-z
// for every d: the plan never asks for more than the drive has. The lower one by its second-order expansion,
// rho1 e^-z0 (1 - d + d^2 / 2) <= sigma, a rotated second-order cone, which lies above e^-z only where the craft is
// at least as heavy as the reference (d >= 0: the remainder, -d^3 e^-xi / 6, is negative); there the plan's thrust is
// at least rho1, as it must be. Where the craft is lighter (d < 0) the expansion lies below e^-z by about |d|^3 / 6 of
// itself, and the plan may ask for that much less than rho1. The reference is not a lower bound on the mass: without
// one given it is the mass at a steady 250 m/s over the plan, and a plan has spent more than that by the seconds its
// drive is held lit in (a landing's last 20 s, a climb out's first): there d is down to -0.012 and the shortfall at
// most 3e-7 of rho1, a twentieth of a newton of the crew's 177 kN (test_deck's least_thrust_expansion and
// oracle_converges_and_is_lossless measure it). A plan made again takes its reference from the plan before it, moved
// to the craft's mass.
// At the optimum |u| = sigma, and the slack costs nothing. The lower bound is the convexification's point: a drive
// that, once lit, cannot be throttled below rho1 is a non-convex set of thrusts made convex by sigma, and the
// relaxation is exact. Minimizing the sum of sigma dt is minimizing the delta-v, which is maximizing the mass at the
// end.
// The controls are held over each of n intervals of the plan's length (zero-order hold), and the dynamics over each
// are its exact transition, the tide taken at the interval's middle; the problem is a second-order cone program,
// which socp.h solves. The crew's intervals are even, or (grid a > 0) closer at the plan's ends, where its burns are,
// and wider in the coast between: node k at tf (x - a sin(2 pi x) / (2 pi)), x = k / n, so that the first and last
// are 1 - a times the mean and the middle ones 1 + a. On that grid a window below holds on whole intervals, those that
// start in it (or, for the turn, the level ends and the gentle stop, that reach into it), so that as a plan's length
// changes an interval leaves or joins a window, and the plan's cost steps with the length: by 4 to 7 m/s for the
// oracle at 80 intervals, and by 8.7 and 9.5 m/s at 101 and 145 s for the crew's plan from the hold point (the audit
// of 60e2582). The tests' oracle sets exact instead (planTimes): every window's edge inside the plan is a node, so
// that each interval lies wholly inside a window or wholly outside it. The edges cut the plan into pieces. A piece
// between two edges measured from the same end of the plan is as long whatever the plan's length, and gets as many
// intervals as a grid near the plan's ends, where its burns are, would give it: intervals 0.8 s long at the end and a
// tenth of a second longer for each second from it (at 40 intervals; n / 40 times as many at n), even within the
// piece. The piece between the last edge measured from the start and the first measured from the end, the coast,
// takes the rest, closer at its ends (grid a): its node j of m at a + L (x - a sin(2 pi x) / (2 pi)), x = j / m. So,
// as the plan's length changes, the nodes move with it continuously, no window gains or loses an interval, and the
// plan's cost is continuous in its length. A plan whose coast would have intervals under half a second each (at 40),
// or whose edges from the start and from the end interleave, is crowded at its ends as a whole instead, each edge
// moved onto the node nearest it; there the cost is not continuous. The crew keeps its own grid: flown on the exact
// one, its landings were no surer on fresh draws and dearer in their tails (README.md; INVARIANTS.md G15).
// Beside the dynamics and the drive, a plan keeps:
//
//   the approach's cone at a pad: up >= |(tanS along, tanC across)| from the pad, and up >= -tanA along behind it,
//     so that the craft comes down through the roof's gap clear of the bulkheads and the rim walls (Blackmore,
//     Acikmese and Scharf's glide-slope cone, after their 2010 paper, made elliptic for the sector's shape);
//   the spokes: from sideFrom to sideTo seconds into the plan the craft keeps to its side of the Ring's plane,
//     |y| >= ySide, which the spokes, 70 m square in that plane, cannot reach;
//   pointing: from pointFrom to pointTo seconds the thrust is no further than acos(cosPoint) from the pad's up, and
//     in the first tFirst and the last tLast seconds (at least an interval each) no further than acos(cosFirst) and
//     acos(cosLast), so that the craft is level, and its thrust nearly straight up, where it leaves or meets the deck;
//   no thrust in the first tOrient seconds, while the craft turns for its first burn; the drive lit, at least
//     thrustMin, from minFrom to minTo seconds;
//   the thrust's rate: from one interval to the next the force per kilogram changes by at most jerk times the time
//     between their middles, in size or in way, which the drive's swivel and throttle and the craft's turning can
//     follow; from the force the craft has at the start (uStart) to the first interval's, and from the last
//     interval's to the force that keeps it as it is at the end (uEnd), by jerk times the whole first and last
//     interval, each when it is set; and smooth seconds' worth of each change added to the cost, which picks, of
//     plans that cost the same, the one whose thrust does not chatter between intervals on the arcs where the cone
//     holds the craft;
//   elastic: the cone may be left, and the side's line crossed, at a cost of 100 m/s for each metre, so that a plan
//     made again from a craft a little outside the cone after its tracking's error, or from one over the deck, far
//     below the spokes, but on the plane, is still a plan; the cone's own 40 m clear of the structure, and the
//     spokes' 25 m clear of the side's line, are the room for that. Nothing holds a plan to that room; and near the
//     pad there is none, since the cone's apex is on the deck and outside the cone there is under the deck: the
//     crew refuses a landing's plan made again that takes the craft under its gate's height before the gate
//     (deck.cpp, overTheGate).
// A landing keeps to its side until near the end and points up near the end; a climb out, the other way round.
// The oracle (the tests') poses the same on the exact grid, with none of the plans' own additions: no smoothing, no
// elastic cone.
#pragma once

#include "internal.h"

#include <vector>

namespace oc {

struct PlanSpec {
    double t0 = 0;                 // s: when the plan starts
    V3 r0{0, 0, 0}, v0{0, 0, 0};   // the start, in the Ring's frame from its centre, m and m/s
    double m0 = 0;                 // kg
    double tf = 0;                 // s: the plan's length
    int n = PLAN_MAX;              // intervals
    V3 rN{0, 0, 0}, vN{0, 0, 0};   // the end
    double thrustMax = 0;          // N: the drive's bound in the plan
    double thrustMin = 0, minFrom = 0, minTo = 0;   // N, and the seconds in which it holds; 0: none
    double thrustEnd = 0, tEnd = 0;   // N: the drive's bound in the plan's last tEnd seconds instead; 0: none
    double grid = 0;               // the intervals' crowding at the ends, 0 to under 1
    bool exact = false;            // the oracle's grid (the tests'), every window's edge a node; off, the crew's
    double tOrient = 0;            // s
    V3 padAt{0, 0, 0}, padUp{0, 0, 0}, padSpin{0, 0, 0};   // the cone's apex, its up and its spinward
    double tanS = 0, tanC = 0, tanA = 0;
    int side = 0;                  // -1, +1: the side of the Ring's plane kept; 0 none
    double ySide = 0, sideFrom = 0, sideTo = 0;
    double pointFrom = 0, pointTo = 0, cosPoint = -2, cosFirst = -2, cosLast = -2;   // -2: none
    double tFirst = 0, tLast = 0;  // s
    double jerk = 0;               // m/s3; 0: none
    V3 uStart{0, 0, 0}, uEnd{0, 0, 0};   // m/s2, the Ring's frame
    bool startSet = false, endSet = false;
    double smooth = 0;             // s
    bool elastic = false;
    const double* zRef = nullptr;  // n + 1 references for ln m, or none: the mass at a steady 250 m/s over the plan
};

struct PlanResult {
    int status = -1, iters = 0;    // socp's
    double cost = 0;               // m/s: the delta-v, the sum of sigma dt
    double pres = 0, dres = 0, gap = 0, relgap = 0;
    double lossless = 0;           // m/s2: the most sigma exceeds |u| by, over the intervals that burn
    double outside = 0;            // m: the furthest the plan goes past the elastic cone or side
    std::vector<double> t;         // n + 1 times
    std::vector<V3> r, v;          // n + 1 nodes
    std::vector<double> z;         // ln m at each node
    std::vector<V3> u;             // n intervals: the specific force, m/s2, in the Ring's frame
    std::vector<double> sigma;
    double mEnd() const { return z.empty() ? 0 : std::exp(z.back()); }
};

// The Ring's frame at time t, as ECI axes and its centre, and the tide's tensor in it, 1/s^2.
struct RingFrame { V3 c, vc, x, y, z; };
RingFrame ringFrameAt(double t);
void tideTensor(double t, double T[3][3]);

// The plan's nodes' times, s from its start, spec.n + 1 of them into t: the crew's grid, or with exact the oracle's
// (above), which planLanding poses the plan on. False if the spec has no plan (under two intervals, a length not over
// nothing, a crowding outside [0, 1), or more pieces than intervals).
bool planTimes(const PlanSpec& spec, double* t);

// The plan: true if solved (SOLVED, or INACCURATE within the solver's looser tolerance).
bool planLanding(const PlanSpec& spec, PlanResult& out);

// A plan of at most PLAN_MAX intervals as the crew keeps it in the state (deck_state.h); false if it has more.
bool storePlan(const PlanResult& from, Flown& to);

// The interval of a flown plan that time t is in (the first before its start, the last after its end); and where its
// craft is at t (t0 <= t <= t0 + tf), and the force it asks for then: the node before, carried forward under the
// interval's held force by the same exact motion.
int flownStep(const Flown& plan, double t);
void flownAt(const Flown& plan, double t, V3* r, V3* v, V3* u);

}   // namespace oc
