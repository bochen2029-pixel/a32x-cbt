# 02 · Invariants

The rules that make PSX work. Each is stated generally, with the evidence, then the
modern form to carry into the CBT. These are the things worth copying; the content
behind them (747 numbers) mostly is not.

## I1 · Integrate on elapsed time, never on a per-frame constant

Every rate in the simulator is multiplied by elapsed milliseconds.

- `Core.deltaAcc` (Core.java:125), assigned from `delta * simSpeed` (Core.java:1110).
- ~500 call sites: `Core.deltaAcc * 0.0018f` in the roll law (Aerodynamics.java:2839),
  `Core.deltaAcc / bankInertia` (1133), `/ (600.0f + grWeightReal * 0.002f)` for pitch
  inertia (1328), `Core.deltaAllegroAcc` for anything audio or electrical (Aerodynamics.java:2157).
- `Core.deltaAcc` is also used directly as "one tick" where a tick is the unit
  (`selfDecrabAct += Core.deltaAcc * 5.0E-5f`, 1494).

**Carry:** yes, absolutely. This is the rule that lets the same code run at 20 fps on a
2014 laptop and at 144 fps on a desktop.

## I2 · Snap inside a deadband; clamp the rate above zero

`Calc` (1,392 lines) carries exactly four integrators, all of them safe:

```java
getLinear(targ, act, rate)              // step, snap on overshoot
getSmoothExpo(targ, act, rate, lim)     // fraction of the gap, snap inside lim
getMinLimitedExpo(targ, act, rate, minRate, lim)
getMaxLimitedExpo(targ, act, rate, maxRate, lim)
```

`getLinear` at Calc.java:343, `getSmoothExpo` at 353. Both snap to the target when
the step would overshoot, so state converges exactly instead of oscillating around it.

The limited variants compute `r = (targ - act) * rate` and then raise `r` to `minRate`
(or cap it at `maxRate`) — so a control surface cannot creep at a fraction of a degree
per minute when it is nearly there.

**Carry:** yes. This is the single largest reason the model is stable. It also matters
for training: a CG must settle.

## I3 · The per-axis triple is command → rate → acceleration

No axis integrates position from a command. Each pass produces a rate, and the rate is
integrated into a pose. Pitch: `targPitch → pitchRate → pitch` with `pitchInertia`,
`pitchDrag`, `pitchBackForce` shaping it (Aerodynamics.java:1328-1404). Roll, yaw,
vertical speed, heading and TAS follow the same five-field template.

`bankInertia = 600 + fuelWeightReal * 0.006` is recomputed every pass (2166): the
inertia term is a function of aircraft state, not a constant.

**Carry:** yes. It is the ordinary way to write a rate-command model, and it is already
the Airbus law shape.

## I4 · Guard the accumulator every time the frame stretches

Three layers, all deliberate:

- 1 ms floor and 500 ms ceiling on the real delta (Core.java:1969).
- A second local cap where precision matters: `safeDelta = deltaAcc > 80 ? 0.1 : deltaAcc * 0.00125` (Aerodynamics.java:823) — note the units change, one is ms and the other an already-scaled factor.
- Local caps in individual actors: `Idu.java:45`, `StandbyIsfd.java:1269`, `Core.java:1500`.

**Carry:** yes, but tighten it. A browser tab that is backgrounded loses its timer;
the delta must be clamped at the driver and every integrator must accept the clamped
value.

## I5 · One authority, by construction

`Network.notClient()` gates anything that must be singular — CDU wakeups (Core.java:1990),
flight-deck monitor lockout and autosave (1823), accelerated-cabin-altitude failure (Aerodynamics.java:2175).

**Carry:** for a single-player CBT, the equivalent is "one scenario clock, one owner of
grading state". Do not let a panel and a debrief both advance the world.

## I6 · Declare the update order and make it causal

The dispatch lists in `Core` are hand-ordered so that no reader precedes its writer:
weather before aero, aero before controls, controls before systems, systems before the
caution and advisory layer (Core.java:1979-2060).

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

`Core.psxFrame` is a camera. Position is consumed through three separate sinks
(Aerodynamics.java:1946, 1982, 2017, 2081) under `radPerFrFac`; the model never holds
a 3D vector because there is no 3D.

**Carry:** yes, and go further — the CBT needs the same model to drive a canvas panel
and, later, an MSFS socket.

## I9 · Keep internal conventions consistent, translate only at the edges

IAS is knots, altitude is feet, angles are radians, position is radians, weight is kg.
`RAD2NM = 3437.746770784939` (Aerodynamics.java:4) is the only place a unit crosses.
Standard atmosphere and the pressure ladder live in one place (Calc.java:1073-1090).

**Carry:** yes.

## I10 · Instrument the arithmetic for failure

`checkNan(int)` is called at roughly 200 points with a stage number, and
`stopByNan(int, String)` prints the stage and sets `nanStop` (Aerodynamics.java:2195-2201).

**Finding:** in 10.137 `checkNan(int i) {}` is an **empty stub** — the call sites are
all present and armed, the body is compiled out. So the containment hardware exists and
is currently inert.

**Carry:** yes, and leave it switched on. In a training tool a silent NaN is a student's
wasted hour.

## I11 · Determinism beats fidelity when a human is being graded

`Core.simSpeed` is a 0..8 slider (InstructorSituTime.java:40) and several subsystems
pin themselves to `simSpeed == 1.0` rather than degrading (RadioIdent.java:41,
OvhdWaiNai.java:757). `MalfunctionsConsec` runs first in the fast pass so a fault is in
force before anything reads it (Core.java:1979).

**Carry:** yes — and this is where the CBT should diverge from PSX. A debrief needs a
seeded, fixed-step, replayable run, not a live one.

