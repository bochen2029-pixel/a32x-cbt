// The nose camera and what the Jev experiment takes from it: the field of view across any frame's shape, its place
// ahead of the airframe's nose, the frames it may ask for (agreed with the jev-park session), and the landing
// runway's PAPI as seen from a point, two white on the glide path; and, since the radio altimeters can fail and read
// wrong, the world, the eye and the debrief's tags placed by the true height, never by RA 1's reading. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import A320 from '../data/a320.json' with { type: 'json' };
import { FlightLog } from '../src/events.js';
import { frameRefusal, NOSE_AHEAD_M, NOSE_HFOV_DEG, nosePoint, papiSeen, vfov } from '../src/nose.js';
import { eye, heightFt, origin } from '../src/scene-math.js';
import { validateAirframe } from '../src/world-data.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const FT = 0.3048, DEG = Math.PI / 180;

test('the nose camera is 60 degrees across any frame, and taller for a narrower one', () => {
  assert.ok(close(vfov(NOSE_HFOV_DEG, 1), 60));
  assert.ok(close(vfov(60, 768 / 432), 2 * Math.atan(Math.tan(30 * DEG) * 432 / 768) / DEG));   // about 36 degrees
  assert.ok(close(vfov(20, 1), 20), 'the close crop of the runway: 20 degrees on a square frame');
});

test("the nose camera sits ahead of the airframe's nose, on its centreline", () => {
  const A = validateAirframe(A320);
  const [x, y, z] = nosePoint(A.fuselage);
  const [x0, crown, keel] = A.fuselage[0];
  assert.ok(close(x, x0 - NOSE_AHEAD_M) && y === 0 && close(z, (crown + keel) / 2));
});

test("a frame is taken at the sizes Jev takes, and refused, with the reason, outside them", () => {
  const ok = { type: 'image/jpeg', quality: 0.85, hfovDeg: 60 };
  assert.equal(frameRefusal({ ...ok, width: 768, height: 432 }), '', 'the scene');
  assert.equal(frameRefusal({ ...ok, width: 512, height: 512, hfovDeg: 20 }), '', 'the runway, close');
  assert.equal(frameRefusal({ ...ok, width: 280, height: 280, type: 'image/png' }), '', 'the smallest: 78,400 pixels');
  assert.match(frameRefusal({ ...ok, width: 200, height: 512 }), /280 to 1568/);
  assert.match(frameRefusal({ ...ok, width: 1600, height: 400 }), /280 to 1568/);
  assert.match(frameRefusal({ ...ok, width: 512.5, height: 512 }), /whole pixels/);
  assert.match(frameRefusal({ ...ok, width: 280, height: 279 }), /280 to 1568/);
  assert.match(frameRefusal({ ...ok, type: 'image/webp', width: 512, height: 512 }), /jpeg or image\/png/);
  assert.match(frameRefusal({ ...ok, quality: 0, width: 512, height: 512 }), /quality/);
  assert.match(frameRefusal({ ...ok, hfovDeg: 170, width: 512, height: 512 }), /hfovDeg/);
});

test('the landing PAPI from the glide path shows two white, more when high, fewer when low; another end is not it', () => {
  // four units of two lamps, 300 m past the threshold, the inboard set highest, as the airport lays them out
  const angles = [3.5, 19 / 6, 17 / 6, 2.5], lamps = [];
  angles.forEach((angle, unit) => {
    for (const dx of [-0.6, 0.6]) lamps.push({ x: -(30 + unit * 9) + dx, y: 0.9, z: -300, angle, end: '17C', unit });
  });
  // the far end's PAPI, set lower, which a point on the approach to 17C would see all white
  for (let unit = 0; unit < 4; ++unit) lamps.push({ x: 40 + unit * 9, y: 0.9, z: -3600, angle: 0.5, end: '35C', unit });
  const from = (elevDeg, distM = 1852) => ({ x: -40, y: 0.9 + distM * Math.tan(elevDeg * DEG), z: -300 + distM });
  const seen = (e) => papiSeen(lamps, '17C', from(e));
  assert.equal(seen(3).white, 2, 'on the glide path: two white, two red');
  assert.equal(seen(3.3).white, 3, 'a little high');
  assert.equal(seen(3.8).white, 4, 'high');
  assert.equal(seen(2.7).white, 1, 'a little low');
  assert.equal(seen(2).white, 0, 'low');
  const on = seen(3);
  assert.deepEqual(on.lamps.map((l) => l.angleDeg), angles, 'inboard first');
  assert.deepEqual(on.lamps.map((l) => l.white), [false, false, true, true]);
  assert.ok(on.lamps.every((l) => Math.abs(l.elevationDeg - 3) < 0.05), 'the angle each is seen at');
  assert.deepEqual(papiSeen(lamps, '17L', from(3)), { white: 0, lamps: [] }, 'a runway end with no PAPI here');
});

test('the world is placed by the true height: a failed or biased radio altimeter moves only its own reading', () => {
  assert.equal(heightFt({ height_true_ft: 120, ra_ft: NaN }), 120, 'RA 1 failed');
  assert.equal(heightFt({ height_true_ft: 120, ra_ft: 170 }), 120, 'RA 1 reading 50 ft high');
  assert.equal(heightFt({ ra_ft: 85 }), 85, 'a core older than the true height: its ra_ft was the truth');
  const o = origin(32.9, -97.04);
  const s = { lat_deg: 32.9, lon_deg: -97.04, pitch_deg: 0, roll_deg: 0, heading_deg: 180, eye_fwd_m: 0, eye_right_m: 0,
    eye_up_m: 0, cg_height_m: 3, height_true_ft: 100 };
  for (const ra of [NaN, 150, 100]) assert.ok(close(eye(o, { ...s, ra_ft: ra }).y, 3 + 100 * FT, 1e-9), `the eye with RA 1 at ${ra}`);
  const log = new FlightLog();
  log.add(1, 'gate', '100 ft', { lat_deg: 32.9, lon_deg: -97.04, ra_ft: NaN, height_true_ft: 100 });
  assert.equal(log.events[0].raFt, 100, "the debrief's tag where the aircraft was");
});
