// Textures painted by code: they tile, a flat surface's normal points straight out, a step's normal
// leans away from it, and the mask's channels are where three.js reads them. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Paint, rng } from '../src/paint.js';

test('a rectangle off one edge comes back on the other', () => {
  const p = new Paint(8, 8, { base: [0, 0, 0] });
  p.rect(6, 6, 10, 10, { albedo: [1, 1, 1] });
  const at = (x, y) => p.albedo[(y * 8 + x) * 3];
  assert.equal(at(7, 7), 1);
  assert.equal(at(0, 0), 1, 'wrapped round both edges');
  assert.equal(at(1, 1), 1);
  assert.equal(at(2, 2), 0);
});

test('a flat height is a normal straight out; a step leans away from the high side', () => {
  const p = new Paint(16, 16);
  const flat = p.normalBytes(2);
  assert.deepEqual([...flat.slice(0, 4)], [128, 128, 255, 255]);
  p.rect(8, 0, 16, 16, { height: 1 });
  const n = p.normalBytes(2), i = (4 * 16 + 7) * 4;   // just left of the step up
  assert.ok(n[i] < 128, 'x leans toward the low side');
  assert.equal(n[i + 1], 128);
});

test('the mask: glow in red, roughness in green, metalness in blue, as three.js reads them', () => {
  const p = new Paint(2, 1, { rough: 0.5, metal: 1 });
  p.rect(0, 0, 1, 1, { glow: 1 });
  const m = p.maskBytes();
  assert.deepEqual([...m.slice(0, 4)], [255, 128, 255, 255]);
  assert.deepEqual([...m.slice(4, 8)], [0, 128, 255, 255]);
  const a = p.albedoBytes(true);
  assert.equal(a[3], 255, 'and the glow in the albedo\'s alpha where asked');
  assert.equal(a[7], 0);
});

test('the same seed paints the same', () => {
  const a = rng(3), b = rng(3);
  for (let k = 0; k < 10; k++) assert.equal(a(), b());
});
