// The pilot's guide as the release ships it: one page made from the Markdown, with every section, table
// and picture, the release's disclaimer before the first section, nothing it does not know passed
// through, and pictures that are the ones the release lists, each small enough to ship. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { guideHtml, guideImages } from '../tools/guide-html.mjs';
import { BINARY_FILES } from '../tools/release-contents.mjs';

const docs = (p) => fileURLToPath(new URL(`../../../docs/${p}`, import.meta.url));
const MD = readFileSync(docs('pilots-guide.md'), 'utf8');

test('the guide becomes one page with every section, table and picture, the disclaimer first', () => {
  const html = guideHtml(MD, { disclaimer: 'Unofficial. Not for type training.', version: '0.1.1' });
  const sections = [...MD.matchAll(/^# (.+)$/gm)].map((m) => m[1]);
  assert.ok(sections.length >= 8, `${sections.length} sections`);
  assert.equal((html.match(/<h2 /g) || []).length, sections.length);
  assert.equal((html.match(/<figure>/g) || []).length, guideImages(MD).length);
  assert.equal((html.match(/<table>/g) || []).length, (MD.match(/^\|-[-|]*$/gm) || []).length);
  assert.ok(html.indexOf('Unofficial. Not for type training.') < html.indexOf('<h2'), 'the disclaimer before the first section');
  assert.match(html, /release 0\.1\.1/);
  for (const left of ['**', '](', '|---', '![']) assert.ok(!html.includes(left), `no "${left}" left over`);
  for (const n of guideImages(MD)) assert.ok(html.includes(`<img src="${n}"`), n);
});

test('each part of Markdown the guide uses becomes its HTML; a picture inside a paragraph is refused', () => {
  const md = '---\ntitle: "T"\n---\n# One\n\nA *b* and **c**, `d<e`.\n\n- x\n  y\n- z\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n' +
    '![Cap](guide/p.jpg)\n\n    code & more\n\n> note\n';
  const html = guideHtml(md);
  for (const want of ['<title>T</title>', '<h2 id="one">One</h2>', '<p>A <em>b</em> and <strong>c</strong>, <code>d&lt;e</code>.</p>',
    '<li>x y</li>', '<li>z</li>', '<th>a</th><th>b</th>', '<td>1</td><td>2</td>',
    '<figure><img src="p.jpg" alt="Cap"><figcaption>Cap</figcaption></figure>', '<pre><code>code &amp; more</code></pre>',
    '<blockquote><p>note</p></blockquote>']) {
    assert.ok(html.includes(want), want);
  }
  assert.throws(() => guideHtml('Text with ![a picture](guide/x.jpg) inside.\n'), /picture inside a paragraph/);
});

test('the guide\'s pictures are the ones the release lists, each small enough to ship', () => {
  const listed = BINARY_FILES.filter((n) => n.startsWith('guide/') && n !== 'guide/index.html').map((n) => n.slice('guide/'.length));
  assert.deepEqual([...guideImages(MD)].sort(), [...listed].sort());
  for (const n of listed) {
    const kb = statSync(docs(`guide/${n}`)).size / 1024;
    assert.ok(kb < 300, `${n} is ${kb.toFixed(0)} KB`);
  }
});
