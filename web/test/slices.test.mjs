// How the near things share the depth buffer: a rib 10 m off a wall must keep its place at 25 km and at
// 5 km, and the craft and the Ring share a slice only when they are among each other. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUB_PORT_M } from '../src/core.js';
import { RING } from '../src/ring-plan.js';
import { depthSlices, depthStep, ringDepth } from '../src/slices.js';

const FAR = 3.6e5;

test('the old single pass could not tell a rib from its wall at 25 km', () => {
  assert.ok(depthStep(25000, 0.5, FAR) > 50, `${depthStep(25000, 0.5, FAR).toFixed(0)} m a step`);
});

test('25 km out on the axis, the craft 70 m away: the Ring in a slice of its own, first', () => {
  const ring = ringDepth(-25000, 0, 25000), craft = { min: 40, max: 100 };
  assert.ok(ring.min > 24000 && ring.min < 25000, `nearest ${ring.min.toFixed(0)} m`);
  const s = depthSlices(ring, craft, { base: 0.5, far: FAR });
  assert.deepEqual(s.map((x) => x.scene), ['ring', 'near']);
  assert.ok(depthStep(25000, s[0].near, s[0].far) < 0.1, 'a rib keeps its place');
  assert.equal(s[1].near, 0.5, 'and the near pass is as it was');
});

test('holding 300 m off the port: the craft wholly nearer than the Ring, so still two slices', () => {
  const ring = ringDepth(-HUB_PORT_M - 370, 0, HUB_PORT_M + 370), craft = { min: 40, max: 100 };
  assert.ok(ring.min < 400, `the port ${ring.min.toFixed(0)} m away`);
  assert.deepEqual(depthSlices(ring, craft, { base: 0.5, far: FAR }).map((x) => x.scene), ['ring', 'near']);
});

test('docked, the craft among the Ring: one slice, its near plane pushed out', () => {
  const ring = ringDepth(-HUB_PORT_M - 90, 0, HUB_PORT_M + 90), craft = { min: 40, max: 100 };
  assert.ok(ring.min < 100, `the port ${ring.min.toFixed(0)} m away`);
  const s = depthSlices(ring, craft, { base: 0.5, far: FAR });
  assert.equal(s.length, 1);
  assert.equal(s[0].scene, 'both');
  assert.ok(s[0].near >= 15, `near plane ${s[0].near} m`);
  assert.ok(depthStep(RING.floor, s[0].near, s[0].far) < 1, 'the floor 5 km off is still told from the roof 300 m over it');
});

test('from the Ring, the craft beyond it: the craft first, then the Ring', () => {
  const ring = ringDepth(-HUB_PORT_M - 120, 0, HUB_PORT_M + 120), craft = { min: 24970, max: 25030 };
  const s = depthSlices(ring, craft, { base: 0.5, far: FAR });
  assert.deepEqual(s.map((x) => x.scene), ['near', 'ring']);
  assert.ok(s[0].near > 20000, 'the craft drawn in a slice round it');
});

test('without the Ring near, the near pass is as it always was', () => {
  assert.deepEqual(depthSlices(null, { min: 40, max: 100 }, { base: 0.2, far: FAR }), [{ scene: 'near', near: 0.2, far: FAR }]);
  const alone = depthSlices(ringDepth(0, 2000, 2000), null, { base: 0.5, far: FAR });
  assert.equal(alone[0].scene, 'ring');
  assert.ok(alone[0].near >= 0.5);
});

test('inside the band the Ring is as near as can be', () => {
  assert.equal(ringDepth(0, (RING.floor + RING.roof) / 2, RING.floor).min, 0);
  assert.equal(ringDepth(0, 0, 0).min, 0, 'on the axis, at the hub');
});
