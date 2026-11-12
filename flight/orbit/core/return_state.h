// return_state.h — return.cpp's state, kept in oc::State so a run replays. Owned by return.cpp. GPLv3.
#pragma once

namespace oc {

struct ReturnState {
    int phase;   // OC_RET_PH_*
};

}   // namespace oc
