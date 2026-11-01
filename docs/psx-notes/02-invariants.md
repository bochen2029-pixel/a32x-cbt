# 02 · Invariants

The rules that make PSX work. Each is stated generally, with the evidence, then the
modern form to carry into the CBT. These are the things worth copying; the content
behind them (747 numbers) mostly is not.

## I1 · Integrate on elapsed time, never on a per-frame constant

Every rate in the simulator is multiplied by elapsed milliseconds.

- Each pass has one elapsed-time figure, already scaled by the simulation speed (01 §2).
- It is used in about five hundred places: the roll law multiplies its rate by it, the roll and
  pitch inertias divide it (pitch inertia growing with gross weight), and anything audio or
  electrical uses the fast pass's own figure.
- Where a tick is the natural unit, the elapsed time itself is the tick: the self-decrab, for one,
  advances by a small constant times the elapsed milliseconds.

**Carry:** yes, absolutely. This is the rule that lets the same code run at 20 fps on a
2014 laptop and at 144 fps on a desktop.

## I2 · Snap inside a deadband; clamp the rate above zero

A small calculation library carries exactly four integrators, all of them safe:

- a linear step toward the target at a given rate;
- a smooth exponential approach, which closes a fixed fraction of the remaining gap each step and
  snaps to the target once inside a given band;
- the same exponential approach with a floor on the step;
- and with a ceiling on the step.

The first two snap to the target when the next step would overshoot it, so state converges exactly
instead of oscillating around it.

The limited variants take the step as the gap times the rate and then raise it to the floor (or cap
it at the ceiling) — so a control surface cannot creep at a fraction of a degree per minute when it
is nearly there.

**Carry:** yes. This is the single largest reason the model is stable. It also matters
for training: a CG must settle.

## I3 · The per-axis triple is command → rate → acceleration

No axis integrates position from a command. Each pass produces a rate, and the rate is
integrated into a pose. Pitch goes from its target to a pitch rate to the pitch attitude, with an
inertia, a drag and a back force shaping it. Roll, yaw, vertical speed, heading and TAS follow the
same five-quantity template (01 §4).

The roll inertia is recomputed every pass from the fuel weight: the inertia term is a function of
aircraft state, not a constant.

**Carry:** yes. It is the ordinary way to write a rate-command model, and it is already
the Airbus law shape.

## I4 · Guard the accumulator every time the frame stretches

Three layers, all deliberate:

- A 1 ms floor and a 500 ms ceiling on the real elapsed time.
- A second local cap where precision matters: the flight model caps its step factor at the value
  an 80 ms frame gives — note that the units change between the two guards, one being
  milliseconds and the other an already-scaled factor.
- Local caps in individual actors: the display units, the standby instrument and the core loop
  itself.

**Carry:** yes, but tighten it. A browser tab that is backgrounded loses its timer;
the delta must be clamped at the driver and every integrator must accept the clamped
value.

## I5 · One authority, by construction

A single "am I the master" check gates anything that must be singular — CDU wakeups, the
flight-deck monitor lockout and autosave, an accelerated cabin-altitude failure.

**Carry:** for a single-player CBT, the equivalent is "one scenario clock, one owner of
grading state". Do not let a panel and a debrief both advance the world.

## I6 · Declare the update order and make it causal

The dispatch lists are hand-ordered so that no reader precedes its writer:
weather before aero, aero before controls, controls before systems, systems before the
caution and advisory layer (01 §1).

**Carry:** yes. Make the phase order explicit data, not call order buried in a
function, and test it. A CBT that lets an ECAM message fire on last-frame data is a CBT
that lies to a student.

## I7 · Keep the model reachable by name

Static fields on static classes mean the whole state is addressable without offsets,
which is what let the author expose 1,263 named, typed, range-bounded variables
(`Developers\Variables.txt`) and an 82 KB text protocol over them, in a program written
in 2008. That is why a third-party add-on industry exists around it.

**Carry:** yes, in modern clothes — a typed state dictionary with declared units and
ranges, and a transport over it. It is also exactly the substrate a predicate-based
debrief needs.

## I8 · The view is not the airframe

The program's window is a camera. Position leaves the model through separate sinks, one per
coordinate, under a single radians-per-pass scale; the model never holds a 3D vector because there
is no 3D.

**Carry:** yes, and go further — the CBT needs the same model to drive a canvas panel
and, later, an MSFS socket.

## I9 · Keep internal conventions consistent, translate only at the edges

IAS is knots, altitude is feet, angles are radians, position is radians, weight is kg.
One constant converts radians to nautical miles, and it is the only place a unit crosses.
Standard atmosphere and the pressure ladder live in one place.

**Carry:** yes.

## I10 · Instrument the arithmetic for failure

Numbered checkpoints at roughly 200 places each carry a stage number; when one trips, the stage is
printed and the flight model stops itself rather than run on with a NaN (01 §5).

**Finding:** in 10.137 the check itself is an **empty stub** — the checkpoints are all
present and armed, the body is compiled out. So the containment hardware exists and
is currently inert.

**Carry:** yes, and leave it switched on. In a training tool a silent NaN is a student's
wasted hour.

## I11 · Determinism beats fidelity when a human is being graded

Simulation speed is a 0..8 slider, and several subsystems — the radio station
identifier and the wing and engine anti-ice among them — pin themselves to a speed of exactly 1
rather than degrading. Fault consequences run first in the fast pass, so a fault is in force before
anything reads it.

**Carry:** yes — and this is where the CBT should diverge from PSX. A debrief needs a
seeded, fixed-step, replayable run, not a live one.
