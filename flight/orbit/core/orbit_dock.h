// orbit_dock.h — docking at the ring's hub, and the craft's contact with the ring. A stub: the port
// and its tolerances, the crew's docking, capture and the ride while docked are still to come.
// GPLv3.
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/* indices into oc_dock_out() */
enum {
    OC_DOCK_DOCKED = 0, /* 1 while held by the hub's port */
    OC_DOCK_COUNT
};

const double* oc_dock_out(void);
int oc_dock_out_len(void);

/* Let go of the port: the craft drifts back along the axis. Nothing while not docked. */
void oc_undock(void);

#ifdef __cplusplus
}
#endif
