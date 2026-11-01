// The view's geometry: the origin at the landing threshold, and the eye. The runway's frame and the
// PAPI are the airport's (airport.test.mjs). GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eye, localMetres, origin, runwayFromState } from '../src/scene-math.js';

const DEG = Math.PI / 180;

// KDFW 17C's landing threshold, as the flight core reports it (rwy_ state slots).
const kdfw = runwayFromState({
  rwy_lat_deg: 32.91569901, rwy_lon_deg: -97.02600098, rwy_heading_deg: 180.3, rwy_length_m: 4084.32, rwy_width_m: 45.72,
  rwy_displaced_m: 0,
});
const at = origin(kdfw.lat, kdfw.lon);

test('a minute of latitude is a nautical mile, near enough; longitude shrinks with the cosine', () => {
  const north = localMetres(at, at.lat + 1 / 60, at.lon).north;
  assert.ok(Math.abs(north - 1848) < 3, `${north.toFixed(1)} m`);
  const east = localMetres(at, at.lat, at.lon + 1 / 60).east;
  assert.ok(Math.abs(east - 1852 * Math.cos(at.lat * DEG)) < 10, `${east.toFixed(1)} m`);
});

test('standing 150 m past the threshold of 17C, the eye is 5.5 m up on the centreline, looking south', () => {
  const h = kdfw.headingDeg * DEG;
  const lat = kdfw.lat + (150 * Math.cos(h)) / at.mPerDegLat, lon = kdfw.lon + (150 * Math.sin(h)) / at.mPerDegLon;
  const e = eye(at, lat, lon, 0, 0, kdfw.headingDeg);
  assert.ok(Math.abs(e.y - 5.5) < 1e-9);
  const along = e.x * Math.sin(h) - e.z * Math.cos(h), across = e.x * Math.cos(h) + e.z * Math.sin(h);
  assert.ok(Math.abs(along - 164) < 1e-6, `150 m past the threshold and 14 m more to the eye: ${along.toFixed(3)} m`);
  assert.ok(Math.abs(across) < 1e-6, 'on the centreline');
});
