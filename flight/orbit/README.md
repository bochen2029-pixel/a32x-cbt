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
| N | | the Moon through a telescope, and back |
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
| the Sun, the Moon and the stars | where they really are on 12 November 2026 from 19:00 UTC, one in the afternoon at KDFW, or on another date; they move with the flight's clock. The Moon's face painted from the real maria and craters; 8,615 real stars ("The Sun and the Moon", below) | Meeus's methods; the IAU's Gazetteer; Wikidata |
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

To come.

### The Sun and the Moon

The flight has a date: 12 November 2026 at 19:00:00 UTC unless the address says otherwise, as
`?date=2026-12-24T03:00Z` (UTC unless a zone is written; 1900 to 2100). That is one in the afternoon at
KDFW, the Sun 38° up in the south-south-west and still 32° up where the crew reaches the Ring; a thin
Moon, 11 % lit, stands 23° up in the south-south-east, 39° from the Sun. From there the sky moves with
the flight's clock, so the Moon goes its half a degree an hour among the stars and the Sun its degree a
day. A date the page cannot take stops it and says why.

The core (`core/sky.cpp`, `orbit_sky.h`) works the sky out from J. Meeus's *Astronomical Algorithms*:
the Sun to 0.01°, the Moon from the whole of his tables to about 10″, the Earth's sidereal time,
precession and nutation, and the Moon's attitude by Cassini's laws, which gives its librations. It gives
them as readouts of their own: where the Sun and the Moon are from the Earth's centre, how far, the Moon's
pole and the middle of its near side, its phase, and the axes of J2000.0 for the stars. The eye is not at
the Earth's centre: from the runway the Moon stands 0.83° lower than from there, and the page draws it
from wherever the eye is. Nothing in the flight depends on the date.

The page (`web/src/sky.js`):

- **The Moon**, a sphere of its true angular size along the true line to it (drawn 80,000 km out, inside
  the far pass, and scaled to match), turned as the core says, its near side to the Earth, lit by the Sun
  at its phase, with earthshine on its night side against a dark sky. Its face is painted by code
  (`moon-face.js`) from the IAU's Gazetteer of Planetary Nomenclature: 44 maria, lacus, sinus and paludes
  at its outlines (two drawn here, where it gives only a box and a circle), every named crater of 8 km
  and more on the near side (4,164) at its place and size, as a bowl and rim after Pike's measures of
  fresh lunar craters, worn by a seeded amount, and rays from Tycho, Copernicus, Kepler, Aristarchus and
  a dozen more. It is drawn before the Earth and its sky, which
  hide it below the horizon and behind the Earth and lay the day's blue over it: from the runway by day
  it is pale, as it is. **N** turns the view to it through a telescope, 1.4° across.
- **The Sun**: its disc is the sky pass's; above the air the page adds a glare (a core, a halo over a few
  degrees, four faint spikes and two lens ghosts), dimmed and reddened where its light grazes the air and
  gone as the Earth covers it.
- **The stars**, 8,615 of them to magnitude 6.5, from Wikidata, at their places for J2000.0 and turned by
  the core's sidereal time, precession and nutation: Orion is where Orion is. Sized and tinted by their
  magnitude and spectral class; seen by night and above the air.
- Two lines in the readouts: the date and time, UTC, and the Sun's and the Moon's height above the
  horizon with how much of the Moon is lit.

From the tests (`test/test_sky.cpp`, `web/test/sky.test.mjs`), against the book's worked examples and
against JPL's Horizons (DE441), which shares nothing with the book:

| | the core or the page | Horizons |
|---|---|---|
| the Sun from KDFW, 2026-11-12 19:00 UTC | az 194.453°, el 37.968° | 194.452°, 37.968° |
| the Moon from KDFW | az 151.806°, el 22.562°, 405,165 km from the Earth's centre | 151.804°, 22.563°, 405,192 km |
| the Moon seen from KDFW, as the page draws it | 11.478 % lit, phase angle 140.393°, 1779.9″ across, the eye over 0.77° E 6.18° N of its globe, its pole 1.03° east of north | 11.481 %, 140.393°, 1779.9″, 0.79° E 6.21° N, 1.04° |
| the full Moon of 2026-12-24 03:00 UTC | az 82.527°, el 43.545°, 99.88 % lit, 2034.5″ across | 82.522°, 43.543°, 99.88 %, 2034.5″ |
| an hour of flight | the Moon 0.4940° among the stars, the Sun 0.0419° | 0.4940°, 0.0420° |
| 2024-04-08 over KDFW, the eclipse | the centres 0.0114° apart at 18:43:21 UTC | 0.0110° at 18:42:32 |
| 2018 to 2034 | the Moon within 7″ and 41 km, the Sun within 21″ | |

What is drawn as the eye sees it rather than as a camera would: the Moon has an exposure of its own and
no tone curve, as an eye adapted to it sees it, the full Moon's highlands at three quarters of white; its
fall with phase is taken at the power 0.35, so a crescent is brighter than a camera would show it; and
earthshine is lifted 250 times from its true ten-thousandth of sunlight, and shown only against a dark
sky. What is not here: the planets; refraction, which lifts the Sun and the Moon half a degree at the
horizon; the Earth's shadow on the Moon in a lunar eclipse and the Moon's on the Earth in a solar one;
moonlight on the ground and in the night sky; the Moon's physical libration (0.04°). The plains' tones,
the craters' wear and the rays' directions are this project's; the maria's outlines and the craters'
places are the Gazetteer's.

`web/data/moon.js` is made by `node flight/orbit/web/tools/moon.mjs <MOON_nomenclature_center_pts.dbf> <pages>`,
and `web/data/stars.js` by `node flight/orbit/web/tools/stars.mjs <slice.csv> ...`; each tool says where its
inputs come from.

### Graphics, from a phone to a big card

To come.

## What is not

Re-entry and landing back. Docking, and any contact with the Ring: the craft flies through it. The
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
