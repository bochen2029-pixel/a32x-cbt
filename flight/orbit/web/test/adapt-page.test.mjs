// The frame rate's controller in the built page (adapt.js, through main.js): drawn in software, the frames
// come far slower than the target, so after its warm-up the page draws fewer pixels; the canvas's buffer
// shrinks, the meter says so, and nothing fails. The flight goes on by its own clock all the while. Build
// first (tools/build.mjs). Skipped without a built page or without Playwright and its Chromium. GPLv3.
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

test('drawn slowly, the page draws fewer pixels, says so, and the flight goes on', { skip: why, timeout: 900000 }, async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    const p = await browser.newPage({ viewport: { width: 800, height: 450 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`${page.href}?q=low&at=775`, { timeout: 300000 });
    await p.waitForFunction(() => window.orbitSketch || /^Failed/.test((document.querySelector('#status') || {}).textContent || ''), null, { timeout: 300000 });
    const start = await p.evaluate(() => ({ w: window.orbitSketch.renderer.domElement.width, t: window.orbitSketch.core.s.t }));
    // fewer pixels, at some moment of the next few minutes (on a loaded machine the law may undo a step that
    // bought too little, and try again later)
    const fewer = await p.waitForFunction(() => window.orbitSketch.governor.rung > 0, null, { timeout: 600000, polling: 500 })
      .then(() => true, () => false);
    assert.ok(fewer, 'the picture never came down a rung');
    const now = await p.evaluate(() => {
      const o = window.orbitSketch;
      return { w: o.renderer.domElement.width, rung: o.governor.rung, scale: o.governor.scale, t: o.core.s.t, line: o.perf ? o.perf() : null };
    });
    assert.ok(now.w < start.w, `the buffer ${start.w} wide, then ${now.w}`);
    assert.ok(Math.abs(now.w / start.w - now.scale) < 0.02, `${now.w / start.w} of the width at a scale of ${now.scale}`);
    assert.ok(now.t > start.t, 'the flight went on');
    // the meter (the backquote key) says how the frame rate is held
    const meter = await p.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '`' })); return document.getElementById('perf').textContent; });
    assert.match(meter, /held at 60 fps: /);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
