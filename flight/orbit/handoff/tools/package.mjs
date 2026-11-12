#!/usr/bin/env node
// package.mjs: the handoff kit's zip, the one a person carries to the other machine. In it: the kit's
// documents; the canon; the orbit core's sources, headers, tests, tools and CMake; the built page if
// there is one; the GPLv3's text; this repository's provenance; a notice; and a manifest naming the
// commit, with a SHA-256 for every file (also as SHA256SUMS, for `sha256sum -c` or Get-FileHash).
// Node built-ins and this repository's own zip writer (app/tools/zip.mjs). GPLv3.
//
//   node flight/orbit/handoff/tools/package.mjs --canon <ARCHITECTURE.md> [--page <index.html>]
//        [--out <folder>] [--worktree] [--allow-other-canon]
//
// It takes the repository's files from git's objects at HEAD, so no working tree leaks in, and refuses
// if a file it takes differs from HEAD or is not committed. --worktree takes the working tree instead
// and names every such file in the manifest. The canon must be the draft CANON_DELTA.md names by its
// SHA-256, unless --allow-other-canon. The page is a build output: from --page, or from
// flight/orbit/build-web/index.html when it is there; the manifest says it was not checked against the
// commit. No path of this machine is written into the archive.
//
// Deterministic: the same commit, canon and page give the same bytes (entries dated at the zip epoch,
// files in name order). Writes <out>/orbit-handoff-<commit>.zip (default out: flight/orbit/build/handoff,
// which git ignores), then reads it back and checks every file against the manifest. Exit 0 when written
// and checked, 1 when refused, 2 for a usage error.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { unzip, zip, ZIP_EPOCH } from '../../../../app/tools/zip.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** The kit's documents, in reading order. Each must exist, or the archive is refused. */
export const KIT_DOCS = [
  'README.md', 'CANON_DELTA.md', 'UNREAL_PORT.md', 'FIRST_SLICE.md', 'LICENSING.md', 'CLAUDE.md.template',
  'BOOTSTRAP_PROMPT.md', 'SOURCES.md',
];
const KIT = 'flight/orbit/handoff';
/** The orbit sketch's parts that travel: everything git tracks under these. */
const ORBIT = 'flight/orbit';
const ORBIT_PARTS = ['README.md', 'CMakeLists.txt', 'core', 'test', 'tools'];
/** Files from elsewhere in the repository, and where they go in the archive. */
const EXTRA = [
  ['docs/provenance.md', 'reference/provenance.md'],
  ['flight/LICENSE', 'licences/GPL-3.0.txt'],
];
const DEFAULT_PAGE = 'flight/orbit/build-web/index.html';
const REPOSITORY = 'a32x-cbt';

export class Refusal extends Error {}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function git(root, args, encoding = 'utf8') {
  return execFileSync('git', ['-C', root, ...args], { encoding, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** The repository this script sits in (a worktree's own top level, in a worktree). */
export function repoRoot() {
  return git(here, ['rev-parse', '--show-toplevel']).trim();
}

/** The canon's SHA-256, as CANON_DELTA.md names it. */
export function expectedCanonHash(canonDelta) {
  const m = canonDelta.match(/SHA-256\s*`([0-9a-f]{64})`/);
  if (!m) throw new Refusal('CANON_DELTA.md names no SHA-256 for the canon');
  return m[1];
}

/** The first ```text block of a Markdown file: the prompt to paste. */
export function firstTextBlock(markdown) {
  const m = markdown.match(/```text\r?\n([\s\S]*?)\r?\n```/);
  return m ? m[1] : null;
}

/** Repository paths that differ from HEAD, untracked ones included. */
function changedPaths(root, paths) {
  const out = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...paths]);
  return out.split('\0').filter(Boolean).map((line) => line.slice(3)).sort();
}

/** What the archive takes from the repository: [repository path, archive path] pairs, sorted. */
function repositoryFiles(root) {
  const pairs = KIT_DOCS.map((doc) => [`${KIT}/${doc}`, doc]);
  const tracked = git(root, ['ls-files', '-z', '--', ...ORBIT_PARTS.map((p) => `${ORBIT}/${p}`)]).split('\0').filter(Boolean);
  for (const path of tracked) pairs.push([path, `orbit/${path.slice(ORBIT.length + 1)}`]);
  pairs.push(...EXTRA);
  return pairs;
}

function notice(short, commit, page) {
  return [
    `orbit-handoff-${short}: what is in this archive, and under which licence.`,
    '',
    'README.md and the other documents beside it: the handoff kit, written for its owner. They sit in',
    `${REPOSITORY}'s flight/ and so are GPLv3 by that repository's rule; LICENSING.md says what that means.`,
    '',
    "canon/ARCHITECTURE.md: the canon, the owner's own document.",
    '',
    `orbit/: the orbit sketch's core, tests, tools and CMake, from ${REPOSITORY}'s flight/orbit at`,
    `${commit}. GPLv3: licences/GPL-3.0.txt.`,
    '',
    page
      ? 'page/index.html: the sketch\'s page as built, GPLv3. Inside it are three.js (MIT; its notice is in\n' +
        'the page) and Emscripten\'s runtime and the C and C++ libraries it links (MIT, NCSA, and Apache-2.0\n' +
        'with the LLVM exception; reference/provenance.md, section 2b). Its full source is the repository\n' +
        'at the commit above.'
      : 'page/: absent. No built page was given to the packager.',
    '',
    `reference/provenance.md: ${REPOSITORY}'s record of where everything in it came from.`,
    '',
    "This archive is for its owner's own use. Passing the core or the page to anyone else is a GPLv3",
    'distribution: give them the source with it.',
    '',
  ].join('\n');
}

/**
 * Build the archive in memory. options: { root, canon (path), page (path or null), worktree (bool),
 * allowOtherCanon (bool) }. Returns { name, bytes, manifest, files }. Throws Refusal when refused.
 */
export function build({ root = repoRoot(), canon, page = undefined, worktree = false, allowOtherCanon = false }) {
  if (!canon) throw new Refusal('--canon <ARCHITECTURE.md> is required: the canon travels with the kit');
  if (!existsSync(canon)) throw new Refusal(`no canon at ${canon}`);
  const commit = git(root, ['rev-parse', 'HEAD']).trim();
  const short = commit.slice(0, 7);
  const commitDate = git(root, ['log', '-1', '--format=%cI', commit]).trim();

  const pairs = repositoryFiles(root);
  for (const [path] of pairs) {
    if (!existsSync(join(root, path))) throw new Refusal(`${path} is missing`);
  }
  const changed = changedPaths(root, pairs.map(([path]) => path));
  if (changed.length && !worktree) {
    throw new Refusal(`these differ from HEAD or are not committed; commit them, or pass --worktree:\n  ${changed.join('\n  ')}`);
  }
  const read = (path) => (worktree ? readFileSync(join(root, path)) : git(root, ['show', `${commit}:${path}`], 'buffer'));

  const top = `orbit-handoff-${short}`;
  const files = new Map();   // archive path -> bytes
  for (const [path, into] of pairs) files.set(into, read(path));

  const canonDelta = files.get('CANON_DELTA.md').toString('utf8');
  const expected = expectedCanonHash(canonDelta);
  const canonBytes = readFileSync(canon);
  const canonHash = sha256(canonBytes);
  if (canonHash !== expected && !allowOtherCanon) {
    throw new Refusal(`the canon given has SHA-256 ${canonHash}; CANON_DELTA.md was written against ${expected}. ` +
      'Pass --allow-other-canon to carry a different draft, and say so in the kit.');
  }
  files.set('canon/ARCHITECTURE.md', canonBytes);

  const readme = files.get('README.md').toString('utf8');
  const prompt = files.get('BOOTSTRAP_PROMPT.md').toString('utf8');
  if (firstTextBlock(readme) === null || firstTextBlock(readme) !== firstTextBlock(prompt)) {
    throw new Refusal('README.md and BOOTSTRAP_PROMPT.md must carry the same first message in a ```text block');
  }

  const pagePath = page === undefined ? (existsSync(join(root, DEFAULT_PAGE)) ? join(root, DEFAULT_PAGE) : null) : page;
  if (pagePath && !existsSync(pagePath)) throw new Refusal(`no page at ${pagePath}`);
  const pageBytes = pagePath ? readFileSync(pagePath) : null;
  if (pageBytes) files.set('page/index.html', pageBytes);
  files.set('NOTICE.txt', Buffer.from(notice(short, commit, Boolean(pageBytes)), 'utf8'));

  const listed = [...files.keys()].sort();
  const manifest = {
    kit: 'orbit-handoff',
    about: "The orbit sketch's handoff kit for an Unreal Engine project; start with README.md.",
    source: {
      repository: REPOSITORY,
      commit,
      commit_date: commitDate,
      tree: changed.length ? 'working tree, with changes since the commit' : 'the commit, unchanged',
      ...(changed.length ? { changed } : {}),
    },
    canon: { file: 'canon/ARCHITECTURE.md', sha256: canonHash, expected_sha256: expected, matches: canonHash === expected },
    page: pageBytes
      ? { file: 'page/index.html', sha256: sha256(pageBytes), note: 'a build output, not checked against the commit' }
      : null,
    files: listed.map((path) => ({ path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
  };
  files.set('MANIFEST.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
  const sums = [...files.keys()].sort().map((path) => `${sha256(files.get(path))}  ${path}\n`).join('');
  files.set('SHA256SUMS', Buffer.from(sums, 'utf8'));

  const entries = [...files.keys()].sort().map((path) => ({ name: `${top}/${path}`, data: files.get(path) }));
  const bytes = zip(entries, ZIP_EPOCH);
  return { name: `${top}${changed.length ? '-changed' : ''}.zip`, bytes, manifest, files };
}

/** Read an archive back and check every file against its manifest and SHA256SUMS. Returns the file count. */
export function check(bytes) {
  const entries = unzip(bytes);
  const tops = new Set(entries.map((e) => e.name.split('/')[0]));
  if (tops.size !== 1) throw new Refusal(`expected one top folder, found ${[...tops].join(', ')}`);
  const [top] = tops;
  const byPath = new Map(entries.map((e) => [e.name.slice(top.length + 1), e.data]));
  const manifest = JSON.parse(byPath.get('MANIFEST.json').toString('utf8'));
  for (const f of manifest.files) {
    const data = byPath.get(f.path);
    if (!data) throw new Refusal(`${f.path} is in the manifest and not in the archive`);
    if (data.length !== f.bytes || sha256(data) !== f.sha256) throw new Refusal(`${f.path} does not match the manifest`);
  }
  const sums = byPath.get('SHA256SUMS').toString('utf8').trim().split('\n');
  for (const line of sums) {
    const [hash, path] = [line.slice(0, 64), line.slice(66)];
    if (!byPath.has(path) || sha256(byPath.get(path)) !== hash) throw new Refusal(`SHA256SUMS: ${path} does not match`);
  }
  const counted = manifest.files.length + 2;   // and MANIFEST.json and SHA256SUMS themselves
  if (byPath.size !== counted || sums.length !== counted - 1) {
    throw new Refusal(`the archive holds ${byPath.size} files; the manifest accounts for ${counted}`);
  }
  return byPath.size;
}

function main() {
  let args;
  try {
    ({ values: args } = parseArgs({
      options: {
        canon: { type: 'string' }, page: { type: 'string' }, out: { type: 'string' },
        worktree: { type: 'boolean', default: false }, 'allow-other-canon': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    }));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (args.help) {
    console.log('node flight/orbit/handoff/tools/package.mjs --canon <ARCHITECTURE.md> [--page <index.html>] [--out <folder>] [--worktree] [--allow-other-canon]');
    return;
  }
  try {
    const root = repoRoot();
    const made = build({
      root, canon: args.canon && resolve(args.canon), page: args.page && resolve(args.page),
      worktree: args.worktree, allowOtherCanon: args['allow-other-canon'],
    });
    const out = resolve(args.out ?? join(root, 'flight/orbit/build/handoff'));
    mkdirSync(out, { recursive: true });
    const path = join(out, made.name);
    writeFileSync(path, made.bytes);
    const count = check(readFileSync(path));
    const m = made.manifest;
    console.log(`wrote ${path}: ${count} files, ${(made.bytes.length / 1e6).toFixed(2)} MB, read back and checked`);
    console.log(`  from ${m.source.repository} ${m.source.commit} (${m.source.tree})`);
    console.log(`  canon ${m.canon.sha256.slice(0, 12)}… ${m.canon.matches ? 'is the draft CANON_DELTA.md names' : 'is NOT the draft CANON_DELTA.md names'}`);
    console.log(`  page ${m.page ? `${m.page.sha256.slice(0, 12)}… included (a build output)` : 'absent'}`);
  } catch (e) {
    if (e instanceof Refusal) {
      console.error(`refused: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
