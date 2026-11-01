# flight/ — the aeroplane that flies

GPLv3. This tree links the FlyByWire A32NX flight computers, which forces the licence on everything
here. `app/` stays clear of it.

**P6 passed; P7 has started.** The A32NX flight control computers — ELAC 1–2, SEC 1–3, FAC 1–2,
FCDC 1–2, unmodified — run at 50 Hz in a world whose airframe is JSBSim, flying one of two aircraft:
an A320 of ours fitted to the A320's numbers, the default since 2026-11-01, or JSBSim's 737, which it
replaced and which stays selectable. A scripted crew flies either through the computers from the
runway, round a circuit and back onto the runway, headless, in normal law. The 737 is A320-class, not
an A320: `docs/provenance.md` says why it is not JSBSim's A320. P6 passed against a point-mass stub;
the same gate, unchanged, passes against both. The A320's numbers are written down
(`targets/a320.csv`, 33 targets): our A320 is inside all 33, the 737 inside 8, and the A320 replaced
it under the swap rule ([below](#the-swap-made-2026-11-01)).

## Build and run

You need a C++17 compiler, CMake 3.25+, and two clones: the A32NX sources and JSBSim (below).

```
cmake -S flight -B flight/build -DA32NX_DIR=<A32NX clone> -DJSBSIM_DIR=<JSBSim clone>
cmake --build flight/build --config Release
ctest --test-dir flight/build -C Release --output-on-failure
```

The build compiles both upstreams where they stand and refuses any commit but A32NX `66021c2` and
JSBSim `66f7faf`. JSBSim builds into `flight/build/jsbsim`; nothing is written into either clone. The
737's aircraft and engine files are read from the JSBSim clone at run time — its path is compiled in.
Run `flight/build/Release/law_harness --help` for the options; `--minutes 30 --gate` is the P6 gate and
`--trace run.csv` writes the flight twice a second. `flight/build/Release/airframe_score` scores the
airframe against the A320's targets (below); `--out score.csv` writes the table.

`FLIGHT_AIRFRAME=737` in the environment flies the 737 instead of our A320, in either program, and
`airframe_score --airframe 737` scores it. Our A320 is `jsbsim/aircraft/A320-fit/A320-fit.xml`, read
from this tree; its engines are JSBSim's CFM56_5, read from the clone. `flight/build/Release/airframe_fit`
fits it (below), in a minute or two; `--write` puts the result into the aircraft file.

## The P6 gate on JSBSim, as measured

`law_harness --minutes 30 --gate`, MSVC 19.44 (Visual Studio 2022) on Windows 11, 2026-11-01:

```
A32NX 66021c2: ELAC x2, SEC x3, FAC x2, FCDC x2 flying JSBSim 66f7faf's 737
90000 ticks = 1800.0 simulated s in 6.03 wall s (298x real time)
flight: 1 touchdowns; altitude 4..8080 ft, pitch -4.9..18.1 deg, bank -42.6..40.5 deg, load 0.10..1.80 g
surfaces: elevator -30.0..17.0, THS -4.18..0.00, aileron -25.0..25.0, spoiler 3 -50.0..0.0 deg
touchdown at 911.2 s: sink -170 fpm, pitch 3.7 deg, bank -0.0 deg, 142 kt, peak 1.80 g
laws in settled flight (1594 s): pitch-normal 100.0% lateral-normal 100.0%
non-finite outputs: 0 of 20520000 values checked
  pass  thirty minutes at 50 Hz - 90000 ticks of 20 ms
  pass  no NaN or infinity on any output, any tick - 20520000 values checked
  pass  the world stayed finite
  pass  every computer healthy once up, to the end - healthy from 2.02 s; 0 unhealthy ticks after
  pass  normal law in pitch and roll throughout settled flight - pitch 100.00 %, lateral 100.00 % of 1594 s
  pass  a whole circuit flown: up, around, down - 1 touchdowns
  pass  the surfaces actually moved - elevator -30.0..17.0, aileron -25.0..25.0 deg
```

Timed three more times with the desktop's total CPU sampled each second: 4.75 to 4.89 s wall, 368 to
379 times real time, while the machine (i9-9900K, 16 threads, shared with other work) ran at 28 % on
average, 15 to 51 %. The stub world took 1.0 s; JSBSim at 200 Hz is most of the difference, about
10 µs a frame. GCC 13.3 on Ubuntu 24.04 (WSL) gives the same verdicts and the same flight in 4.9 to
5.1 s, load not sampled. Same binary, same bytes; different compilers give different bytes, and the
same verdicts.

The gate above is the 737's, as first measured. Our A320, flying by default, passes the same gate:
normal law in pitch and roll for 100 % of 1,594 s of settled flight, 0 non-finite in 20,520,000 values,
all computers healthy, a landing at 1,042.1 s at −143 fpm, 5.5° of pitch, 138 kt and 1.41 g; 5.18 s
of wall time on MSVC 19.44, about 350 times real time.

Eighteen `ctest` cases hold the parts the gate leans on, what the airframe adds, the scorer and the
fitter, and keep the 737 flying. Two are negative controls that show the gate's checks can fail; three of the airframe's were
shown able to fail by hand: reverse the yaw damper's sign and the aircraft departs and flies into the
ground 40 s after liftoff; reverse the THS's and the stabiliser runs to its stop while the elevator
holds 24° against it; reverse either rudder trim sign and the trim case fails. The scorer's instruments and the fitter's optimiser were shown able to fail the
same way (their rows below). All eighteen pass on MSVC 19.44 with our A320 flying, and all eighteen
again with `FLIGHT_AIRFRAME=737`. GCC 13.3 on Ubuntu 24.04 (WSL) gives the same verdicts on all
eighteen with either airframe and, as measured before the trim case, the same scores, with no warning
in our code. Where a row gives one number, it is the 737's, measured before the swap.

| case | what it shows |
|---|---|
| `p6_gate_30_minutes` | the gate above |
| `deterministic` | two fresh processes, same bytes from every computer, every tick |
| `computers_come_up` | dark before the FLT CTL pushbuttons, all nine healthy 1.02 s after them |
| `ground_check_moves_surfaces` | full pull −30°, full push +17° of elevator; roll ±25° of aileron |
| `normal_law_in_flight` | normal law in pitch and roll for all of settled flight |
| `stick_flies_the_aircraft` | a 0.5 pull gives +4.3°/s and 1.67 g; the push −6.8°/s |
| `stabiliser_takes_the_trim` | in steady flight the elevator rests at 0.25° on average; the THS holds the trim, 2 to 3.5° nose up |
| `yaw_damper_takes_out_a_pedal_kick` | three seconds of 0.3 left pedal raise 4.6° of sideslip; four seconds after release yaw rate and sideslip are under 0.1 |
| `rudder_trim_moves_the_nose_the_way_it_is_set` | the RUD TRIM switch held left six seconds in cruise, stick left alone: the FAC orders 6.0° left and reads 6.0° back, the rudder trails 5.3° left, 3.6° of sideslip nose left; RESET brings it to 0.0°. With the trim's sign reversed in the rudder it fails on the rudder and the sideslip; with the position fed back negated it fails on the read-back |
| `lands_inside_the_limits` | the first landing, wings level, no bounce: the 737 at −77 fpm, 3.2° of pitch, 1.27 g; our A320 at −143 fpm, 5.5°, 1.41 g. Eighteen minutes, because the A320 descends at idle at about 1,030 fpm against the 737's 1,700 and lands 125 s later |
| `airframe_is_scored_against_the_a320` | the scorer measures every target and context row; it fails only on a row it could not measure (shown with a planted bogus row), never on a row outside its band |
| `scorer_instruments_read_the_737_right` | the scorer's instruments read the 737's own file back: its gear drag, 0.015; the Mach at which its drag table crosses 20 counts, 0.8170; a nose-down elevator pulse lowering alpha. Without the gear fix (Findings) it fails two of three |
| `the_737_is_scored_against_the_a320` | the 737 it replaced is still scored on every row, so the swap rule can always rescore both |
| `the_737_flies_the_gate` | the P6 gate with the 737 flying (`FLIGHT_AIRFRAME=737`) |
| `the_737_lands_inside_the_limits` | the landing case with the 737 flying |
| `cma_es_finds_known_minima` | the fitter's optimiser on a sphere, a rotated ellipsoid of condition 10⁶ and Rosenbrock, each to 10⁻⁸ or better; with its covariance learning switched off it fails the last two |
| `scanner_catches_a_planted_nan` | a NaN or infinity in an ELAC bus, a SEC analogue, a FAC bus and an FCDC bus — four of four caught |
| `losing_all_air_data_ends_normal_law` | all three ADRs failed in flight: the laws go to alternate 2 and stay there |

Every run, whatever it was asked, also fails if the airframe went below the runway: the world freezes
at that instant, so the computers never see what JSBSim makes of an aeroplane under the ground.

## The A320's targets, and the two airframes against them

The operator chose to fly the 737 for P7 and swap in a fitted A320 later. `targets/a320.csv` is the
bar for that swap: 33 targets an airframe is counted against and 4 context rows scored but not
counted. Each row names its source in the file's header: A32NX's VS1g and VLS tables
(`targets/a320-speeds.csv`, a community reconstruction of Airbus's, sampled on a weight grid), the
ELAC's own α max and α prot, a recorded A320 approach (VT-WGR's flight data, from AAIB India's
report), the lateral law's 15°/s, MIL-F-8785C's Level 1 floors for large aircraft, the wave-drag
model OpenAP implements, OpenAP WRAP's distributions fitted to ADS-B, and one band from pilot
literature still to confirm. Thirteen rows are marked *fit*, for an optimiser to tune against; twenty
are *held out*, so that a fit which only memorises is caught. Rows that depend on weight are measured
at two: 48.5 t, the weight the 737 is loaded to, and 65 t, between an A320-251N's maximum zero-fuel
and landing weights. The rule for the swap is in `ROADMAP.md`, P7.

`airframe_score` measures in two ways. The bare airframe, no computers, at each row's weight: JSBSim
sweeps the lift curve in each configuration (from which the 1-g stall speed), reads the drag against
Mach at a lift coefficient of 0.5, trims it at the A320's VLS and approach speed and in cruise, and
pulses its elevator from a trim for the short period. The airframe flown, at the weight it is loaded
to: the gate's circuit through the A32NX laws, with a full-stick roll added in cruise, timing the
roll, the Dutch roll after the circuit's pedal kick, the takeoff, the climb and the descent. It
scores; it does not gate. Its `ctest` cases fail only on a row they could not measure.

Measured on this revision of the table, MSVC 19.44: `airframe_score --airframe a320`, then
`--airframe 737`. Our A320 is loaded to 65.0 t at 28.1 % MAC, the 737 to 48.5 t at 15.4 %. A
weight-dependent band is the A320's at the row's weight.

fit rows:

| row | t | band | our A320 | | JSBSim's 737 | |
|---|---|---|---|---|---|---|
| `vs1g-clean` | 48.5 | 132.90..138.90 kt | 135.90 | **inside** | 150.26 | outside +11.4 |
| `vs1g-conf1` | 48.5 | 107.50..113.50 kt | 110.51 | **inside** | 150.26 | outside +36.8 |
| `vs1g-conf1f` | 48.5 | 98.50..104.50 kt | 101.51 | **inside** | 137.84 | outside +33.3 |
| `vs1g-conf2` | 48.5 | 96.50..102.50 kt | 99.50 | **inside** | 132.68 | outside +30.2 |
| `vs1g-conf3` | 48.5 | 94.50..100.50 kt | 97.50 | **inside** | 128.06 | outside +27.6 |
| `vs1g-full` | 48.5 | 88.50..94.50 kt | 91.48 | **inside** | 113.48 | outside +19.0 |
| `stall-alpha-clean` |  | 9.70.. deg | 12.75 | **inside** | 13.25 | **inside** |
| `stall-alpha-conf1` |  | 14.60.. deg | 19.50 | **inside** | 13.25 | outside -1.3 |
| `stall-alpha-conf1f` |  | 14.60.. deg | 19.25 | **inside** | 13.25 | outside -1.3 |
| `stall-alpha-conf2` |  | 15.20.. deg | 18.50 | **inside** | 13.25 | outside -1.9 |
| `stall-alpha-conf3` |  | 14.10.. deg | 18.25 | **inside** | 13.25 | outside -0.8 |
| `stall-alpha-full` |  | 14.00.. deg | 17.75 | **inside** | 13.25 | outside -0.8 |
| `drag-rise` |  | 0.810..0.850 Mach | 0.830 | **inside** | 0.817 | **inside** |

held-out rows:

| row | t | band | our A320 | | JSBSim's 737 | |
|---|---|---|---|---|---|---|
| `vls-alpha-clean` | 48.5 | ..6.50 deg | 6.25 | **inside** | 9.40 | outside +2.9 |
| `vls-alpha-conf2` | 48.5 | ..11.90 deg | 9.28 | **inside** | none | outside |
| `vls-alpha-full` | 48.5 | ..10.60 deg | 6.81 | **inside** | 11.93 | outside +1.3 |
| `app-pitch-full` | 48.5 | 1.00..4.00 deg | 2.61 | **inside** | 7.06 | outside +3.1 |
| `cruise-pitch` | 48.5 | 0.00..4.00 deg | 1.02 | **inside** | 3.19 | **inside** |
| `cruise-tla` | 48.5 | 0.00..25.00 deg | 8.47 | **inside** | 18.26 | **inside** |
| `vs1g-clean-65t` | 65 | 153.00..159.00 kt | 157.32 | **inside** | 173.95 | outside +15.0 |
| `vs1g-conf1-65t` | 65 | 124.00..130.00 kt | 127.94 | **inside** | 173.95 | outside +44.0 |
| `vs1g-conf1f-65t` | 65 | 114.00..120.00 kt | 117.52 | **inside** | 159.57 | outside +39.6 |
| `vs1g-conf2-65t` | 65 | 111.00..117.00 kt | 115.19 | **inside** | 153.60 | outside +36.6 |
| `vs1g-conf3-65t` | 65 | 109.00..115.00 kt | 112.87 | **inside** | 148.25 | outside +33.3 |
| `vs1g-full-65t` | 65 | 102.00..108.00 kt | 105.90 | **inside** | 131.37 | outside +23.4 |
| `vls-alpha-clean-65t` | 65 | ..6.50 deg | 6.49 | **inside** | 9.78 | outside +3.3 |
| `vls-alpha-conf2-65t` | 65 | ..11.90 deg | 9.33 | **inside** | none | outside |
| `vls-alpha-full-65t` | 65 | ..10.60 deg | 8.11 | **inside** | none | outside |
| `app-pitch-full-65t` | 65 | 2.00..4.00 deg | 3.23 | **inside** | 7.98 | outside +4.0 |
| `roll-rate` |  | 13.50..16.50 deg/s | 14.19 | **inside** | 14.60 | **inside** |
| `roll-tau` |  | ..1.40 s | 0.74 | **inside** | 0.76 | **inside** |
| `dutch-roll-zeta` |  | 0.08.. ratio | 0.65 | **inside** | 0.83 | **inside** |
| `short-period` |  | 0.30..2.00 ratio | 0.57 | **inside** | 0.55 | **inside** |

context rows, not counted:

| row | t | band | our A320 | | JSBSim's 737 | |
|---|---|---|---|---|---|---|
| `to-accel` |  | 1.50..2.37 m/s2 | 2.56 | (outside +0.2) | 2.59 | (outside +0.2) |
| `lof-speed` |  | 145.00..187.00 kt | 157.85 | (inside) | 157.44 | (inside) |
| `climb-rate` |  | 1500.00..2530.00 ft/min | 4602.18 | (outside +2072.2) | 3962.64 | (outside +1432.6) |
| `descent-rate` |  | -1550.00..-840.00 ft/min | -1033.95 | (inside) | -1699.40 | (outside -149.4) |

**Our A320: inside 33 of 33 targets — 13 of 13 fit rows, 20 of 20 held out. The 737: inside 8 of
33 — 2 of 13 fit, 6 of 20 held out.** Our A320 is inside every row the 737 is inside.

Read plainly: the 737 stalls 14 to 47 kt faster than an A320 of its weight, at either weight, because
its wing is smaller — 1,171 ft² against the A320's 1,317 — and lifts less: a CL max of 2.09 at full
flap where the A320 has 2.87, and 1.19 clean against 1.30. It has no slats, so CONF 1 is clean to it.
Its lift peaks at 13.25° in every configuration, short of the ELAC's slats-out α max plus a degree. So
at the A320's own speeds it flies above α prot, or cannot fly at all. Its roll, its Dutch roll with
the yaw damper, its short period, its cruise trim and its drag rise are inside their bands — which
are floors, the law's own rate and a model's estimate, not A320 flight-test numbers. The context rows
are what airlines fly, at reduced thrust and mixed weights; both airframes climb at the harness's
climb thrust, 88 % of take-off thrust, and their 3,963 and 4,602 fpm are not faults.

How much the held-out rows say, row by row:

- The six stall speeds at 65 t were never seen by the fit, but they follow from the six fitted at
  48.5 t if lift does not change with weight; A32NX's table scales a little slower than the square
  root of weight, and the fit lands 1.3 kt or less above its centre.
- The roll, Dutch-roll and short-period rows test seeds the fit could not move: textbook estimates
  for a transport of this size (`jsbsim/aircraft/A320-fit/seeds.csv`), against floors.
- The six VLS alphas and the two approach attitudes test the lift at zero alpha by configuration.
  Those seeds were estimated by hand with the bands in view (the seeds file says which). The
  optimiser never saw these rows, but the person who wrote the seeds did, so they are weaker
  evidence than the rest. Two pass with almost nothing to spare: clean alpha at VLS, 6.25° at 48.5 t
  and 6.49° at 65 t, against 6.5°.
- No row measures the stall at high Mach, the transonic pitching moment, the post-stall lift or
  ground effect. Their coefficients are the seeds' estimates; P7's protections step will be the
  first to fly them.

## Our A320, and how it was fitted

`jsbsim/aircraft/A320-fit/A320-fit.xml` is ours, written for this project, GPLv3. Geometry from A32NX's
MSFS flight model (wing area 1,317 ft² and the sharklets' 117.5 ft span, tail areas) and the MAC from
OpenAP; weight and inertia from the same MSFS file's weight and balance, an airline's A320-251N (42.5 t
empty at 30 % MAC); loaded to 65.0 t at 28 % MAC with A32NX's tank layout; JSBSim's CFM56_5, 25,000 lb
a side, read from the clone. The aerodynamics are 69 coefficients, each a property under `aero/fit/`
declared in the file, so the fitter sets them without rewriting it:

- lift by slope, lift at zero alpha, peak and the width over which the curve rounds into it, for
  clean and for each slats-out configuration, blended as slats and flaps move; past the peak a loss
  toward three quarters of it. The slope rises with Mach by DATCOM's formula for this wing; the peak
  falls above Mach 0.3, toward the buffet boundary
- drag: a polar, its configuration, gear, spoiler and sideslip increments, and Lock's fourth-power
  rise above a critical Mach that falls with lift as Korn's equation has it for 25° of sweep
- pitch with a stabiliser of its own, the elevator, damping, a tuck past Mach 0.78; roll and yaw with
  roll spoilers, dihedral effect and yaw from roll rate growing with lift
- ground effect from textbook theory: lift by the lift-curve slope of the wing over its image,
  induced drag by McCormick's factor, and the nose-down moment of the downwash the ground removes

`jsbsim/aircraft/A320-fit/seeds.csv` gives every coefficient's seed, the width of its prior, its
limits, and where the seed came from: A32NX's MSFS model, OpenAP's A320 drag polar, our own textbook
estimate, or a hand estimate. MSFS's numbers are a seed and a cross-check, not a drop-in: its tables
are in its own conventions, and only what they imply (its stall speeds, its Mach drag table) was used.

`airframe_fit` fits them. Each candidate is a full set of coefficients handed to `airframe_score
--airframe a320 --coefficients FILE --fit-rows`, a process of its own, sixteen at a time: one
evaluation is 0.14 s. A process each, not a thread, because the A32NX computers are a static singleton
and JSBSim keeps globals. What it minimises is the scorer's cost — 0 at a fit row's centre, 1 at its
edge, growing as the square beyond — plus a prior: 0.02 times the square of each coefficient's move
from its seed, in widths of its prior. Before
searching it moves each coefficient by its prior's width: 21 of the 69 answer to a fit row, and the
other 48 are held at their seeds, since the optimiser could only wander them. The search is CMA-ES as
Hansen's tutorial sets it, written here, with random numbers of our own from a fixed seed: on one
compiler a fit repeats to the last digit. On GCC 13.3 JSBSim's arithmetic differs in the last bits,
the search takes another path, and it ends at the same 13 of 13 with an objective of 0.02685 against
MSVC's 0.02676.

The fit that is committed: 300 generations, 4,870 evaluations, 79 s on the i9-9900K, the desktop 10 %
busy before it and 89 % during, the fit included. Three runs gave the same coefficients to the last
digit. The cost fell from 3.21 at the seeds (12 of 13 fit rows inside) to 0.0002 (13 of 13). The peaks
moved most: CL max clean 1.335 to 1.299 and FULL 2.953 to 2.865, A32NX's reference stall speeds having
put them a little high; the critical Mach 0.703 to 0.730, A32NX's Mach drag table rising 0.03 earlier
than Korn and Lock. Everything else moved less than a tenth of its prior.

That is a fit of a lift curve's peaks and a critical Mach, not a search over a rich landscape: the
thirteen fit rows fall almost one to one on thirteen of the free coefficients. The rest of the model
is its seeds, and the held-out rows above are what tests them. Before the fit, the seeds alone were
inside 31 of 33.

## The swap: made, 2026-11-01

The rule (`ROADMAP.md`, P7): a fitted A320 replaces the 737 when, scored on the same revision of the
table, it is inside every target the 737 is inside and inside more of them in all, with its held-out
rows reported apart, and the P6 gate and every `ctest` case pass with it flying. All of it holds: 33 of
33 against 8 of 33, all of the 737's eight among them; the P6 gate with the A320 flying (5.11 to 5.30 s
wall, 339 to 353 times real time, with the desktop 12 % busy on average, 4 to 39 %, sampled each
second); and every `ctest` case, with either airframe flying. The operator approved it: *"yes do it"*.
Our A320 flies by default (`kDefaultModel` in `harness/airframe.cpp`); the 737 stays selectable and
keeps its own cases.

The landing case passed only after the crew changed. Before, with the A320 flying, the gate and
thirteen more cases passed and `lands_inside_the_limits` did not, for two reasons:

- The crew was the 737's, until the change below. It flew the final approach at 145 kt — 1.28 VS for
  the 737, VLS + 16 for an A320 at 65 t — and flared with a gain set on the 737, whose lift rises with alpha at 4.35 per
  radian in CONF FULL. Our A320's rises at 6.3, so the rotation the crew asks for buys it more lift,
  later in the flare than the crew expects. It touches down at 361 fpm and 5.9° of pitch, still
  pitching up, at 2.19 g, and the rising lift takes it off the runway again for 1.1 s. With less
  flare gain it lands harder: 465 fpm at 0.05, 549 at 0.04. Neither the gear's damping nor its
  ground effect changed that when tried; the crew's numbers do.
- Its first landing comes at 1,036 s, after the case's 16 minutes. It descends at idle at 1,030 fpm,
  inside WRAP's band, where the 737 does 1,700, and the descent alone takes 125 s longer.

A crew that lands both was found by sweeping 72 settings in scratch builds, and it is the crew now
(*The crew's numbers are technique*, below). With it, and the landing case run for 18 minutes, all
fifteen cases pass with either airframe flying: the 737 lands at −77 fpm, 3.2° of pitch, 1.27 g; our
A320 at −143 fpm, 5.5°, 1.41 g; both gates pass. Neighbouring settings show the scripted flare is
sensitive: at 0.4 per g the 737 touches down at −0.1° of pitch.

What the swap leaves open, the next fit: thrust. The climb-rate context row reads 4,602 fpm against
WRAP's 1,500 to 2,530. Nothing on the engine side has been fitted: the engines are JSBSim's generic
CFM56_5, Aeromatic's lapse tables at 25,000 lb a side, driven by the harness's own thrust-lever
schedule (climb thrust at 88 % of take-off thrust), which was drawn up for the 737 stand-in. The
context rows are not counted, but they say where the airframe is least an A320 now.

## How it is built

| path | what |
|---|---|
| `CMakeLists.txt` | compiles the A32NX computers and JSBSim from their clones, the world once (`flight_world`) for both programs, and the tests |
| `harness/efcs.cpp` | the world adapter: `FlyByWireInterface`'s `updateElac`/`Sec`/`Fac`/`Fcdc` and `updateServoSolenoidStatus`, line for line, in the driver's order. Unchanged since P6 |
| `harness/world.cpp` | the world: the crew, the servos, the SFCCs' slats and flaps, the sensors |
| `harness/airframe.cpp` | the airframe: JSBSim loading the 737 from the clone or our A320 from this tree, the surfaces mapped into its frame, the state read back; and the bare airframe measured: its lift swept, its drag read, trimmed, its elevator pulsed, at a weight |
| `jsbsim/a32nx-surfaces.xml` | the JSBSim system that puts the A32NX servos in charge of either airframe's surfaces |
| `jsbsim/aircraft/A320-fit/A320-fit.xml` | our A320: geometry, mass, gear, engines, and 69 aerodynamic coefficients as named properties |
| `jsbsim/aircraft/A320-fit/seeds.csv` | each coefficient's seed, prior width, limits and source |
| `harness/main.cpp` | the runner: the non-finite scan, the law decoding, the gate, the expectations, the crash check |
| `harness/score.cpp` | the scorer: the airframe measured bare (lift sweeps, drag, trims, a pitch pulse) and flown (the circuit), against the targets; the fit rows alone, with a cost, for the fitter |
| `harness/fit.cpp` | the fitter: CMA-ES over our A320's coefficients, each candidate scored by the scorer in a process of its own |
| `targets/a320.csv` | the A320's acceptance targets: band, weight, fit or held out, and source, row by row |
| `targets/a320-speeds.csv` | VS1g and VLS by configuration and weight, from A32NX's tables, three points corrected |

**The adapter keeps the aircraft's staleness.** Each computer reads the others' last outputs when its
turn comes, in the order ELAC 1, 2 → SEC 1, 2, 3 → FAC 1, 2 → FCDC 1, 2. So ELAC 1 sees ELAC 2 a tick
late, ELAC 2 sees ELAC 1 the same tick, and every ELAC sees SEC, FAC and FCDC a tick late.

**The laws are read the way the aircraft reads them**: from the FCDC's EFCS status word 1 (pitch law
bits 11–15, lateral 16–17), not from the computers' insides.

**The NaN scan needs no field list.** Every output bus is whole ARINC 429 words and every analogue
block whole doubles — asserted at compile time — so the scan covers all of them, every tick.

**Sensors** are transmitted as the A32NX producers transmit them (`adirs.rs`, `landing_gear/mod.rs`,
`sfcc/mod.rs`): standard signs, accelerometers that feel gravity (JSBSim's specific force, 1 g in level
flight), discrete bits where the producers put them, the radio altimeter reading zero on the runway.
Servos follow orders at a finite rate.

**The airframe runs its own flight controls and then ours.** JSBSim loads the 737 unmodified, then our
system; its channel runs last in every flight-control pass and overwrites each surface position, so
the aerodynamics see the servos and nothing else. In `airframe.cpp`, the one place the two frames meet:

- elevator plus 1.8 times the THS — the 737 has one pitch control with the trim folded in, and one
  degree of stabiliser turns the tail as far as 1.8 of elevator (τ about 0.55 for an elevator of about
  30 % chord);
- the ailerons' differential, which is what the 737 rolls on;
- the rudder as the A320's mechanical assembly sums it, inside the travel limiter (below);
- what both wings' spoilers extend together: spoiler 1 as ground spoilers, 2–4 as speedbrakes;
- flaps from the SFCC's pick-off angle through A32NX's own pick-off-to-surface table, FULL = 40°;
- thrust lever to thrust on a schedule of ours shaped like the A320's: CL 88 %, MCT 95 %, TOGA 100 %.

What does not carry over, because the 737's tables have nowhere to put it: the stabiliser as a
surface of its own, slats, roll spoilers, aileron droop, reverse thrust. Our A320 takes the stabiliser,
the slats (from the SFCC's slat pick-off angle, through A32NX's table) and each wing's spoilers as
they are; aileron droop and reverse thrust neither takes. JSBSim runs at 200 Hz, four frames a tick.
The 737's file asks for a telnet port and a UDP input; the harness switches JSBSim's input off before
loading, so nothing listens on a socket.

**The crew is a script that flies on truth, closed loop,** splitting the job as the A320's own modes
do: in an open climb or descent the thrust is set and the elevator holds the speed; within 400 ft of
the level the elevator holds the altitude and the thrust the speed; on the glide path the elevator
holds 3° and the thrust the speed. The flight path it asks of the laws moves no faster than 1.5°/s.
Bank is held closed loop on roll rate, which flies the same in normal law (stick is roll rate) and
direct law (stick is aileron). On the ground the pedals hold the heading — rudder at speed, 6° of nose
wheel slow — and the toe brakes stop it. One circuit: power-up, flight control check, taxi, takeoff in
1+F rotating at 140 kt, an open climb to 8,000 ft with the flaps in at 200 kt, a doublet, a 180° turn,
speedbrake, a pedal kick, a 45° steep turn, a descent to 2,000 ft configured as the speed comes back,
a 3° path at 140 kt, a flare from 33 ft, ground spoilers, rollout, and again.

**The crew's numbers are technique, not airframe data.** One scripted crew flies both airframes: final
approach at 140 kt, and a flare that pulls 0.10 per ft/s of sink above its target and eases off 0.08
per °/s of pitch rate and 1.0 per g of load factor above one, as a pilot does when the pull is felt.
Until 2026-11-01 it flew the 737's own technique, 145 kt and a flare of 0.06 per ft/s and 0.03 per °/s;
that crew bounced our A320, whose lift rises faster with alpha, and the common one lands both. A real
A320 pilot flies Vapp = VLS + 5 off the speed tape, the FAC's VLS; the scripted crew does not, because
the FAC computes an A320's VLS and would fly the 737 near its stall. The hand-flown gate on the A320
takes Vapp from the FAC's VLS. Nothing `airframe_score` measures depends on the crew's approach or
flare: both airframes' scores were byte for byte the same before and after the change.

The 737, re-baselined by that change (MSVC 19.44). There is no touchdown point to give: the runway is
everywhere until P7's step 2 puts one somewhere.

| the 737 | before, crew at 145 kt | after, the common crew |
|---|---|---|
| P6 gate | pass; normal law 100 % of 1,594 s; 0 non-finite of 20,520,000 | pass; normal law 100 % of 1,595 s; 0 non-finite of 20,520,000 |
| first landing | 911.2 s: −170 fpm, 3.7° of pitch, 142 kt, 1.80 g | 916.6 s: −77 fpm, 3.2°, 137 kt, 1.27 g |
| gate digest, 30 min | `e6956d5a53836880` | `ae72d18431512654` |
| determinism digest, 3 min, before the approach | `79dd930cc06b6ef6` | `79dd930cc06b6ef6` |

## Findings

From P6:

- **The computers depend on zero-filled memory.** `Elac`, `Sec`, `Fac` and `Fcdc` leave their
  monitoring state uninitialised and rely on MSFS creating them in static storage. The harness keeps
  the set in one function-local static for the same reason; a set built on the stack runs on garbage.
- **The driver reads past an array.** For SEC 2, `updateSec` reads `idLeftSpoilerPosition[5]` and
  `idRightSpoilerPosition[5]` (`FlyByWireInterface.cpp` `:1592-1595`) from five-element arrays. SEC 2
  drives one spoiler pair; the adapter feeds zero there. Worth reporting upstream.
- **Elevator servos run reverted solenoid logic** (`a320_systems/src/hydraulic/mod.rs`,
  `elevator_actuator_mode_from_solenoid`): de-energised is position control. A computer's "damping
  mode" output energises the *other* servo, so it reads as "I am active".
- **Signs, in the computers' own frame:** stick +1 is a pull; elevator and aileron positive trailing
  edge down; THS positive nose down; spoilers extend negative; roll stick +1 rolls right.
- **The full set reaches normal law.** The spike's lone ELAC stopped at direct law for want of its
  neighbours; with SECs, FACs and FCDCs present it is normal law from the first second of flight, and
  alternate 2 when all air data is lost.

From P7's first slice:

- **JSBSim's A320 cannot be trimmed on approach** at 130–150 kt in CONF FULL; its pitch stiffness is
  several times a transport's. Measurements in `docs/provenance.md`.
- **The rudder, in the computers' frame, is 25° × pedal + trim + yaw damper**, inside the travel
  limiter. The driver hands the computers the pedal negated (`FlyByWireInterface.cpp` `:1414`), and
  the hydraulics negate both the yaw damper order and the trim order on the way in ("FBW negative is
  right", `a320_systems` `hydraulic/mod.rs` `:5018`; "Trim commands from FBW is negative for right
  positive for left", `:5107`). Positive is trailing edge left, as in JSBSim. Reversing the yaw
  damper's sign proves it: the aircraft departs.
- **Corrected after slice 1: the trim counted against the pedals.** This README said the hydraulics
  take the trim order as it is, and that `efcs.cpp` fed the trim's position back with the wrong sign.
  Both were wrong. The hydraulics negate the trim order (`:5107`), so the world's rudder sum had the
  trim's sign reversed; `efcs.cpp` was right not to negate the position, because the world holds the
  trim in the computers' frame, and the driver negates it (`:2464`) only because the hydraulics hold
  it in theirs.
  Harmless while nothing moved the trim. `rudder_trim_moves_the_nose_the_way_it_is_set` now holds the
  RUD TRIM switch left for six seconds in cruise: 6.0° ordered and read back, the rudder 5.3° left,
  3.6° of sideslip nose left, and RESET back to 0.0°. Reversing either sign fails it.
- **The P6 crew leaned on the stub.** The stub clamped bank at 80° and gave speed by fiat; under real
  aerodynamics the old open-loop steep turn overbanked in direct law into a spiral, a stall at 80° of
  alpha and the ground. The crew now holds bank closed loop, and a crash fails the run.
- **The A320 laws protect an A320's wing.** The ELAC's α max is 8.7° clean (6.4° at high Mach) and
  13.0 to 14.2° with slats out; α prot 6.5° clean, 10.6 to 11.9° with slats out (`ElacComputer_P`,
  read out of the compiled table). The 737's lift peaks near 13.2° whatever its flaps: clean, the
  protection stops it far short of its stall; with slats out, α max is at or past it. In one badly
  flown climb during development, flaps running in at low speed, the 737 went through its stall to
  24° of alpha in normal law.
- **A32NX's VS1g and VLS tables have three typos** (`NXSpeeds.ts`): CONF 1+F's stall speed writes
  `117 + 0.8 + (m - 65)` and `121 + 0.8 + (m - 70)` where every neighbouring bracket multiplies — 1.8 kt
  high at 70 and 75 t, with steps at the bracket edges; CONF 3's VLS writes `151 + m - 65` in the
  75–80 t bracket — 10 kt high across it. `targets/a320-speeds.csv` corrects the three points and says
  so. Worth reporting upstream.
- **JSBSim's trim searches alpha up to 20° unless the aircraft sets limits**, and the 737 sets none.
  Past the 737's 13.25° lift peak the search loses solutions it straddles: clean trims below about
  185 kt failed until `Airframe::trim` held the search to the attached-flow side, by setting
  `aero/alpha-max-rad` after `RunIC` (which resets it) and before `DoTrim` (which reads it).
- **JSBSim's `aero/cl-squared` is a frame late**: it is formed from the lift of the frame before. A
  lift sweep initialises twice at each alpha so the second frame reads its own lift.

From the A320 fit:

- **A bare measurement left the gear in transit.** It commanded the gear but did not put it there:
  the gear is the aircraft's own kinematic, five seconds end to end on the 737, and JSBSim moves a
  kinematic a frame's travel on every `RunIC`, integrating or not. A lift sweep of 202 initialisations
  carried it two thirds of the way from where the last measurement had left it. Trims snap it, and
  the 737's lift has no gear term, so no number printed before was wrong; its drag would have been.
  The measurement now sets the position, and a `ctest` case reads the 737's gear drag back.
- **JSBSim's declared properties survive `RunIC` but not a reset.** `ResetToInitialConditions` puts
  every `<property value=...>` back to its declared value unless it is marked `persistent`; our A320's
  coefficients are, so the fitter's values hold whatever the harness does.
- **The 737's static margin is about 23 %**, not small: loaded, its CG is 14 in ahead of its
  aerodynamic reference point. It and our A320 (21 to 23 %) have nearly the same short period (0.55
  at 1.69 rad/s against 0.57 at 1.61). What makes the scripted flare land one and not the other is the
  lift slope with flaps, 4.35 against 6.3 per radian.
- **A32NX's MSFS model puts the stall a little early and the drag rise early.** Its reference stall
  speeds imply CL max 1.335 clean and 2.95 in CONF FULL at 79 t; A32NX's own VS1g tables, which the
  fit follows, give 1.30 and 2.87. Its Mach drag table reaches 20 counts at Mach 0.803, against 0.827
  from Korn and Lock with the A320's sweep and thickness. Both are inside what MSFS's flight model
  makes of them; neither is a fault there.
- **The scripted flare is sensitive.** Of 72 settings swept for the crew, nine landed the A320 inside
  the limits, and a setting that lands one airframe well can leave the other touching down flat. The crew is a test fixture; a hand-flown ILS (P7's gate) will judge landings properly.

## The browser simulator (P7, steps 5 to 8)

The same flight, in a browser, from `file://`, with a joystick and a view out of the window.

**The flight core** (`harness/core.h`) is the step loop behind a small C API: `flight_start`,
`flight_inputs`, `flight_step`, `flight_state`. Slots are found by name (`flight_input_name`,
`flight_state_name`), so a JavaScript caller cannot drift from the C side. The scripted crew is one input
source; an outside crew — a recording, a person — is another. One flight per process or per WebAssembly
instance, because the computers rely on zero-filled static storage. `law_harness` steps through the same
core, byte for byte as before. `--record` and `--replay` write and fly a crew recording;
`replay_reaches_the_same_touchdown` proves a replay gives the same bytes from every computer.

**WebAssembly.** Emscripten 6.0.12 (`docs/provenance.md` §2b) builds the same CMake project:

```
emcmake cmake -S flight -B flight/build-wasm -G Ninja -DCMAKE_BUILD_TYPE=Release -DA32NX_DIR=<clone> -DJSBSIM_DIR=<clone>
cmake --build flight/build-wasm && ctest --test-dir flight/build-wasm
```

The test programs run under node on the real file system; three cases that start processes of their own
stay native. `flight_core.js` is the browser's module: the core and every file it reads, one JavaScript
file with the WebAssembly inside, 2.14 MB. Built in WSL's Ubuntu 24.04 in 67 s from scratch.

**The page** (`web/`): `npm install` there, then `node tools/build.mjs --core <flight_core.js>` writes
`flight/build-web/` — `index.html`, `flight.js`, `core.js` — and nothing else; it is not a package. Open
`index.html`: no server, no network. `?airframe=737`, `?crew=script` (watch the scripted crew),
`?time=night|day`, `?bench=MINUTES` (a tick's cost, flat out). The worker is made from a Blob of
`core.js`; the page steps it at 50 Hz on a fixed-step clock under the display's rate, paying back up to
five steps a frame and dropping the rest, counted.

**Hands.** A joystick or gamepad through the Gamepad API; a standard gamepad flies out of the box, any
other device is mapped from the pilot's own hands (M) and calibrated (C), both kept per device. The keyboard
is the fallback (H lists the keys): arrows, Z X rudder, PgUp PgDn thrust levers with CL, MCT and TOGA
detents, R F flaps, G gear, B brakes, P parking brake, S speedbrake, A ground spoilers, T Y U RUD TRIM and
its RESET. The takeover pushbutton is mapped; with no autopilot until P9 it disconnects nothing.

**The view.** three.js, drawn as a 1980s full-flight simulator drew it: fields, haze, a 3,000 m runway with
its paint and lights, an approach light line, a PAPI that reads the eye's angle, a few buildings, dusk,
night or day. Over it, until P8 draws a PFD: a conformal horizon and pitch ladder, the flight path,
speed, altitude, V/S, radio height, heading, flaps, gear, and ILS scales that stay empty until step 2.
The runway is drawn at the start; the scripted crew lands wherever its path meets the ground, which step 2
moves onto the runway.

As measured, 2026-11-01, headless Chrome at 1440 × 900, with the desktop's CPU sampled each second:

| what | result | desktop CPU |
|---|---|---|
| a tick in the page's worker, flat out | 117 µs, 171 × real time (79 to 117 µs over runs) | 65 % mean |
| 25 s in real time, from `file://` | all steps but those of the first frame | 65 % mean |
| a frame on the GPU (RTX 4070 Ti) | 6.9 ms median, 13.9 ms p99 | 77 % mean |
| a frame in software (SwiftShader), the default there: no antialiasing | 33 ms median (30 fps), 67 ms p99; the flight holds real time | 77 % mean |
| the same with antialiasing | 67 ms median | 77 % mean |

`web/tools/measure.mjs [--software]` repeats the frame measurements. The 2014 reference laptop has not
been measured.

The page's own cases, in `ctest`: `the_page_clock_keeps_50_hz`, `the_hands_reach_the_controls`,
`the_view_puts_the_eye_and_the_papi_right`, and in the WebAssembly build `the_browser_module_flies` —
the very file the page loads, in node: the scripted crew lands it at the native build's touchdown to the
printed digit (A320: 1042.12 s, −143.2 fpm), and its inputs replayed into a second instance give the same
state on every tick. Twenty-three native cases pass with either airframe; under node, all but the three
that start processes.

## What P7 still has to build

`ROADMAP.md` §4, *P7 in detail*: a runway, an ILS and wind in the world; failures and the laws they
reach; the protections exercised; and the gate — a hand-flown ILS, stable and repeatable, with its
measures and bands written down. The browser steps (5 to 8) are above. Our fitted A320 flies all of it from here; the next fit is thrust
([above](#the-swap-made-2026-11-01)).

## What is here

| path | what |
|---|---|
| `contract/bus.h` | the full computer input/output contract: 104 structs, 1,259 fields, self-contained, compiles clean |
| `contract/11-bus-contract.md` | the boundary in prose, and what a world adapter must fill |
| `contract/12-bus-population.md` | what a healthy system actually sends, bus by bus, with validity rules |
| `contract/10-sim-io.md` | the MSFS driver's own struct — the layer that gets deleted, not ported |
| `spike/harness.cpp` | the first headless proof: one ELAC, 60 s, direct law |
| `contract/compile_probe.cpp` | a one-file check that `bus.h` still compiles |

## Getting the sources

The A32NX clone this was built against: `66021c24448c44399a8ff569eb14715b6b26558e` (2026-10-28). Fetch
that commit alone rather than `--depth 1 --branch master`, which stops working the day master moves
past the pin:

```
git init ../a32nx
git -C ../a32nx remote add origin https://github.com/flybywiresim/aircraft.git
git -C ../a32nx fetch --depth 1 origin 66021c24448c44399a8ff569eb14715b6b26558e
git -C ../a32nx checkout FETCH_HEAD
```

This recipe was not exercised when P6 was built; the clone used then already existed.

JSBSim, release `v1.3.3`, the same way — this recipe was exercised for P7:

```
git init ../jsbsim
git -C ../jsbsim remote add origin https://github.com/JSBSim-Team/jsbsim.git
git -C ../jsbsim fetch --depth 1 origin 66f7fafc07fe13e7ede9db20873030fed2881713
git -C ../jsbsim checkout FETCH_HEAD
```

Neither is **vendored here.** `bus.h` and the contract documents are derived artefacts — keep them in
sync by hand if the A32NX commit ever moves, and re-run `compile_probe.cpp` when you do. Moving the
JSBSim pin means measuring the airframe again.

## Licence

Everything here is GPLv3, including the derived `bus.h`, the harness and `jsbsim/`. JSBSim is
LGPL-2.1 and linked statically; shipping this source meets its relinking condition. The 737 data it
reads is GPL. The upstream notices are in the clones, not here; keep them when you redistribute.
