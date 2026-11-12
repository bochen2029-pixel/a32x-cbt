// fd_state.h — fd.cpp's state, kept in oc::State so a run replays. Owned by fd.cpp: all the flight director
// remembers from one step to the next is here, and all of it is in the hash. GPLv3.
#pragma once

namespace oc {

struct FdState {
    int on;                   // the pilot's switch (oc_fd): computed and read out; on at reset
    int last;                 // who flew the step before (OC_AUTO_*); -1 after a reset
    int handed, from;         // oc_auto changed who flies since that step, from whom
    int home;                 // a flight home is under way: its crew has flown, and it has not ended
    int source;               // whose guidance runs in the shadow: 0 none, 1 the crew to orbit, 2 the flight home

    // The guidance's memory, as its crew keeps it in State, carried on while the pilot flies: the crew to
    // orbit's phase, its pitch and bank targets and its insertion plan; the gear as the guidance has it; and
    // the flight home's whole state, return.cpp's own.
    int phase;                // OC_PH_*
    double thetaT, phiT;      // rad
    double pegF0, pegF1, pegT, pegAt;
    int pegValid;
    int gear;
    ReturnState ret;

    // The step's command: what the guidance would have flown, from the state the step began in.
    int valid;
    int fdPhase;              // OC_FD_PH_*
    double pitch, heading, bank;   // rad: the attitude it asks for, as localOf reckons the craft's
    double throttle;          // 0..1
    double alpha, liftBank;   // rad: the flight home's angle of attack and bank about the air's velocity
};

}   // namespace oc
