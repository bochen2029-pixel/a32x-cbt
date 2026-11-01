# 03 · Transfer map

What carries from PSX to an A320 FBW CBT, what must be rebuilt, and why.

## Carries nearly intact — the simulator shell

| item | note |
|---|---|
| two-rate scheduler with a causal dispatch list | 01 §1, I6. Copy the discipline; drive it from an accumulator. |
| the four safe integrators | I2. Small, provable, unit-testable. |
| the per-axis command→rate→accel template | 01 §4, I3. Already the FBW shape. |
| elapsed-time integration | I1. |
| delta clamping | I4, tightened. |
| unit convention and edge translation | I9. |
| state-by-name dictionary + transport | I7. This is the debrief bus as much as the network. |
| guard instrumentation | I10, left switched on. |
| instructor surface as a first-class window | the situation and time pages, the aircraft-model page, the flight-data recorder (note 08). |
| scenario save/load | the situation file; 119 of them ship (note 06). |
| panel geometry and the 2D panel idiom | the shipped layouts and aircraft models, and the vector panels (note 07). |
| power-source dependency tables | `Developers\Power Sources for Indicator Lights.txt`, a lamp→bus mapping. Treat lamps as a graph, not a lookup. |

## Carries in shape, needs re-derivation — the systems

Electrical buses, hydraulics, bleed, fuel, fire, pressurisation. The *structure* — source,
distribution, consumer, failure propagation — is aircraft-neutral. The topology is
Boeing: three hydraulic systems where the A320 has three but with a PTU, a RAT-driven
GREEN channel, and a different bus map. Re-pin against A320 chapter references.

## Does not carry — the flight law

This is the whole reason for the project and the only part of PSX that is
near-worthless as a source.

In PSX the stick goes straight into the surface command and the law shapes it. The roll-rate
target is the aileron input times a small gain, plus a coupling term from the elevator through
pitch and bank; that target is gain-scheduled by indicated airspeed, in proportion to it and
normalised at 280 kt; bank follows the target through an inertia term; and on the ground, past
about 6.5° of bank, a pod strike is flagged and the roll response is made five times quicker.

That is a *direct law with airspeed scheduling and a hard clamp*. The A320 needs:

- stick → roll-rate command with autotrim in pitch, neutral stick,
- sidestick priority logic and dual-input summation,
- normal law protection envelopes: bank limit, pitch limit, high-alpha protection and
  alpha floor, g-protection and load-factor limiting,
- the degradation ladder C* → alternate → direct, with the reconfiguration triggers,
- the FBW computer set and its failure modes (ELAC/SEC/FAC, side-specific).

None of that exists anywhere in PSX's flight model, flight controls or autopilot. The autopilot's
servo layer is entirely Boeing mode logic; copy its *shape* (per-channel state machine, smoothers
that ramp a mode in, mode timers), not its content.

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

Decompiled output is a derivative of proprietary code, so none of it is quoted here. Notes are in
our own words and describe behaviour. `psx-notes/` stays separate from product source so a
structural-derivation argument stays available. A32NX GPLv3 is viral on distribution; JSBSim
LGPL-2.1 is fine as a linked library.
