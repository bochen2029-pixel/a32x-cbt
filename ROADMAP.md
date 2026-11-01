# A32X CBT — roadmap

A computer-based trainer for an A320 fly-by-wire, built to run on a laptop with no GPU and no
installer. This document is the plan and the honest state of it.

Last written: 2026-10-31, at P5 (packaging) — the tree was split into `app/` and `flight/` and put under git.

---

## 1 · Where the code lives

```
  app\            the trainer
  ├─ src\         application code, 41 files / 2,787 lines
  ├─ tests\       20 files / 2,265 lines, 160 tests
  ├─ web\         page + web/data\ (panel, messages, pages — content, one copy for both runtimes)
  ├─ tools\       serve.mjs, a dependency-free static server
  └─ situations\  one saved aircraft as a sample

  flight\         GPLv3. The A32NX port contract and the headless ELAC proof. Not running yet.
  docs\           provenance, architecture, psx-notes\, conventions
  tools\          regen-psx-reference.md
  reference\      two screenshots
```
The `app/` / `flight/` split is enforced: `app/` links no A32NX code and carries no GPL
obligation; `flight/` links it and is GPLv3. Keeping them apart is cheaper than untangling later.

`app/` is MIT (see `LICENSE`). `flight/` is GPLv3 (see `flight/LICENSE`).

---

## 2 · What exists, and what it is worth

**Mechanics, tested.** [M] 160 tests green, suite runs in ~2 seconds.

| piece | state |
|---|---|
| dictionary — typed, ranged, edge-detecting | done |
| fixed 20 Hz clock, debt-dropping | done |
| electrical, fuel, bleed, hydraulic, pressurisation | done, simplified |
| APU and engine start as time-driven state machines | done |
| panel: 32 controls, hit-tested, guarded/selector/table forms | done |
| ECAM: 23 messages, 5 generated pages, dark-without-power | done |
| procedures: 6 graded drills, ordered, with rationale and measured readings | done |
| faults: 6, triggered by time / altitude / instructor | done |
| scenarios: atomic save/load, park-and-resume proven deterministic | done |
| instructor mode: freeze, inject, reposition | engine + page controls |
| browser: canvas panel, ECAM, live step list, debrief | done |

**What it is not.** The systems are plausible abstractions, not A320 data. The panel is a
placeholder grid, not traced geometry. There is no aero and no flight law, so nothing flies. It is
not a type-rating device and must never be presented as one.

**Runtime size.** 100 variables, ~2.8k lines of application code. The whole page is a few hundred
KB of JavaScript behind an HTTP server that has no dependencies.

---

## 3 · The fork, and the choice

**A — systems trainer.** Flows, ECAM, drills, scoring, debrief. No aerodynamics, no flight laws.
Ships in weeks. Teaches the part of an aircraft a trainee actually fails a check ride on.

**B — flight trainer.** The real FBW law core from A32NX plus JSBSim. Unique — nobody has this in a
browser — and months of work because of the driver, the aero and the displays.

**Decision: A to completion first. B is a second product, not a later phase of the first.** A
systems trainer with a real curriculum is a product; a half-finished flight model with four drills
is not.

---

## 4 · Phases and gates

A phase is done when its gate passes, not when the code exists.

| # | phase | gate | state |
|---|---|---|---|
| P1 | **Session hardening** — park, resume, replay, diff | a run parked mid-drill and resumed produces the same verdict, count and step statuses | **passed** [M] |
| P2 | **Content as data** — panels, messages, pages in JSON | content loads, validates, and is refused when broken; one copy serves both runtimes | **passed** [M] |
| P3 | **Curriculum v1** — SOP flows, drills, measured steps | six drills grade end to end, each with a written aim | **passed** [M] |
| P4 | **Instructor mode** — freeze, inject, reposition | an instructor can drop a fault into a live aircraft and the score records the disruption | **passed** [M] |
| P5 | **Ship A** — packaging, notices, reference machine | a stranger runs it from a zip on a 2014 laptop | in progress — zip gate passes from `file://` [M]; never run on a 2014 laptop; reset misses 20 ms at 3× CPU slowdown |
| P6 | **Law harness** — the A32NX computers standalone | ELAC/SEC/FAC step at 50 Hz against a stub world for 30 minutes, no NaN | spike passed, harness pending |
| P7 | **Aero** — JSBSim airframe, law↔surface↔air data | a hand-flown ILS is stable and repeatable | not started |
| P8 | **Displays** — PFD/ND/EWD/SD from law state | six tubes render from real law output at 20 Hz | not started |
| P9 | **FMS** — route, performance, progress, DIR | one flight plan flies end to end | not started |
| P10 | **Bridge** — socket to MSFS for people with a GPU | the same course runs on both machine tiers | not started |

### P5 in detail — the shipping gate

- [x] `git init`, trainer/flight split, `.gitignore` for `node_modules`, build output, assets
- [x] licence notices: the zip carries `LICENSE` (MIT) and `README.txt` — the disclaimer, the
      attribution for the PSX design study, trademarks. A owes no A32NX or JSBSim notice: the bundle
      holds only `src/` and `web/data/` modules plus esbuild's three-line class-field helper, and
      JSBSim arrives with `flight/` at P7
- [x] the disclaimer, permanent: *unofficial, not affiliated with Airbus, not for type training* — in
      `README.md`, in the zip's `README.txt`, and on the page under the status line
- [x] a build that needs no Node: one bundled `web/app.js`, content inlined, double-click `index.html`
      — verified opening from `file://` in headless Chrome. Until `9d04fb0` it stopped at 0 s on 9 of
      12 cold loads under software rendering: a frame stamped before startup finished handed the
      clock a negative interval, and the refusal killed the frame loop
- [x] a zip: `npm run package` → `dist/a32x-cbt.zip`, about 25 KB — `index.html`, `app.js`, `data/`,
      `LICENSE`, `README.txt`. Explicit file list, notices checked, same files → same bytes
- [x] the zip gate: `npm run gate` unzips with the operating system's `tar.exe` into `%TEMP%`, outside
      the repository, and opens `index.html` from `file://` with the network off. **Passed
      2026-11-01 UTC** in Chrome 148 and Edge 156, software and default rendering, 19 loads: every
      request inside the folder (the page reads `index.html` and `app.js`, nothing else), nothing
      thrown, time moving, a real click answered. The same gate failed 2 of 4 loads on the pre-fix zip
- [ ] measured on the reference machine: 20 Hz held, cold start under 1 s, scenario reset under 20 ms
      — **not done: no 2014 laptop was available.** Measured on a dev desktop instead, below
- [ ] a README a stranger can follow in one screen — the draft is the zip's `README.txt`, 36 lines;
      no stranger has tried it yet

#### P5 measurements — a dev desktop, not the reference machine

`npm run measure` at `19df65a`, 2026-11-01 UTC: the page from `file://` in headless Chrome 148.0.7778.98
with software rendering, watched from outside — nothing is built into `app.js`. Each cold start is a
fresh browser on a fresh profile. Machine: Intel Core i9-9900K (8 cores, 16 threads, 3.6 GHz),
64 GB, Windows 11 Pro 10.0.26100, desktop. It was shared with other work throughout: total CPU,
sampled each second, averaged 76 % during the 1× run and 60–62 % during the others, browser
included. 3× and 6× are DevTools CPU throttling — a stand-in for slower CPUs, not a measurement of
any laptop. Each cell is median / worst; **bold** misses the target.

| measure | target | 1× | 3× | 6× |
|---|---|---|---|---|
| cold start: navigation → first frame drawn, 10 runs | < 1 s | 125 / 232 ms | 287 / 441 ms | 718 / **1,274 ms** |
| reset, Power up — setup runs 0 steps; 20 resets each | < 20 ms | 1.9 / 3.7 ms | 4.5 / 7.5 ms | 9.2 / **20.2 ms** |
| reset, Before start — 0 steps | < 20 ms | 1.8 / **29.4 ms** | 2.7 / 7.1 ms | 9.2 / **36.8 ms** |
| reset, Start ENG 1 — 400 steps (APU start) | < 20 ms | 4.7 / 17.0 ms | 10.6 / **36.6 ms** | **27.5 / 57.1 ms** |
| reset, BLUE pump failure — 400 steps | < 20 ms | 4.7 / 12.5 ms | 12.1 / **27.3 ms** | **26.8 / 89.9 ms** |
| reset, After start — 1,458 steps (APU and both engines) | < 20 ms | 11.7 / **24.3 ms** | **28.2 / 46.6 ms** | **69.0 / 96.1 ms** |
| reset, Packs fail in cruise — 1,458 steps | < 20 ms | 12.0 / **24.0 ms** | **26.1 / 52.9 ms** | **70.9 / 137.5 ms** |
| tick rate, 60 s on Packs fail in cruise: steps per wall second | 20 | 20.001 | 20.001 | **19.789** |
| — frame gaps over 250 ms, each dropping simulated time | 0 | 0 | 0 | **9** |
| — main thread busy (of which script) | — | 9.0 % (2.0 %) | 27.2 % (6.4 %) | 70.3 % (18.7 %) |

A reset is the drill button's handler: a new session, the drill's setup, a repaint. An earlier 1×
run at 58 % background load read cold start 97 / 122 ms and every reset within 20 ms (worst
12.1 ms). Browser spawn to first frame, which includes Chrome starting on a new profile, was 794 ms
median at 1× — context, not a target.

What the numbers say:

- On this desktop all three targets hold at the median. Three drills had a worst reset of 24–29 ms,
  in the run during which the machine averaged 76 % busy.
- Reset cost follows the setup, which runs the model forward synchronously before the first paint.
  At 3× the engine drills take 26–28 ms at the median; at 6×, about 70 ms. Starting a drill from a
  parked `.situ` (§8, action 4) would skip that run.
- 20 Hz holds at 3×. At 6× the page drops 1 % of simulated time in nine stalls. Script — the model
  and the paint code together — is about a quarter of the main thread's busy time at every speed;
  the rest is the browser's own style, layout, paint and raster work, for a panel, ECAM and step
  list redrawn twenty times a second. If the reference laptop cannot hold 20 Hz, cutting systems
  will not recover much.

---

## 5 · The problems that decide it

- **Aero is the only novel physics.** JSBSim mitigates it; nothing else does. P6 exists to fail
  cheaply before P7.
- **The FMS is the largest body of work** — ~40k lines in PSX [R]. Scope to route, performance,
  progress, DIR. Skip the operational flight plan.
- **Displays are second largest** — 121k lines of TypeScript in A32NX welded to an MSFS avionics
  library [M]. Rewrite, do not port.
- **Content, not code, is the long pole in A.** 23 messages and 32 controls is a demo; an A320 needs
  several hundred of each, and every one is aircraft knowledge. That is the operator's time, or a
  document pipeline, or both.
- **Nothing here is certified.** The disclaimer is not legal decoration; it is the honest scope.

---

## 6 · What "done" means, and when to stop

**MVP = P5.** Six to twenty drills, graded, with rationale, on any laptop, no install. If the
project stops the day after P5 it has still shipped something useful.

Kill criteria, agreed in advance [B]:

- P6 consumes more than ~10 sessions without a stable 30-minute run → ship A alone, keep B as a branch.
- P2 stalls because the data is not available → cut the message set to what is known and keep moving.
  Content hunger must never block code.
- The reference laptop cannot hold 20 Hz with the full system set → cut systems, never the tick rate.

---

## 7 · Conventions this codebase holds itself to

1. **The dictionary is the only state.** Declared name, kind, range. A bad write is refused, not
   clamped, and it never happens silently.
2. **Time is fixed.** 50 ms per step. A stalled host loses simulated time rather than stretching a
   step — a rate integrated over 400 ms is a different rate.
3. **Write before read, in causal order.** `apu → elec → fuel → bleed → engines → press → hydraulics`.
   One deliberate exception: generator contactors use the previous tick's engine state, as an
   aircraft does.
4. **Content is data.** Panels, messages and pages live in `web/data/` and are validated at load.
   A dead switch or an undeclared variable is a load error, not a bug found later.
5. **A procedure is ordered, and order is scored.** Every step carries the reason it matters, printed
   only for what was missed.
6. **Nothing is an input the model can produce.** If the model can derive it, the model derives it.
7. **A resumed run must match the straight one.** If replay can diverge, every debrief is suspect.

---

## 8 · Next five actions

1. `git init` and the trainer/flight split, before anything else grows.
2. P5 gate: a build that runs without Node on the reference machine.
3. Grow content: the message set toward 60, the panel toward the full overhead.
4. A scenario picker so a drill starts from a saved `.situ` rather than `setup.ts` code.
5. Then P6 again, deliberately, with the harness and a 30-minute run as its gate.





