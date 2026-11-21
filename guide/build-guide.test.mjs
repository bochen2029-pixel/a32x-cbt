// The guide's tool and its source agree: every figure names a screenshot the tool takes, and every
// screenshot taken is shown; the page fetches nothing; the PDF's pages are counted right. No browser is
// started here: the screenshots and the print are build-guide.mjs's own run. GPLv3.
//
//   node --test flight/orbit/guide/build-guide.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SESSIONS, SHOT_NAMES, pdfPages } from './build-guide.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'guide.html'), 'utf8');
const shown = new Set([...html.matchAll(/data-shot="([^"]+)"/g)].map((m) => m[1]));

test('every figure shows a screenshot the tool takes, and every screenshot is shown', () => {
  assert.deepEqual([...shown].filter((n) => !SHOT_NAMES.includes(n)), [], 'figures with no screenshot to show');
  assert.deepEqual(SHOT_NAMES.filter((n) => !shown.has(n)), [], 'screenshots no figure shows');
  assert.equal(new Set(SHOT_NAMES).size, SHOT_NAMES.length, 'each name once');
});

test('each session is a page address with its options, and each shot says what it shows', () => {
  for (const s of SESSIONS) {
    assert.match(s.query, /^q=(low|medium|high)(&[a-z]+(=[\w.-]+)?)*$/, s.query);
    for (const shot of s.shots) {
      assert.match(shot.name, /^[a-z][a-z-]*$/, shot.name);
      assert.ok(shot.about && shot.about.length > 8, `${shot.name} says what it shows`);
      assert.ok(shot.run || shot.keys, `${shot.name} does something before its picture`);
    }
  }
});

test('the guide fetches nothing: no script, style, image or font from anywhere but beside it', () => {
  assert.doesNotMatch(html, /<(script|img|link|iframe)[^>]+(src|href)="(https?:)?\/\//i);
  assert.doesNotMatch(html, /@import|url\(\s*["']?(https?:)?\/\//i);
});

test('the pages are counted by their page objects, not their tree', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Pages /Count 2 /Kids [2 0 R 3 0 R] >> endobj\n'
    + '2 0 obj << /Type /Page /Parent 1 0 R >> endobj\n3 0 obj << /Type/Page /Parent 1 0 R >> endobj\n%%EOF\n', 'latin1');
  assert.equal(pdfPages(pdf), 2);
});

test('the contents and the page numbers are the script\'s, and every page is a fixed Letter box', () => {
  assert.match(html, /@page \{ size: 8\.5in 11in; margin: 0; \}/);
  assert.match(html, /\.page \{ width: 8\.5in; height: 11in;/);
  assert.match(html, /<ol id="toc"><\/ol>/, 'the contents are built, not typed');
  assert.match(html, /window\.guideFaults = /, 'the build can ask which page overflows');
});
