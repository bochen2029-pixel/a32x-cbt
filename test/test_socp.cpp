// The cone solver's tests (core/socp.h): each a problem whose answer is known without the solver, in closed
// form, by construction, or from the problem's own physics worked out another way, and each holding the solver's
// answer to it, its duality gap and its KKT residuals (socp::check, computed afresh from the problem) to stated
// tolerances. Run one by name or all; ctest runs each line below that reads "// TEST: <name>". GPLv3.
//
// TEST: lp_vertex
// TEST: projection_onto_a_plane
// TEST: infeasible_certified
// TEST: unbounded_certified
// TEST: far_from_the_origin
// TEST: minimum_energy_transfer
// TEST: bang_off_bang_transfer
// TEST: vertical_landing_min_max
// TEST: lossless_with_a_least_thrust
// TEST: constructed_optima
// TEST: banded_order_is_the_dense_answer

#include "../core/socp.h"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>

namespace {

using oc::socp::Problem;
using oc::socp::Result;
using oc::socp::Settings;

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

const double G = 9.80665;

// What a solve came to, and its residuals worked out afresh; the tolerances every solved problem is held to:
// the residuals and the gap a double reaches in an interior-point method (socp.h: 1e-8 relative).
bool solvedWell(const char* name, const Problem& P, const Result& R, double tolerance = 1e-7) {
    const oc::socp::Check c = oc::socp::check(P, R);
    std::printf("  %s: status %d in %d iterations; cost %.10g, dual %.10g; gap %.2e; residuals %.2e primal, %.2e dual; outside the cone %.1e, %.1e; band %d\n",
                name, R.status, R.iters, R.pcost, R.dcost, c.gap, c.primal, c.dual, c.coneS, c.coneZ, R.bandwidth);
    const bool ok = (R.status == oc::socp::SOLVED || R.status == oc::socp::INACCURATE) && c.primal < tolerance && c.dual < tolerance && c.coneS == 0 &&
                    c.coneZ == 0 && std::fabs(R.pcost - R.dcost) < tolerance * std::fmax(1.0, std::fabs(R.pcost));
    CHECK(ok, "%s not solved inside %.0e: status %d, residuals %.2e %.2e, gap %.2e", name, tolerance, R.status, c.primal, c.dual, R.pcost - R.dcost);
    return ok;
}

// ---- small problems with closed forms --------------------------------------------------------------------

// min x1 + x2 over x1 + 2 x2 >= 2, 3 x1 + x2 >= 3, x >= 0: the vertex where the two lines cross, (4/5, 3/5), 7/5.
void lpVertex() {
    Problem P;
    P.n = 2;
    P.c = {1, 1};
    P.A.cols = P.G.cols = 2;
    const double rows[4][3] = {{-1, -2, -2}, {-3, -1, -3}, {-1, 0, 0}, {0, -1, 0}};
    for (const auto& r : rows) { P.G.add(0, r[0]); P.G.add(1, r[1]); P.G.endRow(); P.h.push_back(r[2]); }
    P.l = 4;
    const Result R = oc::socp::solve(P);
    if (!solvedWell("the LP", P, R)) return;
    std::printf("  x = (%.10f, %.10f) against (0.8, 0.6)\n", R.x[0], R.x[1]);
    CHECK(std::fabs(R.x[0] - 0.8) < 1e-7 && std::fabs(R.x[1] - 0.6) < 1e-7 && std::fabs(R.pcost - 1.4) < 1e-7, "%.10f %.10f", R.x[0], R.x[1]);
}

// The nearest point of a plane a'x = b to x0, as min t over |x - x0| <= t: x0 - a (a'x0 - b) / |a|^2, at a distance
// |a'x0 - b| / |a|.
void projectionOntoAPlane() {
    const double x0[3] = {1, 2, 3}, a[3] = {1, -1, 2}, b = 7, ax0 = 1 - 2 + 6, aa = 6;
    Problem P;
    P.n = 4;
    P.c = {0, 0, 0, 1};
    P.A.cols = P.G.cols = 4;
    for (int i = 0; i < 3; ++i) P.A.add(i, a[i]);
    P.A.endRow();
    P.b.push_back(b);
    P.G.add(3, -1);
    P.G.endRow();
    P.h.push_back(0);
    for (int i = 0; i < 3; ++i) { P.G.add(i, -1); P.G.endRow(); P.h.push_back(-x0[i]); }
    P.q = {4};
    const Result R = oc::socp::solve(P);
    if (!solvedWell("the projection", P, R)) return;
    double err = 0;
    for (int i = 0; i < 3; ++i) err = std::fmax(err, std::fabs(R.x[i] - (x0[i] - a[i] * (ax0 - b) / aa)));
    const double d = std::fabs(ax0 - b) / std::sqrt(aa);
    std::printf("  the nearest point to %.1e, the distance %.12f against %.12f\n", err, R.x[3], d);
    CHECK(err < 1e-7 && std::fabs(R.x[3] - d) < 1e-7, "off by %.2e, %.2e", err, R.x[3] - d);
}

// x >= 1 and x <= 0 have nothing in common: the solver says so with a certificate, a dual ray (y, z) with
// A'y + G'z = 0, z in K, b'y + h'z < 0 (Farkas's lemma for cones), to its own stated tolerance (feastol).
void infeasibleCertified() {
    Problem P;
    P.n = 1;
    P.c = {1};
    P.A.cols = P.G.cols = 1;
    P.G.add(0, -1); P.G.endRow(); P.h.push_back(-1);
    P.G.add(0, 1); P.G.endRow(); P.h.push_back(0);
    P.l = 2;
    const Result R = oc::socp::solve(P);
    const double gz = -R.z[0] + R.z[1], hz = -R.z[0];
    std::printf("  status %d in %d iterations; the ray: G'z = %.2e, h'z = %.3g, z = (%.3g, %.3g)\n", R.status, R.iters, gz, hz, R.z[0], R.z[1]);
    CHECK(R.status == oc::socp::PRIMAL_INFEASIBLE, "status %d", R.status);
    CHECK(std::fabs(gz) <= oc::socp::Settings{}.feastol * std::fabs(hz) && hz < 0 && R.z[0] >= 0 && R.z[1] >= 0, "not a certificate");
}

// min x over x <= 1 has no bottom: a primal ray x with c'x < 0 and G x in -K.
void unboundedCertified() {
    Problem P;
    P.n = 1;
    P.c = {1};
    P.A.cols = P.G.cols = 1;
    P.G.add(0, 1); P.G.endRow(); P.h.push_back(1);
    P.l = 1;
    const Result R = oc::socp::solve(P);
    std::printf("  status %d in %d iterations; the ray x = %.3g\n", R.status, R.iters, R.x[0]);
    CHECK(R.status == oc::socp::DUAL_INFEASIBLE && R.x[0] < 0, "status %d", R.status);
}

// Far from the origin the certificates are not to be had for the asking (the audit of 60e2582): an iterate near an
// optimum at 1e8 has A'y + G'z about -c tau, small against b'y + h'z only because the cost is large, and the tests
// that a dual or primal iterate is a ray compared those two alone. Three feasible problems whose optima lie at 1e8
// to 7e9, each once certified impossible: min t over t >= |x|, x = 1e8 (PRIMAL_INFEASIBLE at the first iteration);
// the nearest point of a'x = 7e9 to (1, 2, 3) (the same); min -x1 over x1 <= x2, x2 = 1e8 (DUAL_INFEASIBLE at the
// first). An iterate now counts as a ray only when the residual is small against the ray itself, the operators'
// scale times its own size. None of them may come back with a certificate; the solver, unscaled, may well end
// NUMERICAL far from the origin, which says it failed rather than that there is nothing to find. And x = 1 with
// x = 2 is still certified infeasible.
void farFromTheOrigin() {
    using oc::socp::PRIMAL_INFEASIBLE;
    using oc::socp::DUAL_INFEASIBLE;
    const char* names[] = {"SOLVED", "PRIMAL_INFEASIBLE", "DUAL_INFEASIBLE", "MAX_ITER", "NUMERICAL", "INACCURATE"};
    auto name = [&](int st) { return st >= 0 && st <= 5 ? names[st] : "?"; };
    {   // min t over (t, x) in Q2, x = 1e8
        Problem P;
        P.n = 2; P.c = {1, 0}; P.A.cols = P.G.cols = 2;
        P.A.add(1, 1); P.A.endRow(); P.b.push_back(1e8);
        P.G.add(0, -1); P.G.endRow(); P.h.push_back(0);
        P.G.add(1, -1); P.G.endRow(); P.h.push_back(0);
        P.q = {2};
        const Result R = oc::socp::solve(P);
        std::printf("  min t, t >= |x|, x = 1e8: %s in %d iterations, cost %.10g\n", name(R.status), R.iters, R.pcost);
        CHECK(R.status != PRIMAL_INFEASIBLE && R.status != DUAL_INFEASIBLE, "certified %s", name(R.status));
    }
    {   // the nearest point of a'x = 7e9 to (1, 2, 3), a = (1, -1, 2)
        const double x0[3] = {1, 2, 3}, a[3] = {1, -1, 2};
        Problem P;
        P.n = 4; P.c = {0, 0, 0, 1}; P.A.cols = P.G.cols = 4;
        for (int i = 0; i < 3; ++i) P.A.add(i, a[i]);
        P.A.endRow(); P.b.push_back(7e9);
        P.G.add(3, -1); P.G.endRow(); P.h.push_back(0);
        for (int i = 0; i < 3; ++i) { P.G.add(i, -1); P.G.endRow(); P.h.push_back(-x0[i]); }
        P.q = {4};
        const Result R = oc::socp::solve(P);
        std::printf("  the nearest point of a'x = 7e9: %s in %d iterations, cost %.10g against %.10g\n", name(R.status), R.iters, R.pcost,
                    (7e9 - 5) / std::sqrt(6.0));
        CHECK(R.status != PRIMAL_INFEASIBLE && R.status != DUAL_INFEASIBLE, "certified %s", name(R.status));
    }
    {   // min -x1 over x1 <= x2, x2 = 1e8
        Problem P;
        P.n = 2; P.c = {-1, 0}; P.A.cols = P.G.cols = 2;
        P.A.add(1, 1); P.A.endRow(); P.b.push_back(1e8);
        P.G.add(0, 1); P.G.add(1, -1); P.G.endRow(); P.h.push_back(0);
        P.l = 1;
        const Result R = oc::socp::solve(P);
        std::printf("  min -x1, x1 <= x2 = 1e8: %s in %d iterations, cost %.10g\n", name(R.status), R.iters, R.pcost);
        CHECK(R.status != PRIMAL_INFEASIBLE && R.status != DUAL_INFEASIBLE, "certified %s", name(R.status));
    }
    {   // x = 1 and x = 2: no x at all
        Problem P;
        P.n = 1; P.c = {1}; P.A.cols = P.G.cols = 1;
        P.A.add(0, 1); P.A.endRow(); P.b.push_back(1);
        P.A.add(0, 1); P.A.endRow(); P.b.push_back(2);
        P.G.add(0, -1); P.G.endRow(); P.h.push_back(0);
        P.l = 1;
        const Result R = oc::socp::solve(P);
        std::printf("  x = 1 and x = 2: %s in %d iterations\n", name(R.status), R.iters);
        CHECK(R.status == PRIMAL_INFEASIBLE, "%s", name(R.status));
    }
}

// ---- trajectories ------------------------------------------------------------------------------------------

// A double integrator's stages for one axis: node k's (p, v) at 2k, interval k's control at 2 (N + 1) + k, the
// dynamics with the control held, each state beside the row that defines it in the order.
struct Line {
    int N;
    double dt;
    int pos(int k) const { return 2 * k; }
    int vel(int k) const { return 2 * k + 1; }
    int ctl(int k) const { return 2 * (N + 1) + k; }
};

// The least energy, the sum of u^2 dt, moving D at rest to rest in N held steps: a QP whose answer is the least-norm
// solution of the two end conditions, u = M'(M M')^-1 (D, 0), M's column k the step's effect (dt^2 (N - k - 1/2),
// dt). Posed as an SOCP, u_k^2 <= t_k as a rotated cone. The energy is held to the cost's tolerance; the pushes,
// the minimizer of a quadratic, are known to about the square root of it, and are held to 1e-4.
void minimumEnergyTransfer() {
    const int N = 30;
    const double T = 10, D = 16, dt = T / N;
    Line L{N, dt};
    Problem P;
    P.n = 2 * (N + 1) + 2 * N;   // the nodes, the controls, and a t_k for each
    auto tk = [&](int k) { return 2 * (N + 1) + N + k; };
    P.c.assign(P.n, 0);
    for (int k = 0; k < N; ++k) P.c[tk(k)] = dt;
    P.A.cols = P.G.cols = P.n;
    auto row = [&](std::initializer_list<std::pair<int, double>> e, double b) { for (auto& x : e) P.A.add(x.first, x.second); P.A.endRow(); P.b.push_back(b); };
    row({{L.pos(0), 1}}, 0);
    row({{L.vel(0), 1}}, 0);
    for (int k = 0; k < N; ++k) {
        row({{L.pos(k + 1), 1}, {L.pos(k), -1}, {L.vel(k), -dt}, {L.ctl(k), -dt * dt / 2}}, 0);
        row({{L.vel(k + 1), 1}, {L.vel(k), -1}, {L.ctl(k), -dt}}, 0);
    }
    row({{L.pos(N), 1}}, D);
    row({{L.vel(N), 1}}, 0);
    for (int k = 0; k < N; ++k) {   // (t + 1, 2u, t - 1) in Q3: u^2 <= t
        P.G.add(tk(k), -1); P.G.endRow(); P.h.push_back(1);
        P.G.add(L.ctl(k), -2); P.G.endRow(); P.h.push_back(0);
        P.G.add(tk(k), -1); P.G.endRow(); P.h.push_back(-1);
        P.q.push_back(3);
    }
    const int nb = P.n;
    P.order = {nb, L.pos(0), nb + 1, L.vel(0)};
    for (int k = 0; k < N; ++k) {
        P.order.push_back(L.ctl(k));
        P.order.push_back(tk(k));
        P.order.insert(P.order.end(), {nb + 2 + 2 * k, L.pos(k + 1), nb + 3 + 2 * k, L.vel(k + 1)});
    }
    P.order.insert(P.order.end(), {nb + 2 + 2 * N, nb + 3 + 2 * N});
    const Result R = oc::socp::solve(P);
    if (!solvedWell("the least-energy transfer", P, R)) return;
    // the closed form
    double a = 0, b = 0, c = 0;   // M M' = [a b; b c]
    for (int k = 0; k < N; ++k) {
        const double m0 = dt * dt * (N - k - 0.5), m1 = dt;
        a += m0 * m0; b += m0 * m1; c += m1 * m1;
    }
    const double det = a * c - b * b, l0 = c * D / det, l1 = -b * D / det;
    double err = 0, energy = 0;
    for (int k = 0; k < N; ++k) {
        const double u = dt * dt * (N - k - 0.5) * l0 + dt * l1;
        err = std::fmax(err, std::fabs(R.x[L.ctl(k)] - u));
        energy += u * u * dt;
    }
    std::printf("  the energy %.10f against the closed form's %.10f; each step's push within %.1e of it\n", R.pcost, energy, err);
    CHECK(std::fabs(R.pcost - energy) < 1e-7 * energy && err < 1e-4, "%.10f against %.10f, %.2e", R.pcost, energy, err);
}

// The least propellant moving D at rest to rest in T with the push at most a: full push for tb, a coast, full
// push back for tb, with D = a tb (T - tb), and 2 a tb of delta-v (bang, off, bang). With the switches on the
// steps' boundaries the held-step problem can fly exactly that, and no held-step flight can do better than the
// continuous optimum, so its optimum is 2 a tb exactly. In three dimensions, |u| as the cone's.
void bangOffBangTransfer() {
    for (int N : {20, 40, 80}) {
        const double T = 10, a = 1, tb = 2, D = a * tb * (T - tb), dt = T / N;
        auto R_ = [&](int k, int i) { return 10 * k + i; };
        auto V_ = [&](int k, int i) { return 10 * k + 3 + i; };
        auto U_ = [&](int k, int i) { return 10 * k + 6 + i; };
        auto S_ = [&](int k) { return 10 * k + 9; };
        Problem P;
        P.n = 10 * N + 6;
        P.c.assign(P.n, 0);
        for (int k = 0; k < N; ++k) P.c[S_(k)] = dt;
        P.A.cols = P.G.cols = P.n;
        for (int i = 0; i < 3; ++i) { P.A.add(R_(0, i), 1); P.A.endRow(); P.b.push_back(0); }
        for (int i = 0; i < 3; ++i) { P.A.add(V_(0, i), 1); P.A.endRow(); P.b.push_back(0); }
        for (int k = 0; k < N; ++k) {
            for (int i = 0; i < 3; ++i) {
                P.A.add(R_(k + 1, i), 1); P.A.add(R_(k, i), -1); P.A.add(V_(k, i), -dt); P.A.add(U_(k, i), -dt * dt / 2);
                P.A.endRow(); P.b.push_back(0);
            }
            for (int i = 0; i < 3; ++i) { P.A.add(V_(k + 1, i), 1); P.A.add(V_(k, i), -1); P.A.add(U_(k, i), -dt); P.A.endRow(); P.b.push_back(0); }
        }
        for (int i = 0; i < 3; ++i) { P.A.add(R_(N, i), 1); P.A.endRow(); P.b.push_back(i == 0 ? D : 0); }
        for (int i = 0; i < 3; ++i) { P.A.add(V_(N, i), 1); P.A.endRow(); P.b.push_back(0); }
        for (int k = 0; k < N; ++k) { P.G.add(S_(k), 1); P.G.endRow(); P.h.push_back(a); }
        P.l = N;
        for (int k = 0; k < N; ++k) {
            P.G.add(S_(k), -1); P.G.endRow(); P.h.push_back(0);
            for (int i = 0; i < 3; ++i) { P.G.add(U_(k, i), -1); P.G.endRow(); P.h.push_back(0); }
            P.q.push_back(4);
        }
        const int nb = P.n;
        for (int i = 0; i < 6; ++i) { P.order.push_back(nb + i); P.order.push_back(i < 3 ? R_(0, i) : V_(0, i - 3)); }
        for (int k = 0; k < N; ++k) {
            for (int i = 0; i < 3; ++i) P.order.push_back(U_(k, i));
            P.order.push_back(S_(k));
            for (int i = 0; i < 6; ++i) { P.order.push_back(nb + 6 + 6 * k + i); P.order.push_back(i < 3 ? R_(k + 1, i) : V_(k + 1, i - 3)); }
        }
        for (int i = 0; i < 6; ++i) P.order.push_back(nb + 6 + 6 * N + i);
        const auto t0 = std::chrono::steady_clock::now();
        const Result R = oc::socp::solve(P);
        const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
        char name[64];
        std::snprintf(name, sizeof name, "%d steps (%.1f ms)", N, ms);
        if (!solvedWell(name, P, R)) continue;
        int burns = 0;
        for (int k = 0; k < N; ++k) burns += R.x[S_(k)] > 0.5 * a;
        std::printf("    delta-v %.10f against 2 a tb = %.1f; %d steps at full push against %d\n", R.pcost, 2 * a * tb, burns, (int)std::lround(2 * tb / dt));
        CHECK(std::fabs(R.pcost - 2 * a * tb) < 1e-6 && burns == (int)std::lround(2 * tb / dt), "%.10f, %d steps", R.pcost, burns);
    }
}

// ---- landings with the mass: the lossless convexification --------------------------------------------------

// The thrust's bounds per kilogram, rho1 e^-z <= sigma <= rho2 e^-z, about a reference z0: the upper by its
// tangent, the lower by its second-order expansion (Acikmese and Ploen 2007). The lower as a rotated cone:
// (sigma/mu1 + d - 1/2, d, sigma/mu1 + d - 3/2) in Q3 with d = z - z0, which is sigma/mu1 >= 1 - d + d^2/2.
void thrustBounds(Problem& P, int sigma, int z, double z0, double rho1, double rho2, bool upper) {
    if (upper) {
        const double m2 = rho2 * std::exp(-z0);
        P.G.add(sigma, 1); P.G.add(z, m2); P.G.endRow(); P.h.push_back(m2 * (1 + z0));
        return;
    }
    const double m1 = rho1 * std::exp(-z0);
    P.G.add(sigma, -1 / m1); P.G.add(z, -1); P.G.endRow(); P.h.push_back(-z0 - 0.5);
    P.G.add(z, -1); P.G.endRow(); P.h.push_back(-z0);
    P.G.add(sigma, -1 / m1); P.G.add(z, -1); P.G.endRow(); P.h.push_back(-z0 - 1.5);
    P.q.push_back(3);
}

// A vertical landing from h0 falling at v0, gravity g, the drive between rho1 and rho2 (N) and pushing up only,
// its mass falling at T / ve. Its delta-v is v0 + g tf whatever the push does (the end at rest), so the least
// propellant is the soonest landing: the least push, then the most, switched where the second just stops the
// craft at the ground (Meditch's bang-bang). Worked out here by the rocket equation in closed form and two nested
// bisections. The cone program's free final time is found as the least tf the solver finds feasible, by bisection
// on its own verdicts (its delta-v grows with tf), and comes to the analytic one as the steps shrink, each halving
// more than halving the gap; the plan there is the least push, then the most. At that tf the feasible set closes
// to a point, where an interior-point method converges slowly: the plan is held to be feasible, not to the gap.
struct Vertical { double h0, v0, m0, ve, rho1, rho2; };

// the state after tau at thrust rho from (h, v, m), upward positive
void burn(const Vertical& V, double rho, double tau, double* h, double* v, double* m) {
    const double c = rho / (V.ve * *m), x = 1 - c * tau;
    const double integral = -((x) * (std::log(x) - 1) + 1) / c;   // the integral of ln(1 - c s) over [0, tau]
    *h += *v * tau - G * tau * tau / 2 - V.ve * integral;
    *v += -V.ve * std::log(x) - G * tau;
    *m -= rho * tau / V.ve;
}

void analyticMinMax(const Vertical& V, double* ts, double* tb, double* mEnd) {
    auto landing = [&](double s, double* b) {   // after s at rho1, the rho2 burn that stops it: its length, and the height left
        double h = V.h0, v = -V.v0, m = V.m0;
        burn(V, V.rho1, s, &h, &v, &m);
        double lo = 0, hi = 200;
        for (int i = 0; i < 200; ++i) {
            const double mid = (lo + hi) / 2;
            double hh = h, vv = v, mm = m;
            burn(V, V.rho2, mid, &hh, &vv, &mm);
            (vv < 0 ? lo : hi) = mid;
        }
        *b = (lo + hi) / 2;
        burn(V, V.rho2, *b, &h, &v, &m);
        return h;
    };
    double lo = 0, hi = 100, b = 0;
    for (int i = 0; i < 200; ++i) {
        const double mid = (lo + hi) / 2;
        (landing(mid, &b) > 0 ? lo : hi) = mid;
    }
    *ts = (lo + hi) / 2;
    landing(*ts, tb);
    double h = V.h0, v = -V.v0, m = V.m0;
    burn(V, V.rho1, *ts, &h, &v, &m);
    burn(V, V.rho2, *tb, &h, &v, &m);
    *mEnd = m;
}

// The vertical landing as a cone program over tf in n held steps: per node (h, v, z = ln m), per step sigma, which is
// the push per kilogram, up. z0, the reference: the mass at the least push, then the most, from the analytic answer.
Result verticalProgram(const Vertical& V, double tf, int n, const std::vector<double>& zRef, Problem* out = nullptr) {
    const double dt = tf / n;
    auto H = [](int k) { return 3 * k; };
    auto Vv = [](int k) { return 3 * k + 1; };
    auto Z = [](int k) { return 3 * k + 2; };
    auto S = [&](int k) { return 3 * (n + 1) + k; };
    Problem P;
    P.n = 3 * (n + 1) + n;
    P.c.assign(P.n, 0);
    for (int k = 0; k < n; ++k) P.c[S(k)] = dt;
    P.A.cols = P.G.cols = P.n;
    const double start[3] = {V.h0, -V.v0, std::log(V.m0)};
    for (int i = 0; i < 3; ++i) { P.A.add(3 * 0 + i, 1); P.A.endRow(); P.b.push_back(start[i]); }
    for (int k = 0; k < n; ++k) {
        P.A.add(H(k + 1), 1); P.A.add(H(k), -1); P.A.add(Vv(k), -dt); P.A.add(S(k), -dt * dt / 2); P.A.endRow(); P.b.push_back(-G * dt * dt / 2);
        P.A.add(Vv(k + 1), 1); P.A.add(Vv(k), -1); P.A.add(S(k), -dt); P.A.endRow(); P.b.push_back(-G * dt);
        P.A.add(Z(k + 1), 1); P.A.add(Z(k), -1); P.A.add(S(k), dt / V.ve); P.A.endRow(); P.b.push_back(0);
    }
    P.A.add(H(n), 1); P.A.endRow(); P.b.push_back(0);
    P.A.add(Vv(n), 1); P.A.endRow(); P.b.push_back(0);
    for (int k = 0; k < n; ++k) thrustBounds(P, S(k), Z(k), zRef[k], V.rho1, V.rho2, true);
    P.l = n;
    for (int k = 0; k < n; ++k) thrustBounds(P, S(k), Z(k), zRef[k], V.rho1, V.rho2, false);
    const int nb = P.n;
    for (int i = 0; i < 3; ++i) { P.order.push_back(nb + i); P.order.push_back(i); }
    for (int k = 0; k < n; ++k) {
        P.order.push_back(S(k));
        for (int i = 0; i < 3; ++i) { P.order.push_back(nb + 3 + 3 * k + i); P.order.push_back(3 * (k + 1) + i); }
    }
    P.order.push_back(nb + 3 + 3 * n);
    P.order.push_back(nb + 4 + 3 * n);
    const Result R = oc::socp::solve(P);
    if (out) *out = P;
    return R;
}

void verticalLandingMinMax() {
    const double TMAX = 1.2 * 60000 * G;   // the craft's drive (internal.h): 706 kN, 2,000 s
    const Vertical V{500, 20, 34400, 2000 * G, 0.3 * TMAX, 0.8 * TMAX};
    double ts, tb, mEnd;
    analyticMinMax(V, &ts, &tb, &mEnd);
    const double tfStar = ts + tb;
    std::printf("  the analytic landing: %.6f s at the least push, %.6f s at the most; %.6f s in all, %.4f kg, %.6f m/s of delta-v (v0 + g tf %.6f)\n", ts, tb,
                tfStar, V.m0 - mEnd, V.ve * std::log(V.m0 / mEnd), V.v0 + G * tfStar);
    double lastErr = 1e9;
    for (int n : {25, 50, 100}) {
        // the reference mass: the analytic profile's
        std::vector<double> zRef(n + 1);
        double lo = tfStar * 0.999, hi = tfStar * 1.01;
        Result best;
        Problem bestP;
        double bestTf = 0;
        for (int it = 0; it < 24; ++it) {   // the least feasible tf, by bisection
            const double tf = (lo + hi) / 2, dt = tf / n;
            for (int k = 0; k <= n; ++k) {
                const double t = k * dt;
                double h = V.h0, v = -V.v0, m = V.m0;
                burn(V, V.rho1, std::fmin(t, ts), &h, &v, &m);
                if (t > ts) burn(V, V.rho2, std::fmin(t - ts, tb), &h, &v, &m);
                zRef[k] = std::log(m);
            }
            Problem P;
            const Result R = verticalProgram(V, tf, n, zRef, &P);
            if (R.status == oc::socp::SOLVED || R.status == oc::socp::INACCURATE) { hi = tf; best = R; bestP = P; bestTf = tf; }
            else lo = tf;
        }
        const oc::socp::Check c = oc::socp::check(bestP, best);
        std::printf("  %d steps: the least feasible tf %.4f s: status %d in %d iterations; residuals %.1e primal, %.1e dual; gap %.1e of the cost\n", n, bestTf,
                    best.status, best.iters, c.primal, c.dual, std::fabs(best.pcost - best.dcost) / best.pcost);
        CHECK(bestTf > 0 && c.primal < 1e-6 && c.coneS == 0, "not feasible: %.2e", c.primal);
        if (!(bestTf > 0)) continue;
        const double fuel = V.m0 - std::exp(best.x[3 * n + 2]);
        int least = 0, most = 0;
        for (int k = 0; k < n; ++k) {
            const double m = std::exp(best.x[3 * k + 2]), push = best.x[3 * (n + 1) + k] * m;
            least += std::fabs(push - V.rho1) < 0.02 * V.rho1;
            most += std::fabs(push - V.rho2) < 0.02 * V.rho2;
        }
        const double err = std::fabs(bestTf - tfStar);
        std::printf("    the least feasible tf %.4f s (%.4f s from the analytic), %.4f kg (%.4f from it); %d steps at the least push, %d at the most, %d between\n", bestTf, err,
                    fuel, fuel - (V.m0 - mEnd), least, most, n - least - most);
        CHECK(err < 2.0 * tfStar / n && err < lastErr, "tf %.4f against %.4f", bestTf, tfStar);
        CHECK(least + most >= n - 2, "not min-max: %d, %d of %d", least, most, n);
        lastErr = err;
    }
}

// In three dimensions, with a least thrust while the drive burns (rho1 > 0) and the thrust's direction free, the
// relaxation |u| <= sigma is lossless (Acikmese and Ploen 2007): at the optimum |u| = sigma at every step, so the
// slack sigma, which the propellant is charged by, is the thrust the craft actually has, also where the least
// thrust holds it. A diverting landing under constant gravity, 1.5 km aside and 2 km up, falling and sliding.
void losslessWithALeastThrust() {
    const double TMAX = 1.2 * 60000 * G, ve = 2000 * G, m0 = 34400, rho1 = 0.25 * TMAX, rho2 = 0.8 * TMAX;
    const int n = 50;
    const double tf = 60, dt = tf / n;
    auto X = [](int k, int i) { return 7 * k + i; };   // r (3), v (3), z
    auto U = [&](int k, int i) { return 7 * (n + 1) + 4 * k + i; };
    Problem P;
    P.n = 7 * (n + 1) + 4 * n;
    P.c.assign(P.n, 0);
    for (int k = 0; k < n; ++k) P.c[U(k, 3)] = dt;
    P.A.cols = P.G.cols = P.n;
    const double start[7] = {1500, 300, 2000, -40, 10, -60, std::log(m0)};
    for (int i = 0; i < 7; ++i) { P.A.add(X(0, i), 1); P.A.endRow(); P.b.push_back(start[i]); }
    for (int k = 0; k < n; ++k) {
        for (int i = 0; i < 3; ++i) {
            P.A.add(X(k + 1, i), 1); P.A.add(X(k, i), -1); P.A.add(X(k, 3 + i), -dt); P.A.add(U(k, i), -dt * dt / 2); P.A.endRow();
            P.b.push_back(i == 2 ? -G * dt * dt / 2 : 0);
        }
        for (int i = 0; i < 3; ++i) {
            P.A.add(X(k + 1, 3 + i), 1); P.A.add(X(k, 3 + i), -1); P.A.add(U(k, i), -dt); P.A.endRow();
            P.b.push_back(i == 2 ? -G * dt : 0);
        }
        P.A.add(X(k + 1, 6), 1); P.A.add(X(k, 6), -1); P.A.add(U(k, 3), dt / ve); P.A.endRow(); P.b.push_back(0);
    }
    for (int i = 0; i < 6; ++i) { P.A.add(X(n, i), 1); P.A.endRow(); P.b.push_back(0); }
    std::vector<double> zRef(n + 1);
    for (int k = 0; k <= n; ++k) zRef[k] = std::log(m0 - 0.5 * (rho1 + rho2) / ve * k * dt);
    for (int k = 0; k < n; ++k) thrustBounds(P, U(k, 3), X(k, 6), zRef[k], rho1, rho2, true);
    for (int k = 0; k <= n; ++k) { P.G.add(X(k, 2), -1); P.G.endRow(); P.h.push_back(0); }   // above the ground
    P.l = P.G.rows;
    for (int k = 0; k < n; ++k) thrustBounds(P, U(k, 3), X(k, 6), zRef[k], rho1, rho2, false);
    for (int k = 0; k < n; ++k) {
        P.G.add(U(k, 3), -1); P.G.endRow(); P.h.push_back(0);
        for (int i = 0; i < 3; ++i) { P.G.add(U(k, i), -1); P.G.endRow(); P.h.push_back(0); }
        P.q.push_back(4);
    }
    const int nb = P.n;
    for (int i = 0; i < 7; ++i) { P.order.push_back(nb + i); P.order.push_back(X(0, i)); }
    for (int k = 0; k < n; ++k) {
        for (int i = 0; i < 4; ++i) P.order.push_back(U(k, i));
        for (int i = 0; i < 7; ++i) { P.order.push_back(nb + 7 + 7 * k + i); P.order.push_back(X(k + 1, i)); }
    }
    for (int i = 0; i < 6; ++i) P.order.push_back(nb + 7 + 7 * n + i);
    const Result R = oc::socp::solve(P);
    if (!solvedWell("the diverting landing", P, R)) return;
    double worst = 0, lowest = 1e9;
    int atLeast = 0;
    for (int k = 0; k < n; ++k) {
        const double ux = R.x[U(k, 0)], uy = R.x[U(k, 1)], uz = R.x[U(k, 2)], s = R.x[U(k, 3)];
        const double m = std::exp(R.x[X(k, 6)]);
        worst = std::fmax(worst, (s - std::sqrt(ux * ux + uy * uy + uz * uz)) / s);
        lowest = std::fmin(lowest, s * m / rho1);
        atLeast += s * m < 1.02 * rho1;
    }
    std::printf("    sigma above |u| by at most %.2e of itself; the thrust at least %.4f of rho1, at it (within 2 %%) on %d of %d steps; %.1f kg\n", worst, lowest,
                atLeast, n, m0 - std::exp(R.x[X(n, 6)]));
    CHECK(worst < 1e-6, "lossy by %.2e", worst);
    CHECK(atLeast > 0 && lowest > 0.995, "the least thrust not met, or not held to: %d steps, %.4f", atLeast, lowest);
}

// ---- problems made from their answers ------------------------------------------------------------------------

// A problem built from a primal-dual pair chosen first, strictly complementary: x*, s* and z* in K with s*'z* = 0
// (in each cone one of them nought, or both on the boundary, opposite), y*; then b = A x*, h = G x* + s*, and
// c = -A'y* - G'z*. The pair is optimal by construction, so its cost c'x* is the optimal value; x* need not be the
// only optimal x (with fewer active constraints than unknowns it is not), so the value and the KKT residuals are
// what is held. Forty problems, of the orthant and cones of three, four and six.
struct Rng {
    unsigned long long x;
    double next() { x = x * 6364136223846793005ULL + 1442695040888963407ULL; return (double)(x >> 11) / 9007199254740992.0; }
    double pm() { return 2 * next() - 1; }
};

void constructedOptima() {
    Rng r{20261112};
    double worstX = 0, worstCost = 0;
    int solved = 0, iters = 0;
    const int count = 40;
    for (int trial = 0; trial < count; ++trial) {
        const int n = 6 + (int)(r.next() * 10), p = (int)(r.next() * 3);
        int l = 2 + (int)(r.next() * 6);
        std::vector<int> q;
        for (int i = 0, cones = 1 + (int)(r.next() * 4); i < cones; ++i) q.push_back(std::vector<int>{3, 4, 6}[(int)(r.next() * 3)]);
        int m = l;
        for (int d : q) m += d;
        if (p + m < n + 2) { l += n + 2 - p - m; m = n + 2 - p; }   // rows enough to hold x: else c'x is flat along G's null space

        // the answer
        std::vector<double> x(n), y(p), s(m, 0.0), z(m, 0.0);
        for (double& v : x) v = r.pm();
        for (double& v : y) v = r.pm();
        for (int i = 0; i < l; ++i) (r.next() < 0.5 ? s[i] : z[i]) = 0.2 + r.next();
        for (int at = l, c = 0; c < (int)q.size(); at += q[c++]) {
            const int d = q[c];
            const double kind = r.next();
            std::vector<double> dir(d - 1);
            double nd = 0;
            for (double& v : dir) { v = r.pm(); nd += v * v; }
            nd = std::sqrt(nd);
            if (kind < 0.4) {   // both on the boundary, opposite: s = a (1, e), z = b (1, -e)
                const double a = 0.3 + r.next(), b = 0.3 + r.next();
                s[at] = a; z[at] = b;
                for (int i = 1; i < d; ++i) { s[at + i] = a * dir[i - 1] / nd; z[at + i] = -b * dir[i - 1] / nd; }
            } else {            // one inside, the other nought
                double* w = kind < 0.7 ? &s[at] : &z[at];
                w[0] = 1.5 + r.next();
                for (int i = 1; i < d; ++i) w[i] = 0.5 * dir[i - 1] / nd;
            }
        }
        Problem P;
        P.n = n;
        P.A.cols = P.G.cols = n;
        std::vector<std::vector<double>> Ad(p, std::vector<double>(n)), Gd(m, std::vector<double>(n));
        for (auto& row : Ad) for (double& v : row) v = r.pm();
        for (auto& row : Gd) for (double& v : row) v = r.pm();
        for (int i = 0; i < p; ++i) {
            double b = 0;
            for (int j = 0; j < n; ++j) { P.A.add(j, Ad[i][j]); b += Ad[i][j] * x[j]; }
            P.A.endRow();
            P.b.push_back(b);
        }
        for (int i = 0; i < m; ++i) {
            double h = s[i];
            for (int j = 0; j < n; ++j) { P.G.add(j, Gd[i][j]); h += Gd[i][j] * x[j]; }
            P.G.endRow();
            P.h.push_back(h);
        }
        P.l = l;
        P.q = q;
        P.c.assign(n, 0.0);
        for (int j = 0; j < n; ++j) {
            for (int i = 0; i < p; ++i) P.c[j] -= Ad[i][j] * y[i];
            for (int i = 0; i < m; ++i) P.c[j] -= Gd[i][j] * z[i];
        }
        const Result R = oc::socp::solve(P);
        const oc::socp::Check c = oc::socp::check(P, R);
        double cost = 0, dx = 0;
        for (int j = 0; j < n; ++j) { cost += P.c[j] * x[j]; dx = std::fmax(dx, std::fabs(R.x[j] - x[j])); }
        const bool ok = (R.status == oc::socp::SOLVED || R.status == oc::socp::INACCURATE) && c.primal < 1e-7 && c.dual < 1e-7;
        solved += ok;
        iters = std::max(iters, R.iters);
        if (ok) { worstX = std::fmax(worstX, dx); worstCost = std::fmax(worstCost, std::fabs(R.pcost - cost) / std::fmax(1.0, std::fabs(cost))); }
        else std::printf("    problem %d (n %d, p %d, l %d, %d cones): status %d, residuals %.2e %.2e\n", trial, n, p, l, (int)q.size(), R.status, c.primal, c.dual);
    }
    std::printf("  %d of %d solved, in at most %d iterations; the cost within %.2e of the value built in (x as far as %.2e from x*, another optimum)\n", solved,
                count, iters, worstCost, worstX);
    CHECK(solved == count && worstCost < 1e-6, "%d solved, the cost %.2e off", solved, worstCost);
}

// The order of the unknowns is the factorization's business, not the answer's: the transfer above, factored in
// the band its stages give and densely in the plain order, comes to the same answer, the band some sixty times
// quicker. (The order only changes which pivots the factorization takes.)
void bandedOrderIsTheDenseAnswer() {
    const int N = 40;
    const double T = 10, a = 1, tb = 2, D = a * tb * (T - tb), dt = T / N;
    auto R_ = [&](int k, int i) { return 10 * k + i; };
    auto V_ = [&](int k, int i) { return 10 * k + 3 + i; };
    auto U_ = [&](int k, int i) { return 10 * k + 6 + i; };
    auto S_ = [&](int k) { return 10 * k + 9; };
    Problem P;
    P.n = 10 * N + 6;
    P.c.assign(P.n, 0);
    for (int k = 0; k < N; ++k) P.c[S_(k)] = dt;
    P.A.cols = P.G.cols = P.n;
    for (int i = 0; i < 3; ++i) { P.A.add(R_(0, i), 1); P.A.endRow(); P.b.push_back(0); }
    for (int i = 0; i < 3; ++i) { P.A.add(V_(0, i), 1); P.A.endRow(); P.b.push_back(0); }
    for (int k = 0; k < N; ++k) {
        for (int i = 0; i < 3; ++i) { P.A.add(R_(k + 1, i), 1); P.A.add(R_(k, i), -1); P.A.add(V_(k, i), -dt); P.A.add(U_(k, i), -dt * dt / 2); P.A.endRow(); P.b.push_back(0); }
        for (int i = 0; i < 3; ++i) { P.A.add(V_(k + 1, i), 1); P.A.add(V_(k, i), -1); P.A.add(U_(k, i), -dt); P.A.endRow(); P.b.push_back(0); }
    }
    for (int i = 0; i < 3; ++i) { P.A.add(R_(N, i), 1); P.A.endRow(); P.b.push_back(i == 0 ? D : 0); }
    for (int i = 0; i < 3; ++i) { P.A.add(V_(N, i), 1); P.A.endRow(); P.b.push_back(0); }
    for (int k = 0; k < N; ++k) { P.G.add(S_(k), 1); P.G.endRow(); P.h.push_back(a); }
    P.l = N;
    for (int k = 0; k < N; ++k) {
        P.G.add(S_(k), -1); P.G.endRow(); P.h.push_back(0);
        for (int i = 0; i < 3; ++i) { P.G.add(U_(k, i), -1); P.G.endRow(); P.h.push_back(0); }
        P.q.push_back(4);
    }
    const auto t0 = std::chrono::steady_clock::now();
    const Result dense = oc::socp::solve(P);
    const double msDense = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    const int nb = P.n;
    for (int i = 0; i < 6; ++i) { P.order.push_back(nb + i); P.order.push_back(i < 3 ? R_(0, i) : V_(0, i - 3)); }
    for (int k = 0; k < N; ++k) {
        for (int i = 0; i < 3; ++i) P.order.push_back(U_(k, i));
        P.order.push_back(S_(k));
        for (int i = 0; i < 6; ++i) { P.order.push_back(nb + 6 + 6 * k + i); P.order.push_back(i < 3 ? R_(k + 1, i) : V_(k + 1, i - 3)); }
    }
    for (int i = 0; i < 6; ++i) P.order.push_back(nb + 6 + 6 * N + i);
    const auto t1 = std::chrono::steady_clock::now();
    const Result band = oc::socp::solve(P);
    const double msBand = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t1).count();
    double dx = 0;
    for (int j = 0; j < P.n; ++j) dx = std::fmax(dx, std::fabs(dense.x[j] - band.x[j]));
    std::printf("  dense: band %d, %d iterations, %.1f ms, %.10f; banded: band %d, %d iterations, %.1f ms, %.10f; the answers %.1e apart\n", dense.bandwidth, dense.iters,
                msDense, dense.pcost, band.bandwidth, band.iters, msBand, band.pcost, dx);
    CHECK(dense.status == oc::socp::SOLVED && band.status == oc::socp::SOLVED && dx < 1e-5 && std::fabs(dense.pcost - band.pcost) < 1e-7, "%d %d %.2e", dense.status,
          band.status, dx);
    CHECK(band.bandwidth < dense.bandwidth / 10, "band %d against %d", band.bandwidth, dense.bandwidth);
}

struct Test { const char* name; void (*fn)(); };
const Test tests[] = {
    {"lp_vertex", lpVertex},
    {"projection_onto_a_plane", projectionOntoAPlane},
    {"infeasible_certified", infeasibleCertified},
    {"unbounded_certified", unboundedCertified},
    {"far_from_the_origin", farFromTheOrigin},
    {"minimum_energy_transfer", minimumEnergyTransfer},
    {"bang_off_bang_transfer", bangOffBangTransfer},
    {"vertical_landing_min_max", verticalLandingMinMax},
    {"lossless_with_a_least_thrust", losslessWithALeastThrust},
    {"constructed_optima", constructedOptima},
    {"banded_order_is_the_dense_answer", bandedOrderIsTheDenseAnswer},
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
