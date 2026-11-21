# An open Ring that holds its air by its spin

A design note for the Unreal version, from the owner, 2026-11-12. Nothing here is built. Option 4, the
owner's, is specified in full in `RING_AIR_SPEC.md` (2026-11-21).

## The idea

The Ring is open to space, as in the film *Elysium*. Its air is held to the floor by the spin's gravity,
as the Earth's is held by the Earth's. The air is thickest at the floor and thins toward the axis, and the
hub is in vacuum.

A craft landing on the flight deck starts in vacuum near the hub and ends at sea level on a pad. On the
way down it flies the airliner's approach, then hovers like the booster lander. So the air around it goes
from none to full in one approach, while everything turns, and the aerodynamics change all the way down.
No other flight sim offers that, and the owner wants it calculated, not faked.

## What the physics says

In the Ring's turning frame, a gas at rest feels the centrifugal pull ω²r outward, where r is the
distance from the axis. Hydrostatic balance is dp/dr = ρ ω² r. Air is ρ = p / (R_s T), and here it is
taken isothermal, so

    p(r) = p_floor · exp( −(R² − r²) / (2 R H) ),   with ω² R = g and H = R_s T / g.

H is the scale height at the floor: 8,434 m for air at 288 K and 1 g, the same as the Earth's. The air
thins over about one scale height near the floor. Higher up it thins more slowly than the Earth's,
because the spin's gravity falls off in a straight line to nothing at the axis.

| radius R | spin period | floor speed ωR | air at the axis, of the floor's | thins to 1/e at | to 1/1,000 at | to 1/1,000,000 at |
|---|---|---|---|---|---|---|
| 5 km (this sketch) | 142 s | 221 m/s | **74 %** | never | never | never |
| 50 km | 449 s | 700 m/s | 5.2 % | 9.3 km up | never | never |
| 200 km | 897 s | 1,400 m/s | 7 × 10⁻⁶ | 8.6 km up | 71 km up | never (the axis is 7 × 10⁻⁶) |
| 1,000 km (a Bishop ring) | 2,006 s | 3,132 m/s | 2 × 10⁻²⁶ | 8.5 km up | 60 km up | 124 km up |

So the vacuum-to-sea-level gradient takes about as much height as it does on the Earth: tens of
kilometres for most of it, and about 120 km for all of it. The spin cannot squeeze it into a few hundred
metres.

At the sketch's 5 km, an open Ring would hold no air at all. The spin's pull is too weak over so short a
height, so the air would fill the wheel at three-quarters of the floor's pressure and pour out of the open
sides. That is why this sketch's Ring has a glazed roof and sealed rim walls, and why its flight deck is a
vacuum sector behind bulkheads. The sketch is consistent as it stands.

## Ways to have it in the Unreal version

1. **Make the Ring big: a Bishop ring.** A radius near 1,000 km, rim walls about 200 km high, and an open
   top. The air reaches near-vacuum about 120 km above the floor, below the walls' tops, and leaks over
   them only slowly.
   - **The landing becomes an entry.** The air turns with the floor at up to 3.1 km/s. A craft coming
     down from near the axis, at rest among the stars, meets that air at up to Mach 9 near the floor. It
     brakes, heats and glows, and then glides to the deck. The air takes most of the 3.1 km/s of
     rotation-matching off the craft by drag, as the Earth's air takes 7.6 km/s off a craft on its way
     home.
   - **What it costs:**
     - The structure is thousands of kilometres of floor and walls, so it needs streaming and a level of
       detail from orbit down to a pad.
     - The rotation-matching speed is greater than the drive's spare propellant can supply. The air has to
       do most of it, which is the interest.
2. **Keep about 5 to 50 km and a roof, or a membrane, over the band.** The air is then nearly uniform, as
   now. The vacuum-to-air step is a lock or a door, not a gradient. Cheaper, but not the idea.
3. **Somewhere between: 200 km.** The axis is in vacuum, the floor speed is 1.4 km/s, and walls of about
   100 km let air out at about 10⁻⁴ of the floor's pressure. That is not enough without a lid or
   replenishment. Possible, if the leak is explained by the setting.

The owner's idea, done faithfully, is option 1.

4. **Keep 5 km, and make the air a rule of the world: the owner's "magic" layer** (2026-11-21, a brainstorm,
   not a decision).
   - **The setting.** The Ring stays this size and stays open over the deck. The air at the floor is one
     atmosphere, and by about 50 m up there is almost none.
   - **What the physics would need.** A layer that thin wants a scale height of about 11 m: 1 % of the
     floor's density at 50 m, 40 % at 10 m, 16 % at 20 m. Held by weight, that takes an air that feels
     about 780 g, where the floor gives it 1. So it is not gravity. It is a rule of the setting, a field
     that holds the air down, like a force field in a film.
   - **Say so in the game.** Everything else stays physical, and the model treats the field as given:
     the density is ρ_floor·exp(−h/11 m) over the floor, turning with the Ring, and nothing above about
     80 m.
   - **What it does to the landing.** Most of the Elysium-style approach the owner pictures stays in
     vacuum. The craft comes in co-rotating, tracking the Ring's curve like an airliner on a curved glide
     path, as `deck.cpp`'s crew already flies it. The air arrives only in the last tens of metres, where
     the craft is already in hover. A descent at 30 m/s meets 0.55 kPa at the floor: a real buffet and a
     real ground effect, and its sound, but not wings flying. The aerodynamic part of the show is the
     hover's air: rotor wash on the plating, the plume's dust, the sound arriving as the air thickens.
   - **What it costs.** Little. It is a density function in the deck's frame, no structure, no streaming.
     Air in the deck's sector needs no bulkheads to hold it, so the deck and the town can share the band
     (the bulkheads become doors).
   - **Its risk.** The rule must be the same for everything: the walk, the sound, the plume, a dropped
     ball. Otherwise it reads as a bug. One function, used everywhere.

Option 4 trades physical truth for the same Ring and a short, cheap, dramatic last 50 m. Option 1 is
truthful and spectacular, and costs a world's worth of geometry. The owner asked for option 4 to be
specified: `RING_AIR_SPEC.md`, with option 1 as its Appendix B. Neither is built.

## What the model must then have

- **The air turns with the Ring.** In the turning frame the still air is the reference. The craft's speed
  through the air is its speed in the turning frame plus any wind. Seen from the stars, the air moves at
  ω × r.
- **Density from height above the floor, by the formula above.** Each step is a cheap exp. The sketch's
  USSA76 stays for the Earth's own air. A lapse rate and the floor's temperature can follow.
- **Gravity falls in a straight line toward the axis**, and Coriolis is 2ω × v in the turning frame. At
  1,000 km, 2ωv is 0.13 g at 200 m/s. That is weaker than in the sketch's 5 km Ring, where flying 100 m/s
  spinward or antispinward changes the weight by about a g, but still felt.
- **Entry heating and loads**, as `return.cpp` already models for the Earth: Sutton-Graves heating, a
  predictor-corrector with a learning model. The Ring's air differs only in its density profile and in
  turning.
- **The deck's guidance**, as `deck.cpp` has it now, but starting from the bottom of the entry instead of
  from a glide in vacuum. In the turning frame the dynamics stay linear except for drag, so the convex
  planner (G-FOLD) still applies to the last part, below the air's fast changes.
- **Weather**, if wanted. Coriolis gives it the same kind of large-scale flows as the Earth's, at its own
  scale.

## Sources

The hydrostatic profile in a rotating frame is textbook physics, worked here. The Bishop ring is Forrest
Bishop's 1997 concept for an open-topped ring a thousand kilometres in radius, with walls about two hundred
kilometres high.
