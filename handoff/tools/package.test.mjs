// The handoff kit's packager: the archive holds what the kit says it holds, reads back against its own
// manifest, is the same bytes twice, refuses what it should, and opens in the system's own unzip.
// HANDOFF_CANON=<ARCHITECTURE.md> also checks the real canon; HANDOFF_BUILD=1 also builds and tests the
// core from the archive with CMake. GPLv3.
//
//   node --test flight/orbit/handoff/tools/package.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzip } from '../../../../app/tools/zip.mjs';
import { KIT_DOCS, Refusal, build, check, expectedCanonHash, firstTextBlock, repoRoot, sha256 } from './package.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const kit = join(here, '..');
const root = repoRoot();
const scratch = mkdtempSync(join(tmpdir(), 'orbit-handoff-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));

const fakeCanon = join(scratch, 'not-the-canon.md');
writeFileSync(fakeCanon, '# Not the canon\n\nA stand-in, so the tests do not depend on where the real one lives.\n');
const realCanon = process.env.HANDOFF_CANON;
const canon = realCanon || fakeCanon;
const allowOtherCanon = !realCanon;

// Changed or uncommitted files the packager would take: decides which of the two modes can run here.
const changed = execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all', '--',
  'flight/orbit/handoff', 'flight/orbit/core', 'flight/orbit/test', 'flight/orbit/tools', 'flight/orbit/README.md',
  'flight/orbit/INVARIANTS.md', 'flight/orbit/evidence', 'flight/orbit/web', 'flight/orbit/CMakeLists.txt', 'docs/provenance.md',
  'flight/LICENSE'],
  { encoding: 'utf8' }).trim();

const made = build({ root, canon, page: null, worktree: true, allowOtherCanon });

test('the first message to paste is the same in README.md and BOOTSTRAP_PROMPT.md', () => {
  const a = firstTextBlock(readFileSync(join(kit, 'README.md'), 'utf8'));
  const b = firstTextBlock(readFileSync(join(kit, 'BOOTSTRAP_PROMPT.md'), 'utf8'));
  assert.ok(a && a.length > 200, 'README.md carries a ```text block');
  assert.equal(a, b);
});

test('CANON_DELTA.md names the canon it was written against, by SHA-256', () => {
  assert.match(expectedCanonHash(readFileSync(join(kit, 'CANON_DELTA.md'), 'utf8')), /^[0-9a-f]{64}$/);
});

test('the archive holds the kit, the canon, the core, its tests and CMake, and nothing built', () => {
  const names = [...made.files.keys()];
  for (const doc of KIT_DOCS) assert.ok(names.includes(doc), doc);
  for (const path of ['canon/ARCHITECTURE.md', 'orbit/CMakeLists.txt', 'orbit/README.md', 'orbit/core/orbit_core.h',
    'orbit/core/orbit_core.cpp', 'orbit/core/exports/core.txt', 'orbit/test/test_orbit.cpp', 'orbit/tools/orbit_run.cpp',
    'orbit/INVARIANTS.md', 'orbit/evidence/INDEX.md', 'orbit/web/src/main.js', 'orbit/web/src/tour-plan.js',
    'reference/provenance.md', 'licences/GPL-3.0.txt', 'NOTICE.txt', 'MANIFEST.json', 'SHA256SUMS']) {
    assert.ok(names.includes(path), path);
  }
  for (const name of names) assert.doesNotMatch(name, /(^|\/)build[^/]*\/|node_modules|\.(o|a|obj|lib|exe|wasm)$/, name);
  assert.ok(!names.some((n) => n.startsWith('page/')), 'no page unless one is given');
  assert.equal(made.manifest.page, null);
});

test('the archive reads back, every file matching its manifest and SHA256SUMS', () => {
  const count = check(made.bytes);
  assert.equal(count, made.manifest.files.length + 2);
  const entries = unzip(made.bytes);
  const top = entries[0].name.split('/')[0];
  assert.equal(top, `orbit-handoff-${made.manifest.source.commit.slice(0, 7)}`);
  assert.ok(entries.every((e) => e.name.startsWith(`${top}/`)));
});

test('the manifest names this commit, and the canon by its hash', () => {
  const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(made.manifest.source.commit, head);
  assert.equal(made.manifest.canon.sha256, sha256(readFileSync(canon)));
  assert.equal(made.manifest.canon.matches, Boolean(realCanon));
  const text = made.files.get('MANIFEST.json').toString('utf8');
  assert.doesNotMatch(text, /\/home\/|\/root\/|\/tmp\/|[A-Z]:\\/, 'no path of this machine');
});

test('the same inputs give the same bytes', () => {
  const again = build({ root, canon, page: null, worktree: true, allowOtherCanon });
  assert.ok(again.bytes.equals(made.bytes));
});

test('a canon other than the one CANON_DELTA.md names is refused unless allowed', { skip: realCanon && 'the real canon was given' }, () => {
  assert.throws(() => build({ root, canon: fakeCanon, page: null, worktree: true }), (e) => e instanceof Refusal && /SHA-256/.test(e.message));
});

test('a page given is carried, hashed, and said to be a build output', () => {
  const page = join(scratch, 'index.html');
  writeFileSync(page, '<!doctype html><title>a stand-in page</title>\n');
  const withPage = build({ root, canon, page, worktree: true, allowOtherCanon });
  assert.ok(withPage.files.has('page/index.html'));
  assert.equal(withPage.manifest.page.sha256, sha256(readFileSync(page)));
  assert.match(withPage.manifest.page.note, /build output/);
  assert.match(withPage.files.get('NOTICE.txt').toString('utf8'), /page\/index\.html: the sketch's page as built/);
  assert.throws(() => build({ root, canon, page: join(scratch, 'missing.html'), worktree: true, allowOtherCanon }), Refusal);
});

test('from HEAD it refuses files that differ from the commit, or gives what the clean working tree gives', () => {
  if (changed) {
    assert.throws(() => build({ root, canon, page: null, allowOtherCanon }), (e) => e instanceof Refusal && /differ from HEAD/.test(e.message));
    assert.ok(made.manifest.source.changed.length > 0);
  } else {
    const fromHead = build({ root, canon, page: null, allowOtherCanon });
    assert.ok(fromHead.bytes.equals(made.bytes));
    assert.equal(made.manifest.source.changed, undefined);
  }
});

const systemUnzip = spawnSync('unzip', ['-v'], { encoding: 'utf8' }).status === 0;
test('the operating system\'s own unzip reads it', { skip: !systemUnzip && 'no unzip on this machine' }, () => {
  const path = join(scratch, made.name);
  writeFileSync(path, made.bytes);
  const r = spawnSync('unzip', ['-tq', path], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('the core in the archive builds and passes its own tests', { skip: process.env.HANDOFF_BUILD !== '1' && 'set HANDOFF_BUILD=1 to build it (needs CMake and a compiler)', timeout: 600000 }, () => {
  const into = join(scratch, 'unzipped');
  for (const e of unzip(made.bytes)) {
    const path = join(into, e.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, e.data);
  }
  const orbit = join(into, made.name.replace(/(-changed)?\.zip$/, ''), 'orbit');
  const bin = join(scratch, 'core-build');
  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    assert.equal(r.status, 0, `${cmd} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
    return r.stdout;
  };
  run('cmake', ['-S', orbit, '-B', bin, '-DCMAKE_BUILD_TYPE=Release']);
  run('cmake', ['--build', bin, '--config', 'Release']);
  const out = run('ctest', ['--test-dir', bin, '-C', 'Release', '--output-on-failure']);
  assert.match(out, /100% tests passed/);
});
