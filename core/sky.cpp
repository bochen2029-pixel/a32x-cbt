// sky.cpp — the Sun and the Moon where they really are, for the flight's date and time, and the
// Earth's place under the stars (orbit_sky.h). GPLv3.
//
// The flight has an epoch, a date and time in UTC at t = 0; the sky is worked out for the epoch plus
// the flight's time, so the Moon moves its half a degree an hour and the Sun its degree a day. The
// methods are J. Meeus's, Astronomical Algorithms, 2nd ed. (docs/provenance.md, 1h): written here
// from the book's formulae and tables, checked against its worked examples and against JPL's
// Horizons (test/test_sky.cpp).
//
// The frames. The methods give places on the ecliptic of the date; the obliquity turns them to the
// equator of the date, and the nutation is carried, so they are apparent places. The core's ECI
// frame is the Earth-fixed one at t = 0, its x axis through Greenwich's meridian, which stands at
// that moment at a right ascension equal to Greenwich's apparent sidereal time: one turn about the
// pole by that angle takes an apparent place into ECI. From there the Earth turns under it at WE,
// as it does under the craft.
//
// The eye is not at the Earth's centre: from the ground the Moon stands up to a degree from its
// geocentric place. So the Moon is given as a place in space, a direction and a distance from the
// Earth's centre, and whoever draws it puts it there.
//
// Time. UT1 is taken as UTC (within 0.9 s by definition: 0.004 deg of the Earth's turn), and
// Terrestrial Time as UTC + 69.184 s, as it has stood since 2017 (the Moon moves half an arcsecond
// in a second, so a decade's leap seconds either way are a hundredth of a degree).

#include "internal.h"
#include "orbit_sky.h"

#include <cmath>
#include <cstring>

namespace oc {

namespace {

const double J2000 = 2451545.0;           // the Julian Date of 2000 January 1, 12 h
const double AU = 149597870700.0;         // m
const double TT_MINUS_UTC = 69.184;       // s: 32.184 and 37 leap seconds
const double ARCSEC = D2R / 3600.0;
const double MOON_TILT = 1.54242 * D2R;   // the Moon's equator to the ecliptic (Cassini; IAU's value)
const double JD_1900 = 2415020.5, JD_2100 = 2488069.5;

double epochJd = OC_SKY_DEFAULT_EPOCH;    // UTC at t = 0: an input, as the start point is
double out[OC_SKY_COUNT];

double turn(double a) {   // into 0 .. 2 pi
    a = std::fmod(a, 2 * PI);
    return a < 0 ? a + 2 * PI : a;
}

// ---- the Earth's tilt and its nodding (Meeus ch. 22) ---------------------------------------------
// The mean obliquity (22.2), and the nutation's four largest terms: good to 0.5 arcseconds in
// longitude and 0.1 in obliquity.

struct Tilt { double dpsi, eps0, eps; };   // nutation in longitude; the mean and the true obliquity

Tilt tilt(double T) {
    const double om = (125.04452 - 1934.136261 * T) * D2R;   // the Moon's ascending node
    const double ls = (280.4665 + 36000.7698 * T) * D2R;     // the Sun's mean longitude
    const double lm = (218.3165 + 481267.8813 * T) * D2R;    // the Moon's
    const double dpsi = (-17.20 * std::sin(om) - 1.32 * std::sin(2 * ls) - 0.23 * std::sin(2 * lm) + 0.21 * std::sin(2 * om)) * ARCSEC;
    const double deps = (9.20 * std::cos(om) + 0.57 * std::cos(2 * ls) + 0.10 * std::cos(2 * lm) - 0.09 * std::cos(2 * om)) * ARCSEC;
    const double eps0 = (84381.448 - 46.8150 * T - 0.00059 * T * T + 0.001813 * T * T * T) * ARCSEC;
    return {dpsi, eps0, eps0 + deps};
}

// Greenwich mean sidereal time (Meeus 12.4), for a Julian Date in UT.
double gmst(double jd) {
    const double d = jd - J2000, T = d / 36525;
    return turn((280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000) * D2R);
}

// ---- the Sun (Meeus ch. 25, the low-accuracy method: 0.01 deg) -----------------------------------

struct Place { double lon, lat, dist; };   // geocentric; the ecliptic and mean equinox of the date; m

Place sunAt(double T) {
    const double L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;              // mean longitude, deg
    const double M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * D2R;        // mean anomaly
    const double e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;           // the orbit's eccentricity
    const double C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * std::sin(M) + (0.019993 - 0.000101 * T) * std::sin(2 * M) +
                     0.000289 * std::sin(3 * M);                                     // the equation of the centre, deg
    const double nu = M + C * D2R;
    return {turn((L0 + C) * D2R), 0, 1.000001018 * (1 - e * e) / (1 + e * std::cos(nu)) * AU};
}

// ---- the Moon (Meeus ch. 47: the principal terms of the ELP-2000/82 theory) ----------------------
// Tables 47.A and 47.B, whole: the multiples of D, M, M', F, then the coefficient of the sine in
// longitude (and latitude) in millionths of a degree and of the cosine in distance in metres. Good
// to about 10 arcseconds in longitude and 4 in latitude.

struct TermLR { signed char d, m, mp, f; int l, r; };
struct TermB { signed char d, m, mp, f; int b; };

const TermLR MOON_LR[] = {
    {0, 0, 1, 0, 6288774, -20905355}, {2, 0, -1, 0, 1274027, -3699111}, {2, 0, 0, 0, 658314, -2955968},
    {0, 0, 2, 0, 213618, -569925},    {0, 1, 0, 0, -185116, 48888},     {0, 0, 0, 2, -114332, -3149},
    {2, 0, -2, 0, 58793, 246158},     {2, -1, -1, 0, 57066, -152138},   {2, 0, 1, 0, 53322, -170733},
    {2, -1, 0, 0, 45758, -204586},    {0, 1, -1, 0, -40923, -129620},   {1, 0, 0, 0, -34720, 108743},
    {0, 1, 1, 0, -30383, 104755},     {2, 0, 0, -2, 15327, 10321},      {0, 0, 1, 2, -12528, 0},
    {0, 0, 1, -2, 10980, 79661},      {4, 0, -1, 0, 10675, -34782},     {0, 0, 3, 0, 10034, -23210},
    {4, 0, -2, 0, 8548, -21636},      {2, 1, -1, 0, -7888, 24208},      {2, 1, 0, 0, -6766, 30824},
    {1, 0, -1, 0, -5163, -8379},      {1, 1, 0, 0, 4987, -16675},       {2, -1, 1, 0, 4036, -12831},
    {2, 0, 2, 0, 3994, -10445},       {4, 0, 0, 0, 3861, -11650},       {2, 0, -3, 0, 3665, 14403},
    {0, 1, -2, 0, -2689, -7003},      {2, 0, -1, 2, -2602, 0},          {2, -1, -2, 0, 2390, 10056},
    {1, 0, 1, 0, -2348, 6322},        {2, -2, 0, 0, 2236, -9884},       {0, 1, 2, 0, -2120, 5751},
    {0, 2, 0, 0, -2069, 0},           {2, -2, -1, 0, 2048, -4950},      {2, 0, 1, -2, -1773, 4130},
    {2, 0, 0, 2, -1595, 0},           {4, -1, -1, 0, 1215, -3958},      {0, 0, 2, 2, -1110, 0},
    {3, 0, -1, 0, -892, 3258},        {2, 1, 1, 0, -810, 2616},         {4, -1, -2, 0, 759, -1897},
    {0, 2, -1, 0, -713, -2117},       {2, 2, -1, 0, -700, 2354},        {2, 1, -2, 0, 691, 0},
    {2, -1, 0, -2, 596, 0},           {4, 0, 1, 0, 549, -1423},         {0, 0, 4, 0, 537, -1117},
    {4, -1, 0, 0, 520, -1571},        {1, 0, -2, 0, -487, -1739},       {2, 1, 0, -2, -399, 0},
    {0, 0, 2, -2, -381, -4421},       {1, 1, 1, 0, 351, 0},             {3, 0, -2, 0, -340, 0},
    {4, 0, -3, 0, 330, 0},            {2, -1, 2, 0, 327, 0},            {0, 2, 1, 0, -323, 1165},
    {1, 1, -1, 0, 299, 0},            {2, 0, 3, 0, 294, 0},             {2, 0, -1, -2, 0, 8752},
};

const TermB MOON_B[] = {
    {0, 0, 0, 1, 5128122}, {0, 0, 1, 1, 280602},  {0, 0, 1, -1, 277693}, {2, 0, 0, -1, 173237}, {2, 0, -1, 1, 55413},
    {2, 0, -1, -1, 46271}, {2, 0, 0, 1, 32573},   {0, 0, 2, 1, 17198},   {2, 0, 1, -1, 9266},   {0, 0, 2, -1, 8822},
    {2, -1, 0, -1, 8216},  {2, 0, -2, -1, 4324},  {2, 0, 1, 1, 4200},    {2, 1, 0, -1, -3359},  {2, -1, -1, 1, 2463},
    {2, -1, 0, 1, 2211},   {2, -1, -1, -1, 2065}, {0, 1, -1, -1, -1870}, {4, 0, -1, -1, 1828},  {0, 1, 0, 1, -1794},
    {0, 0, 0, 3, -1749},   {0, 1, -1, 1, -1565},  {1, 0, 0, 1, -1491},   {0, 1, 1, 1, -1475},   {0, 1, 1, -1, -1410},
    {0, 1, 0, -1, -1344},  {1, 0, 0, -1, -1335},  {0, 0, 3, 1, 1107},    {4, 0, 0, -1, 1021},   {4, 0, -1, 1, 833},
    {0, 0, 1, -3, 777},    {4, 0, -2, 1, 671},    {2, 0, 0, -3, 607},    {2, 0, 2, -1, 596},    {2, -1, 1, -1, 491},
    {2, 0, -2, 1, -451},   {0, 0, 3, -1, 439},    {2, 0, 2, 1, 422},     {2, 0, -3, -1, 421},   {2, 1, -1, 1, -366},
    {2, 1, 0, 1, -351},    {4, 0, 0, 1, 331},     {2, -1, 1, 1, 315},    {2, -2, 0, -1, 302},   {0, 0, 1, 3, -283},
    {2, 1, 1, -1, -229},   {1, 1, 0, -1, 223},    {1, 1, 0, 1, 223},     {0, 1, -2, -1, -220},  {2, 1, -1, -1, -220},
    {1, 0, 1, 1, -185},    {2, -1, -2, -1, 181},  {0, 1, 2, 1, -177},    {4, 0, -2, -1, 176},   {4, -1, -1, -1, 166},
    {1, 0, 1, -1, -164},   {4, 0, 1, -1, 132},    {1, 0, -1, -1, -119},  {4, -1, 0, -1, 115},   {2, -2, 0, 1, 107},
};

struct Moon { Place place; double F, node; };   // and the mean argument of latitude, and the mean node

Moon moonAt(double T) {
    const double T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    const double Lp = (218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000) * D2R;   // mean longitude
    const double D = (297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000) * D2R;    // mean elongation
    const double M = (357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000) * D2R;                    // the Sun's mean anomaly
    const double Mp = (134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000) * D2R;     // the Moon's
    const double F = (93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000) * D2R;    // argument of latitude
    const double A1 = (119.75 + 131.849 * T) * D2R, A2 = (53.09 + 479264.290 * T) * D2R, A3 = (313.45 + 481266.484 * T) * D2R;
    const double E = 1 - 0.002516 * T - 0.0000074 * T2;   // the Earth's orbit is growing rounder
    auto weight = [E](int m) { return m == 0 ? 1.0 : (m == 1 || m == -1 ? E : E * E); };
    double sl = 0, sr = 0, sb = 0;
    for (const TermLR& t : MOON_LR) {
        const double arg = t.d * D + t.m * M + t.mp * Mp + t.f * F, w = weight(t.m);
        sl += w * t.l * std::sin(arg);
        sr += w * t.r * std::cos(arg);
    }
    for (const TermB& t : MOON_B) sb += weight(t.m) * t.b * std::sin(t.d * D + t.m * M + t.mp * Mp + t.f * F);
    sl += 3958 * std::sin(A1) + 1962 * std::sin(Lp - F) + 318 * std::sin(A2);   // Venus, the Earth's flattening, Jupiter
    sb += -2235 * std::sin(Lp) + 382 * std::sin(A3) + 175 * std::sin(A1 - F) + 175 * std::sin(A1 + F) + 127 * std::sin(Lp - Mp) -
          115 * std::sin(Lp + Mp);
    const double node = (125.0445479 - 1934.1362891 * T + 0.0020754 * T2 + T3 / 467441 - T4 / 60616000) * D2R;
    return {{turn(Lp + sl * 1e-6 * D2R), sb * 1e-6 * D2R, 385000560.0 + sr}, F, node};
}

// ---- frames --------------------------------------------------------------------------------------

V3 eclToEq(V3 v, double eps) {   // from the ecliptic of the date to its equator
    const double c = std::cos(eps), s = std::sin(eps);
    return {v.x, v.y * c - v.z * s, v.y * s + v.z * c};
}

V3 fromLonLat(double lon, double lat) { return {std::cos(lat) * std::cos(lon), std::cos(lat) * std::sin(lon), std::sin(lat)}; }

// From the mean equator and equinox of J2000.0 to those of the date (Meeus 21.2 and 21.4).
V3 precess(V3 v, double T) {
    const double zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * ARCSEC;
    const double z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * ARCSEC;
    const double th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * ARCSEC;
    const double x1 = v.x * std::cos(zeta) - v.y * std::sin(zeta), y1 = v.x * std::sin(zeta) + v.y * std::cos(zeta);
    const double x2 = x1 * std::cos(th) - v.z * std::sin(th), z2 = x1 * std::sin(th) + v.z * std::cos(th);
    return {x2 * std::cos(z) - y1 * std::sin(z), x2 * std::sin(z) + y1 * std::cos(z), z2};
}

// From the mean equator and equinox of the date to the true ones: through the ecliptic, where the
// nutation is a turn in longitude and a change of tilt.
V3 nutate(V3 v, const Tilt& n) {
    const double c0 = std::cos(n.eps0), s0 = std::sin(n.eps0);
    const double ye = v.y * c0 + v.z * s0, ze = -v.y * s0 + v.z * c0;
    const double x1 = v.x * std::cos(n.dpsi) - ye * std::sin(n.dpsi), y1 = v.x * std::sin(n.dpsi) + ye * std::cos(n.dpsi);
    return eclToEq({x1, y1, ze}, n.eps);
}

// From the true equator and equinox of the date to ECI: back by Greenwich's sidereal time at the epoch.
V3 toEci(V3 v, double gast0) {
    const double c = std::cos(gast0), s = std::sin(gast0);
    return {c * v.x + s * v.y, -s * v.x + c * v.y, v.z};
}

double centuries(double jde) { return (jde - J2000) / 36525; }

double apparentSun(const Place& s, const Tilt& n) { return s.lon - 20.4898 * ARCSEC / (s.dist / AU) + n.dpsi; }   // aberration, nutation

// ---- the sky at a moment of the flight -----------------------------------------------------------

struct Sky {
    double gast0;                     // Greenwich apparent sidereal time at the epoch
    V3 sun, moon;                     // unit, ECI, from the Earth's centre
    double sunDist, moonDist;         // m
    V3 pole, face;                    // the Moon's north pole and the middle of its near side, unit, ECI
    double phase, lit, elong;
    V3 jx, jy, jz;                    // the axes of J2000.0, ECI
};

Sky skyAt(double t) {
    Sky k;
    // Where Greenwich's meridian, the ECI x axis, stood among the stars at the epoch.
    const Tilt n0 = tilt(centuries(epochJd + TT_MINUS_UTC / 86400));
    k.gast0 = turn(gmst(epochJd) + n0.dpsi * std::cos(n0.eps));

    const double T = ((epochJd - J2000) + (t + TT_MINUS_UTC) / 86400) / 36525;   // Terrestrial Time now
    const Tilt n = tilt(T);
    const Place s = sunAt(T);
    const Moon m = moonAt(T);
    const double sunLon = apparentSun(s, n), moonLon = m.place.lon + n.dpsi;
    const V3 sunEq = eclToEq(fromLonLat(sunLon, 0), n.eps), moonEq = eclToEq(fromLonLat(moonLon, m.place.lat), n.eps);
    k.sun = toEci(sunEq, k.gast0);
    k.moon = toEci(moonEq, k.gast0);
    k.sunDist = s.dist;
    k.moonDist = m.place.dist;

    // The phase: the angle at the Moon between the Earth and the Sun.
    const V3 toSun = sunEq * s.dist - moonEq * m.place.dist;
    k.phase = std::acos(clampd(dot(unit(toSun), moonEq * -1.0), -1, 1));
    k.lit = 0.5 * (1 + std::cos(k.phase));
    k.elong = turn(moonLon - sunLon);

    // The Moon's attitude, by Cassini's laws: its equator is tilted MOON_TILT to the ecliptic and
    // crosses it, going south, where its orbit crosses going north; and it turns once a month, so that
    // its prime meridian stands opposite the mean Moon's place in its orbit, the argument of latitude F
    // past that node. What is left over between this even turning and the Moon's uneven flight is the
    // libration (Meeus ch. 53, the optical part; the physical part, 0.04 deg, is left out).
    const double om = m.node + n.dpsi, ci = std::cos(MOON_TILT), si = std::sin(MOON_TILT);
    const V3 e1{std::cos(om), std::sin(om), 0}, e2{-std::sin(om) * ci, std::cos(om) * ci, -si};
    const V3 pole{-std::sin(om) * si, std::cos(om) * si, ci};
    const V3 face = (e1 * std::cos(m.F) + e2 * std::sin(m.F)) * -1.0;
    k.pole = toEci(eclToEq(pole, n.eps), k.gast0);
    k.face = toEci(eclToEq(face, n.eps), k.gast0);

    k.jx = toEci(nutate(precess({1, 0, 0}, T), n), k.gast0);
    k.jy = toEci(nutate(precess({0, 1, 0}, T), n), k.gast0);
    k.jz = toEci(nutate(precess({0, 0, 1}, T), n), k.gast0);
    return k;
}

void put(int at, V3 v) { out[at] = v.x; out[at + 1] = v.y; out[at + 2] = v.z; }

}   // namespace

void skyReset(const Site&) { sunEci = skyAt(0).sun; }

// The sky's readouts for the state's moment, and the Sun's direction for the flight's own.
void skyWriteOut(const State& s) {
    const double t = timeOf(s);
    const Sky k = skyAt(t);
    sunEci = k.sun;
    out[OC_SKY_JD] = epochJd + t / 86400;
    out[OC_SKY_GAST] = turn(k.gast0 + WE * t);
    put(OC_SKY_SUN_E, siteDir(k.sun, t));
    out[OC_SKY_SUN_DIST] = k.sunDist;
    put(OC_SKY_MOON_E, siteDir(k.moon, t));
    out[OC_SKY_MOON_DIST] = k.moonDist;
    put(OC_SKY_MOON_POLE_E, siteDir(k.pole, t));
    put(OC_SKY_MOON_FACE_E, siteDir(k.face, t));
    out[OC_SKY_MOON_PHASE] = k.phase;
    out[OC_SKY_MOON_LIT] = k.lit;
    out[OC_SKY_MOON_ELONG] = k.elong;
    put(OC_SKY_J2000_XE, siteDir(k.jx, t));
    put(OC_SKY_J2000_YE, siteDir(k.jy, t));
    put(OC_SKY_J2000_ZE, siteDir(k.jz, t));
}

}   // namespace oc

using namespace oc;

extern "C" {

int oc_sky_set_epoch(double jd_utc) {
    if (!(jd_utc >= JD_1900 && jd_utc <= JD_2100)) return 0;   // refused, not clamped; a NaN fails here too
    epochJd = jd_utc;
    return 1;
}

double oc_sky_epoch(void) { return epochJd; }

double oc_sky_julian_date(int year, int month, int day, int hour, int minute, double second) {   // Meeus ch. 7
    int y = year, m = month;
    if (m <= 2) { y -= 1; m += 12; }
    const double a = std::floor(y / 100.0), b = 2 - a + std::floor(a / 4);
    return std::floor(365.25 * (y + 4716)) + std::floor(30.6001 * (m + 1)) + day + b - 1524.5 + (hour + (minute + second / 60) / 60) / 24;
}

const double* oc_sky_out(void) { return oc::out; }
int oc_sky_out_len(void) { return OC_SKY_COUNT; }

double oc_sky_gmst(double jd_ut) { return gmst(jd_ut); }

void oc_sky_sun(double jde, double* out5) {
    const double T = centuries(jde);
    const Tilt n = tilt(T);
    const Place s = sunAt(T);
    const double lon = turn(apparentSun(s, n));
    const V3 v = eclToEq(fromLonLat(lon, 0), n.eps);
    out5[0] = s.lon;
    out5[1] = s.dist;
    out5[2] = lon;
    out5[3] = turn(std::atan2(v.y, v.x));
    out5[4] = std::asin(clampd(v.z, -1, 1));
}

void oc_sky_moon(double jde, double* out6) {
    const double T = centuries(jde);
    const Tilt n = tilt(T);
    const Moon m = moonAt(T);
    const double lon = turn(m.place.lon + n.dpsi);
    const V3 v = eclToEq(fromLonLat(lon, m.place.lat), n.eps);
    out6[0] = m.place.lon;
    out6[1] = m.place.lat;
    out6[2] = m.place.dist;
    out6[3] = lon;
    out6[4] = turn(std::atan2(v.y, v.x));
    out6[5] = std::asin(clampd(v.z, -1, 1));
}

void oc_sky_precess(double jde, double ra0, double dec0, double* ra, double* dec) {
    const V3 v = precess(fromLonLat(ra0, dec0), centuries(jde));
    *ra = turn(std::atan2(v.y, v.x));
    *dec = std::asin(clampd(v.z, -1, 1));
}

}   // extern "C"
