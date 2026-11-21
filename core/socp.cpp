// socp.cpp — see socp.h. The algorithm, as this file follows it:
//
// The problem and its dual are embedded in one self-dual system with two more unknowns, tau and kappa:
//
//     0 = A'y + G'z + c tau            s = -G x + h tau            0 = -A x + b tau
//     kappa = -c'x - b'y - h'z         s, z in K;  tau, kappa >= 0
//
// whose solutions with tau > 0 are the primal and dual solutions scaled by tau, and with kappa > 0 are
// certificates that one of them is infeasible. Each iteration takes a Newton step on that system and on the
// centred complementarity lambda o lambda = mu e, in the variables scaled by Nesterov and Todd's point W
// (W z = W^-1 s = lambda), first with no centring (the affine step), then with the centring Mehrotra's rule
// sets from how far the affine step got, sigma = (1 - alpha)^3, and his second-order correction. Every
// direction needs the KKT system
//
//     [ 0  A'  G'  ] [ux]   [fx]
//     [ A  0   0   ] [uy] = [fy]
//     [ G  0  -W'W ] [uz]   [fz]
//
// solved once for the direction itself and once, per iteration, for (c, -b, -h), which carries tau. It is
// reduced to [G'W^-2 G, A'; A, 0] in (ux, uy), regularized by +-reg on the diagonal so that it is
// quasi-definite and factors without pivoting, factored as a band in the order the problem gives, and each
// solve is refined against the unregularized system. GPLv3.

#include "socp.h"

#include <algorithm>
#include <cmath>

#ifdef SOCP_TRACE   // a trace of each iteration, for building and debugging: compiled out otherwise
#include <cstdio>
#define TRACE(...) std::fprintf(stderr, __VA_ARGS__)
#else
#define TRACE(...) ((void)0)
#endif

namespace oc {
namespace socp {

namespace {

const double BIG = 1e300;

struct Cones {
    int l = 0, m = 0;
    std::vector<int> q, at;   // the second-order cones' dimensions and first rows
    int degree() const { return l + (int)q.size(); }
};

double dot(const double* a, const double* b, int n) {
    double s = 0;
    for (int i = 0; i < n; ++i) s += a[i] * b[i];
    return s;
}
double norm(const double* a, int n) { return std::sqrt(dot(a, a, n)); }
double norm(const std::vector<double>& a) { return norm(a.data(), (int)a.size()); }

// y += k M x, and y += k M'x
void mul(const Sparse& M, const double* x, double* y, double k) {
    for (int i = 0; i < M.rows; ++i) {
        double s = 0;
        for (int e = M.start[i]; e < M.start[i + 1]; ++e) s += M.val[e] * x[M.col[e]];
        y[i] += k * s;
    }
}
void mulT(const Sparse& M, const double* x, double* y, double k) {
    for (int i = 0; i < M.rows; ++i) {
        const double xi = k * x[i];
        if (xi == 0) continue;
        for (int e = M.start[i]; e < M.start[i + 1]; ++e) y[M.col[e]] += M.val[e] * xi;
    }
}

// ---- the cone: its scaling, its algebra -----------------------------------------------------------------

// x0^2 - |x1|^2, as a product so that it keeps its digits near the boundary
double jnorm2(const double* x, int q) {
    const double r = norm(x + 1, q - 1);
    return (x[0] - r) * (x[0] + r);
}

// Nesterov and Todd's scaling W, with W z = W^-T s = lambda. For the orthant a diagonal d. For each second-order
// cone a q x q matrix and its inverse, dense: it starts as the symmetric eta (2 v v' - J) of the starting pair
// (J = diag(1, -1, ..., -1), v'Jv = 1) and after each step is composed with the scaling of the step's scaled
// pair, W <- W~ W (updateScaling). That keeps W z = W^-T s exact, and its digits, where s and z near the
// boundary would lose them; W stops being symmetric, and the KKT system needs only W'W.
struct Scaling {
    std::vector<double> d;       // the orthant's
    std::vector<double> M, Mi;   // each cone's W and W^-1, row-major, concatenated
    std::vector<int> at;         // where each cone's matrices start in M and Mi
    bool identity = true;
};

enum { BY_W, BY_WT, BY_WINV, BY_WINVT };

// One cone's block: out = W v, W'v, W^-1 v or W^-T v; out may not be v.
void coneApply(const Scaling& W, int c, int q, const double* v, double* out, int mode) {
    const double* A = (mode == BY_W || mode == BY_WT) ? &W.M[W.at[c]] : &W.Mi[W.at[c]];
    const bool tr = mode == BY_WT || mode == BY_WINVT;
    for (int r = 0; r < q; ++r) {
        double x = 0;
        for (int k = 0; k < q; ++k) x += (tr ? A[k * q + r] : A[r * q + k]) * v[k];
        out[r] = x;
    }
}

void applyW(const Cones& K, const Scaling& W, const double* v, double* out, int mode) {
    if (W.identity) { for (int i = 0; i < K.m; ++i) out[i] = v[i]; return; }
    for (int i = 0; i < K.l; ++i) out[i] = (mode == BY_W || mode == BY_WT) ? v[i] * W.d[i] : v[i] / W.d[i];
    for (size_t c = 0; c < K.q.size(); ++c) coneApply(W, (int)c, K.q[c], v + K.at[c], out + K.at[c], mode);
}

// The symmetric scaling of one cone's pair (s, z), both inside it: eta, and the unit v of eta (2 v v' - J). With
// sb, zb the pair on the unit hyperboloid, wb = (sb + J zb) / (2 gamma) is the unit point whose boost 2 wb wb' - J
// takes zb to sb; W is half that boost, the one about v = (wb + e) / |wb + e|_J, so that W^2 z = s. False if
// either is not inside the cone.
bool ntPair(const double* s, const double* z, int q, double* eta, double* v) {
    const double sJs = jnorm2(s, q), zJz = jnorm2(z, q);
    if (!(s[0] > 0 && z[0] > 0 && sJs > 0 && zJz > 0)) return false;
    const double ns = std::sqrt(sJs), nz = std::sqrt(zJz);
    double sz = 0;
    for (int k = 0; k < q; ++k) sz += (s[k] / ns) * (z[k] / nz);
    const double gamma = std::sqrt((1 + sz) / 2);
    const double wb0 = (s[0] / ns + z[0] / nz) / (2 * gamma), half = std::sqrt(2 * (1 + wb0));
    v[0] = (wb0 + 1) / half;
    for (int k = 1; k < q; ++k) v[k] = (s[k] / ns - z[k] / nz) / (2 * gamma) / half;
    *eta = std::sqrt(ns / nz);
    return true;
}

// eta (2 v v' - J) and its inverse (2 J v v' J - J) / eta, dense
void boostMatrix(double eta, const double* v, int q, double* M, double* Mi) {
    for (int r = 0; r < q; ++r)
        for (int k = 0; k < q; ++k) {
            const double j = r == k ? (r == 0 ? 1.0 : -1.0) : 0.0;
            const double jr = r == 0 ? v[r] : -v[r], jk = k == 0 ? v[k] : -v[k];
            M[r * q + k] = eta * (2 * v[r] * v[k] - j);
            Mi[r * q + k] = (2 * jr * jk - j) / eta;
        }
}

// The scaling of the pair (s, z), both inside K, and lambda = W z. False if either is not inside.
bool ntScaling(const Cones& K, const double* s, const double* z, Scaling& W, double* lambda) {
    W.identity = false;
    W.d.assign(K.l, 0);
    W.at.assign(K.q.size(), 0);
    int size = 0;
    for (size_t c = 0; c < K.q.size(); ++c) { W.at[c] = size; size += K.q[c] * K.q[c]; }
    W.M.assign(size, 0);
    W.Mi.assign(size, 0);
    for (int i = 0; i < K.l; ++i) {
        if (!(s[i] > 0 && z[i] > 0)) return false;
        W.d[i] = std::sqrt(s[i] / z[i]);
    }
    std::vector<double> v;
    for (size_t c = 0; c < K.q.size(); ++c) {
        const int a = K.at[c], q = K.q[c];
        double eta;
        v.resize(q);
        if (!ntPair(s + a, z + a, q, &eta, v.data())) return false;
        boostMatrix(eta, v.data(), q, &W.M[W.at[c]], &W.Mi[W.at[c]]);
    }
    applyW(K, W, z, lambda, BY_W);
    for (int i = 0; i < K.l; ++i) lambda[i] = std::sqrt(s[i] * z[i]);
    return true;
}

// After a step a: the scaling for s + a ds and z + a dz, from the scaled points s~ = lambda + a W^-T ds and
// z~ = lambda + a W dz (dsS, dzS). For the orthant d grows by sqrt(s~/z~); for a cone W becomes W~ W, W~ the
// symmetric scaling of (s~, z~), and lambda becomes W~ z~. False if a point left K.
bool updateScaling(const Cones& K, Scaling& W, double* lambda, const double* dsS, const double* dzS, double a) {
    for (int i = 0; i < K.l; ++i) {
        const double st = lambda[i] + a * dsS[i], zt = lambda[i] + a * dzS[i];
        if (!(st > 0 && zt > 0)) return false;
        W.d[i] *= std::sqrt(st / zt);
        lambda[i] = std::sqrt(st * zt);
    }
    std::vector<double> st, zt, v, Wt, Wti, P;
    for (size_t c = 0; c < K.q.size(); ++c) {
        const int at = K.at[c], q = K.q[c];
        st.resize(q);
        zt.resize(q);
        v.resize(q);
        Wt.resize(q * q);
        Wti.resize(q * q);
        P.resize(q * q);
        for (int k = 0; k < q; ++k) { st[k] = lambda[at + k] + a * dsS[at + k]; zt[k] = lambda[at + k] + a * dzS[at + k]; }
        double eta;
        if (!ntPair(st.data(), zt.data(), q, &eta, v.data())) return false;
        boostMatrix(eta, v.data(), q, Wt.data(), Wti.data());
        for (int r = 0; r < q; ++r) {   // lambda = W~ z~
            double x = 0;
            for (int k = 0; k < q; ++k) x += Wt[r * q + k] * zt[k];
            lambda[at + r] = x;
        }
        double* M = &W.M[W.at[c]];
        double* Mi = &W.Mi[W.at[c]];
        for (int r = 0; r < q; ++r)   // W <- W~ W
            for (int k = 0; k < q; ++k) {
                double x = 0;
                for (int j = 0; j < q; ++j) x += Wt[r * q + j] * M[j * q + k];
                P[r * q + k] = x;
            }
        std::copy(P.begin(), P.end(), M);
        for (int r = 0; r < q; ++r)   // W^-1 <- W^-1 W~^-1
            for (int k = 0; k < q; ++k) {
                double x = 0;
                for (int j = 0; j < q; ++j) x += Mi[r * q + j] * Wti[j * q + k];
                P[r * q + k] = x;
            }
        std::copy(P.begin(), P.end(), Mi);
    }
    return true;
}

// out = x o y, the cone's Jordan product
void jprod(const Cones& K, const double* x, const double* y, double* out) {
    for (int i = 0; i < K.l; ++i) out[i] = x[i] * y[i];
    for (size_t c = 0; c < K.q.size(); ++c) {
        const int a = K.at[c], q = K.q[c];
        const double x0 = x[a], y0 = y[a];
        out[a] = dot(x + a, y + a, q);
        for (int k = 1; k < q; ++k) out[a + k] = x0 * y[a + k] + y0 * x[a + k];
    }
}

// out = x \ v: the u with x o u = v
void jsolve(const Cones& K, const double* x, const double* v, double* out) {
    for (int i = 0; i < K.l; ++i) out[i] = v[i] / x[i];
    for (size_t c = 0; c < K.q.size(); ++c) {
        const int a = K.at[c], q = K.q[c];
        const double det = jnorm2(x + a, q);
        double x1v1 = 0;
        for (int k = 1; k < q; ++k) x1v1 += x[a + k] * v[a + k];
        const double u0 = (x[a] * v[a] - x1v1) / det;
        out[a] = u0;
        for (int k = 1; k < q; ++k) out[a + k] = (v[a + k] - x[a + k] * u0) / x[a];
    }
}

// The largest a >= 0 with x + a d in K, x inside it; BIG if there is none.
double maxStep(const Cones& K, const double* x, const double* d) {
    double best = BIG;
    for (int i = 0; i < K.l; ++i)
        if (d[i] < 0) best = std::min(best, -x[i] / d[i]);
    for (size_t c = 0; c < K.q.size(); ++c) {
        const int a = K.at[c], q = K.q[c];
        // (x0 + t d0)^2 - |x1 + t d1|^2 = cq + bq t + aq t^2: its first positive root
        const double cq = jnorm2(x + a, q);
        double bq = x[a] * d[a], aq = d[a] * d[a];
        for (int k = 1; k < q; ++k) { bq -= x[a + k] * d[a + k]; aq -= d[a + k] * d[a + k]; }
        bq *= 2;
        const double disc = bq * bq - 4 * aq * cq;
        double t;
        if (aq > 0 && (bq >= 0 || disc < 0)) continue;   // never reaches the boundary
        if (bq < 0) t = 2 * cq / (-bq + std::sqrt(std::max(disc, 0.0)));
        else if (aq < 0) t = (-bq - std::sqrt(disc)) / (2 * aq);
        else continue;
        best = std::min(best, std::max(t, 0.0));
    }
    return best;
}

// How far v lies outside K: 0 inside, else the most its least eigenvalue falls below 0
double outside(const Cones& K, const double* v) {
    double worst = 0;
    for (int i = 0; i < K.l; ++i) worst = std::max(worst, -v[i]);
    for (size_t c = 0; c < K.q.size(); ++c) {
        const int a = K.at[c], q = K.q[c];
        worst = std::max(worst, norm(v + a + 1, q - 1) - v[a]);
    }
    return worst;
}

// v += t e, e the cone's identity
void addIdentity(const Cones& K, double* v, double t) {
    for (int i = 0; i < K.l; ++i) v[i] += t;
    for (size_t c = 0; c < K.q.size(); ++c) v[K.at[c]] += t;
}

// ---- the KKT system ---------------------------------------------------------------------------------------

struct Kkt {
    const Problem& P;
    const Cones& K;
    int n, p, N, bw = 0;
    std::vector<int> pos;                 // an unknown's place in the factored order
    std::vector<int> socCols;             // each second-order cone's columns, concatenated
    std::vector<int> socColAt;            // and where each cone's start, cones + 1
    std::vector<double> socBlock;         // each cone's rows of G over its columns, dense, concatenated
    std::vector<int> socBlockAt;
    std::vector<double> band, diag, off2;   // L below the diagonal; D's diagonal, and a 2 x 2 block's corner
    std::vector<double> scratch;
    std::vector<char> two;                  // 1 at a 2 x 2 block's first unknown, 2 at its second, else 0
    std::vector<char> primal;             // 1 for an x unknown (its pivot positive), 0 for a multiplier
    double reg;

    Kkt(const Problem& P_, const Cones& K_, double reg_) : P(P_), K(K_), n(P_.n), p(P_.A.rows), N(P_.n + P_.A.rows), reg(reg_) {}

    double& at(int i, int j) { return band[(size_t)i * (bw + 1) + (i - j)]; }   // i >= j, i - j <= bw

    void setup() {
        pos.assign(N, 0);
        if ((int)P.order.size() == N) for (int k = 0; k < N; ++k) pos[P.order[k]] = k;
        else for (int k = 0; k < N; ++k) pos[k] = k;
        primal.assign(N, 0);
        for (int u = 0; u < N; ++u) primal[pos[u]] = u < n;
        // each second-order cone's columns, and its rows of G over them
        socColAt.assign(1, 0);
        socBlockAt.assign(1, 0);
        for (size_t c = 0; c < K.q.size(); ++c) {
            std::vector<int> cols;
            for (int r = K.at[c]; r < K.at[c] + K.q[c]; ++r)
                for (int e = P.G.start[r]; e < P.G.start[r + 1]; ++e) cols.push_back(P.G.col[e]);
            std::sort(cols.begin(), cols.end());
            cols.erase(std::unique(cols.begin(), cols.end()), cols.end());
            const int nc = (int)cols.size(), base = (int)socBlock.size();
            socBlock.resize(base + (size_t)nc * K.q[c], 0.0);
            for (int r = 0; r < K.q[c]; ++r) {
                const int row = K.at[c] + r;
                for (int e = P.G.start[row]; e < P.G.start[row + 1]; ++e) {
                    const int j = (int)(std::lower_bound(cols.begin(), cols.end(), P.G.col[e]) - cols.begin());
                    socBlock[base + (size_t)r * nc + j] += P.G.val[e];
                }
            }
            socCols.insert(socCols.end(), cols.begin(), cols.end());
            socColAt.push_back((int)socCols.size());
            socBlockAt.push_back((int)socBlock.size());
        }
        // the band: the furthest apart two unknowns that meet in H or in A
        bw = 0;
        for (int r = 0; r < K.l; ++r)
            for (int e = P.G.start[r]; e < P.G.start[r + 1]; ++e)
                for (int f = P.G.start[r]; f < P.G.start[r + 1]; ++f) bw = std::max(bw, std::abs(pos[P.G.col[e]] - pos[P.G.col[f]]));
        for (size_t c = 0; c < K.q.size(); ++c)
            for (int a = socColAt[c]; a < socColAt[c + 1]; ++a)
                for (int b = socColAt[c]; b < socColAt[c + 1]; ++b) bw = std::max(bw, std::abs(pos[socCols[a]] - pos[socCols[b]]));
        for (int r = 0; r < p; ++r)
            for (int e = P.A.start[r]; e < P.A.start[r + 1]; ++e) bw = std::max(bw, std::abs(pos[n + r] - pos[P.A.col[e]]));
        if (N > 1) bw = std::min(N - 1, bw + 1);   // and one more: a 2 x 2 pivot's L reaches a row past the pattern's band
        band.assign((size_t)N * (bw + 1), 0.0);
        diag.assign(N, 0.0);
        off2.assign(N, 0.0);
        two.assign(N, 0);
    }

    void add(int u, int v, double x) {   // M[u][v] += x, and its mirror, by unknowns
        const int i = pos[u], j = pos[v];
        if (i >= j) at(i, j) += x;
        else at(j, i) += x;
    }

    // Form M = [G'W^-2 G + reg I, A'; A, -reg I] in the band, and factor it as L D L'.
    bool factor(const Scaling& W) {
        std::fill(band.begin(), band.end(), 0.0);
        for (int r = 0; r < K.l; ++r) {
            const double k = W.identity ? 1.0 : 1.0 / (W.d[r] * W.d[r]);
            for (int e = P.G.start[r]; e < P.G.start[r + 1]; ++e)
                for (int f = P.G.start[r]; f <= e; ++f) {
                    const double x = k * P.G.val[e] * P.G.val[f];
                    if (P.G.col[e] == P.G.col[f] && e != f) add(P.G.col[e], P.G.col[f], 2 * x);
                    else add(P.G.col[e], P.G.col[f], x);
                }
        }
        std::vector<double> B, col;
        for (size_t c = 0; c < K.q.size(); ++c) {
            const int q = K.q[c], nc = socColAt[c + 1] - socColAt[c];
            const double* blk = &socBlock[socBlockAt[c]];
            B.assign((size_t)q * nc, 0.0);   // W^-T times the block, column by column: H gains B'B
            col.assign(q, 0.0);
            std::vector<double> out(q);
            for (int j = 0; j < nc; ++j) {
                for (int r = 0; r < q; ++r) col[r] = blk[(size_t)r * nc + j];
                if (W.identity) out = col;
                else coneApply(W, (int)c, q, col.data(), out.data(), BY_WINVT);
                for (int r = 0; r < q; ++r) B[(size_t)r * nc + j] = out[r];
            }
            for (int a = 0; a < nc; ++a)
                for (int b = 0; b <= a; ++b) {
                    double x = 0;
                    for (int r = 0; r < q; ++r) x += B[(size_t)r * nc + a] * B[(size_t)r * nc + b];
                    if (x != 0) add(socCols[socColAt[c] + a], socCols[socColAt[c] + b], x);
                }
        }
        for (int r = 0; r < p; ++r)
            for (int e = P.A.start[r]; e < P.A.start[r + 1]; ++e) add(n + r, P.A.col[e], P.A.val[e]);
        for (int u = 0; u < N; ++u) {
            const int i = pos[u];
            at(i, i) += u < n ? reg : -reg;
        }
        // L D L', right-looking, in place: below the diagonal L, D in diag (and off2 for a 2 x 2 block). A pivot
        // small against its coupling to the next unknown, one an x and the other a multiplier, is taken with it
        // as a 2 x 2 block: Bunch and Kaufman's test, kept to the neighbour so that the band stays a band. Such a
        // block, [a b; b d] with a <= 0 <= d, has det <= -b^2 whatever the cones make of a and d. A trajectory's
        // order puts each state beside the dynamics row that defines it, where a 1 x 1 pivot on either would be the
        // regularization alone. (Two x's are never paired: their block is semidefinite, and can be singular.)
        const double ALPHA = 0.6404;   // (1 + sqrt(17)) / 8
        std::vector<double> l1(bw + 2), l2(bw + 2), x1(bw + 2), x2(bw + 2);
        for (int k = 0; k < N;) {
            const int last = std::min(N - 1, k + bw);
            if (k + 1 < N && primal[k] != primal[k + 1] && std::fabs(at(k, k)) < ALPHA * std::fabs(at(k + 1, k))) {
                const double a = at(k, k), b = at(k + 1, k), c = at(k + 1, k + 1), det = a * c - b * b;
                if (!std::isfinite(det) || det == 0) return false;
                for (int i = k + 2; i <= last; ++i) {
                    x1[i - k] = at(i, k);
                    x2[i - k] = at(i, k + 1);
                    l1[i - k] = (c * x1[i - k] - b * x2[i - k]) / det;
                    l2[i - k] = (a * x2[i - k] - b * x1[i - k]) / det;
                }
                for (int i = k + 2; i <= last; ++i)
                    for (int j = k + 2, w = bw + 1; j <= i; ++j) band[(size_t)i * w + (i - j)] -= l1[i - k] * x1[j - k] + l2[i - k] * x2[j - k];
                for (int i = k + 2; i <= last; ++i) {
                    at(i, k) = l1[i - k];
                    at(i, k + 1) = l2[i - k];
                }
                diag[k] = a;
                diag[k + 1] = c;
                off2[k] = b;
                at(k + 1, k) = 0;
                two[k] = 1;
                two[k + 1] = 2;
                k += 2;
                continue;
            }
            double d = at(k, k);
            if (!std::isfinite(d)) return false;
            const double least = std::fmax(reg, 1e-9);   // dynamic regularization: keep the signs quasi-definite, the pivots off nought
            if (primal[k] && d < least) d = least;
            if (!primal[k] && d > -least) d = -least;
            for (int i = k + 1; i <= last; ++i) { x1[i - k] = at(i, k); l1[i - k] = x1[i - k] / d; }
            for (int i = k + 1; i <= last; ++i)
                for (int j = k + 1, w = bw + 1; j <= i; ++j) band[(size_t)i * w + (i - j)] -= l1[i - k] * x1[j - k];
            for (int i = k + 1; i <= last; ++i) at(i, k) = l1[i - k];
            diag[k] = d;
            two[k] = 0;
            ++k;
        }
        return true;
    }

    // Solve the regularized, factored system for rhs (by unknowns), into out.
    void bandSolve(const double* rhs, double* out) {
        std::vector<double>& y = scratch;
        y.resize(N);
        for (int u = 0; u < N; ++u) y[pos[u]] = rhs[u];
        const size_t w = (size_t)bw + 1;
        for (int k = 0; k < N; ++k) {   // L y = b, column by column (L is unit lower, nought inside a 2 x 2 block)
            const double yk = y[k];
            if (yk == 0) continue;
            for (int i = k + 1, e = std::min(N - 1, k + bw); i <= e; ++i) y[i] -= band[i * w + (i - k)] * yk;
        }
        for (int k = 0; k < N; ++k) {   // D
            if (two[k] == 1) {
                const double a = diag[k], b = off2[k], c = diag[k + 1], det = a * c - b * b;
                const double u = (c * y[k] - b * y[k + 1]) / det, v = (a * y[k + 1] - b * y[k]) / det;
                y[k] = u;
                y[k + 1] = v;
                ++k;
            } else y[k] /= diag[k];
        }
        for (int k = N - 1; k >= 0; --k) {   // L'x = y
            double v = y[k];
            for (int i = k + 1, e = std::min(N - 1, k + bw); i <= e; ++i) v -= band[i * w + (i - k)] * y[i];
            y[k] = v;
        }
        for (int u = 0; u < N; ++u) out[u] = y[pos[u]];
    }

    // (W'W)^-1 v = W^-1 W^-T v, over the cone's rows
    void winv2(const Scaling& W, const double* v, double* out) {
        if (W.identity) { for (int i = 0; i < K.m; ++i) out[i] = v[i]; return; }
        std::vector<double> t(K.m);
        applyW(K, W, v, t.data(), BY_WINVT);
        applyW(K, W, t.data(), out, BY_WINV);
    }

    // The unregularized reduced matrix times u: [H ux + A'uy; A ux]
    void reducedTimes(const Scaling& W, const double* u, double* out) {
        std::vector<double> g(K.m, 0.0), wg(K.m);
        mul(P.G, u, g.data(), 1);
        winv2(W, g.data(), wg.data());
        for (int i = 0; i < N; ++i) out[i] = 0;
        mulT(P.G, wg.data(), out, 1);
        mulT(P.A, u + n, out, 1);
        mul(P.A, u, out + n, 1);
    }

    // Solve [0 A' G'; A 0 0; G 0 -W'W] (ux, uy, uz) = (fx, fy, fz); wuz, if asked for, is W uz, found as
    // W^-T (G ux - fz) and not from uz, whose parts on the active rows are large numbers times small ones.
    void solve(const Scaling& W, const double* fx, const double* fy, const double* fz, double* ux, double* uy, double* uz, int refine, double* wuz = nullptr) {
        std::vector<double> r(N), u(N), res(N), du(N), t(K.m);
        winv2(W, fz, t.data());
        for (int i = 0; i < n; ++i) r[i] = fx[i];
        mulT(P.G, t.data(), r.data(), 1);
        for (int i = 0; i < p; ++i) r[n + i] = fy[i];
        bandSolve(r.data(), u.data());
        // refined against the unregularized system while that helps; a step that makes the residual worse is
        // undone, and the refinement stops
        reducedTimes(W, u.data(), res.data());
        for (int i = 0; i < N; ++i) res[i] = r[i] - res[i];
        double resNorm = norm(res);
        const double enough = 1e-15 * norm(r);   // at roundoff: refining further only stirs the last bits
        for (int k = 0; k < refine && resNorm > enough; ++k) {
            bandSolve(res.data(), du.data());
            std::vector<double> next(u);
            for (int i = 0; i < N; ++i) next[i] += du[i];
            std::vector<double> nres(N);
            reducedTimes(W, next.data(), nres.data());
            for (int i = 0; i < N; ++i) nres[i] = r[i] - nres[i];
            const double nn = norm(nres);
            if (!(nn < resNorm)) break;
            u = next;
            res = nres;
            resNorm = nn;
        }
#ifdef SOCP_TRACE
        reducedTimes(W, u.data(), res.data());
        double e = 0, rn = 0;
        for (int i = 0; i < N; ++i) { e = std::max(e, std::fabs(r[i] - res[i])); rn = std::max(rn, std::fabs(r[i])); }
        TRACE("    kkt: residual %.2e of %.2e\n", e, rn);
#endif
        for (int i = 0; i < n; ++i) ux[i] = u[i];
        for (int i = 0; i < p; ++i) uy[i] = u[n + i];
        std::vector<double> g(K.m), wg(K.m);
        for (int i = 0; i < K.m; ++i) g[i] = -fz[i];
        mul(P.G, ux, g.data(), 1);
        if (W.identity) { for (int i = 0; i < K.m; ++i) wg[i] = g[i]; }
        else applyW(K, W, g.data(), wg.data(), BY_WINVT);
        if (wuz) for (int i = 0; i < K.m; ++i) wuz[i] = wg[i];
        if (W.identity) { for (int i = 0; i < K.m; ++i) uz[i] = wg[i]; }
        else applyW(K, W, wg.data(), uz, BY_WINV);
    }
};

}   // namespace

Result solve(const Problem& P, const Settings& S) {
    Result R;
    const int n = P.n, p = P.A.rows, m = P.G.rows;
    Cones K;
    K.l = P.l;
    K.m = m;
    K.q = P.q;
    int row = P.l;
    for (int q : P.q) { K.at.push_back(row); row += q; }
    if ((int)P.c.size() != n || (int)P.b.size() != p || (int)P.h.size() != m || row != m || P.A.cols > n || P.G.cols > n || P.l < 0) return R;
    for (int q : P.q) if (q < 2) return R;

    Kkt kkt(P, K, S.reg);
    kkt.setup();
    R.bandwidth = kkt.bw;

    std::vector<double> x(n), y(p), z(m), s(m), lambda(m);
    std::vector<double> zero(std::max(n, std::max(p, m)), 0.0), negc(n);
    for (int i = 0; i < n; ++i) negc[i] = -P.c[i];
    Scaling W;   // identity, for the start
    if (!kkt.factor(W)) return R;
    {
        std::vector<double> xs(n), ys(p), zs(m);
        kkt.solve(W, zero.data(), P.b.data(), P.h.data(), x.data(), ys.data(), zs.data(), S.refine);   // the least |s| with Gx + s = h, Ax = b
        for (int i = 0; i < m; ++i) s[i] = -zs[i];
        kkt.solve(W, negc.data(), zero.data(), zero.data(), xs.data(), y.data(), z.data(), S.refine);   // the least |z| with A'y + G'z + c = 0
    }
    if (m > 0) {   // into the cone's interior: shifted along e past the boundary where they are on it or outside
        auto least = [&](const std::vector<double>& v) {   // minus the least eigenvalue
            double worst = -BIG;
            for (int i = 0; i < K.l; ++i) worst = std::max(worst, -v[i]);
            for (size_t c = 0; c < K.q.size(); ++c) worst = std::max(worst, norm(&v[K.at[c] + 1], K.q[c] - 1) - v[K.at[c]]);
            return worst;
        };
        const double ms = least(s), mz = least(z);
        if (ms >= -1e-8 * std::max(1.0, norm(s))) addIdentity(K, s.data(), 1 + ms);
        if (mz >= -1e-8 * std::max(1.0, norm(z))) addIdentity(K, z.data(), 1 + mz);
    }
    double tau = 1, kappa = 1;
    const double nb = std::max(1.0, norm(P.b)), nh = std::max(1.0, norm(P.h)), nc = std::max(1.0, norm(P.c));
    const int deg = K.degree();
    double ag = 1;   // the operators' scale, for the certificates' test that an iterate is a ray
    for (double v : P.A.val) ag = std::max(ag, std::fabs(v));
    for (double v : P.G.val) ag = std::max(ag, std::fabs(v));

    std::vector<double> rx(n), ry(p), rz(m), xq(n), yq(p), zq(m), xf(n), yf(p), zf(m);
    std::vector<double> dx(n), dy(p), dz(m), ds(m), dsA(m), dzA(m), t1(m), t2(m), fx(n), fy(p), fz(m), wzq(m), wzf(m), wrz(m);
    double dtau = 0, dkappa = 0;
    if (!ntScaling(K, s.data(), z.data(), W, lambda.data())) { R.status = NUMERICAL; return R; }
    Result best;              // the best iterate so far, by the worst of its residuals and its gap
    double bestMerit = BIG;

    for (int it = 0;; ++it) {
        // the embedding's residuals
        for (int i = 0; i < n; ++i) rx[i] = P.c[i] * tau;
        mulT(P.A, y.data(), rx.data(), 1);
        mulT(P.G, z.data(), rx.data(), 1);
        for (int i = 0; i < p; ++i) ry[i] = P.b[i] * tau;
        mul(P.A, x.data(), ry.data(), -1);
        for (int i = 0; i < m; ++i) rz[i] = s[i] - P.h[i] * tau;
        mul(P.G, x.data(), rz.data(), 1);
        const double cx = dot(P.c.data(), x.data(), n), by = dot(P.b.data(), y.data(), p), hz = dot(P.h.data(), z.data(), m);
        const double rt = kappa + cx + by + hz;
        const double gap = dot(s.data(), z.data(), m);
        const double mu = (gap + tau * kappa) / (deg + 1);
        R.iters = it;
        R.pcost = cx / tau;
        R.dcost = -(by + hz) / tau;
        R.gap = gap / (tau * tau);
        R.pres = std::max(norm(ry) / nb, norm(rz) / nh) / tau;
        R.dres = norm(rx) / nc / tau;
        R.relgap = R.pcost < 0 ? R.gap / -R.pcost : R.dcost > 0 ? R.gap / R.dcost : BIG;
        if (!std::isfinite(R.pres) || !std::isfinite(R.dres) || !std::isfinite(R.gap)) { R.status = NUMERICAL; break; }
        if (R.pres <= S.feastol && R.dres <= S.feastol && (R.gap <= S.abstol || R.relgap <= S.reltol)) { R.status = SOLVED; break; }
        const double merit = std::max(std::max(R.pres, R.dres), std::min(R.gap, R.relgap));
        if (merit < bestMerit) {
            bestMerit = merit;
            best = R;
            best.x.resize(n);
            best.y.resize(p);
            best.z.resize(m);
            best.s.resize(m);
            for (int i = 0; i < n; ++i) best.x[i] = x[i] / tau;
            for (int i = 0; i < p; ++i) best.y[i] = y[i] / tau;
            for (int i = 0; i < m; ++i) { best.z[i] = z[i] / tau; best.s[i] = s[i] / tau; }
        }
        // certificates of infeasibility: a dual ray (b'y + h'z < 0, A'y + G'z = 0), or a primal ray (c'x < 0, Ax = 0, Gx + s = 0)
        if (by + hz < 0) {
            std::vector<double> ray(n, 0.0);
            mulT(P.A, y.data(), ray.data(), 1);
            mulT(P.G, z.data(), ray.data(), 1);
            const double yz = std::sqrt(dot(y.data(), y.data(), p) + dot(z.data(), z.data(), m));   // a ray: A'y + G'z small against (y, z) itself
            if (norm(ray) / nc / -(by + hz) <= S.feastol && norm(ray) <= S.feastol * ag * yz) { R.status = PRIMAL_INFEASIBLE; break; }
        }
        if (cx < 0) {
            std::vector<double> ax(p, 0.0), gx(s);
            mul(P.A, x.data(), ax.data(), 1);
            mul(P.G, x.data(), gx.data(), 1);
            const double xs = std::sqrt(dot(x.data(), x.data(), n) + dot(s.data(), s.data(), m));   // a ray: Ax, Gx + s small against (x, s) itself
            if (std::max(norm(ax) / nb, norm(gx) / nh) / -cx <= S.feastol && std::max(norm(ax), norm(gx)) <= S.feastol * ag * xs) { R.status = DUAL_INFEASIBLE; break; }
        }
        if (it >= S.maxIter) { R.status = MAX_ITER; break; }

        if (!kkt.factor(W)) { R.status = NUMERICAL; break; }
        // tau's direction: K (xq, yq, zq) = (c, -b, -h)
        {
            std::vector<double> nbv(p), nhv(m);
            for (int i = 0; i < p; ++i) nbv[i] = -P.b[i];
            for (int i = 0; i < m; ++i) nhv[i] = -P.h[i];
            kkt.solve(W, P.c.data(), nbv.data(), nhv.data(), xq.data(), yq.data(), zq.data(), S.refine, wzq.data());
        }
        // c'xq + b'yq + h'zq is |W zq|^2 by the system's own rows (c'xq = (A'yq + G'zq)'xq = -b'yq + zq'(W'W zq - h)):
        // computed that way it keeps its sign and its digits, where the sum of the three cancels
        const double den = dot(wzq.data(), wzq.data(), m) + kappa / tau;
        if (!(den > 0)) { R.status = NUMERICAL; break; }
        applyW(K, W, rz.data(), wrz.data(), BY_WINVT);   // W^-T rz

        // One Newton direction: eta the share of the residuals it removes, dsv the complementarity's right side
        // (lambda o (W dz + W^-T ds) = dsv), dk the scalar pair's (kappa dtau + tau dkappa = dk). It leaves the
        // scaled steps too, dzA = W dz and dsA = W^-T ds, which the step length and the next scaling use. The
        // numerator of dtau, c'xf + b'yf + h'zf less its right side, is taken by the same rows as the
        // denominator, -xq'fx + yq'fy + (W zq)'(W^-T fz) + 2 (W zq)'(W zf), in scaled terms that do not cancel.
        auto direction = [&](double eta, const double* dsv, double dk) {
            jsolve(K, lambda.data(), dsv, t1.data());                    // t1 = lambda \ dsv
            applyW(K, W, t1.data(), t2.data(), BY_WT);                   // W't1
            for (int i = 0; i < n; ++i) fx[i] = -eta * rx[i];
            for (int i = 0; i < p; ++i) fy[i] = eta * ry[i];
            for (int i = 0; i < m; ++i) fz[i] = -eta * rz[i] - t2[i];
            const double ft = -eta * rt - dk / tau;
            kkt.solve(W, fx.data(), fy.data(), fz.data(), xf.data(), yf.data(), zf.data(), S.refine, wzf.data());
            double num = -dot(xq.data(), fx.data(), n) + dot(yq.data(), fy.data(), p) - ft;
            for (int i = 0; i < m; ++i) num += wzq[i] * (-eta * wrz[i] - t1[i]) + 2 * wzq[i] * wzf[i];
            dtau = num / den;
            for (int i = 0; i < n; ++i) dx[i] = xf[i] - dtau * xq[i];
            for (int i = 0; i < p; ++i) dy[i] = yf[i] - dtau * yq[i];
            for (int i = 0; i < m; ++i) dzA[i] = wzf[i] - dtau * wzq[i];   // W dz
            applyW(K, W, dzA.data(), dz.data(), BY_WINV);
            for (int i = 0; i < m; ++i) dsA[i] = t1[i] - dzA[i];          // W^-T ds
            applyW(K, W, dsA.data(), ds.data(), BY_WT);                  // ds = W'(t1 - W dz)
            dkappa = (dk - kappa * dtau) / tau;
        };
        auto stepTo = [&]() {   // in the scaled space, where s + a ds is in K exactly when lambda + a W^-T ds is
            double a = std::min(maxStep(K, lambda.data(), dsA.data()), maxStep(K, lambda.data(), dzA.data()));
            if (dtau < 0) a = std::min(a, -tau / dtau);
            if (dkappa < 0) a = std::min(a, -kappa / dkappa);
            return a;
        };

        // the affine step: no centring
        std::vector<double> dsv(m);
        jprod(K, lambda.data(), lambda.data(), dsv.data());
        for (int i = 0; i < m; ++i) dsv[i] = -dsv[i];
        direction(1.0, dsv.data(), -tau * kappa);
        const double aAff = std::min(1.0, stepTo());
        const double sigma = std::min(1.0, std::max(0.0, std::pow(1 - aAff, 3)));
        // the combined step: centred, with Mehrotra's correction
        std::vector<double> corr(m);
        jprod(K, dsA.data(), dzA.data(), corr.data());
        const double corrTK = dtau * dkappa;
        jprod(K, lambda.data(), lambda.data(), dsv.data());
        for (int i = 0; i < m; ++i) dsv[i] = -dsv[i] - corr[i];
        addIdentity(K, dsv.data(), sigma * mu);
        direction(1.0 - sigma, dsv.data(), -tau * kappa + sigma * mu - corrTK);
        const double a = std::min(1.0, 0.99 * stepTo());
        TRACE("it %d: pres %.2e dres %.2e gap %.2e mu %.2e tau %.3e kappa %.2e affine %.3f sigma %.2e step %.3f\n", it, R.pres, R.dres, R.gap, mu,
              tau, kappa, aAff, sigma, a);
        for (int i = 0; i < n; ++i) x[i] += a * dx[i];
        for (int i = 0; i < p; ++i) y[i] += a * dy[i];
        for (int i = 0; i < m; ++i) { z[i] += a * dz[i]; s[i] += a * ds[i]; }
        tau += a * dtau;
        kappa += a * dkappa;
        if (!(tau > 0) || !std::isfinite(tau)) { R.status = NUMERICAL; break; }
        if (!updateScaling(K, W, lambda.data(), dsA.data(), dzA.data(), a)) { R.status = NUMERICAL; break; }
        if (a < 1e-6) { R.status = NUMERICAL; break; }   // stalled: the directions are no longer worth taking
    }
    if (R.status == NUMERICAL || R.status == MAX_ITER) {   // the best iterate met, never the last if it went astray
        const int iters = R.iters, status = bestMerit <= S.inaccurate ? INACCURATE : R.status;
        if (bestMerit < BIG) R = best;
        else { R.x.assign(n, 0.0); R.y.assign(p, 0.0); R.z.assign(m, 0.0); R.s.assign(m, 0.0); }
        R.iters = iters;
        R.bandwidth = kkt.bw;
        R.status = status;
        return R;
    }
    R.x.resize(n);
    R.y.resize(p);
    R.z.resize(m);
    R.s.resize(m);
    const double k = R.status == PRIMAL_INFEASIBLE || R.status == DUAL_INFEASIBLE ? 1.0 : 1.0 / tau;
    for (int i = 0; i < n; ++i) R.x[i] = x[i] * k;
    for (int i = 0; i < p; ++i) R.y[i] = y[i] * k;
    for (int i = 0; i < m; ++i) { R.z[i] = z[i] * k; R.s[i] = s[i] * k; }
    return R;
}

Check check(const Problem& P, const Result& R) {
    Check c{};
    const int n = P.n, p = P.A.rows, m = P.G.rows;
    Cones K;
    K.l = P.l;
    K.m = m;
    K.q = P.q;
    int row = P.l;
    for (int q : P.q) { K.at.push_back(row); row += q; }
    std::vector<double> ry(P.b), rz(m), rx(P.c);
    mul(P.A, R.x.data(), ry.data(), -1);
    for (int i = 0; i < m; ++i) rz[i] = R.s[i] - P.h[i];
    mul(P.G, R.x.data(), rz.data(), 1);
    mulT(P.A, R.y.data(), rx.data(), 1);
    mulT(P.G, R.z.data(), rx.data(), 1);
    c.primal = std::max(norm(ry) / std::max(1.0, norm(P.b)), norm(rz) / std::max(1.0, norm(P.h)));
    c.dual = norm(rx) / std::max(1.0, norm(P.c));
    c.gap = std::fabs(dot(R.s.data(), R.z.data(), m));
    c.coneS = outside(K, R.s.data());
    c.coneZ = outside(K, R.z.data());
    (void)n;
    (void)p;
    return c;
}

}   // namespace socp
}   // namespace oc
