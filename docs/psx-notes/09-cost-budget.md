# 09 · Cost budget

Measured statically from the dispatch lists in `Core.java`.

| figure | value |
|---|---|
| unique subsystems in the world | **68** |
| calls in the fast pass (`runAllegro`) | **49**, at 20 Hz → ≈980 subsystem updates/s |
| calls in the slow pass (`runLento`) | **41**, at 1 Hz → 41/s |
| aggregate size of the participating classes | ≈3.0 MB of source (54 of them were large enough to rank; mean 55.8 KB) |
| whole program | 7,481 classes, 7.5 MB jar, 18.7 MB decompiled source |

Every one of those 980 updates per second runs on the same thread as the fast pass, and
the pass is followed by a fixed `sleep(50)`. So the design assumes the work fits
comfortably inside 50 ms and does no per-frame budget management at all. There is no
frame-time target, no adaptive quality, no culling, no LOD — because there is nothing to
cull: it is all arithmetic over scalars.

For calibration: the program shipped requiring a 2.5 GHz dual-core and 4 GB, and its
published frame rate is 30–74 fps, which is the AWT repaint rate, not the physics rate.

## What this means for the CBT

The 68-subsystem, 980 Hz model is the *wrong* top-end target for a laptop CBT, and it is
easy to read the list and assume it is mandatory. It is not:

- A B1 CBT (panels, buses, ECAM, flows, no aero) needs perhaps 20 of the 68 — the
  electrical, hydraulic, fuel, bleed, pressurisation, fire, and alert layers, plus the
  panel and click plumbing. Everything aero, FMC and radio can be stubbed or omitted.
- The 980 Hz figure is dominated by aero and engine integration at 20 Hz. A CBT at a
  fixed 20 Hz with the systems only is a fraction of the work.
- The cost driver is not arithmetic, it is *state width*: 68 subsystems × ~4 fields each
  read and written per pass. A typed dictionary of that width is the memory cost, not the
  CPU cost, and it is tens of kilobytes.

## Budgets to set on day one

- Fixed step, **20 Hz** systems, decoupled render at display rate. Never tie the model to
  `requestAnimationFrame`.
- A hard wall-clock ceiling of **4 ms** per model tick on the 2014-laptop reference; if
  exceeded, that is a bug, not a tuning opportunity.
- No allocation inside a tick. The dictionary is allocated once.
- The scenario must reset in **< 20 ms**, which rules out reconstructing subsystems and
  forces a "reset to defaults, then apply the .situ" path.

## Reference machine

Whatever he next has to hand that is old. PSX shipped to 2.5 GHz dual-core; the CBT
target should be a lower rung than that, so the reference machine is a 2014 ultrabook
class — and it should be the machine the thing is *built* on, not tested on.

