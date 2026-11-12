// The sky's tests (orbit_sky.h): where the Sun and the Moon are, how the Moon is turned and lit, and
// where the Earth stands under the stars. Each method against its textbook's worked example (J. Meeus,
// Astronomical Algorithms, 2nd ed.), to the digits the book prints; then the whole chain, through the
// readouts, against JPL's Horizons system (ephemeris DE441, queried 2026-11-12 for the geocentre and for
// KDFW 17C's threshold, 32.91569901 N 97.02600098 W, 171 m, airless), which shares nothing with the book.
// Run one by name or all; ctest runs each line below that reads "// TEST: <name>". GPLv3.
//
// TEST: julian_date
// TEST: sidereal_time
// TEST: sun_meeus_25a
// TEST: moon_meeus_47a
// TEST: precession_meeus_21b
// TEST: moon_phase_meeus_48a
// TEST: moon_libration_meeus_53a
// TEST: default_epoch_against_horizons
// TEST: full_moon_over_dallas
// TEST: light_at_the_start_and_at_the_ring
// TEST: sky_moves
// TEST: eclipse_over_kdfw
// TEST: epoch_is_settable
// TEST: deterministic
// TEST: readouts_block

#include "../core/orbit_core.h"
#include "../core/orbit_sky.h"

#include <cmath>
#include <cstdio>
#include <cstring>

namespace {

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

const double PI = 3.14159265358979323846, D2R = PI / 180, R2D = 180 / PI;
const double AU = 149597870700.0, RE = 6371000.0;
const double LAT = 32.91569901, LON = -97.02600098, HDG = 180.3;   // KDFW 17C, docs/provenance.md 1f
const double TT_UTC = 69.184 / 86400;   // days: what the core adds to UTC for Terrestrial Time

struct V { double x, y, z; };
V operator+(V a, V b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
V operator-(V a, V b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
V operator*(V a, double s) { return {a.x * s, a.y * s, a.z * s}; }
double dot(V a, V b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
V cross(V a, V b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
double norm(V a) { return std::sqrt(dot(a, a)); }
V unit(V a) { return a * (1 / norm(a)); }
double angle(V a, V b) { return std::atan2(norm(cross(a, b)), dot(a, b)) * R2D; }   // degrees; sound for small angles
double wrap180(double d) { return d - 360 * std::floor((d + 180) / 360); }
V turnAbout(V v, V axis, double deg) {   // Rodrigues
    const double c = std::cos(deg * D2R), s = std::sin(deg * D2R);
    return v * c + cross(axis, v) * s + axis * (dot(axis, v) * (1 - c));
}

double sky(int i) { return oc_sky_out()[i]; }
V vec(int at) { return {sky(at), sky(at + 1), sky(at + 2)}; }   // site frame: east, north, up
bool finite() {
    for (int i = 0; i < oc_sky_out_len(); ++i)
        if (!std::isfinite(sky(i))) return false;
    return true;
}

// A body seen from the start point, which is RE above the Earth's centre along the site's up.
V fromStart(int at, int distAt) { return vec(at) * sky(distAt) - V{0, 0, RE}; }
double azimuth(V v) { return std::fmod(std::atan2(v.x, v.y) * R2D + 360, 360); }   // from north through east
double elevation(V v) { return std::asin(v.z / norm(v)) * R2D; }

// The start point is KDFW 17C at this date, the craft parked on the runway's end.
void startAt(double jdUtc) {
    const int taken = oc_sky_set_epoch(jdUtc);
    CHECK(taken == 1, "the epoch %.6f was refused", jdUtc);
    oc_reset(LAT, LON, HDG);
}

// Where the Earth is, seen from the Moon, on the Moon's own globe: degrees east and north of the middle
// of the near side. And the position angle of the Moon's north pole in the sky, from celestial north
// through east.
void moonAttitude(double* subLon, double* subLat, double* poleAngle) {
    const V moon = vec(OC_SKY_MOON_E), pole = vec(OC_SKY_MOON_POLE_E), face = vec(OC_SKY_MOON_FACE_E);
    const V east = cross(pole, face), earth = moon * -1.0;
    *subLon = std::atan2(dot(earth, east), dot(earth, face)) * R2D;
    *subLat = std::asin(dot(earth, pole)) * R2D;
    const V axis{0, std::cos(LAT * D2R), std::sin(LAT * D2R)};   // the Earth's pole in the site frame
    const V north = unit(axis - moon * dot(axis, moon)), eastSky = cross(north, moon);
    *poleAngle = std::atan2(dot(pole, eastSky), dot(pole, north)) * R2D;
}

// ---- the methods, against the book's worked examples ----------------------------------------------

// Meeus ch. 7: the Julian Date of a calendar date. Example 7.a (Sputnik's launch), the book's table, and
// three dates as Horizons prints them.
void julianDate() {
    struct Row { int y, m, d, h, mi; double s, jd; };
    const Row rows[] = {
        {1957, 10, 4, 19, 26, 24.0, 2436116.31}, {2000, 1, 1, 12, 0, 0, 2451545.0}, {1987, 1, 27, 0, 0, 0, 2446822.5},
        {1987, 6, 19, 12, 0, 0, 2446966.0},      {1988, 1, 27, 0, 0, 0, 2447187.5}, {1900, 1, 1, 0, 0, 0, 2415020.5},
        {1600, 12, 31, 0, 0, 0, 2305812.5},      {1992, 4, 12, 0, 0, 0, 2448724.5}, {2026, 11, 12, 19, 0, 0, OC_SKY_DEFAULT_EPOCH},
        {1969, 7, 20, 20, 17, 40.0, 2440423.345601852}, {2024, 4, 8, 18, 36, 0, 2460409.275}, {2026, 12, 24, 3, 0, 0, 2461398.625},   // Horizons' own
    };
    for (const Row& r : rows) {
        const double jd = oc_sky_julian_date(r.y, r.m, r.d, r.h, r.mi, r.s);
        CHECK(std::fabs(jd - r.jd) < 1e-8, "%d-%02d-%02d %02d:%02d:%02.0f: %.8f, the book %.8f", r.y, r.m, r.d, r.h, r.mi, r.s, jd, r.jd);
    }
}

// Meeus ch. 12. Example 12.a: on 1987 April 10 at 0 h UT, the mean sidereal time at Greenwich is
// 13h10m46.3668s and the apparent 13h10m46.1351s; 12.b: at 19h21m00s UT the mean is 128.7378734 deg.
// And at the default epoch, Horizons' apparent sidereal time at KDFW, less its longitude.
void siderealTime() {
    const double a = oc_sky_gmst(2446895.5) * R2D, b = oc_sky_gmst(2446896.30625) * R2D;
    const double bookA = (13 + 10 / 60.0 + 46.3668 / 3600) * 15;
    CHECK(std::fabs(a - bookA) < 1e-6, "mean sidereal time, 12.a: %.7f deg, the book %.7f", a, bookA);
    CHECK(std::fabs(b - 128.7378734) < 1e-6, "mean sidereal time, 12.b: %.7f deg, the book 128.7378734", b);
    startAt(2446895.5);
    const double app = sky(OC_SKY_GAST) * R2D, bookApp = (13 + 10 / 60.0 + 46.1351 / 3600) * 15;
    CHECK(std::fabs(app - bookApp) < 2e-4, "apparent sidereal time, 12.a: %.6f deg, the book %.6f", app, bookApp);   // 0.5 arcsec of nutation
    startAt(OC_SKY_DEFAULT_EPOCH);
    const double here = sky(OC_SKY_GAST) * R2D, horizons = 15.9930546285 * 15 - LON;
    CHECK(std::fabs(wrap180(here - horizons)) < 1e-3, "apparent sidereal time at the epoch: %.6f deg, Horizons %.6f", here, horizons);
    std::printf("  sidereal time: %.7f and %.7f deg (the book: %.7f, 128.7378734); at the epoch %.5f deg (Horizons %.5f)\n", a, b, bookA, here, horizons);
}

// Meeus ch. 25, example 25.a: the Sun on 1992 October 13 at 0 h TD by the low-accuracy method. The
// book's shortcut for the nutation is one term; the four used here differ from it by an arcsecond.
// Example 25.b gives the same moment from the full theory (VSOP87): the method claims 0.01 deg of it.
void sunMeeus25a() {
    double s[5];
    oc_sky_sun(2448908.5, s);
    CHECK(std::fabs(s[0] * R2D - 199.90988) < 2e-5, "true longitude %.5f deg, the book 199.90988", s[0] * R2D);
    CHECK(std::fabs(s[1] / AU - 0.99766) < 1e-5, "distance %.5f AU, the book 0.99766", s[1] / AU);
    CHECK(std::fabs(s[2] * R2D - 199.90895) < 5e-4, "apparent longitude %.5f deg, the book 199.90895", s[2] * R2D);
    CHECK(std::fabs(s[3] * R2D - 198.38083) < 5e-4, "right ascension %.5f deg, the book 198.38083", s[3] * R2D);
    CHECK(std::fabs(s[4] * R2D + 7.78507) < 5e-4, "declination %.5f deg, the book -7.78507", s[4] * R2D);
    const double ra = (13 + 13 / 60.0 + 30.749 / 3600) * 15, dec = -(7 + 47 / 60.0 + 1.74 / 3600);   // 25.b
    CHECK(std::fabs(s[3] * R2D - ra) < 0.01 && std::fabs(s[4] * R2D - dec) < 0.01, "from the full theory: %.4f and %.4f deg", s[3] * R2D - ra, s[4] * R2D - dec);
    std::printf("  the Sun, 25.a: longitude %.5f deg, %.5f AU, RA %.5f, Dec %.5f; from the full theory %.4f and %.4f deg\n", s[0] * R2D, s[1] / AU,
                s[3] * R2D, s[4] * R2D, s[3] * R2D - ra, s[4] * R2D - dec);
}

// Meeus ch. 47, example 47.a: the Moon on 1992 April 12 at 0 h TD. The book sums its tables to the
// millionth of a degree and the tenth of a kilometre; so must these.
void moonMeeus47a() {
    double m[6];
    oc_sky_moon(2448724.5, m);
    CHECK(std::fabs(m[0] * R2D - 133.162655) < 2e-6, "longitude %.6f deg, the book 133.162655", m[0] * R2D);
    CHECK(std::fabs(m[1] * R2D + 3.229126) < 2e-6, "latitude %.6f deg, the book -3.229126", m[1] * R2D);
    CHECK(std::fabs(m[2] / 1000 - 368409.7) < 0.1, "distance %.1f km, the book 368409.7", m[2] / 1000);
    CHECK(std::fabs(m[3] * R2D - 133.167265) < 2e-4, "apparent longitude %.6f deg, the book 133.167265", m[3] * R2D);
    CHECK(std::fabs(m[4] * R2D - 134.688470) < 3e-4, "right ascension %.6f deg, the book 134.688470", m[4] * R2D);
    CHECK(std::fabs(m[5] * R2D - 13.768368) < 3e-4, "declination %.6f deg, the book 13.768368", m[5] * R2D);
    std::printf("  the Moon, 47.a: longitude %.6f, latitude %.6f deg, %.1f km; RA %.6f, Dec %.6f\n", m[0] * R2D, m[1] * R2D, m[2] / 1000, m[4] * R2D,
                m[5] * R2D);
}

// Meeus ch. 21, example 21.b: Theta Persei's J2000.0 place carried to 2028 November 13.19 TD.
void precessionMeeus21b() {
    double ra, dec;
    oc_sky_precess(2462088.69, 41.054063 * D2R, 49.227750 * D2R, &ra, &dec);
    CHECK(std::fabs(ra * R2D - 41.547214) < 2e-6, "right ascension %.6f deg, the book 41.547214", ra * R2D);
    CHECK(std::fabs(dec * R2D - 49.348483) < 2e-6, "declination %.6f deg, the book 49.348483", dec * R2D);
    std::printf("  precession, 21.b: RA %.6f, Dec %.6f deg\n", ra * R2D, dec * R2D);
    oc_sky_precess(2451545.0, 1.0, 0.5, &ra, &dec);   // at J2000.0 itself nothing moves
    CHECK(std::fabs(ra - 1.0) < 1e-12 && std::fabs(dec - 0.5) < 1e-12, "at J2000.0: %.12f %.12f", ra, dec);
}

// Meeus ch. 48, example 48.a: on 1992 April 12 at 0 h TD the phase angle is 69.0756 deg and 0.6786 of
// the disc is lit. Through the readouts, with the epoch set so that the core's Terrestrial Time is the
// book's.
void moonPhaseMeeus48a() {
    startAt(2448724.5 - TT_UTC);
    const double i = sky(OC_SKY_MOON_PHASE) * R2D, k = sky(OC_SKY_MOON_LIT);
    CHECK(std::fabs(i - 69.0756) < 2e-3, "phase angle %.4f deg, the book 69.0756", i);
    CHECK(std::fabs(k - 0.6786) < 1e-4, "lit %.5f, the book 0.6786", k);
    CHECK(sky(OC_SKY_MOON_ELONG) > 0 && sky(OC_SKY_MOON_ELONG) < PI, "waxing: %.3f deg east of the Sun", sky(OC_SKY_MOON_ELONG) * R2D);
    std::printf("  the phase, 48.a: %.4f deg, %.5f lit\n", i, k);
}

// Meeus ch. 53, example 53.a, the same moment: the Earth stands over the Moon's longitude -1.206 and
// latitude +4.194 deg (the optical librations), and the Moon's pole is turned 15.08 deg east of north.
// The book's 15.08 carries the physical libration, a few hundredths of a degree, which this leaves out.
void moonLibrationMeeus53a() {
    startAt(2448724.5 - TT_UTC);
    double lon, lat, pa;
    moonAttitude(&lon, &lat, &pa);
    CHECK(std::fabs(lon + 1.206) < 1e-3, "libration in longitude %.4f deg, the book -1.206", lon);
    CHECK(std::fabs(lat - 4.194) < 1e-3, "libration in latitude %.4f deg, the book +4.194", lat);
    CHECK(std::fabs(pa - 15.08) < 0.03, "the pole's position angle %.3f deg, the book 15.08", pa);
    std::printf("  the libration, 53.a: %.4f and %.4f deg; the pole %.3f deg east of north\n", lon, lat, pa);
}

// ---- the whole chain, against JPL Horizons --------------------------------------------------------

// The default epoch, 2026 November 12 at 19:00:00 UTC. From the Earth's centre: the Sun's and the Moon's
// apparent places, the Moon's distance, phase and attitude. From KDFW 17C's threshold: where they stand
// in the sky, the Moon lifted and shifted by its parallax (0.83 deg there). Horizons' site is on the
// real, flattened Earth and the core's on a sphere with the same vertical: the two eyes are 20 km apart,
// which moves the Moon by 0.003 deg.
void defaultEpochAgainstHorizons() {
    const double jd = OC_SKY_DEFAULT_EPOCH;
    double s[5], m[6];
    oc_sky_sun(jd + TT_UTC, s);
    oc_sky_moon(jd + TT_UTC, m);
    const double sunRa = 227.967578518, sunDec = -17.848957361, sunAu = 0.98982192995758;
    const double moonRa = 269.190499574, moonDec = -27.599575445, moonKm = 0.00270853836651 * AU / 1000;
    CHECK(std::fabs(wrap180(s[3] * R2D - sunRa)) < 0.01 && std::fabs(s[4] * R2D - sunDec) < 0.01, "the Sun's place: %.5f %.5f deg, Horizons %.5f %.5f",
          s[3] * R2D, s[4] * R2D, sunRa, sunDec);
    CHECK(std::fabs(s[1] / AU - sunAu) < 1e-4, "the Sun's distance %.6f AU, Horizons %.6f", s[1] / AU, sunAu);
    CHECK(std::fabs(wrap180(m[4] * R2D - moonRa)) < 0.004 && std::fabs(m[5] * R2D - moonDec) < 0.004, "the Moon's place: %.5f %.5f deg, Horizons %.5f %.5f",
          m[4] * R2D, m[5] * R2D, moonRa, moonDec);
    CHECK(std::fabs(m[2] / 1000 - moonKm) < 60, "the Moon's distance %.1f km, Horizons %.1f", m[2] / 1000, moonKm);

    startAt(jd);
    CHECK(std::fabs(sky(OC_SKY_JD) - jd) < 1e-9, "the date %.9f", sky(OC_SKY_JD));
    const V sun = fromStart(OC_SKY_SUN_E, OC_SKY_SUN_DIST), moon = fromStart(OC_SKY_MOON_E, OC_SKY_MOON_DIST);
    CHECK(std::fabs(azimuth(sun) - 194.451587) < 0.01 && std::fabs(elevation(sun) - 37.968391) < 0.01, "the Sun over KDFW: az %.4f el %.4f, Horizons 194.4516 37.9684",
          azimuth(sun), elevation(sun));
    CHECK(std::fabs(azimuth(moon) - 151.804380) < 0.01 && std::fabs(elevation(moon) - 22.562781) < 0.01, "the Moon over KDFW: az %.4f el %.4f, Horizons 151.8044 22.5628",
          azimuth(moon), elevation(moon));
    CHECK(std::fabs(norm(moon) / 1000 - 0.00269180432298 * AU / 1000) < 60, "the Moon from KDFW: %.1f km", norm(moon) / 1000);
    const double lifted = std::asin(sky(OC_SKY_MOON_U)) * R2D - elevation(moon);
    CHECK(lifted > 0.8 && lifted < 0.86, "parallax lowers the Moon %.3f deg at KDFW", lifted);
    // a thin waxing crescent, 39 degrees east of the Sun
    CHECK(std::fabs(sky(OC_SKY_MOON_LIT) - 0.1123284) < 5e-4, "lit %.5f, Horizons 0.11233", sky(OC_SKY_MOON_LIT));
    CHECK(std::fabs(sky(OC_SKY_MOON_PHASE) * R2D - 140.8406) < 0.01, "phase angle %.4f deg, Horizons 140.8406", sky(OC_SKY_MOON_PHASE) * R2D);
    CHECK(std::fabs(sky(OC_SKY_MOON_ELONG) * R2D - (269.2807216 - 230.4074290)) < 0.01, "east of the Sun by %.4f deg, Horizons 38.8733", sky(OC_SKY_MOON_ELONG) * R2D);
    CHECK(std::fabs(angle(vec(OC_SKY_SUN_E), vec(OC_SKY_MOON_E)) - 39.0605) < 0.01, "from the Sun %.4f deg, Horizons 39.0605", angle(vec(OC_SKY_SUN_E), vec(OC_SKY_MOON_E)));
    double lon, lat, pa;
    moonAttitude(&lon, &lat, &pa);   // Horizons has the physical libration too: 0.04 deg
    CHECK(std::fabs(lon - 0.401006) < 0.05 && std::fabs(lat - 5.474941) < 0.05, "the Earth over the Moon's %.4f E %.4f N, Horizons 0.4010 5.4749", lon, lat);
    CHECK(std::fabs(pa - 1.1970) < 0.05, "the pole's position angle %.4f deg, Horizons 1.1970", pa);
    std::printf("  2026-11-12 19:00 UTC: the Sun az %.3f el %.3f, the Moon az %.3f el %.3f (Horizons: 194.452 37.968, 151.804 22.563);\n", azimuth(sun), elevation(sun),
                azimuth(moon), elevation(moon));
    std::printf("  Moon %.0f km, %.2f%% lit, phase angle %.3f deg, the Earth over %.3f E %.3f N, pole %.3f deg (Horizons: %.0f, 11.23, 140.841, 0.401 5.475, 1.197)\n",
                m[2] / 1000, 100 * sky(OC_SKY_MOON_LIT), sky(OC_SKY_MOON_PHASE) * R2D, lon, lat, pa, moonKm);
    std::printf("  from Horizons: the Sun %.1f and %.1f arcsec, the Moon %.1f and %.1f arcsec, %.0f km\n", wrap180(s[3] * R2D - sunRa) * 3600, (s[4] * R2D - sunDec) * 3600,
                wrap180(m[4] * R2D - moonRa) * 3600, (m[5] * R2D - moonDec) * 3600, m[2] / 1000 - moonKm);
}

// Another date, the page's ?date=2026-12-24T03:00Z: nine in the evening of the 23rd at KDFW, the Moon
// an hour and a half past full and near its perigee, rising in the east, the Sun long set.
void fullMoonOverDallas() {
    startAt(oc_sky_julian_date(2026, 12, 24, 3, 0, 0));
    const V sun = fromStart(OC_SKY_SUN_E, OC_SKY_SUN_DIST), moon = fromStart(OC_SKY_MOON_E, OC_SKY_MOON_DIST);
    CHECK(std::fabs(azimuth(sun) - 267.958766) < 0.01 && std::fabs(elevation(sun) + 43.760623) < 0.01, "the Sun under KDFW: az %.4f el %.4f, Horizons 267.9588 -43.7606",
          azimuth(sun), elevation(sun));
    CHECK(std::fabs(azimuth(moon) - 82.522292) < 0.012 && std::fabs(elevation(moon) - 43.542506) < 0.012, "the Moon over KDFW: az %.4f el %.4f, Horizons 82.5223 43.5425",
          azimuth(moon), elevation(moon));
    CHECK(std::fabs(sky(OC_SKY_MOON_LIT) - 0.9988244) < 2e-4, "lit %.5f, Horizons 0.99882", sky(OC_SKY_MOON_LIT));
    CHECK(sky(OC_SKY_MOON_ELONG) > PI, "past full: %.3f deg round from the Sun", sky(OC_SKY_MOON_ELONG) * R2D);
    CHECK(std::fabs(sky(OC_SKY_MOON_DIST) / 1000 - 0.00238441659131 * AU / 1000) < 60, "the Moon %.1f km off", sky(OC_SKY_MOON_DIST) / 1000);
    double lon, lat, pa;
    moonAttitude(&lon, &lat, &pa);
    CHECK(std::fabs(lon - (359.678667 - 360)) < 0.05 && std::fabs(lat + 4.998379) < 0.05, "the Earth over the Moon's %.4f E %.4f N, Horizons -0.3213 -4.9984", lon, lat);
    std::printf("  2026-12-24 03:00 UTC: the Moon az %.3f el %.3f, %.2f%% lit, %.0f km (Horizons: 82.522 43.543, 99.88, %.0f); the Sun el %.2f\n", azimuth(moon),
                elevation(moon), 100 * sky(OC_SKY_MOON_LIT), sky(OC_SKY_MOON_DIST) / 1000, 0.00238441659131 * AU / 1000, elevation(sun));
    oc_sky_set_epoch(OC_SKY_DEFAULT_EPOCH);
}

// The default epoch is chosen for the flight's light: early afternoon on the runway, the Sun high in the
// south-south-west, and still afternoon where the crew reaches the Ring, a quarter of an hour and some
// thirty degrees of longitude to the east.
void lightAtTheStartAndAtTheRing() {
    startAt(OC_SKY_DEFAULT_EPOCH);
    const double* o = oc_out();
    const V sun0{o[OC_SUN_E], o[OC_SUN_N], o[OC_SUN_U]};
    CHECK(std::fabs(norm(sun0) - 1) < 1e-12, "a unit vector: %.15f", norm(sun0));
    CHECK(sun0.z > 0.55 && sun0.z < 0.68 && sun0.y < -0.5 && sun0.x < 0, "the Sun at the start: east %.3f north %.3f up %.3f", sun0.x, sun0.y, sun0.z);
    const double el0 = std::asin(sun0.z) * R2D;
    while (o[OC_PHASE] != OC_PH_ORBIT && o[OC_T] < 1500 && o[OC_CRASHED] == 0) oc_step(50);
    CHECK(o[OC_PHASE] == OC_PH_ORBIT, "the crew reached orbit");
    const V up = unit(V{o[OC_SITE_E], o[OC_SITE_N], o[OC_SITE_U] + RE}), sun{o[OC_SUN_E], o[OC_SUN_N], o[OC_SUN_U]};
    const double el = std::asin(dot(sun, up)) * R2D, moonEl = std::asin(dot(vec(OC_SKY_MOON_E), up)) * R2D;
    CHECK(el > 12 && el < 40, "the Sun stands %.1f deg up where the crew reaches the Ring", el);
    CHECK(moonEl > 0, "and the Moon %.1f deg up", moonEl);
    std::printf("  the Sun %.1f deg up at the start; %.1f deg up at %.1f N %.1f E, T+%.0f s, where the crew reaches the Ring (the Moon %.1f deg up)\n", el0, el,
                o[OC_LAT_DEG], o[OC_LON_DEG], o[OC_T], moonEl);
}

// The sky moves with the flight's clock. In an hour the Moon goes half a degree eastward among the
// stars and the Sun a twenty-fourth of a degree, the stars keep their places, and all of them wheel
// over the start point with the Earth's turn. Horizons, for 20:00:00 UTC over KDFW.
void skyMoves() {
    startAt(OC_SKY_DEFAULT_EPOCH);
    const V x{sky(OC_SKY_J2000_XE), sky(OC_SKY_J2000_XN), sky(OC_SKY_J2000_XU)}, y = vec(OC_SKY_J2000_YE), z = vec(OC_SKY_J2000_ZE);
    auto amongStars = [](V v) { return V{dot(v, vec(OC_SKY_J2000_XE)), dot(v, vec(OC_SKY_J2000_YE)), dot(v, vec(OC_SKY_J2000_ZE))}; };
    const V moon0 = amongStars(vec(OC_SKY_MOON_E)), sun0 = amongStars(vec(OC_SKY_SUN_E));
    const double gast0 = sky(OC_SKY_GAST), lit0 = sky(OC_SKY_MOON_LIT);
    oc_step((int)(3600 / OC_DT + 0.5));
    CHECK(std::fabs(oc_out()[OC_T] - 3600) < 1e-6, "an hour: %.3f s", oc_out()[OC_T]);
    CHECK(std::fabs((sky(OC_SKY_JD) - OC_SKY_DEFAULT_EPOCH) * 24 - 1) < 1e-6, "the date moved %.6f h", (sky(OC_SKY_JD) - OC_SKY_DEFAULT_EPOCH) * 24);
    const V moon1 = amongStars(vec(OC_SKY_MOON_E)), sun1 = amongStars(vec(OC_SKY_SUN_E));
    const double moonMoved = angle(moon0, moon1), sunMoved = angle(sun0, sun1);
    // Horizons: the Moon from RA 269.190500 Dec -27.599575 to 269.747342 -27.577217 in the hour, 0.494 deg
    CHECK(std::fabs(moonMoved - 0.4940) < 0.003, "the Moon moved %.4f deg among the stars, Horizons 0.4940", moonMoved);
    CHECK(std::fabs(sunMoved - 0.0420) < 0.002, "the Sun moved %.4f deg, Horizons 0.0420", sunMoved);
    CHECK(std::atan2(moon1.y, moon1.x) > std::atan2(moon0.y, moon0.x), "eastward");
    CHECK(sky(OC_SKY_MOON_LIT) > lit0, "waxing: %.5f then %.5f", lit0, sky(OC_SKY_MOON_LIT));
    // the stars' frame turned westward about the Earth's axis by a sidereal hour, and by nothing else
    const double turned = wrap180((sky(OC_SKY_GAST) - gast0) * R2D);
    CHECK(std::fabs(turned - 15.041069) < 1e-5, "Greenwich turned %.6f deg under the stars in the hour", turned);
    const V axis{0, std::cos(LAT * D2R), std::sin(LAT * D2R)};   // the Earth's pole in the site frame
    const V before[3] = {x, y, z};
    const int after[3] = {OC_SKY_J2000_XE, OC_SKY_J2000_YE, OC_SKY_J2000_ZE};
    for (int i = 0; i < 3; ++i)
        CHECK(norm(turnAbout(before[i], axis, -15.041069) - vec(after[i])) < 1e-7, "the stars' axis %d is %.2e from a turn about the pole", i,
              norm(turnAbout(before[i], axis, -15.041069) - vec(after[i])));
    CHECK(std::fabs(angle(z, axis) - 0.1497) < 2e-3, "the pole of J2000.0 stands %.4f deg from the pole of the date", angle(z, axis));
    const V sun = fromStart(OC_SKY_SUN_E, OC_SKY_SUN_DIST), moon = fromStart(OC_SKY_MOON_E, OC_SKY_MOON_DIST);
    CHECK(std::fabs(azimuth(sun) - 210.955857) < 0.01 && std::fabs(elevation(sun) - 33.072618) < 0.01, "the Sun over KDFW an hour on: az %.4f el %.4f", azimuth(sun), elevation(sun));
    CHECK(std::fabs(azimuth(moon) - 165.144805) < 0.01 && std::fabs(elevation(moon) - 27.091258) < 0.01, "the Moon over KDFW an hour on: az %.4f el %.4f", azimuth(moon), elevation(moon));
    // Polaris, from its J2000.0 place (2h31m49.09s, +89d15'50.8"): 0.62 deg from the pole of 2026, over the north point
    const double ra = (2 + 31 / 60.0 + 49.09 / 3600) * 15 * D2R, dec = (89 + 15 / 60.0 + 50.8 / 3600) * D2R;
    const V star = vec(OC_SKY_J2000_XE) * (std::cos(dec) * std::cos(ra)) + vec(OC_SKY_J2000_YE) * (std::cos(dec) * std::sin(ra)) + vec(OC_SKY_J2000_ZE) * std::sin(dec);
    CHECK(std::fabs(angle(star, axis) - 0.623) < 0.01, "Polaris stands %.4f deg from the pole", angle(star, axis));
    CHECK(std::fabs(elevation(star) - LAT) < 0.63 && std::fabs(wrap180(azimuth(star))) < 0.8, "Polaris over the north point: az %.3f el %.3f", wrap180(azimuth(star)), elevation(star));
    std::printf("  in an hour the Moon moved %.4f deg among the stars and the Sun %.4f (Horizons: 0.4940, 0.0420); Polaris %.3f deg from the pole\n", moonMoved, sunMoved,
                angle(star, axis));
}

// On 8 April 2024 the Moon's shadow crossed Dallas. Horizons has the Sun's and the Moon's centres
// closest at KDFW 17C at 18:42:32 UTC, 0.0110 deg apart, the Moon's disc (0.2812 deg in radius) over
// the whole of the Sun's (0.2661). Everything is in that one number: both bodies, the parallax, the
// Earth's turn, the site. The Sun here is good to 0.01 deg, which the Moon takes 70 s to pass: so the
// centres come within 0.02 deg, within 75 s of that moment.
void eclipseOverKdfw() {
    startAt(oc_sky_julian_date(2024, 4, 8, 18, 36, 0));
    double best = 1e9, at = 0, moonRadius = 0, sunRadius = 0;
    for (int i = 0; i <= 13 * 60; ++i) {   // each second from 18:36 to 18:49
        const V sun = fromStart(OC_SKY_SUN_E, OC_SKY_SUN_DIST), moon = fromStart(OC_SKY_MOON_E, OC_SKY_MOON_DIST);
        const double sep = angle(sun, moon);
        if (sep < best) {
            best = sep;
            at = oc_out()[OC_T];
            moonRadius = std::asin(1737400.0 / norm(moon)) * R2D;
            sunRadius = std::asin(695700000.0 / norm(sun)) * R2D;
        }
        oc_step(50);
    }
    const double horizonsAt = 6 * 60 + 32;   // s after 18:36:00
    CHECK(best < 0.02, "the centres pass %.4f deg apart, Horizons 0.0110", best);
    CHECK(std::fabs(at - horizonsAt) < 75, "closest at 18:36 + %.0f s, Horizons + %.0f s", at, horizonsAt);
    CHECK(std::fabs(moonRadius - 2024.29 / 7200) < 1e-3 && std::fabs(sunRadius - 1915.64 / 7200) < 1e-3, "the discs: %.4f and %.4f deg", moonRadius, sunRadius);
    CHECK(moonRadius - best > 0.97 * sunRadius, "the Moon covers %.0f%% of the Sun's width", 50 * (moonRadius - best + sunRadius) / sunRadius);
    std::printf("  2024-04-08 over KDFW: the Sun's and the Moon's centres %.4f deg apart at 18:%02d:%02d UTC (Horizons: 0.0110 at 18:42:32); discs %.4f and %.4f deg\n",
                best, 36 + (int)at / 60, (int)at % 60, sunRadius, moonRadius);
    oc_sky_set_epoch(OC_SKY_DEFAULT_EPOCH);
}

// ---- the core's promises --------------------------------------------------------------------------

// The epoch is an input: taken between 1900 and 2100, refused outside or when it is not a number, and
// a refused one changes nothing. Nothing in the flight depends on it.
void epochIsSettable() {
    CHECK(oc_sky_set_epoch(OC_SKY_DEFAULT_EPOCH) == 1 && oc_sky_epoch() == OC_SKY_DEFAULT_EPOCH, "the default");
    const double other = oc_sky_julian_date(1969, 7, 20, 20, 17, 40);   // the Eagle has landed
    CHECK(oc_sky_set_epoch(other) == 1 && oc_sky_epoch() == other, "1969 was refused");
    CHECK(oc_sky_set_epoch(std::nan("")) == 0 && oc_sky_epoch() == other, "a date that is not a number was taken");
    CHECK(oc_sky_set_epoch(oc_sky_julian_date(1899, 12, 31, 0, 0, 0)) == 0 && oc_sky_epoch() == other, "1899 was taken");
    CHECK(oc_sky_set_epoch(oc_sky_julian_date(2100, 1, 2, 0, 0, 0)) == 0 && oc_sky_epoch() == other, "2100 was taken");
    CHECK(oc_sky_set_epoch(0) == 0 && oc_sky_set_epoch(1e300) == 0 && oc_sky_epoch() == other, "nonsense was taken");
    unsigned flight[2];
    double sunUp[2], lit[2];
    const double dates[2] = {other, OC_SKY_DEFAULT_EPOCH};
    for (int i = 0; i < 2; ++i) {
        startAt(dates[i]);
        oc_step(2500);
        flight[i] = oc_hash();
        sunUp[i] = oc_out()[OC_SUN_U];
        lit[i] = sky(OC_SKY_MOON_LIT);
        CHECK(std::fabs(sky(OC_SKY_JD) - (dates[i] + 50.0 / 86400)) < 1e-9, "the date now %.9f", sky(OC_SKY_JD));
    }
    CHECK(flight[0] == flight[1], "the flight's hash changed with the date: %08x, %08x", flight[0], flight[1]);
    CHECK(std::fabs(sunUp[0] - sunUp[1]) > 0.05 && std::fabs(lit[0] - lit[1]) > 0.05, "the sky did not: Sun %.3f %.3f, Moon lit %.3f %.3f", sunUp[0], sunUp[1], lit[0], lit[1]);
    // set in flight, the sky moves at the next step and the flight goes on as it was
    startAt(OC_SKY_DEFAULT_EPOCH);
    oc_step(100);
    const unsigned before = oc_hash();
    CHECK(oc_sky_set_epoch(other) == 1, "refused in flight");
    oc_step(0);
    CHECK(oc_hash() == before && std::fabs(sky(OC_SKY_JD) - (other + 2.0 / 86400)) < 1e-9, "set in flight: date %.9f", sky(OC_SKY_JD));
    // 20 July 1969, 20:17:40 UTC: a waxing crescent, a third lit (Horizons: 32.993%)
    CHECK(std::fabs(sky(OC_SKY_MOON_LIT) - 0.3299279) < 1e-3 && sky(OC_SKY_MOON_ELONG) < PI, "the Moon of Apollo 11: %.5f lit, Horizons 0.32993", sky(OC_SKY_MOON_LIT));
    oc_sky_set_epoch(OC_SKY_DEFAULT_EPOCH);
}

// The same date and the same steps give the same sky, bit for bit, however the steps are batched.
void deterministic() {
    double a[OC_SKY_COUNT], b[OC_SKY_COUNT], c[OC_SKY_COUNT];
    startAt(OC_SKY_DEFAULT_EPOCH);
    oc_step(40000);
    std::memcpy(a, oc_sky_out(), sizeof a);
    const unsigned ha = oc_hash();
    startAt(OC_SKY_DEFAULT_EPOCH);
    oc_step(40000);
    std::memcpy(b, oc_sky_out(), sizeof b);
    CHECK(std::memcmp(a, b, sizeof a) == 0 && oc_hash() == ha, "the same run twice differs");
    startAt(OC_SKY_DEFAULT_EPOCH);
    for (int i = 0; i < 400; ++i) oc_step(100);
    std::memcpy(c, oc_sky_out(), sizeof c);
    CHECK(std::memcmp(a, c, sizeof a) == 0 && oc_hash() == ha, "the same run in batches differs");
    oc_step(1);
    CHECK(std::memcmp(a, oc_sky_out(), sizeof a) != 0, "a step later the sky is the same");
    CHECK(finite(), "finite");
}

// The block is what the header says: its length, unit vectors where it says so, the Sun's direction
// the flight's own, the Moon's axes square to each other, the stars' frame right-handed.
void readoutsBlock() {
    CHECK(oc_sky_out_len() == OC_SKY_COUNT, "length %d", oc_sky_out_len());
    const double dates[] = {OC_SKY_DEFAULT_EPOCH, oc_sky_julian_date(1987, 4, 10, 0, 0, 0), oc_sky_julian_date(2061, 7, 28, 12, 0, 0)};
    for (const double jd : dates) {
        startAt(jd);
        oc_step(777);
        const double* o = oc_out();
        CHECK(finite(), "finite");
        const int vectors[] = {OC_SKY_SUN_E, OC_SKY_MOON_E, OC_SKY_MOON_POLE_E, OC_SKY_MOON_FACE_E, OC_SKY_J2000_XE, OC_SKY_J2000_YE, OC_SKY_J2000_ZE};
        for (const int at : vectors)
            CHECK(std::fabs(norm(vec(at)) - 1) < 1e-12, "the vector at %d is %.15f long", at, norm(vec(at)));
        CHECK(sky(OC_SKY_SUN_E) == o[OC_SUN_E] && sky(OC_SKY_SUN_N) == o[OC_SUN_N] && sky(OC_SKY_SUN_U) == o[OC_SUN_U], "the Sun's two readouts differ");
        CHECK(std::fabs(dot(vec(OC_SKY_MOON_POLE_E), vec(OC_SKY_MOON_FACE_E))) < 1e-12, "the Moon's pole and face: %.3e", dot(vec(OC_SKY_MOON_POLE_E), vec(OC_SKY_MOON_FACE_E)));
        CHECK(angle(vec(OC_SKY_MOON_FACE_E), vec(OC_SKY_MOON_E) * -1.0) < 10.5, "the near side is %.2f deg from facing the Earth", angle(vec(OC_SKY_MOON_FACE_E), vec(OC_SKY_MOON_E) * -1.0));
        const V x = vec(OC_SKY_J2000_XE), y = vec(OC_SKY_J2000_YE), z = vec(OC_SKY_J2000_ZE);
        CHECK(std::fabs(dot(x, y)) < 1e-12 && std::fabs(dot(y, z)) < 1e-12 && norm(cross(x, y) - z) < 1e-12, "the stars' frame is not square and right-handed");
        CHECK(sky(OC_SKY_SUN_DIST) > 0.983 * AU && sky(OC_SKY_SUN_DIST) < 1.017 * AU, "the Sun %.4f AU off", sky(OC_SKY_SUN_DIST) / AU);
        CHECK(sky(OC_SKY_MOON_DIST) > 3.56e8 && sky(OC_SKY_MOON_DIST) < 4.07e8, "the Moon %.0f km off", sky(OC_SKY_MOON_DIST) / 1000);
        CHECK(std::fabs(sky(OC_SKY_MOON_LIT) - 0.5 * (1 + std::cos(sky(OC_SKY_MOON_PHASE)))) < 1e-12, "lit and phase disagree");
        CHECK(sky(OC_SKY_GAST) >= 0 && sky(OC_SKY_GAST) < 2 * PI && sky(OC_SKY_MOON_ELONG) >= 0 && sky(OC_SKY_MOON_ELONG) < 2 * PI, "angles out of their turn");
        CHECK(std::fabs(sky(OC_SKY_JD) - (jd + 777 * OC_DT / 86400)) < 1e-9, "the date %.9f", sky(OC_SKY_JD));
    }
    oc_sky_set_epoch(OC_SKY_DEFAULT_EPOCH);
}

struct Test { const char* name; void (*run)(); };
const Test TESTS[] = {
    {"julian_date", julianDate},
    {"sidereal_time", siderealTime},
    {"sun_meeus_25a", sunMeeus25a},
    {"moon_meeus_47a", moonMeeus47a},
    {"precession_meeus_21b", precessionMeeus21b},
    {"moon_phase_meeus_48a", moonPhaseMeeus48a},
    {"moon_libration_meeus_53a", moonLibrationMeeus53a},
    {"default_epoch_against_horizons", defaultEpochAgainstHorizons},
    {"full_moon_over_dallas", fullMoonOverDallas},
    {"light_at_the_start_and_at_the_ring", lightAtTheStartAndAtTheRing},
    {"sky_moves", skyMoves},
    {"eclipse_over_kdfw", eclipseOverKdfw},
    {"epoch_is_settable", epochIsSettable},
    {"deterministic", deterministic},
    {"readouts_block", readoutsBlock},
};

}   // namespace

int main(int argc, char** argv) {
    const char* only = argc > 1 ? argv[1] : nullptr;
    int ran = 0;
    for (const Test& t : TESTS) {
        if (only && std::strcmp(only, t.name) != 0) continue;
        const int before = failures;
        std::printf("%s\n", t.name);
        t.run();
        std::printf("%s: %s\n", t.name, failures == before ? "ok" : "FAILED");
        ++ran;
    }
    if (!ran) { std::printf("no test named %s\n", only); return 2; }
    return failures ? 1 : 0;
}
