# The bus contract — what the computers actually consume

Corrects the previous note's framing. `SimConnectData.h` is the **MSFS driver's** struct;
the port needs the layer below it, which is `model\*_types.h`.

## Size, measured

| | |
|---|---|
| type headers | 12 |
| struct definitions | 140 |
| **distinct structs** | **104** |
| **distinct fields** | **1,259** |
| duplicated across headers | 19, all byte-identical [M] |

The duplicates exist because each `*_types.h` is self-contained (it includes only
`rtwtypes.h`). They are guarded by `#ifndef DEFINED_TYPEDEF_FOR_<name>_`, so first
definition wins and there is no conflict — verified by comparing all 19 bodies [M].

> Correction: an earlier count in this session said 111 structs / 1,742 fields. That
> parse mis-tracked braces and bled into the following struct. The numbers above come
> from a depth-counting parser and spot-check against the source (`base_time` = 3,
> `base_arinc_429` = 2).

## The boundary per computer

Every computer is driven the same three calls [R, `ElacComputer.h:320-330`]:

```cpp
void setExternalInputs(const ExternalInputs_<C>_T *);
void step();
const ExternalOutputs_<C>_T &getExternalOutputs() const;
```

and the wrapper structs hold exactly one member each:

```cpp
struct ExternalInputs_ElacComputer_T { elac_inputs in; };
struct ExternalOutputs_ElacComputer_T { elac_outputs out; };
```

So the whole contract for the five computers is **ten structs**:

| computer | inputs (members) | outputs (members) |
|---|---|---|
| ELAC | 5 | 6 |
| SEC | 5 | 6 |
| FAC | 5 | 7 |
| FCU | 5 | 4 |
| FMGC | 5 | 7 |

`ElacComputer`, `SecComputer`, `FacComputer`, `FcuComputer`, `FmgcComputer` — plus
`FadecComputer` and `FmgcOuterLoops`, which are internal.

## The ELAC in detail — the shape every other computer shares

```cpp
struct elac_inputs {
  base_time                time;             // dt, simulation_time, monotonic_time
  base_sim_data            sim_data;         // 5 booleans: slew, pause, tracking override,
  base_elac_discrete_inputs discrete_inputs; // 32
  base_elac_analog_inputs  analog_inputs;    // 15
  base_elac_bus_inputs     bus_inputs;       // 17 bus members
};

struct elac_outputs {
  elac_inputs                 data;           // echo
  base_elac_laws_outputs      laws;           // 2
  base_elac_logic_outputs     logic;          // 55
  base_elac_discrete_outputs  discrete_outputs; // 12
  base_elac_analog_outputs    analog_outputs;   // 5
  base_elac_out_bus           bus_outputs;    // 17 ARINC429 words
};
```

### Where a world adapter plugs in — `base_elac_analog_inputs` (15)

```
capt_pitch_stick_pos      fo_pitch_stick_pos     capt_roll_stick_pos   fo_roll_stick_pos
left_elevator_pos_deg     right_elevator_pos_deg ths_pos_deg
left_aileron_pos_deg      right_aileron_pos_deg  rudder_pedal_pos
load_factor_acc_1_g       load_factor_acc_2_g
blue_hyd_pressure_psi     green_hyd_pressure_psi yellow_hyd_pressure_psi
```

That is the pilot's four axes, the surface feedback, two load factors and three
hydraulic pressures. Everything else about the aircraft comes in over the buses.

### The buses — `base_elac_bus_inputs` (17 members)

```
adr_1/2/3_bus    base_adr_bus        9   air data (ARINC words)
ir_1/2/3_bus     base_ir_bus        31   inertial
fmgc_1/2_bus     base_fmgc_b_bus    18   guidance commands
ra_1/2_bus       base_ra_bus         1   radio altitude
sfcc_1/2_bus     base_sfcc_bus       5   slat/flap position
fcdc_1/2_bus     base_fcdc_bus      25   flaps/slats computer
sec_1/2_bus      base_sec_out_bus   17   the other spoiler computer
elac_opp_bus     base_elac_out_bus  17   the other ELAC
```

Redundancy is explicit — three ADRs, three IRs, two of everything else, and the
opponent's own output bus. A port must either fill all three lanes or fill one and
declare the others failed; leaving them zeroed is silently "all sensors dead", which the
computer will act on.

### What comes out — `base_elac_out_bus` (17)

`base_arinc_429` is `{ uint32_T SSM; real32_T Data; }` — a status/validity word and a
float. The bus carries left/right aileron position, left/right elevator position, THS
position, four sidestick command words and rudder pedal position. Read the ARINC words,
decode `SSM` before trusting `Data`.

## The header

`bus.h` — all 140 definitions concatenated in dependency order, `rtwtypes.h` inlined,
`#pragma once`. 83,650 B, no simulator dependency, no include path needed.

**Compile-proved** [M]: MSVC 2022 `cl /c /W4 /EHsc` on a probe that instantiates
`elac_inputs`, `elac_outputs`, `base_elac_bus_inputs` and `base_arinc_429` — exit 0, no
warnings.

**Measured sizes** [M], same compiler:

| struct | bytes |
|---|---|
| `base_time` | 24 |
| `base_sim_data` | 5 |
| `base_elac_analog_inputs` | 120 |
| `base_elac_bus_inputs` | 2,152 |
| `base_elac_out_bus` | 136 (17 × 8, consistent with `base_arinc_429` = 8) |
| `elac_inputs` | 2,336 |
| `elac_outputs` | 2,824 |

One ELAC step reads ~2.3 KB of state and writes ~2.8 KB. Trivial.

## Consequence for the port

The adapter surface is: fill 3 + 5 + 32 + 15 fields on the ELAC plus the bus lanes it
needs, call `step()`, read `base_elac_out_bus`. At 50 Hz that is a routine loop.

Two decisions the harness must make explicitly, not by accident:

1. **Which lanes are alive.** Fill ADR/IR 1 and declare 2 and 3 failed, or fill all
   three. Zeroed buses are not "no data", they are "sensor failure" and the law will
   degrade accordingly.
2. **`base_time.dt`.** The computers integrate against it. It must be the true step, not
   a nominal one.

## Provenance

- `...\fbw_a320\src\model\*_types.h` (12 headers, 140 definitions)
- `...\fbw_a320\src\model\{Elac,Sec,Fac,Fcu,Fmgc}Computer.h` (the three-call API)
- Repo HEAD `66021c2`, 2026-10-28. GPLv3.

