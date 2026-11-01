# 09 · Cost budget

Counted from the two passes' dispatch lists (note 01 §1).

| figure | value |
|---|---|
| unique subsystems in the world | **68** |
| calls in the fast pass | **49**, at 20 Hz → ≈980 subsystem updates/s |
| calls in the slow pass | **41**, at 1 Hz → 41/s |
| whole program | a 7.5 MB Java program |

Every one of those 980 updates per second runs on the same thread as the fast pass, and
the pass is followed by a fixed 50 ms sleep. So the design assumes the work fits
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

Whatever old machine is next to hand. PSX shipped to 2.5 GHz dual-core; the CBT
target should be a lower rung than that, so the reference machine is a 2014 ultrabook
class — and it should be the machine the thing is *built* on, not tested on.
