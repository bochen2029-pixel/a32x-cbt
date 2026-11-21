// orbit_deck.h — the Ring's flight deck, and the craft as a jet that lands on it as a jet does on a ship.
//
// The deck is the floor of the band's open sector (orbit_core.h, OC_DECK_*). The Ring turns, so in its
// own frame the floor stands still and everything over it feels a pull outward, w^2 r, one g at the floor:
// a craft that holds still over a spot of the deck must thrust toward the axis at that, which is to hover.
// Seen from the stars it is moving with the floor at w r, 221.5 m/s, and the thrust bends its path round.
// A craft at rest among the stars feels no pull at all, and the deck sweeps past under it at w r: to land
// is to take up the deck's speed while coming down onto it.
//
// The craft's drive swivels for that, as an F-35B's does: from aft (0, thrust along the nose) to straight
// down through the centre of mass (90, thrust toward the craft's top), at OC_DECK_SWIVEL_DPS. It is the
// same drive, and the same flow of propellant for the same thrust. Jet-borne, roll posts in the wings and
// a lift jet in the nose bleed it for attitude, in proportion to the thrust through the swivel.
//
// The crew's deck landing (oc_auto(OC_AUTO_DECK)) picks the nearest pad and flies to it by a plan that is
// the least propellant the drive can land with (deck_plan.h: a convex program in the Ring's turning frame,
// its length chosen at a price of time), made again at a low rate from where the craft is: to the
// approach's hold point first if the craft is not near it, or is beside the hub (let go from its port, say);
// then a short burn out into the Ring; a coast,
// weightless, while the pad comes round to meet the craft; and one burn (the airliner's approach turned
// into the F-35's slam) that takes up the deck's 221.5 m/s coming down through the roof's gap inside the
// approach's cone, to a gate OC_DECK_GATE_M over the pad's centre, sinking; then a steady descent to the
// touchdown. On the deck it leaves the drive idle and the brakes on and hands the craft to the pilot, held
// on the deck. Riding with the deck over it already, it hovers to the nearest pad (OC_DECK_HOVER_M up) and
// descends.
//
// The crew's take-off (oc_auto(OC_AUTO_TAKEOFF)), from the deck or riding low over it: straight up off the
// pad, then a plan that is the landing's turned round, out through the roof's gap shedding the deck's
// speed, a coast in, and a burn that stops the craft at the approach's hold point, where the approach's
// crew holds it (and RETURN can take it home).
//
// The pilot's deck hold (oc_sas(OC_SAS_DECK)) is the F-35B's unified control, in the deck's frame: the
// stick (fore and aft, left and right, in the nose's axes) is a velocity against the deck, 10 m/s at its
// stops, and centred the hold keeps the craft's place along the deck and across it; held at a stop it also
// winds up a speed that runs down when it is let go, so that a long way can be flown on the keys. The
// throttle sets the climb or the sink, 8 m/s at its stops, its middle holding the height, and near the deck
// the sink is eased to a touchdown's by itself; the pedals turn the nose. The attitude and the swivel are
// the law's. On the deck, with no climb asked, the drive idles and the gear has it.
//
// The gear meets the floor as it meets the runway: a spring, a damper and the tyres' friction, against
// the deck's motion. A touchdown inside the tolerances below is a landing; past the crash limits, or with
// anything but the gear on the deck, a crash. Every number is chosen for the sketch. None describes a
// real aircraft, ship or station. GPLv3.
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#define OC_DECK_SWIVEL_DPS 15.0     /* the swivel's rate, deg/s: aft to down in 6 s */
#define OC_DECK_GATE_M 6.0          /* m: the centre of mass over the pad's centre where a landing plan ends, the legs 3 m up */
#define OC_DECK_HOVER_M 20.0        /* m: the centre of mass over the pad's centre in the hover, the legs 17 m up */
#define OC_DECK_SIDE_M 60.0         /* m off the Ring's plane a plan keeps among the spokes, which are 70 m square in it */

/* the touchdown the crew flies to, and a good one: inside all four it is a landing */
#define OC_DECK_TOL_SINK 0.5        /* m/s into the deck */
#define OC_DECK_TOL_DRIFT 0.3       /* m/s across its face */
#define OC_DECK_TOL_OFF_M 5.0       /* m from a pad's centre */
#define OC_DECK_TOL_TILT_DEG 2.0    /* off level */
/* past any of these the gear does not take it: a crash */
#define OC_DECK_CRASH_SINK 3.0      /* m/s: the legs' dampers alone load them past 7 g */
#define OC_DECK_CRASH_DRIFT 2.0     /* m/s sideways or along: a tyre trips and a leg folds */
#define OC_DECK_CRASH_TILT_DEG 10.0 /* off level: the low wingtip is under a metre from the deck */

#define OC_DECK_PROP_MIN 1000.0     /* kg: the crew's landing is refused with less propellant than this: a landing from the hold point takes about 0.6 t */

/* where the crew's deck landing, or take-off, stands */
enum {
    OC_DECK_PH_NONE = 0,     /* the crew is not landing on the deck */
    OC_DECK_PH_TRANSFER = 1, /* to the approach's hold point, round the Ring if it must */
    OC_DECK_PH_DEPART = 2,   /* turning for the first burn, and the burn out into the Ring */
    OC_DECK_PH_WAIT = 3,     /* coasting, weightless, the deck sweeping by, while the pad comes round */
    OC_DECK_PH_GLIDE = 4,    /* the approach: one burn taking up the deck's speed down through the roof's gap to the gate */
    OC_DECK_PH_HOVER = 5,    /* over the pad, zero-zero */
    OC_DECK_PH_DESCEND = 6,  /* down onto it */
    OC_DECK_PH_LANDED = 7,   /* on the deck, the drive idle, the brakes on */
    OC_DECK_PH_LIFT = 8,     /* the take-off: straight up off the pad */
    OC_DECK_PH_CLIMB = 9,    /* out through the roof's gap, shedding the deck's speed */
    OC_DECK_PH_COAST = 10,   /* coasting in toward the hold point, weightless */
    OC_DECK_PH_ARRIVE = 11   /* the burn that stops the craft at the hold point; then the approach's crew holds it */
};

/* what a touchdown came to: the first of these that applies */
enum {
    OC_DECK_V_NONE = 0,
    OC_DECK_V_LANDED = 1,    /* inside every tolerance, on a pad */
    OC_DECK_V_CRASHED = 2,   /* past a crash limit */
    OC_DECK_V_FIRM = 3,      /* down faster than OC_DECK_TOL_SINK */
    OC_DECK_V_DRIFTING = 4,  /* across the deck faster than OC_DECK_TOL_DRIFT */
    OC_DECK_V_TILTED = 5,    /* more than OC_DECK_TOL_TILT_DEG off level */
    OC_DECK_V_OFF_PAD = 6    /* more than OC_DECK_TOL_OFF_M from a pad's centre */
};

/* why oc_auto(OC_AUTO_DECK), or OC_AUTO_TAKEOFF, was refused; a refusal leaves whoever was flying in charge */
enum {
    OC_DECK_NO_NONE = 0,
    OC_DECK_NO_DOCKED = 1,   /* held by the hub's port */
    OC_DECK_NO_CRASHED = 2,
    OC_DECK_NO_LOW = 3,      /* not in orbit: the lowest point of the path is under 150 km */
    OC_DECK_NO_FAR = 4,      /* more than OC_DOCK_ENGAGE_M from the Ring */
    OC_DECK_NO_FAST = 5,     /* passing it faster than OC_DOCK_ENGAGE_SPEED, in the frame turning with its orbit */
    OC_DECK_NO_LANDED = 6,   /* on the deck already */
    OC_DECK_NO_PROP = 7,     /* under OC_DECK_PROP_MIN of propellant */
    OC_DECK_NO_RIDING = 8,   /* turning with the Ring, but over its roof or beside the deck: no landing starts there */
    OC_DECK_NO_STOP = 9,     /* moving along the deck faster than the crew can stop before the bulkhead ahead */
    OC_DECK_NO_NOT_DOWN = 10,   /* the take-off: not on the deck, nor riding with it low over it */
    OC_DECK_NO_PLAN = 11     /* no plan found from here: the crew cannot land, or climb out, as the craft is */
};
#define OC_DECK_TAKEOFF_PROP_MIN 500.0   /* kg: the take-off is refused with less than this: a climb out to the hold point takes about 0.6 t at most */

/* indices into oc_deck_out() */
enum {
    OC_DECK_PHASE = 0,       /* OC_DECK_PH_* */
    OC_DECK_PAD,             /* the pad the landing, and the deck's approach path, are for: 0 the antispinward end's, 1, 2; -1 none */
    OC_DECK_ON_DECK,         /* 1 while the gear presses on the deck */
    OC_DECK_S,               /* m along the deck from that pad's centre: the floor's arc, + spinward */
    OC_DECK_C,               /* m across the deck from its centreline, along the Ring's axis */
    OC_DECK_HEIGHT,          /* m, the centre of mass over the floor: the floor's radius less the craft's distance from the axis */
    OC_DECK_ALONG,           /* m/s against the deck, the Ring's turning frame at the craft: + spinward */
    OC_DECK_ACROSS,          /* m/s, along the Ring's axis */
    OC_DECK_VERTICAL,        /* m/s, toward the axis +: a sink is negative */
    OC_DECK_APPARENT_G,      /* g: the weight the turning frame gives the craft's motion, (w r + along)^2 / r: 0 at rest among the stars, 1 at rest on the floor */
    OC_DECK_NOZZLE_DEG,      /* the drive's swivel: 0 aft, 90 down */
    OC_DECK_LOC_M,           /* m off the approach path's course across the deck, + toward +axis (the right wing's side, nose spinward) */
    OC_DECK_GS_M,            /* m above the glide path */
    OC_DECK_FD_ALONG,        /* m/s: the velocity against the deck the guidance wants now, the flight director's, as ALONG, ACROSS, VERTICAL */
    OC_DECK_FD_ACROSS,
    OC_DECK_FD_VERTICAL,
    OC_DECK_SET_ALONG,       /* m/s: the velocity the pilot's deck hold is set to, as ALONG, ACROSS, VERTICAL */
    OC_DECK_SET_ACROSS,
    OC_DECK_SET_VERTICAL,
    OC_DECK_TD_VERDICT,      /* OC_DECK_V_*: the last touchdown's */
    OC_DECK_TD_T,            /* when, s since the start */
    OC_DECK_TD_SINK,         /* m/s into the deck */
    OC_DECK_TD_DRIFT,        /* m/s across its face */
    OC_DECK_TD_OFF,          /* m from the nearest pad's centre */
    OC_DECK_TD_TILT_DEG,     /* off level */
    OC_DECK_TD_PAD,          /* that pad */
    OC_DECK_PROP_USED,       /* kg of propellant used since the crew's landing was asked for */
    OC_DECK_REFUSED,         /* OC_DECK_NO_*: why the crew's landing was last refused */
    OC_DECK_SECTOR_S,        /* m along the deck from the sector's centre, + spinward */
    OC_DECK_HEADING_DEG,     /* the nose's way over the deck: 0 spinward, 90 toward +axis */
    OC_DECK_PLAN_TIME,       /* s left on the crew's plan, to its end; -1 none */
    OC_DECK_PLAN_DV,         /* m/s of delta-v the plan still spends */
    OC_DECK_PLAN_PROP,       /* kg of propellant it still uses */
    OC_DECK_PLAN_SOLVES,     /* plans made since the crew was asked, the first included */
    OC_DECK_FLOWN_DV,        /* m/s of delta-v flown since the crew was asked: the drive's and the small thrusters', the sum of |a| dt */
    OC_DECK_COUNT
};

/* For tests of robustness (the Monte Carlo): what the crew is told made wrong against what is. The drive gives
   (1 + thrust) times the thrust it is asked for, with the flow to match (its exhaust's speed the same); the
   guidance takes the craft's mass as (1 + mass) times what it is; the swivel follows its command through a
   first-order lag of lag seconds as well as its rate; the navigation's place and velocity, which every deck
   law flies by, are wrong by pos m and vel m/s per axis (standard deviations), each a first-order Gauss-Markov
   process correlated over 2 s, from a generator seeded with seed. The craft's own state, which the readouts
   give, stays the truth. Kept through oc_auto, cleared by oc_reset. */
void oc_deck_disturb(double thrust, double mass, double lag, double pos, double vel, unsigned seed);

const double* oc_deck_out(void);
int oc_deck_out_len(void);

#ifdef __cplusplus
}
#endif
