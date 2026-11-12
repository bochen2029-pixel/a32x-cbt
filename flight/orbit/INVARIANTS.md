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
| O5 | **One frame, three ways.** The inertial frame, the Earth-fixed frame (turned ω_E t about the pole) and the site's east, north and up are one frame. The reported site position, carried back, is the inertial position; latitude, longitude and height are that point's. The body-to-site quaternion is unit, its axes orthonormal and right-handed, and they give the heading, pitch and roll reported. The Ring's axis and reference are unit and square. The Sun stays fixed among the stars. The core's two copies of the transform agree. A sidereal day brings the frame back. | Each readout is computed from the inertial state by rotations; a rotation preserves lengths and angles. | `frames_round_trip`: every step of the crew's flight and 1,000 s of approach, 87,630 in all, each check within 0.63 of its bound (a few unit roundoffs). Shown able to fail: the Earth's turn read one step late misses by 7.8 m. `web/test/frames.test.mjs` holds the page's copy. |
| O6 | **Determinism and replay.** The same inputs give the same flight, bit for bit: in one call between inputs, in pieces of any size with every readout read between them, or stopped part way, the core used for another flight, and resumed by re-stepping the inputs from the start. Reading changes nothing. | The core advances only in whole fixed steps. It reads no clock and keeps no state outside `g`, `site`, `ring`, `sunEci` and `hands`, all set by `oc_reset` and the inputs. Its arithmetic is IEEE doubles in a fixed order. | `replay_and_resume`: 17 marks over 64,000 steps of a script with a pilot's turn, the crew taking over, the approach and the thrusters. Hash, a digest of every field of the state and the hands, every readout and the inertial state all agree. Shown able to fail: a throttle of 0.999 for 1 parts the flights at the next mark. `test_orbit` `deterministic`; `web/test/core.test.mjs` (the same flight twice, WebAssembly and plain JavaScript). **But the hash does not cover the state: defect D1.** |
| O7 | **Nothing read out is NaN or infinite**, through the crew's whole flight and through a hand-flown abuse run. | The laws clamp their commands; `unit` and `asin` guard their degenerate cases; the atmosphere is floored below ground. | `crew_flight_finite`: every step from brake release to three hours holding off the hub, 577,630 steps; none. `abuse_finite`: the stick, pedals, thrusters and throttle at random and far beyond their stops, infinities included; gear, brakes, hold modes and crew modes at random, modes that do not exist included; on the runway, in the thick of the air, high and fast, in orbit, from both poles and the equator, and on a path that leaves the Earth. 419,021 steps (436,630 in the WebAssembly build, whose crashes come at other times), 180,000 of them abused in flight, 149 crashes (130); none. **But a control that is not a number poisons the state: defect D2.** |
| O8 | **Every readout is derived from the state when it is read, and none is kept apart to drift.** That covers height, speeds, Mach, dynamic pressure, the orbit's top, bottom and inclination, mass, time and window. It covers the Ring's place, axis and spin, and the range, closing rate, relative velocity and hold point that follow from them, and the felt acceleration. | `writeOut` computes all of them from `g`, `site`, `ring` and `sunEci` after every step. | `readouts_are_derived`: 98,630 checks against independent derivations from the inertial state; every one within 0.71 of its bound. The Ring keeps its round 500 km orbit at Kepler's rate (`vcirc-500km`), its axis fixed among the stars and its spin of 0.0443 rad/s. Holding off the hub reads 0.7206 m/s against n × 650 m = 0.7205 (`hold-vrel`). Coasting reads 1.3×10⁻¹⁰ g, and standing 0.998953 g, gravity less the Earth's turn (`felt-g`). A step of none, a second read and the walk's own steps change no readout and no hash. **But the bottom of a path that leaves the Earth reads wrong: defect D3.** |
| O9 | **The Ring's shape is one set of numbers**, `orbit_core.h`'s `OC_RING_*` and `OC_HUB_*`, for the core and the page. It is the shape the README describes: one g at the floor, a turn in 142 s, the roof 300 m over the floor, and the hold point clear of the band. | One header; the page's `RING` copies it. | `web/test/core.test.mjs`, "the ring's shape is the header's" (the page's `RING` deep-equal to the header's defines); `ring_shape` (the shape against the README: `ring-g`, `ring-turn`); `certified_numbers`. **Not enforced:** `web/src/ring.js` draws the spokes' section with a literal 70, not `RING.spoke` (gap G1). |
| O10 | **Every constant and every stated number has a receipt.** | `evidence/` certifies each with Abacus or cites its source. | `certified_numbers` holds the core's constants (μ, R_E, ω_E, g0, the step, the masses, the thrust and its flow, the Ring's spin) equal to the certified values, and the derived numbers the README states to their receipts. Changing a constant fails it, pointing at the receipt to redo. |
| O11 | **Time is the step count.** Time is n × 0.02 s; nothing in the core reads a clock. The page's frames turn wall-clock time into a whole number of steps and drop the debt past a cap. | `stepOnce` advances `n`; `OC_T` is `n * OC_DT`. | `readouts_are_derived` (t = n h, and the window, at every check). That no clock is read: by review only; `core/` includes no clock header. |
| O12 | **Builds agree, but not bit for bit.** The same binary gives the same hash on every run (O6). Native and WebAssembly builds agree to the digits the README prints: `orbit_run`'s hash at 760 s of the crew's flight is `b99122c4` natively and `a1f26a3c` as WebAssembly. | The C libraries' sin, cos, exp, pow and atan2 differ in the last bit, and a flight amplifies it. | Both builds run every test above (ctest in `build` and `build-wasm`); `web/test/core.test.mjs` flies both modules to orbit. **Not enforced:** no test compares the two builds' numbers on one flight against a stated tolerance (gap G3). |

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

## Defects: invariants the core breaks today

Each has a test, named on a `// DEFECT:` line of `test_invariants.cpp`. ctest does not run those lines,
so the suite stays green, but each fails when run by name (`test_invariants defects` runs all three).
When a fix lands, its line becomes a `// TEST:` line. Each fix below was tried on a copy of the core: the
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

## Not yet enforced

- **G1.** The page's spokes are 70 m square by a literal in `web/src/ring.js`, not by `RING.spoke`; the
  header's `OC_RING_SPOKE_M` could change and the drawing would not (O9). Fix: `new THREE.BoxGeometry(R.spoke, R.spoke, spokeLength)`.
- **G2.** A session on the page cannot be replayed. It steps a wall-clock number of steps per frame and
  logs neither them nor the controls. Replay is the core's promise (O6); a log of (controls, steps) per
  frame would make it the page's.
- **G3.** No test holds the native and WebAssembly builds to a stated agreement on one flight (O12). The
  README's "agree to the digits printed above" is true today but unwatched.
- **G4.** That the core reads no clock is held by review alone (O11).
- **G5.** The ledgers restate the force model (`forcesOn`). A force added to the core, docking's contact
  with the Ring for one, must be added there too, or the ledgers fail: on purpose.
- **G6.** `oc_reset` takes a NaN latitude, longitude or heading as readily as `oc_controls` took a NaN
  stick (D2). The page passes constants, so nothing reaches it today.
