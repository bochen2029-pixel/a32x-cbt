// dock_state.h — dock.cpp's state, kept in oc::State so a run replays. Owned by dock.cpp. GPLv3.
#pragma once

namespace oc {

struct DockState {
    int docked;   // 1 while held by the hub's port
};

}   // namespace oc
