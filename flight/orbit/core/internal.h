// internal.h — what the core's parts share: the maths, the craft's numbers, the state, and the laws a
// crew mode flies through. Not an API: orbit_core.h, orbit_return.h, orbit_dock.h, orbit_deck.h and
// orbit_walk.h are. orbit_core.cpp owns everything here but the feature hooks at the end, which return.cpp,
// dock.cpp and deck.cpp define. GPLv3.

#pragma once

#include "orbit_core.h"
#include "orbit_deck.h"
#include "orbit_dock.h"
#include "orbit_return.h"

#include <cmath>

namespace oc {

const double PI = 3.14159265358979323846;
const double D2R = PI / 180.0, R2D = 180.0 / PI;
const double MU = 3.986004418e14;   // m3/s2, the Earth's gravitational parameter
const double RE = 6371000.0;        // m, a sphere of the Earth's mean radius
const double WE = 7.2921159e-5;     // rad/s, the Earth's turn
const double G0 = 9.80665;

// ---- vectors and quaternions ------------------------------------------------------------------

struct V3 { double x, y, z; };
inline V3 operator+(V3 a, V3 b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
inline V3 operator-(V3 a, V3 b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
inline V3 operator*(V3 a, double s) { return {a.x * s, a.y * s, a.z * s}; }
inline V3 operator*(double s, V3 a) { return a * s; }
inline double dot(V3 a, V3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline V3 cross(V3 a, V3 b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
inline double norm(V3 a) { return std::sqrt(dot(a, a)); }
inline V3 unit(V3 a) { const double n = norm(a); return n > 0 ? a * (1.0 / n) : V3{1, 0, 0}; }
inline double clampd(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }
inline double wrap(double a) { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; }

struct Q { double w, x, y, z; };
inline Q qmul(Q a, Q b) {
    return {a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z, a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w};
}
inline Q qconj(Q q) { return {q.w, -q.x, -q.y, -q.z}; }
inline Q qunit(Q q) {
    const double n = std::sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
    return {q.w / n, q.x / n, q.y / n, q.z / n};
}
inline V3 rot(Q q, V3 v) {   // body -> world for a body->world quaternion
    const V3 u{q.x, q.y, q.z};
    return v + 2.0 * cross(u, cross(u, v) + q.w * v);
}
inline V3 irot(Q q, V3 v) { return rot(qconj(q), v); }

Q fromAxes(V3 x, V3 y, V3 z);                 // the quaternion of the frame whose axes are x, y, z
V3 rotateAbout(V3 v, V3 axis, double angle);  // Rodrigues

// ---- the air ------------------------------------------------------------------------------------

struct Air { double rho, p, temp, sound; };
Air atmosphere(double alt);   // the 1976 standard atmosphere, alt in m above the sphere

// ---- the craft (chosen) -------------------------------------------------------------------------
// A delta lifting body of sixty tonnes, half of it propellant. Its one fiction is the drive: 2,000 s
// of specific impulse at a thrust of 1.2 times the take-off weight.

const double M_DRY = 30000, M_PROP0 = 30000;
const double S_REF = 150, SPAN = 18, CHORD = 12;
const double IXX = 4.0e5, IYY = 2.5e6, IZZ = 2.8e6;
const double T_MAX = 1.2 * (M_DRY + M_PROP0) * G0;
const double ISP = 2000;
const double RCS_ACC = 0.5;                   // m/s2 per axis from the small thrusters
const double KP_LIFT = 2.4, KV_LIFT = 3.0;   // Polhamus: potential and vortex lift of a slender delta
const double CY_BETA = -0.6;
const double CM_ALPHA = -0.30, CM_Q = -2.0, CM_CTRL = 0.25;
const double CL_BETA = -0.08, CL_P = -0.35, CL_CTRL = 0.08;
const double CN_BETA = 0.12, CN_R = -0.25, CN_CTRL = 0.04;
const double RCS_ANG[3] = {0.15, 0.10, 0.10};   // rad/s2 the thrusters can give, about x, y, z
const double TVC_ANG = 0.35;                    // rad/s2 the gimballed drive gives in pitch and yaw
// Jet-borne (deck.cpp): the drive swivels from aft to straight down through the centre of mass, and in its
// wings' roll posts and its nose's lift jet it bleeds up to 5 % of its thrust for attitude, in proportion
// to the thrust through the swivel. A roll post 4.5 m out: 0.05 T_MAX 4.5 m / IXX; the lift jet 10 m ahead
// of the centre of mass, trading with the aft nozzle: 0.05 T_MAX 10 m / IYY. Each at full thrust.
const double NOZZLE_MAX = 90 * D2R;
const double NOZZLE_RATE = OC_DECK_SWIVEL_DPS * D2R;   // rad/s
const double ROLL_POST_ANG = 0.40;              // rad/s2 about x
const double LIFT_JET_ANG = 0.14;               // rad/s2 about y
const V3 GEAR[3] = {{10.0, 0, 3.0}, {-3.0, -3.5, 3.0}, {-3.0, 3.5, 3.0}};   // nose, left, right; body
const double GEAR_K[3] = {1.3e6, 2.0e6, 2.0e6}, GEAR_C[3] = {2.0e5, 3.0e5, 3.0e5};

void liftDrag(double alpha, double mach, double* cl, double* cd);
V3 airMoment(double qbar, double tas, double alpha, double beta, V3 w);   // body axes, N m

// ---- the flight's fixed numbers (chosen) --------------------------------------------------------

const double T_GO = 20.0;              // s: when the crew releases the brakes
const double H_TARGET = 500000.0;      // m: the orbit, and the ring's
const double AZIMUTH = 90 * D2R;       // the launch azimuth: due east
const double RING_AHEAD = 25000.0;     // m: where the ring waits, ahead of the crew's arrival
const double RING_SPIN = OC_RING_SPIN;

// ---- state --------------------------------------------------------------------------------------

struct Controls { double pitch, roll, yaw, throttle, tx, ty, tz; int gearDown; double brake; };

}   // namespace oc

#include "deck_state.h"     // oc::DeckState: deck.cpp's own, in the state so a run replays
#include "dock_state.h"     // oc::DockState: dock.cpp's own
#include "return_state.h"   // oc::ReturnState: return.cpp's own

namespace oc {

struct State {
    long long n;       // steps since the start
    V3 r, v;           // ECI
    Q q;               // body -> ECI
    V3 w;              // body rates
    double prop;       // kg
    double thr;        // what the engine gives, 0..1
    int gear;          // 1 down
    int onGround, crashed;
    int autoMode, sas, phase;
    // the hand-flying law's memory
    int atmoLaw;
    double thetaT, phiT;
    // the crew's insertion guidance: the sine of the thrust's elevation is f0 + f1 (t - pegAt)
    double pegF0, pegF1, pegT, pegAt;
    int pegValid;
    Q hold;
    int holdValid;
    // the step's commands, held across it
    V3 torque;         // N m, body
    V3 rcs;            // m/s2, body
    double steer, brake;
    double nozzle;     // rad: the drive's swivel, 0 aft to NOZZLE_MAX down; it follows nozzleCmd at NOZZLE_RATE
    double nozzleCmd;  // rad: what the step's law asks of it; a law that does not ask leaves it aft
    // the features' own
    ReturnState ret;
    DockState dock;
    DeckState deck;
};

struct Site { double lat, lon, hdg; V3 e, n, u, p0; };   // the start point, Earth-fixed
struct Ring { V3 normal, e1, axis, ref0; double radius, rate, tArr; int valid; };

extern State g;
extern Site site;
extern Ring ring;
extern V3 sunEci;
extern Controls hands;

inline double timeOf(const State& s) { return s.n * OC_DT; }

// ---- where the craft is -------------------------------------------------------------------------

struct Local {
    V3 up, east, north;
    double alt, heading, pitch, roll;
    V3 vAirBody;
    double tas, mach, qbar, alpha, beta, vs;
    Air air;
};
Local localOf(const State& s);

struct Orbit { double apo, peri, inc, tApo, a, e; };
Orbit orbitOf(const State& s);

V3 ringPos(double t);     // the ring's centre, ECI
V3 ringVel(double t);
V3 ringRef(double t);     // the unit vector fixed in the ring, in its plane, that turns with it; ECI
V3 holdPoint(double t);   // OC_STANDOFF_M off the hub's port, on the axis; ECI

// The site frame, Earth-fixed, at time t: an ECI vector's (east, north, up) components there, and a
// point's from the start point.
V3 siteDir(V3 eci, double t);
V3 sitePos(V3 eci, double t);

// ---- forces and the step ------------------------------------------------------------------------

struct GearLoad { V3 force, moment; int contact; };   // force in ECI, moment in the body
GearLoad gearLoad(const State& s, V3 r, V3 v, Q q, V3 w);
V3 thrustAxis(double nozzle);   // the drive's thrust, a unit vector in the body, with the swivel at nozzle
void integrate(State& s);   // one RK4 step of OC_DT

// ---- the laws a crew mode flies through ---------------------------------------------------------

Q attitudeToward(V3 dir, V3 up, double roll, Q fallback);   // nose along dir, belly to the Earth
V3 ratesToward(const State& s, Q target, double gain, double limit);
void rateLoop(State& s, const Local& L, V3 wc);           // body rates in, torque out (sets s.torque)
V3 airLaw(State& s, const Local& L, double yawRate);      // hold s.thetaT and s.phiT, turn in balance
V3 alongTrack(const State& s, const Local& L);
V3 point(const State& s, const Local& L, V3 dir, double gain, double limit);

// ---- the features' hooks ------------------------------------------------------------------------
// return.cpp: the flight home (OC_AUTO_RETURN). dock.cpp: docking at the hub and contact with the ring
// (OC_AUTO_DOCK). Each keeps its state in State (ret, dock), so a run replays; each writes its own
// readouts block and folds its state into the hash.

void returnReset(State& s);                                    // at oc_reset
void returnEngage(State& s);                                   // oc_auto(OC_AUTO_RETURN)
void returnCrew(State& s, const Local& L, double* throttle);   // a step's commands, flying home
void returnAfterStep(State& s);                                // after each step, whoever flies
void returnWriteOut(const State& s);
void returnHash(const State& s, unsigned& h);

void dockReset(State& s);
void dockEngage(State& s);                                     // oc_auto(OC_AUTO_DOCK)
bool dockRide(State& s);                                       // true while held by the ring: the step is the ring's
void dockCrew(State& s, const Local& L, double* throttle);
void dockAfterStep(State& s);                                  // contact with the ring, capture
void dockWriteOut(const State& s);
void dockHash(const State& s, unsigned& h);
V3 dockHoldRates(const State& s);                              // OC_SAS_PORT: lined up on the port, turning with it
V3 dockSafeAim(const State& s, V3 goal);                       // goal, or the next corner of a way to it round the ring
void dockWreck(State& s, int what, int part, double back);     // a crash on the ring elsewhere: the wreck stays, carried

// deck.cpp: the flight deck (OC_AUTO_DECK, OC_SAS_DECK). Its contact with the gear is part of the force
// model, beside gearLoad, at the time of each of RK4's stages; the band round its open sector is part of
// docking's contact with the ring.
void deckReset(State& s);
void deckEngage(State& s);                                     // oc_auto(OC_AUTO_DECK)
void deckCrew(State& s, const Local& L, double* throttle);     // a step's commands, landing on the deck
bool deckPilot(State& s, const Local& L, double* throttle);    // OC_SAS_DECK: the pilot's hold, true where it applies
void deckAfterStep(State& s);                                  // the hard points against the deck, the touchdown
void deckWriteOut(const State& s);
void deckHash(const State& s, unsigned& h);
GearLoad deckGearLoad(const State& s, double t, V3 r, V3 v, Q q, V3 w);   // the gear on the deck, at time t
int deckBand(V3 p, double r);   // the band round the open sector, for a sphere at p in the ring's frame: OC_DOCK_HIT_*, or -1 away from it

void writeOut();   // orbit_core.cpp: every readouts block, from the state as it stands

// sky.cpp: where the Sun and the Moon are, for the flight's date and time; sets sunEci at oc_reset.
void skyReset(const Site& site);

// FNV-1a over bytes, for the state hash
inline void hashBytes(unsigned& h, const void* p, unsigned long n) {
    const unsigned char* b = static_cast<const unsigned char*>(p);
    for (unsigned long i = 0; i < n; ++i) { h ^= b[i]; h *= 16777619u; }
}
inline void hashDoubles(unsigned& h, const double* v, int n) { hashBytes(h, v, sizeof(double) * (unsigned long)n); }

}   // namespace oc
