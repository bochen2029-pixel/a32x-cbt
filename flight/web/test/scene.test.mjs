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

// The A320's eye and CG as the flight core reports them (ils_test prints them): the left seat.
const A320 = { eye_fwd_m: 14.23, eye_right_m: -0.51, eye_up_m: 2.16, cg_height_m: 2.53 };

function standing(pastM, more = {}) {
  const h = kdfw.headingDeg * DEG;
  const lat = kdfw.lat + (pastM * Math.cos(h)) / at.mPerDegLat, lon = kdfw.lon + (pastM * Math.sin(h)) / at.mPerDegLon;
  return { lat_deg: lat, lon_deg: lon, ra_ft: 0, pitch_deg: 0, roll_deg: 0, heading_deg: kdfw.headingDeg, ...A320, ...more };
}
function alongAcross(e) {  // from 17C's threshold, along the runway and right of its centreline
  const h = kdfw.headingDeg * DEG;
  return { along: e.x * Math.sin(h) - e.z * Math.cos(h), across: e.x * Math.cos(h) + e.z * Math.sin(h) };
}

test('standing 150 m past the threshold of 17C, the eye is in the left seat: up, ahead and left of the CG', () => {
  const e = eye(at, standing(150));
  assert.ok(Math.abs(e.y - (2.53 + 2.16)) < 1e-9, `the CG on the gear and the eye above it: ${e.y.toFixed(3)} m`);
  const { along, across } = alongAcross(e);
  assert.ok(Math.abs(along - 164.23) < 1e-6, `150 m past the threshold and 14.23 m more to the eye: ${along.toFixed(3)} m`);
  assert.ok(Math.abs(across + 0.51) < 1e-6, `0.51 m left of the centreline: ${across.toFixed(3)} m`);
});

test('the eye moves with the attitude: up with the nose, down on its side in a bank that way', () => {
  const level = eye(at, standing(0, { ra_ft: 1000 }));
  const noseUp = eye(at, standing(0, { ra_ft: 1000, pitch_deg: 10 }));
  assert.ok(Math.abs(noseUp.y - level.y - (14.23 * Math.sin(10 * DEG) + 2.16 * (Math.cos(10 * DEG) - 1))) < 1e-9,
            'ten degrees nose up lifts the eye by the lever arm');
  const leftDown = eye(at, standing(0, { ra_ft: 1000, roll_deg: -30 }));
  const rightDown = eye(at, standing(0, { ra_ft: 1000, roll_deg: 30 }));
  assert.ok(leftDown.y < rightDown.y, 'the left seat sits lower banked left than banked right');
  const acrossL = alongAcross(leftDown).across, acrossR = alongAcross(rightDown).across;
  assert.ok(acrossL < -0.51 - 1 && acrossR > 0.5, `banked, the head swings toward the low wing: ${acrossL.toFixed(2)}, ${acrossR.toFixed(2)} m`);
});
