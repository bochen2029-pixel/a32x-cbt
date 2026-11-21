// socp.h — a primal-dual interior-point solver for second-order cone programs, written for this core from
// the method's published description (docs/provenance.md, 2c): the homogeneous self-dual embedding, Nesterov
// and Todd's scaling, and Mehrotra's predictor and corrector, as Vandenberghe sets them out for CVXOPT's
// conelp. No solver's code is in it. It solves
//
//     minimize c'x   subject to   A x = b,   G x + s = h,   s in K
//
// where K is the nonnegative orthant (the first l rows of G) times second-order cones {(s0, s1): s0 >= |s1|}
// of the dimensions in q, in order. It also returns the dual: y for the equalities, z in K for the cones,
// with A'y + G'z + c = 0 at a solution, and the gap s'z. The linear algebra is a banded LDL' of the reduced
// KKT system, quasi-definite by a small regularization and polished by iterative refinement; a problem made
// of stages, as a trajectory is, gives the order of its unknowns that keeps the band narrow. Deterministic:
// the same problem gives the same iterates, bit for bit. GPLv3.
#pragma once

#include <vector>

namespace oc {
namespace socp {

// A sparse matrix by rows (compressed sparse rows).
struct Sparse {
    int rows = 0, cols = 0;
    std::vector<int> start{0};   // rows + 1 offsets into col and val
    std::vector<int> col;
    std::vector<double> val;
    void add(int j, double v) { if (v != 0) { col.push_back(j); val.push_back(v); } }   // to the row being built
    void endRow() { start.push_back((int)col.size()); ++rows; }
};

struct Problem {
    int n = 0;                     // variables
    std::vector<double> c;         // n
    Sparse A;                      // equalities, A.rows of them
    std::vector<double> b;
    Sparse G;                      // cone rows: the first l the orthant, then the second-order cones of q
    std::vector<double> h;
    int l = 0;
    std::vector<int> q;
    // The order in which the KKT system's unknowns are eliminated: order[k] is the unknown placed k-th, an
    // index of x (0..n-1) or of an equality's multiplier (n + row). Empty: x, then the multipliers.
    std::vector<int> order;
};

// Near a solution the scaling's condition grows as 1/mu^2 and the reduced system's right side as 1/mu, so a
// double carries the iterates to a relative 1e-8 or so and no further; the tolerances stop there, as other
// interior-point codes' do (CVXOPT's defaults are 1e-7 and 1e-6, ECOS's 1e-8).
struct Settings {
    int maxIter = 80;
    double feastol = 1e-7;   // relative primal and dual residuals
    double abstol = 1e-7;    // the gap s'z
    double reltol = 1e-7;    // the gap relative to the cost
    double inaccurate = 1e-5;   // if the iterates stall: the best one is kept as INACCURATE inside this of each
    double reg = 1e-11;      // the static regularization of the KKT system
    int refine = 3;          // steps of iterative refinement per solve
};

// SOLVED: inside the tolerances. INACCURATE: the iterates stopped improving (the step fell to nothing, or the
// iterations ran out) with the best of them inside Settings::inaccurate, which is what is returned.
enum { SOLVED = 0, PRIMAL_INFEASIBLE = 1, DUAL_INFEASIBLE = 2, MAX_ITER = 3, NUMERICAL = 4, INACCURATE = 5 };

struct Result {
    int status = NUMERICAL;
    int iters = 0;
    double pcost = 0, dcost = 0;   // c'x and -(b'y + h'z)
    double gap = 0, relgap = 0;    // s'z, and over the cost's size
    double pres = 0, dres = 0;     // max(|Ax - b|/max(1,|b|), |Gx + s - h|/max(1,|h|)), |A'y + G'z + c|/max(1,|c|)
    int bandwidth = 0;             // of the KKT system as ordered
    std::vector<double> x, y, z, s;
};

Result solve(const Problem& P, const Settings& S = Settings());

// The KKT residuals of a claimed solution, computed afresh from the problem: for a test to hold a result to.
struct Check { double primal, dual, gap, coneS, coneZ; };   // coneS, coneZ: how far s and z lie outside K (0 inside)
Check check(const Problem& P, const Result& R);

}   // namespace socp
}   // namespace oc
