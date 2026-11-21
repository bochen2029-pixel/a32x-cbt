# The orbit sketch's invariants

What the sketch's core promises, whoever flies it and however long. Each rule says what it states, why it
holds, and what enforces it: a test, an assertion, or "not yet enforced". A change that breaks one is
wrong whatever else its tests say. The manner is the owner's own, from Subsim (`docs/provenance.md`, 1h,
"Rigour"): every rule names its enforcement, every check is shown able to fail, a tolerance is derived and
never fitted, and a test that could not set up what it measures fails rather than passes.

The tests are `test/test_invariants.cpp`, registered with ctest as `invariants.*`; they run natively and as
WebAssembly under node. The numbers they rest on are certified in `evidence/` (`evidence/INDEX.md`).
Figures below are from the native build; the WebAssembly build's agree to the digits shown unless a
second figure is given.

## The invariants

| # | Invariant | Why it holds | Enforced by |
|---|---|---|---|
| O1 | **Conservation in a vacuum.** With nothing but gravity acting, the energy per kilogram, v²/2 − μ/r, and the angular momentum per kilogram, r × v, keep their values, and an orbit closes after Kepler's period for its energy, 2π √(a³/μ). | Gravity is a point mass's: a central, conservative force. The core integrates it with RK4 at 0.02 s, whose error in a revolution of some 450,000 steps is of order (2π/450,000)⁴ ≈ 4×10⁻²⁰: below the rounding of a double. The model's air pushes only above 10⁻⁶ Pa of dynamic pressure, which is a vacuum from about 630 km. | `vacuum_conserves`: two revolutions of an 838 × 5,059 km orbit. Energy held to 3.2×10⁻⁶ J/kg (1.5×10⁻¹³ of itself), angular momentum to 4.7×10⁻³ m²/s (7.8×10⁻¹⁴); each revolution closes on Kepler's period to 0.5 and 1.5 ns (0.8 and 3.9 ns as WebAssembly). `test_orbit` `kepler_holds`, at 500 km and to one step. |
| O2 | **Thin air is the only loss in orbit.** In the crew's 500 km orbit, energy and angular momentum change by the drag's work and torque and by nothing else. The loss is what the density there predicts. | At 500 km the model's air is 5×10⁻¹³ kg/m³, and takes about 0.05 J/kg a revolution (`drag-500km`: 0.0489 at 500 km exactly). The core says the Ring's orbit does not decay ("What is not"); the craft's does. | `thin_air_ledger`: two revolutions. The air took 0.09687 J/kg; the ledger closes to 3.1×10⁻⁶ (bound 1.2×10⁻⁴), angular momentum to 3.2×10⁻³ m²/s (bound 0.053). The density alone predicts 0.09664. |
| O3 | **Work and energy balance on the powered ascent.** Per kilogram, since the mass halves on the way: Δ(v²/2 − μ/r) = ∫ (F_thrust + F_air)/m · v dt, and Δ(r × v) = ∫ r × (F_thrust + F_air)/m dt. The balance holds per kilogram only: the craft's total energy obeys no such balance while it burns half its mass away. | Newton's second law with gravity conservative; RK4 integrates exactly the forces the model states, at the states it steps through. | `ascent_work_energy`, from the gear coming up to the end of the thrust's tail, 35,565 steps. The energy gained, 3.347422×10⁷ J/kg, is the drive's 3.375192×10⁷ less the air's 2.776985×10⁵; the ledger closes to 7.5×10⁻⁶ J/kg (bound 3.4×10⁻³), angular momentum to 0.22 m²/s (bound 50). The take-off roll, with the gear's work, closes to 0.014 J/kg (bound 0.052). Shown able to fail: left out, the air misses by 2.8×10⁵; a force of one micro-g unknown to the ledger would add 21.6. |
| O4 | **Mass bookkeeping.** The propellant used is the integral of the flow, thrust over exhaust speed (36 kg/s at full thrust: `flow`). The mass read out is the dry mass and the propellant. The propellant never rises and never goes below zero. The small thrusters take none, since the sketch does not fuel them. A burn to the last kilogram leaves the tank exactly empty and the drive stopped. | The flow is constant over a step (the throttle is held across it), so RK4 integrates it exactly; `integrate` clamps at zero, and `stepOnce` cuts the drive on an empty tank. | `mass_bookkeeping`: 25,612.125223 kg used to orbit, equal to the flow's integral to 1.9×10⁻⁸ kg (bound 2.5×10⁻⁷). The burn to empty takes 4,387.874777 kg; the flow's integral is 4,388.4, the last step finding less than its share. `test_orbit` `rocket_equation`, `thrusters_translate`, `approach_holds`. |
| O5 | **One frame, three ways.** The inertial frame, the Earth-fixed frame (turned ω_E t about the pole) and the site's east, north and up are one frame. The reported site position, carried back, is the inertial position; latitude, longitude and height are that point's. The body-to-site quaternion is unit, its axes orthonormal and right-handed, and they give the heading, pitch and roll reported. The Ring's axis and reference are unit and square. The Sun moves among the stars only at its own pace along the ecliptic, between 57.2′ a day (aphelion) and 61.2′ (perihelion), and does move. The core's two copies of the transform agree. A sidereal day brings the frame back. | Each readout is computed from the inertial state by rotations; a rotation preserves lengths and angles. | `frames_round_trip`: every step of the crew's flight and 1,000 s of approach, 87,630 in all, each check within 0.63 of its bound (a few unit roundoffs); the Sun went 0.0204° in 1,752.6 s on 2026-11-12, 1.006° a day. Shown able to fail: the Earth's turn read one step late misses by 7.8 m. `web/test/frames.test.mjs` holds the page's copy. |
| O6 | **Determinism and replay.** The same inputs give the same flight, bit for bit: in one call between inputs, in pieces of any size with every readout read between them, or stopped part way, the core used for another flight, and resumed by re-stepping the inputs from the start. Reading changes nothing. | The core advances only in whole fixed steps. It reads no clock and keeps no state outside `g`, `site`, `ring`, `sunEci` and `hands`, all set by `oc_reset` and the inputs. Its arithmetic is IEEE doubles in a fixed order. | `replay_and_resume`: 17 marks over 64,000 steps of a script with a pilot's turn, the crew taking over, the approach and the thrusters, stopped in the burn to orbit. `replay_through_the_ring`: 36 marks over 140,000 steps, the crews docking at the hub's port, letting go, landing on the deck, taking off to the hold point and leaving for home, the flight director switched off and on, stopped in the deck's final burn. `replay_the_flight_home`: 97 marks over 384,000 steps, the flight home from orbit through a windy day to a stop on the runway, stopped in the entry. Hash, a digest of every field of the state and the hands, every readout of the flight, the dock, the deck, the flight home and the wind, and the inertial state all agree. Shown able to fail: a throttle of 0.999 for 1, a take-off asked for a step later and a wind of 0.999 for 1 each part the flights at the next mark. The digest folds in the parts' own hashes, each shown to cover every field of its part's state, one changed at a time (`hash_covers_the_deck`, `hash_covers_the_return`, `hash_covers_the_fd`, `test_wind`'s `hash_covers_the_wind`). `test_orbit` `deterministic`; `web/test/core.test.mjs` (the same flight twice, WebAssembly and plain JavaScript). The hash once left most of the state out: defect D1, fixed at `a3556c9`. |
| O7 | **Nothing read out is NaN or infinite**, through the crew's whole flight and through a hand-flown abuse run. | The laws clamp their commands; `unit` and `asin` guard their degenerate cases; the atmosphere is floored below ground. | `crew_flight_finite`: every step from brake release to three hours holding off the hub, 577,630 steps; none. `abuse_finite`: the stick, pedals, thrusters and throttle at random and far beyond their stops, infinities included; gear, brakes, hold modes and crew modes at random, modes that do not exist included; on the runway, in the thick of the air, high and fast, in orbit, from both poles and the equator, and on a path that leaves the Earth. 404,689 steps (409,522 in the WebAssembly build, whose crashes come at other times), 180,000 of them abused in flight, 58 crashes (24); none. **But a control that is not a number poisons the state: defect D2.** |
| O8 | **Every readout is derived from the state when it is read, and none is kept apart to drift.** That covers height, speeds, Mach, dynamic pressure, the orbit's top, bottom and inclination, mass, time and window. It covers the Ring's place, axis and spin, and the range, closing rate, relative velocity and hold point that follow from them, and the felt acceleration. | `writeOut` computes all of them from `g`, `site`, `ring` and `sunEci` after every step. | `readouts_are_derived`: 98,630 checks against independent derivations from the inertial state; every one within 0.71 of its bound. The Ring keeps its round 500 km orbit at Kepler's rate (`vcirc-500km`), its axis fixed among the stars and its spin of 0.0443 rad/s. Holding off the hub reads 0.7206 m/s against n × 650 m = 0.7205 (`hold-vrel`). Coasting reads 1.3×10⁻¹⁰ g, and standing 0.998953 g, gravity less the Earth's turn (`felt-g`). A step of none, a second read and the walk's own steps change no readout and no hash. **But the bottom of a path that leaves the Earth reads wrong: defect D3.** |
| O9 | **The Ring's shape is one set of numbers**, `orbit_core.h`'s `OC_RING_*` and `OC_HUB_*`, for the core and the page. It is the shape the README describes: one g at the floor, a turn in 142 s, the roof 300 m over the floor, and the hold point clear of the band. | One header; the page's `RING` copies it. | `web/test/core.test.mjs`, "the ring's shape is the header's" (the page's `RING` deep-equal to the header's defines); `ring_shape` (the shape against the README: `ring-g`, `ring-turn`); `certified_numbers`. **Not enforced:** `web/src/ring.js` draws the spokes' section with a literal 70, not `RING.spoke` (gap G1). |
| O10 | **Every constant and every stated number has a receipt.** | `evidence/` certifies each with Abacus or cites its source. | `certified_numbers` holds the core's constants (μ, R_E, ω_E, g0, the step, the masses, the thrust and its flow, the Ring's spin) equal to the certified values, and the derived numbers the README states to their receipts. Changing a constant fails it, pointing at the receipt to redo. |
| O11 | **Time is the step count.** Time is n × 0.02 s; nothing in the core reads a clock. The page's frames turn wall-clock time into a whole number of steps and drop the debt past a cap. | `stepOnce` advances `n`; `OC_T` is `n * OC_DT`. | `readouts_are_derived` (t = n h, and the window, at every check). That no clock is read: by review only; `core/` includes no clock header. |
| O12 | **Builds agree, but not bit for bit.** The same binary gives the same hash on every run (O6). Native and WebAssembly builds agree to the digits the README prints: `orbit_run`'s hash at 760 s of the crew's flight is `7b2cae00` natively (g++ 13.3.0, glibc 2.39; the audit of `599e051` found its value then the same with clang++ and at any -O level) and `03b21c18` as WebAssembly (Emscripten 6.0.12), with the flight director merged (its memory is in the state, so the hash moves; `oc_flight_hash`, the hash without it, does not) and the deck crew's plans (its plan, its search and what it learns are in the deck's state, which the hash folds in, unset though they are at 760 s; it was `52566ed9` and `bb9074b5` before). The native hash belongs to the C library as well as the code, so it is stated with its toolchain; another libm can give another. The hash moves with any change to the flight or the state, as it should. | The C libraries' sin, cos, exp, pow and atan2 differ in the last bit, and a flight amplifies it. | Both builds run every test above (ctest in `build` and `build-wasm`); `web/test/core.test.mjs` flies both modules to orbit. `web/test/builds.test.mjs` holds the two builds to the same printed table over the crew's 900 s (G3, settled). |
| O13 | **The air pushes off the windward face.** The force normal to the wing (lift and the drag that comes with it, less the drag at zero lift) has the sign of sin α at every angle of attack, flying forward or backward, and lift is odd and drag even in α, at every Mach number. | Polhamus's normal force, K_p sin α \|cos α\| + K_v sin α \|sin α\|, and Newton's 2 sin α \|sin α\|, both have the sign of sin α; lift and drag are its cos α and sin α parts. | `lift_from_the_windward_face`: 0 of 2,148 angles wrong at six Mach numbers. Found by the audit of `c56d77b`: the potential term pointed into the windward face past 155°, in a tail slide or flying backward. |
| O14 | **The insertion's plan is one plan.** The steering the crew keeps, the sine of the thrust's elevation f₀ + f₁t, meets its own cutoff conditions, the vertical speed and the height, over the burn time kept with it. | The 2×2 solve is exact for the burn time it is given; that time is the one kept. | `peg_plan_is_its_own`: 554 plans, each within 4e-12 m/s and 7e-10 m of its own cutoff. Found by the audit of `c56d77b`: the burn time was updated after the solve, and the kept plan missed by up to 15 m/s and 750 m. |
| O15 | **The flight director is the crew's guidance, and changes nothing.** With the director on or off, the same controls give the same flight: the state less the director's own memory, and the place and velocity, bit for bit. Beside the crew to orbit its command is the crew's own, bit for bit; taken over from either crew, its first command is the one that crew would have flown next. | It runs the crews' own functions (`crew()`, `returnCrew()`) on a copy of the state that carries its memory, and writes only `s.fd`. Its `aim` (`internal.h`) is a scratch cleared before and read straight after the law it asks, as `return.cpp`'s model is set from the state at each entry into its guidance: neither carries anything from one step to the next. Its memory is in the state and folded into `oc_hash` after the flight's (`oc_flight_hash` is the hash before it). | `test_fd` `leaves_the_flight_alone`: a pilot's climb (240 marks), the crew's flight to orbit (753), the flight home with a pilot in the entry for a minute (501); equal at every mark. `shadow_is_the_crew`: 37,629 steps to orbit. `takes_up_where_the_crew_left_off` (seven moments of the climb), `takes_up_the_flight_home` (the fall to the air, the entry, the terminal area, final). Shown able to fail: a throttle of 0.999 for a second parts the flights at the next mark; a pitch target spoiled by 0.01° as the climb begins is told apart for 374 steps. |
| O16 | **No wind changes nothing.** With no wind set (the default, and what `oc_reset` leaves), or a strength of 0, the core computes exactly what it computed before the wind existed: every state, hash and readout bit for bit. With a wind, the air pushes by the craft's velocity through the moving air and by nothing else, and the hash covers the wind. | `orbit_core.cpp` takes the wind off the air's velocity behind a branch that is not taken without one, so the arithmetic is the old arithmetic; `windHash` folds the wind in only when there is one. The field is a function of the seed and the strength alone, so a run replays. | `test_wind` `off_changes_nothing`: 4,002 marks of hash and readouts the same with `oc_wind(seed, 0)` said every second and never said, and the field evaluated 0 times. Against the core before the wind (`599e051`): `tools/orbit_fingerprint.cpp`'s 3,756 marks of the hash and every readout block's digest, along twelve flights, identical; and every test program's whole output identical, natively and as WebAssembly. `the_air_pushes_by_the_air_speed` (still air at v − w pushes as the wind at v, to 2 × 10⁻¹⁴), `hash_covers_the_wind`, `replays_in_the_wind`; `windy_ledger` (O3 in a severe wind: the ascent's ledger closes to 4.4 × 10⁻⁵ J/kg, and blind to the wind misses by 7 × 10⁵); `wind_finite` (O7 in a severe wind); `hash_covers_the_state`'s fourth case. |
| O17 | **The crew flying home flies by its instruments.** The guidance reads a copy of the state as its instruments say it is (navigation with no wind in it, the mass and thrust as known, air data below Mach 4 through the moving air) and gives back only its commands. It never reads the wind: it works it out from air data against navigation. For a state and the air data its probes give there, its commands are the same whatever wind lies behind them. | `returnCrew` and `returnEngage` hand the guidance `sense`'s copy and take back `commands`; the copy's wind is cleared, so `localOf` on it reckons still air. | `test_return` `blind_to_the_wind`: from the entry to the stop in a moderate wind, 1,400 steps, the commands the same to the bit with another day's wind behind the same air data; that wind's own air data change them at 483. The hash folds the return's added fields (the refusal, the instruments' settings, the wind worked out, the pass's margin, the lowering) only when one is not as reset: outside the flights home every hash of `orbit_fingerprint`'s marks is as it was at `599e051`. |
| O18 | **The deck crew's plans are what they say, and the plan is the motion.** The solver (`socp.cpp`) returns an answer optimal to its stated tolerances, its residuals and duality gap printed, or a certificate that there is none. The convexification is exact: wherever the drive burns, the thrust per kilogram is σ, the slack, also where the drive's least thrust holds it (Açıkmeşe and Ploen), whose expansion about the plan's reference for its mass falls short of the true floor by under a millionth of it. Each interval of a plan carries its node onto the next as the equations of motion do, and a plan flown open loop in the Earth's gravity keeps to its nodes. A plan's force changes no faster than its rate, from the force the craft has at its start. The oracle's least is the best plan of its discretization (the exact grid of `deck_plan.h`: every window's edge a node, the cost continuous in the length) over the lengths it is searched among, not a bound on every guidance; the crew, under more rules and on its own grid, uses more. The crew keeps no landing's plan that takes the craft under its gate. The plan, the search for its length and what the crew learns of its drive are the deck's state, hashed, and no step makes more than one plan. | The homogeneous self-dual embedding keeps the linear equations satisfied to rounding and Nesterov and Todd's scaling keeps the iterates in their cones; the solve stops on the residuals and the gap, or on a ray. The relaxation is exact at the optimum by the theorem; the least thrust's expansion lies above e^−z where the craft is at least as heavy as the reference and short by about \|d\|³/6 where it is lighter (`deck_plan.h`). The transition is the same linear motion integrated to the interval's end, the tide to first order in the craft's offset. The exact grid gives each piece between edges measured from one end a fixed number of intervals, so its nodes move continuously with the length; the oracle's search scans its bracket before golden section, since the cost need not have one minimum. The oracle bounds nothing: holding the thrust over each interval and taking the drive's bound by its tangent restrict it, holding the cone and the side only at the nodes relaxes it; and its cost falls with the length across its bracket, so the bracket sets its least. The crew's grid rounds its windows to whole intervals, and its cost steps with the length (G15). The crew's rules (15 % of the drive kept back, a price on time, a lit final, a gate) only take freedom away from the oracle's problem. The elastic cone lets a plan be found from anywhere, and near the pad outside the cone is under the deck (G19). | `test_socp`: a projection to 1e-13; certificates of infeasibility and of unboundedness to the solver's feastol; a least-energy transfer to its closed form; a bang-off-bang transfer's delta-v 4.0 to 1e-7 at 20, 40 and 80 steps; the analytic minimum-and-maximum-thrust vertical landing approached as the steps grow; a landing with a least thrust lossless on every interval, 24 at the floor; 40 constructed optima to 1.5e-8; the banded order's answer the dense's to 8.5e-14. `test_deck`: `the_plan_is_the_motion` (7.5e-6 m, 3.8e-7 m/s); `the_coast_is_free` (the crew's first plan flown open loop in the Earth's gravity onto its nodes to 0.039 m over 112 s, 12.4 m off with the tide left out of the plan; the coast flown to 1.6 cm); `every_edge_a_node` (the oracle's windows at every quarter second from 4 to 400 s); `oracle_length_search` (the oracle's cost at every half second from 40 to 400 s: no step, each change within 0.001 m/s of lying between its neighbours', falling all the way; the search on a 1 s scan's least; 295.9 m/s at 1,000 s); `oracle_converges_and_is_lossless` (301.71, 301.51, 301.48 m/s at 40, 80, 160 intervals; ‖u‖ to 2e-9 of σ, 27 lit intervals at the floor and none under it); `least_thrust_expansion` (the crew's floor short by 3e-7 at most); `force_changes_at_its_rate`; `keeps_to_its_side` (59.68 m off the Ring's plane against its 60); `learns_its_drive` (0.0598 learnt of 0.0608); `keeps_over_the_deck` (a placed case: the plan under the deck refused, and the craft lands); `oracle_against_the_crew` (the crew 705 kg to the touch against the oracle's 525 over 40 to 400 s, and its 575 at the crew's own length). `invariants` `hash_covers_the_deck` (each of the deck's 596 fields changed alone moves the hash). Mutations each failing a test, each alone: the plan's Coriolis dropped; its tide dropped from the transitions, or from the plan and `flownAt` both (`the_coast_is_free`, 12.4 m); the least thrust's cone not posed (`oracle_converges_and_is_lossless`, 19 lit intervals under the floor); the spokes' side not kept (`keeps_to_its_side`, 24.2 m); the crew's learning cut (`learns_its_drive`); the plan's first change of force unlimited (`force_changes_at_its_rate`, 20.5 m/s² against a reach of 1.9); the oracle's windows' edges not nodes (`every_edge_a_node`; `oracle_length_search`, a step of 7.2 m/s at 311 s); the throttle's lead cut (`oracle_against_the_crew`, `takeoff_to_the_hold_point`); the refusal of a plan under the gate cut (`keeps_over_the_deck`). Found wanting by the audit of `60e2582`: G15, G16. |

## The tolerances, and where they come from

- **Rounding.** A step rounds r and v to doubles, a unit roundoff u = 2⁻⁵³ of each (`unit-roundoff`).
  Over N steps the energy can drift by at most N · 2u (v² + μ/r) if every rounding falls the same way.
  Brouwer's law (1937) for orbits integrated with unbiased rounding makes it a random walk, √N · 2u (v² + μ/r).
  The bounds use that walk at six standard deviations, and the tests print the worst case beside it.
  Angular momentum takes |r||v| in place of v² + μ/r. Kepler's period moves by 3/2 of the energy's
  relative error (the third law).
- **The ledger.** Over each step the power a·v (or the torque r × a) is integrated twice:
  - by Simpson's rule, through a midpoint state interpolated by cubic Hermite from the step's ends;
  - by the trapezoid rule.

  Simpson's rule and RK4 are fourth order: over a step where the forces are smooth, their errors are
  O(h⁵). The trapezoid rule is second order: its error, P″h³/12, is what its difference from Simpson's
  measures. Where forces change on a time scale τ, each derivative brings a factor 1/τ. So the
  fourth-order errors are smaller than the measured second-order one by a factor of order (h/τ)²/240.

  The bound is (h/τ)² times the summed trapezoid gaps, plus the rounding walk. Here τ is the rate loop's
  0.25 s (a gain of 4 a second in `rateLoop`), the fastest time scale aloft, so (h/τ)² = 0.0064. Step by
  step, every residual aloft sits under that bound, except steps whose gap is itself at the rounding
  level.

  On the runway the gear's contact starts and stops within a step. There RK4 and both rules drop to low
  order together, and a step's residual is of the size of its trapezoid gap. The roll's bound is
  therefore the gap itself, unscaled: the weakest of the ledgers, at 3.7 times its residual. If the rate
  loop's gain rises, τ falls and the bound must follow it.
- **Frames and readouts.** Each is a few unit roundoffs of the quantity compared, scaled where its
  conditioning demands. Heading and roll are divided by the cosine of the pitch (and skipped within 5° of
  the vertical). The orbit's top and bottom are divided by the eccentricity, since e comes from
  1 + 2Eh²/μ² and loses digits as the orbit rounds. The Ring's angles carry a rounding of u times the
  angle the core feeds to sin and cos (spin × t reaches 130 rad).
- **Fixed by physics, not by the integrator.** The drag's loss against the density, to a factor 1.2: the
  angle of attack and the air's turn. Holding off the hub at n × 650 m, to 0.01 m/s: the approach's
  residual motion. The coast's felt acceleration under 10⁻⁹ g, from the thin air's ½ρv²S c_d/m with
  c_d < 0.1. Standing, gravity less the Earth's turn to 10⁻⁴ g.

## Defects: invariants the core broke, now fixed

Each was found with a test on a `// DEFECT:` line of `test_invariants.cpp`, which ctest does not run and
which fails when run by name (`test_invariants defects` runs any that stand). All three fixes landed at
the merge of this pass (`a3556c9`), and their lines are `// TEST:` lines now; what follows is what was
found, as it was found. Each fix below was tried on a copy of the core: the
three tests pass, and so do the other 26, natively and as WebAssembly.

- **D1. The hash is not of the whole state** (O6). `orbit_core.h` calls `oc_hash` "a hash of the whole
  state", but it folds in only n, r, v, q, w, the propellant, the thrust, the phase and the crash. It
  leaves out who flies, what the hold points at, the gear, the hand-flying law's targets, the crew's
  guidance, the hold attitude and the step's commands. It also leaves out the pilot's hands, which
  persist from one call to the next. A crew and a pilot in the same place hash alike (`3d60564d`), and
  40 s later part (`3fa76e3b`, `2d2f7738`); the same holds for two hold modes and two throttle settings.
  So `test_orbit`'s `deterministic`, and the page's "same flight twice", cannot see a divergence in those
  fields until it reaches the position. Test: `hash_covers_the_state`. Fix: fold the missing fields of
  `g`, and `hands`, into `oc_hash`'s array.
- **D2. A control that is not a number poisons the state** (O7). `oc_controls` clamps its arguments, and
  a NaN passes through the clamp. On the runway a NaN in any control but the roll (whose target is held
  at zero on the ground) reaches the integrator. In the air the same holds for any control but the brake
  (which acts only through the wheels). After that every readout is NaN until the next `oc_reset`. The
  house rules (CLAUDE.md, §1) refuse a write outside its range, and the refused write is a no-op.
  Test: `nonfinite_controls_refused`, each of the eight controls on the runway and in the air. Fix:
  `oc_controls` returns at once if any argument is NaN. Infinities are clamped today and stay finite
  (`abuse_finite`).
- **D3. The bottom of a path that leaves the Earth reads wrong** (O8). On an escape path `orbitOf` writes
  the parabola's periapsis, h²/(2μ), for the hyperbola's, h²/(μ(1 + e)). Leaving at e = 1.068, the
  readout says 316.8 km where the path's lowest point is 98.3 km. The page offers the crew's approach
  whenever the bottom reads over 150 km. Test: `escape_periapsis`. Fix: on that branch,
  e = √(1 + 2Eh²/μ²) and periapsis = h²/(μ(1 + e)) − R_E. Related, and undocumented: on such a path
  `OC_APO` reads 10¹² m and `OC_T_APO` 0, and the page's HUD reads an `apo` over 10⁹ as "escape".
  `orbit_core.h` should say so.

The three fixes, as they were tried (`flight/orbit/core/orbit_core.cpp`):

```diff
-    if (energy >= 0) { o.a = 0; o.e = 1; o.apo = 1e12; o.peri = h2 / (2 * MU) - RE; o.tApo = 0; return o; }
+    if (energy >= 0) {   // no top: apo reads 1e12 m and tApo 0; the bottom is the hyperbola's (the parabola's at e = 1)
+        o.a = 0; o.e = std::sqrt(1 + 2 * energy * h2 / (MU * MU)); o.apo = 1e12; o.peri = h2 / (MU * (1 + o.e)) - RE; o.tApo = 0; return o;
+    }
 ...
 void oc_controls(double pitch, double roll, double yaw, double throttle, double tx, double ty, double tz, int gear_down, double brake) {
+    if (std::isnan(pitch) || std::isnan(roll) || std::isnan(yaw) || std::isnan(throttle) || std::isnan(tx) || std::isnan(ty) || std::isnan(tz) ||
+        std::isnan(brake))
+        return;   // refused, not clamped: a value that is not a number has no nearest legal one
 ...
     const double v[] = {(double)g.n, g.r.x, g.r.y, g.r.z, g.v.x, g.v.y, g.v.z, g.q.w, g.q.x, g.q.y, g.q.z,
-                        g.w.x, g.w.y, g.w.z, g.prop, g.thr, (double)g.phase, (double)g.crashed};
+                        g.w.x, g.w.y, g.w.z, g.prop, g.thr, (double)g.phase, (double)g.crashed,
+                        (double)g.gear, (double)g.onGround, (double)g.autoMode, (double)g.sas, (double)g.atmoLaw, g.thetaT, g.phiT,
+                        g.pegF0, g.pegF1, g.pegT, g.pegAt, (double)g.pegValid, g.hold.w, g.hold.x, g.hold.y, g.hold.z, (double)g.holdValid,
+                        g.torque.x, g.torque.y, g.torque.z, g.rcs.x, g.rcs.y, g.rcs.z, g.steer, g.brake,
+                        hands.pitch, hands.roll, hands.yaw, hands.throttle, hands.tx, hands.ty, hands.tz, (double)hands.gearDown, hands.brake};
```

From the audit of `60e2582` (the third), fixed 2026-11-21, each with a test that failed before the fix:

- **D4. The solver certified feasible problems impossible** (O18). Its tests that an iterate is a ray compared
  A'y + G'z with b'y + h'z, and Ax, Gx + s with c'x, and nothing else; with no scaling of the data, an iterate
  near an optimum far from the origin passed them. min t over t ≥ |x|, x = 10⁸ came back PRIMAL_INFEASIBLE at
  the first iteration, the nearest point of a'x = 7 × 10⁹ the same, and min −x₁ over x₁ ≤ x₂ = 10⁸
  DUAL_INFEASIBLE. An iterate now counts as a ray only when the residual is also small against the ray itself,
  the operators' scale times its own size. The deck's problems, solved in their scaled units, were never near
  it: every crew's and oracle's plan comes out bit for bit the same. Test: `test_socp`'s `far_from_the_origin`
  (no certificate for any of the three; the solver, unscaled, ends them NUMERICAL, which says it failed rather
  than that there is nothing; x = 1 with x = 2 still certified infeasible).
- **D5. A crew asked for and refused changed the flight** (the house rule: a refused write is a no-op).
  `oc_auto` reset the pilot's air law and attitude hold, and the flight director took up the guidance afresh,
  before docking, the deck's landing or its take-off could refuse: the pilot flying the climb, a refused DECK
  moved the pitch a second later from 51.78° to 51.85°, and the director's cue jumped. Now only an accepted
  crew does either. Test: `test_fd`'s `refused_changes_nothing` (DECK, TAKEOFF and DOCK, each refused far
  from the Ring: the flight, every readout and the cue the same to the bit as when nothing was asked).

## Not yet enforced

- **G1.** The page's spokes are 70 m square by a literal in `web/src/ring.js`, not by `RING.spoke`; the
  header's `OC_RING_SPOKE_M` could change and the drawing would not (O9). Fix: `new THREE.BoxGeometry(R.spoke, R.spoke, spokeLength)`.
- **G2.** A session on the page cannot be replayed. It steps a wall-clock number of steps per frame and
  logs neither them nor the controls. Replay is the core's promise (O6); a log of (controls, steps) per
  frame would make it the page's.
- **G3.** Settled 2026-11-21: `web/test/builds.test.mjs` runs both builds' `orbit_run` over the crew's
  900 s and holds them to the same printed table, row for row (97 rows; only their hashes differ, O12).
  Without either build it fails and says which, rather than skipping (the third audit: it skipped, and so
  passed having compared nothing).
- **G4.** Settled 2026-11-21: `web/test/builds.test.mjs` scans every file of the core for a clock read or
  an unseeded random number (and shows its check can find one): there are none (O11).
- **G5.** The ledgers restate the force model (`forcesOn`). A force added to the core, docking's contact
  with the Ring for one, must be added there too, or the ledgers fail: on purpose. The wind is restated
  there as the core has it, the air's velocity less `windAt` at each state's time.
- **G6.** Fixed at `a3556c9`: `oc_reset` refuses a non-finite latitude, longitude or heading, as
  `oc_controls` refuses a non-finite stick (D2).

From the audit of `c56d77b`, suspected and not yet settled:

- **G7.** Docking judges the head's slide across the face in the inertial frame, while the HUD's rates are
  in the port's turning frame. Inside the offset tolerance they differ by at most ω × 0.3 m = 0.013 m/s.
  To settle: decide which the latches judge, and compare `C_SLIDE` with the turning-frame rates.
- **G8.** Settled 2026-11-21. The structure sweep's pieces reached 0.8 m, more than half the probe
  ball's 0.15 m radius, so above about 15 m/s the ball could step over a rim wall's lip of no thickness.
  `test_dock`'s `probe_grazes_a_lip` showed it: the craft at rest in the turning frame but for 40 m/s along
  the axis, its nose outward so that only the probe's sphere crosses the plate, 5 cm beyond the lip, and
  nothing touched. Each sphere's path is now cut into pieces of half its own radius, at most 0.8 m, the
  earliest touch of any taken; the probe strikes the rim wall, its head stopped 13 cm short of the plate,
  and 5 cm short of its reach nothing touches. The other spheres' pieces are as they were.
- **G9.** A crash on the ground is judged by the centre of mass's height and the sink rate alone. A
  wingtip reaches the ground at about 25° of bank on the gear, and nothing checks a tail strike, nor the
  side load of a touchdown crabbed into a crosswind (the flight home lands crabbed: it does not de-crab;
  `OC_RET_TD_CRAB_DEG` reports the crab).
- **G10.** In the far pass, beyond 300 km, the Ring and the craft get no haze: sky fragments write
  depth 1.0 and fail the depth test over them. To settle: draw the Ring from the runway.
- **G11.** Settled 2026-11-21. `map-math.js`'s `ringState` took the Ring's orbit normal from r_R × w,
  which is n̂ (r_R · r) and vanishes a quarter of an orbit from the Ring: there it was 0.198 off. Where
  that is ill-conditioned it now takes r × w, which is n̂ for a craft in the Ring's plane, as the crew's
  is; `map.test.mjs` holds it to 10⁻⁹ from 1° to 179° round, 90° included.

From the audit of `599e051`:

- **G12.** Settled 2026-11-21. The page drew parts of the Ring the core did not collide with: the
  radiators, the solar mast and its arrays, and the collar 200 m round the hub; a craft flew through them.
  Their sizes are now the header's (`OC_HUB_COLLAR_*`, `OC_RADIATOR_*`, `OC_MAST_*`, `OC_ARRAY_*`), which
  the page's plan reads through `core.js`'s `RING` (held equal by `core.test.mjs`), and the core strikes
  them (`OC_DOCK_HIT_RADIATOR`, `OC_DOCK_HIT_MAST`; the collar is the hub's). The mast and its arrays do
  not turn with the Ring: the sweep meets them as they stood at each moment of the step, turned to the Sun
  as `ring.js` turns them. `test_dock`'s `collar_is_solid`, `radiator_is_solid`, `mast_is_solid` and
  `arrays_are_solid` each failed before. The crews' ways round the Ring (`dockSafeAim`) still have no eye
  for the radiators, as they have none for the spokes, from a start inside the rim beside the hub's far
  side; the flight home's way out keeps 600 m from the axis there.
- **G13.** Settled 2026-11-21. The invariants did not fly all the newer parts. For the deck, at `99fa102`
  and since: `forcesOn`, the ledgers' force model, puts the drive along its swivelled axis (and its thrust
  as `oc_deck_disturb` makes it) and counts the deck's gear; `deck_flight_finite` scans the crew's deck
  landing and ten minutes parked, and `abuse_finite` flies the deck hold; `hash_covers_the_deck` changes
  each field of the deck's state alone, the crew's plan node by node. Then the replay: its script never
  engaged DOCK, RETURN, DECK or TAKEOFF, and `digest()`, which claimed to be a superset of what `oc_hash`
  folds in, left out DeckState, the nozzle and all of ReturnState but its phase. Now `digest()` lists the
  nozzle and folds in the deck's, the flight home's and the flight director's hashes, which
  `hash_covers_the_return` and `hash_covers_the_fd` show cover every field of theirs (76 of the flight home's;
  23 of the flight director's own and 76 of its shadow's); the marks compare the dock's, deck's, flight
  home's and wind's readouts too; and two scripts fly the rest (O6): `replay_through_the_ring` (DOCK, let
  go, DECK, TAKEOFF, RETURN, the flight director off and on, stopped and resumed in the deck's final burn)
  and `replay_the_flight_home` (RETURN from orbit in a wind to a stop on the runway, stopped and resumed in
  the entry). Both agree bit for bit, in pieces and resumed.

Found while making the guide (`guide/`), 2026-11-12, and by the owner docking:

- **G14.** Fixed at `2d6ed70`. Seen well off the view's axis, the Ring lost the parts nearest the
  screen's edge: in orbit 25 km behind it with the chase camera swung aside, its far arc; docking 235 m
  off the port, a straight cut across the hub's face and a wedge of the port's ring. `slices.js` set the
  Ring's slice's near plane at 0.9 of its nearest distance, but a camera clips by depth along its axis,
  the distance times the cosine of the angle off it. The near planes now come in by the cosine of the
  view's corner angle; `slices.test.mjs` holds a view 40° off the axis to it.

From the audit of `60e2582`, and found while making its fixes:

- **G15.** Settled 2026-11-21 for the oracle; the crew keeps its grid. The plan's grid holds each window (the
  turn before the first burn, the spokes' side, the pointing, the level end, the lit drive, the climb's gentle
  stop) on whole intervals, so that as a plan lengthens an interval leaves a window and the cost falls in a step:
  for the oracle, 4 to 7 m/s at 80 intervals at about 50, 57, 65, 74, 86, 101, 120, 145, 179, 229 and 311 s from
  the hold point; for the crew's own cost, 8.7 and 9.5 m/s at 101 and 145 s. Golden section, which assumes one
  minimum, stopped the oracle on the edge of the last step, at 311 s, and O18 called its 304.7 m/s the least
  propellant any guidance could land with; longer plans cost less, and the grid both restricts and relaxes the
  problem, so it bounds nothing. The oracle is now posed on an exact grid (`deck_plan.h`, `planTimes`, the
  spec's `exact`): every window's edge a node and the pieces between edges keeping their counts, so that its
  cost is continuous in the length (`every_edge_a_node`, `oracle_length_search`); its search scans its bracket
  before golden section, and O18 says what it is. The crew's plans stay on their grid, bit for bit (every line
  the deck's tests print but the restated oracle's and coast's, the pools to every digit, `orbit_run`'s
  7b2cae00), and its cost keeps its steps: from
  the hold point its golden section finds the least's region (403.52 m/s at 112.4 s against a 1 s scan's 403.59
  at 113 s), but nothing makes it find it from every start. Flown on the exact grid, the crew was no surer on
  fresh draws and dearer in its tails (G17, G18, G19; `README.md`).
- **G16.** Settled 2026-11-21. Four tests passed for the wrong reason, each shown by a mutation it survived.
  `the_coast_is_free` survived the tide dropped from the plan, since the crew's tracking and its plans made
  again hid it: now the crew's first plan flown open loop in the Earth's gravity keeps to its nodes, 0.039 m
  over 112 s, and is 12.4 m off without the tide. `oracle_converges_and_is_lossless` counted a lit interval
  with σ = 0 as at the floor, and survived the least thrust's cone not posed: now it counts \|σ − floor\| under
  1 % of the floor and fails on any interval under it (19, with the cone not posed); and it failed an
  INACCURATE solve, which everything else accepts. The spokes' side was never tested: `keeps_to_its_side`
  (59.68 m off the Ring's plane against its 60; 24.2 m with the side not kept). Two mutations killed only by
  narrow margins now each fail a test of their own: the crew's learning cut (`learns_its_drive`: it learnt
  nothing of 0.061, and that landing crashed) and the plan's first change of force unlimited
  (`force_changes_at_its_rate`: 20.5 m/s² against a reach of 1.9). And the least thrust's expansion: its
  comment had the safety backwards; it is conservative only where the craft is at least as heavy as its
  reference, and where the floor is posed on the crew's first plans the craft is lighter and the floor falls
  short by at most 3e-7 of itself (`least_thrust_expansion`).
- **G17.** Found on the exact grid, and not the crew's. Flown on it, the take-off cost 768 kg (730 on the
  crew's grid), and then 804, over its test's 800. A plan made again in a burn could ask, over its first
  interval, for a turn of the force the swivel takes most of that interval to make: the first change is bounded
  by the rate times the interval, where the rule between intervals, the rate times the time between their
  middles, gives half that from a force at a moment; in the climb burn the craft fell 1 m/s off each new plan
  within a second, and the crew made six in 9 s. And in a climb's last 30 s a plan made again with the whole
  drive was held to the gentle stop's 40 % of it, so that the whole-drive try was the try that had just failed.
  Bounding the first change by half the interval and giving the whole-drive try the whole drive brought it to
  726 kg. On the crew's grid neither is needed (730 kg), and neither is made.
- **G18.** Found on the exact grid, and not the crew's. Posed on exact windows, a landing's plan brakes later
  and harder, at its share of the drive until 2 s before the gate, where the crew's grid's level window (3.5 s
  for its 3) leaves the tracking room; the crew met the gate less closely (over the development pool, 1.1 m off
  the plan's end at the median against 0.76, the drift's 90th percentile 1.0 m/s against 0.70). Its
  development pool landed 97 of 100 until its descent was made to settle a low, drifting craft before
  committing; its tails grew to 1,047 kg there and 1,436 kg in the held-out pool (draw 9036: plans made again
  with a later end carried the craft 265 m past the pad, one 197 m outside the elastic cone, and it went round
  at the gate); and on the two later pools it lost a landing each (G19; draw 30043, at the gate a metre low and
  sinking at 1.9 m/s against the plan's 1.5, down at 0.507 m/s). Holding a landing's plan to 70 % of the drive
  in its last 4 s met the gate more closely but lost seven of the hundred.
- **G19.** Settled 2026-11-21. Flown on the exact grid, the crew crashed draw 20060 of the pool drawn then
  (20001 to 20100, flown once): its drive 2.8 % weak, the craft 3.9 % heavy and its swivel lagging 0.25 s, it
  fell off its final burn's plan seven times, plans made again with the whole drive and a later end carried it
  past the pad, and from 130 m over the deck, 35 m past the pad, sinking at 30 m/s and moving away at 28, the
  plan made again at its share of the drive, to the same end, was found only because the cone is elastic
  (`deck_plan.h`): it ran 11 m under the deck, 65 m outside the cone, and the crew kept it, as it kept any plan
  the solver returned. Near the pad the cone's apex is on the deck, and outside the cone there is under the
  deck. Now the crew refuses a landing's plan made again that takes the craft under its gate's height before
  the gate (`deck.cpp`, `overTheGate`): no draw of the four pools comes to one (every deck test and pool flies
  as before), so `keeps_over_the_deck` places the case, 15 m up and 25 m from the pad 9 s before the gate: the
  plan 3.8 m under the deck is refused and the craft lands; with the refusal cut it is kept and the craft
  strikes the deck. The pools check that no plan kept goes under the gate. Not settled by it: nothing holds a
  plan made again to the elastic cone's stated room of 40 m.
- **G20.** Suspected, not settled. Flown once by this crew, the pool drawn while the crew flew the exact grid
  (20001 to 20100) landed 99 of 100 (Wilson 94.6 to 99.8 %), none crashed: draw 20019, the drive 1.4 % weak,
  the craft 0.7 % light and its swivel lagging 0.15 s, touched down at 0.513 m/s, 13 mm/s over the tolerance (a
  firm touchdown). The pool drawn after that (30001 to 30100) landed 100 of 100. A change for 20019 now would be
  tuned on its pool: none is made, and `monte_carlo_held_out_20001` is a defect's test (`// DEFECT:`), run by
  name, which fails while it stands; the 30001 pool's is a test. A change to the descent needs a new pool drawn
  after it.
