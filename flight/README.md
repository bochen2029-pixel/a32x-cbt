# flight/ — the aeroplane that flies

GPLv3. This tree links the FlyByWire A32NX flight computers, which forces the licence on everything
here. `app/` stays clear of it.

**P6 passed; P7 has started.** The A32NX flight control computers — ELAC 1–2, SEC 1–3, FAC 1–2,
FCDC 1–2, unmodified — run at 50 Hz in a world whose airframe is JSBSim's 737. A scripted crew flies
it through them from the runway, round a circuit and back onto the runway, headless, in normal law.
The airframe is A320-class, not an A320: `docs/provenance.md` says why it is not JSBSim's A320. P6
passed against a point-mass stub; the same gate, unchanged, passes against JSBSim.

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
`--trace run.csv` writes the flight twice a second.

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
10 µs a frame. GCC 13.3 on Ubuntu 24.04 (WSL) gives the same verdicts and the same flight in 5.1 s,
load not sampled. Same binary, same bytes; different compilers give different bytes, and the same
verdicts.

Eleven `ctest` cases hold the parts the gate leans on and what the airframe adds. Two are negative
controls that show the gate's checks can fail; two of the airframe's were shown able to fail by hand:
reverse the yaw damper's sign and the aircraft departs and flies into the ground 40 s after liftoff;
reverse the THS's and the stabiliser runs to its stop while the elevator holds 24° against it.

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
| `lands_inside_the_limits` | the first landing: −170 fpm, 3.7° of pitch, wings level, 1.80 g, no bounce |
| `scanner_catches_a_planted_nan` | a NaN or infinity in an ELAC bus, a SEC analogue, a FAC bus and an FCDC bus — four of four caught |
| `losing_all_air_data_ends_normal_law` | all three ADRs failed in flight: the laws go to alternate 2 and stay there |

Every run, whatever it was asked, also fails if the airframe went below the runway: the world freezes
at that instant, so the computers never see what JSBSim makes of an aeroplane under the ground.

## How it is built

| path | what |
|---|---|
| `CMakeLists.txt` | compiles the A32NX computers and JSBSim from their clones, our harness against them, and the tests |
| `harness/efcs.cpp` | the world adapter: `FlyByWireInterface`'s `updateElac`/`Sec`/`Fac`/`Fcdc` and `updateServoSolenoidStatus`, line for line, in the driver's order. Unchanged since P6 |
| `harness/world.cpp` | the world: the crew, the servos, the SFCCs' slats and flaps, the sensors |
| `harness/airframe.cpp` | the airframe: JSBSim loading the 737 from the clone, the surfaces mapped into its frame, the state read back |
| `jsbsim/a32nx-surfaces.xml` | the JSBSim system that puts the A32NX servos in charge of the 737's surfaces |
| `harness/main.cpp` | the runner: the non-finite scan, the law decoding, the gate, the expectations, the crash check |

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
surface of its own, slats, roll spoilers, aileron droop, reverse thrust. JSBSim runs at 200 Hz, four
frames a tick. The 737's file asks for a telnet port and a UDP input; the harness switches JSBSim's
input off before loading, so nothing listens on a socket.

**The crew is a script that flies on truth, closed loop,** splitting the job as the A320's own modes
do: in an open climb or descent the thrust is set and the elevator holds the speed; within 400 ft of
the level the elevator holds the altitude and the thrust the speed; on the glide path the elevator
holds 3° and the thrust the speed. The flight path it asks of the laws moves no faster than 1.5°/s.
Bank is held closed loop on roll rate, which flies the same in normal law (stick is roll rate) and
direct law (stick is aileron). On the ground the pedals hold the heading — rudder at speed, 6° of nose
wheel slow — and the toe brakes stop it. One circuit: power-up, flight control check, taxi, takeoff in
1+F rotating at 140 kt, an open climb to 8,000 ft with the flaps in at 200 kt, a doublet, a 180° turn,
speedbrake, a pedal kick, a 45° steep turn, a descent to 2,000 ft configured as the speed comes back,
a 3° path at 145 kt, a flare from 33 ft, ground spoilers, rollout, and again.

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
- **The rudder, in the computers' frame, is 25° × pedal − trim + yaw damper**, inside the travel
  limiter. The driver hands the computers the pedal negated (`FlyByWireInterface.cpp` `:1414`); the
  hydraulics negate the yaw damper order on the way in ("FBW negative is right", `a320_systems`
  `hydraulic/mod.rs` `:5018`) and take the trim order as it is. Positive is trailing edge left, as in
  JSBSim. Reversing the yaw damper's sign proves it: the aircraft departs.
- **`efcs.cpp` feeds the rudder trim's position back un-negated where the driver negates it**
  (`:2464`). Harmless while nothing moves the trim — no trim switch, no autopilot — and a departure
  from the driver to fix when something does. Left alone here: this slice keeps `efcs.cpp` unchanged.
- **The P6 crew leaned on the stub.** The stub clamped bank at 80° and gave speed by fiat; under real
  aerodynamics the old open-loop steep turn overbanked in direct law into a spiral, a stall at 80° of
  alpha and the ground. The crew now holds bank closed loop, and a crash fails the run.
- **The A320 laws protect an A320's wing.** The ELAC's α max is 8.7° clean (6.4° at high Mach) and
  13.0 to 14.2° with slats out; α prot 6.5° clean, 10.6 to 11.9° with slats out (`ElacComputer_P`,
  read out of the compiled table). The 737's lift peaks near 13.2° whatever its flaps: clean, the
  protection stops it far short of its stall; with slats out, α max is at or past it. In one badly
  flown climb during development, flaps running in at low speed, the 737 went through its stall to
  24° of alpha in normal law.

## What P7 still has to build

`ROADMAP.md` §4, *P7 in detail*: a runway and an ILS in the world, the flight core as a library,
WebAssembly, the joystick and the browser loop, a Three.js view, and the gate — a hand-flown ILS,
stable and repeatable, with its measures and bands written down. Whether a fitted A320 replaces the
737 is still open there.

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
