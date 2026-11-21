# Licensing: decided, MIT

**Decided 2026-11-21, by the owner: the orbit sketch is MIT.** "As close to MIT as possible, where
feasible. If it was up to me, it would be MIT and be done with it." Everything in it is the owner's, so
all of it could be, and is: `LICENSE` at the sketch's root, `NOTICE.md` beside it for what a built page
carries of others'. This is not legal advice; where money or a release depends on it, ask a lawyer.
Tags point into `SOURCES.md`.

## Why it had to be decided

The sketch was GPLv3, because everything in a32x-cbt's `flight/` is, by that repository's rule
(`CLAUDE.md` §10; `docs/provenance.md` §1h; `flight/LICENSE`). Unreal Engine's EULA forbids combining
the engine with code under the GPL, the LGPL (unless merely dynamically linking a shared library) or
CC BY-SA [S16; read the current EULA yourself, this session could not open it]. And the GPL, for its
part, wants the whole of a combined work it covers to be under the GPL, which Epic's code cannot be. So
the core, as GPLv3, could not go into a shipped Unreal game. As MIT, it can: MIT is on Epic's list of
allowed licences [S16].

## Why it could be decided by the owner alone

- **It links no third-party GPL code.** Its core includes only `<cmath>`, `<cstdint>` and `<cstring>`
  (M4); its CMake links nothing; it takes nothing from A32NX or JSBSim (`docs/provenance.md` §1h). The
  A320 side of `flight/` links A32NX and is GPLv3 by obligation; the orbit sketch was GPLv3 only by the
  repository's rule.
- **No one else has a claim on it.** Its commits were made by Claude sessions working on the owner's
  word, and the KDFW drawing it reads was committed by the owner. Whether code an AI agent writes under
  someone's direction carries copyright at all is unsettled in some places. If it carries the owner's,
  relicensing was the owner's to do; if it carries none, the GPL label on it bound no one. Either way no
  third party's permission was needed.
- **What it took from outside is method, public domain or CC0:** the 1976 US Standard Atmosphere and
  Polhamus's slender-delta lift (US government works), Newtonian impact theory and the Shuttle's powered
  explicit guidance (methods; the code is the sketch's own), Natural Earth (public domain), the IAU and
  USGS Gazetteer (public domain), Wikidata's stars (CC0). Every row is in `docs/provenance.md` §1h.

## What is what now

| part | licence | whose |
|---|---|---|
| `flight/orbit/`: the core, its tests and tools, the page, its data, the guide, these kit documents | MIT (`flight/orbit/LICENSE`) | the owner's |
| `flight/web`'s KDFW drawing and sky, which the page reads (`airport.js`, `airport-layout.js`, `scene-math.js`, `atmosphere.js`, `haze.js`, `lights.js`, `data/kdfw.json`) | GPLv3 in `flight/web`, and MIT as well, as the sketch uses them (`NOTICE.md`) | the owner's; `kdfw.json`'s numbers come from OurAirports and the FAA, both public domain (`docs/provenance.md` §1f) |
| the built page, `build-web/index.html` | MIT, with others' code inside: three.js (MIT), Emscripten's runtime and the libraries it links (MIT, musl's MIT, libc++'s Apache-2.0 with the LLVM exception, dlmalloc's public domain). The page carries `LICENSE` and `NOTICE.md` at its top | partly not the owner's: keep their notices |
| the standalone repository, `runway-to-ring`, split from `flight/orbit` with its history | MIT, the same `LICENSE` and `NOTICE.md`; its `vendor/flight-web` is the drawing above, MIT there | the owner's |
| the canon, `ARCHITECTURE.md` | none stated | the owner's |
| A32NX, JSBSim and its aircraft data, the PSX notes | GPLv3, LGPL-2.1, GPL; PSX is design notes only | **not the owner's**. None of it is in the orbit sketch; do not carry anything else from `flight/` into the Unreal project without checking it against `docs/provenance.md` |

## What was done

1. a32x-cbt: `flight/orbit/LICENSE` (the MIT text, the same copyright line as the repository's root
   `LICENSE`) and `NOTICE.md`; every file's licence marker changed from GPLv3 to MIT; the decision
   recorded in `docs/provenance.md` §1h, in `CLAUDE.md` §10 (`flight/orbit` is the exception to
   "`flight/` is GPLv3"), and in the root and `flight/` READMEs. A deliberate crossing of the GPL line, by
   the copyright holder, in writing, which is what §10 asks for in place of a casual one.
2. The page build puts `LICENSE` and `NOTICE.md` at the top of every built page (`web/tools/notice.mjs`,
   held by `web/test/notice.test.mjs`).
3. The standalone repository carries the same `LICENSE` and `NOTICE.md` at its root, and
   `package.json` says `"license": "MIT"` (`tools/standalone.mjs`).
4. In the Unreal project: `PROVENANCE.md` gets the row "from runway-to-ring (or a32x-cbt `flight/orbit`)
   at <commit>, MIT", and the decision goes into its `DECISIONS.md`.

The options that were open, for the record: **A**, relicense (taken); **B**, keep GPLv3 and run the
core as its own program, Unreal talking to it over a local socket, which the FSF's view [F1] leaves a
grey zone for an exchange as intimate as the whole world's state every step; **C**, write a new core
from the canon, possible and wasteful.

## The canon's own line on this

The canon's Appendix D left the game's licence undecided: "MIT like ASTRA-7, which keeps A32X as an
Oracle only; or GPLv3, which lets its control laws ship". With Unreal as the View, the GPLv3 option is
closed by the EULA [S16]. MIT, with A32X kept as an offline Oracle, is the option that fits ADR 002, and
now the sketch's licence matches it.

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
