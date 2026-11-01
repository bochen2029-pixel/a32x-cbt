// The view's geometry: where the start is, where the eye goes, what the PAPI shows. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eye, localMetres, origin, papiBox, papiWhite, RUNWAY } from '../src/scene-math.js';

const START = origin(47.19, 8.0);

test('a minute of latitude is a nautical mile, near enough; longitude shrinks with the cosine', () => {
  const north = localMetres(START, START.lat + 1 / 60, START.lon).north;
  assert.ok(Math.abs(north - 1853) < 3, `${north.toFixed(1)} m`);
  const east = localMetres(START, START.lat, START.lon + 1 / 60).east;
  assert.ok(Math.abs(east - 1852 * Math.cos(START.lat * Math.PI / 180)) < 10, `${east.toFixed(1)} m`);
});

test('standing at the start the eye is 5.5 m up, on the centreline, ahead of the threshold', () => {
  const e = eye(START, START.lat, START.lon, 0, 0, 360);
  assert.ok(Math.abs(e.y - 5.5) < 1e-9);
  assert.ok(Math.abs(e.x) < 1e-6, 'on the centreline');
  assert.ok(e.z < RUNWAY.thresholdZ, 'past the threshold, looking down the runway');
});

test('the PAPI shows two white and two red on a three degree path, all red low, all white high', () => {
  const b = papiBox(1);
  const at = (deg) => {
    const d = 2000;
    return { x: b.x, y: b.y + d * Math.tan(deg * Math.PI / 180), z: b.z + d };
  };
  assert.deepEqual(papiWhite(at(3.0)), [false, false, true, true], 'on the path: red inside, white outside');
  assert.deepEqual(papiWhite(at(2.2)), [false, false, false, false], 'low: all red');
  assert.deepEqual(papiWhite(at(3.8)), [true, true, true, true], 'high: all white');
});
