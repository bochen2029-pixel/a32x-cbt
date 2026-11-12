// The map's arithmetic, stated as orbits behave: a round orbit stays round with Kepler's period, the core's
// own apoapsis and periapsis come out of its state, a ground track tops out at the inclination, and a craft
// keeping station with the Ring stays put in the frame that turns with it. The core is the WebAssembly
// build's (flight/orbit/README.md); ORBIT_CORE names another. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Core, PH, START } from '../src/core.js';
import { RE, WE, cross, dot, length, scale, sub, unit } from '../src/frames.js';
import {
  MU, closest, conicPoint, ecefToEci, elements, groundTrack, hillAxes, kepler, phaseAhead, relativePath, ringState, rotateAbout, siteFrame,
  splitTrack, subPoint, toHill,
} from '../src/map-math.js';

const here = dirname(fileURLToPath(import.meta.url));
const built = resolve(process.env.ORBIT_CORE || join(here, '..', '..', 'build-wasm', 'orbit_core.js'));
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} is not ${b} within ${tol}`);
const D2R = Math.PI / 180;

// a round orbit at the Ring's height, inclined as the crew's
function round(h = 500000, incDeg = 32.84, phase = 0) {
  const R = RE + h, i = incDeg * D2R, v = Math.sqrt(MU / R);
  const r = [R * Math.cos(phase), R * Math.sin(phase) * Math.cos(i), R * Math.sin(phase) * Math.sin(i)];
  const vv = [-v * Math.sin(phase), v * Math.cos(phase) * Math.cos(i), v * Math.cos(phase) * Math.sin(i)];
  return { r, v: vv, R };
}

test('a round orbit stays round, and comes back after Kepler\'s period', () => {
  const { r, v, R } = round();
  const el = elements(r, v);
  near(el.e, 0, 1e-12, 'eccentricity');
  near(el.a, R, 1e-3, 'semi-major axis');
  near(el.inc, 32.84, 1e-9, 'inclination');
  const T = 2 * Math.PI * Math.sqrt((R * R * R) / MU);
  near(el.period, T, 1e-6, 'period');
  near(T, 5669, 1, 'a 500 km orbit\'s period (the README\'s one revolution)');
  for (let k = 1; k <= 12; k++) {
    const [rk, vk] = kepler(r, v, (k * T) / 12);
    near(length(rk), R, 1e-3, `radius after ${k} twelfths`);
    near(length(vk), Math.sqrt(MU / R), 1e-6, 'speed');
  }
  const [back] = kepler(r, v, T);
  near(length(sub(back, r)), 0, 1e-3, 'after one period');
  const [half] = kepler(r, v, T / 2);
  near(length(sub(half, scale(r, -1))), 0, 1e-3, 'opposite at half');
});

test('Kepler both ways: forward then back is where it began, on an ellipse and on a hyperbola', () => {
  const { r } = round();
  for (const speed of [7000, 7800, 9000, 11500]) {          // suborbital, elliptic, elliptic, escaping
    const v = scale(unit(cross([0, 0, 1], r)), speed);
    const el = elements(r, v);
    assert.equal(el.e < 1, speed < Math.sqrt((2 * MU) / length(r)), `the conic at ${speed} m/s`);
    const [r1, v1] = kepler(r, v, 2000);
    const [r2] = kepler(r1, v1, -2000);
    near(length(sub(r2, r)), 0, 1e-2 * (speed > 11000 ? 10 : 1), `round trip at ${speed} m/s`);
    near(dot(v1, v1) / 2 - MU / length(r1), el.energy, 1e-6 * Math.abs(el.energy), 'energy kept');
    near(length(cross(r1, v1)), el.h, 1e-8 * el.h, 'angular momentum kept');
  }
});

test('an ellipse\'s points lie at the radius its conic gives, apoapsis farthest', () => {
  const { r } = round();
  const v = scale(unit(cross([0, 0, 1], r)), 7900);
  const el = elements(r, v);
  near(length(conicPoint(el, 0)), el.rp, 1e-6, 'periapsis');
  near(length(conicPoint(el, Math.PI)), el.ra, 1e-6, 'apoapsis');
  near(length(conicPoint(el, el.nu)), length(r), 1e-3, 'the craft is on it');
  const [atApo] = kepler(r, v, el.tApo);
  near(length(atApo), el.ra, 1, 'the time to apoapsis');
  const hyper = elements(r, scale(v, 1.5));
  assert.ok(hyper.e > 1 && hyper.ra === Infinity && conicPoint(hyper, Math.PI) === null, 'a hyperbola has no far side');
});

test('a ground track at 32.8 degrees tops out at 32.8 degrees of latitude, and drifts west by the Earth\'s turn', () => {
  const { r, v } = round(500000, 32.84, -0.3);              // a little before the ascending node
  const T = elements(r, v).period;
  const track = groundTrack(r, v, 0, 2.2 * T, 5);
  const top = Math.max(...track.map((p) => p[0])), bottom = Math.min(...track.map((p) => p[0]));
  near(top, 32.84, 0.01, 'northernmost');
  near(bottom, -32.84, 0.01, 'southernmost');
  // ascending crossings of the equator, a revolution apart: west by WE x T
  const crossings = [];
  for (let k = 1; k < track.length; k++) {
    if (track[k - 1][0] < 0 && track[k][0] >= 0) {
      const f = -track[k - 1][0] / (track[k][0] - track[k - 1][0]);
      crossings.push(track[k - 1][1] + f * (((track[k][1] - track[k - 1][1] + 540) % 360) - 180));
    }
  }
  assert.ok(crossings.length >= 2, `${crossings.length} crossings`);
  const shift = ((crossings[1] - crossings[0] + 540) % 360) - 180;
  near(shift, (-WE * T) / D2R, 0.05, 'westward per revolution');
  for (const run of splitTrack(track)) for (let k = 1; k < run.length; k++) assert.ok(Math.abs(run[k][1] - run[k - 1][1]) < 180, 'no run crosses the 180th meridian');
  assert.ok(splitTrack(track).length >= 2, 'it does cross it');
});

test('a craft keeping station with the Ring stays put in the frame that turns with it; one below drifts ahead as Clohessy and Wiltshire say', () => {
  const ringPhase = 25000 / (RE + 500000);
  const R = round(500000, 32.84, ringPhase), craft = round(500000, 32.84, 0);
  const ring = { r: R.r, nHat: unit(cross(R.r, R.v)), n: Math.sqrt(MU / R.R ** 3) };
  const path = relativePath(craft.r, craft.v, ring, 3000, 100);
  for (const [ahead, up, across] of path) {
    near(ahead, path[0][0], 1e-3, 'ahead'); near(up, path[0][1], 1e-3, 'up'); near(across, 0, 1e-6, 'across');
  }
  near(path[0][0], -(RE + 500000) * Math.sin(ringPhase), 1e-3, '25 km behind');
  near(phaseAhead(craft.r, ring), ringPhase / D2R, 1e-9, 'the Ring ahead');
  // 1 km below, round: ahead at 3/2 n dh
  const low = round(499000, 32.84, ringPhase);
  const lowPath = relativePath(low.r, low.v, ring, 600, 600);
  near(lowPath[1][0] - lowPath[0][0], 1.5 * ring.n * 1000 * 600, 0.02 * 1.5 * ring.n * 1000 * 600, 'drift in 600 s');
  near(lowPath[0][1], -1000, 1e-3, '1 km below');
  const pass = closest(relativePath(round(500000, 32.84, ringPhase - 0.001).r, round(500000, 32.84, ringPhase - 0.001).v, ring, 100, 10));
  assert.ok(pass.range > 0 && Number.isFinite(pass.dt), 'closest of a still path');
  const a = hillAxes(R.r, ring.nHat);
  toHill(scale(a.ahead, 7), a).forEach((x, k) => near(x, [7, 0, 0][k], 1e-9, 'a point ahead'));
  near(length(rotateAbout([1, 0, 0], [0, 0, 1], Math.PI / 2).map((x, k) => x - [0, 1, 0][k])), 0, 1e-12, 'a quarter turn');
});

test('the ground under the start point is the start point, and a parked craft has no track ahead', () => {
  const frame = siteFrame(START.lat, START.lon);
  for (const t of [0, 1000, 43000]) {
    const [lat, lon] = subPoint(ecefToEci(frame.point([0, 0, 0]), t), t);
    near(lat, START.lat, 1e-9, 'latitude'); near(lon, START.lon, 1e-9, 'longitude');
  }
  const r = ecefToEci(frame.point([0, 0, 0]), 0), v = cross([0, 0, WE], r);
  assert.ok(groundTrack(r, v, 0, 600, 30).length <= 1, 'it is already on the ground');
});

test('from the core: its apoapsis, periapsis, inclination and time to apoapsis come out of its own state; the Ring\'s orbit is found from its readouts',
  { skip: !existsSync(built) && `no module at ${built}: build it first` }, async () => {
    const make = createRequire(import.meta.url)(built);
    const core = new Core(await make());
    const m = core.m, ptr = m._malloc(48), frame = siteFrame(START.lat, START.lon);
    const state = () => { m._oc_eci(ptr, ptr + 24); const h = m.HEAPF64, p = ptr / 8; return [[h[p], h[p + 1], h[p + 2]], [h[p + 3], h[p + 4], h[p + 5]]]; };
    let s = core.reset();
    const checks = [];
    for (const at of [300, 500, 700]) {                       // on the way up, the path still meets the ground; then in orbit
      while (s.t < at) s = core.step(250);
      checks.push(at);
      const [r, v] = state(), el = elements(r, v);
      near(el.ra - RE, s.apo, 1, `apoapsis at ${s.t.toFixed(0)} s`);
      if (s.peri > -RE) near(el.rp - RE, s.peri, 1, `periapsis at ${s.t.toFixed(0)} s`);
      near(el.inc, s.inc, 1e-6, 'inclination');
      if (s.apo - s.peri > 1000) near(el.tApo, s.tApo, 0.5, 'time to apoapsis');
      near(Math.hypot(...v), s.vorb, 1e-6, 'speed');
      const [lat, lon] = subPoint(r, s.t);
      near(lat, s.lat, 1e-9, 'latitude'); near(lon, s.lon, 1e-9, 'longitude');
    }
    while (s.phase !== PH.orbit && s.t < 1500) s = core.step(250);
    assert.equal(s.phase, PH.orbit);
    const [r, v] = state(), ring = ringState(s, s.t, r, v, frame);
    near(ring.R, RE + 500000, 1, 'the Ring at 500 km');
    near(length(ring.v), Math.sqrt(MU / ring.R), 1e-6, 'round: the speed of its circle');
    near(dot(ring.nHat, ring.r), 0, 1e-3, 'its normal square to its place');
    near(length(sub(ring.r, r)), s.ringRange, 1e-3, 'the range');
    near(dot(sub(ring.r, r), sub(ring.v, v)) / s.ringRange, s.ringRate, 1e-6, 'the closing rate');
    // the relative velocity again, as the core makes it, from what was found
    const vrel = sub(sub(v, ring.v), cross(scale(ring.nHat, ring.n), sub(r, ring.r)));
    const back = ecefToEci(frame.dir([s.vrelE, s.vrelN, s.vrelU]), s.t);
    near(length(sub(vrel, back)), 0, 1e-6, 'the relative velocity');
    // a coast of ten minutes, the core's own integration against Kepler's (the air at 500 km is nothing)
    const t0 = s.t;
    s = core.step(30000);
    const [r10] = state(), [rk] = kepler(r, v, s.t - t0);
    near(length(sub(r10, rk)), 0, 50, 'ten minutes on');
    assert.ok(checks.length === 3);
  });

test('the panel takes the largest space the page\'s other parts leave free, and covers none of them', async () => {
  const { freeBox } = await import('../src/map.js');
  const rect = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });
  const clear = (b, obs, pad) => obs.every((o) => !(o.left - pad < b.x + b.w && o.right + pad > b.x && o.top - pad < b.y + b.h && o.bottom + pad > b.y));
  // a desktop: the status line, the readouts low on the left, the buttons high on the right, the help low on the right
  const desk = [rect(12, 10, 380, 44), rect(12, 625, 430, 163), rect(1095, 54, 173, 272), rect(908, 398, 360, 390)];
  const b = freeBox(1280, 800, desk, 1.1);
  assert.ok(clear(b, desk, 8), JSON.stringify(b));
  assert.ok(b.w > 800 && b.h > 500, `a large panel: ${b.w} x ${b.h}`);
  // a phone, upright, with nothing but the status line, the stick and the throttle to keep clear
  const phone = [rect(12, 10, 366, 44), rect(12, 524, 128, 128), rect(332, 502, 46, 150)];
  const p = freeBox(390, 664, phone, 1.1);
  assert.ok(clear(p, phone, 8) && p.w > 360 && p.h > 420, JSON.stringify(p));
  assert.deepEqual(freeBox(300, 200, [], 1), { x: 0, y: 0, w: 300, h: 200 }, 'nothing in the way: all of it');
});
