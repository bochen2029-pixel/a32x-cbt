# A32X CBT — roadmap

A computer-based trainer for an A320 fly-by-wire, built to run on a laptop with no GPU and no
installer. This document is the plan and the honest state of it.

Last written: 2026-11-01, at P7. The flyable simulator is now the product (§3, §9); the systems
trainer still ships on its own, MIT (P5's zip). P7's slice 1 flies the A32NX computers on an A320
of ours, fitted to 57 cited targets, its aerodynamics and its engines, headless from takeoff to landing
(§4, P7). The browser track (steps 5–8) is done: the same flight in a browser from `file://`, a
joystick, a view. So is step 2: real runways and an ILS on them, wind and turbulence, the scripted crew
flying the ILS inside every band. Every flight starts at KDFW, the main airport by the operator's word
(§9), and the view draws it whole: seven runways, terminals, ramps and towers. So is the thrust fit,
and so is step 3: the instructor's failures, the laws A32NX's computers choose for them, each flown to
a landing, direct law trimmed by hand; and step 4: the protections flown as a test pilot flies them,
judged where they hold and where the airframe is fitted. The gate is next.

---

## 1 · Where the code lives

```
  app\            the trainer
  ├─ src\         application code, 42 files / 2,807 lines
  ├─ tests\       23 files / 2,550 lines, 182 tests
  ├─ web\         page + web/data\ (panel, messages, pages — content, one copy for both runtimes)
  ├─ tools\       build, serve, package (zip), measure, gate
  └─ situations\  one saved aircraft as a sample

  flight\         GPLv3. The A32NX port contract, and the flight control computers running headless
                  at 50 Hz: against a stub world for P6, flying a JSBSim airframe from P7.
  docs\           provenance, architecture, psx-notes\, conventions
  tools\          regen-psx-reference.md
  reference\      two screenshots
```
The `app/` / `flight/` split is enforced: `app/` links no A32NX code and carries no GPL
obligation; `flight/` links it and is GPLv3. Keeping them apart is cheaper than untangling later.

`app/` is MIT (see `LICENSE`). `flight/` is GPLv3 (see `flight/LICENSE`).

---

## 2 · What exists, and what it is worth

**Mechanics, tested.** [M] 182 tests green, suite runs in ~3 seconds.

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
placeholder grid, not traced geometry. `app/` has no aero and no flight law, so nothing flies in it;
`flight/` flies the real laws on a fitted airframe, headless (P6, P7), not yet in a browser. It is
not a type-rating device and must never be presented as one.

**Runtime size.** 100 variables, ~2.8k lines of application code. The whole page is a few hundred
KB of JavaScript behind an HTTP server that has no dependencies.

---

## 3 · The fork, and the choice

**A — systems trainer.** Flows, ECAM, drills, scoring, debrief. No aerodynamics, no flight laws.
Teaches the part of an aircraft a trainee actually fails a check ride on. P5 ships it as a zip that
runs straight off the disk.

**B — flight simulator.** The real FBW law core from A32NX on a fitted JSBSim airframe, hand-flown
with a joystick in the browser. Unique — nobody has this in a browser — and months of work because
of the driver, the aero, the displays and the FMS.

**Decision, revised 2026-11-01: B is the product, and A is its systems and procedures layer.** The
first decision here was *A to completion first; B a second product*. The operator has since set the
target (§9): *"fully flyable from runway to runway"*, with all three laws and the protections, LNAV
and VNAV, and a path through the world, the CBT's procedures and scoring on top. They left the
rewrite to the recommendation: *"go with your own best recommendation for all"*. So:

- The order of work is P7 (an airframe, then the browser, then a hand-flown ILS), then P8 (displays),
  then P9 (FMS and guidance). Phases start on the operator's word, and each is done only when its
  gate passes: half-built is still not a product.
- A keeps shipping on its own (MIT, P5's zip), and the flyable artefact carries it (§4, P7:
  packaging). Its content grows where that does not block B: content hunger never blocks code.
- P5's open box, the 2014 laptop, now measures both: the trainer's tick and the flight core's 50 Hz.

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
| P6 | **Law harness** — the A32NX computers standalone | ELAC/SEC/FAC step at 50 Hz against a stub world for 30 minutes, no NaN | **passed** [M] — 30 min, 0 non-finite of 20.5 M, normal law throughout; MSVC and GCC |
| P7 | **Aero** — JSBSim airframe, law↔surface↔air data | a hand-flown ILS is stable and repeatable | in progress — slice 1 done [M]: the computers fly an airframe headless, takeoff to landing, normal law throughout; since 2026-11-01 the airframe is our fitted A320, inside all 57 A320 targets, its engines' 24 among them, where the 737 it replaced is inside 17 [M]; steps 5–8 done [M]: the flight core as a library, WebAssembly, joystick and loop, the view — in a browser from file://; step 2 done [M]: a real runway, its ILS and the wind, the scripted crew inside every band; step 3 done [M]: the instructor's failures and the laws they leave, each flown to a landing; step 4 done [M]: the protections, judged where they hold, the rest measured; the gate not started |
| P8 | **Displays** — PFD/ND/EWD/SD from law state | six tubes render from real law output at 20 Hz | not started |
| P9 | **FMS** — route, LNAV and VNAV, performance, progress, DIR | one flight plan flies end to end | not started |
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

### P6 in detail — the law harness

Started 2026-11-01 on the operator's instruction, before P5's reference-machine box closed.

- [x] A32NX `66021c2` compiled where it stands — ELAC 1–2, SEC 1–3, FAC 1–2, FCDC 1–2 and their laws,
      unmodified, from a clone outside the repository (`flight/CMakeLists.txt`, `-DA32NX_DIR`)
- [x] a world adapter in place of `FlyByWireInterface.cpp`: the driver's update functions line for
      line, in its order, with its one-tick staleness (`flight/harness/efcs.cpp`)
- [x] a stub world: sensors encoded as the A32NX producers encode them, servos that follow orders, a
      small closed-loop airframe and a scripted crew flying circuits (`flight/harness/world.cpp`).
      Not aerodynamics; no rudder or sideslip; the FMGC is a stub
- [x] **the gate**: 90,000 ticks of 20 ms, 0 non-finite in 20,520,000 output values, all nine
      computers healthy from 2.02 s to the end, normal law in pitch and roll for 100 % of 1,512 s of
      settled flight. 1.0 s of wall time on MSVC 19.44; same verdicts on GCC 13.3. [M]
- [x] eight `ctest` cases, two of them negative controls: a planted NaN is caught; all three ADRs
      failed in flight take the laws to alternate 2

Found on the way, in `flight/README.md`: the computers depend on zero-filled static storage; the
driver reads one past a five-element array for SEC 2; elevator servos run reverted solenoid logic.

### P7 in detail — an airframe, then a hand-flown ILS in the browser

Started 2026-11-01; the card that started it was the operator's decision. Slice 1 is done. Everything
after it is a plan, and waits for the operator's agreement: no browser work and no P8 has begun.

**Slice 1 — the harness flies JSBSim, headless** [M]

- [x] JSBSim v1.3.3 (`66f7faf`, LGPL-2.1) pinned like A32NX: compiled from a clone outside the
      repository into the build tree, any other commit refused, recorded in `docs/provenance.md` first
- [x] the airframe is JSBSim's 737, read unmodified from the clone. Its A320 was measured first and
      refused: it cannot be trimmed on approach. The 737 is A320-class, not an A320, and the operator
      chose to fly it for now — *"okay go with the 737 then"*, 2026-11-01
- [x] behind `World`'s interface, with `efcs.cpp` untouched: one adapter (`harness/airframe.cpp`) and
      one JSBSim system of ours that hands the aerodynamics the A32NX servos' surface positions
- [x] a scripted crew flying it closed loop through the laws, the way the A320's own modes split the
      job: takeoff, an open climb, a 180° turn, a doublet, speedbrake, a pedal kick, a 45° steep turn,
      an approach configured as the speed comes back, a 3° path, flare, rollout
- [x] the P6 gate, unchanged, passes on it: 30 minutes, 0 non-finite of 20.5 M values, every computer
      healthy, normal law for 100 % of 1,594 s of settled flight, a landing at −170 fpm. 4.8 s of wall
      time on MSVC 19.44 with the desktop 28 % busy; the same verdicts on GCC 13.3
- [x] `ctest` cases for what a real airframe adds — the stabiliser takes the trim, the yaw damper
      takes out a pedal kick, the landing is inside A320 limits — two of them shown able to fail by
      reversing a sign. A crash fails any run: an airframe below the runway freezes the world
- [x] the A320's acceptance targets written down (`flight/targets/a320.csv`) and the 737 scored
      against them by `airframe_score`. Every row names its source and is marked fit or held out; a
      `ctest` case runs the scorer. Completed before any fit: the short period, the drag rise toward
      MMO, a second weight, a recorded approach attitude. What the score says, and the rule for
      swapping the airframe, are under *Decisions* below
- [x] an A320 of ours (`flight/jsbsim/aircraft/A320-fit`), seeded from A32NX's MSFS model, OpenAP
      and textbook estimates, and fitted by CMA-ES on the fit rows (`airframe_fit`): inside 33 of 33,
      the 737 inside 8 [M]. It flies by default since 2026-11-01, under the swap rule (*Decisions*)
- [x] its engines fitted the same way (`airframe_fit --thrust`): the A320-211's CFM56-5A1 as an engine
      file of ours, seeded from JSBSim's CFM56_5, and a thrust lever schedule of its own, against 24 new
      rows from its type certificate and Airbus's own data in the ANP database. Inside 57 of 57, the
      737 inside 17 [M]; the climb at 250 kt down from 4,600 to 3,350 fpm (*Decisions*)

Known limits of slice 1, all of them the airframe's or the crew's:

- It is a 737. Its lift peaks near 13.2° of alpha whatever the flaps. The laws' α max (A32NX's ELAC
  table) is 8.7° clean, far short of that, but 13.0 to 14.2° with slats out — at or past the peak, so
  a slowdown to α max with slats out can stall this airframe. In one badly flown climb during
  development, flaps running in at low speed, it went through its stall to 24° of alpha in normal law.
  Only an A320 airframe cures that; ours lifts 3 to 5° past α max plus a degree, and flies by
  default since 2026-11-01 (*Decisions*).
- The 737's aerodynamics have no stabiliser, no slats, no roll spoilers and no aileron droop: the THS
  acts as 1.8 times its angle in elevator, and spoilers and speedbrakes act through the 737's coarse
  steps. Its engines are JSBSim's CFM56 on a thrust lever schedule of ours; our A320's are its own,
  fitted. Neither has reverse, FADEC or autothrust, and our A320's one idle is Airbus's approach idle,
  with no lower ground idle. The FMGC is a stub that reports weight and CG.
- The crew flies on truth, not instruments. No wind, ISA, and a sea-level runway that is everywhere.
  The position is real: JSBSim moves the aircraft over a WGS84 earth and the IRs report it.

**The rest of P7 — the plan.** Ordered; each step is done when its test passes, and the gate is last.
Steps 3 and 4 answer §9's "all three laws" and "the protections", which land from P7 as well; the gate
row in the table above is still the hand-flown ILS unless the operator widens it.

| step | what | done when |
|---|---|---|
| 2 | A runway, an ILS and wind | a real runway at its real place and elevation, from OurAirports (public domain); localizer and a 3° glideslope crossing the threshold at 50 ft, computed from the aircraft's position; wind and turbulence from JSBSim's atmosphere; the scripted crew flies raw-data ILS from 10 nm, from starts 1 dot and 10 kt off, calm and in a 15 kt crosswind, inside every band below, every time |
| 3 | Failures, and the laws they reach | the instructor's failures in the harness — ADRs, IRs, hydraulic pairs, ELACs, SECs — and a case for each law: alternate 1, alternate 2, direct, and direct at gear-down in alternate, each reached from its failure and flown to a landing. ADR loss already reaches alternate 2 and then direct at gear-down on this airframe |
| 4 | The protections, exercised | the crew drives each one — bank to 67°, pitch to +30/−15°, +2.5 g, full back stick slowing to α max, a dive to VMO/MMO — and each holds. This needs an airframe whose stall and transonic behaviour are credible against the laws' α prot, α max and MMO: see the airframe decision below. α floor waits for autothrust and FADEC, P9 |
| 5 | The flight core as a library | the step loop behind a small C API — start, inputs, step, state — with the scripted crew one input source among others; a recorded input stream replays to the same touchdown, byte for byte |
| 6 | WebAssembly | Emscripten builds the A32NX computers, JSBSim and their data files into one single-file module that runs from `file://` in a Blob worker, network off; 50 Hz holds with headroom, measured on the dev desktop with its load beside the number, and on the 2014 laptop when there is one |
| 7 | Joystick and the loop | the Gamepad API: sidestick pitch and roll, rudder on a twist or pedals, a throttle axis with CL, MCT and TOGA detents, buttons for takeover, brakes, speedbrake, flaps and gear; per-device mapping, deadzones and calibration kept between sessions; keyboard only as fallback; fixed 50 Hz steps under a display-rate loop that drops debt rather than stretch a step |
| 8 | The view | Three.js (MIT), bundled with the page rather than fetched: runway with edge, centreline and approach lights, horizon, ground, a few buildings, dusk and night, from the pilot's eyepoint; a minimal overlay — speed, altitude, attitude, localizer and glideslope dots, flaps, gear — until P8 draws a PFD; frame time measured under software rendering |
| 9 | **the gate** | a hand-flown ILS, judged as below |

Steps 5 to 8 are done, in the order the operator chose (*"continue"*, 2026-11-01: the browser first,
because WebAssembly carried the most risk of a redesign and a stick in the hands comes soonest) [M]: the
flight core as a C API whose replays give the same bytes; Emscripten 6.0.12 building it, the module
landing the scripted crew at the native touchdown to the printed digit; the page from `file://` in a
Blob worker, a tick at 79 to 117 µs; a joystick mapped from the pilot's hands, the keyboard as fallback;
the view at 30 fps in software rendering, 1440 × 900. Numbers and their desktop load in
`flight/README.md`. Not done in them: the 2014 laptop.

Step 2 is done [M]: real runways from OurAirports at their places and elevations — KDFW 17C, where
every flight starts by the operator's word (§9), and LSZH 14 as an alternative — an ILS to ICAO's geometry
on each (3°, 50 ft over the threshold), steady wind and Tustin turbulence from JSBSim's atmosphere, and
an approach start, trimmed, in the harness, the C API and the page. The scripted crew flies raw-data ILS
from 10 nm to a stop, from the beams, a dot left, right, low and high, 10 kt fast and slow, and in a
15 kt crosswind from either side, inside every band below, with either airframe (at KDFW 17C the A320
on its fitted engines touches down 316 to 329 m past the threshold, the 737 354 to 361 m, within a
metre of the centreline). In light turbulence it is not robust: from 18 perturbed starts per airframe,
10 broke a landing limit, so that case asks only that the gusts are felt, normal law holds and the
aircraft touches down on the runway; which gusts a run meets is the standard library's random number
generator's, different on each compiler. A recorded approach replays to the same bytes, on MSVC, GCC and
in the browser, since A32NX's ARINC 429 words start at zero here (flybywiresim/aircraft#11007). The
view draws KDFW whole, its terminals and towers from the FAA's airport diagram. One finding on the way:
JSBSim's initial condition and its dynamics take the wind with opposite signs, so the wind is set after
the trim.

Step 3 is done [M]: the instructor's failures — each ADR and IR, each hydraulic system with the
servos, THS, slat and flap motors it drives, each ELAC and SEC — at set times, from the scenario text
the harness, the C API and the page take; a pitch trim wheel; and the scripted crew flying direct law
as a pilot does, its loops on the stick and the wheel trimming off what the hand holds. A32NX's
computers choose the laws, read from the FCDC: one unit of any kind lost leaves normal law; two ADRs,
two IRs, both ELACs, SECs 1 and 2, or blue and yellow hydraulics, alternate 1; three ADRs alternate 2;
three IRs direct; any alternate law goes direct with the gear down; lateral goes direct whenever pitch
leaves normal. Every degraded case lands, with either airframe, as gently as a healthy one (A320 155
fpm and 1.43 g). Two hydraulic pairs, green with blue and green with yellow, are beyond the scripted
crew, which flies a fixed 140 kt; the instructor may still fail them. `flight/README.md` has the table.

Step 4 is done [M], with what it leaves open said: a start in the air, and the scripted crew flying each
protection as a test pilot does — full stick held, then let go. In normal law the bank stops at 65.7°
(67°), the load factor holds 2.1 to 2.2 g on a full pull (2.5) and −1.07 g on a full push (−1.0), and
slowed at idle into the high-AoA protection, full back stick holds alpha max without a stall. Not yet
judged, and measured: a full pull at Mach 0.45 passes alpha max, because the fitted airframe runs out of
lift near 2 g there (its stall above Mach 0.3 is unfitted); the push's pitch reaches −17.7° (−15°); the
bank returns to 26.5°, not 33°; high speed reaches 381 kt against the ELAC's 380, on unfitted transonic
aerodynamics; and a fast pull in CONF FULL at 150 kt passes alpha max (13.0°, reaching 20.4°) inside the
fitted range — an open finding. Alpha floor waits for the autothrust and the FADEC (P9). On the way, a
start in the air with the gear up held the ELAC on the ground until a gear reported weight on wheels only
while down. `flight/README.md` has the table.

**How a hand-flown ILS is judged.** Every approach is recorded and scored from 1,000 ft above the
threshold to the stop. The path bands are the stabilised-approach criteria the industry publishes
(Flight Safety Foundation, ALAR briefing note 7.1), the speed band is Airbus's, the touchdown limits
are the A320's; the rest are this project's and say so.

| measure | band | over | source |
|---|---|---|---|
| localizer deviation | within 1 dot | 1,000 ft to 50 ft | FSF ALAR 7.1 |
| glideslope deviation | within 1 dot | 1,000 ft to 50 ft | FSF ALAR 7.1 |
| sink rate | under 1,000 fpm | 1,000 ft to 50 ft | FSF ALAR 7.1 |
| configuration | gear down, CONF FULL | from 1,000 ft | FSF ALAR 7.1 |
| speed | Vapp −5 / +10 kt | 1,000 ft to 50 ft | Airbus SOP |
| bank | within 7° | 1,000 ft to 50 ft | ours |
| sink rate at touchdown | under 360 fpm, never 600 | touchdown | ours; 600 fpm is the A320's hard landing |
| load factor at touchdown | under 2.6 g | touchdown | the A320's hard landing |
| pitch at touchdown | 0 to 10° | touchdown | ours; the A320's tail strikes at 11.7° |
| touchdown point | 300 to 900 m past the threshold | touchdown | ours; the touchdown zone |
| main gear from the centreline | within 5 m | touchdown and rollout | ours |

*Stable* means no excursion outside a band between 1,000 ft and 50 ft, and a touchdown inside every
touchdown band. *Repeatable* means five consecutive hand-flown approaches — joystick, browser — each
of them stable, with their touchdown points within 150 m of their mean. Every approach's record must
replay to the same verdict, which is house rule 7 applied to flight. The scripted crew passes the
same bands from varied starts before anyone is asked to, so the gate's numbers are known reachable
on this airframe. The debrief prints each band's worst deviation and where it happened, as the
trainer's debrief does.

**Decisions taken, and still open.**

- Taken 2026-11-01: JSBSim's 737 is P7's airframe, and a fitted A320 replaces it later. The
  operator asked to fly the 737 now and swap in something more realistic later, then: *"okay go with
  the 737 then"*.
- Taken with it: the A320's numbers are written down, so the swap is measured rather than argued.
  `flight/targets/a320.csv` holds 33 counted targets and 4 context rows, each with its source: stall
  speeds by configuration from A32NX's VS1g tables (a community reconstruction of Airbus's, not
  Airbus data); the alpha the wing must still lift at, from the ELAC's own α max; alpha at VLS under
  α prot; the approach attitude of a recorded A320 approach (VT-WGR, from AAIB India's report) and a
  cruise attitude; the drag rise toward MMO from the model OpenAP implements; roll rate, roll time
  constant, Dutch-roll and short-period damping against the lateral law and MIL-F-8785C's Level 1
  floors; and, not counted, takeoff, climb and descent from OpenAP's ADS-B fits. Weight-dependent
  rows are measured at 48.5 and 65 t. 13 rows are fit rows an optimiser may tune against; 20 are
  held out, so a fit that only memorises is caught.
- The 737, on that table: inside 8 of 33 — 2 of 13 fit rows, 6 of 20 held out. It stalls 14 to
  47 kt faster than an A320 at either weight; with slats out its lift peaks at 13.25°, 0.8 to 1.9°
  short of the ELAC's α max plus the table's 1° of margin; at the A320's VLS it flies above α prot or
  cannot hold level flight; at the A320's approach speed it needs 7.1 to 8.0° of pitch. Inside: the
  clean stall alpha, the drag rise, cruise trim at M0.78 and FL350, roll rate, roll time constant,
  Dutch-roll and short-period damping. **§9 asks that the P7 airframe be judged on credible high-AoA
  behaviour, and on these numbers step 4 cannot pass on the 737.**
- **The swap point.** A fitted A320 replaces the 737 when, scored on the same revision of the
  table, it is inside every target the 737 is inside and inside more of them in all, with its
  held-out rows reported apart from its fit rows; and the P6 gate and every `ctest` case pass with
  it flying. A change to the table rescores both. Whatever mismatch remains is published with the P7
  gate, never hidden behind it.
- How the fit went: parameter identification, not controller learning — the controller stays the
  A32NX computers. Our A320 (`flight/jsbsim/aircraft/A320-fit`, GPLv3) holds its aerodynamics as 69
  named coefficients, seeded from A32NX's MSFS model, OpenAP and textbook estimates
  (`docs/provenance.md` §1e). `airframe_fit` runs CMA-ES over the 21 the fit rows answer to, each
  candidate scored by `airframe_score` in a process of its own, sixteen at a time: 4,870 evaluations
  in 79 s on the desktop, which was 10 % busy before it. No GPU. Fitted, the A320 is **inside 33 of
  33 — 13 of 13 fit rows, 20 of 20 held out** — and inside every row the 737 is inside. How much the
  held-out rows say is in `flight/README.md`: several test seeds estimated by hand with their bands in
  view, and two pass with almost nothing to spare.
- **Taken 2026-11-01: the swap, under the rule.** Our fitted A320 is inside 33 of 33 targets and
  every one of the 737's 8; with it flying, the P6 gate and all seventeen `ctest` cases pass, and all
  seventeen pass again with the 737 selected. The operator approved it: *"yes do it"*. The A320 flies
  by default; the 737 stays selectable (`FLIGHT_AIRFRAME=737`, `airframe_score --airframe 737`) and
  keeps its own cases, so a change to the table can always rescore both. The landing case passed only
  after the scripted crew changed: the 737's technique (145 kt, a flare tuned to its lift slope)
  bounced the A320, whose lift rises faster with alpha in CONF FULL. One crew now flies both — 140 kt
  and a flare that eases off as the pull is felt — and the 737 was re-baselined with it, before and
  after recorded in `flight/README.md`. The crew's numbers are technique, not airframe data, and
  `airframe_score` does not depend on them. The hand-flown gate on the A320 takes Vapp from the FAC's
  VLS, as a pilot reads it off the speed tape.
- **The thrust fit, 2026-11-01, under the same rule.** The engines and the thrust lever schedule were
  the part of the airframe nobody had fitted: JSBSim's generic CFM56_5, Aeromatic's lapse tables at
  25,000 lb a side, on the harness's schedule drawn up for the 737, climbed our A320 at 4,602 fpm at
  250 kt. The table gained 24 counted rows for the engines, 11 fit and 13 held out, from the
  CFM56-5A1's type certificate, Airbus's thrust and drag-to-lift ratios for the A320-211 in the ANP
  database, OpenAP's cruise thrust and Bartel and Young's lapse (`docs/provenance.md` §1d). The four
  WRAP rows stay context: airline averages at reduced thrust and mixed weights, over segments the
  circuit does not fly as one. The engine stays the one the airframe already claimed, the A320-211's
  CFM56-5A1, because the manufacturer's numbers for it are public; the A320neo's LEAP-1A26 would need
  numbers of the same kind. An engine file of ours, seeded from CFM56_5, and a schedule of our A320's
  own: eight numbers, fitted by `airframe_fit --thrust` on the thrust group's fit rows alone, 2,713
  evaluations in 48 s. Fitted, the A320 is **inside 57 of 57 — 24 of 24 fit rows, 33 of 33 held out**
  — and inside every row it was inside before; the 737, untouched, inside 17. The P6 gate and all
  thirty-seven `ctest` cases pass with either airframe, the ILS starts of step 2 among them. It climbs
  at 3,349 fpm at 250 kt, still above WRAP's airline average, as full climb thrust should. What no row
  checks — climb thrust above 10,000 ft, take-off from high airfields, ground idle — is in
  `flight/README.md`.
- The harness keeps the airframe to one adapter (`harness/airframe.cpp`) and one aircraft file, so
  the swap stays small. Either airframe can fly: `FLIGHT_AIRFRAME=737|a320`.
- **Taken 2026-11-01: packaging.** The operator left it to the recommendation: *"go with your own
  best recommendation for all"*. Two artefacts. `a32x-cbt.zip` stays as P5 built it: the systems
  trainer alone, MIT. The flyable simulator ships as one GPLv3 artefact that carries the trainer: the
  A32NX computers and JSBSim as WebAssembly, the browser shell, and `app/`'s MIT code under its own
  notice. MIT code may travel inside a GPLv3 work; GPLv3 code may not travel inside `app/`. So the
  browser shell and everything that loads the flight module live under `flight/`; the flight side
  may import from `app/`, and `app/` never imports from `flight/`. Every distributed build of the
  GPLv3 artefact comes with its Corresponding Source from the same place, a source archive made by
  the same packaging step: our source and build scripts, the exact upstream sources compiled into it
  (A32NX `66021c2`, JSBSim `66f7faf`, the pinned Emscripten named) and every licence text and notice.
  Nothing is published anywhere without the operator's word.
- Not changed: P8's displays come after this gate. Step 8's overlay is not a PFD.

---

## 5 · The problems that decide it

- **Aero is the only novel physics.** JSBSim mitigates it; nothing else does. P6 exists to fail
  cheaply before P7.
- **The FMS is the largest body of work** — ~40k lines in PSX [R]. Scope to route, managed lateral
  and vertical guidance (§9), performance, progress, DIR. Skip the operational flight plan.
- **The browser has to hold 50 Hz.** The A32NX computers and JSBSim as WebAssembly, and a Three.js
  view, on a laptop with integrated graphics and nothing installed. P7's step 6 measures that before
  anything is built on it.
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

**B is done when §9 is:** runway to runway, hand-flown with a joystick in the browser through the
real A32NX laws; all three laws reached and the protections exercised; LNAV and VNAV flying a
plan; on the reference laptop, with no install.

Kill criteria, agreed in advance [B]:

- P6 consumes more than ~10 sessions without a stable 30-minute run → ship A alone, keep B as a
  branch. *Not triggered: P6 passed in its first session.*
- WebAssembly cannot hold 50 Hz with headroom on the reference laptop → stop and put the choice to the
  operator — a native flight core beside the browser, or fewer computers — never a longer step.
  *Added 2026-11-01, with §3's revision.*
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

Rewritten 2026-11-01 with §3. Of the list it replaced, `git init` and P6 are done; the P5 gate passed
everywhere but the reference machine (item 4 below); growing content and a scenario picker wait in
A's backlog.

1. **P7's browser track, under way:** step 5 (the flight core as a library), 6 (WebAssembly, on a
   pinned Emscripten), 7 (joystick), 8 (the Three.js view).
2. **The thrust fit, done** (*Decisions*): takeoff, climb and idle against cited targets, inside all
   57 under the swap rule.
3. **P7's steps 2–4 on the fitted A320:** a real runway with an ILS and wind; failures that reach
   every law; the protections driven and held. Then the gate: five hand-flown ILS approaches,
   joystick, browser.
4. **The 2014 laptop:** P5's open box, and step 6's 50 Hz with headroom, measured on the same machine.
5. **Then P8 and P9:** displays from law state, then the FMS with LNAV and VNAV on §9's navigation
   data. A's content grows alongside where it blocks nothing.

---

## 9 · Recorded requirements — flyable, runway to runway

From the operator, 2026-11-01, in their words: *"this is not just a panels simulator it must
actually be fully flyable from runway to runway, takeoff to landing"* — on an average PC, with
rudimentary graphics *"like back to airliner full motion sims of the 1980s"* in Three.js, and
joystick support, because *"flying with keyboard arrow keys"* is not acceptable.

That sharpens §3: B is not optional decoration on A. §3 was re-decided on this basis the same day:
B is the product.

- [ ] **Joystick, first-class.** The Gamepad API: pitch and roll to the sidestick, twist or pedals
      to the rudder, a throttle axis to the thrust levers; buttons for takeover / autopilot
      disconnect, brakes, speedbrake, flaps, gear. Per-device mapping, deadzones and calibration,
      kept between sessions. Keyboard is a fallback, never the way to fly. Lands with **P7**: its gate
      is a hand-flown ILS, and hands need a stick.
- [ ] **An out-the-window view in Three.js**, at 1980s full-flight-simulator fidelity: a runway with
      edge, centreline and approach lights, a horizon, a ground plane, a few buildings, dusk and
      night lighting — enough to take off and land by eye, within an integrated-graphics budget. A
      minimal runway and horizon land with **P7** for the same reason; the cockpit displays stay
      **P8**.
- [ ] **Done means runway to runway**: takeoff, climb, cruise, approach, landing and rollout, hand
      flown with a joystick in the browser through the real A32NX laws, with no install.

Clarified the same day: *"even as CBT it should simulate ... real flying, all three laws, fmc, lnav,
vnav not just the system but the 3d path/flight/flying in the 'air' through the 'world' ... bank angle
protection, stall protection etc"*. So B is a simulator of the A320 in flight — real laws, real
guidance, a real path through the world — with the CBT's procedures and scoring on top.

- [ ] **All three laws, actually reached**: normal, alternate (1 and 2) and direct, and the
      transitions between them, driven by real failures from the instructor station — air data and
      inertial losses, hydraulic losses, ELAC and SEC failures — including direct law at gear-down
      in alternate. The computers already contain every law (P6 reached normal and alternate 2);
      what is missing is an airframe and failures that take them there. From **P7**.
- [ ] **The protections, exercised and graded**: bank angle (33° spiral stability, 67° limit, less in
      high-speed and high-AoA protection), pitch attitude (+30°/−15°, less with flaps and at low
      speed), load factor (+2.5/−1 g clean), high angle of attack (α prot, α max, and α floor
      commanding TOGA through the autothrust), high speed (VMO/MMO). They live in the ELAC and FAC
      already, but mean something only on an airframe that can stall and overspeed: the **P7**
      airframe must be judged on credible high-AoA and high-Mach behaviour, not on trim alone.
      α floor also needs the FMGC's autothrust and the FADEC.
- [ ] **Flying through the world**: position over a round earth — latitude, longitude, altitude,
      wind — moving with the aircraft, and runways at real places. The FDM provides it from **P7**;
      the P6 stub holds a fixed latitude and longitude.
- [ ] **FMS and guidance — the Airbus LNAV and VNAV**: a flight plan; managed lateral navigation
      (NAV, with SID, STAR, approach legs and DIR TO); managed vertical (CLB and DES profiles with
      constraints); autopilot, flight director and autothrust. The guidance half exists in the clone
      as `FmgcComputer`, not yet built. The flight-management half is TypeScript welded to MSFS in
      A32NX. **P9**. §5's "route, performance, progress, DIR" is now too narrow: managed vertical
      is in.
- [ ] **Navigation data: bring your own AIRAC, with a free base.** Current cycles come every 28
      days from Navigraph or Aerosoft NavDataPro — what PMDG and A32NX read. They are licensed to
      the subscriber and may not be redistributed, so the zip cannot carry one; the trainer reads a
      cycle the user has installed, in a format those services already export (X-Plane's native nav
      format is the likely one: its specification is published). Whether their terms cover use
      outside the product the data was downloaded for, and whether a format of our own would need
      their agreement, has to be checked before building on it. For a user with no subscription, a
      public-domain base ships: FAA CIFP (US airports with SIDs, STARs and approaches, ARINC 424,
      every 28 days) and OurAirports (airports and runways worldwide, no procedures). **P9**.
- [ ] **An exterior aircraft model**: not now; perhaps later, the operator's call.
- [ ] **VR, later, as a toggle** — back burner, not to be built now. Meta Quest 3 and 3S only (a
      Quest 2 may work but is not a target; no Apple headset), with true stereo depth. Relayed on
      2026-11-01 by the session researching visuals, which noted the route: three.js's built-in
      WebXR for real per-eye stereo, through Quest Link and Chrome on Windows so the joystick stays
      on the PC, with the standalone Quest browser as the lightest tier. Not scheduled.
- [ ] **A 3D debrief in the manner of ACMI/Tacview**: the flown trail coloured by the gate's bands, a
      timeline and an event log, built on the deterministic replay (house rule 7). Relayed the same
      day by the same session. Not scheduled; it extends the P7 gate's debrief.
- [ ] **Aerodynamics from CFD, later** — the operator's idea, 2026-11-01, relayed by the same session:
      tune the A320 model with open-source CFD (OpenFOAM and others), since the A320 flies well under
      Mach 1, on geometry modelled from Airbus's public dimensions and external drawings. Not
      scheduled; it starts on the operator's word. When planned: the geometry source, the solver and
      its licence go in `docs/provenance.md` first; the pipeline is validated on public cases (NASA's
      Common Research Model and its high-lift variant) before it is trusted; and its results enter as
      cited targets with uncertainty bands, under the swap rule. First use: the gaps step 4 measured —
      the stall above Mach 0.3, the transonic pitching moment, lift past the stall.
- [ ] **Weather, later** — from the operator the same day: *"rudimentary weather systems like clouds,
      rain, wind, etc. etc.? maybe even lightning"*, real-life weather, and the real motion of the sun
      and moon. Two parts. Offline, inside every rule: the sun and moon from an ephemeris at the real
      date and place; clouds, rain and lightning drawn cheaply in the 1980s register; wind, gusts and
      visibility through the flight core's inputs, never the view alone (house rule 6). Live weather
      needs the network, which the flyable artefact forbids today (§4, P7 packaging), so it is the
      operator's call: an opt-in that falls back to a set scenario offline. Their reference is a site of
      their own that does both; reusing its code needs a licence suited to GPLv3, recorded in
      `docs/provenance.md`, and a weather service's terms (attribution, non-commercial tiers) are
      checked first. Not scheduled.
- [x] **KDFW is the main airport, and where the simulator starts.** From the operator, 2026-11-01, in
      their words: *"kdfw should be the main airport, In Microsoft Flight Simulator, it always started
      in like this airport in Seattle, because that's where Microsoft was based. ... It should be Dallas
      Fort Worth International Airport. That should be the main focus, and that should also where
      default starts."* And of the look: *"from artistic and everything else perspective, should focus
      on Dallas-Fort Worth."* So the default start — the harness's, the C API's and the browser page's —
      is on KDFW runway 17C, lined up, and the default ILS approach is 17C's: level at 562 ft from end
      to end, which the flat terrain needs, and the runway DFW lands on in its usual south flow
      (OurAirports; `docs/provenance.md` §1f). The view draws the whole airport: its seven runways
      where they are, with the FAA's markings and lights, and its five terminals, central ramps and
      three towers where the FAA's airport diagram draws them. LSZH 14 stays as an
      alternative (`runway=LSZH14`). P6's sea-level start stays as the `reference` scenario, and the
      airframe scorer measures from it, so fitted numbers do not move with the airport. Scenery and
      visual work model DFW and the Dallas skyline first.

What that implies, for whoever plans P7: the computers and JSBSim reach the browser as WebAssembly
(the A32NX computers are already built for wasm in MSFS); Three.js (MIT) and the Gamepad API are
browser-native; and the browser product links A32NX, so it is GPLv3 like `flight/`.
