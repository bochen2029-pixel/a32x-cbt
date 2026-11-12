// deck_state.h — deck.cpp's state, kept in oc::State so a run replays. Owned by deck.cpp. GPLv3.
#pragma once

namespace oc {

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
    int side;             // +1 or -1: the side of the spokes' plane the craft keeps until past the last spoke
    V3 holdAt;            // DEPART, WAIT: the point at rest among the stars, from the Ring's centre, ECI axes
    double as;            // GLIDE: the bleed's deceleration along the deck, m/s2, frozen as the glide starts
    double sK, vK, aF;    // the final segment: where it starts (m of the floor's arc before the pad), the speed there, the deceleration in it
    double sL0, sL1;      // the course across: on the centreline from sL0 in, at the craft's side from sL1 out
    double prop0;         // kg when the landing was asked for
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
};

}   // namespace oc
