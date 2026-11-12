// orbit_return.h — the flight home: from orbit to a stop on the start point's runway, KDFW 17C. The
// crew waits in orbit for a pass from which the runway can be reached, burns tail first, falls to the
// air, flies the entry nose high and banked, glides to a turn onto a long final from the north and
// lands under power. return.cpp flies it; this is what it reports. Angles here are degrees. GPLv3.
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/* the return's phases, in order */
enum {
    OC_RET_PH_NONE = 0,     /* not flying home */
    OC_RET_PH_DEPART = 1,   /* near the ring: backing away from it on the small thrusters */
    OC_RET_PH_WAIT = 2,     /* in orbit, waiting for the pass that reaches the runway */
    OC_RET_PH_BURN = 3,     /* the de-orbit burn, tail first */
    OC_RET_PH_COAST = 4,    /* falling to the entry interface */
    OC_RET_PH_ENTRY = 5,    /* nose high and banked: range by the bank's size, cross-range by its side */
    OC_RET_PH_TERMINAL = 6, /* below Mach 2.7: a glide to the turn onto the final, energy spent by angle of attack */
    OC_RET_PH_APPROACH = 7, /* powered: level to the glide path, then down it, gear down */
    OC_RET_PH_FLARE = 8,    /* the last metres: the sink rate taken off */
    OC_RET_PH_ROLLOUT = 9,  /* on the runway: nose down, brakes on */
    OC_RET_PH_STOPPED = 10  /* stopped on the runway, brakes held */
};

/* what OC_RET_T_EVENT counts down to */
enum {
    OC_RET_EV_NONE = 0,
    OC_RET_EV_CLEAR = 1,     /* clear of the ring */
    OC_RET_EV_BURN = 2,      /* the de-orbit burn starts */
    OC_RET_EV_BURN_END = 3,  /* the burn ends */
    OC_RET_EV_INTERFACE = 4, /* the entry interface, OC_RET_INTERFACE_M */
    OC_RET_EV_TERMINAL = 5,  /* the entry hands over to the terminal glide */
    OC_RET_EV_TOUCHDOWN = 6
};

/* the limits the return is flown inside, and that the readouts are judged against (OC_RET_OVER) */
#define OC_RET_INTERFACE_M 120000.0 /* m: the entry interface */
#define OC_RET_HEAT_LIMIT 600000.0  /* W/m2 at the stagnation point of a 1 m nose */
#define OC_RET_LOAD_LIMIT 2.5       /* g, off the ground */
#define OC_RET_QBAR_LIMIT 20000.0   /* Pa, from the burn to the runway */

/* the runway, from its threshold (the start point): what a landing is judged against */
#define OC_RET_RUNWAY_M 4085.0      /* its length (docs/provenance.md, 1f: 13,400 ft) */
#define OC_RET_RUNWAY_HALF_M 23.0   /* half its width (150 ft) */
#define OC_RET_ZONE_M 900.0         /* the touchdown zone: its first 900 m */

/* indices into oc_return_out() */
enum {
    OC_RET_PHASE = 0,     /* OC_RET_PH_* */
    OC_RET_EVENT,         /* OC_RET_EV_*: what comes next */
    OC_RET_T_EVENT,       /* s until it */
    OC_RET_RANGE,         /* m over the ground to the runway's threshold */
    OC_RET_CROSS,         /* m: in orbit, how far off the track the runway will lie on the pass taken; in the
                             air, how far off the present track it lies; on final, off the centreline; + is
                             the runway to the left */
    OC_RET_TOGO,          /* m of path the guidance still means to fly to the threshold */
    OC_RET_BANK_CMD_DEG,  /* the bank commanded, about the air's velocity, + right wing down */
    OC_RET_ALPHA_CMD_DEG, /* the angle of attack commanded */
    OC_RET_MISS,          /* m: where the predictor puts the end of the entry, short (+) or long (-) of its gate */
    OC_RET_REVERSALS,     /* bank reversals so far */
    OC_RET_DV,            /* m/s: the de-orbit burn planned */
    OC_RET_PASSES,        /* passes let go by before the one taken */
    OC_RET_HEAT,          /* W/m2: the stagnation point's heat flux (Sutton and Graves) */
    OC_RET_HEAT_PEAK,     /* W/m2, since the return was engaged (or since the start) */
    OC_RET_HEAT_LOAD,     /* J/m2: the flux, summed */
    OC_RET_TEMP,          /* K: the surface in radiative equilibrium with the flux and the air round it */
    OC_RET_GLOW,          /* 0..1: how brightly the air glows round the craft, for the page */
    OC_RET_LOAD,          /* g: the felt acceleration, the wheels' part left out */
    OC_RET_LOAD_PEAK,     /* g, off the ground */
    OC_RET_QBAR_PEAK,     /* Pa */
    OC_RET_OVER,          /* limits exceeded, a sum: 1 heat, 2 load, 4 dynamic pressure */
    OC_RET_GLIDE_DEV,     /* m above the glide path, on the approach */
    OC_RET_TOUCHED,       /* 1 once the wheels have touched */
    OC_RET_TD_SINK,       /* m/s down at the touch */
    OC_RET_TD_ALONG,      /* m past the threshold */
    OC_RET_TD_OFF,        /* m off the centreline, + to the right of the landing */
    OC_RET_TD_SPEED,      /* m/s over the ground */
    OC_RET_TD_PITCH_DEG,
    OC_RET_TD_T,          /* s since the start */
    OC_RET_STOPPED,       /* 1 once stopped */
    OC_RET_STOP_ALONG,    /* m past the threshold */
    OC_RET_STOP_OFF,      /* m off the centreline */
    OC_RET_PROP_USED,     /* kg of propellant since the return was engaged */
    OC_RET_COUNT
};

const double* oc_return_out(void);
int oc_return_out_len(void);

/* For tests. The felt acceleration, g, that the guidance's own model of the craft gives for the present
   state: the predictor's forces, at the craft's present angle of attack and bank. Equal to OC_G in
   flight if the predictor and the flight are one model. */
double oc_return_model_g(void);

/* For tests of robustness: make the guidance's model of the air and the craft wrong. Its density becomes
   the air's times rho (1 + wave sin(2 pi h / 12 km + phase)), its lift and drag coefficients the craft's
   times lift and drag; the craft still flies the core's. Kept through oc_auto, cleared by oc_reset. */
void oc_return_model_error(double rho, double wave, double phase, double lift, double drag);

#ifdef __cplusplus
}
#endif
