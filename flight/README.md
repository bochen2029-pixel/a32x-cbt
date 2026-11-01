# flight/ — the aeroplane that flies

GPLv3. This tree links the FlyByWire A32NX flight computers, which forces the licence on everything
here. `app/` stays clear of it.

**P6 passed.** The A32NX flight control computers — ELAC 1–2, SEC 1–3, FAC 1–2, FCDC 1–2, unmodified —
run at 50 Hz against a stub world for thirty simulated minutes with every output finite, every computer
healthy, and normal law held throughout settled flight. Nothing flies for real yet: the world around
them is a stub until P7 puts JSBSim there.

## Build and run

You need a C++17 compiler, CMake 3.20+, and the A32NX sources (below).

```
cmake -S flight -B flight/build -DA32NX_DIR=<path to the A32NX clone>
cmake --build flight/build --config Release
ctest --test-dir flight/build -C Release --output-on-failure
```

The build compiles the upstream sources where they stand and refuses any commit but `66021c2`. Run
`flight/build/Release/law_harness --help` for the options; `--minutes 30 --gate` is the P6 gate and
`--trace run.csv` writes the flight twice a second.

## The P6 gate, as measured

`law_harness --minutes 30 --gate`, MSVC 19.44 (Visual Studio 2022) on Windows 11, 2026-11-01:

```
90000 ticks = 1800.0 simulated s in 1.02 wall s (1758x real time)
flight: 1 touchdowns; altitude 0..8051 ft, pitch -2.4..18.3 deg, bank -46.0..40.8 deg, load 0.48..1.50 g
laws in settled flight (1512 s): pitch-normal 100.0% lateral-normal 100.0%
non-finite outputs: 0 of 20520000 values checked
  pass  thirty minutes at 50 Hz - 90000 ticks of 20 ms
  pass  no NaN or infinity on any output, any tick - 20520000 values checked
  pass  the stub world stayed finite
  pass  every computer healthy once up, to the end - healthy from 2.02 s; 0 unhealthy ticks after
  pass  normal law in pitch and roll throughout settled flight - pitch 100.00 %, lateral 100.00 % of 1512 s
  pass  a whole circuit flown: up, around, down - 1 touchdowns
  pass  the surfaces actually moved - elevator -30.0..17.0, aileron -25.0..25.0 deg
```

GCC 13.3 on Ubuntu 24.04 gives the same verdicts. Eight `ctest` cases hold the parts the gate leans
on, two of them negative controls that show the gate's checks can fail:

| case | what it shows |
|---|---|
| `p6_gate_30_minutes` | the gate above |
| `deterministic` | two fresh processes, same bytes from every computer, every tick |
| `computers_come_up` | dark before the FLT CTL pushbuttons, all nine healthy 1.02 s after them |
| `ground_check_moves_surfaces` | full pull −30°, full push +17° of elevator; roll ±25° of aileron |
| `normal_law_in_flight` | normal law in pitch and roll for all of settled flight |
| `stick_flies_the_aircraft` | a 0.5 pull gives +2.9°/s and 1.5 g; the push −3.6°/s |
| `scanner_catches_a_planted_nan` | a NaN or infinity in an ELAC bus, a SEC analogue, a FAC bus and an FCDC bus — four of four caught |
| `losing_all_air_data_ends_normal_law` | all three ADRs failed in flight: the laws go to alternate 2 and stay there |

Same binary, same bytes. Different compilers give different bytes — their maths libraries round
differently — and the same verdicts.

## How it is built

| path | what |
|---|---|
| `CMakeLists.txt` | compiles the upstream computers into a library, our harness against it, and the tests |
| `harness/efcs.cpp` | the world adapter: `FlyByWireInterface`'s `updateElac`/`Sec`/`Fac`/`Fcdc` and `updateServoSolenoidStatus`, line for line, in the driver's order |
| `harness/world.cpp` | the stub world: sensors, servos, a small airframe, a scripted crew |
| `harness/main.cpp` | the runner: the non-finite scan, the law decoding, the gate, the expectations |

**The adapter keeps the aircraft's staleness.** Each computer reads the others' last outputs when its
turn comes, in the order ELAC 1, 2 → SEC 1, 2, 3 → FAC 1, 2 → FCDC 1, 2. So ELAC 1 sees ELAC 2 a tick
late, ELAC 2 sees ELAC 1 the same tick, and every ELAC sees SEC, FAC and FCDC a tick late.

**The laws are read the way the aircraft reads them**: from the FCDC's EFCS status word 1 (pitch law
bits 11–15, lateral 16–17), not from the computers' insides.

**The NaN scan needs no field list.** Every output bus is whole ARINC 429 words and every analogue
block whole doubles — asserted at compile time — so the scan covers all of them, every tick.

**The stub world is not aerodynamics.** Sensors are transmitted as the A32NX producers transmit them
(`adirs.rs`, `landing_gear/mod.rs`, `sfcc/mod.rs`: standard signs, accelerometers that include
gravity, discrete bits where the producers put them). Servos follow orders at a finite rate. The
airframe is a point mass with a short-period pitch response, a first-order roll response and
coordinated turns: enough to close the loop around the laws, not A320 data. Rudder and sideslip are
not modelled. A scripted crew flies a circuit — power-up, flight control check, takeoff, climb, turns,
a doublet, a 45° steep turn, speedbrake, approach in CONF FULL, flare, ground spoilers, rollout — and
goes round again until the run ends. The FMGC is a stub that reports weight, CG and autopilot off.

## Findings

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

## What P7 has to build

Replace the stub airframe in `harness/world.cpp` with JSBSim: the computers, the adapter and the gate
stay as they are, and the stub's sensors and servos become JSBSim's. The P7 gate is a hand-flown ILS,
stable and repeatable — which needs a pilot's hands on it: see `ROADMAP.md` for the joystick and the
visual scene.

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

The clone this was built against: `66021c24448c44399a8ff569eb14715b6b26558e` (2026-10-28). Fetch that
commit alone rather than `--depth 1 --branch master`, which stops working the day master moves past
the pin:

```
git init ../a32nx
git -C ../a32nx remote add origin https://github.com/flybywiresim/aircraft.git
git -C ../a32nx fetch --depth 1 origin 66021c24448c44399a8ff569eb14715b6b26558e
git -C ../a32nx checkout FETCH_HEAD
```

This recipe was not exercised when P6 was built; the clone used then already existed.

They are **not vendored here.** `bus.h` and the contract documents are derived artefacts — keep them
in sync by hand if the upstream commit ever moves, and re-run `compile_probe.cpp` when you do.

## Licence

Everything here is GPLv3, including the derived `bus.h` and the harness. Ship source. The upstream
notices are in the A32NX clone, not here; keep them when you redistribute.
