# An open Ring that holds its air by its spin

A design note for the Unreal version, from the owner, 2026-11-12. Nothing here is built.

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
