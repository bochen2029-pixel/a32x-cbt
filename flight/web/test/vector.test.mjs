// The debrief's aircraft in vectors has a fuselage: lines along it and frames across it that lie on the painted
// fuselage's own surface, from nose to tail, the same on both sides. A smooth body gives an edge finder no lines, so
// without them the debrief's aircraft was wings, tail, engines and gear with nothing joining them. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import A320 from '../data/a320.json' with { type: 'json' };
import { FRAME_SIDES, FUSELAGE_FRAMES, FUSELAGE_LINES, fuselageLines, profile } from '../src/airliner.js';
import { validateAirframe } from '../src/world-data.js';

const A = validateAirframe(A320);   // the airframe as the view has it
const points = (g) => {
  const p = g.attributes.position.array, out = [];
  for (let k = 0; k < p.length; k += 3) out.push([p[k], p[k + 1], p[k + 2]]);
  return out;
};

test("the fuselage's lines lie on the painted fuselage, from its nose to its tail", () => {
  const g = fuselageLines(A.fuselage, A.length), prof = profile(A.fuselage), pts = points(g);
  for (const [x, y, z] of pts) {
    const p = prof(x);
    if (p.hw < 0.05) continue;   // the nose's point, where the section is nothing
    const r = (y / p.hw) ** 2 + ((z - p.waist) / p.hz) ** 2;
    assert.ok(Math.abs(r - 1) < 1e-4, `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) is off the surface: ${r}`);
  }
  const xs = pts.map(([x]) => x);
  assert.ok(Math.min(...xs) < 1e-6 && Math.abs(Math.max(...xs) - A.length) < 1e-3, 'nose to tail');
  // eight lines along it, of 64 segments each, and six frames of 32
  assert.equal(pts.length / 2, FUSELAGE_LINES * 64 + FUSELAGE_FRAMES.length * FRAME_SIDES);
  for (const f of FUSELAGE_FRAMES) {
    const at = pts.filter(([x]) => Math.abs(x - f * A.length) < 1e-4);
    assert.ok(at.length >= 2 * FRAME_SIDES, `a frame at ${(f * 100).toFixed(0)} % of the length`);
  }
});

test('the same on both sides', () => {
  // to a millimetre, a negative zero the same as zero
  const key = (p) => p.map((v) => Math.round(v * 1000) + 0).join(',');
  const pts = points(fuselageLines(A.fuselage, A.length));
  const seen = new Set(pts.map(key));
  for (const [x, y, z] of pts) assert.ok(seen.has(key([x, y === 0 ? 0 : -y, z])), `no mirror of (${x}, ${y}, ${z})`);
});
