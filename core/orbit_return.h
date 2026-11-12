// orbit_return.h — the flight home: from orbit to a stop on the start point's runway. A stub: the
// de-orbit, the entry, the approach and the landing are still to come. GPLv3.
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/* the return's phases */
enum { OC_RET_PH_NONE = 0 };

/* indices into oc_return_out() */
enum {
    OC_RET_PHASE = 0, /* OC_RET_PH_* */
    OC_RET_COUNT
};

const double* oc_return_out(void);
int oc_return_out_len(void);

#ifdef __cplusplus
}
#endif
