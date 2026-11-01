# A32X CBT

A computer-based trainer for an A320 fly-by-wire, built to run on a laptop with no graphics card and
no installer. Systems, ECAM, flows and graded drills — not a flight simulator.

![the trainer](reference/ui-panel-and-drills.png)

Unofficial. Not affiliated with Airbus, FlyByWire Simulations or Aerowinx. Not for type training.

## What it is

A trainee works an overhead panel, watches a generated ECAM, and is graded against real procedure
order. Every step carries the reason it matters; the debrief names what was missed and why, and how
far off the aim any measured step landed.

Six drills ship: power up, before start, start engine 1, after start, a BLUE hydraulic pump failure,
and a depressurisation in cruise. An instructor can freeze the aircraft, inject any fault, or drop
the trainee into a different one.

## What it is not

No aerodynamics and no fly-by-wire laws, so nothing flies. The systems are plausible abstractions,
not A320 data. The panel is a layout grid, not traced geometry. See `ROADMAP.md` for phases P6–P10,
which add the real law core, JSBSim and the displays.

## Run it

**No Node needed to run it.** Open `app/web/index.html` — double-click it. The page is one committed
script with its content inlined, so it works straight off the disk.

To rebuild or develop:

```
cd app
npm ci
npm run build:web
npm run check      # typecheck + 182 tests
```

## Layout

| path | what |
|---|---|
| `app/` | the trainer — systems, panel, ECAM, procedures. Unencumbered. |
| `flight/` | the aeroplane that flies: the A32NX flight computers flying a JSBSim airframe, headless. GPLv3. |
| `docs/` | provenance, architecture, and the design study of the PSX reference |
| `tools/` | static server, and how to rebuild the PSX reference tree |
| `reference/` | screenshots |

## Provenance in one line

No third-party source is vendored. `app/` is original TypeScript; the behaviour in it was worked out
by study. `flight/` links GPLv3 FlyByWire A32NX and carries that licence. Full detail and the
position taken on each source: `docs/provenance.md`.

## For an agent working here

Read `CLAUDE.md`, then `docs/provenance.md`, then `ROADMAP.md`. The suite must be green before any
commit.

