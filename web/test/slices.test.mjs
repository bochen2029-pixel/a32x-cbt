// How the near things share the depth buffer: a rib 10 m off a wall must keep its place at 25 km and at
// 5 km, and the craft and the Ring share a slice only when they are among each other. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUB_PORT_M } from '../src/core.js';
import { RING } from '../src/ring-plan.js';
import { PORT } from '../src/ring-plan.js';
import { cornerCos, depthSlices, depthStep, ringDepth } from '../src/slices.js';

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
  const s = depthSlices(ring, craft, { base: 0.5, far: FAR, cosEdge: cornerCos(60, 16 / 9) });
  assert.deepEqual(s.map((x) => x.scene), ['near', 'ring']);
  assert.ok(s[0].near > 10000 && depthStep(25000, s[0].near, s[0].far) < 0.2, `the craft drawn in a slice round it, from ${s[0].near.toFixed(0)} m`);
});

test('without the Ring near, the near pass is as it always was', () => {
  assert.deepEqual(depthSlices(null, { min: 40, max: 100 }, { base: 0.2, far: FAR }), [{ scene: 'near', near: 0.2, far: FAR }]);
  const alone = depthSlices(ringDepth(0, 2000, 2000), null, { base: 0.5, far: FAR });
  assert.equal(alone[0].scene, 'ring');
  assert.ok(alone[0].near >= 0.5);
});

test('a near plane cuts by depth along the view, so no part of the Ring in view is nearer than it: docking 235 m off the port', () => {
  // the camera 70 m behind the craft, 305 m in front of the port on the axis, looking 40 degrees off it
  const fov = 60, aspect = 16 / 9, cosEdge = cornerCos(fov, aspect);
  const ring = ringDepth(-HUB_PORT_M - 305, 0, HUB_PORT_M + 305), craft = { min: 40, max: 100 };
  const s = depthSlices(ring, craft, { base: 0.5, far: FAR, cosEdge });
  const near = s.find((x) => x.scene !== 'near' || s.length === 1).near;
  const look = [Math.sin((40 * Math.PI) / 180), Math.cos((40 * Math.PI) / 180)];   // (r, y): toward the face, 40 degrees out
  const tanV = Math.tan((fov * Math.PI) / 360), tanH = tanV * aspect;
  let worst = Infinity, seen = 0;
  // the hub's face (y = -HUB_PORT_M, r 0 to the hub's radius) and the port's ring (proud by its tube), in the
  // plane of the look; a point is in view when inside the frustum's horizontal half-angle
  for (let r = -RING.hull; r <= RING.hull; r += 2) {
    for (const [y, rr] of [[-HUB_PORT_M, r], [-HUB_PORT_M - PORT.tube, Math.sign(r) * PORT.torus]]) {
      if (Math.abs(rr) > 160 && y !== -HUB_PORT_M) continue;
      const d = [rr, y + HUB_PORT_M + 305];   // from the camera
      const z = d[0] * look[0] + d[1] * look[1], x = d[0] * look[1] - d[1] * look[0];
      if (z <= 0 || Math.abs(x) > z * tanH) continue;
      seen++;
      worst = Math.min(worst, z);
    }
  }
  assert.ok(seen > 50, `${seen} points in view`);
  assert.ok(near < worst, `near plane ${near.toFixed(1)} m, the nearest depth in view ${worst.toFixed(1)} m`);
  // and the old rule, near at 0.9 of the nearest distance, cut it
  assert.ok(ring.min * 0.9 > worst, `the old near plane, ${(ring.min * 0.9).toFixed(1)} m, was past it`);
});

test('the corner of a 60 degree view at 16:9 is 49.7 degrees off its centre', () => {
  assert.ok(Math.abs(Math.acos(cornerCos(60, 16 / 9)) * 180 / Math.PI - 49.7) < 0.1);
  assert.equal(cornerCos(0, 1), 1);
});

test('inside the band the Ring is as near as can be', () => {
  assert.equal(ringDepth(0, (RING.floor + RING.roof) / 2, RING.floor).min, 0);
  assert.equal(ringDepth(0, 0, 0).min, 0, 'on the axis, at the hub');
});
