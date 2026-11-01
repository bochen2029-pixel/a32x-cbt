# Provenance

What this repository contains, where each part came from, and what its licence is. Read this
before deciding how to implement anything.

Short version: **no third-party source code is vendored here.** The trainer in `app/` is original
TypeScript. The systems behaviour in it was worked out by study, not by porting.

---

## 1 · The sources

### 1a · FlyByWire A32NX — open source, GPLv3

`flybywiresim/aircraft`, pinned at commit `66021c2` (2026-10-28). A free, community A320 for
Microsoft Flight Simulator, released under GPLv3 (`https://github.com/flybywiresim/aircraft/LICENSE`).

- Readable source, no reverse engineering involved.
- **Not vendored.** `flight/` holds a handful of extracted artefacts (a port contract, a bus
  header, a 140-line harness) and expects a clone of the upstream repository next to it.
- Anything that links A32NX code — `flight/` from phase P6 onward — is GPLv3 by obligation.
- `app/` links none of it and carries no GPL obligation today.

Re-clone with:

```
git clone --depth 1 --branch master https://github.com/flybywiresim/aircraft.git ../a32nx
git -C ../a32nx checkout 66021c2
```

### 1b · Aerowinx Precision Simulator 10 (PSX) — commercial, closed source

A commercially sold 747-400 systems simulator written in Java. Bought, not borrowed.

Its class files each carry `Copyright_2008_by_Hardy_Heinlin__Reverse_Engineering_Prohibited`. The
position taken here:

- **No PSX code is in this repository.** Not the jar, not the decompiled classes, not an excerpt
  pasted into TypeScript.
- What was taken is **design**, expressed in our own words in `docs/architecture.md` and
  `docs/psx-notes/`: a state dictionary with declared ranges, a two-rate scheduler, a causal
  dispatch order, controls described as data with position and form, procedures with per-step
  rationale.
- Those are patterns. A dictionary with numeric bounds and a 50 ms tick are not PSX's invention in
  any protectable sense, and we did not transliterate their source.
- Where the author's banner is read narrowly — "you may not decompile" — this work sits outside it:
  the deliverable is a reimplementation, not a decompilation.
- Architecture note: reading a decompiled program to understand behaviour and then writing new code
  against that understanding is ordinary practice and is what happened here.

**If you are a model or an engineer picking this up: implement, do not port.** Do not ask for the
jar. The notes give the design; the code is yours to write.

### 1c · JSBSim — open source, LGPL-2.1

`JSBSim-Team/jsbsim`, pinned at release `v1.3.3`, commit `66f7faf` (2026-10-16). A flight dynamics
library in C++ under LGPL-2.1 (`COPYING` in the clone). It is the airframe from phase P7: equations of
motion, atmosphere, engines, landing gear and the aerodynamic model of an aircraft definition file.

- **Not vendored.** `flight/` compiles it out of a clone outside the repository into its own build
  directory, and refuses any commit but `66f7faf`. Nothing from the clone is copied here.
- Linked statically into the GPLv3 harness. LGPL-2.1 allows that; the obligation it adds — that a
  user can relink against a changed JSBSim — is met by shipping our source, which GPLv3 demands
  anyway.

Re-clone with (exercised 2026-11-01):

```
git init ../jsbsim
git -C ../jsbsim remote add origin https://github.com/JSBSim-Team/jsbsim.git
git -C ../jsbsim fetch --depth 1 origin 66f7fafc07fe13e7ede9db20873030fed2881713
git -C ../jsbsim checkout FETCH_HEAD
```

**The airframe is JSBSim's 737, not its A320.** Both ship in the clone; they are data files, read
at run time from it, unmodified.

| file | author, date | licence | used |
|---|---|---|---|
| `aircraft/737/737.xml` | Dave Culp and Aeromatic, 2006 | GPL, as its header states | yes |
| `engine/CFM56.xml` | Aeromatic | the clone's LGPL-2.1 | yes, through the 737 |
| `aircraft/A320/A320.xml` | unknown, 2003, "BETA" | the clone's LGPL-2.1 | no |

The A320 was measured first and refused. JSBSim's own trim at 64 t, 1,000 ft, 3° down: it finds no
trim in CONF FULL at 130, 140 or 150 kt; at 160 kt it needs −21.6° of its −25.8° of elevator, and a
170 kt climb in 1+F needs −24.4°. Its pitch stiffness, Cmα −4.0 per radian, is several times a
transport's. An aeroplane that cannot be trimmed at approach speed cannot fly the P7 gate, a hand-flown
ILS. The 737 trims from 130 kt with full flap to cruise at Mach 0.78 with 2–11° of elevator, and has
ground effect, spoilers and plausible lateral-directional derivatives.

So the aeroplane that flies is a 737-class airframe under the A320's flight control computers:
A320-class in size, weight and speed, not an A320. That is said wherever its numbers are reported.
Whether to replace it with an A320 aerodynamic data set of our own is a P7 decision (`ROADMAP.md`).

Both aircraft files carry the same note: built from public data and guesses, for education and
entertainment, not endorsed by the manufacturer, not to be sold. This project sells nothing.

The file that puts the A32NX servos in charge of the airframe's surfaces,
`flight/jsbsim/a32nx-surfaces.xml`, is ours and GPLv3.

---

## 2 · Third-party dependencies

| dependency | scope | licence | vendored? |
|---|---|---|---|
| TypeScript | build only, `npm run build:web` | Apache-2.0 | no, `npm i` |
| JSBSim | `flight/` from P7 | LGPL-2.1 | no, cloned separately, `66f7faf` |
| JSBSim's 737 and CFM56 data | `flight/` from P7, read at run time | GPL; LGPL-2.1 | no, read from the JSBSim clone |
| FlyByWire A32NX | `flight/` from P6 | GPLv3 | no, cloned separately, `66021c2` |

Runtime dependencies in `app/`: **none.** It is Node built-ins and a browser.

---

## 3 · Trademarks

"Airbus", "A320" and "A32NX" belong to their owners. This is an unofficial training aid, not
affiliated with Airbus, FlyByWire Simulations, or Aerowinx, and not suitable for type training.

---

## 4 · What was verified, and how

Every claim in `docs/architecture.md` marked `[R]` was read out of a running system rather than
guessed. The PSX notes carry line-level references into a reference tree that is not in this
repository — `tools/regen-psx-reference.md` explains how to rebuild it if you ever want it.

The trainer's own behaviour is held by 182 tests. That is the evidence that matters day to day:
`npm run test:all`.
