# 12 · The aerodynamic axis model

`Aerodynamics.java`, 2,221 lines. This is the flight model and the single largest gap
between PSX and an Airbus.

## Entry

`runDelta()` at line 594 and runs to 1,119 — 526 lines, called once per fast pass from
`Core.java:1214`. It opens with a hard guard:

```java
static void runDelta() {
    if (nanStop) { return; }
    Aerodynamics.checkNan(0);
    if (aeroInhib > 0) { … }        // frozen aero after a reset, counted down
```

## The dispatch order

Fixed, and it is the causal order of the airframe:

```java
839: bankProgress();
840: pitchProgress();
841: yawProgressOfRudderAndAileron();
854: sideForce = Calc.getSmoothExpo(sideForceTarg, sideForce, …);
936: tasProgress();
1096: headingProgress();
1111: lateralProgress();
```

Roll → pitch → yaw → side force → speed → heading → position. Each step reads what the
previous one wrote (heading uses `sinBank`, position uses the resulting heading and TAS).

## Axis implementations

| axis | function | line |
|---|---|---|
| roll | `bankProgress` | 1,120 |
| pitch | `pitchProgress` | 1,288 |
| yaw | `yawProgressOfRudderAndAileron` | 1,424 |
| speed | `tasProgress` | 1,680 |
| heading | `headingProgress` | 1,483 |
| position | `lateralProgress` | 1,896 |

Every one is the same five-field template (note 01 §4): `targ*`, `*Vel`, `*Inertia`,
`*Drag`, `*BackForce`, integrated by the `*Progress` function against `Core.deltaAcc`.
`bankInertia` is recomputed from fuel weight each pass (`2166`), so the inertia term is
aircraft state, not a constant.

## The law is direct, with an airspeed schedule and clamps

`bankProgress` (see 1120-1232):

```java
targBkVel = ail * 0.0018f + elevator * -1.0E-4f * sinPitch * sinBank;
targBkVel *= iasReal / 280.0f;
...
bankInertiaDelta = Core.deltaAcc / bankInertia;
if (ground && absBank > 0.1134464f) { podstrike = true; bankInertiaDelta *= 5.0f; }
```

Stick goes straight into a roll-rate target, gain-scheduled by IAS, then integrated into
a bank angle. Protection is **clamping the result**, not scaling the command. That is a
direct law in Airbus terms, and the A320 needs a law here instead.

Ground behaviour is modulated in the same function: `podstrike` (wingtip) at 6.5° bank,
`wingstrike`, crosswind crab via `gndBankTarg = π/180 · (xw / 25)`, and `GearAttitude.now`
supplying the gear-attitude limits. The ground model is *inside* the roll law, not a
separate stage.

## Two structural details worth keeping

**Decimated derived rates.** Trend and acceleration are computed every 4th frame into a
counting window and then divided by the time the window actually took:

```java
793: if (frameSkip < 4) { ++frameSkip; frameSkipDelta += Core.deltaAcc; }
796: else {
806:     airspeedTrendTarg *= 7000.0f / frameSkipDelta;
812:     gsAccel = (gsReal - gsRealEx) * (1000.0f / frameSkipDelta);
```

So a rate is `Δvalue / Δtime` over the real window — never a fixed divisor.

**Numbered NaN checkpoints.** `checkNan(0)` … `checkNan(139)`, roughly 200 call sites
delimiting every stage of the function, so a failure names its stage. `stopByNan` sets
`nanStop` and `runDelta` returns early forever after (`596-598`). The body of `checkNan`
is empty in 10.137 (note 02 I10).

**Position sinks.** `radPerFrFac = 1.237588837482578e10 / deltaAcc` (1944), then one
sink per coordinate (1946, 1982, 2017, 2081). The model never holds a world vector.

## Carrying it

Keep: the axis dispatch order, the five-field template, the decimated-rate idiom, the
`Δvalue / Δtime` discipline, the numbered NaN stages, the position sinks, the ground
model's placement inside the roll axis.

Replace: the whole rate law. Roll must become a rate command with coordinated rudder and
a bank limit; pitch must become load-factor command with autotrim and envelope
protection; the clamps become protections; `stabTrimFac` mostly disappears.

Interface with JSBSim rather than re-deriving the coefficients: the same seven-function
interface receives surface commands and returns air data. The dispatch order and template
stay, only the body of each `*Progress` changes.

