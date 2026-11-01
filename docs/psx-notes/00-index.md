# Reference notes — Aerowinx PSX 10.137

Design study of a commercially sold 747-400 systems simulator, written in our own words.
No PSX code is reproduced here, and nothing here points into it: the notes say what the program
does and why that matters for a CBT, not where in its code it does it. Earlier commits of these
notes quoted decompiled excerpts; `docs/provenance.md` §1b records the correction.

## Contents

Purpose: recover the *architecture and invariants* of a working, shipping 2D-panel
simulator so they can be reused for an Airbus FBW CBT. PSX is the proven platform;
the airplane underneath gets swapped for the A32NX laws.

Source: a study of a licensed copy of PSX 10.137, made 2026-10-31, read together with the
developer documentation it ships (`Developers\Network Documentation.txt` and the variable list
the program writes, `Developers\Variables.txt`).

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

- Notes in our own words; no PSX source is copied into the new product, and none is quoted here.
- Anything reused as a *concept* names the note and section it came from, so provenance survives.
- A32NX (GPLv3) and JSBSim (LGPL-2.1) are the implementation donors; PSX is the design donor.
