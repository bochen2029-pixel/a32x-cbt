# Canon delta: what the browser sketch settles, changes and leaves alone

**The canon:** `ARCHITECTURE.md`, *Meridian Ring*, draft 0.1 of 2026-11-12. SHA-256
`fb1379483e96860ea16580b7f4f3b0ea00ca82c44d1d653569028c9d96bfc11d`; the packager checks the copy it
carries against this (`tools/package.mjs`).
**The sketch:** `flight/orbit` in the a32x-cbt repository, the runway-to-Ring sketch (its `README.md`).
Written at commit 7e9aaea, while docking, the walk, the flight home, the Sun and Moon, graphics tiers,
the map and sound, and a rigour pass were being built in parallel; finished at 599e051, with all of them
merged and the flight deck and the tour besides, which §4 sets against the canon part by part. The final
pass changed no code: §1's numbers are the same at 599e051 (M7).

The canon's own rule is that nothing in it is built unless it names the rig that measured it
(Appendix B). This file proposes rows for Appendix B, each naming the test that shows it, says where
the sketch departs from the canon and what porting it means, and lists what the sketch never touched.
Tags: *(test)* a test in the sketch asserts it; *(printed)* a test or tool prints it but nothing
asserts it; *(computed)* worked out here from a formula (M6 in `SOURCES.md`); *(measured)* run for
this kit (M1 to M5).

## 1. Receipts for Appendix B

All from the sketch's tests at 7e9aaea, natively (M1), and the same at 599e051 (M7). Test names are
ctest's: `orbit.<name>` runs `test_orbit <name>`. The parts add their own receipts in §4.

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
| Spin for 1 g | 0.0443 rad/s `[derived]` | uses 0.0443 rad/s: 1.0006 g at 5,000 m, a turn in 141.8 s, the hub to match at 2.54°/s. Felt since: 1.0004 g at a walker's centre of mass a metre over the floor; 0.99617 g hovering 20 m over the deck; docking turns with the hub at 2.54°/s | `walk.one_g_on_the_floor`, `deck.hover_takes_w2r`, `dock.docked_rides_the_ring` *(test)*; §4.1, §4.2, §4.8 |
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
5,668.9 s. The flight does not depend on the step at these sizes. That was at 7e9aaea, with 15 tests;
the parts merged since (docking's contact and capture, the deck's laws and gear, the return's guidance,
the walk) have not been tried at 1/120 s, and the 105 tests added since count steps in places: measure
them again before the Tick changes.

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
Sun moves now (§4.4), but no test counts shadowed seconds.

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
FMA contraction alone (`3f03fe06`, `ab204a1d`). Every printed digit of the flight stays the same. At
599e051 the parts' state is in the hash, so its value is new and the finding the same: `ea7847fe` under
g++ 13.3 and clang 18 from `-O0` to `-O3` on x86-64, `370241c5` as WebAssembly, the printed rows equal
(M8).

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
  parts' calls (`oc_undock`, `oc_sky_set_epoch`, `oc_return_model_error`, `oc_walk_*`), so a Tape is a
  list of (step, call, arguments): cheap to add at the seam.

### 2.4 One core per process

The core keeps its state in globals: `State g`, `Site site`, `Ring ring`, `sunEci`, `hands`, each
part's readouts array, the walk's step counter (M4). The canon needs several: the kernel forks, a
Forecast runs the Core ahead, the Bench runs many. `placeRing()` already forks once, copying `State`
and flying the copy to orbit, but it shares the other globals.

Porting it: move every global into one context struct behind a handle (`oc_create`, `oc_destroy`, a
handle on every call). The state is plain data, so a snapshot is a copy and a fork is a second
context. The oracle is free: the crew's flight to 800 s (`orbit_run 10 800`) must hash `ea7847fe`
before and after (at 599e051, with the same compiler and flags; `143d7cd1` at 7e9aaea, before the parts'
state joined the hash).

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
placed where the crew arrives; an immovable Ring that takes no docking or landing loads (§4.1); the
walk's Ring in free fall with the Earth's tide left out (§4.2); a TT − UTC held fixed (§4.4); the field
flat; the globe's land colours and clouds (drawing only). The Sun is no longer on the list: it moves
with the flight's clock since §4.4.

## 3. What the sketch has not touched

**Modules** (the canon's §4): `kernel`'s multirate scheduler and forks; `tape`; `bus` (Commands,
Instruments, validator, authority, Affordances); `schemas`; `build-gates`; `networks`, `ring-systems`,
`shuttle-systems`; `ring-dynamics` (spin, mass balance, wobble; docking loads did not arrive with §4.1);
`station-graph` (the walk keeps its plan in unrolled coordinates, §4.2, but no graph makes it); `census`,
`services`;
`room`, `tiers`, `perception`, `memory`, `tally`, `director`, `guardian`, `bench`, `sculptor`;
`view-unreal`, `planet-data`, `asset-pipeline`, `voice-io`, `providers`; `oracles` (no JSBSim, Orekit,
GMAT or GUNNS: the 1976 atmosphere's tables are its only oracle); `rigs`; `dev-mcp`.

**Laws:** L3 (no networks, so nothing to conserve but the orbit's energy, §1), L7, L8, L9, L10; L11
only in miniature (the walk's plan, drawn as it is walked, §4.2); L12 only in part (no binary assets,
everything painted by code, no outbound traffic: the page fetches nothing; but no licence manifest gate
and no fiction review).

**Falsifiers** that can run today: F-REPLAY within one binary (§2.3, §4.7), F-CONSERVE for the orbit's
energy, momentum and mass (§4.7), F-NULL trivially (§2.7). F-HANDOVER was measured once, for docking's
draw-in (§4.1, M9), and is no test. None of the others has anything to run against.

**Physics:** wind, terrain, failures, the small thrusters' propellant, the Ring's orbit decaying, mass
balance, docking and landing loads, time skips on rails (ADR 006), eclipses counted (§4.4). Entry heating
(§4.3) and the Moon (§4.4) are in now.

**People:** TALLY, Residents, CENSUS, the Room, Tiers, the Director, Expectations, Bonds, services,
voice. Nothing of the mind kernel exists in the sketch, by design.

## 4. The parts, as built

Each part below was being built in a worktree of its own when this file was first written, at 7e9aaea;
all are merged now, at 599e051, with the flight deck and the tour, which came after. Each section names
the commits, the canon's places it answers, what it settled with the test that shows it, and what it means
for the port. Test names are ctest's (`dock.crew_docks_from_hold` runs `test_dock crew_docks_from_hold`,
which prints its numbers); the page's tests are `web/test/*.test.mjs`. Natively unless said; every test
also passes as WebAssembly (M7).

### 4.1 Docking

Core 49425c2, page 4b1c686, merged at 715530d; tightened by the audit (62c5ff0, 70d5682). Canon:
ADR 010 (spin-matched at the hub, no despun section), §3.3 (handover into *Docked*), F-HANDOVER (under
1 mm and 1 mm/s), regimes *Proximity, Spin-match, Docked*, `ring-dynamics` (docking loads).

| the canon asks | the sketch | shown by |
|---|---|---|
| Spin-matched docking at the hub (ADR 010) | Yes. The crew lines up on the port's axis, rolls into phase with its key and turns with it, right wing down, at the Ring's spin, 2.54°/s. A step before the touch the roll error reads 0.0000° and the roll-rate error 0.00000°/s; docked ten minutes, the craft's turn in 10 s is the spin's to 1.3 × 10⁻¹⁴ rad | `dock.capture_inside_tolerances`, `dock.docked_rides_the_ring` *(test)* |
| The capture's tolerances | Chosen, not derived, for a docking that can be flown from a keyboard: closing 0.03 to 0.30 m/s; the probe's head under 0.30 m off the centre (the drogue's mouth is 0.6 m across); under 0.10 m/s across the face; the nose under 3° off the axis; the key under 2°; the spin under 0.30°/s. Only the last follows from the others: 0.30°/s for the 6 s draw-in is under 2° (`orbit_dock.h`). None describes a real system | each refusal reached by a test: `dock.fast_contact_bounces`, `off_centre_contact_bounces`, `sliding_contact_bounces`, `angled_contact_bounces`, `spin_must_match`, `slow_contact_does_not_latch` *(test)* |
| Docked, the Shuttle rides in RingRot | Yes (`dockRide`). Held, the craft's place, velocity, attitude and rates are worked out from the Ring's at each step's end, never integrated: docked ten minutes, the probe's head stays within 2.7 × 10⁻⁹ m of the port, against the arithmetic's bound of 16 u \|r\| = 1.2 × 10⁻⁸ m | `dock.docked_rides_the_ring` *(test)* |
| F-HANDOVER: under 1 mm and 1 mm/s | Not tested as such. Measured for this pass: the catch takes the closing speed, 0.100 m/s for the crew, in one step, a contact by design, as latches take it; the 6 s draw-in and the change into *Docked* at its end are continuous, at most 8.9 × 10⁻¹⁰ m from where the velocities say and 6.4 × 10⁻⁶ m/s a step. The catch's impulse is the canon's docking load, which nothing receives (below) | *(measured, M9)* |
| Contact with the Ring | The craft is eight spheres swept along each step against the band, the rim walls and their lips, the six spokes (to the roof since the audit) and the hub. A touch is a crash naming what hit what; the open middle is free, 199 m from a spoke's line | `dock.roof_is_solid`, `rim_wall_is_solid`, `spoke_is_solid`, `spoke_reaches_the_roof`, `hub_is_solid`, `open_middle_is_free` *(test)* |
| The hash covers docking's state | Yes: `DockState` sits in the core's state and is folded into `oc_hash` | `dock.deterministic`, `invariants.replay_and_resume` *(test)* |
| Time to dock | From the hold point: lined up in 9 s, caught at 337 s, docked at 343 s, 1.00 m/s easing to 0.10 m/s at the face, within 1 mm of the axis. From where the crew reaches orbit, 24.6 km out: 1,058 s. From inside the Ring's far end: 898 s. By hand under the port hold: caught at 339 s, 0.10 m/s, 0.03 m off the centre | `dock.crew_docks_from_hold`, `crew_docks_from_orbit`, `crew_docks_from_inside_the_ring`, `hand_docking` *(test)* |
| The port's direction (§2.8) | The crew flies to the hold point on the axis by a way round the outside of the Ring when the craft is beyond it or inside it (`dockSafeAim`, which the approach now shares). Both engage only in orbit, within 50 km of the Ring, passing it under 50 m/s in the frame turning with its orbit: from 48 km behind, the approach reaches the hold point in 1,544 s, its lowest point never under 487 km; from 380 km behind, before the audit, it flew into the ground | `dock.approach_goes_round`, `approach_gated_like_docking`, `judges_speed_in_the_orbit_frame` *(test)* |
| Undocking | 0.15 m/s along the axis: 20 s on, 3.15 m off the face, opening at 0.165 m/s, 0.089 m off the axis, still turning with the port; the pilot has it under the port hold | `dock.undock_separates`, `crew_docks_again_after_undock` *(test)* |
| Docking loads (`ring-dynamics`) | Not modelled. The Ring is immovable: the probe's spring and damper push only the craft, and the catch's impulse goes nowhere | (none) |

For the port: the sketch's phases are the canon's regimes, TRANSFER for *Rendezvous* and *Proximity*,
ALIGN for *Spin-match*, then CLOSE, CAPTURED and DOCKED. The catch and the release are the canon's `dock`
and `undock` Rows, and the contact readouts (`OC_DOCK_C_*`) their payload. The tolerances go into
`shuttle.yaml` marked `[chosen]`. Two of the audit's questions are open: which frame the latches judge the
slide in (G7) and whether the probe can step over a lip of no thickness above about 15 m/s (G8,
`flight/orbit/INVARIANTS.md`).

### 4.2 The walk

Core 1941e4c, page eff823c, merged at c56d77b. Canon: ADR 009 (interiors in RingRot with explicit
fictitious forces), ADR 008 and §3.4 (unrolled coordinates `(s, c, h)`), L11, Appendix A.

| the canon asks | the sketch | shown by |
|---|---|---|
| Appendix A: a 2 m drop lands 3.8 cm off the plumb point | **37.73 mm** antispinward, in 0.6387 s, and the same worked out from outside the Ring, where the ball goes straight, to the digits printed. A row for Appendix B | `walk.dropped_ball` *(test)* |
| Appendix A: running 5 m/s spinward adds 4.6 % weight | The law it comes from, 2ωv + v²/r, held within 1 %: +1.27 % and −1.26 % at a walk (1.4 m/s), +3.65 % and −3.58 % at the sketch's run (4 m/s). At 5 m/s the same law gives 4.57 % | `walk.spinward_is_heavier` *(test)*; 5 m/s *(computed)* |
| One g at the floor (Appendix A's spin) | 1.0004 g at the walker's centre of mass, a metre over the floor (ω² × 4,999 m), against 1.0006 g at 5,000 m; at rest nothing moves in five minutes. §1's spin row is now measured | `walk.one_g_on_the_floor`, `walk.rest_stays_put` *(test)* |
| Coriolis in a spoke's lift | The lift's cruise is chosen so that 2ωv is 1.5 m/s², 16.93 m/s; hub to floor in 334.3 s, ω²r at each height (0.190 g at 560 m, 0.815 g at 4 km); leaving and reaching the hub at half the riders' weight | `walk.lift_down`, `walk.lift_up` *(test)* |
| The hub's near-weightlessness | The lobby, 150 m from the axis: 0.0298 g. A jump there lasts 20.89 s, rises 25.3 m and lands 38.51 m spinward; the same from outside | `walk.hub_is_nearly_weightless` *(test)* |
| A jump on the floor | 1 m: 0.9028 s in the air, landing 53.34 mm spinward; the straight line outside agrees to 4.2 × 10⁻¹² m all the way | `walk.jump_is_a_straight_line` *(test)* |
| ADR 009: RingRot with explicit fictitious forces | Yes. The walker is a point, its centre of mass, integrated in the Ring's turning frame by Runge–Kutta on ω²(x, 0, z) − 2ω ŷ × v and nothing else; floors and walls hold it, its soles' friction limits its push. The Ring is in free fall, so the Earth's pull is not felt; its tide across the Ring, six parts in 10⁴ of a g, is left out | `core/walk.cpp`'s header; the tests above |
| ADR 008, §3.4: unrolled coordinates | In part. The floor's plan is made and kept unrolled: every solid thing a box in (s, c, h), 1,824 of them (1,500 blocks, 240 parapets, the spokes' feet, the lifts' shafts). The readouts give the walker unrolled (θ or s, c, h). The walker itself is integrated in Cartesian RingRot | `walk.plan_is_sound` *(test)* |
| L11: one graph, two outputs | In miniature: the plan the walker collides with is the plan the page draws (`walk-world.js` builds the town from the core's boxes) | `web/test/walk.test.mjs`: the plan painted against the one walked *(test)* |
| The walker's state on the Tape | The walk keeps its own state, its own fixed steps and its own hash (`oc_walk_hash`); the flight's `oc_hash` does not cover it, and the walk's steps change no flight readout or hash | `walk.deterministic`, `invariants.readouts_are_derived` *(test)* |
| The handover from *Docked* to a person | None needed yet: the craft stays docked, and the walker starts at rest at the hatch in the hub's lobby. The person never existed in the flight's state, so nothing is re-expressed; the way from the port to the hatch is skipped | (by design) |

For the port: the walk is the first slice's 100 m (`FIRST_SLICE.md`), and the Character Movement
Component cannot stand in for it, since it knows no Coriolis (`UNREAL_PORT.md` §4): drive a kinematic
pawn from the walker's readouts. The handover rule starts to matter on the day a person exists aboard the
Shuttle and walks off it.

### 4.3 The flight home

Core fed3752 and 0970c4b, merged at 5c9fe30. Canon: §3.5 (regimes *Docked, Departure, Deorbit, Entry,
Terminal, Approach, Rollout*; every approach judged from 1,000 ft to the stop, band by band), `flight`
(heating), Pillar 2 (hub to runway and back).

| the canon asks | the sketch | shown by |
|---|---|---|
| The regimes | `orbit_return.h`'s phases: depart, wait, burn, coast, entry, terminal, approach, flare, rollout, stopped. Departure, Deorbit, Entry, Terminal, Approach and Rollout are the canon's; the wait for a pass is the sketch's addition | `return.readouts_block` *(test)* |
| Hub to runway (Pillar 2) | End to end in one headless run: docked at 1,807 s, let go 10 s later with the return engaged at once, burn at 2,726 s (125.3 m/s), touchdown at 7,868 s, 432 m past the threshold, 0.07 m off the centreline, sinking 0.74 m/s, stopped 2,121 m down 17C. The canon's slice-1 round trip in miniature, without the Tape | `return.lands_after_undocking` *(test)* |
| The de-orbit burn | Tail first at 30 % thrust, cut when the orbit's low point is 60 km (on the orbit flown, not a clock): 121 to 127 m/s from the round orbit, 222 kg of propellant; 196 m/s from an orbit raised to 806 km. Where: the pass the plan finds whose entry ends abeam the runway | `return.lands_from_insertion`, `plan_says_when`, `lands_from_a_changed_orbit` *(test)* |
| The cross-range to DFW | KDFW lies at almost the orbit's inclination, so it passes near the plane once a day. The entry reaches about 1,500 km either side of the plane; the plan's limit is 1,200 km; the runway is in reach about 3½ hours either side of that passing: four or five passes a day, a wait of up to about 19 hours (from after the day's last pass: touchdown 19.7 h later, the runway 1,028 km off the plane) | `return.lands_after_a_long_wait`, `lands_from_starts_round_the_day` *(test)* |
| Peak load and dynamic pressure | 1.63 to 1.68 g and 9.0 to 9.4 kPa in the tests' starts; 1.49 to 2.11 g and 10.2 kPa at most with the model made wrong. Limits 2.5 g and 20 kPa, the guidance keeping 15 to 20 % inside | `return.lands_from_insertion` and the pools *(test)* |
| Heating (`flight`) | Modelled: Sutton and Graves's heat flux at the stagnation point of a 1 m nose; peak 387 to 412 kW/m², the skin at 1,683 K in radiative equilibrium (emissivity 0.85), 444 MJ/m² in all; limit 600 kW/m² (1,880 K, the range of reinforced carbon–carbon) | `return.lands_from_insertion` *(test)* |
| Touchdown and stop | Every test landing 429 to 437 m past the threshold, 0.07 m left of the centreline, sinking 0.74 m/s at 99 to 100 m/s; stopped 2.1 km down 17C on its centreline | `return.*` *(test)* |
| Judged band by band from 1,000 ft | Not yet. A landing counts when it touches down in the first 900 m, within 3 m of the centreline, sinking under 2 m/s, stops on the runway and stays inside the limits. The A320's banded judge lives on the A32NX side of `flight/` and is not used | `return.lands_with_its_model_wrong` *(test)* |
| Robustness | The guidance's model of the air and the craft made wrong while the craft flies the core's own, the start drawn across a day. Held-out pools, flown once: **200 of 200** with the density off by up to 25 % plus a 15 % wave and each coefficient by up to 10 % (Wilson 95 %: 98.1 to 100 %); **91 of 100** at 40 %, 25 % and 20 % (83.8 to 95.2 %). Every run lost had a lift-over-drag error beyond a factor of 1.2 | `test_return monte_carlo` *(printed)*; `return.lands_with_its_model_wrong` *(test)* |
| The model the guidance flies by | Its load matches the core's to 3.6 × 10⁻⁴ g from the entry to the approach, before anything is made wrong; it learns its errors in flight by fading-memory filters | `return.model_is_the_plant` *(test)* |
| F-NULL | Trivially: no model sits in the Stability plane, and the return's predictor-corrector commands only rates, throttle, gear and brakes, as the crew to orbit does. Nothing in it writes where the craft is | (by construction) |

**Propellant, and the drive on the way home.** From insertion the whole return takes 1.12 t of the
4.39 t the ascent leaves, the burn 222 kg of it; from the hub 1.11 t; after the day's last pass 0.47 t;
with the far side raised to 806 km 1.34 t *(test)*. The burn alone does not need the fiction: 127 m/s at
a chemical 450 s would take about 1.0 t from 34.4 t *(computed)*. The powered approach does: the drive is
relit at low throttle down the 3° path, about 520 m/s of rocket-equation Δv after the burn, some 0.9 t at
2,000 s and about 3.8 t at 450 s *(computed)*. A gliding approach, as the Shuttle flew, would need no
drive at all, and would leave §5's propellant question to the ascent alone.

### 4.4 The Sun and the Moon

Core 6c46955, page 4eca70e, merged at f3f1399. Canon: `world` (ephemeris, daylight geometry), Appendix
A (Ring clock UTC; the year 2038; the longest eclipse 35.8 min; the Ring seen as twice the Moon).

| the canon asks | the sketch | shown by |
|---|---|---|
| An ephemeris | J. Meeus, *Astronomical Algorithms* (2nd ed.): the Sun by the low-accuracy method (ch. 25) to 0.01°; the Moon from every term of tables 47.A and 47.B, to about 10″; sidereal time, nutation's four largest terms, precession; the Moon's attitude by Cassini's laws, which gives its librations. Methods only: no code or data is taken (`docs/provenance.md` §1h) | the book's worked examples: `sky.sun_meeus_25a`, `moon_meeus_47a`, `precession_meeus_21b`, `moon_phase_meeus_48a`, `moon_libration_meeus_53a`, `sidereal_time`, `julian_date` *(test)* |
| Its accuracy | Against JPL's Horizons (DE441, queried 2026-11-12), which shares nothing with the book: at 19:00 UTC on 2026-11-12 over KDFW the Sun at az 194.453° el 37.968° (Horizons 194.452°, 37.968°), the Moon at az 151.806° el 22.562°, 405,165 km (151.804°, 22.563°, 405,192 km); from 2018 to 2034 the Moon within 7″ and 41 km, the Sun within 21″; the eclipse of 2024-04-08 over KDFW, the centres 0.0114° apart at 18:43:21 UTC (Horizons 0.0110° at 18:42:32) | `sky.default_epoch_against_horizons`, `eclipse_over_kdfw` *(test)* |
| The Moon's place and phase | 11.478 % lit from KDFW, as the page draws it, against Horizons' 11.481 %; phase angle 140.393°; 1779.9″ across; its pole 1.03° east of north (1.04°); the full Moon of 2026-12-24 99.88 % lit | `web/test/sky.test.mjs` *(test)* |
| The Ring clock: UTC | The flight's epoch is a Julian Date in UTC held in a double (`oc_sky_set_epoch`), 12 November 2026 at 19:00:00 unless the page's address sets another; refused outside 1900 to 2100, where the methods and the fixed TT − UTC hold. No 32-bit seconds since 1970 anywhere, so 2038 is no edge; but no test runs a date in 2038 | `sky.epoch_is_settable` *(test)* |
| The Earth's turn and the sky | The flight's inertial frame is still the Earth-fixed frame at t = 0, turning at the mean sidereal rate from there (§2.5); the sky is turned into it by Greenwich's apparent sidereal time at the epoch. Nothing in the flight depends on the date: two dates give one flight hash | `sky.deterministic`, `sky.sidereal_time` *(test)* |
| The Sun moving through the flight | Yes, at its own pace along the ecliptic: an hour moves the Moon 0.4940° among the stars and the Sun 0.0419° (Horizons 0.4940°, 0.0420°); the frames invariant holds the Sun to 57.2′ to 61.2′ a day | `sky.sky_moves`, `invariants.frames_round_trip` *(test)* |
| The longest eclipse, 35.8 min | Not measured. The page darkens the craft in the Earth's shadow, but no test counts shadowed seconds; on the sketch's sphere at β = 0 the longest is 35.69 min | *(computed)* |
| The Ring seen as twice the Moon | Not measured: the Ring is not drawn from the ground at its distance (G10's haze aside). 10 km at 500 km is 1.146°; the Moon at the default epoch is 1779.9″, 0.494°: 2.3 times | *(computed)* |
| The stars | 8,615 to magnitude 6.5, Wikidata's (CC0), at their J2000.0 places, turned by the core's sidereal time, precession and nutation; Polaris 0.623° from the pole | `sky.sky_moves` *(test)*, `web/test/sky.test.mjs` |

For the port: the Snapshot should carry the sky's own block (`oc_sky_out`: the Sun, the Moon, its pole
and near side, its phase, the J2000.0 axes), so the View turns its stars by the Core's rotation, not its
own (§2.5's point, now with a block to carry it). The Moon's face (`web/data/moon.js`, from the IAU's
Gazetteer, public domain) and the stars (`web/data/stars.js`, CC0) travel as data.

### 4.5 Graphics, from a phone to a big card

15472cc and d43ea76 with their fixes, merged at a2a6773. Canon: §9.1 (60 frames a second on the
reference machine), §10 (hardware tiers: a query reports what the machine can hold).

| the canon asks | the sketch | shown by |
|---|---|---|
| A query that says what the machine can hold (§10) | Three tiers, low, medium and high, placed from what the device says of itself (the renderer WebGL names, its largest texture, whether it can draw into a half-float target, the screen, a finger for a pointer, the memory); left to itself the page times its first frames and steps down a tier, or at low draws fewer pixels. `?q=`, the 9 key and GFX override it, remembered | `web/test/quality.test.mjs`: each tier complete, none cheaper at a dearer tier *(test)* |
| What each tier turns off | The drawing buffer (1.5 device pixels a CSS pixel and 1.3 M pixels at low; 2 and 2.4 M, multisampled half-float, at medium; 2 and 6 M at high); HDR with a glow on what is brighter than white (medium and high); the far scene's reflection cube (none, 64 texels, 128); the Sun's shadow map (high only, 2,048); the Earth's land mask, air samples and detail octaves; the Ring's segments, textures, relief, trusses and standing buildings; the craft's loft, textures and plume samples | `flight/orbit/README.md`, *Graphics* |
| 60 frames a second on the reference machine (§9.1) | Not measured: no GPU was used. Frame times were taken in software GL (SwiftShader) at 1,440 × 810, by the GPU's own timer round each pass, to compare the tiers: runway, orbit, hub 0.5, 1.0, 0.6 s at low; 2.2, 2.0, 1.8 s at medium; 2.1, 2.1, 3.2 s at high. The Earth's full-screen pass is most of every frame | *(measured by that part, in software)* |
| Drawing at true scale | The camera at the origin of what is drawn and two depth passes (near to 360 km, far beyond), the Ring in a depth slice of its own when nothing near shares its depths: at 25 km one 24-bit buffer cannot tell apart surfaces 75 m from each other | `web/test/slices.test.mjs` *(test)* |

For the port: the tiers map onto Unreal's scalability groups roughly as drawing buffer to resolution
scale, reflections to Reflections, the Sun's shadow to Shadows, the textures to Textures, the Earth's air
samples to the sky atmosphere's own settings, the glow to PostProcessing, the Ring's segments and town to
ViewDistance (known engine behaviour, not re-checked here); `UNREAL_PORT.md` §7 has the tiers on the
owner's machines. The camera at the origin and the depth slices are what Large World Coordinates and the
reversed depth buffer replace. One fault found while making the guide: seen well off the view's axis the
Ring's slice clips its far edge, because the slice's near plane is set from distance and not from depth
along the view (G12).

### 4.6 The map and the sound

Map 241b29c, sound 4cd9b2c, merged at 7b175df. Canon: `view-unreal`, `rigs` (audio rig), ADR 020
(voice), L12 (text is source).

| the canon asks | the sketch | shown by |
|---|---|---|
| What the map shows | Three views: ORBIT (the orbit from above the Ring's plane, north up, the Earth turned as it has turned, the craft's conic with its apsides, KDFW); RING (the rendezvous in the frame turning with the Ring's orbit: the band, the hold point, the craft's path over a revolution and its nearest approach; a scale from 1 to 5,000 km); GROUND (the track flown and the next one and a half revolutions, the Ring's track, KDFW) | `web/test/map.test.mjs` *(test)* |
| From which Snapshot fields | The core's inertial state (`oc_eci`, added for the map), the flight readouts (apoapsis, periapsis, inclination, time to apoapsis), and the Ring's place and the relative velocity in its orbit's turning frame, from which the Ring's orbit normal follows. The core's apsides, inclination and time to apoapsis come back out of the state to a metre, 10⁻⁶ degree and half a second | `web/test/map.test.mjs` *(test)* |
| Forecast (§3.1) | The map's future is Kepler's problem by universal variables, two bodies only, in the View: within 50 m of the core over a ten-minute coast. In the canon this is a Forecast, a fork of the Core run ahead, and belongs there (§2.4's handle API makes the fork) | `web/test/map.test.mjs` *(test)* |
| Sound: sampled or made | Made as it plays by Web Audio nodes: no sound file, sample or recording anywhere (L12). The ear is aboard (cockpit) or with the camera; sound reaches it through the air (as strong as the air is dense), through the structure (eight hull modes; all there is in a vacuum) and in the cabin. A camera outside hears late by the sound's travel time, thinned as 1/r, high notes first, through a head-related transfer, and past Mach 1 only inside the drive's Mach cone | `web/test/sound.test.mjs`, 20 tests *(test)* |
| The drives a MetaSound graph would read | `sound-mix.js` is the contract, pure and tested: the readouts in, every voice's level out, each a share of the drive's roar at full power at sea level (1, about −20 dBFS at the default volume). Its inputs: throttle, dynamic pressure (against the ascent's 36.6 kPa), Mach (the rumble through 1, a thump crossing it), angle of attack (buffet past 14°), the stagnation heating (the plasma, against 500 kW/m²), the small thrusters' acceleration, the gear's contact and speed, docking's capture and contact, a crash, the Ring's room, time warp (3 dB quieter a doubling, silent from 50×) | `web/src/sound-mix.js` *(test)* |
| ADR 020: voice | None | (none) |

For the port: `sound-mix.js` is the drives' table for a MetaSound graph built by the Builder API, as the
owner's ASTRA_AUDIO did (R1); the retarded time and the absorption are the Booster Lander's audio
doctrine (R3), as this part already used it.

### 4.7 The rigour pass

3880e0c and 5d94034, merged at a3556c9 with its three defects fixed; the audit's fixes 6f9547a, 62c5ff0
and 70d5682. Canon: §9.2's falsifiers, L1 to L4, §10 (soak; continuous integration).

| the canon asks | the sketch | shown by |
|---|---|---|
| F-REPLAY: two cold replays identical | Within one binary, yes, now of the whole state: the hash folds in who flies, the holds, the laws' and the guidance's memory, the step's commands, the pilot's hands and each part's state (defect D1, fixed at a3556c9). 17 marks over 64,000 steps, run in pieces, stopped and resumed: one hash | `invariants.replay_and_resume`, `hash_covers_the_state` *(test)* |
| F-CONSERVE: residuals within bounds | In a vacuum, two revolutions of an 838 × 5,059 km orbit hold the energy to 1.5 × 10⁻¹³ of itself and close on Kepler's period to 1.5 ns; in the 500 km orbit the air is the only loss, the ledger closing to 3.1 × 10⁻⁶ J/kg of 0.097; the ascent's work-energy ledger, per kilogram, closes to 7.5 × 10⁻⁶ J/kg of 3.35 × 10⁷; the propellant used equals the flow's integral to 1.9 × 10⁻⁸ kg. Each tolerance derived from RK4's order and the rounding of doubles, never fitted, and each check shown able to fail | `invariants.vacuum_conserves`, `thin_air_ledger`, `ascent_work_energy`, `mass_bookkeeping` *(test)* |
| L1: one truth, one clock | Time is the step count; the core reads no clock (by review: G4) and refuses a control or a start that is not a number (D2, G6) | `invariants.readouts_are_derived`, `nonfinite_controls_refused` *(test)* |
| L2: one frame | One frame seen three ways (inertial, Earth-fixed, site), every step of the crew's flight and 1,000 s of approach, 87,630 in all, each within a few unit roundoffs | `invariants.frames_round_trip` *(test)* |
| F-HANDOVER | Not tested; §4.1 measures docking's | (§4.1) |
| A soak (§10) | Not 30 days: the crew's flight and three hours holding off the hub, 577,630 steps, no readout ever NaN or infinite; an abuse run of 404,689 steps (409,522 as WebAssembly) with every control at random and past its stops, 58 crashes (24), none not finite | `invariants.crew_flight_finite`, `abuse_finite` *(test)* |
| The cross-compiler question (§2.3) | Not closed: no test holds the native and WebAssembly builds to a stated agreement (G3). Re-measured for this pass: the crew's flight to 800 s hashes `ea7847fe` under g++ 13.3 and clang 18, from `-O0` to `-O3`, on x86-64, and `370241c5` as WebAssembly; the printed rows agree | *(measured, M8)* |
| Receipts for every number | `flight/orbit/evidence/`: 76 requests to Abacus, the owner's certified arithmetic, each graded exact with a SHA-256 receipt, and an index of what each backs and the mismatches found (none moved a test). The deck's numbers are not yet certified there | `invariants.certified_numbers` *(test)* |
| Continuous integration | None: the suites run by hand before each commit (120 native, 120 WebAssembly, 146 on the page). The kit's gates (`FIRST_SLICE.md` §6) are the plan | (none) |

What the audit found and fixed, each with a test that fails without the fix: the approach from far out
flew into the ground (now gated); Polhamus's lift pointed into the windward face past 155° of attack
(O13); the spokes ended 80 m short of the roof in the contact model; the insertion guidance kept a plan
that missed its own cutoff by up to 15 m/s and 750 m (O14); and three tests passed for the wrong reason.
`INVARIANTS.md` keeps the invariants O1 to O14, the defects, and the gaps G1 to G12 still open; the kit's
zip carries it with `evidence/`.

### 4.8 The flight deck

Core bb362c0, page 1ed92c4, docs 922ccd1, merged at a6368af. The canon has no deck: the owner's idea,
approved on the day, to come in from the rim like an airliner and hover to a pad like the booster lander.
Canon places it touches: §3.4 (the Ring), Appendix A (the roof, the rim speed), §3.5 (regimes), ADR 009.

| what it settles | the sketch | shown by |
|---|---|---|
| Landing on a spinning floor is a hover | In the Ring's frame the deck stands still and everything over it is pulled outward at ω²r: hovering 20 m over a pad the craft feels 0.99617 g against ω²r's 0.99659 g (the tides the difference), its thrust within 0.03° of the way to the axis, the drive's flow 16.28 kg/s against mω²r/(Isp g₀)'s 16.29 | `deck.hover_takes_w2r` *(test)* |
| The weight comes on as the speed goes | Moving at u against the deck the pull is (ωr + u)²/r: the glide goes from 203.6 m/s against the deck (ωr at 400 m up is 203.4) and 0.0000 g to 1.5 m/s and 0.983 g in 104 s, the swivel from 0° to 89° | `deck.glide_bleeds_the_deck_speed` *(test)* |
| The crew's landing | From the hold point: the glide at 123 s, the hover at 226 s, at rest on pad 2 at 255 s, sinking 0.278 m/s, drifting 0.002 m/s, 0.01 m from the centre, 0.03° off level. From where the crew reaches orbit: on the pad at 972 s. Twenty-four seeded starts up to 101 m and 1.84 m/s off the hold point all land, on all three pads | `deck.crew_lands_from_hold`, `crew_lands_from_orbit`, `monte_carlo` *(test)* |
| What it costs | 1,794 kg of 4,388 from the hold point: 1,051 m/s of Δv against the deck's own 221.5 m/s, most of it holding the craft up (the glide 1,119 kg, the hover 195, the descent 256) | `deck.propellant_budget` *(test)* |
| By hand | The deck hold (6): the F-35B's unified control in the deck's frame, the stick a velocity against the deck, the throttle the climb or sink, a shut throttle landing the craft: from the hover, down in 20 s at 0.28 m/s, 0.4 m from the pad's centre | `deck.pilot_lands_by_hand`, `lift_off_and_hold` *(test)* |
| The Ring's structure | The deck is an open sector, 1,500 m of floor at 30° from spoke 0 and the band's whole width, sealed from the town by 20 m bulkheads; three pads 400 m apart. The bulkheads and the roof outside the sector are solid; through the roof's gap the way is open | `deck.bulkhead_is_solid`, `roof_outside_is_solid`, `open_roof_lets_through` *(test)* |

What it changes in the canon: Appendix A's roof is glazed over the whole band; the deck opens 1,500 m of
its 31,416 m to space, a change for `station.yaml` and for the air's budget (4.8 % of the band). The
drive's swivel (aft to straight down at 15°/s) and the jet-borne attitude bleed (roll posts, a nose lift
jet, 5 % of thrust) are the same drive, not a second fiction, but they are choices for `shuttle.yaml`. The
deck's numbers are its tests' own and not yet certified in `evidence/`. The owner's open Ring
(`OPEN_RING_AIR.md`) shows why the deck must be a vacuum at 5 km, and at what size (about 1,000 km) the
deck landing would become an entry.

### 4.9 The tour

5a885f7 (and cd15029, its own frame clock), merged with the flight deck at ef69bb7. Canon: §3.5 ("the
scripted autopilot that flies the whole profile in CI is the same Control-plane interface TALLY uses"),
Appendix C (slice 1: a scripted Shuttle round trip; slice 3: hub to DFW and back in the View).

| what it settles | the sketch | shown by |
|---|---|---|
| A director, not a pilot | The tour flies the whole loop through the crew's own modes, giving the page's commands as a person pressing the buttons would (reset, DOCK, WALK, RETURN, RETURN again to skip the wait), with a caption, a time warp and a view for each stage. It writes no state; any command but one that only changes what is shown ends it | `web/test/tour.test.mjs`: the stages' order, the commands, the warps, the captions' numbers, a crash ending it *(test)* |
| The round trip in the View | Take-off to orbit, docking (the last of it seen from the Ring), the hub's lobby and the floor, the way home through entry to a stop on 17C; about ten minutes on a desktop | driven in Chromium for cd15029 and for this guide |

For the port: the tour is the shape of the canon's scripted autopilot as a client: a plan of stages, pure
and testable on made-up states, issuing Commands through the same seam a player's hands use. In the first
slice it is the natural walking-skeleton check (`FIRST_SLICE.md` §7, exit test 7), and later the CI
mission.

## 5. Open decisions this raises

| question | why | options |
|---|---|---|
| What "500 km" means | §2.2: 94.48 against 94.6 min | height above the equator (a = 6,878.137 km), or above a mean radius |
| The flight Tick | §2.1 | port at 1/120 s and re-baseline (recommended; measured to work), or keep 0.02 s and change ADR 003 |
| The propellant fraction | §1: 38 % buys 9.38 km/s; the sketch's crew spends 10.92. Home from orbit takes 1.12 t more, the burn 222 kg of it; a deck landing 1.79 t (§4.3, §4.8) | optimise the ascent and show it under 9.4 km/s; or raise the fraction to at least 43 %, plus reserves for the way home and the deck; or fly the approach home unpowered |
| The Ring's attitude | §2.8 | spin axis fixed among the stars (the sketch); or held square to the orbit plane, which J2's turning of the orbit makes a steady torque on a very large wheel |
| Replay on any hardware | §2.3 | the core's own maths functions, as subsim did; or Tapes that replay exactly on their own build only, and within tolerance elsewhere |
| Truth on the slice's HUD | §2.6 | allowed for the slice, written in `FICTION.md`; or Instruments from the start |
| Where the scripted autopilot lives | §2.7 | inside the core, as now; or outside it, as a Control-plane client like TALLY |
| The game's licence (Appendix D) | Unreal's EULA forbids combining the engine with GPL code [S16], which closes Appendix D's GPLv3 option for an Unreal View | MIT or Apache-2.0, with A32X an offline Oracle only (`LICENSING.md`, option A) |
