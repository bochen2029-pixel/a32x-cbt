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
| N | | the map: the orbit, the Ring close to, the ground track; shift-N the next of them |
| Y | | sound off, on (it starts on the first key or tap) |

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

To come.

### The Sun and the Moon

To come.

### Graphics, from a phone to a big card

To come.

### The map and the sound

**The map** (`web/src/map.js`; its arithmetic in `web/src/map-math.js`) shows with **N** or MAP, drawn ten
times a second and only while shown; shift-N or its tabs change what it shows.

| view | shows |
|---|---|
| ORBIT | the orbit seen from above the Ring's plane, north up: the Earth with its coastlines, turned as it has turned; the Ring's round orbit; the craft's conic, dim where it runs under the ground, with its highest and lowest points and their heights; KDFW where the Earth has carried it |
| RING | the rendezvous in the frame that turns with the Ring's orbit, ahead to the right and up to the top: the Ring's band as it stands to that frame, the hold point off its hub, the craft and its path over the next revolution, the nearest it comes and when. Its scale steps from 1 to 5,000 km across |
| GROUND | the coastlines on an equirectangular map: the track flown, the next one and a half revolutions with the Earth turning under them, the Ring's track, KDFW |

Beside each view are the numbers a pilot flies by: the time to apoapsis, apoapsis and periapsis, the
inclination and the period, the Ring's range and closing rate, and how far round its orbit the Ring is
ahead. Close to, they add where the craft is from the Ring (ahead, above, aside), its velocity in the
turning frame, and the hold point's range.

The conic comes from the core's own state (`oc_eci`). The core's apoapsis, periapsis, inclination and time
to apoapsis come back out of it to within a metre, a millionth of a degree and half a second. What is to
come is Kepler's problem, two bodies only: no air, no thrust. Over a ten-minute coast it stays within 50 m
of the core's own flight. The Ring's velocity follows from its readouts: the relative velocity the core
gives in the Ring's turning frame is v − n (n̂ × r), which fixes the Ring's orbit normal n̂. On a desktop
the panel takes the largest space the page's other parts leave free. On a touch screen where that is too
small, it covers the readouts and the buttons, since it has its own numbers and a close button, and leaves
the stick and the throttle free.

**The sound** (`web/src/sound.js`, the instrument; `web/src/sound-mix.js`, what it plays as numbers) is
made as it plays by the browser's own Web Audio nodes: no sound file, sample or recording anywhere. A
browser lets a page sound only after the user acts, so it starts on the first key, click or tap; **Y** or
SOUND mutes and unmutes it, the wheel over SOUND sets the volume, and the page remembers both. It only
listens: it reads the readouts and writes nothing back.

The ear is aboard in the cockpit view and with the camera in the others, and what reaches it comes three
ways. Through the air: the drive's roar, its bright edge and its crackle (shocklets at random, up to 900 a
second, more and harder with the throttle), the wind over the skin, an entry's plasma; each as strong as
the air is dense, so the drive fades with height to nothing. Through the structure: the drive's rumble,
a drone and a metallic shear that never resolves, the small thrusters' hiss, the tyres and the runway's
joints (the nose wheel over each, the main wheels 13 m later), knocks; eight hull modes ring under the
load and ring down when the drive stops. This is all there is in a vacuum, felt more than heard. In the
cabin: fans and a 400 Hz hum.

| | what is heard |
|---|---|
| the air | wind rising with dynamic pressure; a rumble through Mach 1, and a thump crossing it; buffet past 14° of α |
| an entry | the plasma's roar and crackle as loud as the stagnation heating (Sutton and Graves: as √ρ v³); a boom going subsonic |
| the gear | tyres and joints, the brakes, a thud and a chirp at touchdown as hard as the sink rate, the legs' motor and lock |
| docking | read from `core.dock.docked` when the docking part gives it: a clunk, the latches, a hiss as the pressures meet; a bang on a hard contact, found from a jolt with nothing pushing |
| a crash | one heavy impact, then silence |
| inside the Ring | a large airy room, six seconds long, its roof 300 m up; the hub quieter |

A camera outside hears only what the air carries to it, late by the time the sound takes (a chase camera
70 m behind hears the drive 0.2 s late), thinned as 1 / r, its high notes taken by the distance first,
and from where the drive is, through a head (HRTF). Past the speed of sound only a camera inside the
drive's Mach cone hears it: in the crew's steep climb the chase camera, trailing level behind, is outside
it and hears only the structure. Above the air nothing comes through the air at all. Time run
faster is played 3 dB quieter at each doubling and not at all from 50×, and the moments only near real
time.

The mix is set so the drive at full power at sea level is the loudest thing: about −20 dBFS root mean
square at the default volume (70 %), its peaks under −8 dBFS; max q −22 to −25, an entry's hottest −26,
full power above the air −30 in the cockpit, the cabin alone −41, a crash's peak −8. Each voice's gain was
measured by rendering it alone on an `OfflineAudioContext` in Chromium, so that one asked for 1 comes out
at 0.1 RMS, and the same renders check that no throttle step or mute clicks, that a note swept across the
hull's modes swells by 6 dB at most, and that the crackle's pressure leans positive outside (the measured
signature of a rocket's), softened through the cabin's wall.

Other parts play their moments through `ctx.sound`:

| call | does |
|---|---|
| `cue(name, params)` | plays a moment: `strike` {strength, hz}, `thump` {strength, from, to, seconds}, `contact` {speed m/s}, `latch` {n}, `capture`, `release`, `hiss` {seconds, strength}, `boom` {n}, `ignition`, `shutdown`, `gear` {down}, `touchdown` {strength, screech}, `crash`, `step` {surface: grass or paving, side, weight}, `door` {open}; each also takes `delay` (s). An unknown name is refused and said once |
| `set(name, value)` | a standing condition: `heat` 0–1 (the entry's heating, in place of the one derived; NaN derives it again), `lift` 0–1 (a lift moving), `walk` m/s (the walker's speed; footsteps follow it), `surface` |
| `scene(name)` | where the ear is: `flight`, `ring`, `hub`, or null to follow whoever draws the frame (the walk's frames are the Ring's) |
| `volume(v)`, `mute(on)`, `on`, `state`, `level()` | the master, and what a test reads: whether it sounds and how loud |

The flight's own moments (the drive lighting and stopping, the gear, a touchdown, the speed of sound,
docking and undocking, a crash) are found from the readouts and need no call.

## What is not

Re-entry and landing back. Docking, and any contact with the Ring: the craft flies through it. The
Ring's inside, its people, anything furnished. Terrain: the globe is smooth and the field flat. The
Ring's orbit decaying, the Earth's oblateness. Propellant for the small thrusters. VR, failures.

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
