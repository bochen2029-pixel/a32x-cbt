# Runway to Ring — the orbit sketch

A sketch, made on the operator's word of 2026-11-12 and outside `ROADMAP.md`'s phases: a spaceplane
that takes off from KDFW 17C like an aeroplane, keeps climbing, reaches a 500 km orbit and closes on a
ring station there, over an Earth drawn round. Nothing is furnished and nothing is finished. It is here
to show that the airframe has the power and the aerodynamics for the trip, and to be flown.

It stands apart from the A320. `flight/orbit` has its own small core (`core/`), links nothing from
A32NX or JSBSim, and changes no file of the Airbus product. Its page reads four of `flight/web`'s
modules, the KDFW drawing, without changing them. It is MIT (`LICENSE`), unlike the rest of `flight/`:
its owner relicensed it on 2026-11-21, and `NOTICE.md` says what in a built page is others'. It is not
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
| = and − (+ and the keypad's too); Z, X | triggers | throttle up, down, held; full, cut. Not Shift or Ctrl: Ctrl held with the flying keys gives the browser Ctrl-W, which closes the tab whatever a page asks |
| I K, J L, U M | d-pad | the small thrusters: fore and aft, left and right, up and down |
| 1 2 3 4 5 6 | X cycles | hold attitude, prograde, retrograde, the Ring, the hub's port, the deck (hover) |
| G, B | Y | gear (it comes up only off the ground: with weight on it, on the runway or the deck, it stays locked down); brakes |
| T | | in orbit: the crew flies the approach to the hub |
| P | | in orbit near the Ring: the crew docks at the hub; docked, let go |
| Enter | | docked: go aboard the Ring and walk (WALK) |
| R | | the crew flies home to KDFW 17C (RETURN); again, skip the wait for a pass |
| C | | in orbit near the Ring: the crew lands on the Ring's flight deck |
| 7 | | on the deck: the crew takes off, out through the roof's gap to the hold point (TAKE OFF) |
| O | Start | skip ahead to orbit |
| , . | bumpers | time slower, faster (up to 100×) |
| V | B | view: chase, cockpit, from the Ring |
| F | | the Moon through a telescope, and back |
| 8 | | the flight director: shown while you fly, while the crew flies too, off |
| 9 | | graphics: auto, low, medium, high (also GFX) |
| drag, wheel | | look round the craft, zoom |
| H, Backspace | | help, start again |
| N | | the map: the orbit, the Ring close to, the ground track; shift-N the next of them |
| Y | | sound off, on (it starts on the first key or tap) |
| 0 | | the tour: the whole loop flown by the crew, with words; any key or button takes over |
| ` | | the frame meter: the frame rate and time, the tier, the picture's size and the draws in a frame; `?perf` shows it at the start |

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
| home from the port: let go at 1,817 s, the return engaged at once | the burn at 2,726 s (125 m/s), on 17C at 7,652 s: 437 m past the threshold, 0.02 m off the centreline, sinking 0.73 m/s |

## What is in it

| part | how | from |
|---|---|---|
| the Earth | a sphere of 6,371 km, its gravity a point mass's, turning once a sidereal day; the ground level to the local plumb line, so a parked craft stays parked | ours |
| the air | the 1976 standard atmosphere to 86 km; above it, exponentials through the standard's densities at 86, 120, 200 and 500 km (within 20 %) | the standard's, to 86 km; ours above |
| the wind | none unless set (`oc_wind`, "The wind" below): a field of height, place and time from a seed, the mean wind of MIL-F-8785C's log law near the ground up to a jet stream 10 to 12 km up, and von Kármán's gusts at that specification's intensities and lengths near the ground, its lengths above (the intensity there is the sketch's) | MIL-F-8785C; von Kármán; Kraichnan's random Fourier modes |
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
contact with the Ring), `deck.cpp` (the flight deck, and the craft as a jet), `fd.cpp` (the flight
director), `wind.cpp` (the wind), `walk.cpp` (a person inside the Ring); `internal.h` is what they share. The
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
lips, the six spokes, the hub with its collar, the radiators standing out from it on the far side, and
beyond the far face the solar mast and its arrays, which do not turn with the Ring but stay square to the
Sun (the sweep meets them as they stood at each moment of the step). A touch is a crash, the status line says what hit what, and the wreck
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
| the hub's fittings: into the collar 50 m along the axis, the mast 610 m along it, an array's wing nose on; held still between two radiators | the probe on the collar 200.13 m from the axis (the hub's own wall is 40 m further in), on the mast at 10.12 m, on the wing; the next radiator round in 11.1 s; 30 m past the wing's tip, nothing |
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
kilometres): to the approach's hold point if the craft is not near it, round the Ring as docking goes; from
there, a plan. In the Ring's own frame, which turns and whose centre falls freely, the motion is linear:
r̈ = u + ω²r⊥ − 2Ω×ṙ + T r, the centrifugal and Coriolis pulls exact and the Earth's tide, T, linear in the
craft's offset. So the landing of least propellant is a convex problem once the thrust per kilogram is
slackened by σ ≥ ‖u‖ and the mass taken by its logarithm (Açıkmeşe and Ploen's lossless convexification): a
second-order cone program, solved in the core by an interior-point solver written for it (`socp.cpp`), and
posed by `deck_plan.cpp` in 40 intervals, crowded at the plan's ends where its burns are. A plan keeps inside
a cone over the pad whose edge passes 40 m over the bulkheads' and rim walls' tops, to its side of the Ring's
plane among the spokes, its thrust not toward the deck in its last 20 s and within 10° of up in its last 3, the
drive lit at a quarter of its thrust or more through its last 20 s, and its force changing no faster than
5 m/s³ (the swivel's 15°/s at full thrust); it asks for 85 % of the drive at most, the rest the tracking's,
and ends at a gate 6 m over the pad's centre, sinking at 1.5 m/s. Its length is chosen by golden section, 13
plans one a step, for the least delta-v and 0.5 m/s for each second. On the crew's grid a window holds on whole
intervals, so that this cost steps as the length moves an interval out of a window: from the hold point it
falls by 8.7 and 9.5 m/s in the seconds to 101 and 145 s, where it is otherwise nearly level, by 8.7 and 11.4 in
those to 70 and 74 s, where it falls 2 to 4 m/s a second, and by 1.0 in that to 113 s, beside its least (the
audit of `60e2582`, a 1 s scan). Golden section assumes one least; from the hold point it finds the least's
region, 403.52 m/s at 112.4 s against the scan's 403.59 at 113 s, but nothing makes it find it from every
start. The crew flies the plan: the plan's force fed forward 0.4 s ahead, the throttle's lag, and a loop on the
place and velocity against the plan's; made again from where the craft is every 8 s while it coasts (every 3 s
with a burn 12 s ahead, so the burn is planned finely) and in a burn when the craft is 10 m or 2 m/s off it,
with the whole drive and a later end if it must. A landing's plan made again that would take the craft under its
gate's height before the gate is refused: the cone may be left at a price, so that a plan is still found from a
craft outside it, but near the pad outside the cone is under the deck.
It learns its drive in flight: the acceleration it sees against the one its model expects, along the thrust.
What that looks like from the hold point: a short burn out, the nose spinward; a weightless coast of a minute
and a quarter while the pad comes round; and one burn, the airliner's approach become the F-35's slam, that
takes up the deck's 192 m/s against it on the way down through the roof's gap, the swivel turning from aft to
straight down as the weight comes on. From the gate the descent eases to 0.3 m/s 0.75 m over the legs' touch
(the navigation's error in height taken at that), and goes on under 5 m only over the pad's centre, still;
else it holds the gate's height until it is. On the deck the drive idles, the brakes go on, and the pilot has
the craft, held on the deck. Relative to the deck the craft comes in tail first: the deck overtakes it, and the
nose points the way the craft must be pushed. A landing is refused docked, crashed, out of orbit away from the
Ring, far, fast past it, on the deck already, or under 1,000 kg of propellant. Riding with the deck over it,
the crew hovers to the nearest pad, or, faster than the hover's 6 m/s, plans the rest at once.

**The crew's take-off** (7, or TAKE OFF, on the deck or hovering low over it): straight up 30 m off the pad,
the nose turned antispinward; then a plan that is the landing's turned round (lit through its first 20 s,
level for its first 3), out through the roof's gap shedding the deck's speed and leaving it, a coast in, and a
gentle stop, at most four tenths of the drive in its last 30 s, at the approach's hold point, where the
approach's crew holds the craft. R flies home from there; on the deck, or riding with it, the core refuses
RETURN, which starts from orbit.

**By hand**: 6 is the deck hold, the F-35B's unified control in the deck's frame. The stick is a velocity
against the deck in the nose's axes, 10 m/s at its stops, and centred the hold keeps the craft's place,
along and across each on its own; held at a stop it also winds up a speed that runs down when let go, so a
long way can be flown on the keys. The throttle is the climb or the sink, 8 m/s at its stops; its middle
holds the height, and near the deck the sink eases itself to a touchdown's, so that a shut throttle lands
the craft. Q E turn the nose. Taking the controls from the crew over the deck gives this hold, the throttle
set to its middle; Space while hovering by hand gives the craft to the deck crew. The HUD carries the deck's
lines (the crew's plan among them: the seconds, delta-v and propellant it has left, and the plans made), and
the approach display the deck's ILS (while the crew flies a plan, the craft's place against the plan's;
else the cone over the pad, its axis the course and its edge the glide path), the hover's plan nose up with
the pad, the craft's velocity and the flight director's, and a height tape: fly the cyan line onto the
magenta circle. While the deck matters the chase view rides with it, behind the craft on its track, so the
deck runs ahead to the pad and rises like a ramp.

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

**The oracle.** The tests ask the same solver for the least propellant a plan of its discretization lands with
from the hold point (`oracle_against_the_crew`): the touch 3 m over the pad's centre sinking at 0.3 m/s, inside
the same cone and to the same side of the spokes, level for its last 3 s, and nothing else of the crew's: the
whole drive, no price on time, no limit on how fast the thrust changes, no lit drive, no gate. It is posed on the
exact grid of `deck_plan.h`, every window's edge a node, not on the crew's, whose windows round to whole
intervals; and it is the best plan of that discretization, not a bound on every guidance: holding the thrust
over each interval and taking the drive's bound by its tangent restrict it, and holding the cone and the spokes'
side only at the nodes relaxes it. Its cost falls as the plan lengthens, smoothly, across 40 to 400 s
(`oracle_length_search`: no step anywhere, at every half second), so its least over that bracket is at the
bracket's end: **301.5 m/s, 525 kg, a plan 400 s long**, at full thrust or shut (out; a burn 600 m over the floor
that then rides the spokes' side to the last node it holds at; the braking burn down the cone; a last one at the
floor), ‖u‖ within 7 × 10⁻⁹ m/s² of σ. Longer plans cost less still, at 80 intervals 298.2 m/s at 600 s, 295.9 at
1,000 s and 293.1 at 1,900 s: the bracket sets the least. It converges: 301.71, 301.51 and 301.48 m/s at 40, 80
and 160 intervals (329.88, 329.79 and 329.78 at 120 s). Kept lit through its last 40 s at a quarter of the drive,
it is still exact where that floor holds it (27 intervals at the floor, none under it). The crew uses **705 kg**
to the touch from the same start: **34 % over the oracle's least over 40 to 400 s**, where the first build used
1,794 kg. Of the 180 kg, 50 are the length (the oracle at the crew's own 117 s needs 575 kg); the rest is the
crew's rules (15 % of the drive kept back to track by, the thrust's rate, the lit final, the gate 6 m up and the
descent from it, its own grid) and the tracking. (Until the audit of `60e2582` this paragraph said 304.7 m/s,
530 kg, a plan 311 s long, the least any guidance could land with, and the crew 33 % over it: the oracle was
posed on the crew's grid, its cost fell in steps of 4 to 7 m/s with the length, and golden section stopped on the
edge of a step.)

**The Monte Carlo.** Each draw starts up to 50 m and 0.5 m/s off the hold point, with the drive's thrust and
the craft's mass each off by 2 % (one standard deviation, held to three), the swivel lagging its command by up
to 0.3 s, and the navigation, which every deck law flies by, wrong by 0.3 m and 0.05 m/s an axis (one
standard deviation, correlated over 2 s: a deck's landing aid, as good as a ship's), while the craft's own
state stays the truth (`oc_deck_disturb`). Draws are seeded (SplitMix64, the draw's number). The guidance
was tuned on a development pool of 100 draws (1 to 100). A held-out pool of 100 (9001 to 9100) came in the
same commit as the guidance it was first flown against, so the history cannot show that it was flown once,
after that guidance was settled (the audit of `60e2582`). Two pools drawn later, while the crew flew the exact
grid for a time (below), 20001 to 20100 and 30001 to 30100, were flown once by this crew, its guidance settled,
and are reported as they came. The rate is stated with its Wilson score interval at 95 %.

| pool | landed inside every tolerance | the envelope (worst of each) | time, propellant |
|---|---|---|---|
| development, 1 to 100 | 100 of 100 (96.3 to 100 %), none crashed; pads 1, 2, 3: 39, 24, 37 | sink 0.426 m/s, drift 0.175 m/s, 1.72 m off the centre, 0.29° off level | 105 to 155 s; 632 to 869 kg, mean 713 |
| held out, 9001 to 9100 | 100 of 100 (96.3 to 100 %), none crashed; pads 1, 2, 3: 34, 30, 36 | sink 0.441 m/s, drift 0.145 m/s, 1.79 m off the centre, 0.24° off level | 106 to 154 s; 623 to 897 kg, mean 719 |
| held out, 20001 to 20100, flown once | 99 of 100 (94.6 to 99.8 %), none crashed, draw 20019 down at 0.513 m/s; pads 1, 2, 3: 32, 40, 27 | sink 0.442 m/s, drift 0.215 m/s, 1.81 m off the centre, 0.32° off level | 105 to 154 s; 618 to 868 kg, mean 704 |
| held out, 30001 to 30100, flown once | 100 of 100 (96.3 to 100 %), none crashed; pads 1, 2, 3: 28, 29, 43 | sink 0.457 m/s, drift 0.161 m/s, 1.82 m off the centre, 0.40° off level | 104 to 155 s; 614 to 867 kg, mean 723 |

Draw 20019, the drive 1.4 % weak, the craft 0.7 % light and the swivel lagging 0.15 s, touched down at
0.513 m/s, 13 mm/s over the tolerance: a firm touchdown, not a crash. So its pool's Wilson interval reaches down
to 94.6 %, not over 95 %, and its test (`monte_carlo_held_out_20001`) is a defect's, run by name and not by ctest
(`INVARIANTS.md`, G20). The refusal of a plan under the gate, added since, changes no landing of the four pools.

**The exact grid, flown by the crew and not kept.** For a time the crew's own plans were posed on the oracle's
exact grid, its length found by a scan of seven before eight plans of golden section, which made its cost
continuous in the length: from the hold point it used 701 kg to the touch and 707 to rest, in 129 s (705 and
711 here, in 119 s), and the take-off 726 kg (730 here), once a plan's first change of force was bounded by the
rate over half its first interval and a climb out's whole-drive try was given the whole drive (it cost 768, then
804, before; G17). But on exact windows its plans brake later and harder, and it met the gate less closely
(G18): its development pool landed 97 of 100 until its descent was made to settle a low, drifting craft before
it commits, and then 100 of 100, in 630 to 1,047 kg (mean 734); the held-out pool 100 of 100 in 649 to 1,436 kg
(mean 738), the heaviest a go-round at the gate after plans made again carried the craft 265 m past the pad. On
the two later pools, each flown once, it landed 99 of 100 each: in 20001 to 20100 draw 20060 crashed, kept on a
plan made again that ran 11 m under the deck (G19: the refusal, kept here), and in 30001 to 30100, after the
refusal, draw 30043 met its gate a metre low and touched down at 0.507 m/s. On the same 200 draws this crew
lands 199, and its heaviest uses 868 kg. The crew keeps its grid and its golden section; the exact grid is the
oracle's.

A plan is made in a step of its own, one at most: through a landing and a take-off, 63 plans, 17 ms on
average in WebAssembly under node (19 ms at the 95th percentile, 34 ms at the most), 15 ms natively; the
other steps take 0.01 ms. On a slow machine a plan's step can cost the page a frame.

From the tests (`test/test_deck.cpp`, `test_socp.cpp`; these numbers are the tests' own and are not yet
certified in `evidence/`):

| | |
|---|---|
| the crew, from the hold point | the burn out at once; the coast at 17 s, the final burn at 92 s, the gate at 112 s, at rest on pad 2 at 119 s: sink 0.296 m/s, drift 0.022 m/s, 0.96 m from the centre, 0.05° off level |
| against the first build, from the hold point | at rest on the pad in 119 s (255 s); 711 kg (1,794); from the roof's height to the touch 18 s and 450 kg (69 s, 1,071 kg); the touchdown 0.30 m/s, 0.02 m/s, 0.96 m off (0.31, 0.00, 0.01, after its 20 m hover) |
| the final burn | from 192.7 m/s against the deck (ωr at that height 192.8) and 0.0000 g to 0.44 m/s and 0.995 g in 20 s; the swivel from 0.4° to 85.6°; under the roof's height only over the sector, 581 m from its centre; on the plan to 0.2 m across, 5.5 m in height |
| the coast, and the plan | the craft on the plan's place to 1.6 cm through the coast; each of a plan's 40 intervals carries its node onto the next to 7.5 × 10⁻⁶ m; the crew's first plan, 112 s, flown open loop in the Earth's gravity onto its nodes to 0.039 m (12.4 m with the tide left out of the plan) |
| the oracle's length | its cost at every half second from 40 to 400 s on the exact grid: no step (each half second's change within 0.001 m/s of lying between its neighbours'), falling all the way; every window's edge a node at every quarter second from 4 to 400 s; the oracle on the crew's grid steps by 7.2 m/s at 311 s |
| among the spokes | until 15 s before its plan's end the craft is at least 59.68 m off the Ring's plane (the side is 60 m), and 72.5 m outside the nearest spoke's square at the closest; with the side not kept, 24.2 m off the plane and 42.9 m outside a spoke |
| its drive learnt | the drive 4 % strong and the craft 2 % heavier than the crew takes it: 0.0574 of the true 0.0608 learnt after the burn out, 0.0598 by the gate, and landed 0.73 m off |
| a plan's rate | from the drive shut, its first force 1.898 m/s² over its first 0.38 s, the rate's reach over that interval, and every change after inside its bound; unbounded, the first force is 20.5 m/s² |
| the least thrust's floor | the crew's first plans, where the drive is held lit: the mass's reference heavier than the craft by d = −0.0046 (the landing) and −0.012 (the take-off), the floor's expansion short by 1.6 × 10⁻⁸ and 2.8 × 10⁻⁷ of itself |
| over the deck | no plan the crew keeps takes the craft under its gate's height before the gate (in the pools, 6.13 m at the lowest); placed 15 m up, 25 m from the pad, sinking at 6 m/s and closing at 20 m/s 9 s before its gate, the crew refuses a plan 3.8 m under the deck and lands; with the refusal cut, it keeps that plan and strikes the deck |
| the crew, from where it reaches orbit, 25.0 km out | at the hold point at 717 s, at rest on the pad at 836 s: 0.30 m/s, 1.00 m off |
| the crew, the moment it is let go from the hub's port | backs off to the hold point first (from beside the hub a plan, which knows nothing of the hub, carried the right wing into it 9 s on: the tour's first run); out from the hold point at 49 s, at rest on pad 1 at 168 s: 0.30 m/s, 0.99 m off; 696 kg |
| engaged at six moments of the Ring's turn | 118.2 to 118.8 s, 697 to 712 kg: no window to wait for (the first build's wait cost a whole turn, 142 s, for a delay over 20 s) |
| taken from the crew at half a g 134 m up, given back 2 s later | landed in 43 s, 0.30 m/s, 0.29 m off, by a plan made at once |
| hovering 20 m over a pad, and 155 m | the felt acceleration 0.99623 g against ω²r 0.99627 g, and 0.96937 against 0.96955 (the tides the difference); the thrust within 0.05° of the way to the axis; the drive's flow 16.66 kg/s against mω²r/(Isp g0) 16.65 |
| parked on the pad ten minutes, the brakes on | moved at most 0.20 mm; felt 0.99938 to 0.999995 g; the legs 5.9 cm compressed |
| by hand, from the hover, on the keys | the stick right 4 s: 9.95 m/s across, the place along held to 11 cm; let go, at rest and held to 0.1 m; the throttle shut: down in 21 s at 0.31 m/s, 0.65 m from the pad's centre |
| by hand, from the pad | the throttle open: 40 m up in 6.3 s; centred, the height held to 4 cm; the stick forward 4 s: 10.7 m/s, let go, at rest 56 m on and held there |
| let go of the hold 12 m up, and 12 cm up | a crash at 12.0 m/s, the gear on the deck, the wreck left there; a firm touchdown at 0.71 m/s |
| the gear asked up on the pad, and on the runway | it stays locked down under the weight, and the craft sits on it; off the deck in the hold, it comes up as asked (the tour found the page's hands holding it up from the docked craft, and the gear folded on the pad) |
| flown at a bulkhead, let down onto the roof 2.1 km from the sector | the probe hits the bulkhead at 48 m/s; the nose hits the roof 304 m over the floor |
| let down over the sector's middle, the gear up | through the roof's height to the deck, and the belly on it |
| flown into the structure | the right wingtip meets a rim wall with the centre of mass 9.18 m from it (the shape reaches 9.20); the fin a bulkhead at 18.13 m (18.20); nose first 1.5 m over the roof's height, the nose the roof's edge at 14.49 m (14.52) |
| the swivel | at most 15.00°/s; from 90° aft again in 6.02 s when the plain hold takes over |
| what it costs, from the hold point | 711 kg of 4,388: 410 m/s of delta-v against the deck's own 221.5 m/s; the burn out 105 kg, the coast 2, the final burn 513, the descent from the gate 91 |
| the take-off | straight up for 8.6 s, the climb out to 28.4 s, the coast to 108.1 s, at the hold point at 122.6 s: 730 kg; up through the roof's height 615 m from the sector's centre and never under it again; held 0.6 m off the hold point 20 s on |
| from the pad, home | the take-off, then RETURN from the hold point: on 17C 1.65 h later, 430 m past the threshold, 0.02 m off the centreline, sinking 0.73 m/s; stopped 2,086 m along; 378 kW/m² at the most, 1.64 g; 413 kg for the flight home |
| the deck's markings and lamps | seven draws: the pads on one texture, the white, yellow and black marks one geometry each, the 48 edge lights and the lead-in lights instanced (455 before); by the frame meter, on the low tier by the Ring, 576 draws a frame before and 128 after |

Every number here is chosen to make a landing that can be flown from a keyboard and shows the physics.
None of them describes a real aircraft, ship or station.

### The walk

Off the craft, through the hatch into the hub, down a spoke in a lift, and out onto a floor that curves up
ahead and behind until it meets itself overhead. The walk has its own core, `core/walk.cpp` (`orbit_walk.h`),
on the flight's fixed steps, and its own page, `web/src/walk-view.js`, which draws the whole frame while
walking. **Enter** (or WALK) starts it when the craft is docked at the hub; to try it without docking,
add `?walk` to the address (`?walk=lift` starts in lift 1's car, `?walk=floor` on the floor by it). At the
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
| the floor's plan | 1,785 solid things: 1,467 low blocks, 230 parapets along the canal and across it at the bridges, the spokes' feet, the lifts' shafts, the flight deck's two bulkheads and two lock gates |
| the flight deck | sealed off: walking spinward along the promenade from spoke 1's plaza, the walker stops 0.3 m short of the bulkhead's face, 1.85 km on; a ball thrown at it comes back off it at half its speed |

The lift's ride is chosen for its riders. Coriolis's push 2ωv is sideways and the same at any height, so the
cruise is the speed that holds it to 1.5 m/s², 16.9 m/s. At the hub the riders weigh three hundredths of a g,
and a car that left faster than they fall would leave them on its ceiling: it leaves, and arrives, at half
their weight, which makes its distance from the axis a hyperbolic cosine in time. At the floor it starts and
stops at 1 m/s². While it moves the riders hold its rail.

The flight deck, the open sector between spokes 1 and 2 (the core's 0 and 1; `orbit_core.h`'s OC_DECK_*),
is no part of the walk. A pressure bulkhead 20 m thick and 300 m tall, from the floor to the roof, seals each end, where `orbit_core.h`,
`deck.cpp` and `ring-plan.js` put them (the tests hold all three equal); the canal ends at a lock gate in front
of each; no block stands within 15 m; and the walker cannot be set down between them. From the town a
bulkhead is a great wall with its hangar door, 560 m wide and 210 m tall, its frame lit, a row of windows
under the roof's edge and a red beacon at each top corner; it shades the town beside it. Over the deck there
is no roof, no air and none of the roof's lamps: from a lift, or from across the ring, it lies open between
its bulkheads with its plating, lanes and pads.

The page draws three passes: the real sky first, the flight's own far scene (the ray-cast Earth, its air,
the stars), from where the eye is in the site frame as the ring turns once in 142 s; then the ring's inside
over it, far (40 m to 16 km) and near, in the ring's frame, built from the core's plan so the walker meets
what is drawn. The sky is drawn only in the part of the picture where it can be seen: a coarse grid of rays
from the eye is traced out over the rim walls as the Sun's light is, and the rest is the ring's inside. The floor is painted from where it is (grass, the canal's promenade, streets and bridges, the
spokes' plazas, lanes, paths under the walls); the blocks carry storeys and windows; the roof is glass on a
lattice with lamps along it. The Sun lights the band only where it gets in over a rim wall's top, worked out
for each pixel, with the lattice's soft shadow: on the 12th of November it stands 23.7° out of the ring's
plane, so the middle of the band has about 50 s of sunlight in each turn and the strip under the wall on the
Sun's side none. A fill from the roof's lamps lights the rest, and the band's air hazes what is seen through
it. The view leans a quarter of the way toward the felt up, so the lift's sideways push is felt.

The walk follows the graphics tier (`quality.js`): it draws through the page's pipeline, so it has the tier's
cap on the picture's size and, above low, its multisampling and the glow round what is brighter than white;
the frame rate's controller sizes its picture as it does the flight's, and its sky is the Earth worked out
as the flight's is, at low from half the size, in the part of the picture where it shows.
At low it does less: no shadow of the roof's lattice and none of the bulkheads, no light from the Earth, the
grass in one octave, the blocks' windows as their average, the far side's roof and the small things past
2.5 km (blocks, parapets, lock gates) left out; medium draws those to 7 km, high to the far side. Timed in
SwiftShader, software and so relative only, a 1280 × 720 frame looking along the band takes 0.52 s at low,
1.07 s at medium and 1.22 s at high; looking up through the roof, 0.73, 1.62 and 1.55 s. At low that is 0.63
and 0.93 of what the walk took before it followed the tiers. Above low it is more than before, since the walk
now draws through the pipeline's multisampled picture and its glow, which software pays for as dearly as the
scene and a graphics card hardly at all; before, it drew those tiers with no multisampling.

Not in the walk: people, furnishing, doors into the blocks (they are solid), water to swim in (the parapets
keep the walker out), the flight deck itself, shadows of the blocks, the spokes and the hub on the floor, the
way from the port to the hatch, the Earth's tide across the ring (six parts in ten thousand of a g). The town
the walk is laid out on is its own (`walk.cpp`'s plan); the Ring drawn from outside paints another
(`ring-plan.js`), and the two do not match. The Earth's light is in:
where the Earth stands above the floor's level, the band takes a soft blue light from its sunlit part.

### The wind

The air has its own motion over the turning Earth only when a wind is set: `oc_wind(seed, strength)`
(`orbit_wind.h`, `core/wind.cpp`), kept through everything but a reset. The seed picks the day; the
strength scales the whole field, 1 being MIL-F-8785C's light day (15 knots 20 ft up), 2 its moderate (30),
3 its severe (45). `orbit_core.cpp` takes the wind off the craft's velocity wherever the air's push is
reckoned, so it moves every aerodynamic force and moment and every readout made from the airspeed; nothing
else reads it, and the crews learn it from their instruments or not at all.

- **The mean wind.** Up to 1,000 ft, the specification's log law, W20 ln(h / z₀) / ln(20 ft / z₀) with
  z₀ = 0.15 ft, veering with height through 25° as an Ekman layer does, from the surface wind to the wind
  above it, which may come from anywhere. Above, a smooth climb to a westerly jet stream's core 10 to 12 km
  up (30 m/s at strength 1, give or take 30 %), 30 % of it 8 km higher, an upper wind of 15 m/s from 35 to
  80 km, and nothing from 100 km; its speed and direction wander round the world and through the days, as
  the westerlies' long waves do.
- **The gusts.** Von Kármán's isotropic turbulence, at the specification's intensities and lengths by
  height: near the ground σ_w = 0.1 W20 with L_w the height, and the level gusts stronger and longer by its
  formulae; from 2,000 ft the specification's L = 2,500 ft, and σ = 0.1 W20, which is the sketch's choice (the
  specification gives the intensities up there by their probability of being exceeded, not from the wind at
  20 ft), fading from 15 km to nothing at 25 km. The field
  is a sum of 120 random Fourier modes (Kraichnan's method) in 40 shells from 30 km to 25 m, each turning
  slowly in time at its eddies' rate; shorter gusts the craft's own size averages out. Sampled along any
  straight path it has von Kármán's longitudinal spectrum along the path and the transverse across it.

From the tests (`test/test_wind.cpp`; `invariants.windy_ledger`, `invariants.wind_finite`):

| | |
|---|---|
| no wind (the default, or a strength of 0) | the field never evaluated; every hash and readout as before the wind existed, bit for bit, natively and as WebAssembly (`INVARIANTS.md`, O16) |
| the mean wind near the ground | the log law to 5 × 10⁻¹¹; the veer from 20 to 1,000 ft 11.11°, as the law's share of the 25° says |
| the jet, 50 seeds over KDFW | the strongest wind from 1 to 30 km between 10.0 and 12.0 km up, 17 to 47 m/s; the steepest shear above 300 m 0.008 s⁻¹ |
| the gusts 8 km up, 48 seeds, octaves from 1.6 km to 50 m | within 12 % of the field's own spectrum along and across; down to 100 m within 7 % of MIL-F-8785C's von Kármán, and 95 % off Dryden's in the shortest octave; variance 0.97, 1.00, 1.02 of (0.1 W20)² |
| the gusts 50 ft up, 48 seeds | σ_w 1.006 of 0.1 W20; σ_u 1.853 of it, the specification's 1.839 |
| parked in a 13 m/s wind | the airspeed reads the air's speed past the craft exactly; the craft rocks on its gear at 1 cm/s |
| still air at v − w against the wind at v | the same push, to 2 × 10⁻¹⁴ |
| the crew to orbit through three severe days, 12 to 28 m/s on the runway | 748 to 754 s, 500.4 to 500.5 × 499.6 to 499.7 km: as in still air (753 s, 500.4 × 499.7) within 5 s and 0.1 km |
| the ascent's work and energy in a severe wind | the ledger closes to 4.4 × 10⁻⁵ J/kg; reckoned on the velocity over the ground instead, it misses by 7 × 10⁵ |

The field's numbers are the specification's where it gives them and this sketch's elsewhere (the jet, the
upper wind, the Ekman turn's size, the wander); it describes no real day's weather.

### The flight home

**RETURN** (R) hands the craft to the crew to fly home to KDFW 17C from wherever it is in orbit: the
insertion orbit, held off the Ring's hub (it backs away first, on the small thrusters), docked (it lets
go of the port first), or an orbit the pilot has changed. The crew waits for a pass from which the
runway can be reached, burns tail first, falls to the air, flies the entry nose high and banked, glides
round a circle onto a long final from the north, and lands under power. The wait can be most of a day:
**RETURN** again, or TO ORBIT, skips ahead to a minute before the burn. Space takes the controls at any
point and gives them back; the crew picks the flight home up from wherever the craft is.

It is refused, and whoever was flying flies on, on the Ring's deck and within 9 km of the Ring's centre
while the craft moves past it faster than 50 m/s in the frame turning with its orbit, as it does riding
with the deck: its way out, backing away on the small thrusters, is for a craft at rest by the Ring (from
the deck it put the belly on the deck in 0.6 s). The crew to orbit is refused there too: taken on a pad, it
let go of the deck and struck a rim wall. While it waits for its pass the crew keeps clear of the Ring: the
way out leaves the craft on a loop about the Ring's orbit that slides along it a little each turn, and after
the deck's take-off one such loop came back to 820 m from the Ring's centre two orbits on; within 9 km and
closing, the crew backs away again. On the Ring's far side the way out keeps 600 m from the
axis until 1 km out along it, clear of the hub's solar mast, its arrays and its radiators.

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

From the tests (`test/test_return.cpp`; flown again at the third audit, 2026-11-21: the instruments, the
pass with margin and the glide without power had come in after the first table was made):

| started | burn | entry interface | touchdown | heat, peak | load, peak | propellant |
|---|---|---|---|---|---|---|
| at insertion, 800 s | 2,675 s, 127 m/s | 4,754 s | 7,663 s, 1.9 h later | 387 kW/m², 1,683 K | 1.63 g | 440 kg |
| a pass just missed, 2,620 s | 2,790 s, 127 m/s | 4,869 s | 7,653 s | 412 kW/m² | 1.66 g | 440 kg |
| after the day's last pass, 3,700 s | 75,656 s, 127 m/s (11 passes let go; the runway 270 km off the plane) | 77,736 s | 80,640 s, 21.4 h later | 389 kW/m² | 1.64 g | 444 kg |
| off the Ring's hub, 1,600 s | 2,766 s, 121 m/s | 4,731 s | 7,648 s | 387 kW/m² | 1.65 g | 430 kg |
| docked, let go at 1,817 s | 2,726 s, 125 m/s | 4,738 s | 7,652 s | 387 kW/m² | 1.64 g | 436 kg |
| the far side raised to 806 km | 71,731 s, 196 m/s | 74,198 s | 77,085 s | 387 kW/m² | 1.68 g | 562 kg |

Every one touches down 436 to 437 m past the threshold, 0.02 m left of the centreline, sinking 0.73 to
0.74 m/s at 100 to 101 m/s, and stops 2.15 to 2.16 km down the runway on its centreline. Peak dynamic
pressure 9.2 to 9.4 kPa. The day's last pass in reach of the first table, 1,028 km off the plane, is now
let go for margin (the plan takes the first pass the entry would still reach with lift over drag 20 %
below its model's), and the wait is two hours longer for it. The tests also start it from six times round the day, from a lowered orbit, with the pilot
taking the controls in the entry, the glide and on final and giving them back, and with the
guidance's model wrong at the corners of the box below. They check that the same inputs give the same
flight, and that the guidance's model of the craft is the core's (to 4 × 10⁻⁴ g). In still air with its
instruments exact the guidance promises more than a landing, and these tests hold it to that: the wheels
300 to 600 m past the threshold, sinking 0.5 to 1.0 m/s (the flare's aim and twice it), and within 0.1 m
of the centreline. Looser, they let through an approach that never learned its coefficients and one blind
to the Earth's turn (0.12 m off).

**Robustness.** The guidance's model of the air and the craft made wrong while the craft flies the
core's own (`oc_return_model_error`): the density off by a factor and a wave of 12 km in height, the
lift and drag coefficients each by a factor, all drawn at random, with the return started anywhere in
a day. A landing counts when it touches down in the first 900 m, within 3 m of the centreline, sinking
under 2 m/s, stops on the runway and stays inside the limits. Pools 1 and 2 were flown while the
guidance was being built, and it was changed after them; 2026 and 2027 were drawn afterwards and flown
once, as the table's first figures. The guidance changed after that too (`642cf56`, `76a2b56`, `9546efb`:
the instruments, the pass taken with margin, the glide round without power), so they are held out no
longer; flown again at the third audit (2026-11-21), 2026 lands 200 of 200 and 2027 95 of 100.

| pool | the guidance's model wrong by, each drawn evenly | runs | landed | 95 % interval |
|---|---|---|---|---|
| 1, while building | density ×0.75 to 1.25 and a wave of up to 15 %; lift and drag each ×0.9 to 1.1 | 64 | 64 | 94.3–100 % |
| 2026, held out | the same | 200 | **200**; again at the audit, **200** | **98.1–100 %**; **98.1–100 %** |
| 2, while building | density ×0.6 to 1.4 and a wave of up to 25 %; lift and drag each ×0.8 to 1.2 | 64 | 60 | 85.0–97.5 % |
| 2027, held out | the same | 100 | **91**; again at the audit, **95** | **83.8–95.2 %**; **88.8–97.8 %** |
| 2030, held out, flown once at the audit | the narrow box, with a wind of strength up to 2 (30 knots at 20 ft, a moderate day), the mass and thrust as the guidance knows them each within 3 %, and the instruments' noise | 100 | **93** | **86.3–96.6 %** |

Flown again, every landing in 2026 touches down 436 to 438 m past the threshold, 0.02 m left of the line,
sinking 0.73 to 0.74 m/s, with 414 to 471 kg of propellant (peak heat 322 to 456 kW/m², peak load 1.57 to
1.85 g, peak dynamic pressure 9.5 kPa at most), and every landing in 2027 426 to 439 m past it, within
0.02 m of the line: once the approach has learned the coefficients it flies the same. (When first flown,
424 to 437 m, 0.07 m left; peak heat 308 to 517 kW/m², peak load 1.49 to 2.11 g, 10.2 kPa.) Every run lost had a model
whose lift over drag was off by more than a factor of 1.2: the entry's reach then fell short of where the
plan, made in orbit before anything could be learned, sent it, and the craft came down short. Flown
again, the five lost in 2027 had the model's lift over drag 1.22 to 1.33 times the craft's, four of them
on a pass 1,020 km off the plane; with the factor within 1.2, 73 of 73 landed, and beyond it 23 of 28.
(When first flown, in both wide pools: 118 of 118 within 1.2; beyond it, 15 of 16 where the runway lay
within 700 km of the plane and 18 of 30 where it lay 1,000 km off.) The plan now takes a pass only with
the reach left at lift over drag 20 % below the model's, which a model 25 to 33 % optimistic outruns.

Run it: `flight/orbit/build/test_return monte_carlo <first> <count> <pool> [density wave coefficients]`
prints a line for each run and the rate with a 95 % Wilson interval; shard a pool across processes by
`first`.

What is weak. The plan's reach (1,200 km off the plane) and its search are for round orbits and
moderately eccentric ones: an orbit raised to 1,475 km is planned, one to 2,650 km is not. A craft
dropped into the air beyond the entry's reach glides toward the runway and comes down short; there is
no landing elsewhere. In still air every dispersed landing ends almost the same, because the entry
delivers the same gate and the approach learns the coefficients. In wind it does not: pool 2030, with the
instruments' noise, the mass and thrust as known within 3 % and a wind up to a moderate day's, lands 93 of
100, 61 of 62 in winds under strength 1 and 32 of 38 above it. Its misses are the landing's own, none the
entry's: in crosswinds of 4 to 12 m/s the wheels touched 3.0 to 4.6 m off the line (the limit is 3 m), two
touched at 2.00 and 2.08 m/s (the limit is 2), and one, in a tailwind of 15 m/s, 1.8 km down the runway; its
landings spread 249 to 797 m past the threshold and 2.9 m either side of the line. A different runway or a failure would test the terminal area as these do
not. Seen from the chase view, the trail's near end can show as pale bands against a bright limb.

### The Sun and the Moon

The flight has a date: 12 November 2026 at 19:00:00 UTC unless the address says otherwise, as
`?date=2026-12-24T03:00Z` (UTC unless a zone is written; 1900 to 2100). That is one in the afternoon at
KDFW, the Sun 38° up in the south-south-west and still 32° up where the crew reaches the Ring; a thin
Moon, 11 % lit, stands 23° up in the south-south-east, 39° from the Sun. From there the sky moves with
the flight's clock, so the Moon goes its half a degree an hour among the stars and the Sun its degree a
day. A date the page cannot take stops it and says why.

The core (`core/sky.cpp`, `orbit_sky.h`) works the sky out from J. Meeus's *Astronomical Algorithms*:
the Sun to 0.01°, the Moon from the whole of the book's tables to about 10″, the Earth's sidereal time,
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

What is drawn as the eye sees it rather than as a camera would: the Moon has an exposure of its own and,
on the low tier, no tone curve, as an eye adapted to it sees it, the full Moon's highlands at three
quarters of white (on medium and high the frame is kept in HDR and tone-mapped once, with AgX, and the
Moon goes through that curve too: its highlands read about 0.77 in sRGB there, against 0.88 on low); its
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
screen, a finger for a pointer, the memory) and then holds its frame rate, drawing fewer pixels when
frames come slowly and stepping a tier down or up when fewer pixels are not enough or there is room
(below). `?q=low|medium|high` in the address chooses a tier, as do **9** and **GFX** (auto, low, medium,
high in turn; remembered). Changing tier rebuilds the Ring, the craft, the Earth's textures and the stars
in place, and the flight goes on. `web/src/quality.js` holds every tier's settings and the placing; its
tests hold each tier complete and no cost lower at a dearer tier.

**Measuring a machine.** ` (the backquote key) shows the frame meter: frames a second and the frame
time's mean, 95th percentile and worst over the last two seconds, and the GPU's own time for a frame where
the browser gives it (Chrome on most desktops; not Safari, nor Firefox by default); the tier and whether
it was chosen or found, the picture's size in pixels, the depth slices, and the draw calls and triangles
in a frame; and how the frame rate is held: the rate aimed at, the picture's share of the tier's size and
how many rungs down it is, and the Earth's size (`perf.js`). Everything here was measured in software
rendering, which says nothing of how fast a graphics card runs it; the meter is how to find out, tier by
tier (9 or GFX). `?res=fixed` keeps the picture at the tier's own size, to measure the tiers by.

**Holding the frame rate** (`web/src/adapt.js`). The page aims at 60 frames a second, 30 on a phone, and
on a fast machine does nothing at all: the picture stays at the tier's own size. When frames come slowly it
draws fewer pixels, down a ladder of rungs each with 0.8 of the pixels of the one above, to a quarter of
the tier's at the bottom, and up again when they come quickly; the flight never notices, since the core
steps by its fixed clock whatever the frame rate. Every half second or so of frames the law takes their
mean, the slowest eighth and any spike left out, so a frame that waits for a shader or a collection moves
nothing, and the first two seconds at a tier, while its shaders compile, count for nothing.

- **Slow**, more than 15 % over the target: down as many rungs as the pixels' share says will bring it
  under nine tenths of it, at most three at once. A step down that buys less than a quarter of what it
  should is undone, and the steps down wait 4 s, then 8, up to a minute: a browser that holds the page to
  30 frames a second to save a battery, or a slow processor, is not helped by a blurrier picture.
- **On target** for a second and a half: up a rung, on trial, judged on its first four frames. A display's
  refresh hides how much faster a frame could be drawn, so the only way to learn is to try; when a try
  fails, the page steps back and that rung waits twice as long before the next, to half a minute. Where the
  browser gives the GPU's own time, the page knows instead: it steps up at once where the rung above fits
  with room, tries it after the wait where it fits at all, never where it does not, and when it is slow
  while the GPU has room, it leaves the pixels alone.
- **The tiers**, while the page chooses them (auto): a tier down when the picture is three rungs down (half
  the pixels) and still slow for two seconds, since a tier lower at full size looks better than one higher
  at half of it, or, by the GPU's time, when fewer pixels do not help and the GPU is still busy; a tier up,
  on trial, after a minute at full size on target. A trial that has to come down two rungs within ten
  seconds goes back, and that tier is not tried again, nor one the page has stepped down from. A tier
  chosen by hand stays, and where the GPU's time shows room for the next, the page says so once.

The tests (`web/test/adapt.test.mjs`) drive the law with made-up devices whose frames take a time in
proportion to the pixels and show at the display's next refresh. A device that needs 30 ms a frame at full
size settles half a second after its first two seconds, at 0.72 of the tier's size (rung 3), and runs at
60 frames a second; its tries at rung 2 fail ever more rarely, 19 in ten minutes, and the frames they slow
are 0.7 % of the time; with the GPU's time, it never tries and never misses. Four times the load for a
minute, then none: down within half a second of the warm-up, and back at full size 30 s after the load
goes by trying, half a second by the GPU's time. A processor that takes 40 ms, or a 30-frame cap, keeps
the full picture 98 % of the time. A phone that needs 45 ms settles at rung 2 and holds 30 frames a
second 99 % of the time.

| | low | medium | high |
|---|---|---|---|
| the drawing buffer | at most 1.5 device pixels a CSS pixel and 1.3 M pixels; the canvas multisampled; fewer, down to a quarter, while frames come slowly | 2 and 2.4 M, into a 4× multisampled half-float target; the same | 2 and 6 M; the same |
| the picture | each material tone-maps itself | kept in HDR: what is brighter than white (the Sun, the lights, the plume, the glint) glows; tone-mapped once | the same, the glow at full size |
| reflections | none | the far scene in a 64-texel cube, every 45 frames, prefiltered | 128 texels, every 15 |
| the Sun's shadow | a soft spot under the craft on the ground | the same | a 2,048 map round the craft: on itself, on the field, on the hub |
| the Earth | land mask 2,048 texels round, night lights 2,048; 6 samples of air, 3 toward the Sun; 3 octaves of detail; worked out at half the picture's size each way and brought up to full | 4,096 and 4,096; 10 and 4; 5 octaves; the clouds' shadows, relief, ozone, the glint's facets; in full, and at half while the picture is drawn smaller | 8,192 and 4,096; 16 and 6; 6 octaves; the same |
| the Ring | 192 segments round; textures 512; no relief; the spokes a painted lattice; 120 ribs a wall; 2 rings of lights; the town painted | 384; 1,024; relief; trusses in 140 m bays; 240 ribs; 4 rings; the town's buildings standing | 512; 2,048; 70 m bays; 5 rings |
| the craft | its loft 28 × 20; textures 256; no relief; the plume in 6 samples | 44 × 32; 512; relief; 12 | 64 × 48; 1,024; 24 |

What the tiers cost when they were made (12 November), measured with Chromium drawing in software
(SwiftShader) at 1,440 × 810, the GPU's own timer round each pass: the times compare the tiers and the
passes with each other, not with a graphics card, and other work on the machine made them noisy (each is
the lower of two runs of six frames). The sketch before that work drew one way only.

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

**What holding the frame rate bought** (21 November), measured the same way at 1,440 × 810 with the
picture at the tier's own size (`?res=fixed`): the page before that work against the page after it, each
the lower of two runs of five frames. A pass's time here is the wall time between one-pixel reads from a
framebuffer of the measuring script's own, which wait for the GPU process to finish all that came before:
Chrome's `gl.finish()` does not wait, and its GPU timer, in software, counts passes that overlap (they
added up to more than the frame). The flight's scenes ran one after another in one page load for each
tier, the walk in its own, the two pages side by side, while other work held the machine's load at 20
to 40 on four cores; the deck's 456 markings are in both (the deck's own part batches them).

| draw calls, before → after | low | medium | high |
|---|---|---|---|
| the runway | 84 → 47 | 98 → 59 | 127 → 65 |
| the climb, 110 s | 47 → 25 | 61 → 37 | 73 → 41 |
| orbit, the Ring 25 km ahead | 576 → 509 | 591 → 522 | 603 → 526 |
| the hub, 300 m off | 68 → 39 | 83 → 52 | 94 → 56 |
| over the deck | 198 → 159 | 214 → 173 | 214 → 173 |
| the walk, on the floor | 71 → 73 | 93 → 93 | 93 → 93 |

| the GPU's time a frame, s (of it the Earth's), before → after | low | medium | high |
|---|---|---|---|
| the runway | 3.99 (3.67) → 2.94 (1.97) | 5.95 (4.16) → 7.31 (4.75) | 7.77 (5.67) → 6.01 (4.12) |
| the climb, 110 s | 3.02 (2.92) → 1.23 (0.99) | 7.23 (5.87) → 6.12 (4.68) | 6.87 (4.82) → 4.76 (3.43) |
| orbit, the Ring 25 km ahead | 4.13 (3.50) → 2.45 (1.88) | 5.38 (2.89) → 5.88 (2.75) | 2.98 (1.14) → 3.03 (1.25) |
| the hub, 300 m off | 5.09 (3.53) → 3.22 (2.15) | 6.64 (3.37) → 5.66 (2.51) | 7.41 (2.77) → 5.63 (2.22) |
| over the deck | 8.26 (6.14) → 5.96 (2.82) | 10.09 (5.10) → 6.46 (3.06) | 4.71 (2.28) → 4.42 (2.15) |
| the walk, on the floor | 5.98 (0.84) → 3.28 (0.27) | 6.17 (0.86) → 4.53 (0.74) | 3.14 (0.50) → 1.85 (0.29) |

At low, where the Earth is now worked out from half the size, its pass fell by 39 to 68 % and the frame
by 26 to 59 %; the draw calls by 22 to 67 a frame in flight, while the walk, where the Earth is only the
sky's window, gains two (the half-size pass and the band). At medium and high the Earth is drawn exactly
as before, so its own pass is the gauge of the load, and the load moved it from 40 % less to 14 % more;
the frames moved with it (high's orbit, deck and walk are a second run, the two pages started together,
which put orbit within 2 % and the deck within 6 %; the walk, which nothing here touches at high, still
came out 41 % less). What changed there is the draw calls, 24 to 77 fewer a frame in flight: the
craft's 53 meshes are 14, the Ring's 67 are 22, and at high the shadow's casters 30 are 7. Software GL
hardly feels a draw call, at tens of microseconds; a laptop's or a phone's driver does. Triangles rose
by 7 k at the hub and over the deck: the hub's six hoops, merged with the towers round the Ring, are no
longer left out when out of sight, which a graphics card does not notice. Frames of each in turn in one
session, which the load cannot tell apart, give the Earth from half the size 0.51 to 0.57 of its full
time at low (the runway, orbit), 0.44 to 0.56 at medium and 0.42 at high: at medium and high, what the
frame rate's controller buys when it asks for it. A phone at low, 585 × 996 for an iPhone 13's screen:
the runway 1.09 s → 0.55 s a frame (the Earth 0.90 → 0.39), orbit 0.82 → 0.70 (0.57 → 0.41), the draw
calls 79 → 42 and 576 → 509.

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

**Fewer draw calls.** The Ring's and the craft's parts that stand still and share a material are merged,
a mesh to each material and parent, each part's place baked into its copy of the geometry
(`web/src/merge.js`; its test holds the merged meshes to the very triangles they drew before). The lift
cars and the solar mast's wings are each one mesh drawn many times, placed each frame. The Ring went from
67 meshes to 22, the craft from 53 to 14, and the meshes casting the Sun's shadow at high from 30 to 7.
(The flight deck's 456 markings are batched by the deck's own part.)

**The Earth** (`web/src/earth.js`) adds ozone's absorption, a twilight on the ground past the terminator,
the sea's reflection of the sky and the Sun's glint by its waves' slopes (Cox and Munk), broken into
facets close up; a cloud layer 3 km up, swirled, that throws its shadow and is greyer on its side away from
the Sun; a made-up relief in the great ranges; fields near enough to see; the country round KDFW the field's
own olive grass; the airglow's green line at the night limb; and on the night side the towns' lights, from
Natural Earth's populated places (`web/tools/places.mjs` makes `web/data/places.js`). The day stays clear
over Texas, so the reference's cloud deck to climb through is not here.

**The Earth at half the size.** Its full-screen pass is most of every frame, and most of what it works
out (the air along each ray and toward the Sun, the ground's noise, the clouds) changes slowly across the
picture. At low it is worked out at half the picture's size each way, a quarter of the pixels, into a
target of its own, and two draws bring it to full size. Where the half-size samples cannot follow, a band
round the limb and a square round the Sun's disc are worked out in full: from above the air, the band of
sky up to the air's top; the far ground's haze, where the ground's distance changes by more than 15 %
across a sample; and two samples either side of the limb whatever. They are drawn as geometry, a strip
between two cones round the direction of the Earth's centre, so only their pixels, 1.5 to 6 % of them,
pay for the full shading. Everywhere else a composite takes the four samples round each pixel bilinearly,
all of them on its side of the limb, and works out for each pixel exactly which side that is and how far
its ground is, so the limb, the horizon and the depth are as sharp as ever; the airglow's thin line is
added at full size. The composite holds none of the full shading: software GL, and some GPUs, run both
sides of a branch, and the first try, which branched to it, cost every pixel the whole price, 2.3 times
the full pass. Against the Earth worked out in full, in the same frame (`web/test/earth-half.test.mjs`):
the mean difference is 0.01 to 0.5 levels in 255, and under 0.6 % of the pixels differ by more than 8, at
the softened edges of the fields close below and of a coast seen at a grazing angle. In software at
1,440 × 810, frames of each in turn in one session, the Earth from half the size took 0.51 of its full
time from the runway at low and 0.57 in orbit, 0.44 and 0.56 at medium, and 0.42 at high in orbit; the
composite's own share is largest at low, where it tone-maps the picture as well. At medium and high
the Earth is worked out in full, as before, unless the frame rate's controller has had to draw fewer
pixels, when it is worked out at half too: on a slow machine the sky softens before the Ring does.

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
−54 dBFS), by straight rays at one speed of sound; in a real atmosphere, whose sound runs faster in the warm
air near the ground, rays from Mach 1.14 at that height bend back up before they reach it (the Mach cut-off),
and the listener might hear nothing: the model cannot tell. Above the air nothing comes through the air at all. Time run faster is played 3 dB quieter at
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
5. Back aboard and let go of the port, the crew's landing on the flight deck: out over the open sector, a
   coast while the pad comes round, the final burn down through the roof's gap, and the hover onto a pad.
6. Off the deck again: straight up off the pad, out through the roof's gap, and on to the hold point.
7. The way home, skipping the wait for a pass, through entry, to a stop on 17C.

It takes about twelve minutes on a desktop. Any command but one that only changes what is shown ends it
and takes over from there. `tour-plan.js` is the plan, pure and tested on made-up states;
`tour.js` is the button, the caption and the commands.

### The flight director

The crews fly by guidance: a pitch schedule through the air and the Shuttle's powered explicit guidance
above it on the way up; on the way home the entry's predictor-corrector, the terminal area and the
approach. The flight director lets a person fly the same paths by hand, on keys or a stick: while the
pilot has the controls, the crew's guidance for the phase the craft is in runs in the shadow and says what
it would command, without commanding it, and the page draws it as an airliner's director does.

**In the core** (`core/fd.cpp`, `orbit_fd.h`). Before each step's law, the crew's own functions, `crew()`
for the climb to orbit and `returnCrew()` for the flight home, run on a copy of the state that carries the
guidance's memory: its phase, its pitch and bank targets, its insertion plan, the flight home's whole
state. What the law aimed at is the director's attitude (`ratesToward`'s target, or the air law's pitch and
bank); the throttle and the gear are what it set. Nothing but the director's own memory is written, and
that memory is in the state and the hash, so a run replays. Its readouts are the last of `oc_out`'s:
`OC_FD_VALID`, `OC_FD_PHASE` (the crew's phases, then the flight home's), the pitch, heading and bank it asks
for, as the craft's own are reckoned (above the air the heading is where it points the nose; in the air its
laws turn by the bank, and the heading is the craft's), the throttle, the gear, and on the way home its bank
about the air's velocity and its angle of attack. `oc_fd(0)` switches it off.

Whose guidance. Beside the crew to orbit the same shadow runs, and its command is the crew's own; the
flight home's command is read after the crew's law (its predictor flies the rest of the entry every two
seconds, too dear to run twice). Taking the controls from either crew, the shadow carries on from the
crew's memory as it stands. Taking them from anyone else, or switching the director on, it starts as the
crew would if handed the craft: the crew to orbit from where the craft is (`oc_auto`'s pick), or the
flight home if one is under way (its crew has flown and it has not ended). A craft that goes back past the
crew's phase, down into the air again or back onto the runway, is taken up where the crew would, with a
margin so that a craft flown along a boundary does not flicker between two phases. Near the Ring, docked,
on the port or deck holds, and while the approach, docking or the deck landing fly, the director says
nothing: the docking reticle and the deck's display are drawn there.

**On the page** (`web/src/fd-view.js`; the numbers in `fd-hud.js`).

- **The primary flight display**, at the foot of the screen: the attitude ball, a magenta pitch bar and
  bank bar to fly the yellow aircraft symbol onto (nose up when the pitch bar is above it, bank toward the
  bank bar), the bank scale with the director's bank as a magenta index beside the craft's white pointer,
  the throttle with the hand's setting in cyan and the director's in a magenta caret, and the gear when it
  should move. Above the air, where the stick turns the craft at rates, the upright bar is dashed and is the
  heading's: yaw toward it (Q E), roll to the bank index (A D).
- **In the view**, chase or cockpit, beside the velocity vector the HUD draws: a magenta ring with wings
  where the director wants the nose, banked as it asks, and a white W where the nose is. Fly the W onto the
  ring. In the cockpit it is a head-up display's cue; in the chase view it is off the top of the screen
  while the climb is steep, and the display below is the cue.
- **The entry**: the director's bank about the air and its angle of attack are written under the ball
  and in the readouts (`FD ENTRY bank R 50° about the air, α 40.0°`), and its bank index sits on the
  scale where the attitude that gives them is banked.
- **The ILS to 17C**, when the craft is on an approach (off the ground, short of the threshold, within 90°
  of the course and below 8 km): the localizer under the ball, the glide slope at its right, a diamond
  each, green inside half a dot. From the runway's geometry in `flight/web`'s data, as the A320's
  runway (`docs/provenance.md`, 1f): the localizer's course is the centreline, 180.3° true, its antenna
  1,000 ft past the far end, full scale (two dots) 350 ft either side at the threshold, received within
  18 NM and 35° of the course; the glide slope is the PAPI's 3° through 50 ft over the threshold, a dot
  0.12 of its angle, received within 10 NM and 8°, judged at the wheels (the centre of mass's height less
  3 m). The crew's own approach puts its wheels 15 m over the threshold on 3°: the same path.
- **The path to follow**, in the world on the same approach: magenta gates 120 m wide and 60 m tall down
  the glide slope and the localizer's course, a kilometre apart from 18 km to 1 km out, each where the
  craft's centre of mass is on the path, the Earth's curve under the start point's plane allowed for (25 m
  at 18 km). Fly through them.
- **8** cycles it: shown while you fly (the default, remembered), shown while the crew flies too (its bars
  then sit on the craft, as an autopilot's do), and off, when the core stops computing it. It leaves the
  tour running.

From the tests (`test/test_fd.cpp`, `web/test/fd.test.mjs`; these numbers are the tests' own and are not yet
certified in `evidence/`):

| | |
|---|---|
| beside the crew, to orbit | the director's command is the crew's, bit for bit, at every one of 37,629 steps: the phase, the targets, the plan, the attitude its law aims at, the throttle, the gear. A pitch target spoiled by 0.01° is told apart for 374 steps |
| taken over | at 10, 25, 35.5, 60, 150, 300 and 760 s of the climb, and in the fall to the air, the entry, the terminal area and on final coming home, the director's first command is the crew's next, bit for bit; 250,029 steps of the crew flying home read out as the director's |
| on or off | the same controls give the same flight, the state's hash less the director's own and the place and velocity bit for bit, at every mark: a pilot's climb (240), the crew's flight to orbit (753), the flight home with a pilot in the entry for a minute (501). A throttle of 0.999 for a second is told apart |
| a person flying by the cues alone, 0.3 s late, the stick proportional to each cue's error (full at 10° of pitch, 60° of bank in the air), the throttle toward its cue at the keys' rate or slammed | off the ground at 40.3 s; the cue to shut at 749.4 s, shut at 750.5 s; ten seconds later **504.1 × 500.0 km**, inclined 32.86°, 4,376 kg left. The crew, measured the same way (the engine's tail and all): 501.2 × 500.0 km, 32.84°, 4,388 kg. Max q 35.8 kPa, 2.17 g. The cues flown within 3.0° in pitch and 2.3° in bank where they move smoothly (0.24° and 0.06° on the mean) |
| the same person, the throttle full until its cue says shut | 572.0 × 499.1 km: the cue's taper is what puts the orbit at the Ring's height |
| the flight home, the crew's from the insertion orbit until the person takes it, who also leads the cue by 0.4 s and brakes once down | taken waiting for the pass (the burn by hand too), falling to the air, or on final: **down 310 to 311 m past the threshold, 0.10 m off the centreline**, sinking 3.8 to 3.9 m/s at 106 m/s, stopped 2.25 km down the runway 0.2 m off; heat 387 to 438 kW/m², 1.63 to 1.96 g, 9.5 kPa at most. The crew's own: 432 m, 0.07 m, 0.74 m/s |
| the same, without the lead, taken falling to the air | down 305 m past, 0.10 m off, but 4.87 m/s and 2.70 g: past the load's 2.5 g limit |
| the crew's own final into 17C | the localizer within 0.008 dot from 12 km to 1 km out; the glide slope met 8.7 km out (within 0.8 dot before it, rolling out of the unpowered turn onto the final) and held within 0.047 dot to 1 km |

The check on the person is 10 km at either end of the orbit, 0.3° of inclination, 5° of each cue where it
moves smoothly; where a cue steps (a new phase, the turn's bank, the insertion's first pitch) the 5 s after
are left out. Coming home it is the flight home's own judge of a landing (the first 900 m, 3 m of the
centreline, stopped on the runway, inside the limits), with the sink under 5 m/s.

What is weak. Where the climb's pitch schedule hands over to the insertion guidance, at 38 km, the pitch cue
steps 15° up while the hand-flying law is still the air's, down to 200 Pa, in air too thin for its roll: a
person who grabs the bank, full stick at 30° of bank error, flies a roll oscillation there that rolls the
craft past 90° before the rate law takes over; the test's person, at 60°, does not. The director's
throttle and pitch are the crew's, not smoothed for a hand. Coming home they are an attitude, and the
air law holds an attitude by pitch and bank: in the entry's bank reversals, at 70° of bank, its pitch
target turns the nose mostly in yaw, and the angle of attack the guidance wants is hard to hold by it; a
person who does not lead the cue passes 2.5 g. The entry asks for up to 85° of bank about the air, and the
air law stops its bank at 75°. The flare is 2 s long, from 12 m: a hand 0.3 s late lands at about 4 m/s
where the crew lands at 0.74. The director follows the crew to orbit unless a flight home is under way, so
a hand-flown circuit back to 17C from a take-off gets the climb's cues; the ILS is there for it. The
localizer's antenna and coverage are a textbook ILS's, not KDFW's published one.

### Rigour

`INVARIANTS.md` writes down what the core promises, in the owner's manner from Subsim: each rule with
why it holds and what enforces it. The rules cover conservation in a vacuum, thin air as the only loss
in orbit, work and energy on the ascent, the propellant's bookkeeping, one frame seen three ways, replay
bit for bit, readouts that are finite and derived from the state, the Ring's one set of numbers, a
receipt for every number, and a flight director that is the crew's guidance and changes nothing (O15,
held by `test/test_fd.cpp`). `test/test_invariants.cpp` holds the rest as physics, with tolerances derived from
RK4's order and the steps' rounding, and shows each check able to fail (`ctest -R invariants`).
Three defects it found are fixed and their tests run with the rest: the hash missed fields, non-finite
controls were taken, and an escape path's periapsis was wrong. `INVARIANTS.md` keeps what was found. `evidence/` keeps the receipts. Every constant and
every number stated here is certified by Abacus, the owner's tool of certified arithmetic, or cited
where it cannot be; `evidence/INDEX.md` says what each receipt backs and lists the mismatches found.

## What is not

The Ring's people, anything furnished. Terrain: the globe is smooth and the field flat. Weather but the
wind: no cloud, rain or shear of a front, and the wind does not change the air's density or temperature. The
Ring's orbit decaying, the Earth's oblateness. Propellant for the small thrusters. VR, failures.

## What is coming

On the owner's list, none of it built yet:

- **Thrust vectoring, on the tilde's key** (the owner's, 2026-11-21, after DID's *F-22* of 1998, where
  that key put the jet into a thrust-vectoring mode for near-acrobatic flying). The craft already has the
  parts: a gimballed drive (`TVC_ANG`, 0.35 rad/s² in pitch and yaw at full thrust) and the deck's swivel,
  0 to 90° at 15°/s. In the air the pilot's law holds a pitch and a bank, moves them at 12 and 45 °/s,
  turns in balance and keeps the nose within 80° of the horizon. The mode would trade that for the stick
  as body rates (about 60 °/s in pitch and yaw, 180 °/s in roll), no turn co-ordination, the gimbal
  widened for it (TVC_ANG about 1.0) and the swivel free in pitch, so that the nose can be pointed past the
  stall and held there on thrust: a post-stall turn, a flat spin recovered, the nose pointed at a target
  while the craft flies on. What it needs first: the aerodynamics checked from 30° to 90° of attack at low
  speed (Polhamus's analogy does not model the vortices bursting, which ends a real slender delta's lift
  somewhere past 30°: the model must add it), the HUD's mode word
  (TV) and its attack angle, an automatic return to the normal law under 0.2 throttle or on the ground,
  and tests: the mode off changes nothing (the hashes, as O16 holds for the wind), a held 90° nose-up at
  100 m/s that the drive holds and the normal law refuses, and a recovery from it. The key: ` (Backquote,
  the key under Esc that also gives ~), whose frame meter moves to F2 (`?perf` still shows it).
- **A joystick and a throttle.** The page reads game pads now (the triggers are the throttle). A HOTAS
  shows up as a pad with more axes: the throttle's lever as the throttle's position, not its rate; the
  stick's twist or the pedals as yaw; a button for the thrust-vectoring mode; a page to bind them. The
  keyboard keeps = and − for the throttle (not Shift or Ctrl: Ctrl with W, a flying key, closes the tab).
- **The open Ring's air and the autoland into it**, specified for the Unreal version
  (`handoff/RING_AIR_SPEC.md`); its §8 builds it core first, and can show it in this page behind a flag
  before Unreal does.

## Handoff to Unreal

`handoff/README.md` starts a kit for building this sketch in Unreal Engine 5.8 from cold on another machine: what it settles against the canon, the port part by part, the first slice, the licence (settled: MIT), the open Ring's air and the autoland into it, specified (`handoff/RING_AIR_SPEC.md`), and the zip to carry.

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

`build-web/index.html` is the whole page in one file, about 2 MB; `build-web/page.html` is the same
without the document's skeleton, for a host that wraps a page in its own.

Each part's tests are `test/test_<part>.cpp`, and ctest runs each test by the name it declares in a line
reading `// TEST: <name>` (`ctest -R dock` runs docking's). `flight/orbit/build/orbit_run 10 900` prints
the crew's flight every 10 s for 900 s. `flight/orbit/build/orbit_fingerprint` prints the state's hash and
every readout block's digest at 3,756 marks along twelve flights: built at two commits and diffed, it shows
whether a change moved anything (`INVARIANTS.md`, O16).
`web/data/land.js` is made by `node flight/orbit/web/tools/land.mjs <ne_50m_land.geojson> <ne_50m_lakes.geojson>`.

The core is deterministic: the same inputs give the same state, and the tests check it by a hash of the
state. Native and WebAssembly runs agree to the digits printed above, not bit for bit.

The guide, a PDF for whoever comes to the sketch cold (`guide/`): `node flight/orbit/guide/build-guide.mjs`
opens the built page in Chrome, Chromium or Edge over the DevTools protocol, takes its screenshots there
and prints `guide/guide.html` to `guide/out/Runway-to-Ring-guide.pdf`; a quarter to half an hour in
software GL. `--list` names the screenshots, `--only` retakes some, `--skip-shots` only prints. `guide/out/`
is not committed. `node --test flight/orbit/guide/build-guide.test.mjs` holds the guide's figures and the
tool's screenshots to each other.
