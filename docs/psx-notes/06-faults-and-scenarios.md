# 06 · Faults and scenarios

Both features are views over the same state dictionary (note 04). Neither invents a
parallel namespace.

## Faults

A fault is not code. It is one row in the registry plus a trigger condition. A condition holds
the trigger mode — one of seven: when airspeed is, when altitude is, when heading is, at a
distance to the destination, at a simulated UTC time, at random, or on manual activation — a
severity flag, the switch event that fires it, and the registry slot the fault lives in.

There are 188 such conditions, one per fault. Activation state is a short semicolon-separated
string on a string variable — the severity flag, the trigger mode, the trigger value — so a fault
is addressed, transported, saved and triggered by exactly the same machinery as a switch. Reading
it back parses the same string with defensive bounds on the mode (0..6) and re-sends a reset on
anything malformed.

Groupings are by ATA-ish chapter, and they exist for bulk arming and repair: one disarm-all and
one repair-all action per chapter — bleed, electrical, engines, fire, fuel, hydraulics,
navigation, alerts, airframe. A separate module drives the "at random" mode, and a short one
chains consequences and runs **first in the fast pass** (01 §1) so a fault is in force before
anything samples it.

## Scenarios

The situation files, `Situations\*.situ`: 119 of them ship, each about 24–27 KB and about a
thousand lines.

Format: a header line naming the program and the file type; a free-text description,
closed by a marker line; then flat `VariableName=Value` lines, one per variable, under the
names the developer variable list publishes — the aircraft configuration variant and the
selected speed in the mode control panel's window are two of them.

Saving walks the **entire** registry — every integer, human-input and string variable — and
writes each by its published name with its current value. Loading splits each line at `=`,
finds the variable by name, and writes it through the same transfer path a network write takes.
So a scenario is the state dictionary serialised, and loading a scenario is a bulk actuation.

After a load, each domain re-establishes its own invariants through its own post-load step, and
derived values are reset. `load1/load2/load3` on the network brackets the whole thing so no client
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

### 2 · Severity is a single boolean

Two outcomes per fault (a big or a small fire, as the instructor's tooltip puts it).
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
