# 01 · Architecture

All line references are `<Class>.java:<line>` after decompilation.

## 1 · Process shape

Two daemon threads own the whole simulation.

- `LentoThread` (Core.java:1713) — slow pass, `sleep(1000)`, unclamped iteration at
  Core.java:1740-1846.
- `AllegroThread` (Core.java:1959) — fast pass, `sleep(50)`, Core.java:1966-2062.

Both are `while (true)` loops in a single JVM. Every domain class exposes a matching
`static void runLento()` and/or `static void runAllegro()`; `Core` calls them in a
**fixed, hand-ordered list** each pass (lento ≈ 50 calls at 1767-1822, allegro ≈ 70 at
1979-2060). There is no scheduler, no event queue, no component registry. The order in
`Core` *is* the schedule, and it is written to be causally correct:

```
MalfunctionsConseq → EarthTime → Weather → Gear → AisleSeatbelts → Aerodynamics
  → CabinTemp → RadioVoice → Sound → [display] → Brakes → FlightControls → AfdsFcc
  → engines → Elec → Hydraulics → Flaps → Fmc → BleedAir → Fire → Pnf
```

Cause precedes effect by construction. Nothing reads a value its producer has not yet
written this pass. That is the whole ordering discipline and it is worth copying
exactly: a dataflow order, not an arbitrary module list.

## 2 · Time

`deltaAcc` (Core.java:125) = `delta * simSpeed` (Core.java:1110); `deltaAllegroAcc`
(Core.java:129) = `deltaAllegro * simSpeed` (Core.java:1970). Milliseconds.

Clamps: real-delta to 1..500 (Core.java:1969), and a second guard at
Aerodynamics.java:823 where `safeDelta = deltaAcc > 80 ? 0.1 : deltaAcc * 0.00125`.

`Core.simSpeed` is a slider 0..8 (InstructorSituTime.java:40). Above 1 everything is
time-scaled by the same factor. `simSpeed` also gates physics fidelity —
AfdsFcc.java:2406 widens a rate when `simSpeed > 8`, Elec.java:2059 switches timers,
several subsystems pin behaviour to `simSpeed == 1.0`.

## 3 · State ownership

Every domain is a **static class holding static state**: `Aerodynamics.pitch`,
`FlightControls.getAerodynamicAileron()`, `Elec`, `Hydraulics`, `Fuel`. No instances,
no dependency injection, no ownership tree.

Consequences, all of them deliberate:

- The whole model is reachable by name, which is what makes the network layer
  (Variables.txt / Network Documentation.txt) able to enumerate and drive it by string,
  and what let the author skip offsets entirely.
- One `psxFrame`, one `visuals` — a single simulator, not a reusable engine.
- Recursion into another domain is direct (`BleedAir.java:689-695` calls every valve's
  `runLento()` inline).

## 4 · Sub-model shape

Each axis is a state machine with a fixed field set and a single pass function:

```
targX      commanded target
xVel       rate
xInertia   reciprocal of responsiveness
xDrag      dissipation
xBackForce restoring
xProgress()  the integrator
```

Rudder: `targYwVel`, `ywVel`, `yawInertia` (Aerodynamics.java:1472), `impulseYaw`
(1426). Pitch: `targPitch`, `pitchRate`, `pitchInertia`, `pitchDrag`, `pitchBackForce`,
`pitchProgress()` (1328-1404). Roll identical at 1133-1232. Vertical speed
`vsInertia` (919-929), heading (`headingInertia`, 1629), TAS (`tasInertia`, 1749).

The pass functions are long, branch-heavy functions that read a global, apply a rate
per `deltaAcc`, and never take a per-frame constant.

## 5 · Guards

- `Core.isPaused()` gates dozens of domains (1778, 1996).
- `Network.notClient()` enforces a single authority: only the master runs the CDU,
  the autosave, the monitor lockout (1823, 1990).
- NaN containment is a first-class system: `checkNan(int)` / `stopByNan(int, String)`
  (Aerodynamics.java:2168-2176 and ~200 call sites) halt the affected subsystem and
  name it instead of propagating a NaN through the model.
- `Idu.java:45` and `StandbyIsfd.java:1269` cap their own delta again locally.

## 6 · Presentation separation

The physical model never touches the camera. `Core.psxFrame` is the view, not the
airframe (`visuals.mouseHolder()`, Core.java:1980). Aircraft position is produced by
Aerodynamics through **three separate sinks** (1982, 2017, 2081) under
`radPerFrFac = 1.237588837910e10 / deltaAcc` (1944) — one per coordinate, so the
integrator never has to carry a world frame.

## 7 · What this architecture is good at

It ran on 2.5 GHz dual-core and 4 GB in 2010 and still does. Cost per subsystem is a
few hundred floating-point operations; the fast pass is a fixed 50 ms bill with no
frame budget arbitration. It is trivially inspectable, trivially serialisable, and
every subsystem can be frozen independently.

## 8 · Where it would hurt us

- Static singletons make a browser tab with two aircraft awkward.
- The `sleep`-driven passes have no accretion control: at time-warp the integrator
  just gets a bigger delta, so accuracy degrades exactly where education wants
  determinism.
- One simulator per process; a CBT wants scenario instances that reset in milliseconds.

Keep the *ordering discipline* and the per-axis shape. Drop the statics for typed
instances, and drive the two passes from a fixed-step accumulator rather than a sleep.

