// deck_plan.cpp — see deck_plan.h. The problem is posed in scaled units, a kilometre and ten seconds (so a
// hectometre a second and ten metres a second squared), in which every number in it is of order one, and handed
// to socp.h with its unknowns in time order: each state beside the dynamics row that defines it, each interval's
// controls between, which keeps the KKT system a band about thirty wide. GPLv3.

#include "deck_plan.h"

#include "socp.h"

#include <cmath>

namespace oc {

namespace {

const double LU = 1000.0, TU = 10.0, VU = LU / TU, AU = LU / (TU * TU);   // the scaled units
const double VE = ISP * G0;                                                 // m/s: the exhaust's speed

// The motion in the frame, scaled: d/dt (r, v) = A (r, v) + B u, with A = [0 I; w^2 P + T, -2 W x].
void motion(const double T[3][3], double A[6][6]) {
    const double w = RING_SPIN * TU;
    for (int i = 0; i < 6; ++i)
        for (int j = 0; j < 6; ++j) A[i][j] = 0;
    for (int i = 0; i < 3; ++i) A[i][3 + i] = 1;
    for (int i = 0; i < 3; ++i)
        for (int j = 0; j < 3; ++j) A[3 + i][j] = T[i][j] * TU * TU;
    A[3][0] += w * w;   // the centrifugal pull, square to the axis (y)
    A[5][2] += w * w;
    A[3][5] += -2 * w;   // -2 W x v = -2 w (vz, 0, -vx)
    A[5][3] += 2 * w;
}

// Phi and Gamma over dt (scaled) for A held: RK4 on d/dt [Phi | Gamma] = A [Phi | Gamma] + [0 | B], in pieces.
void transition(const double A[6][6], double dt, double Phi[6][6], double Gam[6][3]) {
    double M[6][9] = {};
    for (int i = 0; i < 6; ++i) M[i][i] = 1;
    const int pieces = 8;
    const double h = dt / pieces;
    auto f = [&](const double X[6][9], double D[6][9]) {
        for (int i = 0; i < 6; ++i)
            for (int j = 0; j < 9; ++j) {
                double s = 0;
                for (int k = 0; k < 6; ++k) s += A[i][k] * X[k][j];
                D[i][j] = s + (i >= 3 && j >= 6 && i - 3 == j - 6 ? 1.0 : 0.0);
            }
    };
    double k1[6][9], k2[6][9], k3[6][9], k4[6][9], X[6][9];
    for (int p = 0; p < pieces; ++p) {
        f(M, k1);
        for (int i = 0; i < 6; ++i) for (int j = 0; j < 9; ++j) X[i][j] = M[i][j] + k1[i][j] * h / 2;
        f(X, k2);
        for (int i = 0; i < 6; ++i) for (int j = 0; j < 9; ++j) X[i][j] = M[i][j] + k2[i][j] * h / 2;
        f(X, k3);
        for (int i = 0; i < 6; ++i) for (int j = 0; j < 9; ++j) X[i][j] = M[i][j] + k3[i][j] * h;
        f(X, k4);
        for (int i = 0; i < 6; ++i)
            for (int j = 0; j < 9; ++j) M[i][j] += (k1[i][j] + 2 * k2[i][j] + 2 * k3[i][j] + k4[i][j]) * h / 6;
    }
    for (int i = 0; i < 6; ++i) {
        for (int j = 0; j < 6; ++j) Phi[i][j] = M[i][j];
        for (int j = 0; j < 3; ++j) Gam[i][j] = M[i][6 + j];
    }
}

double comp(V3 a, int i) { return i == 0 ? a.x : i == 1 ? a.y : a.z; }

}   // namespace

RingFrame ringFrameAt(double t) {
    RingFrame f;
    f.c = ringPos(t);
    f.vc = ringVel(t);
    f.x = ringRef(t);
    f.y = ring.axis;
    f.z = cross(f.x, f.y);
    return f;
}

void tideTensor(double t, double T[3][3]) {
    const RingFrame f = ringFrameAt(t);
    const double cm = norm(f.c), k = MU / (cm * cm * cm);
    const V3 ch = f.c * (1 / cm);
    const double cr[3] = {dot(ch, f.x), dot(ch, f.y), dot(ch, f.z)};
    for (int i = 0; i < 3; ++i)
        for (int j = 0; j < 3; ++j) T[i][j] = k * (3 * cr[i] * cr[j] - (i == j ? 1 : 0));
}

bool planLanding(const PlanSpec& sp, PlanResult& out) {
    const int N = sp.n;
    if (N < 2 || !(sp.tf > 0) || !(sp.m0 > 0) || !(sp.thrustMax > 0)) { out.status = -1; return false; }
    // the nodes' times, s, and the intervals, scaled
    std::vector<double> tn(N + 1), dts(N);
    for (int k = 0; k <= N; ++k) {
        const double x = (double)k / N;
        tn[k] = k == N ? sp.tf : sp.tf * (x - sp.grid * std::sin(2 * PI * x) / (2 * PI));
    }
    for (int k = 0; k < N; ++k) dts[k] = (tn[k + 1] - tn[k]) / TU;
    if (!(sp.grid >= 0 && sp.grid < 1)) { out.status = -1; return false; }
    const double cz = VU / VE;                        // z' = -cz sigma, sigma scaled (AU), t scaled
    const double mu2 = sp.thrustMax / sp.m0 / AU;     // the bound per kilogram at the start, scaled
    const double mu1 = sp.thrustMin / sp.m0 / AU;     // the least
    const double muEnd = sp.thrustEnd / sp.m0 / AU;   // the bound at the end
    auto X = [&](int k, int i) { return 7 * k + i; };
    auto U = [&](int k, int i) { return 7 * (N + 1) + 4 * k + i; };
    // the thrust's changes J(k), k = 0..N (u_k - u_k-1, from the start's force and to the end's), where kept; and
    // the elastic cone's slack E(k) at each node but the first
    const bool rate = sp.jerk > 0 || sp.smooth > 0;
    std::vector<int> jAt(N + 1, -1), eAt(N + 1, -1), sAt(N + 1, -1);
    int nv = 7 * (N + 1) + 4 * N;
    for (int k = 0; k <= N && rate; ++k)
        if (!((k == 0 && !sp.startSet) || (k == N && !sp.endSet))) jAt[k] = nv++;
    for (int k = 1; k <= N && sp.elastic; ++k) {
        eAt[k] = nv++;
        if (sp.side != 0 && tn[k] >= sp.sideFrom - 1e-9 && tn[k] <= sp.sideTo + 1e-9) sAt[k] = nv++;
    }
    const double EPRICE = 100.0 * LU / VU;            // 100 m/s a metre, scaled
    socp::Problem P;
    P.n = nv;
    P.c.assign(P.n, 0.0);
    for (int k = 0; k < N; ++k) P.c[U(k, 3)] = dts[k];
    for (int k = 0; k <= N; ++k) {
        if (jAt[k] >= 0) P.c[jAt[k]] = sp.smooth / TU;
        if (eAt[k] >= 0) P.c[eAt[k]] = EPRICE;
        if (sAt[k] >= 0) P.c[sAt[k]] = EPRICE;
    }
    P.A.cols = P.n;
    P.G.cols = P.n;
    // the equalities: the start, the dynamics, the end
    const V3 r0 = sp.r0 * (1 / LU), v0 = sp.v0 * (1 / VU), rN = sp.rN * (1 / LU), vN = sp.vN * (1 / VU);
    for (int i = 0; i < 7; ++i) {
        P.A.add(X(0, i), 1);
        P.A.endRow();
        P.b.push_back(i < 3 ? comp(r0, i) : i < 6 ? comp(v0, i - 3) : 0.0);
    }
    double Phi[6][6], Gam[6][3], A[6][6], T[3][3];
    for (int k = 0; k < N; ++k) {
        tideTensor(sp.t0 + (tn[k] + tn[k + 1]) / 2, T);
        motion(T, A);
        transition(A, dts[k], Phi, Gam);
        for (int i = 0; i < 6; ++i) {
            P.A.add(X(k + 1, i), 1);
            for (int j = 0; j < 6; ++j) P.A.add(X(k, j), -Phi[i][j]);
            for (int j = 0; j < 3; ++j) P.A.add(U(k, j), -Gam[i][j]);
            P.A.endRow();
            P.b.push_back(0);
        }
        P.A.add(X(k + 1, 6), 1);
        P.A.add(X(k, 6), -1);
        P.A.add(U(k, 3), cz * dts[k]);
        P.A.endRow();
        P.b.push_back(0);
    }
    for (int i = 0; i < 6; ++i) {
        P.A.add(X(N, i), 1);
        P.A.endRow();
        P.b.push_back(i < 3 ? comp(rN, i) : comp(vN, i - 3));
    }
    // the references for ln m: given, or the mass at a steady 250 m/s over the plan
    std::vector<double> z0(N + 1);
    for (int k = 0; k <= N; ++k) z0[k] = sp.zRef ? sp.zRef[k] - std::log(sp.m0) : -250.0 * tn[k] / sp.tf / VE;
    // the orthant: the thrust's tangent bound, no thrust while turning, pointing; the cone behind the pad, the side
    const V3 pad = sp.padAt * (1 / LU), up = sp.padUp, spin = sp.padSpin;
    for (int k = 0; k < N; ++k) {
        const double tk = tn[k];
        const double m2 = (muEnd > 0 && tn[k + 1] > sp.tf - sp.tEnd + 1e-9 ? muEnd : mu2) * std::exp(-z0[k]);
        P.G.add(U(k, 3), 1);
        P.G.add(X(k, 6), m2);
        P.G.endRow();
        P.h.push_back(m2 * (1 + z0[k]));
        if (tk < sp.tOrient - 1e-9) {
            P.G.add(U(k, 3), 1);
            P.G.endRow();
            P.h.push_back(0);
        }
        if (jAt[k] >= 0 && sp.jerk > 0) {   // the change no more than jerk times the time between the forces' middles
            P.G.add(jAt[k], 1);
            P.G.endRow();
            P.h.push_back(sp.jerk * (k == 0 ? dts[0] : (dts[k - 1] + dts[k]) / 2) * TU / AU);
        }
        double c = tk >= sp.pointFrom - 1e-9 && tk <= sp.pointTo + 1e-9 ? sp.cosPoint : -2;
        if (k == 0 || tk < sp.tFirst - 1e-9) c = std::fmax(c, sp.cosFirst);
        if (k == N - 1 || tn[k + 1] > sp.tf - sp.tLast + 1e-9) c = std::fmax(c, sp.cosLast);
        if (c > -1) {   // up . u >= c sigma
            for (int i = 0; i < 3; ++i) P.G.add(U(k, i), -comp(up, i));
            P.G.add(U(k, 3), c);
            P.G.endRow();
            P.h.push_back(0);
        }
    }
    if (jAt[N] >= 0 && sp.jerk > 0) {
        P.G.add(jAt[N], 1);
        P.G.endRow();
        P.h.push_back(sp.jerk * dts[N - 1] * TU / AU);
    }
    for (int k = 0; k <= N; ++k) {   // the state constraints hold from the first node on: the start is where the craft is
        for (const int at : {eAt[k], sAt[k]}) {   // the slacks are not negative
            if (at < 0) continue;
            P.G.add(at, -1);
            P.G.endRow();
            P.h.push_back(0);
        }
        if (sp.tanA > 0 && k > 0) {   // (up + tanA spin) . (r - pad) + E >= 0
            const V3 a = (up + spin * sp.tanA) * -1.0;
            for (int i = 0; i < 3; ++i) P.G.add(X(k, i), comp(a, i));
            if (eAt[k] >= 0) P.G.add(eAt[k], -1);
            P.G.endRow();
            P.h.push_back(dot(a, pad));
        }
        const double tk = tn[k];
        if (sp.side != 0 && k > 0 && tk >= sp.sideFrom - 1e-9 && tk <= sp.sideTo + 1e-9) {   // side y + S >= ySide
            P.G.add(X(k, 1), -sp.side);
            if (sAt[k] >= 0) P.G.add(sAt[k], -1);
            P.G.endRow();
            P.h.push_back(-sp.ySide / LU);
        }
    }
    P.l = P.G.rows;
    // the cones: |u| <= sigma for each interval; the least thrust, in its window; the thrust's changes; the
    // approach's cone at each node but the first
    for (int k = 0; k < N; ++k) {
        P.G.add(U(k, 3), -1);
        P.G.endRow();
        P.h.push_back(0);
        for (int i = 0; i < 3; ++i) {
            P.G.add(U(k, i), -1);
            P.G.endRow();
            P.h.push_back(0);
        }
        P.q.push_back(4);
    }
    for (int k = 0; k < N && mu1 > 0; ++k) {
        // (a + d - 1/2, d, a + d - 3/2) in Q3 with a = sigma / (mu1 e^-z0), d = z - z0: 2 (a + d - 1) >= d^2
        const double tk = tn[k];
        if (tk < sp.minFrom - 1e-9 || tk > sp.minTo + 1e-9) continue;
        const double inv = 1 / (mu1 * std::exp(-z0[k]));
        const double off[3] = {0.5, 0, 1.5};
        for (int row = 0; row < 3; ++row) {
            if (row != 1) P.G.add(U(k, 3), -inv);
            P.G.add(X(k, 6), -1);
            P.G.endRow();
            P.h.push_back(-z0[k] - off[row]);
        }
        P.q.push_back(3);
    }
    if (rate) {   // the thrust's changes: |u_k - u_k-1| <= J(k), from the start's force and to the end's
        for (int k = 0; k <= N; ++k) {
            if (jAt[k] < 0) continue;
            P.G.add(jAt[k], -1);
            P.G.endRow();
            P.h.push_back(0);
            for (int i = 0; i < 3; ++i) {
                if (k < N) P.G.add(U(k, i), -1);
                if (k > 0) P.G.add(U(k - 1, i), 1);
                P.G.endRow();
                P.h.push_back(k == 0 ? -comp(sp.uStart, i) / AU : k == N ? comp(sp.uEnd, i) / AU : 0);
            }
            P.q.push_back(4);
        }
    }
    const V3 across{0, 1, 0};
    for (int k = 1; k <= N; ++k) {
        const V3 rows[3] = {up, spin * sp.tanS, across * sp.tanC};
        for (int j = 0; j < 3; ++j) {
            const V3& m = rows[j];
            for (int i = 0; i < 3; ++i) P.G.add(X(k, i), -comp(m, i));
            if (j == 0 && eAt[k] >= 0) P.G.add(eAt[k], -1);
            P.G.endRow();
            P.h.push_back(-dot(m, pad));
        }
        P.q.push_back(3);
    }
    // the order: each state beside the row that defines it
    const int nb = P.n;
    for (int i = 0; i < 7; ++i) { P.order.push_back(nb + i); P.order.push_back(X(0, i)); }
    for (int k = 0; k < N; ++k) {
        if (jAt[k] >= 0) P.order.push_back(jAt[k]);
        for (int i = 0; i < 4; ++i) P.order.push_back(U(k, i));
        for (int i = 0; i < 7; ++i) { P.order.push_back(nb + 7 + 7 * k + i); P.order.push_back(X(k + 1, i)); }
        if (eAt[k + 1] >= 0) P.order.push_back(eAt[k + 1]);
        if (sAt[k + 1] >= 0) P.order.push_back(sAt[k + 1]);
    }
    if (jAt[N] >= 0) P.order.push_back(jAt[N]);
    for (int i = 0; i < 6; ++i) P.order.push_back(nb + 7 + 7 * N + i);

    const socp::Result R = socp::solve(P);
    out.status = R.status;
    out.iters = R.iters;
    out.pres = R.pres;
    out.dres = R.dres;
    out.gap = R.gap;
    out.relgap = R.relgap;
    const bool ok = R.status == socp::SOLVED || R.status == socp::INACCURATE;
    out.t.assign(N + 1, 0);
    out.r.assign(N + 1, V3{0, 0, 0});
    out.v.assign(N + 1, V3{0, 0, 0});
    out.z.assign(N + 1, 0);
    out.u.assign(N, V3{0, 0, 0});
    out.sigma.assign(N, 0);
    out.cost = 0;
    out.lossless = 0;
    out.outside = 0;
    if (!ok || (int)R.x.size() != P.n) return false;
    const double lnm0 = std::log(sp.m0);
    for (int k = 0; k <= N; ++k) {
        out.t[k] = sp.t0 + tn[k];
        out.r[k] = V3{R.x[X(k, 0)], R.x[X(k, 1)], R.x[X(k, 2)]} * LU;
        out.v[k] = V3{R.x[X(k, 3)], R.x[X(k, 4)], R.x[X(k, 5)]} * VU;
        out.z[k] = R.x[X(k, 6)] + lnm0;
    }
    for (int k = 0; k < N; ++k) {
        out.u[k] = V3{R.x[U(k, 0)], R.x[U(k, 1)], R.x[U(k, 2)]} * AU;
        out.sigma[k] = R.x[U(k, 3)] * AU;
        out.cost += out.sigma[k] * dts[k] * TU;
        if (out.sigma[k] > 1e-3) out.lossless = std::fmax(out.lossless, out.sigma[k] - norm(out.u[k]));
    }
    for (int k = 0; k <= N; ++k)
        for (const int at : {eAt[k], sAt[k]})
            if (at >= 0) out.outside = std::fmax(out.outside, R.x[at] * LU);
    return true;
}

bool storePlan(const PlanResult& from, Flown& to) {
    const int N = (int)from.u.size();
    if (N < 1 || N > PLAN_MAX) return false;
    to = Flown{};
    to.n = N;
    to.t0 = from.t[0];
    to.tf = from.t[N] - from.t[0];
    for (int k = 0; k <= N; ++k) {
        to.t[k] = from.t[k];
        to.r[k][0] = from.r[k].x; to.r[k][1] = from.r[k].y; to.r[k][2] = from.r[k].z;
        to.v[k][0] = from.v[k].x; to.v[k][1] = from.v[k].y; to.v[k][2] = from.v[k].z;
        to.z[k] = from.z[k];
    }
    for (int k = 0; k < N; ++k) {
        to.u[k][0] = from.u[k].x; to.u[k][1] = from.u[k].y; to.u[k][2] = from.u[k].z;
        to.sigma[k] = from.sigma[k];
    }
    to.cost = from.cost;
    return true;
}

int flownStep(const Flown& plan, double t) {
    int k = 0;
    while (k < plan.n - 1 && plan.t[k + 1] <= t) ++k;
    return k;
}

void flownAt(const Flown& plan, double t, V3* r, V3* v, V3* u) {
    const int N = plan.n;
    if (N == 0) { *r = *v = *u = V3{0, 0, 0}; return; }
    const int k = flownStep(plan, t);
    const double tk = plan.t[k], dt = plan.t[k + 1] - plan.t[k];
    double tau = clampd(t - tk, 0.0, dt);
    const V3 uk{plan.u[k][0], plan.u[k][1], plan.u[k][2]};
    *u = uk;
    // carried forward from node k under the held force, by the frame's own motion, in SI
    double T[3][3];
    tideTensor(tk + dt / 2, T);
    const double w = RING_SPIN;
    auto acc = [&](V3 p, V3 q) {
        const V3 tide{T[0][0] * p.x + T[0][1] * p.y + T[0][2] * p.z, T[1][0] * p.x + T[1][1] * p.y + T[1][2] * p.z,
                      T[2][0] * p.x + T[2][1] * p.y + T[2][2] * p.z};
        return uk + V3{w * w * p.x, 0, w * w * p.z} + V3{-2 * w * q.z, 0, 2 * w * q.x} + tide;
    };
    V3 p{plan.r[k][0], plan.r[k][1], plan.r[k][2]}, q{plan.v[k][0], plan.v[k][1], plan.v[k][2]};
    const int pieces = 1 + (int)(tau / 0.25);
    const double h = tau / pieces;
    for (int i = 0; i < pieces; ++i) {
        const V3 a1 = acc(p, q), p1 = q;
        const V3 a2 = acc(p + p1 * (h / 2), q + a1 * (h / 2)), p2 = q + a1 * (h / 2);
        const V3 a3 = acc(p + p2 * (h / 2), q + a2 * (h / 2)), p3 = q + a2 * (h / 2);
        const V3 a4 = acc(p + p3 * h, q + a3 * h), p4 = q + a3 * h;
        p = p + (p1 + p2 * 2 + p3 * 2 + p4) * (h / 6);
        q = q + (a1 + a2 * 2 + a3 * 2 + a4) * (h / 6);
    }
    *r = p;
    *v = q;
}

}   // namespace oc
