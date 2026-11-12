// orbit_walk.h — a person inside the ring, in its turning frame: the hub's lobby, a spoke's lift, the
// floor. Its own state and its own fixed step (OC_DT), apart from the flight's; the same inputs give the
// same walk. SI units, radians. Every number marked chosen is this sketch's choice, not a measurement of
// anyone. GPLv3.
//
// The ring's frame turns with the ring at OC_RING_SPIN about its axis, and in it nothing of the ring
// moves but the lift cars. A place in it is given unrolled: theta, the angle round the ring counted as
// the spokes are (spoke k stands at 2 pi k / OC_RING_SPOKES; theta grows spinward), or s, the arc that
// angle makes on the rim floor; c, along the axis from the ring's plane; h, above the floor. Up is toward
// the axis, everywhere. The walker's own axes are spinward, along the axis, and up; facing spinward, the
// axis points to the right hand.
//
// In that frame a body feels two forces that no one applies: the centrifugal one, omega^2 r outward,
// which is the ring's gravity, and Coriolis's, -2 omega x v, which is why a walker weighs more going
// spinward, why a jump comes down spinward of where it left and a dropped ball antispinward, and why a
// lift pushes its riders sideways. Seen from outside the ring both are nothing: a body let go moves in a
// straight line. The tests hold the two views equal.

#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/* ---- the walker (chosen) ---- */
#define OC_WALK_TALL_M 1.8    /* feet to the top of the head */
#define OC_WALK_EYE_M 1.7     /* the eye above the feet */
#define OC_WALK_CM_M 1.0      /* the centre of mass above the feet: the point the forces act on */
#define OC_WALK_RADIUS_M 0.3  /* how near a wall the walker's middle comes */
#define OC_WALK_PACE 1.4      /* m/s, walking */
#define OC_WALK_RUN 4.0       /* m/s, running */
#define OC_WALK_JUMP 4.43     /* m/s off the floor: a rise of one metre at one g */
#define OC_WALK_PUSH 4.0      /* m/s2: the hardest the legs push along the floor */
#define OC_WALK_MU 0.7        /* a sole's friction on the floor: the push it can pass on is mu times the weight */
#define OC_WALK_GRIP 1.0      /* m/s2: what the hub lobby's grip floor adds to a sole's hold, where weight is next to nothing */
#define OC_WALK_BALL_M 0.11   /* the ball's radius */

/* ---- the hub's lobby (chosen): a drum inside the hub, about the axis, where the lifts start ---- */
#define OC_WALK_LOBBY_M 150.0    /* radius of its floor: 0.03 g */
#define OC_WALK_LOBBY_C0_M 10.0  /* its end walls, along the axis: the hatch to the craft is in this one, at spoke 0 */
#define OC_WALK_LOBBY_C1_M 90.0

/* ---- the lifts (chosen): a car in a tube down each spoke's +axis face, lobby floor to rim floor. While a
   car moves its riders hold the rail and go where it takes them; at a station its door opens and they walk. ---- */
#define OC_WALK_LIFT_C_M 48.0     /* the tube's centre line, along the axis from the spoke's */
#define OC_WALK_CAR_M 5.0         /* a car's floor, square */
#define OC_WALK_CAR_TALL_M 3.0    /* floor to ceiling */
#define OC_WALK_DOOR_M 2.0        /* the door's width, in the car's +axis wall */
#define OC_WALK_DOOR_TALL_M 2.4
#define OC_WALK_SHAFT_WALL_M 0.5  /* the tube's wall round the car at a station */
#define OC_WALK_LIFT_PUSH 1.5     /* m/s2: the sideways push the cruise is held to; the speed is this over 2 omega */
#define OC_WALK_LIFT_EASE 0.5     /* leaving and reaching the hub, the car falls away from its riders at this part of their weight */
#define OC_WALK_LIFT_BRAKE 1.0    /* m/s2: starting from and stopping at the rim */

/* ---- the floor's plan (chosen): what the page paints and what the walker meets ---- */
#define OC_WALK_STREETS 60          /* cross streets round the ring, each over the canal on a bridge; every tenth is a spoke's plaza */
#define OC_WALK_STREET_M 5.0        /* half a cross street's width */
#define OC_WALK_CANAL_M 30.0        /* half the canal's width; it runs down the middle of the band */
#define OC_WALK_PARAPET_M 0.4       /* the parapets along its banks: this thick, */
#define OC_WALK_PARAPET_TALL_M 1.1  /* this tall: more than a jump clears */
#define OC_WALK_PLAZA_DECK_M 60.0   /* at a spoke, the plaza decks the canal over this far each way along the ring */
#define OC_WALK_PLAZA_M 120.0       /* the plaza's half-size, along the ring and along the axis */
#define OC_WALK_PROMENADE_M 37.0    /* centre line of the paths along the canal, from the ring's plane */
#define OC_WALK_PROMENADE_W_M 8.0   /* their width */
#define OC_WALK_LANE_M 224.0        /* centre line of the lanes through the districts */
#define OC_WALK_LANE_W_M 5.0
#define OC_WALK_WALLPATH_M 492.0    /* centre line of the paths under the rim walls */
#define OC_WALK_WALLPATH_W_M 10.0

/* where oc_walk_reset puts the walker */
enum {
    OC_WALK_AT_HATCH = 0, /* in the hub's lobby, just inside the hatch to the craft; the cars wait at the hub */
    OC_WALK_AT_LIFT = 1,  /* in spoke 0's car, at the hub */
    OC_WALK_AT_FLOOR = 2  /* on the rim floor, outside spoke 0's lift, its car there */
};

/* where the walker is */
enum { OC_WALK_IN_HUB = 0, OC_WALK_IN_LIFT = 1, OC_WALK_ON_FLOOR = 2 };

/* a lift car */
enum { OC_LIFT_AT_HUB = 0, OC_LIFT_DOWN = 1, OC_LIFT_AT_FLOOR = 2, OC_LIFT_UP = 3 };

/* what use would do where the walker stands */
enum {
    OC_USE_NOTHING = 0,
    OC_USE_HATCH = 1, /* go back aboard the craft */
    OC_USE_CALL = 2,  /* call this spoke's car from the other end */
    OC_USE_RIDE = 3   /* in a waiting car: shut the door and go */
};

/* the ball */
enum { OC_BALL_NONE = 0, OC_BALL_FLYING = 1, OC_BALL_RESTING = 2 };

/* the solid things, oc_walk_boxes(): each OC_WALK_BOX_FIELDS doubles */
enum {
    OC_WALK_BOX_ZONE = 0, /* OC_WALK_IN_HUB or OC_WALK_ON_FLOOR: whose floor it stands on */
    OC_WALK_BOX_KIND,     /* OC_BOX_* */
    OC_WALK_BOX_S,        /* its middle, m of arc along that floor from spoke 0, spinward */
    OC_WALK_BOX_HALF,     /* half its length along the floor */
    OC_WALK_BOX_C0,       /* from, along the axis */
    OC_WALK_BOX_C1,       /* to */
    OC_WALK_BOX_H0,       /* from, above the floor */
    OC_WALK_BOX_H1,       /* to */
    OC_WALK_BOX_FIELDS
};
enum {
    OC_BOX_BLOCK = 0,   /* a building's block, unfurnished */
    OC_BOX_PARAPET = 1, /* along the canal and across it at a bridge's sides */
    OC_BOX_PYLON = 2,   /* a spoke's foot, from the floor through the roof */
    OC_BOX_SHAFT = 3    /* a lift tube's wall at a station */
};

/* indices into oc_walk_out() */
enum {
    OC_WALK_T = 0,       /* s since oc_walk_reset */
    OC_WALK_WHERE,       /* OC_WALK_IN_* */
    OC_WALK_SPOKE,       /* the spoke whose lift this is: the car's, in a car; else the nearest */
    OC_WALK_THETA,       /* rad: the walker's angle round the ring, 0..2 pi */
    OC_WALK_S,           /* m: that angle's arc on the rim floor */
    OC_WALK_C,           /* m along the axis */
    OC_WALK_H,           /* m: the feet above the floor of the place: the lobby's, the car's, the rim's */
    OC_WALK_R,           /* m: the centre of mass from the axis */
    OC_WALK_UP_THETA,    /* rad: the angle whose inward radius is the walker's up: their own, or in a car its spoke's */
    OC_WALK_EYE_X,       /* the eye in the ring's frame, m: along ref, */
    OC_WALK_EYE_Y,       /*   the axis, */
    OC_WALK_EYE_Z,       /*   ref x axis */
    OC_WALK_VS,          /* velocity in the ring's frame, m/s: spinward, */
    OC_WALK_VC,          /*   along the axis, */
    OC_WALK_VH,          /*   up */
    OC_WALK_SPEED,       /* m/s over the floor of the place */
    OC_WALK_HEADING,     /* rad: where the walker faces: 0 spinward, pi/2 along the axis */
    OC_WALK_PITCH,       /* rad: the look above the level */
    OC_WALK_GROUND,      /* 1 with the feet on something */
    OC_WALK_G,           /* the walker's weight: the push of what holds them, over 9.80665; 0 in the air */
    OC_WALK_FELT_S,      /* apparent gravity, the opposite of that push, m/s2: spinward, */
    OC_WALK_FELT_C,      /*   along the axis, */
    OC_WALK_FELT_H,      /*   up (negative is down) */
    OC_WALK_CENTRIFUGAL, /* m/s2: omega^2 r at the centre of mass, outward */
    OC_WALK_COR_S,       /* Coriolis acceleration, -2 omega x v, m/s2: spinward, */
    OC_WALK_COR_C,       /*   along the axis, */
    OC_WALK_COR_H,       /*   up */
    OC_WALK_LIFT,        /* that spoke's car: OC_LIFT_* */
    OC_WALK_LIFT_R,      /* m: its floor from the axis */
    OC_WALK_LIFT_V,      /* m/s, outward positive */
    OC_WALK_LIFT_A,      /* m/s2, outward positive */
    OC_WALK_USE,         /* what use would do here: OC_USE_* */
    OC_WALK_ABOARD,      /* 1 once the walker has gone back through the hatch */
    OC_WALK_JUMPS,       /* jumps landed */
    OC_WALK_JUMP_DS,     /* the last of them: where it came down from where it left, m of arc on the floor, spinward, */
    OC_WALK_JUMP_DC,     /*   and along the axis; */
    OC_WALK_JUMP_T,      /*   its time in the air, s; */
    OC_WALK_JUMP_RISE,   /*   and its highest, m */
    OC_WALK_BALL,        /* OC_BALL_* */
    OC_WALK_BALL_X,      /* the ball in the ring's frame, m */
    OC_WALK_BALL_Y,
    OC_WALK_BALL_Z,
    OC_WALK_BALL_FALLS,  /* balls that have come down since the reset */
    OC_WALK_BALL_DS,     /* the last of them: where it first touched from under where it was let go, m of arc, spinward, */
    OC_WALK_BALL_DC,     /*   and along the axis; */
    OC_WALK_BALL_T,      /*   and how long it fell, s */
    OC_WALK_CAR_R0,      /* each spoke's car: its floor from the axis, m */
    OC_WALK_CAR_R1,
    OC_WALK_CAR_R2,
    OC_WALK_CAR_R3,
    OC_WALK_CAR_R4,
    OC_WALK_CAR_R5,
    OC_WALK_COUNT
};

/* Start the walk at one of the places above, at rest. Any other place is refused and nothing changes. */
void oc_walk_reset(int place);

/* Stand the walker at rest on the rim floor at s (m of arc, any number of turns) and c. Refused, with
   nothing changed and 0 returned, where the floor is not free: in a block, the canal, a wall. For tests
   and for looking round. */
int oc_walk_put(double s_m, double c_m);

/* What the walker means to do: fwd and right, each -1..1, along and across the heading, at a walk or a
   run; heading, radians, turning from spinward (0) toward the axis (pi/2); pitch, the look's elevation;
   jump and use act when they go from 0 to 1. */
void oc_walk_controls(double fwd, double right, double heading, double pitch, int run, int jump, int use);

/* Let a ball go: from height_m above what the walker stands on, half a metre ahead, with the walker's
   velocity and speed (m/s) more along the look. One ball at a time. */
void oc_walk_ball(double height_m, double speed);

/* Advance n whole steps of OC_DT. */
void oc_walk_step(int n);

/* The readouts, OC_WALK_COUNT doubles, valid until the next call. */
const double* oc_walk_out(void);
int oc_walk_out_len(void);

/* The solid things of the lobby and the floor, for the page to draw: oc_walk_box_count() of them, each
   OC_WALK_BOX_FIELDS doubles. The same list the walker walks into; the lift doors, which open and shut,
   are not in it. */
int oc_walk_box_count(void);
const double* oc_walk_boxes(void);

/* A hash of the whole state: two walks with the same inputs give the same number. */
unsigned oc_walk_hash(void);

#ifdef __cplusplus
}
#endif
