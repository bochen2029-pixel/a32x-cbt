// The frames the page draws in, stated as geometry. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RE, WE, bodyAxes, cross, dot, heightOf, inSight, inertialToEcef, latLonOf, length, siteAxes, three, threeToEcef,
} from '../src/frames.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`);

test('three.js draws east as x, up as y and north as -z', () => {
  assert.deepEqual(three([1, 2, 3]), [1, 3, -2]);
});

test('a body attitude gives three orthonormal axes, forward x right = down', () => {
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let k = 0; k < 50; k++) {
    const q = [r(), r(), r(), r()], n = Math.hypot(...q);
    const { fwd, right, down } = bodyAxes(q.map((v) => v / n));
    for (const v of [fwd, right, down]) near(length(v), 1, 1e-12, 'unit');
    near(dot(fwd, right), 0, 1e-12, 'fwd.right');
    const c = cross(fwd, right);
    for (let i = 0; i < 3; i++) near(c[i], down[i], 1e-12, 'fwd x right');
  }
});

test('the site frame is east, north and up, right-handed, at the place named', () => {
  const { east, north, up } = siteAxes(0, 0);
  const r = (v) => v.map((x) => Math.round(x) + 0);
  assert.deepEqual(r(up), [1, 0, 0]);
  assert.deepEqual(r(east), [0, 1, 0]);
  assert.deepEqual(r(north), [0, 0, 1]);
  const m = threeToEcef(32.9, -97);
  const s = siteAxes(32.9, -97);
  for (let i = 0; i < 3; i++) { near(m.x[i], s.east[i], 1e-15, 'x is east'); near(m.y[i], s.up[i], 1e-15, 'y is up'); near(m.z[i], -s.north[i], 1e-15, 'z is south'); }
});

test('a point 1 degree of arc north of the start is 1 degree further north', () => {
  const [lat, lon] = latLonOf([0, 0, 0], 32.9, -97);
  near(lat, 32.9, 1e-9, 'start lat');
  near(lon, -97, 1e-9, 'start lon');
  const arc = (Math.PI / 180) * RE;
  const [lat2] = latLonOf([0, RE * Math.sin(Math.PI / 180), RE * Math.cos(Math.PI / 180) - RE], 32.9, -97);
  near(lat2, 33.9, 1e-9, `${arc.toFixed(0)} m north`);
  near(heightOf([0, 0, 500000]), 500000, 1e-6, 'height above the start');
});

test('the Earth hides what is over the horizon and nothing else', () => {
  const ground = (m) => [RE * Math.sin(m / RE), 0, RE * Math.cos(m / RE) - RE];   // on the sphere, m east along it
  assert.equal(inSight([0, 0, 2], ground(3000)), true, 'across the field');
  assert.equal(inSight([0, 0, 2], ground(60000)), false, '60 km away on the ground, from 2 m up');
  assert.equal(inSight([0, 0, 10000], ground(60000)), true, 'the same from 10 km up');
  assert.equal(inSight([0, 0, 500000], [1500000, 0, 0]), true, 'from orbit, 1,500 km away');
  assert.equal(inSight([0, 0, 500000], [0, 0, -2 * RE]), false, 'the other side of the Earth');
});

test('the stars come back to their places after a sidereal day', () => {
  const day = (2 * Math.PI) / WE;
  const v = inertialToEcef([0.6, 0.8, 0], day);
  near(v[0], 0.6, 1e-9, 'x');
  near(v[1], 0.8, 1e-9, 'y');
  near(day / 3600, 23.934, 1e-3, 'hours in a sidereal day');
});
