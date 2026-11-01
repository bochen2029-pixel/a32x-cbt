# 11 · A32NX port cost — measured

Shallow clone beside this repository, HEAD `66021c2`, dated 2026-10-28. 3,693 files,
1,295 MB including the large-file submodule.

## Head line: the law core is already portable

| crate | files | lines | MSFS coupling lines |
|---|---|---|---|
| `model/` (the laws) | 65 | **35,857** | **0** |
| `elac` | 3 | 326 | 0 |
| `sec` | 3 | 314 | 0 |
| `fac` | 3 | 236 | 0 |
| `fcdc` | 3 | 858 | 0 |
| `fcu` | 2 | 105 | 0 |
| `fmgc` | 2 | 163 | 0 |
| `busStructures` | 1 | 557 | 0 |
| `failures` | 3 | 84 | 1 |
| `recording` | 3 | 317 | 0 |

The complete ELAC / SEC / FAC / FCDC / FCU / FMGC set is ~2,000 lines of C++ that knows
nothing about a simulator.

## `model/` is Simulink-generated

`PitchNormalLaw`, `PitchAlternateLaw`, `PitchDirectLaw`, `LateralNormalLaw`,
`LateralDirectLaw`, `FmgcOuterLoops`, `rtwtypes.h`, `rt_modd`, and
`look1_binlxpw`/`look2_binlxpw`/`look2_pbinlxpw` lookup primitives — MATLAB/Simulink
Coder output. That is why it is 35,857 lines and zero-coupled: generated C++ from
rate-monotonic Simulink blocks, which is how the real thing is built. It compiles
anywhere C++ does.

For the CBT this is the single most valuable asset in the repo, and it is also the one
thing that must not be simplified: the normal/alternate/direct ladder and the protection
gains *are* the Airbus.

## All the coupling lives in two files

| file | bytes | coupling lines |
|---|---|---|
| `fbw_a320/src/FlyByWireInterface.cpp` | 180,976 | 270 |
| `fbw_a320/src/interface/SimConnectInterface.cpp` | 142,783 | 706 |

507 coupling lines sit outside `interface/`, and 270 of those are the driver. Excluding
the interface module and the driver, 33 files carry 237 lines between them.

So the port is a **driver rewrite**, not a law rewrite. `FlyByWireInterface` is the loop
that binds computers to a sim; its replacement is our own world adapter (clock, air data
in, surface commands out). `SimConnectInterface` is replaced outright — nothing in it is
worth keeping except `SimConnectData.h`, which is a well-shaped struct of every input and
output the computer set needs. That struct is the **port interface contract**, and it is
the first artefact to extract.

## Size

`fbw-a32nx/src/wasm` total: 77,936 lines (45,738 C++ in 112 files, 32,198 Rust in 37).
`fbw-a32nx/src/systems` (TypeScript, MSFS-side): 121,447 lines, 601 files, 3,053 coupling
lines.

The Rust `systems` crates (`a320_systems/src/{airframe,electrical,fuel,hydraulic,payload,
pneumatic}`, `a320_systems_wasm`) are the airframe systems — 32,198 lines, 85 coupling
lines. `a320_systems_wasm/src/*.rs` is the shim (nose wheel steering, gear, flaps,
elevators, reversers, ailerons); the 33 K of `a320_systems` proper is port-adjacent.

## Verdict

Cheaper than the previous round's estimate, and the risk moved rather than shrank:

- **Law core: ready.** Clean C++, compiles to wasm32 with no MSFS anywhere. Extract
  `SimConnectData.h` and go.
- **Systems: near-ready.** Rust, 85 shim lines, same treatment.
- **Displays/EFB/FMS pages: rewrite.** 121 K of TypeScript welded to
  `@flybywiresim/msfs-avionics`. This is the real bulk and it was always going to be.
- **Driver: write.** Our own, against our dictionary — which is exactly the layer PSX
  solved with its autopilot's mode hub and servo, and which note 10 describes.

## Licence

All of it is GPLv3, generated code included. Ship source. Keep the fork pinned; a
Simulink regeneration cannot be done by us without the `.slx` files, so treat `model/`
as read-only vendored output.


