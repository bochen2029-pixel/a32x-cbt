// The debrief's timeline: the flight where it was at any moment between its samples, a playhead that holds, steps,
// plays at the flight's pace and goes live as Tacview's does, the time under a point of the bar, the moment lit in
// the panel, and what the readout says. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markColour, momentAt, Playhead, readout, sampleAt, sampleState, timeAt } from '../src/timeline.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
// a quaternion turning about the vertical (three.js's y) by deg
const yaw = (deg) => [0, Math.sin((deg * Math.PI) / 360), 0, Math.cos((deg * Math.PI) / 360)];
// a sample as the view keeps one (view.js, record), on an approach at 750 fpm
const sample = (t, extra = {}) => ({
  t, p: [t * 10, 100 - t, 0], w: [1, 0, 0], q: yaw(0), band: 0,
  s: { thr_height_ft: 1000 - 10 * t, thr_along_m: 5000 - 70 * t, cas_kn: 140, vapp_kn: 134, vs_fpm: -750, loc_dots: 0.01,
    gs_dots: 0.02, roll_deg: 0.2, pitch_deg: 2.5, heading_deg: 179, gs_kn: 140, on_ground: 0 },
  ...extra,
});

test('between two samples the flight is interpolated: in line, a heading the short way, the attitude on its arc', () => {
  const a = sample(10), b = sample(10.25, { q: yaw(90), band: 1 });
  a.s.heading_deg = 359;
  b.s.heading_deg = 1;
  b.s.cas_kn = 130;
  const m = sampleAt([a, b], 10.125);
  assert.ok(close(m.t, 10.125) && close(m.p[0], 101.25) && close(m.p[1], 89.875));
  assert.ok(close(m.s.cas_kn, 135));
  assert.ok(close(m.s.heading_deg, 0), `heading ${m.s.heading_deg}: through north, not round by south`);
  const q45 = yaw(45);
  m.q.forEach((v, k) => assert.ok(close(v, q45[k], 1e-12), `q[${k}]`));
  assert.equal(m.band, 0, "the earlier sample's band");
  // the same attitude written the other way round is the same arc
  const flipped = sampleAt([a, { ...b, q: yaw(90).map((v) => -v) }], 10.125);
  flipped.q.forEach((v, k) => assert.ok(close(v, q45[k], 1e-12)));
});

test('before the first sample the first, after the newest the newest; with none, nothing', () => {
  const h = [sample(5), sample(5.25), sample(5.5)];
  assert.equal(sampleAt(h, 1), h[0]);
  assert.equal(sampleAt(h, 9), h[2]);
  assert.equal(sampleAt([], 3), null);
  assert.equal(sampleAt(h, NaN), null);
});

test("the playhead holds, steps, plays at the flight's pace and goes live, as Tacview's does", () => {
  const h = Array.from({ length: 41 }, (_, k) => sample(k * 0.25));   // 0 to 10 s
  const p = new Playhead();
  assert.ok(p.live);
  p.step(-1, h);
  assert.equal(p.t, 9, 'a second back from the newest sample');
  p.seek(-5, h);
  assert.equal(p.t, 0, 'never before the first sample');
  p.seek(10, h);
  assert.ok(p.live, 'the newest sample is live');
  p.toggle(h);
  assert.ok(p.playing && p.t === 0, 'played from live: from the start');
  p.advance(2.5, h);
  assert.equal(p.t, 2.5);
  p.step(1, h);
  assert.ok(!p.playing && p.t === 3.5, 'a step pauses');
  p.toggle(h);
  p.advance(7, h);
  assert.ok(p.live && !p.playing, 'played on to the newest sample: live again');
  p.step(1, h);
  assert.ok(p.live, 'a step on from live stays live');
});

test('a point on the bar is a time of the flight; past its right end, LIVE', () => {
  const h = [sample(20), sample(120)];
  // a bar in a canvas 1,000 px wide runs from 8 to 944
  assert.ok(close(timeAt(8, 1000, h), 20));
  assert.ok(close(timeAt(944, 1000, h), 120));
  assert.ok(close(timeAt(476, 1000, h), 70));
  assert.equal(timeAt(0, 1000, h), 20, 'left of the bar: its start');
  assert.equal(timeAt(990, 1000, h), Infinity);
  assert.equal(timeAt(500, 1000, []), null);
  const p = new Playhead();
  p.seek(timeAt(300, 1000, h), h);
  assert.ok(!p.live);
  p.seek(timeAt(990, 1000, h), h);
  assert.ok(p.live, 'LIVE clicked: the flight followed again');
});

test("the moment lit is the last at or before the playhead; a mark takes its tag's colour", () => {
  const moments = [{ t: 0, kind: 'start', text: 'start' }, { t: 50.4, kind: 'gate', tag: '1,000 ft', text: '1,000 ft' },
    { t: 61, kind: 'band', tag: 'out of the bands', text: 'out of the bands' }];
  assert.equal(momentAt(moments, -1), -1);
  assert.equal(momentAt(moments, 50.38), 1, 'within a twentieth of a second');
  assert.equal(momentAt(moments, 60), 1);
  assert.equal(momentAt(moments, 99), 2);
  assert.equal(markColour(moments[1]), '#e8f0e8', 'a gate: white, as its tag on the path');
  assert.equal(markColour(moments[2]), '#ff5a4a', 'out of the bands: red');
  assert.equal(markColour(moments[0]), '#7a9a7a', 'a moment without a tag: dim');
});

test('the readout says where the aircraft was and how it stood: height and distance out in the air, past on the ground', () => {
  assert.equal(readout(sample(10)),
    '10.0 s · 900 ft, 2.3 nm out · 140 kt (Vapp +6) · sink 750 fpm · LOC on · G/S on · bank 0.2° · in the bands');
  const ground = sample(100, { band: 2 });
  Object.assign(ground.s, { on_ground: 1, thr_along_m: -1018.4, cas_kn: 80.2 });
  assert.equal(readout(ground), '100.0 s · 1,018 m past the threshold · 80 kt', 'outside the window, no band word');
  assert.equal(readout(null), '');
});

test("a sample keeps what the readout and the camera need, by the core's own names", () => {
  const kept = sampleState({ cas_kn: 140, heading_deg: 180, n1_1: 30, thr_height_ft: 50 });
  assert.equal(kept.cas_kn, 140);
  assert.equal(kept.heading_deg, 180);
  assert.ok(!('n1_1' in kept));
});
