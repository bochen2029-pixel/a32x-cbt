// The Earth's air as its shader samples it, against a fine reference of the same model: from orbit the
// samples must find the air near the ground, where it is, and from the runway near the eye. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opticalDepth, viewSpan } from '../src/air.js';
import { SETTINGS, TIERS } from '../src/quality.js';

const views = [
  ['from 500 km, straight down', 5e5, -1],
  ['from 500 km, 45 degrees off', 5e5, -Math.SQRT1_2],
  ['from 10 km, 10 degrees down', 1e4, -Math.sin(Math.PI / 18)],
  ['from the runway, straight up', 3, 1],
  ['from the runway, 5 degrees down', 3, -Math.sin(Math.PI / 36)],
];

test('the spans cover the whole ray, in order', () => {
  for (const deep of [false, true]) {
    let sum = 0, last = -1;
    for (let i = 0; i < 10; i++) {
      const { t, ds } = viewSpan(i, 10, 100, 1000, deep);
      sum += ds;
      assert.ok(t > last && ds > 0);
      last = t;
    }
    assert.ok(Math.abs(sum - 1000) < 1e-9);
  }
});

test('every tier\'s samples find the air and the haze where they are', () => {
  for (const t of TIERS) {
    const n = SETTINGS[t].earth.viewSteps;
    for (const [name, alt, mu] of views) {
      const ref = opticalDepth(alt, mu, 0), got = opticalDepth(alt, mu, n);
      const r = got.rayleigh / ref.rayleigh, m = got.mie / ref.mie;
      assert.ok(Math.abs(r - 1) < (n >= 10 ? 0.05 : 0.07), `${t}, ${name}: Rayleigh ${r.toFixed(3)} of the reference`);
      assert.ok(Math.abs(m - 1) < (n >= 10 ? 0.15 : 0.3), `${t}, ${name}: Mie ${m.toFixed(3)} of the reference`);
    }
  }
});

test('packed near the eye, as they were, the samples from orbit missed the haze', () => {
  const ref = opticalDepth(5e5, -1, 0), old = opticalDepth(5e5, -1, 10, true);
  assert.ok(old.mie / ref.mie < 0.05, `${(old.mie / ref.mie).toFixed(3)} of it`);
});
