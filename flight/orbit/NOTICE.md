# Notices

Runway to Ring, the orbit sketch, is MIT (`LICENSE`). It was GPLv3, as everything in a32x-cbt's
`flight/` is, until its owner relicensed it on 2026-11-21: it links nothing from A32NX or JSBSim, and
every part of it is the owner's (`docs/provenance.md`, 1h).

## The owner's code from elsewhere in a32x-cbt

The page draws KDFW and the sky with a32x-cbt's own `flight/web` modules: `src/airport.js`,
`src/airport-layout.js`, `src/scene-math.js`, `src/atmosphere.js`, `src/haze.js`, `src/lights.js` and
`data/kdfw.json` (in a repository split from this folder, under `vendor/flight-web`). In `flight/web`
they are GPLv3; their owner licenses them under MIT as well, as the sketch uses them. A split
repository's `tools/zip.mjs` and `tools/chrome.mjs` are a32x-cbt's `app/tools`, MIT already.

## Others' code in a built page

The source holds none. A built page (`build-web/index.html`) carries, besides the sketch's own code:

| what | licence | notice |
|---|---|---|
| three.js 0.186.1, bundled by esbuild | MIT | Copyright © 2010-2026 three.js authors. Its licence comment stays at the end of the page's script |
| Emscripten 6.0.12's JavaScript runtime and its own system libraries (html5, GL, al, stubs, sockets, noexit), linked into the core | MIT, or NCSA | Copyright (c) 2010-2014 Emscripten authors, see AUTHORS file |
| musl, the C library, as Emscripten carries it | MIT | Copyright © 2005-2020 Rich Felker, et al. |
| LLVM's libc++, libc++abi and compiler-rt's builtins | Apache-2.0 with the LLVM exception | the exception lifts the notice for code a compiler embeds in a program; named here all the same |
| dlmalloc 2.8.6, Doug Lea's allocator | public domain (CC0 1.0) | none needed |

The MIT licence's text, in `LICENSE`, is the same for the sketch, three.js, Emscripten and musl: a built
page carries it once at its top, with this file. The system libraries are the ones the core's link takes
in (found on 2026-11-21 by linking once more with `em++ -v`, as `flight/web/tools/release.mjs` does for
the A320's module); a new one needs its row here.

## Data

Public domain or CC0, so needing no notice; each is named with its digest in `docs/provenance.md`:
Natural Earth's land, lakes and populated places (public domain); the IAU and USGS Gazetteer of
Planetary Nomenclature, for the Moon's features (public domain); Wikidata, for the stars (CC0 1.0);
OurAirports and the FAA's airport diagram, for KDFW (public domain).
