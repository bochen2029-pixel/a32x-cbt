// orbit_wind.h — the wind: the air's own motion over the turning Earth, off unless set. wind.cpp makes it;
// orbit_core.cpp takes it off the craft's velocity wherever the air's push is reckoned (the airspeed, so
// every aerodynamic force and moment and the readouts made from them), and nowhere else.
//
// It is a field, the same function of height, place and time for everything that flies through it, made
// from a seed and scaled by a strength:
//   the mean wind  near the ground the log law of MIL-F-8785C (the wind 20 ft up, W20, and a roughness of
//                  0.15 ft), turned 25 degrees to the left of the wind above as an Ekman layer is; from 1,000
//                  ft up to a jet stream 10 to 12 km up, westerly; less above it, a modest upper wind to 80
//                  km, nothing from 100 km. Its speed and direction wander with longitude and time, as
//                  long waves in the westerlies do.
//   the gusts      von Karman's isotropic turbulence, at the intensities and lengths MIL-F-8785C gives it by
//                  height (low down, from W20), synthesised as a sum of random Fourier modes (Kraichnan
//                  1970), each turning slowly in time; nothing above 25 km.
// The whole field is the strength times the field at strength 1: 1 is the specification's light day (W20 of
// 15 knots), 2 moderate (30), 3 severe (45). docs/provenance.md, 1h, cites the sources. MIT.
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#define OC_WIND_MAX 3.0            /* the strongest wind oc_wind takes */
#define OC_WIND_W20_MS 7.71666667  /* m/s: 15 knots, the wind 20 ft up at strength 1 (before the place's and the day's wander) */
#define OC_WIND_JET_MS 30.0        /* m/s: the jet stream's core at strength 1 (likewise) */
#define OC_WIND_UPPER_MS 15.0      /* m/s: the upper wind, 35 to 80 km, at strength 1 */
#define OC_WIND_TOP_M 100000.0     /* m: no wind above this */
#define OC_WIND_GUST_TOP_M 25000.0 /* m: no gusts above this */

/* indices into oc_wind_out(): the wind where the craft is, in its local east, north and up */
enum {
    OC_WIND_ON = 0,       /* 1 while a wind is set */
    OC_WIND_STRENGTH,     /* 0..OC_WIND_MAX */
    OC_WIND_SEED,
    OC_WIND_E,            /* m/s: the air's velocity over the ground here, east */
    OC_WIND_N,            /* north */
    OC_WIND_U,            /* up */
    OC_WIND_SPEED,        /* m/s: its horizontal part */
    OC_WIND_FROM_DEG,     /* where it blows from, true, 0..360 */
    OC_WIND_GUST_E,       /* m/s: the gusts' part of it */
    OC_WIND_GUST_N,
    OC_WIND_GUST_U,
    OC_WIND_HEAD,         /* m/s against the craft's track over the ground, + a headwind */
    OC_WIND_CROSS,        /* m/s across it, + from the right */
    OC_WIND_COUNT
};

/* Set the wind: seed picks the day, strength scales it (0 is none, the default). A strength that is not a
   number, below 0 or above OC_WIND_MAX is refused and changes nothing. Kept through everything but
   oc_reset, which takes it away. */
void oc_wind(unsigned seed, double strength);

const double* oc_wind_out(void);
int oc_wind_out_len(void);

/* For tests: the field at a place and time, as set by oc_wind, in that place's east, north and up, m/s:
   its mean part and its gusts. */
void oc_wind_at(double lat_deg, double lon_deg, double alt_m, double t, double* mean3, double* gust3);

#ifdef __cplusplus
}
#endif
