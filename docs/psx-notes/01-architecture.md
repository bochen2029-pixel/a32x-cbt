# 01 · Architecture

## 1 · Process shape

Two background threads own the whole simulation: a slow pass that sleeps a second between
iterations, and a fast pass that sleeps 50 ms. Both are endless loops in a single process.

Every domain of the aircraft offers a slow-pass step, a fast-pass step or both, and the program
calls them from a **fixed, hand-ordered list** each pass — about fifty calls in the slow pass,
about seventy in the fast one. There is no scheduler, no event queue, no component registry. The
order of the list *is* the schedule, and it is written to be causally correct. The fast pass runs,
in outline: fault consequences first; then simulated time and the weather; the landing gear, the
cabin signs and the aerodynamics; cabin temperature, radio voice, sound and the displays; brakes,
flight controls and the autopilot; the engines, electrics, hydraulics and flaps; the flight
management computer, bleed air and fire protection; and last the simulated pilot-not-flying.

Cause precedes effect by construction. Nothing reads a value its producer has not yet
written this pass. That is the whole ordering discipline and it is worth copying
exactly: a dataflow order, not an arbitrary module list.

## 2 · Time

Each pass works from the time elapsed since the previous one, in milliseconds, multiplied by the
simulation-speed factor: one such figure for the slow pass and one for the fast pass.

Clamps: the real elapsed time is held between 1 and 500 ms, and the flight model guards itself a
second time — its step factor is capped at the value an 80 ms frame gives.

Simulation speed is an instructor slider from 0 to 8. Above 1 everything is time-scaled by the same
factor. The factor also gates physics fidelity: the autopilot widens a rate above a factor of 8, the
electrics switch timers, and several subsystems pin their behaviour to a factor of exactly 1.

## 3 · State ownership

Every domain — the aerodynamics, the flight controls, the electrics, the hydraulics, the fuel — is a
**static class holding static state**. No instances, no dependency injection, no ownership tree.

Consequences, all of them deliberate:

- The whole model is reachable by name, which is what makes the network layer
  (the developer documentation's variable list and protocol) able to enumerate and drive it by
  string, and what let the author skip offsets entirely.
- One window, one view — a single simulator, not a reusable engine.
- Calls into another domain are direct: the bleed-air pass runs every valve's own slow step
  inline.

## 4 · Sub-model shape

Each axis is a state machine with the same five quantities and a single pass function: a
commanded target, a rate, an inertia (the reciprocal of responsiveness), a drag (dissipation) and
a back force (restoring), advanced by one integrator step each pass.

Rudder and yaw, pitch, roll, vertical speed, heading and true airspeed all follow it. Pitch, for
instance, carries a target, a rate, an inertia, a drag and a back force, and its pass turns the
target into a rate and the rate into an attitude; yaw adds an impulse term.

The pass functions are long, branch-heavy functions that read a global, apply a rate
per elapsed millisecond, and never take a per-frame constant.

## 5 · Guards

- Pause gates dozens of domains.
- A single authority: when several machines share one simulation, only the master runs the CDU,
  the autosave and the monitor lockout.
- NaN containment is a first-class system: numbered checkpoints at about two hundred places in the
  flight model halt the affected subsystem and name the stage instead of propagating a NaN through
  the model.
- The display units and the standby instrument cap their own delta again locally.

## 6 · Presentation separation

The physical model never touches the camera. The program's window is the view, not the airframe.
Aircraft position leaves the flight model through **three separate sinks**, one per coordinate,
scaled by a factor that turns the pass's distance into radians — so the integrator never has to
carry a world frame.

## 7 · What this architecture is good at

It ran on 2.5 GHz dual-core and 4 GB in 2010 and still does. Cost per subsystem is a
few hundred floating-point operations; the fast pass is a fixed 50 ms bill with no
frame budget arbitration. It is trivially inspectable, trivially serialisable, and
every subsystem can be frozen independently.

## 8 · Where it would hurt us

- Static singletons make a browser tab with two aircraft awkward.
- The sleep-driven passes have no accretion control: at time-warp the integrator
  just gets a bigger delta, so accuracy degrades exactly where education wants
  determinism.
- One simulator per process; a CBT wants scenario instances that reset in milliseconds.

Keep the *ordering discipline* and the per-axis shape. Drop the statics for typed
instances, and drive the two passes from a fixed-step accumulator rather than a sleep.
