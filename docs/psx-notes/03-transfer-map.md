# 03 · Transfer map

What carries from PSX to an A320 FBW CBT, what must be rebuilt, and why.

## Carries nearly intact — the simulator shell

| item | note |
|---|---|
| two-rate scheduler with a causal dispatch list | 01 §1, I6. Copy the discipline; drive it from an accumulator. |
| the four `Calc` integrators | I2. Small, provable, unit-testable. |
| the per-axis command→rate→accel template | 01 §4, I3. Already the FBW shape. |
| elapsed-time integration | I1. |
| delta clamping | I4, tightened. |
| unit convention and edge translation | I9. |
| state-by-name dictionary + transport | I7. This is the debrief bus as much as the network. |
| guard instrumentation | I10, left switched on. |
| instructor surface as a first-class window | `InstructorSituTime`, `InstructorModel` (2,223 lines), `InstructorAnalyseRec` (flight-data recorder). |
| scenario save/load | `SituationFiler`, 119 `.situ` files. |
| panel geometry and the 2D panel idiom | `Layouts\`, `Models\`, `MainPanels` (2,716 lines). |
| power-source dependency tables | `Developers\Power Sources for Indicator Lights.txt` — 4,998 B of lamp→bus mapping. Treat lamps as a graph, not a lookup. |

## Carries in shape, needs re-derivation — the systems

Electrical buses, hydraulics, bleed, fuel, fire, pressurisation (`Elec` 2,562 lines,
`Hydraulics`, `Fuel` 2,288, `Fire` 2,833, `CabinPress`). The *structure* — source,
distribution, consumer, failure propagation — is aircraft-neutral. The topology is
Boeing: three hydraulic systems where the A320 has three but with a PTU, a RAT-driven
GREEN channel, and a different bus map. Re-pin against A320 chapter references.

## Does not carry — the flight law

This is the whole reason for the project and the only part of PSX that is
near-worthless as a source.

In PSX the stick goes straight into the surface command and the law shapes it:

```java
targBkVel = ail * 0.0018f + elevator * -1.0E-4f * sinPitch * sinBank;
targBkVel *= iasReal / 280.0f;              // gain scheduled by IAS
...
bankInertiaDelta = Core.deltaAcc / bankInertia;
if (ground && absBank > 0.1134464f) { podstrike = true; bankInertiaDelta *= 5.0f; }
```

That is a *direct law with airspeed scheduling and a hard clamp*. The A320 needs:

- stick → roll-rate command with autotrim in pitch, neutral stick,
- sidestick priority logic and dual-input summation,
- normal law protection envelopes: bank limit, pitch limit, high-alpha protection and
  alpha floor, g-protection and load-factor limiting,
- the degradation ladder C* → alternate → direct, with the reconfiguration triggers,
- the FBW computer set and its failure modes (ELAC/SEC/FAC, side-specific).

None of that exists anywhere in `Aerodynamics`, `FlightControls` or `AfdsFcc`. `AfdsFcc`
is 2,453 lines with 23 inner classes and is entirely Boeing autopilot mode logic;
copy its *shape* (per-channel state machine, acquire smoothers, mode timers), not its
content.

## Source of the law: A32NX, not PSX

`fbw-a32nx/src/systems/` (TypeScript) and `fbw-a32nx/src/wasm/fbw_a320` (Rust → wasm)
carry the actual law computers. GPLv3. The seam to port is already cut along the right
line by upstream.

## Phasing, restated from the plan

B1 is a full CBT with **no law and no aero at all** — panels, buses, ECAM pages, flows.
It is the correct first target and it exercises every item in the "carries" table
without needing the law. Only B2 introduces the FBW layer, and only then does JSBSim
(aero) enter.

## Legal

Decompiled output is a derivative of proprietary code. Notes are in our own words.
`psx-notes/` stays separate from product source so a structural-derivation argument
stays available. A32NX GPLv3 is viral on distribution; JSBSim LGPL-2.1 is fine as a
linked library.

