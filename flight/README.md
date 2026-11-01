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
(`targets/a320.csv`, 68 targets): our A320 is inside all 68, the 737 inside 21. The A320 replaced the
737 under the swap rule ([below](#the-swap-made-2026-11-01)) on its aerodynamics, and its engines
were fitted after ([below](#its-engines-and-how-they-were-fitted)), and then what lies past its stall
([below](#past-the-stall-and-how-it-was-fitted)) and the drag of its landing flaps and gear
([below](#the-drag-of-the-landing-flaps-and-the-gear)).

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
from this tree, with engines of its own beside it (`Engines/CFM56-5A1-fit.xml`).
`flight/build/Release/airframe_fit` fits its aerodynamics (below), `airframe_fit --thrust` its
engines, `airframe_fit --poststall` what lies past its stall and `airframe_fit --drag` the drag of its
landing flaps and gear, each in a minute or two; `--write` puts
the result into the aircraft file, and `--from-file` starts the search where the last fit left it.

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

The gate above is the 737's, as first measured. Our A320, flying by default with its engines
fitted, passes the same gate: normal law in pitch and roll for 100 % of 1,588 s of settled flight, 0
non-finite in 20,520,000 values, all computers healthy, a landing at 1,076.7 s at −152 fpm, 5.7° of
pitch, 138 kt and 1.45 g. Timed three times on MSVC 19.44: 5.46 to 5.54 s of wall time, about 330 times
real time, with the desktop 43 % busy on average (11 to 100 %), sampled each second. Before its
engines were fitted it landed at 1,042.1 s at −143 fpm, 5.5°, 138 kt and 1.41 g.

Eighteen `ctest` cases hold the parts the gate leans on, what the airframe adds, the scorer and the
fitter, and keep the 737 flying. Two are negative controls that show the gate's checks can fail; three of the airframe's were
shown able to fail by hand: reverse the yaw damper's sign and the aircraft departs and flies into the
ground 40 s after liftoff; reverse the THS's and the stabiliser runs to its stop while the elevator
holds 24° against it; reverse either rudder trim sign and the trim case fails. The scorer's instruments and the fitter's optimiser were shown able to fail the
same way (their rows below). All eighteen pass on MSVC 19.44 with our A320 flying, and all eighteen
again with `FLIGHT_AIRFRAME=737`. GCC 13.3 on Ubuntu 24.04 (WSL) gives the same verdicts on all
eighteen with either airframe and, measured since the engines were fitted, the same score on every
row of either airframe to the digit printed, with no warning in our code. Where a row gives one
number, it is the 737's, measured before the swap.

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
| `lands_inside_the_limits` | the first landing, wings level, no bounce within 30 s: our A320 at −152 fpm, 5.7° of pitch, 1.45 g, at 1,076.7 s; the 737 at −77 fpm, 3.2°, 1.27 g. Twenty minutes for the A320, which descends at idle at about 1,100 fpm against the 737's 1,700 and, with its engines fitted, climbs at about 3,350 fpm against 4,600; eighteen for the 737 |
| `airframe_is_scored_against_the_a320` | the scorer measures every target and context row; it fails only on a row it could not measure (shown with a planted bogus row), never on a row outside its band |
| `scorer_instruments_read_the_737_right` | the scorer's instruments read the 737's own file back: its gear drag, 0.015; the Mach at which its drag table crosses 20 counts, 0.8170; a nose-down elevator pulse lowering alpha. Without the gear fix (Findings) it fails two of three |
| `scorer_instruments_read_pitch_as_the_files_have_it` | the instruments for pitch past the normal range: a static moment that −40 per rad of alpha-rate damping moves by 0.00001; 10° of elevator moving it as our A320's file says, to 0.1 %, and past the onset of the tail's fade by the share the file leaves; and two readings of the 737's clean short period agreeing. It fails with the alpha rate in the moment, and with the fade left out of the elevator's term |
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
bar for that swap: 68 targets an airframe is counted against and 4 context rows scored but not
counted. Each row names its source in the file's header: A32NX's VS1g and VLS tables
(`targets/a320-speeds.csv`, a community reconstruction of Airbus's, sampled on a weight grid), the
ELAC's own α max and α prot, a recorded A320 approach (VT-WGR's flight data, from AAIB India's
report), the lateral law's 15°/s, MIL-F-8785C's Level 1 floors for large aircraft, cruising and in
the terminal phases, the wave-drag model OpenAP implements, one band from pilot literature still to
confirm; for the engines, the CFM56-5A1's type-certificate ratings, Airbus's own thrust and
drag-to-lift ratios for the A320-211 in the ANP database, OpenAP's engine data and Bartel and Young's
thrust lapse; past the stall, NASA's wind tunnel data on a transport (Foster et al.) and its Generic
Transport Model (the Transport Class Model's report); and for the drag of the landing flaps and the
gear, Airbus's drag-to-lift ratios in ANP again and DLR's gear drag identified from A320 flight data.
OpenAP WRAP's distributions fitted to ADS-B are the four context rows. Thirty rows are marked *fit*,
for an optimiser to tune against; thirty-eight are *held out*, so that a fit which only memorises is
caught.
Rows that depend on weight are measured at two: 48.5 t, the weight the 737 is loaded to, and 65 t,
between an A320-251N's maximum zero-fuel and landing weights. The rule for the swap is in
`ROADMAP.md`, P7.

`airframe_score` measures in two ways. The bare airframe, no computers, at each row's weight: JSBSim
sweeps the lift curve in each configuration (from which the 1-g stall speed, and the lift past the
peak), reads the drag against Mach at a lift coefficient of 0.5, sweeps the static pitching moment in
level flight at 1 g, trims it at the A320's VLS and approach speed and in cruise, pulses its elevator
from a trim for the short period, runs one engine to a steady thrust at a lever's detent, and sets a
lever's thrust against the thrust a level trim needs, for a steady climb or descent gradient. The airframe flown, at the weight it is loaded to: the gate's circuit through the A32NX
laws, with a full-stick roll added in cruise, timing the roll, the Dutch roll after the circuit's
pedal kick, the takeoff, the climb and the descent. It scores; it does not gate. Its `ctest` cases fail
only on a row they could not measure.

Measured on this revision of the table, MSVC 19.44: `airframe_score --airframe a320`, then
`--airframe 737`; for the engines, our A320 also as it flew on JSBSim's CFM56_5 before they were
fitted, and past the stall as it flew before that was fitted. Our A320 is loaded to 65.0 t at 28.1 %
MAC, the 737 to 48.5 t at 15.4 %. A weight-dependent band is the A320's at the row's weight.

fit rows, the aerodynamics:

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

fit rows, the engines:

| row | t | band | our A320 | | on CFM56_5, before | | JSBSim's 737 | |
|---|---|---|---|---|---|---|---|---|
| `thrust-toga-static` |  | 110.09..112.31 kN | 111.21 | **inside** | 111.21 | **inside** | 85.41 | outside -24.7 |
| `thrust-mct-static` |  | 104.35..106.45 kN | 105.40 | **inside** | 105.89 | **inside** | 81.32 | outside -23.0 |
| `thrust-toga-100kt` |  | 92.16..97.86 kN | 95.04 | **inside** | 105.93 | outside +8.1 | 81.35 | outside -10.8 |
| `thrust-toga-150kt` |  | 87.21..92.61 kN | 89.91 | **inside** | 104.00 | outside +11.4 | 79.88 | outside -7.3 |
| `thrust-toga-150kt-4000ft` |  | 79.41..84.32 kN | 81.84 | **inside** | 93.71 | outside +9.4 | 71.97 | outside -7.4 |
| `thrust-cl-250kt-5000ft` |  | 60.16..63.88 kN | 62.06 | **inside** | 79.21 | outside +15.3 | 60.83 | **inside** |
| `thrust-cl-300kt-10000ft` |  | 52.46..55.71 kN | 54.06 | **inside** | 69.75 | outside +14.0 | 53.56 | **inside** |
| `thrust-cl-fl350` |  | 21.10..24.30 kN | 22.71 | **inside** | 36.34 | outside +12.0 | 27.91 | outside +3.6 |
| `thrust-idle-140kt-1000ft` |  | 2.80..4.80 kN | 3.78 | **inside** | 5.01 | outside +0.2 | 3.85 | **inside** |
| `thrust-idle-210kt-5000ft` |  | -0.71..1.29 kN | 0.32 | **inside** | 1.50 | outside +0.2 | 1.15 | **inside** |
| `thrust-idle-250kt-10000ft` |  | -2.65..-0.65 kN | -1.67 | **inside** | 0.16 | outside +0.8 | 0.13 | outside +0.8 |

fit rows, the drag of the landing flaps and the gear (ANP's R, drag over lift in level flight at ANP's
approach speed; DLR's gear drag coefficient):

| row | t | band | our A320 | | before | | JSBSim's 737 | |
|---|---|---|---|---|---|---|---|---|
| `drag-ratio-conf3-65t` | 65 | 0.0911..0.1113 | 0.1018 | **inside** | 0.1018 | **inside** | none | outside |
| `drag-ratio-full-65t` | 65 | 0.1043..0.1274 | 0.1163 | **inside** | 0.1156 | **inside** | 0.1436 | outside +0.0 |
| `gear-drag-conf3` |  | 0.0269..0.0329 | 0.0297 | **inside** | 0.0170 | outside -0.0 | 0.0150 | outside -0.0 |

fit rows, past the stall:

| row | t | band | our A320 | | before | | JSBSim's 737 | |
|---|---|---|---|---|---|---|---|---|
| `elevator-alpha-full` |  | 16.5..24.5 deg | 20.35 | **inside** | 29.01 | outside +4.5 | 39.09 | outside +14.6 |
| `lift-past-stall-full-5` |  | 0.79..0.99 ratio | 0.83 | **inside** | 0.80 | **inside** | 0.82 | **inside** |
| `lift-past-stall-full-15` |  | 0.54..0.74 ratio | 0.67 | **inside** | 0.75 | outside +0.0 | 0.53 | outside -0.0 |

held-out rows, the aerodynamics:

| row | t | band | our A320 | | JSBSim's 737 | |
|---|---|---|---|---|---|---|
| `vls-alpha-clean` | 48.5 | ..6.50 deg | 6.25 | **inside** | 9.40 | outside +2.9 |
| `vls-alpha-conf2` | 48.5 | ..11.90 deg | 9.28 | **inside** | none | outside |
| `vls-alpha-full` | 48.5 | ..10.60 deg | 6.81 | **inside** | 11.93 | outside +1.3 |
| `app-pitch-full` | 48.5 | 1.00..4.00 deg | 2.61 | **inside** | 7.06 | outside +3.1 |
| `cruise-pitch` | 48.5 | 0.00..4.00 deg | 1.02 | **inside** | 3.19 | **inside** |
| `cruise-tla` | 48.5 | 0.00..25.00 deg | 16.95 | **inside** | 18.26 | **inside** |
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
| `roll-rate` |  | 13.50..16.50 deg/s | 13.65 | **inside** | 14.60 | **inside** |
| `roll-tau` |  | ..1.40 s | 0.90 | **inside** | 0.76 | **inside** |
| `dutch-roll-zeta` |  | 0.08.. ratio | 0.65 | **inside** | 0.83 | **inside** |
| `short-period` |  | 0.30..2.00 ratio | 0.58 | **inside** | 0.55 | **inside** |
| `short-period-full` | 65 | 0.35..1.30 ratio | 0.63 | **inside** | 0.47 | **inside** |
| `short-period-freq-full` | 65 | 0.70.. rad/s | 0.92 | **inside** | 1.04 | **inside** |
| `short-period-cap-full` | 65 | 0.16..3.60 1/(g s2) | 0.24 | **inside** | 0.50 | **inside** |

held-out rows, past the stall:

| row | t | band | our A320 | | before | | JSBSim's 737 | |
|---|---|---|---|---|---|---|---|---|
| `elevator-alpha-clean` |  | 21.0..29.0 deg | 23.80 | **inside** | 35.22 | outside +6.2 | none | outside |
| `pitch-break-clean` |  | -0.35..-0.05 Cm | -0.17 | **inside** | -0.03 | outside +0.0 | 0.11 | outside +0.2 |

held-out rows, the engines:

| row | t | band | our A320 | | on CFM56_5, before | | JSBSim's 737 | |
|---|---|---|---|---|---|---|---|---|
| `thrust-toga-50kt` |  | 97.11..103.12 kN | 102.13 | **inside** | 108.56 | outside +5.4 | 83.37 | outside -13.7 |
| `thrust-toga-180kt` |  | 84.25..89.46 kN | 87.78 | **inside** | 103.61 | outside +14.1 | 79.57 | outside -4.7 |
| `thrust-toga-100kt-4000ft` |  | 83.68..88.86 kN | 87.50 | **inside** | 95.24 | outside +6.4 | 73.15 | outside -10.5 |
| `thrust-cl-200kt-2000ft` |  | 65.64..69.71 kN | 68.75 | **inside** | 86.70 | outside +17.0 | 66.58 | **inside** |
| `thrust-cl-250kt-8000ft` |  | 55.84..59.30 kN | 57.10 | **inside** | 72.80 | outside +13.5 | 55.91 | **inside** |
| `thrust-cl-280kt-7000ft` |  | 56.82..60.33 kN | 58.61 | **inside** | 75.63 | outside +15.3 | 58.09 | **inside** |
| `thrust-idle-180kt-2000ft` |  | 0.54..2.54 kN | 1.99 | **inside** | 3.26 | outside +0.7 | 2.50 | **inside** |
| `thrust-idle-250kt-5000ft` |  | -2.89..-0.89 kN | -1.14 | **inside** | 0.35 | outside +1.2 | 0.27 | outside +1.2 |
| `thrust-idle-210kt-8000ft` |  | -0.66..1.34 kN | -0.10 | **inside** | 0.92 | **inside** | 0.70 | **inside** |
| `thrust-lapse-m025` |  | 73.16..80.87 % | 79.79 | **inside** | 93.34 | outside +12.5 | 93.34 | outside +12.5 |
| `takeoff-gradient` | 65 | 18.44..22.54 % | 19.91 | **inside** | 24.15 | outside +1.6 | none | outside |
| `climb-gradient` | 65 | 12.02..14.69 % | 13.45 | **inside** | 18.69 | outside +4.0 | 10.38 | outside -1.6 |
| `descent-gradient` | 65 | -6.23..-5.10 % | -5.21 | **inside** | -4.84 | outside +0.3 | -8.18 | outside -1.9 |

context rows, not counted:

| row | t | band | our A320 | | on CFM56_5, before | | JSBSim's 737 | |
|---|---|---|---|---|---|---|---|---|
| `to-accel` |  | 1.50..2.37 m/s2 | 2.36 | (inside) | 2.56 | (outside +0.2) | 2.59 | (outside +0.2) |
| `lof-speed` |  | 145.00..187.00 kt | 155.67 | (inside) | 157.85 | (inside) | 157.44 | (inside) |
| `climb-rate` |  | 1500.00..2530.00 ft/min | 3348.63 | (outside +818.6) | 4602.18 | (outside +2072.2) | 3962.64 | (outside +1432.6) |
| `descent-rate` |  | -1550.00..-840.00 ft/min | -1113.92 | (inside) | -1033.95 | (inside) | -1699.40 | (outside -149.4) |

**Our A320: inside 68 of 68 targets — 30 of 30 fit rows, 38 of 38 held out — the 24 engine rows
among them, where on JSBSim's CFM56_5 it was inside 3; the 5 past the stall, where before their fit
it was inside 1; and the 3 for the drag of the landing flaps and the gear, where before theirs it was
inside 2. The 737: inside 21 of 68 — 7 of 30 fit, 14 of 38 held out.** Our A320 is inside every row
the 737 is inside, and every row it was inside before its engines, what lies past its stall or the
drag of its flaps and gear were fitted. Every row but the five past the stall reads as it did before
that fit, and every row but the gear's as it did before the drag fit, to the digit printed.

Read plainly: the 737 stalls 14 to 47 kt faster than an A320 of its weight, at either weight, because
its wing is smaller — 1,171 ft² against the A320's 1,317 — and lifts less: a CL max of 2.09 at full
flap where the A320 has 2.87, and 1.19 clean against 1.30. It has no slats, so CONF 1 is clean to it.
Its lift peaks at 13.25° in every configuration, short of the ELAC's slats-out α max plus a degree. So
at the A320's own speeds it flies above α prot, or cannot fly at all. Its roll, its Dutch roll with
the yaw damper, its short period, its cruise trim and its drag rise are inside their bands — which
are floors, the law's own rate and a model's estimate, not A320 flight-test numbers. Its engines,
JSBSim's 737 CFM56 on the harness's schedule, are rated lower than the A320-211's and lapse with
Aeromatic's generic tables, which happen to land its climb thrust inside five of Airbus's rows and
its idle inside four.

The context rows are what airlines fly: mostly reduced take-off thrust, often reduced climb thrust,
weights from light to heavy, and climb and descent rates averaged over segments the circuit does not
fly as one (`targets/a320.csv` says how). No one weight and setting makes them comparable, so they are
not counted. The counted take-off, climb and idle descent are the gradients at 65 t and full
ratings. On the circuit, at 65 t and full thrust, our A320 now climbs at 3,349 fpm where it climbed at
4,602, above WRAP's 2,530, because airlines climb slower than an aeroplane at full climb thrust; it
accelerates down the runway at 2.36 m/s² against 2.56, inside WRAP's band at its top; and it descends
at idle at 1,114 fpm against 1,034.

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
- No row measures the stall at high Mach, the transonic pitching moment or ground effect. Their
  coefficients are the seeds' estimates; P7's protections step was the first to fly them.
- The three short-period rows in CONF FULL are MIL-F-8785C's Level 1 for large aircraft on approach:
  floors, not A320 data, and wide. Both airframes are inside them and they move nothing; the fit past
  the stall cannot reach them. Ours is the slower: 0.92 rad/s and a control anticipation parameter of
  0.24, near the floor of 0.16, against the 737's 1.04 and 0.50, trimmed at 11.9° of alpha there.
- The clean configuration's two rows past the stall test the post-stall model fitted on CONF FULL
  alone, against Foster's flaps-up figure and the GTM's break, which come from the same wind tunnel
  programme as the fitted rows but another configuration. Their seeds were written with those sources
  open ([below](#past-the-stall-and-how-it-was-fitted)).
- The engines' held-out thrust rows are Airbus's own model at speeds and heights the fit did not see,
  between the ones it did: they test that eight numbers carry the lapse, not that the lapse is right.
  They land within 2.0 % of it, and within 0.8 kN at idle. Bartel and Young's lapse is a second
  source, independent of Airbus's, with a wider band: 79.8 % of static thrust at Mach 0.25 against its
  77.0 %.
- The three gradients test thrust and drag together, against what ANP gives the A320-211. The thrust
  agrees; the drag not quite. Clean, ours needs 2.5 to 8 % less thrust to hold level than ANP's
  drag-to-lift ratios imply: sharklets where the A320-211 has wingtip fences, and OpenAP's polar
  fitted to ADS-B. In CONF 1+F it needs 8 % more, its flap drag being seeds no row has fitted. So the
  take-off gradient is 2.8 % under ANP's, the climb 0.7 % over, and the idle descent 8 % shallower,
  5.21 % against 5.67 %, inside its band by 0.11: at idle, drag is nearly all that brings the
  aeroplane down.
- The roll rows moved when the engines were fitted, inside their bands: 14.19 to 13.65 °/s and 0.74
  to 0.90 s. Not the airframe: the roll step is flown 28 s into the cruise, and before, it began
  while the aircraft was still rolling out of the climb's last turn at 1.9 °/s the step's way. With
  the slower climb the roll-out is over first and the step starts from rest. At the engine's seeds
  both read as before. The roll rate now clears its floor by 0.15 °/s.

## Our A320, and how it was fitted

`jsbsim/aircraft/A320-fit/A320-fit.xml` is ours, written for this project, GPLv3. Geometry from A32NX's
MSFS flight model (wing area 1,317 ft² and the sharklets' 117.5 ft span, tail areas) and the MAC from
OpenAP; weight and inertia from the same MSFS file's weight and balance, an airline's A320-251N (42.5 t
empty at 30 % MAC); loaded to 65.0 t at 28 % MAC with A32NX's tank layout; the A320-211's engines,
25,000 lb a side, of our own and fitted after the aerodynamics ([below](#its-engines-and-how-they-were-fitted)).
The aerodynamics are 69 coefficients, each a property under `aero/fit/` declared in the file, so the
fitter sets them without rewriting it:

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

### Its engines, and how they were fitted

Our A320 flew on JSBSim's CFM56_5 until its engines were fitted: Aeromatic's generic turbofan, rated
as the A320-211's CFM56-5A1 but with tables that barely lapse with speed. Against Airbus's own numbers
for the A320-211 it made 8 to 19 % too much take-off thrust between 50 and 180 kt, 26 to 29 % too much
climb thrust below 10,000 ft and 60 % too much at FL350, and climbed at 4,602 fpm at 250 kt.

`jsbsim/aircraft/A320-fit/Engines/CFM56-5A1-fit.xml` is ours, GPLv3, and keeps everything of CFM56_5
but the thrust. JSBSim finds it beside the aircraft before it looks in the clone. Take-off thrust, as a
share of the 25,000 lb rating, is δ^x (1 + a1 M + a2 M²)(1 + c M (1 − δ)), with δ the pressure ratio and
M the Mach number; idle is δ (i0 + i1 M), and may fall below zero, as Airbus's does above about 215 kt.
The thrust lever schedule sets the CL and MCT detents a fraction of the way from idle to take-off
thrust. Those eight numbers are properties under `propulsion/fit/` in the aircraft file; the harness
reads the schedule there for our A320 and keeps its own for the 737, which flies exactly as before.

`jsbsim/aircraft/A320-fit/thrust-seeds.csv` seeds them from CFM56_5: its tables fitted in that form by
least squares, within 2.3 % of the rating everywhere for take-off thrust and 2.1 % for idle below
10,000 ft, and the harness's schedule. The priors are wide, since Aeromatic's tables are a start, not
an estimate. `airframe_fit --thrust` fits them on the eleven fit rows of the thrust group, as it fits
the aerodynamics on theirs: each candidate a process of its own, carrying only the eight numbers, the
aerodynamics the aircraft file's. A candidate whose schedule does not rise from idle to TOGA is refused
by the airframe and costs the fit as a failure.

The fit that is committed: 169 generations, 2,713 evaluations, 48 s, the desktop 32 % busy before it
and 93 % during, the fit included; a second run gave the same numbers to the last printed digit. The
cost fell from 313 at the seeds (3 of 11 fit rows inside) to 0.003 (11 of 11).

| number | seed, from CFM56_5 | fitted | widths |
|---|---|---|---|
| x, how take-off thrust falls with pressure | 0.68 | 0.349 | −0.83 |
| a1, with Mach at sea level | −0.444 | −1.196 | −0.94 |
| a2, how that fall levels off | 0.601 | 1.553 | +0.95 |
| c, how the fall with Mach changes with height | −0.079 | −0.981 | −0.90 |
| i0, idle at rest | 0.065 | 0.0872 | +0.44 |
| i1, idle with Mach | −0.130 | −0.241 | −0.56 |
| CL detent | 0.88 | 0.831 | −0.82 |
| MCT detent | 0.95 | 0.943 | −0.18 |

Eight numbers fit eleven rows and hold the held-out ones because the form was chosen first: candidate
forms fitted to ANP's points in scratch, and the one kept whose held-out points landed within 2 %. One
climb fraction serves because c couples Mach with height. ANP's climb thrust over its take-off thrust
runs from 0.83 to 0.92 across the climb; without c, the scratch fits wanted a climb fraction rising with
Mach past 1 at height, climb thrust above take-off thrust, and still missed held-out rows by up to
3.8 %.

What no row checks: above 10,000 ft only the cruise row pins the lapse, and climb thrust comes out at
about 9,000 lb at FL200 and 4,470 lb at FL390. Idle there is below zero, about −600 lb at FL350, the
form's extrapolation; A32NX's own model of the A320neo's engine puts it near −350 lb. From a high
airport the static thrust is 5 % above where ANP's line would put it at 4,000 ft, 12 % at 8,000 ft:
ANP stops at take-off speeds and 4,000 ft, and so does the fit. There is one idle, ANP's, which is
the A320's approach idle; on the ground the FADEC sets a lower one, and at a standstill this engine
gives 8.7 % of its rating where ICAO's idle setting is 7 %.

### Past the stall, and how it was fitted

Step 4 found that a fast full pull in CONF FULL passes alpha max and stalls our A320
([below](#the-protections-p7-step-4)), and nothing in the table measured anything there: the pitching
moment stayed linear in alpha through the stall, the elevator kept all its power at every alpha, and
past its peak the lift fell toward three quarters of it over a guessed 3°. The table gained eight rows
(`targets/a320.csv`; `docs/provenance.md` §1d):

- the bare airframe's short period in CONF FULL at the approach speed, VLS + 5 kt at 65 t, against
  MIL-F-8785C's Level 1 for large aircraft in the terminal phases: damping 0.35 to 1.30, natural
  frequency at least 0.7 rad/s, control anticipation parameter 0.16 to 3.6 per g per s². Held out:
  floors for handling, not A320 data. In direct law, which the computers choose once the gear is down
  in alternate law, the pilot lands this airframe as it is;
- the highest alpha full nose-up elevator holds in steady flight at 1 g, the stabiliser at 0: NASA's
  wind tunnel tests of a transport give about 25° with the flaps up, and 4 to 5° less with them down
  (Foster et al., AIAA 2005-5933). CONF FULL fitted, clean held out;
- the pitch break across the stall and the lift past it, from NASA's Generic Transport Model as its
  full-scale Transport Class Model carries it (Hueschen, NASA/TM-2011-217169): the break with the flaps
  up held out, the lift 5° and 15° past the peak at its landing flap fitted.

Five coefficients of the aircraft file carry them, seeded in `jsbsim/aircraft/A320-fit/poststall-seeds.csv`:
the pitching moment breaks nose down by `cm-stall` from where the lift curve begins to round into its
peak, over a few degrees; the tail's power, elevator and stabiliser, moment and lift, fades by
`tail-fade` every 10° past `tail-fade-from-deg`, to no less than a quarter, since Foster's elevator
stays effective at every alpha; and past the peak the lift falls toward `poststall-drop` below it over
`poststall-width-deg`, the 3° that was fixed. The seeds: the GTM's break, 0.20; the fade A32NX's MSFS
model gives its elevator past 10° (its `pitch_moment_delta_elevator_aoa_table`), 0.45 every 10°; the
onset our estimate, 10°, past the 8.3° a flare reaches; the lift's two as they stood.

`airframe_fit --poststall` fits them on the poststall group's three fit rows and on nothing else, as the
engines were fitted apart. Those rows answer to the pitch of normal flight as well — `cm-alpha`,
`cm-de`, the elevator's lift — and a first fit with everything free spread the change over them, Cm_α
from −1.5 to −1.28 among them, to meet one row about the stall. No row measures them at low alpha, so
this fit holds them where the aerodynamic fit left them.

The fit that is committed: 78 generations, 1,254 evaluations, 17 s on the i9-9900K, the desktop 22 %
busy before it and about 90 % during, the fit included; GCC 13.3 lands on the same five numbers to the
last digit, and a refit from the file (`--from-file`) stays where it is.

| number | seed | fitted | widths |
|---|---|---|---|
| `cm-stall`, the break | 0.20 | 0.148 | −0.65 |
| `tail-fade`, every 10° | 0.45 | 0.121 | −1.64 |
| `tail-fade-from-deg` | 10 | 10.95 | +0.32 |
| `poststall-drop` | 0.25 | 0.410 | +1.60 |
| `poststall-width-deg` | 3 | 9.18 | +3.09 |

The lift moved furthest. At its landing flap the GTM keeps 0.89 of its peak 5° past it and 0.64 of it
15° past, where it levels off; one exponential cannot do both, and the fit settles at 0.83 and 0.67,
inside both bands. The held-out rows, which the fit never saw, land inside theirs: clean, full nose-up
elevator holds 23.8° where Foster's flaps-up figure is about 25°, and the clean break is −0.17 where
the GTM's is −0.20. So a model fitted on CONF FULL alone predicts the clean configuration's stall
behaviour from two sources. What no row checks: how much power the elevator keeps at very high alpha
(a quarter, our estimate); the pitching moment beyond 25°, where the GTM's levels off and ours goes on
stiffening; and the break in CONF FULL, which takes the clean configuration's size. The fit moves
nothing below the stall: every other row reads as before, to the digit printed. The P6 gate's flight
reads the same above 5 kt in every digit its trace prints, and its first landing is the same, at
1,023.84 s and −143.5 fpm. Its digest moves: standing on the runway, JSBSim's alpha is that of a
velocity of millimetres a second, nearly vertical, and the new terms act there, on a dynamic pressure
of almost nothing. The aerodynamic fit, run again from its seeds, still repeats its committed numbers
to the last digit over the old lift past the stall, and over the new one lands on an equivalent fit by
another path (13 of 13, objective 0.026758 against 0.026764, the loosely held stall widths and lifts
at zero alpha moved in the third digit): its quarter-degree lift sweeps meet the lift past a peak in a
rare candidate whose sample falls just beyond it. The committed aerodynamic numbers are kept.

The new instruments: a static pitching moment, swept in steady level flight at 1 g, with the idle
thrust's share across the flight path counted (off 1 g, JSBSim's alpha rate is not zero and the
"static" moment carries the alpha-rate damping: Findings); the lift past the peak; and the short
period in CONF FULL by equation error, a least-squares fit of alpha's and pitch rate's equations to the
pulse response, because ours does not overshoot within 12 s and the extrema the clean row reads cannot
see its period. `scorer_instruments_read_pitch_as_the_files_have_it` holds them: an extreme alpha-rate
damping, −40 per rad, moves the static moment by 0.00001; 10° of elevator moves it as the file's
`cm-de` and `cl-de` say, to 0.1 %, and past the fade's onset by the share the file leaves; and on the
737's clean pulse the two short-period readings agree, damping 0.55 and 0.51, 1.69 and 1.66 rad/s. It
was shown able to fail: with the alpha-rate in the moment, and with the tail's share left out of the
elevator's term. With it, sixty native cases pass with either airframe on MSVC 19.44 and on GCC 13.3,
and fifty-five under node.

### The drag of the landing flaps and the gear

The thrust fit left the drag of the flaps and the gear to seeds. ANP gives Airbus's drag-to-lift ratio
R for the A320-211 in each configuration, and for CONF 3 and CONF FULL with the gear down it also gives
the approach speed, D√W, at which the lift coefficient is the same at every weight: 1.51 and 1.63. Its
other approach ratios name no speed, and R falls with the lift coefficient, so they are not scored.
DLR identified the A320 family's gear drag from 804 extensions in A320neo airline flights (Deiler and
Fezans, AIAA 2025-1250): a drag coefficient of 0.0296, 0.0291 and 0.0311 in CONF 2, 3 and FULL, 0.0299
as one. Three fit rows, each band 10 % either way, ours: R in CONF 3 and FULL at 65 t at 145.8 and
140.3 kt, read as the aerodynamic drag over lift where a level trim ends, and the gear's drag
coefficient, the aerodynamics in CONF 3 at 6° with the gear down less with it up.

Our A320's totals were already Airbus's: R 0.1018 against 0.1012 in CONF 3 and 0.1156 against
0.1159 in FULL. Its gear was not: 0.017, OpenAP's figure, against DLR's 0.030, so its landing flaps
carried drag that is the gear's. ANP says the same on its own: its CONF 2 ratios with the gear down
and up differ by 0.0288, which is DLR's coefficient at a lift coefficient of 1.04. `airframe_fit
--drag` fits `cd-conf3`, `cd-full` and `cd-gear` (`drag-seeds.csv`, moved from `seeds.csv` unchanged)
on those rows alone, the clean polar held: 47 generations, 756 evaluations, 17 s, the desktop 75 %
busy before it and 99 % during, the fit included; GCC 13.3 fits the same three numbers. The gear goes
to 0.0297, CONF 3's flaps from 0.030 to 0.0174 and FULL's from 0.050 to 0.0385, and R stays where
Airbus has it, 0.1018 and 0.1163. Every other row reads as before; of the context rows, the take-off
acceleration falls from 2.36 to 2.33 m/s², the gear being down on the runway.

What changes in flight: with the gear down in CONF 1 to 3, 0.013 more drag than before; in CONF 3 with
the gear up, a go-around's configuration, 0.013 less. CONF 2's flaps and CONF 1+F's stay seeds, which
the take-off gradient tests (held out, above). What this leaves of the thrust session's list: ground
idle and reverse thrust are the world's and the crew's, not the airframe's; and the engine's spool-up
has no row yet. 14 CFR 33.73(b) gives its floor, 95 % of rated take-off thrust within 5 s of minimum
flight idle from a stabilized static condition, which needs the engine run in time; every thrust row
runs it to its steady state.

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

What the swap left open, the engines, was fitted next ([above](#its-engines-and-how-they-were-fitted)),
under the same rule: the table gained 24 engine rows, and our A320 is inside every one and every row
it was inside before, with the P6 gate and all thirty-seven `ctest` cases passing with either airframe,
the ILS starts of step 2 among them ([below](#a-runway-its-ils-and-the-wind-p7-step-2)). The landing
case runs 20 minutes since: the slower climb puts the first landing 35 s later.

## How it is built

| path | what |
|---|---|
| `CMakeLists.txt` | compiles the A32NX computers and JSBSim from their clones, the world once (`flight_world`) for both programs, and the tests |
| `harness/efcs.cpp` | the world adapter: `FlyByWireInterface`'s `updateElac`/`Sec`/`Fac`/`Fcdc` and `updateServoSolenoidStatus`, line for line, in the driver's order. Unchanged since P6 |
| `harness/world.cpp` | the world: the crew, the servos, the SFCCs' slats and flaps, the sensors |
| `harness/airframe.cpp` | the airframe: JSBSim loading the 737 from the clone or our A320 from this tree, the surfaces mapped into its frame, the thrust levers through each one's schedule, the state read back; and the bare airframe measured: its lift swept, its drag read, trimmed, its elevator pulsed, an engine run to a steady thrust, at a weight |
| `jsbsim/a32nx-surfaces.xml` | the JSBSim system that puts the A32NX servos in charge of either airframe's surfaces |
| `jsbsim/aircraft/A320-fit/A320-fit.xml` | our A320: geometry, mass, gear, 69 aerodynamic coefficients and its engines' 8 thrust numbers as named properties |
| `jsbsim/aircraft/A320-fit/seeds.csv` | each aerodynamic coefficient's seed, prior width, limits and source |
| `jsbsim/aircraft/A320-fit/Engines/CFM56-5A1-fit.xml` | its engines: CFM56_5's, with a take-off and idle thrust lapse of ours |
| `jsbsim/aircraft/A320-fit/thrust-seeds.csv` | the same for the thrust numbers, seeded from CFM56_5 and the harness's schedule |
| `jsbsim/aircraft/A320-fit/drag-seeds.csv` | the same for the drag of the landing flaps and the gear, moved from `seeds.csv` unchanged |
| `jsbsim/aircraft/A320-fit/poststall-seeds.csv` | the same for what lies past the stall: the pitch break, the tail's fade with alpha, the lift past the peak |
| `harness/main.cpp` | the runner: the non-finite scan, the law decoding, the gate, the expectations, the crash check |
| `harness/score.cpp` | the scorer: the airframe measured bare (lift sweeps, drag, the static pitching moment at 1 g, trims, a pitch pulse, thrust, gradients) and flown (the circuit), against the targets; the fit rows alone, with a cost, for the fitter |
| `harness/fit.cpp` | the fitter: CMA-ES over our A320's coefficients, with `--thrust` its engines', with `--poststall` what lies past its stall, with `--drag` the drag of its landing flaps and gear, each candidate scored by the scorer in a process of its own |
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
- thrust lever angle to throttle on a schedule, the CL, MCT and TOGA detents each a fraction of the
  way from idle to take-off thrust: for the 737 one of ours shaped like the A320's, CL 0.88 and MCT
  0.95; for our A320 its own, fitted with its engines, CL 0.831 and MCT 0.943.

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
  drives one spoiler pair; the adapter feeds zero there. Reported upstream as
  [flybywiresim/aircraft#11005](https://github.com/flybywiresim/aircraft/issues/11005).
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
  so. Reported upstream as
  [flybywiresim/aircraft#11006](https://github.com/flybywiresim/aircraft/issues/11006).
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
  Flared higher on the ILS, from 40 to 50 ft instead of 33, it landed harder and shorter on both.
- **JSBSim's initial condition and its dynamics take the wind with opposite signs.** The initial
  condition holds the airspeed as the ground velocity plus the wind (`FGInitialCondition::GetWindNEDFpsIC`
  is the airspeed vector less the ground velocity); the dynamics take it as the ground velocity less the
  wind (`FGAuxiliary`: `vAeroUVW = vUVW - Tl2b * TotalWindNED`). A wind set through the initial
  condition therefore starts the aircraft with its airspeed off by twice the wind: in a 15 kt crosswind
  ours started 28 kt slow and diving, and the 737 hit the ground in 29 s. An approach start trims in still
  air and then puts the wind into the atmosphere and onto the ground velocity together
  (`FGPropagate::SetUVW`), so the airspeed stays the trimmed one. Worth reporting upstream.
- **Windows' `cmd /c` strips the first and last quote of a line that holds more than two**, so a child
  process started with a quoted path and a quoted argument (`--scenario "approach;wind=227/15"`) loses
  both. The replay check gives it a pair of its own to strip.

From the thrust fit:

- **Aeromatic's turbofan barely lapses with speed.** JSBSim's CFM56_5 keeps 93 % of its static thrust
  at Mach 0.25, where Airbus's data for the same engine on the A320-211 give 79 % and Bartel and
  Young's model 77 %; its climb thrust ran 26 to 29 % above Airbus's below 10,000 ft. Aeromatic writes
  the same normalised tables for every turbofan: the 737's CFM56 reads the same 93 %.
- **ANP's take-off line is for flight.** Airbus's MaxTakeoff coefficients give 23,653 lb at zero
  speed, 5 % under the CFM56-5A1's certified 25,000: a regression over take-off speeds, not a static
  rating. The static row is the certificate's, the rows at speed ANP's.
- **Idle is below zero at speed.** ANP's idle thrust for the A320-211 crosses zero near 215 kt at
  5,000 ft, as a turbofan's ram drag outgrows its gross thrust. JSBSim's turbine takes a negative idle
  without complaint; Aeromatic's tables stop at zero.
- **A measurement can depend on the circuit's timing.** The cruise roll step reads the roll rate over
  its second second. Before the fit it began while the aircraft was still rolling out of the climb's
  last turn, and that flattered both roll rows; the fitted engines slowed the climb and the step now
  starts from rest. A step that waits for wings level would read the same whatever comes before it.
- **JSBSim looks for an aircraft's own engines first**, in its `Engines` folder, and an engine's
  functions can read one another through `propulsion/engine[#]/...`, `#` being the engine's number.
  Properties declared in the aircraft's `<propulsion>` are there before its engines load.
- **The fit repeats across compilers.** The aerodynamic fit took another path on GCC 13.3; the thrust
  fit, whose rows read only the engines, lands on the same eight numbers to the last printed digit on
  GCC as on MSVC, in 169 generations either way.

From the fit past the stall:

- **A static moment needs a static aeroplane.** JSBSim computes alpha's rate at an initial condition
  from the accelerations its forces give, so a pitching moment read at an alpha off 1 g carries the
  airframe's alpha-rate damping. The first fit, its moment read at 150 kt whatever the alpha, used that
  term as a lever, moving `cm-alphadot` to meet a row about the stall. The scorer now reads the moment
  in level flight at 1 g, the speed found from the lift twice over, with idle thrust's share across the
  flight path counted: at 15° in CONF FULL, with −40 per rad of damping, the lift balanced once left
  0.0006 of Cm, balanced twice without the thrust 0.0009, and with it 0.00001.
- **And an idle one.** A measurement that leaves the thrust levers where an earlier trim set them gives
  the next one thrust across the flight path at high alpha: the same row read 20.36° alone and 20.42°
  after the short-period trims. The static moment sets idle itself.
- **Our A320 does not overshoot its short period in CONF FULL near VLS**, within 12 s of a 2° pulse,
  so the extrema the clean row reads cannot see it. Equation error, a least-squares fit of alpha's and
  pitch rate's equations to the same pulse, reads 0.63 at 0.92 rad/s; where both readings work they
  agree within 0.07 of damping and 0.05 rad/s.
- **One row about the stall moved the pitch of normal flight** when the fitter was free to use it:
  with every coefficient a fit row answered to free, Cm_α went from −1.5 to −1.28 and four other pitch
  numbers moved, to meet `elevator-alpha-full`. The fit past the stall now holds them, as the thrust
  fit holds the aerodynamics.
- **NASA's TCM report gives a Generic Transport Model with numbers on its axes**, unlike the papers on
  the company data behind it, whose figures carry none: lift by flap setting to 85° and the pitching
  moment with the flaps up (NASA/TM-2011-217169, figures 33 and 34). Its moment was not corrected for
  Reynolds number where its lift was.

From the view and the replays, 2026-11-01:

- **A32NX's ARINC 429 words start as whatever the memory held** ([flybywiresim/aircraft#11007](https://github.com/flybywiresim/aircraft/issues/11007)).
  `Arinc429DiscreteWord` and `Arinc429NumericWord` have empty constructors, so a word built anywhere but
  in static storage starts with garbage: the bus the FCDC builds on the stack each tick
  (`Fcdc::getBusOutputs`, `FcdcBus output = {};`) carried it in the bits the FCDC never sets, and
  `setBit` converts that float to a `uint32_t`, undefined for garbage such as −1.46 (GCC's UBSan:
  `Arinc429.cpp:100`). A scripted run and its replay run different code before the call, so under GCC
  their FCDC buses differed from the ground check on: the touchdown was the same, the bytes not. MSVC
  carried garbage there too, the same in every run. `harness/arinc429.cpp` now implements their
  `Arinc429.h`, compiled in place of their `Arinc429.cpp`, with each word starting at zero — SSM
  FailureWarning, data 0.0, as a word in static storage does — and everything else as theirs, bit for
  bit; A32NX's files stay unmodified. The flight is unchanged; the digests, which hash every word the
  computers transmit, move:

  | digest, MSVC 19.44 | before | after |
  |---|---|---|
  | the A320's P6 gate, 30 min, the `reference` start | `8b900ac83924e845` | `b1937af96b0f1385` |
  | the 737's P6 gate, 30 min, the `reference` start | `ae72d18431512654` | `76c7767895d921d4` |
  | the 737's determinism case, 3 min | `79dd930cc06b6ef6` | `1b101f09cc662b7c` |

  It brought GCC 13.3 to parity as well. GCC's plain build had replayed the 18-minute circuit to the
  same touchdown but not the same bytes, even with the FCDC's bus alone built in zeroed storage
  (0dd0b59); with every word starting at zero it gives the same bytes, so some other word was built off
  leftover memory too. GCC now passes every case with either airframe, as MSVC does.

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

**The view.** three.js, drawn as a 1980s full-flight simulator drew it: fields, haze, dusk, night or
day, and the airport the flight is at, around the runway the flight core names (below). KDFW is drawn
whole from `web/data/kdfw.json`, validated on load: its seven runways where OurAirports puts them, with
the FAA's precision markings and lights — threshold stripes by width, touchdown zone, aiming point,
edge lights turning yellow and centreline lights red and white toward the end, ALSF-2 with its
sequenced flashers and a PAPI on each arrival end, set to the core's glide — a generic parallel taxiway
each, and its five terminals, central ramps and three towers where the FAA's airport diagram draws them
(`docs/provenance.md` §1f). Every light is one point whose colour, beam and flash the GPU decides from
the eye; a runway no airport file holds is drawn as an airport of one. The ground is laid in pieces no
longer than 150 m, the ramps' triangles cut as the rectangles' cells are, so that a curved earth bends it
rather than burying what lies across it. Over it, until P8 draws a PFD: a conformal horizon and pitch
ladder, the flight path, speed, altitude, V/S, radio height, heading, flaps, gear, and the ILS's
localizer and glideslope scales.

**Two tiers** (2026-11-01, from the visuals study the operator approved). Where a CPU draws every pixel —
SwiftShader, or WARP, what Chrome on Windows falls back to with no usable GPU — the page draws the view
above, unchanged: the floor, so the software budget cannot regress. Where a GPU draws, the same airport
is seen through one atmosphere (`web/src/atmosphere.js`: Rayleigh, Mie and ozone scattering marched into
a sky table) at any solar hour of 1 November, the haze over every surface, the country round DFW —
prairie and suburb, its lakes and the Trinity, the metroplex's street lights and freeways — and Dallas's
skyline, Reunion Tower's 259 lights among it (`web/data/dfw-region.json`, `dallas-skyline.json`;
`docs/provenance.md` §1g). `tier=low|high` overrides the choice; `time=` names an hour (dawn, day,
golden, dusk, night), `hour=` sets one, `[` and `]` move it. Both tiers draw the A320 outside
(`web/data/a320.json`, its points the airframe file's own, so its wheels touch where `ra_ft` reads zero,
every surface, the gear and the fans moved from the core's state), its flight deck at the file's
EYEPOINT with placeholder tubes until P8, ten cameras on keys 1 to 9 and 0 (V steps through them; the
overlay is drawn in the pilot's eye only), and a debrief on K: the flown path coloured by the gate's
bands, the ILS as a tunnel, every runway's outline and the aircraft in vectors, on black; L draws the
path in the normal view, and `trail=1`, `debrief=1` and `cam=` open the page on them. The floor builds the
A320, its deck and the debrief when a camera or the debrief first asks for them, one pause then; the GPU
tier builds them at the start. Before the flight's
clock starts the view is warmed — its shaders compiled, its geometry and textures sent, the GPU waited
for — so the first frame costs the flight no steps. Its `ctest` case,
`the_view_draws_the_flight_model_s_airframe_under_its_sun`, makes fifty-three native cases, all passing
with either airframe on MSVC 19.44.

As measured, 2026-11-01, headless Chrome at 1440 × 900, with the desktop's CPU sampled each second:

| what | result | desktop CPU |
|---|---|---|
| a tick in the page's worker, flat out | 117 µs, 171 × real time (79 to 117 µs over runs) | 65 % mean |
| 25 s in real time, from `file://` | all steps but those of the first frame | 65 % mean |
| a frame on the GPU (RTX 4070 Ti) | 6.9 ms median, 13.9 ms p99 | 77 % mean |
| a frame in software (SwiftShader), the default there: no antialiasing | 33 ms median (30 fps), 67 ms p99; the flight holds real time | 77 % mean |
| the same with antialiasing | 67 ms median | 77 % mean |
| a frame with KDFW drawn, lined up on 17C: on the GPU, on WARP, on SwiftShader | 7.4, 15.4 and 33.3 ms median: the floor as before | 64 % mean |
| the same 2.5 nm out on its approach, on WARP and on SwiftShader | 15.2 and 16.7 ms median | 64 % mean |
| the two tiers, lined up on 17C at dusk, 22 s: the GPU tier on the GPU (25 calls, 115,808 triangles, 59,799 lights); the floor on WARP and on SwiftShader (P7's 21 calls, 45,612 triangles, 6,322 lights) | 6.9, 13.9 and 33.4 ms median, 7.2, 55.4 and 66.7 ms p99; 0, 0 and 14 steps dropped, SwiftShader's all at its first frame, as before the tiers (10 to 24 there, with the desktop's load) | 2 to 25 % |
| the GPU tier forced onto WARP and SwiftShader (`tier=high`): why it is not the floor | 35 and 150 ms median | 6 to 27 % |

`web/tools/measure.mjs [--software | --warp]` repeats the frame measurements; WARP is what Chrome on
Windows now falls back to with no usable GPU. The 2014 reference laptop has not
been measured.

The page's own cases, in `ctest`: `the_page_clock_keeps_50_hz`, `the_hands_reach_the_controls`,
`the_view_puts_the_eye_where_the_flight_is`, `kdfw_is_laid_out_as_ourairports_and_the_faa_have_it`,
`the_view_draws_the_flight_model_s_airframe_under_its_sun` (the drawn airframe's points against
A320-fit.xml, the data files refusing a broken row by name, the sun setting at DFW on 1 November at
17:19 solar, the atmosphere finite and the low sun redder, the debrief's bands), and
in the WebAssembly build `the_browser_module_flies` —
the very file the page loads, in node: the scripted crew lands it at the native build's touchdown to the
printed digit (the A320 from KDFW 17C: 1,023.84 s, −143.5 fpm), and its inputs replayed into a second instance give the same
state on every tick. The suite's count is in the next section.

## Runways, the ILS and the wind (P7, step 2)

**The runways** are real ones. KDFW, Dallas/Fort Worth International, is the main airport by the
operator's decision (`ROADMAP.md` §9), and every flight starts there unless it asks otherwise: on the
gear on runway 17C, lined up 150 m past its threshold, or on 17C's ILS. 17C comes from OurAirports
(`harness/runway.cpp`, `docs/provenance.md` §1f): 13,400 × 150 ft, 180.3° true, 562 ft at both ends —
level, which the flat terrain here needs, and the runway DFW lands on in its usual south flow. Zurich's
runway 14, where step 2 began, stays as an alternative (`runway=LSZH14`). P6's start, 47 N 8 E at sea
level, stays as the `reference` scenario, and the airframe scorer measures there, so no fitted number
moves with the airport. **The ILS** on a runway is a textbook one, to ICAO's geometry: a 3° glide
crossing the threshold at 50 ft; full scale, two dots, 107 m either side of the centreline at the
threshold and 0.24 of the glide's angle above and below it. Readings take the earth's curve out. A
beam's deviation is where it lies from the aircraft, + right and + up, so flying toward the diamond
centres it.

**An approach start** puts the aircraft on it, in the air, trimmed by JSBSim, in CONF FULL with the gear
down: `law_harness --scenario "approach;distance=10;loc=0;gs=0;cas=140;wind=270/15;turbulence=0"`, with
`runway=LSZH14` for Zurich; the page's `?scenario=` and the C API's `flight_start_scenario` take the same
text. The wind is steady, from a true direction; turbulence is JSBSim's Tustin model at a MIL-F-8785C
severity, from a fixed seed.

**The scripted crew** flies it from 10 nm to a stop, raw data: the beams' deviations read as metres
with the distance, the track closing on the centreline over 20 s and the flight path on the glide over
10 s, the speed on the thrust levers at Vapp 140 kt; it flares as the circuit crew does and takes the
crab out with rudder in the last 15 ft. `--expect ils` judges it by the bands a hand-flown ILS will be
judged by (`ROADMAP.md`, P7), each band's worst printed with where it happened. Every start passes with
either airframe, and by 1,000 ft every start has converged, so the stabilised window reads the same
whatever the start. On KDFW 17C, the A320 on its fitted engines:

| airframe | starts | worst LOC, G/S | worst sink | speed | touchdown | off the centreline | sink at touchdown |
|---|---|---|---|---|---|---|---|
| A320 | on the beams; a dot left, right, low, high; 10 kt fast, slow | 0.01, 0.02 dots | 747 fpm | 140.0 kt | 328–329 m | +0.4 m | 155–158 fpm |
| A320 | 15 kt crosswind from 090, from 270 | 0.01, 0.02 dots | 743 fpm | 140.0 kt | 316 m | +0.3 to +0.4 m | 243 fpm |
| 737 | on the beams; a dot left, right, low, high; 10 kt fast, slow | 0.01, 0.05 dots | 747 fpm | 140.0 kt | 360–361 m | +0.3 m | 90–94 fpm |
| 737 | 15 kt crosswind from 090, from 270 | 0.01, 0.05 dots | 743 fpm | 140.0 kt | 354–355 m | −0.2 to +0.8 m | 111 fpm |

At LSZH 14 in a 15 kt crosswind from 227°: the A320 317 m and 240 fpm, the 737 357 m and 104 fpm.

**In light turbulence the crew is not robust.** From 18 starts per airframe at 17C (wind 250 to 290°,
11 to 19 kt, 9.5 to 10.5 nm), 10 of each broke a landing limit and 4 (A320) and 6 (737) landed hard; in
still air all 36 landed well. Which gusts a run meets is the standard library's: JSBSim draws them from
`std::default_random_engine` and `std::normal_distribution`, whose algorithms MSVC's library, libstdc++
and libc++ choose differently, so one seed flies different gusts on each (found by the thrust fit's
session; it is not, as this section said before, the last bit of the arithmetic). So
`ils_in_light_turbulence_reaches_the_runway` asks what holds on every start and every library: the gusts
are felt — the load factor strays 0.12 to 0.28 g from one on the approach, where still air leaves it at
0.00 and the case fails — normal law holds, and the aircraft touches down on the runway; its touchdown is
printed, not judged. The hand-flown gate is the operator's, and may be flown in calm air.

The page flies the same approaches: `index.html?scenario=approach` (add `&crew=script` to watch), with
the airport drawn around the runway the core names and the diamonds on the overlay. The browser's own
module lands the scripted crew in a 15 kt crosswind at the native build's touchdown, to the metre.

New `ctest` cases: `ils_on_the_beams`, `ils_a_dot_off_the_localizer`, `ils_a_dot_low` (an approach start
reads the beams where it asked, holds hands off); nine `ils_flown_` cases (the crew, judged by the
bands); `ils_in_light_turbulence_reaches_the_runway`; `ils_approach_replays_to_the_same_touchdown`.
The suite's count is in the next section.

## Failures, and the laws they leave (P7, step 3)

**The instructor's failures.** Any ADR or IR, any hydraulic system, either ELAC and any SEC can be
failed at a set time, from the scenario text the harness, the C API and the page all take —
`fail=adr1+adr2+adr3@300,green@420`, the units that fail together joined by `+`, failing that many
seconds after the start, or from it — or `law_harness --fail`. A failed ADR or IR transmits
FailureWarning on every word, as the real one does; a failed ELAC or SEC stops through its own
`faultActive`, as A32NX's failures stop it. A failed hydraulic system loses its pressure and with it
the servos, the THS motor, the yaw damper and the slat and flap motors it drives, counted as A32NX's
computers count them: ELAC 1's aileron servos blue on the left and green on the right, ELAC 2's the
other way round; the elevators' servos blue for ELAC 1 and SEC 1, green on the left and yellow on the
right for ELAC 2 and SEC 2; spoilers 1 and 5 green, 2 and 4 yellow, 3 blue; the THS on green and
yellow, the slats on green and blue, the flaps on green and yellow, at half speed on one. The gear,
the brakes and the nose wheel steering are not yet tied to their systems. The computers decide the law;
the harness only reads it from the FCDC.

**A pitch trim wheel.** In direct law nothing trims: the PFD says USE MAN PITCH TRIM. The wheel is a
crew input, the core's `pitch_trim`; it moves the THS through its hydraulic motors, with priority over
the computers' motors, at 0.5°/s turned briskly — an estimate — and half that on one motor. The page
turns it with Home (nose down) and End (nose up), or with joystick buttons mapped to it.

**The scripted crew in direct law** flies as a pilot does there. Its loops fly the stick as in normal
law; in direct law the stick asks for elevator instead of load factor, near enough the same at
approach speeds, so the paths hold, only off by what is out of trim. So the hand trims: once it has
held a pull or a push for a few seconds it turns the wheel against it, faster the more it holds,
never in the flare — the wheel is the integrator the loops lack — and with one elevator left it moves
the stick twice as far. A first try, the hand holding the load factor normal law would have asked for,
diverged in a pitch oscillation of eight seconds and was dropped.

**What A32NX's computers choose**, the KDFW circuit flown with the failure at 300 s, in the cruise,
the same with either airframe:

| failure | pitch law in flight | lateral law | with the gear down |
|---|---|---|---|
| any one unit, of any kind | normal | normal | normal |
| ADR 1+2, IR 1+2, ELAC 1+2, hydraulics blue+yellow | alternate 1 | direct | direct |
| SEC 1+2, or all three | alternate 1 | direct | direct, on the flaps a second later |
| ADR 1+2+3 | alternate 2 | direct | direct |
| IR 1+2+3 | direct | direct | direct |

A32NX's ELAC makes the lateral law direct whenever pitch leaves normal law (`ElacComputer.cpp`:1028),
and every alternate law direct once the gear is down; with both SECs lost it cannot see the gear,
which reaches it through them, and goes direct on the flap position instead. Failures interact: green
with ELAC 1 leaves alternate 1, the left elevator having lost both its servos. Green with blue (no
ailerons, the slats jammed) and green with yellow (no THS, the flaps jammed) are emergencies beyond
this scripted crew, which flies a fixed 140 kt: it does not land them, and no case asks it to.

Every degraded case is flown to a landing, judged as any other: the A320 at 155 fpm, 5.0° of pitch and
1.43 g, the 737 at 55 to 59 fpm. Before the trim wheel the crew landed the three-ADR case at 564 fpm
and 2.87 g and bounced, having flown the approach 1.75° steep on an untrimmed elevator. A direct-law
flight, the wheel turned by hand, replays to the same bytes. Healthy flights are byte for byte as
before.

New `ctest` cases: nine `laws_` cases — `--expect laws=PITCH/LATERAL[,PITCH]`, the laws held from five
seconds after the failure until the crew configures to land, and once the gear is down, then the
landing — and `laws_three_irs_replays_to_the_same_touchdown`. The suite's count is in the next section.

## The protections (P7, step 4)

**A start in the air** — `air;alt=FT;cas=KT;lever=N;manoeuvre=NAME`, 10,000 ft and 250 kt clean unless
said, level over the runway's threshold and trimmed — in the harness, the C API and the page. The
scripted crew flies the manoeuvre as a test pilot flies a protection: 20 s level, then the input held to
the stop, then let go, then level flight where it began. `bank`: full right stick for 20 s, the altitude
held; `pull` and `push`: full back stick for 20 s or forward for 8, the thrust where it was; `alpha`: idle
from 20 s, the altitude held as the speed decays into the protection, then full back stick for 20 s, let
go with TOGA as alpha floor would have set it (that waits for the autothrust, P9); `speed`: full forward
stick for 40 s from 320 kt at 15,000 ft. The page flies the same start with the crew's hands or a
person's: `index.html?scenario=air;alt=10000;cas=250`.

**A fix on the way.** A start in the air with the gear up first held A32NX's ELAC on the ground: JSBSim
updates a gear's weight on wheels only while it is down, and a gear retracted from the start kept the
gear compressed, so the LGCIUs told the ELAC it was on the ground at 10,000 ft. It reported normal law
and flew the stick to the surfaces, 30°/s of roll at full stick and no protections. A gear now reports
weight on wheels only while it is down; no earlier flight changes.

**What is judged.** `--expect protection` judges each manoeuvre against the A320's published limits —
load factor +2.5/−1 g clean and +2/0 g with flaps, pitch +30° (25° in CONF FULL) and −15°, bank 67°
and 33° once let go — and the ELAC's own numbers (A32NX 66021c2): alpha max 8.7° clean below Mach 0.5,
the airframe's stall 1° above it (`targets/a320.csv`); high-speed protection engaging at VMO, 350 kt, or
MMO, 0.82, and holding at 380 kt or Mach 0.88 at most. What holds is judged; what does not hold yet, or
rests on what the airframe has not been fitted to, is printed as a note with its limit. The fitted A320,
in normal law throughout, since what lies past its stall was fitted
([above](#past-the-stall-and-how-it-was-fitted)), with what it read before in brackets where that moved:

| manoeuvre | judged | noted, not judged yet |
|---|---|---|
| bank | stops at 65.7° against 67°; 2.09 g (2.17) | let go, 26.4° (26.5°) after 20 s where the FCOM says 33° |
| pull, 250 kt clean | 2.09 g (2.14) against 2.5; pitch 27.5° (23.7°) against 30° | alpha 11.5° (13.5°) against alpha max 8.7° |
| push | −1.07 g against −1.0 (+0.1 allowed) | pitch −17.7° against −15° |
| alpha, slowed at idle | full back stick holds 8.7° (8.9°) against alpha max 8.7°, 8.4° at the end; no stall | let go with TOGA, 8.6° 10 s later where alpha prot is 6.5° |
| speed, 15,000 ft | past VMO, where it engages | 381.3 kt at most against the ELAC's 380 |

Why the notes are not judged. At 250 kt and 10,000 ft, Mach 0.45, the fitted A320 ran out of lift near
2 g before its stall was fitted — 11.9° of alpha for 1.96 g in a steady pull — where the real one
reaches 2.5 g with margin: the
fit covers the stall at low Mach (VS1g and alpha max) and nothing measures it at Mach 0.45, so a full
pull there passes alpha max before the protection brings it back, as the airframe stalls under it.
High speed rests on the transonic pitching moment and drag rise, which no target measures either. The
bank's return to 26.5° rather than 33° and the slow return from alpha max after letting go are the
computers' and the airframe's together, not yet separated. And one finding at low Mach, inside the fit,
not registered as a case: a full pull in CONF FULL at 150 kt holds 1.80 g against 2.0, but its pitch
reaches 27.3° against 25° and its alpha 20.4° against alpha max 13.0 — the high-AoA protection does not
hold a fast entry there. Traced through both ELACs, it is an oscillation, and the ELAC's own:

- What the ELAC is given is faithful. Its ADRs carry the airframe's alpha within a step, as A32NX's
  own ADIRS passes the simulator's `INCIDENCE ALPHA` through unfiltered (`adirs.rs`), and the elevator
  goes where the ELAC orders it.
- A32NX's ELAC passes alpha through a first-order lag of 2 s (`ElacComputer.cpp`, `LagFilter_C1` = 0.5)
  and its pitch law flies that lagged alpha, both to engage the protection and to hold alpha in it
  (`PitchNormalLaw`'s `In_alpha_deg`, which the law lags again by 0.625 s). From 150 kt, full back stick
  takes alpha to 17° before the lagged alpha reaches alpha prot, 10.6°; the protection then pushes on
  stale alpha while alpha falls to −4°, and pulls again, late again, to 20.4°, about every 9 s.
- The lag is what keeps it swinging, tested directly. The airframe fit that followed could not stop it
  with any setting inside its cited bands (the first overshoot stayed at 15.3° to 16.7°). In a throwaway
  copy of the A32NX sources with `LagFilter_C1` alone set to 5, a 0.2 s lag, the same pull on our A320
  engages the protection at 12° rather than 17° and settles toward alpha max within the hold — 10.5° to
  13.5° in its last 5 s, where the 2 s lag still swings between 5° and 17°. The first overshoot is not
  the lag's: it stays near 17°. The 737, which under the 2 s lag overshoots to 19.5° and settles, peaks
  lower with the shorter lag, at 16.6°, but swings longer after it.

Entered slowly, at idle from 150 kt, full back stick holds 12.1° to 13.8° of alpha against 13.0, without
a stall. For the gate: a normal approach and flare reach 8.3° of alpha, 2.3° short of alpha prot, but a
hard pull to full back stick near the ground can take our A320 past its stall, 14°. For A32NX upstream, the
question is posted (`flight/upstream-reports.md`, §4;
[flybywiresim/aircraft discussion #11009](https://github.com/flybywiresim/aircraft/discussions/11009)):
whether the protection should act on an alpha lagged by 2 s.

New `ctest` cases, judged on the product airframe, our A320, whatever `FLIGHT_AIRFRAME` the suite runs
with: `protection_full_stick_bank_stops_at_67_deg`, `protection_full_pull_inside_2_5_g_and_30_deg`,
`protection_full_push_inside_minus_1_g`, `protection_alpha_max_held_without_a_stall`. The suite's count is in
the next section.

## The gate's judge (P7, preparing the gate)

**One judge.** The bands of *How a hand-flown ILS is judged* (`ROADMAP.md`, P7) are judged by one piece
of code, `harness/judge.h`, which the flight core keeps and observes after every step. The harness's
`--expect ils` prints its verdict; the browser reads the same verdict through the C API; and a
recording, replayed, meets the same judge. It watches an approach start from 1,000 ft above the
threshold to 50 ft — localizer and glideslope within a dot, sink rate under 1,000 fpm, gear down and
CONF FULL, speed within Vapp −5/+10 kt, bank within 7° — then the touchdown — sink under 360 fpm, load
factor under 2.6 g, pitch 0 to 10°, 300 to 900 m past the threshold, within 5 m of the centreline —
the rollout, within 5 m of it to the stop, and no bounce. Each band reports its worst and the height
or the distance where it happened. *Stable* is every band held, once the aircraft has stopped.

**Vapp** is Airbus's on the A320: the FAC's VLS + 5 kt — 134 kt on the approach start's 65 t, its VLS
128.6 kt at 1,000 ft. A32NX's FAC sends no VLS for the first 10 s of a flight, then sits on its 116 kt floor
while it ramps its VS1g factor up from nothing at 0.1 a second, and reaches its value about 21 s in; so the
judge has no Vapp until the VLS has settled — held within 0.2 kt for 3 s, or for 13 s on the floor, the
longest that ramp can last — then follows it until the window opens and keeps it from there, or from its
settling if the window opened first, as it does from 3.5 nm. The speed is held to Vapp from the moment it
is fixed, in the verdict and in the in-band slot alike, so the debrief's trail and the verdict agree; a
window flown with no Vapp at all fails the speed band, saying why. On the 737
the FAC computes an A320's VLS, which sits on its floor at the 737's 48.5 t, so the 737 keeps the scripted
crew's 140 kt; the airframe table says whose speeds the FAC's are. The scripted crew flies 140 kt either
way, 6.4 kt over the A320's Vapp, inside the band.

**Through the C API**, for the page: `flight_debrief()` gives the verdict as text, a line a band —
`pass`, `FAIL`, or `....` while it cannot be judged yet — then STABLE, NOT STABLE or flying; and the
state carries `vls_kn` and `vapp_kn`, the target the pilot flies; `judge_window` and `judge_in_bands`,
whether this step is inside the window and inside every band of it, for a debrief that colours the
flown trail; `judge_stable`, the verdict once stopped; and `judge_touchdown_m`.

**Recordings replay by themselves.** A recording now begins `# scenario: <text>` and
`# airframe: <a320|737>`, above its columns, so `law_harness --replay approach.csv` needs nothing else:
it takes both from the file, refuses a `--scenario` or `FLIGHT_AIRFRAME` that disagrees, and runs as
long as the recording does. Every run with an approach ends with the judge's line,
`judge: STABLE, touchdown 328.2 m past the threshold`, and the replay check now gives its replay only
the file and asks for the same verdict as well as the same bytes.

**Repeatable.** `law_harness --repeatable a.csv b.csv c.csv d.csv e.csv` is the gate's last rule: each
recording replayed in a fresh process and judged, five of them, each stable, their touchdown points
within 150 m of their mean. `--check-repeatable` applies it to the scripted crew, five approaches
recorded from varied starts — on the beams, a dot either side of the localizer and of the glideslope:
all five STABLE, their touchdowns within a metre of their mean: 329 m past the threshold on the A320, 361 m on the 737.

**Measured with it.** Nobody flying, the trimmed aircraft drifts off the beams and never flares: the A320
lands at 651 fpm and 2.8 g, 1,613 m past the threshold and 140 m right of the centreline, and the judge
names the seven bands it broke.

**The page's half.** The browser's module records the flight as it flies it: `CoreSession` keeps the inputs
that flew each step — the caller's, or the scripted crew's, stepped a tick at a time — and `recording()`
gives them as `law_harness --replay` reads them, the scenario and the airframe (`flight_airframe()`, the
default resolved) above the columns. The worker puts the judge's text on every message, `debrief`, and
answers `{type: 'recording'}` at any time; `Flight.recording()` is its promise on the page's side. A
recording says who flew it: `# crew: script` for the scripted crew (the page's `crew=script`, and every
`law_harness --record`), `# crew: hands` for a person at the page's controls, with the device and the
wall-clock time the page adds (`# hands:`, `# flown:`). `--repeatable` takes only hand-flown approaches for
the gate, five different flights (a recording given twice is refused), and prints who flew each;
`--check-repeatable`, on the scripted crew's five, also checks that the gate would refuse them as
hand-flown. A recording made in the module replays into a fresh one to the same state and the same
verdict, and the native build judges it alike: the scripted crew's approach from a dot left, flown in the
module and saved, is STABLE with its touchdown 328.9 m past the threshold in both. The pilot's eye is the
airframe's own: the core reports the definition's EYEPOINT from the CG (`eye_fwd_m`, `eye_right_m`,
`eye_up_m`) and the CG's height on the gear (`cg_height_m`), and the eye camera, the PAPI and the overlay
stand there — on the A320, 4.69 m above the runway and 0.51 m left of the centreline, the left seat.

**The page's half** (2026-11-01). The overlay shows `vapp_kn` in magenta under the speed, `VAPP`, once
the core has one, and the flight deck's placeholder PFD puts its bug there. When `judge_stable` is set
a panel shows the verdict as `flight_debrief()` words it (until the worker passes those words on, the
same verdict from the state's slots). Ctrl+S, or the panel's button, saves the worker's recording as it
stands — the file `law_harness --replay` judges, the one a pilot hands in — named
`a32x-<airframe>-<scenario, or the runway>-<seconds>s.csv`, letters, digits, `.`, `_` and `-` only; a
worker that keeps none says so in the status line. The debrief's flown path (K, L) is coloured by
`judge_in_bands` itself: green inside every band, red out, grey outside the window. And the page's
clock now starts at the worker's first answer, not its first frame: a fresh core's first steps are slow,
and their time is not the flight's. A new case, `a_saved_recording_is_one_file_named_for_its_flight`,
makes fifty-eight native cases, all passing with either airframe on MSVC 19.44.

**The debrief's log** (`web/src/events.js`). Under the verdict, the panel lists the flight's moments,
each found from the core's own slots: the 1,000, 500, 100 and 50 ft gates above the threshold, each
with the speed against Vapp, the sink, where the aircraft stood on the beams (left or right of the
localizer, low or high on the glideslope) and the bank; leaving the gate's bands and coming back, as
`judge_in_bands` has it; the gear and the flight laws as they change; the touchdown at the judge's own
distance, a bounce, 80 kt and the stop, each with how far past the threshold; then the verdict. A
crossing's time is interpolated between the samples either side of it, so it does not depend on the
frame rate. In the debrief (K) the panel is open as the flight goes, and the moments are tagged on the
flown path where they happened. Its case, `the_debrief_logs_the_flight_s_moments_from_the_core_s_slots`,
states the times for an approach sampled three ways.

**Flying the gate.** Five consecutive approaches, flown by hand in the browser with a joystick, each
stable, their touchdowns within 150 m of their mean (`ROADMAP.md`, P7). For each:

1. Open the page on the ILS, `index.html?scenario=approach`: 10 nm out on KDFW 17C's localizer and
   glideslope, at 140 kt in CONF FULL with the gear down, trimmed, in still air. A new approach is a new
   page: reload.
2. Press a button on the joystick to take it; M maps it to the controls and C calibrates it, and the
   mapping is kept for the next time. H lists every key.
3. Fly the ILS by hand to a stop on the runway. The magenta VAPP mark under the speed comes about 24 s
   after the start, once the FAC's VLS has settled: 134 kt. From 1,000 ft keep the localizer and the
   glideslope within a dot, the speed within −5/+10 kt of the mark on the thrust levers, the sink under
   1,000 fpm and the bank within 7°; then flare, touch down 300 to 900 m past the threshold within 5 m of
   the centreline, and roll out on it to a stop on the brakes (B).
4. At the stop the page shows the judge's verdict, band by band. Ctrl+S, or the panel's button, saves the
   recording, named for the airframe, the scenario and the minute it was flown, so five saved in a row
   sort in the order flown. Save every approach, stable or not: the gate takes five consecutive ones.

Then the five are judged from their recordings, natively: `law_harness --repeatable a.csv b.csv c.csv
d.csv e.csv` replays each in a fresh process and judges it as the page did; each must have been flown by
hand in the page, the five must be different flights, each stable, their touchdowns within 150 m of their
mean. One caution, from step 4: near the ground in CONF FULL, a sudden pull to full back stick can take
this A320 past alpha max — A32NX's ELAC flies its protection on a lagged alpha, and our airframe's pitch at
high alpha is not yet fitted — where a real A320 would hold it. Flare as on the line, progressively. And the
five measure the handling of the airframe they are flown on: if the airframe fit (its own lane, CONF FULL's
pitch response first) swaps the default airframe afterwards, P7 is not called passed until they are flown
again on the one that ships.

New `ctest` cases: `the_judge_finds_the_scripted_approach_stable`,
`the_judge_finds_an_unflared_approach_not_stable`, `the_judge_has_nothing_to_judge_on_the_runway` and
`the_judge_waits_for_the_fac_s_vls_on_a_short_approach`, through the C API, natively and under node;
`five_scripted_approaches_are_repeatable`. Sixty-one native cases pass with either airframe on MSVC 19.44
and on GCC 13.3; fifty-six under node, the WebAssembly build leaving out the five that start processes.

## The Windows release (P7, packaging)

The packaging the operator decided on 2026-11-01 (`ROADMAP.md`, *Decisions*), built for Windows first:
a zip with a launcher, and its Corresponding Source beside it. Nothing is published.

```
cd flight/web && npm ci
npm run release -- --a32nx <A32NX clone> --jsbsim <JSBSim clone>    # or A32NX_DIR and JSBSIM_DIR
npm run release:gate                                                 # the release, then its gate
```

`flight/dist/` gets `a32x-sim-0.1.0-win64.zip`, `a32x-sim-0.1.0-source.zip` and `SHA256SUMS`.

| path | what |
|---|---|
| `launcher/` | `A32X.exe`: opens `web\index.html`, beside it, in Microsoft Edge as an app window (`--app=<file URL>`), or in the default browser through ShellExecute when there is no Edge; `--trainer` opens the trainer's page; a missing page is a message box. MSVC with the static CRT: it imports KERNEL32, USER32, SHELL32, ADVAPI32 and OLE32 and nothing else, asks for no administrator, and builds to the same bytes in any folder (`/Brepro`, no debug information). `--print-url` prints the URL and the command that would open it and starts nothing, for the gate. Its own `ctest` |
| `web/tools/release.mjs` | the release step |
| `web/tools/release-contents.mjs` | what each archive holds and must say: the explicit file lists, the notices and the text each must carry, the archives themselves |
| `web/tools/verify-release.mjs` | the gate |
| `web/tools/pe.mjs` | a Windows program's machine, imports and hardening flags, read from its image |
| `web/release/` | the two READMEs and the airport data's public-domain note |

**The source archive comes first, from git's objects.** This repository at HEAD (a tracked file that
differs from HEAD refuses the release); A32NX at `66021c2`, the code that is compiled
(`fbw-a32nx/src/wasm/fbw_a320/`) and the licence, not the other 1.4 GB of that repository; JSBSim at
`66f7faf`, whole; and the three.js files the page bundles, as npm installed them. Each upstream folder
holds a `SOURCE-COMMIT`, which `CMakeLists.txt` reads where an export has no `.git` to ask. **Everything
that ships is then built from that archive, unzipped outside the repository:** the module in WSL by
Emscripten 6.0.12 (emsdk `35ff8a6`, both checked), which `the_browser_module_flies` then flies; the page
by esbuild, its three.js files compared with the archive's; `A32X.exe` by MSVC, with its test; the
trainer by P5's own packager, once its committed bundle is shown to be what its source builds. The
archive is the source of the shipped bytes by construction.

**What it refuses**: a file off the explicit list or missing from it; a notice that does not carry its
licence's text (GPLv3; A32NX's GPLv3 and commit; JSBSim's LGPL-2.1, commit and authors; the embedded
aircraft and engine files' headers; Emscripten's, musl's, libc++'s, libc++abi's, libunwind's and
compiler-rt's licences, dlmalloc's dedication; three.js's MIT and the licence comment esbuild keeps in
`flight.js`; the airport data's sources; the trainer's MIT); a system library the module links whose
licence it does not know, read off a verbose relink; esbuild's runtime helpers in a bundle; a page that
points at a file that does not ship; a placeholder left in a README; a launcher that imports a DLL
Windows does not ship; a file that names a path of the machine that built it.
`the_release_refuses_to_ship_without_its_notices` (`web/test/release.test.mjs`) shows each refusal on
stand-ins.

**Deterministic**: the same commit gives the same bytes. The module's `__DATE__`, which JSBSim prints in
its version string, is the commit's time through `SOURCE_DATE_EPOCH`. Zip entries are dated 1980, as P5
dates its zip: a zip stores no time zone, so the commit's own time unzips hours in the future west of
Greenwich, and there Ninja regenerates its build forever. That was found in WSL, which keeps Chicago's
time; the release's own extractions are dated when written, whatever the archive says.

As measured, 2026-11-01, by `npm run release:gate` on this release's code atop master's `f9c9c3c`, the
desktop's processors 75 % busy on average during the release and 58 % during the gate:

| what | result |
|---|---|
| the release | 109 s: the module 92.0 s from scratch, the page 4.0 s, `A32X.exe` 4.8 s, the trainer 1.8 s |
| `a32x-sim-0.1.0-win64.zip` | 1,106,931 bytes, 25 files |
| `a32x-sim-0.1.0-source.zip` | 31,370,192 bytes, 1,694 files; JSBSim is 50 MB of them unpacked |
| (a) the page from `file://`, network off | Chrome 148 and Edge 156, two loads each, the GPU tier: 15.00 to 15.02 s simulated in 15.01 s, no step dropped as it started or in flight, a tick 0.4 to 0.7 ms on average and 9.6 ms at worst, 143 frames a second; nothing thrown in the page or its worker; it read `index.html`, `core.js`, `flight.js` and its own Blob, nothing else; the trainer beside it loaded and ran |
| (b) `A32X.exe --print-url` | names `web\index.html` and `trainer\index.html` as Node writes their file URLs; a missing page refused on stderr, no window; imports only Windows' DLLs |
| (c) the source archive, MSVC 19.44 | configured against its own upstream folders, no clone and no git; built in 46 s; `ctest` 58 of 58 with our A320 and 58 of 58 with the 737; the launcher's test; `A32X.exe` built from it the same bytes as the one shipped |
| the same commit, twice | two releases of one commit (atop master's `052f872`), each built in folders of its own, the module in WSL and `A32X.exe` by MSVC: the same bytes, both archives |

The gate counts steps dropped as the page starts, while its first frames compile the view, apart from
those dropped in flight. On the page as it stood at `853802a`, before the view's later work, every load
dropped 4 to 7 steps at simulated time zero; one load in Edge also dropped a step in flight, when a
single tick took 64 ms with the desktop 56 % busy. On the commit released twice, with the desktop 91 %
busy, two of four loads fell behind real time, one of them on a single tick of 1.55 s; run again at 53 %,
all four held it with no step dropped. A gate run on a busy desktop can fail that check for the desktop's sake: run it
again, and record the load.

Found on the way: Node 24.16 on Windows corrupts its own heap (exit `0xC0000374`) decoding UTF-16 from a
`Buffer` that starts at an odd offset, as `git cat-file --batch`'s blobs did; the release searches for
UTF-16 paths byte by byte instead.

## What P7 still has to build

`ROADMAP.md` §4, *P7 in detail*: the gate — a hand-flown ILS, stable and repeatable, with its measures
and bands written down. Its judge, its recordings, its repeatability and the page's half are built
(above, with the runbook in *Flying the gate*); five approaches flown by hand remain, the operator's. The browser steps (5 to 8), the runway, ILS and wind (step 2), the failures and
their laws (step 3) and the protections (step 4) are above, with what step 4 leaves open: the airframe's
stall above Mach 0.3 and its transonic aerodynamics, to be fitted, and a fast entry into high alpha in
CONF FULL, which fitting the airframe past its stall did not cure. Our fitted A320 flies all of it from
here, its engines fitted too ([above](#its-engines-and-how-they-were-fitted)), and what lies past its
stall ([above](#past-the-stall-and-how-it-was-fitted)).

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
