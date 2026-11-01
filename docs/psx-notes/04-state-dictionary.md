# 04 · The state dictionary

**Correction to an earlier reading:** `Developers\Variables.txt` is not hand-written
documentation. It is generated at startup by the program itself, which empties the file
and rewrites all 1,263 rows from the compiled-in table. It is a *dump*, and it is
rewritten on every launch.

The real artefact is the compiled-in registry, and it is the best single idea in the
codebase.

## How it is built

Each addressable quantity is an object registered into a fixed, numbered slot, in one of three
parallel tables — one per kind: system integers, human inputs and strings, the protocol's `Qi`,
`Qh` and `Qs` (note 05). Each registration gives the variable its published name and its range:
the rudder trim, for instance, is declared over −2 to 2. Each kind carries the range check for its
type and the transport call.

The common base is tiny: a serial number, the published name, a network-mode byte, and two flags —
one saying the value is fresh for the network, one saying it has changed since it was last looked
at. Its single method reads that change flag and clears it.

That read-and-clear is an **edge detector** — the change notification primitive. The flight model
uses it exactly right: it re-reads its windshear settings on the one pass after they change, and
not otherwise.

## The transport is a property of the value

A string variable's single transfer method is the whole pattern:

- Called to write: validate against the minimum and maximum length, reject by silently returning
  the old value, store, mark the change flag, remember where the write came from, and **emit the
  network line inline**.
- Called to read: emit if this caller wants it, clear the fresh flag, return the value.

Each variable is synchronised on its own. Writes echo to the network from inside the setter, so no
caller can forget to publish.

## The netmode taxonomy

A byte encodes who may write and what a write means — this is the interesting part. System values
have eight modes, which say when a value is sent and whether a write carries a value or a change;
human inputs have seven, one per kind of control: momentary pushbuttons on the panels and on the
mode control panel, two- and four-position guarded switches, CDU keys, and radio and audio
control panel fields.

So a momentary pushbutton, a 2-position guarded toggle, a 4-position selector, a CDU
key, a radio control panel field and a continuously-reported state are each their own
declared type, and the class that owns the type enforces the semantics. The UI cannot
misuse a switch because the switch's type is the contract.

## Ranges are part of the address

A human input takes a minimum and a maximum *and* two extra counts; a string takes a minimum and
maximum *length*. An out-of-range value is refused, not clamped, and the write is a no-op. There
are 431 human-input variables, 270 system integers and 562 strings, the strings including all
24-character CDU lines.

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
