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
| 1 2 3 4 5 | X cycles | hold attitude, prograde, retrograde, the Ring, the hub's port |
| G, B | Y | gear; brakes |
| T | | in orbit: the crew flies the approach to the hub |
| P | | in orbit near the Ring: the crew docks at the hub; docked, let go |
| O | Start | skip ahead to orbit |
| , . | bumpers | time slower, faster (up to 100×) |
| V | B | view: chase, cockpit, from the Ring |
| F | | the Moon through a telescope, and back |
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

The craft's port is a probe on its nose, on the docking axis (body x), its head 18 m ahead of the centre
of mass and 2 m past the nose. There the pilot looks straight down the axis from the cockpit, the laws
that point the nose point the port, and the thrusters' fore and aft (I K) close and open; a port on the
back would want a second view and a pilot flying sideways. The hub's port is a drogue, a cone with a
socket, at the centre of the hub's face on the Ring's axis, painted round with a target 36 m across: a
bullseye, an alignment cross, and the key, a broad orange bar toward the Ring's ref, with ticks round the
edge. The face turns with the Ring, 2.54°/s, once in 142 s.

To dock is to line up on the axis, roll into phase with the key and turn with it, right wing down at the
Ring's spin, and close slowly. The latches catch the probe's head only if, as it first meets the face:

| | to be caught | why |
|---|---|---|
| closing | 0.03 to 0.30 m/s | slower does not trip the latches; faster, the probe's rebound takes the head out before they close. The crew's 0.1 m/s is the middle on a scale of ratios |
| off the port's centre | under 0.30 m | the drogue's mouth is 0.6 m across, and its cone guides a head in from anywhere inside it |
| across the face | under 0.10 m/s | a head sliding over the mouth skids past it |
| the nose off the axis | under 3° | further, the probe binds in the cone |
| the key out of phase | under 2° | the latches and the hatch's pins must meet |
| the spin against the port's | under 0.30°/s | in the 6 s the latches take to draw the craft in, the key then drifts under 2° |

Outside them the head bounces off the face on the probe's spring and damper: a period of 1.26 s, three
tenths of critical damping, and the craft comes away at about half the speed it came in. A contact that
uses the probe's whole 0.4 m stroke, about 3 m/s, is a crash. Caught, the craft is drawn in over 6 s;
docked, it is part of the hub: its place, velocity, attitude and rates are worked out from the Ring's at
every step, never integrated, so nothing drifts. Letting go (P, DOCK) pushes it off at 0.15 m/s along
the axis, still turning with the port under the hold on the port; 1, the attitude hold, stops the turn.

Every other part of the craft is a few spheres (the probe, the nose, the body, the wingtips, the tail),
swept along each step against the Ring: the band from the roof out to the hull, the rim walls and their
lips, the six spokes, the hub. A touch is a crash, the status line says what hit what, and the wreck
stays where it struck, turning with the Ring. Between the spokes, and out through the rim's opening, the
way is free.

**The crew's docking** (P, or DOCK, in orbit within 50 km of the Ring and passing it at under 50 m/s in
the frame turning with its orbit; elsewhere the page says why not): to the hold point, round the outside
of the Ring when the craft is beyond it or inside it, then on to the axis, into phase with the port, in at
1 m/s easing to 0.1 m/s from 20 m, and the catch. The approach (T) goes round the Ring the same way.

**By hand**: 5 holds the craft on the port, lined up and turning with it, so the hands fly translation
only (I K, J L, U M). The cockpit view (V) carries a docking reticle. Its crosshair is the docking axis,
set where it meets the port's face; the port's alignment cross stands where the port is from the probe's
head and turns with the key; a ring shows where the port's axis points; an arc shows the port's turn
against the craft. Offsets and angles are on a soft scale, so a centimetre and a hundred metres both
fit. Each mark is green inside the catch's tolerance and amber outside it. The HUD carries the same
numbers, and the status line the crew's progress or the pilot's.

From the tests (`test/test_dock.cpp`):

| | |
|---|---|
| the crew, from the hold point | lined up in 9 s, caught at 337 s, docked at 343 s: 1.00 m/s easing to 0.10 m/s at the face, within 1 mm of the axis |
| the crew, from where it reaches orbit, 24.6 km out | docked in 1,058 s |
| the crew, from inside the Ring's far end | out of that end, round the hull 5.5 km from the axis, docked in 898 s |
| docked for 10 minutes | the probe's head within 4e-9 m of the port, the nose and the key within 1e-15 rad, the spin the Ring's |
| let go | 3.15 m off the face 20 s on, opening at 0.165 m/s, still turning with the port |
| by hand, on the keys, under the hold on the port | caught 339 s from the hold point, at 0.10 m/s, 0.03 m off the centre |
| in at 1.5 m/s | a bounce: 0.20 m of the stroke, away at 0.69 m/s; in at 5 m/s, a crash at the port |
| 1 m off the centre; at 0.015 m/s; not turning with the port | not caught: off the centre; too slow, then caught at 0.1 m/s; the key out of phase |
| into the roof, a rim wall, a spoke, the hub | a crash, and what hit: the right wing, the probe, the tail, the left wing |
| along the axis beside the hub, between two spokes and out | nothing touched, 199 m from a spoke's line |
| 48 km behind, drifting 16 m/s in the orbit's frame | docking engages; by the plain difference of velocities it would read 52 m/s |

Every number here is chosen to make a docking that can be flown from a keyboard and fails where it is
flown badly. None of them describes a real docking system.

### The walk

Off the craft, through the hatch into the hub, down a spoke in a lift, and out onto a floor that curves up
ahead and behind until it meets itself overhead. The walk has its own core, `core/walk.cpp` (`orbit_walk.h`),
on the flight's fixed steps, and its own page, `web/src/walk-view.js`, which draws the whole frame while
walking. **Enter** (or WALK) starts it when the craft is docked at the hub; until docking is built, add
`?walk` to the address (`?walk=lift` starts in lift 1's car, `?walk=floor` on the floor by it). At the
hatch, **E** goes back aboard and the flight returns.

| keys | gamepad | touch | does |
|---|---|---|---|
| W S, ↑ ↓; A D | left stick | the stick | walk; step aside |
| ← →, drag, or a click to hold the mouse (Esc lets go) | right stick | drag | turn and look |
| Shift | B | RUN | run |
| Space | A | JUMP | jump |
| E, Enter | X | USE, WALK | ride a lift, call one, go back aboard at the hatch |
| F, G | Y | BALL | drop a ball; throw one |
| , . | bumpers | TIME − + | time 1× to 50× (the lift takes 5½ minutes) |
| Backspace, H | | RESTART, HELP | back to the hatch; help |

The physics is the ring's turning frame and nothing else: a body in it feels the centrifugal pull ω²r
outward and Coriolis's −2ω×v, and whatever holds it. Seen from outside, a body let go goes straight, and the
tests (`test/test_walk.cpp`) work each motion out again that way and hold the two equal:

| | |
|---|---|
| standing on the floor | 1.0004 g; at rest nothing moves in five minutes |
| walking at 1.4 m/s | the floor pushes 1.27 % harder going spinward, 1.26 % softer against: 2ωv, and v²/r besides |
| a 1 m jump | 0.903 s, and it comes down 53.3 mm **spinward**, on the straight line outside to 1e-9 m. On the Earth a jump lands to the west, against the spin; in the ring, up is toward the axis, so a jumper's turn about it speeds up on the way up |
| a ball dropped from 2 m | 0.639 s, and it lands 37.7 mm antispinward of straight below |
| a ball thrown at 12 m/s, 34° up | 14.6 m spinward, 16.7 m antispinward: lighter that way |
| the hub's lobby, 150 m from the axis | 0.03 g. A jump is a leap of 25 m that lasts 21 s and comes down 38.5 m spinward |
| the legs | push up to 4 m/s² on the rim; where the weight is next to nothing the soles are the limit, μ times it (the lobby's grip floor adds 1 m/s²) |
| the lift, hub to floor | 334 s: ω²r at each height, 0.19 g at 560 m, 0.82 g at 4 km; pushed sideways at 2ωv, 1.5 m/s²; at rest at the floor at one g; up the same |
| the floor's plan | 1,824 solid things: 1,500 low blocks, 240 parapets along the canal and across it at the bridges, the spokes' feet, the lifts' shafts |

The lift's ride is chosen for its riders. Coriolis's push 2ωv is sideways and the same at any height, so the
cruise is the speed that holds it to 1.5 m/s², 16.9 m/s. At the hub the riders weigh three hundredths of a g,
and a car that left faster than they fall would leave them on its ceiling: it leaves, and arrives, at half
their weight, which makes its distance from the axis a hyperbolic cosine in time. At the floor it starts and
stops at 1 m/s². While it moves the riders hold its rail.

The page draws three passes: the real sky first, the flight's own far scene (the ray-cast Earth, its air,
the stars), from where the eye is in the site frame as the ring turns once in 142 s; then the ring's inside
over it, far (40 m to 16 km) and near, in the ring's frame, built from the core's plan so the walker meets
what is drawn. The floor is painted from where it is (grass, the canal's promenade, streets and bridges, the
spokes' plazas, lanes, paths under the walls); the blocks carry storeys and windows; the roof is glass on a
lattice with lamps along it. The Sun lights the band only where it gets in over a rim wall's top, worked out
for each pixel, with the lattice's soft shadow: on the 12th of November it stands 23.7° out of the ring's
plane, so the middle of the band has about 50 s of sunlight in each turn and the strip under the wall on the
Sun's side none. A fill from the roof's lamps lights the rest, and the band's air hazes what is seen through
it. The view leans a quarter of the way toward the felt up, so the lift's sideways push is felt.

Not in the walk: people, furnishing, doors into the blocks (they are solid), water to swim in (the parapets
keep the walker out), shadows of the blocks, the spokes and the hub on the floor, the Earth's light, the way
from the port to the hatch, the Earth's tide across the ring (six parts in ten thousand of a g).

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
  it is pale, as it is. **F** turns the view to it through a telescope, 1.4° across.
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

### Rigour

`INVARIANTS.md` writes down what the core promises, in the owner's manner from Subsim: each rule with
why it holds and what enforces it. The rules cover conservation in a vacuum, thin air as the only loss
in orbit, work and energy on the ascent, the propellant's bookkeeping, one frame seen three ways, replay
bit for bit, readouts that are finite and derived from the state, the Ring's one set of numbers, and a
receipt for every number. `test/test_invariants.cpp` holds them as physics, with tolerances derived from
RK4's order and the steps' rounding, and shows each check able to fail (`ctest -R invariants`). Its
`// DEFECT:` lines are three invariants the core breaks today, each with a fix proposed in
`INVARIANTS.md`; `test_invariants defects` runs them. `evidence/` keeps the receipts. Every constant and
every number stated here is certified by Abacus, the owner's tool of certified arithmetic, or cited
where it cannot be; `evidence/INDEX.md` says what each receipt backs and lists the mismatches found.

## What is not

Re-entry and landing back. The
Ring's inside, its people, anything furnished. Terrain: the globe is smooth and the field flat. The
Ring's orbit decaying, the Earth's oblateness. Propellant for the small thrusters. VR, failures.

## Handoff to Unreal

`handoff/README.md` starts a kit for building this sketch in Unreal Engine 5.8 from cold on another machine: what it settles against the canon, the port part by part, the first slice, the licence question, and the zip to carry.

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
node --test flight/orbit/web/test/*.test.mjs
```

`build-web/index.html` is the whole page in one file, about 1 MB; `build-web/page.html` is the same
without the document's skeleton, for a host that wraps a page in its own.

Each part's tests are `test/test_<part>.cpp`, and ctest runs each test by the name it declares in a line
reading `// TEST: <name>` (`ctest -R dock` runs docking's). `flight/orbit/build/orbit_run 10 900` prints
the crew's flight every 10 s for 900 s.
`web/data/land.js` is made by `node flight/orbit/web/tools/land.mjs <ne_50m_land.geojson> <ne_50m_lakes.geojson>`.

The core is deterministic: the same inputs give the same state, and the tests check it by a hash of the
state. Native and WebAssembly runs agree to the digits printed above, not bit for bit.
