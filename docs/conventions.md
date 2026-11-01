# Conventions, with worked examples

`CLAUDE.md` states the rules flatly. This file shows each one being followed, because a rule with an
example is followed and a rule without one is debated.

## 1 · Refused, not clamped

```ts
// good — out of range is an error the caller cannot miss
d.declare({ name: 'press.cabinAlt', kind: 'real', min: 0, max: 45000, unit: 'ft' });
d.set('press.cabinAlt', 46000);          // throws RangeError; the value is unchanged

// bad — silently teaches the caller that 46000 is fine
if (v > 45000) v = 45000;
```

Every refusal in the dictionary is by kind and range, in one place, so systems do not repeat the
checks.

## 2 · Fixed step

```ts
// good
session.runFor(3);                       // three seconds, in 50 ms frames

// bad — one advance() call cannot run 60 steps, the clock caps at five and drops the rest
session.advance(3000);
```

The cap is why `runFor` exists. In the browser the frame loop calls `advance` with 16 ms and never
notices.

## 3 · Causal order

`src/systems/index.ts` is the only place the order appears. A new system goes in at the position its
cause demands:

```ts
updateElec(...);      // pumps are electric
updateFuel(...);      // so fuel can be pumped
updateBleed(...);     // so the engine has starter air
updateEngine(...);    // and can turn
```

`src/systems/hydraulic.ts` never calls `updateElec`; it reads `bus.acEss`, which electrical wrote
this pass. A test holds that (`the blue electric pump needs AC power from the model, not a flag`).

## 4 · Content is data

```json
{ "id": "pack1", "label": "PACK 1", "x": 2, "y": 10, "w": 14, "h": 2, "form": "push", "var": "sw.pack1" }
```

Break it — a control past the grid edge, a switch bound to a variable nobody declares — and startup
fails with the line. `tests/panelschema.test.ts` is the guard.

Complementary page lines use `only`, never `when` alone:

```json
{ "text": "        VOLT 115", "when": { "var": "bus.ac1" }, "only": { "var": "bus.ac1" }, "level": "normal" },
{ "text": "        VOLT 0",   "when": { "not": { "var": "bus.ac1" } }, "only": { "not": { "var": "bus.ac1" } }, "level": "caution" }
```

`when` alone prints both lines at once.

## 5 · Procedures explain themselves

```ts
{
  id: 'apu-bleed-off',
  label: 'APU bleed off',
  done: (d) => !d.bool('sw.apuBleed'),
  startsWhen: (d) => d.bool('sw.eng1Bleed') && d.bool('sw.eng2Bleed'),
  withinSec: 40,
  why: 'an APU bleed left open fights the engine bleeds and hides a duct fault',
}
```

The `why` is printed only when the step is missed. A step whose reason is "because the checklist
says" is a step that teaches nothing.

## 6 · Derive what can be derived

`sys.eng1Running` is not an input; it comes from `eng1.n2 >= 58`. If a test wants an engine running
it sets the N2 and lets the model conclude, because setting the conclusion directly hides a bug in
the conclusion.

## 7 · Replay must agree

`tests/replay.test.ts` parks a run mid-drill, resumes it, replays the remainder and requires the
same verdict, count and statuses. When adding a system, ask what it does to that test — a
non-deterministic one (a random seed, a wall clock) breaks it.

## 8 · Failure visible

```ts
messages = await fetch('data/messages.json')
  .catch((err) => { loadError = `messages failed to load: ${String(err)}`; return []; });
```

and `loadError` is rendered in the status line, ahead of the aircraft state. An empty ECAM and a
broken fetch must not look the same.

## 9 · Commits

Conventional prefixes (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`). The suite green first. One
concern per commit; a `feat:` that also reformats is two commits.
