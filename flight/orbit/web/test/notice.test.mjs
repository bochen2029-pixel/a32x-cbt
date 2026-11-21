// The sketch's licence, and the notices a built page carries for others' code in it (NOTICE.md): the
// MIT text once, the copyright lines of the sketch, three.js, Emscripten and musl, and the rest named.
// MIT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageNotice, readNotice } from '../tools/notice.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const orbit = join(here, '..', '..');
const built = join(orbit, 'build-web', 'index.html');

test('the sketch is MIT, and its notice names everything in a built page that is not its own', () => {
  const licence = readFileSync(join(orbit, 'LICENSE'), 'utf8');
  assert.match(licence, /^MIT License\n\nCopyright \(c\) 2026 /, 'LICENSE is the MIT licence, with its copyright line');
  assert.match(licence, /THE SOFTWARE IS PROVIDED "AS IS"/);
  const notice = readNotice(orbit);
  for (const [who, line] of [
    ['three.js', /Copyright © 2010-2026 three\.js authors/],
    ['Emscripten', /Copyright \(c\) 2010-2014 Emscripten authors/],
    ['musl', /Copyright © 2005-2020 Rich Felker, et al\./],
    ['libc++', /libc\+\+, libc\+\+abi and compiler-rt's builtins \| Apache-2\.0 with the LLVM exception/],
    ['dlmalloc', /dlmalloc 2\.8\.6.*public domain/],
  ]) assert.match(notice, line, `the notice names ${who}`);
  assert.ok(notice.startsWith('<!--\nMIT License') && notice.endsWith('\n-->\n'), 'one HTML comment, the licence first');
});

test('a notice that would end its comment early is refused, not printed broken', () => {
  assert.throws(() => pageNotice('MIT License', 'a --> b'), /would break/);
  assert.throws(() => pageNotice('MIT License <!-- x', 'b'), /would break/);
  assert.doesNotThrow(() => pageNotice('MIT License', '| a |---|'), 'a table\'s rule is not a comment\'s end');
});

// A test that cannot set up what it measures fails: without a built page there is nothing to read.
test('the built page carries the notice, after the head and before the scripts', () => {
  assert.ok(existsSync(built), `no built page at ${built}: build it first (README, "Build and test")`);
  const page = readFileSync(built, 'utf8');
  const at = page.indexOf(readNotice(orbit));
  assert.ok(at > 0, 'the notice, as notice.mjs writes it from LICENSE and NOTICE.md now');
  assert.ok(at > page.indexOf('</head>') && at < page.indexOf('<script'), 'in the body, before the first script');
  assert.ok(page.indexOf('<title>') < 8192, 'the title still within the first 8 KB');
});
