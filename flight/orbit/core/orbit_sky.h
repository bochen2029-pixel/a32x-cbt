// orbit_sky.h — the Sun and the Moon where they really are, for the flight's date and time, and the
// Earth's place under the stars. A date goes in; directions, distances and the Moon's attitude come
// out, in the site frame, beside the flight's readouts. Nothing here steers the craft: the sky is a
// function of the epoch and of the flight's time, and the flight does not depend on it. GPLv3.
//
// Methods (docs/provenance.md, 1h, "The Sun and the Moon"): J. Meeus, Astronomical Algorithms, 2nd
// ed.: the Sun to 0.01 deg (ch. 25), the Moon to about 10 arcseconds (ch. 47, every term of its
// tables), sidereal time (ch. 12), nutation to half an arcsecond (ch. 22), precession (ch. 21), and
// the Moon's attitude from Cassini's laws (ch. 53, the optical librations).
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/* The flight's epoch: the date and time at t = 0, a Julian Date in UTC. Until it is set, 12 November
   2026 at 19:00:00 UTC (OC_SKY_DEFAULT_EPOCH): one in the afternoon at KDFW. Set it before oc_reset.
   Set later, the sky moves at once and the readouts follow at the next oc_step. Returns 1 if taken;
   0, and the epoch stays, for a date that is not a number or lies outside 1900 to 2100, where the
   methods and the fixed TT - UTC hold. */
#define OC_SKY_DEFAULT_EPOCH 2461357.291666667
int oc_sky_set_epoch(double jd_utc);
double oc_sky_epoch(void);

/* The Julian Date of a date and time of the Gregorian calendar. */
double oc_sky_julian_date(int year, int month, int day, int hour, int minute, double second);

/* indices into oc_sky_out(). Directions are unit vectors in the site frame (east, north, up at the
   start point, turning with the Earth), as OC_SUN_* is; angles are radians. */
enum {
    OC_SKY_JD = 0,       /* the Julian Date now, UTC: the epoch plus the flight's time */
    OC_SKY_GAST,         /* Greenwich apparent sidereal time now, 0 to 2 pi */
    OC_SKY_SUN_E,        /* to the Sun, from the Earth's centre (OC_SUN_* is the same) */
    OC_SKY_SUN_N,
    OC_SKY_SUN_U,
    OC_SKY_SUN_DIST,     /* m */
    OC_SKY_MOON_E,       /* to the Moon's centre, from the Earth's centre: the eye is elsewhere, and */
    OC_SKY_MOON_N,       /* sees the Moon up to a degree from here */
    OC_SKY_MOON_U,
    OC_SKY_MOON_DIST,    /* m, centre to centre */
    OC_SKY_MOON_POLE_E,  /* the Moon's north pole */
    OC_SKY_MOON_POLE_N,
    OC_SKY_MOON_POLE_U,
    OC_SKY_MOON_FACE_E,  /* from the Moon's centre through the middle of its near side: where its */
    OC_SKY_MOON_FACE_N,  /* equator meets its prime meridian. Within 8 deg of the way to the Earth */
    OC_SKY_MOON_FACE_U,
    OC_SKY_MOON_PHASE,   /* the angle Sun - Moon - Earth: 0 full, pi new */
    OC_SKY_MOON_LIT,     /* the lit part of the disc seen from the Earth's centre, 0 to 1 */
    OC_SKY_MOON_ELONG,   /* the Moon's ecliptic longitude less the Sun's, 0 to 2 pi: waxing under pi */
    OC_SKY_J2000_XE,     /* the axes of the mean equator and equinox of J2000.0, which star */
    OC_SKY_J2000_XN,     /* catalogues are given in: x toward the equinox, z toward the pole */
    OC_SKY_J2000_XU,
    OC_SKY_J2000_YE,
    OC_SKY_J2000_YN,
    OC_SKY_J2000_YU,
    OC_SKY_J2000_ZE,
    OC_SKY_J2000_ZN,
    OC_SKY_J2000_ZU,
    OC_SKY_COUNT
};

const double* oc_sky_out(void);
int oc_sky_out_len(void);

/* The methods themselves, for tests and tools. Angles in radians, distances in m. jde is a Julian
   Ephemeris Day, in Terrestrial Time; jd_ut a Julian Date in Universal Time. */

/* Greenwich mean sidereal time, 0 to 2 pi. */
double oc_sky_gmst(double jd_ut);

/* The Sun from the Earth's centre. out5: its true longitude (mean equinox of the date), its distance,
   and its apparent longitude, right ascension and declination (true equinox and equator of the date). */
void oc_sky_sun(double jde, double* out5);

/* The Moon from the Earth's centre. out6: its longitude and latitude (mean equinox of the date), its
   distance, and its apparent longitude, right ascension and declination. */
void oc_sky_moon(double jde, double* out6);

/* A place given for the mean equator and equinox of J2000.0, at the mean equator and equinox of the date. */
void oc_sky_precess(double jde, double ra0, double dec0, double* ra, double* dec);

#ifdef __cplusplus
}
#endif
