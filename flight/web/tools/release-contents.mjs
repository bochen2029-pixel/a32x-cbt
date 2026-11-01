// What the flight simulator's Windows release holds, and what it must say before it is written: the
// explicit file list of each archive, the notice each file owes, and the archives themselves. Functions
// over bytes in memory, so tests can feed them stand-ins; tools/release.mjs gathers and builds the real
// files. GPLv3. The zip writer and the disclaimer are P5's (app/tools): the flight side may import from
// app/, and app/ never imports from flight/.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DISCLAIMER } from '../../../app/tools/package.mjs';
import { unzip, zip } from '../../../app/tools/zip.mjs';
import { bareWindowsProblems, readPe } from './pe.mjs';

export { DISCLAIMER };

/** The release's version, flight/web/package.json's. */
export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
/** Each archive's name, and the folder its files unzip into. */
export const BINARY = `a32x-sim-${VERSION}-win64`;
export const SOURCE = `a32x-sim-${VERSION}-source`;

/** The upstream sources compiled into the module, at the commits flight/CMakeLists.txt accepts. */
export const UPSTREAM = {
  a32nx: {
    title: 'FlyByWire A32NX',
    repository: 'https://github.com/flybywiresim/aircraft',
    commit: '66021c24448c44399a8ff569eb14715b6b26558e',
    date: '2026-10-28',
    // The A320's flight-control code, which is what is compiled, and the licence. The rest of the
    // repository, 1.4 GB of aircraft for Microsoft Flight Simulator, is not compiled.
    paths: ['LICENSE', 'fbw-a32nx/src/wasm/fbw_a320'],
  },
  jsbsim: {
    title: 'JSBSim',
    repository: 'https://github.com/JSBSim-Team/jsbsim',
    commit: '66f7fafc07fe13e7ede9db20873030fed2881713',
    tag: 'v1.3.3',
    date: '2026-10-16',
    paths: [], // whole
  },
};

/** The pinned toolchain that compiles the module (docs/provenance.md, 2b). */
export const EMSCRIPTEN = {
  version: '6.0.12',
  commit: '5488e0871d46d19a3209988190fa6a653126256f',
  emsdk: '35ff8a6d150541276abbc6bae512ca90bcfbe220',
};

/**
 * Emscripten's system libraries, by the name the linker is given less its variant (-lc++-legacyexcept
 * is c++), and the notices each one owes. A library the module links that is not here refuses the
 * release: its licence is not known.
 */
export const SYSTEM_LIBRARIES = {
  c: ['Emscripten', 'musl'],
  'c++': ['libc++'],
  'c++abi': ['libc++abi'],
  unwind: ['libunwind'],
  'clang_rt.builtins': ['compiler-rt'],
  dlmalloc: ['dlmalloc'],
  GL: ['Emscripten'],
  al: ['Emscripten'],
  html5: ['Emscripten'],
  noexit: ['Emscripten'],
  sockets: ['Emscripten', 'musl'],
  stubs: ['Emscripten'],
};

/** Every file of the Windows archive but the trainer's, whose list is P5's (app/tools/package.mjs). */
export const BINARY_FILES = [
  'A32X.exe',
  'README.txt',
  'LICENSE.txt',
  'web/index.html',
  'web/flight.js',
  'web/core.js',
  'notices/A32NX.txt',
  'notices/JSBSim.txt',
  'notices/aircraft-data.txt',
  'notices/Emscripten.txt',
  'notices/musl.txt',
  'notices/libc++.txt',
  'notices/libc++abi.txt',
  'notices/libunwind.txt',
  'notices/compiler-rt.txt',
  'notices/dlmalloc.txt',
  'notices/three.js.txt',
  'notices/airport-data.txt',
];

const GPL3 = /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/;
const LGPL21 = /GNU LESSER GENERAL PUBLIC LICENSE\s+Version 2\.1, February 1999/;
const APACHE_LLVM = /Apache License\s+Version 2\.0[\s\S]*LLVM Exceptions to the Apache 2\.0 License/;
const MIT = /^MIT License\b/;

/** What each file of the Windows archive must say, or there is no release: [file, must, what]. */
export const BINARY_NOTICES = [
  ['LICENSE.txt', GPL3, 'the GNU GPL, version 3'],
  ['README.txt', DISCLAIMER, 'the disclaimer'],
  ['web/index.html', DISCLAIMER, 'the disclaimer on the flight page, as the trainer page carries it'],
  ['README.txt', /NO WARRANTY/, 'that it comes with no warranty'],
  ['README.txt', /Corresponding Source is a32x-sim-\S+-source\.zip/, 'where its Corresponding Source is'],
  ['README.txt', /"Airbus", "A320" and "A32NX" belong to their owners/, 'the trademarks'],
  ['notices/A32NX.txt', GPL3, "A32NX's licence"],
  ['notices/A32NX.txt', new RegExp(UPSTREAM.a32nx.commit), "A32NX's commit"],
  ['notices/JSBSim.txt', LGPL21, "JSBSim's licence"],
  ['notices/JSBSim.txt', new RegExp(UPSTREAM.jsbsim.commit), "JSBSim's commit"],
  ['notices/JSBSim.txt', /Jon S\. Berndt/, "JSBSim's authors"],
  ['notices/aircraft-data.txt', /<author> Dave Culp <\/author>/, "the 737's header"],
  ['notices/aircraft-data.txt', /File:\s+CFM56_5\.xml/, "the CFM56's header"],
  ['notices/Emscripten.txt', /Emscripten is available under 2 licenses/, "Emscripten's licence"],
  ['notices/musl.txt', /musl as a whole is licensed under the following standard MIT license/, "musl's licence"],
  ['notices/libc++.txt', APACHE_LLVM, "libc++'s licence"],
  ['notices/libc++abi.txt', APACHE_LLVM, "libc++abi's licence"],
  ['notices/libunwind.txt', APACHE_LLVM, "libunwind's licence"],
  ['notices/compiler-rt.txt', APACHE_LLVM, "compiler-rt's licence"],
  ['notices/dlmalloc.txt', /written by\s+Doug Lea and released to the public domain/, "dlmalloc's dedication"],
  ['notices/three.js.txt', /The MIT License\s+Copyright © 2010-\d{4} three\.js authors/, "three.js's licence"],
  ['notices/airport-data.txt', /OurAirports[\s\S]*public domain/, 'where the runways come from'],
  ['notices/airport-data.txt', /AL-6039/, "the FAA's airport diagram"],
  ['web/flight.js', /@license\s+\*\s*Copyright 2010-\d{4} Three\.js Authors\s+\*\s*SPDX-License-Identifier: MIT/, "three.js's licence comment"],
  ['trainer/LICENSE', MIT, "the trainer's MIT licence"],
];

/** What the source archive must hold and say: [file, must or null for being there, what]. */
export const SOURCE_NOTICES = [
  ['README.txt', /Corresponding Source/, 'what it is'],
  ['README.txt', DISCLAIMER, 'the disclaimer'],
  ['a32x-cbt/LICENSE', MIT, "the repository's MIT licence"],
  ['a32x-cbt/flight/LICENSE', GPL3, "flight/'s GPLv3"],
  ['a32x-cbt/SOURCE-COMMIT', /^[0-9a-f]{40}\n$/, 'the commit it was exported from'],
  ['a32x-cbt/flight/CMakeLists.txt', null, 'the flight build'],
  ['a32x-cbt/flight/launcher/CMakeLists.txt', null, "the launcher's build"],
  ['a32x-cbt/flight/web/tools/build.mjs', null, "the page's build"],
  ['a32x-cbt/flight/web/tools/release.mjs', null, 'the release step'],
  ['a32x-cbt/flight/web/package-lock.json', null, 'the pinned three.js and esbuild'],
  ['upstream/a32nx/LICENSE', GPL3, "A32NX's licence"],
  ['upstream/a32nx/SOURCE-COMMIT', new RegExp(`^${UPSTREAM.a32nx.commit}\\n$`), "A32NX's commit"],
  ['upstream/a32nx/fbw-a32nx/src/wasm/fbw_a320/src/model/ElacComputer.cpp', null, "A32NX's ELAC"],
  ['upstream/jsbsim/COPYING', LGPL21, "JSBSim's licence"],
  ['upstream/jsbsim/SOURCE-COMMIT', new RegExp(`^${UPSTREAM.jsbsim.commit}\\n$`), "JSBSim's commit"],
  ['upstream/jsbsim/src/FGFDMExec.cpp', null, "JSBSim's executive"],
  ['upstream/three/LICENSE', /The MIT License/, "three.js's licence"],
  ['upstream/three/package.json', /"name": "three"/, "three.js's package"],
];

/** What the release's text templates (flight/web/release/*.txt) may ask for. */
export function templateValues({ commit, commitDate, epoch, three, esbuild }) {
  return {
    VERSION, BINARY, SOURCE,
    COMMIT: commit, COMMIT_DATE: commitDate, SOURCE_DATE_EPOCH: epoch,
    A32NX_COMMIT: UPSTREAM.a32nx.commit, A32NX_SHORT: UPSTREAM.a32nx.commit.slice(0, 7), A32NX_REPOSITORY: UPSTREAM.a32nx.repository,
    JSBSIM_COMMIT: UPSTREAM.jsbsim.commit, JSBSIM_SHORT: UPSTREAM.jsbsim.commit.slice(0, 7), JSBSIM_REPOSITORY: UPSTREAM.jsbsim.repository,
    JSBSIM_TAG: UPSTREAM.jsbsim.tag,
    EMSCRIPTEN: EMSCRIPTEN.version, EMSDK: EMSCRIPTEN.emsdk,
    THREE_VERSION: three, ESBUILD_VERSION: esbuild,
  };
}

function says(text, must) {
  return typeof must === 'string' ? text.replace(/\s+/g, ' ').includes(must) : must.test(text);
}

/** Every src= and href= of a page. */
export function pageReferences(html) {
  return [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]);
}

/** A template with its @NAME@ placeholders filled. One it has no value for refuses the release. */
export function fill(template, values, name) {
  const unknown = new Set();
  const text = template.replace(/@([A-Z0-9_]+)@/g, (all, key) => {
    if (!(key in values)) unknown.add(key);
    return key in values ? String(values[key]) : all;
  });
  if (unknown.size) {
    throw new Error(`release refused: ${name} asks for ${[...unknown].map((k) => `@${k}@`).join(', ')}, which the release does not know`);
  }
  return text;
}

/** Text wrapped at `width` columns, paragraph by paragraph. */
export function wrap(text, width = 76) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = [];
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (line && line.length + 1 + word.length > width) {
          lines.push(line);
          line = word;
        } else {
          line = line ? `${line} ${word}` : word;
        }
      }
      if (line) lines.push(line);
      return lines.join('\n');
    })
    .join('\n\n');
}

/** A notice file: what it covers, a rule, then the texts its project ships, each as it ships them. */
export function notice(about, ...texts) {
  const rule = `\n\n${'-'.repeat(76)}\n\n`;
  return `${wrap(about)}${texts.map((t) => rule + t.replace(/\r\n/g, '\n').trimEnd()).join('')}\n`;
}

/**
 * An aircraft or engine file's header, verbatim: its <fileheader> element where it has one, else its
 * first comment. A file with neither has nothing to say who made it, and refuses the release.
 */
export function xmlHeader(text, path) {
  const header = /<fileheader>[\s\S]*?<\/fileheader>/.exec(text) ?? /<!--[\s\S]*?-->/.exec(text);
  if (!header) throw new Error(`release refused: ${path} has no header for notices/aircraft-data.txt`);
  return header[0].replace(/\r\n/g, '\n');
}

/** The first paragraph of a file's first comment, on one line: what our own files say they are. */
export function firstParagraph(text, path) {
  const comment = /<!--([\s\S]*?)-->/.exec(text);
  if (!comment) throw new Error(`release refused: ${path} says nothing of what it is`);
  return comment[1].trim().split(/\r?\n\s*\r?\n/)[0].replace(/\s+/g, ' ');
}

/** The files the module embeds, off flight/CMakeLists.txt's FLIGHT_EMBED: [{ tree, path, at }]. */
export function embeddedFiles(cmake) {
  const block = /set\(FLIGHT_EMBED\s+([\s\S]*?)\)/.exec(cmake);
  if (!block) throw new Error('flight/CMakeLists.txt sets no FLIGHT_EMBED');
  const files = [...block[1].matchAll(/"\$\{(JSBSIM_DIR|CMAKE_CURRENT_SOURCE_DIR)\}\/([^@"]+)@([^"]+)"/g)].map(
    ([, dir, path, at]) => ({ tree: dir === 'JSBSIM_DIR' ? 'jsbsim' : 'flight', path, at }),
  );
  if (!files.length) throw new Error('flight/CMakeLists.txt embeds nothing the release can read');
  return files;
}

/** The commits flight/CMakeLists.txt accepts, as it spells them. */
export function cmakePins(cmake) {
  return {
    a32nx: /set\(A32NX_COMMIT_EXPECTED "([0-9a-f]+)"\)/.exec(cmake)?.[1],
    jsbsim: /set\(JSBSIM_COMMIT_EXPECTED "([0-9a-f]+)"\)/.exec(cmake)?.[1],
  };
}

/** The system libraries a verbose link hands wasm-ld, as -l names; the module's own archives are paths. */
export function linkedLibraries(linkOutput) {
  const line = linkOutput.split('\n').find((l) => /wasm-ld/.test(l));
  if (!line) throw new Error('the link printed no wasm-ld command');
  return [...new Set(line.split(/\s+/).flatMap((w) => /^-l(.+)$/.exec(w)?.[1] ?? []))].sort();
}

/** The notices those libraries owe. A library this release does not know refuses it. */
export function libraryNotices(names) {
  const notices = new Set();
  const unknown = [];
  for (const name of names) {
    const base = Object.keys(SYSTEM_LIBRARIES).find((k) => name === k || name.startsWith(`${k}-`));
    if (base) SYSTEM_LIBRARIES[base].forEach((n) => notices.add(n));
    else unknown.push(`-l${name}`);
  }
  if (unknown.length) {
    throw new Error(`release refused: the module links ${unknown.join(', ')}, whose licence the release does not know (release-contents.mjs, SYSTEM_LIBRARIES)`);
  }
  return [...notices].sort();
}

/**
 * Where a path of the machine that built a file shows up in it: each a problem. Searched without regard
 * to case or slash, as text and as UTF-16, the way Windows strings sit in a program. The UTF-16 form is
 * looked for byte by byte, its characters NUL-separated, rather than decoded: Node 24.16 on Windows
 * corrupts its heap decoding UTF-16 from a Buffer that starts at an odd offset.
 */
export function leaks(files, paths) {
  const needles = [
    ...new Set(paths.filter((p) => p && p.length >= 6).flatMap((p) => [p.replace(/\\/g, '/'), p.replace(/\//g, '\\')]).map((p) => p.toLowerCase())),
  ].map((n) => [n, [...n].join('\0')]);
  const problems = [];
  for (const [name, data] of files) {
    const text = data.toString('latin1').toLowerCase();
    const hit = needles.find(([n, wide]) => text.includes(n) || text.includes(wide));
    if (hit) problems.push(`${name} names ${hit[0]}, a path on the machine that built it`);
  }
  return problems;
}

function refuse(problems) {
  if (problems.length) throw new Error(`release refused:\n  ${problems.join('\n  ')}`);
}

function listed(files, want) {
  const missing = want.filter((n) => !files.has(n));
  const extra = [...files.keys()].filter((n) => !want.includes(n)).sort();
  return [...missing.map((n) => `${n} is missing`), ...extra.map((n) => `${n} is not on the list of what ships`)];
}

function noticesSaid(files, notices) {
  const problems = [];
  for (const [file, must, what] of notices) {
    const data = files.get(file);
    if (!data) problems.push(`${file}, which carries ${what}, is missing`);
    else if (must && !says(data.toString('utf8'), must)) problems.push(`${file} does not carry ${what}`);
  }
  return problems;
}

function placeholders(files) {
  return [...files]
    .filter(([name, data]) => name.endsWith('.txt') && /@[A-Z0-9_]+@/.test(data.toString('utf8')))
    .map(([name]) => `${name} still holds a placeholder`);
}

/**
 * Check the Windows archive's files, a Map of name to bytes, and throw with every problem found: the
 * list is exactly BINARY_FILES and the trainer's (`trainer`, P5's names); each notice says what it
 * must; each licence the module's system libraries owe (`owed`) ships; the page points at nothing that
 * does not ship; no esbuild helper rides in without its notice; A32X.exe runs on a bare Windows; and no
 * file names a path of the building machine (`paths`).
 */
export function checkBinary(files, { trainer, owed, paths = [] }) {
  const problems = listed(files, [...BINARY_FILES, ...trainer.map((n) => `trainer/${n}`)]);
  problems.push(...noticesSaid(files, BINARY_NOTICES));
  for (const n of owed) if (!files.has(`notices/${n}.txt`)) problems.push(`the module links code under ${n}'s licence, and notices/${n}.txt does not ship`);
  for (const ref of pageReferences(files.get('web/index.html')?.toString('utf8') ?? '')) {
    if (!files.has(`web/${ref}`)) problems.push(`web/index.html points at "${ref}", which does not ship`);
  }
  for (const name of ['web/flight.js', 'web/core.js']) {
    if (/\bvar __(?:defProp|publicField|export|toESM|commonJS|require|async)\s*=/.test(files.get(name)?.toString('latin1') ?? '')) {
      problems.push(`${name} carries esbuild's runtime helpers, whose MIT notice the release does not ship`);
    }
  }
  problems.push(...placeholders(files));
  if (files.has('A32X.exe')) {
    try {
      problems.push(...bareWindowsProblems(readPe(files.get('A32X.exe'))).map((p) => `A32X.exe ${p}`));
    } catch (err) {
      problems.push(`A32X.exe: ${err.message}`);
    }
  }
  problems.push(...leaks(files, paths));
  refuse(problems);
}

/**
 * Check the source archive's files: what it must hold and say, its README filled in (the templates it
 * carries in a32x-cbt/ are templates), no path of this machine.
 */
export function checkSource(files, { paths = [] } = {}) {
  const readme = files.has('README.txt') ? new Map([['README.txt', files.get('README.txt')]]) : new Map();
  refuse([...noticesSaid(files, SOURCE_NOTICES), ...placeholders(readme), ...leaks(files, paths)]);
}

/**
 * A deterministic zip of `files`, a Map of name to bytes, under the folder `root`: folders and files in
 * one sorted list, dated `when`, read back and compared before it is returned.
 */
export function archive(root, files, when) {
  const folders = new Set([`${root}/`]);
  for (const name of files.keys()) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) folders.add(`${root}/${parts.slice(0, i).join('/')}/`);
  }
  const entries = [
    ...[...folders].map((name) => ({ name, data: Buffer.alloc(0) })),
    ...[...files].map(([name, data]) => ({ name: `${root}/${name}`, data })),
  ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const bytes = zip(entries, when);
  const back = unzip(bytes);
  if (back.length !== entries.length) throw new Error(`${root}.zip holds ${back.length} entries, wrote ${entries.length}`);
  back.forEach((e, i) => {
    if (e.name !== entries[i].name || !e.data.equals(entries[i].data)) throw new Error(`${root}.zip: ${e.name} does not read back as written`);
  });
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    files: files.size,
  };
}
