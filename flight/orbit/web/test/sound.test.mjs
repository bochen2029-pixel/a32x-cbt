// The sound, without a browser: the mix as a function of the readouts (sound-mix.js), stated as what the ear
// should meet, and the instrument (sound.js) built on a stand-in for Web Audio to see that it follows every
// target the mix makes. What it sounds like is measured in a browser (flight/orbit/README.md). GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  C0, HEAT_REF, HULL, HULL_RING, JOINT_M, LEVEL, MIX_KEYS, RHO0, SHEAR_RATIO, SPREAD_REF, WARP_SILENT, WHEELBASE_M, absorbHz, airOf, carried,
  crackleCurve, crackleDrive, crackleRate, detect, fillNoise, heatFlux, hullQ, joints, mix, newEvents, newInputs, newMemory, newMix, ringTime,
  roomResponse, shearIndex, spread, thrusting, toCamera, turnRate, turning, warpDuck,
} from '../src/sound-mix.js';
import { CUES, Engine, REF, TRIM } from '../src/sound.js';

const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} is not ${b} within ${tol}`);
const run = (over = {}) => mix(Object.assign(newInputs(), over), newMix());
// what reaches an ear aboard, as power: each voice comes out at REF x its level (sound.js measures it so)
const JET = ['roar', 'tear', 'crack'], SKIN = ['wind', 'plasma', 'plasCrack'];
const HULLV = ['vib', 'hum', 'shear', 'kick', 'windLow', 'buffet', 'rcs', 'roll', 'brake'], CABIN = ['fans', 'elec'], RING = ['room', 'airy', 'lift'];
function power(m) {
  let p = 0;
  for (const k of JET) p += (m[k] * m.jetAboard) ** 2;
  for (const k of SKIN) p += (m[k] * m.skinAboard) ** 2;
  for (const k of HULLV) p += (m[k] * m.hullView) ** 2;
  for (const k of CABIN) p += (m[k] * m.cabinView) ** 2;
  for (const k of RING) p += (m[k] * m.ring) ** 2;
  return p * m.life;
}
const AIR = (alt) => RHO0 * Math.exp(-alt / 8400);

test('the air at the craft comes from the readouts alone: density from the dynamic pressure, sound from the Mach number', () => {
  const out = {};
  airOf({ tas: 270, mach: 0.8, qbar: 36600 }, out);
  near(out.rho, (2 * 36600) / 270 ** 2, 1e-12, 'density');
  near(out.sound, 270 / 0.8, 1e-9, 'speed of sound');
  airOf({ tas: 0, mach: 0, qbar: 0, alt: 0 }, out);   // parked: the standard's sea level
  near(out.rho, RHO0, 1e-12, 'density at rest');
  near(out.sound, C0, 1e-9, 'sound at rest');
});

test('a chase camera 70 m behind a parked drive hears it about 0.2 s late, and through vacuum nothing at all', () => {
  const h = {};
  carried(-70, 0, 0, 0, 0, 0, 340, h);
  near(h.delay, 70 / 340, 1e-12, 'the wait');
  assert.equal(h.heard, 1);
  near(h.path, 70, 1e-9, 'the way');
  carried(-70, 0, 0, 0, 0, 0, 0, h);
  assert.equal(h.heard, 0, 'no speed of sound, no sound');
  // and the mix has no air-borne voice where there is no air, while the structure still carries the drive
  const m = run({ thr: 1, rho: 0, onGround: 0, gear: 0, tas: 7600, mach: 25, qbar: 0 });
  for (const k of ['roar', 'tear', 'crack', 'wind', 'windLow', 'buffet', 'plasma', 'plasCrack', 'knocksAir']) assert.equal(m[k], 0, k);
  assert.ok(m.vib > 0.3 && m.hum > 0.15, 'the drive is felt through the structure');
});

test('flying along, the sound takes the time that solves |d + v t| = c t: behind sooner, ahead later', () => {
  const h = {}, c = 340, v = 150;
  for (const [dx, dy] of [[-70, 0], [70, 0], [-50, 40], [10, -60]]) {
    carried(dx, dy, 0, v, 0, 0, c, h);
    const t = h.delay, x = dx + v * t;
    near(Math.hypot(x, dy), c * t, 1e-6, `the wait from (${dx}, ${dy})`);
  }
  carried(-70, 0, 0, v, 0, 0, c, h);
  const behind = h.delay;
  carried(70, 0, 0, v, 0, 0, c, h);
  assert.ok(behind < 70 / c && h.delay > 70 / c, `behind ${behind}, ahead ${h.delay}`);
  near(behind, 70 / (c + v), 1e-12, 'straight behind');
});

test('past the speed of sound only a camera inside the cone behind hears the drive', () => {
  const h = {}, c = 300, v = 450;                     // Mach 1.5: the cone's half-angle is 41.8 degrees
  const at = (deg) => { const a = (deg * Math.PI) / 180; carried(-70 * Math.cos(a), 70 * Math.sin(a), 0, v, 0, 0, c, h); return h.heard; };
  assert.equal(at(0), 1, 'straight behind');
  assert.ok(at(30) > 0.99, 'inside the cone');
  assert.equal(at(50), 0, 'outside the cone');
  carried(70, 0, 0, v, 0, 0, c, h);
  assert.equal(h.heard, 0, 'ahead');
  carried(-70, 0, 0, v, 0, 0, c, h);
  const t = h.delay;
  near(Math.abs(-70 + v * t), c * t, 1e-6, 'and when it is heard, the wait solves the same');
});

test('distance thins the sound: 1 at the chase view\'s 70 m, falling as 1 / r, the high notes going first', () => {
  near(spread(SPREAD_REF), 1, 1e-12);
  near(spread(2 * SPREAD_REF), 0.5, 1e-12);
  let last = Infinity, lastHz = Infinity;
  for (let r = 1; r < 1e5; r *= 1.5) {
    assert.ok(spread(r) <= last && absorbHz(r) <= lastHz, `at ${r} m`);
    last = spread(r);
    lastHz = absorbHz(r);
  }
  assert.equal(absorbHz(100), 18000, 'all of it near by');
  assert.equal(absorbHz(20000), 30, 'a rumble at 20 km');
});

test('compressed time is not played as real: 3 dB down each time the clock doubles, silent from 50x and when stopped', () => {
  near(warpDuck(1), 1, 1e-12);
  near(20 * Math.log10(warpDuck(2)), -3.01, 0.01);
  near(20 * Math.log10(warpDuck(4) / warpDuck(2)), -3.01, 0.01);
  assert.equal(warpDuck(WARP_SILENT), 0);
  assert.equal(warpDuck(100), 0);
  assert.equal(warpDuck(0), 0);
  assert.equal(run({ warp: 100, thr: 1 }).master, 0);
  assert.equal(run({ skipping: 1, thr: 1 }).master, 0, 'skipping ahead to orbit');
});

test('the drive at full power at sea level is the loudest thing aboard', () => {
  const full = power(run({ thr: 1, onGround: 1, tas: 40, mach: 0.12, qbar: 980 }));
  const others = {
    'max q, 85 % power': run({ thr: 0.85, onGround: 0, gear: 0, tas: 270, mach: 0.8, qbar: 36600, rho: AIR(2000) }),
    'through Mach 1': run({ thr: 1, onGround: 0, gear: 0, tas: 320, mach: 1, qbar: 30000, rho: AIR(5000) }),
    'buffeting at 30 degrees': run({ thr: 0.3, onGround: 0, gear: 0, tas: 150, mach: 0.5, qbar: 9000, alpha: 30 }),
    'the entry at its hottest': run({ thr: 0, onGround: 0, gear: 0, heat: 1, tas: 6500, mach: 22, qbar: 8000, rho: 3e-4 }),
    'landing roll, braking': run({ thr: 0, onGround: 1, tas: 80, mach: 0.24, qbar: 3900, decel: 5 }),
    'the thrusters, full on': run({ thr: 0, onGround: 0, gear: 0, rho: 0, rcs: 1 }),
    'full power in vacuum': run({ thr: 1, onGround: 0, gear: 0, rho: 0 }),
    'the Ring\'s interior, a lift moving': run({ scene: 1, lift: 1 }),
  };
  for (const [name, m] of Object.entries(others)) assert.ok(power(m) < full, `${name}: ${(10 * Math.log10(power(m) / full)).toFixed(1)} dB`);
  assert.ok(power(others['full power in vacuum']) < 0.25 * full, 'in vacuum the drive is felt more than heard');
});

test('the air: wind rises with dynamic pressure, a rumble through Mach 1, buffet past the smooth angle', () => {
  let last = -1;
  for (const q of [0, 2000, 8000, 20000, 36600]) {
    const w = run({ onGround: 0, gear: 0, qbar: q, mach: 0.6, tas: 200 }).wind;
    assert.ok(w > last, `wind at ${q} Pa`);
    last = w;
  }
  const low = (mach) => run({ onGround: 0, gear: 0, qbar: 20000, mach, tas: 300 }).windLow;
  assert.ok(low(1) > 1.5 * low(0.7) && low(1) > 1.5 * low(1.3), 'transonic');
  const buffet = (alpha, qbar = 9000) => run({ onGround: 0, gear: 0, qbar, alpha, mach: 0.4, tas: 120 }).buffet;
  assert.equal(buffet(8), 0, 'a smooth flow');
  assert.ok(buffet(30) > 0.35, 'past the stall');
  assert.equal(buffet(30, 0), 0, 'no air, no buffet');
  assert.equal(run({ onGround: 1, qbar: 9000, alpha: 30 }).buffet, 0, 'on the wheels');
});

test('an entry sounds as loud as its heating: Sutton and Graves, as the cube of the speed', () => {
  near(heatFlux(1e-4, 7000) / heatFlux(1e-4, 3500), 8, 1e-9);
  near(heatFlux(4e-4, 7000) / heatFlux(1e-4, 7000), 2, 1e-9);
  const peak = heatFlux(3e-4, 6500);                 // about 65 km, coming home
  assert.ok(peak > 0.3 * HEAT_REF && peak < 3 * HEAT_REF, `${peak} W/m2`);
  assert.ok(run({ onGround: 0, rho: 3e-4, tas: 6500, mach: 22, qbar: 6000 }).plasma > 0.4, 'the plasma roars');
  assert.ok(run({ onGround: 0, rho: 3e-4, tas: 2000, mach: 7, qbar: 600 }).plasma < 0.15, 'slower, it fades');
  assert.equal(run({ onGround: 0, rho: 0, tas: 7600 }).plasma, 0, 'in orbit, nothing');
});

test('silence where it should be: after a crash, muted, and the flight not heard from inside the Ring', () => {
  assert.equal(run({ thr: 1, crashed: 1 }).life, 0);
  assert.equal(run({ thr: 1, muted: 1 }).master, 0);
  const inside = run({ thr: 1, scene: 1 });
  assert.equal(inside.hullView + inside.cabinView + inside.jetAboard + inside.out, 0);
  assert.ok(inside.room > 0 && inside.ring === 1, 'the Ring\'s own air');
  const hub = run({ scene: 2 });
  assert.ok(hub.room < 0.5 * inside.room, 'the hub is quieter');
});

test('the mix is defined for anything: missing or broken readouts make silence, never NaN', () => {
  for (const i of [{}, { thr: NaN, rho: Infinity, mach: -3, tas: undefined }, { thr: 'a', qbar: null, scene: 'x', warp: NaN }]) {
    const m = mix(i, newMix());
    for (const k of MIX_KEYS) assert.ok(Number.isFinite(m[k]), `${k} = ${m[k]}`);
  }
});

test('the hull rings longer under the drive\'s load, and a struck mode dies away as its q says', () => {
  near(hullQ(0), 1, 1e-12);
  near(hullQ(1), HULL_RING, 1e-12);
  assert.ok(hullQ(0.5) > 1 && hullQ(0.5) < HULL_RING);
  const low = HULL[0];
  near(ringTime(low), (Math.log(1000) * low.q) / (Math.PI * low.hz), 1e-12);
  assert.ok(ringTime(low, hullQ(1)) > 1.2, `the lowest mode rings ${ringTime(low, hullQ(1))} s at full power`);
  for (let k = 1; k < HULL.length; k++) assert.ok(HULL[k].hz > HULL[k - 1].hz, 'the modes rise');
});

test('the shear never resolves: its partials stand at 1 + k pi times the carrier, none a multiple of another', () => {
  const fc = 300, parts = [-2, -1, 1, 2].map((k) => Math.abs(fc * (1 + k * SHEAR_RATIO))).concat([fc]);
  for (const a of parts) for (const b of parts) {
    if (a <= b) continue;
    const r = a / b;
    assert.ok(Math.abs(r - Math.round(r)) > 0.02, `${a.toFixed(0)} / ${b.toFixed(0)}`);
  }
  assert.ok(shearIndex(0) > 0 && shearIndex(1) <= 3, 'a few radians at most');
});

test('the crackle lets through the shocklets it is asked for, and they lean positive', () => {
  // two noises, as the instrument's two loops, summed and driven through the threshold
  const fs = 48000, n = fs * 4, a = fillNoise(new Float32Array(n), 0xc0ffee, 0.5), b = fillNoise(new Float32Array(n), 0xbead, 0.5);
  const curve = crackleCurve();
  for (const thr of [0.3, 1]) {
    const rate = crackleRate(thr), g = crackleDrive(rate, fs);
    let count = 0, m1 = 0, m2 = 0, m3 = 0;
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = Math.min(1, Math.max(-1, g * (a[i] + b[i])));
      y[i] = curve[Math.round(((x + 1) / 2) * (curve.length - 1))];
      if (y[i] > 0) count++;
      m1 += y[i];
    }
    m1 /= n;
    for (let i = 0; i < n; i++) { const d = y[i] - m1; m2 += d * d; m3 += d * d * d; }
    near(count / 4, rate, 0.08 * rate, `shocklets a second at throttle ${thr}`);
    assert.ok(m3 / n / (m2 / n) ** 1.5 > 1, 'positive skew');
  }
  assert.ok(crackleRate(1) > 5 * crackleRate(0.3) && crackleRate(0) === 0, 'more and harder with the throttle');
});

test('the runway\'s joints: the nose wheel over each, the main wheels over it a wheelbase later', () => {
  const at = new Float64Array(16), v = 30, dt = 1 / 60;
  let d = 0, count = 0;
  const times = [];
  for (let f = 0; f < 600; f++) {     // ten seconds at 30 m/s
    const n = joints(d, d + v * dt, at);
    for (let k = 0; k < n; k++) { assert.ok(at[k] > 0 && at[k] <= 1); times.push((f + at[k]) * dt); }
    count += n;
    d += v * dt;
  }
  const expected = Math.floor(d / JOINT_M) + Math.floor((d - WHEELBASE_M) / JOINT_M + 1) + Math.floor(WHEELBASE_M / JOINT_M);
  near(count, expected, 1, 'joints crossed');
  times.sort((x, y) => x - y);
  const gaps = new Set(times.slice(1).map((t, k) => (t - times[k]).toFixed(3)));
  // joints 6 m apart, the mains 13 m behind: crossings at x = 6k and 6k + 13, so the gaps are 1 m and 5 m of roll
  assert.deepEqual([...gaps].sort(), [(1 / v).toFixed(3), (5 / v).toFixed(3)]);
  assert.equal(joints(10, 10, at), 0, 'standing still');
  assert.equal(joints(10, 5, at), 0, 'going back is not rolling');
});

test('the moments: each found once, from the readouts, and none after a jump in time', () => {
  const mem = newMemory(), ev = newEvents(), extra = { docked: 0, rcs: 0 };
  const s = { t: 0, throttle: 0, mach: 0, gear: 1, onGround: 1, crashed: 0, vs: 0, g: 1, qbar: 0, tas: 0 };
  const step = (over, ex = {}) => { Object.assign(s, over); s.t += 0.02; return detect(mem, s, Object.assign(extra, ex), ev); };
  step({});                                                   // the first frame has nothing before it
  assert.ok(step({ throttle: 0.3 }).ignition > 0, 'the drive lights');
  assert.equal(step({ throttle: 0.4 }).ignition, 0, 'once');
  assert.equal(step({ mach: 0.99, qbar: 20000, onGround: 0 }).boom, 0);
  assert.equal(step({ mach: 1.01 }).boom, 1, 'through the speed of sound');
  assert.equal(step({ gear: 0 }).gear, -1, 'the gear comes up');
  assert.equal(step({ mach: 0.98 }).boom, -1, 'and back below it');
  assert.equal(step({ gear: 1 }).gear, 1, 'the gear goes down');
  const soft = step({ onGround: 0, vs: -1 }) && step({ onGround: 1, tas: 70 }).touchdown;
  step({ onGround: 0, vs: -4 });
  const hard = step({ onGround: 1 }).touchdown;
  assert.ok(soft > 0 && hard > soft, `touchdowns ${soft}, ${hard}`);
  assert.ok(step({ throttle: 0 }).shutdown > 0, 'the drive stops');
  step({ onGround: 0, qbar: 0, vs: 0, g: 0 });
  assert.equal(step({}, { docked: 1 }).capture, 1, 'the port takes the craft');
  assert.equal(step({}, { docked: 0 }).release, 1, 'and lets it go');
  assert.ok(step({ g: 0.9 }).contact > 0.5, 'something struck it');
  assert.equal(step({ crashed: 1 }).crash, 1);
  s.t += 30;                                                   // a restart, a skip ahead, the clock run fast
  assert.ok(Object.values(step({ crashed: 0, throttle: 1, gear: 0, onGround: 0, mach: 3 })).every((v) => v === 0), 'not lived through');
});

test('the small thrusters are heard when they push: the pilot\'s hands, or the crew\'s, felt above the air', () => {
  const hands = { tx: 0, ty: -0.5, tz: 0 }, orbit = { onGround: 0, crashed: 0, throttle: 0, qbar: 0, g: 0 };
  assert.equal(thrusting(orbit, hands, true), 0.5);
  assert.equal(thrusting({ ...orbit, onGround: 1 }, hands, true), 0, 'not on the wheels');
  near(thrusting({ ...orbit, g: 0.25 / 9.80665 }, hands, false), 0.5, 1e-12, 'the crew\'s, from what is felt');
  assert.equal(thrusting({ ...orbit, throttle: 0.5, g: 0.3 }, hands, false), 0, 'not under the drive');
  // turning: the angle between two attitudes over the time between them, whatever the quaternion's sign
  const half = 0.05 / 2, q1 = [Math.cos(half), 0, 0, Math.sin(half)];
  near(turnRate([1, 0, 0, 0], q1, 0.5), 0.1, 1e-9);
  near(turnRate([1, 0, 0, 0], q1.map((v) => -v), 0.5), 0.1, 1e-9);
  assert.ok(turning(0.1, 0.098, 0.02, orbit) > 0.9, 'a turn starting');
  assert.equal(turning(0.1, 0.098, 0.02, { ...orbit, qbar: 5000 }), 0, 'in the air the surfaces turn it');
});

test('the drive is heard from where it is: a direction from the camera, in the camera\'s own axes', () => {
  const out = new Float64Array(3), I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.deepEqual([...toCamera(0, 10, 0, I, out)], [0, 0, -1], 'north is ahead of an unturned camera');
  assert.deepEqual([...toCamera(0, 0, 3, I, out)], [0, 1, 0], 'up is up');
  // a camera turned 90 degrees to its left (about its up axis): east, on its right before, is now behind it
  const c = 0, s = 1, R = [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];   // the inverse of a turn by +90 degrees about y, by columns
  const v = toCamera(5, 0, 0, R, out);
  near(v[0], 0, 1e-12); near(v[2], 1, 1e-12, 'behind');
  assert.deepEqual([...toCamera(0, 0, 0, I, out)], [0, 0, -1], 'nowhere is ahead');
  const m = run({ dirX: 3, dirY: 0, dirZ: 4 });
  near(Math.hypot(m.outX, m.outY, m.outZ), 1, 1e-12, 'a unit vector to the panner');
});

test('a great room\'s answer: nothing until the sound reaches a wall, then 60 dB down in its time', () => {
  const fs = 8000, l = new Float32Array(fs * 6), r = new Float32Array(fs * 6);
  roomResponse(l, r, fs, { seconds: 4, predelay: 0.05 });
  for (let i = 0; i < 0.05 * fs; i++) assert.equal(l[i], 0);
  const energy = (from, to) => { let e = 0; for (let i = Math.floor(from * fs); i < Math.floor(to * fs); i++) e += l[i] * l[i] + r[i] * r[i]; return e; };
  const fall = 10 * Math.log10(energy(0.1, 0.3) / energy(4.0, 4.2));
  assert.ok(fall > 45 && fall < 75, `${fall.toFixed(1)} dB between 0.1 s and 4 s`);
  assert.ok(l.every(Number.isFinite) && r.every(Number.isFinite));
  assert.deepEqual(fillNoise(new Float32Array(4), 9), fillNoise(new Float32Array(4), 9), 'the same seed, the same noise');
});

// A stand-in for Web Audio: enough to build the instrument and watch what it is told.
function fakeAudio() {
  const sent = [];
  const param = (value = 0) => ({
    value, setTargetAtTime(v, t, tau) { sent.push(['target', v, t, tau]); }, setValueAtTime(v, t) { sent.push(['value', v, t]); },
    linearRampToValueAtTime(v, t) { sent.push(['ramp', v, t]); }, exponentialRampToValueAtTime(v, t) { sent.push(['exp', v, t]); assert.ok(v > 0, 'an exponential ramp to zero'); },
    cancelScheduledValues() {},
  });
  const node = (extra = {}) => Object.assign({ connect(d) { assert.ok(d, 'connected to nothing'); return d; }, disconnect() {}, start() {} }, extra);
  const ac = {
    sampleRate: 48000, currentTime: 0, destination: node(),
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ type: 'lowpass', frequency: param(350), Q: param(1) }),
    createBuffer: (ch, n) => { const data = Array.from({ length: ch }, () => new Float32Array(n)); return { getChannelData: (c) => data[c] }; },
    createBufferSource: () => node({ buffer: null, loop: false }),
    createOscillator: () => node({ type: 'sine', frequency: param(440) }),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
    createStereoPanner: () => node({ pan: param(0) }),
    createPanner: () => node({ positionX: param(0), positionY: param(0), positionZ: param(0) }),
    createDelay: () => node({ delayTime: param(0) }),
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createConvolver: () => node({ buffer: null, normalize: true }),
  };
  return { ac, sent };
}

test('the instrument follows every target the mix makes, and each moment and cue plays without a fault', () => {
  const { ac, sent } = fakeAudio(), e = new Engine(ac);
  e.ring();
  const followed = new Set(e.keys);
  for (const k of e.keys) assert.ok(MIX_KEYS.includes(k), `the instrument follows ${k}, which the mix does not make`);
  for (const k of MIX_KEYS) assert.ok(followed.has(k) || k === 'joint', `the mix makes ${k}, which nothing follows`);
  for (const k of Object.keys(LEVEL)) assert.ok(TRIM[k === 'crackle' ? 'crack' : k === 'plasmaCrackle' ? 'plasCrack' : k] > 0, `a trim for ${k}`);
  e.apply(run({ thr: 1, onGround: 1, tas: 40, mach: 0.12, qbar: 980, outside: 1 }), 0);
  assert.ok(sent.length >= e.keys.length && sent.every(([, v, t]) => Number.isFinite(v) && Number.isFinite(t)), 'every target a number');
  const before = sent.length;
  e.apply(run({ thr: 1, onGround: 1, tas: 40, mach: 0.12, qbar: 980, outside: 1 }), 0.02);
  assert.equal(sent.length, before, 'an unchanged target is not sent again');
  e.forget();
  e.apply(run({ thr: 1, onGround: 1, tas: 40, mach: 0.12, qbar: 980, outside: 1 }), 0.04);
  assert.equal(sent.length - before, e.keys.length, 'after forget(), all of them');
  for (const [name, play] of Object.entries(CUES)) play(e, 1, {});
  for (const m of ['ignition', 'shutdown', 'touchdown', 'crash', 'capture', 'release', 'latch']) e[m](2);
  e.bump(3, 1);
  e.gear(3, false);
  assert.ok(sent.every(([, v, t]) => Number.isFinite(v) && Number.isFinite(t)), 'every moment a number');
  assert.ok(REF > 0 && REF < 0.3);
});
