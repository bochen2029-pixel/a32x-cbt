# flight/ — the aeroplane that flies

GPLv3. This tree links the FlyByWire A32NX flight computers, which forces the licence on everything
here. `app/` stays clear of it.

**Nothing here runs yet.** This is the contract and the proof, parked until phase P6.

## What is proved already

`spike/harness.cpp` compiles the 42 unmodified A32NX law sources against no simulator at all and
drives the ELAC for 60 simulated seconds. It engages and commands 17° of elevator from a stick input,
finite throughout. See `spike/README.md` — including the mistake that cost the first run.

That is the evidence the law core is port-bound rather than runs-only-in-MSFS.

## What is here

| path | what |
|---|---|
| `contract/bus.h` | the full computer input/output contract: 104 structs, 1,259 fields, self-contained, compiles clean |
| `contract/11-bus-contract.md` | the boundary in prose, and what a world adapter must fill |
| `contract/12-bus-population.md` | what a healthy system actually sends, bus by bus, with validity rules |
| `contract/10-sim-io.md` | the MSFS driver's own struct — the layer that gets deleted, not ported |
| `spike/harness.cpp` | the headless proof |
| `contract/compile_probe.cpp` | a one-file check that `bus.h` still compiles |

## What P6 has to build

1. Clone A32NX at `66021c2` beside this repository.
2. Replace `FlyByWireInterface.cpp` with a world adapter, working to `contract/11-bus-contract.md`.
3. Fill buses per `contract/12-bus-population.md` — including the one-tick staleness of SEC/FAC/FCDC,
   which is how a real aircraft behaves and which the arbitration depends on.
4. Step ELAC/SEC/FAC at 50 Hz for 30 minutes with no NaN.

## Getting the sources

```
git clone --depth 1 --branch master https://github.com/flybywiresim/aircraft.git ../a32nx
git -C ../a32nx checkout 66021c2
```

They are **not vendored here.** `bus.h` and the contract documents are derived artefacts — keep them
in sync by hand if the upstream commit ever moves, and re-run `compile_probe.cpp` when you do.

## Licence

Everything here is GPLv3, including the derived `bus.h`. Ship source. The upstream notices are in the
A32NX clone, not here; keep them when you redistribute.
