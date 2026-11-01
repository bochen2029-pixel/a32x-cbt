// The debrief's log of the flight's moments, from the core's state slots: each gate crossed once at the
// time it was crossed however often the page looked, the bands left and regained, one touchdown and its
// bounces, 80 kt, the stop and the verdict; nothing for a flight that never left the ground. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beams, FlightLog } from '../src/events.js';

const GLIDE = Math.tan((3 * Math.PI) / 180);

// A stabilised approach as the core would report it: 1,200 ft above the threshold at 750 fpm, crossing
// it at 50 ft on a 3-degree glide, touching down at 96 s 291 m past it, slowing 3 kt a second to a stop
// 1,971 m past it.
// band(t): the core's judge_in_bands inside its window; dt: how often the page looks.
function approach({ dt = 0.3, band = () => 1, until = 150 } = {}) {
  const states = [];
  for (let k = 0; k * dt <= until; ++k) {
    const t = k * dt, h = Math.max(0, 1200 - 12.5 * t), down = h <= 0;
    const cas = down ? Math.max(0, 140 - 3 * (t - 96)) : 140;
    const rolling = Math.min(Math.max(0, t - 96), 140 / 3), rolled = 0.5144 * (140 * rolling - 1.5 * rolling ** 2);
    const window = !down && h <= 1000 && h >= 50;
    states.push({
      t_s: t, lat_deg: 32.9 - t * 1e-5, lon_deg: -97.026, ra_ft: h, thr_height_ft: h,
      thr_along_m: down ? -(290.8 + rolled) : ((h - 50) * 0.3048) / GLIDE, thr_right_m: 0.4,
      on_ground: down ? 1 : 0, vs_fpm: down ? 0 : -750, cas_kn: cas, gs_kn: cas, vapp_kn: 134, pitch_deg: 2.5, roll_deg: 0.2,
      loc_dots: 0.01, gs_dots: 0.02, gear_pos: 1, crashed: 0,
      judge_window: window ? 1 : 0, judge_in_bands: window ? band(t) : NaN,
      // the judge calls it stopped at 2 kt, before the page's half a knot: the stop is logged with it
      judge_stable: down && t > 142 ? 1 : NaN, judge_touchdown_m: down ? 290.8 : NaN,
    });
  }
  return states;
}

function fly(states, texts = () => null) {
  const log = new FlightLog();
  for (const s of states) log.observe(s, texts(s));
  return log;
}

const of = (log, kind) => log.events.filter((e) => e.kind === kind);

test('each gate is logged once, at the time the approach crossed it, however often the page looked', () => {
  for (const dt of [0.3, 0.02, 0.77]) {
    const gates = of(fly(approach({ dt })), 'gate');
    assert.deepEqual(gates.map((e) => e.tag), ['1,000 ft', '500 ft', '100 ft', '50 ft']);
    // 1,200 ft at 750 fpm: 1,000 ft at 16 s, 500 at 56, 100 at 88, 50 at 92
    gates.forEach((e, k) => assert.ok(Math.abs(e.t - [16, 56, 88, 92][k]) < 1e-6, `${e.tag} at ${e.t} s, looking every ${dt} s`));
  }
  const first = of(fly(approach()), 'gate')[0];
  assert.match(first.text, /^1,000 ft, in the bands · 140 kt \(Vapp \+6\) · sink 750 fpm · LOC on · G\/S on · bank 0\.2°$/);
});

test('the touchdown, 80 kt, the stop and the verdict come once each, in that order, with the core\'s distance', () => {
  const log = fly(approach());
  const kinds = log.events.map((e) => e.kind).filter((k) => ['touchdown', '80kt', 'stop', 'verdict'].includes(k));
  assert.deepEqual(kinds, ['touchdown', '80kt', 'stop', 'verdict']);
  const td = of(log, 'touchdown')[0];
  assert.equal(td.text, 'touchdown 291 m past the threshold, 0.4 m right of the centreline, sink 750 fpm, pitch 2.5°');
  assert.ok(Math.abs(of(log, '80kt')[0].t - 116) < 1e-6, '140 kt slowing 3 kt a second from 96 s passes 80 kt at 116 s');
  assert.equal(of(log, 'verdict')[0].text, 'the gate\'s judge: STABLE');
  assert.match(of(log, '80kt')[0].text, /^80 kt, 1,42\d m past the threshold$/, 'where it was then, not where it touched');
  assert.match(of(log, 'stop')[0].text, /^stopped, 1,97\d m past the threshold$/);
  assert.equal(of(log, 'stop')[0].t, of(log, 'verdict')[0].t, 'stopped when the judge says so, not after');
  // 1,150 ft above the threshold's crossing height on a 3-degree glide: 3.6 nm
  assert.match(log.text(), /^ {4}0\.0 s {2}start: 1,200 ft above the threshold, 3\.6 nm out\n/);
});

test('leaving the bands and regaining them is logged as the core judged it, with where the approach stood', () => {
  const log = fly(approach({ band: (t) => (t > 40 && t < 50 ? 0 : 1) }));
  const bands = of(log, 'band');
  assert.equal(bands.length, 2);
  assert.match(bands[0].text, /^out of the bands at [\d,]+ ft · 140 kt/);
  assert.match(bands[1].text, /^back in the bands at [\d,]+ ft/);
  assert.ok(bands[0].t > 40 && bands[0].t < 40.5 && bands[1].t >= 50 && bands[1].t < 50.5);
  // hunting at a band's edge does not fill the log
  const hunting = of(fly(approach({ band: (t) => (Math.floor(t) % 2 ? 0 : 1) })), 'band');
  assert.equal(hunting.length, 13);
  assert.equal(hunting.at(-1).text, 'more changes in and out of the bands, not listed');
});

test('a bounce is logged as one, after a single touchdown', () => {
  const base = { thr_height_ft: 10, ra_ft: 3, thr_along_m: -300, thr_right_m: -1.2, vs_fpm: -400, cas_kn: 130, gs_kn: 130, pitch_deg: 5 };
  const log = fly([0, 1, 0, 1].map((g, k) => ({ ...base, t_s: k, on_ground: g })));
  assert.equal(of(log, 'touchdown').length, 1);
  assert.match(of(log, 'touchdown')[0].text, /1\.2 m left of the centreline/);
  assert.equal(of(log, 'bounce').length, 1);
});

test('a sample seen twice is logged once; a clock that runs back starts the log again', () => {
  const states = approach({ until: 20 });
  const log = new FlightLog();
  for (const s of states) {
    log.observe(s);
    log.observe(s);
  }
  assert.equal(of(log, 'gate').length, 1);
  log.observe(states[0]);
  assert.deepEqual(log.events.map((e) => e.kind), ['start']);
});

test('a flight that never leaves the ground logs only its start, whatever its speed does', () => {
  const states = Array.from({ length: 60 }, (_, k) => ({ t_s: k, on_ground: 1, thr_height_ft: 0, cas_kn: 3 * k, gs_kn: 3 * k, gear_pos: 1 }));
  const log = fly(states.concat(states.slice().reverse().map((s, k) => ({ ...s, t_s: 60 + k }))));
  assert.deepEqual(log.events.map((e) => e.kind), ['start']);
  assert.equal(log.events[0].text, 'start: on the ground');
});

test('the gear and the flight laws are logged as they change, the computers\' power-up passed over', () => {
  // the laws flicker as the computers power up, as the core's do in a start's first 1.5 s; alternate from 6 s
  const laws = ['alternate-1', 'none', 'normal', 'normal', 'normal', 'normal', 'alternate', 'alternate'];
  const states = laws.map((_, k) => ({ t_s: k, on_ground: 0, gear_pos: Math.min(1, k / 4) }));
  const log = fly(states, (s) => ({ pitch_law: laws[s.t_s], lateral_law: 'normal' }));
  assert.deepEqual(log.events.map((e) => [e.t, e.text]), [[0, 'start: in the air'], [4, 'gear down and locked'], [6, 'pitch law: alternate']]);
  // a flight still in another law once they have powered up says so, once
  const failed = fly(states, () => ({ pitch_law: 'direct', lateral_law: 'direct' }));
  assert.deepEqual(failed.events.filter((e) => e.kind === 'law').map((e) => [e.t, e.text]), [[3, 'pitch law: direct'], [3, 'roll law: direct']]);
});

test('the beams are said as a pilot says them: left of the localizer, low on the glideslope', () => {
  // core.h: each beam where it lies from the aircraft, + right and + up
  assert.equal(beams({ loc_dots: 0.3, gs_dots: 0.25 }), 'LOC 0.30 left · G/S 0.25 low');
  assert.equal(beams({ loc_dots: -0.3, gs_dots: -1.2 }), 'LOC 0.30 right · G/S 1.20 high');
  assert.equal(beams({ loc_dots: 0.01, gs_dots: NaN }), 'LOC on');
});
