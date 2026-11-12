// Builds the orbit sketch into one HTML file that opens from file:// and fetches nothing: the core's
// WebAssembly module (Emscripten's SINGLE_FILE build) and the page, three.js bundled in, both inline.
// Uses flight/web's esbuild and three.js (npm ci there first); the page reuses flight/web's airport
// drawing. GPLv3.
//
//   node tools/build.mjs --core <orbit_core.js from the WebAssembly build> [--core-js <orbit_core_plain.js>] [--out <folder>]
//
// --core-js adds the same core compiled to plain JavaScript, which the page runs where a host refuses
// WebAssembly.
//
// Writes <out>/index.html, a whole document, and <out>/page.html, the same page without the document's
// skeleton, for hosts that wrap a page in their own.

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const flightWeb = resolve(web, '..', '..', 'web');
const require = createRequire(join(flightWeb, 'package.json'));
let esbuild;
try {
  esbuild = require('esbuild');
} catch {
  console.error(`build.mjs needs flight/web's packages: run npm ci in ${flightWeb}`);
  process.exit(2);
}

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

const page = await esbuild.build({
  entryPoints: [join(web, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
  nodePaths: [join(flightWeb, 'node_modules')],
  write: false,
  logLevel: 'warning',
});

// Inline, a script ends at the first "</script" in it, wherever that is; in a string it means the same
// with the slash escaped.
const inline = (js) => js.replace(/<\/script/gi, '<\\/script');
const core = readFileSync(corePath, 'utf8');
if (!core.includes('createOrbitCore')) {
  console.error(`${corePath} is not the orbit core's module (no createOrbitCore in it)`);
  process.exit(2);
}
const plainPath = option('--core-js', '');
const plain = plainPath ? readFileSync(plainPath, 'utf8') : '';
if (plain && !plain.includes('createOrbitCoreJs')) {
  console.error(`${plainPath} is not the orbit core's JavaScript build (no createOrbitCoreJs in it)`);
  process.exit(2);
}
const scripts = `<script>\n${inline(core)}\n</script>\n` + (plain ? `<script>\n${inline(plain)}\n</script>\n` : '') +
  `<script>\n${inline(page.outputFiles[0].text)}\n</script>\n`;
const template = readFileSync(join(web, 'index.html'), 'utf8');
const [head, body] = template.split('<!--BODY-->');
if (body === undefined || !body.includes('<!--SCRIPTS-->')) {
  console.error('index.html needs its <!--BODY--> and <!--SCRIPTS--> markers');
  process.exit(2);
}
const filled = body.replace('<!--SCRIPTS-->', () => scripts);
writeFileSync(join(out, 'index.html'), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n${head}</head>\n<body>\n${filled}</body>\n</html>\n`);
writeFileSync(join(out, 'page.html'), `${head.replace(/<meta name="viewport"[^>]*>\n/, '')}${filled}`);
const size = (n) => `${(n / 1e6).toFixed(2)} MB`;
console.log(`built ${out}/index.html: ${size(readFileSync(join(out, 'index.html')).length)} (core ${size(core.length)}${plain ? `, core as JavaScript ${size(plain.length)}` : ''}, page ${size(page.outputFiles[0].text.length)})`);
