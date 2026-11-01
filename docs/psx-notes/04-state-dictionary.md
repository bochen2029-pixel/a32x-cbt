# 04 · The state dictionary

**Correction to an earlier reading:** `Developers\Variables.txt` is not hand-written
documentation. It is generated at startup by the program itself —
`Glob.makeGlobVarTableFile()` truncates the file (`file.setLength(0L)`, Glob.java:3867)
and rewrites all 1,263 rows from the compiled-in table. It is a *dump*, and it is
rewritten on every launch.

The real artefact is the compiled-in registry, and it is the best single idea in the
codebase.

## How it is built

Each addressable quantity is a `Q` subclass registered into a fixed slot constant:

```java
Glob.qh[Glob.qRudderTrim] = new Qh(qRudderTrim, "RudderTrim", -2, 2, 11, 9, 9);
Glob.qh[Glob.qTiller]     = new Qh(qTiller, "Tiller", -999, 999, 2);
Glob.qs[Glob.qsWindshear] = ...
```

`Glob` (3,896 lines) holds three parallel arrays `qs`, `qi`, `qh`, one per type, sized
to the constants. `Qs.java`, `Qh.java`, `Qi.java` each carry the range check for their
type and the transport call.

`Q` (Q.java) is 20 lines:

```java
int serialNr; String varName; byte netmode;
boolean fresh, updated = true;
boolean isUpdated() { if (updated) { updated = false; return true; } return false; }
```

`isUpdated()` is a **read-and-clear edge detector** — the change notification primitive.
`Aerodynamics.java:2159` uses it exactly right:

```java
if (Glob.qs[Glob.qsWindshear].isUpdated()) { Aerodynamics.readGlobWindshear(); }
```

## The transport is a property of the value

`Qs.transfer(String s, char go, int sendWhere)` (Qs.java:26) is the whole pattern:

- `go == 'w'`: validate against min/max length, reject by silently returning the old
  value, store, mark `updated`, remember `lastComeFrom`, and **emit the network line
  inline** (`Network.toPrint(...)`).
- `go == 'r'`: emit if this caller wants it, clear `fresh`, return the value.

`synchronized` per variable. Writes echo to the network from inside the setter, so no
caller can forget to publish.

## The netmode taxonomy

A byte encodes who may write and what a write means — this is the interesting part:

`ECON, CONT, START, DELTA, XDELTA, XECON, DEMAND, MIXED` (Qs/Qi) plus, for human
inputs, `BIGMOM, MCPMOM, GUAMOM2, GUAMOM4, CDUKEYB, RCP, ACP` (Qh).

So a momentary pushbutton, a 2-position guarded toggle, a 4-position selector, a CDU
key, a radio control panel field and a continuously-reported state are each their own
declared type, and the class that owns the type enforces the semantics. The UI cannot
misuse a switch because the switch's type is the contract.

## Ranges are part of the address

`Qh` takes min and max *and* two extra counts; `Qs` takes min/max *length*. An
out-of-range value is refused, not clamped, and the write is a no-op. `Qh` (431
variables) are human actions, `Qi` (270) are system actions, `Qs` (562) are strings
including all 24-character CDU lines.

## Why this is the right thing to steal

1. It is the **debrief bus**. Every scoreable predicate needs a named, typed, bounded
   quantity to read, and this gives one without touching simulation internals.
2. It is **the network** and the **scenario file** and the **instructor panel** — all
   three are views over the same dictionary. One registry, three consumers.
3. It makes the surface auditable: 1,263 entries is finite and reviewable, unlike an
   object graph.
4. It is the reason a third-party ecosystem exists at all.

## The rule that goes with it

From `Network Documentation.txt`:

> **IMPORTANT: Do not try to compute the internal aircraft system status on your own.
> This is not necessary. And it may cause disagreements. The system status is always
> computed inside Precision Simulator, for all hardware events! Just actuate the
> related switch. The server will then send the respective consequences in form of Q
> messages back into the network.**

Actuate and observe. Never mirror. This is the single most important rule for a CBT:
the trainee's click is an actuation, the model owns the consequence, the UI renders
what comes back. A UI that predicts state is a UI that can disagree with the grader.

## Carry

Yes — typed registry, declared ranges, edge-detected change notification, actuation
separated from consequence. In TypeScript: a discriminated union of variable
descriptors, a `subscribe(name)` returning a dirty flag, and a `set(name, value)` that
validates and publishes. Same shapes, no statics.

