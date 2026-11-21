// The wind's tests (orbit_wind.h), each stated as physics or as a promise of the core. Run one by name
// (test_wind von_karman_gusts) or all; ctest runs each line below that reads "// TEST: <name>". Like the
// invariants' tests this program reads the state through internal.h, to set up states the page cannot. GPLv3.
//
// TEST: off_changes_nothing
// TEST: refused_outside_its_range
// TEST: log_law_and_ekman_turn
// TEST: jet_near_the_tropopause
// TEST: von_karman_gusts
// TEST: gusts_near_the_ground
// TEST: strength_scales_the_field
// TEST: parked_in_the_wind
// TEST: the_air_pushes_by_the_air_speed
// TEST: hash_covers_the_wind
// TEST: replays_in_the_wind
// TEST: crew_climbs_through_it

#include "../core/orbit_core.h"
#include "../core/orbit_return.h"
#include "../core/orbit_wind.h"
#include "../core/internal.h"

#include <cmath>
#include <complex>
#include <cstdio>
#include <cstring>
#include <limits>
#include <vector>

namespace {

int failures = 0;

#define CHECK(cond, ...)                                                   \
    do {                                                                   \
        if (!(cond)) {                                                     \
            std::printf("  FAIL %s:%d: %s — ", __FILE__, __LINE__, #cond); \
            std::printf(__VA_ARGS__);                                      \
            std::printf("\n");                                             \
            ++failures;                                                    \
        }                                                                  \
    } while (0)

using oc::V3;

const double PI = 3.14159265358979323846, D2R = PI / 180, R2D = 180 / PI, RE = 6371000.0, FT = 0.3048;
const double LAT = 32.91569901, LON = -97.02600098, HDG = 180.3;   // KDFW 17C, docs/provenance.md 1f
const double Z0 = 0.15 * FT;                                       // MIL-F-8785C's roughness, Category C
const double A_VK = 1.339;                                         // von Karman's constant in the 1-D spectra

double get(int i) { return oc_out()[i]; }
double wind(int i) { return oc_wind_out()[i]; }

bool allFinite() {
    const double* blocks[] = {oc_out(), oc_return_out(), oc_wind_out()};
    const int lens[] = {oc_out_len(), oc_return_out_len(), oc_wind_out_len()};
    for (int b = 0; b < 3; ++b)
        for (int i = 0; i < lens[b]; ++i)
            if (!std::isfinite(blocks[b][i])) return false;
    return true;
}

// The field at a place: its mean part and its gusts, east, north, up.
struct At { double mean[3], gust[3]; };
At at(double lat, double lon, double alt, double t) {
    At a;
    oc_wind_at(lat, lon, alt, t, a.mean, a.gust);
    return a;
}
double speed(const double* w) { return std::hypot(w[0], w[1]); }

// A digest of every readout block, to hold two flights equal.
unsigned digest() {
    unsigned h = 2166136261u;
    oc::hashDoubles(h, oc_out(), oc_out_len());
    oc::hashDoubles(h, oc_return_out(), oc_return_out_len());
    return h;
}

// ---- the tests --------------------------------------------------------------------------------------

// With no wind the core is as it was before the wind existed: the field is never evaluated, and a flight
// with oc_wind(seed, 0) said at every turn hashes and reads out, step by step, as one where it never was.
// (The comparison with the core before wind.cpp was added, on 3,756 marks and every test's output, natively
// and as WebAssembly, is in INVARIANTS.md, O16.)
void offChangesNothing() {
    oc_reset(LAT, LON, HDG);
    CHECK(wind(OC_WIND_ON) == 0 && wind(OC_WIND_STRENGTH) == 0 && wind(OC_WIND_SPEED) == 0, "no wind after a reset");
    std::vector<unsigned> plain, said;
    const long long calls0 = oc::windCalls;
    for (int pass = 0; pass < 2; ++pass) {
        std::vector<unsigned>& marks = pass ? said : plain;
        oc_reset(LAT, LON, HDG);
        for (int i = 0; i < 2000; ++i) {   // the crew to orbit and on, 1,000 s
            if (pass && i % 50 == 0) oc_wind(1000u + i, 0.0);
            oc_step(25);
            marks.push_back(oc_hash());
            marks.push_back(digest());
        }
        oc_auto(OC_AUTO_RETURN);   // and the flight home's plan
        oc_step(500);
        marks.push_back(oc_hash());
        marks.push_back(digest());
    }
    std::printf("  %zu marks: %s; the field evaluated %lld times\n", plain.size(), plain == said ? "the same" : "different", oc::windCalls - calls0);
    CHECK(plain == said, "a wind of strength 0 changed the flight");
    CHECK(oc::windCalls == calls0, "the field was evaluated %lld times with no wind", oc::windCalls - calls0);
}

// A strength that is not a number, below nought or above the most is refused, and changes nothing.
void refusedOutsideItsRange() {
    oc_reset(LAT, LON, HDG);
    oc_wind(7, 1.5);
    oc_step(100);
    const unsigned h = oc_hash();
    const double bad[] = {std::numeric_limits<double>::quiet_NaN(), -0.01, OC_WIND_MAX + 0.01, std::numeric_limits<double>::infinity(),
                          -std::numeric_limits<double>::infinity()};
    for (double b : bad) {
        oc_wind(9, b);
        CHECK(oc_hash() == h && wind(OC_WIND_STRENGTH) == 1.5 && wind(OC_WIND_SEED) == 7, "oc_wind(9, %g) was taken", b);
    }
    oc_wind(9, OC_WIND_MAX);
    CHECK(wind(OC_WIND_STRENGTH) == OC_WIND_MAX && oc_hash() != h, "the most, %g, is taken", OC_WIND_MAX);
    std::printf("  NaN, -0.01, %.2f and the infinities refused; %.0f taken\n", OC_WIND_MAX + 0.01, OC_WIND_MAX);
}

// Near the ground the mean wind is MIL-F-8785C's: its speed W20 ln(h / z0) / ln(20 ft / z0) with z0 =
// 0.15 ft, and it veers with height (turns clockwise, seen from above, north of the equator), from the
// surface wind to the wind at 1,000 ft, as the Ekman layer turns it.
void logLawAndEkmanTurn() {
    oc_reset(LAT, LON, HDG);
    double worst = 0, turnWorst = 0;
    for (unsigned seed = 1; seed <= 20; ++seed) {
        oc_wind(seed, 1.0);
        const double t = 3600.0 * seed;
        const At w20 = at(LAT, LON, 20 * FT, t);
        for (double hft : {4.0, 10.0, 50.0, 100.0, 300.0, 1000.0}) {
            const At w = at(LAT, LON, hft * FT, t);
            const double want = speed(w20.mean) * std::log(hft / 0.15) / std::log(20.0 / 0.15);
            worst = std::fmax(worst, std::fabs(speed(w.mean) - want) / want);
        }
        // the turn from 20 ft to 1,000 ft: the Ekman layer's 25 degrees times the share of ln(h / z0) between
        const At top = at(LAT, LON, 1000 * FT, t);
        const double turned = std::atan2(w20.mean[0] * top.mean[1] - w20.mean[1] * top.mean[0], w20.mean[0] * top.mean[0] + w20.mean[1] * top.mean[1]);
        const double want = -25 * D2R * (1 - std::log(20.0 / 0.15) / std::log(1000.0 / 0.15));   // clockwise from north is minus here
        turnWorst = std::fmax(turnWorst, std::fabs(turned - want));
    }
    std::printf("  20 seeds: the speed against the log law within %.1e of itself; the veer from 20 to 1,000 ft within %.1e deg of %.2f deg\n", worst,
                turnWorst * R2D, 25 * (1 - std::log(20.0 / 0.15) / std::log(1000.0 / 0.15)));
    CHECK(worst < 1e-9, "the log law, %.2e off", worst);   // the height comes back from the place to a nanometre
    CHECK(turnWorst < 1e-9, "the turn, %.2e deg off", turnWorst * R2D);
}

// Over the ground the mean wind rises to a jet stream's core 10 to 12 km up, the strongest wind between 1 and
// 30 km, falls above it, and is nothing from 100 km. It is continuous, and its shear (the change of the wind
// with height) is an atmosphere's, under 0.02 per second above the surface layer.
void jetNearTheTropopause() {
    oc_reset(LAT, LON, HDG);
    double lowJet = 1e9, highJet = 0, lowPeak = 1e9, highPeak = 0, worstShear = 0, worstShearAt = 0, worstJump = 0, aloft = 0;
    for (unsigned seed = 1; seed <= 50; ++seed) {
        oc_wind(seed, 1.0);
        const double t = 977.0 * seed;
        double best = 0, bestAt = 0;
        double last[3];
        At prev = at(LAT, LON, 50.0, t);
        std::memcpy(last, prev.mean, sizeof last);
        for (double h = 60.0; h <= 120000.0; h += 10.0) {
            const At w = at(LAT, LON, h, t);
            const double s = speed(w.mean);
            if (h > 1000 && h < 30000 && s > best) { best = s; bestAt = h; }
            const double shear = std::hypot(w.mean[0] - last[0], w.mean[1] - last[1]) / 10.0;
            if (h > 300 && shear > worstShear) { worstShear = shear; worstShearAt = h; }
            if (h > 300) worstJump = std::fmax(worstJump, std::hypot(w.mean[0] - last[0], w.mean[1] - last[1]));
            if (h >= OC_WIND_TOP_M) aloft = std::fmax(aloft, s);
            std::memcpy(last, w.mean, sizeof last);
        }
        lowJet = std::fmin(lowJet, bestAt);
        highJet = std::fmax(highJet, bestAt);
        lowPeak = std::fmin(lowPeak, best);
        highPeak = std::fmax(highPeak, best);
    }
    std::printf("  50 seeds over KDFW: the strongest wind from 1 to 30 km between %.2f and %.2f km up, %.1f to %.1f m/s; the steepest shear above 300 m %.4f /s "
                "(at %.1f km); nothing over %.0f km (%.1e m/s)\n",
                lowJet / 1000, highJet / 1000, lowPeak, highPeak, worstShear, worstShearAt / 1000, OC_WIND_TOP_M / 1000, aloft);
    CHECK(lowJet >= 10000 && highJet <= 12000, "the jet between %.1f and %.1f km", lowJet / 1000, highJet / 1000);
    CHECK(lowPeak > 0.7 * 0.7 * OC_WIND_JET_MS && highPeak < 1.3 * 1.3 * OC_WIND_JET_MS, "the jet %.1f to %.1f m/s", lowPeak, highPeak);
    CHECK(worstShear < 0.02, "a shear of %.4f /s", worstShear);
    CHECK(aloft < 1e-9, "%.2e m/s above the top", aloft);
}

// ---- the gusts' spectrum ----------------------------------------------------------------------------

void fft(std::vector<std::complex<double>>& a) {   // radix 2, in place
    const size_t n = a.size();
    for (size_t i = 1, j = 0; i < n; ++i) {
        size_t bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) std::swap(a[i], a[j]);
    }
    for (size_t len = 2; len <= n; len <<= 1) {
        const std::complex<double> w(std::cos(-2 * PI / len), std::sin(-2 * PI / len));
        for (size_t i = 0; i < n; i += len) {
            std::complex<double> wk(1, 0);
            for (size_t k = 0; k < len / 2; ++k, wk *= w) {
                const std::complex<double> u = a[i + k], v = a[i + k + len / 2] * wk;
                a[i + k] = u + v;
                a[i + k + len / 2] = u - v;
            }
        }
    }
}

// The one-sided spectra along a path, per rad/m, each integrating to sigma^2 = 1: von Karman's longitudinal
// and transverse (MIL-F-8785C's forms), and Dryden's, for the check that the test tells them apart.
double vkLong(double k, double L) { const double x = A_VK * L * k; return 2 * L / PI / std::pow(1 + x * x, 5.0 / 6.0); }
double vkTrans(double k, double L) { const double x = A_VK * L * k; return L / PI * (1 + 8.0 / 3.0 * x * x) / std::pow(1 + x * x, 11.0 / 6.0); }
double drLong(double k, double L) { const double x = L * k; return 2 * L / PI / (1 + x * x); }
double drTrans(double k, double L) { const double x = L * k; return L / PI * (1 + 3 * x * x) / ((1 + x * x) * (1 + x * x)); }

double band(double (*f)(double, double), double k0, double k1, double L) {   // Simpson's rule in ln k
    const int n = 64;
    const double a = std::log(k0), b = std::log(k1), h = (b - a) / n;
    double s = 0;
    for (int i = 0; i <= n; ++i) {
        const double k = std::exp(a + i * h);
        s += (i == 0 || i == n ? 1 : (i % 2 ? 4 : 2)) * f(k, L) * k;
    }
    return s * h / 3;
}

// The same octaves for the field as wind.cpp defines it: von Karman's isotropic energy spectrum E(k), kept
// from 30 km to 25 m in wavelength and normalised there, whose one-dimensional spectra along a line are
// E11(k1) = int E(k)/k (1 - k1^2/k^2) dk and E22(k1) = int E(k)/(2k) (1 + k1^2/k^2) dk over k > k1 (the
// isotropic relations; e.g. Pope, Turbulent Flows, 6.5). Each octave's share by the inner integral in closed
// form and the outer by Simpson's rule in ln k.
void keptBands(const double* edge, int bands, double L, double* along, double* across) {
    const double kMin = 2 * PI / 30000.0, kMax = 2 * PI / 25.0;
    const int n = 4000;
    const double a = std::log(kMin), h = (std::log(kMax) - a) / n;
    double total = 0;
    for (int b = 0; b < bands; ++b) along[b] = across[b] = 0;
    for (int i = 0; i <= n; ++i) {
        const double k = std::exp(a + i * h), x = A_VK * L * k, w = (i == 0 || i == n ? 1 : (i % 2 ? 4 : 2)) * h / 3 * k;
        const double E = x * x * x * x / std::pow(1 + x * x, 17.0 / 6.0);
        total += w * E;
        for (int b = 0; b < bands; ++b) {
            const double lo = edge[b], hi = std::fmin(edge[b + 1], k);
            if (hi <= lo) continue;
            const double cube = (hi * hi * hi - lo * lo * lo) / (3 * k * k);
            along[b] += w * E / k * ((hi - lo) - cube);
            across[b] += w * E / (2 * k) * ((hi - lo) + cube);
        }
    }
    for (int b = 0; b < bands; ++b) { along[b] *= 1.5 / total; across[b] *= 1.5 / total; }   // int E = 3/2 sigma^2
}

// Sampled along straight lines 8 km up, where MIL-F-8785C's von Karman model has L = 2,500 ft and the
// gusts' sigma is 0.1 W20 in every direction, the gusts' spectrum is von Karman's: along the line the
// longitudinal, across it the transverse, octave by octave from 1.6 km to 50 m in wavelength, averaged over
// 48 seeds; and their variance is (0.1 W20)^2 with W20 the mean wind 20 ft up at that place and time. Held
// to the field's own definition (von Karman's, kept from 30 km to 25 m), to 20 %, the sampling's scatter;
// printed beside MIL-F-8785C's untruncated form, which the octaves down to 100 m follow, and Dryden's, which
// the field must not match.
void vonKarmanGusts() {
    const int N = 1 << 15;
    const double dx = 8.0, L = 2500 * FT;
    const int bands = 5;
    double kEdge[bands + 1];
    for (int b = 0; b <= bands; ++b) kEdge[b] = 2 * PI / 1600.0 * std::pow(2.0, b);   // 1.6 km, 800 m, ... 50 m
    double longP[bands] = {0}, transP[bands] = {0}, var[3] = {0, 0, 0};
    int lines = 0;
    oc_reset(LAT, LON, HDG);
    std::vector<std::complex<double>> a(N), c(N), d(N);
    for (unsigned seed = 1; seed <= 48; ++seed) {
        oc_wind(seed, 1.0);
        const double t = 5000.0 + 1234.5 * seed, lon = LON + 7.0 * seed, lat0 = 20.0 + 0.5 * seed;
        // a straight chord due north, 262 km long, its middle 8 km up: one longitude, so one wander factor
        const double la = lat0 * D2R, lo = lon * D2R, r0 = RE + 8000.0;
        const V3 up{std::cos(la) * std::cos(lo), std::cos(la) * std::sin(lo), std::sin(la)};
        const V3 east = oc::unit(oc::cross(V3{0, 0, 1}, up)), north = oc::cross(up, east);
        const double sigma = 0.1 * speed(at(lat0, lon, 20 * FT, t).mean);
        for (int i = 0; i < N; ++i) {
            const V3 p = up * r0 + north * ((i - N / 2) * dx);
            const double pm = oc::norm(p), plat = std::asin(p.z / pm) * R2D, plon = std::atan2(p.y, p.x) * R2D;
            const At w = at(plat, plon, pm - RE, t);
            const V3 u = oc::unit(p), e = oc::unit(oc::cross(V3{0, 0, 1}, u)), nn = oc::cross(u, e);
            const V3 g = e * w.gust[0] + nn * w.gust[1] + u * w.gust[2];   // Earth-fixed
            a[i] = oc::dot(g, north) / sigma;   // along the line, in units of the expected sigma
            c[i] = oc::dot(g, east) / sigma;    // across it, level
            d[i] = oc::dot(g, up) / sigma;      // across it, up
        }
        for (int i = 0; i < N; ++i) { var[0] += std::norm(a[i]) / N; var[1] += std::norm(c[i]) / N; var[2] += std::norm(d[i]) / N; }
        fft(a);
        fft(c);
        fft(d);
        const double dk = 2 * PI / (N * dx);
        for (int m = 1; m < N / 2; ++m) {   // the periodogram, one-sided: 2 |X|^2 / N^2 per bin, as a variance
            const double k = m * dk;
            for (int b = 0; b < bands; ++b)
                if (k >= kEdge[b] && k < kEdge[b + 1]) {
                    longP[b] += 2 * std::norm(a[m]) / ((double)N * N);
                    transP[b] += (std::norm(c[m]) + std::norm(d[m])) / ((double)N * N);   // the mean of the two
                }
        }
        ++lines;
    }
    double keptL[bands], keptT[bands];
    keptBands(kEdge, bands, L, keptL, keptT);
    double worst = 0, worstMil = 0, bestDryden = 1e9;
    std::printf("  octave      along: field  kept   MIL v.K.  Dryden    across: field  kept   MIL v.K.  Dryden\n");
    for (int b = 0; b < bands; ++b) {
        const double fl = longP[b] / lines, ft = transP[b] / lines;
        const double vl = band(vkLong, kEdge[b], kEdge[b + 1], L), vt = band(vkTrans, kEdge[b], kEdge[b + 1], L);
        const double dl = band(drLong, kEdge[b], kEdge[b + 1], L), dt = band(drTrans, kEdge[b], kEdge[b + 1], L);
        std::printf("  %4.0f-%4.0f m     %.4f %.4f  %.4f   %.4f           %.4f %.4f  %.4f   %.4f\n", 2 * PI / kEdge[b + 1], 2 * PI / kEdge[b], fl, keptL[b], vl, dl, ft,
                    keptT[b], vt, dt);
        worst = std::fmax(worst, std::fmax(std::fabs(fl / keptL[b] - 1), std::fabs(ft / keptT[b] - 1)));
        if (b < bands - 1) worstMil = std::fmax(worstMil, std::fmax(std::fabs(fl / vl - 1), std::fabs(ft / vt - 1)));
        if (b == bands - 1) bestDryden = std::fmin(std::fabs(fl / dl - 1), std::fabs(ft / dt - 1));
    }
    for (double& v : var) v /= lines;
    std::printf("  variance over (0.1 W20)^2: along %.3f, across %.3f, up %.3f; the octaves within %.0f %% of the field's spectrum, those down to 100 m "
                "within %.0f %% of MIL-F-8785C's; the shortest %.0f %% off Dryden's\n",
                var[0], var[1], var[2], 100 * worst, 100 * worstMil, 100 * bestDryden);
    CHECK(worst < 0.2, "%.0f %% off the field's spectrum", 100 * worst);
    CHECK(worstMil < 0.2, "%.0f %% off MIL-F-8785C's down to 100 m", 100 * worstMil);
    CHECK(bestDryden > 0.3, "the shortest octave within %.0f %% of Dryden's", 100 * bestDryden);
    for (double v : var) CHECK(std::fabs(v - 1) < 0.15, "a variance %.3f of the expected", v);
}

// Near the ground, at 50 ft, the gusts are MIL-F-8785C's low-altitude ones: sigma_w = 0.1 W20 up and down,
// and level sigma_u = sigma_w / (0.177 + 0.000823 h)^0.4 with h in feet, 1.84 times as strong.
void gustsNearTheGround() {
    oc_reset(LAT, LON, HDG);
    double up = 0, level = 0, want = 0;
    const int n = 4096;
    const double hft = 50, ratio = 1 / std::pow(0.177 + 0.000823 * hft, 0.4);
    for (unsigned seed = 1; seed <= 48; ++seed) {
        oc_wind(seed, 2.0);
        const double t = 777.0 * seed;
        const double w20 = speed(at(LAT, LON, 20 * FT, t).mean);
        want += 0.01 * w20 * w20;
        double su = 0, sw = 0;
        for (int i = 0; i < n; ++i) {   // 20 km along a great circle west from the field, 50 ft up
            const At w = at(LAT, LON - (i * 5.0) / (RE * std::cos(LAT * D2R)) * R2D, hft * FT, t);
            su += (w.gust[0] * w.gust[0] + w.gust[1] * w.gust[1]) / 2;
            sw += w.gust[2] * w.gust[2];
        }
        level += su / n;
        up += sw / n;
    }
    const double sw = std::sqrt(up / want), su = std::sqrt(level / want);
    std::printf("  48 seeds, 50 ft up: sigma_w %.3f of 0.1 W20, sigma_u %.3f of it (the specification's %.3f)\n", sw, su, ratio);
    CHECK(std::fabs(sw - 1) < 0.15, "sigma_w %.3f of 0.1 W20", sw);
    CHECK(std::fabs(su / ratio - 1) < 0.15, "sigma_u %.3f of 0.1 W20, the specification's %.3f", su, ratio);
}

// The whole field is the strength times the field at strength 1.
void strengthScalesTheField() {
    oc_reset(LAT, LON, HDG);
    double worst = 0;
    unsigned x = 12345;
    auto rnd = [&]() { x = x * 1103515245u + 12345u; return ((x >> 8) & 0xffffff) / 16777216.0; };
    for (int i = 0; i < 400; ++i) {
        const double lat = -80 + 160 * rnd(), lon = -180 + 360 * rnd(), alt = 30000 * rnd() * rnd(), t = 90000 * rnd();
        const unsigned seed = 1 + i % 7;
        oc_wind(seed, 1.0);
        const At one = at(lat, lon, alt, t);
        oc_wind(seed, 2.5);
        const At more = at(lat, lon, alt, t);
        for (int k = 0; k < 3; ++k) {
            worst = std::fmax(worst, std::fabs(more.mean[k] - 2.5 * one.mean[k]) / (1 + std::fabs(more.mean[k])));
            worst = std::fmax(worst, std::fabs(more.gust[k] - 2.5 * one.gust[k]) / (1 + std::fabs(more.gust[k])));
        }
    }
    std::printf("  400 places: at strength 2.5 the field is 2.5 times strength 1's to %.1e\n", worst);
    CHECK(worst < 1e-13, "%.2e", worst);
}

// Parked on the runway, brakes on, the air goes past at the wind's speed: the airspeed reads the wind
// where the craft is, less the little the craft itself rocks on its gear, and the air comes from where the
// wind blows from.
void parkedInTheWind() {
    oc_reset(LAT, LON, HDG);
    oc_wind(3, 2.0);
    double worst = 0, worstDir = 0, rock = 0;
    for (int i = 0; i < 15; ++i) {   // the crew holds the brakes for 20 s
        oc_step(50);
        const oc::State& s = oc::g;
        const V3 w = oc::windAt(s.wind, s.r, oc::timeOf(s)), ground = s.v - oc::cross(V3{0, 0, oc::WE}, s.r);
        worst = std::fmax(worst, std::fabs(get(OC_TAS) - oc::norm(ground - w)) / oc::norm(w));
        rock = std::fmax(rock, oc::norm(ground));
        // the air's velocity past the craft along its nose (level, on 180.3), against the wind's turned to it
        const double a = get(OC_ALPHA_DEG) * D2R, b = get(OC_BETA_DEG) * D2R, h = get(OC_HDG_DEG) * D2R;
        const double fwd = get(OC_TAS) * std::cos(a) * std::cos(b);
        const double along = -(wind(OC_WIND_E) * std::sin(h) + wind(OC_WIND_N) * std::cos(h));
        worstDir = std::fmax(worstDir, std::fabs(fwd - along));
    }
    std::printf("  parked 15 s in a wind of %.1f m/s from %.0f deg, rocking at most %.3f m/s: the airspeed reads |v - wind| to %.1e of itself, "
                "its part along the nose the wind's to %.3f m/s\n",
                wind(OC_WIND_SPEED), wind(OC_WIND_FROM_DEG), rock, worst, worstDir);
    CHECK(worst < 1e-12, "the airspeed %.2e off |v - wind|", worst);
    CHECK(worstDir < 0.05 && rock < 0.05, "the air along the nose %.3f m/s off the wind's; rocking %.3f m/s", worstDir, rock);
    CHECK(get(OC_ON_GROUND) == 1 && get(OC_CRASHED) == 0, "still parked");
}

// The air pushes by the craft's velocity through it and by nothing else: a craft moving at v in a wind w
// feels what a craft moving at v - w in still air feels, to the rounding (Galileo, with the air's own
// motion over the turning Earth). At places through a windy ascent, the felt acceleration, the airspeed, the
// angles of attack and sideslip and the dynamic pressure are compared.
void theAirPushesByTheAirSpeed() {
    oc_reset(LAT, LON, HDG);
    oc_wind(11, 3.0);
    double worst = 0;
    int checks = 0;
    while (get(OC_T) < 200 && get(OC_CRASHED) == 0) {
        oc_step(250);
        if (get(OC_ON_GROUND) > 0) continue;
        const oc::State keep = oc::g;
        const double t = oc::timeOf(oc::g);
        const double was[] = {get(OC_G), get(OC_TAS), get(OC_ALPHA_DEG), get(OC_BETA_DEG), get(OC_QBAR)};
        const V3 w = oc::windAt(oc::g.wind, oc::g.r, t);
        oc::g.wind.strength = 0;
        oc::g.v = oc::g.v - w;
        oc_step(0);
        const double now[] = {get(OC_G), get(OC_TAS), get(OC_ALPHA_DEG), get(OC_BETA_DEG), get(OC_QBAR)};
        for (int k = 0; k < 5; ++k) worst = std::fmax(worst, std::fabs(now[k] - was[k]) / (1 + std::fabs(was[k])));
        ++checks;
        oc::g = keep;
        oc_step(0);
    }
    std::printf("  %d places through a severe wind: still air at v - w pushes as the wind at v, to %.1e\n", checks, worst);
    CHECK(checks > 30, "%d checks", checks);
    CHECK(worst < 1e-9, "%.2e", worst);
}

// The hash covers the wind: two flights the same but for the wind hash apart at once, and two the same in
// every way hash alike later.
void hashCoversTheWind() {
    unsigned now[3], later[3];
    const unsigned seeds[] = {5, 5, 6};
    for (int k = 0; k < 3; ++k) {
        oc_reset(LAT, LON, HDG);
        oc_step(3000);   // climbing, 60 s
        oc_wind(seeds[k], 1.0);
        now[k] = oc_hash();
        oc_step(1000);
        later[k] = oc_hash();
    }
    std::printf("  seeds 5, 5, 6: %08x %08x %08x now, %08x %08x %08x 20 s on\n", now[0], now[1], now[2], later[0], later[1], later[2]);
    CHECK(now[0] == now[1] && later[0] == later[1], "the same wind twice");
    CHECK(now[0] != now[2] && later[0] != later[2], "two winds hashed alike");
    oc_reset(LAT, LON, HDG);
    oc_step(3000);
    const unsigned still = oc_hash();
    CHECK(still != now[0], "a wind and none hashed alike");
}

// In a wind as in still air, a flight replays: stepped in pieces with every readout read between them, or in
// one go, it is the same flight to the bit.
void replaysInTheWind() {
    std::vector<unsigned> straight, pieces;
    for (int pass = 0; pass < 2; ++pass) {
        std::vector<unsigned>& m = pass ? pieces : straight;
        oc_reset(LAT, LON, HDG);
        oc_wind(21, 2.0);
        unsigned x = 99;
        for (int mark = 0; mark < 40; ++mark) {
            int todo = 1000;
            while (todo > 0) {
                int piece = todo;
                if (pass) { x = x * 1103515245u + 12345u; piece = std::min(todo, 1 + (int)((x >> 16) % 333)); }
                oc_step(piece);
                todo -= piece;
                if (pass) { (void)oc_wind_out(); (void)oc_out(); (void)oc_hash(); double a[3], b[3]; oc_wind_at(LAT, LON, 100, 50, a, b); }
            }
            m.push_back(oc_hash());
            m.push_back(digest());
        }
    }
    std::printf("  40 marks to %.0f s: %s\n", get(OC_T), straight == pieces ? "the same" : "different");
    CHECK(straight == pieces, "the flight in pieces parted from the straight one");
}

// The crew climbs to orbit through a severe wind (strength 3, W20 of 45 knots across 17C at the start), as
// through still air: off the runway, through the jet, to the Ring's height, every readout finite.
void crewClimbsThroughIt() {
    for (unsigned seed : {2u, 8u, 13u}) {
        oc_reset(LAT, LON, HDG);
        oc_wind(seed, OC_WIND_MAX);
        double maxQ = 0, maxCross = 0, maxBeta = 0;
        bool finite = true;
        oc_step(1);
        const double from = wind(OC_WIND_FROM_DEG), w = wind(OC_WIND_SPEED);
        while (get(OC_PHASE) != OC_PH_ORBIT && get(OC_T) < 1500 && get(OC_CRASHED) == 0) {
            oc_step(5);
            finite = finite && allFinite();
            maxQ = std::fmax(maxQ, get(OC_QBAR));
            if (get(OC_ON_GROUND) > 0) maxCross = std::fmax(maxCross, std::fabs(wind(OC_WIND_CROSS)));
            else maxBeta = std::fmax(maxBeta, std::fabs(get(OC_BETA_DEG)));
        }
        std::printf("  seed %u, from %.0f deg at %.1f m/s (%.1f m/s across the roll): orbit at %.0f s, %.1f x %.1f km, %.0f kg left, max q %.0f Pa, "
                    "sideslip aloft %.1f deg at most\n",
                    seed, from, w, maxCross, get(OC_T), get(OC_APO) / 1000, get(OC_PERI) / 1000, get(OC_PROP), maxQ, maxBeta);
        CHECK(finite, "every readout finite");
        CHECK(get(OC_PHASE) == OC_PH_ORBIT && get(OC_CRASHED) == 0, "orbit: phase %.0f, crashed %.0f", get(OC_PHASE), get(OC_CRASHED));
        CHECK(get(OC_PERI) > 450000 && get(OC_APO) < 550000, "%.1f x %.1f km", get(OC_APO) / 1000, get(OC_PERI) / 1000);
    }
}

struct Test { const char* name; void (*fn)(); };
const Test tests[] = {
    {"off_changes_nothing", offChangesNothing},
    {"refused_outside_its_range", refusedOutsideItsRange},
    {"log_law_and_ekman_turn", logLawAndEkmanTurn},
    {"jet_near_the_tropopause", jetNearTheTropopause},
    {"von_karman_gusts", vonKarmanGusts},
    {"gusts_near_the_ground", gustsNearTheGround},
    {"strength_scales_the_field", strengthScalesTheField},
    {"parked_in_the_wind", parkedInTheWind},
    {"the_air_pushes_by_the_air_speed", theAirPushesByTheAirSpeed},
    {"hash_covers_the_wind", hashCoversTheWind},
    {"replays_in_the_wind", replaysInTheWind},
    {"crew_climbs_through_it", crewClimbsThroughIt},
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
