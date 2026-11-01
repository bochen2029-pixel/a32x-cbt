# Reference notes — Aerowinx PSX 10.137

Design study of a commercially sold 747-400 systems simulator, written in our own words.
No PSX code is reproduced here. The line references point into a decompiled reference tree that
this repository does not vendor — see `tools/regen-psx-reference.md`.

## Contents

Purpose: recover the *architecture and invariants* of a working, shipping 2D-panel
simulator so they can be reused for an Airbus FBW CBT. PSX is the proven platform;
the airplane underneath gets swapped for the A32NX laws.

Source: `the PSX jar` (7,507,579 B), decompiled 2026-10-31 with
CFR 0.152 to `the reference tree`. `javap -p` used to confirm signatures where
CFR's output is ambiguous.

## Decompile facts

- 4,164 class entries; **1,247 top-level classes**; 3,917 inner classes.
- Output: 1,248 `.java` files, 18,706,672 B, 396,030 lines, **zero decompilation failures**.
- 722 of those files are vendored LWJGL/OpenGL/OpenAL constants under `net/` + `org/`.
  The simulator proper is roughly 525 classes.
- Verified: `javap -p` field/constant names are intact, CFR local names are intact
  (see `Aerodynamics.java:2836-2860`). The author shipped no obfuscation.
- Every class carries `static int Copyright_2008_by_Hardy_Heinlin__Reverse_Engineering_Prohibited`.

Largest simulator classes (lines): Routes 6,852 · CircuitBreakers 5,893 ·
NavigationDisplay 5,479 · FmcDepArr 4,414 · Glob 3,896 · FmcVnavCalc 3,840.

## Index

| # | note | what it holds |
|---|---|---|
| 01 | `01-architecture.md` | the runtime: threads, delta, dispatch order, state ownership |
| 02 | `02-invariants.md` | the rules that make it frame-rate independent and survivable |
| 03 | `03-transfer-map.md` | what carries to an A320 FBW CBT, what does not |
| 04 | `04-state-dictionary.md` | the compiled-in registry; the debrief bus |
| 05 | `05-network-protocol.md` | TCP text protocol, actuate-and-observe |
| 06 | `06-faults-and-scenarios.md` | fault triggers, `.situ` format, and their gaps |
| 07 | `07-panels.md` | vector panel system, control-as-data, layout crops |
| 08 | `08-instructor-and-debrief.md` | instructor surface and the metric-grid debrief |
| 09 | `09-cost-budget.md` | dispatch width, 980 Hz figure, budgets for the CBT |
| 10 | `10-autopilot-and-fmc.md` | AP mode machine and FMC stack shape (B2 layer) |
| 11 | `11-a32nx-port-cost.md` | measured port cost of the A32NX law core and systems |
| 12 | `12-aero-axis-model.md` | the flight model: axis dispatch, template, guards |

## Standing decisions

- Notes in our own words; no PSX source is copied into the new product.
- Anything reused as a *concept* gets the PSX reference line here so provenance survives.
- A32NX (GPLv3) and JSBSim (LGPL-2.1) are the implementation donors; PSX is the design donor.



