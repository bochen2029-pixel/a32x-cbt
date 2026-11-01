# app/ — the trainer

The application. Original TypeScript, MIT, links nothing GPL.

**To run it: double-click `web/index.html`.** No Node, no server. The page is a single committed
`web/app.js` with its content inlined, so it works from `file://`.

## To work on it

```
npm ci
npm run build:web   # typecheck, then bundle to web/app.js
npm run check       # typecheck + the full suite, 160 tests
npm run serve       # optional: http://127.0.0.1:8130
```

Node 24. TypeScript and esbuild are build-time only; there are no runtime dependencies.

`tsc` typechecks (`noEmit`), esbuild emits the bundle. Content in `web/data/*.json` is imported at
build time, not fetched — a fetch is blocked under `file://`.

## Demos

Headless walkthroughs of the model, useful when reading it:

```
npm run demo            # cold & dark to powered, bus table
npm run demo:flow       # two trainees, two debriefs
npm run demo:panel      # the overhead, as ASCII
npm run demo:ecam       # the display, generated from state
npm run demo:scenario   # save an aircraft, load it into a fresh one
npm run demo:drill      # a fault drill end to end
npm run demo:depress    # the depressurisation drill
```

## Layout

| path | what |
|---|---|
| `src/dictionary.ts` | typed state registry: names, kinds, ranges, validated writes |
| `src/clock.ts` | fixed-step clock at 20 Hz, debt-dropping |
| `src/systems/` | electrical, fuel, bleed, engines, APU, pressurisation, hydraulics, and the dispatch list |
| `src/panel/` | controls as data, the panel schema and validator, the ASCII view |
| `src/ecam/` | message and page schemas, warnings, rendering |
| `src/training/` | procedures, drills, scoring, setups |
| `src/session/` | dictionary + clock + procedure + faults; replay; instructor verbs |
| `src/scenario/` | save, parse, atomic apply |
| `src/app/` | browser entry and draw model |
| `web/` | the page, the bundle, and `web/data/*.json` |

Read `../CLAUDE.md` before changing behaviour, and `../docs/conventions.md` for worked examples.
