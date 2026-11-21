// wind_state.h — the wind's state, kept in oc::State so a run replays. Owned by wind.cpp. The field is a
// function of the seed and strength alone (orbit_wind.h); what wind.cpp works out from the seed is a cache
// of it, not state. MIT.
#pragma once

namespace oc {

struct WindState {
    unsigned seed;     // the day
    double strength;   // 0: no wind, and the air is as it was before the wind existed
};

}   // namespace oc
