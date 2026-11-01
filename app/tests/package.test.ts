/**
 * The package, tested.  node --test tests/package.test.ts
 *
 * A stranger gets one zip, and what is in it decides whether the trainer runs from a double-click.
 * So the archive is opened here the way an unzip tool opens it — from the front, header by header,
 * not through the writer's own reader — and its contents are held to the list: the page, the
 * bundle, the content, the licence and the notice, and nothing from the workshop.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';

import { buildPackage, DISCLAIMER, ROOT } from '../tools/package.mjs';
import { dosDateTime, unzip, zip } from '../tools/zip.mjs';

const APP = join(import.meta.dirname, '..');
const LICENSE = join(APP, '..', 'LICENSE');

function scratch(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), 'a32x-cbt-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Walk the local headers from offset 0, as a streaming unzip does. Independent of unzip(). */
function stream(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8);
    const crc = buf.readUInt32LE(p + 14);
    const packed = buf.readUInt32LE(p + 18);
    const size = buf.readUInt32LE(p + 22);
    const nameLength = buf.readUInt16LE(p + 26);
    const extraLength = buf.readUInt16LE(p + 28);
    const name = buf.toString('utf8', p + 30, p + 30 + nameLength);
    const body = buf.subarray(p + 30 + nameLength + extraLength, p + 30 + nameLength + extraLength + packed);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    assert.ok(method === 0 || method === 8, `${name}: method ${method}`);
    assert.equal(data.length, size, `${name}: size`);
    assert.equal(crc32(data), crc, `${name}: CRC`);
    out.set(name, data);
    p += 30 + nameLength + extraLength + packed;
  }
  assert.equal(buf.readUInt32LE(p), 0x02014b50, 'the central directory follows the last entry');
  return out;
}

function pack(t: { after: (fn: () => void) => void }) {
  const r = buildPackage({ out: scratch(t), license: LICENSE });
  return { ...r, files: stream(readFileSync(r.path)) };
}

test('the zip holds the page, the bundle, the content, the licence and the notice — nothing else', (t) => {
  const { files } = pack(t);
  assert.deepEqual([...files.keys()], [
    `${ROOT}/`,
    `${ROOT}/LICENSE`,
    `${ROOT}/README.txt`,
    `${ROOT}/app.js`,
    `${ROOT}/data/`,
    `${ROOT}/data/messages.json`,
    `${ROOT}/data/pages.json`,
    `${ROOT}/data/panel.json`,
    `${ROOT}/index.html`,
  ]);
});

test('nothing from the workshop ships: no source, tests, tooling, dependencies or saved aircraft', (t) => {
  for (const name of pack(t).files.keys()) {
    assert.doesNotMatch(name, /\.(ts|mjs|map|situ)$|node_modules|\/(src|tests|tools|situations)\/|package(-lock)?\.json/, name);
  }
});

test('every file in the zip is byte for byte the file it was made from', (t) => {
  const { files } = pack(t);
  const sources: Record<string, string> = {
    'index.html': join(APP, 'web', 'index.html'),
    'app.js': join(APP, 'web', 'app.js'),
    'data/messages.json': join(APP, 'web', 'data', 'messages.json'),
    'data/pages.json': join(APP, 'web', 'data', 'pages.json'),
    'data/panel.json': join(APP, 'web', 'data', 'panel.json'),
    'README.txt': join(APP, 'web', 'README.txt'),
    LICENSE,
  };
  for (const [name, path] of Object.entries(sources)) {
    assert.ok(files.get(`${ROOT}/${name}`)?.equals(readFileSync(path)), name);
  }
});

test('the zip carries the licence, the disclaimer and the PSX attribution', (t) => {
  const { files } = pack(t);
  const text = (name: string) => files.get(`${ROOT}/${name}`)!.toString('utf8').replace(/\s+/g, ' ');
  assert.match(text('LICENSE'), /^MIT License/);
  assert.ok(text('README.txt').includes(DISCLAIMER), 'README.txt says it');
  assert.ok(text('index.html').includes(DISCLAIMER), 'the page says it too, for whoever never opens the README');
  assert.match(text('README.txt'), /design study of Aerowinx Precision Simulator \(PSX\)/);
  assert.match(text('README.txt'), /No PSX code is included/);
  assert.match(DISCLAIMER, /unofficial/i);
  assert.match(DISCLAIMER, /not affiliated with Airbus, FlyByWire/i);
  assert.match(DISCLAIMER, /not for type training/i);
});

test('the README fits on one screen', (t) => {
  const lines = pack(t).files.get(`${ROOT}/README.txt`)!.toString('utf8').trimEnd().split(/\r?\n/);
  assert.ok(lines.length <= 40, `${lines.length} lines`);
  for (const l of lines) assert.ok(l.length <= 100, `${l.length} columns: ${l}`);
});

test('the page reaches for nothing the zip does not carry', (t) => {
  const { files } = pack(t);
  const html = files.get(`${ROOT}/index.html`)!.toString('utf8');
  const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]);
  assert.ok(refs.includes('app.js'), 'the page loads the bundle');
  for (const ref of refs) assert.ok(files.has(`${ROOT}/${ref}`), `${ref} ships`);
});

test('the same tree packages to the same bytes, stamped with the source date and not the clock', (t) => {
  const a = buildPackage({ out: scratch(t), license: LICENSE });
  const b = buildPackage({ out: scratch(t), license: LICENSE });
  assert.equal(a.sha256, b.sha256);
  assert.ok(readFileSync(a.path).equals(readFileSync(b.path)));

  // two builds inside one two-second tick would agree even on a clock date, so check the stamp
  const epoch = process.env.SOURCE_DATE_EPOCH;
  const want = dosDateTime(epoch ? new Date(Number(epoch) * 1000) : new Date(Date.UTC(1980, 0, 1)));
  const zipped = readFileSync(a.path);
  assert.equal(zipped.readUInt16LE(10), want.time, 'first entry time');
  assert.equal(zipped.readUInt16LE(12), want.date, 'first entry date');
});

/** A copy of web/ to break, so the refusals can be tried without touching the real one. */
function brokenApp(t: { after: (fn: () => void) => void }, file: string, edit: (s: string) => string): string {
  const app = scratch(t);
  cpSync(join(APP, 'web'), join(app, 'web'), { recursive: true });
  const path = join(app, 'web', file);
  writeFileSync(path, edit(readFileSync(path, 'utf8')));
  return app;
}

test('a package without the disclaimer is refused, and leaves no zip behind', (t) => {
  const app = brokenApp(t, 'README.txt', (s) => s.replace(/Not for type training\./, ''));
  const out = scratch(t);
  writeFileSync(join(out, `${ROOT}.zip`), 'last time');
  assert.throws(() => buildPackage({ app, license: LICENSE, out }), /README\.txt does not carry the disclaimer/);
  assert.equal(existsSync(join(out, `${ROOT}.zip`)), false, 'a stale zip must not survive a refused build');
});

test('a package without the PSX attribution is refused', (t) => {
  const app = brokenApp(t, 'README.txt', (s) => s.replace(/Aerowinx Precision Simulator/, 'a simulator'));
  assert.throws(() => buildPackage({ app, license: LICENSE, out: scratch(t) }), /PSX design-study attribution/);
});

test('a package whose licence is not the MIT licence is refused', (t) => {
  const other = join(scratch(t), 'LICENSE');
  writeFileSync(other, 'All rights reserved.\n');
  assert.throws(() => buildPackage({ license: other, out: scratch(t) }), /LICENSE does not carry the MIT licence/);
});

test('a page that points at a file the zip does not carry is refused', (t) => {
  const app = brokenApp(t, 'index.html', (s) => s.replace('</head>', '<link rel="stylesheet" href="style.css" /></head>'));
  assert.throws(() => buildPackage({ app, license: LICENSE, out: scratch(t) }), /points at "style\.css"/);
});

test('zip: what the writer writes, the reader reads, with modes for unzip on Linux and macOS', () => {
  const buf = zip([
    { name: 'a/', data: Buffer.alloc(0) },
    { name: 'a/small.txt', data: Buffer.from('hi') },
    { name: 'a/big.txt', data: Buffer.from('x'.repeat(10000)) },
  ]);
  const back = unzip(buf);
  assert.deepEqual(back.map((e) => e.name), ['a/', 'a/small.txt', 'a/big.txt']);
  assert.equal(back[1].method, 0, 'two bytes do not deflate smaller, so they are stored');
  assert.equal(back[2].method, 8, 'ten thousand x do');
  assert.equal(back[2].data.toString(), 'x'.repeat(10000));
  assert.equal(back[0].mode, 0o040755);
  assert.equal(back[1].mode, 0o100644);
});

test('zip: dates are UTC, two-second resolution, and refused outside 1980–2107', () => {
  assert.deepEqual(dosDateTime(new Date(Date.UTC(1980, 0, 1))), { time: 0, date: (1 << 5) | 1 });
  assert.deepEqual(dosDateTime(new Date(Date.UTC(2026, 9, 31, 21, 16, 39))), {
    time: (21 << 11) | (16 << 5) | 19,
    date: (46 << 9) | (10 << 5) | 31,
  });
  assert.throws(() => dosDateTime(new Date(Date.UTC(1979, 11, 31))), RangeError);
});

test('zip: a name that could land outside the folder is refused', () => {
  for (const name of ['../escape.txt', '/abs.txt', 'a\\b.txt', 'a/./b.txt', '']) {
    assert.throws(() => zip([{ name, data: Buffer.from('x') }]), /refusing zip entry name/, JSON.stringify(name));
  }
  assert.throws(() => zip([{ name: 'a.txt', data: Buffer.from('1') }, { name: 'a.txt', data: Buffer.from('2') }]), /duplicate/);
});
