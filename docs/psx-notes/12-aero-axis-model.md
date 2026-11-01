# 12 · The aerodynamic axis model

The flight model, and the single largest gap between PSX and an Airbus.

## Entry

One function runs the flight model, once per fast pass. It opens with a hard guard: once a NaN
stop has been raised it returns at once; otherwise it passes its first NaN checkpoint; and while
a post-reset inhibit is counting down, the aerodynamics stay frozen.

## The dispatch order

Fixed, and it is the causal order of the airframe: roll, then pitch, then yaw from rudder and
aileron, then side force (through the smooth exponential integrator, 02 I2), then true airspeed,
then heading, then lateral position.

Roll → pitch → yaw → side force → speed → heading → position. Each step reads what the
previous one wrote (heading uses the bank, position uses the resulting heading and TAS).

## Axis implementations

Each axis is its own pass — roll, pitch, yaw, speed, heading and position — and every one is the
same five-quantity template (note 01 §4): a target, a rate, an inertia, a drag and a back force,
advanced against the pass's elapsed time. The roll inertia is recomputed from fuel weight each
pass, so the inertia term is aircraft state, not a constant.

## The law is direct, with an airspeed schedule and clamps

The roll pass works like this. The roll-rate target is the aileron input times a small gain,
plus a coupling term from the elevator through pitch and bank; that target is gain-scheduled by
indicated airspeed, in proportion to it and normalised at 280 kt; bank follows the target
through the inertia term; and on the ground, past about 6.5° of bank, a pod strike is flagged
and the roll response is made five times quicker.

Stick goes straight into a roll-rate target, gain-scheduled by IAS, then integrated into
a bank angle. Protection is **clamping the result**, not scaling the command. That is a
direct law in Airbus terms, and the A320 needs a law here instead.

Ground behaviour is modulated in the same function: the pod strike (wingtip) at 6.5° of bank, a
wing strike, a ground bank target proportional to the crosswind, and limits on gear attitude from
a separate gear-geometry model. The ground model is *inside* the roll law, not a separate stage.

## Two structural details worth keeping

**Decimated derived rates.** Trend and acceleration are computed every 4th frame into a
counting window and then divided by the time the window actually took: the window counts four
frames while summing their elapsed time, and the airspeed trend and the ground-speed
acceleration are each the change over the window divided by that summed time.

So a rate is `Δvalue / Δtime` over the real window — never a fixed divisor.

**Numbered NaN checkpoints.** About 140 numbered checkpoints, at roughly 200 call sites,
delimit every stage of the function, so a failure names its stage. A NaN stop makes the
function return early forever after. The check itself is empty in 10.137 (note 02 I10).

**Position sinks.** A radians-per-pass scale is computed from the elapsed time, then there is
one sink per coordinate. The model never holds a world vector.

## Carrying it

Keep: the axis dispatch order, the five-field template, the decimated-rate idiom, the
`Δvalue / Δtime` discipline, the numbered NaN stages, the position sinks, the ground
model's placement inside the roll axis.

Replace: the whole rate law. Roll must become a rate command with coordinated rudder and
a bank limit; pitch must become load-factor command with autotrim and envelope
protection; the clamps become protections; the stabiliser-trim factor mostly disappears.

Interface with JSBSim rather than re-deriving the coefficients: the same seven-function
interface receives surface commands and returns air data. The dispatch order and template
stay, only the body of each axis pass changes.
