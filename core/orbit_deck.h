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
// The crew's deck landing (oc_auto(OC_AUTO_DECK)) picks the nearest pad and flies to it in the Ring's
// turning frame: to the approach's hold point if the craft is not near it; out into the Ring to a point
// OC_DECK_GLIDE_M over the floor and to one side of the spokes' plane, at rest among the stars, where the
// deck sweeps by underneath; then, once the pad is the right distance ahead, the glide (the airliner's
// part): along the deck at that height, the drive pushing the craft after the deck so that the speed
// against it bleeds from 221.5 m/s, the swivel turning down as the weight grows; onto the centreline; down
// through the roof's gap on a path that steepens over the pad; a hover OC_DECK_HOVER_M over its centre
// (the F-35's part); and a slow descent to the touchdown. On the deck it leaves the drive idle and the
// brakes on and hands the craft to the pilot, held on the deck.
//
// The pilot's deck hold (oc_sas(OC_SAS_DECK)) is the F-35B's unified control, in the deck's frame: the
// stick (fore and aft, left and right, in the nose's axes) accelerates the velocity it holds against the
// deck, and with the stick centred near rest it holds its place; the throttle sets the climb or the sink,
// centred holding the height, and near the deck the sink is eased to a touchdown's by itself; the pedals
// turn the nose. The attitude and the swivel are the law's.
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
#define OC_DECK_GLIDE_M 400.0       /* m over the floor the glide keeps outside the sector: 100 m over the roof */
#define OC_DECK_HOVER_M 20.0        /* m: the centre of mass over the pad's centre in the hover, the legs 17 m up */
#define OC_DECK_SIDE_M 100.0        /* m off the deck's centreline the craft keeps, clear of the spokes' plane, until past the last spoke */

/* the touchdown the crew flies to, and a good one: inside all four it is a landing */
#define OC_DECK_TOL_SINK 0.5        /* m/s into the deck */
#define OC_DECK_TOL_DRIFT 0.3       /* m/s across its face */
#define OC_DECK_TOL_OFF_M 5.0       /* m from a pad's centre */
#define OC_DECK_TOL_TILT_DEG 2.0    /* off level */
/* past any of these the gear does not take it: a crash */
#define OC_DECK_CRASH_SINK 3.0      /* m/s: the legs' dampers alone load them past 7 g */
#define OC_DECK_CRASH_DRIFT 2.0     /* m/s sideways or along: a tyre trips and a leg folds */
#define OC_DECK_CRASH_TILT_DEG 10.0 /* off level: the low wingtip is under a metre from the deck */

#define OC_DECK_PROP_MIN 2000.0     /* kg: the crew's landing is refused with less propellant than this: a landing from the hold point takes 1.8 t */

/* where the crew's deck landing stands */
enum {
    OC_DECK_PH_NONE = 0,     /* the crew is not landing on the deck */
    OC_DECK_PH_TRANSFER = 1, /* to the approach's hold point, round the Ring if it must */
    OC_DECK_PH_DEPART = 2,   /* out into the Ring, to a point at rest among the stars over the floor */
    OC_DECK_PH_WAIT = 3,     /* there, the deck sweeping by, until the pad is the right way ahead */
    OC_DECK_PH_GLIDE = 4,    /* the approach: the speed against the deck bled away on the glide path */
    OC_DECK_PH_HOVER = 5,    /* over the pad, zero-zero */
    OC_DECK_PH_DESCEND = 6,  /* down onto it */
    OC_DECK_PH_LANDED = 7    /* on the deck, the drive idle, the brakes on */
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

/* why oc_auto(OC_AUTO_DECK) was refused; a refusal leaves whoever was flying in charge */
enum {
    OC_DECK_NO_NONE = 0,
    OC_DECK_NO_DOCKED = 1,   /* held by the hub's port */
    OC_DECK_NO_CRASHED = 2,
    OC_DECK_NO_LOW = 3,      /* not in orbit: the lowest point of the path is under 150 km */
    OC_DECK_NO_FAR = 4,      /* more than OC_DOCK_ENGAGE_M from the Ring */
    OC_DECK_NO_FAST = 5,     /* passing it faster than OC_DOCK_ENGAGE_SPEED, in the frame turning with its orbit */
    OC_DECK_NO_LANDED = 6,   /* on the deck already */
    OC_DECK_NO_PROP = 7      /* under OC_DECK_PROP_MIN of propellant */
};

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
    OC_DECK_COUNT
};

const double* oc_deck_out(void);
int oc_deck_out_len(void);

#ifdef __cplusplus
}
#endif
