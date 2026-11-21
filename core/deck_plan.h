// deck_plan.h — a landing on the Ring's deck, or a climb out from it, as a convex problem (deck_plan.cpp): what the
// crew's plans are (deck.cpp) and what the tests' oracle solves. GPLv3.
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
// the thrust's bounds rho1 <= |T| <= rho2 become rho1 e^-z <= sigma <= rho2 e^-z, the upper one taken by its tangent
// about a reference z0(t), which lies below e^-z and so is safe, and the lower one by its second-order expansion,
// rho1 e^-z0 (1 - d + d^2 / 2) <= sigma with d = z - z0, which lies below e^-z and is a rotated second-order cone;
// at the optimum |u| = sigma, and the slack costs nothing. The lower bound is the convexification's point: a drive
// that, once lit, cannot be throttled below rho1 is a non-convex set of thrusts made convex by sigma, and the
// relaxation is exact. Minimizing the sum of sigma dt is minimizing the delta-v, which is maximizing the mass at the
// end.
// The controls are held over each of n intervals of the plan's length (zero-order hold), and the dynamics over each
// are its exact transition, the tide taken at the interval's middle; the problem is a second-order cone program,
// which socp.h solves. The intervals are even, or (grid a > 0) closer at the plan's ends, where its burns are, and
// wider in the coast between: node k at tf (x - a sin(2 pi x) / (2 pi)), x = k / n, so that the first and last are
// 1 - a times the mean and the middle ones 1 + a. Beside the dynamics and the drive, a plan keeps:
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
//   the thrust's rate: from one interval to the next the force per kilogram changes by at most jerk times the
//     interval, in size or in way, which the drive's swivel and throttle and the craft's turning can follow; and
//     the same from the force the craft has at the start (uStart), and to the force that keeps it as it is at the
//     end (uEnd), each when it is set; and smooth seconds' worth of each change added to the cost, which picks, of
//     plans that cost the same, the one whose thrust does not chatter between intervals on the arcs where the cone
//     holds the craft;
//   elastic: the cone may be left, and the side's line crossed, at a cost of 100 m/s for each metre, so that a plan
//     made again from a craft a little outside the cone after its tracking's error, or from one over the deck, far
//     below the spokes, but on the plane, is still a plan; the cone's own 40 m clear of the structure, and the
//     spokes' 25 m clear of the side's line, are the room for that.
// A landing keeps to its side until near the end and points up near the end; a climb out, the other way round.
// The oracle (the tests') poses the same with none of the plans' own additions: no smoothing, no elastic cone.
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
