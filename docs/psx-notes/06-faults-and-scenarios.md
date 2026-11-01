# 06 · Faults and scenarios

Both features are views over the same state dictionary (note 04). Neither invents a
parallel namespace.

## Faults

A fault is not code. It is one row in the registry plus a trigger, held in a
`Malfunction.Condition` (Malfunction.java:1598).

```java
String[] strCond = {
    "When airspeed is:", "When altitude is:", "When heading is:",
    "At distance to DEST:", "At simulated UTC:", "At random:", "Manual activation:"
};
boolean severe;
SwitchEvent switchEvent;
int globIdx;        // the registry slot this fault lives in
```

188 `static Condition` fields are declared one per fault (grep `^    static Condition `
in Malfunction.java). Activation state is a string on a `Qs` variable:

```java
Glob.qs[this.globIdx].transfer((se ? "1;" : "0;") + m + ";" + v, 'w', 1);
```

so a fault is addressed, transported, saved and triggered by exactly the same machinery
as a switch. `readGlob()` (Malfunction.java:1994) parses the same string back with
defensive bounds on the mode (0..6) and re-sends a reset on anything malformed.

Groupings are by ATA-ish chapter, and they exist for bulk arming and repair:
`extDisarmLong{Bleed,Electrical,Engines,Fire,Fuel,Hydraulics,Navigation,Alerts,Airframe}`
and the matching `extRepairLong*` (Malfunction.java ~1390-1500). `MalfunctionsRandom`
(1,996 lines) drives the "At random" mode; `MalfunctionsConseq` (195 lines) chains
consequences and runs **first in the fast pass** (Core.java:1979) so a fault is in force
before anything samples it.

## Scenarios

`Situations\*.situ`, 119 of them, ~24–27 KB each, 1,051 lines — see
`00 Parked 001 - Sydney.situ`.

Format: a header, a description block, then flat `VariableName=Value` lines.

```
[Aerowinx Precision Simulator - Situation]
Description=Qantas Airways VH-OJU at gate 10, Sydney. …
^-^-^-^ End of description ^-^-^-^
CfgVariant=2
McpWdoSpd=143
```

`SituationFiler.save()` (SituationFiler.java:48-56) walks the **entire** registry —
every `qi`, `qh`, `qs` — and writes each by `varName` with its current value. Load
(83-209) splits on `=` (ASCII 61), finds the variable by name, and calls
`transfer(..., 'w', 1)`. So a scenario is the state dictionary serialised, and loading a
scenario is a bulk actuation.

After a load, each class re-establishes its own invariants through `situLoadInit()`
(e.g. `Aerodynamics.situLoadInit`, `Malfunction.situLoadInit`) and `Global` resets
derived values. `load1/load2/load3` on the network brackets the whole thing so no client
sees a partial state (note 05).

## Why this is good

- A fault needs no simulator build step. Adding one is a registry row and a trigger.
- Scenarios are diffable, greppable, hand-editable, and a scenario is a *complete*
  state — no "restore procedure" can drift from the model, because it is the model.
- The instructor screen, the network, the scenario file and the debrief all read the
  same names.

## Where it is weak for a CBT

### 1 · Faults trigger on physics and time, not on trainee performance

The seven modes are airspeed, altitude, heading, distance to DEST, UTC, random, manual.
None of them is "when the pilot forgets X" or "after the trainee completes step 3".
A CBT wants the mode list extended with:

- **sequence-driven** — fire when a checklist step is reached, skipped, or repeated,
- **error-driven** — fire when the trainee sets the wrong value or omits an item,
- **state-anomaly** — fire when the aircraft is in a state the scenario should punish
  (e.g. on approach with the landing memo incomplete).

### 2 · `severe` is a single boolean

Two outcomes per fault (big/small fire, from the tooltip at Malfunction.java:1660-1662).
An ECAM-driven course needs a graded severity and a *consequence*, not a size.

### 3 · Situations carry no curriculum

No objective, no pass condition, no step list, no score, no debrief. A .situ answers
"what is true", never "what is being trained". The CBT product needs a second layer —
objective, steps, predicates, score, rationale — either beside the .situ or over it.

## Carry

The mechanism, almost unchanged: a fault as a registry entry with a trigger, a scenario
as a serialised dictionary, load bracketed by pause/apply/resume, per-class
re-initialisation after load.

Add the three trigger families above, replace the boolean with a graded severity, and
put a curriculum object alongside the state. Keep the `.situ` shape.

