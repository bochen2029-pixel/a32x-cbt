# The open Ring's air, and the autoland into it

A spec for the Unreal version, written 2026-11-21 on the owner's word ("go ahead and spec that out"). It
takes the owner's brainstorm, option 4 of `OPEN_RING_AIR.md`: the 5 km Ring stays, its air is a rule of
the world, 1 atm at the floor and nothing by 50 m, and a craft lands on the flight deck by an
Elysium-style autoland that follows the wheel's turn and curve like an airliner, then converts to a
vertical landing. The Bishop ring, the physically true alternative, is Appendix B. Nothing here is built
yet; §8 is the order to build it in, core first, because the C++ core is what the Unreal project links.

Every number below is either derived here or measured on the sketch at 7eccaf8:
`tools/ring_air_estimate.mjs` makes the air's and the path's again (§5.5), and the tour's come from the
native core. Each one is chosen for the sketch
and describes no real vehicle or station.

## 1. Decisions this spec takes

| | decision | why | to undo |
|---|---|---|---|
| D1 | The Ring keeps its size, spin and spokes: 5 km floor, 1 km band, rim walls 380 m high, six spokes. The band is open to space all round, as in *Elysium*: no roof over the floor and no bulkheads across it. Each spoke meets the band on a yoke across it at the roof's old level, 300 m up, resting on the walls' tops. | The owner's picture ("open to space, as in the film *Elysium*", `OPEN_RING_AIR.md`); the air needs no roof; and the approach of §4 flies 1.7 km along the band at up to 200 m, which a roof would cut. Under 300 m the band is clear all the way round. | Keep the sketch's roof and cut an approach slot in it, 2.2 km spinward of the deck and 100 m wide over the path; nothing else in this spec changes. |
| D2 | The air is a **plateau and a skin**: ordinary air held by the spin up to 30 m, then a 20 m skin in which a field holds it down, and vacuum from 50 m. | People breathe sea-level air on the floor and on anything up to 30 m, so an open town needs no sealed buildings; below 30 m the air is the air the Ring's own spin holds, and the only fiction is the skin. The owner's words hold: 1 atm at the floor, nothing by 50 m. | The plain exponential (§2.8) is one constant set away; its cost is thin air at head height and hypoxia on a 10 m roof. |
| D3 | The field acts on the air only: not on the craft, a person, a ball or anything solid. Exhaust that reaches the layer becomes part of its air. | One rule, stated once. A field that pushed solids would be a second gravity, and the Ring's 1 g would no longer be its spin. | none intended |
| D4 | The autoland is a new crew mode, `OC_AUTO_AUTOLAND`, beside the least-propellant crew (`OC_AUTO_DECK`), which stays as it is. | The least-propellant crew is the oracle-checked baseline; the autoland is the airliner-like way, costing about 0.6 t more (§5.5). | Drop the mode; nothing else depends on it. |
| D5 | In the web sketch the open-Ring world is a flag, off by default. With it off, the core computes exactly what it computes now: every state, hash and test. | The sketch's own world (roof, sealed band, vacuum deck behind bulkheads) is consistent and measured; the Unreal build turns the flag on. Like O16 for the wind. | Make the flag the default once the Unreal version leads. |

## 2. The air: one function

### 2.1 Definition

In the Ring's frame (`orbit_core.h`: x = `ref` turning at `OC_RING_SPIN`, y = the axis, z = x × y), a point
has a distance r from the axis and an offset y along it. Its height over the floor is h = R − r, with
R = `OC_RING_FLOOR_M` = 5,000 m. Then, with every constant in the table below:

- outside the band (|y| > `OC_RING_WIDTH_M` / 2 = 500 m), or at or above the top (h ≥ h_t): ρ = 0, exactly;
- below the floor (h < 0, where the gear and a plume may sample): h is taken as 0;
- in the plateau (0 ≤ h ≤ h_s): ρ = ρ₀ · exp(−(h / H_g)(1 − h / 2R)), the isothermal air the spin itself
  holds, with gravity falling in a straight line toward the axis (`OPEN_RING_AIR.md`: p ∝ exp(−(R² − r²)/2RH));
- in the skin (h_s < h < h_t), with x = h − h_s: ρ = ρ(h_s) · (exp(−x² / 2δ²) − e_t) / (1 − e_t), where
  e_t = exp(−(h_t − h_s)² / 2δ²) = 0.016880, so that ρ meets 0 at the top with no step;
- the pressure p = ρ R_s T, the temperature T, everywhere the air is.

| constant | value | what |
|---|---|---|
| ρ₀ | 1.225 kg/m³ | the floor's density: ISA's sea level |
| p₀ | 101,325 Pa | the floor's pressure: ρ₀ R_s T |
| T | 288.15 K | the air's temperature, the same everywhere (isothermal) |
| R_s | 287.05287 J/(kg K) | air's gas constant, as the 1976 standard atmosphere has it |
| γ | 1.4 | so the speed of sound a = √(γ R_s T) = 340.29 m/s, everywhere in the layer |
| g_floor | ω²R = 9.8125 m/s² | the floor's pull, with ω = `OC_RING_SPIN` = 0.0443 rad/s |
| H_g | R_s T / g_floor = 8,429.5 m | the plateau's scale height, as the Earth's |
| h_s | 30 m | the plateau's top, `OC_AIR_PLATEAU_M` |
| h_t | 50 m | the layer's top, `OC_AIR_TOP_M`: above it, vacuum |
| δ | 7 m | the skin's width, `OC_AIR_SKIN_M` |
| μ | 1.789 × 10⁻⁵ Pa s | the viscosity at T, for Reynolds numbers |

### 2.2 Values

| h | ρ / ρ₀ | p | what is there |
|---|---|---|---|
| 0 | 1.00000 | 101.32 kPa | the floor |
| 1.7 m | 0.99980 | 101.30 kPa | a person's head |
| 10 m | 0.99882 | 101.20 kPa | a three-storey roof |
| 20 m | 0.99763 | 101.09 kPa | the hover's centre of mass (`OC_DECK_HOVER_M`) |
| 30 m | 0.99646 | 100.97 kPa | the plateau's top |
| 35 m | 0.76824 | 77.84 kPa | |
| 40 m | 0.34823 | 35.28 kPa | the skin's middle |
| 45 m | 0.08493 | 8.61 kPa | |
| 48 m | 0.02005 | 2.03 kPa | |
| 49 m | 0.00836 | 0.85 kPa | |
| 50 m and up | 0 | 0 | vacuum |

The layer holds 47.11 kg of air over each square metre of floor, against the Earth's 10,330; the whole
band, 1.48 million tonnes.

### 2.3 What the field is

Held still in the skin, the air needs a force per kilogram that balances its pressure's fall:
−(1/ρ) dp/dh = R_s T · x/δ² for the Gaussian part. It is 880 g's worth 5 m into the skin, 1,806 at 10 m,
3,102 at 15 m and about 10,000 at 19 m, where the last of the air is thin. That is the fiction, said
once: a field in the skin that holds the air, the way a film holds a bubble, and touches nothing else
(D3). Below the skin there is no fiction at all.

### 2.4 Where it is

Over the whole floor of the band, all the way round, between the rim walls. The walls are 380 m high and
the layer 50 m, so the walls hold it at the sides with 330 m to spare; past them, and anywhere 50 m or
more over the floor, is vacuum. Nothing across the band holds pressure: the sketch's bulkheads at the
deck's ends are gone (D1).

### 2.5 The air turns with the Ring

Still air is still in the Ring's frame: its velocity among the stars at a point r is ω × r. A craft's
airspeed is its velocity in the Ring's frame, less any wind there (none by default; a wind, if added, is a
field in the Ring's frame, as `wind.cpp`'s is in the Earth's). A craft hovering over a pad has no airspeed
at all.

### 2.6 Its interface

```
/* orbit_ring_air.h: the open Ring's air (RING_AIR_SPEC.md 2). Pure: no state, no clock. */
#define OC_AIR_PLATEAU_M 30.0
#define OC_AIR_TOP_M 50.0
#define OC_AIR_SKIN_M 7.0
enum { OC_AIR_RHO, OC_AIR_P, OC_AIR_T, OC_AIR_A, OC_AIR_SIGMA, OC_AIR_COUNT };
void oc_ring_air(double h, double y, double* out);          /* by height over the floor and offset along the axis */
void oc_ring_air_at(const double* eci, double* out);        /* at a point among the stars, at the core's time */
```

Readouts (`OC_*` in `orbit_core.h`): the air's density ratio σ = ρ/ρ₀ and its pressure at the craft's
centre of mass, and the same at its nozzle. The walk's readouts get the pressure at the person's head.

### 2.7 One function, used everywhere

`OPEN_RING_AIR.md` named the risk: if one thing feels the air differently from another, it reads as a
bug. So every consumer calls `oc_ring_air`, and nothing else in the core, the page or the Unreal project
computes the Ring's air:

| consumer | what it takes |
|---|---|
| the craft's aerodynamics (§3.1) | ρ and a at the centre of mass; the airspeed in the Ring's frame |
| the jets near the deck (§3.3) | σ at the nozzle |
| the plume (§3.4) | p at the nozzle, for the exit-to-ambient pressure ratio that shapes it |
| the sound (§3.4) | σ at the source and at the listener |
| the walk (§3.5) | p at the head; ρ for a thrown ball's drag |
| the Unreal View | a 1-D table of ρ(h) filled by calling the function at load, never retyped (§8, U2) |

A test holds the rule as `builds.test.mjs` holds the core's clock: no other source file contains the
skin's or the plateau's formula (RA14).

### 2.8 The alternative considered: one exponential

ρ = ρ₀ exp(−h / 11 m), cut at 80 m, is the profile `OPEN_RING_AIR.md` first sketched. It is the Earth's
atmosphere squeezed, smooth all the way, and its gradient starts at the floor:

| h | 1.7 m | 10 m | 20 m | 30 m | 50 m |
|---|---|---|---|---|---|
| ρ / ρ₀ | 0.857 | 0.403 | 0.162 | 0.065 | 0.011 |

A person's head is at 86 % of their feet's air, which is like standing at 1,400 m; on a 10 m roof the air
is that of 7,500 m, and on a 20 m tower that of 14 km. Every building would be sealed, and the town would
read as a mountain top. To choose it anyway: h_s = 0 and the skin replaced by the exponential, in the one
function; the tests' values change and nothing else does.

## 3. What the air does

### 3.1 Aerodynamics in the turning frame

The core integrates the craft among the stars (ECI) and already models the Ring's turn exactly for the
deck: the floor's frame turns at ω, so a craft moving at u along the floor feels the centrifugal
(ωr + u)²/r and Coriolis 2ω × v (`orbit_deck.h`; `deck.cpp`, `forceFor`). The air adds one force: the
existing aerodynamic model (Polhamus's lift, Newtonian above Mach 5, the same coefficients and
`S_REF` = 150 m²) evaluated with ρ and a from `oc_ring_air` and the airspeed v_air = v_ring − w, rotated
back to ECI. Where the craft is in the Earth's air and the Ring's at once (it never is: the Ring is at
500 km), the two densities add.

It is small. The craft is jet-borne whenever it is in the layer, because the layer is too thin to fly in:

| the craft | q | lift at C_L 0.5 | of its weight there |
|---|---|---|---|
| 30 m/s at 45 m, entering the skin | 47 Pa | 4 kN | 2 % |
| 20 m/s at 35 m | 188 Pa | 14 kN | 5 % |
| 10 m/s at 25 m | 61 Pa | 5 kN | 2 % |
| 30 m/s at 20 m, if it flew that fast that low | 550 Pa | 41 kN | 12 % |

So the guidance treats aero as a known disturbance and feeds forward its own estimate, from the same
function (the crew knows the air's law; that is not the world's truth leaking).

### 3.2 Coriolis, which matters more

At the approach's speeds the turning frame dominates the air. Along the floor at u (+ spinward), the
pull a craft must hold against, to keep its height, is r(ω + u/r)²: at the final approach fix, 80 m/s
antispinward at 200 m, it is 0.39 g; at the hover over the pad, 0.99 g. Spinward at 80 m/s it would be
1.8 g. A ball dropped 20 m in the plateau lands 2.03 s later, 1.20 m antispinward of the point under where
it was let go (without drag; with a ball's drag a few centimetres less). The walk already turns with the
Ring; with the air it also has drag.

### 3.3 The jets near the deck

The F-35B and the Harrier lose lift near the ground: the jets entrain the air around them, and the low
pressure under the airframe pulls it down ("suck-down"); with several jets, a fountain between them pushes
back up. In vacuum none of it happens, because there is no air to entrain, which is why the sketch's
vacuum deck has none. With the layer it starts.

The model, stated and bounded: a force toward the deck of

    F_sd = k_sd · σ(h_n) · T_swivel · (D_e / h_n)²,   capped at 0.05 T_swivel, and none for h_n over 30 m,

where h_n is the nozzle's height over the floor, T_swivel the thrust through the swivel's downward part,
D_e = 2 m an effective jet diameter, and k_sd = 0.04, so that with the legs on the deck (h_n about 2 m) it
takes 4 % of the thrust. The shape follows the published V/STOL hover-in-ground-effect correlations, which
fall with height roughly this way; the constants are this sketch's, chosen so the hover's height loop
(0.3 /s on place, 1.0 /s on speed) absorbs the change. Read the correlations before tuning; the SOURCES.md
row for them is marked "search". No fountain lift: the craft has one main nozzle.

### 3.4 The plume and the sound

- **The plume.** Its shape follows the exit-to-ambient pressure ratio p_e / p(h_n): in vacuum an
  under-expanded jet fans out wide and faint; in the plateau it is a tight column. Between, the skin
  closes the fan in 20 m of descent. Where it meets the plating in air (σ > 0 at the floor and h_n under
  about 30 m), it lifts dust; in vacuum it does not.
- **The sound.** A jet's noise needs the air around it: its acoustic power is proportional to the ambient
  density (Lighthill's eighth-power law, as usually stated, W ∝ ρ₀U⁸D²/c₀⁵), so the plume's roar, heard
  outside, scales with σ at the plume and reaches a listener only through air (σ > 0 along the path).
  Inside the craft, the sketch's structure-borne voices stay; the airborne ones fade in with σ at the
  hull. A person on the deck hears nothing of an approaching craft until its plume meets the skin, then
  the roar arrives in a few seconds as it descends.

### 3.5 People

Pressure at the head from the function; the plateau is sea level. A person climbing past 30 m, on a tower
or a lift's open frame, enters the skin: 78 kPa at 35 m, 35 kPa at 40 m. The world either keeps open
structures under 25 m or encloses what rises higher. The spoke lifts are sealed cars, as in the sketch.

## 4. The autoland

### 4.1 What it is

The Elysium approach as an airliner flies one. The craft comes in along the band, antispinward, nose
first, on a glide path fixed in the Ring's frame: a straight line in the floor's own coordinates, so seen
from the stars it is a spiral, the craft in a steady turn about the Ring's axis, about 1.6° a second at
the final approach fix (half a standard-rate turn), its pull growing from 0.39 g to 1 g as it slows. It
decelerates down the path to a decision point just above the air, then converts as the F-35B does, the
swivel going down as the speed goes, through the skin into the air, to a hover 20 m over the pad, and
descends to the touch. The deck crew's hover, descent and touchdown are reused as they are.

### 4.2 The frame and the coordinates

Over the chosen pad: s, the floor's arc from the pad's centre, + spinward; y, across the band, from the
pad's line; h, height over the floor. The deck crew's `Over` (`deck.cpp`, `overOf`) already gives s, h,
and their rates; y is the Ring's axis.

The approach is antispinward: the craft comes from +s toward the pad. It costs least: the coast out from
the hold point already moves antispinward in the Ring's frame (at rest among the stars, the floor sweeps
past at 221.5 m/s), and the pull is lightest that way. Spinward would mean 1.8 g at the fix and about 0.9 t
more propellant.

### 4.3 The path

| point | h | s (out from the pad) | speed along the path | what |
|---|---|---|---|---|
| FAF, the final approach fix | 200 m | 1,713 m | 80 m/s | the capture's end, on the path, established |
| DP, the decision point | 60 m | 381 m | 30 m/s | 10 m over the air's top: continue or wave off |
| HP, the hover point | 20 m | 0 | 0 | over the pad's centre: the deck crew's hover |

- The glide path: h = 20 m + s · tan 6°, aimed at the hover point, not at the floor; `OC_AL_GLIDE_DEG` 6.0.
  An airliner's is 3°; a VTOL's decelerating approach is steeper. At 6° the FAF is under the yokes'
  300 m level, and for the farthest pad (the spinward one, 400 m from the deck's centre) it is 2,113 m
  from the centre, 505 m short of the nearest spoke's yoke at 2,618 m: the capture comes down into the
  band between spokes.
- Laterally, on the pad's line, y = 0 (the pads are on the band's centre line).
- The speed: scheduled by the distance to go along the path, d, at constant decelerations, the sketch's own
  law from the booster lander (`docs/provenance.md` §1h): V = √(2 a_c d) inside the DP, and
  V = √(V_DP² + 2 a_f (d − d_DP)) from the FAF to the DP, so a_f = 2.05 m/s² and a_c = 1.18 m/s².
- The nose: along the path, antispinward, wings level to the floor; the deck crew's allocator
  (`vectored`) sets the attitude and the swivel for the force asked (§4.5), as it does for the plans.

### 4.4 The phases

| phase | from | does | to the next when |
|---|---|---|---|
| TRANSFER, DEPART | the engage, as now | to the hold point if not near it; out into the wheel, as `OC_AUTO_DECK` does | out of the hub's neighbourhood |
| CAPTURE (new) | DEPART's end | a plan of least propellant (`deck_plan`, lossless convexification) whose end is the FAF's state, not the gate: position on the path at 200 m, velocity along it at 80 m/s; coasting weightless meanwhile, as now | at the FAF, within 10 m and 2 m/s of it |
| FINAL (new) | the FAF | tracks the path and the speed (§4.5); vacuum all the way | at the DP: continue if within the DP's window, else WAVE-OFF |
| CONVERT (new) | the DP | the same law down the path's last 381 m, decelerating to the hover point; the swivel turns down with the speed; through the skin into the air (the air arrives at 50 m; the skin takes about 9 s, at 26 down to 15 m/s) | at the hover point, within 3 m and 1 m/s |
| HOVER, DESCEND, LANDED | the hover point | the deck crew's own, unchanged, with the jets' suck-down now acting in air | as now |
| WAVE-OFF (new) | FINAL, CONVERT | stop on the path and climb to 60 m; then the deck crew's own way when riding over the deck: hover to the pad, descend | the hover point reached |

Waves off from FINAL or CONVERT: vertical error over 15 m (3 dots), lateral over 20 m (2 dots), speed off
the schedule by more than 10 m/s, or the pad not clear. At the DP the window is tighter: 5 m vertical,
10 m lateral, 5 m/s. A wave-off is the VTOL's missed approach: there is no runway to fly past, so it stops
and hovers above the air, then takes the pad from the hover as the deck crew already does.

### 4.5 The law

In the floor's coordinates the craft is commanded accelerations, then the deck crew's own functions turn
them into a force and the force into the attitude, swivel and throttle:

    s̈_cmd = s̈_ref + k_s (ṡ_ref − ṡ)                         along the path: speed by position, no place loop
    ḧ_cmd = ḧ_ref + k_hp (h_ref(s) − h) + k_hv (ḣ_ref − ḣ)   on the glide path
    ÿ_cmd = k_yp (0 − y) + k_yv (0 − ẏ)                      on the pad's line
    f     = forceFor(over, frame, s̈_cmd, ḧ_cmd, ÿ_cmd, tide) − aero_est / m
    vectored(state, local, f, nose_antispinward, up, spin, tilt ≤ 30°, &throttle)

`forceFor` carries the turning frame exactly (centrifugal and Coriolis, from the floor's rates) and the
Earth's tide; nothing of the frame is approximated in the law. The gains are the hover's: k_hp 0.3 /s,
k_hv 1.0 /s on height; k_yp 0.15 /s, k_yv 0.6 /s across, critically damped; k_s 0.5 /s along. The thrust
asked stays under 0.9 of `T_MAX`, which leaves headroom: the most the path asks is at the hover point,
332 kN for 33.4 t, 0.47 of `T_MAX`.

### 4.6 The numbers

A point mass of 34 t flown exactly along the path (the estimate of §5.5, not the core):

| t | out | h | speed | pull | thrust | air |
|---|---|---|---|---|---|---|
| 0 s | 1,713 m | 200 m | 80.0 m/s | 0.39 g | 133 kN | 0 |
| 5.4 s | 1,312 m | 158 m | 68.9 m/s | 0.46 g | 181 kN | 0 |
| 11.9 s | 912 m | 116 m | 55.6 m/s | 0.55 g | 206 kN | 0 |
| 20.5 s | 512 m | 74 m | 38.0 m/s | 0.68 g | 245 kN | 0 |
| 26.8 s | 313 m | 53 m | 27.2 m/s | 0.76 g | 261 kN | 0 |
| 36.0 s | 113 m | 32 m | 16.3 m/s | 0.85 g | 289 kN | 96 % |
| 49.5 s | 0 | 20 m | 0 | 0.99 g | 332 kN | 100 % |

### 4.7 Propellant

| part | time | propellant |
|---|---|---|
| CAPTURE, from the hold point: out at 40 m/s, a 120 s coast, one burn of 140 m/s | about 130 s | 314 kg (274 to 359 for 20 to 60 m/s out) |
| FINAL and CONVERT, the FAF to the hover point | 49.5 s | 635 kg |
| HOVER 8 s and the descent | 20.2 s | 335 kg |
| **the autoland** | **about 200 s** | **about 1.28 t** |
| the least-propellant crew, measured in the tour at 7eccaf8 (from the hub's port, by way of the hold point) | 168 s | 692 kg |

The tour today: 4,388 kg at orbit, 3,696 on the pad, 2,966 back at the hold point, 2,554 at the stop on
17C. With the autoland in place of the least-propellant landing, about 1.97 t at the stop. No refuelling
is needed. The crew refuses the autoland if its estimate (the capture's plan, plus 1.0 t for the rest)
would leave less than `OC_AL_RESERVE_KG`, 1,500 kg: enough to take off again and fly home.

### 4.8 Clearances

From the FAF on, the craft is inside the band, under the yokes' level, where nothing stands but the
floor, low buildings (under 25 m, §3.5) and the walls 500 m to either side. The path is over 60 m until
the DP, and from the DP on it is over the deck itself, but for the spinward pad, whose DP is 31 m short of
the deck's end, at 60 m. Before it, CAPTURE plans among the spokes as the deck crew already
does (60 m off the Ring's plane, `OC_DECK_SIDE_M`), with the FAF as its end. A sweep over the whole flight
holds every part of the Ring at least 30 m from the craft (RA10).

## 5. What the pilot sees and hears

### 5.1 The display

| item | shows |
|---|---|
| the mode | AUTOLAND and the phase: CAPTURE, FINAL, CONVERT, HOVER, DESCEND, LANDED, WAVE-OFF |
| the deviations | vertical, 1 dot = 5 m; lateral, 1 dot = 10 m; two dots full scale, as the sketch's ILS draws them for 17C (`fd-hud.js`) |
| the speed | along the path, in the Ring's frame, with the schedule's bug; the sink |
| the pull | in g: 0.39 at the FAF to 1.00 on the pad, the number that says the frame turns |
| the air | AIR and σ in percent with the pressure in kPa; 0 until 50 m, then counting up through the skin |
| to go | the distance to the pad along the floor and the time |
| the path | gates every 200 m along it, 20 m wide and 10 m tall, curving with the floor; the hover point marked over the pad |
| the propellant | used since the engage, and what the reserve allows |

A pilot can fly it by hand: the flight director runs the autoland's law in the shadow, as `fd.cpp` does for
the sketch's crews, and gives its cues on the same display.

### 5.2 The sound, in order

Silence outside the hull and the craft's structure-borne voices inside, through the capture and the
final approach; at about 50 m the plume meets the skin and the roar fades in over the skin's
nine seconds; in the hover the full sound of a jet in air over plating, its echo off the deck, and the dust.

### 5.3 The picture

The layer as a haze 50 m deep along the whole band, densest at the floor and thinning through the skin,
lit from above; seen from the hub or from orbit, a bright line along the floor's edge, the way the Earth's
limb looks. The plume closing from a fan to a column as it comes down through the skin.

### 5.4 Why the order matters

The approach is in vacuum until the last 50 m. That is the point of the fiction: the show (the air
arriving, the sound, the dust, the plume) is concentrated in the last nine seconds of the conversion and
the hover, after a long, quiet, precise approach in a turning frame.

### 5.5 How these numbers were made

`node flight/orbit/tools/ring_air_estimate.mjs` prints them. A point mass flown exactly along the path in the Ring's turning frame: the specific force from the path's
own accelerations and the frame's centrifugal and Coriolis terms, the mass falling at a specific impulse of
2,000 s, from 34 t at the FAF; the hover and descent by the deck crew's descent law (2 m/s, easing at
0.45 m/s² to 0.3 m/s at the touch); the capture as a radial departure, a coast and one burn. The tour's
propellant from the native core at 7eccaf8, flying the tour's sequence (crew to orbit, dock, the deck
landing, take-off, the flight home). The core's own flight of the autoland will differ; RA8 records what
it measures.

## 6. Acceptance tests

Each a test with the feature, each shown able to fail, as the sketch's are.

| | test | holds |
|---|---|---|
| RA1 | the floor | ρ(0) = 1.225 and p(0) = 101,325 exactly |
| RA2 | the shape | ρ continuous and never rising with height, over −10 m to 1 km at 1 mm; exactly 0 (bitwise) at and above 50 m and outside the band |
| RA3 | the values | §2.2's table, to 10⁻⁵ |
| RA4 | the column | ∫ρ dh = 47.11 kg/m², by quadrature, to 10⁻³ |
| RA5 | still air turns with the Ring | a craft at rest in the Ring's frame anywhere in the layer has zero airspeed and zero aerodynamic force |
| RA6 | the flag off changes nothing | every existing test's hash and number unchanged with the open-Ring world off; with it on, unchanged for any flight that never enters the band |
| RA7 | the ball | dropped from 20 m without drag, it lands at 2.03 s, 1.20 m antispinward, to 1 cm; with drag, the rotating-frame equations integrated finely agree with the core |
| RA8 | the autoland lands | from the hold point, on each of the three pads, inside the touchdown's tolerances; 100 of 100 on a development pool and on a held-out pool with the deck pools' disturbances (drive, mass, swivel, navigation); the propellant recorded, its estimate here being 1.28 t |
| RA9 | it tracks | nominal, from the FAF to the DP: vertical within 3 m, lateral within 3 m, speed within 3 m/s; in the pools, within twice that |
| RA10 | it clears | every part of the Ring at least 30 m from the craft throughout, by the dock's sweep |
| RA11 | the air arrives only below 50 m | σ at the craft is 0 until h < 50 m; the thrust asked in CONVERT never exceeds 0.9 `T_MAX` |
| RA12 | replay | a run stopped and resumed in CAPTURE, FINAL, CONVERT (in the skin) and HOVER (in the air) matches the straight one, hash for hash |
| RA13 | refusals | refused below the reserve, or far from the Ring; a refused engage changes nothing (D5 of the invariants) |
| RA14 | one function | no source but `ring_air.cpp` holds the plateau's or the skin's formula; the page's and the View's air come from `oc_ring_air` |
| RA15 | the wave-off | forced off the path in FINAL and in CONVERT, it waves off, hovers over the air, and lands from the hover |
| RA16 | the jets | the suck-down is 0 at σ = 0 and above 30 m, at most 5 % of the thrust, and the crew lands inside its tolerances with it on |

## 7. What this changes in the canon and the port

- `UNREAL_PORT.md`: the Snapshot gains σ and p at the craft and at its nozzle, the autoland's phase, its
  deviations and its pull; the View gets the layer's table (U2) and draws nothing it computes itself.
- `CANON_DELTA.md`: the deck is no longer a vacuum sector behind bulkheads; the band's air is one function;
  the deck crew has a second mode.
- `FIRST_SLICE.md` is unchanged: its slice ends with the walk; the deck and the air are a later slice.

## 8. The order to build it in

Core first, in the sketch's repository (runway-to-ring, or a32x-cbt's `flight/orbit`), each step with its
tests green natively and as WebAssembly before the next:

1. **A1, the air.** `core/ring_air.cpp`, `orbit_ring_air.h`, the world flag (`oc_world`, off by default),
   the readouts; `test/test_ring_air.cpp`: RA1 to RA4, RA14.
2. **A2, the force.** The aerodynamic hook for the Ring's air in the craft's step; RA5, RA6.
3. **A3, the walk.** The head's pressure and the ball's drag; RA7.
4. **A4, the jets.** The suck-down; RA16.
5. **A5, the law.** FINAL, CONVERT and WAVE-OFF from a state set at the FAF (`internal.h`, as
   `test_wind.cpp` sets states the page cannot); RA9, RA11, RA15.
6. **A6, the capture.** `deck_plan`'s end made a parameter (the gate now, the FAF for the autoland); the
   mode `OC_AUTO_AUTOLAND` = 7 from the hold point; RA8 (nominal), RA10, RA12, RA13.
7. **A7, the pools.** RA8 in full; the README's numbers and `INVARIANTS.md`'s rows from what they measure.
8. **A8, the director.** The autoland's law in `fd.cpp`'s shadow, and its cues.
9. **A9, the page (optional).** The open-Ring world behind a flag in the web sketch: the layer drawn by the
   same function in the shader, the display of §5.1, the sound of §5.2. A preview, so that the core's
   behaviour is seen before the Unreal View exists.

Then in the Unreal project:

- **U1.** The Snapshot's new fields, through the C API as the plugin already reads it.
- **U2.** The layer: a volumetric material over the band sampling a 1-D table filled from `oc_ring_air` at
  load. Unreal's exponential height fog cannot draw the plateau and the skin, and must not be tuned to
  look like them: the table is the function.
- **U3.** The display of §5.1, the sound of §5.2 (MetaSounds, levels from σ), the plume's shape from the
  pressure ratio, the dust from the jets' readouts.
- **U4.** The town under 25 m, or enclosed, as §3.5 says.

## Appendix A. The numbers' sources

The hydrostatic profile in a turning frame, the centrifugal and Coriolis terms, and the ideal gas are
textbook physics (`docs/provenance.md` §1h, the deck's rows). ISA's sea level and R_s are the 1976
standard atmosphere's, as the core already uses. The constant-deceleration speed law is the booster
lander's, already cited in §1h. The F-35B's conversion is the sketch's model for the deck crew already.
Lighthill's law is the standard result for jet noise. The V/STOL suck-down correlations are to be read
before the constants of §3.3 are tuned (SOURCES.md, "search"). Everything else, the plateau and the
skin, the path, the gates, the speeds and the reserve, is this spec's choice.

## Appendix B. The Bishop ring instead

The physically true option 1 of `OPEN_RING_AIR.md`: R about 1,000 km, ω = 3.13 × 10⁻³ rad/s, the floor
moving at 3,132 m/s, walls about 200 km high, open at the top. What changes, section by section:

- **§2, the air.** The function becomes the true hydrostatic profile, p(r) = p₀ exp(−(R² − r²)/2RH):
  1/e at 8.5 km, 1/1,000 at 60 km, 10⁻⁶ at 124 km. Same interface, same tests with new values, no
  fiction left.
- **§3, what it does.** Aerodynamics is no longer small: at 100 m/s near the floor q is 6.1 kPa and the
  wing carries 0.8 of the craft's weight at C_L 0.5. Coriolis is weaker: 2ωv is 0.13 g at 200 m/s.
- **§4, the autoland.** CAPTURE becomes an entry: coming down from above the walls, nearly at rest among
  the stars, the craft meets air turning at up to 3.1 km/s, Mach 9 near the floor. `return.cpp`'s entry
  guidance flies it (the predictor-corrector and Sutton-Graves heating, with the Ring's density profile in
  place of the Earth's). FINAL becomes a real glide and a powered approach, as to 17C, wings flying.
  CONVERT, HOVER and DESCEND are unchanged.
- **The cost.** Thousands of kilometres of floor and wall: streaming and a level of detail from orbit
  down to a pad. In the core, little: the function and the entry's model. In the Unreal project, a world.

The choice between this and the main spec is the owner's; this spec builds the main one because it keeps
the Ring the owner has, and needs no world-sized geometry.
