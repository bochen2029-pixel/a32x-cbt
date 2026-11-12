# Runway to Ring — the orbit sketch

A sketch, made on the operator's word of 2026-11-12 and outside `ROADMAP.md`'s phases: a spaceplane
that takes off from KDFW 17C like an aeroplane, keeps climbing, reaches a 500 km orbit and closes on a
ring station there, over an Earth drawn round. Nothing is furnished and nothing is finished. It is here
to show that the airframe has the power and the aerodynamics for the trip, and to be flown.

It stands apart from the A320. `flight/orbit` has its own small core (`core/`), links nothing from
A32NX or JSBSim, and changes no file of the Airbus product. Its page reads four of `flight/web`'s
modules, the KDFW drawing, without changing them. It is GPLv3, like everything in `flight/`. It is not
a simulation of any real vehicle and is fit for nothing but a look.

## Open it

Build it (below) and open `flight/orbit/build-web/index.html`. It runs from `file://` and fetches
nothing. Add `?at=775` to the address to start in orbit, or any number of seconds into the crew's
flight.

The crew holds the brakes for 20 s, then flies the whole ascent: 12½ minutes to orbit. Time can be
run faster (`.` or TIME +), or **TO ORBIT** skips ahead. Take the controls whenever you like
(**Space** or CREW), and hand them back the same way: the crew picks up from wherever the craft is.

| keys | gamepad | does |
|---|---|---|
| Space | A | the crew on, or the controls to you |
| W S, ↑ ↓ | left stick | pitch down, up |
| A D, ← → | left stick | bank left, right |
| Q E | right stick | yaw; the nose wheel on the ground |
| Shift, Ctrl; Z, X | triggers | throttle up, down; full, cut |
| I K, J L, U M | d-pad | the small thrusters: fore and aft, left and right, up and down |
| 1 2 3 4 | X cycles | hold attitude, prograde, retrograde, the Ring |
| G, B | Y | gear; brakes |
| T | | in orbit: the crew flies the approach to the hub |
| O | Start | skip ahead to orbit |
| , . | bumpers | time slower, faster (up to 100×) |
| V | B | view: chase, cockpit, from the Ring |
| drag, wheel | | look round the craft, zoom |
| H, Backspace | | help, start again |

On a touch screen: a stick under the left thumb, a throttle under the right, and the buttons.

In the air the stick moves pitch and bank targets that the flight law holds, turning in balance, much as
a fly-by-wire airliner's law does. Above the air (dynamic pressure under 400 Pa) it commands rates
and holds the attitude it is left at, or points where 1–4 say.

## What it does, by the numbers

From the tests (`test/test_orbit.cpp`), the crew's flight:

| | |
|---|---|
| brakes off, rotate, airborne | 20 s, 34 s at 95 m/s, 43 s |
| turn to the launch azimuth, 090 | from 300 m, banked 30° |
| highest dynamic pressure | 36.6 kPa, at Mach 0.8 and 2 km, the throttle eased |
| highest load | 2.09 g, at the end of the burn |
| above the air (q̄ under 1 kPa) | 38.6 km, 192 s |
| engine off, in orbit | 753 s: 500.4 × 499.7 km, inclined 32.84° |
| propellant left | 4.39 t of 30: about 2.7 km/s of Δv |
| the Ring | 25.0 km ahead, closing at 0.3 m/s |
| the crew's approach | 729 s to the hold point, 300 m off the hub's port, on the small thrusters |
| one revolution | 5,669 s, Kepler's period for the orbit to 0.02 s |

## What is in it

| part | how | from |
|---|---|---|
| the Earth | a sphere of 6,371 km, its gravity a point mass's, turning once a sidereal day; the ground level to the local plumb line, so a parked craft stays parked | ours |
| the air | the 1976 standard atmosphere to 86 km; above it, exponentials through the standard's densities at 86, 120, 200 and 500 km (within 20 %). No wind | the standard's, to 86 km; ours above |
| the craft | 60 t, half of it propellant; a delta lifting body, 150 m², 18 m span; Polhamus's lift for a slender delta, blending to Newtonian impact from Mach 1.5 to 5; static and damping derivatives; three gear legs | ours; Polhamus's method |
| the drive | 1.2 × the take-off weight, 706 kN, at 2,000 s of specific impulse: **the one fiction**. At 450 s, the best of chemical rockets, half the craft's mass in propellant would buy 3 km/s, a third of what orbit takes. Thrust follows the throttle with a 0.4 s lag | ours |
| control | a rate loop by dynamic inversion, inside what the surfaces (by dynamic pressure), the small thrusters and the drive's gimbal can give | ours |
| the crew | take-off, climb, a pitch schedule through the air, then a cut-down version of the Shuttle's powered explicit guidance: the sine of the thrust's elevation linear in time, solved each step so that the burn ends at the Ring's height with no climb left and a round orbit's speed | ours, after the Shuttle's method |
| the Ring | 5 km in radius, a 1 km band, spinning at 0.0443 rad/s for 1 g at the floor; a roof 300 m above it, six spokes, a hub with its port 350 m out along the axis. In a round 500 km orbit in the crew's plane, 25 km ahead of where the crew arrives: the core flies the crew once at reset to find that place. Its axis is fixed among the stars, as a spinning wheel's is | ours |
| the Sun | 12 November at 1 pm local solar time at the start (declination −17.9°), fixed among the stars for the flight | ours |
| the globe | drawn per pixel: each ray meets the sphere exactly, so it is as round from the runway as from orbit; Natural Earth's coastlines and lakes; a single-scattering atmosphere; land coloured by latitude and a few desert boxes, clouds made up, a clear day over Texas | Natural Earth's coastlines; the rest ours |
| KDFW | `flight/web`'s drawing of the field, unchanged | `docs/provenance.md`, 1f |

The readouts give the relative velocity to the Ring in the frame that turns with its orbit, so a craft
keeping station in the same orbit reads zero. The Ring's own frame does not turn that way, so a craft
holding off its hub reads about 0.7 m/s there.

## The parts, and what is coming

The core is one program in parts, each with its own header, readouts and tests: `core/orbit_core.cpp`
(the flight, the crew to orbit, the approach), `return.cpp` (the flight home), `dock.cpp` (docking and
contact with the Ring), `walk.cpp` (a person inside the Ring); `internal.h` is what they share. The
page is the same: `web/src/main.js` flies and draws, and each further part is a module of its own
(`web/src/features.js` lists them and says what each may do). The Ring's shape is one set of numbers,
in `orbit_core.h`, that the core and the drawing both use.

### Docking

To come.

### The walk

To come.

### The flight home

**RETURN** (R) hands the craft to the crew to fly home to KDFW 17C from wherever it is in orbit: the
insertion orbit, held off the Ring's hub (it backs away first, on the small thrusters), docked (it lets
go of the port first), or an orbit the pilot has changed. The crew waits for a pass from which the
runway can be reached, burns tail first, falls to the air, flies the entry nose high and banked, glides
round a circle onto a long final from the north, and lands under power. The wait can be most of a day:
**RETURN** again, or TO ORBIT, skips ahead to a minute before the burn. Space takes the controls at any
point and gives them back; the crew picks the flight home up from wherever the craft is.

How it flies (`core/return.cpp`). Nothing in it writes where the craft is: it commands body rates, the
throttle, the gear and the brakes, as the crew to orbit does, and if its guidance cannot solve the
flight, the craft does not arrive.

- **The plan.** The orbit's plane stands still among the stars while the Earth turns KDFW under it.
  KDFW lies at almost the orbit's inclination, so it passes close to the plane once a day, under the
  orbit's northernmost point. The entry can reach about 1,500 km either side of the plane, and from
  21,000 to 31,000 km along the track after the burn, by how much of its lift it banks away. Within
  1,200 km, the plan's limit, the runway is in reach for about 3½ hours either side of that daily
  passing: four or five passes a day, and a wait of up to about 19 hours. The plan shoots a trial
  entry, finds pass by pass the burn time that puts its end abeam the runway, then shoots the first
  pass in reach properly, moving the burn until the shot, flown with the entry's own law, ends at the
  gate. A pass just missed is still taken by burning at once and banking more. The plan is made again
  every ten minutes while the craft waits.
- **The burn.** Tail first at 30 % thrust, until the orbit's low point is 60 km: cut on the orbit
  flown, not on a clock. 121 to 127 m/s from the round orbit.
- **The entry.** Nose 40° above the air's flow (easing below Mach 5 to hold the lift coefficient),
  the bank's size setting the range: every 2 s a predictor flies the rest of the entry with the core's
  air and lift, and a corrector moves the bank until the predicted end is the gate, 200 km of path short
  of the threshold at 800 m/s. The bank's side sets the cross-range: it reverses when the runway's
  bearing drifts past a deadband of 8 to 12°. A feedback on the sink rate keeps the glide from skipping,
  and the bank is held to what the equilibrium glide allows inside the limits.
- **What it learns.** Each step it feels its own acceleration (the change in velocity, less gravity and
  the known thrust) and compares the drag and lift in it with its model's. Two pairs of fading-memory
  filters keep the ratios. Against the model's air, they scale the entry's predictor and law; against
  the air data's dynamic pressure, below Mach 4, they correct the coefficients the glide and the
  approach fly by.
- **The terminal area.** From Mach 2.6 and about 31 km: a glide to a circle of 5 km radius that touches
  the extended centreline 14 km north of the threshold, round it, and onto the final, the energy spent
  by angle of attack; whole turns round the circle when too high.
- **The approach.** The drive relit at low throttle: level until the 3° glide path comes down, then
  down it as an airliner flies it, gear down, the speed held by the throttle; a flare from 12 m, the
  wheels on, the nose lowered, the brakes, the nose wheel on the centreline. The lateral law feeds
  forward the Earth's turn, which pushes a craft flying south at 100 m/s 8 mm/s² to the right.

The limits (`orbit_return.h`, chosen; the guidance keeps 15 to 20 % inside them): heat 600 kW/m² at the
stagnation point of a 1 m nose, where the skin in radiative equilibrium (emissivity 0.85) is at 1,880 K,
about 1,600 °C, the range reinforced carbon–carbon, the Shuttle's nose cap, is made for; 2.5 g; 20 kPa
of dynamic pressure. The heat flux is Sutton and Graves's; the readouts give it, its peak, its sum, the
skin's temperature and a glow for the page.

From the tests (`test/test_return.cpp`):

| started | burn | entry interface | touchdown | heat, peak | load, peak | propellant |
|---|---|---|---|---|---|---|
| at insertion, 800 s | 2,675 s, 127 m/s | 4,754 s, 11,200 km out | 7,881 s, 2.0 h later | 387 kW/m², 1,683 K | 1.63 g | 1.12 t |
| a pass just missed, 2,620 s | 2,790 s, 127 m/s | 4,869 s | 7,870 s | 412 kW/m² | 1.66 g | 1.12 t |
| after the day's last pass, 3,700 s | 69,696 s (the runway 1,028 km off the plane) | 71,775 s | 74,679 s, 19.7 h later | 389 kW/m² | 1.65 g | 0.47 t |
| off the Ring's hub, 1,600 s | 2,766 s, 121 m/s | 4,731 s | 7,865 s | 387 kW/m² | 1.65 g | 1.11 t |
| the far side raised to 806 km | 71,731 s, 196 m/s | 74,198 s | 77,343 s | 387 kW/m² | 1.68 g | 1.34 t |

Every one touches down 429 to 437 m past the threshold, 0.07 m left of the centreline, sinking 0.74 m/s
at 99 to 100 m/s, and stops 2.1 km down the runway on its centreline. Peak dynamic pressure 9.0 to
9.4 kPa. The tests also start it from six times round the day, from a lowered orbit, with the pilot
taking the controls in the entry, the glide and on final and giving them back, and with the
guidance's model wrong at the corners of the box below. They check that the same inputs give the same
flight, and that the guidance's model of the craft is the core's (to 4 × 10⁻⁴ g).

**Robustness.** The guidance's model of the air and the craft made wrong while the craft flies the
core's own (`oc_return_model_error`): the density off by a factor and a wave of 12 km in height, the
lift and drag coefficients each by a factor, all drawn at random, with the return started anywhere in
a day. A landing counts when it touches down in the first 900 m, within 3 m of the centreline, sinking
under 2 m/s, stops on the runway and stays inside the limits. Pools 1 and 2 were flown while the
guidance was being built, and it was changed after them; 2026 and 2027 were drawn afterwards and flown
once, with nothing changed since.

| pool | the guidance's model wrong by, each drawn evenly | runs | landed | 95 % interval |
|---|---|---|---|---|
| 1, while building | density ×0.75 to 1.25 and a wave of up to 15 %; lift and drag each ×0.9 to 1.1 | 64 | 64 | 94.3–100 % |
| 2026, held out | the same | 200 | **200** | **98.1–100 %** |
| 2, while building | density ×0.6 to 1.4 and a wave of up to 25 %; lift and drag each ×0.8 to 1.2 | 64 | 60 | 85.0–97.5 % |
| 2027, held out | the same | 100 | **91** | **83.8–95.2 %** |

Every landing in them touches down 424 to 437 m past the threshold, 0.07 m left of the line, sinking
0.73 to 0.74 m/s: once the approach has learned the coefficients it flies the same. Peak heat 308 to
517 kW/m², peak load 1.49 to 2.11 g, peak dynamic pressure 10.2 kPa at most. Every run lost had a model
whose lift over drag was off by more than a factor of 1.2 either way (×0.74 to 0.80, ×1.22 to 1.45): the
entry's reach then fell short of where the plan, made in orbit before anything could be learned, sent
it. In the wide pools, 118 of 118 runs with that factor within 1.2 landed; beyond it, 15 of 16 where the
runway lay within 700 km of the plane, and 18 of 30 where it lay 1,000 km off, on the first pass of the
day's window, the one most starts take. The plan takes the first pass in reach; preferring a nearer
pass, one or two later, would buy margin for an hour or three of waiting.

Run it: `flight/orbit/build/test_return monte_carlo <first> <count> <pool> [density wave coefficients]`
prints a line for each run and the rate with a 95 % Wilson interval; shard a pool across processes by
`first`.

What is weak. The plan's reach (1,200 km off the plane) and its search are for round orbits and
moderately eccentric ones: an orbit raised to 1,475 km is planned, one to 2,650 km is not. A craft
dropped into the air beyond the entry's reach glides toward the runway and comes down short; there is
no landing elsewhere. Every dispersed landing ends almost the same, because the entry delivers the same
gate and the approach learns the coefficients: winds, a different runway or a failure would test the
terminal area as the dispersions do not. The predictor knows the craft's mass exactly and has no sensor
noise. Seen from the chase view, the trail's near end can show as pale bands against a bright limb.

### The Sun and the Moon

To come.

### Graphics, from a phone to a big card

To come.

## What is not

Docking, and any contact with the Ring: the craft flies through it. The
Ring's inside, its people, anything furnished. Terrain: the globe is smooth and the field flat. The
Ring's orbit decaying, the Earth's oblateness. Propellant for the small thrusters. Sound, VR, failures.

## Build and test

The core and its tests, natively:

```
cmake -S flight/orbit -B flight/orbit/build
cmake --build flight/orbit/build
ctest --test-dir flight/orbit/build --output-on-failure
```

The same as WebAssembly, with Emscripten 6.0.12 (`docs/provenance.md`, 2b), and its tests under node:

```
emcmake cmake -S flight/orbit -B flight/orbit/build-wasm
cmake --build flight/orbit/build-wasm
ctest --test-dir flight/orbit/build-wasm --output-on-failure
```

That build also makes `orbit_core_plain.js`, the core as plain JavaScript, which the page runs and says
so where a host will not run WebAssembly. Emscripten marks that mode (`-sWASM=0`) as deprecated.

The page, which uses `flight/web`'s three.js and esbuild (`npm ci` in `flight/web` first), and its tests:

```
node flight/orbit/web/tools/build.mjs --core flight/orbit/build-wasm/orbit_core.js --core-js flight/orbit/build-wasm/orbit_core_plain.js
node --test flight/orbit/web/test/
```

`build-web/index.html` is the whole page in one file, about 1 MB; `build-web/page.html` is the same
without the document's skeleton, for a host that wraps a page in its own.

Each part's tests are `test/test_<part>.cpp`, and ctest runs each test by the name it declares in a line
reading `// TEST: <name>` (`ctest -R dock` runs docking's). `flight/orbit/build/orbit_run 10 900` prints
the crew's flight every 10 s for 900 s.
`web/data/land.js` is made by `node flight/orbit/web/tools/land.mjs <ne_50m_land.geojson> <ne_50m_lakes.geojson>`.

The core is deterministic: the same inputs give the same state, and the tests check it by a hash of the
state. Native and WebAssembly runs agree to the digits printed above, not bit for bit.
