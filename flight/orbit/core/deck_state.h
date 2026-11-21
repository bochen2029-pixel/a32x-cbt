// deck_state.h — deck.cpp's state, kept in oc::State so a run replays. Owned by deck.cpp. MIT.
#pragma once

namespace oc {

const int PLAN_MAX = 40;   // the most intervals a flown plan has (deck_plan.h)

// A plan as the crew flies it (deck_plan.h): its nodes and held forces in the Ring's frame, SI.
struct Flown {
    int n;                 // intervals; 0: none
    double t0, tf;         // s: its start, and its length
    double t[PLAN_MAX + 1];   // s: its nodes' times
    double r[PLAN_MAX + 1][3], v[PLAN_MAX + 1][3], z[PLAN_MAX + 1];
    double u[PLAN_MAX][3], sigma[PLAN_MAX];
    double cost;           // m/s: its delta-v from t0
};

struct DeckState {
    int phase;            // OC_DECK_PH_*
    int pad;              // the pad the landing and the approach path are for; -1 none
    int refused;          // OC_DECK_NO_*
    int autoBefore;       // who was flying before the crew's landing was asked for: a refusal hands back to them
    int near;             // 1 while the gear could reach the deck: the force model asks only then
    int onDeck;           // 1 while the gear presses on the deck
    int stuck[3];         // 1 while a leg's tyre sticks to its spot of the deck, come to rest on it
    V3 anchor[3];         // that spot, in the Ring's frame
    int still;            // steps the craft has sat on all three legs, at rest against the deck
    int calm;             // steps the crew's hover has been settled over the pad
    int side;             // +1 or -1: the side of the Ring's plane the craft keeps while among the spokes
    double prop0;         // kg when the landing (or the take-off) was asked for
    // the crew's plan, flown and made again at a low rate from where the craft is to the same end (deck_plan.h)
    Flown plan;
    int planKind;         // 0: a landing on pad; 1: a climb out from it to the approach's hold point
    double planEnd;       // s: when the plan ends
    double planNext;      // s: when to plan again
    int planSolves, planFails, planIters, planStatus;   // plans made, and failed, since engaged; the last solve's
    int burnt;            // 1 once the plan's first burn has been flown
    double v1;            // m/s: the delta-v flown since engaged, the drive's and the small thrusters' (|a| dt)
    // the golden section choosing the first plan's length, one plan a step: the plans it has left to make (0: none
    // under way), its bracket [gsA, gsB] and inner points gsC, gsD with their costs, the best cost found (its plan is
    // `plan`), and where every plan of it starts: when, the place and velocity, the mass, the force
    int search;
    double gsA, gsB, gsC, gsD, gsJc, gsJd, gsBest;
    double st0;
    V3 sr0, sv0;
    double sm0;
    V3 su0;
    int tryNext;          // the fallback a plan made again off the plan tries next: 0 the plan's share of the drive
    // what the crew has learnt of the drive in flight (deck.cpp's learnDrive): its thrust per kilogram over the
    // nominal, less one; and the last step's velocity in the Ring's frame as the navigation saw it, the acceleration
    // the model expected then and the drive's nominal part of it (estValid 1 while they are the last step's)
    double kT;
    V3 uPrev, aPrev, dPrev;
    int estValid;
    // the pilot's deck hold
    int holding, holdingC;   // 1 while it holds its place along the deck, and across it: nothing asking it to move that way
    V3 holdPos;           // that place, in the Ring's frame (x ref, y axis, z = x cross y)
    int holdingH;         // 1 while it holds a height, the throttle centred
    double holdH;         // that height over the floor, m
    double setS, setC;    // m/s: the speed it keeps against the deck, wound up by the stick held at a stop: along (spinward), across
    double cmdS, cmdC, setH;   // m/s: the velocity it asks for now: along, across, up
    double heading;       // rad: the nose over the deck, from spinward toward +axis
    int armed;            // 1 once the hold has taken its settings from the craft as it found it
    // the last touchdown
    int verdict, tdPad;
    double tdT, tdSink, tdDrift, tdOff, tdTilt;
    // the step before, near the deck, to judge a touchdown at the touch rather than at the end of its step: the
    // sink, its rate of change, the lowest leg's height over the floor, the drift (lastValid 1 while they are)
    int lastValid;
    double sinkLast, sinkRate, legLast, driftLast;
    // what the guidance is told against what is (oc_deck_disturb): the drive's thrust over what it is asked for
    // less one, the craft's mass as the guidance takes it over what it is less one, the swivel's lag (s), and the
    // navigation's errors in place (m) and velocity (m/s), each a first-order Gauss-Markov process with a 2 s
    // correlation, from a seeded generator whose state is here
    double dThrust, dMass, dLag, dPos, dVel;
    unsigned long long noiseSeed;
    double noise[6];      // the errors now, place then velocity, in the Ring's frame
    double lagged;        // rad: the swivel's command after its lag
};

}   // namespace oc
