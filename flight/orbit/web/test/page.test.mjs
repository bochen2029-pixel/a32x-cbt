// The built page starts: the core loads, every part's init runs, and the status line reports no failure,
// on each tier, in flight and in the walk. It catches what the module tests cannot, a part that throws at
// start; two did on 2026-11-12, a button placed against one that had moved and a name shadowed in its own
// scope, and both showed only in a browser. Build first (tools/build.mjs). Skipped without a built page or
// without Playwright and its Chromium.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const page = new URL('../../build-web/index.html', import.meta.url);
let chromium = null;
try { ({ chromium } = require('playwright')); } catch { /* not installed here */ }
const why = !existsSync(fileURLToPath(page)) ? 'no built page: run tools/build.mjs' : !chromium ? 'Playwright is not installed' : false;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

test('the built page starts on every tier, in flight and in the walk, and says nothing failed', { skip: why, timeout: 900000 }, async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    for (const q of ['?q=low&at=775', '?q=medium', '?q=high&walk=floor']) {
      const p = await browser.newPage({ viewport: { width: 800, height: 450 } });
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(page.href + q);
      const started = await p.waitForFunction(() => window.orbitSketch || /^Failed/.test((document.querySelector('#status') || {}).textContent || ''), null, { timeout: 240000 })
        .then(() => true, () => false);
      const status = await p.$eval('#status', (e) => e.textContent).catch(() => '');
      assert.ok(started, `${q}: did not start in 240 s`);
      assert.ok(!/^Failed/.test(status), `${q}: ${status}`);
      assert.deepEqual(errors, [], `${q}: page errors`);
      await p.close();
    }
  } finally {
    await browser.close();
  }
});
