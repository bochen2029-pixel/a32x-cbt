// wind.cpp — the wind (orbit_wind.h): the air's own motion over the turning Earth, a field of height, place
// and time made from a seed. orbit_core.cpp takes it off the craft's velocity where the air's push is
// reckoned; nothing else reads it, and the crew flying home least of all (return.cpp learns the wind from
// what its instruments measure).
//
// The mean wind, at strength 1, in the place's east and north:
//   up to 1,000 ft    MIL-F-8785C's log law, W20 ln(h / z0) / ln(20 ft / z0), z0 = 0.15 ft, its direction
//                     turned EKMAN to the left of the wind at 1,000 ft at the ground (to the right south of
//                     the equator), less with height, as the Ekman layer turns it;
//   above             a cubic Hermite in height through the wind at 1,000 ft, the jet's core (10 to 12 km up),
//                     30 % of it 8 km higher, the upper wind from 35 to 80 km, and nothing from 100 km, its
//                     slope nil at each, so it is never stronger between two of them than at both;
//   everywhere        times a factor and turned by an angle that wander with longitude and time, as long
//                     waves in the westerlies do (chosen).
// The gusts: von Karman's isotropic turbulence at MIL-F-8785C's intensities and length scales by height
// (low down: sigma_w = 0.1 W20, L_w = h, and the horizontal sigma_u and L_u from the specification's
// formulae; from 2,000 ft: L = 2,500 ft and sigma = 0.1 W20, fading from 15 km to nothing at 25 km),
// synthesised as a sum of random Fourier modes after Kraichnan (1970): MODES wavevectors in log-spaced
// shells between KMIN and KMAX, each with a direction drawn evenly over the sphere, a polarisation square to
// it, a phase, and a slow turn in time at Kolmogorov's rate for its size (Fung et al. 1992's kinematic
// simulation). Each shell's share of the variance is von Karman's energy spectrum over it, normalised over
// the shells kept so that each component's variance is the specification's sigma squared; the horizontal
// components take the horizontal scale and intensity, the vertical the vertical. Sampled along any straight
// path the field has von Karman's longitudinal spectrum along the path and the transverse across it.
//
// Every number not named for a source above is this sketch's. MIT.

#include "internal.h"
#include "orbit_wind.h"

#include <cmath>
#include <cstdint>
#include <cstring>

namespace oc {

long long windCalls = 0;

namespace {

double out[OC_WIND_COUNT];

// ---- the numbers --------------------------------------------------------------------------------

const double FT = 0.3048;
const double Z0 = 0.15 * FT;                // m: MIL-F-8785C's roughness for the terminal phases (Category C)
const double H20 = 20 * FT;                 // m: where W20 is reported
const double H_LOW = 1000 * FT;             // m: the top of the specification's low-altitude model
const double H_MID = 2000 * FT;             // m: the bottom of its medium/high-altitude model
const double L_HIGH = 2500 * FT;            // m: von Karman's length scale there
const double GUST_FADE = 15000.0;           // m: the gusts fade from here to OC_WIND_GUST_TOP_M (chosen)
const double EKMAN = 25 * D2R;              // the surface wind's turn to the left of the wind at 1,000 ft (chosen, in the Ekman layer's usual range)
const double KMIN = 2 * PI / 30000.0;       // rad/m: the longest gust kept, 30 km
const double KMAX = 2 * PI / 25.0;          // rad/m: the shortest, 25 m; shorter ones the craft's own size averages out
const int SHELLS = 40, PER = 3, MODES = SHELLS * PER;
const double A_VK = 1.339;                  // von Karman's 1.339 = Gamma(1/3) / (sqrt(pi) Gamma(5/6))
const double WANDER_RATE = 2 * PI / (4 * 86400.0);   // rad/s: the long waves move round in about four days (chosen)

// ---- the day: what the seed makes, worked out once for each seed --------------------------------------

struct Mode { V3 k; V3 e; double phase, nu; };   // rad/m, Earth-fixed; unit, square to k; rad; rad/s

struct Day {
    bool valid;
    unsigned seed;
    double w20, jet, upper, hJet;           // m/s at strength 1; m
    double psiTop, psiJet, psiUpper;        // rad: the way the wind blows, clockwise from north, at 1,000 ft, the jet, above 35 km
    double wanderA, wanderPhaseA, wanderD, wanderPhaseD;   // the factor's and the turn's amplitudes and phases
    Mode modes[MODES];
    int shellOf[MODES];
    double k[SHELLS], dk[SHELLS];           // each shell's middle and width, rad/m
    double highShare[SHELLS];               // each shell's share of the variance at L_HIGH, already normalised
} day;

uint64_t mix(uint64_t z) {   // SplitMix64 (Steele, Lea and Flood 2014)
    z += 0x9e3779b97f4a7c15ULL;
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
    return z ^ (z >> 31);
}

struct Draws {
    uint64_t z;
    double u() { z = mix(z); return (z >> 11) * (1.0 / 9007199254740992.0); }   // [0, 1)
    double in(double a, double b) { return a + (b - a) * u(); }
};

// von Karman's energy spectrum's shape, (a L k)^4 / (1 + (a L k)^2)^(17/6), over a shell: its share before
// normalising. Its integral over all k is fixed, so only the shares matter.
double vonKarman(double k, double L) {
    const double x = A_VK * L * k, x2 = x * x;
    return x2 * x2 / std::pow(1 + x2, 17.0 / 6.0);
}

void shares(double L, double* share) {   // each shell's share of the variance for length scale L, summing to 1
    double sum = 0;
    for (int j = 0; j < SHELLS; ++j) { share[j] = vonKarman(day.k[j], L) * day.dk[j]; sum += share[j]; }
    for (int j = 0; j < SHELLS; ++j) share[j] /= sum;
}

void makeDay(unsigned seed) {
    Draws d{mix(0x5eed0f017e3d1a77ULL ^ (uint64_t)seed)};
    day.seed = seed;
    day.w20 = OC_WIND_W20_MS * d.in(0.75, 1.25);
    day.jet = OC_WIND_JET_MS * d.in(0.7, 1.3);
    day.upper = OC_WIND_UPPER_MS * d.in(0.5, 1.5);
    day.hJet = d.in(10000.0, 12000.0);
    day.psiJet = d.in(50.0, 130.0) * D2R;        // the jet blows from the west, give or take 40 degrees
    day.psiTop = d.in(0.0, 360.0) * D2R;         // the wind over the boundary layer: any way at all
    day.psiUpper = day.psiJet + d.in(-30.0, 30.0) * D2R;
    day.wanderA = d.in(0.1, 0.3);
    day.wanderPhaseA = d.in(0.0, 2 * PI);
    day.wanderD = d.in(0.1, 0.4);                // rad
    day.wanderPhaseD = d.in(0.0, 2 * PI);
    const double ratio = KMAX / KMIN;
    for (int j = 0; j < SHELLS; ++j) {
        const double lo = KMIN * std::pow(ratio, (double)j / SHELLS), hi = KMIN * std::pow(ratio, (double)(j + 1) / SHELLS);
        day.k[j] = std::sqrt(lo * hi);
        day.dk[j] = hi - lo;
    }
    for (int n = 0; n < MODES; ++n) {
        const int j = n / PER;
        Mode& m = day.modes[n];
        const double kn = KMIN * std::pow(ratio, (j + d.u()) / SHELLS);   // somewhere in its shell
        const double cz = d.in(-1.0, 1.0), az = d.in(0.0, 2 * PI), sz = std::sqrt(1 - cz * cz);
        const V3 dir{sz * std::cos(az), sz * std::sin(az), cz};
        const V3 a = std::fabs(dir.z) < 0.9 ? V3{0, 0, 1} : V3{1, 0, 0};
        const V3 e1 = unit(cross(dir, a)), e2 = cross(dir, e1);
        const double turn = d.in(0.0, 2 * PI);
        m.k = dir * kn;
        m.e = e1 * std::cos(turn) + e2 * std::sin(turn);
        m.phase = d.in(0.0, 2 * PI);
        // Its turn in time: an eddy of size 1/k turns over at k u_k, with u_k ~ (k L)^(-1/3) of the gusts' 1 m/s
        // at strength 1 (Kolmogorov), so about once in 80 minutes at L and once in 2 minutes at 25 m.
        m.nu = (d.u() < 0.5 ? -1 : 1) * d.in(0.5, 1.5) * std::pow(kn * L_HIGH, 2.0 / 3.0) / L_HIGH;
        day.shellOf[n] = j;
    }
    shares(L_HIGH, day.highShare);
    day.valid = true;
}

const Day& dayOf(unsigned seed) {
    if (!day.valid || day.seed != seed) makeDay(seed);
    return day;
}

// ---- the mean wind --------------------------------------------------------------------------------

struct EN { double e, n; };
EN toward(double psi, double speed) { return {speed * std::sin(psi), speed * std::cos(psi)}; }

// The log law's wind at strength 1, before the wander, held at its 1 m value below 1 m; side: +1 north of
// the equator, -1 south (the Ekman layer turns the other way), between near it.
EN boundary(const Day& D, double h, double side) {
    const double hh = std::fmax(h, 1.0);
    const double speed = D.w20 * std::log(hh / Z0) / std::log(H20 / Z0);
    const double f = std::log(hh / Z0) / std::log(H_LOW / Z0);   // 0 at z0, 1 at 1,000 ft
    return toward(D.psiTop - EKMAN * side * (1 - f), speed);
}

EN between(double s, EN p0, EN p1) {   // the cubic Hermite with nil slopes at both ends: 3 s^2 - 2 s^3 of the way
    const double f = s * s * (3 - 2 * s);
    return {p0.e + (p1.e - p0.e) * f, p0.n + (p1.n - p0.n) * f};
}

EN meanWind(const Day& D, double h, double lat, double lon, double t) {
    const double side = clampd(lat / (10 * D2R), -1, 1);
    EN w{0, 0};
    if (h <= H_LOW) w = boundary(D, h, side);
    else if (h < OC_WIND_TOP_M) {
        const EN top = boundary(D, H_LOW, side);
        const EN jet = toward(D.psiJet, D.jet), after = toward(D.psiJet, 0.3 * D.jet), upper = toward(D.psiUpper, D.upper);
        const double h2 = D.hJet + 8000.0;
        if (h < D.hJet) w = between((h - H_LOW) / (D.hJet - H_LOW), top, jet);
        else if (h < h2) w = between((h - D.hJet) / (h2 - D.hJet), jet, after);
        else if (h < 35000.0) w = between((h - h2) / (35000.0 - h2), after, upper);
        else if (h < 80000.0) w = upper;
        else w = between((h - 80000.0) / (OC_WIND_TOP_M - 80000.0), upper, EN{0, 0});
    }
    // the long waves: stronger and weaker, and turned, round the world and through the days
    const double a = 1 + D.wanderA * std::sin(2 * lon + D.wanderPhaseA - WANDER_RATE * t);
    const double turn = D.wanderD * std::sin(3 * lon + D.wanderPhaseD - 1.3 * WANDER_RATE * t);
    const double c = std::cos(turn), s = std::sin(turn);
    return {a * (w.e * c + w.n * s), a * (w.n * c - w.e * s)};
}

// The factor the wander puts on the wind here and now, which the gusts follow (they go with W20).
double wanderFactor(const Day& D, double lon, double t) { return 1 + D.wanderA * std::sin(2 * lon + D.wanderPhaseA - WANDER_RATE * t); }

// ---- the gusts ----------------------------------------------------------------------------------

// MIL-F-8785C's von Karman intensities and length scales at height h, strength 1, for a wind of w20 at 20
// ft: horizontal (u, v) and vertical (w).
struct Scales { double su, sw, lu, lw; };
Scales scales(double h, double w20) {
    Scales s;
    const double sHigh = 0.1 * w20 * clampd((OC_WIND_GUST_TOP_M - h) / (OC_WIND_GUST_TOP_M - GUST_FADE), 0, 1);
    auto low = [&](double hm) {
        const double hf = std::fmax(hm, 10 * FT) / FT, k = 0.177 + 0.000823 * hf;   // feet, as the specification writes it
        Scales o;
        o.sw = 0.1 * w20;
        o.su = o.sw / std::pow(k, 0.4);
        o.lw = hf * FT;
        o.lu = hf / std::pow(k, 1.2) * FT;
        return o;
    };
    if (h <= H_LOW) return low(h);
    if (h >= H_MID) { s.su = s.sw = sHigh; s.lu = s.lw = L_HIGH; return s; }
    const Scales a = low(H_LOW);
    const double f = (h - H_LOW) / (H_MID - H_LOW);   // between, straight in height, as the specification has it
    s.su = a.su + (sHigh - a.su) * f;
    s.sw = a.sw + (sHigh - a.sw) * f;
    s.lu = a.lu + (L_HIGH - a.lu) * f;
    s.lw = a.lw + (L_HIGH - a.lw) * f;
    return s;
}

// The gusts at p (Earth-fixed, m) and t, at strength 1, in the Earth's axes: the horizontal part with the
// horizontal scales, the vertical with the vertical, about up.
V3 gusts(const Day& D, V3 p, V3 up, double h, double w20, double t) {
    const Scales sc = scales(h, w20);
    if (!(sc.su > 0) && !(sc.sw > 0)) return {0, 0, 0};
    double shareU[SHELLS], shareW[SHELLS];
    const double* su = D.highShare;
    const double* sw = D.highShare;
    if (h < H_MID) {
        shares(sc.lu, shareU);
        shares(sc.lw, shareW);
        su = shareU;
        sw = shareW;
    }
    // each component's variance, sum over modes of a^2 <(e . axis)^2> <cos^2> = sum a^2 / 6, is sigma^2
    const double cu = sc.su * std::sqrt(6.0 / PER), cw = sc.sw * std::sqrt(6.0 / PER);
    V3 horiz{0, 0, 0};
    double vert = 0;
    for (int n = 0; n < MODES; ++n) {
        const Mode& m = D.modes[n];
        const double c = std::cos(dot(m.k, p) + m.phase + m.nu * t);
        const int j = D.shellOf[n];
        const double ev = dot(m.e, up);
        horiz = horiz + (m.e - up * ev) * (c * cu * std::sqrt(su[j]));
        vert += ev * c * cw * std::sqrt(sw[j]);
    }
    return horiz + up * vert;
}

// ---- where the field is evaluated ----------------------------------------------------------------

V3 toEarth(V3 x, double t) { const double th = WE * t, c = std::cos(th), s = std::sin(th); return {c * x.x + s * x.y, -s * x.x + c * x.y, x.z}; }
V3 fromEarth(V3 x, double t) { const double th = WE * t, c = std::cos(th), s = std::sin(th); return {c * x.x - s * x.y, s * x.x + c * x.y, x.z}; }

struct Parts { V3 east, north, up; EN mean; V3 gust; };   // the local axes and the two parts at strength 1, Earth-fixed

Parts parts(const Day& D, V3 p, double t) {
    Parts o;
    const double pm = norm(p), h = pm - RE;
    o.up = p * (1.0 / pm);
    const V3 e = cross(V3{0, 0, 1}, o.up);
    o.east = norm(e) > 1e-12 ? unit(e) : V3{0, 1, 0};   // at a pole, any east will do
    o.north = cross(o.up, o.east);
    o.mean = {0, 0};
    o.gust = {0, 0, 0};
    if (h >= OC_WIND_TOP_M) return o;
    const double lat = std::asin(clampd(o.up.z, -1, 1)), lon = std::atan2(p.y, p.x);
    o.mean = meanWind(D, h, lat, lon, t);
    if (h < OC_WIND_GUST_TOP_M) o.gust = gusts(D, p, o.up, h, D.w20 * wanderFactor(D, lon, t), t);
    return o;
}

}   // namespace

V3 windAt(const WindState& w, V3 r, double t) {
    if (!(w.strength > 0)) return {0, 0, 0};
    ++windCalls;
    const Parts q = parts(dayOf(w.seed), toEarth(r, t), t);
    const V3 earth = (q.east * q.mean.e + q.north * q.mean.n + q.gust) * w.strength;
    return fromEarth(earth, t);
}

void windReset(State& s) { s.wind = WindState{}; }

void windWriteOut(const State& s) {
    std::memset(out, 0, sizeof out);
    const WindState& w = s.wind;
    out[OC_WIND_SEED] = w.seed;
    out[OC_WIND_STRENGTH] = w.strength;
    if (!(w.strength > 0)) return;
    out[OC_WIND_ON] = 1;
    const double t = timeOf(s);
    const Parts q = parts(dayOf(w.seed), toEarth(s.r, t), t);
    const V3 gust = q.gust * w.strength;
    const double e = q.mean.e * w.strength + dot(gust, q.east), n = q.mean.n * w.strength + dot(gust, q.north), u = dot(gust, q.up);
    out[OC_WIND_E] = e;
    out[OC_WIND_N] = n;
    out[OC_WIND_U] = u;
    out[OC_WIND_SPEED] = std::hypot(e, n);
    out[OC_WIND_FROM_DEG] = std::hypot(e, n) > 0 ? std::fmod(std::atan2(-e, -n) * R2D + 360.0, 360.0) : 0;
    out[OC_WIND_GUST_E] = dot(gust, q.east);
    out[OC_WIND_GUST_N] = dot(gust, q.north);
    out[OC_WIND_GUST_U] = u;
    // against the track over the ground, or the nose's heading when the craft is not moving over it
    const V3 vg = toEarth(s.v - cross(V3{0, 0, WE}, s.r), t);
    double te = dot(vg, q.east), tn = dot(vg, q.north);
    if (std::hypot(te, tn) < 1.0) {
        const V3 x = toEarth(rot(s.q, V3{1, 0, 0}), t);
        te = dot(x, q.east);
        tn = dot(x, q.north);
    }
    const double len = std::hypot(te, tn);
    if (len > 0) {
        te /= len;
        tn /= len;
        out[OC_WIND_HEAD] = -(e * te + n * tn);
        out[OC_WIND_CROSS] = -(e * tn - n * te);   // the track's right is (tn, -te)
    }
}

void windHash(const State& s, unsigned& h) {
    if (!(s.wind.strength > 0)) return;   // no wind: the hash is what it was before the wind existed
    const double v[] = {(double)s.wind.seed, s.wind.strength};
    hashDoubles(h, v, 2);
}

}   // namespace oc

extern "C" {

void oc_wind(unsigned seed, double strength) {
    if (!(strength >= 0 && strength <= OC_WIND_MAX)) return;   // refused, not clamped: NaN fails both
    oc::g.wind.seed = seed;
    oc::g.wind.strength = strength;
    oc::writeOut();
}

const double* oc_wind_out(void) { return oc::out; }
int oc_wind_out_len(void) { return OC_WIND_COUNT; }

void oc_wind_at(double lat_deg, double lon_deg, double alt_m, double t, double* mean3, double* gust3) {
    using namespace oc;
    mean3[0] = mean3[1] = mean3[2] = gust3[0] = gust3[1] = gust3[2] = 0;
    const WindState& w = g.wind;
    if (!(w.strength > 0) || !std::isfinite(lat_deg) || !std::isfinite(lon_deg) || !std::isfinite(alt_m) || !std::isfinite(t)) return;
    const double la = lat_deg * D2R, lo = lon_deg * D2R, rr = RE + alt_m;
    const V3 p{rr * std::cos(la) * std::cos(lo), rr * std::cos(la) * std::sin(lo), rr * std::sin(la)};
    const Parts q = parts(dayOf(w.seed), p, t);
    mean3[0] = q.mean.e * w.strength;
    mean3[1] = q.mean.n * w.strength;
    gust3[0] = dot(q.gust, q.east) * w.strength;
    gust3[1] = dot(q.gust, q.north) * w.strength;
    gust3[2] = dot(q.gust, q.up) * w.strength;
}

}   // extern "C"
