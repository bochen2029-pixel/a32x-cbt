// Build the distributable: `npm run package` bundles first, then writes dist/a32x-cbt.zip.
//
// Only what a user needs to run the trainer goes in — the page, the bundle, the content, the
// licence and the notice. The list is explicit: a file ships because it is named here, never because
// it happened to sit in web/. The notices are checked, not trusted: a package without the licence,
// the disclaimer or the PSX attribution is refused, and so is a page that points at a file the zip
// does not carry. The archive is read back and compared with its sources before success is claimed.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unzip, zip, ZIP_EPOCH } from './zip.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The folder a user gets when they unzip, and the archive's name. */
export const ROOT = 'a32x-cbt';

/** docs/provenance.md section 3, worded as README.md and the page carry it. */
export const DISCLAIMER =
  'Unofficial. Not affiliated with Airbus, FlyByWire Simulations or Aerowinx. Not for type training.';

/** What the shipped files must say, or there is no package. */
const NOTICES = [
  { file: 'LICENSE', must: /^MIT License\b/, what: 'the MIT licence' },
  { file: 'README.txt', must: DISCLAIMER, what: 'the disclaimer' },
  { file: 'README.txt', must: /Aerowinx Precision Simulator \(PSX\)/, what: 'the PSX design-study attribution' },
  { file: 'index.html', must: DISCLAIMER, what: 'the disclaimer' },
];

/** Every file that ships, as [path in the package, path on disk]. */
export function manifest({ app = APP, license = join(app, '..', 'LICENSE') } = {}) {
  const web = join(app, 'web');
  const content = readdirSync(join(web, 'data'))
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (!content.length) throw new Error('package refused: web/data holds no content');
  return [
    ['index.html', join(web, 'index.html')],
    ['app.js', join(web, 'app.js')],
    ...content.map((f) => [`data/${f}`, join(web, 'data', f)]),
    ['README.txt', join(web, 'README.txt')],
    ['LICENSE', license],
  ];
}

/** SOURCE_DATE_EPOCH when the caller sets one (reproducible-builds.org), else the zip epoch. */
function sourceDate() {
  const s = process.env.SOURCE_DATE_EPOCH;
  if (s === undefined || s === '') return ZIP_EPOCH;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) throw new Error(`SOURCE_DATE_EPOCH must be whole seconds, got "${s}"`);
  return new Date(n * 1000);
}

function says(text, must) {
  return typeof must === 'string' ? text.replace(/\s+/g, ' ').includes(must) : must.test(text);
}

/**
 * Package the trainer. Returns where the zip went, its size and digest, and what it holds. Throws,
 * leaving no archive behind, when anything a user needs is missing.
 */
export function buildPackage({ app = APP, license, out = join(app, 'dist'), when = sourceDate() } = {}) {
  const target = join(out, `${ROOT}.zip`);
  rmSync(target, { force: true }); // a refused build must not leave last time's zip looking current

  const files = manifest({ app, ...(license ? { license } : {}) });
  const bytes = new Map(files.map(([name, path]) => [name, readFileSync(path)]));

  for (const n of NOTICES) {
    if (!says(bytes.get(n.file).toString('utf8'), n.must)) {
      throw new Error(`package refused: ${n.file} does not carry ${n.what}`);
    }
  }
  const html = bytes.get('index.html').toString('utf8');
  for (const [, ref] of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)) {
    if (!bytes.has(ref)) throw new Error(`package refused: index.html points at "${ref}", which does not ship`);
  }

  const folders = new Set([`${ROOT}/`]);
  for (const name of bytes.keys()) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) folders.add(`${ROOT}/${parts.slice(0, i).join('/')}/`);
  }
  const entries = [
    ...[...folders].map((name) => ({ name, data: Buffer.alloc(0) })),
    ...[...bytes].map(([name, data]) => ({ name: `${ROOT}/${name}`, data })),
  ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const archive = zip(entries, when);

  const back = unzip(archive);
  if (back.length !== entries.length) throw new Error(`zip holds ${back.length} entries, wrote ${entries.length}`);
  back.forEach((e, i) => {
    if (e.name !== entries[i].name || !e.data.equals(entries[i].data)) {
      throw new Error(`zip entry ${e.name} does not read back as written`);
    }
  });

  mkdirSync(out, { recursive: true });
  writeFileSync(target, archive);
  return {
    path: target,
    size: archive.length,
    sha256: createHash('sha256').update(archive).digest('hex'),
    entries: back.map((e) => ({ name: e.name, size: e.data.length })),
  };
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href.toLowerCase();
if (invoked === import.meta.url.toLowerCase()) {
  try {
    const r = buildPackage();
    console.log(`packaged ${relative(process.cwd(), r.path)}  ${r.size} bytes  sha256 ${r.sha256}`);
    for (const e of r.entries) console.log(`  ${e.name.padEnd(34)}${e.name.endsWith('/') ? '' : String(e.size).padStart(8)}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
