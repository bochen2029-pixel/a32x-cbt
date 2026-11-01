# 10 · Autopilot and FMC — the B2 layer

Mapped, not ported. This is the part whose *content* is wrong for an Airbus and whose
*shape* is worth having.

## Mode machine

`AfdsHub` holds 31 mode constants, all integers (AfdsHub.java, constants block):

```
roll:    BLANK, ATT, HDG_HOLD, HDG_SEL, LNAV, LOC, ROLLOUT, LTOGA
pitch:   VTOGA, ALT, FLARE, FLCH_SPD, G_S, V_S, VNAV_ALT, VNAV_PTH, VNAV_SPD, VNAV,
         VNAV_FAIL, VNAV_OFF, VNAV_CAPTURE_ZONE(=750)
thrust:  IDLE, SPD, THR, THR_HOLD, THR_REF, NO_AUTOLAND, LAND_2, LAND_3, CMD, F_D, TEST
```

Three separate axis variables — `rollEngaged`, `pitchEngaged`, `throttleMode` — never a
single combined mode.

## Every transition is staged

Each axis has a shadow: `rollEngagedNew`, `pitchEngagedNew`, `throttleModeNew`. Handlers
write only the shadow during a pass; the committed value changes once. No consumer can
observe half a transition. This is the causal-order rule (02 I6) applied to state rather
than to call order.

Transition triggers are heterogeneous and each mode's handler owns its own:

- switch-armed, from the MCP: `McpAtArm`, `McpPshLnv`, `McpWdoSpd` etc.
- capture zones: `VNAV_CAPTURE_ZONE = 750` ft of altitude,
- computed interlocks: `AfdsFcc.anyPowered`, `gaFail`, radio-altitude gates, latching
  timers (`timerBloRa5`, `timerAbvRa5`), and `Network.notClient()` so only the master
  transitions.

Approach capability is graded by state, not by a flag: `NO_AUTOLAND`, `LAND_2`, `LAND_3`
plus `VCM_THRREF / VCM_CRZ / VCM_IDLE`.

## The mode state is networkable

`AfdsHub.readGlob()` (AfdsHub.java:501) parses a semicolon-delimited string from
`Glob.qs[Glob.qsAfds]`, one field per axis, and validates each with its own range check
(`error = 1..4` on violation). So the autopilot state is a `Qs` value, addressable,
savable in a `.situ` and transportable — the same dict/transport machinery as everything
else (notes 04, 05).

## Law shaping

`AfdsFcc` is the servo: 2,453 lines, one `Fcc` class and one `OuterLoop` class, with
`innerAil` / `innerEle` / `innerRud` driven through `getSmoothExpo` with per-mode gains
(AfdsFcc.java:2406-2446) and an `acquireSmoother` that ramps a mode in over ms
(1430-1431). Inner loops are rate commands; the outer loop adds pitch/roll modes.

Boeing-specific: CWS, `stabTrimHard`/`stabTrimSoft`, MCP wheel-and-bug semantics,
`shallowTimer` mode-reversion timers.

## FMC / FMGC stack

| class | lines | role |
|---|---|---|
| `Routes` | 6,852 | lateral route store and leg geometry |
| `FmcDepArr` | 4,414 | SID/STAR and transition assembly |
| `FmcVnavCalc` | 3,840 | vertical predictors |
| `FmcVnav` | 3,640 | vertical mode logic |
| `ControlDisplayUnit` | 3,683 | page machine, 69-key keypad |
| `FmcNg` | 2,410 | NG FMC variant |
| `FmcGlobal` | 2,657 | fan-out hub across all FMC subsystems |
| `FmcTkofRef`, `FmcAppRef`, `FmcPerf`, `FmcHold`, `FmcProgress1/2`, `FmcRte`, `FmcFixInfo`, `FmcThrustLim`, `FmcDataLink`, `FmcMaintenance`, `FmcRefNavData`, `FmcMessages`, `Fans`, `RoutesStby` | 130–1,871 each | one page family each |
| `CduHub` | — | CDU multiplexer, key dispatch |

The CDU is a 0..68 key array, each key an object with a position and a `KeyProcess`
callback, bound to `Glob.qKeybCdu{L,C,R}` and to the network (ControlDisplayUnit.java).
Page text is generated into the 24-character `Qs` line format (note 05), so the page is
the transport.

`CduHub.checkEicasMemoAcarsMsg()` and a `printout` of 100+ messages show the CDU is also
a memo/message surface.

## What transfers

- axis-separated modes with a staged shadow per axis,
- capture-zone constants and per-mode timers,
- approach capability as graded state,
- mode state as an addressable, validated, serialisable value,
- the 69-key keypad with per-key callbacks and generated page text.

## What does not

- the mode *set*: Airbus has no CWS, no FLCH, and 747 throttle modes are not A320
  thrust detents (CL/FLX/MCT). Airbus is `OP CLB`, `OP DES`, `CLB`, `DES`, `ALT CST`,
  `G/S`, `LOC`, `LAND`, with managed/selected as the real distinction.
- two-channel AP vs Airbus two-autopilot approach logic and its armed/engaged ladder.
- `stabTrim` almost entirely — the A320 trims itself.

Size is the argument: this layer is ~40,000 lines in PSX and ~the same again in the
A32NX. It is the whole of B2 and none of B1.

