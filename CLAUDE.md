# House rules

The orbit sketch, split from a32x-cbt's `flight/orbit` with its history. These are the rules it was built
to, kept.

1. **Implement, do not port.** No third-party source is vendored. `vendor/flight-web` is a32x-cbt's own
   KDFW drawing, by the same owner, carried with this repository. Every outside source is named in
   `docs/provenance.md` with its licence.
2. **Time is fixed.** The core steps by 0.02 s; nothing reads a clock for the simulation
   (`web/test/builds.test.mjs` holds it). The same inputs give the same flight, bit for bit.
3. **Tests with the change, green before every commit**: the core natively and as WebAssembly, and the
   page (below). A test states physics or a promise, not how the code is written, and is shown able to
   fail.
4. **Failure is visible.** A part that fails at start says so in the status line; the page test loads the
   built page on every tier.
5. **Every texture is painted by code.** No image, model or font file ships.
6. **Never claim a real vehicle's fidelity.** It is a sketch with one fiction, the drive.
7. **MIT** (`LICENSE`; `NOTICE.md` for others' code in a built page). The sketch was GPLv3 in a32x-cbt's
   `flight/` until its owner relicensed it on 2026-11-21 (`handoff/LICENSING.md`). Keep it MIT: nothing
   under the GPL, the LGPL or CC BY-SA comes in, and every outside source gets its row in
   `docs/provenance.md`.

## Build and test

```
npm ci
cmake -S . -B build -G Ninja && cmake --build build && ctest --test-dir build -j6
source <emsdk>/emsdk_env.sh && emcmake cmake -S . -B build-wasm -G Ninja && cmake --build build-wasm && ctest --test-dir build-wasm -j6
node web/tools/build.mjs --core build-wasm/orbit_core.js --core-js build-wasm/orbit_core_plain.js
cd web && node --test test/*.test.mjs
```
