# 10 · Autopilot and FMC — the B2 layer

Mapped, not ported. This is the part whose *content* is wrong for an Airbus and whose
*shape* is worth having.

## Mode machine

The autopilot holds 31 modes, each an integer, in three axes — the 747's own annunciations:

- roll: blank, attitude, heading hold, heading select, LNAV, localizer, rollout and take-off/go-around;
- pitch: take-off/go-around, altitude, flare, flight-level change, glideslope, vertical speed, and
  the VNAV family (altitude, path, speed, plain VNAV, failed and off), with a VNAV capture zone
  of 750 ft;
- thrust: idle, speed, thrust, thrust hold, thrust reference, no autoland, LAND 2, LAND 3, command,
  flight director and test.

Three separate axis variables — roll, pitch and thrust — never a single combined mode.

## Every transition is staged

Each axis has a shadow copy of its mode. Handlers write only the shadow during a pass; the
committed value changes once. No consumer can observe half a transition. This is the causal-order
rule (02 I6) applied to state rather than to call order.

Transition triggers are heterogeneous and each mode's handler owns its own:

- switch-armed, from the MCP: the autothrottle arm switch, the LNAV push, the speed window, and so on,
- capture zones: 750 ft of altitude for VNAV capture,
- computed interlocks: whether the autopilot is powered, a go-around failure, radio-altitude
  gates, latching timers above and below a low radio altitude, and the single-authority check
  (02 I5) so only the master transitions.

Approach capability is graded by state, not by a flag: no autoland, LAND 2 or LAND 3,
alongside a three-valued thrust-control state.

## The mode state is networkable

The autopilot's state is one semicolon-delimited string variable, one field per axis. Reading it
back validates each field with its own range check and reports which one was out of range. So the
autopilot state is a string variable — addressable, savable in a `.situ` and transportable — the
same dict/transport machinery as everything else (notes 04, 05).

## Law shaping

The servo is one inner-loop and one outer-loop layer. The inner loops drive aileron, elevator and
rudder commands through the smooth exponential integrator (02 I2) with per-mode gains, and a
smoother ramps a newly engaged mode in over milliseconds. Inner loops are rate commands; the outer
loop adds pitch/roll modes.

Boeing-specific: control wheel steering, the hard and soft stabiliser-trim paths, MCP
wheel-and-bug semantics, mode-reversion timers.

## FMC / FMGC stack

| part | role |
|---|---|
| route store | lateral route store and leg geometry |
| departures and arrivals | SID/STAR and transition assembly |
| vertical predictions | vertical predictors |
| vertical modes | vertical mode logic |
| CDU | page machine, 69-key keypad |
| NG FMC | the NG FMC variant |
| FMC hub | fan-out hub across all FMC subsystems |
| page families: take-off and approach reference, performance, hold, progress, route, fix info, thrust limits, data link, maintenance, reference nav data, messages, FANS, standby route | one page family each |
| CDU hub | CDU multiplexer, key dispatch |

The CDU is a 0..68 key array, each key an object with a position and a callback, bound to one
key variable per CDU (left, centre, right) and to the network. Page text is generated into the
24-character string line format (note 05), so the page is the transport.

The CDU hub also checks for EICAS memo and ACARS messages, and the printer carries 100+ messages:
the CDU is also a memo/message surface.

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
- the stabiliser-trim logic almost entirely — the A320 trims itself.

Size is the argument: this layer is one of the largest parts of PSX, and about as large again
in the A32NX. It is the whole of B2 and none of B1.
