// The fitter: CMA-ES over our A320's coefficients, scored by airframe_score on the fit rows of
// flight/targets/a320.csv and on nothing else. GPLv3.
//
//   airframe_fit                  fit and report; the aircraft file is left alone
//   airframe_fit --write          and write the fitted coefficients into it
//   airframe_fit --selftest       the optimiser alone, on functions whose minima are known
//
// Parameter identification, not controller learning: the controller stays the A32NX computers. A
// candidate is a full set of coefficients, handed to `airframe_score --airframe a320 --coefficients FILE
// --fit-rows`, a process of its own, as many at once as the population (sixteen, the desktop's
// threads). What CMA-ES minimises is the scorer's cost (0 at a fit row's centre, 1 at its edge) plus a
// prior that holds each coefficient near its seed (jsbsim/aircraft/A320-fit/seeds.csv): 0.02 times the
// square of the move, in widths of the prior.
//
// The held-out rows are never measured here. A coefficient no fit row responds to is found first, by
// moving each one by its prior's width, and is held at its seed: the optimiser could only wander it.
//
// Reproducible on one compiler, to the last digit: the random numbers are drawn from a fixed seed by
// code of our own, not the standard library's distributions, whose output differs between compilers.
// Across compilers JSBSim's own arithmetic differs in the last bits, and so the path the search takes:
// GCC 13.3 ends at the same fit rows by another route.

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <functional>
#include <map>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#define popen _popen
#define pclose _pclose
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#endif

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kPriorWeight = 0.02;  // the cost of moving a coefficient one prior width
constexpr uint64_t kRandomSeed = 20261101;

// --- random numbers, the same on every compiler ----------------------------------------------------
class Random {
 public:
  explicit Random(uint64_t seed) : s_(seed) {}
  // splitmix64
  uint64_t next() {
    uint64_t z = (s_ += 0x9e3779b97f4a7c15ull);
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ull;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebull;
    return z ^ (z >> 31);
  }
  double uniform() { return ((next() >> 11) + 0.5) * (1.0 / 9007199254740992.0); }  // (0, 1)
  double normal() {  // Box-Muller, one of the pair
    return std::sqrt(-2 * std::log(uniform())) * std::cos(2 * kPi * uniform());
  }

 private:
  uint64_t s_;
};

using Vector = std::vector<double>;
using Matrix = std::vector<Vector>;

// Eigenvalues and eigenvectors of a symmetric matrix, by cyclic Jacobi rotations: C = B diag(d) B^T.
void eigen(const Matrix& c, Vector& d, Matrix& b) {
  const size_t n = c.size();
  Matrix a = c;
  b.assign(n, Vector(n, 0));
  for (size_t i = 0; i < n; ++i) b[i][i] = 1;
  for (int sweep = 0; sweep < 100; ++sweep) {
    double off = 0;
    for (size_t p = 0; p < n; ++p) {
      for (size_t q = p + 1; q < n; ++q) off += a[p][q] * a[p][q];
    }
    if (off < 1e-30) break;
    for (size_t p = 0; p < n; ++p) {
      for (size_t q = p + 1; q < n; ++q) {
        if (std::abs(a[p][q]) < 1e-300) continue;
        const double theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const double t = (theta >= 0 ? 1 : -1) / (std::abs(theta) + std::sqrt(theta * theta + 1));
        const double cs = 1 / std::sqrt(t * t + 1), sn = t * cs;
        for (size_t k = 0; k < n; ++k) {
          const double akp = a[k][p], akq = a[k][q];
          a[k][p] = cs * akp - sn * akq;
          a[k][q] = sn * akp + cs * akq;
        }
        for (size_t k = 0; k < n; ++k) {
          const double apk = a[p][k], aqk = a[q][k];
          a[p][k] = cs * apk - sn * aqk;
          a[q][k] = sn * apk + cs * aqk;
        }
        for (size_t k = 0; k < n; ++k) {
          const double bkp = b[k][p], bkq = b[k][q];
          b[k][p] = cs * bkp - sn * bkq;
          b[k][q] = sn * bkp + cs * bkq;
        }
      }
    }
  }
  d.resize(n);
  for (size_t i = 0; i < n; ++i) d[i] = a[i][i];
}

// --- CMA-ES, (mu/mu_w, lambda), as Hansen's tutorial (arXiv:1604.00772) sets it ---------------------
class Cmaes {
 public:
  Cmaes(const Vector& mean, double sigma, int lambda, uint64_t seed)
      : n_(mean.size()), lambda_(lambda), mu_(lambda / 2), mean_(mean), sigma_(sigma), random_(seed) {
    for (int i = 0; i < mu_; ++i) w_.push_back(std::log(mu_ + 0.5) - std::log(i + 1.0));
    double sum = 0, sum2 = 0;
    for (double w : w_) sum += w;
    for (double& w : w_) {
      w /= sum;
      sum2 += w * w;
    }
    const double n = static_cast<double>(n_);
    muEff_ = 1 / sum2;
    cs_ = (muEff_ + 2) / (n + muEff_ + 5);
    ds_ = 1 + 2 * std::max(0.0, std::sqrt((muEff_ - 1) / (n + 1)) - 1) + cs_;
    cc_ = (4 + muEff_ / n) / (n + 4 + 2 * muEff_ / n);
    c1_ = 2 / ((n + 1.3) * (n + 1.3) + muEff_);
    cmu_ = std::min(1 - c1_, 2 * (muEff_ - 2 + 1 / muEff_) / ((n + 2) * (n + 2) + muEff_));
    chiN_ = std::sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
    ps_.assign(n_, 0);
    pc_.assign(n_, 0);
    c_.assign(n_, Vector(n_, 0));
    b_.assign(n_, Vector(n_, 0));
    d_.assign(n_, 1);
    for (size_t i = 0; i < n_; ++i) c_[i][i] = b_[i][i] = 1;
  }

  // A population: mean + sigma B D z, z standard normal.
  const Matrix& ask() {
    x_.assign(lambda_, Vector(n_));
    y_.assign(lambda_, Vector(n_));
    for (int k = 0; k < lambda_; ++k) {
      Vector z(n_);
      for (double& v : z) v = random_.normal();
      for (size_t i = 0; i < n_; ++i) {
        double s = 0;
        for (size_t j = 0; j < n_; ++j) s += b_[i][j] * d_[j] * z[j];
        y_[k][i] = s;
        x_[k][i] = mean_[i] + sigma_ * s;
      }
    }
    return x_;
  }

  void tell(const Vector& f) {
    ++generation_;
    std::vector<int> order(lambda_);
    for (int k = 0; k < lambda_; ++k) order[k] = k;
    std::stable_sort(order.begin(), order.end(), [&f](int a, int b) { return f[a] < f[b]; });
    if (f[order[0]] < bestF_) {
      bestF_ = f[order[0]];
      best_ = x_[order[0]];
    }
    Vector yw(n_, 0);
    for (int i = 0; i < mu_; ++i) {
      for (size_t j = 0; j < n_; ++j) yw[j] += w_[i] * y_[order[i]][j];
    }
    for (size_t j = 0; j < n_; ++j) mean_[j] += sigma_ * yw[j];

    // C^(-1/2) yw = B D^-1 B^T yw
    Vector t(n_, 0), invsqrt(n_, 0);
    for (size_t i = 0; i < n_; ++i) {
      for (size_t j = 0; j < n_; ++j) t[i] += b_[j][i] * yw[j];
      t[i] /= d_[i];
    }
    for (size_t i = 0; i < n_; ++i) {
      for (size_t j = 0; j < n_; ++j) invsqrt[i] += b_[i][j] * t[j];
    }
    double psNorm = 0;
    for (size_t i = 0; i < n_; ++i) {
      ps_[i] = (1 - cs_) * ps_[i] + std::sqrt(cs_ * (2 - cs_) * muEff_) * invsqrt[i];
      psNorm += ps_[i] * ps_[i];
    }
    psNorm = std::sqrt(psNorm);
    const double hs = psNorm / std::sqrt(1 - std::pow(1 - cs_, 2.0 * generation_)) <
                              (1.4 + 2.0 / (static_cast<double>(n_) + 1)) * chiN_
                          ? 1.0
                          : 0.0;
    for (size_t i = 0; i < n_; ++i) pc_[i] = (1 - cc_) * pc_[i] + hs * std::sqrt(cc_ * (2 - cc_) * muEff_) * yw[i];
    const double old = 1 - c1_ - cmu_ + (1 - hs) * c1_ * cc_ * (2 - cc_);
    for (size_t i = 0; i < n_; ++i) {
      for (size_t j = 0; j <= i; ++j) {
        double rankMu = 0;
        for (int k = 0; k < mu_; ++k) rankMu += w_[k] * y_[order[k]][i] * y_[order[k]][j];
        c_[i][j] = c_[j][i] = old * c_[i][j] + c1_ * pc_[i] * pc_[j] + cmu_ * rankMu;
      }
    }
    sigma_ *= std::exp((cs_ / ds_) * (psNorm / chiN_ - 1));
    eigen(c_, d_, b_);
    for (double& v : d_) v = std::sqrt(std::max(v, 1e-30));
  }

  double sigma() const { return sigma_; }
  double spread() const { return sigma_ * *std::max_element(d_.begin(), d_.end()); }
  const Vector& best() const { return best_; }
  double bestF() const { return bestF_; }
  const Vector& mean() const { return mean_; }
  int generation() const { return generation_; }

 private:
  size_t n_;
  int lambda_, mu_;
  Vector w_, mean_, ps_, pc_, d_, best_;
  Matrix c_, b_, x_, y_;
  double sigma_, muEff_ = 0, cs_ = 0, ds_ = 0, cc_ = 0, c1_ = 0, cmu_ = 0, chiN_ = 0;
  double bestF_ = 1e300;
  int generation_ = 0;
  Random random_;
};

// --- the self-test: CMA-ES on functions with known minima -------------------------------------------
int selftest() {
  struct Case {
    const char* name;
    size_t n;
    std::function<double(const Vector&)> f;
    double start, tolerance;
  };
  const Case cases[] = {
      {"sphere, 10 dimensions", 10,
       [](const Vector& x) {
         double s = 0;
         for (double v : x) s += v * v;
         return s;
       },
       3.0, 1e-10},
      {"ellipsoid, 12 dimensions, axes 1 to 1000, rotated", 12,
       [](const Vector& x) {
         // rotate by a fixed orthogonal matrix built from Givens rotations, then scale
         Vector y = x;
         for (size_t i = 0; i + 1 < y.size(); ++i) {
           const double a = 0.7 + 0.1 * static_cast<double>(i);
           const double u = std::cos(a) * y[i] - std::sin(a) * y[i + 1], v = std::sin(a) * y[i] + std::cos(a) * y[i + 1];
           y[i] = u;
           y[i + 1] = v;
         }
         double s = 0;
         for (size_t i = 0; i < y.size(); ++i) s += std::pow(1e6, static_cast<double>(i) / (y.size() - 1)) * y[i] * y[i];
         return s;
       },
       1.0, 1e-10},
      {"Rosenbrock, 8 dimensions", 8,
       [](const Vector& x) {
         double s = 0;
         for (size_t i = 0; i + 1 < x.size(); ++i) {
           s += 100 * std::pow(x[i + 1] - x[i] * x[i], 2) + std::pow(1 - x[i], 2);
         }
         return s;
       },
       0.0, 1e-8},
  };
  int failed = 0;
  for (const Case& c : cases) {
    Cmaes es(Vector(c.n, c.start), 0.5, 16, kRandomSeed);
    int evaluations = 0;
    while (es.generation() < 3000 && es.bestF() > c.tolerance * 0.01) {
      const Matrix& xs = es.ask();
      Vector f;
      for (const Vector& x : xs) f.push_back(c.f(x));
      evaluations += static_cast<int>(xs.size());
      es.tell(f);
    }
    const bool ok = es.bestF() < c.tolerance;
    std::printf("  %s  %s - minimum %.3g after %d evaluations\n", ok ? "pass" : "FAIL", c.name, es.bestF(), evaluations);
    failed += !ok;
  }
  std::printf("%s\n", failed ? "FAILED" : "PASSED");
  return failed ? 1 : 0;
}

// --- the coefficients and their seeds ----------------------------------------------------------------
struct Coefficient {
  std::string name, source, note;
  double seed = 0, sigma = 0, lo = 0, hi = 0;
};

std::vector<std::string> splitCsv(const std::string& line) {
  std::vector<std::string> out(1);
  for (char ch : line) {
    if (ch == ',') {
      out.emplace_back();
    } else if (ch != '\r') {
      out.back() += ch;
    }
  }
  return out;
}

std::vector<Coefficient> readSeeds(const std::string& path) {
  std::ifstream in(path);
  if (!in) {
    std::fprintf(stderr, "cannot read %s\n", path.c_str());
    std::exit(2);
  }
  std::vector<Coefficient> out;
  std::string line;
  bool header = true;
  while (std::getline(in, line)) {
    if (line.empty() || line[0] == '#' || line == "\r") continue;
    if (header) {
      header = false;
      continue;
    }
    const auto c = splitCsv(line);
    if (c.size() < 7) {
      std::fprintf(stderr, "%s: a row with %zu cells: %s\n", path.c_str(), c.size(), line.c_str());
      std::exit(2);
    }
    Coefficient k{c[0], c[5], c[6], std::atof(c[1].c_str()), std::atof(c[2].c_str()), std::atof(c[3].c_str()),
                  std::atof(c[4].c_str())};
    if (!(k.sigma > 0) || !(k.lo <= k.seed && k.seed <= k.hi)) {
      std::fprintf(stderr, "%s: %s has its seed outside its limits or no width\n", path.c_str(), k.name.c_str());
      std::exit(2);
    }
    out.push_back(k);
  }
  return out;
}

// --- one candidate scored by airframe_score, in a process of its own ---------------------------------
struct Score {
  bool ok = false;
  double cost = 0;
  int inside = 0, rows = 0;
  std::map<std::string, double> values;  // the fit rows, by id
};

std::string quoted(const std::string& s) {
  return "\"" + s + "\"";
}

Score scoreOne(const std::string& scorer, const std::string& file) {
  std::string command = quoted(scorer) + " --airframe a320 --coefficients " + quoted(file) + " --fit-rows";
#ifdef _WIN32
  command = "\"" + command + "\"";  // cmd.exe drops the outer pair of quotes
#endif
  Score s;
  FILE* p = popen(command.c_str(), "r");
  if (!p) return s;
  char line[1024];
  bool sawCost = false;
  while (std::fgets(line, sizeof line, p)) {
    char id[256];
    double v = 0;
    int a = 0, b = 0;
    if (std::sscanf(line, "value %255s %lf", id, &v) == 2) {
      s.values[id] = v;
    } else if (std::sscanf(line, "fit rows: inside %d of %d", &a, &b) == 2) {
      s.inside = a;
      s.rows = b;
    } else if (std::sscanf(line, "cost %lf", &v) == 1) {
      s.cost = v;
      sawCost = true;
    }
  }
  s.ok = pclose(p) == 0 && sawCost;
  return s;
}

// All candidates at once, each in its own process: the population is sized to the machine's threads.
std::vector<Score> scoreAll(const std::string& scorer, const std::filesystem::path& work,
                            const std::vector<Coefficient>& coefficients, const Matrix& candidates) {
  std::vector<Score> scores(candidates.size());
  std::vector<std::thread> threads;
  for (size_t k = 0; k < candidates.size(); ++k) {
    const std::string file = (work / ("candidate-" + std::to_string(k) + ".txt")).string();
    {
      std::ofstream out(file);
      for (size_t i = 0; i < coefficients.size(); ++i) {
        char buf[64];
        std::snprintf(buf, sizeof buf, "%.17g", candidates[k][i]);
        out << coefficients[i].name << " " << buf << "\n";
      }
    }
    threads.emplace_back([&, k, file] { scores[k] = scoreOne(scorer, file); });
  }
  for (auto& t : threads) t.join();
  return scores;
}

// --- the machine's load, beside every time this reports ---------------------------------------------
// Total CPU busy over an interval, all processes, ours included.
class Load {
 public:
  Load() { sample(idle0_, total0_); }
  double busy() const {
    uint64_t idle = 0, total = 0;
    sample(idle, total);
    return total > total0_ ? 1.0 - static_cast<double>(idle - idle0_) / static_cast<double>(total - total0_) : 0.0;
  }

 private:
  static void sample(uint64_t& idle, uint64_t& total) {
#ifdef _WIN32
    FILETIME i, k, u;
    GetSystemTimes(&i, &k, &u);
    auto v = [](const FILETIME& f) { return (static_cast<uint64_t>(f.dwHighDateTime) << 32) | f.dwLowDateTime; };
    idle = v(i);
    total = v(k) + v(u);  // kernel time includes idle
#else
    std::ifstream in("/proc/stat");
    std::string cpu;
    uint64_t f[8] = {};
    in >> cpu >> f[0] >> f[1] >> f[2] >> f[3] >> f[4] >> f[5] >> f[6] >> f[7];
    idle = f[3] + f[4];
    total = 0;
    for (uint64_t x : f) total += x;
#endif
  }
  uint64_t idle0_ = 0, total0_ = 0;
};

// --- writing the fitted coefficients into the aircraft file -----------------------------------------
// Only the value of each <property value="..." persistent="true">name</property>, and only where it is
// not already that number; every other byte stays.
bool writeCoefficients(const std::string& path, const std::vector<Coefficient>& coefficients, const Vector& values) {
  std::ifstream in(path, std::ios::binary);
  std::stringstream buffer;
  buffer << in.rdbuf();
  std::string text = buffer.str();
  for (size_t i = 0; i < coefficients.size(); ++i) {
    const std::string tail = "\" persistent=\"true\">" + coefficients[i].name + "</property>";
    const size_t end = text.find(tail);
    if (end == std::string::npos) {
      std::fprintf(stderr, "%s declares no %s\n", path.c_str(), coefficients[i].name.c_str());
      return false;
    }
    const size_t start = text.rfind("value=\"", end) + 7;
    const double now = std::atof(text.substr(start, end - start).c_str());
    if (std::abs(now - values[i]) <= 1e-12 * std::max(1.0, std::abs(values[i]))) continue;
    char buf[64];
    std::snprintf(buf, sizeof buf, "%.8g", values[i]);
    text.replace(start, end - start, buf);
  }
  std::ofstream out(path, std::ios::binary);
  out << text;
  return static_cast<bool>(out);
}

std::string sibling(const char* argv0, const char* name) {
  std::filesystem::path p(argv0);
  const std::string ext = p.extension().string();
  return (p.parent_path() / (std::string(name) + ext)).string();
}

}  // namespace

int main(int argc, char** argv) {
  int generations = 200, lambda = 16;
  bool write = false;
  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    if (a == "--selftest") {
      return selftest();
    } else if (a == "--write") {
      write = true;
    } else if (a == "--generations" && i + 1 < argc) {
      generations = std::atoi(argv[++i]);
    } else if (a == "--population" && i + 1 < argc) {
      lambda = std::atoi(argv[++i]);
    } else {
      std::printf("airframe_fit [--generations N] [--population N] [--write] | --selftest\n");
      return 2;
    }
  }

  const std::string aircraft = std::string(FLIGHT_JSBSIM_DIR) + "/aircraft/A320-fit/A320-fit.xml";
  const std::vector<Coefficient> coefficients = readSeeds(std::string(FLIGHT_JSBSIM_DIR) + "/aircraft/A320-fit/seeds.csv");
  const std::string scorer = sibling(argv[0], "airframe_score");
  const std::filesystem::path work = std::filesystem::path(argv[0]).parent_path() / "fit";
  std::filesystem::create_directories(work);
  const auto started = std::chrono::steady_clock::now();
  const Load load;
  auto elapsed = [&] { return std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count(); };

  Vector seed;
  for (const Coefficient& c : coefficients) seed.push_back(c.seed);

  // 1. Which coefficients the fit rows answer to: each moved by its prior's width, toward the middle of
  //    its limits, against the seed.
  Matrix probes{seed};
  for (size_t i = 0; i < coefficients.size(); ++i) {
    Vector p = seed;
    const Coefficient& c = coefficients[i];
    p[i] = c.seed + c.sigma <= c.hi ? c.seed + c.sigma : c.seed - c.sigma;
    probes.push_back(p);
  }
  std::vector<Score> screened;
  for (size_t k = 0; k < probes.size(); k += lambda) {
    const Matrix batch(probes.begin() + k, probes.begin() + std::min(probes.size(), k + lambda));
    for (const Score& s : scoreAll(scorer, work, coefficients, batch)) screened.push_back(s);
  }
  const Score& atSeed = screened[0];
  if (!atSeed.ok) {
    std::fprintf(stderr, "airframe_score failed on the seeds\n");
    return 2;
  }
  std::vector<size_t> free;
  for (size_t i = 0; i < coefficients.size(); ++i) {
    const Score& s = screened[i + 1];
    bool moves = !s.ok;
    for (const auto& [id, v] : atSeed.values) {
      const auto it = s.values.find(id);
      if (it == s.values.end() || std::abs(it->second - v) > 1e-9 * std::max(1.0, std::abs(v))) moves = true;
    }
    if (moves) free.push_back(i);
  }
  std::printf("A32X CBT A320 fit: %zu coefficients, %zu of them answered to by the fit rows (%d rows); the rest held at their seeds\n",
              coefficients.size(), free.size(), atSeed.rows);
  std::printf("at the seeds: cost %.4f, fit rows inside %d of %d\n", atSeed.cost, atSeed.inside, atSeed.rows);
  for (size_t i : free) std::printf("  free  %s\n", coefficients[i].name.c_str());

  // 2. CMA-ES over the free ones, in prior widths from the seed.
  auto expand = [&](const Vector& x, double& outside) {
    Vector p = seed;
    outside = 0;
    for (size_t j = 0; j < free.size(); ++j) {
      const Coefficient& c = coefficients[free[j]];
      const double raw = c.seed + c.sigma * x[j];
      const double held = std::max(c.lo, std::min(c.hi, raw));
      outside += std::pow((raw - held) / c.sigma, 2);
      p[free[j]] = held;
    }
    return p;
  };
  auto prior = [](const Vector& x) {
    double s = 0;
    for (double v : x) s += v * v;
    return kPriorWeight * s;
  };

  FILE* log = std::fopen((work / "fit-log.csv").string().c_str(), "w");
  if (log) std::fprintf(log, "generation,evaluations,best_objective,best_cost,inside,sigma,spread,seconds\n");
  Cmaes es(Vector(free.size(), 0.0), 0.5, lambda, kRandomSeed);
  Score best = atSeed;
  double bestObjective = atSeed.cost;
  Vector bestP = seed;
  int evaluations = static_cast<int>(probes.size()), stale = 0;
  while (es.generation() < generations) {
    const Matrix& xs = es.ask();
    Matrix candidates;
    Vector outside(xs.size());
    for (size_t k = 0; k < xs.size(); ++k) candidates.push_back(expand(xs[k], outside[k]));
    const std::vector<Score> scores = scoreAll(scorer, work, coefficients, candidates);
    evaluations += static_cast<int>(xs.size());
    Vector f(xs.size());
    for (size_t k = 0; k < xs.size(); ++k) {
      f[k] = (scores[k].ok ? scores[k].cost : 1e6) + prior(xs[k]) + 10 * outside[k];
      if (scores[k].ok && f[k] < bestObjective - 1e-12) {
        bestObjective = f[k];
        best = scores[k];
        bestP = candidates[k];
        stale = -1;
      }
    }
    es.tell(f);
    ++stale;
    if (log) {
      std::fprintf(log, "%d,%d,%.9g,%.9g,%d,%.6g,%.6g,%.2f\n", es.generation(), evaluations, bestObjective, best.cost,
                   best.inside, es.sigma(), es.spread(), elapsed());
    }
    if (es.generation() % 10 == 0 || es.generation() == 1) {
      std::printf("generation %3d  %5d evaluations  objective %.6f  cost %.6f  inside %d of %d  step %.3g  %.0f s\n",
                  es.generation(), evaluations, bestObjective, best.cost, best.inside, best.rows, es.spread(), elapsed());
      std::fflush(stdout);
    }
    if (es.spread() < 1e-4 || stale >= 60) break;
  }
  if (log) std::fclose(log);

  std::printf("\nstopped after %d generations, %d evaluations, in %.0f s with the machine %.0f %% busy, this fit included\n",
              es.generation(), evaluations, elapsed(), 100 * load.busy());
  std::printf("objective %.6f (cost %.6f, prior %.6f); fit rows inside %d of %d\n\n", bestObjective, best.cost,
              bestObjective - best.cost, best.inside, best.rows);
  std::printf("%-34s %10s %10s %8s  %s\n", "coefficient", "seed", "fitted", "widths", "seed from");
  for (size_t i : free) {
    const Coefficient& c = coefficients[i];
    std::printf("%-34s %10.5g %10.5g %+8.2f  %s\n", c.name.c_str(), c.seed, bestP[i], (bestP[i] - c.seed) / c.sigma,
                c.source.c_str());
  }
  std::printf("\n%-20s %12s %12s\n", "fit row", "at the seed", "fitted");
  for (const auto& [id, v] : best.values) std::printf("%-20s %12.4f %12.4f\n", id.c_str(), atSeed.values.at(id), v);

  {
    std::ofstream out(work / "fit-result.csv");
    out << "coefficient,seed,fitted,sigma,free\n";
    for (size_t i = 0; i < coefficients.size(); ++i) {
      const bool isFree = std::find(free.begin(), free.end(), i) != free.end();
      out << coefficients[i].name << "," << coefficients[i].seed << "," << bestP[i] << "," << coefficients[i].sigma << ","
          << (isFree ? "yes" : "no") << "\n";
    }
  }
  if (write) {
    if (!writeCoefficients(aircraft, coefficients, bestP)) return 2;
    std::printf("\nwrote the fitted coefficients into %s\n", aircraft.c_str());
  }
  return 0;
}
