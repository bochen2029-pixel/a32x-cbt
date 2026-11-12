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
| F | | graphics: auto, low, medium, high (also GFX) |
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
| the globe | drawn per pixel: each ray meets the sphere exactly, so it is as round from the runway as from orbit; Natural Earth's coastlines and lakes; a single-scattering atmosphere; land coloured by latitude and a few desert boxes, clouds made up, a clear day over Texas; the towns' lights at night | Natural Earth's coastlines and towns; the rest ours |
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

To come.

### Graphics, from a phone to a big card

The page draws at one of three tiers: **low** for phones and integrated graphics, **medium** for a recent
laptop or an older card, **high** for a desktop card. It places a device from what the device says of
itself (the renderer WebGL names, its largest texture, whether it can draw into a half-float target, the
screen, a finger for a pointer, the memory) and, left to itself, times its first frames and steps down a
tier, or at low draws fewer pixels, when they come slowly. `?q=low|medium|high` in the address chooses a
tier, as do **F** and **GFX** (auto, low, medium, high in turn; remembered). Changing tier rebuilds the
Ring, the craft, the Earth's textures and the stars in place, and the flight goes on. `web/src/quality.js`
holds every tier's settings and the placing; its tests hold each tier complete and no cost lower at a
dearer tier.

| | low | medium | high |
|---|---|---|---|
| the drawing buffer | at most 1.5 device pixels a CSS pixel and 1.3 M pixels; the canvas multisampled | 2 and 2.4 M, into a 4× multisampled half-float target | 2 and 6 M |
| the picture | each material tone-maps itself | kept in HDR: what is brighter than white (the Sun, the lights, the plume, the glint) glows; tone-mapped once | the same, the glow at full size |
| reflections | none | the far scene in a 64-texel cube, every 45 frames, prefiltered | 128 texels, every 15 |
| the Sun's shadow | a soft spot under the craft on the ground | the same | a 2,048 map round the craft: on itself, on the field, on the hub |
| the Earth | land mask 2,048 texels round, night lights 2,048; 6 samples of air, 3 toward the Sun; 3 octaves of detail | 4,096 and 4,096; 10 and 4; 5 octaves; the clouds' shadows, relief, ozone, the glint's facets | 8,192 and 4,096; 16 and 6; 6 octaves |
| the Ring | 192 segments round; textures 512; no relief; the spokes a painted lattice; 120 ribs a wall; 2 rings of lights; the town painted | 384; 1,024; relief; trusses in 140 m bays; 240 ribs; 4 rings; the town's buildings standing | 512; 2,048; 70 m bays; 5 rings |
| the craft | its loft 28 × 20; textures 256; no relief; the plume in 6 samples | 44 × 32; 512; relief; 12 | 64 × 48; 1,024; 24 |

What it costs, measured with Chromium drawing in software (SwiftShader) at 1,440 × 810, the GPU's own
timer round each pass: the times compare the tiers and the passes with each other, not with a graphics
card, and other work on the machine made them noisy (each is the lower of two runs of six frames). The
sketch before this work drew one way only.

| | before | low | medium | high |
|---|---|---|---|---|
| draw calls: runway, orbit at 25 km, the hub at 300 m | 33, 32, 27 | 74, 99, 57 | 88, 114, 73 | 117, 126, 85 |
| triangles in orbit, the Ring at 25 km | 15 k | 25 k | 127 k | 209 k |
| textures | 61 MB | 26 MB | 66 MB | 200 MB |
| render targets | none | none (the canvas multisampled) | 65 MB | 89 MB |
| a frame: runway, orbit, hub | 1.3, 0.6, 0.4 s | 0.5, 1.0, 0.6 s | 2.2, 2.0, 1.8 s | 2.1, 2.1, 3.2 s |
| of which the Earth's pass, on the runway | 1.16 s | 0.39 s | 1.66 s | 1.50 s |

The Earth's full-screen pass is most of every frame; at low it costs a third of the old one on the
runway, where the sky fills the screen. A phone at low draws 585 × 996 pixels for an iPhone 13's screen
(0.6 M, where high may draw 6 M on a large one), 0.33, 0.38 and 0.12 s a frame in the same software,
with an eighth of high's texture memory and no off-screen target.

The picture keeps AgX's roll-off, as the owner's booster-lander-simulator does, with a look a little
punchier than three.js's base (`web/src/pipeline.js`). The Earth's sky, ground and clouds take the
irradiance three.js's own Sun gives the craft and the Ring: before, the ground was lit about six times
brighter than the craft, so the Earth from orbit read pale and the sky from the runway near white. Now a
white cloud and the craft's white paint are alike and the sea is dark blue, as in photographs from orbit.

**The Ring** (`web/src/ring.js`, from the plain numbers of `web/src/ring-plan.js`) keeps RING's shape and
adds what makes it read as built and as big: a panelled hull and end walls with relief, 240 ribs on each
wall and stringers on the hull, three bands of windows on each end wall, a triangular girder standing on
each rim, a yoke across the band where each spoke lands, spokes as square trusses with a lift tube and its
cars, running to the roof, and a lift tower on down to the floor; the roof's glass on frames that are
filtered to the pixel, so at 25 km they grey the glass rather than shimmer; under it the town, its canal,
quays and squares, its streets and buildings, their windows lit out of the Sun, with the rims' shadow
worked out rather than mapped; at the hub radiators between the spokes and a mast of solar arrays held
still against the spin, turned to the Sun; and thousands of small lights (red rims on the port side, green
on the far side, as the sketch always had them) that sell the size from 25 km. The port's face is left as
it was, for docking's markings. **The flight deck**, to the deck's numbers (`RING.deck` where core.js has
it, else the same in `ring-plan.js`): a sector 1,500 m of floor long at 30°, between spokes 0 and 1, open to
space, dark plated, its edges lined and lit and its centreline left for the pads; a bulkhead 20 m thick
at each end, from the floor past the roof's edge and wall to wall, with its hangar door and lights.

**The craft** (`web/src/craft.js`, shaped by `web/src/craft-shape.js`): a blended delta lifting body,
34.3 m from the nose to the bells' mouths and 18 m across; white above with its panel lines, black tiles
below, carbon at the leading edges and the nose; the cockpit's windows; twin canted fins; two bells whose
throats glow; the small thrusters' four quads; red, green and white lights. The plume is a volume marched
along each ray: a hot core as wide as the bell's mouth, the shock diamonds in the air, spaced by how far the
exhaust is from the pressure round it and fading as the air thins, and above the air a broad soft glow.
The wheels still touch where the core's contact points are; a test holds them there.

**The Earth** (`web/src/earth.js`) adds ozone's absorption, a twilight on the ground past the terminator,
the sea's reflection of the sky and the Sun's glint by its waves' slopes (Cox and Munk), broken into
facets close up; a cloud layer 3 km up, swirled, that throws its shadow and is greyer on its side away from
the Sun; a made-up relief in the great ranges; fields near enough to see; the country round KDFW the field's
own olive grass; the airglow's green line at the night limb; and on the night side the towns' lights, from
Natural Earth's populated places (`web/tools/places.mjs` makes `web/data/places.js`). The day stays clear
over Texas, so the reference's cloud deck to climb through is not here.

**The page**: on a touch screen the six buttons used most sit between the stick and the throttle, under
the thumbs, and **MORE** opens the rest; on a desktop the buttons stand in three groups. The panels are
dark glass with shadowed text, legible over a bright sky.

**Depth**: the near pass runs from half a metre to 360 km, and at 25 km a 24-bit depth buffer cannot tell
apart surfaces less than about 75 m from each other. Where the Ring and the near things lie at depths of
their own, each is drawn in a slice of its own (`web/src/slices.js`).

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
