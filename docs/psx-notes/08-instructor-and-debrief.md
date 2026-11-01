# 08 · The instructor surface, and the debrief

The instructor is a larger part of the program than the flight model. It is not a settings
dialog; it is a second product surface, and it is the part most worth copying for a CBT.

## It is split by concern

| group | pages |
|---|---|
| situation control | aerodynamics, position, services, time, and the human crew |
| model / aircraft config | the aircraft model and loading one |
| faults | one page per chapter: airframe, alerts, bleed, electrical, engines, fire, fuel, general, hydraulics, navigation, self |
| human actors | ATIS, calls, CPDLC, dispatch, the pilot-not-flying, traffic, voice ATC |
| analysis / debrief | airport, electrics, miscellaneous, navaids, navigation, profile, the recorder, touchdown, and an overview |
| network, prefs, layouts | network, the main connection, preferences, layout |

Naming by measurement axis (airport, navigation, touchdown, profile) rather than by code
module is what makes it a grading instrument.

## The debrief is a metric grid with stated aims

The touchdown page lays out three titled sections:

1. **"Component sinkrate on respective initial ground contact"** — nose gear
   ("aim for circa 80 fpm"), main gear ("aim for circa 200 fpm"), nose fuselage (if nose
   gear up), inboard engine pods (if main gear up).
2. **"Data recorded on main touchdown"** — offset from centreline ("aim for <35 ft"),
   threshold, pitch, bank, crab, speed deviation, scrub.
3. **"Non-normal events"** — pod 1, pod 4, wing L, wing R, tail.

Every cell is a label whose text persists between runs, so the instructor compares sorties. The
aim text is part of the label, so the target is on screen next to the measurement.

The recorder page writes a CSV named by UTC time under `Logs/`, in one of three output formats
(one of them for Tacview), accumulating distance flown and run time in the fast pass. It is a
flight-data recorder, not a replay.

## Why this is the strongest thing to copy

- It proves the product is a *training* tool and not a simulator with a menu. The
  analysis pages exist to say "here is how that landing was".
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
