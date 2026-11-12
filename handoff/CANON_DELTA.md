# Canon delta: what the browser sketch settles, changes and leaves alone

**The canon:** `ARCHITECTURE.md`, *Meridian Ring*, draft 0.1 of 2026-11-12. SHA-256
`fb1379483e96860ea16580b7f4f3b0ea00ca82c44d1d653569028c9d96bfc11d`; the packager checks the copy it
carries against this (`tools/package.mjs`).
**The sketch:** `flight/orbit` in the a32x-cbt repository, at commit 7e9aaea, the runway-to-Ring
sketch (its `README.md`). Docking, the walk, the flight home, the Sun and Moon, graphics tiers, the
map and sound, and a rigour pass were being built in parallel when this was written; §4 holds a
marked place for each.

The canon's own rule is that nothing in it is built unless it names the rig that measured it
(Appendix B). This file proposes rows for Appendix B, each naming the test that shows it, says where
the sketch departs from the canon and what porting it means, and lists what the sketch never touched.
Tags: *(test)* a test in the sketch asserts it; *(printed)* a test or tool prints it but nothing
asserts it; *(computed)* worked out here from a formula (M6 in `SOURCES.md`); *(measured)* run for
this kit (M1 to M5).

## 1. Receipts for Appendix B

All from the sketch's tests at 7e9aaea, natively (M1). Test names are ctest's: `orbit.<name>` runs
`test_orbit <name>`.

| quantity | the canon | the sketch | shown by |
|---|---|---|---|
| The orbit reached | 500 km circular, 33° `[chosen]` | 500.4 × 499.7 km, inclined 32.84°, engine off 753 s after the start (733 s after brakes off) | `orbit.crew_reaches_orbit` *(test: within 5 km, within 0.5° of the field's latitude, under 900 s)* |
| The period | 94.6 min `[derived]` | 5,668.9 s, 94.48 min; back within 17 m of the start one period later; energy and angular momentum held to 1 part in 10⁷ | `orbit.kepler_holds` *(test)*. §2.2 explains the 0.12 min |
| The ascent's cost | about 9.4 km/s `[estimate]` | **10.92 km/s** of rocket-equation Δv: 60 t to 34.39 t at 2,000 s; 2.68 km/s left in the tanks | `orbit.crew_reaches_orbit` prints 4,389 kg left *(printed)*; Δv *(computed)* |
| The drive (fiction 1) | 2,000 s vacuum specific impulse; thrust-to-weight at least 1.2 | exactly that: 706 kN for 60 t; flow and speed gained match the rocket equation within 2 % | `orbit.rocket_equation` *(test)* |
| The propellant fraction | 38 % `[chosen]`, `[derived]` | 50 % (30 t of 60 t); 38 % buys 9.38 km/s, **1.5 km/s short of what the sketch's crew spends** | *(computed)*; open decision §5 |
| Highest dynamic pressure, highest load | not in the canon | 36.6 kPa at Mach 0.8 and 2 km, the throttle eased; 2.09 g at the end of the burn | `orbit.crew_reaches_orbit` *(test: under 40 kPa, under 3 g)* |
| Above the air | not in the canon | dynamic pressure under 1 kPa at 38.6 km, 192 s after the start | `orbit_run 10 900` *(printed)* |
| The Ring at insertion | not in the canon | 25.0 km ahead, closing at 0.3 m/s; still 15 to 40 km away five minutes later | `orbit.crew_reaches_orbit` *(test)*. True by construction: §2.8 |
| The approach | regime *Proximity* | 730 s from engaging it (5 s after insertion) to the hold point, 300 m off the hub's port, on the small thrusters alone, the drive's propellant untouched | `orbit.approach_holds` *(test: under 1,800 s, within 5 m)* |
| Hand flying | §3.5: by hand and by intent | rotation at 95 m/s, airborne within 30 s; a 22.5° turn holds 18 to 27° of bank with under 1° of sideslip; the crew takes a hand-flown climb at 3 km to orbit | `orbit.hand_flown_takeoff`, `orbit.crew_takes_over` *(test)* |
| A parked craft stays parked | (none) | 30 s on the brakes: moves under 1 cm, sinks under 2 mm, feels 1.00 g | `orbit.ground_settles` *(test)*. The ground is level to the plumb line (gravity plus the Earth's turn), not to the sphere |
| The atmosphere | `world`: atmosphere | the 1976 US Standard Atmosphere within 0.5 % to 80 km; above 86 km within 20 % of the standard's densities; density never rises with height | `orbit.atmosphere` *(test)*. The sketch's one oracle |
| Determinism | L1, L4; F-REPLAY | the same inputs give the same state hash; a throttle of 0.79 instead of 0.80 gives another | `orbit.deterministic` *(test)*; across compilers §2.3 |
| Headless speed | at least 60 × real time `[chosen]` | about 16,000 × at the sketch's 50 Hz, 7,400 × at 120 Hz, 3,700 × at 240 Hz, on one 2.3 GHz core | *(measured, M3)*: 1,806 simulated seconds in 0.11, 0.24 and 0.49 s |
| The Core's budget | at most 3 ms of a 16.6 ms frame `[chosen]` | at 240 Hz a 60 Hz frame runs 4 steps: about 5 µs | *(measured, M3)* |
| No engine, no wall clock | L1 | the core includes `<cmath>`, `<cstdint>`, `<cstring>` only; calls no clock, random source, thread or file | *(measured, M4)* |
| Spin for 1 g | 0.0443 rad/s `[derived]` | uses 0.0443 rad/s: 1.0006 g at 5,000 m, a turn in 141.8 s, the hub to match at 2.54°/s | `OC_RING_SPIN` *(used, not measured: no test feels the floor yet; the walk's part should)* |
| The Ring's shape | radius 5,000 m, band 1,000 m, roof 300 m | the same; and chosen numbers the canon lacks: hull at 5,040 m, rim walls from 4,620 m, six spokes 70 m square, a hub 160 m in radius, its port 350 m out on the axis, a hold point 300 m off it | `orbit_core.h`, `OC_RING_*`, `OC_HUB_*`, `OC_STANDOFF_M` *(chosen)*: rows for `station.yaml` |
| Ring seen from the ground | 1.15° across | not drawn from the ground at the Ring's distance yet | *(computed: 10 km at 500 km is 1.146°)* |

## 2. Where the sketch departs, and what porting it means

### 2.1 The Tick: 1/240 s against 0.02 s

The canon's master Tick is 1/240 s, flight runs at 120 Hz and guidance at 60 Hz, all integer divisors
(ADR 003, L1). The sketch runs everything, the RK4 integrator, the laws and the crew, at one rate of
50 Hz (`OC_DT 0.02`). 50 does not divide 240.

**Measured (M2):** with `OC_DT` set to 1/120 s, and again to 1/240 s, and the tests rewritten to count
seconds instead of steps, all 15 tests pass. The crew's flight is the same to the printed digits: orbit
at 753 s, 500.4 × 499.6 km, 32.84°, 4,389 kg left, 36.6 kPa, 2.09 g; the approach 730 s; the period
5,668.9 s. The flight does not depend on the step at these sizes.

What porting it means:

1. Set `OC_DT` to 1/120 s, the canon's flight rate.
2. Make every test count seconds: in `test_orbit.cpp`, 23 `oc_step(n)` calls and 4 loop bounds
   count steps, and the walk stub's test takes 50 steps as one second. The page does too: `core.js`
   holds `DT = 0.02` and `main.js` skips ahead 1,500 steps at a time.
3. Re-baseline the hashes once. They change; the flight does not.
4. Guidance at 60 Hz is a second rate the sketch does not have: today the laws and the crew run every
   step. Splitting them is a behaviour change to measure, not to assume.
5. It costs 2.4 times the steps at 120 Hz, 4.8 times at 240 Hz: still thousands of times real time.

### 2.2 The Earth: a sphere of 6,371 km

**The period.** The canon's 94.6 min is a 500 km orbit over WGS-84's equatorial radius: a semi-major
axis of 6,878.137 km gives 94.62 min. The sketch's 94.48 min is a 500 km orbit over a 6,371 km sphere,
6,871.0 km (94.47 min by Kepler, 94.48 measured from the 500.4 × 499.7 km orbit) *(computed)*. The
nine seconds are the definition of "500 km", not physics. Appendix A should say which it means:
height above the equator, or above a mean radius.

**The longest eclipse.** The canon's 35.8 min matches either Earth: 35.69 min on the sketch's sphere,
35.75 min over the equatorial radius *(computed, β = 0)*. Nothing in the sketch measures it yet: its
Sun is fixed among the stars and no test counts shadowed seconds. §4.4.

**The ground.** The sketch's ground is level to the local plumb line on a sphere, which keeps a parked
craft parked. The canon's `world` has the Earth's gravity with J2 (ADR 006) and a terrain query that
physics and picture share (`contracts/terrain_query.h`). WGS-84 puts the surface at DFW's latitude
860 m above the sketch's sphere *(computed)*. Inside the sketch this does not matter; it matters the
moment Unreal draws a WGS-84 Earth under a craft flying on a sphere. `UNREAL_PORT.md` §5 gives the
first slice's answer: draw the sketch's sphere.

**Missing:** J2, the Ring's orbit decaying and being reboosted, wind, terrain.

### 2.3 Replay, and the hash across machines

The canon wants replay exact on any hardware (L4, ADR 017, F-REPLAY). The sketch hashes its state with
FNV-1a and is deterministic within one binary; its README says native and WebAssembly runs agree to
the printed digits, not bit for bit.

**Measured (M5):** the crew's flight to 800 s hashes `143d7cd1` under g++ 13.3 and clang 18.1, as
C++17 and as C++20, from `-O0` to `-O3`, for x86-64 and for x86-64-v3 (AVX2 with FMA) once FMA
contraction is off (`-ffp-contract=off`). Fast-math changes the hash (`b37e265e`, `a679fcff`); so does
FMA contraction alone (`3f03fe06`, `ab204a1d`). Every printed digit of the flight stays the same.

What it means for a port:

- Build the core with precise floating point and no contraction (`/fp:precise` on MSVC, never
  `/fp:fast`; `-ffp-contract=off` on clang and gcc, which matters most on ARM, where compilers fuse by
  default). Unreal's Development builds are reported to use `/fp:fast` (S15, unverified): so build the
  core with CMake, not with UBT's module flags (`UNREAL_PORT.md` §2).
- Expect the hash to differ between Linux and Windows even then: `sin`, `cos`, `exp`, `pow` and
  `atan2` come from each platform's C library, which do not agree to the last bit. Not measured here;
  measure it on the Windows machine. Exact replay on any hardware needs the core's own transcendental
  functions, which is what your subsim did (`subsim::mathx` in place of `<cmath>`, R4). Until then a
  Tape replays exactly only on the binary that wrote it: put the build's identity in its header.
- There is no Tape yet. Every input goes through `oc_reset`, `oc_controls`, `oc_auto`, `oc_sas` and the
  parts' calls (`oc_undock`, `oc_walk_*`), so a Tape is a list of (step, call, arguments): cheap to add
  at the seam.

### 2.4 One core per process

The core keeps its state in globals: `State g`, `Site site`, `Ring ring`, `sunEci`, `hands`, each
part's readouts array, the walk's step counter (M4). The canon needs several: the kernel forks, a
Forecast runs the Core ahead, the Bench runs many. `placeRing()` already forks once, copying `State`
and flying the copy to orbit, but it shares the other globals.

Porting it: move every global into one context struct behind a handle (`oc_create`, `oc_destroy`, a
handle on every call). The state is plain data, so a snapshot is a copy and a fork is a second
context. The oracle is free: the crew's flight to 800 s (`orbit_run 10 800`) must hash `143d7cd1`
before and after (at 7e9aaea, with the same compiler and flags).

### 2.5 Frames and units

The canon types every quantity by frame and unit, and mixing them fails to compile (L2), over a frame
tree: ECI to ECEF to Site, ECI to LVLH to RingRot, ECI to Body.

The sketch uses one untagged `V3` for every frame. Its ECI coincides with the Earth-fixed frame at
t = 0 and the Earth turns from there: no epoch, no sidereal time. Site is east-north-up at the start
point, turning with the Earth; Body is x forward, y right, z down; the Ring has an axis fixed among
the stars and a reference vector turning with its spin. The readouts are in site axes, and the
velocity relative to the Ring is given in the frame that turns with its orbit (LVLH, in effect).
Nothing integrates in RingRot until the walk.

Porting it: tagged types at the C API first (cheap, and where the bugs would be), inside the core
later. Add to the Snapshot what the View now recomputes: the page turns its stars by `WE · t` itself
(`frames.js`), which is physics in the View; the Snapshot should carry the ECI-to-site rotation.

### 2.6 Truth on the HUD (L5)

In the canon, people and minds learn the world only through Instruments, with noise, lag and failure;
truth exists only in the debug View. The sketch's readouts are truth: the exact apoapsis, the exact
range to the Ring. Its HUD prints them, and its laws read the exact state (`rateLoop`'s own comment:
"The law knows the craft exactly; a real one would not").

Porting it: split the readouts into a Snapshot, which may be truth because only drawing reads it
(`contracts/snapshot.fbs`), and Instruments, which the HUD and any mind read. The first slice can keep
truth on its HUD if `FICTION.md` says so.

### 2.7 The planes of control (L6)

The sketch has the canon's shape. Control plane: the modes of `oc_auto` (crew, approach, flight home,
docking) and the targets of `oc_sas` (hold, prograde, retrograde, the Ring). Stability plane: the air
law (hold pitch and bank, turn in balance) and a rate loop by dynamic inversion inside what the
surfaces, the small thrusters and the gimbal can give. Actuators: torque, thruster acceleration, a
throttle with a 0.4 s lag, gear, brakes, nose wheel.

Where it differs: the scripted crew lives inside the core and writes rates and throttle directly;
the canon wants CI's autopilot to fly through the same Control-plane interface TALLY uses
(`contracts/control_plane.fbs`). Torque is commanded directly, not through surface deflections.
F-NULL holds trivially: there is no model anywhere to stall.

### 2.8 The Ring's attitude and the launch window

**Attitude.** The canon does not say how the Ring is oriented. The sketch fixes its spin axis among
the stars, in the orbit plane, pointing along the track where the crew arrives. The hub's port, at the
axis's negative end, faces back along the track there, toward the arriving craft, and radially a
quarter of an orbit later; holding 650 m out on the axis therefore needs up to about 2.4 mm/s² of
steady thrust (3n² × 650 m) *(computed)*. ADR 010's spin-matched docking at the hub (2.54°/s of roll)
works with either attitude; what changes is the approach's geometry and its cost. Open decision, §5.

**The launch window.** The canon has *Ascent, Phasing, Rendezvous*. The sketch flies its crew once at
reset and puts the Ring 25 km ahead of where it arrives (`placeRing`): the Ring's place follows from
the launch, not the launch from the Ring. Its comment says so: "A real launch window is the inverse
problem ... this sketch does not solve it."

### 2.9 Words

The canon's glossary forbids some words the sketch uses. For the new repository:

| the sketch says | the canon says |
|---|---|
| craft, spaceplane | **Shuttle** |
| step | **Tick** (and "render frame" for a drawn image; never "frame" alone) |
| the crew, the scripted crew | the scripted autopilot: a client of the **Control plane** |
| readouts, `oc_out` | **Snapshot** for drawing; **Instruments** for people and minds |
| the pilot's hands, `oc_controls` | **Commands** |
| site frame | **Site** |
| the Ring's turning frame (axis, ref) | **RingRot**, once anything is integrated in it |
| hold point | (none yet) |

### 2.10 Fiction and shortcuts

The sketch's one fiction is the canon's fiction 1, with the same numbers. Everything else it does that
the real world does not is a shortcut rather than a departure from physics, and the slice inherits
them. List them in the new repository's `FICTION.md` under a heading of their own, so none is mistaken
for a claim: the sphere Earth; no J2; no drag on the Ring; laws that know the exact state; the Ring
placed where the crew arrives; the Sun fixed among the stars for the flight (until §4.4 lands); the
field flat; the globe's land colours and clouds (drawing only).

## 3. What the sketch has not touched

**Modules** (the canon's §4): `kernel`'s multirate scheduler and forks; `tape`; `bus` (Commands,
Instruments, validator, authority, Affordances); `schemas`; `build-gates`; `networks`, `ring-systems`,
`shuttle-systems`; `ring-dynamics` (spin, mass balance, wobble; docking loads may arrive with §4.1);
`station-graph` and unrolled coordinates (the walk may bring the first, §4.2); `census`, `services`;
`room`, `tiers`, `perception`, `memory`, `tally`, `director`, `guardian`, `bench`, `sculptor`;
`view-unreal`, `planet-data`, `asset-pipeline`, `voice-io`, `providers`; `oracles` (no JSBSim, Orekit,
GMAT or GUNNS: the 1976 atmosphere's tables are its only oracle); `rigs`; `dev-mcp`.

**Laws:** L3 (no networks, so nothing to conserve but the orbit's energy, §1), L7, L8, L9, L10, L11;
L12 only in part (no binary assets, everything painted by code, no outbound traffic: the page fetches
nothing; but no licence manifest gate and no fiction review).

**Falsifiers** that can run today: F-REPLAY within one binary (§2.3), F-NULL trivially (§2.7).
F-HANDOVER may come with docking and the walk. None of the others has anything to run against.

**Physics:** entry heating (§4.3 may), wind, terrain, failures, the small thrusters' propellant, the
Ring's orbit decaying, mass balance, time skips on rails (ADR 006), eclipses (§4.4), the Moon (§4.4).

**People:** TALLY, Residents, CENSUS, the Room, Tiers, the Director, Expectations, Bonds, services,
voice. Nothing of the mind kernel exists in the sketch, by design.

## 4. Parts still being built

Each was in progress in another worktree when this was written. Each section below is a placeholder
with what to look for; the final pass fills it from that part's result.

### 4.1 Docking

> **PENDING (docking).** Branch and commit: to come. Canon: ADR 010 (spin-matched at the hub, no
> despun section), §3.3 (handover into *Docked*), F-HANDOVER (under 1 mm and 1 mm/s), regimes
> *Proximity, Spin-match, Docked*, `ring-dynamics` (docking loads).

Look for: the roll rate matched at capture against 2.54°/s, and how close; the capture's tolerances
(closing speed, lateral offset, angle, angular rate) and whether they are chosen or derived; whether
the docked craft rides in the Ring's frame (`dockRide`) and is re-expressed in one step (the canon's
handover rule); contact with the Ring (a craft that flies through it today); the hash covering the
dock's state; the time from the hold point to capture; how the port's direction (§2.8) was handled;
undocking's drift.

### 4.2 The walk

> **PENDING (walk).** Branch and commit: to come. Canon: ADR 009 (interiors in RingRot with explicit
> fictitious forces), ADR 008 and §3.4 (unrolled coordinates `(s, c, h)`), Appendix A.

Look for tests of Appendix A's two Ring numbers, which the walk can turn into receipts: **a 2 m drop
lands 3.8 cm off the plumb point** (3.77 cm, *computed*), and **running 5 m/s spinward adds 4.6 %
weight** (4.57 %, *computed*). Then: felt gravity on the floor (1.0006 g at 5,000 m); the Coriolis
push in a spoke's lift (at 10 m/s along a spoke it is 2ωv = 0.89 m/s², nearly a tenth of g sideways);
the hub's near-weightlessness; whether positions are kept in unrolled coordinates and bent into the
ring last (L11); how the walker's state reaches the hash; the handover from *Docked* to a person in
RingRot.

### 4.3 The flight home

> **PENDING (return).** Branch and commit: to come. Canon: §3.5 regimes *Docked, Departure, Deorbit,
> Entry, Terminal, Approach, Rollout*; "every approach is judged from 1,000 ft to the stop, band by
> band"; `flight` (heating); Pillar 2, hub to runway and back.

Look for: the de-orbit burn's Δv and where it happens; peak load and dynamic pressure on entry; heating,
if modelled; the cross-range needed to reach DFW from the Ring's ground track, and whether the entry
can make it; touchdown sink rate, speed and the stop distance on 17C; whether the landing is judged in
bands like the A320's; propellant at each stage (it decides §5's propellant question); and whether
the Ring-to-runway leg needed the same 2,000 s drive or less.

### 4.4 The Sun and the Moon

> **PENDING (sky).** Branch and commit: to come. Canon: `world` (ephemeris, daylight geometry),
> Appendix A (Ring clock UTC; 2038; the longest eclipse 35.8 min; the Ring seen as twice the Moon).

Look for: the ephemeris's method and its accuracy, and the licence of anything it took; how the epoch
is kept (UTC; a year of 2038 means no 32-bit seconds since 1970, which overflow at 03:14:07 UTC on
19 January 2038); the Earth's turn tied to sidereal time at that epoch rather than to t = 0; a test of
the longest eclipse against 35.7 min (§2.2); the Moon's place and phase; the Sun now moving through the
flight.

### 4.5 Graphics, from a phone to a big card

> **PENDING (graphics).** Branch and commit: to come. Canon: §9.1 (60 frames a second on the reference
> machine), §10 (hardware tiers: a query reports what the machine can hold).

Look for: the tiers and what each turns off; the frame times measured on each, and on which machine;
how the tier is chosen (asked, measured, or guessed); which of it maps onto Unreal's scalability
groups (`UNREAL_PORT.md` §7).

### 4.6 The map and sound

> **PENDING (map and sound).** Branch and commit: to come. Canon: `view-unreal`, `rigs` (audio rig),
> ADR 020 (voice), L12 (text is source).

Look for, in the map: what it shows (ground track, the orbit, the Ring, DFW) and from which Snapshot
fields. In the sound: the list of drives (throttle, dynamic pressure, Mach, thruster pulses, contact,
spin) and their ranges, which become the contract a MetaSound graph reads (ASTRA_AUDIO's normalised
drives are the pattern, R1); whether any sound is sampled, or all synthesised; the retarded-time and
absorption ideas of the Booster Lander's audio doctrine (R3), if used.

### 4.7 The rigour pass

> **PENDING (invariants and certification).** Branch and commit: to come. Canon: §9.2 falsifiers, L1
> to L4, §10 (soak; continuous integration).

Look for: which invariants it checks (energy, momentum, frame continuity, NaN, determinism across
step sizes or compilers) and their bounds; which of them map onto F-REPLAY, F-CONSERVE, F-HANDOVER;
whether it adds a soak; whether it closes the cross-compiler question of §2.3.

## 5. Open decisions this raises

| question | why | options |
|---|---|---|
| What "500 km" means | §2.2: 94.48 against 94.6 min | height above the equator (a = 6,878.137 km), or above a mean radius |
| The flight Tick | §2.1 | port at 1/120 s and re-baseline (recommended; measured to work), or keep 0.02 s and change ADR 003 |
| The propellant fraction | §1: 38 % buys 9.38 km/s; the sketch's crew spends 10.92 | optimise the ascent and show it under 9.4 km/s; or raise the fraction to at least 43 %, plus reserves for de-orbit and rendezvous (§4.3) |
| The Ring's attitude | §2.8 | spin axis fixed among the stars (the sketch); or held square to the orbit plane, which J2's turning of the orbit makes a steady torque on a very large wheel |
| Replay on any hardware | §2.3 | the core's own maths functions, as subsim did; or Tapes that replay exactly on their own build only, and within tolerance elsewhere |
| Truth on the slice's HUD | §2.6 | allowed for the slice, written in `FICTION.md`; or Instruments from the start |
| Where the scripted autopilot lives | §2.7 | inside the core, as now; or outside it, as a Control-plane client like TALLY |
| The game's licence (Appendix D) | Unreal's EULA forbids combining the engine with GPL code [S16], which closes Appendix D's GPLv3 option for an Unreal View | MIT or Apache-2.0, with A32X an offline Oracle only (`LICENSING.md`, option A) |
