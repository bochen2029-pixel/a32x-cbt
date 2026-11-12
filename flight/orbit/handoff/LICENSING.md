# Licensing: the question, stated plainly, for you to decide

Nothing here relicenses anything. It sets out the facts and the options; the decision is yours, and
the new repository's wave 0 stops before copying the core until you have made it. This is not legal
advice; where money or a release depends on it, ask a lawyer. Tags point into `SOURCES.md`.

## The question

The orbit sketch is GPLv3, because everything in `flight/` is, by this repository's rule (`CLAUDE.md`
§10; `docs/provenance.md` §1h; `flight/LICENSE`). Unreal Engine's EULA forbids combining the engine
with code under the GPL, the LGPL (unless merely dynamically linking a shared library) or CC BY-SA
[S16; read the current EULA yourself, this session could not open it]. And the GPL, for its part,
wants the whole of a combined work it covers to be under the GPL, which Epic's code cannot be. So the
sketch's core, as licensed today, cannot go into a shipped Unreal game.

But the sketch is yours to relicense:

- **It links no third-party GPL code.** Its core includes only `<cmath>`, `<cstdint>` and `<cstring>`
  (M4); its CMake links nothing; it takes nothing from A32NX or JSBSim (`docs/provenance.md` §1h). The
  A320 side of `flight/` links A32NX and is GPLv3 by obligation; the orbit sketch is GPLv3 only by the
  repository's rule.
- **No one else has a claim on it.** All four commits under `flight/orbit` were made by Claude sessions
  working on your word (git records Claude as their author; the README says the sketch was "made on
  the operator's word of 2026-11-12"), and the KDFW drawing it reads was committed by you. Whether
  code an AI agent writes under your direction carries copyright at all is unsettled in some places.
  If it carries yours, relicensing is yours to do; if it carries none, the GPL label on it binds no
  one and relicensing is a formality. Either way no third party's permission is needed.
- **What it took from outside is method or public domain:** the 1976 US Standard Atmosphere (a US
  government work), Polhamus's slender-delta lift (NASA TN D-3767, a US government work), Newtonian
  impact theory (a textbook method), the Shuttle's powered explicit guidance (Jaggers, 1977: a
  method; the code is the sketch's own), Natural Earth's coastlines (public domain).

## What is yours, and what is not

| part | licence now | whose | relicensable by you |
|---|---|---|---|
| `flight/orbit/core/`, `test/`, `tools/orbit_run.cpp`, `CMakeLists.txt` | GPLv3 | yours | yes |
| `flight/orbit/web/src/` (the page) | GPLv3 | yours | yes |
| `flight/orbit/web/data/land.js` | GPLv3, over public-domain data (Natural Earth 1:50m, simplified) | the data is public domain; the file is yours | yes |
| `flight/web`'s KDFW drawing (`airport.js`, `airport-layout.js`, `scene-math.js`) and `flight/web/data/kdfw.json`, which the page reads | GPLv3 | yours; `kdfw.json`'s numbers come from OurAirports and the FAA's airport diagram, both public domain (`docs/provenance.md` §1f) | yes |
| the built page, `build-web/index.html` | GPLv3 with others' code inside: three.js (MIT), Emscripten's runtime and the C and C++ libraries it links (MIT, NCSA, musl's MIT, libc++'s Apache-2.0 with the LLVM exception) (`docs/provenance.md` §2b) | partly not yours | only your parts; keep their notices |
| these kit documents | under `flight/`, so GPLv3 by this repository's rule | yours | yes: decide with the rest |
| the canon, `ARCHITECTURE.md` | none stated | yours | yes |
| A32NX, JSBSim and its aircraft data, the PSX notes | GPLv3, LGPL-2.1, GPL; PSX is design notes only | **not yours** | **no**. None of it is in the orbit sketch; do not carry anything else from `flight/` into the Unreal project without checking it against `docs/provenance.md` |

## The options

**A. Relicense the orbit sketch's own code before it goes into the Unreal project** (recommended, if you
want the core in the game). MIT, as ASTRA-7 and the Booster Lander are; or Apache-2.0, which adds a
patent grant; both are on Epic's list of allowed licences [S16]. The copy in this repository can stay
GPLv3, or be dual-licensed. Nothing legal stands in the way; it is your word, written down. If you
choose it:

1. In the new repository, give `core/` its licence file and copyright line, and add a row to
   `PROVENANCE.md`: "from a32x-cbt `flight/orbit` at <commit>, relicensed under <licence> by the
   copyright holder on <date>".
2. Record the decision in the new repository's `DECISIONS.md`.
3. If you dual-license the copy here, say so in this repository's `docs/provenance.md` §1h, since its
   `CLAUDE.md` §10 asks that code not cross the GPL line "casually": this would be a deliberate
   crossing, by the copyright holder, in writing.

**B. Keep it GPLv3, and keep it out of the game's binary.** Run the core as its own program and let
Unreal talk to it over a local socket (`UNREAL_PORT.md` §1; the Booster Lander's way, R3). The FSF's
view [F1]: "pipes, sockets and command-line arguments are communication mechanisms normally used
between two separate programs. So when they are used for communication, the modules normally are
separate programs. But if the semantics of the communication are intimate enough, exchanging complex
internal data structures, that too could be a basis to consider the two parts as combined into a
larger program." A stream of the whole world's state every step could be argued either way, and
Epic's word is "combine". A grey zone: take advice before shipping on it.

**C. Write a new core for the Unreal project from the canon, not from the sketch** (implement, do not
port, as this repository did with PSX's design). Possible, and wasteful: the sketch is already yours.

## The canon's own line on this

The canon's Appendix D leaves the game's licence undecided: "MIT like ASTRA-7, which keeps A32X as an
Oracle only; or GPLv3, which lets its control laws ship". With Unreal as the View, the GPLv3 option is
closed by the EULA [S16]: a GPLv3 game could only ship with a View that is not Unreal. MIT, with A32X
kept as an offline Oracle, is the option that fits ADR 002.

## The tools and data the slice would use

| what | licence or terms | what it means here | source |
|---|---|---|---|
| Unreal Engine 5.8 and its MCP plugin | Epic's EULA | the engine's terms, royalties included, which this kit does not cover | S16 |
| Cesium for Unreal | Apache-2.0, "free for both commercial and non-commercial use" | fine in the game | C3 |
| Cesium ion's data (Cesium World Terrain and the rest) | its terms: no copying or storing for offline use (Clips excepted); the Community plan is for non-commercial use | fine to look at while online during development; not in an offline build | C4 |
| Google's Photorealistic 3D Tiles | no caching, no offline use; attribution shown | not in this project, which is offline by its law L12 | C5 |
| Blender | GPL, for Blender itself; what you make with it is yours | the meshes the generators make are yours | (Blender's licence page; not fetched here) |
| Blender Lab's MCP server | GPL-3.0 | a separate tool on your machine, never shipped | B1 |
| MCP for Blender (the community server) | MIT | the same | B3 |
| NASA's Blue Marble imagery | NASA imagery is generally free of copyright; confirm the product's own terms when you download it | the globe's imagery | (to check) |
| Natural Earth | public domain | coastlines, if used | `docs/provenance.md` §1h |
