// The release's checks, on stand-ins: a complete Windows archive passes and zips to the same bytes every
// time; each notice missing, or not saying what it must, refuses it, as do a file off the list, a page
// pointing at nothing, a placeholder left in, esbuild's helpers without their notice, a launcher that
// needs more than Windows, and a path of the building machine. The real templates fill, the real
// flight/CMakeLists.txt pins what the release ships, and a real link line maps to its notices. GPLv3.
//
//   node --test flight/web/test/release.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unzip } from '../../../app/tools/zip.mjs';
import { guideHtml, guideImages } from '../tools/guide-html.mjs';
import { bareWindowsProblems, readPe } from '../tools/pe.mjs';
import {
  BINARY, BINARY_FILES, BINARY_NOTICES, DISCLAIMER, SOURCE, UPSTREAM, archive, checkBinary, checkSource, cmakePins,
  embeddedFiles, fill, firstParagraph, libraryNotices, linkedLibraries, leaks, notice, pageReferences, templateValues,
  xmlHeader,
} from '../tools/release-contents.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const GUIDE = read('../../../docs/pilots-guide.md');
const values = templateValues({ commit: 'f'.repeat(40), commitDate: '2026-11-01', epoch: 1793500000, three: '0.186.1', esbuild: '0.28.2' });
const GPL3 = 'GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007\n';
const APACHE = 'Apache License\n Version 2.0, January 2004\n...\n---- LLVM Exceptions to the Apache 2.0 License ----\n';
const WHEN = new Date(Date.UTC(2026, 10, 1, 12));

/** A PE image as little as readPe needs: headers, one section, an import table naming `dlls`. */
function fakePe({ machine = 0x8664, subsystem = 2, flags = 0x20 | 0x40 | 0x100 | 0x4000, dlls = ['KERNEL32.dll', 'USER32.dll'] } = {}) {
  const buf = Buffer.alloc(0x400);
  buf.write('MZ', 0, 'latin1');
  buf.writeUInt32LE(0x80, 0x3c);
  buf.write('PE\0\0', 0x80, 'latin1');
  buf.writeUInt16LE(machine, 0x84);
  buf.writeUInt16LE(1, 0x86);
  buf.writeUInt16LE(240, 0x94); // a PE32+ optional header with sixteen directories
  const opt = 0x98;
  buf.writeUInt16LE(0x20b, opt);
  buf.writeUInt16LE(subsystem, opt + 68);
  buf.writeUInt16LE(flags, opt + 70);
  buf.writeUInt32LE(16, opt + 108);
  buf.writeUInt32LE(0x1000, opt + 112 + 8); // imports at RVA 0x1000
  const section = opt + 240;
  buf.write('.idata', section, 'latin1');
  buf.writeUInt32LE(0x200, section + 8);
  buf.writeUInt32LE(0x1000, section + 12);
  buf.writeUInt32LE(0x200, section + 16);
  buf.writeUInt32LE(0x200, section + 20);
  let name = 0x200 + 20 * (dlls.length + 1);
  dlls.forEach((dll, i) => {
    buf.writeUInt32LE(0x1000 + name - 0x200, 0x200 + 20 * i + 12);
    buf.writeUInt32LE(0x1000, 0x200 + 20 * i + 16);
    buf.write(`${dll}\0`, name, 'latin1');
    name += dll.length + 1;
  });
  return buf;
}

/** A Windows archive that should pass: the real README and airport notice, stand-ins for the rest. */
function binary() {
  const files = new Map([
    ['A32X.exe', fakePe()],
    ['README.txt', fill(read('../release/README.txt'), values, 'README.txt')],
    ['LICENSE.txt', GPL3],
    ['web/index.html', `<!doctype html><div id="notice">${DISCLAIMER}</div><script src="core.js"></script><script src="flight.js"></script>`],
    ['web/flight.js', '(() => {})();\n/*! Bundled license information:\n  (**\n   * @license\n   * Copyright 2010-2026 Three.js Authors\n   * SPDX-License-Identifier: MIT\n   *)\n*/\n'],
    ['web/core.js', 'globalThis.FLIGHT_CORE_SOURCE = "";\n'],
    ['guide/index.html', guideHtml(GUIDE, { disclaimer: DISCLAIMER })],
    ...guideImages(GUIDE).map((n) => [`guide/${n}`, 'JPEG']),
    ['notices/A32NX.txt', notice(`A32NX, ${UPSTREAM.a32nx.commit}.`, GPL3)],
    ['notices/JSBSim.txt', notice(`JSBSim, ${UPSTREAM.jsbsim.commit}.`, 'GNU LESSER GENERAL PUBLIC LICENSE\n Version 2.1, February 1999', 'Jon S. Berndt')],
    ['notices/aircraft-data.txt', '<fileheader>\n<author> Dave Culp </author>\n</fileheader>\n<!--\n  File:     CFM56_5.xml\n-->\n'],
    ['notices/Emscripten.txt', 'Emscripten is available under 2 licenses, the MIT license and ...'],
    ['notices/musl.txt', 'musl as a whole is licensed under the following standard MIT license:'],
    ['notices/libc++.txt', APACHE],
    ['notices/libc++abi.txt', APACHE],
    ['notices/libunwind.txt', APACHE],
    ['notices/compiler-rt.txt', APACHE],
    ['notices/dlmalloc.txt', 'This is a version (aka dlmalloc) of malloc/free/realloc written by\n Doug Lea and released to the public domain'],
    ['notices/three.js.txt', 'The MIT License\n\nCopyright © 2010-2026 three.js authors\n'],
    ['notices/airport-data.txt', read('../release/airport-data.txt')],
    ['trainer/index.html', '<!doctype html>'],
    ['trainer/LICENSE', 'MIT License\n\nCopyright (c) 2026\n'],
  ].map(([name, data]) => [name, Buffer.from(data)]));
  return files;
}
const trainer = ['index.html', 'LICENSE'];
const owed = ['Emscripten', 'compiler-rt', 'dlmalloc', 'libc++', 'libc++abi', 'libunwind', 'musl'];
const check = (files, more = {}) => checkBinary(files, { trainer, owed, ...more });

test('a complete Windows archive passes, and zips to the same bytes every time', () => {
  const files = binary();
  check(files);
  const a = archive(BINARY, files, WHEN);
  const b = archive(BINARY, binary(), WHEN);
  assert.equal(a.sha256, b.sha256, 'same files, same date: same bytes');
  assert.notEqual(archive(BINARY, files, new Date(Date.UTC(2026, 10, 2))).sha256, a.sha256, 'the date is in the bytes');
  const names = unzip(a.bytes).map((e) => e.name);
  assert.deepEqual(names, [...names].sort(), 'entries in one sorted list');
  assert.ok(names.every((n) => n.startsWith(`${BINARY}/`)), `everything under ${BINARY}/`);
  assert.ok(names.includes(`${BINARY}/notices/`) && names.includes(`${BINARY}/A32X.exe`));
});

test('each file of the list missing refuses the release, by name', () => {
  for (const name of [...BINARY_FILES, 'trainer/LICENSE']) {
    const files = binary();
    files.delete(name);
    assert.throws(() => check(files), new RegExp(`${name.replace(/[.+]/g, '\\$&')}.*missing`), name);
  }
});

test('the Windows archive refuses to ship without the pilot\'s guide, its disclaimer or its pictures', () => {
  const noGuide = binary();
  noGuide.delete('guide/index.html');
  assert.throws(() => check(noGuide), /guide\/index\.html is missing/);
  const unsaid = binary();
  unsaid.set('guide/index.html', Buffer.from(guideHtml(GUIDE)));
  assert.throws(() => check(unsaid), /guide\/index\.html does not carry the disclaimer on the pilot's guide/);
  const picture = binary(), first = guideImages(GUIDE)[0];
  picture.delete(`guide/${first}`);
  assert.throws(() => check(picture), new RegExp(`guide/index\\.html points at "${first.replace('.', '\\.')}", which does not ship`));
});

test('a notice that does not say what it must refuses the release', () => {
  for (const [file, , what] of BINARY_NOTICES) {
    const files = binary();
    files.set(file, Buffer.from('nothing to the point\n'));
    assert.throws(() => check(files), (err) => err.message.includes(`${file} does not carry ${what}`), `${file}: ${what}`);
  }
});

test('a file off the list, a page pointing at nothing, a placeholder: each refuses', () => {
  const extra = binary();
  extra.set('web/debug.log', Buffer.from('x'));
  assert.throws(() => check(extra), /web\/debug\.log is not on the list of what ships/);

  const pointing = binary();
  pointing.set('web/index.html', Buffer.from('<script src="core.js"></script><script src="flight.js"></script><link href="style.css">'));
  assert.throws(() => check(pointing), /points at "style\.css", which does not ship/);

  const left = binary();
  left.set('README.txt', Buffer.from(`${left.get('README.txt')}\nBuilt @WHEN@.\n`));
  assert.throws(() => check(left), /README\.txt still holds a placeholder/);
});

test("esbuild's helpers in a bundle refuse the release: their notice does not ship", () => {
  const files = binary();
  files.set('web/core.js', Buffer.from('var __defProp = Object.defineProperty;\n'));
  assert.throws(() => check(files), /web\/core\.js carries esbuild's runtime helpers/);
});

test('a licence the module owes and does not ship refuses the release', () => {
  assert.throws(() => check(binary(), { owed: [...owed, 'zlib'] }), /code under zlib's licence, and notices\/zlib\.txt does not ship/);
});

test('a launcher that needs more than Windows, or is not an x64 windows program, refuses the release', () => {
  for (const [pe, why] of [
    [fakePe({ dlls: ['KERNEL32.dll', 'VCRUNTIME140.dll'] }), /imports VCRUNTIME140\.dll, which Windows does not ship/],
    [fakePe({ dlls: ['api-ms-win-crt-runtime-l1-1-0.dll'] }), /imports api-ms-win-crt-runtime-l1-1-0\.dll/],
    [fakePe({ machine: 0x14c }), /built for x86, not x64/],
    [fakePe({ subsystem: 3 }), /a console program, not a windows one/],
    [fakePe({ flags: 0x40 | 0x100 }), /not linked with high-entropy-va[\s\S]*not linked with guard-cf/],
    [Buffer.from('MZ but nothing else'), /A32X\.exe: not a PE image/],
  ]) {
    const files = binary();
    files.set('A32X.exe', pe);
    assert.throws(() => check(files), why);
  }
});

test('readPe reads what the stand-in says, and a bare launcher has nothing to answer for', () => {
  const image = readPe(fakePe());
  assert.deepEqual(image.imports, ['KERNEL32.dll', 'USER32.dll']);
  assert.equal(image.machine, 'x64');
  assert.equal(image.subsystem, 'windows');
  assert.deepEqual(bareWindowsProblems(image), []);
});

test("a path of the building machine refuses the release, whatever its slashes, case or width", () => {
  const work = 'C:\\Users\\pilot\\AppData\\Local\\Temp\\a32x-release-Ab12';
  for (const said of [work, work.replace(/\\/g, '/'), work.toUpperCase()]) {
    const files = binary();
    files.set('web/core.js', Buffer.from(`// built in ${said}\n`));
    assert.throws(() => check(files, { paths: [work] }), /web\/core\.js names .*a32x-release-ab12, a path on the machine that built it/);
  }
  const wide = binary();
  wide.set('A32X.exe', Buffer.concat([fakePe(), Buffer.from(`${work}\\A32X.pdb`, 'utf16le')]));
  assert.throws(() => check(wide, { paths: [work] }), /A32X\.exe names/);
  assert.deepEqual(leaks(binary(), [work]), [], 'and a clean archive names none');
  // a file that is a view at an odd offset into a larger buffer, as git's blobs once were: node 24.16
  // corrupted its heap decoding UTF-16 from one, so the search must not decode
  const odd = Buffer.concat([Buffer.from('?'), Buffer.from(`${work}\\x`, 'utf16le')]).subarray(1);
  assert.equal(leaks(new Map([['odd.bin', odd]]), [work]).length, 1);
});

test('the source archive must hold its licences, its build and each upstream named by its commit', () => {
  const files = new Map([
    ['README.txt', fill(read('../release/README-source.txt'), values, 'README-source.txt')],
    ['a32x-cbt/LICENSE', 'MIT License\n'],
    ['a32x-cbt/flight/LICENSE', GPL3],
    ['a32x-cbt/SOURCE-COMMIT', '0ff9296b0a5b8c0e4d4a7b1f2c3d4e5f60718293\n'],
    ['a32x-cbt/flight/CMakeLists.txt', read('../../CMakeLists.txt')],
    ['a32x-cbt/flight/launcher/CMakeLists.txt', ''],
    ['a32x-cbt/flight/web/tools/build.mjs', ''],
    ['a32x-cbt/flight/web/tools/release.mjs', ''],
    ['a32x-cbt/flight/web/package-lock.json', '{}'],
    ['upstream/a32nx/LICENSE', GPL3],
    ['upstream/a32nx/SOURCE-COMMIT', `${UPSTREAM.a32nx.commit}\n`],
    ['upstream/a32nx/fbw-a32nx/src/wasm/fbw_a320/src/model/ElacComputer.cpp', ''],
    ['upstream/jsbsim/COPYING', 'GNU LESSER GENERAL PUBLIC LICENSE\n Version 2.1, February 1999'],
    ['upstream/jsbsim/SOURCE-COMMIT', `${UPSTREAM.jsbsim.commit}\n`],
    ['upstream/jsbsim/src/FGFDMExec.cpp', ''],
    ['upstream/three/LICENSE', 'The MIT License\n'],
    ['upstream/three/package.json', '{\n  "name": "three",\n  "version": "0.186.1"\n}\n'],
  ].map(([name, data]) => [name, Buffer.from(data)]));
  files.set('a32x-cbt/flight/web/release/README.txt', Buffer.from('A32X @VERSION@\n'));
  checkSource(files); // a template it carries is a template
  const unfilled = new Map(files);
  unfilled.set('README.txt', Buffer.from(`${files.get('README.txt')}\n@COMMIT@\n`));
  assert.throws(() => checkSource(unfilled), /README\.txt still holds a placeholder/);
  const zipped = archive(SOURCE, files, WHEN);
  assert.equal(zipped.sha256, archive(SOURCE, new Map(files), WHEN).sha256);

  const wrong = new Map(files);
  wrong.set('upstream/jsbsim/SOURCE-COMMIT', Buffer.from('0123456\n'));
  assert.throws(() => checkSource(wrong), /upstream\/jsbsim\/SOURCE-COMMIT does not carry JSBSim's commit/);
  const short = new Map(files);
  short.set('a32x-cbt/SOURCE-COMMIT', Buffer.from('0ff9296\n'));
  assert.throws(() => checkSource(short), /a32x-cbt\/SOURCE-COMMIT does not carry the commit it was exported from/);
  const unnamed = new Map(files);
  unnamed.delete('a32x-cbt/SOURCE-COMMIT');
  assert.throws(() => checkSource(unnamed), /a32x-cbt\/SOURCE-COMMIT, which carries the commit it was exported from, is missing/);
  const none = new Map(files);
  none.delete('upstream/a32nx/LICENSE');
  assert.throws(() => checkSource(none), /upstream\/a32nx\/LICENSE, which carries A32NX's licence, is missing/);
});

test('the templates ask only for what the release knows, and say what a user and a builder need', () => {
  const readme = fill(read('../release/README.txt'), values, 'README.txt');
  assert.ok(readme.replace(/\s+/g, ' ').includes(DISCLAIMER));
  assert.match(readme, /double-click A32X\.exe/);
  assert.match(readme, new RegExp(`${SOURCE}\\.zip`));
  const source = fill(read('../release/README-source.txt'), values, 'README-source.txt');
  for (const said of [UPSTREAM.a32nx.commit, UPSTREAM.jsbsim.commit, 'Emscripten 6.0.12', 'SOURCE_DATE_EPOCH=1793500000', 'SOURCE-COMMIT']) {
    assert.ok(source.includes(said), said);
  }
  assert.throws(() => fill('built @WHEN@', values, 'x.txt'), /x\.txt asks for @WHEN@, which the release does not know/);
  // filled with values as long as the real ones (a commit is forty characters), no line runs wide
  for (const [name, text] of [['README.txt', readme], ['README-source.txt', source], ['airport-data.txt', read('../release/airport-data.txt')]]) {
    const wide = text.split(/\r?\n/).filter((l) => l.length > 104); // a checkout may have made them CRLF
    assert.deepEqual(wide, [], `${name}: lines past 104 columns`);
  }
});

test('flight/CMakeLists.txt accepts the commits the release ships, and embeds files whose headers it can carry', () => {
  const cmake = read('../../CMakeLists.txt');
  const pins = cmakePins(cmake);
  assert.ok(UPSTREAM.a32nx.commit.startsWith(pins.a32nx), `A32NX: CMake ${pins.a32nx}, release ${UPSTREAM.a32nx.commit}`);
  assert.ok(UPSTREAM.jsbsim.commit.startsWith(pins.jsbsim), `JSBSim: CMake ${pins.jsbsim}, release ${UPSTREAM.jsbsim.commit}`);
  const embedded = embeddedFiles(cmake);
  assert.ok(embedded.some((f) => f.tree === 'jsbsim' && f.path === 'aircraft/737/737.xml'));
  assert.ok(embedded.some((f) => f.tree === 'flight' && f.path === 'jsbsim/aircraft/A320-fit/A320-fit.xml'));
  for (const f of embedded.filter((e) => e.tree === 'flight')) {
    assert.match(firstParagraph(read(`../../${f.path}`), f.path), /GPLv3/, `${f.path} says it is ours, GPLv3`);
  }
});

test("an aircraft file's header is carried verbatim; a file with none refuses the release", () => {
  const header = '<fileheader>\n  <author> Someone </author>\n</fileheader>';
  assert.equal(xmlHeader(`<?xml version="1.0"?>\n<fdm_config>\n  ${header}\n</fdm_config>`, 'a.xml'), header);
  assert.equal(xmlHeader('<?xml version="1.0"?>\n<!--\n  File: e.xml\n-->\n<engine/>', 'e.xml'), '<!--\n  File: e.xml\n-->');
  assert.throws(() => xmlHeader('<?xml version="1.0"?>\n<engine/>', 'bare.xml'), /bare\.xml has no header/);
});

test("a link's system libraries map to their notices, and one with no known licence refuses the release", () => {
  const line = [
    '/root/emsdk/upstream/bin/wasm-ld -o probe.wasm core.cpp.o libflight_world_web.a liba32nx_efcs.a jsbsim/src/libJSBSim.a',
    '-L/root/emsdk/upstream/emscripten/cache/sysroot/lib/wasm32-emscripten -lGL-getprocaddr -lal -lhtml5 -lstubs -lnoexit',
    '-lc -ldlmalloc -lclang_rt.builtins-legacysjlj -lc++-legacyexcept -lc++abi-legacyexcept -lunwind-legacyexcept -lsockets',
  ].join(' ');
  const names = linkedLibraries(`emcc: running\n${line}\nnode acorn-optimizer.mjs\n`);
  assert.deepEqual(names, ['GL-getprocaddr', 'al', 'c', 'c++-legacyexcept', 'c++abi-legacyexcept', 'clang_rt.builtins-legacysjlj', 'dlmalloc', 'html5', 'noexit', 'sockets', 'stubs', 'unwind-legacyexcept']);
  assert.deepEqual(libraryNotices(names), owed);
  assert.throws(() => libraryNotices([...names, 'z-mt']), /links -lz-mt, whose licence the release does not know/);
  assert.throws(() => linkedLibraries('nothing linked'), /no wasm-ld command/);
});

test('a page names what it loads', () => {
  assert.deepEqual(pageReferences(read('../src/index.html')), ['core.js', 'flight.js']);
});

// The release refuses an archive whose page lacks it (BINARY_NOTICES, checked row by row above); this
// holds the page itself to it.
test('the flight page carries the disclaimer, as the trainer page does', () => {
  assert.ok(read('../src/index.html').includes(DISCLAIMER), 'the disclaimer is on the flight page');
});
