// orbit_core.h — a sketch: one spaceplane, a round Earth and a ring in orbit.
//
// The whole core is this header and orbit_core.cpp. It links nothing: no A32NX, no JSBSim, no
// engine. It advances only in whole fixed steps, and the same inputs give the same state, so a
// run can be replayed. Units are SI and angles are radians unless a name says otherwise.
//
// Frames. ECI: Earth-centred, not rotating, z along the pole; it coincides with the Earth-fixed
// frame at t = 0. Body: x forward, y to the right wing, z down. Site: east, north, up at the
// start point, turning with the Earth; the view draws in it.

#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#define OC_DT 0.02 /* seconds per step: fifty steps a second, as the Airbus flies */

/* who is flying: the pilot; the scripted crew (runway to orbit); the crew's approach, which flies to
   a point on the ring's axis, OC_STANDOFF_M off the hub's port, and holds there; the crew flying home
   (orbit_return.h); the crew docking at the hub (orbit_dock.h) */
enum { OC_AUTO_OFF = 0, OC_AUTO_CREW = 1, OC_AUTO_APPROACH = 2, OC_AUTO_RETURN = 3, OC_AUTO_DOCK = 4 };

/* The ring's shape, one for the core and the page. Its frame: the axis, fixed among the stars, and ref,
   a unit vector in its plane that turns with it at OC_RING_SPIN about the axis. The floor and the roof
   are cylinders about the axis, OC_RING_WIDTH_M long, centred on the ring's plane; the rim walls close
   them from OC_RING_RIM_M out to the hull. Spoke k (of OC_RING_SPOKES) runs from the hub to the rim
   along sin(2 pi k / OC_RING_SPOKES) ref + cos(2 pi k / OC_RING_SPOKES) (ref x axis), in the plane. The
   hub is a cylinder on the axis, its port at -axis, OC_HUB_PORT_M from the centre. */
#define OC_RING_SPIN 0.0443     /* rad/s: one g at the floor, a turn in 142 s */
#define OC_RING_FLOOR_M 5000.0  /* radius of the floor */
#define OC_RING_WIDTH_M 1000.0  /* the band's length along the axis */
#define OC_RING_HULL_M 5040.0   /* radius of the hull, outside the floor */
#define OC_RING_ROOF_M 4700.0   /* radius of the roof: 300 m over the floor */
#define OC_RING_RIM_M 4620.0    /* inner radius of the rim walls */
#define OC_RING_SPOKES 6
#define OC_RING_SPOKE_M 70.0    /* a spoke's square section */
#define OC_HUB_RADIUS_M 160.0
#define OC_HUB_PORT_M 350.0     /* from the ring's centre to the hub's port, along the axis */
#define OC_STANDOFF_M 300.0

/* what the attitude hold points at, hands off, above the air */
enum { OC_SAS_HOLD = 0, OC_SAS_PROGRADE = 1, OC_SAS_RETROGRADE = 2, OC_SAS_TARGET = 3 };

/* the scripted crew's phases, in order */
enum {
    OC_PH_HOLD = 0,   /* brakes on, waiting for the window */
    OC_PH_ROLL = 1,   /* take-off roll */
    OC_PH_ROTATE = 2, /* nose up, off the runway */
    OC_PH_CLIMB = 3,  /* an aeroplane's climb, turning to the launch azimuth */
    OC_PH_ASCENT = 4, /* full power through the air, on a pitch schedule */
    OC_PH_INSERT = 5, /* above the air: guided to a round orbit at the ring's height */
    OC_PH_ORBIT = 6   /* in orbit, engine off; the crew points at the ring and hands over */
};

/* indices into oc_out() */
enum {
    OC_T = 0,     /* s since the start */
    OC_PHASE,     /* OC_PH_* */
    OC_AUTO,      /* OC_AUTO_* */
    OC_SAS,       /* OC_SAS_* */
    OC_CRASHED,   /* 1 after a ground impact */
    OC_WINDOW,    /* s until the crew releases the brakes; negative after */
    OC_SITE_E,    /* craft position in the site frame, m */
    OC_SITE_N,
    OC_SITE_U,
    OC_QW,        /* body -> site quaternion */
    OC_QX,
    OC_QY,
    OC_QZ,
    OC_LAT_DEG,
    OC_LON_DEG,
    OC_ALT,       /* m above the sphere */
    OC_HDG_DEG,   /* of the nose, local */
    OC_PITCH_DEG,
    OC_ROLL_DEG,
    OC_TAS,       /* m/s through the air */
    OC_MACH,
    OC_QBAR,      /* Pa */
    OC_VS,        /* m/s, up */
    OC_ALPHA_DEG,
    OC_BETA_DEG,
    OC_G,         /* felt acceleration, g */
    OC_VORB,      /* m/s, inertial */
    OC_APO,       /* m above the sphere; the highest point of the present orbit */
    OC_PERI,      /* m above the sphere; negative while the path still meets the ground */
    OC_INC_DEG,
    OC_T_APO,     /* s to the highest point */
    OC_THROTTLE,  /* 0..1, what the engine is giving */
    OC_PROP,      /* kg of propellant left */
    OC_MASS,      /* kg */
    OC_GEAR,      /* 1 down */
    OC_ON_GROUND, /* 1 with weight on the wheels */
    OC_RING_E,    /* ring centre in the site frame, m */
    OC_RING_N,
    OC_RING_U,
    OC_RING_AX_E, /* ring spin axis, unit, site frame */
    OC_RING_AX_N,
    OC_RING_AX_U,
    OC_RING_REF_E, /* a unit vector fixed in the ring, in its plane, site frame */
    OC_RING_REF_N,
    OC_RING_REF_U,
    OC_RING_RANGE, /* m to the ring's centre */
    OC_RING_RATE,  /* m/s; negative is closing */
    OC_SUN_E,      /* unit vector to the Sun, site frame */
    OC_SUN_N,
    OC_SUN_U,
    OC_VREL_E,     /* velocity relative to the ring, in the frame turning with its orbit; site axes, m/s */
    OC_VREL_N,
    OC_VREL_U,
    OC_PORT_RANGE, /* m to the approach's hold point, OC_STANDOFF_M off the hub's port */
    OC_COUNT
};

/* Put the craft on the ground at this point of the sphere, nose along heading_deg (true). */
void oc_reset(double lat_deg, double lon_deg, double heading_deg);

/* The pilot's hands. pitch + is nose up, roll + is right wing down, yaw + is nose right, each
   -1..1; throttle 0..1; tx, ty, tz are the small thrusters along body x, y, z, each -1..1. */
void oc_controls(double pitch, double roll, double yaw, double throttle,
                 double tx, double ty, double tz, int gear_down, double brake);

void oc_auto(int mode);
void oc_sas(int mode);

/* Advance n whole steps. */
void oc_step(int n);

/* The readouts, OC_COUNT doubles, valid until the next call. */
const double* oc_out(void);
int oc_out_len(void);

/* A hash of the whole state: two runs with the same inputs give the same number. */
unsigned oc_hash(void);

/* The raw state for tests: position and velocity in ECI. */
void oc_eci(double* r3, double* v3);

/* The standard atmosphere, for tests: density kg/m3, pressure Pa, temperature K, sound m/s. */
void oc_atmosphere(double alt_m, double* rho, double* p, double* temp, double* sound);

#ifdef __cplusplus
}
#endif
