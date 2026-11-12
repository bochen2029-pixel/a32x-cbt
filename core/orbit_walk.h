// orbit_walk.h — a person inside the ring, in its turning frame: the hub, a spoke's lift, the floor.
// Its own state and its own step, apart from the flight's. A stub until built. GPLv3.
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/* indices into oc_walk_out() */
enum {
    OC_WALK_T = 0, /* s since oc_walk_reset */
    OC_WALK_COUNT
};

void oc_walk_reset(void);
/* The walker's hands: fwd, right -1..1 (walk), turn rad/s (heading), jump and use are 0 or 1. */
void oc_walk_controls(double fwd, double right, double turn, int jump, int use);
void oc_walk_step(int n);
const double* oc_walk_out(void);
int oc_walk_out_len(void);
unsigned oc_walk_hash(void);

#ifdef __cplusplus
}
#endif
