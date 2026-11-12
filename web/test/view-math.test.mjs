// The view's own reckoning: the chase eye never under the ground; above the air, the velocity marker
// shows the velocity in space, as the PROGRADE hold flies it. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START } from '../src/core.js';
import { heightOf, length } from '../src/frames.js';
import { inertialVelocity, keepAbove } from '../src/view-math.js';

test('the chase eye, swung under the runway, is lifted to stand above it', () => {
  const up = [0, 0, 1];
  const under = [-60, 10, -4.1];
  assert.ok(heightOf(under) < 0);
  assert.ok(Math.abs(heightOf(keepAbove(under, up)) - 1.5) < 1e-3, 'a metre and a half up');
  const over = [-60, 10, 14];
  assert.deepEqual(keepAbove(over, up), over, 'and one above it is left where it is');
});

test('at rest on the runway the velocity in space is the Earth\'s turn there', () => {
  const v = inertialVelocity([0, 0, 0], [0, 0, 0], START.lat);
  assert.ok(Math.abs(length(v) - 390.4) < 1, `${length(v).toFixed(1)} m/s, as the readouts' ORB has it`);
  assert.ok(v[0] > 389 && Math.abs(v[1]) < 1e-9 && Math.abs(v[2]) < 1e-9, 'due east');
});

test('in orbit, the turn of the air adds its few hundred metres a second, as ORB less SPD says', () => {
  // the crew's orbit at 775 s: 7,197 m/s through the air, eastward over 30 N, 500 km up; ORB 7,617 m/s
  const P = [1.9e6, -3e5, 2.9e5], vAir = [7197, 0, 0];
  const v = inertialVelocity(vAir, P, START.lat);
  assert.ok(Math.abs(length(v) - 7617) < 80, `${length(v).toFixed(0)} m/s`);
});
