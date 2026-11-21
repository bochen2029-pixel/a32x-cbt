// orbit_fd.h — the flight director: while a person flies, the crew's guidance for the phase the craft is in
// runs in the shadow and says what it would command, without commanding it: the attitude (pitch, heading,
// bank), the throttle and the gear; above the air, where the crew's insertion guidance points the nose; on
// the way home, the entry's bank and angle of attack and the approach's. fd.cpp computes it; its readouts
// are the last of orbit_core.h's (OC_FD_*). Angles in the readouts are degrees. GPLv3.
//
// Whose guidance. While the crew to orbit flies, the same shadow runs beside it, and its command is the
// crew's own. Taking the controls from the crew, or from the crew flying home, the shadow carries on from
// the crew's memory; taking them from anyone else, or switching the director on, it starts as the crew
// would if handed the craft (oc_auto): from where the craft is, and on the way home if a return is under
// way. Near the Ring, docked, landing on its deck or holding on the port, the director says nothing: those
// have displays of their own (orbit_dock.h, orbit_deck.h).
//
// It never changes the flight: it works on a copy of the state, and with it on or off the same controls
// give the same flight (oc_flight_hash).
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/* what the director is following: the crew to orbit's phases (OC_PH_* + 1), then the flight home's
   (OC_RET_PH_* + OC_FD_PH_ORBIT) */
enum {
    OC_FD_PH_NONE = 0,   /* nothing: the cues are hidden */
    OC_FD_PH_HOLD,       /* the crew to orbit: brakes on, waiting for the window */
    OC_FD_PH_ROLL,       /* the take-off roll */
    OC_FD_PH_ROTATE,
    OC_FD_PH_CLIMB,      /* an aeroplane's climb, turning to the launch azimuth */
    OC_FD_PH_ASCENT,     /* full power through the air, on a pitch schedule */
    OC_FD_PH_INSERT,     /* above the air: the insertion guidance's thrust direction */
    OC_FD_PH_ORBIT,      /* in orbit, the engine off, the nose on the Ring */
    OC_FD_PH_DEPART,     /* the flight home: backing away from the Ring */
    OC_FD_PH_WAIT,       /* waiting for the pass, prograde; tail first before the burn */
    OC_FD_PH_BURN,       /* the de-orbit burn */
    OC_FD_PH_COAST,      /* falling to the air in the entry's attitude */
    OC_FD_PH_ENTRY,      /* nose high and banked */
    OC_FD_PH_TERMINAL,   /* the glide to the turn onto final */
    OC_FD_PH_APPROACH,   /* powered, down the 3 degree path */
    OC_FD_PH_FLARE,
    OC_FD_PH_ROLLOUT,
    OC_FD_PH_STOPPED
};

/* Switch the director on (1) or off (0); on at oc_reset. Off, nothing runs in the shadow and OC_FD_VALID
   reads 0. Like oc_sas, a choice of the pilot's, kept in the state. */
void oc_fd(int on);

/* For tests: the hash of the state less the director's own memory. With the director on or off, the same
   controls give the same number at every step (oc_hash covers the director too). */
unsigned oc_flight_hash(void);

#ifdef __cplusplus
}
#endif
