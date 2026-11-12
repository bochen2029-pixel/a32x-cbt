// The flight deck, heard. Over the deck the craft is in vacuum (its roof is open), so everything it makes is
// the structure's: a camera outside hears none of it, the cockpit hears the swivelled drive's thrum, the lift
// jet, the roll posts and the gear on the plating. Stated as what the ear should meet, against made-up
// readouts and against the crew's own landing through the core (the WebAssembly build's; ORBIT_CORE names
// another). GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTO, Core, PH } from '../src/core.js';
import { DECK_OUT, DECK_PH, DECK_V } from '../src/deck-hud.js';
import { DOCK_OUT } from '../src/dock-hud.js';
import {
  LEVEL, LIFT_JET_ACC, POST_ACC, RCS_PITCH_ACC, RCS_ROLL_ACC, SWIVEL_DPS, bodyRates, detectDeck, jetBorne, jetWork, mix, newDeckEvents, newDeckMemory,
  newInputs, newMix,
} from '../src/sound-mix.js';
import { Engine } from '../src/sound.js';
import { fakeAudio, reach, voice } from './fake-audio.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const built = resolve(process.env.ORBIT_CORE || join(here, '..', '..', 'build-wasm', 'orbit_core.js'));
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} is not ${b} within ${tol}`);
const run = (over = {}) => mix(Object.assign(newInputs(), over), newMix());
const DECKV = ['hover', 'duct', 'whine', 'posts', 'actuator'];
// over the deck: in vacuum, the drive swivelled down, holding the craft up, the jets and the swivel at work
const HOVER = { thr: 0.78, nozzle: 90, nozzleRate: 6, posts: 0.4, liftJet: 0.3, rho: 0, onGround: 0, gear: 1, tas: 7600, mach: 0, qbar: 0 };

test('over the deck nothing reaches a camera outside: every way from the deck\'s voices to the speakers is shut in vacuum', () => {
  const { ac } = fakeAudio(), e = new Engine(ac);
  const outside = run({ ...HOVER, outside: 1, heard: 1, delay: 0.2, path: 70, range: 70 });
  for (const k of ['roar', 'tear', 'crack', 'wind', 'plasma', 'plasCrack', 'hullView', 'cabinView', 'hullAir', 'cabinAir', 'knocksAir']) assert.equal(outside[k], 0, k);
  e.apply(outside, 0, true);
  for (const k of DECKV) assert.equal(reach(voice(e, k), ac.destination), 0, `${k} reaches the camera`);
  for (const k of ['vib', 'hum', 'roar']) assert.equal(reach(voice(e, k), ac.destination), 0, `the drive's ${k} reaches the camera`);
  // the deck's moments go into the hull too: the gear on the plating is shut out the same way
  assert.equal(reach(e.hullOut, ac.destination), 0, 'the hull');
  assert.equal(reach(e.hullIn, ac.destination), 0, 'what rings the hull');
  // aboard, in the cockpit, all of it is felt through the structure
  e.apply(run(HOVER), 1, true);
  for (const k of DECKV) assert.ok(reach(voice(e, k), ac.destination) > 0, `${k} in the cockpit`);
  assert.ok(reach(e.hullOut, ac.destination) > 0, 'the hull in the cockpit');
});

test('the hover\'s thrum follows the thrust through the swivel, and the swivelled drive sounds as much as its flow is turned', () => {
  let last = -1;
  for (const thr of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
    const m = run({ ...HOVER, thr });
    assert.ok(m.hover > last, `the thrum at throttle ${thr}`);
    near(m.hover, LEVEL.hover * Math.pow(thr, 0.8), 1e-12, 'all of it through the swivel');
    last = m.hover;
  }
  near(run({ ...HOVER, thr: 1 }).hover / run({ ...HOVER, thr: 0.5 }).hover, 2 ** 0.8, 1e-9, 'twice the thrust');
  const aft = run({ ...HOVER, nozzle: 0, nozzleRate: 0 });
  for (const k of ['hover', 'duct', 'whine', 'posts', 'actuator']) assert.equal(aft[k], 0, `${k} with the drive aft`);
  assert.ok(aft.vib > 0.2, 'the drive itself is felt whatever the swivel');
  near(run({ ...HOVER, nozzle: 30 }).hover, LEVEL.hover * Math.pow(0.78 * 0.5, 0.8), 1e-12, 'a third of the way down: half the thrust holds');
  near(run({ ...HOVER, nozzle: 60 }).duct / run({ ...HOVER, nozzle: 90 }).duct, 0.5, 1e-9, 'the duct: 1 - cos of the turn');
  // the actuators sound only while the swivel turns, as fast as it turns
  assert.equal(run({ ...HOVER, nozzleRate: 0 }).actuator, 0);
  near(run({ ...HOVER, nozzleRate: -SWIVEL_DPS }).actuator, LEVEL.actuator, 1e-12, 'at its full rate either way');
  // the lift jet's whine rises in pitch with its flow; the roll posts hiss from the side that fires
  assert.ok(run({ ...HOVER, thr: 1 }).whineHz > run({ ...HOVER, thr: 0.4 }).whineHz);
  assert.ok(run({ ...HOVER, postsSide: -1 }).postsPan < 0 && run({ ...HOVER, postsSide: 1 }).postsPan > 0);
});

test('the jets work as hard as the law asks: what is asked over what the jets and the thrusters can give together', () => {
  const w = new Float64Array(3);
  near(jetWork(POST_ACC + RCS_ROLL_ACC, 0, 1, w)[0], 1, 1e-12, 'all the roll there is');
  near(jetWork(0.5 * (POST_ACC * 0.6 + RCS_ROLL_ACC), 0, 0.6, w)[0], 0.5, 1e-12, 'half of it at 60 % through the swivel');
  near(jetWork(0, -0.5 * (LIFT_JET_ACC + RCS_PITCH_ACC), 1, w)[2], 0.5, 1e-12, 'the lift jet, half');
  assert.equal(jetWork(0.2, 0, 1, w)[1], -1, 'rolling right, the left post fires');
  assert.equal(jetWork(-0.2, 0, 1, w)[1], 1, 'and left, the right one');
  assert.deepEqual([...jetWork(0.3, 0.3, 0, w)], [0, 0, 0], 'not jet-borne: no jets');
  near(jetBorne(0.8, 30), 0.4, 1e-12);
  // the body's rates from two attitudes: a turn about the body's own x (roll), then its y (pitch), whatever the sign
  const r = new Float64Array(3), a = 0.05;
  bodyRates([1, 0, 0, 0], [Math.cos(a / 2), Math.sin(a / 2), 0, 0], 0.5, r);
  near(r[0], 0.1, 1e-9, 'roll'); near(r[1], 0, 1e-12); near(r[2], 0, 1e-12);
  bodyRates([1, 0, 0, 0], [-Math.cos(a / 2), 0, -Math.sin(a / 2), 0], 0.5, r);
  near(r[1], 0.1, 1e-9, 'pitch, the quaternion\'s sign flipped');
  // about the body's axes, not the site's: a craft pitched up 90 degrees rolling about its own nose
  const up = [Math.SQRT1_2, 0, Math.SQRT1_2, 0], roll = [Math.cos(a / 2), Math.sin(a / 2), 0, 0];
  const q1 = [up[0] * roll[0] - up[2] * 0, up[0] * roll[1], up[2] * roll[0], -up[2] * roll[1]];   // up * roll
  bodyRates(up, q1, 0.5, r);
  near(r[0], 0.1, 1e-9, 'rolling about its own nose');
  assert.deepEqual([...bodyRates([1, 0, 0, 0], [1, 0, 0, 0], 0, r)], [0, 0, 0], 'no time, no rate');
});

test('the deck\'s moments: the gear on the plating, the legs off it, the swivel at rest, a post opening; once each, none after a jump in time', () => {
  const mem = newDeckMemory(), ev = newDeckEvents();
  const d = { phase: DECK_PH.descend, onDeck: 0, nozzle: 90, tdT: 0, tdSink: 0, tdVerdict: 0 }, s = { t: 100, crashed: 0 };
  const step = (dd = {}, ss = {}, posts = 0, side = 0) => { Object.assign(d, dd); Object.assign(s, ss); s.t += 0.02; return detectDeck(mem, d, s, posts, side, ev); };
  step();
  assert.ok(Object.values(step()).every((v) => v === 0), 'nothing happening');
  const soft = step({ tdT: 100.05, tdSink: 0.4, tdVerdict: DECK_V.landed, onDeck: 1 });
  const padSoft = soft.pad;
  assert.ok(padSoft > 0 && soft.sink === 0.4, 'the touchdown, with its sink');
  assert.equal(step().pad, 0, 'once');
  assert.ok(step({ tdT: 101, tdSink: 2.2, tdVerdict: DECK_V.firm }).pad > padSoft, 'a firmer one is harder');
  assert.equal(step({ tdT: 102, tdSink: 4, tdVerdict: DECK_V.crashed }).pad, 0, 'a crash is the flight\'s to sound');
  assert.equal(step({ onDeck: 0 }).liftoff, 1, 'the legs come off the deck');
  assert.equal(step().liftoff, 0, 'once');
  // the swivel turns 30 degrees and stops: one lock, as strong as the turn was long
  let locked = 0;
  for (let k = 0; k < 150; k++) locked += step({ nozzle: 90 - Math.min(30, 0.3 * k) }).swivel > 0 ? 1 : 0;
  assert.equal(locked, 1, 'the swivel locks once');
  // a roll post opens as the law starts to ask for roll
  assert.equal(step({}, {}, 0.05, -1).puff, 0);
  const puff = step({}, {}, 0.6, -1);
  assert.ok(puff.puff === 0.6 && puff.side === -1, 'the left post');
  assert.equal(step({}, {}, 0.7, -1).puff, 0, 'once, while it works');
  // a jump in time: nothing, whatever changed
  s.t += 40;
  assert.ok(Object.values(detectDeck(mem, Object.assign(d, { tdT: 140, onDeck: 1, tdVerdict: DECK_V.landed }), s, 1, 1, ev)).every((v) => v === 0), 'not lived through');
  assert.ok(Object.values(detectDeck(newDeckMemory(), null, s, 1, 1, ev)).every((v) => v === 0), 'no deck, no deck moments');
});

test('the crew\'s landing, heard from its readouts: the thrum holds the weight, one touchdown on the pad, the swivel locks, and the legs come off when the pilot climbs', { skip: !existsSync(built) && `no module at ${built}: build it first` }, async () => {
  const core = new Core(await createRequire(import.meta.url)(built)());
  let s = core.reset();
  const d = core.addBlock('deck', '_oc_deck_out', '_oc_deck_out_len', DECK_OUT);
  core.addBlock('dock', '_oc_dock_out', '_oc_dock_out_len', DOCK_OUT);
  while (s.phase !== PH.orbit && s.t < 1500 && !s.crashed) s = core.step(250);
  core.auto(AUTO.deck);
  s = core.read();
  const mem = newDeckMemory(), ev = newDeckEvents(), counts = { pad: 0, liftoff: 0, swivel: 0 }, t0 = s.t;
  let hoverChecked = 0, glided = false;
  while (!(d.phase === DECK_PH.landed && s.auto === AUTO.off) && s.t - t0 < 2400 && !s.crashed) {
    s = core.step(d.phase >= DECK_PH.wait ? 5 : 250);
    detectDeck(mem, d, s, 0, 0, ev);
    for (const k of Object.keys(counts)) if (ev[k]) counts[k]++;
    if (ev.pad) near(ev.sink, d.tdSink, 1e-12, 'the touchdown\'s sink');
    if (d.phase === DECK_PH.glide) glided = true;
    // over the pad, neither climbing nor sinking, the thrust through the swivel is what holds the craft's weight
    // (the drive's 706 kN at full throttle): so the thrum, which follows that thrust, follows the weight
    if (d.phase === DECK_PH.hover && Math.abs(d.vertical) < 0.05) {
      const weight = (s.mass * 9.80665 * d.apparentG) / 706e3, jet = jetBorne(s.throttle, d.nozzle);
      near(jet, weight, 0.03 * weight, `the thrust through the swivel at ${s.t.toFixed(1)} s against the weight`);
      near(run({ thr: s.throttle, nozzle: d.nozzle }).hover, LEVEL.hover * Math.pow(weight, 0.8), 0.03 * LEVEL.hover, 'the thrum');
      hoverChecked++;
    }
  }
  assert.ok(glided && d.phase === DECK_PH.landed && s.crashed === 0, `landed: phase ${d.phase}`);
  assert.ok(hoverChecked > 10, `the hover looked at ${hoverChecked} times`);
  assert.equal(counts.pad, 1, 'one touchdown');
  assert.ok(counts.swivel >= 1, `the swivel locked ${counts.swivel} times`);
  assert.equal(counts.liftoff, 0, 'still on the deck');
  core.controls({ pitch: 0, roll: 0, yaw: 0, throttle: 1, tx: 0, ty: 0, tz: 0, gear: true, brake: 0 });
  for (let k = 0; k < 100 && d.onDeck > 0.5; k++) { s = core.step(5); detectDeck(mem, d, s, 0, 0, ev); if (ev.liftoff) counts.liftoff++; }
  s = core.step(5);
  detectDeck(mem, d, s, 0, 0, ev);
  if (ev.liftoff) counts.liftoff++;
  assert.equal(counts.liftoff, 1, 'the legs come off the deck once');
});
