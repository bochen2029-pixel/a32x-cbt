// The Earth worked out at half the size and brought up by its composite (earth.js) against the Earth worked
// out in full, in the built page: the far scene drawn both ways in one frozen frame and compared pixel by
// pixel after tone mapping, at low (where the tier draws it so) from the runway, the climb and orbit, and at
// high (where the frame rate's controller asks for it) in orbit. The composite keeps the limb, the horizon
// and the depth exact, and the band round the limb and the square round the Sun are worked out in full, so
// what differs is the softening of sharp detail on the ground (the fields' edges, a coast at a grazing
// angle): a small share of the pixels, by a few levels in 255. Build first (tools/build.mjs). Skipped without
// a built page or without Playwright and its Chromium. MIT.
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

// In the page: the far scene drawn in full and at half, read back, compared; and the share of the pixels
// worked out in full, the band's (debug view 5 paints them).
const COMPARE = `(() => {
  const o = window.orbitSketch, r = o.renderer, cam = o.ctx.camera, gl = r.getContext();
  const W = r.domElement.width, H = r.domElement.height;
  const shot = (s, debug = 0) => {
    o.earth.setResolution(s);
    o.earth.uniforms.uDebug.value = debug;
    o.pipeline.render(() => { cam.near = 1e4; cam.far = 1e8; cam.updateProjectionMatrix(); r.render(o.ctx.far, cam); });
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };
  const was = o.earth.resolution;
  const full = shot(1), half = shot(0.5), mask = shot(0.5, 5);
  o.earth.uniforms.uDebug.value = 0;
  o.earth.setResolution(was);
  const d = new Float64Array(W * H);
  let sum = 0, over = 0, inFull = 0;
  for (let i = 0; i < W * H; i++) {
    const k = i * 4;
    d[i] = Math.max(Math.abs(full[k] - half[k]), Math.abs(full[k + 1] - half[k + 1]), Math.abs(full[k + 2] - half[k + 2]));
    sum += d[i];
    if (d[i] > 8) over++;
    if (mask[k] > 40) inFull++;
  }
  const sorted = Array.from(d).sort((a, b) => a - b);
  return { mean: sum / (W * H), p99: sorted[Math.floor(0.99 * sorted.length)], over8: over / (W * H), inFull: inFull / (W * H) };
})()`;

const CASES = [
  { q: 'q=low', name: 'low, the runway' },
  { q: 'q=low&at=110', name: 'low, the climb' },
  { q: 'q=low&at=775', name: 'low, orbit' },
  { q: 'q=high&at=775', name: 'high, orbit' },
];

test('the Earth from half the size looks as it does in full, but for sharp detail on the ground', { skip: why, timeout: 1800000 }, async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    for (const c of CASES) {
      const p = await browser.newPage({ viewport: { width: 640, height: 360 } });
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await p.goto(`${page.href}?${c.q}&res=fixed`, { timeout: 300000 });   // a loaded machine takes long over a 2 MB page
      await p.waitForFunction(() => window.orbitSketch || /^Failed/.test((document.querySelector('#status') || {}).textContent || ''), null, { timeout: 300000 });
      await p.evaluate(() => { window.orbitSketch.state.warp = 0; });
      await p.evaluate(() => new Promise((done) => { let n = 3; const tick = () => (--n > 0 ? requestAnimationFrame(tick) : done()); requestAnimationFrame(tick); }));
      const r = await p.evaluate(COMPARE);
      const say = `${c.name}: mean ${r.mean.toFixed(3)}, 99th percentile ${r.p99}, over 8 levels ${(r.over8 * 100).toFixed(2)} %, worked out in full ${(r.inFull * 100).toFixed(1)} %`;
      assert.deepEqual(errors, [], `${c.name}: errors`);
      assert.ok(r.mean < 0.6, say);
      assert.ok(r.p99 <= 8, say);
      assert.ok(r.over8 < 0.01, say);
      assert.ok(r.inFull < 0.1, say);
      console.log(`# ${say}`);
      await p.close();
    }
  } finally {
    await browser.close();
  }
});
