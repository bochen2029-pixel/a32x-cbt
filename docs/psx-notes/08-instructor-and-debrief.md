# 08 · The instructor surface, and the debrief

55 `Instructor*.java` classes, 1.06 MB of source — larger than `Aerodynamics`. The
instructor is not a settings dialog; it is a second product surface, and it is the part
most worth copying for a CBT.

## It is split by concern

| group | classes |
|---|---|
| situation control | `InstructorSituAero` (24 K), `InstructorSituPos` (44 K), `InstructorSituServ` (48 K), `InstructorSituTime` (22 K), `InstructorSituHuman` |
| model / aircraft config | `InstructorModel` (106 K), `InstructorLoadModel` |
| faults | `InstructorMalf*` — one per chapter (Airframe, Alerts, Bleed, Electrical, Engines, Fire, Fuel, General, Hydraulics, Navigation, Self) |
| human actors | `InstructorHumanAtis`, `Calls`, `Cpdlc` (103 K), `Dispatch`, `Pnf`, `Traffic`, `VoiceAtc` |
| analysis / debrief | `InstructorAnalyse{Arpt,Elec,Misc,Navaid,Navig,Profile,Rec,Touch}`, `InstructorAnalysis` |
| network, prefs, layouts | `InstructorNetwork`, `InstructorNetMain`, `InstructorPref*`, `InstructorLayout` |

Naming by measurement axis (`Arpt`, `Navig`, `Touch`, `Profile`) rather than by code
module is what makes it a grading instrument.

## The debrief is a metric grid with stated aims

`InstructorAnalyseTouch` lays out three titled sections:

1. **"Component sinkrate on respective initial ground contact"** — nose gear
   ("aim for circa 80 fpm"), main gear ("aim for circa 200 fpm"), nose fuselage (if nose
   gear up), inboard engine pods (if main gear up).
2. **"Data recorded on main touchdown"** — offset from centreline ("aim for <35 ft"),
   threshold, pitch, bank, crab, speed deviation, scrub.
3. **"Non-normal events"** — pod 1, pod 4, wing L, wing R, tail.

Every cell is a `PLabel` over a `StringBuilder` that persists between runs, so the
instructor compares sorties. The aim text is part of the label, so the target is on
screen next to the measurement.

`InstructorAnalyseRec` is the recorder: CSV named by UTC under `Logs/`, modes
`EMBRY1` / `TACVIEW1` / `CLOUD1`, accumulating `distFt`, `millisRun`, `millisTotal` in
the fast pass (`Core.deltaAllegroAcc`). It is a flight-data recorder, not a replay.

## Why this is the strongest thing to copy

- It proves the product is a *training* tool and not a simulator with a menu. The
  analyst classes exist to say "here is how that landing was".
- Targets live with the measurements, so no separate spec can drift.
- Per-component breakdown (six contact points, not "the landing") is how a real AQT
  debriefs.
- The recorder writes a durable CSV, so a session can be reviewed after the fact.

## Where it stops short of a CBT

1. **No pass/fail.** Aims are prose ("aim for circa 200 fpm"), never a tolerance the
   tool evaluates. Nothing is scored and nothing is gated.
2. **No procedure at all.** There is no SOP, no flow, no step list, no "you skipped the
   before-start checklist". It measures the aircraft, never the crew.
3. **No scenario objective.** The instructor sets a situation; nobody says what
   competency it is for.
4. **No debrief narrative.** Numbers plus aims; no rationale, no reference to a manual
   page.

## Carry / add

Carry: the metric-grid layout, target-adjacent labels, per-component contact points, the
persistent-per-run accumulators, the CSV recorder, the chapter split of the fault panel.

Add, in this order: **tolerances** (each aim becomes `{min, max, weight}`), then
**procedure steps** with pass/fail, then **objective** per scenario, then the
**rationale** text. The first turns the aim into a grade; the rest turns a grade into a
lesson.

That is the whole product delta between PSX and the CBT, and it is small — it sits on
top of a metric grid that already exists.

