// Inside the Ring, heard. Its air is the sea level's, turning with it, so in its frame it is still and sound
// crosses it at 343 m/s; each room answers as its size and surfaces say; the canal is a line of sound; a
// walker's footsteps come at the cadence a pendulum's legs keep at the weight they feel, and sound like what
// they land on. Stated as physics or as what the ear should meet, against made-up readouts and against the
// walk's own core (the WebAssembly build's; ORBIT_CORE names another). GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RING } from '../src/core.js';
import {
  C_RING, CANAL_EAR_M, LIFT_CRUISE, OCTAVES, ROOMS, SHARE, absorptionArea, airAbsorption, bandpass, cadence, canalHeard, detectWalk, doorDistance,
  draughtAt, echoesOf, footfall, liftHeard, mix, newInputs, newMix, newWalkEvents, newWalkMemory, reverbShare, reverbTime, roomIR, stride, toListener,
  underfoot,
} from '../src/sound-mix.js';
import { CUES, Engine } from '../src/sound.js';
import { LIFT, PLACE, WALK, WHERE, WalkCore } from '../src/walk-core.js';
import { STREET, viewAxes } from '../src/walk-math.js';
import { fakeAudio, reach, voice } from './fake-audio.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const built = resolve(process.env.ORBIT_CORE || join(here, '..', '..', 'build-wasm', 'orbit_core.js'));
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} is not ${b} within ${tol}`);
const run = (over = {}) => mix(Object.assign(newInputs(), over), newMix());
const k1 = OCTAVES.indexOf(1000), k4 = OCTAVES.indexOf(4000);

test('the air takes the high notes as ISO 9613-1 says: its formula against the standard\'s own table', () => {
  // ISO 9613-2, table 2: 20 °C, 70 % relative humidity, dB/km at 63 Hz to 8 kHz
  const table = [0.1, 0.3, 1.1, 2.8, 5.0, 9.0, 22.9, 76.6];
  OCTAVES.forEach((f, k) => near(airAbsorption(f, 293.15, 70) * 1000, table[k], 0.05 + 0.03 * table[k], `${f} Hz`));   // the table's last digit, and 3 %
  // and 10 °C, 70 %
  [0.1, 0.4, 1.0, 1.9, 3.7, 9.7, 32.8, 117].forEach((v, k) => near(airAbsorption(OCTAVES[k], 283.15, 70) * 1000, v, 0.05 + 0.03 * v, `${OCTAVES[k]} Hz at 10 °C`));
  assert.ok(airAbsorption(8000) > 100 * airAbsorption(125), 'the high notes go first');
  near(C_RING, 331.3 * Math.sqrt(1 + 20 / 273.15), 0.05, 'the speed of sound at 20 °C');
});

test('the rooms\' reverb times, from their sizes and surfaces: the band rings longest, the hub\'s lobby less, a car least; the high notes die first', () => {
  const T = (room, k) => reverbTime(room, k);
  assert.ok(T(ROOMS.band, k1) > 3 * T(ROOMS.hub, k1) && T(ROOMS.hub, k1) > 5 * T(ROOMS.car, k1), `1 kHz: band ${T(ROOMS.band, k1).toFixed(1)} s, hub ${T(ROOMS.hub, k1).toFixed(1)} s, car ${T(ROOMS.car, k1).toFixed(2)} s`);
  for (const name of ['band', 'hub']) assert.ok(T(ROOMS[name], k4) < T(ROOMS[name], k1) && OCTAVES.slice(k1).every((f, j) => j === 0 || T(ROOMS[name], k1 + j) <= T(ROOMS[name], k1 + j - 1) * 1.05), `${name}: the air takes the high notes`);
  // Sabine's own case: a room of hard walls with no air is Sabine's 0.161 V / S a
  const box = { volume: 1000, surfaces: [['steel', 600]] };
  near(T(box, 0), (0.161 * 1000) / (-600 * Math.log(1 - 0.12)), 0.005, 'Eyring, at 63 Hz where the air takes nothing');
  // the band: the volume between floor and roof, wall to wall, less the deck's open sector
  near(ROOMS.band.volume, Math.PI * (RING.floor ** 2 - RING.roof ** 2) * RING.width * (1 - RING.deck.arc / (2 * Math.PI * RING.floor)), 1, 'the band\'s volume');
  // the critical distance, where a sound's own level meets its room's: a kilometre in the band, tens of metres in
  // the lobby, a metre and a half in a car. So near sounds are nearly dry in the band and wet in a car; the band's
  // answer is lifted 20 dB (ROOMS.band.lift) and is still the driest.
  const rc = (room) => Math.sqrt(absorptionArea(room, k1) / (16 * Math.PI));
  assert.ok(rc(ROOMS.band) > 800 && rc(ROOMS.hub) > 30 && rc(ROOMS.hub) < 100 && rc(ROOMS.car) < 3, `${rc(ROOMS.band).toFixed(0)}, ${rc(ROOMS.hub).toFixed(0)}, ${rc(ROOMS.car).toFixed(1)} m`);
  near(SHARE.band, ROOMS.band.lift / rc(ROOMS.band), 1e-12, 'the share: the lift over the critical distance, against a sound at a metre');
  assert.ok(SHARE.band < SHARE.hub && SHARE.hub < SHARE.car, 'the band driest, a car wettest');
  assert.equal(reverbShare({ ...ROOMS.car, lift: 100 }), 1, 'never more than the sound itself');
  // the band's roof: a mirror 298 m over the ear, its echo back 1.74 s later, with more energy than all the
  // band's diffuse answer to a footstep; the lobby's far side, focused, much less against its own
  const [roof] = echoesOf(ROOMS.band), [far] = echoesOf(ROOMS.hub);
  near(roof.at, (2 * (RING.floor - RING.roof - 1.7)) / C_RING, 1e-9, 'the roof\'s echo');
  assert.ok(roof.energy > 1 && far.energy < 0.05, `${roof.energy.toFixed(2)}, ${far.energy.toFixed(3)}`);
  near(far.at, (4 * WALK.lobby) / C_RING, 1e-9, 'across the lobby and back');
});

test('the rooms\' answers, as made, die away at those times, octave by octave, and are silent until the sound has crossed', () => {
  const fs = 16000;
  // the T60 at f of an impulse response, from the slope of its level in 50 ms steps over [from, to] s, heard
  // through three narrow band-passes in a row, so that the next octave's slower tail does not come through
  const t60 = (x, f, from, to) => {
    const b = bandpass(f, 6, fs);
    let y = Float64Array.from(x);
    for (let stage = 0; stage < 3; stage++) {
      const z = new Float64Array(y.length);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < y.length; i++) { z[i] = b[0] * y[i] + b[1] * x1 + b[2] * x2 - b[3] * y1 - b[4] * y2; x2 = x1; x1 = y[i]; y2 = y1; y1 = z[i]; }
      y = z;
    }
    const ts = [], ls = [], w = Math.floor(0.05 * fs);
    for (let a = Math.floor(from * fs); a + w <= Math.floor(to * fs); a += w) {
      let e = 0;
      for (let i = a; i < a + w; i++) e += y[i] * y[i];
      ts.push((a + w / 2) / fs); ls.push(10 * Math.log10(e / w));
    }
    const mt = ts.reduce((p, q) => p + q, 0) / ts.length, ml = ls.reduce((p, q) => p + q, 0) / ls.length;
    let sxy = 0, sxx = 0;
    ts.forEach((t, i) => { sxy += (t - mt) * (ls[i] - ml); sxx += (t - mt) ** 2; });
    return -60 / (sxy / sxx);
  };
  for (const [name, from, to, bands] of [['hub', 0.6, 5.2, [250, 500, 1000, 2000, 4000]], ['car', 0.03, 0.9, [500, 1000, 2000, 4000]], ['band', 2.2, 6.2, [2000, 4000]]]) {
    const room = ROOMS[name], n = Math.floor(room.seconds * fs), l = new Float32Array(n), r = new Float32Array(n);
    roomIR(l, r, fs, room);
    assert.ok(l.every(Number.isFinite) && r.every(Number.isFinite), `${name}: finite`);
    for (let i = 0; i < Math.floor(room.predelay * fs); i++) assert.equal(l[i], 0, `${name}: silent until the sound reaches a surface`);
    for (const f of bands) {
      const want = reverbTime(room, OCTAVES.indexOf(f)), got = t60(l, f, from, to);
      near(got, want, 0.15 * want, `${name} at ${f} Hz`);
    }
  }
  // the band's roof answers 1.74 s after any sound: a burst there over the quiet before it
  const fs2 = 16000, room = ROOMS.band, n = Math.floor(room.seconds * fs2), l = new Float32Array(n), r = new Float32Array(n);
  roomIR(l, r, fs2, room);
  const e = (a, b) => { let s = 0; for (let i = Math.floor(a * fs2); i < Math.floor(b * fs2); i++) s += l[i] * l[i]; return s / ((b - a) * fs2); };
  const at = echoesOf(room)[0].at;
  assert.ok(e(at, at + 0.02) > 20 * e(at - 0.1, at - 0.02), 'the roof\'s echo stands out of the tail');
});

test('the canal is a line of sound: it falls 3 dB each time the distance doubles, not a point\'s 6, and is muffled where it is decked', () => {
  const o = [0, 0], s = 3 * STREET + STREET / 2;   // between two cross streets: open water
  const at = (c) => canalHeard(s, c, 0, o)[0];
  assert.equal(at(0), 1, 'over the water');
  // from 40 m on, the distance doubling
  for (const d of [40, 80, 160]) {
    const c1 = WALK.canal + d, c2 = WALK.canal + 2 * d;
    const r1 = Math.hypot(d, CANAL_EAR_M), r2 = Math.hypot(2 * d, CANAL_EAR_M);
    near(20 * Math.log10(at(c2) / at(c1)), 10 * Math.log10(r1 / r2), 0.01, `${d} m to ${2 * d} m`);
    assert.ok(20 * Math.log10(at(c2) / at(c1)) > -3.1, 'a line, not a point');
  }
  assert.ok(canalHeard(0, WALK.canal + 2, 0, o)[0] < 0.5 * at(WALK.canal + 2), 'at a spoke\'s plaza it is decked over 60 m each way');
  // heard from its side: on the +c bank facing spinward the canal is on the left; facing back, on the right
  assert.ok(canalHeard(s, WALK.canal + 20, 0, o)[1] < -0.5 && canalHeard(s, WALK.canal + 20, Math.PI, o)[1] > 0.5);
  assert.ok(canalHeard(s, -WALK.canal - 20, 0, o)[1] > 0.5, 'and from the -c bank, on the right');
  // only in the band
  assert.ok(run({ scene: 1, canal: 1 }).canal > 0 && run({ scene: 2, canal: 1 }).canal === 0 && run({ scene: 0, canal: 1 }).canal === 0);
});

test('footsteps follow the walker\'s speed, weight and surface', () => {
  // the cadence: 1.87 steps a second at a walk, 2.85 running at one g; as g to the 0.3 at a given speed
  near(cadence(1.4, 1), 1.87, 1e-9);
  near(cadence(4, 1), 2.85, 0.01);
  near(cadence(1.4, 0.03) / cadence(1.4, 1), 0.03 ** 0.3, 1e-9, 'the hub\'s lobby');
  near(stride(1.4, 1), 1.4 / 1.87, 1e-9);
  assert.ok(footfall(4, 1) > footfall(1.4, 1) && footfall(1.4, 1) > footfall(1.4, 0.03), 'harder running, softer where the weight is less');
  // walking in a straight line over made-up readouts: as many steps as the stride says, sides alternating
  const walk = (speed, g, seconds, over = {}) => {
    const mem = newWalkMemory(), ev = newWalkEvents(), o = { t: 0, where: WHERE.floor, s: 3 * STREET + 100, c: 300, speed, g, ground: 1, jumps: 0, ball: 0, lift: LIFT.atFloor, spoke: 0, aboard: 0, ...over };
    let n = 0, side = 0;
    const surfaces = new Set();
    for (let f = 0; f < seconds * 60; f++) {
      o.t = f / 60;
      o.s += speed / 60;
      detectWalk(mem, o, ev);
      for (let k = 0; k < ev.steps; k++) {
        assert.ok(ev.stepAt[k] >= 0 && ev.stepAt[k] <= 1, 'within the frame');
        assert.notEqual(ev.stepSide[k], side, 'left, right, left');
        side = ev.stepSide[k];
        surfaces.add(ev.surface);
      }
      n += ev.steps;
    }
    return { n, surfaces: [...surfaces] };
  };
  near(walk(1.4, 1, 10).n, 18.7, 1.01, 'ten seconds\' walk');
  near(walk(4, 1, 10).n, 28.5, 1.01, 'ten seconds\' run');
  near(walk(1.4, 0.03, 30).n, 30 * cadence(1.4, 0.03), 1.01, 'a slow bound in the lobby');
  assert.equal(walk(0, 1, 10).n, 0, 'standing still');
  assert.equal(walk(1.4, 1, 10, { ground: 0 }).n, 0, 'in the air');
  // what the foot meets: the plan the walker walks on
  assert.deepEqual(walk(1.4, 1, 3).surfaces, ['grass']);
  assert.equal(underfoot(WHERE.floor, 3 * STREET, 300), 'tarmac', 'a cross street');
  assert.equal(underfoot(WHERE.floor, 3 * STREET + 100, WALK.promenade), 'paving', 'the promenade');
  assert.equal(underfoot(WHERE.floor, 3 * STREET, 0), 'deck', 'a bridge over the canal');
  assert.equal(underfoot(WHERE.floor, 3 * STREET + 100, WALK.wallpath), 'gravel', 'the path under the rim wall');
  assert.equal(underfoot(WHERE.floor, 0, 50), 'paving', 'a spoke\'s plaza');
  assert.equal(underfoot(WHERE.hub, 0, 50), 'grip', 'the lobby\'s grip floor');
  assert.equal(underfoot(WHERE.lift, 0, 50), 'car', 'a car\'s floor');
});

test('the walk\'s moments: a landing, the ball\'s bounces, a car\'s doors and brakes, the hatch; none after a jump in time', () => {
  const mem = newWalkMemory(), ev = newWalkEvents();
  const o = { t: 0, where: WHERE.floor, s: 100, c: 300, speed: 0, g: 1, ground: 1, centrifugal: 9.8, jumps: 0, jumpRise: 0, ball: 0, ballX: 0, ballY: 300, ballZ: 4999, lift: LIFT.atFloor, spoke: 0, aboard: 0, carR0: 5000 };
  const step = (over = {}, dt = 0.02) => { Object.assign(o, over); o.t += dt; return detectWalk(mem, o, ev); };
  step();
  const land = step({ jumps: 1, jumpRise: 1 }).land;
  near(land, Math.min(1, Math.sqrt(2 * 9.8 * 1) / 4.43) * 1.3, 1e-9, 'a metre\'s jump lands at 4.4 m/s');
  // a ball dropped from 2 m: it falls, bounces at half its speed, again, and comes to rest
  let r = 5000 - 0.11 - 2, v = 0, bounces = [];
  o.ball = 1;
  for (let k = 0; k < 300; k++) {
    v += 9.8 * 0.02;
    r += v * 0.02;
    if (r > 5000 - 0.11) { r = 5000 - 0.11; v = v < 0.4 ? 0 : -0.5 * v; }
    const e = step({ ballX: 0, ballZ: r });
    if (e.bounce) bounces.push(e.bounce);
  }
  assert.ok(bounces.length >= 3, `${bounces.length} bounces`);
  for (let k = 1; k < bounces.length; k++) near(bounces[k] / bounces[k - 1], 0.5, 0.12, 'each at half the speed of the last');
  near(bounces[0], Math.sqrt(2 * 9.8 * 2) / 8, 0.05, 'the first at the speed of a 2 m fall');
  // a car leaves the floor and comes back
  assert.equal(step({ lift: LIFT.up }).doors, -1, 'the doors shut as it leaves');
  assert.equal(step({ lift: LIFT.down }).doors, 0, 'turning round on the way is not a stop');
  assert.equal(step({ lift: LIFT.atFloor }).doors, 1, 'and open as it arrives');
  assert.equal(step({ aboard: 1 }).hatch, 1, 'back through the hatch');
  o.t += 30;
  assert.ok(Object.entries(detectWalk(mem, Object.assign(o, { jumps: 5, lift: LIFT.up }), ev)).every(([k, x]) => typeof x !== 'number' || x === 0 || k === 'stepWeight'), 'not lived through');
});

test('the lifts and their doors, heard from the walk\'s readouts: the motor aboard a moving car, the draught at an open door', () => {
  const out = [0, 0];
  const car = { where: WHERE.lift, lift: LIFT.down, liftV: LIFT_CRUISE, spoke: 0, theta: 0, c: WALK.liftC };
  assert.deepEqual(liftHeard(car, out).map((x) => +x.toFixed(6)), [1, 1], 'aboard at the cruise: all of it');
  near(LIFT_CRUISE, WALK.liftPush / (2 * RING.spin), 1e-12, 'the cruise holds Coriolis\'s push to 1.5 m/s2');
  assert.ok(liftHeard({ ...car, where: WHERE.floor, c: WALK.liftC + 8 }, out)[0] < 0.2 && out[1] === 0, 'faint at the station, not riding');
  assert.equal(liftHeard({ ...car, lift: LIFT.atFloor, liftV: 0 }, out)[0], 0, 'still');
  // the draught: at the open door, less a few metres off, none with the doors shut or the car at the other end
  const atDoor = { where: WHERE.floor, lift: LIFT.atFloor, spoke: 2, theta: (2 * Math.PI * 2) / 6, c: WALK.liftC + WALK.car + 1 };
  near(doorDistance(atDoor), 1, 1e-9, 'a metre from the door');
  assert.ok(draughtAt(atDoor) > 0.9 && draughtAt({ ...atDoor, c: atDoor.c + 8 }) < draughtAt(atDoor) && draughtAt({ ...atDoor, c: atDoor.c + 20 }) === 0);
  assert.equal(draughtAt({ ...atDoor, lift: LIFT.atHub }), 0, 'the car at the hub: these doors are shut');
  assert.equal(draughtAt({ ...atDoor, where: WHERE.hub }), 0, 'and from the hub, the doors at the floor are far away');
  // where a sound comes from, in the ear's axes: ahead of a walker facing spinward is -z; the axis (+c) on the right
  const axes = viewAxes(0, 0, 0), dir = [0, 0, 0];
  assert.equal(toListener(Math.cos(0) * 5, 0, 0, axes, dir), 5);
  near(dir[2], -1, 1e-12, 'spinward is ahead');
  toListener(0, 5, 0, axes, dir);
  near(dir[0], 1, 1e-12, '+c is on the right');
});

test('in the Ring the walker hears the band, the lobby or a car; each place leads the sound into its own room', () => {
  const band = run({ scene: 1 }), hub = run({ scene: 2 }), car = run({ scene: 3, car: 1, lift: 1 });
  assert.ok(band.verbBand > 0 && band.verbHub === 0 && band.verbCar === 0);
  assert.ok(hub.verbHub > 0 && hub.verbBand === 0 && car.verbCar > 0 && car.verbHub === 0);
  assert.ok(hub.room < 0.5 * band.room && hub.airy < band.airy && hub.city === 0, 'the hub\'s near-silence: its vents, and no town');
  assert.ok(car.rush > 0 && car.lift > 0 && band.rush === 0, 'a car rushes only when the ear rides it');
  for (const m of [band, hub, car]) for (const k of ['hullView', 'cabinView', 'jetAboard', 'out', 'hullAir']) assert.equal(m[k], 0, `the flight's ${k} inside the Ring`);
  // the instrument: a footstep in the band reaches the speakers dry and through the band's room only
  const { ac } = fakeAudio(), e = new Engine(ac);
  e.ring();
  e.apply(band, 0, true);
  const send = (key) => voice(e, key);
  assert.ok(reach(e.near, ac.destination) > 0, 'dry');
  assert.ok(reach(send('verbBand'), ac.destination) > 0 && reach(send('verbHub'), ac.destination) === 0 && reach(send('verbCar'), ac.destination) === 0, 'into the band\'s room');
  // every moment of the Ring plays with numbers only
  for (const name of ['step', 'land', 'ball', 'door', 'brake', 'hatch', 'bubble']) CUES[name](e, 1, {});
  for (const surface of ['grass', 'paving', 'tarmac', 'gravel', 'deck', 'grip', 'car']) e.step(2, surface, 1, 1);
});

test('walking through the core: as many footsteps as the stride says, a jump lands, a dropped ball bounces at half its speed each time', { skip: !existsSync(built) && `no module at ${built}: build it first` }, async () => {
  const wc = new WalkCore(await createRequire(import.meta.url)(built)());
  let o = wc.reset(PLACE.floor);
  const mem = newWalkMemory(), ev = newWalkEvents();
  detectWalk(mem, o, ev);
  // walk along the floor for ten seconds
  let steps = 0, walked = 0;
  for (let k = 0; k < 500; k++) {
    wc.controls({ fwd: 1, right: 0, heading: 0, pitch: 0, run: false, jump: false, use: false });
    o = wc.step(1);
    detectWalk(mem, o, ev);
    steps += ev.steps;
    if (k > 100) walked += o.speed * 0.02;
  }
  near(steps, 10 * cadence(WALK.pace, o.g), 2, `${steps} steps in ten seconds at ${o.speed.toFixed(2)} m/s`);
  assert.ok(Math.abs(o.speed - WALK.pace) < 0.05, 'at the walker\'s pace');
  // stop and jump: one landing
  let lands = 0;
  for (let k = 0; k < 160; k++) { wc.controls({ fwd: 0, right: 0, heading: 0, pitch: 0, run: false, jump: k === 60, use: false }); o = wc.step(1); detectWalk(mem, o, ev); if (ev.land) lands++; }
  assert.equal(lands, 1, 'the jump came down');
  // drop a ball from 1.5 m: the first bounce at the speed of the fall, then half, then half again
  wc.ball(1.5, 0);
  const bounces = [];
  for (let k = 0; k < 300; k++) { wc.controls({ fwd: 0, right: 0, heading: 0, pitch: 0, run: false, jump: false, use: false }); o = wc.step(1); detectWalk(mem, o, ev); if (ev.bounce) bounces.push(ev.bounce * 8); }
  assert.ok(bounces.length >= 2, `${bounces.length} bounces`);
  near(bounces[0], Math.sqrt(2 * o.centrifugal * 1.39), 0.6, 'the first: a fall of 1.39 m, the ball\'s radius off the 1.5');
  for (let k = 1; k < bounces.length; k++) near(bounces[k] / bounces[k - 1], 0.5, 0.15, 'each at half the speed');
});
