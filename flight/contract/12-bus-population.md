# Bus population — what a healthy system actually sends

Measured from the driver and producers. Paths relative to
`<A32NX clone>\fbw-a32nx\src\wasm\fbw_a320\src\` unless noted. Repo `66021c2`.

## The structural fact

The driver never synthesises a bus field by field. It reads named L:vars into per-system
staging arrays and copies **whole structs** into `elac_inputs.bus_inputs` in one block
(`FlyByWireInterface.cpp:1421-1437`). So a port does not translate 152 numbers into 1,259
fields — it produces the few buses and copies them.

## Word format

`base_arinc_429 { uint32 SSM; float32 Data }`, 8 bytes.
`SSM`: 0 FailureWarning, 1 NoComputedData, 2 FunctionalTest, 3 NormalOperation
(`Arinc429.h:5-10`). Packing is low 32 = float bits, high 32 = SSM
(`Arinc429Utils.cpp:3-15`); the Rust producer is bit-identical
(`fbw-common/shared/arinc429.rs:147-159`).

**All-zero is FailureWarning, not a valid zero.** `valueOr` returns the default and
`isFw` is true.

Discrete bits are **1-based**: `bit b = ((uint32)Data >> (b-1)) & 1`, and the word is
stored as a numeric float (`Arinc429Utils.cpp:34-36`).

## Per bus

| bus | fields | assigned | ELAC reads | validity test |
|---|---|---|---|---|
| `base_adr_bus` ×3 | 9 | 9 | 4: mach, IAS, TAS, AOA | failed only if SSM == 0, so NCD counts as present (`ElacComputer.cpp:428-444`) |
| `base_ir_bus` ×3 | 31 | 23 | 9 across all three | **exactly SSM == 3** (`:449-480`) |
| `base_ra_bus` ×2 | 1 | 1 | radio height | SSM == 3 for ground logic (`:672-723`) |
| `base_sfcc_bus` ×2 | 5 | 5 | actual-position word (both), system-status word (SFCC1) | SSM == 3 |
| `base_fcdc_bus` ×2 | 25 | 25 (one copy) | **only `efcs_status_word_1`, `efcs_status_word_3`** (`:904-919`) | SSM == 3 |
| `elac_opp_bus` ×1 | 17 | 17 | 4: aileron command, double-pressurisation, two discrete words | all-zero when opponent unhealthy |

## The traps

- **`base_ir_bus.discrete_word_1` is never written and never read.** No alignment bit
  exists in this path. The ADIRU publishes alignment as a separate simvar
  (`A320NX_ADIRS_IR_n_MAINT_WORD`) that the ELAC driver does not wire in. A harness that
  sets it is inventing behaviour; the shipped aircraft leaves it zero.
- **Cruise RA is legitimately `{SSM=1, Data=8192}`**, not `{SSM=3}`
  (`fbw-common/navigation/ala52b.rs:287-315`). The producer forces max range and
  NoComputedData when it loses the ground target.
- **`inertial_vertical_speed_ft_s` is fed ft/min.** Name and unit disagree
  (`fbw-common/navigation/adirs.rs:2255`). The ELAC does not read it.
- **`base_ir_bus.track_angle_rate_deg_s` is fed heading rate**, not track-angle rate
  (`FlyByWireInterface.cpp:1326`).
- **`slat_flap_component_status_word` has no producer.** It reads `{0,0}` on the real
  aircraft too. The ELAC does not read it.
- **`elac_opp_bus` is all zeros until the opponent is healthy** (`elac/Elac.cpp:94-120`
  zeroes it when `!monitoringHealthy`). That is by design, not a port defect.

## Tick order — reproduce it

One tick (`FlyByWireInterface.cpp:96-194`):

```
RA → LGCIU → SFCC → ILS → ADIRS ×3 → TCAS → FCU → FMGC → ELAC ×2 → SEC ×3 → FAC ×2 → FCDC ×2 → FADEC
```

So ELAC sees same-tick ADR/IR/RA/SFCC/FMGC, but **SEC/FAC/FCDC are one tick stale**, and
`elac_opp` is the opponent's previous-tick output for ELAC 1 and its same-tick output for
ELAC 2. A harness that fills everything before the first step presents a state the real
aircraft never has, and the arbitration will disagree with it.

## Why this matters for the port

It shrinks the job. A world adapter does not have to produce 1,259 fields — it has to
produce three ADR lanes, three IR lanes, two RA, two SFCC, two FCDC status words, and the
opponent bus, in the same order, at the same staleness. That is a driver, and a small one.
