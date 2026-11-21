// The deck's markings and lamps are a handful of draws, not one a quad or a lamp (on 2026-11-21 they were 455 of
// the low tier's 576 draws a frame by the Ring): in the built page in Chromium, by the Ring at 775 s on the low tier,
// the deck's marks are seven meshes, two of them instanced spheres holding the pads' 48 edge lights and the lead-in
// lights, and the pads, the white marks, the yellow and the black stripes one geometry each. Build first
// (tools/build.mjs). Skipped without a built page or without Playwright and its Chromium. MIT.
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

test('the deck\'s markings and lamps are seven meshes, the lamps instanced', { skip: why, timeout: 600000 }, async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    const p = await browser.newPage({ viewport: { width: 800, height: 450 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page.href + '?q=low&at=775');
    const started = await p.waitForFunction(() => window.orbitSketch || /^Failed/.test((document.querySelector('#status') || {}).textContent || ''), null, { timeout: 240000 })
      .then(() => true, () => false);
    assert.ok(started, 'the page did not start in 240 s');
    const r = await p.evaluate(async () => {
      const o = window.orbitSketch;
      if (!o) return null;
      const marks = o.ring.spin.getObjectByName('deck-marks');
      if (!marks) return { marks: false };
      let meshes = 0, instanced = 0, instances = 0, quads = 0;
      marks.traverse((x) => {
        if (!x.isMesh) return;
        meshes++;
        if (x.isInstancedMesh) { instanced++; instances += x.count; }
        else if (x.geometry.index && x.geometry.attributes.position.count === x.geometry.index.count / 6 * 4) quads += x.geometry.index.count / 6;
      });
      // and the frame's draws, every pass of it
      const R = o.renderer, frame = () => new Promise((res) => requestAnimationFrame(() => res()));
      await frame();
      R.info.autoReset = false;
      R.info.reset();
      await frame();
      const calls = R.info.render.calls;
      R.info.autoReset = true;
      return { marks: true, meshes, instanced, instances, quads, calls };
    });
    assert.ok(r && r.marks, 'no deck-marks group under the Ring\'s spin');
    assert.equal(r.meshes, 7, `${r.meshes} meshes`);
    assert.equal(r.instanced, 2);
    assert.ok(r.instances >= 48 + 10 && r.instances <= 48 + 14, `${r.instances} lamps`);
    assert.ok(r.quads > 380, `${r.quads} quads in the merged marks`);   // the pads, the centreline, the edges, the stripes
    assert.ok(r.calls < 200, `${r.calls} draws a frame`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
