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
| 1 2 3 4 5 6 | X cycles | hold attitude, prograde, retrograde, the Ring, the hub's port, the deck (hover) |
| G, B | Y | gear; brakes |
| T | | in orbit: the crew flies the approach to the hub |
| P | | in orbit near the Ring: the crew docks at the hub; docked, let go |
| C | | in orbit near the Ring: the crew lands on the Ring's flight deck |
| O | Start | skip ahead to orbit |
| , . | bumpers | time slower, faster (up to 100×) |
| V | B | view: chase, cockpit, from the Ring |
| F | | the Moon through a telescope, and back |
| 9 | | graphics: auto, low, medium, high (also GFX) |
| drag, wheel | | look round the craft, zoom |
| H, Backspace | | help, start again |
| N | | the map: the orbit, the Ring close to, the ground track; shift-N the next of them |
| Y | | sound off, on (it starts on the first key or tap) |
| 0 | | the tour: the whole loop flown by the crew, with words; any key or button takes over |

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
| the crew docks, from orbit (`test_return`'s `lands_after_undocking`) | at the hub's port at 1,807 s |
| home from the port: let go at 1,817 s, the return engaged at once | the burn at 2,726 s (125 m/s), on 17C at 7,868 s: 432 m past the threshold, 0.07 m off the centreline, sinking 0.74 m/s |

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
| the globe | drawn per pixel: each ray meets the sphere exactly, so it is as round from the runway as from orbit; Natural Earth's coastlines and lakes; a single-scattering atmosphere; land coloured by latitude and a few desert boxes, clouds made up, a clear day over Texas; the towns' lights at night | Natural Earth's coastlines and towns; the rest ours |
| KDFW | `flight/web`'s drawing of the field, unchanged | `docs/provenance.md`, 1f |

The readouts give the relative velocity to the Ring in the frame that turns with its orbit, so a craft
keeping station in the same orbit reads zero. The Ring's own frame does not turn that way, so a craft
holding off its hub reads about 0.7 m/s there.

## The parts, and what is coming

The core is one program in parts, each with its own header, readouts and tests: `core/orbit_core.cpp`
(the flight, the crew to orbit, the approach), `return.cpp` (the flight home), `dock.cpp` (docking and
contact with the Ring), `deck.cpp` (the flight deck, and the craft as a jet), `walk.cpp` (a person inside
the Ring); `internal.h` is what they share. The
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

### The flight deck

The Ring has a deck: an open sector of its band, 1,500 m of the floor's arc and the band's whole 1 km
across, centred 30° round from spoke 0, midway to spoke 1. The roof stops at the sector's ends and the
floor is the deck; the rim walls and the hull go on across it. At each end a pressure bulkhead 20 m thick
stands from the floor to the roof, its face the sector's end and its body under the roof. Three pads, 25 m
in radius, lie on the centreline 400 m apart (`orbit_core.h`, `OC_DECK_*`; the page's `RING.deck`).

**Why it is a hover.** In the Ring's own frame, which turns once in 142 s, the floor stands still and
everything over it is pulled outward at ω²r, one g at the floor: a craft holding still over a spot of the
deck must thrust toward the axis at that. Seen from the stars it is moving with the floor at ωr, 221.5 m/s,
and the thrust bends its path round. A craft at rest among the stars feels no pull at all, and the deck
sweeps past under it at ωr. Moving at u against the deck, along it, the pull is (ωr + u)²/r: flying
spinward makes the craft heavier, antispinward lighter. So to land is to take up the deck's speed while
coming down onto it, and the weight grows from nothing to one g as the speed against the deck goes.

**The craft as a jet.** The drive swivels, as an F-35B's does: from aft (thrust along the nose) to straight
down through the centre of mass (thrust toward the craft's top), at 15°/s, the same drive with the same flow
of propellant. Jet-borne, roll posts in the wings and a lift jet in the nose bleed up to 5 % of its thrust
for attitude, in proportion to the thrust through the swivel: 0.40 rad/s² in roll and 0.14 in pitch at full
thrust, besides the small thrusters and the gimbal. Each law asks for the deck coordinates' accelerations
(along the floor's arc, the height over it, across) and gets the thrust from the exact equations of motion
in a cylinder about the Ring's axis, which is fixed among the stars (ρ̈ − ρψ̇² and ρψ̈ + 2ρ̇ψ̇): the
turning frame's pulls are worked out, not left to feedback, and the tides (the craft and the Ring's centre
falling a little differently, a few thousandths of a metre a second squared) are fed forward. One
allocation turns the force into a level attitude turned as little as will put the force where the swivel
sweeps (banked or yawed square to the wings, the nose pitched for what the swivel cannot reach), the
swivel's angle, the throttle, and the small thrusters for the rest.

**The crew's deck landing** (C, or LAND DECK, in orbit within 50 km of the Ring; within its reach the
craft's own orbit is not asked about, since moving with the deck its lowest point swings by hundreds of
kilometres): to the approach's hold point if the craft is not near it, round the Ring as docking goes; out
into the Ring to a point 400 m over the floor and 100 m to the hold point's side of the spokes' plane, at
rest among the stars (the nearest pad chosen); there the deck sweeps by underneath at 204 m/s, and the
craft waits, weightless, until the pad is far enough ahead that the bleed fits between 3 and 5 m/s². Then
the glide, the airliner's part: along the deck at 400 m, a height that follows the floor's curve, the nose
spinward and the drive pushing the craft after the deck, so that the speed against it bleeds away on a
schedule by the distance still to go (constant deceleration, frozen as the glide starts). The swivel turns
from near aft back down as the weight comes on. Past the last spoke the course leaves its side for the
centreline; the path steepens over the pad on a smooth step down through the roof's gap, never lower than
355 m where it crosses the sector's end, at a speed that keeps the bend's pull under 3 m/s². Then the F-35's
part: a hover 20 m over the pad's centre, held still for two seconds, and a descent at 2 m/s easing to
0.25 m/s at the touch. On the deck the drive idles, the brakes go on, and the pilot has the craft, held on
the deck. Relative to the deck the craft comes in tail first: the deck overtakes it, and the nose points the
way the craft must be pushed. A landing is refused docked, crashed, out of orbit away from the Ring, far,
fast past it, on the deck already, or under 2,000 kg of propellant.

**By hand**: 6 is the deck hold, the F-35B's unified control in the deck's frame. The stick is a velocity
against the deck in the nose's axes, 10 m/s at its stops, and centred the hold keeps the craft's place,
along and across each on its own; held at a stop it also winds up a speed that runs down when let go, so a
long way can be flown on the keys. The throttle is the climb or the sink, 8 m/s at its stops; its middle
holds the height, and near the deck the sink eases itself to a touchdown's, so that a shut throttle lands
the craft. Q E turn the nose. Taking the controls from the crew over the deck gives this hold, the throttle
set to its middle; Space while hovering by hand gives the craft to the deck crew. The HUD carries the deck's
lines, and the approach display the deck's ILS (a localizer along the centreline, beside the spokes until
past the last; a glide path that follows the floor's curve then steepens), the hover's plan nose up with the
pad, the craft's velocity and the flight director's, and a height tape: fly the cyan line onto the magenta
circle. While the deck matters the chase view rides with it, behind the craft on its track, so the deck runs
ahead to the pad and rises like a ramp.

The gear meets the deck as it meets the runway, against the deck's motion, and its tyres stick to the spot
where they come to rest, held by a stiff spring up to what friction holds: a craft parked on a pad stays put
under the Earth's tide on the Ring, which a rolling friction alone would rock by a centimetre. The rest of
the craft is a few hard points (the probe, the nose and canopy, the belly, the back, the bells, the
wingtips and wings' edges, the fins), swept along each step against the deck; one on it is a crash. The
bulkheads, and the roof everywhere but over the sector, are docking's solid structure.

| at the touchdown | the crew's aim, and a good landing | a crash past | why |
|---|---|---|---|
| sink | 0.5 m/s | 3 m/s | at 3 m/s the legs' dampers alone load them past 7 g |
| drift, across the deck's face | 0.3 m/s | 2 m/s | faster sideways a tyre trips and a leg folds |
| off level | 2° | 10° | at 10° the low wingtip is under a metre from the deck |
| from a pad's centre | 5 m | | on the deck but off the pad is a landing, and said so |

From the tests (`test/test_deck.cpp`; these numbers are the tests' own and are not yet certified in
`evidence/`):

| | |
|---|---|
| the crew, from the hold point | out into the Ring at once; the glide at 123 s, the hover at 226 s, down at 238 s, at rest on pad 2 at 255 s: sink 0.278 m/s, drift 0.002 m/s, 0.01 m from the centre, 0.03° off level |
| the glide | from 203.6 m/s against the deck (ωr at 400 m up is 203.4) and 0.0000 g to 1.5 m/s and 0.983 g in 104 s; the swivel from 0° to 89°; under the roof's height only over the sector, 571 m from its centre; at most 6.1 m off the path across, 1.5 m in height |
| the crew, from where it reaches orbit, 25.0 km out | at the hold point at 717 s, at rest on the pad at 972 s, the same touchdown |
| 24 seeded starts round the hold point, up to 101 m and 1.84 m/s off it | all land, on pads 1, 2 and 3 (6, 12, 6), in 253 to 256 s; the worst sink 0.278 m/s, drift 0.002 m/s, 0.01 m off the centre, 0.04°, 1,853 kg; at most 6.3 m off the path across, 1.5 m in height |
| hovering 20 m over a pad, and 155 m | the felt acceleration 0.99617 g against ω²r 0.99659 g, and 0.96895 against 0.96955 (the tides the difference); the thrust within 0.03° of the way to the axis; the drive's flow 16.28 kg/s against mω²r/(Isp g0) 16.29 |
| parked on the pad ten minutes, the brakes on | moved at most 0.15 mm; felt 0.9992 to 0.9995 g; the legs 5.7 cm compressed |
| by hand, from the hover, on the keys | the stick right 4 s: 9.9 m/s across, the place along held to 3 cm; let go, at rest and held to 0.1 m; the throttle shut: down in 20 s at 0.28 m/s, 0.4 m from the pad's centre |
| by hand, from the pad | the throttle open: 40 m up in 6.3 s; centred, the height held to 4 cm; the stick forward 4 s: 10.7 m/s, let go, at rest 56 m on and held there |
| let go of the hold 12 m up, and 12 cm up | a crash at 10.9 m/s, the gear on the deck, the wreck left there; a firm touchdown at 0.69 m/s |
| flown at a bulkhead, let down onto the roof 3.7 km from the sector | the probe hits the bulkhead at 48 m/s; the body hits the roof 305 m over the floor |
| let down over the sector's middle, the gear up | through the roof's height to the deck, and the belly on it |
| the swivel | at most 15.00°/s; from 84.6° aft again in 5.64 s when the plain hold takes over |
| what it costs, from the hold point | 1,794 kg of 4,388: 1,051 m/s of delta-v against the deck's own 221.5 m/s, most of it holding the craft up; out and waiting 225 kg, the glide 1,119, the hover 195, the descent 256 |

Every number here is chosen to make a landing that can be flown from a keyboard and shows the physics.
None of them describes a real aircraft, ship or station.

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

The page draws at one of three tiers: **low** for phones and integrated graphics, **medium** for a recent
laptop or an older card, **high** for a desktop card. It places a device from what the device says of
itself (the renderer WebGL names, its largest texture, whether it can draw into a half-float target, the
screen, a finger for a pointer, the memory) and, left to itself, times its first frames and steps down a
tier, or at low draws fewer pixels, when they come slowly. `?q=low|medium|high` in the address chooses a
tier, as do **9** and **GFX** (auto, low, medium, high in turn; remembered). Changing tier rebuilds the
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
| the air | wind rising with dynamic pressure; a rumble through Mach 1, and aboard a thump crossing it; buffet past 14° of α |
| an entry | the plasma's roar and crackle as loud as the stagnation heating (Sutton and Graves: as √ρ v³); aboard, a thump going subsonic |
| the gear | tyres and joints, the brakes, a thud and a chirp at touchdown as hard as the sink rate (back down within 2 s, a bounce: softer, no chirp), the legs' motor and lock |
| the drive | a thump and a knock as it lights and as it stops: lit from 1 % of thrust until under 0.3 %, so the approach's throttle, held near 5 %, lights it once |
| docking | read from `core.dock.docked` when the docking part gives it: a clunk, the latches, a hiss as the pressures meet; a bang on a hard contact, found from a jolt with nothing pushing |
| the flight deck | in vacuum, so all of it the structure's: below |
| inside the Ring | the band, the hub's lobby or a lift's car, each its own room: below |
| a crash | one heavy impact, then silence |
| the tour | a soft tone, two notes a fifth apart at −30 dBFS, as each part's caption first shows; no words spoken |

A camera outside hears only what the air carries to it: the drive, and the hull and the cabin as they sound
through the skin, late by the time the sound takes (a chase camera 70 m behind hears the drive 0.2 s late),
thinned as 1 / r, its high notes taken by the distance first, and from where the drive is, through a head
(HRTF). Past the speed of sound only a camera inside the drive's Mach cone hears it: in the crew's steep
climb the chase camera, trailing level behind, is outside it. The cone's surface passing the camera is
the boom, an N-wave (a sharp rise, a fall through nothing to as far below, a sharp return) heard there and
then, as strong as the distance to the −¾ (Whitham's far field) and the air's density's square root, 1 at
70 m at sea level: a peak of −8 dBFS. It is found for any camera, still or riding along: `carried()` with
the craft's velocity is the wait for what a listener hears now wherever it stands, and the cone has passed
when it first finds one. Flying the crew's return, the chase camera crosses the cone three times between
Mach 3.3 and 3.1 as the craft banks, a faint boom each in the thin air at 34 km, and a listener at the
threshold of 17C would hear the cone arrive when the craft is 91 km off at 25 km, at Mach 1.14 (at
−54 dBFS). Above the air nothing comes through the air at all. Time run faster is played 3 dB quieter at
each doubling and not at all from 50×, and the moments only near real time.

**The flight deck.** Over the deck the craft is in vacuum, the deck's roof being open, so a camera outside
hears nothing and the cockpit hears only what the structure carries; the deck's moments are found from its
readouts (`orbit_deck.h`), and the jets' work from the craft's own angular acceleration.

| | what is heard aboard |
|---|---|
| the hover | a loaded thrum, a mode of its own swelling and falling three or four times a second, as loud as the thrust through the swivel to the 0.8 power: over a pad the drive's thrust there is the craft's weight to 0.1 % |
| the swivel | the flow turned in its duct roaring as 1 − cos of the turn; the actuators' motor and grind while it turns, as fast as it turns (15°/s at most); a lock when it stops |
| the lift jet | a whine under the cockpit, 2.1 to 3.3 kHz, rising with its flow |
| the roll posts | their trim flow's hiss, and a puff from the side that fires when the law asks for roll: the share of what the posts and the thrusters can give together that the roll acceleration takes |
| the touchdown | the gear on the plating: the struts' thump and the oil in them, the plate's ring, as hard as the sink; no tyre's squeal, which is the air's |
| the take-off | the three struts topping out as the legs leave the deck |

**Inside the Ring** the air is the sea level's at 20 °C, turning with the Ring, so in its frame it is still
and sound crosses it at 343.2 m/s. The walk's own readouts drive it: where the walker is, the floor's plan
under the feet, the lifts, the ball. What happens near the ear comes in dry, late by its distance over the
speed of sound and thinned as 1 / d, from where it is (through a head), and into its room's answer, which
does not thin. Each room's answer is made from its size and surfaces: Eyring's reverberation time with the
air's absorption by ISO 9613-1 (20 °C, 50 %), octave by octave, and noise made in the frequency domain so
that each octave dies away at its own time; its level against a sound at a metre is the critical distance's,
√(A / 16π).

| room | volume | reverberation time, 125 Hz, 1 kHz, 4 kHz | critical distance | what else |
|---|---|---|---|---|
| the band, floor to roof, wall to wall, but for the deck's sector | 8.7 km³ | 109, 26, 5.3 s | 1,040 m | the roof's glass 298 m over the ear answers 1.74 s after any sound, with more energy than the band's whole diffuse answer, then the floor and the roof again at 3.49 s |
| the hub's lobby, a drum 300 m across and 80 m long | 5.7 million m³ | 18, 4.5, 3.3 s | 64 m | its far side, a concave mirror, sends a sound back focused, 1.75 s on |
| a lift's car, 10 m square, 3 m high, its ceiling lined | 300 m³ | 1.0, 0.44, 0.54 s | 1.5 m | boxy |

So a footstep is nearly dry in the band and roomy in a car. At its diffuse field's own level the band's answer
to a footstep is 56 dB under it, deep under the band's own hum: it is lifted 20 dB (`ROOMS.band.lift`), as
the Moon's earthshine is lifted, so that the band's size is heard at all; even so it stays the driest. A
room's answer is made the first time the ear is in it: a tenth of a second's work for the band.

| | what is heard |
|---|---|
| the band | its air, all its far sounds together; the air handling; the town's hum far off, swelling and falling |
| the canal | its water lapping in slow lumps and its bubbles, each ringing at Minnaert's frequency for its size (3.26 m/s over the radius) and rising; a line of sound, so 3 dB less each time the distance doubles, not a point's 6, heard from the nearest open water and muffled where a street or a plaza decks it over |
| footsteps | one a stride: the cadence 1.87 steps a second at a walk and 2.85 running at one g, and, the Froude number's similarity, as g to the 0.3 at a given speed, so in the lobby's 0.03 g a walk is a slow bound; as hard as the weight's and the speed's square roots; on what the plan says is under the foot: grass (soft, dark), paving (a sharp heel), tarmac, gravel (a crunch), a bridge's hollow deck, the lobby's grip floor, a car's steel |
| a jump | both feet and the body coming down, as hard as the fall: √(2 a h) |
| the ball | each bounce from where it is, as hard as the fastest it fell before it turned back |
| the lifts | the doors sliding and stopping, the brakes setting and letting go, from where they are; aboard a moving car its motor, the air in the tube and the rails' rumble rising with its speed |
| a draught | at an open lift door: a spoke's tube is a chimney 4.7 km tall, and the least difference of warmth between its air and the band's draws a wind through a door left open in it |
| the hub's lobby | near-silence: its vents, a low hum, no town |
| the hatch | its latches, the seal's breath, its weight swinging shut, going in and coming back aboard |

The mix is set so the drive at full power at sea level is the loudest thing: about −20 dBFS root mean square
at the default volume (70 %), its peaks under −8 dBFS; max q −22 to −25, an entry's hottest −26, full power
above the air −30 in the cockpit, the cabin alone −41, a crash's peak −8. Over the deck, the crew's hover
about −40 in the cockpit at its 45 % throttle (a firm touchdown's peak −9) and nothing outside; in the Ring,
the band −40 (a step on paving peaking at −24, on grass −27), by the canal −38, the lobby −50, a car at its
cruise −38; a boom at 70 m peaks at −8. Each voice's gain was measured by rendering it alone on an
`OfflineAudioContext` in Chromium, so that one asked for 1 comes out at 0.1 RMS, and the same renders check
that no throttle step or mute clicks, that a note swept across the hull's modes swells by 6 dB at most, and
that the crackle's pressure leans positive outside (the measured signature of a rocket's), softened through
the cabin's wall. `web/test/sound-render.test.mjs` renders the instrument so in headless Chromium when
Playwright is there: every cue sounds, peaks under 0 dBFS and makes no NaN; a camera outside the deck hears
exactly nothing.

Other parts play their moments through `ctx.sound`:

| call | does |
|---|---|
| `cue(name, params)` | plays a moment: `strike` {strength, hz}, `thump` {strength, from, to, seconds}, `contact` {speed m/s}, `latch` {n}, `capture`, `release`, `hiss` {seconds, strength}, `boom` {n}, `nwave` {strength, seconds}, `ignition`, `shutdown`, `gear` {down}, `touchdown` {strength, screech}, `pad` {strength, sink}, `liftoff`, `swivel` {strength}, `puff` {strength, side}, `crash`, `step` {surface, side, weight}, `land` {surface, strength}, `ball` {strength, distance, dir, surface}, `door` {open, distance, dir}, `brake` {aboard, distance, dir}, `hatch` {open}, `bubble` {radius, strength}, `chime`; each also takes `delay` (s). What is not a number in its range gets its default. An unknown name is refused and said once |
| `set(name, value)` | a standing condition: `heat` 0–1 (the entry's heating, in place of the one derived; NaN derives it again), `lift` 0–1 (a lift's motor, beside the walk's own), `walk` m/s and `surface` (footsteps at that speed, on that, in a frame another part draws where no walk runs: the walk's own come from its readouts) |
| `scene(name)` | where the ear is: `flight`, `ring` (the band), `hub`, `car`, or null to follow the walk's readouts, or the flight |
| `volume(v)`, `mute(on)`, `on`, `state`, `level()`, `engine` | the master, and what a test reads: whether it sounds, how loud, the instrument |

The flight's own moments (the drive lighting and stopping, the gear, a touchdown, the speed of sound,
docking and undocking, a crash, the cone passing an outside camera), the deck's and the walk's are found
from the readouts and need no call. While the walk draws the frame its readouts are the sound's, from the
sound's own frame (the walk calls the other parts' updates for the sky, and the sound leaves those to it).

What is weak. The rooms are statistical (Eyring's diffuse field), not traced: the band's nearer buildings,
its spokes and the deck's bulkheads give no early reflections of their own, and its low notes ring for a
minute or two where its answer is cut at 8 s. The materials stand for what the drawing shows. The walk's
sounds come from the walker's spoke's lift only, and a ball bounces only off floors (not the blocks'
walls). The boom's strength is a rule of scale, not Carlson's whole method, and no view yet stands on the
ground to hear the flight home's.

### The tour

For whoever has no stick, or wants to see the whole of it first: TOUR (or 0) flies the loop by the crew's
own modes, as a person pressing the buttons would, with a caption for each part (and a soft tone as it
first shows) and the time warp and the view set for it:
1. The take-off from 17C at one to one, and the climb through the air.
2. The guidance above the air, and orbit.
3. Docking at the hub, seen from the Ring for the last of it.
4. A look round the hub's lobby, and a moment on the floor.
5. The way home, skipping the wait for a pass, through entry, to a stop on 17C.

It takes about ten minutes on a desktop. Any command but one that only changes what is shown ends it
and takes over from there. `tour-plan.js` is the plan, pure and tested on made-up states;
`tour.js` is the button, the caption and the commands.

### Rigour

`INVARIANTS.md` writes down what the core promises, in the owner's manner from Subsim: each rule with
why it holds and what enforces it. The rules cover conservation in a vacuum, thin air as the only loss
in orbit, work and energy on the ascent, the propellant's bookkeeping, one frame seen three ways, replay
bit for bit, readouts that are finite and derived from the state, the Ring's one set of numbers, and a
receipt for every number. `test/test_invariants.cpp` holds them as physics, with tolerances derived from
RK4's order and the steps' rounding, and shows each check able to fail (`ctest -R invariants`). Its
Three defects it found are fixed and their tests run with the rest: the hash missed fields, non-finite
controls were taken, and an escape path's periapsis was wrong. `INVARIANTS.md` keeps what was found. `evidence/` keeps the receipts. Every constant and
every number stated here is certified by Abacus, the owner's tool of certified arithmetic, or cited
where it cannot be; `evidence/INDEX.md` says what each receipt backs and lists the mismatches found.

## What is not

The Ring's people, anything furnished. Terrain: the globe is smooth and the field flat. Wind. The
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
