// return_state.h — return.cpp's state, kept in oc::State so a run replays. Owned by return.cpp: all the
// flight home remembers from one step to the next is here, and all of it is in the hash. GPLv3.
#pragma once

namespace oc {

struct ReturnState {
    int phase;                // OC_RET_PH_*

    // What the air does to the craft, whoever flies: kept each step.
    double heat;              // W/m2 at the stagnation point
    double heatPeak;          // W/m2, since the return was engaged (or the start)
    double heatLoad;          // J/m2
    double load;              // g: the felt acceleration, the wheels' part left out
    double loadPeak;          // g, off the ground
    double qbarPeak;          // Pa
    int over;                 // limits exceeded: 1 heat, 2 load, 4 dynamic pressure
    double propAtEngage;      // kg

    // The plan: which pass, and when to leave the orbit.
    int planned;              // 1 with a burn time found
    double tBurn;             // s: when the burn starts
    double dv;                // m/s: its size, as planned
    double tInterface;        // s: when the predictor puts the craft at the entry interface
    double tGate;             // s: and at the end of the entry
    double crossPlan;         // m: how far off the track the runway lies on the pass taken, + to the left
    int passes;               // passes let go by
    double tPlan;             // s: when to plan again
    double tEvent;            // s: when the next event is expected (the readout's)

    // The entry's guidance.
    double bank0, vRef;       // rad, m/s: the bank profile, bank0 at vRef and faster
    double slope;             // m/rad: how the miss moves with bank0, as last measured
    int bankSide;             // +1 banked right, -1 left
    double bankCmd;           // rad, signed: the bank commanded this step
    double alphaCmd;          // rad
    double miss;              // m: the predictor's miss at the gate, short (+) or long (-)
    double tGuide;            // s: when the corrector runs next
    int cycle;                // corrector runs so far
    int reversals;

    // The terminal area and the approach.
    int side;                 // +1: the turn onto final is to the right, its circle west of the centreline; -1: left
    int leg;                  // 0 to the circle, 1 round it, 2 on final
    int laps;                 // whole turns round the circle still to fly, to spend height
    double arc;               // rad of the turn left, the step before
    double togo;              // m of path to the threshold
    double thrust;            // 0..1: the speed loop's integral
    double glideDev;          // m above the glide path

    // The landing's numbers, kept whoever lands it.
    int airborne;             // 1 once off the ground: a touch only counts after it
    double sinkLast;          // m/s down, the step before
    int touched;
    double tdSink, tdAlong, tdOff, tdSpeed, tdPitch, tdTime;
    int stopped;
    double stopAlong, stopOff;
};

}   // namespace oc
