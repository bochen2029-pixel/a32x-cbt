# Headless spike — the ELAC runs outside MSFS

`harness.cpp` drives the real `ElacComputer` from `model/` with no MSFS, no wasm, no
simulator. Built with MSVC 2022 against the 42 unmodified model sources.

## Result [M]

**The law engages and commands surfaces.** Full nose-up stick at 50 Hz:

```
 t      stick   elevCmd  busElevL  thsCmd  inflt
13.00   -1.000  17.0000   0.0000   0.0000      1
   stk=-1.000 tot=-1.000 law=3 eng=1 can=1 pri=1 grnd=0
```

- `elevator_command_deg = 17.0°` at full stick, held 20 s, finite throughout.
- `is_engaged_in_pitch=1`, `has_priority_in_pitch=1`, `pitch_axis_ok=1`,
  `digital_output_validated=1`, `ap_1_authorised=1`, `pitch_law_in_flight=1`.
- 3,000 steps, 60 s, exit 0, all outputs finite, no NaN.

## The bug that cost the first run — mine

First run gave `law=4` (`None`) and zero command. One line, `ElacComputer.cpp:867-868`:

```cpp
rtb_y_p = !ElacComputer_U.in.discrete_inputs.is_unit_1;
hasPriorityInPitch = (rtb_y_p || ElacComputer_U.in.discrete_inputs.opp_axis_pitch_failure);
rtb_isEngagedInPitch = (canEngageInPitch && hasPriorityInPitch);   // :869
```

`is_unit_1 = true` means **no pitch priority**. Priority belongs to the other unit.
Setting it `false` (or `opp_axis_pitch_failure = true`) engages the law.

Chain: `is_unit_1=true` → no priority → not engaged → `:1051` sets the law capability to
`None` → no command.

## Law is Direct (3), not Normal (0) — and why

`ElacComputer.cpp:1038-1049` requires **three** Normal capabilities at once: the opponent
ELAC's roll law, the pitch law, and `priorityPitchLateralLawCap` — which at `:1002-1003`
is this unit's *own* lateral law capability. That last one is not Normal in the harness.

Filling the opponent bus with all-valid words did not change it. The lateral capability
comes from elsewhere in the model, and reaching Normal needs the neighbouring computers
present — the FCDC `efcs_status_word_1`/`efcs_status_word_3` lanes in particular
(`ElacComputer.cpp:904-919` are the only FCDC words it reads).

**This is not a blocker and not worth chasing yet.** Direct law is the correct behaviour
for a computer set missing its neighbours, and B2 is where the neighbours get built.

## Corrections to my earlier guesses

I listed four candidate gates. Two were wrong:

- **`base_ir_bus.discrete_word_1`** — never written by the driver and never read by the
  ELAC. There is no alignment bit. Searching `ElacComputer.cpp` for `discrete_word_1`
  returns nothing. That candidate was a dead end.
- **ADR/IR validity words** — the ADR is judged failed only when a word is exactly SSM=0
  (`ElacComputer.cpp:428-444`), so `NoComputedData` still counts as present; the IR
  requires exactly SSM=3 (`:449-480`). The harness already satisfies both.

The gate was `is_unit_1`, which was on my list only by accident.

## Facts worth keeping

- **All-zero `base_arinc_429` = `{SSM=0, Data=0}` = FailureWarning**, never "valid zero".
- Bit b of a discrete word is 1-based: `((uint32)Data >> (b-1)) & 1`, and the word is a
  *numeric* float (`Arinc429Utils.cpp:34-36`).
- The driver copies whole structs; it never synthesises fields. `elac_opp_bus` is all
  zeros whenever the opponent is unhealthy — by design (`elac/Elac.cpp:94-120`).
- The front half of a tick (`FlyByWireInterface.cpp:96-194`) updates ADR/IR/RA/SFCC/FMGC
  before the ELAC, but SEC/FAC/FCDC after it — so those buses are one tick stale. A
  harness must reproduce that lag or the arbitration sees a state the real aircraft never
  has.

## Not yet populated

`bus_outputs.left_elevator_position_deg` stays 0; the law command lives in
`laws.pitch_law_outputs.elevator_command_deg`. The ARINC bus words are the transmitted
form, gated on the digital distribution path, which needs the opponent and downstream
computers present.

## Build

```
cl /std:c++17 /EHsc /I"...\src\wasm\fbw_a320\src\model" /Fe:harness.exe harness.cpp "...\model\*.cpp"
```

Exit 0, no errors. 25 objects; `FmgcComputer.obj` 157 KB, `ElacComputer.obj` 61 KB, exe
593 KB.

## Verdict

The 35,857-line law core compiles and runs standalone from a `#include` and a loop,
engages, and produces a physically plausible surface command. What remains is
**population of neighbouring buses**, not integration. The port is a driver problem —
confirmed by execution, not by reading.
