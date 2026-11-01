# Architecture

How the trainer is built and why. Prose only — the design is here so nobody needs the Java it came
from.

Status: this describes `app/` as it stands at phase P5. Depths marked `[R]` were read out of the
reference system; everything else is this repository's own decision.

---

## 1 · The shape in one paragraph

One `Dictionary` holds every quantity in the aircraft, declared with a kind and a range. One fixed
20 Hz `Clock` says how many 50 ms steps are due. One dispatching function calls the systems in a
causal order, and each system writes to the dictionary and reads only what earlier systems already
wrote. A `Session` binds a dictionary, a clock, a world and a `Scorer` together; the page and the
tests drive sessions and nothing else. The panel and the ECAM are views over the same dictionary —
they hold no state of their own.

## 2 · Why a dictionary and not objects

State that a UI, a debrief and a scenario file all need to reach is easier to reach by name than by
navigation. Three consequences, all wanted:

- A panel control is `(position, label, form, variable)`. Adding a switch is adding a row of JSON.
- A scenario is the dictionary serialised, so saving and loading cannot drift from the system.
- A procedure step is a predicate over named state, so grading never reaches into a system.

The cost, paid deliberately: no encapsulation between systems. Causality is held by the dispatch
order, not by types.

## 3 · Time

Fixed. `Clock` accumulates wall time, returns whole steps, and **drops** debt past five steps rather
than stretching one. A rate integrated over 400 ms is not the same rate as one integrated over 50,
and the trainer needs runs to be reproducible for replay and for the debrief.

Anything that wants seconds rather than frames calls `Session.runFor`, which advances in frame
slices.

## 4 · Dispatch order

```
apu → elec → fuel → bleed → engines → press → hydraulics
```

Cause before effect. APU first because it is what lets an engine start cold; electrical before fuel
because the pumps are electric; bleed before engines because the starter is air; hydraulics last
because every pump needs an engine or the network.

One deliberate exception: generator contactors close on the *previous* tick's engine state, as an
aircraft's stale discretes would. Roughly 30–50% of the causal questions in a system like this
answer themselves by choosing this order rather than by adding a queue.

## 5 · Systems

Electrical: sources, contactors, AC and DC buses, a tie. Fuel: tanks, pumps, LP valves, crossfeed.
Bleed: engine and APU sources, crossbleed, packs. Pressurisation: a cabin schedule to 8,000 ft, a
differential ceiling near 8.6 psi, two outflow valves modelled as one. Hydraulics: three systems,
engine and electric pumps, a PTU, a RAT.

APU and engine start are time-driven state machines. Both model their classic failure as a
consequence rather than a refusal: arming a master below light-up speed is a hot start with a hot
EGT and poor acceleration, not an error message.

Pressurisation is the one system that needs something the aircraft cannot yet produce —
`pressureAltitudeFt` is a world input until aero exists at P7.

## 6 · Faults and content

A fault is a declared boolean plus a trigger (manual, at a time, at an altitude). Systems consult
the flag; the fault does not inject into them. Repairs are an explicit verb.

Panels, ECAM messages and ECAM pages live in `web/data/` as JSON and are validated at load: unknown
forms, duplicate ids, controls outside the grid, a guarded switch with no guard, an undeclared
variable. Content errors fail loudly at startup, which is what keeps a large data set honest.

A message condition is a small boolean tree — `var`, `not`, `all`, `any`, `eq`, `lt`, `gt`. A page
line carries the same tree twice for different jobs: `when` chooses the colour, `only` chooses
whether the line exists. An ECAM is dark without DC, so nothing renders on a dead aircraft even
though the model still knows.

## 7 · Scoring

A procedure is an ordered list of steps, each with a predicate, a window and a written reason. The
scorer advances one step per tick, so order is graded: reaching step six without step four is a
miss, not a credit. A step may carry a `measure { var, aim, band }`, sampled on completion, and the
debrief prints how far off it was.

Windows open either at procedure start or at a `startsWhen` predicate — the second is for drills
where the trainee cannot act until an instructor injects something.

## 8 · Sessions, replay, instructor mode

A session is reset by replacement, never mutation. `toSituation` parks one as text; `fromSituation`
rebuilds it. A run parked mid-drill, resumed, and finished replays to the same verdict, count and
step statuses — that is a passing gate, not a hope.

Instructor verbs: `pause`/`resume` (time stops, inspection does not), `injectFault`/`clearFault`
(not bound by the drill's armed set), and `reposition`, which loads a parked aircraft and **restarts
the score** because credit earned against a different aircraft is not credit.

## 9 · What is deliberately absent

No aerodynamics, no flight laws, no FMS, no displays beyond text. Those are P6–P9 and they land in
`flight/`, which is GPLv3 and separate. `app/` must stay linkable-free of A32NX.

## 10 · The known soft spots

- Systems are plausible, not sourced to A320 data. Every band and rate is a first estimate.
- 23 messages and 32 controls is a demo, not an aircraft.
- The panel is a grid, not traced geometry.
- Pressurisation's altitude input is faked until P7.
- Nothing is certified. See `docs/provenance.md`.
