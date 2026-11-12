// orbit_dock.h — docking at the ring's hub, and the craft's contact with the ring.
//
// The craft's port is a probe on its nose, on the body's x axis: its head is OC_DOCK_PROBE_M ahead of
// the centre of mass. The hub's port is a drogue, a cone and a socket at the centre of the hub's face,
// on the ring's axis; its key is the ring's ref, which turns with it. A craft is lined up on the port
// when its nose is along the axis, into the port, and its roof is toward the key: it then rolls with the
// port, right wing down, at OC_RING_SPIN.
//
// When the head meets the port's face the latches catch it if the contact is inside every tolerance
// below. The craft is then held: drawn in over OC_DOCK_DRAW_S and carried with the hub until
// oc_undock(). Outside them the head bounces off the face on the probe's spring and damper, and a
// contact that uses the probe's whole stroke is a crash. Any other part of the craft that touches the
// ring (hull, roof, rim walls, spokes, hub) is a crash, and the wreck stays where it struck, turning
// with the ring.
//
// Every number here is chosen for the sketch. None describes a real docking system. GPLv3.
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#define OC_DOCK_PROBE_M 18.0 /* the probe's head ahead of the centre of mass, on body x: 2 m past the nose */

/* The capture's tolerances, judged once, as the head first meets the face. */
#define OC_DOCK_TOL_OFFSET_M 0.30      /* the head from the port's centre: the drogue's mouth is 0.6 m across */
#define OC_DOCK_V_MIN 0.03             /* m/s closing: slower, the head does not trip the latches */
#define OC_DOCK_V_MAX 0.30             /* m/s closing: faster, the rebound takes the head out before they close */
#define OC_DOCK_TOL_SLIDE 0.10         /* m/s of the head across the face */
#define OC_DOCK_TOL_ANGLE_DEG 3.0      /* between the craft's docking axis and the port's */
#define OC_DOCK_TOL_ROLL_DEG 2.0       /* the craft's key from the port's, about the axis */
#define OC_DOCK_TOL_ROLL_RATE_DPS 0.30 /* the craft's turn about the axis, less the port's */

#define OC_DOCK_STROKE_M 0.40      /* the probe's stroke: a contact that uses it all is a crash */
#define OC_DOCK_DRAW_S 6.0         /* s the latches take to draw a captured craft in */
#define OC_DOCK_SEPARATION 0.15    /* m/s along -axis, given at oc_undock() */
#define OC_DOCK_ENGAGE_M 50000.0   /* the crew's docking engages within this of the ring's centre ... */
#define OC_DOCK_ENGAGE_SPEED 50.0  /* ... and no faster than this past it, m/s, in the frame turning with its orbit (OC_VREL_*) */

/* where a docking stands */
enum {
    OC_DOCK_PH_NONE = 0,     /* free, and the crew is not docking */
    OC_DOCK_PH_TRANSFER = 1, /* the crew flies to the hold point, round the ring if it must */
    OC_DOCK_PH_ALIGN = 2,    /* on the axis: lining up, rolling into phase with the port */
    OC_DOCK_PH_CLOSE = 3,    /* closing on the port */
    OC_DOCK_PH_CAPTURED = 4, /* held: the latches draw the craft in */
    OC_DOCK_PH_DOCKED = 5    /* held hard: the craft is part of the hub */
};

/* what a contact of the head with the port's face came to */
enum {
    OC_DOCK_V_NONE = 0,
    OC_DOCK_V_CAPTURED = 1,
    OC_DOCK_V_FAST = 2,      /* closing faster than OC_DOCK_V_MAX */
    OC_DOCK_V_OFFSET = 3,    /* outside the drogue */
    OC_DOCK_V_SLIDING = 4,   /* moving across the face */
    OC_DOCK_V_ANGLE = 5,     /* the nose off the axis */
    OC_DOCK_V_ROLL = 6,      /* the key out of phase */
    OC_DOCK_V_ROLL_RATE = 7, /* the spin not matched */
    OC_DOCK_V_SLOW = 8       /* closing slower than OC_DOCK_V_MIN */
};

/* what a crash on the ring hit, and with what */
enum {
    OC_DOCK_HIT_NONE = 0,
    OC_DOCK_HIT_HULL = 1,  /* the band from outside */
    OC_DOCK_HIT_ROOF = 2,  /* the band from inside the ring */
    OC_DOCK_HIT_RIM = 3,   /* a rim wall */
    OC_DOCK_HIT_SPOKE = 4,
    OC_DOCK_HIT_HUB = 5,
    OC_DOCK_HIT_PORT = 6,     /* the port's face, harder than the probe's stroke takes */
    OC_DOCK_HIT_DECK = 7,     /* the flight deck: with anything but the gear, or harder than the gear takes (orbit_deck.h) */
    OC_DOCK_HIT_BULKHEAD = 8  /* a bulkhead at an end of the deck's open sector */
};
enum {
    OC_DOCK_PART_NONE = 0,
    OC_DOCK_PART_PROBE = 1,
    OC_DOCK_PART_NOSE = 2,
    OC_DOCK_PART_BODY = 3,
    OC_DOCK_PART_LEFT_WING = 4,
    OC_DOCK_PART_RIGHT_WING = 5,
    OC_DOCK_PART_TAIL = 6,
    OC_DOCK_PART_GEAR = 7
};

/* why oc_auto(OC_AUTO_DOCK) was refused; a refusal leaves whoever was flying in charge */
enum {
    OC_DOCK_NO_NONE = 0,
    OC_DOCK_NO_DOCKED = 1,  /* already held by the port */
    OC_DOCK_NO_CRASHED = 2,
    OC_DOCK_NO_LOW = 3,     /* not in orbit: the lowest point of the path is under 150 km */
    OC_DOCK_NO_FAR = 4,     /* more than OC_DOCK_ENGAGE_M from the ring */
    OC_DOCK_NO_FAST = 5     /* passing the ring faster than OC_DOCK_ENGAGE_SPEED */
};

/* indices into oc_dock_out() */
enum {
    OC_DOCK_DOCKED = 0,      /* 1 while held by the hub's port: captured, then docked */
    OC_DOCK_PHASE,           /* OC_DOCK_PH_* */
    OC_DOCK_RANGE,           /* m, the probe's head to the centre of the hub's port */
    OC_DOCK_GAP,             /* m, the head in front of the port's face, along the axis; negative past it */
    OC_DOCK_CLOSING,         /* m/s, the head toward the face along the axis; positive is closing */
    OC_DOCK_OFF_Y,           /* m, the head off the axis, in the port's frame, which turns with it: toward the right wing of a craft lined up on the port */
    OC_DOCK_OFF_Z,           /* m, the same toward that craft's belly */
    OC_DOCK_RATE_Y,          /* m/s, how fast those two change */
    OC_DOCK_RATE_Z,
    OC_DOCK_ANGLE_DEG,       /* between the craft's docking axis and the port's */
    OC_DOCK_PITCH_DEG,       /* of that: the port's axis above the nose (pitch up to meet it) */
    OC_DOCK_YAW_DEG,         /* and to the right of the nose (yaw right to meet it) */
    OC_DOCK_ROLL_DEG,        /* roll error: the craft's key past the port's, right wing down */
    OC_DOCK_ROLL_RATE_DPS,   /* roll-rate error: the craft's turn about the axis, less the port's */
    OC_DOCK_CONTACT,         /* 1 while the head presses on the port's face */
    OC_DOCK_VERDICT,         /* OC_DOCK_V_*: what the last contact came to */
    OC_DOCK_C_T,             /* the last contact: when, s since the start */
    OC_DOCK_C_SPEED,         /* its closing speed, m/s */
    OC_DOCK_C_OFFSET,        /* the head from the port's centre, m */
    OC_DOCK_C_SLIDE,         /* the head's speed across the face, m/s */
    OC_DOCK_C_ANGLE_DEG,     /* and the three angles' errors, as above */
    OC_DOCK_C_ROLL_DEG,
    OC_DOCK_C_ROLL_RATE_DPS,
    OC_DOCK_HIT,             /* OC_DOCK_HIT_*: what a crash on the ring hit */
    OC_DOCK_HIT_PART,        /* OC_DOCK_PART_*: with what */
    OC_DOCK_REFUSED,         /* OC_DOCK_NO_*: why the crew's docking was last refused */
    OC_DOCK_AXIAL,           /* m, the craft along the ring's axis from the ring's centre; the port's face is at -OC_HUB_PORT_M */
    OC_DOCK_RADIAL,          /* m, the craft from the axis */
    OC_DOCK_COUNT
};

const double* oc_dock_out(void);
int oc_dock_out_len(void);

/* Let go of the port, with OC_DOCK_SEPARATION along -axis. The craft keeps the spin it had, and the
   pilot has it with the hold on the port (OC_SAS_PORT), still turning with it. Nothing while not held. */
void oc_undock(void);

#ifdef __cplusplus
}
#endif
