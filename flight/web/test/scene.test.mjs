// The view's geometry: the origin at the landing threshold, the runway's frame turned to its heading, the
// eye, and what the PAPI shows. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eye, localMetres, origin, papiBoxes, papiWhite, runwayFromState, toWorld } from '../src/scene-math.js';

const DEG = Math.PI / 180;

// LSZH 14's landing threshold and runway, as the flight core reports them (rwy_ state slots).
const lszh = runwayFromState({
  rwy_lat_deg: 47.482085, rwy_lon_deg: 8.536049, rwy_heading_deg: 137, rwy_length_m: 3150, rwy_width_m: 60,
  rwy_displaced_m: 150,
});
const at = origin(lszh.lat, lszh.lon);

test('a minute of latitude is a nautical mile, near enough; longitude shrinks with the cosine', () => {
  const north = localMetres(at, at.lat + 1 / 60, at.lon).north;
  assert.ok(Math.abs(north - 1853) < 3, `${north.toFixed(1)} m`);
  const east = localMetres(at, at.lat, at.lon + 1 / 60).east;
  assert.ok(Math.abs(east - 1852 * Math.cos(at.lat * DEG)) < 10, `${east.toFixed(1)} m`);
});

test('the runway frame turns with the heading: 1 km before LSZH 14 is up the approach, to the northwest', () => {
  const p = toWorld(lszh, 0, 1000);
  assert.ok(Math.abs(p.x + 1000 * Math.sin(137 * DEG)) < 1e-9 && Math.abs(-p.z + 1000 * Math.cos(137 * DEG)) < 1e-9);
  assert.ok(p.x < 0 && p.z < 0, 'west and north of the threshold');
  const right = toWorld(lszh, 100, 0);
  assert.ok(right.x < 0 && right.z > 0, 'right of a runway heading 137 is toward 227: southwest');
});

test('standing 150 m past the default runway threshold, the eye is 5.5 m up on the centreline', () => {
  const start = runwayFromState({ rwy_lat_deg: 47.19, rwy_lon_deg: 8, rwy_heading_deg: 360, rwy_length_m: 3000,
                                  rwy_width_m: 45, rwy_displaced_m: 0 });
  const o = origin(start.lat, start.lon);
  const e = eye(o, start.lat + 150 / o.mPerDegLat, start.lon, 0, 0, 360);
  assert.ok(Math.abs(e.y - 5.5) < 1e-9);
  assert.ok(Math.abs(e.x) < 1e-6, 'on the centreline');
  assert.ok(Math.abs(e.z + 164) < 1e-6, '150 m past the threshold and 14 m more to the eye, north');
});

test('the PAPI sits where the glide meets the runway, left of it, and reads the glide', () => {
  const boxes = papiBoxes(lszh);
  const past = 50 * 0.3048 / Math.tan(3 * DEG);
  const inner = toWorld(lszh, -(30 + 15), -past);
  assert.ok(Math.abs(boxes[0].x - inner.x) < 1e-9 && Math.abs(boxes[0].z - inner.z) < 1e-9);
  // an eye 2 km up the approach on the centreline, at an angle from the second box
  const b = boxes[1];
  const ground = toWorld(lszh, 0, 2000);
  const along = Math.hypot(ground.x - b.x, ground.z - b.z);
  const eyeAt = (deg) => ({ x: ground.x, z: ground.z, y: b.y + along * Math.tan(deg * DEG) });
  assert.deepEqual(papiWhite(eyeAt(3.0), boxes), [false, false, true, true], 'on the glide: red inside, white outside');
  assert.deepEqual(papiWhite(eyeAt(2.2), boxes), [false, false, false, false], 'low: all red');
  assert.deepEqual(papiWhite(eyeAt(3.8), boxes), [true, true, true, true], 'high: all white');
});
