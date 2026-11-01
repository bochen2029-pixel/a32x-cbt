# House rules

Read these before touching code. They are the conventions this codebase already holds itself to;
keep it that way.

## 0 · Read first, then build

1. `docs/provenance.md` — what came from where. **No third-party source is vendored. Implement, do
   not port.** Do not ask for the Aerowinx jar; `docs/architecture.md` has the design in prose.
2. `ROADMAP.md` — what phase we are in. Do not start work from a later phase.
3. `docs/architecture.md` — how the thing is shaped.

Build and test from `app/`:

```
npm ci
npm run build:web
npm run test:all      # must be green before any commit
npm run serve         # http://127.0.0.1:8130
```

`app/` has two dev dependencies, TypeScript and esbuild, both build-only. Everything else is Node
built-ins and the browser. Do not add runtime dependencies without a reason in the commit message.

`flight/` builds with CMake against clones of A32NX and JSBSim kept outside the repository, read-only;
`flight/README.md` says how. Its `ctest` suite must be green, with either airframe, before a commit
that touches it.

## 1 · The dictionary is the only state

Every quantity is declared with a name, a kind and a range. A write outside the range is **refused,
not clamped**, and the refused write is a no-op — the caller learns by watching the value not move.

```ts
d.declare({ name: 'hyd.green', kind: 'real', min: 0, max: 4000, unit: 'psi', note: 'GREEN pressure' });
d.set('hyd.green', 3000);   // ok
d.set('hyd.green', 9999);   // throws RangeError, value stays 3000
```

Never keep aircraft state anywhere else: not in a system's closure, not in the page, not in a
module-level variable. If it must persist, it goes in the dictionary and into a scenario.

## 2 · Time is fixed

The step is 50 ms. `Clock` drops debt past five steps rather than stretching one — a rate integrated
over 400 ms is a different rate. Nothing anywhere reads `Date.now()` for simulation. If you need to
advance seconds rather than frames, call `Session.runFor(seconds)`.

## 3 · Write before read, in causal order

`apu → elec → fuel → bleed → engines → press → hydraulics`. One deliberate exception: generator
contactors close on the previous tick's engine state, as a real aircraft's stale discretes do.

A system reads only what earlier systems wrote this pass, plus its own previous state.

## 4 · Content is data

Panels, ECAM messages and ECAM pages live in `web/data/*.json` and are validated on load. Adding a
switch is a row of JSON, not a component. Break the schema and startup fails loudly — that is the
point.

A page line has two different condition slots: `when` chooses the colour, `only` chooses whether the
line exists. Do not render complementary pairs with `when` alone; that prints both.

## 5 · Procedures are ordered and order is scored

A step carries a predicate, a window (`withinSec`, from start or from a `startsWhen` trigger) and a
`why` in plain language. The debrief prints the `why` only for what was missed, and prints the
deviation for any `measure` outside its band. A step that cannot explain itself does not go in.

## 6 · Nothing is an input the model can produce

If it can be derived, derive it. `apuRunning` and `engNRunning` used to be handed in; they are state
machines now. The one current exception is `pressureAltitudeFt`, which is a world input until aero
exists at P7.

## 7 · A resumed run must match the straight one

`Session.toSituation` parks a run, `fromSituation` rebuilds it, `replay` drives it forward. A parked
and resumed run has to produce the same verdict, count and step statuses. If replay can diverge,
every debrief is suspect. `reposition` is the exception that restarts the score on purpose.

## 8 · Tests

Write the test with the feature, not after. `npm run test:all` green before a commit. The suite is
also a soak: it will catch drift, NaN and a settled aircraft that keeps moving. Prefer a test that
states the physics over one that states the implementation.

## 9 · Failure must be visible

Load failures surface in the status line rather than an empty panel. A dead switch or an undeclared
variable is a startup error, not something to find in play. Silent success is the enemy.

## 10 · Scope fences

- `app/` links **no** A32NX code. Keep it free of GPL obligations.
- `flight/` is GPLv3 and does. Do not move code across that line casually. The flyable artefact may
  carry `app/`'s MIT code; `app/` never imports from `flight/` (`ROADMAP.md` §4, P7: packaging).
- Phases start on the operator's word, in `ROADMAP.md`'s order, and finish at their gates: half-built
  is not a product. Until 2026-11-01 this rule read "P5 ships before P6 starts"; the operator started
  P6 and P7 before P5's reference-laptop box closed, and made the flyable simulator the product
  (`ROADMAP.md` §3).
- Never claim type-rating fidelity. `docs/provenance.md` §3 has the wording.
