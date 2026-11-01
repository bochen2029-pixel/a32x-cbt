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
npm run package     # bundle, then dist/a32x-cbt.zip — the download a user gets
npm run measure     # cold start, scenario reset, tick rate — headless Chrome on file://
npm run gate        # package, unzip outside the repo, run it from file:// offline: the P5 gate
```

The zip holds `index.html`, `app.js`, `data/`, `LICENSE` and `README.txt` (run instructions, the
disclaimer, the PSX attribution) in one `a32x-cbt/` folder. The file list is explicit in
`tools/package.mjs`, and the build is refused if a notice is missing or the page points at a file
the zip does not carry. Same tree, same bytes: entries are dated `SOURCE_DATE_EPOCH`, else 1980-01-01.

`npm run measure` opens the page the way a user does, from `file://`, in headless Chrome with
software rendering, and watches it from outside — no probe is built into `app.js`. It needs Chrome,
Chromium or Edge installed (or `CHROME` set to one); `-- --throttle 6` emulates a slower CPU, and
`-- --help` lists the rest. It drives the browser over a pipe, so no port is opened, and every
browser it starts is closed and its profile deleted.

`npm run gate` is what a stranger does: the zip is unzipped by the operating system's own tool into
a temp folder outside the repository and opened from `file://` with the network off, in a fresh
profile, three times. It passes only if the folder holds what it should, every request stays inside
it, nothing throws, and the page works: six drills, the disclaimer, a painted panel, time moving, a
switch answering a real click, a drill restarting, freeze holding. `-- --browser edge`, `-- --gpu`,
`-- --loads N` vary it.

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
| `web/` | the page, the bundle, `web/data/*.json`, and the `README.txt` that ships beside them |
| `tools/` | build, serve, package (with its own zip writer), measure, the package gate, and the headless-Chrome driver they share |

Read `../CLAUDE.md` before changing behaviour, and `../docs/conventions.md` for worked examples.
