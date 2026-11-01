// Builds the flyable simulator's page into a folder, for local runs and tests: index.html, flight.js
// (the page, three.js bundled in) and core.js (the flight core's module and its worker, as one string).
// Nothing here is packaged: how the simulator ships is the operator's decision (ROADMAP.md, P7). GPLv3.
//
//   node tools/build.mjs --core <flight_core.js from the WebAssembly build> [--out <folder>]
//
// The folder runs from file://: open index.html. It fetches nothing.

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');

function option(name, fallback) {
  const at = process.argv.indexOf(name);
  if (at > 0 && at + 1 < process.argv.length) return process.argv[at + 1];
  if (fallback === undefined) {
    console.error(`build.mjs needs ${name}`);
    process.exit(2);
  }
  return fallback;
}

const corePath = option('--core');
const out = resolve(option('--out', join(web, '..', 'build-web')));
mkdirSync(out, { recursive: true });

const bundle = async (entry, extra = {}) => {
  const r = await build({
    entryPoints: [join(web, 'src', entry)],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'warning',
    ...extra,
  });
  return r.outputFiles[0].text;
};

// The worker: the module first (it defines createFlightCore), then the glue that drives it. Emscripten
// carries the WebAssembly inside the module as a binary string, which a JSON string would triple in
// size; a function's own source text keeps every byte as it is, so the worker's source is taken from a
// function wrapped around both.
const core = readFileSync(corePath, 'utf8');
const worker = await bundle('worker.js');
writeFileSync(join(out, 'core.js'),
  '// The flight core and its worker, for a Blob worker (flight/web/src/flight.js). GPLv3.\n' +
  "globalThis.FLIGHT_CORE_SOURCE = '(' + function flightCoreWorker() {\n" +
  `${core}\n;\n${worker}\n` +
  "} + ')();\\n';\n");

// The page, with three.js and its licence notice bundled in.
writeFileSync(join(out, 'flight.js'), await bundle('main.js', { legalComments: 'eof' }));
copyFileSync(join(web, 'src', 'index.html'), join(out, 'index.html'));

console.log(`built ${out}: core.js ${(core.length / 1e6).toFixed(2)} MB of module`);
