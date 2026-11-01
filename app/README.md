# A32X CBT — B1 foundation

A computer-based trainer for an A320 fly-by-wire, built to run on a laptop with no GPU and no
installer. This directory is the **B1 rung**: panels, buses, ECAM, flows. No aerodynamics, no
flight laws — those are B2 and sit behind a boundary that has not been built yet.

Node 24, **zero dependencies**, no build step: Node strips the TypeScript types natively.

```
npm run demo          # cold & dark to powered, 17 s, bus table
npm run demo:flow     # two trainees, one procedure, two debriefs
npm run demo:panel    # the overhead, as ASCII
npm run demo:ecam     # the display, generated from state
npm run demo:scenario # save an aircraft, load it into a fresh one
npm run build:web     # compile the browser modules (tsc, no bundler)
npm run serve         # then open http://127.0.0.1:8130 — four drills, clickable panel
npm run test:all      # 138 tests, including a soak
```

## What exists

| file | what |
|---|---|
| `src/dictionary.ts` | typed state registry: names, kinds, ranges; validated writes; read-and-clear edges |
| `src/clock.ts` | fixed-step clock at 20 Hz; time never stretches, frame debt is dropped |
| `src/systems/elec.ts` | electrical network: sources, contactors, AC/DC buses |
| `src/systems/fuel.ts` | tanks, pumps, LP valves, crossfeed |
| `src/systems/pneumatic.ts` | bleed sources, crossbleed, packs |
| `src/systems/hydraulic.ts` | GREEN/BLUE/YELLOW, PTU, RAT, electric pump |
| `src/systems/apu.ts` | APU as a time-driven state machine: start, run, shutdown |
| `src/systems/engine.ts` | engine start: dry crank, light-up, hot start, rundown |
| `src/systems/index.ts` | the dispatch list — one tick, fixed causal order |
| `src/training/procedure.ts` | procedures as ordered steps with predicates, windows and rationale |
| `src/training/powerup.ts` | the first procedure: cold & dark to fully powered |
| `src/panel/controls.ts` | controls as data: position, variable, form, actuation semantics |
| `src/panel/schema.ts` | panel parser and validator: ids, rects, forms, detents |
| `src/panel/overhead.ts` | Node loader for the panel |
| `src/panel/render.ts` | ASCII view of a panel and its state |
| `src/ecam/line.ts` | ECAM lines and levels; colour is data |
| `src/ecam/pages.ts` | ELEC / HYD / FUEL / BLEED pages, generated from state |
| `src/ecam/warnings.ts` | message conditions as JSON trees, evaluated; display power gate |
| `src/ecam/messages.ts` | Node loader for the message set |
| `src/ecam/render.ts` | warnings above page body |
| `src/scenario/situation.ts` | the dictionary serialised: save, parse, atomic apply |
| `src/systems/press.ts` | cabin pressurisation: schedule, differential, outflow |
| `src/faults/index.ts` | faults as declared flags with time, altitude or manual triggers |
| `src/training/startengine.ts` | graded engine start, hot-start aware |
| `src/training/bluepump.ts` | fault-response drill with a window that opens on the fault |
| `src/training/packsfail.ts` | cruise depressurisation drill: manual mode and outflow valve |
| `src/training/beforestart.ts`, `afterstart.ts` | the two SOP flows, with measured readings |
| `src/training/setup.ts` | the state a drill is handed: cold, APU available, engines running |
| `src/app/main.ts` | browser entry: canvas panel, DOM display, frame loop |
| `src/app/draw.ts` | panel-to-draw-primitives, DOM-free |
| `src/session/session.ts` | dictionary + clock + procedure + faults; pause, inject, reposition, runFor |
| `web/index.html` | the page |
| `web/data/` | the content: `panel.json`, `messages.json` — one copy, both runtimes |
| `tools/serve.mjs` | dependency-free static server for local use |
| `src/demo*.ts` | the runnable views |
| `situations/` | saved aircraft |

## The five rules encoded here

1. **The dictionary is the only state.** Every quantity has a declared name, kind and range. An
   out-of-range write is refused, not clamped; the caller learns by watching the value not move
   (PSX `Qs.transfer`, note 04). It is the panel binding, the debrief bus and the future scenario
   file at once.

2. **Time is fixed, not measured.** A step is always 50 ms. If the host stalls, the clock drops
   debt instead of widening the step, because a rate law integrated over 400 ms is a different
   law (notes 02, 09).

3. **Write before read, in causal order.** `apu → elec → fuel → bleed → engines → hydraulic`.
   Consumers read nodes their producers wrote this pass; the electrical pump sees AC ESS from the
   same tick, and a test holds that. The one deliberate exception is the generator contactor, which
   uses the previous tick's engine state — as a real aircraft does.

4. **Nothing is an input that the model can produce.** `apuRunning` and `engNRunning` used to be handed in; they are now state machines driven by dt, so a trainee starts the APU and waits, and the bleed and generator appear on their own schedule.
5. **A procedure is ordered, and order is scored.** A trainee who reaches step 6 without step 4 is
   told, not congratulated. Every step carries the reason it matters, printed only for what was
   missed.

## The demo [M]

```
=== A: works the flow
Cold & dark to fully powered — PASS  7/7 in 42s
  ok   6. BLUE electric pump running           38.1s

=== B: stops after the fuel panel
Cold & dark to fully powered — FAIL  5/7 in 200s
MISS  6. BLUE electric pump running
MISS  7. Bleed 1 supplying the duct

why it mattered:
   BLUE electric pump running: the BLUE system has no engine pump; without the electric pump it is dead until the RAT
```

## Next

- the panel: controls as data — `(position, variable, physical form, table, event)` (note 07)
- ECAM page text generated from dictionary state
- APU and engine start as a state machine, so `apuRunning` stops being an input
- scenario files: the dictionary serialised (PSX `.situ` shape, note 06)
- more procedures: before-start, after-start, taxi

Not started: any rendering, any scenario file, any curriculum beyond one procedure.













